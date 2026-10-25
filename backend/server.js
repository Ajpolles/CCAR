import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT) || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

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

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            error: 'No token provided'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({
                error: 'Invalid or expired token'
            });
        }

        req.user = user;
        next();
    });
};

const authorizeRole = (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({
            error: 'Unauthorized access'
        });
    }

    next();
};

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
        await pool.query(
            `INSERT INTO activity_logs
                (actor_id, actor_role, action, details)
             VALUES ($1, $2, $3, $4)`,
            [
                actorId ?? null,
                actorRole || 'system',
                action,
                JSON.stringify(details)
            ]
        );
    } catch (error) {
        console.error('Activity log failed:', error.message);
    }
};

const fullName = (account) =>
    [account.first_name, account.last_name]
        .filter(Boolean)
        .join(' ');

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

app.post('/api/auth/register', async (req, res) => {
    const {
        student_number,
        student_id,
        first_name,
        last_name,
        email,
        password,
        course,
        year_level,
        section,
        contact_number
    } = req.body;

    const studentNumber = student_number ?? student_id;

    if (
        !studentNumber?.toString().trim() ||
        !first_name?.trim() ||
        !last_name?.trim() ||
        !email?.trim() ||
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
            `INSERT INTO students
                (
                    student_number,
                    first_name,
                    last_name,
                    email,
                    password_hash,
                    course,
                    year_level,
                    section,
                    contact_number
                )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING
                student_id,
                student_number,
                first_name,
                last_name,
                email,
                course,
                year_level,
                section,
                contact_number,
                created_at`,
            [
                studentNumber.toString().trim(),
                first_name.trim(),
                last_name.trim(),
                normalizedEmail,
                hashedPassword,
                course?.trim() || null,
                year_level?.toString().trim() || null,
                section?.trim() || null,
                contact_number?.trim() || null
            ]
        );

        await logActivity(
            rows[0].student_id,
            'user',
            'student_registered',
            {
                student_number: rows[0].student_number
            }
        );

        res.status(201).json({
            message: 'Student registered successfully',
            user: {
                ...rows[0],
                role: 'user',
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
// LOGIN FOR ALL THREE ACCOUNT TYPES
// ========================================

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

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

        const accountQueries = [
            {
                role: 'user',
                query: `
                    SELECT
                        student_id AS id,
                        first_name,
                        last_name,
                        email,
                        password_hash,
                        student_number,
                        TRUE AS is_active
                    FROM students
                    WHERE email = $1
                `
            },
            {
                role: 'admin',
                query: `
                    SELECT
                        admin_id AS id,
                        first_name,
                        last_name,
                        email,
                        password_hash,
                        is_active
                    FROM admins
                    WHERE email = $1
                `
            },
            {
                role: 'super_admin',
                query: `
                    SELECT
                        super_admin_id AS id,
                        first_name,
                        last_name,
                        email,
                        password_hash,
                        TRUE AS is_active
                    FROM super_admins
                    WHERE email = $1
                `
            }
        ];

        let account = null;
        let role = null;

        for (const item of accountQueries) {
            const result = await pool.query(
                item.query,
                [normalizedEmail]
            );

            if (result.rows.length > 0) {
                account = result.rows[0];
                role = item.role;
                break;
            }
        }

        if (!account) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        if (!account.is_active) {
            return res.status(403).json({
                error: 'Account is inactive'
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
                id: account.id,
                role,
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
            role,
            'login',
            {
                email: account.email
            }
        );

        res.json({
            token,
            role,
            name,
            userId: account.id,
            user: {
                id: account.id,
                role,
                name,
                email: account.email
            }
        });
    } catch (error) {
        handleError(res, 'Login', error);
    }
});

// ========================================
// STUDENT: VIEW OWN APPOINTMENTS
// ========================================

app.get(
    '/api/appointments',
    authenticateToken,
    authorizeRole(['user']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT
                    a.*,
                    ss.available_date,
                    ss.start_time,
                    ss.end_time,
                    ad.first_name AS admin_first_name,
                    ad.last_name AS admin_last_name
                 FROM appointments a
                 LEFT JOIN staff_schedules ss
                    ON a.schedule_id = ss.id
                 LEFT JOIN admins ad
                    ON ss.admin_id = ad.admin_id
                 WHERE a.student_id = $1
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

// ========================================
// STUDENT: BOOK APPOINTMENT
// ========================================

app.post(
    '/api/appointments',
    authenticateToken,
    authorizeRole(['user']),
    async (req, res) => {
        const {
            date,
            time,
            reason,
            schedule_id
        } = req.body;

        if (
            !date ||
            !time ||
            typeof reason !== 'string' ||
            !reason.trim()
        ) {
            return res.status(400).json({
                error: 'Date, time, and reason are required'
            });
        }

        try {
            if (schedule_id) {
                const schedule = await pool.query(
                    `SELECT id
                     FROM staff_schedules
                     WHERE id = $1
                       AND is_available = TRUE
                       AND available_date = $2
                       AND $3::time >= start_time
                       AND $3::time < end_time`,
                    [schedule_id, date, time]
                );

                if (schedule.rows.length === 0) {
                    return res.status(400).json({
                        error: 'Selected schedule is unavailable for that date or time'
                    });
                }
            }

            const { rows } = await pool.query(
                `INSERT INTO appointments
                    (
                        student_id,
                        schedule_id,
                        appointment_date,
                        appointment_time,
                        reason
                    )
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [
                    req.user.id,
                    schedule_id || null,
                    date,
                    time,
                    reason.trim()
                ]
            );

            await logActivity(
                req.user.id,
                'user',
                'appointment_booked',
                {
                    appointment_id: rows[0].id
                }
            );

            res.status(201).json({
                message: 'Appointment booked successfully',
                appointment: rows[0]
            });
        } catch (error) {
            handleError(res, 'Booking appointment', error);
        }
    }
);

// ========================================
// STUDENT: CANCEL APPOINTMENT
// ========================================

app.patch(
    '/api/appointments/:id/cancel',
    authenticateToken,
    authorizeRole(['user']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `UPDATE appointments
                 SET
                    status = 'cancelled',
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                   AND student_id = $2
                   AND status IN ('pending', 'confirmed')
                 RETURNING *`,
                [req.params.id, req.user.id]
            );

            if (rows.length === 0) {
                return res.status(404).json({
                    error: 'Appointment not found or cannot be cancelled'
                });
            }

            await logActivity(
                req.user.id,
                'user',
                'appointment_cancelled',
                {
                    appointment_id: rows[0].id
                }
            );

            res.json({
                message: 'Appointment cancelled',
                appointment: rows[0]
            });
        } catch (error) {
            handleError(res, 'Cancelling appointment', error);
        }
    }
);

// Fetch Student Profile
app.get('/api/student/profile', authenticateToken, authorizeRole(['user']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT student_number, first_name, last_name, email, course, year_level, section, contact_number FROM students WHERE student_id = $1', 
            [req.user.id]
        );
        
        if (rows.length === 0) return res.status(404).json({ error: 'Profile not found' });
        
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Fetch Student Medical Records
app.get('/api/student/records', authenticateToken, authorizeRole(['user']), async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT r.*, a.reason 
            FROM patient_records r 
            JOIN appointments a ON r.appointment_id = a.id 
            WHERE r.student_id = $1 
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
            const pending = await pool.query("SELECT COUNT(*) FROM appointments WHERE LOWER(status) = 'pending'");
            const todayApps = await pool.query("SELECT COUNT(*) FROM appointments WHERE appointment_date::date = CURRENT_DATE");
            const completed = await pool.query("SELECT COUNT(*) FROM appointments WHERE LOWER(status) = 'completed'");
            
            res.json({ 
                pending: parseInt(pending.rows[0].count || 0), 
                today: parseInt(todayApps.rows[0].count || 0), 
                completed: parseInt(completed.rows[0].count || 0) 
            });
        } catch (err) {
            console.error("Dashboard Stats Error:", err);
            res.status(500).json({ error: 'Failed to fetch stats' });
        }
    }
);

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
                    a.*,
                    s.student_number,
                    s.first_name AS student_first_name,
                    s.last_name AS student_last_name,
                    s.email AS student_email,
                    ss.admin_id,
                    ad.first_name AS admin_first_name,
                    ad.last_name AS admin_last_name
                 FROM appointments a
                 JOIN students s
                    ON a.student_id = s.student_id
                 LEFT JOIN staff_schedules ss
                    ON a.schedule_id = ss.id
                 LEFT JOIN admins ad
                    ON ss.admin_id = ad.admin_id
                 ORDER BY
                    a.appointment_date DESC,
                    a.appointment_time DESC`
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
            handleError(res, 'Fetching all appointments', error);
        }
    }
);

// ========================================
// ADMIN: UPDATE APPOINTMENT STATUS
// ========================================

app.patch(
    '/api/admin/appointments/:id/status',
    authenticateToken,
    authorizeRole(['admin']),
    async (req, res) => {
        const allowedStatuses = [
            'pending',
            'confirmed',
            'completed',
            'cancelled'
        ];

        const { status } = req.body;

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                error: 'Invalid status'
            });
        }

        try {
            const { rows } = await pool.query(
                `UPDATE appointments
                 SET
                    status = $1,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2
                 RETURNING *`,
                [status, req.params.id]
            );

            if (rows.length === 0) {
                return res.status(404).json({
                    error: 'Appointment not found'
                });
            }

            await logActivity(
                req.user.id,
                'admin',
                'appointment_status_updated',
                {
                    appointment_id: rows[0].id,
                    status
                }
            );

            res.json({
                message: 'Appointment status updated',
                appointment: rows[0]
            });
        } catch (error) {
            handleError(res, 'Updating appointment', error);
        }
    }
);

// ========================================
// ADMIN: CREATE STAFF SCHEDULE
// ========================================

app.post(
    '/api/admin/schedules',
    authenticateToken,
    authorizeRole(['admin']),
    async (req, res) => {
        const {
            available_date,
            start_time,
            end_time
        } = req.body;

        if (!available_date || !start_time || !end_time) {
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
            const { rows } = await pool.query(
                `INSERT INTO staff_schedules
                    (
                        admin_id,
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
                'admin',
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
// STUDENT: VIEW AVAILABLE SCHEDULES
// ========================================

app.get(
    '/api/schedules',
    authenticateToken,
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT
                    ss.*,
                    ad.first_name AS admin_first_name,
                    ad.last_name AS admin_last_name
                 FROM staff_schedules ss
                 JOIN admins ad
                    ON ss.admin_id = ad.admin_id
                 WHERE ss.is_available = TRUE
                   AND ss.available_date >= CURRENT_DATE
                   AND ad.is_active = TRUE
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
                    ss.*,
                    ad.first_name AS admin_first_name,
                    ad.last_name AS admin_last_name
                 FROM staff_schedules ss
                 JOIN admins ad
                    ON ss.admin_id = ad.admin_id
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

// ========================================
// ADMIN: VIEW PATIENT RECORDS
// ========================================
app.get('/api/admin/students', authenticateToken, authorizeRole(['admin', 'super_admin']), async (req, res) => {
    try {
        const { rows } = await pool.query(
            "SELECT student_id as id, CONCAT(first_name, ' ', last_name) as full_name, student_number as school_id FROM students ORDER BY first_name ASC"
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
    authorizeRole(['admin']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT
                    r.*,
                    s.student_number,
                    s.first_name AS student_first_name,
                    s.last_name AS student_last_name,
                    s.email AS student_email
                 FROM patient_records r
                 JOIN students s
                    ON r.student_id = s.student_id
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
// ADMIN: CREATE PATIENT RECORD
// ========================================

app.post(
    '/api/admin/records',
    authenticateToken,
    authorizeRole(['admin']),
    async (req, res) => {
        const {
            student_db_id,
            student_id,
            appointment_id,
            visit_date,
            diagnosis_notes,
            consultation_notes
        } = req.body;

        const selectedStudentId = student_db_id ?? student_id;

        if (!selectedStudentId || !appointment_id || !visit_date) {
            return res.status(400).json({
                error: 'Student, appointment, and visit date are required'
            });
        }

        try {
            const { rows } = await pool.query(
                `INSERT INTO patient_records
                    (
                        student_id,
                        appointment_id,
                        visit_date,
                        diagnosis_notes,
                        consultation_notes
                    )
                 SELECT
                    a.student_id,
                    a.id,
                    $3,
                    $4,
                    $5
                 FROM appointments a
                 WHERE a.id = $1
                   AND a.student_id = $2
                 RETURNING *`,
                [
                    appointment_id,
                    selectedStudentId,
                    visit_date,
                    diagnosis_notes || null,
                    consultation_notes || null
                ]
            );

            if (rows.length === 0) {
                return res.status(400).json({
                    error: 'Appointment does not belong to the selected student'
                });
            }

            await logActivity(
                req.user.id,
                'admin',
                'patient_record_created',
                {
                    record_id: rows[0].id,
                    appointment_id: rows[0].appointment_id
                }
            );

            res.status(201).json({
                message: 'Patient record saved successfully',
                record: rows[0]
            });
        } catch (error) {
            handleError(res, 'Creating patient record', error);
        }
    }
);

// ========================================
// STUDENT: VIEW OWN MEDICAL RECORDS
// ========================================

app.get(
    '/api/records',
    authenticateToken,
    authorizeRole(['user']),
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
                 WHERE r.student_id = $1
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
    authorizeRole(['admin']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT
                    student_id,
                    student_number,
                    first_name,
                    last_name,
                    email,
                    course,
                    year_level,
                    section,
                    contact_number
                 FROM students
                 WHERE student_number = $1`,
                [req.params.studentId]
            );

            if (rows.length === 0) {
                return res.status(404).json({
                    error: 'Student not found'
                });
            }

            res.json({
                ...rows[0],
                id: rows[0].student_id,
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
            const [
                students,
                admins,
                appointments,
                logs
            ] = await Promise.all([
                pool.query(
                    'SELECT COUNT(*)::int AS count FROM students'
                ),
                pool.query(
                    'SELECT COUNT(*)::int AS count FROM admins WHERE is_active = TRUE'
                ),
                pool.query(
                    'SELECT COUNT(*)::int AS count FROM appointments'
                ),
                pool.query(
                    'SELECT COUNT(*)::int AS count FROM activity_logs'
                )
            ]);

            res.json({
                totalStudents: students.rows[0].count,
                totalAdmins: admins.rows[0].count,
                totalAppointments: appointments.rows[0].count,
                totalActivityLogs: logs.rows[0].count
            });
        } catch (error) {
            handleError(res, 'Fetching Super Admin dashboard', error);
        }
    }
);

// ========================================
// SUPER ADMIN: VIEW STUDENTS
// ========================================

app.get(
    '/api/super-admin/students',
    authenticateToken,
    authorizeRole(['super_admin']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT
                    student_id,
                    student_number,
                    first_name,
                    last_name,
                    email,
                    course,
                    year_level,
                    section,
                    contact_number,
                    created_at
                 FROM students
                 ORDER BY created_at DESC`
            );

            res.json(
                rows.map(row => ({
                    ...row,
                    role: 'user',
                    name: fullName(row)
                }))
            );
        } catch (error) {
            handleError(res, 'Fetching students', error);
        }
    }
);

// ========================================
// SUPER ADMIN: VIEW STUDENTS AND ADMINS
// ========================================

app.get(
    '/api/super-admin/users',
    authenticateToken,
    authorizeRole(['super_admin']),
    async (req, res) => {
        try {
            const [students, admins] = await Promise.all([
                pool.query(
                    `SELECT
                        student_id AS id,
                        student_number,
                        first_name,
                        last_name,
                        email,
                        'user' AS role,
                        TRUE AS is_active,
                        created_at
                     FROM students`
                ),
                pool.query(
                    `SELECT
                        admin_id AS id,
                        NULL::varchar AS student_number,
                        first_name,
                        last_name,
                        email,
                        'admin' AS role,
                        is_active,
                        created_at
                     FROM admins`
                )
            ]);

            const accounts = [
                ...students.rows,
                ...admins.rows
            ].map(row => ({
                ...row,
                name: fullName(row),
                full_name: fullName(row),
                account_status: row.is_active ? 'active' : 'inactive'
            })).sort(
                (a, b) => new Date(b.created_at) - new Date(a.created_at)
            );

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
            full_name,
            email,
            password,
            position,
            contact_number
        } = req.body;

        const names = (first_name && last_name)
            ? {
                first_name: first_name.trim(),
                last_name: last_name.trim()
            }
            : (() => {
                const parts = (full_name || '')
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean);

                return {
                    first_name: parts.shift() || '',
                    last_name: parts.join(' ')
                };
            })();

        if (
            !names.first_name ||
            !names.last_name ||
            !email?.trim() ||
            typeof password !== 'string' ||
            password.length < 8
        ) {
            return res.status(400).json({
                error: 'First name, last name, email, and a password of at least 8 characters are required'
            });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);

            const { rows } = await pool.query(
                `INSERT INTO admins
                    (
                        first_name,
                        last_name,
                        email,
                        password_hash,
                        position,
                        contact_number,
                        created_by
                    )
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING
                    admin_id,
                    first_name,
                    last_name,
                    email,
                    position,
                    contact_number,
                    is_active,
                    created_at`,
                [
                    names.first_name,
                    names.last_name,
                    email.trim().toLowerCase(),
                    hashedPassword,
                    position?.trim() || null,
                    contact_number?.trim() || null,
                    req.user.id
                ]
            );

            await logActivity(
                req.user.id,
                'super_admin',
                'admin_created',
                {
                    admin_id: rows[0].admin_id,
                    email: rows[0].email
                }
            );

            res.status(201).json({
                message: 'Clinic staff account created successfully',
                admin: {
                    ...rows[0],
                    role: 'admin',
                    name: fullName(rows[0])
                },
                user: {
                    ...rows[0],
                    id: rows[0].admin_id,
                    role: 'admin',
                    full_name: fullName(rows[0])
                }
            });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(409).json({
                    error: 'Email is already registered for an admin'
                });
            }

            handleError(res, 'Creating admin account', error);
        }
    }
);

// ========================================
// SUPER ADMIN: UPDATE ADMIN STATUS
// ========================================

app.patch(
    '/api/super-admin/users/:id/status',
    authenticateToken,
    authorizeRole(['super_admin']),
    async (req, res) => {
        const { account_status, role } = req.body;

        if (!['active', 'inactive'].includes(account_status)) {
            return res.status(400).json({
                error: 'Status must be active or inactive'
            });
        }

        if (!['admin', 'user'].includes(role)) {
            return res.status(400).json({
                error: 'Specify role as "admin" or "user" when updating account status'
            });
        }

        try {
            let result;

            if (role === 'admin') {
                result = await pool.query(
                    `UPDATE admins
                     SET
                        is_active = $1,
                        updated_at = CURRENT_TIMESTAMP
                     WHERE admin_id = $2
                     RETURNING
                        admin_id AS id,
                        first_name,
                        last_name,
                        email,
                        is_active`,
                    [
                        account_status === 'active',
                        req.params.id
                    ]
                );
            } else {
                return res.status(400).json({
                    error: 'Student accounts do not currently have an active-status column in the database schema'
                });
            }

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'Account not found'
                });
            }

            await logActivity(
                req.user.id,
                'super_admin',
                'account_status_updated',
                {
                    account_id: Number(req.params.id),
                    role,
                    account_status
                }
            );

            res.json({
                message: 'Account status updated',
                user: {
                    ...result.rows[0],
                    role,
                    full_name: fullName(result.rows[0]),
                    account_status
                }
            });
        } catch (error) {
            handleError(res, 'Updating account status', error);
        }
    }
);

// ========================================
// SUPER ADMIN: ACTIVITY LOGS
// ========================================

app.get(
    '/api/super-admin/activity-logs',
    authenticateToken,
    authorizeRole(['super_admin']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT
                    id,
                    actor_id,
                    actor_role,
                    action,
                    details,
                    created_at
                 FROM activity_logs
                 ORDER BY created_at DESC
                 LIMIT 100`
            );

            res.json(rows);
        } catch (error) {
            handleError(res, 'Fetching activity logs', error);
        }
    }
);

// ========================================
// START SERVER
// ========================================

try {
    await pool.query('SELECT 1');

    console.log(
        `PostgreSQL connection successful: ${process.env.DB_NAME}`
    );

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