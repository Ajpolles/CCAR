import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { authorizeRole, createAuthenticateToken } from './auth.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT) || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET must be configured before starting CCARS');
}

app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT) || 5432
});

const authenticateToken = createAuthenticateToken(pool, JWT_SECRET);

const handleError = (res, label, error) => {
    console.error(`${label}:`, error.message);

    return res.status(500).json({
        error: `${label} failed`
    });
};

const logActivity = async (
    actorId,
    actorRole,
    action,
    details = {}
) => {
    try {
        const validRole = actorRole || 'system';

        await pool.query(
            `INSERT INTO activity_logs
                (actor_id, actor_role, action, details)
             VALUES ($1, $2, $3, $4)`,
            [
                actorId ?? null,
                validRole,
                action,
                JSON.stringify(details)
            ]
        );
    } catch (error) {
        console.error('Activity log failed:', error.message);
    }
};

const createNotification = (queryable, { userId, appointmentId = null, type, title, message, dedupeKey }) => queryable.query(
    `INSERT INTO notifications (user_id, appointment_id, type, title, message, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (dedupe_key) DO NOTHING`,
    [userId, appointmentId, type, title, message, dedupeKey]
);

const notifyActiveAdmins = async (queryable, notification) => {
    const { rows } = await queryable.query("SELECT user_id FROM users WHERE role='admin' AND is_active=TRUE");
    for (const { user_id: userId } of rows) {
        await createNotification(queryable, { ...notification, userId, dedupeKey: `${notification.dedupeKey}:admin:${userId}` });
    }
};

const notifyWaitlistForReleasedSlot = async (queryable, appointment) => {
    if (!appointment.appointment_type_id || !appointment.user_id) return;
    const { rows } = await queryable.query(
        `SELECT w.id, w.user_id, t.name AS type_name
         FROM appointment_waitlists w JOIN users u ON u.user_id=w.user_id
         JOIN appointment_types t ON t.id=w.appointment_type_id
         WHERE w.status IN ('active','notified') AND u.is_active=TRUE
           AND w.appointment_type_id=$1 AND $2::date BETWEEN w.start_date AND w.end_date
           AND (w.preferred_start_time IS NULL OR $3::time >= w.preferred_start_time)
           AND (w.preferred_end_time IS NULL OR $3::time < w.preferred_end_time)
           AND NOT EXISTS (SELECT 1 FROM appointment_waitlist_offers o WHERE o.waitlist_id=w.id AND o.appointment_id=$4)
         ORDER BY w.created_at, w.id FOR UPDATE OF w`,
        [appointment.appointment_type_id, appointment.appointment_date, appointment.appointment_time, appointment.id]
    );
    for (const waitlist of rows) {
        const offer = await queryable.query(
            `INSERT INTO appointment_waitlist_offers (waitlist_id, appointment_id)
             VALUES ($1, $2) ON CONFLICT (waitlist_id, appointment_id) DO NOTHING RETURNING id`, [waitlist.id, appointment.id]
        );
        if (!offer.rows[0]) continue;
        await createNotification(queryable, {
            userId: waitlist.user_id, appointmentId: appointment.id, type: 'waitlist_slot_available',
            title: 'A requested appointment time may be available',
            message: `A ${waitlist.type_name} time on ${String(appointment.appointment_date).slice(0, 10)} at ${String(appointment.appointment_time).slice(0, 5)} opened. Availability is rechecked when you book.`,
            dedupeKey: `waitlist-offer:${offer.rows[0].id}:user:${waitlist.user_id}`
        });
        await queryable.query("UPDATE appointment_waitlists SET status='notified', updated_at=CURRENT_TIMESTAMP WHERE id=$1", [waitlist.id]);
        await queryable.query(
            `UPDATE appointment_waitlist_offers SET notification_id=(SELECT id FROM notifications WHERE dedupe_key=$1)
             WHERE id=$2`, [`waitlist-offer:${offer.rows[0].id}:user:${waitlist.user_id}`, offer.rows[0].id]
        );
    }
};

const fullName = (account) =>
    [account.first_name, account.last_name]
        .filter(Boolean)
        .join(' ');

const hasText = (value) => typeof value === 'string' && Boolean(value.trim());
const optionalText = (value) => hasText(value) ? value.trim() : null;
const isValidDateOnly = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const isValidTime = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
const timeToSeconds = (value) => {
    const [hours, minutes, seconds = 0] = value.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
};
const formatTime = (seconds) => `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}`;
const appointmentReference = () => `CCAR-${randomUUID().toUpperCase()}`;

const validateClinicWindow = async (queryable, date, startTime, endTime, lock = false) => {
    const { rows } = await queryable.query(
        `SELECT open_time::text AS open_time, close_time::text AS close_time, is_closed
         FROM clinic_operating_hours WHERE weekday=EXTRACT(DOW FROM $1::date)::int${lock ? ' FOR SHARE' : ''}`, [date]
    );
    if (!rows[0]) return true;
    const hours = rows[0];
    return !hours.is_closed && timeToSeconds(startTime) >= timeToSeconds(hours.open_time)
        && timeToSeconds(endTime) <= timeToSeconds(hours.close_time);
};

const validateSlotOccupancy = async (queryable, {
    scheduleId, staffId, userId, appointmentTypeId, date, time, durationMinutes,
    capacity, pendingReserves = true, ignoreAppointmentId = null
}) => {
    await queryable.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [`staff:${staffId}`, date]);
    if (userId !== null && userId !== undefined) {
        await queryable.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [`student:${userId}`, date]);
    }
    const { rows } = await queryable.query(
        `WITH reservations AS (
            SELECT a.id, a.user_id, a.schedule_id, a.appointment_type_id, a.appointment_date,
                   a.appointment_time, a.status, booked_staff.user_id AS booked_staff_id,
                   COALESCE(booked_type.duration_minutes, 30)::int AS booked_duration_minutes
            FROM appointments a
            LEFT JOIN staff_schedules booked_staff ON booked_staff.id=a.schedule_id
            LEFT JOIN appointment_types booked_type ON booked_type.id=a.appointment_type_id
            WHERE a.appointment_date=$1::date AND a.status IN ('pending','confirmed','checked_in','in_consultation')
              AND ($9::int IS NULL OR a.id<>$9)
         )
         SELECT COUNT(*) FILTER (WHERE user_id=$2
                    AND (appointment_date+appointment_time) < ($1::date+$6::time+($7::int*INTERVAL '1 minute'))
                    AND (appointment_date+appointment_time+(booked_duration_minutes*INTERVAL '1 minute')) > ($1::date+$6::time))::int AS student_conflicts,
                COUNT(*) FILTER (WHERE booked_staff_id=$3 AND (status<>'pending' OR $8::boolean)
                    AND (appointment_date+appointment_time) < ($1::date+$6::time+($7::int*INTERVAL '1 minute'))
                    AND (appointment_date+appointment_time+(booked_duration_minutes*INTERVAL '1 minute')) > ($1::date+$6::time)
                    AND NOT (schedule_id=$4 AND appointment_type_id=$5 AND appointment_time=$6::time))::int AS staff_conflicts,
                COUNT(*) FILTER (WHERE schedule_id=$4 AND appointment_type_id=$5 AND appointment_time=$6::time
                    AND (status<>'pending' OR $8::boolean))::int AS slot_bookings
         FROM reservations`,
        [date, userId, staffId, scheduleId, appointmentTypeId, time, durationMinutes, pendingReserves,
            ignoreAppointmentId]
    );
    if (rows[0].student_conflicts > 0) return { error: 'You already have an overlapping appointment', status: 409 };
    if (rows[0].staff_conflicts > 0) return { error: 'The staff schedule overlaps an existing appointment', status: 409 };
    if (rows[0].slot_bookings >= capacity) return { error: 'That appointment time is at capacity', status: 409 };
    return null;
};

const recordAppointmentEvent = async (client, {
    appointmentId, eventType = 'status_change', previousStatus = null,
    newStatus, actorId = null, actorRole = 'system', reason = null, metadata = {}
}) => {
    await client.query(
        `INSERT INTO appointment_status_history
            (appointment_id, event_type, previous_status, new_status, actor_id, actor_role, reason, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [appointmentId, eventType, previousStatus, newStatus, actorId, actorRole, reason, JSON.stringify(metadata)]
    );
};

const recordAttendanceEvent = (client, { appointmentId, previousStatus = null, newStatus, actorId, actorRole, reason = null }) => client.query(
    `INSERT INTO appointment_attendance_history (appointment_id, previous_status, new_status, actor_id, actor_role, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [appointmentId, previousStatus, newStatus, actorId, actorRole, optionalText(reason)]
);

const removeFromWaitingQueue = async (client, { appointmentId, actorId, actorRole, reason }) => {
    const { rows } = await client.query(
        `WITH active AS (
            SELECT id, status FROM clinic_waiting_queue
            WHERE appointment_id=$1 AND status IN ('waiting','called','in_consultation') FOR UPDATE
         ), updated AS (
            UPDATE clinic_waiting_queue q SET status='removed', removed_at=CURRENT_TIMESTAMP, removal_reason=$2
            FROM active WHERE q.id=active.id
            RETURNING q.id, active.status AS previous_status
         ) SELECT * FROM updated`, [appointmentId, reason]
    );
    if (!rows[0]) return;
    await client.query(
        `INSERT INTO clinic_waiting_queue_history (queue_entry_id, previous_status, new_status, actor_id, actor_role, reason)
         VALUES ($1, $2, 'removed', $3, $4, $5)`, [rows[0].id, rows[0].previous_status, actorId, actorRole, reason]
    );
};

const readClinicalPermission = async (queryable, userId, permission, lock = false) => {
    const column = ['can_view_records', 'can_document', 'can_finalize'].includes(permission) ? permission : null;
    if (!column) throw new Error('Unknown clinical permission');
    const { rows } = await queryable.query(
        `SELECT ${column} AS allowed FROM staff_clinical_permissions WHERE user_id=$1${lock ? ' FOR SHARE' : ''}`,
        [userId]
    );
    return rows[0]?.allowed === true;
};

const addToWaitingQueue = async (client, { appointmentId, date, actorId, actorRole }) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', ['clinic-waiting-queue', date]);
    const existing = await client.query('SELECT id FROM clinic_waiting_queue WHERE appointment_id=$1', [appointmentId]);
    if (existing.rows[0]) return existing.rows[0];
    const position = await client.query(
        `SELECT COALESCE(MAX(position), 0)::int + 1 AS next_position
         FROM clinic_waiting_queue WHERE queue_date=$1::date AND status IN ('waiting','called','in_consultation')`, [date]
    );
    const { rows } = await client.query(
        `INSERT INTO clinic_waiting_queue (appointment_id, queue_date, position, added_by)
         VALUES ($1, $2::date, $3, $4) RETURNING id, appointment_id, queue_date::text AS queue_date, position, status, created_at`,
        [appointmentId, date, position.rows[0].next_position, actorId]
    );
    await client.query(
        `INSERT INTO clinic_waiting_queue_history (queue_entry_id, new_status, actor_id, actor_role)
         VALUES ($1, 'waiting', $2, $3)`, [rows[0].id, actorId, actorRole]
    );
    return rows[0];
};

// ========================================
// HEALTH CHECK
// ========================================

app.get('/api/health', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT current_database() AS database'
        );

        res.json({
            status: 'ok',
            database: result.rows[0].database
        });
    } catch (error) {
        handleError(res, 'Database health check', error);
    }
});

// ========================================
// STUDENT REGISTRATION
// ========================================

app.get('/api/notifications', authenticateToken, async (req, res) => {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    try {
        const [items, unread] = await Promise.all([
            pool.query(
                `SELECT id, appointment_id, type, title, message, is_read, created_at, read_at
                 FROM notifications WHERE user_id=$1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
                [req.user.id, limit, offset]
            ),
            pool.query('SELECT COUNT(*)::int AS count FROM notifications WHERE user_id=$1 AND is_read=FALSE', [req.user.id])
        ]);
        res.json({ notifications: items.rows, unread_count: unread.rows[0].count, limit, offset });
    } catch (error) {
        handleError(res, 'Fetching notifications', error);
    }
});

app.patch('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Notification ID is invalid' });
    try {
        const { rows } = await pool.query(
            `UPDATE notifications SET is_read=TRUE, read_at=COALESCE(read_at, CURRENT_TIMESTAMP)
             WHERE id=$1 AND user_id=$2 RETURNING id, appointment_id, type, title, message, is_read, created_at, read_at`,
            [Number(req.params.id), req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Notification not found' });
        res.json({ notification: rows[0] });
    } catch (error) {
        handleError(res, 'Marking notification as read', error);
    }
});

app.patch('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            'UPDATE notifications SET is_read=TRUE, read_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND is_read=FALSE',
            [req.user.id]
        );
        res.json({ marked_read: rowCount });
    } catch (error) {
        handleError(res, 'Marking notifications as read', error);
    }
});

app.get('/api/admin/attendance-policy', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT self_checkin_enabled, timezone, opens_minutes_before, closes_minutes_after, updated_by, updated_at FROM clinic_attendance_policy WHERE id=1'
        );
        res.json(rows[0] || { self_checkin_enabled: false, timezone: null, opens_minutes_before: null, closes_minutes_after: null });
    } catch (error) {
        handleError(res, 'Fetching attendance policy', error);
    }
});

app.get('/api/admin/appointment-policy', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM clinic_appointment_policy WHERE id=1');
        res.json(rows[0]);
    } catch (error) { handleError(res, 'Fetching appointment policy', error); }
});

app.put('/api/admin/appointment-policy', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const { pending_requests_reserve_capacity, pending_expiration_minutes, max_active_appointments_per_student,
        student_cancellation_deadline_hours, clinic_timezone, reminder_offsets_minutes, reason } = req.body || {};
    const validNullableInt = (value, min, max) => value === null || value === undefined
        || (Number.isInteger(value) && value >= min && value <= max);
    const offsetsValid = Array.isArray(reminder_offsets_minutes) && reminder_offsets_minutes.length <= 10
        && reminder_offsets_minutes.every(value => Number.isInteger(value) && value >= 1 && value <= 10080)
        && new Set(reminder_offsets_minutes).size === reminder_offsets_minutes.length;
    if (typeof pending_requests_reserve_capacity !== 'boolean'
        || !validNullableInt(pending_expiration_minutes, 5, 43200)
        || !validNullableInt(max_active_appointments_per_student, 1, 100)
        || !validNullableInt(student_cancellation_deadline_hours, 0, 720)
        || !offsetsValid
        || (clinic_timezone !== null && clinic_timezone !== undefined && (typeof clinic_timezone !== 'string' || clinic_timezone.length > 100))
        || ((reminder_offsets_minutes.length > 0 || student_cancellation_deadline_hours !== null) && !hasText(clinic_timezone))
        || !hasText(reason) || reason.trim().length > 1000) {
        return res.status(400).json({ error: 'Provide valid policy values and a non-empty reason; reminder offsets require an approved timezone' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (clinic_timezone) {
            const zone = await client.query('SELECT 1 FROM pg_timezone_names WHERE name=$1', [clinic_timezone]);
            if (!zone.rows[0]) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Reminder timezone must be a valid IANA timezone' });
            }
        }
        const before = await client.query('SELECT * FROM clinic_appointment_policy WHERE id=1 FOR UPDATE');
        const { rows } = await client.query(
            `UPDATE clinic_appointment_policy SET pending_requests_reserve_capacity=$1, pending_expiration_minutes=$2,
                max_active_appointments_per_student=$3, student_cancellation_deadline_hours=$4,
                clinic_timezone=$5, reminder_offsets_minutes=$6::smallint[], updated_by=$7, updated_at=CURRENT_TIMESTAMP
             WHERE id=1 RETURNING *`,
            [pending_requests_reserve_capacity, pending_expiration_minutes ?? null, max_active_appointments_per_student ?? null,
                student_cancellation_deadline_hours ?? null, optionalText(clinic_timezone), reminder_offsets_minutes, req.user.id]
        );
        await client.query(
            `INSERT INTO clinic_appointment_policy_history (previous_values, new_values, changed_by, reason) VALUES ($1, $2, $3, $4)`,
            [JSON.stringify(before.rows[0]), JSON.stringify(rows[0]), req.user.id, reason.trim()]
        );
        await client.query(
            `INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, 'appointment_policy_updated', $3)`,
            [req.user.id, req.user.role, JSON.stringify({ reason: reason.trim(), new_values: rows[0] })]
        );
        await client.query('COMMIT');
        res.json(rows[0]);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        handleError(res, 'Updating appointment policy', error);
    } finally { client.release(); }
});

app.get('/api/admin/clinical-permissions', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT u.user_id, u.first_name, u.last_name, u.email, u.position,
                    COALESCE(p.can_view_records, FALSE) AS can_view_records,
                    COALESCE(p.can_document, FALSE) AS can_document,
                    COALESCE(p.can_finalize, FALSE) AS can_finalize,
                    p.updated_at, grantor.first_name AS granted_by_first_name, grantor.last_name AS granted_by_last_name
             FROM users u LEFT JOIN staff_clinical_permissions p ON p.user_id=u.user_id
             LEFT JOIN users grantor ON grantor.user_id=p.granted_by
             WHERE u.role='admin' AND u.is_active=TRUE ORDER BY u.last_name, u.first_name, u.user_id`
        );
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching clinical access settings', error);
    }
});

app.put('/api/admin/clinical-permissions/:userId', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const { can_view_records, can_document, can_finalize, reason } = req.body || {};
    if (!accountIdIsValid(req.params.userId) || [can_view_records, can_document, can_finalize].some(value => typeof value !== 'boolean')
        || (can_document && !can_view_records) || (can_finalize && !can_document)
        || typeof reason !== 'string' || !hasText(reason) || reason.trim().length > 1000) {
        return res.status(400).json({ error: 'Provide valid clinical access flags, a non-empty reason, and the required permission dependencies' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const staff = await client.query("SELECT user_id FROM users WHERE user_id=$1 AND role='admin' AND is_active=TRUE FOR UPDATE", [Number(req.params.userId)]);
        if (!staff.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Active clinic staff account not found' });
        }
        const before = await client.query('SELECT can_view_records, can_document, can_finalize FROM staff_clinical_permissions WHERE user_id=$1 FOR UPDATE', [staff.rows[0].user_id]);
        const permissions = { can_view_records, can_document, can_finalize };
        await client.query(
            `INSERT INTO staff_clinical_permissions (user_id, can_view_records, can_document, can_finalize, granted_by, updated_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
             ON CONFLICT (user_id) DO UPDATE SET can_view_records=EXCLUDED.can_view_records,
                can_document=EXCLUDED.can_document, can_finalize=EXCLUDED.can_finalize, granted_by=EXCLUDED.granted_by, updated_at=CURRENT_TIMESTAMP`,
            [staff.rows[0].user_id, can_view_records, can_document, can_finalize, req.user.id]
        );
        const previous = before.rows[0] || { can_view_records: false, can_document: false, can_finalize: false };
        await client.query(
            `INSERT INTO staff_clinical_permission_history (user_id, previous_permissions, new_permissions, changed_by, reason)
             VALUES ($1, $2, $3, $4, $5)`,
            [staff.rows[0].user_id, JSON.stringify(previous), JSON.stringify(permissions), req.user.id, reason.trim()]
        );
        await client.query(
            `INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, 'clinical_permissions_updated', $3)`,
            [req.user.id, req.user.role, JSON.stringify({ user_id: staff.rows[0].user_id, ...permissions, reason: reason.trim() })]
        );
        await client.query('COMMIT');
        res.json({ user_id: staff.rows[0].user_id, ...permissions });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        handleError(res, 'Updating clinical access settings', error);
    } finally {
        client.release();
    }
});

app.put('/api/admin/attendance-policy', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const { self_checkin_enabled, timezone, opens_minutes_before, closes_minutes_after } = req.body || {};
    if (typeof self_checkin_enabled !== 'boolean'
        || (self_checkin_enabled && (typeof timezone !== 'string' || !timezone.trim() || timezone.length > 100
            || !Number.isInteger(opens_minutes_before) || opens_minutes_before < 0 || opens_minutes_before > 1440
            || !Number.isInteger(closes_minutes_after) || closes_minutes_after < 0 || closes_minutes_after > 1440))) {
        return res.status(400).json({ error: 'Enabled self check-in requires a timezone and valid before/after windows (0–1440 minutes)' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const before = await client.query('SELECT self_checkin_enabled, timezone, opens_minutes_before, closes_minutes_after FROM clinic_attendance_policy WHERE id=1 FOR UPDATE');
        const normalizedTimezone = self_checkin_enabled ? timezone.trim() : null;
        if (self_checkin_enabled) {
            const validTimezone = await client.query('SELECT 1 FROM pg_timezone_names WHERE name=$1', [normalizedTimezone]);
            if (!validTimezone.rows[0]) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Choose a timezone recognized by PostgreSQL' });
            }
        }
        const { rows } = await client.query(
            `INSERT INTO clinic_attendance_policy (id, self_checkin_enabled, timezone, opens_minutes_before, closes_minutes_after, updated_by)
             VALUES (1, $1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET self_checkin_enabled=EXCLUDED.self_checkin_enabled, timezone=EXCLUDED.timezone,
                opens_minutes_before=EXCLUDED.opens_minutes_before, closes_minutes_after=EXCLUDED.closes_minutes_after,
                updated_by=EXCLUDED.updated_by, updated_at=CURRENT_TIMESTAMP
             RETURNING self_checkin_enabled, timezone, opens_minutes_before, closes_minutes_after, updated_by, updated_at`,
            [self_checkin_enabled, normalizedTimezone, self_checkin_enabled ? opens_minutes_before : null,
                self_checkin_enabled ? closes_minutes_after : null, req.user.id]
        );
        await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, 'attendance_policy_updated', $3)`,
            [req.user.id, req.user.role, JSON.stringify({ previous: before.rows[0] || null,
                next: { self_checkin_enabled, timezone: normalizedTimezone,
                    opens_minutes_before: self_checkin_enabled ? opens_minutes_before : null,
                    closes_minutes_after: self_checkin_enabled ? closes_minutes_after : null } })]);
        await client.query('COMMIT');
        res.json({ policy: rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        handleError(res, 'Updating attendance policy', error);
    } finally {
        client.release();
    }
});

app.get('/api/attendance-policy', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT self_checkin_enabled, timezone, opens_minutes_before, closes_minutes_after FROM clinic_attendance_policy WHERE id=1'
        );
        res.json(rows[0] || { self_checkin_enabled: false, timezone: null, opens_minutes_before: null, closes_minutes_after: null });
    } catch (error) {
        handleError(res, 'Fetching student check-in policy', error);
    }
});

app.get('/api/appointments/:id/attendance', authenticateToken, authorizeRole(['student']), async (req, res) => {
    if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Appointment ID is invalid' });
    try {
        const owner = await pool.query('SELECT id FROM appointments WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id]);
        if (!owner.rows[0]) return res.status(404).json({ error: 'Appointment not found' });
        const { rows } = await pool.query(
            `SELECT id, appointment_id, status, checked_in_at, reason, updated_at
             FROM appointment_attendance WHERE appointment_id=$1`, [Number(req.params.id)]
        );
        res.json({ attendance: rows[0] || null });
    } catch (error) {
        handleError(res, 'Fetching appointment attendance', error);
    }
});

app.post('/api/appointments/:id/check-in', authenticateToken, authorizeRole(['student']), async (req, res) => {
    if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Appointment ID is invalid' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const appointment = await client.query(
            `SELECT id, appointment_date::text AS appointment_date, appointment_time FROM appointments
             WHERE id=$1 AND user_id=$2 AND status='confirmed' FOR UPDATE`, [Number(req.params.id), req.user.id]
        );
        if (!appointment.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Confirmed appointment not found' });
        }
        const policy = await client.query('SELECT * FROM clinic_attendance_policy WHERE id=1 FOR SHARE');
        if (!policy.rows[0]?.self_checkin_enabled) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Student self check-in is not configured by the clinic' });
        }
        const inWindow = await client.query(
            `SELECT timezone($1, CURRENT_TIMESTAMP) BETWEEN
                    ($2::date + $3::time) - ($4::int * INTERVAL '1 minute') AND
                    ($2::date + $3::time) + ($5::int * INTERVAL '1 minute') AS valid`,
            [policy.rows[0].timezone, appointment.rows[0].appointment_date, appointment.rows[0].appointment_time,
                policy.rows[0].opens_minutes_before, policy.rows[0].closes_minutes_after]
        );
        if (!inWindow.rows[0].valid) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Check-in is outside the clinic-configured window' });
        }
        const { rows } = await client.query(
            `INSERT INTO appointment_attendance (appointment_id, status, checked_in_at, recorded_by)
             VALUES ($1, 'checked_in', CURRENT_TIMESTAMP, $2)
             RETURNING id, appointment_id, status, checked_in_at, reason, updated_at`, [Number(req.params.id), req.user.id]
        );
        await recordAttendanceEvent(client, { appointmentId: Number(req.params.id), newStatus: 'checked_in', actorId: req.user.id, actorRole: req.user.role });
        const queueEntry = await addToWaitingQueue(client, { appointmentId: Number(req.params.id), date: appointment.rows[0].appointment_date,
            actorId: req.user.id, actorRole: req.user.role });
        await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, 'appointment_self_checked_in', $3)`,
            [req.user.id, req.user.role, JSON.stringify({ appointment_id: Number(req.params.id) })]);
        await client.query('COMMIT');
        res.json({ attendance: rows[0], queue_entry: queueEntry });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') return res.status(409).json({ error: 'Attendance has already been recorded for this appointment' });
        handleError(res, 'Checking in for appointment', error);
    } finally {
        client.release();
    }
});

app.get('/api/admin/attendance', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const date = req.query.date;
    if (date && !isValidDateOnly(date)) return res.status(400).json({ error: 'Choose a valid date' });
    try {
        const { rows } = await pool.query(
            `SELECT a.id AS appointment_id, a.reference_number, a.appointment_date::text AS appointment_date,
                    a.appointment_time::text AS appointment_time, a.status AS appointment_status,
                    s.student_number, concat_ws(' ', s.first_name, s.last_name) AS student_name,
                    COALESCE(ar.status, 'not_checked_in') AS attendance_status, ar.checked_in_at, ar.reason
             FROM appointments a JOIN users s ON s.user_id=a.user_id
             LEFT JOIN appointment_attendance ar ON ar.appointment_id=a.id
             WHERE ($1::date IS NULL OR a.appointment_date=$1::date)
             ORDER BY a.appointment_date, a.appointment_time, a.id`, [date || null]
        );
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching attendance queue', error);
    }
});

app.put('/api/admin/appointments/:id/attendance', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const { status, reason } = req.body || {};
    if (!accountIdIsValid(req.params.id) || !['checked_in', 'late', 'no_show', 'excused'].includes(status)
        || (reason !== undefined && (typeof reason !== 'string' || reason.length > 1000))
        || (['no_show', 'excused'].includes(status) && !hasText(reason))) {
        return res.status(400).json({ error: 'Provide a valid attendance status and a reason for no-show or excused records' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const appointment = await client.query(
            `SELECT id, status, appointment_date::text AS appointment_date FROM appointments WHERE id=$1 AND status NOT IN ('cancelled','rejected') FOR UPDATE`, [Number(req.params.id)]
        );
        if (!appointment.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Appointment not found or attendance cannot be changed' });
        }
        const current = await client.query('SELECT status, checked_in_at, reason FROM appointment_attendance WHERE appointment_id=$1 FOR UPDATE', [Number(req.params.id)]);
        if (current.rows[0]?.status === status && (optionalText(reason) || null) === (current.rows[0].reason || null)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Attendance already has that status' });
        }
        const { rows } = await client.query(
            `INSERT INTO appointment_attendance (appointment_id, status, checked_in_at, recorded_by, reason)
             VALUES ($1, $2, CASE WHEN $2::varchar IN ('checked_in','late') THEN CURRENT_TIMESTAMP ELSE NULL END, $3, $4)
             ON CONFLICT (appointment_id) DO UPDATE SET status=EXCLUDED.status,
                checked_in_at=CASE WHEN EXCLUDED.status IN ('checked_in','late')
                    THEN COALESCE(appointment_attendance.checked_in_at, CURRENT_TIMESTAMP) ELSE NULL END,
                recorded_by=EXCLUDED.recorded_by, reason=EXCLUDED.reason, updated_at=CURRENT_TIMESTAMP
             RETURNING id, appointment_id, status, checked_in_at, recorded_by, reason, updated_at`,
            [Number(req.params.id), status, req.user.id, optionalText(reason)]
        );
        await recordAttendanceEvent(client, { appointmentId: Number(req.params.id), previousStatus: current.rows[0]?.status,
            newStatus: status, actorId: req.user.id, actorRole: req.user.role, reason });
        const queueEntry = ['checked_in', 'late'].includes(status)
            ? await addToWaitingQueue(client, { appointmentId: Number(req.params.id), date: appointment.rows[0].appointment_date,
                actorId: req.user.id, actorRole: req.user.role })
            : null;
        await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, 'appointment_attendance_updated', $3)`,
            [req.user.id, req.user.role, JSON.stringify({ appointment_id: Number(req.params.id), previous_status: current.rows[0]?.status || null, status })]);
        if (['no_show', 'excused'].includes(status)) await removeFromWaitingQueue(client, {
            appointmentId: Number(req.params.id), actorId: req.user.id, actorRole: req.user.role,
            reason: optionalText(reason) || `Attendance marked ${status}`
        });
        await client.query('COMMIT');
        res.json({ attendance: rows[0], queue_entry: queueEntry });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        handleError(res, 'Updating appointment attendance', error);
    } finally {
        client.release();
    }
});

app.get('/api/admin/appointments/:id/attendance-history', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Appointment ID is invalid' });
    try {
        const appointment = await pool.query('SELECT id FROM appointments WHERE id=$1', [Number(req.params.id)]);
        if (!appointment.rows[0]) return res.status(404).json({ error: 'Appointment not found' });
        const { rows } = await pool.query(
            `SELECT h.id, h.previous_status, h.new_status, h.actor_role, h.reason, h.created_at,
                    u.first_name AS actor_first_name, u.last_name AS actor_last_name
             FROM appointment_attendance_history h LEFT JOIN users u ON u.user_id=h.actor_id
             WHERE h.appointment_id=$1 ORDER BY h.created_at, h.id`, [Number(req.params.id)]
        );
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching attendance history', error);
    }
});

app.get('/api/admin/waiting-queue', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const date = req.query.date;
    if (date && !isValidDateOnly(date)) return res.status(400).json({ error: 'Choose a valid queue date' });
    try {
        const { rows } = await pool.query(
            `SELECT q.id AS queue_entry_id, q.appointment_id, q.queue_date::text AS queue_date, q.position,
                    q.status AS queue_status, q.created_at AS queue_entered_at, q.called_at,
                    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - q.created_at))::int AS waiting_seconds,
                    a.reference_number, a.appointment_date::text AS appointment_date,
                    a.appointment_time::text AS appointment_time, a.status AS appointment_status,
                    ar.status AS attendance_status, ar.checked_in_at,
                    s.student_number, concat_ws(' ', s.first_name, s.last_name) AS student_name,
                    t.name AS appointment_type_name, staff.first_name AS staff_first_name, staff.last_name AS staff_last_name
             FROM clinic_waiting_queue q JOIN appointments a ON a.id=q.appointment_id
             JOIN users s ON s.user_id=a.user_id
             LEFT JOIN appointment_attendance ar ON ar.appointment_id=a.id
             LEFT JOIN appointment_types t ON t.id=a.appointment_type_id
             LEFT JOIN users staff ON staff.user_id=q.assigned_staff_id
             WHERE q.queue_date=COALESCE($1::date, CURRENT_DATE) AND q.status IN ('waiting','called','in_consultation')
             ORDER BY q.position, q.created_at, q.id`, [date || null]
        );
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching clinic waiting queue', error);
    }
});

app.post('/api/admin/waiting-queue/:appointmentId', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    if (!accountIdIsValid(req.params.appointmentId)) return res.status(400).json({ error: 'Appointment ID is invalid' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const appointmentResult = await client.query(
            `SELECT a.id, a.appointment_date::text AS appointment_date, a.status,
                    ar.status AS attendance_status
             FROM appointments a LEFT JOIN appointment_attendance ar ON ar.appointment_id=a.id
             WHERE a.id=$1 FOR UPDATE OF a`, [Number(req.params.appointmentId)]
        );
        const appointment = appointmentResult.rows[0];
        if (!appointment || !['pending','confirmed'].includes(appointment.status)) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Appointment not found or not eligible for the waiting queue' });
        }
        if (!['checked_in', 'late'].includes(appointment.attendance_status)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Record student attendance before adding the appointment to the queue' });
        }
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', ['clinic-waiting-queue', appointment.appointment_date]);
        const position = await client.query(
            `SELECT COALESCE(MAX(position), 0)::int + 1 AS next_position
             FROM clinic_waiting_queue WHERE queue_date=$1::date AND status IN ('waiting','called')`, [appointment.appointment_date]
        );
        const { rows } = await client.query(
            `INSERT INTO clinic_waiting_queue (appointment_id, queue_date, position, added_by)
             VALUES ($1, $2::date, $3, $4)
             RETURNING id, appointment_id, queue_date::text AS queue_date, position, status, created_at`,
            [appointment.id, appointment.appointment_date, position.rows[0].next_position, req.user.id]
        );
        await client.query(
            `INSERT INTO clinic_waiting_queue_history (queue_entry_id, new_status, actor_id, actor_role)
             VALUES ($1, 'waiting', $2, $3)`, [rows[0].id, req.user.id, req.user.role]
        );
        await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, 'appointment_added_to_waiting_queue', $3)`,
            [req.user.id, req.user.role, JSON.stringify({ appointment_id: appointment.id, queue_entry_id: rows[0].id, position: rows[0].position })]);
        await client.query('COMMIT');
        res.status(201).json({ entry: rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') return res.status(409).json({ error: 'Appointment is already in the waiting queue' });
        handleError(res, 'Adding appointment to waiting queue', error);
    } finally {
        client.release();
    }
});

app.patch('/api/admin/waiting-queue/:entryId/status', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const { status, reason } = req.body || {};
    if (!accountIdIsValid(req.params.entryId) || !['waiting', 'called', 'removed'].includes(status)
        || (reason !== undefined && (typeof reason !== 'string' || reason.length > 1000))
        || (status === 'removed' && !hasText(reason))) {
        return res.status(400).json({ error: 'Provide a valid queue status and a reason when removing the entry' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const current = await client.query('SELECT id, appointment_id, status FROM clinic_waiting_queue WHERE id=$1 FOR UPDATE', [Number(req.params.entryId)]);
        if (!current.rows[0] || current.rows[0].status === 'removed') {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Active queue entry not found' });
        }
        if (current.rows[0].status === status) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Queue entry already has that status' });
        }
        const { rows } = await client.query(
            `UPDATE clinic_waiting_queue SET status=$1, called_at=CASE WHEN $1::varchar='called' THEN COALESCE(called_at, CURRENT_TIMESTAMP) ELSE called_at END,
                removed_at=CASE WHEN $1::varchar='removed' THEN CURRENT_TIMESTAMP ELSE NULL END,
                removal_reason=CASE WHEN $1::varchar='removed' THEN $2 ELSE NULL END
             WHERE id=$3 RETURNING id, appointment_id, queue_date::text AS queue_date, position, status, created_at, called_at, removed_at, removal_reason`,
            [status, optionalText(reason), Number(req.params.entryId)]
        );
        await client.query(
            `INSERT INTO clinic_waiting_queue_history (queue_entry_id, previous_status, new_status, actor_id, actor_role, reason)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [rows[0].id, current.rows[0].status, status, req.user.id, req.user.role, optionalText(reason)]
        );
        await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, 'waiting_queue_status_updated', $3)`,
            [req.user.id, req.user.role, JSON.stringify({ appointment_id: rows[0].appointment_id, queue_entry_id: rows[0].id, previous_status: current.rows[0].status, status })]);
        await client.query('COMMIT');
        res.json({ entry: rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        handleError(res, 'Updating waiting queue entry', error);
    } finally {
        client.release();
    }
});

app.post('/api/auth/register', async (req, res) => {
    const {
        student_number,
        first_name,
        last_name,
        email,
        password,
        course,
        year_level,
        section,
        contact_number
    } = req.body || {};

    const studentNumber = student_number;

    if (
        !hasText(studentNumber) ||
        !hasText(first_name) ||
        !hasText(last_name) ||
        !hasText(email) ||
        typeof password !== 'string' ||
        password.length < 8
    ) {
        return res.status(400).json({
            error: 'Student number, first name, last name, email, and a password of at least 8 characters are required'
        });
    }

    try {
        const normalizedEmail = email.trim().toLowerCase();
        const hashedPassword = await bcrypt.hash(password, 10);

        const { rows } = await pool.query(
            `INSERT INTO users
                (
                    student_number,
                    first_name,
                    last_name,
                    email,
                    password_hash,
                    role,
                    course,
                    year_level,
                    section,
                    contact_number,
                    is_active
                )
             VALUES ($1, $2, $3, $4, $5, 'student', $6, $7, $8, $9, TRUE)
             RETURNING
                user_id,
                student_number,
                first_name,
                last_name,
                email,
                role,
                course,
                year_level,
                section,
                contact_number,
                is_active,
                created_at`,
            [
                studentNumber.toString().trim(),
                first_name.trim(),
                last_name.trim(),
                normalizedEmail,
                hashedPassword,
                optionalText(course),
                typeof year_level === 'string' || typeof year_level === 'number'
                    ? String(year_level).trim() || null
                    : null,
                optionalText(section),
                optionalText(contact_number)
            ]
        );

        await logActivity(
            rows[0].user_id,
            'student',
            'student_registered',
            {
                student_number: rows[0].student_number
            }
        );

        res.status(201).json({
            message: 'Student registered successfully',
            user: {
                ...rows[0],
                id: rows[0].user_id,
                name: fullName(rows[0])
            }
        });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({
                error: 'Email or student number is already registered'
            });
        }

        handleError(res, 'Registration', error);
    }
});

// ========================================
// LOGIN FOR ALL ACCOUNT TYPES (CENTRALIZED)
// ========================================

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};

    if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        !email.trim() ||
        !password
    ) {
        return res.status(400).json({
            error: 'Email and password are required'
        });
    }

    try {
        const normalizedEmail = email.trim().toLowerCase();

        const result = await pool.query(
            `SELECT
                user_id AS id,
                first_name,
                last_name,
                email,
                password_hash,
                role,
                student_number,
                position,
                contact_number,
                course,
                year_level,
                section,
                is_active
             FROM users
             WHERE email = $1`,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        const account = result.rows[0];

        if (!account.is_active) {
            return res.status(403).json({
                error: 'Account is inactive. Please contact administration.'
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            account.password_hash
        );

        if (!validPassword) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        const name = fullName(account);

        const token = jwt.sign(
            {
                user_id: account.id,
                role: account.role,
                name,
                email: account.email
            },
            JWT_SECRET,
            {
                expiresIn: '8h'
            }
        );

        await logActivity(
            account.id,
            account.role,
            'login',
            {
                email: account.email
            }
        );

        res.json({
            token,
            role: account.role,
            name,
            userId: account.id,
            user: {
                id: account.id,
                user_id: account.id,
                role: account.role,
                name,
                email: account.email,
                position: account.position,
                student_number: account.student_number,
                course: account.course,
                year_level: account.year_level,
                section: account.section
            }
        });
    } catch (error) {
        handleError(res, 'Login', error);
    }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    const {
        id,
        user_id,
        role,
        name,
        email,
        student_number,
        course,
        year_level,
        section,
        position,
        contact_number
    } = req.user;

    res.json({
        user: {
            id,
            user_id,
            role,
            name,
            email,
            student_number,
            course,
            year_level,
            section,
            position,
            contact_number
        }
    });
});

const getOwnProfile = (role) => async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT u.user_id AS id, u.first_name, u.last_name, u.email, u.student_number, u.course, u.year_level, u.section,
                    u.position, u.contact_number, u.role, u.is_active, u.created_by, u.created_at, u.updated_at,
                    CASE WHEN creator.user_id IS NULL THEN NULL ELSE concat_ws(' ', creator.first_name, creator.last_name) END AS creator_name
             FROM users u LEFT JOIN users creator ON creator.user_id=u.created_by
             WHERE u.user_id=$1 AND u.role=$2`, [req.user.id, role]);
        if (!rows[0]) return res.status(404).json({ error: 'Profile not found' });
        res.json({ ...rows[0], name: fullName(rows[0]) });
    } catch (error) {
        handleError(res, `Fetching ${role} profile`, error);
    }
};

const updateOwnProfile = (role) => async (req, res) => {
    const { first_name, last_name, email, contact_number, position } = req.body || {};
    if (!hasText(first_name) || !hasText(last_name) || !accountEmailIsValid(email)) {
        return res.status(400).json({ error: 'First name, last name, and a valid email address are required' });
    }
    try {
        const { rows } = await pool.query(
            `UPDATE users SET first_name=$1, last_name=$2, email=$3, contact_number=$4,
                    position=CASE WHEN $5::boolean THEN $6 ELSE position END, updated_at=CURRENT_TIMESTAMP
             WHERE user_id=$7 AND role=$8
             RETURNING user_id AS id, first_name, last_name, email, student_number, course, year_level, section,
                       position, contact_number, role, is_active, created_by, created_at, updated_at`,
            [first_name.trim(), last_name.trim(), email.trim().toLowerCase(), optionalText(contact_number), role === 'admin', optionalText(position), req.user.id, role]);
        if (!rows[0]) return res.status(404).json({ error: 'Profile not found' });
        await logActivity(req.user.id, role, 'profile_updated', { user_id: req.user.id });
        res.json({ ...rows[0], name: fullName(rows[0]) });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Email is already registered' });
        handleError(res, `Updating ${role} profile`, error);
    }
};

app.get('/api/student/profile', authenticateToken, authorizeRole(['student']), getOwnProfile('student'));
app.put('/api/student/profile', authenticateToken, authorizeRole(['student']), updateOwnProfile('student'));
app.get('/api/admin/profile', authenticateToken, authorizeRole(['admin']), getOwnProfile('admin'));
app.put('/api/admin/profile', authenticateToken, authorizeRole(['admin']), updateOwnProfile('admin'));

// ========================================
// STUDENT: VIEW OWN APPOINTMENTS
// ========================================

app.get(
    '/api/appointments',
    authenticateToken,
    authorizeRole(['student']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT
                    a.*,
                    appointment_type.name AS appointment_type_name,
                    ss.available_date,
                    ss.start_time,
                    ss.end_time,
                    staff.first_name AS admin_first_name,
                    staff.last_name AS admin_last_name,
                    attendance.status AS attendance_status,
                    attendance.checked_in_at
                 FROM appointments a
                 LEFT JOIN staff_schedules ss
                    ON a.schedule_id = ss.id
                 LEFT JOIN users staff
                    ON ss.user_id = staff.user_id
                 LEFT JOIN appointment_types appointment_type
                    ON a.appointment_type_id = appointment_type.id
                 LEFT JOIN appointment_attendance attendance
                    ON attendance.appointment_id = a.id
                 WHERE a.user_id = $1
                 ORDER BY
                    a.appointment_date DESC,
                    a.appointment_time DESC`,
                [req.user.id]
            );

            res.json(rows);
        } catch (error) {
            handleError(res, 'Fetching appointments', error);
        }
    }
);

app.get('/api/appointments/:id/history', authenticateToken, authorizeRole(['student']), async (req, res) => {
    if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Appointment ID is invalid' });
    try {
        const owner = await pool.query('SELECT id FROM appointments WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id]);
        if (!owner.rows[0]) return res.status(404).json({ error: 'Appointment not found' });
        const { rows } = await pool.query(
            `SELECT h.id, h.event_type, h.previous_status, h.new_status, h.actor_role, h.reason, h.metadata, h.created_at
             FROM appointment_status_history h
             WHERE h.appointment_id=$1
             ORDER BY h.created_at, h.id`, [Number(req.params.id)]
        );
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching appointment history', error);
    }
});

app.get('/api/appointments/:id/information-requests', authenticateToken, authorizeRole(['student']), async (req, res) => {
    if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Appointment ID is invalid' });
    try {
        const { rows } = await pool.query(
            `SELECT r.id, r.question, r.response, r.status, r.created_at, r.responded_at,
                    u.first_name AS staff_first_name, u.last_name AS staff_last_name
             FROM appointments a JOIN appointment_information_requests r ON r.appointment_id=a.id
             LEFT JOIN users u ON u.user_id=r.requested_by
             WHERE a.id=$1 AND a.user_id=$2 ORDER BY r.created_at, r.id`,
            [Number(req.params.id), req.user.id]
        );
        const owner = await pool.query('SELECT id FROM appointments WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id]);
        if (!owner.rows[0]) return res.status(404).json({ error: 'Appointment not found' });
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching appointment information requests', error);
    }
});

app.get('/api/admin/appointments/:id/information-requests', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Appointment ID is invalid' });
    try {
        const { rows } = await pool.query(
            `SELECT r.id, r.question, r.response, r.status, r.created_at, r.responded_at,
                    u.first_name AS student_first_name, u.last_name AS student_last_name
             FROM appointment_information_requests r JOIN appointments a ON a.id=r.appointment_id
             LEFT JOIN users u ON u.user_id=a.user_id WHERE a.id=$1 ORDER BY r.created_at, r.id`,
            [Number(req.params.id)]
        );
        const appointment = await pool.query('SELECT id FROM appointments WHERE id=$1', [Number(req.params.id)]);
        if (!appointment.rows[0]) return res.status(404).json({ error: 'Appointment not found' });
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching appointment information requests', error);
    }
});

app.post('/api/admin/appointments/:id/information-requests', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const { question } = req.body || {};
    if (!accountIdIsValid(req.params.id) || !hasText(question) || question.trim().length > 1000) {
        return res.status(400).json({ error: 'Provide a valid appointment and question (up to 1000 characters)' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const appointment = await client.query('SELECT id, user_id FROM appointments WHERE id=$1 FOR UPDATE', [Number(req.params.id)]);
        if (!appointment.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Appointment not found' });
        }
        const pending = await client.query("SELECT id FROM appointment_information_requests WHERE appointment_id=$1 AND status='pending'", [Number(req.params.id)]);
        if (pending.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'An unanswered information request already exists' });
        }
        const { rows } = await client.query(
            `INSERT INTO appointment_information_requests (appointment_id, requested_by, question)
             VALUES ($1, $2, $3) RETURNING id, appointment_id, requested_by, question, response, status, created_at, responded_at`,
            [Number(req.params.id), req.user.id, question.trim()]
        );
        if (appointment.rows[0].user_id) await createNotification(client, {
            userId: appointment.rows[0].user_id, appointmentId: Number(req.params.id), type: 'information_requested',
            title: 'Clinic needs more information', message: 'Open your appointment details to read and answer a clinic question.',
            dedupeKey: `appointment:${req.params.id}:information-request:${rows[0].id}:user:${appointment.rows[0].user_id}`
        });
        await client.query('COMMIT');
        await logActivity(req.user.id, req.user.role, 'appointment_information_requested', { appointment_id: Number(req.params.id), request_id: rows[0].id });
        res.status(201).json({ request: rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        handleError(res, 'Requesting appointment information', error);
    } finally {
        client.release();
    }
});

app.patch('/api/appointments/:id/information-requests/:requestId', authenticateToken, authorizeRole(['student']), async (req, res) => {
    const { response } = req.body || {};
    if (!accountIdIsValid(req.params.id) || !accountIdIsValid(req.params.requestId)
        || !hasText(response) || response.trim().length > 2000) {
        return res.status(400).json({ error: 'Provide a response of up to 2000 characters' });
    }
    try {
        const { rows } = await pool.query(
            `UPDATE appointment_information_requests r SET response=$1, status='answered', responded_at=CURRENT_TIMESTAMP
             FROM appointments a
             WHERE r.id=$2 AND r.appointment_id=a.id AND a.id=$3 AND a.user_id=$4 AND r.status='pending'
             RETURNING r.id, r.appointment_id, r.question, r.response, r.status, r.created_at, r.responded_at`,
            [response.trim(), Number(req.params.requestId), Number(req.params.id), req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Pending information request not found' });
        await notifyActiveAdmins(pool, {
            appointmentId: Number(req.params.id), type: 'information_provided', title: 'Student replied to an information request',
            message: 'A student responded to a clinic question. Review the appointment details.',
            dedupeKey: `appointment:${req.params.id}:information-replied:${rows[0].id}`
        });
        await logActivity(req.user.id, req.user.role, 'appointment_information_provided', { appointment_id: Number(req.params.id), request_id: rows[0].id });
        res.json({ request: rows[0] });
    } catch (error) {
        handleError(res, 'Responding to appointment information request', error);
    }
});

const validateProposalSlot = async (client, appointmentId, userId, scheduleId, date, time) => {
    const appointmentResult = await client.query(
        `SELECT a.id, a.user_id, a.status, a.appointment_type_id, a.appointment_date::text AS appointment_date,
                a.appointment_time::text AS appointment_time, t.duration_minutes, t.capacity_per_slot
         FROM appointments a JOIN appointment_types t ON t.id=a.appointment_type_id
         WHERE a.id=$1 AND a.status IN ('pending', 'confirmed') FOR UPDATE OF a`, [appointmentId]
    );
    const appointment = appointmentResult.rows[0];
    if (!appointment || (userId !== undefined && appointment.user_id !== userId)) return { error: 'Appointment not found or cannot be rescheduled', status: 404 };
    const scheduleResult = await client.query(
        `SELECT ss.id, ss.user_id, ss.start_time::text AS start_time, ss.end_time::text AS end_time
         FROM staff_schedules ss JOIN users staff ON staff.user_id=ss.user_id
         WHERE ss.id=$1 AND ss.is_available=TRUE AND ss.available_date=$2::date AND ss.available_date>=CURRENT_DATE
           AND staff.role='admin' AND staff.is_active=TRUE FOR UPDATE OF ss`, [scheduleId, date]
    );
    const schedule = scheduleResult.rows[0];
    if (!schedule) return { error: 'The proposed schedule is unavailable', status: 400 };
    const start = timeToSeconds(schedule.start_time);
    const selected = timeToSeconds(time);
    const duration = appointment.duration_minutes * 60;
    if (selected < start || selected + duration > timeToSeconds(schedule.end_time) || (selected - start) % duration !== 0) {
        return { error: 'Choose a time slot generated for this appointment type', status: 400 };
    }
    const endTime = formatTime(selected + duration);
    if (!await validateClinicWindow(client, date, time, endTime, true)) return { error: 'The proposed time is outside clinic operating hours', status: 400 };
    const exceptions = await client.query(
        `SELECT start_time::text AS start_time, end_time::text AS end_time FROM staff_schedule_exceptions
         WHERE is_active=TRUE AND start_date <= $1::date AND end_date >= $1::date
           AND (staff_id IS NULL OR staff_id=$2) FOR SHARE`, [date, schedule.user_id]
    );
    if (exceptions.rows.some(exception => !exception.start_time
        || (selected < timeToSeconds(exception.end_time) && selected + duration > timeToSeconds(exception.start_time)))) {
        return { error: 'The proposed time is blocked by a clinic or staff schedule exception', status: 400 };
    }
    const policy = await client.query('SELECT pending_requests_reserve_capacity FROM clinic_appointment_policy WHERE id=1 FOR SHARE');
    const occupancyConflict = await validateSlotOccupancy(client, {
        scheduleId, staffId: schedule.user_id, userId: appointment.user_id,
        appointmentTypeId: appointment.appointment_type_id, date, time,
        durationMinutes: appointment.duration_minutes, capacity: appointment.capacity_per_slot,
        pendingReserves: policy.rows[0]?.pending_requests_reserve_capacity !== false,
        ignoreAppointmentId: appointmentId
    });
    if (occupancyConflict) return occupancyConflict;
    return { appointment, schedule };
};

app.get('/api/appointments/:id/schedule-proposals', authenticateToken, authorizeRole(['student']), async (req, res) => {
    if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Appointment ID is invalid' });
    try {
        const owner = await pool.query('SELECT id FROM appointments WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id]);
        if (!owner.rows[0]) return res.status(404).json({ error: 'Appointment not found' });
        const { rows } = await pool.query(
            `SELECT p.id, p.schedule_id, p.proposed_date::text AS proposed_date, p.proposed_time::text AS proposed_time,
                    p.message, p.response_reason, p.status, p.created_at, p.responded_at,
                    u.first_name AS staff_first_name, u.last_name AS staff_last_name
             FROM appointment_schedule_proposals p LEFT JOIN users u ON u.user_id=p.proposed_by
             WHERE p.appointment_id=$1 ORDER BY p.created_at DESC, p.id DESC`, [Number(req.params.id)]
        );
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching schedule proposals', error);
    }
});

app.get('/api/admin/appointments/:id/schedule-proposals', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Appointment ID is invalid' });
    try {
        const { rows } = await pool.query(
            `SELECT p.id, p.schedule_id, p.proposed_date::text AS proposed_date, p.proposed_time::text AS proposed_time,
                    p.message, p.response_reason, p.status, p.created_at, p.responded_at,
                    u.first_name AS student_first_name, u.last_name AS student_last_name
             FROM appointment_schedule_proposals p JOIN appointments a ON a.id=p.appointment_id
             LEFT JOIN users u ON u.user_id=a.user_id WHERE a.id=$1 ORDER BY p.created_at DESC, p.id DESC`, [Number(req.params.id)]
        );
        const appointment = await pool.query('SELECT id FROM appointments WHERE id=$1', [Number(req.params.id)]);
        if (!appointment.rows[0]) return res.status(404).json({ error: 'Appointment not found' });
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching schedule proposals', error);
    }
});

app.post('/api/admin/appointments/:id/schedule-proposals', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const { schedule_id, date, time, message } = req.body || {};
    if (!accountIdIsValid(req.params.id) || !accountIdIsValid(String(schedule_id ?? ''))
        || !isValidDateOnly(date) || !isValidTime(time) || (message !== undefined && (typeof message !== 'string' || message.trim().length > 1000))) {
        return res.status(400).json({ error: 'Provide a valid appointment, schedule, date, time, and optional message' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const validation = await validateProposalSlot(client, Number(req.params.id), undefined, Number(schedule_id), date, time);
        if (validation.error) {
            await client.query('ROLLBACK');
            return res.status(validation.status).json({ error: validation.error });
        }
        const { rows } = await client.query(
            `INSERT INTO appointment_schedule_proposals (appointment_id, proposed_by, schedule_id, proposed_date, proposed_time, message)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, appointment_id, schedule_id, proposed_date::text AS proposed_date,
                       proposed_time::text AS proposed_time, message, response_reason, status, created_at, responded_at`,
            [Number(req.params.id), req.user.id, Number(schedule_id), date, time, optionalText(message)]
        );
        await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, 'appointment_schedule_proposed', $3)`,
            [req.user.id, req.user.role, JSON.stringify({ appointment_id: Number(req.params.id), proposal_id: rows[0].id })]);
        if (validation.appointment.user_id) await createNotification(client, {
            userId: validation.appointment.user_id, appointmentId: Number(req.params.id), type: 'schedule_proposed',
            title: 'Clinic proposed another appointment time', message: 'Review the proposed time in your appointment details.',
            dedupeKey: `appointment:${req.params.id}:schedule-proposal:${rows[0].id}:user:${validation.appointment.user_id}`
        });
        await client.query('COMMIT');
        res.status(201).json({ proposal: rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') return res.status(409).json({ error: 'A schedule proposal is already awaiting the student response' });
        handleError(res, 'Proposing an alternative appointment time', error);
    } finally {
        client.release();
    }
});

app.patch('/api/appointments/:id/schedule-proposals/:proposalId', authenticateToken, authorizeRole(['student']), async (req, res) => {
    const { decision, reason } = req.body || {};
    if (!accountIdIsValid(req.params.id) || !accountIdIsValid(req.params.proposalId)
        || !['accepted', 'rejected'].includes(decision) || (reason !== undefined && (typeof reason !== 'string' || reason.trim().length > 1000))) {
        return res.status(400).json({ error: 'Provide a valid proposal decision and optional response reason' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const proposalResult = await client.query(
            `SELECT p.id, p.schedule_id, p.proposed_by, p.proposed_date::text AS proposed_date, p.proposed_time::text AS proposed_time
             FROM appointment_schedule_proposals p JOIN appointments a ON a.id=p.appointment_id
             WHERE p.id=$1 AND p.appointment_id=$2 AND a.user_id=$3 AND p.status='pending' FOR UPDATE OF p, a`,
            [Number(req.params.proposalId), Number(req.params.id), req.user.id]
        );
        const proposal = proposalResult.rows[0];
        if (!proposal) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Pending schedule proposal not found' });
        }
        if (decision === 'accepted') {
            const validation = await validateProposalSlot(client, Number(req.params.id), req.user.id,
                proposal.schedule_id, proposal.proposed_date, proposal.proposed_time);
            if (validation.error) {
                await client.query(`UPDATE appointment_schedule_proposals SET status='expired', responded_at=CURRENT_TIMESTAMP WHERE id=$1`, [proposal.id]);
                await client.query('COMMIT');
                return res.status(409).json({ error: `${validation.error}. The proposal expired; contact the clinic for another time.` });
            }
            const appointment = validation.appointment;
            await client.query(
                `UPDATE appointments SET schedule_id=$1, appointment_date=$2::date, appointment_time=$3::time, updated_at=CURRENT_TIMESTAMP WHERE id=$4`,
                [proposal.schedule_id, proposal.proposed_date, proposal.proposed_time, Number(req.params.id)]
            );
            await recordAppointmentEvent(client, { appointmentId: appointment.id, eventType: 'rescheduled',
                newStatus: appointment.status, previousStatus: appointment.status, actorId: req.user.id, actorRole: req.user.role,
                metadata: { from_date: appointment.appointment_date, from_time: appointment.appointment_time,
                    to_date: proposal.proposed_date, to_time: proposal.proposed_time, proposal_id: proposal.id } });
        }
        const { rows } = await client.query(
            `UPDATE appointment_schedule_proposals SET status=$1, response_reason=$2, responded_at=CURRENT_TIMESTAMP
             WHERE id=$3 RETURNING id, schedule_id, proposed_date::text AS proposed_date, proposed_time::text AS proposed_time,
                       message, response_reason, status, created_at, responded_at`,
            [decision, optionalText(reason), proposal.id]
        );
        await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, $3, $4)`,
            [req.user.id, req.user.role, `appointment_schedule_proposal_${decision}`, JSON.stringify({ appointment_id: Number(req.params.id), proposal_id: proposal.id })]);
        if (proposal.proposed_by) await createNotification(client, {
            userId: proposal.proposed_by, appointmentId: Number(req.params.id), type: `schedule_proposal_${decision}`,
            title: `Student ${decision} the proposed time`, message: `The student ${decision} the alternative appointment time.`,
            dedupeKey: `appointment:${req.params.id}:schedule-proposal:${proposal.id}:${decision}:staff:${proposal.proposed_by}`
        });
        await client.query('COMMIT');
        res.json({ proposal: rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        handleError(res, 'Responding to schedule proposal', error);
    } finally {
        client.release();
    }
});

app.get('/api/appointments/:id/reschedule-requests', authenticateToken, authorizeRole(['student']), async (req, res) => {
    if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Appointment ID is invalid' });
    try {
        const owner = await pool.query('SELECT id FROM appointments WHERE id=$1 AND user_id=$2', [Number(req.params.id), req.user.id]);
        if (!owner.rows[0]) return res.status(404).json({ error: 'Appointment not found' });
        const { rows } = await pool.query(
            `SELECT id, requested_date, requested_time, student_reason, status, review_reason, created_at, updated_at
             FROM appointment_reschedule_requests WHERE appointment_id=$1 ORDER BY created_at, id`,
            [Number(req.params.id)]
        );
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching reschedule requests', error);
    }
});

app.post('/api/appointments/:id/reschedule-requests', authenticateToken, authorizeRole(['student']), async (req, res) => {
    const { schedule_id, appointment_date, appointment_time, reason } = req.body || {};
    if (!accountIdIsValid(req.params.id) || !accountIdIsValid(String(schedule_id ?? ''))
        || !isValidDateOnly(appointment_date) || !isValidTime(appointment_time)
        || !hasText(reason) || reason.trim().length > 1000) {
        return res.status(400).json({ error: 'Choose an available schedule, date, time, and reason (up to 1000 characters)' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const appointment = await client.query(
            `SELECT id, status FROM appointments WHERE id=$1 AND user_id=$2 AND status IN ('pending', 'confirmed') FOR UPDATE`,
            [Number(req.params.id), req.user.id]
        );
        if (!appointment.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Appointment not found or cannot be rescheduled' });
        }
        const schedule = await client.query(
            `SELECT ss.id, ss.user_id FROM staff_schedules ss JOIN users staff ON staff.user_id=ss.user_id
             WHERE ss.id=$1 AND ss.is_available=TRUE AND ss.available_date=$2::date
               AND ss.available_date >= CURRENT_DATE AND $3::time >= ss.start_time AND $3::time < ss.end_time
               AND staff.role='admin' AND staff.is_active=TRUE FOR UPDATE OF ss`,
            [Number(schedule_id), appointment_date, appointment_time]
        );
        if (!schedule.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'The requested schedule is unavailable' });
        }
        const slot = `${appointment_date} ${appointment_time}`;
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [`staff:${schedule.rows[0].user_id}`, slot]);
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [`student:${req.user.id}`, slot]);
        const conflict = await client.query(
            `SELECT 1 FROM appointments a LEFT JOIN staff_schedules booked ON booked.id=a.schedule_id
             WHERE a.id<>$1 AND a.appointment_date=$2::date AND a.appointment_time=$3::time
               AND a.status IN ('pending', 'confirmed', 'checked_in', 'in_consultation')
               AND (booked.user_id=$4 OR a.user_id=$5) LIMIT 1`,
            [appointment.rows[0].id, appointment_date, appointment_time, schedule.rows[0].user_id, req.user.id]
        );
        if (conflict.rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'That requested time is no longer available' });
        }
        const { rows } = await client.query(
            `INSERT INTO appointment_reschedule_requests
                (appointment_id, student_id, requested_schedule_id, requested_date, requested_time, student_reason)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [appointment.rows[0].id, req.user.id, Number(schedule_id), appointment_date, appointment_time, reason.trim()]
        );
        await notifyActiveAdmins(client, {
            appointmentId: appointment.rows[0].id, type: 'reschedule_requested', title: 'Reschedule request needs review',
            message: 'A student requested a change to an appointment time.', dedupeKey: `reschedule-request:${rows[0].id}`
        });
        await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details)
            VALUES ($1, $2, 'appointment_reschedule_requested', $3)`,
        [req.user.id, req.user.role, JSON.stringify({ appointment_id: appointment.rows[0].id, request_id: rows[0].id })]);
        await client.query('COMMIT');
        res.status(201).json({ message: 'Reschedule request submitted. Your current appointment remains unchanged until review.', request: rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') return res.status(409).json({ error: 'A reschedule request is already awaiting review' });
        handleError(res, 'Submitting reschedule request', error);
    } finally {
        client.release();
    }
});

app.patch('/api/appointments/:id/reschedule-requests/:requestId/cancel', authenticateToken, authorizeRole(['student']), async (req, res) => {
    if (!accountIdIsValid(req.params.id) || !accountIdIsValid(req.params.requestId)) {
        return res.status(400).json({ error: 'Reschedule request ID is invalid' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `UPDATE appointment_reschedule_requests r SET status='cancelled', updated_at=CURRENT_TIMESTAMP
             FROM appointments a
             WHERE r.id=$1 AND r.appointment_id=$2 AND r.student_id=$3
               AND r.status='pending' AND a.id=r.appointment_id AND a.user_id=$3
             RETURNING r.*`,
            [Number(req.params.requestId), Number(req.params.id), req.user.id]
        );
        if (!rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Pending reschedule request not found' });
        }
        await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details)
            VALUES ($1, $2, 'appointment_reschedule_request_cancelled', $3)`,
        [req.user.id, req.user.role, JSON.stringify({ appointment_id: Number(req.params.id), request_id: rows[0].id })]);
        await client.query('COMMIT');
        res.json({ message: 'Reschedule request withdrawn', request: rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        handleError(res, 'Cancelling reschedule request', error);
    } finally {
        client.release();
    }
});

// ========================================
// STUDENT: BOOK APPOINTMENT
// ========================================

app.post(
    '/api/appointments',
    authenticateToken,
    authorizeRole(['student']),
    async (req, res) => {
        const {
            date,
            time,
            reason,
            schedule_id,
            appointment_type_id,
            additional_information = {}
        } = req.body || {};

        if (!isValidDateOnly(date) || !isValidTime(time)
            || !accountIdIsValid(String(schedule_id ?? ''))
            || !accountIdIsValid(String(appointment_type_id ?? ''))
            || !additional_information || typeof additional_information !== 'object' || Array.isArray(additional_information)
            || Object.entries(additional_information).length > 20
            || Object.entries(additional_information).some(([key, value]) => !key.trim() || key.length > 80 || typeof value !== 'string' || value.length > 1000)
            || JSON.stringify(additional_information).length > 5000
            || typeof reason !== 'string' || !reason.trim() || reason.trim().length > 1000) {
            return res.status(400).json({
                error: 'Choose an available schedule and provide a valid date, time, and reason (up to 1000 characters)'
            });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const appointmentType = await client.query(
                'SELECT id, duration_minutes, capacity_per_slot, requires_approval, required_information FROM appointment_types WHERE id = $1 AND is_active = TRUE FOR SHARE',
                [Number(appointment_type_id)]
            );
            if (!appointmentType.rows[0]) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Choose an active appointment type' });
            }
            const missingInformation = appointmentType.rows[0].required_information.filter(field => !hasText(additional_information[field]));
            if (missingInformation.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Complete all required appointment information', missing_information: missingInformation });
            }
            const schedule = await client.query(
                `SELECT ss.id, ss.user_id, ss.start_time::text AS start_time, ss.end_time::text AS end_time
                 FROM staff_schedules ss
                 JOIN users staff ON staff.user_id = ss.user_id
                 WHERE ss.id = $1 AND ss.is_available = TRUE
                   AND ss.available_date = $2::date AND ss.available_date >= CURRENT_DATE
                   AND $3::time >= ss.start_time AND $3::time < ss.end_time
                   AND staff.role = 'admin' AND staff.is_active = TRUE
                 FOR UPDATE OF ss`,
                [Number(schedule_id), date, time]
            );
            if (!schedule.rows[0]) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Selected schedule is unavailable for that date or time' });
            }

            const selectedSeconds = timeToSeconds(time);
            const startSeconds = timeToSeconds(schedule.rows[0].start_time);
            const endSeconds = timeToSeconds(schedule.rows[0].end_time);
            const durationSeconds = appointmentType.rows[0].duration_minutes * 60;
            if (selectedSeconds < startSeconds || selectedSeconds + durationSeconds > endSeconds
                || (selectedSeconds - startSeconds) % durationSeconds !== 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Choose a time slot generated for this appointment type' });
            }
            const slotEnd = formatTime(selectedSeconds + durationSeconds);
            if (!await validateClinicWindow(client, date, time, slotEnd, true)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'The selected time is outside clinic operating hours' });
            }
            const exceptions = await client.query(
                `SELECT start_time::text AS start_time, end_time::text AS end_time
                 FROM staff_schedule_exceptions
                 WHERE is_active=TRUE AND start_date <= $1::date AND end_date >= $1::date
                   AND (staff_id IS NULL OR staff_id=$2) FOR SHARE`,
                [date, schedule.rows[0].user_id]
            );
            const blocked = exceptions.rows.some(exception => !exception.start_time
                || (selectedSeconds < timeToSeconds(exception.end_time)
                    && selectedSeconds + durationSeconds > timeToSeconds(exception.start_time)));
            if (blocked) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'The selected time is blocked by a clinic or staff schedule exception' });
            }

            const staffId = schedule.rows[0].user_id;
            const policy = await client.query('SELECT * FROM clinic_appointment_policy WHERE id=1 FOR SHARE');
            const clinicPolicy = policy.rows[0];
            if (clinicPolicy.max_active_appointments_per_student !== null) {
                const active = await client.query(
                    `SELECT COUNT(*)::int AS count FROM appointments WHERE user_id=$1 AND status IN ('pending','confirmed','checked_in','in_consultation')`,
                    [req.user.id]
                );
                if (active.rows[0].count >= clinicPolicy.max_active_appointments_per_student) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ error: 'You have reached the clinic-configured active appointment limit' });
                }
            }
            const occupancyConflict = await validateSlotOccupancy(client, {
                scheduleId: Number(schedule_id), staffId, userId: req.user.id,
                appointmentTypeId: Number(appointment_type_id), date, time,
                durationMinutes: appointmentType.rows[0].duration_minutes,
                capacity: appointmentType.rows[0].capacity_per_slot,
                pendingReserves: clinicPolicy.pending_requests_reserve_capacity
            });
            if (occupancyConflict) {
                await client.query('ROLLBACK');
                return res.status(occupancyConflict.status).json({ error: occupancyConflict.error });
            }

            const { rows } = await client.query(
                `INSERT INTO appointments
                    (
                        user_id,
                        schedule_id,
                        appointment_type_id,
                        reference_number,
                        appointment_date,
                        appointment_time,
                        reason,
                        additional_information,
                        status
                    )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING *`,
                [
                    req.user.id,
                    Number(schedule_id),
                    Number(appointment_type_id),
                    appointmentReference(),
                    date,
                    time,
                    reason.trim(),
                    JSON.stringify(additional_information),
                    appointmentType.rows[0].requires_approval ? 'pending' : 'confirmed'
                ]
            );

            await recordAppointmentEvent(client, {
                appointmentId: rows[0].id,
                newStatus: rows[0].status,
                actorId: req.user.id,
                actorRole: req.user.role
            });

            await client.query(
                `INSERT INTO activity_logs (actor_id, actor_role, action, details)
                 VALUES ($1, 'student', 'appointment_booked', $2)`,
                [req.user.id, JSON.stringify({ appointment_id: rows[0].id })]
            );
            await createNotification(client, {
                userId: req.user.id, appointmentId: rows[0].id, type: 'booking_submitted',
                title: 'Appointment request received', message: 'Your clinic appointment request was received.',
                dedupeKey: `appointment:${rows[0].id}:booking-submitted:user:${req.user.id}`
            });
            if (rows[0].status === 'pending') await notifyActiveAdmins(client, {
                appointmentId: rows[0].id, type: 'booking_pending', title: 'Appointment needs review',
                message: 'A student submitted an appointment request for staff review.',
                dedupeKey: `appointment:${rows[0].id}:booking-pending`
            });
            await client.query('COMMIT');

            res.status(201).json({
                message: 'Appointment booked successfully',
                appointment: rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            handleError(res, 'Booking appointment', error);
        } finally {
            client.release();
        }
    }
);

// ========================================
// STUDENT: CANCEL APPOINTMENT
// ========================================

app.patch(
    '/api/appointments/:id/cancel',
    authenticateToken,
    authorizeRole(['student']),
    async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const existing = await client.query(
                `SELECT id, status, appointment_date::text AS appointment_date, appointment_time::text AS appointment_time FROM appointments
                 WHERE id=$1 AND user_id=$2 AND status IN ('pending', 'confirmed')
                 FOR UPDATE`, [req.params.id, req.user.id]
            );
            if (!existing.rows[0]) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Appointment not found or cannot be cancelled' });
            }
            const policy = await client.query('SELECT student_cancellation_deadline_hours, clinic_timezone FROM clinic_appointment_policy WHERE id=1 FOR SHARE');
            if (policy.rows[0]?.student_cancellation_deadline_hours !== null && policy.rows[0]?.student_cancellation_deadline_hours !== undefined) {
                const withinDeadline = await client.query(
                    `SELECT (($1::date + $2::time) AT TIME ZONE $3) <= CURRENT_TIMESTAMP
                            + ($4::int * INTERVAL '1 hour') AS blocked`,
                    [existing.rows[0].appointment_date, existing.rows[0].appointment_time, policy.rows[0].clinic_timezone,
                        policy.rows[0].student_cancellation_deadline_hours]
                );
                if (withinDeadline.rows[0].blocked) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ error: 'The clinic-configured cancellation deadline has passed' });
                }
            }
            const { rows } = await client.query(
                `UPDATE appointments
                 SET
                    status = 'cancelled',
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                   AND user_id = $2
                   AND status = $3
                 RETURNING *`,
                [req.params.id, req.user.id, existing.rows[0].status]
            );

            if (rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({
                    error: 'Appointment not found or cannot be cancelled'
                });
            }

            await recordAppointmentEvent(client, {
                appointmentId: rows[0].id,
                previousStatus: existing.rows[0].status,
                newStatus: 'cancelled',
                actorId: req.user.id,
                actorRole: req.user.role
            });
            await notifyActiveAdmins(client, {
                appointmentId: rows[0].id, type: 'appointment_cancelled', title: 'Appointment cancelled',
                message: 'A student cancelled an appointment.', dedupeKey: `appointment:${rows[0].id}:cancelled`
            });
            await notifyWaitlistForReleasedSlot(client, rows[0]);
            await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details)
                VALUES ($1, $2, 'appointment_cancelled', $3)`,
            [req.user.id, req.user.role, JSON.stringify({ appointment_id: rows[0].id })]);
            await removeFromWaitingQueue(client, { appointmentId: rows[0].id, actorId: req.user.id, actorRole: req.user.role, reason: 'Appointment cancelled' });
            await client.query('COMMIT');

            res.json({
                message: 'Appointment cancelled',
                appointment: rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            handleError(res, 'Cancelling appointment', error);
        } finally {
            client.release();
        }
    }
);

// Fetch Student Medical Records
app.get('/api/student/records', authenticateToken, authorizeRole(['student']), async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT r.id, r.appointment_id, r.visit_date, r.diagnosis_notes, r.consultation_notes,
                   r.chief_complaint, r.history_of_present_illness, r.relevant_medical_history, r.vital_signs,
                   r.clinical_assessment, r.diagnosis, r.treatment, r.medication_information, r.instructions,
                   r.follow_up_recommendation, r.provider_id, a.reason
            FROM patient_records r 
            JOIN appointments a ON r.appointment_id = a.id 
            WHERE r.user_id = $1 AND r.record_status='finalized' AND a.status='completed'
            ORDER BY r.visit_date DESC
        `, [req.user.id]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch medical records' });
    }
});

// ========================================
// ADMIN: DASHBOARD STATS
// ========================================
app.get(
    '/api/admin/dashboard-stats',
    authenticateToken,
    authorizeRole(['admin', 'super_admin']),
    async (req, res) => {
        try {
            const [appointments, students, records] = await Promise.all([
                pool.query(`SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE appointment_date=CURRENT_DATE)::int AS today,
                    COUNT(*) FILTER (WHERE status='pending')::int AS pending,
                    COUNT(*) FILTER (WHERE status='confirmed')::int AS confirmed,
                    COUNT(*) FILTER (WHERE status='completed')::int AS completed,
                    COUNT(*) FILTER (WHERE status IN ('cancelled','rejected'))::int AS cancelled
                    FROM appointments`),
                pool.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'student'"),
                pool.query('SELECT COUNT(*)::int AS count FROM patient_records')
            ]);
            res.json({ ...appointments.rows[0], totalAppointments: appointments.rows[0].total, totalPatients: students.rows[0].count, totalRecords: records.rows[0].count });
        } catch (err) {
            console.error("Dashboard Stats Error:", err);
            res.status(500).json({ error: 'Failed to fetch stats' });
        }
    }
);

app.get('/api/admin/reports/appointments', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const { from, to, appointment_type_id, staff_id } = req.query;
    if ((from && !isValidDateOnly(from)) || (to && !isValidDateOnly(to))
        || (from && to && from > to)
        || (appointment_type_id && !accountIdIsValid(String(appointment_type_id)))
        || (staff_id && !accountIdIsValid(String(staff_id)))) {
        return res.status(400).json({ error: 'Choose a valid date range and optional appointment type or staff filter' });
    }
    try {
        const filters = [from || null, to || null, appointment_type_id ? Number(appointment_type_id) : null,
            staff_id ? Number(staff_id) : null];
        const where = `($1::date IS NULL OR a.appointment_date >= $1::date)
            AND ($2::date IS NULL OR a.appointment_date <= $2::date)
            AND ($3::int IS NULL OR a.appointment_type_id=$3)
            AND ($4::int IS NULL OR ss.user_id=$4)`;
        const [summary, byStatus, byType, staffWorkload] = await Promise.all([
            pool.query(`SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status='pending')::int AS pending,
                COUNT(*) FILTER (WHERE status='confirmed')::int AS confirmed,
                COUNT(*) FILTER (WHERE status='in_consultation')::int AS in_consultation,
                COUNT(*) FILTER (WHERE status='completed')::int AS completed,
                COUNT(*) FILTER (WHERE status IN ('cancelled','rejected'))::int AS cancelled,
                COUNT(*) FILTER (WHERE status='no_show')::int AS no_show
                FROM appointments a LEFT JOIN staff_schedules ss ON ss.id=a.schedule_id WHERE ${where}`, filters),
            pool.query(`SELECT a.status, COUNT(*)::int AS count FROM appointments a
                LEFT JOIN staff_schedules ss ON ss.id=a.schedule_id WHERE ${where} GROUP BY a.status ORDER BY a.status`, filters),
            pool.query(`SELECT COALESCE(t.name, 'Legacy appointment') AS appointment_type, COUNT(*)::int AS count
                FROM appointments a LEFT JOIN appointment_types t ON t.id=a.appointment_type_id
                LEFT JOIN staff_schedules ss ON ss.id=a.schedule_id WHERE ${where}
                GROUP BY COALESCE(t.name, 'Legacy appointment') ORDER BY count DESC, appointment_type`, filters),
            pool.query(`SELECT ss.user_id AS staff_id, concat_ws(' ', u.first_name, u.last_name) AS staff_name,
                    COUNT(a.id)::int AS appointments,
                    COUNT(*) FILTER (WHERE a.status='completed')::int AS completed
                FROM staff_schedules ss JOIN users u ON u.user_id=ss.user_id
                LEFT JOIN appointments a ON a.schedule_id=ss.id
                    AND ($1::date IS NULL OR a.appointment_date >= $1::date)
                    AND ($2::date IS NULL OR a.appointment_date <= $2::date)
                    AND ($3::int IS NULL OR a.appointment_type_id=$3)
                WHERE ($4::int IS NULL OR ss.user_id=$4)
                GROUP BY ss.user_id, u.first_name, u.last_name ORDER BY appointments DESC, staff_name`, filters)
        ]);
        res.json({ filters: { from: from || null, to: to || null, appointment_type_id: appointment_type_id || null, staff_id: staff_id || null },
            summary: summary.rows[0], byStatus: byStatus.rows, byType: byType.rows, staffWorkload: staffWorkload.rows });
    } catch (error) { handleError(res, 'Fetching appointment report', error); }
});

// ========================================
// ADMIN AND SUPER ADMIN: ALL APPOINTMENTS
// ========================================

app.get(
    '/api/admin/appointments',
    authenticateToken,
    authorizeRole(['admin', 'super_admin']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT
                    a.id,
                    a.reference_number,
                    a.user_id,
                    a.appointment_date,
                    a.appointment_time,
                    a.reason,
                    a.status,
                    a.created_at,
                    a.updated_at,
                    attendance.status AS attendance_status,
                    attendance.checked_in_at,

                    s.student_number AS school_id,
                    s.student_number,
                    CONCAT_WS(
                        ' ',
                        s.first_name,
                        s.last_name
                    ) AS student_name,

                    s.first_name AS student_first_name,
                    s.last_name AS student_last_name,
                    s.email AS student_email,
                    s.course,
                    s.year_level,
                    s.section,
                    s.contact_number,

                    staff.first_name AS admin_first_name,
                    staff.last_name AS admin_last_name,

                    EXISTS (
                        SELECT 1
                        FROM patient_records pr
                        WHERE pr.appointment_id = a.id
                    ) AS has_medical_record

                FROM appointments a

                INNER JOIN users s
                    ON s.user_id = a.user_id

                LEFT JOIN staff_schedules ss
                    ON a.schedule_id = ss.id

                LEFT JOIN users staff
                    ON ss.user_id = staff.user_id
                LEFT JOIN appointment_attendance attendance
                    ON attendance.appointment_id = a.id

                ORDER BY
                    a.appointment_date DESC,
                    a.appointment_time DESC,
                    a.id DESC`
            );

            res.json(rows);
        } catch (error) {
            handleError(
                res,
                'Fetching all appointments',
                error
            );
        }
    }
);

app.get('/api/admin/appointments/:id/history', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Appointment ID is invalid' });
    try {
        const { rows } = await pool.query(
            `SELECT h.id, h.event_type, h.previous_status, h.new_status, h.actor_id,
                    h.actor_role, h.reason, h.metadata, h.created_at,
                    NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS actor_name
             FROM appointment_status_history h
             LEFT JOIN users u ON u.user_id=h.actor_id
             WHERE h.appointment_id=$1
             ORDER BY h.created_at, h.id`, [Number(req.params.id)]
        );
        if (!rows.length) {
            const appointment = await pool.query('SELECT id FROM appointments WHERE id=$1', [Number(req.params.id)]);
            if (!appointment.rows[0]) return res.status(404).json({ error: 'Appointment not found' });
        }
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching appointment history', error);
    }
});

app.get('/api/admin/reschedule-requests', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT r.id, r.appointment_id, r.student_id, r.requested_date, r.requested_time,
                    r.student_reason, r.status, r.created_at, a.reference_number,
                    a.appointment_date AS current_appointment_date, a.appointment_time AS current_appointment_time,
                    s.student_number, CONCAT_WS(' ', s.first_name, s.last_name) AS student_name
             FROM appointment_reschedule_requests r
             JOIN appointments a ON a.id=r.appointment_id
             JOIN users s ON s.user_id=r.student_id
             ORDER BY (r.status='pending') DESC, r.created_at, r.id`
        );
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching reschedule requests', error);
    }
});

app.patch('/api/admin/reschedule-requests/:id', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const { status, reason } = req.body || {};
    const nextStatus = typeof status === 'string' ? status.toLowerCase() : '';
    if (!accountIdIsValid(req.params.id) || !['approved', 'rejected'].includes(nextStatus)) {
        return res.status(400).json({ error: 'A valid reschedule request ID and decision are required' });
    }
    if (nextStatus === 'rejected' && (!hasText(reason) || reason.trim().length > 1000)) {
        return res.status(400).json({ error: 'A rejection reason of up to 1000 characters is required' });
    }
    if (reason !== undefined && (typeof reason !== 'string' || reason.trim().length > 1000)) {
        return res.status(400).json({ error: 'Reason must be 1000 characters or fewer' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const request = await client.query(
            'SELECT * FROM appointment_reschedule_requests WHERE id=$1 FOR UPDATE', [Number(req.params.id)]
        );
        if (!request.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Reschedule request not found' });
        }
        if (request.rows[0].status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Reschedule request has already been decided' });
        }
        const appointment = await client.query(
            `SELECT id, user_id, status, appointment_date, appointment_time FROM appointments WHERE id=$1 FOR UPDATE`,
            [request.rows[0].appointment_id]
        );
        if (!appointment.rows[0] || !['pending', 'confirmed'].includes(appointment.rows[0].status)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'The original appointment can no longer be rescheduled' });
        }

        if (nextStatus === 'rejected') {
            const { rows } = await client.query(
                `UPDATE appointment_reschedule_requests SET status='rejected', reviewer_id=$1,
                    review_reason=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3 RETURNING *`,
                [req.user.id, reason.trim(), Number(req.params.id)]
            );
            await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details)
                VALUES ($1, $2, 'appointment_reschedule_rejected', $3)`,
            [req.user.id, req.user.role, JSON.stringify({ appointment_id: appointment.rows[0].id, request_id: rows[0].id })]);
            if (appointment.rows[0].user_id) await createNotification(client, {
                userId: appointment.rows[0].user_id, appointmentId: appointment.rows[0].id, type: 'reschedule_rejected',
                title: 'Reschedule request declined', message: 'The clinic declined your reschedule request. Your original appointment remains unchanged.',
                dedupeKey: `reschedule-request:${rows[0].id}:rejected:user:${appointment.rows[0].user_id}`
            });
            await client.query('COMMIT');
            return res.json({ message: 'Reschedule request rejected', request: rows[0] });
        }

        const schedule = await client.query(
            `SELECT ss.id, ss.user_id FROM staff_schedules ss JOIN users staff ON staff.user_id=ss.user_id
             WHERE ss.id=$1 AND ss.is_available=TRUE AND ss.available_date=$2::date
               AND ss.available_date >= CURRENT_DATE AND $3::time >= ss.start_time AND $3::time < ss.end_time
               AND staff.role='admin' AND staff.is_active=TRUE FOR UPDATE OF ss`,
            [request.rows[0].requested_schedule_id, request.rows[0].requested_date, request.rows[0].requested_time]
        );
        if (!schedule.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'The requested schedule is no longer available' });
        }
        const slot = `${request.rows[0].requested_date} ${request.rows[0].requested_time}`;
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [`staff:${schedule.rows[0].user_id}`, slot]);
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [`student:${appointment.rows[0].user_id}`, slot]);
        const conflict = await client.query(
            `SELECT 1 FROM appointments a LEFT JOIN staff_schedules booked ON booked.id=a.schedule_id
             WHERE a.id<>$1 AND a.appointment_date=$2::date AND a.appointment_time=$3::time
               AND a.status IN ('pending', 'confirmed', 'checked_in', 'in_consultation')
               AND (booked.user_id=$4 OR a.user_id=$5) LIMIT 1`,
            [appointment.rows[0].id, request.rows[0].requested_date, request.rows[0].requested_time,
                schedule.rows[0].user_id, appointment.rows[0].user_id]
        );
        if (conflict.rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'The requested time has already been booked' });
        }
        const updatedAppointment = await client.query(
            `UPDATE appointments SET schedule_id=$1, appointment_date=$2, appointment_time=$3,
                updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *`,
            [schedule.rows[0].id, request.rows[0].requested_date, request.rows[0].requested_time, appointment.rows[0].id]
        );
        const { rows } = await client.query(
            `UPDATE appointment_reschedule_requests SET status='approved', reviewer_id=$1,
                review_reason=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3 RETURNING *`,
            [req.user.id, optionalText(reason), Number(req.params.id)]
        );
        await recordAppointmentEvent(client, {
            appointmentId: appointment.rows[0].id,
            eventType: 'rescheduled',
            previousStatus: appointment.rows[0].status,
            newStatus: appointment.rows[0].status,
            actorId: req.user.id,
            actorRole: req.user.role,
            metadata: { request_id: rows[0].id, to_date: request.rows[0].requested_date, to_time: request.rows[0].requested_time }
        });
        await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details)
            VALUES ($1, $2, 'appointment_rescheduled', $3)`,
        [req.user.id, req.user.role, JSON.stringify({ appointment_id: appointment.rows[0].id, request_id: rows[0].id })]);
        if (appointment.rows[0].user_id) await createNotification(client, {
            userId: appointment.rows[0].user_id, appointmentId: appointment.rows[0].id, type: 'reschedule_approved',
            title: 'Appointment time changed', message: 'Your reschedule request was approved. Check appointment details for the updated time.',
            dedupeKey: `reschedule-request:${rows[0].id}:approved:user:${appointment.rows[0].user_id}`
        });
        await client.query('COMMIT');
        res.json({ message: 'Reschedule request approved', request: rows[0], appointment: updatedAppointment.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        handleError(res, 'Reviewing reschedule request', error);
    } finally {
        client.release();
    }
});

// ========================================
// ADMIN: UPDATE APPOINTMENT STATUS
// ========================================

app.patch(
    '/api/admin/appointments/:id/status',
    authenticateToken,
    authorizeRole(['admin', 'super_admin']),
    async (req, res) => {
        const allowedStatuses = [
            'pending',
            'confirmed',
            'checked_in',
            'in_consultation',
            'completed',
            'cancelled',
            'rejected',
            'no_show'
        ];

        const { status, reason } = req.body || {};

        if (typeof status !== 'string' || !allowedStatuses.includes(status.toLowerCase())) {
            return res.status(400).json({
                error: 'Invalid status'
            });
        }
        if (status.toLowerCase() === 'checked_in') {
            return res.status(400).json({ error: 'Record attendance through the attendance workflow' });
        }
        if (status.toLowerCase() === 'rejected' && (!hasText(reason) || reason.trim().length > 1000)) {
            return res.status(400).json({ error: 'A rejection reason of up to 1000 characters is required' });
        }
        if (reason !== undefined && (typeof reason !== 'string' || reason.trim().length > 1000)) {
            return res.status(400).json({ error: 'Reason must be 1000 characters or fewer' });
        }

        const transitions = {
            pending: ['confirmed', 'cancelled', 'rejected'],
            confirmed: ['in_consultation', 'cancelled', 'no_show'],
            checked_in: ['in_consultation', 'cancelled', 'no_show'],
            in_consultation: ['completed'],
            completed: [], cancelled: [], rejected: [], no_show: []
        };
        if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Appointment ID is invalid' });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (status.toLowerCase() === 'in_consultation' && !await readClinicalPermission(client, req.user.id, 'can_document', true)) {
                await client.query('ROLLBACK');
                return res.status(403).json({ error: 'Clinical documentation permission is required to start a consultation' });
            }
            const existing = await client.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE', [Number(req.params.id)]);
            if (!existing.rows[0]) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Appointment not found' });
            }
            const previousStatus = String(existing.rows[0].status).toLowerCase();
            const nextStatus = status.toLowerCase();
            if (!transitions[previousStatus]?.includes(nextStatus)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: `Appointment cannot move from ${previousStatus} to ${nextStatus}` });
            }
            if (previousStatus === 'pending' && nextStatus === 'confirmed') {
                const booking = await client.query(
                    `SELECT a.id, a.user_id, a.schedule_id, a.appointment_type_id,
                            a.appointment_date::text AS appointment_date, a.appointment_time::text AS appointment_time,
                            t.duration_minutes, t.capacity_per_slot, ss.user_id AS staff_id,
                            ss.start_time::text AS start_time, ss.end_time::text AS end_time, ss.is_available
                     FROM appointments a JOIN appointment_types t ON t.id=a.appointment_type_id
                     JOIN staff_schedules ss ON ss.id=a.schedule_id WHERE a.id=$1 FOR UPDATE OF ss`, [existing.rows[0].id]
                );
                const slot = booking.rows[0];
                const isFutureDate = slot ? await client.query('SELECT $1::date>=CURRENT_DATE AS valid', [slot.appointment_date]) : null;
                if (!slot?.is_available || !isFutureDate?.rows[0]?.valid) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ error: 'The appointment schedule is no longer available' });
                }
                const start = timeToSeconds(slot.appointment_time);
                const duration = slot.duration_minutes * 60;
                if (start < timeToSeconds(slot.start_time) || start + duration > timeToSeconds(slot.end_time)
                    || (start - timeToSeconds(slot.start_time)) % duration !== 0
                    || !await validateClinicWindow(client, slot.appointment_date, slot.appointment_time, formatTime(start + duration), true)) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ error: 'The appointment time no longer fits the active clinic schedule' });
                }
                const exception = await client.query(
                    `SELECT start_time::text AS start_time, end_time::text AS end_time FROM staff_schedule_exceptions
                     WHERE is_active=TRUE AND start_date <= $1::date AND end_date >= $1::date AND (staff_id IS NULL OR staff_id=$2) FOR SHARE`,
                    [slot.appointment_date, slot.staff_id]
                );
                if (exception.rows.some(item => !item.start_time || (start < timeToSeconds(item.end_time) && start + duration > timeToSeconds(item.start_time)))) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ error: 'The appointment time is blocked by a clinic schedule exception' });
                }
                const clinicPolicy = await client.query('SELECT pending_requests_reserve_capacity FROM clinic_appointment_policy WHERE id=1 FOR SHARE');
                const occupancyConflict = await validateSlotOccupancy(client, {
                    scheduleId: slot.schedule_id, staffId: slot.staff_id, userId: slot.user_id,
                    appointmentTypeId: slot.appointment_type_id, date: slot.appointment_date,
                    time: slot.appointment_time, durationMinutes: slot.duration_minutes,
                    capacity: slot.capacity_per_slot,
                    pendingReserves: clinicPolicy.rows[0]?.pending_requests_reserve_capacity !== false,
                    ignoreAppointmentId: slot.id
                });
                if (occupancyConflict) {
                    await client.query('ROLLBACK');
                    return res.status(occupancyConflict.status).json({ error: occupancyConflict.error });
                }
            }
            if (nextStatus === 'in_consultation') {
                const attendance = await client.query("SELECT status FROM appointment_attendance WHERE appointment_id=$1 FOR SHARE", [existing.rows[0].id]);
                const queue = await client.query("SELECT id, status FROM clinic_waiting_queue WHERE appointment_id=$1 FOR UPDATE", [existing.rows[0].id]);
                if (!['checked_in', 'late'].includes(attendance.rows[0]?.status) || queue.rows[0]?.status !== 'called') {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ error: 'Record attendance and call the student from the waiting queue before starting consultation' });
                }
            }
            if (nextStatus === 'completed') {
                const record = await client.query("SELECT 1 FROM patient_records WHERE appointment_id=$1 AND record_status='finalized'", [existing.rows[0].id]);
                if (!record.rows[0]) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ error: 'Finalize the clinical record before completing the appointment' });
                }
            }
            const { rows } = await client.query(`UPDATE appointments SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`, [nextStatus, Number(req.params.id)]);
            if (nextStatus === 'in_consultation') {
                const queue = await client.query("UPDATE clinic_waiting_queue SET status='in_consultation', assigned_staff_id=$1 WHERE appointment_id=$2 AND status='called' RETURNING id, status", [req.user.id, rows[0].id]);
                await client.query(
                    `INSERT INTO clinic_waiting_queue_history (queue_entry_id, previous_status, new_status, actor_id, actor_role)
                     VALUES ($1, 'called', 'in_consultation', $2, $3)`, [queue.rows[0].id, req.user.id, req.user.role]
                );
            }
            await recordAppointmentEvent(client, {
                appointmentId: rows[0].id,
                previousStatus,
                newStatus: nextStatus,
                actorId: req.user.id,
                actorRole: req.user.role,
                reason: optionalText(reason)
            });
            await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, 'appointment_status_updated', $3)`,
                [req.user.id, req.user.role, JSON.stringify({ appointment_id: rows[0].id, status: nextStatus })]);
            if (rows[0].user_id) await createNotification(client, {
                userId: rows[0].user_id, appointmentId: rows[0].id, type: `appointment_${nextStatus}`,
                title: nextStatus === 'confirmed' ? 'Appointment confirmed' : nextStatus === 'rejected' ? 'Appointment request declined' : 'Appointment updated',
                message: `Your appointment status is now ${nextStatus.replace(/_/g, ' ')}. Open your appointment details for more information.`,
                dedupeKey: `appointment:${rows[0].id}:status:${nextStatus}:${String(rows[0].updated_at)}:user:${rows[0].user_id}`
            });
            if (['cancelled', 'rejected'].includes(nextStatus)) await notifyWaitlistForReleasedSlot(client, rows[0]);
            await client.query('COMMIT');
            res.json({ message: 'Appointment status updated', appointment: rows[0] });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            handleError(res, 'Updating appointment', error);
        } finally {
            client.release();
        }
    }
);

// ========================================
// ADMIN: RESCHEDULE APPOINTMENT
// ========================================

app.patch(
    '/api/admin/appointments/:id/reschedule',
    authenticateToken,
    authorizeRole(['admin', 'super_admin']),
    async (req, res) => {
        const { appointment_date, appointment_time } = req.body || {};

        if (!appointment_date || !appointment_time) {
            return res.status(400).json({
                error: 'New appointment date and time are required'
            });
        }

        if (!accountIdIsValid(req.params.id) || !isValidDateOnly(appointment_date) || !isValidTime(appointment_time)) {
            return res.status(400).json({ error: 'A valid appointment date and time are required' });
        }

        try {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const existing = await client.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE', [Number(req.params.id)]);
                if (!existing.rows[0]) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ error: 'Appointment not found' });
                }
                if (!['pending', 'confirmed'].includes(String(existing.rows[0].status).toLowerCase())) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ error: 'Only pending or confirmed appointments can be rescheduled' });
                }
                const schedule = await client.query(
                    `SELECT ss.id, ss.user_id
                     FROM staff_schedules ss JOIN users staff ON staff.user_id = ss.user_id
                     WHERE ss.is_available = TRUE AND ss.available_date = $1::date
                       AND ss.available_date >= CURRENT_DATE AND $2::time >= ss.start_time AND $2::time < ss.end_time
                       AND staff.role = 'admin' AND staff.is_active = TRUE
                     ORDER BY ss.id LIMIT 1 FOR UPDATE OF ss`,
                    [appointment_date, appointment_time]
                );
                if (!schedule.rows[0]) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'No available staff schedule matches that date and time' });
                }
                const validation = await validateProposalSlot(client, Number(req.params.id), undefined,
                    schedule.rows[0].id, appointment_date, appointment_time);
                if (validation.error) {
                    await client.query('ROLLBACK');
                    return res.status(validation.status).json({ error: validation.error });
                }
                const { rows } = await client.query(
                    `UPDATE appointments SET schedule_id=$1, appointment_date=$2, appointment_time=$3,
                        updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *`,
                    [schedule.rows[0].id, appointment_date, appointment_time, Number(req.params.id)]
                );
                await recordAppointmentEvent(client, {
                    appointmentId: rows[0].id,
                    eventType: 'rescheduled',
                    previousStatus: existing.rows[0].status,
                    newStatus: existing.rows[0].status,
                    actorId: req.user.id,
                    actorRole: req.user.role,
                    metadata: {
                        from_date: String(existing.rows[0].appointment_date).slice(0, 10),
                        from_time: String(existing.rows[0].appointment_time).slice(0, 8),
                        to_date: appointment_date,
                        to_time: appointment_time
                    }
                });
                await notifyWaitlistForReleasedSlot(client, existing.rows[0]);
                await client.query(
                    `INSERT INTO activity_logs (actor_id, actor_role, action, details)
                     VALUES ($1, $2, 'appointment_rescheduled', $3)`,
                    [req.user.id, req.user.role, JSON.stringify({ appointment_id: rows[0].id, appointment_date, appointment_time })]
                );
                await client.query('COMMIT');
                return res.json({ message: 'Appointment rescheduled successfully', appointment: rows[0] });
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                throw error;
            } finally {
                client.release();
            }
        } catch (error) {
            handleError(res, 'Rescheduling appointment', error);
        }
    }
);

// ========================================
// ADMIN: CREATE STAFF SCHEDULE
// ========================================

app.post(
    '/api/admin/schedules',
    authenticateToken,
    authorizeRole(['admin', 'super_admin']),
    async (req, res) => {
        const {
            available_date,
            start_time,
            end_time
        } = req.body || {};

        if (!isValidDateOnly(available_date) || !isValidTime(start_time) || !isValidTime(end_time)) {
            return res.status(400).json({
                error: 'Date, start time, and end time are required'
            });
        }

        if (end_time <= start_time) {
            return res.status(400).json({
                error: 'End time must be later than start time'
            });
        }

        try {
            const futureDate = await pool.query('SELECT $1::date >= CURRENT_DATE AS valid', [available_date]);
            if (!futureDate.rows[0].valid) return res.status(400).json({ error: 'Schedule date must be today or later' });
            if (!await validateClinicWindow(pool, available_date, start_time, end_time)) {
                return res.status(400).json({ error: 'Schedule must fall within the configured clinic operating hours' });
            }
            const overlap = await pool.query(
                `SELECT 1 FROM staff_schedules
                 WHERE user_id = $1 AND available_date = $2::date
                   AND start_time < $4::time AND end_time > $3::time
                 LIMIT 1`,
                [req.user.id, available_date, start_time, end_time]
            );
            if (overlap.rows.length) {
                return res.status(409).json({ error: 'This schedule overlaps another schedule for the same staff member' });
            }
            const { rows } = await pool.query(
                `INSERT INTO staff_schedules
                    (
                        user_id,
                        available_date,
                        start_time,
                        end_time
                    )
                 VALUES ($1, $2, $3, $4)
                 RETURNING *`,
                [
                    req.user.id,
                    available_date,
                    start_time,
                    end_time
                ]
            );

            await logActivity(
                req.user.id,
                req.user.role,
                'schedule_created',
                {
                    schedule_id: rows[0].id,
                    available_date
                }
            );

            res.status(201).json({
                message: 'Schedule added successfully',
                schedule: rows[0]
            });
        } catch (error) {
            handleError(res, 'Creating schedule', error);
        }
    }
);

// ========================================
// APPOINTMENT TYPES
// ========================================

app.get('/api/admin/clinic-hours', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT weekday, open_time::text AS open_time, close_time::text AS close_time, is_closed, updated_at FROM clinic_operating_hours ORDER BY weekday');
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching clinic hours', error);
    }
});

app.put('/api/admin/clinic-hours/:weekday', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const weekday = Number(req.params.weekday);
    const { open_time, close_time, is_closed } = req.body || {};
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || typeof is_closed !== 'boolean'
        || (!is_closed && (!isValidTime(open_time) || !isValidTime(close_time) || close_time <= open_time))) {
        return res.status(400).json({ error: 'Provide a weekday and valid opening hours, or mark the clinic closed' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `INSERT INTO clinic_operating_hours (weekday, open_time, close_time, is_closed, updated_by)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (weekday) DO UPDATE SET open_time=EXCLUDED.open_time, close_time=EXCLUDED.close_time,
                is_closed=EXCLUDED.is_closed, updated_by=EXCLUDED.updated_by, updated_at=CURRENT_TIMESTAMP
             RETURNING weekday, open_time::text AS open_time, close_time::text AS close_time, is_closed, updated_at`,
            [weekday, is_closed ? null : open_time, is_closed ? null : close_time, is_closed, req.user.id]
        );
        const affected = await client.query(
            `SELECT a.id, a.user_id, a.reference_number, a.appointment_date::text AS appointment_date,
                    a.appointment_time::text AS appointment_time, a.status,
                    s.first_name AS student_first_name, s.last_name AS student_last_name
             FROM appointments a
             LEFT JOIN appointment_types t ON t.id=a.appointment_type_id
             LEFT JOIN users s ON s.user_id=a.user_id
             WHERE EXTRACT(DOW FROM a.appointment_date)::int=$1
               AND a.status IN ('pending','confirmed','checked_in','in_consultation')
               AND ($2::boolean OR CASE WHEN t.duration_minutes IS NULL
                    THEN a.appointment_time < $3::time OR a.appointment_time >= $4::time
                    ELSE a.appointment_time < $3::time OR a.appointment_time + (t.duration_minutes * INTERVAL '1 minute') > $4::time END)
             ORDER BY a.appointment_date, a.appointment_time, a.id`,
            [weekday, is_closed, is_closed ? null : open_time, is_closed ? null : close_time]
        );
        for (const appointment of affected.rows) {
            if (!appointment.user_id) continue;
            await createNotification(client, {
                userId: appointment.user_id, appointmentId: appointment.id, type: 'schedule_change',
                title: 'A clinic schedule change may affect your appointment',
                message: 'The clinic recorded a schedule change that may affect your appointment. Check with clinic staff for details.',
                dedupeKey: `clinic-hours:${weekday}:${rows[0].updated_at}:appointment:${appointment.id}:user:${appointment.user_id}`
            });
        }
        await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, 'clinic_hours_updated', $3)`,
            [req.user.id, req.user.role, JSON.stringify({ weekday, is_closed, affected_appointments: affected.rows.length })]);
        await client.query('COMMIT');
        res.json({ clinic_hours: rows[0], affected_appointments: affected.rows });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        handleError(res, 'Updating clinic hours', error);
    } finally {
        client.release();
    }
});

app.get('/api/admin/schedule-exceptions', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT e.id, e.staff_id, e.kind, e.start_date::text AS start_date, e.end_date::text AS end_date,
                    e.start_time::text AS start_time, e.end_time::text AS end_time, e.reason, e.is_active,
                    e.created_by, e.created_at, u.first_name AS staff_first_name, u.last_name AS staff_last_name
             FROM staff_schedule_exceptions e LEFT JOIN users u ON u.user_id=e.staff_id
             WHERE ($1::boolean OR e.staff_id=$2 OR e.staff_id IS NULL)
             ORDER BY e.start_date, e.start_time NULLS FIRST, e.id`,
            [req.user.role === 'super_admin', req.user.id]
        );
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching schedule exceptions', error);
    }
});

app.post('/api/admin/schedule-exceptions', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const { kind, start_date, end_date, start_time, end_time, reason } = req.body || {};
    const staffId = Object.hasOwn(req.body, 'staff_id')
        ? (req.body.staff_id == null ? null : Number(req.body.staff_id))
        : (req.user.role === 'super_admin' ? null : req.user.id);
    const validStaffId = staffId === null || (accountIdIsValid(String(staffId))
        && (req.user.role === 'super_admin' || staffId === req.user.id));
    const hasTimes = start_time != null || end_time != null;
    if (!validStaffId || !['break', 'leave', 'closure', 'unavailable'].includes(kind)
        || !isValidDateOnly(start_date) || !isValidDateOnly(end_date) || end_date < start_date
        || (hasTimes && (!isValidTime(start_time) || !isValidTime(end_time) || end_time <= start_time))
        || typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
        return res.status(400).json({ error: 'Provide a valid date range, exception type, reason, and matching optional time range' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `INSERT INTO staff_schedule_exceptions
                (staff_id, kind, start_date, end_date, start_time, end_time, reason, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [staffId, kind, start_date, end_date, hasTimes ? start_time : null, hasTimes ? end_time : null, reason.trim(), req.user.id]
        );
        const affected = await client.query(
            `SELECT a.id, a.user_id, a.reference_number, a.appointment_date::text AS appointment_date,
                    a.appointment_time::text AS appointment_time, a.status,
                    s.first_name AS student_first_name, s.last_name AS student_last_name
             FROM appointments a
             LEFT JOIN staff_schedules ss ON ss.id=a.schedule_id
             LEFT JOIN appointment_types t ON t.id=a.appointment_type_id
             LEFT JOIN users s ON s.user_id=a.user_id
             WHERE a.appointment_date BETWEEN $1::date AND $2::date
               AND a.status IN ('pending','confirmed','checked_in','in_consultation')
               AND ($3::int IS NULL OR ss.user_id=$3)
               AND ($4::time IS NULL OR (a.appointment_time < $5::time AND
                    CASE WHEN t.duration_minutes IS NULL THEN a.appointment_time >= $4::time
                         ELSE a.appointment_time + (t.duration_minutes * INTERVAL '1 minute') > $4::time END))
             ORDER BY a.appointment_date, a.appointment_time, a.id`,
            [start_date, end_date, staffId, hasTimes ? start_time : null, hasTimes ? end_time : null]
        );
        for (const appointment of affected.rows) {
            if (!appointment.user_id) continue;
            await createNotification(client, {
                userId: appointment.user_id, appointmentId: appointment.id, type: 'schedule_change',
                title: 'A clinic schedule change may affect your appointment',
                message: 'The clinic recorded a schedule change that may affect your appointment. Check with clinic staff for details.',
                dedupeKey: `schedule-exception:${rows[0].id}:appointment:${appointment.id}:user:${appointment.user_id}`
            });
        }
        await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, 'schedule_exception_created', $3)`,
            [req.user.id, req.user.role, JSON.stringify({ exception_id: rows[0].id, kind, affected_appointments: affected.rows.length })]);
        await client.query('COMMIT');
        res.status(201).json({ exception: rows[0], affected_appointments: affected.rows });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        handleError(res, 'Creating schedule exception', error);
    } finally {
        client.release();
    }
});

app.patch('/api/admin/schedule-exceptions/:id', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    if (!accountIdIsValid(req.params.id) || typeof req.body?.is_active !== 'boolean') {
        return res.status(400).json({ error: 'Provide an exception id and active state' });
    }
    try {
        const { rows } = await pool.query(
            `UPDATE staff_schedule_exceptions SET is_active=$1
             WHERE id=$2 AND ($3::boolean OR created_by=$4) RETURNING *`,
            [req.body.is_active, Number(req.params.id), req.user.role === 'super_admin', req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Schedule exception not found' });
        await logActivity(req.user.id, req.user.role, 'schedule_exception_updated', { exception_id: rows[0].id, is_active: rows[0].is_active });
        res.json({ exception: rows[0] });
    } catch (error) {
        handleError(res, 'Updating schedule exception', error);
    }
});

const appointmentTypeFields = `id, name, description, duration_minutes, capacity_per_slot,
    requires_approval, required_information, scheduling_restrictions, is_active, created_by, created_at, updated_at`;
const validAppointmentType = (body) => typeof body?.name === 'string' && body.name.trim().length > 0 && body.name.trim().length <= 120
    && (body.description == null || (typeof body.description === 'string' && body.description.length <= 1000))
    && Number.isInteger(body.duration_minutes) && body.duration_minutes >= 5 && body.duration_minutes <= 480
    && (body.capacity_per_slot === undefined || (Number.isInteger(body.capacity_per_slot) && body.capacity_per_slot >= 1 && body.capacity_per_slot <= 100))
    && (body.requires_approval === undefined || typeof body.requires_approval === 'boolean')
    && (body.required_information === undefined || (Array.isArray(body.required_information) && body.required_information.every(field => typeof field === 'string' && field.trim() && field.length <= 80)))
    && (body.scheduling_restrictions === undefined || (body.scheduling_restrictions && typeof body.scheduling_restrictions === 'object' && !Array.isArray(body.scheduling_restrictions)));

app.get('/api/appointment-types', authenticateToken, authorizeRole(['student']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, name, description, duration_minutes, capacity_per_slot, requires_approval, required_information
             FROM appointment_types WHERE is_active = TRUE ORDER BY name`
        );
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching appointment types', error);
    }
});

app.get('/api/admin/appointment-types', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT ${appointmentTypeFields} FROM appointment_types ORDER BY name`);
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching appointment types', error);
    }
});

app.post('/api/admin/appointment-types', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const body = req.body || {};
    if (!validAppointmentType(body)) return res.status(400).json({ error: 'Provide a name, valid duration, and valid appointment type settings' });
    try {
        const { rows } = await pool.query(
            `INSERT INTO appointment_types
                (name, description, duration_minutes, capacity_per_slot, requires_approval, required_information, scheduling_restrictions, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING ${appointmentTypeFields}`,
            [body.name.trim(), optionalText(body.description), body.duration_minutes, body.capacity_per_slot ?? 1,
                body.requires_approval ?? true, JSON.stringify(body.required_information ?? []), JSON.stringify(body.scheduling_restrictions ?? {}), req.user.id]
        );
        await logActivity(req.user.id, req.user.role, 'appointment_type_created', { appointment_type_id: rows[0].id });
        res.status(201).json({ appointmentType: rows[0] });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'An appointment type with that name already exists' });
        handleError(res, 'Creating appointment type', error);
    }
});

app.patch('/api/admin/appointment-types/:id', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const { is_active } = req.body || {};
    if (!accountIdIsValid(req.params.id) || typeof is_active !== 'boolean') {
        return res.status(400).json({ error: 'A valid appointment type and availability value are required' });
    }
    try {
        const { rows } = await pool.query(
            `UPDATE appointment_types SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING ${appointmentTypeFields}`,
            [is_active, Number(req.params.id)]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Appointment type not found' });
        await logActivity(req.user.id, req.user.role, 'appointment_type_availability_updated', { appointment_type_id: rows[0].id, is_active });
        res.json({ appointmentType: rows[0] });
    } catch (error) {
        handleError(res, 'Updating appointment type', error);
    }
});

app.put('/api/admin/appointment-types/:id', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const body = req.body || {};
    if (!accountIdIsValid(req.params.id) || !validAppointmentType(body)) {
        return res.status(400).json({ error: 'Provide a name, valid duration, and valid appointment type settings' });
    }
    try {
        const { rows } = await pool.query(
            `UPDATE appointment_types SET name=$1, description=$2, duration_minutes=$3, capacity_per_slot=$4,
                requires_approval=$5, required_information=$6, scheduling_restrictions=$7,
                updated_at=CURRENT_TIMESTAMP WHERE id=$8 RETURNING ${appointmentTypeFields}`,
            [body.name.trim(), optionalText(body.description), body.duration_minutes, body.capacity_per_slot ?? 1,
                body.requires_approval ?? true, JSON.stringify(body.required_information ?? []), JSON.stringify(body.scheduling_restrictions ?? {}), Number(req.params.id)]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Appointment type not found' });
        await logActivity(req.user.id, req.user.role, 'appointment_type_updated', { appointment_type_id: rows[0].id });
        res.json({ appointmentType: rows[0] });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'An appointment type with that name already exists' });
        handleError(res, 'Updating appointment type', error);
    }
});

app.get('/api/available-slots', authenticateToken, authorizeRole(['student']), async (req, res) => {
    const { date, appointment_type_id, schedule_id } = req.query;
    if (!isValidDateOnly(date) || !accountIdIsValid(String(appointment_type_id ?? ''))
        || (schedule_id !== undefined && !accountIdIsValid(String(schedule_id)))) {
        return res.status(400).json({ error: 'Choose a valid date and appointment type' });
    }
    try {
        const typeResult = await pool.query(
            'SELECT duration_minutes, capacity_per_slot FROM appointment_types WHERE id=$1 AND is_active=TRUE',
            [Number(appointment_type_id)]
        );
        if (!typeResult.rows[0]) return res.status(400).json({ error: 'Choose an active appointment type' });
        const { duration_minutes: duration, capacity_per_slot: capacity } = typeResult.rows[0];
        const policy = await pool.query('SELECT pending_requests_reserve_capacity FROM clinic_appointment_policy WHERE id=1');
        const pendingReserves = policy.rows[0]?.pending_requests_reserve_capacity !== false;
        const clinicHours = await pool.query(
            'SELECT open_time::text AS open_time, close_time::text AS close_time, is_closed FROM clinic_operating_hours WHERE weekday=EXTRACT(DOW FROM $1::date)::int',
            [date]
        );
        if (clinicHours.rows[0]?.is_closed) return res.json([]);
        const schedules = await pool.query(
            `SELECT ss.id AS schedule_id, ss.user_id, ss.available_date::text AS date,
                    ss.start_time::text AS start_time, ss.end_time::text AS end_time,
                    u.first_name AS staff_first_name, u.last_name AS staff_last_name
             FROM staff_schedules ss JOIN users u ON u.user_id=ss.user_id
             WHERE ss.is_available=TRUE AND ss.available_date=$1::date AND ss.available_date>=CURRENT_DATE
               AND u.role='admin' AND u.is_active=TRUE AND ($2::int IS NULL OR ss.id=$2)
             ORDER BY ss.start_time, ss.id`,
            [date, schedule_id === undefined ? null : Number(schedule_id)]
        );
        if (!schedules.rows.length) return res.json([]);
        const exceptions = await pool.query(
            `SELECT staff_id, start_date::text AS start_date, end_date::text AS end_date,
                    start_time::text AS start_time, end_time::text AS end_time
             FROM staff_schedule_exceptions
             WHERE is_active=TRUE AND start_date <= $1::date AND end_date >= $1::date
               AND (staff_id IS NULL OR staff_id=ANY($2::int[]))`,
            [date, schedules.rows.map(row => row.user_id)]
        );
        const bookings = await pool.query(
            `SELECT a.schedule_id, a.user_id, a.appointment_type_id, a.appointment_time::text AS time,
                    a.status, ss.user_id AS staff_id, COALESCE(booked_type.duration_minutes, 30)::int AS duration_minutes
             FROM appointments a LEFT JOIN staff_schedules ss ON ss.id=a.schedule_id
             LEFT JOIN appointment_types booked_type ON booked_type.id=a.appointment_type_id
             WHERE a.appointment_date=$1::date AND a.status IN ('pending','confirmed','checked_in','in_consultation')
               AND (a.schedule_id=ANY($2::int[]) OR a.user_id=$3)`,
            [date, schedules.rows.map(row => row.schedule_id), req.user.id]
        );
        const slots = [];
        for (const schedule of schedules.rows) {
            const start = timeToSeconds(schedule.start_time);
            const end = timeToSeconds(schedule.end_time);
            for (let time = start; time + duration * 60 <= end; time += duration * 60) {
                const slotEnd = time + duration * 60;
                if (clinicHours.rows[0] && (time < timeToSeconds(clinicHours.rows[0].open_time)
                    || slotEnd > timeToSeconds(clinicHours.rows[0].close_time))) continue;
                const blocked = exceptions.rows.some(exception => {
                    if (exception.staff_id !== null && exception.staff_id !== schedule.user_id) return false;
                    if (!exception.start_time) return true;
                    return time < timeToSeconds(exception.end_time) && slotEnd > timeToSeconds(exception.start_time);
                });
                if (blocked) continue;
                const formatted = formatTime(time);
                const overlapping = bookings.rows.filter(booking => {
                    const bookedStart = timeToSeconds(booking.time);
                    const overlaps = bookedStart < slotEnd && bookedStart + booking.duration_minutes * 60 > time;
                    if (!overlaps) return false;
                    if (booking.user_id === req.user.id) return true;
                    if (booking.status === 'pending' && !pendingReserves) return false;
                    if (booking.staff_id !== schedule.user_id) return false;
                    return !(booking.schedule_id === schedule.schedule_id
                        && booking.appointment_type_id === Number(appointment_type_id)
                        && bookedStart === time);
                });
                if (overlapping.length) continue;
                const sameSlotBookings = bookings.rows.filter(booking => booking.schedule_id === schedule.schedule_id
                    && booking.appointment_type_id === Number(appointment_type_id)
                    && timeToSeconds(booking.time) === time
                    && (pendingReserves || booking.status !== 'pending')).length;
                const remaining = capacity - sameSlotBookings;
                if (remaining > 0) slots.push({
                    schedule_id: schedule.schedule_id, date: schedule.date,
                    start_time: schedule.start_time, end_time: schedule.end_time,
                    staff_first_name: schedule.staff_first_name, staff_last_name: schedule.staff_last_name,
                    time: formatted, remaining_capacity: remaining
                });
            }
        }
        res.json(slots);
    } catch (error) {
        handleError(res, 'Fetching available slots', error);
    }
});

// ========================================
// STUDENT: VIEW AVAILABLE SCHEDULES
// ========================================

app.get(
    '/api/schedules',
    authenticateToken,
    authorizeRole(['student']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT
                    ss.id,
                    ss.user_id,
                    ss.available_date::text AS available_date,
                    ss.start_time,
                    ss.end_time,
                    ss.is_available,
                    ad.first_name AS admin_first_name,
                    ad.last_name AS admin_last_name
                 FROM staff_schedules ss
                 JOIN users ad
                    ON ss.user_id = ad.user_id
                 WHERE ss.is_available = TRUE
                   AND ss.available_date >= CURRENT_DATE
                   AND ad.is_active = TRUE
                   AND ad.role = 'admin'
                 ORDER BY
                    ss.available_date,
                    ss.start_time`
            );

            res.json(rows);
        } catch (error) {
            handleError(res, 'Fetching schedules', error);
        }
    }
);

// ========================================
// ADMIN: VIEW ALL SCHEDULES
// ========================================

app.get(
    '/api/admin/schedules',
    authenticateToken,
    authorizeRole(['admin', 'super_admin']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT
                    ss.id,
                    ss.user_id,
                    ss.available_date::text AS available_date,
                    ss.start_time,
                    ss.end_time,
                    ss.is_available,
                    ad.first_name AS admin_first_name,
                    ad.last_name AS admin_last_name
                 FROM staff_schedules ss
                 JOIN users ad
                    ON ss.user_id = ad.user_id
                 ORDER BY
                    ss.available_date DESC,
                    ss.start_time`
            );

            res.json(rows);
        } catch (error) {
            handleError(res, 'Fetching schedules', error);
        }
    }
);

app.put('/api/admin/schedules/:id', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    const { available_date, start_time, end_time } = req.body || {};
    if (!accountIdIsValid(req.params.id) || !isValidDateOnly(available_date)
        || !isValidTime(start_time) || !isValidTime(end_time)
        || end_time <= start_time || (req.body.is_available !== undefined && typeof req.body.is_available !== 'boolean')) {
        return res.status(400).json({ error: 'Valid date, start time, and later end time are required' });
    }
    try {
        const futureDate = await pool.query('SELECT $1::date >= CURRENT_DATE AS valid', [available_date]);
        if (!futureDate.rows[0].valid) return res.status(400).json({ error: 'Schedule date must be today or later' });
        if (!await validateClinicWindow(pool, available_date, start_time, end_time)) {
            return res.status(400).json({ error: 'Schedule must fall within the configured clinic operating hours' });
        }
        const current = await pool.query(
            `SELECT user_id FROM staff_schedules WHERE id=$1 AND ($2::boolean OR user_id=$3)`,
            [Number(req.params.id), req.user.role === 'super_admin', req.user.id]
        );
        if (!current.rows[0]) {
            const exists = await pool.query('SELECT id FROM staff_schedules WHERE id=$1', [Number(req.params.id)]);
            return res.status(exists.rows[0] ? 403 : 404).json({ error: exists.rows[0] ? 'You cannot edit another staff member’s schedule' : 'Schedule not found' });
        }
        const overlap = await pool.query(
            `SELECT 1 FROM staff_schedules
             WHERE user_id=$1 AND available_date=$2::date AND id<>$3
               AND start_time < $5::time AND end_time > $4::time LIMIT 1`,
            [current.rows[0].user_id, available_date, Number(req.params.id), start_time, end_time]
        );
        if (overlap.rows.length) return res.status(409).json({ error: 'This schedule overlaps another schedule for the same staff member' });
        const affected = await pool.query(
            `SELECT a.id, a.reference_number, a.appointment_date::text AS appointment_date,
                    a.appointment_time::text AS appointment_time, a.status,
                    s.first_name AS student_first_name, s.last_name AS student_last_name
             FROM appointments a
             LEFT JOIN appointment_types t ON t.id=a.appointment_type_id
             LEFT JOIN users s ON s.user_id=a.user_id
             WHERE a.schedule_id=$1 AND a.status IN ('pending','confirmed','checked_in','in_consultation')
               AND ($2::boolean=FALSE OR a.appointment_date<>$3::date OR a.appointment_time<$4::time
                    OR CASE WHEN t.duration_minutes IS NULL THEN a.appointment_time >= $5::time
                         ELSE a.appointment_time + (t.duration_minutes * INTERVAL '1 minute') > $5::time
                              OR MOD(EXTRACT(EPOCH FROM (a.appointment_time-$4::time))::int, t.duration_minutes * 60)<>0 END)
             ORDER BY a.appointment_date, a.appointment_time, a.id`,
            [Number(req.params.id), req.body.is_available ?? true, available_date, start_time, end_time]
        );
        if (affected.rows.length) return res.status(409).json({
            error: `This change would affect ${affected.rows.length} appointment${affected.rows.length === 1 ? '' : 's'}. Review them and propose alternatives before editing the schedule.`,
            affected_appointments: affected.rows
        });
        const { rows } = await pool.query(`UPDATE staff_schedules SET available_date=$1, start_time=$2, end_time=$3,
                is_available=COALESCE($4, is_available)
            WHERE id=$5 AND ($6::boolean OR user_id=$7) RETURNING *`,
        [available_date, start_time, end_time, req.body.is_available ?? null, Number(req.params.id), req.user.role === 'super_admin', req.user.id]);
        if (!rows[0]) {
            const exists = await pool.query('SELECT id FROM staff_schedules WHERE id=$1', [Number(req.params.id)]);
            return res.status(exists.rows[0] ? 403 : 404).json({ error: exists.rows[0] ? 'You cannot edit another staff member’s schedule' : 'Schedule not found' });
        }
        await logActivity(req.user.id, req.user.role, 'schedule_updated', { schedule_id: rows[0].id, available_date });
        res.json({ message: 'Schedule updated successfully', schedule: rows[0] });
    } catch (error) {
        handleError(res, 'Updating schedule', error);
    }
});

app.patch('/api/admin/schedules/:id/availability', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    if (!accountIdIsValid(req.params.id) || typeof req.body?.is_available !== 'boolean') return res.status(400).json({ error: 'Availability must be true or false' });
    try {
        if (!req.body.is_available) {
            const affected = await pool.query(
                `SELECT a.id, a.reference_number, a.appointment_date::text AS appointment_date,
                        a.appointment_time::text AS appointment_time, a.status,
                        s.first_name AS student_first_name, s.last_name AS student_last_name
                 FROM appointments a LEFT JOIN users s ON s.user_id=a.user_id
                 WHERE a.schedule_id=$1 AND a.status IN ('pending','confirmed','checked_in','in_consultation')
                 ORDER BY a.appointment_date, a.appointment_time, a.id`, [Number(req.params.id)]
            );
            if (affected.rows.length) return res.status(409).json({
                error: `This schedule has ${affected.rows.length} appointment${affected.rows.length === 1 ? '' : 's'} that need review. Record an exception and contact affected students first.`,
                affected_appointments: affected.rows
            });
        }
        const { rows } = await pool.query(`UPDATE staff_schedules SET is_available=$1 WHERE id=$2 AND ($3::boolean OR user_id=$4) RETURNING *`,
            [req.body.is_available, Number(req.params.id), req.user.role === 'super_admin', req.user.id]);
        if (!rows[0]) {
            const exists = await pool.query('SELECT id FROM staff_schedules WHERE id=$1', [Number(req.params.id)]);
            return res.status(exists.rows[0] ? 403 : 404).json({ error: exists.rows[0] ? 'You cannot change another staff member’s schedule' : 'Schedule not found' });
        }
        await logActivity(req.user.id, req.user.role, 'schedule_availability_updated', { schedule_id: rows[0].id, is_available: rows[0].is_available });
        res.json({ message: 'Schedule availability updated', schedule: rows[0] });
    } catch (error) {
        handleError(res, 'Updating schedule availability', error);
    }
});

// ========================================
// ADMIN: PATIENT RECORDS PAGE STATS
// ========================================

app.get(
    '/api/admin/patient-records/stats',
    authenticateToken,
    authorizeRole(['admin', 'super_admin']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(`
                SELECT
                    (SELECT COUNT(*)::int
                     FROM users
                     WHERE role = 'student') AS "totalStudents",

                    (SELECT COUNT(DISTINCT user_id)::int
                     FROM patient_records) AS "withRecords",

                    (SELECT COUNT(*)::int
                     FROM users
                     WHERE role = 'student'
                       AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
                       AND created_at < DATE_TRUNC('month', CURRENT_DATE)
                                         + INTERVAL '1 month'
                    ) AS "newThisMonth"
            `);

            res.json({
                ...rows[0],
                activeConditions: 0
            });
        } catch (error) {
            handleError(res, 'Fetching patient record stats', error);
        }
    }
);

// ========================================
// ADMIN: PATIENT RECORDS STUDENT LIST
// ========================================

app.get(
    '/api/admin/patient-records/students',
    authenticateToken,
    authorizeRole(['admin', 'super_admin']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(`
                SELECT
                    s.user_id AS id,
                    s.student_number,
                    CONCAT_WS(' ', s.first_name, s.last_name)
                        AS full_name,
                    s.course,
                    s.year_level,
                    MAX(r.visit_date) AS last_visit,
                    COUNT(r.id)::int AS record_count
                FROM users s
                LEFT JOIN patient_records r
                    ON r.user_id = s.user_id
                WHERE s.role = 'student'
                GROUP BY
                    s.user_id,
                    s.student_number,
                    s.first_name,
                    s.last_name,
                    s.course,
                    s.year_level
                ORDER BY s.first_name ASC, s.last_name ASC
            `);

            res.json(rows);
        } catch (error) {
            handleError(res, 'Fetching patient record students', error);
        }
    }
);

// ========================================
// ADMIN: PATIENT RECORDS ACTIVITY
// ========================================

app.get(
    '/api/admin/patient-records/activity',
    authenticateToken,
    authorizeRole(['admin', 'super_admin']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(`
                SELECT id, actor_id, actor_role, action, created_at
                FROM activity_logs
                WHERE action IN (
                    'patient_record_created',
                    'student_registered',
                    'consultation_saved'
                )
                ORDER BY created_at DESC
                LIMIT 10
            `);

            res.json(rows);
        } catch (error) {
            handleError(res, 'Fetching patient record activity', error);
        }
    }
);

// ========================================
// ADMIN: STUDENT APPOINTMENT HISTORY
// ========================================

app.get(
    '/api/admin/patient-records/:id/history',
    authenticateToken,
    authorizeRole(['admin', 'super_admin']),
    async (req, res) => {
        try {
            if (!await readClinicalPermission(pool, req.user.id, 'can_view_records')) {
                return res.status(403).json({ error: 'Clinical record viewing permission is required' });
            }
            const { rows } = await pool.query(
                `SELECT 
                    a.id, 
                    a.appointment_date, 
                    a.appointment_time, 
                    a.reason, 
                    a.status, 
                    ad.first_name AS admin_first_name, 
                    ad.last_name AS admin_last_name,
                    pr.diagnosis_notes,
                    pr.consultation_notes
                 FROM appointments a
                 LEFT JOIN staff_schedules ss ON a.schedule_id = ss.id
                 LEFT JOIN users ad ON ss.user_id = ad.user_id
                 LEFT JOIN patient_records pr ON a.id = pr.appointment_id
                 WHERE a.user_id = $1
                 ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
                [req.params.id]
            );

            res.json(rows);
        } catch (error) {
            handleError(res, 'Fetching student appointment history', error);
        }
    }
);

app.get('/api/admin/students', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            "SELECT user_id as id, CONCAT(first_name, ' ', last_name) as full_name, student_number as school_id FROM users WHERE role = 'student' ORDER BY first_name ASC"
        );
        res.json(rows);
    } catch (err) {
        console.error("Error fetching students:", err);
        res.status(500).json({ error: 'Failed to fetch students list' });
    }
});

app.get(
    '/api/admin/records',
    authenticateToken,
    authorizeRole(['admin', 'super_admin']),
    async (req, res) => {
        try {
            if (!await readClinicalPermission(pool, req.user.id, 'can_view_records')) {
                return res.status(403).json({ error: 'Clinical record viewing permission is required' });
            }
            const { rows } = await pool.query(
                `SELECT
                    r.*,
                    s.student_number,
                    s.first_name AS student_first_name,
                    s.last_name AS student_last_name,
                    s.email AS student_email
                 FROM patient_records r
                 JOIN users s
                    ON r.user_id = s.user_id
                 ORDER BY r.visit_date DESC`
            );

            res.json(
                rows.map(row => ({
                    ...row,
                    student_name:
                        `${row.student_first_name} ${row.student_last_name}`.trim(),
                    school_id: row.student_number
                }))
            );
        } catch (error) {
            handleError(res, 'Fetching patient records', error);
        }
    }
);

// ========================================
// ADMIN: TRANSACTIONAL CONSULTATION WORKFLOW & RECORD CREATION
// ========================================

app.post(
    '/api/admin/records',
    authenticateToken,
    authorizeRole(['admin', 'super_admin']),
    async (req, res) => {
        const {
            user_id,
            appointment_id,
            visit_date,
            diagnosis_notes,
            consultation_notes,
            chief_complaint,
            history_of_present_illness,
            relevant_medical_history,
            vital_signs = {},
            clinical_assessment,
            diagnosis,
            treatment,
            medication_information,
            instructions,
            follow_up_recommendation,
            finalize
        } = req.body || {};

        const targetUserId = user_id;

        if (!accountIdIsValid(String(targetUserId ?? '')) || !accountIdIsValid(String(appointment_id ?? '')) || !isValidDateOnly(visit_date)
            || (diagnosis_notes !== undefined && diagnosis_notes !== null && typeof diagnosis_notes !== 'string')
            || (consultation_notes !== undefined && consultation_notes !== null && typeof consultation_notes !== 'string')
            || [chief_complaint, history_of_present_illness, relevant_medical_history, clinical_assessment, diagnosis,
                treatment, medication_information, instructions, follow_up_recommendation]
                .some(value => value !== undefined && value !== null && (typeof value !== 'string' || value.length > 10000))
            || !vital_signs || typeof vital_signs !== 'object' || Array.isArray(vital_signs)
            || (finalize !== undefined && typeof finalize !== 'boolean')) {
            return res.status(400).json({
                error: 'Student, appointment, and visit date are required'
            });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            if (!await readClinicalPermission(client, req.user.id, 'can_document', true)) {
                await client.query('ROLLBACK');
                return res.status(403).json({ error: 'Clinical documentation permission is required' });
            }
            if (finalize && !await readClinicalPermission(client, req.user.id, 'can_finalize', true)) {
                await client.query('ROLLBACK');
                return res.status(403).json({ error: 'Clinical record finalization permission is required' });
            }

            const apptCheck = await client.query(
                `SELECT id, user_id, status FROM appointments WHERE id = $1 AND user_id = $2 FOR UPDATE`,
                [appointment_id, targetUserId]
            );

            if (apptCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Invalid appointment mapping.' });
            }

            if (!['confirmed', 'checked_in', 'in_consultation', 'completed'].includes(String(apptCheck.rows[0].status).toLowerCase())) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'Clinical documentation can only be saved for an active consultation' });
            }

            if (finalize && !['in_consultation', 'completed'].includes(String(apptCheck.rows[0].status).toLowerCase())) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'Start the consultation before finalizing its clinical record' });
            }

            const existingRecord = await client.query('SELECT record_status FROM patient_records WHERE appointment_id=$1 FOR UPDATE', [appointment_id]);
            if (existingRecord.rows[0]?.record_status === 'finalized') {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'This record is finalized. Use the audited amendment workflow to correct it.' });
            }

            const recordRes = await client.query(
                `INSERT INTO patient_records
                    (user_id, appointment_id, visit_date, diagnosis_notes, consultation_notes, chief_complaint,
                     history_of_present_illness, relevant_medical_history, vital_signs, clinical_assessment, diagnosis,
                     treatment, medication_information, instructions, follow_up_recommendation, provider_id,
                     record_status, finalized_at, finalized_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16::integer,
                         CASE WHEN $17 THEN 'finalized' ELSE 'draft' END,
                         CASE WHEN $17 THEN CURRENT_TIMESTAMP ELSE NULL END,
                         CASE WHEN $17::boolean THEN $16::integer ELSE NULL::integer END)
                 ON CONFLICT (appointment_id) DO UPDATE SET
                    diagnosis_notes=EXCLUDED.diagnosis_notes, consultation_notes=EXCLUDED.consultation_notes,
                    visit_date=EXCLUDED.visit_date, chief_complaint=EXCLUDED.chief_complaint,
                    history_of_present_illness=EXCLUDED.history_of_present_illness,
                    relevant_medical_history=EXCLUDED.relevant_medical_history, vital_signs=EXCLUDED.vital_signs,
                    clinical_assessment=EXCLUDED.clinical_assessment, diagnosis=EXCLUDED.diagnosis,
                    treatment=EXCLUDED.treatment, medication_information=EXCLUDED.medication_information,
                    instructions=EXCLUDED.instructions, follow_up_recommendation=EXCLUDED.follow_up_recommendation,
                    provider_id=EXCLUDED.provider_id, record_status=EXCLUDED.record_status,
                    finalized_at=EXCLUDED.finalized_at, finalized_by=EXCLUDED.finalized_by
                 WHERE patient_records.record_status='draft'
                 RETURNING *`,
                [
                    targetUserId,
                    appointment_id,
                    visit_date,
                    diagnosis_notes || null,
                    consultation_notes || null,
                    chief_complaint || null,
                    history_of_present_illness || null,
                    relevant_medical_history || null,
                    JSON.stringify(vital_signs),
                    clinical_assessment || null,
                    diagnosis || diagnosis_notes || null,
                    treatment || null,
                    medication_information || null,
                    instructions || null,
                    follow_up_recommendation || null,
                    req.user.id,
                    Boolean(finalize)
                ]
            );

            if (!recordRes.rows[0]) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'This record is finalized. Use the audited amendment workflow to correct it.' });
            }

            if (finalize) {
                await client.query(
                    `UPDATE appointments SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                    [appointment_id]
                );
                if (String(apptCheck.rows[0].status).toLowerCase() !== 'completed') {
                    await recordAppointmentEvent(client, {
                        appointmentId: Number(appointment_id),
                        previousStatus: apptCheck.rows[0].status,
                        newStatus: 'completed',
                        actorId: req.user.id,
                        actorRole: req.user.role
                    });
                }
                const queued = await client.query("SELECT id, status FROM clinic_waiting_queue WHERE appointment_id=$1 AND status IN ('waiting','called','in_consultation') FOR UPDATE", [appointment_id]);
                if (queued.rows[0]) {
                    await client.query("UPDATE clinic_waiting_queue SET status='completed' WHERE id=$1", [queued.rows[0].id]);
                    await client.query(
                        `INSERT INTO clinic_waiting_queue_history (queue_entry_id, previous_status, new_status, actor_id, actor_role)
                         VALUES ($1, $2, 'completed', $3, $4)`, [queued.rows[0].id, queued.rows[0].status, req.user.id, req.user.role]
                    );
                }
                await createNotification(client, {
                    userId: apptCheck.rows[0].user_id, appointmentId: Number(appointment_id), type: 'record_finalized',
                    title: 'Consultation record available', message: 'Your clinic consultation record is available in Medical Records.',
                    dedupeKey: `record:${recordRes.rows[0].id}:finalized:user:${apptCheck.rows[0].user_id}`
                });
            }

            await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details)
                VALUES ($1, $2, 'consultation_saved', $3)`,
            [req.user.id, req.user.role, JSON.stringify({
                record_id: recordRes.rows[0].id,
                appointment_id,
                finalized: !!finalize
            })]);

            await client.query('COMMIT');

            res.status(201).json({
                message: finalize ? 'Consultation record finalized' : 'Consultation draft saved',
                record: recordRes.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            handleError(res, 'Saving consultation record', error);
        } finally {
            client.release();
        }
    }
);

app.get('/api/admin/records/:id/amendments', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Record ID is invalid' });
    if (!await readClinicalPermission(pool, req.user.id, 'can_view_records')) {
        return res.status(403).json({ error: 'Clinical record viewing permission is required' });
    }
    try {
        const { rows } = await pool.query(
            `SELECT id, record_id, previous_values, amended_values, reason, amended_by, created_at
             FROM patient_record_amendments WHERE record_id=$1 ORDER BY created_at, id`, [Number(req.params.id)]
        );
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching clinical record amendments', error);
    }
});

app.patch('/api/admin/records/:id/amend', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    if (!accountIdIsValid(req.params.id)) {
        return res.status(403).json({ error: 'Clinical record amendment permission is required' });
    }
    const { values, reason } = req.body || {};
    const fields = ['diagnosis_notes', 'consultation_notes', 'chief_complaint', 'history_of_present_illness',
        'relevant_medical_history', 'vital_signs', 'clinical_assessment', 'diagnosis', 'treatment',
        'medication_information', 'instructions', 'follow_up_recommendation'];
    if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length === 0
        || Object.keys(values).some(key => !fields.includes(key)) || typeof reason !== 'string' || !hasText(reason) || reason.trim().length > 1000
        || Object.entries(values).some(([key, value]) => key === 'vital_signs'
            ? !value || typeof value !== 'object' || Array.isArray(value)
            : value !== null && (typeof value !== 'string' || value.length > 10000))) {
        return res.status(400).json({ error: 'Provide clinical fields to amend and a non-empty reason' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (!await readClinicalPermission(client, req.user.id, 'can_finalize', true)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Clinical record amendment permission is required' });
        }
        const current = await client.query("SELECT * FROM patient_records WHERE id=$1 AND record_status='finalized' FOR UPDATE", [Number(req.params.id)]);
        if (!current.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Finalized clinical record not found' });
        }
        const previousValues = Object.fromEntries(Object.keys(values).map(key => [key, current.rows[0][key]]));
        const setClause = Object.keys(values).map((key, index) => `${key}=$${index + 1}${key === 'vital_signs' ? '::jsonb' : ''}`).join(', ');
        const params = Object.keys(values).map(key => key === 'vital_signs' ? JSON.stringify(values[key]) : values[key]);
        const { rows } = await client.query(
            `UPDATE patient_records SET ${setClause} WHERE id=$${params.length + 1} RETURNING *`, [...params, Number(req.params.id)]
        );
        await client.query(
            `INSERT INTO patient_record_amendments (record_id, previous_values, amended_values, reason, amended_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [rows[0].id, JSON.stringify(previousValues), JSON.stringify(values), reason.trim(), req.user.id]
        );
        await client.query(
            `INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, 'patient_record_amended', $3)`,
            [req.user.id, req.user.role, JSON.stringify({ record_id: rows[0].id, field_names: Object.keys(values), reason: reason.trim() })]
        );
        await client.query('COMMIT');
        res.json({ record: rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        handleError(res, 'Amending clinical record', error);
    } finally {
        client.release();
    }
});

// ========================================
// STUDENT: VIEW OWN MEDICAL RECORDS
// ========================================

app.post('/api/appointments/:id/follow-ups', authenticateToken, authorizeRole(['student']), async (req, res) => {
    if (!accountIdIsValid(req.params.id) || (req.body?.requested_date && !isValidDateOnly(req.body.requested_date))) {
        return res.status(400).json({ error: 'Provide a valid completed appointment and optional requested date' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const appointment = await client.query(
            `SELECT a.id, a.status, r.id AS record_id, r.follow_up_recommendation
             FROM appointments a JOIN patient_records r ON r.appointment_id=a.id
             WHERE a.id=$1 AND a.user_id=$2 AND a.status='completed' AND r.record_status='finalized' FOR SHARE OF a, r`,
            [Number(req.params.id), req.user.id]
        );
        if (!appointment.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Completed appointment record not found' });
        }
        const { rows } = await client.query(
            `INSERT INTO appointment_follow_ups (appointment_id, record_id, requested_by, recommendation, requested_date)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [appointment.rows[0].id, appointment.rows[0].record_id, req.user.id,
                appointment.rows[0].follow_up_recommendation, req.body?.requested_date || null]
        );
        const admins = await client.query("SELECT user_id FROM users WHERE role='admin' AND is_active=TRUE");
        for (const admin of admins.rows) await createNotification(client, {
            userId: admin.user_id, appointmentId: appointment.rows[0].id, type: 'follow_up_requested',
            title: 'Follow-up appointment requested', message: 'A student requested follow-up care. Review the request in Follow-ups.',
            dedupeKey: `follow-up:${rows[0].id}:admin:${admin.user_id}`
        });
        await client.query('COMMIT');
        res.status(201).json({ follow_up: rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') return res.status(409).json({ error: 'A follow-up request is already open for this appointment' });
        handleError(res, 'Requesting follow-up', error);
    } finally {
        client.release();
    }
});

app.get('/api/student/follow-ups', authenticateToken, authorizeRole(['student']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT f.id, f.appointment_id, f.record_id, f.recommendation, f.requested_date, f.status,
                    f.related_appointment_id, f.review_reason, f.created_at, a.reference_number
             FROM appointment_follow_ups f JOIN appointments a ON a.id=f.appointment_id
             WHERE f.requested_by=$1 ORDER BY f.created_at DESC, f.id DESC`, [req.user.id]
        );
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching follow-up requests', error);
    }
});

app.patch('/api/appointments/:appointmentId/follow-ups/:id/cancel', authenticateToken, authorizeRole(['student']), async (req, res) => {
    if (!accountIdIsValid(req.params.appointmentId) || !accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Follow-up request is invalid' });
    try {
        const { rows } = await pool.query(
            `UPDATE appointment_follow_ups SET status='cancelled', updated_at=CURRENT_TIMESTAMP
             WHERE id=$1 AND appointment_id=$2 AND requested_by=$3 AND status='requested' RETURNING *`,
            [Number(req.params.id), Number(req.params.appointmentId), req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Open follow-up request not found' });
        res.json({ follow_up: rows[0] });
    } catch (error) {
        handleError(res, 'Cancelling follow-up request', error);
    }
});

app.get('/api/admin/follow-ups', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    if (!await readClinicalPermission(pool, req.user.id, 'can_view_records')) return res.status(403).json({ error: 'Clinical record viewing permission is required' });
    const status = req.query.status;
    if (status && !['requested', 'scheduled', 'declined', 'completed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Follow-up status filter is invalid' });
    try {
        const { rows } = await pool.query(
            `SELECT f.*, a.reference_number, s.student_number, concat_ws(' ', s.first_name, s.last_name) AS student_name
             FROM appointment_follow_ups f JOIN appointments a ON a.id=f.appointment_id
             JOIN users s ON s.user_id=f.requested_by
             WHERE ($1::varchar IS NULL OR f.status=$1)
             ORDER BY (f.status='requested') DESC, f.created_at, f.id`, [status || null]
        );
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching follow-up requests', error);
    }
});

app.patch('/api/admin/follow-ups/:id', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    if (!await readClinicalPermission(pool, req.user.id, 'can_view_records')) return res.status(403).json({ error: 'Clinical record viewing permission is required' });
    const { status, related_appointment_id, reason } = req.body || {};
    if (!accountIdIsValid(req.params.id) || !['scheduled', 'declined'].includes(status)
        || (status === 'scheduled' && !accountIdIsValid(String(related_appointment_id ?? '')))
        || (reason !== undefined && (typeof reason !== 'string' || reason.length > 1000))
        || (status === 'declined' && !hasText(reason))) {
        return res.status(400).json({ error: 'Choose scheduled with an existing appointment, or declined with a reason' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const current = await client.query("SELECT * FROM appointment_follow_ups WHERE id=$1 AND status='requested' FOR UPDATE", [Number(req.params.id)]);
        if (!current.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Open follow-up request not found' });
        }
        if (status === 'scheduled') {
            const linked = await client.query(
                `SELECT id FROM appointments WHERE id=$1 AND user_id=$2 AND status IN ('pending','confirmed') AND id<>$3`,
                [Number(related_appointment_id), current.rows[0].requested_by, current.rows[0].appointment_id]
            );
            if (!linked.rows[0]) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Choose an existing pending or confirmed appointment owned by this student; follow-up never books automatically' });
            }
        }
        const { rows } = await client.query(
            `UPDATE appointment_follow_ups SET status=$1, related_appointment_id=$2, reviewed_by=$3,
                review_reason=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5 RETURNING *`,
            [status, status === 'scheduled' ? Number(related_appointment_id) : null, req.user.id,
                optionalText(reason), Number(req.params.id)]
        );
        await client.query(
            `INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, 'follow_up_reviewed', $3)`,
            [req.user.id, req.user.role, JSON.stringify({ follow_up_id: rows[0].id, appointment_id: rows[0].appointment_id, status, reason: optionalText(reason) })]
        );
        await createNotification(client, {
            userId: rows[0].requested_by, appointmentId: rows[0].appointment_id, type: `follow_up_${status}`,
            title: status === 'scheduled' ? 'Follow-up appointment linked' : 'Follow-up request declined',
            message: status === 'scheduled' ? 'The clinic linked your request to an existing appointment. View Appointments for details.' : 'The clinic declined your follow-up request.',
            dedupeKey: `follow-up:${rows[0].id}:${status}:student:${rows[0].requested_by}`
        });
        await client.query('COMMIT');
        res.json({ follow_up: rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        handleError(res, 'Reviewing follow-up request', error);
    } finally {
        client.release();
    }
});

app.get('/api/waitlist', authenticateToken, authorizeRole(['student']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT w.id, w.appointment_type_id, t.name AS appointment_type_name,
                    w.start_date::text AS start_date, w.end_date::text AS end_date,
                    w.preferred_start_time::text AS preferred_start_time, w.preferred_end_time::text AS preferred_end_time,
                    w.status, w.created_at, o.id AS offer_id, o.status AS offer_status,
                    a.appointment_date::text AS offered_date, a.appointment_time::text AS offered_time
             FROM appointment_waitlists w JOIN appointment_types t ON t.id=w.appointment_type_id
             LEFT JOIN appointment_waitlist_offers o ON o.waitlist_id=w.id AND o.status IN ('notified','accepted')
             LEFT JOIN appointments a ON a.id=o.appointment_id
             WHERE w.user_id=$1 ORDER BY w.created_at DESC, o.created_at DESC`, [req.user.id]
        );
        res.json(rows);
    } catch (error) {
        handleError(res, 'Fetching appointment waitlists', error);
    }
});

app.post('/api/waitlist', authenticateToken, authorizeRole(['student']), async (req, res) => {
    const { appointment_type_id, start_date, end_date, preferred_start_time, preferred_end_time } = req.body || {};
    const rangeDays = isValidDateOnly(start_date) && isValidDateOnly(end_date)
        ? (Date.parse(`${end_date}T00:00:00Z`) - Date.parse(`${start_date}T00:00:00Z`)) / 86400000 : null;
    if (!accountIdIsValid(String(appointment_type_id ?? '')) || rangeDays === null || rangeDays < 0 || rangeDays > 365
        || ((preferred_start_time || preferred_end_time) && (!isValidTime(preferred_start_time) || !isValidTime(preferred_end_time) || preferred_end_time <= preferred_start_time))) {
        return res.status(400).json({ error: 'Choose an active appointment type, a date range up to one year, and a complete optional time range' });
    }
    try {
        const activeType = await pool.query('SELECT id FROM appointment_types WHERE id=$1 AND is_active=TRUE', [Number(appointment_type_id)]);
        if (!activeType.rows[0]) return res.status(400).json({ error: 'Appointment type is not currently available' });
        const { rows } = await pool.query(
            `INSERT INTO appointment_waitlists (user_id, appointment_type_id, start_date, end_date, preferred_start_time, preferred_end_time)
             SELECT $1, $2, $3, $4, $5, $6 WHERE $3::date>=CURRENT_DATE RETURNING *`,
            [req.user.id, Number(appointment_type_id), start_date, end_date, preferred_start_time || null, preferred_end_time || null]
        );
        if (!rows[0]) return res.status(400).json({ error: 'Waitlist dates must start today or later' });
        res.status(201).json({ waitlist: rows[0] });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'An active waitlist entry already exists for this appointment type' });
        handleError(res, 'Joining appointment waitlist', error);
    }
});

app.patch('/api/waitlist/:id/close', authenticateToken, authorizeRole(['student']), async (req, res) => {
    if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Waitlist entry is invalid' });
    try {
        const { rows } = await pool.query(
            `UPDATE appointment_waitlists SET status='closed', updated_at=CURRENT_TIMESTAMP
             WHERE id=$1 AND user_id=$2 AND status IN ('active','notified') RETURNING *`, [Number(req.params.id), req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Open waitlist entry not found' });
        res.json({ waitlist: rows[0] });
    } catch (error) {
        handleError(res, 'Closing appointment waitlist entry', error);
    }
});

app.patch('/api/waitlist-offers/:id', authenticateToken, authorizeRole(['student']), async (req, res) => {
    const { decision } = req.body || {};
    if (!accountIdIsValid(req.params.id) || !['accepted', 'declined'].includes(decision)) return res.status(400).json({ error: 'Choose whether to accept or decline this slot notice' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const offer = await client.query(
            `SELECT o.id, o.status, o.waitlist_id, o.appointment_id, w.appointment_type_id,
                    a.appointment_date::text AS appointment_date, a.appointment_time::text AS appointment_time
             FROM appointment_waitlist_offers o JOIN appointment_waitlists w ON w.id=o.waitlist_id
             JOIN appointments a ON a.id=o.appointment_id
             WHERE o.id=$1 AND w.user_id=$2 FOR UPDATE OF o, w`, [Number(req.params.id), req.user.id]
        );
        if (!offer.rows[0] || offer.rows[0].status !== 'notified') {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Open slot notice not found' });
        }
        await client.query('UPDATE appointment_waitlist_offers SET status=$1, responded_at=CURRENT_TIMESTAMP WHERE id=$2', [decision, offer.rows[0].id]);
        if (decision === 'accepted') await client.query("UPDATE appointment_waitlists SET status='closed', updated_at=CURRENT_TIMESTAMP WHERE id=$1", [offer.rows[0].waitlist_id]);
        await client.query('COMMIT');
        res.json({ offer: { id: offer.rows[0].id, status: decision, appointment_id: offer.rows[0].appointment_id,
            appointment_type_id: offer.rows[0].appointment_type_id, date: offer.rows[0].appointment_date,
            time: offer.rows[0].appointment_time }, message: decision === 'accepted'
            ? 'Offer accepted. Continue through regular appointment booking; slot availability will be checked again.' : 'Offer declined.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        handleError(res, 'Responding to waitlist offer', error);
    } finally {
        client.release();
    }
});

app.get(
    '/api/records',
    authenticateToken,
    authorizeRole(['student']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT
                    r.id,
                    r.visit_date,
                    r.diagnosis_notes,
                    r.consultation_notes,
                    r.created_at,
                    r.appointment_id
                 FROM patient_records r
                 JOIN appointments a ON a.id=r.appointment_id
                 WHERE r.user_id = $1 AND r.record_status='finalized' AND a.status='completed'
                 ORDER BY r.visit_date DESC`,
                [req.user.id]
            );

            res.json(rows);
        } catch (error) {
            handleError(res, 'Fetching student medical records', error);
        }
    }
);

// ========================================
// ADMIN: SEARCH STUDENT BY STUDENT NUMBER
// ========================================

app.get(
    '/api/admin/users/search/:studentId',
    authenticateToken,
    authorizeRole(['admin', 'super_admin']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT
                    user_id AS id,
                    student_number,
                    first_name,
                    last_name,
                    email,
                    course,
                    year_level,
                    section,
                    contact_number
                 FROM users
                 WHERE student_number = $1 AND role = 'student'`,
                [req.params.studentId]
            );

            if (rows.length === 0) {
                return res.status(404).json({
                    error: 'Student not found'
                });
            }

            res.json({
                ...rows[0],
                id: rows[0].id,
                full_name: fullName(rows[0])
            });
        } catch (error) {
            handleError(res, 'Searching for student', error);
        }
    }
);

// ========================================
// SUPER ADMIN: DASHBOARD COUNTS
// ========================================

app.get(
    '/api/super-admin/dashboard',
    authenticateToken,
    authorizeRole(['super_admin']),
    async (req, res) => {
        try {
            const expectedAppointmentStatuses = [
                'pending', 'confirmed', 'checked_in', 'in_consultation',
                'completed', 'cancelled', 'rejected', 'no_show'
            ];
            const [accounts, statuses, records, logs] = await Promise.all([
                pool.query(`SELECT COUNT(*) FILTER (WHERE role='student')::int AS students,
                    COUNT(*) FILTER (WHERE role='admin')::int AS admins,
                    COUNT(*) FILTER (WHERE role='super_admin')::int AS super_admins,
                    COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active,
                    COUNT(*) FILTER (WHERE NOT is_active)::int AS inactive FROM users`),
                pool.query('SELECT status, COUNT(*)::int AS count FROM appointments GROUP BY status ORDER BY status'),
                pool.query(`SELECT COUNT(r.id)::int AS total, COUNT(a.id)::int AS associated_with_appointments
                    FROM patient_records r LEFT JOIN appointments a ON a.id=r.appointment_id`),
                pool.query('SELECT COUNT(*)::int AS count FROM activity_logs')
            ]);
            const counts = accounts.rows[0];
            const appointmentCounts = new Map(statuses.rows.map(row => [row.status, row.count]));
            const byStatus = expectedAppointmentStatuses.map(status => ({ status, count: appointmentCounts.get(status) || 0 }));
            const unexpectedStatuses = statuses.rows.filter(row => !expectedAppointmentStatuses.includes(row.status));
            res.json({
                accounts: { students: { total: counts.students }, admins: { total: counts.admins },
                    superAdmins: { total: counts.super_admins }, total: counts.total, active: counts.active, inactive: counts.inactive },
                appointments: {
                    total: statuses.rows.reduce((total, row) => total + row.count, 0),
                    byStatus,
                    unexpectedStatuses
                },
                patientRecords: records.rows[0],
                totalActivityLogs: logs.rows[0].count
            });
        } catch (error) {
            handleError(res, 'Fetching Super Admin dashboard', error);
        }
    }
);

app.get(
    '/api/super-admin/dashboard/analytics',
    authenticateToken,
    authorizeRole(['super_admin']),
    async (req, res) => {
        const period = req.query.period ?? '30d';
        if (!['7d', '30d'].includes(period)) {
            return res.status(400).json({ error: 'Period must be 7d or 30d' });
        }

        const days = Number.parseInt(period, 10);
        const expectedStatuses = [
            'pending', 'confirmed', 'checked_in', 'in_consultation',
            'completed', 'cancelled', 'rejected', 'no_show'
        ];
        try {
            const [statuses, trend] = await Promise.all([
                pool.query('SELECT status, COUNT(*)::int AS count FROM appointments GROUP BY status ORDER BY status'),
                pool.query(`SELECT TO_CHAR(days.day::date, 'YYYY-MM-DD') AS date, COUNT(a.id)::int AS count
                    FROM generate_series(CURRENT_DATE - (($1::int - 1) * INTERVAL '1 day'), CURRENT_DATE, INTERVAL '1 day') days(day)
                    LEFT JOIN appointments a ON a.appointment_date=days.day::date
                    GROUP BY days.day ORDER BY days.day`, [days])
            ]);
            const counts = new Map(statuses.rows.map(row => [row.status, row.count]));
            const statusDistribution = expectedStatuses.map(status => ({ status, count: counts.get(status) || 0 }));
            const unexpectedStatuses = statuses.rows.filter(row => !expectedStatuses.includes(row.status));
            statusDistribution.push(...unexpectedStatuses);
            res.json({
                period,
                distributionScope: 'all_appointments',
                statusDistribution,
                unexpectedStatuses,
                dailyAppointments: trend.rows
            });
        } catch (error) {
            handleError(res, 'Fetching Super Admin appointment analytics', error);
        }
    }
);

// ========================================
// SUPER ADMIN: VIEW STUDENTS
// ========================================

const accountEmailIsValid = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const accountIdIsValid = (value) => /^\d+$/.test(value) && Number(value) > 0;

const accountListQuery = (req, role) => {
    const values = [role];
    const filters = ['role = $1'];
    const add = (sql, value) => { values.push(value); filters.push(sql.replace('?', `$${values.length}`)); };
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (search) {
        values.push(`%${search}%`);
        const parameter = `$${values.length}`;
        filters.push(role === 'student'
            ? `(first_name ILIKE ${parameter} OR last_name ILIKE ${parameter} OR concat_ws(' ', first_name, last_name) ILIKE ${parameter} OR email ILIKE ${parameter} OR student_number ILIKE ${parameter})`
            : role === 'admin'
                ? `(first_name ILIKE ${parameter} OR last_name ILIKE ${parameter} OR concat_ws(' ', first_name, last_name) ILIKE ${parameter} OR email ILIKE ${parameter} OR position ILIKE ${parameter})`
                : `(first_name ILIKE ${parameter} OR last_name ILIKE ${parameter} OR concat_ws(' ', first_name, last_name) ILIKE ${parameter} OR email ILIKE ${parameter})`);
    }
    if (['active', 'inactive'].includes(req.query.status)) add('is_active = ?', req.query.status === 'active');
    if (role === 'student') {
        if (hasText(req.query.course)) add('course ILIKE ?', req.query.course.trim());
        if (hasText(req.query.year_level)) add('year_level ILIKE ?', req.query.year_level.trim());
    } else if (role === 'admin' && hasText(req.query.position)) add('position ILIKE ?', req.query.position.trim());
    return { values, where: filters.join(' AND ') };
};

const sendManagedAccountList = (role) => async (req, res) => {
    try {
        const { values, where } = accountListQuery(req, role);
        const { rows } = await pool.query(
            `SELECT user_id AS id, student_number, first_name, last_name, email, course, year_level, section,
                    position, contact_number, is_active, created_by, created_at, updated_at,
                    (SELECT NULLIF(BTRIM(CONCAT_WS(' ', creator.first_name, creator.last_name)), '')
                     FROM users creator WHERE creator.user_id=users.created_by) AS creator_name
             FROM users WHERE ${where} ORDER BY created_at DESC`, values);
        res.json(rows.map(row => ({ ...row, role, name: fullName(row), account_status: row.is_active ? 'active' : 'inactive' })));
    } catch (error) {
        handleError(res, `Fetching ${role} accounts`, error);
    }
};

const getManagedAccount = (role) => async (req, res) => {
    if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Account ID is invalid' });
    try {
        const { rows } = await pool.query(
            `SELECT u.user_id AS id, u.first_name, u.last_name, u.email, u.student_number, u.course, u.year_level,
                    u.section, u.position, u.contact_number, u.is_active, u.created_at, u.updated_at, u.created_by,
                    CASE WHEN creator.user_id IS NULL THEN NULL ELSE concat_ws(' ', creator.first_name, creator.last_name) END AS creator_name
             FROM users u LEFT JOIN users creator ON creator.user_id = u.created_by
             WHERE u.user_id = $1 AND u.role = $2`, [Number(req.params.id), role]);
        if (!rows[0]) return res.status(404).json({ error: 'Account not found' });
        res.json({ ...rows[0], role, name: fullName(rows[0]), account_status: rows[0].is_active ? 'active' : 'inactive' });
    } catch (error) {
        handleError(res, `Fetching ${role} profile`, error);
    }
};

const updateManagedAccount = (role) => async (req, res) => {
    if (!accountIdIsValid(req.params.id)) return res.status(400).json({ error: 'Account ID is invalid' });
    const body = req.body || {};
    const required = ['first_name', 'last_name', 'email'];
    if (required.some(key => !hasText(body[key])) || !accountEmailIsValid(body.email)) {
        return res.status(400).json({ error: 'First name, last name, and a valid email address are required' });
    }
    if (role === 'student' && !hasText(body.student_number)) return res.status(400).json({ error: 'Student number is required' });
    const values = [body.first_name.trim(), body.last_name.trim(), body.email.trim().toLowerCase()];
    let assignments = 'first_name=$1, last_name=$2, email=$3';
    if (role === 'student') {
        values.push(body.student_number.trim(), optionalText(body.course), optionalText(body.year_level), optionalText(body.section), optionalText(body.contact_number));
        assignments += ', student_number=$4, course=$5, year_level=$6, section=$7, contact_number=$8';
    } else if (role === 'admin') {
        values.push(optionalText(body.position), optionalText(body.contact_number));
        assignments += ', position=$4, contact_number=$5';
    } else {
        values.push(optionalText(body.contact_number));
        assignments += ', contact_number=$4';
    }
    values.push(Number(req.params.id));
    const idParameter = `$${values.length}`;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const existing = await client.query('SELECT user_id FROM users WHERE user_id=$1 AND role=$2 FOR UPDATE', [Number(req.params.id), role]);
        if (!existing.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Account not found' });
        }
        const updated = await client.query(
            `UPDATE users SET ${assignments}, updated_at=CURRENT_TIMESTAMP WHERE user_id=${idParameter} AND role='${role}'
             RETURNING user_id AS id, first_name, last_name, email, student_number, course, year_level, section,
                       position, contact_number, is_active, created_by, created_at, updated_at`, values);
        await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, $3, $4)`,
            [req.user.id, req.user.role, `${role}_updated`, JSON.stringify({ user_id: updated.rows[0].id })]);
        await client.query('COMMIT');
        res.json({ ...updated.rows[0], role, name: fullName(updated.rows[0]), account_status: updated.rows[0].is_active ? 'active' : 'inactive' });
    } catch (error) {
        await client?.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') return res.status(409).json({ error: role === 'student' ? 'Email or student number is already registered' : 'Email is already registered' });
        handleError(res, `Updating ${role} account`, error);
    } finally {
        client?.release();
    }
};

app.get('/api/super-admin/students', authenticateToken, authorizeRole(['super_admin']), sendManagedAccountList('student'));
app.get('/api/super-admin/students/:id', authenticateToken, authorizeRole(['super_admin']), getManagedAccount('student'));
app.put('/api/super-admin/students/:id', authenticateToken, authorizeRole(['super_admin']), updateManagedAccount('student'));
app.get('/api/super-admin/admins', authenticateToken, authorizeRole(['super_admin']), sendManagedAccountList('admin'));
app.get('/api/super-admin/admins/:id', authenticateToken, authorizeRole(['super_admin']), getManagedAccount('admin'));
app.put('/api/super-admin/admins/:id', authenticateToken, authorizeRole(['super_admin']), updateManagedAccount('admin'));
app.get('/api/super-admin/super-admins', authenticateToken, authorizeRole(['super_admin']), sendManagedAccountList('super_admin'));
app.get('/api/super-admin/super-admins/:id', authenticateToken, authorizeRole(['super_admin']), getManagedAccount('super_admin'));
app.put('/api/super-admin/super-admins/:id', authenticateToken, authorizeRole(['super_admin']), updateManagedAccount('super_admin'));

// ========================================
// SUPER ADMIN: VIEW STUDENTS AND ADMINS
// ========================================

app.get(
    '/api/super-admin/users',
    authenticateToken,
    authorizeRole(['super_admin']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT
                    user_id AS id,
                    student_number,
                    first_name,
                    last_name,
                    email,
                    role,
                    position,
                    contact_number,
                    is_active,
                    created_by,
                    created_at
                 FROM users
                 WHERE role IN ('student', 'admin', 'super_admin')
                 ORDER BY created_at DESC`
            );

            const accounts = rows.map(row => ({
                ...row,
                name: fullName(row),
                full_name: fullName(row),
                account_status: row.is_active ? 'active' : 'inactive'
            }));

            res.json(accounts);
        } catch (error) {
            handleError(res, 'Fetching accounts', error);
        }
    }
);

// ========================================
// SUPER ADMIN: CREATE ADMIN ACCOUNT
// ========================================

app.post(
    '/api/super-admin/admins',
    authenticateToken,
    authorizeRole(['super_admin']),
    async (req, res) => {
        const {
            first_name,
            last_name,
            full_name: providedFullName,
            email,
            password,
            position,
            contact_number
        } = req.body || {};

        const names = (hasText(first_name) && hasText(last_name))
            ? {
                first_name: first_name.trim(),
                last_name: last_name.trim()
            }
            : (() => {
                const parts = (hasText(providedFullName) ? providedFullName.trim() : '')
                    .split(/\s+/)
                    .filter(Boolean);

                return {
                    first_name: parts.shift() || '',
                    last_name: parts.join(' ')
                };
            })();

        if (
            !hasText(names.first_name) ||
            !hasText(names.last_name) ||
            !hasText(email) ||
            !accountEmailIsValid(email) ||
            typeof password !== 'string' ||
            password.length < 8 ||
            password !== req.body.password_confirmation
        ) {
            return res.status(400).json({
                error: 'First name, last name, email, and a password of at least 8 characters are required'
            });
        }

        let client;
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            client = await pool.connect();
            await client.query('BEGIN');
            const { rows } = await client.query(
                `INSERT INTO users
                    (
                        first_name,
                        last_name,
                        email,
                        password_hash,
                        role,
                        position,
                        contact_number,
                        created_by,
                        is_active
                    )
                 VALUES ($1, $2, $3, $4, 'admin', $5, $6, $7, TRUE)
                 RETURNING
                    user_id,
                    first_name,
                    last_name,
                    email,
                    role,
                    position,
                    contact_number,
                    is_active,
                    created_by,
                    created_at`,
                [
                    names.first_name,
                    names.last_name,
                    email.trim().toLowerCase(),
                    hashedPassword,
                    optionalText(position),
                    optionalText(contact_number),
                    req.user.id
                ]
            );

            await client.query(
                `INSERT INTO activity_logs (actor_id, actor_role, action, details) VALUES ($1, $2, 'admin_created', $3)`,
                [req.user.id, req.user.role, JSON.stringify({ user_id: rows[0].user_id, email: rows[0].email })]
            );
            await client.query('COMMIT');

            res.status(201).json({
                message: 'Clinic staff account created successfully',
                admin: {
                    ...rows[0],
                    id: rows[0].user_id,
                    name: fullName(rows[0])
                },
                user: {
                    ...rows[0],
                    id: rows[0].user_id,
                    full_name: fullName(rows[0])
                }
            });
        } catch (error) {
            await client?.query('ROLLBACK').catch(() => {});
            if (error.code === '23505') {
                return res.status(409).json({
                    error: 'Email is already registered'
                });
            }

            handleError(res, 'Creating admin account', error);
        } finally {
            client?.release();
        }
    }
);

app.post('/api/super-admin/super-admins', authenticateToken, authorizeRole(['super_admin']), async (req, res) => {
    const { first_name, last_name, email, password, password_confirmation, contact_number } = req.body || {};
    if (!hasText(first_name) || !hasText(last_name) || !accountEmailIsValid(email)
        || typeof password !== 'string' || password.length < 8 || password !== password_confirmation) {
        return res.status(400).json({ error: 'First name, last name, valid email, matching password confirmation, and a password of at least 8 characters are required' });
    }
    let client;
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        client = await pool.connect();
        await client.query('BEGIN');
        const { rows } = await client.query(
            `INSERT INTO users (first_name, last_name, email, password_hash, role, contact_number, is_active, created_by)
             VALUES ($1, $2, $3, $4, 'super_admin', $5, TRUE, $6)
             RETURNING user_id AS id, first_name, last_name, email, role, contact_number, is_active, created_by, created_at, updated_at`,
            [first_name.trim(), last_name.trim(), email.trim().toLowerCase(), passwordHash, optionalText(contact_number), req.user.id]);
        await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details)
            VALUES ($1, $2, 'super_admin_created', $3)`,
        [req.user.id, req.user.role, JSON.stringify({ user_id: rows[0].id, email: rows[0].email })]);
        await client.query('COMMIT');
        res.status(201).json({ message: 'Super Admin account created successfully', user: { ...rows[0], name: fullName(rows[0]) } });
    } catch (error) {
        await client?.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') return res.status(409).json({ error: 'Email is already registered' });
        handleError(res, 'Creating Super Admin account', error);
    } finally {
        client?.release();
    }
});

// ========================================
// SUPER ADMIN: UPDATE USER STATUS
// ========================================

app.patch(
    '/api/super-admin/users/:id/status',
    authenticateToken,
    authorizeRole(['super_admin']),
    async (req, res) => {
        const { account_status } = req.body || {};

        if (!['active', 'inactive'].includes(account_status) || !/^\d+$/.test(req.params.id)) {
            return res.status(400).json({
                error: 'Status must be active or inactive'
            });
        }

        try {
            if (Number(req.params.id) === req.user.id && account_status === 'inactive') {
                return res.status(400).json({ error: 'You cannot deactivate your own account' });
            }
            const client = await pool.connect();
            let account;
            try {
                await client.query('BEGIN');
                await client.query('SELECT pg_advisory_xact_lock($1, $2)', [24791, 1]);
                const found = await client.query('SELECT user_id, first_name, last_name, email, role, is_active FROM users WHERE user_id=$1 FOR UPDATE', [Number(req.params.id)]);
                account = found.rows[0];
                if (!account) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ error: 'Account not found' });
                }
                if (account_status === 'inactive' && account.is_active && account.role === 'super_admin') {
                    const activeCount = await client.query("SELECT COUNT(*)::int AS count FROM users WHERE role='super_admin' AND is_active=TRUE");
                    if (activeCount.rows[0].count <= 1) {
                        await client.query('ROLLBACK');
                        return res.status(409).json({ error: 'The last active Super Admin cannot be deactivated' });
                    }
                }
                const updated = await client.query(`UPDATE users SET is_active=$1, updated_at=CURRENT_TIMESTAMP
                    WHERE user_id=$2 RETURNING user_id AS id, first_name, last_name, email, role, is_active`,
                    [account_status === 'active', account.user_id]);
                account = updated.rows[0];
                await client.query(`INSERT INTO activity_logs (actor_id, actor_role, action, details)
                    VALUES ($1, $2, 'account_status_updated', $3)`, [req.user.id, req.user.role,
                    JSON.stringify({ account_id: account.id, role: account.role, account_status })]);
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                throw error;
            } finally {
                client.release();
            }

            res.json({
                message: 'Account status updated',
                user: {
                    ...account,
                    full_name: fullName(account),
                    account_status
                }
            });
        } catch (error) {
            handleError(res, 'Updating account status', error);
        }
    }
);

// ========================================
// ADMIN & SUPER ADMIN: ACTIVITY LOGS
// ========================================

const getActivityLogs = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT l.id, l.actor_id, l.actor_role, l.action, l.details, l.created_at,
                    COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
                        CASE WHEN l.actor_role='system' THEN 'System' ELSE 'Former Account' END) AS actor_name
             FROM activity_logs l LEFT JOIN users u ON u.user_id=l.actor_id
             WHERE l.actor_role <> 'super_admin'
             ORDER BY l.created_at DESC LIMIT 100`
        );

        const formatActionDescription = (action, details) => {
            switch (action) {
                case 'login': return 'User logged in';
                case 'student_registered': return `Student registered: ${details?.student_number || ''}`.trim();
                case 'appointment_booked': return `New appointment booked (ID: ${details?.appointment_id || ''})`.trim();
                case 'appointment_status_updated': return `Appointment status updated to ${details?.status || ''}`.trim();
                case 'appointment_cancelled': return `Appointment cancelled (ID: ${details?.appointment_id || ''})`.trim();
                case 'appointment_rescheduled': return `Appointment rescheduled to ${details?.appointment_date || ''}`.trim();
                case 'schedule_created': return `Staff availability added for ${details?.available_date || ''}`.trim();
                case 'consultation_saved': return `Consultation record documented (Appointment #${details?.appointment_id || ''})`.trim();
                case 'admin_created': return `Staff account created: ${details?.email || ''}`.trim();
                case 'account_status_updated': return `Account status changed to ${details?.account_status || ''}`.trim();
                default: return action.replace(/_/g, ' ');
            }
        };

        const formatted = rows.map(({ details, ...row }) => ({ ...row, description: formatActionDescription(row.action, details) }));

        res.json(formatted);
    } catch (error) {
        handleError(res, 'Fetching activity logs', error);
    }
};

app.get(
    '/api/admin/activity-logs',
    authenticateToken,
    authorizeRole(['admin', 'super_admin']),
    getActivityLogs
);

app.get(
    '/api/super-admin/activity-logs',
    authenticateToken,
    authorizeRole(['super_admin']),
    async (req, res) => {
        const requestedLimit = req.query.limit ?? '15';
        if (typeof requestedLimit !== 'string' || !/^\d+$/.test(requestedLimit)
            || Number(requestedLimit) < 1 || Number(requestedLimit) > 100) {
            return res.status(400).json({ error: 'Limit must be between 1 and 100' });
        }
        try {
            const { rows } = await pool.query(`WITH events AS (
                SELECT 'log-' || l.id::text AS id, l.actor_id, l.actor_role,
                    COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', actor.first_name, actor.last_name)), ''),
                        CASE WHEN l.actor_role='system' THEN 'System' ELSE 'Former Account' END) AS actor_name,
                    l.action, l.details, l.created_at,
                    target.user_id AS target_id,
                    NULLIF(BTRIM(CONCAT_WS(' ', target.first_name, target.last_name)), '') AS target_name,
                    target.email AS target_email, target.role AS target_role, target.is_active AS target_is_active
                FROM (SELECT * FROM activity_logs ORDER BY created_at DESC, id DESC LIMIT $1) l
                LEFT JOIN users actor ON actor.user_id=l.actor_id
                LEFT JOIN users target ON target.user_id::text=COALESCE(l.details->>'account_id', l.details->>'user_id')
                    OR (l.action='student_registered' AND target.student_number=l.details->>'student_number')
                    OR (l.action='super_admin_bootstrapped' AND target.email=l.details->>'email')
                UNION ALL
                SELECT 'registration-' || account.user_id::text, account.created_by,
                    COALESCE(creator.role, 'system'),
                    COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', creator.first_name, creator.last_name)), ''), 'System'),
                    'account_registered', jsonb_build_object('target_role', account.role), account.created_at,
                    account.user_id, NULLIF(BTRIM(CONCAT_WS(' ', account.first_name, account.last_name)), ''),
                    account.email, account.role, account.is_active
                FROM users account
                LEFT JOIN users creator ON creator.user_id=account.created_by
                WHERE NOT EXISTS (
                    SELECT 1 FROM activity_logs logged
                    WHERE (account.role='student' AND logged.action='student_registered'
                            AND logged.details->>'student_number'=account.student_number)
                       OR (account.role='admin' AND logged.action='admin_created'
                            AND logged.details->>'user_id'=account.user_id::text)
                       OR (account.role='super_admin' AND logged.action='super_admin_bootstrapped'
                            AND (logged.details->>'user_id'=account.user_id::text OR logged.details->>'email'=account.email))
                )
            )
            SELECT id, actor_id, actor_role, actor_name, action, details, created_at,
                target_id, target_name, target_email, target_role, target_is_active
            FROM events ORDER BY created_at DESC, id DESC LIMIT $1`, [Number(requestedLimit)]);

            const categories = {
                student_registered: 'account_registration', account_registered: 'account_registration',
                super_admin_bootstrapped: 'account_registration', admin_created: 'administrative',
                account_status_updated: 'administrative', schedule_created: 'administrative',
                appointment_booked: 'appointment', appointment_status_updated: 'appointment',
                appointment_cancelled: 'appointment', appointment_rescheduled: 'appointment',
                consultation_saved: 'patient_record'
            };
            const formatted = rows.map(row => {
                const details = row.details && typeof row.details === 'object' && !Array.isArray(row.details) ? row.details : {};
                const targetLabel = row.target_name || row.target_email || details.email || 'Account';
                const appointment = details.appointment_id ? ` (#${details.appointment_id})` : '';
                let description;
                switch (row.action) {
                    case 'student_registered': description = `Student account registered: ${targetLabel}`; break;
                    case 'account_registered': description = `${row.target_role || 'Account'} account registered: ${targetLabel}`; break;
                    case 'admin_created': description = `Clinic staff account created: ${targetLabel}`; break;
                    case 'super_admin_bootstrapped': description = `Super Admin account created: ${targetLabel}`; break;
                    case 'account_status_updated': description = `Account ${details.account_status === 'active' ? 'activated' : details.account_status === 'inactive' ? 'deactivated' : 'status updated'}: ${targetLabel}`; break;
                    case 'appointment_booked': description = `Appointment booked${appointment}`; break;
                    case 'appointment_status_updated': description = `Appointment status changed to ${details.status || 'updated'}${appointment}`; break;
                    case 'appointment_cancelled': description = `Appointment cancelled${appointment}`; break;
                    case 'appointment_rescheduled': description = `Appointment rescheduled${appointment}`; break;
                    case 'consultation_saved': description = `Patient record saved${appointment}`; break;
                    case 'schedule_created': description = 'Staff schedule created'; break;
                    case 'login': description = 'Account signed in'; break;
                    default: description = row.action.replace(/_/g, ' ');
                }
                const safeRow = { ...row };
                delete safeRow.details;
                return {
                    ...safeRow,
                    target_status: row.target_is_active === null ? null : row.target_is_active ? 'active' : 'inactive',
                    category: categories[row.action] || 'system',
                    description
                };
            });
            res.json(formatted);
        } catch (error) {
            handleError(res, 'Fetching Super Admin activity logs', error);
        }
    }
);

const processAppointmentAutomations = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const lock = await client.query("SELECT pg_try_advisory_xact_lock(hashtext('ccars-appointment-automation'), 1) AS acquired");
        if (!lock.rows[0].acquired) {
            await client.query('ROLLBACK');
            return;
        }
        const policyResult = await client.query('SELECT * FROM clinic_appointment_policy WHERE id=1 FOR SHARE');
        const policy = policyResult.rows[0];
        if (policy?.pending_expiration_minutes) {
            const pending = await client.query(
                `SELECT id, user_id, status, appointment_type_id, appointment_date, appointment_time
                 FROM appointments WHERE status='pending'
                   AND created_at <= CURRENT_TIMESTAMP::timestamp - ($1::int * INTERVAL '1 minute')
                 ORDER BY created_at, id LIMIT 100 FOR UPDATE SKIP LOCKED`, [policy.pending_expiration_minutes]
            );
            for (const appointment of pending.rows) {
                const { rows } = await client.query(
                    `UPDATE appointments SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`, [appointment.id]
                );
                await recordAppointmentEvent(client, { appointmentId: appointment.id, previousStatus: 'pending', newStatus: 'cancelled',
                    actorRole: 'system', reason: 'Pending request expired under clinic policy' });
                if (appointment.user_id) await createNotification(client, {
                    userId: appointment.user_id, appointmentId: appointment.id, type: 'appointment_request_expired',
                    title: 'Appointment request expired', message: 'Your pending request expired under the clinic appointment policy. You may submit a new request.',
                    dedupeKey: `appointment:${appointment.id}:expired:user:${appointment.user_id}`
                });
                await notifyWaitlistForReleasedSlot(client, rows[0]);
                await removeFromWaitingQueue(client, { appointmentId: appointment.id, actorRole: 'system', reason: 'Pending appointment expired' });
            }
        }
        if (policy?.reminder_offsets_minutes?.length && policy.clinic_timezone) {
            const due = await client.query(
                `SELECT a.id, a.user_id, a.appointment_date::text AS appointment_date,
                        a.appointment_time::text AS appointment_time, t.name AS type_name, offsets.minutes
                 FROM appointments a JOIN appointment_types t ON t.id=a.appointment_type_id
                 CROSS JOIN unnest($1::smallint[]) AS offsets(minutes)
                 WHERE a.status='confirmed' AND a.user_id IS NOT NULL
                   AND (((a.appointment_date+a.appointment_time) AT TIME ZONE $2)
                        - make_interval(mins=>offsets.minutes)) <= CURRENT_TIMESTAMP
                   AND (((a.appointment_date+a.appointment_time) AT TIME ZONE $2)
                        - make_interval(mins=>offsets.minutes)) > CURRENT_TIMESTAMP - INTERVAL '7 days'
                 ORDER BY a.id, offsets.minutes`, [policy.reminder_offsets_minutes, policy.clinic_timezone]
            );
            for (const appointment of due.rows) await createNotification(client, {
                userId: appointment.user_id, appointmentId: appointment.id, type: 'appointment_reminder',
                title: 'Appointment reminder',
                message: `Reminder: ${appointment.type_name} is scheduled for ${appointment.appointment_date} at ${appointment.appointment_time.slice(0, 5)}.`,
                dedupeKey: `appointment:${appointment.id}:reminder:${appointment.minutes}:user:${appointment.user_id}`
            });
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Appointment automation failed:', error.message);
    } finally { client.release(); }
};

// ========================================
// START SERVER
// ========================================

try {
    await pool.query('SELECT 1');

    console.log(
        `PostgreSQL connection successful: ${process.env.DB_NAME}`
    );

    const automationTimer = setInterval(() => { void processAppointmentAutomations(); }, 60_000);
    automationTimer.unref();
    void processAppointmentAutomations();

    app.listen(PORT, () => {
        console.log(
            `CCARS Backend running on http://localhost:${PORT}`
        );
    });
} catch (error) {
    console.error(
        'PostgreSQL connection failed:',
        error.message
    );

    process.exit(1);
}
