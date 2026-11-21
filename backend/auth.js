import jwt from 'jsonwebtoken';

export const createAuthenticateToken = (pool, jwtSecret) => async (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    let claims;
    try {
        claims = jwt.verify(token, jwtSecret);
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userId = claims.user_id ?? claims.id;
    if (!Number.isInteger(userId)) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    try {
        const { rows } = await pool.query(
            `SELECT user_id, role, is_active, first_name, last_name, email,
                    student_number, course, year_level, section,
                    position, contact_number
             FROM users WHERE user_id = $1`,
            [userId]
        );
        const account = rows[0];

        if (!account?.is_active) {
            return res.status(401).json({ error: 'Account is inactive or unavailable' });
        }

        req.user = {
            ...claims,
            id: account.user_id,
            user_id: account.user_id,
            role: account.role,
            name: [account.first_name, account.last_name].filter(Boolean).join(' '),
            email: account.email,
            student_number: account.student_number,
            course: account.course,
            year_level: account.year_level,
            section: account.section,
            position: account.position,
            contact_number: account.contact_number
        };
        next();
    } catch (error) {
        console.error('Authentication lookup failed:', error.message);
        return res.status(500).json({ error: 'Authentication failed' });
    }
};

export const authorizeRole = (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Unauthorized access' });
    }

    next();
};
