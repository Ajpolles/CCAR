CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    student_id VARCHAR(50) UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user'
        CHECK (role IN ('user', 'admin', 'super_admin')),
    account_status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (account_status IN ('active', 'inactive')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_schedules (
    id SERIAL PRIMARY KEY,
    staff_id INTEGER NOT NULL REFERENCES users(id),
    available_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id),
    schedule_id INTEGER REFERENCES staff_schedules(id),
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patient_records (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id),
    appointment_id INTEGER NOT NULL REFERENCES appointments(id),
    visit_date DATE NOT NULL,
    diagnosis_notes TEXT,
    consultation_notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appointments_student
    ON appointments(student_id);

CREATE INDEX IF NOT EXISTS idx_appointments_date
    ON appointments(appointment_date);

CREATE INDEX IF NOT EXISTS idx_patient_records_student
    ON patient_records(student_id);
