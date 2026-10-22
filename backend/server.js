
import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

dotenv.config();

const { Pool } = pg;
const app = express();
const PORT = 5000;

if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing from .env');
}

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
        return res.status(401).json({ error: 'No token provided' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }

        req.user = user;
        next();
    });
};

const authorizeRole = (roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Unauthorized access' });
    }

    next();
};

const handleError = (res, label, error) => {
    console.error(`${label}:`, error.message);
    return res.status(500).json({ error: `${label} failed` });
};

app.get('/api/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT current_database() AS database');
        res.json({
            status: 'ok',
            database: result.rows[0].database
        });
    } catch (error) {
        handleError(res, 'Database health check', error);
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { student_id, full_name, email, password } = req.body;

    if (
        !student_id?.trim() ||
        !full_name?.trim() ||
        !email?.trim() ||
        typeof password !== 'string' ||
        password.length < 8
    ) {
        return res.status(400).json({
            error: 'Student ID, full name, email, and a password of at least 8 characters are required'
        });
    }

    try {
        const normalizedEmail = email.trim().toLowerCase();
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO users
             (student_id, full_name, email, password_hash, role)
             VALUES ($1, $2, $3, $4, 'user')
             RETURNING id, student_id, full_name, email, role`,
            [
                student_id.trim(),
                full_name.trim(),
                normalizedEmail,
                hashedPassword
            ]
        );

        res.status(201).json({
            message: 'Student registered successfully',
            user: result.rows[0]
        });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({
                error: 'Email or Student ID is already registered'
            });
        }

        handleError(res, 'Registration', error);
    }
});

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
        const { rows } = await pool.query(
            `SELECT id, student_id, full_name, email,
                    password_hash, role, account_status
             FROM users
             WHERE email = $1`,
            [email.trim().toLowerCase()]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        const user = rows[0];

        if (user.account_status !== 'active') {
            return res.status(403).json({
                error: 'Account is inactive'
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!validPassword) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
                name: user.full_name
            },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            token,
            role: user.role,
            name: user.full_name,
            userId: user.id
        });
    } catch (error) {
        handleError(res, 'Login', error);
    }
});

app.get(
    '/api/appointments',
    authenticateToken,
    authorizeRole(['user']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT *
                 FROM appointments
                 WHERE student_id = $1
                 ORDER BY appointment_date DESC, appointment_time DESC`,
                [req.user.id]
            );

            res.json(rows);
        } catch (error) {
            handleError(res, 'Fetching appointments', error);
        }
    }
);

app.post(
    '/api/appointments',
    authenticateToken,
    authorizeRole(['user']),
    async (req, res) => {
        const { date, time, reason, schedule_id } = req.body;

        if (!date || !time || typeof reason !== 'string' || !reason.trim()) {
            return res.status(400).json({
                error: 'Date, time, and reason are required'
            });
        }

        try {
            const { rows } = await pool.query(
                `INSERT INTO appointments
                 (student_id, schedule_id, appointment_date,
                  appointment_time, reason)
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

            res.status(201).json({
                message: 'Appointment booked successfully',
                appointment: rows[0]
            });
        } catch (error) {
            handleError(res, 'Booking appointment', error);
        }
    }
);

app.get(
    '/api/admin/appointments',
    authenticateToken,
    authorizeRole(['admin', 'super_admin']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT a.*, u.full_name AS student_name,
                        u.student_id AS school_id
                 FROM appointments a
                 JOIN users u ON a.student_id = u.id
                 ORDER BY a.appointment_date DESC,
                          a.appointment_time DESC`
            );

            res.json(rows);
        } catch (error) {
            handleError(res, 'Fetching all appointments', error);
        }
    }
);

app.patch(
    '/api/admin/appointments/:id/status',
    authenticateToken,
    authorizeRole(['admin']),
    async (req, res) => {
        const allowedStatuses = [
            'pending', 'confirmed', 'completed', 'cancelled'
        ];
        const { status } = req.body;

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        try {
            const { rows } = await pool.query(
                `UPDATE appointments
                 SET status = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2
                 RETURNING *`,
                [status, req.params.id]
            );

            if (rows.length === 0) {
                return res.status(404).json({
                    error: 'Appointment not found'
                });
            }

            res.json({
                message: 'Appointment status updated',
                appointment: rows[0]
            });
        } catch (error) {
            handleError(res, 'Updating appointment', error);
        }
    }
);

app.post(
    '/api/admin/schedules',
    authenticateToken,
    authorizeRole(['admin']),
    async (req, res) => {
        const { available_date, start_time, end_time } = req.body;

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
                 (staff_id, available_date, start_time, end_time)
                 VALUES ($1, $2, $3, $4)
                 RETURNING *`,
                [req.user.id, available_date, start_time, end_time]
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

app.get(
    '/api/admin/records',
    authenticateToken,
    authorizeRole(['admin']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT r.*, u.full_name AS student_name,
                        u.student_id AS school_id
                 FROM patient_records r
                 JOIN users u ON r.student_id = u.id
                 ORDER BY r.visit_date DESC`
            );

            res.json(rows);
        } catch (error) {
            handleError(res, 'Fetching patient records', error);
        }
    }
);

app.post(
    '/api/admin/records',
    authenticateToken,
    authorizeRole(['admin']),
    async (req, res) => {
        const {
            student_db_id,
            appointment_id,
            visit_date,
            diagnosis_notes,
            consultation_notes
        } = req.body;

        if (!student_db_id || !appointment_id || !visit_date) {
            return res.status(400).json({
                error: 'Student, appointment, and visit date are required'
            });
        }

        try {
            const { rows } = await pool.query(
                `INSERT INTO patient_records
                 (student_id, appointment_id, visit_date,
                  diagnosis_notes, consultation_notes)
                 SELECT a.student_id, a.id, $3, $4, $5
                 FROM appointments a
                 WHERE a.id = $1 AND a.student_id = $2
                 RETURNING *`,
                [
                    appointment_id,
                    student_db_id,
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

            res.status(201).json({
                message: 'Patient record saved successfully',
                record: rows[0]
            });
        } catch (error) {
            handleError(res, 'Creating patient record', error);
        }
    }
);

app.get(
    '/api/admin/users/search/:studentId',
    authenticateToken,
    authorizeRole(['admin']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT id, full_name, student_id
                 FROM users
                 WHERE student_id = $1`,
                [req.params.studentId]
            );

            if (rows.length === 0) {
                return res.status(404).json({
                    error: 'Student not found'
                });
            }

            res.json(rows[0]);
        } catch (error) {
            handleError(res, 'Searching for student', error);
        }
    }
);

app.get(
    '/api/super-admin/users',
    authenticateToken,
    authorizeRole(['super_admin']),
    async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT id, student_id, full_name, email,
                        role, account_status, created_at
                 FROM users
                 ORDER BY created_at DESC`
            );

            res.json(rows);
        } catch (error) {
            handleError(res, 'Fetching users', error);
        }
    }
);

app.post(
    '/api/super-admin/admins',
    authenticateToken,
    authorizeRole(['super_admin']),
    async (req, res) => {
        const { full_name, email, password } = req.body;

        if (
            !full_name?.trim() ||
            !email?.trim() ||
            typeof password !== 'string' ||
            password.length < 8
        ) {
            return res.status(400).json({
                error: 'Name, email, and a password of at least 8 characters are required'
            });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);

            const { rows } = await pool.query(
                `INSERT INTO users
                 (full_name, email, password_hash, role)
                 VALUES ($1, $2, $3, 'admin')
                 RETURNING id, full_name, email, role`,
                [
                    full_name.trim(),
                    email.trim().toLowerCase(),
                    hashedPassword
                ]
            );

            res.status(201).json({
                message: 'Clinic staff account created successfully',
                user: rows[0]
            });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(409).json({
                    error: 'Email is already registered'
                });
            }

            handleError(res, 'Creating admin account', error);
        }
    }
);

app.patch(
    '/api/super-admin/users/:id/status',
    authenticateToken,
    authorizeRole(['super_admin']),
    async (req, res) => {
        const { account_status } = req.body;

        if (!['active', 'inactive'].includes(account_status)) {
            return res.status(400).json({
                error: 'Status must be active or inactive'
            });
        }

        try {
            const { rows } = await pool.query(
                `UPDATE users
                 SET account_status = $1
                 WHERE id = $2
                 RETURNING id, full_name, email, role, account_status`,
                [account_status, req.params.id]
            );

            if (rows.length === 0) {
                return res.status(404).json({
                    error: 'User not found'
                });
            }

            res.json({
                message: 'Account status updated',
                user: rows[0]
            });
        } catch (error) {
            handleError(res, 'Updating account status', error);
        }
    }
);

try {
    await pool.query('SELECT 1');
    console.log(`PostgreSQL connection successful: ${process.env.DB_NAME}`);

    app.listen(PORT, () => {
        console.log(`CCARS Backend running on http://localhost:${PORT}`);
    });
} catch (error) {
    console.error('PostgreSQL connection failed:', error.message);
    process.exit(1);
}
