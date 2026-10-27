-- 1. Students Table
CREATE TABLE students (
    student_id SERIAL PRIMARY KEY,
    student_number VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    course VARCHAR(100),
    year_level VARCHAR(20),
    section VARCHAR(20),
    contact_number VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. Super Admins Table
CREATE TABLE super_admins (
    super_admin_id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. Admins Table
CREATE TABLE admins (
    admin_id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    "position" VARCHAR(100),
    contact_number VARCHAR(20),
    created_by INTEGER REFERENCES super_admins(super_admin_id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. Staff Schedules Table
CREATE TABLE staff_schedules (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admins(admin_id),
    available_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT true NOT NULL,
    CONSTRAINT staff_schedules_check CHECK (end_time > start_time)
);

-- 5. Appointments Table
CREATE TABLE appointments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(student_id),
    schedule_id INTEGER REFERENCES staff_schedules(id) ON DELETE SET NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT appointments_status_check CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled'))
);

-- 6. Patient Records Table
CREATE TABLE patient_records (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(student_id),
    appointment_id INTEGER NOT NULL REFERENCES appointments(id),
    visit_date DATE NOT NULL,
    diagnosis_notes TEXT,
    consultation_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 7. Activity Logs Table
CREATE TABLE activity_logs (
    id SERIAL PRIMARY KEY,
    actor_id INTEGER,
    actor_role VARCHAR(20) NOT NULL,
    action VARCHAR(255) NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT activity_logs_actor_role_check CHECK (actor_role IN ('user', 'admin', 'super_admin', 'system'))
);

-- 8. Indexes for Performance Optimization
CREATE INDEX idx_activity_logs_actor ON activity_logs (actor_role, actor_id);
CREATE INDEX idx_appointments_date ON appointments (appointment_date);
CREATE INDEX idx_appointments_student ON appointments (student_id);
CREATE INDEX idx_patient_records_student ON patient_records (student_id);
CREATE INDEX idx_staff_schedules_admin_date ON staff_schedules (admin_id, available_date);