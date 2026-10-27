import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Activity,
    ArrowRight,
    CalendarCheck2,
    HeartPulse,
    ShieldCheck,
} from 'lucide-react';

const initialFormData = {
    student_number: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirmPassword: '',
    course: '',
    year_level: '1st Year',
    section: '',
    contact_number: '',
};

const Register = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState(initialFormData);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleChange = event => {
        setFormData(current => ({ ...current, [event.target.name]: event.target.value }));
    };

    const handleSubmit = async event => {
        event.preventDefault();
        setError('');

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    student_number: formData.student_number,
                    first_name: formData.first_name,
                    last_name: formData.last_name,
                    email: formData.email,
                    password: formData.password,
                    course: formData.course,
                    year_level: formData.year_level,
                    section: formData.section,
                    contact_number: formData.contact_number,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Registration failed.');
            }
            navigate('/', { state: { message: 'Registration successful! Please log in.' } });
        } catch (submitError) {
            setError(submitError.message || 'Unable to connect to the server. Make sure the backend is running.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="auth-page">
            <section className="auth-brand-panel">
                <div className="auth-brand-lockup">
                    <span className="brand-mark"><Activity size={21} strokeWidth={2.5} /></span>
                    <span>
                        <span className="brand-name">CCARS</span>
                        <span className="brand-caption">Campus care, made easy</span>
                    </span>
                </div>

                <div className="auth-brand-copy">
                    <div className="auth-kicker"><HeartPulse size={15} /> Your wellbeing matters</div>
                    <h1>A healthier campus starts with you.</h1>
                    <p>Create your student account to connect with your campus clinic and manage appointment requests.</p>
                    <div className="auth-feature-list">
                        <div className="auth-feature">
                            <span className="auth-feature-icon"><CalendarCheck2 size={15} /></span>
                            Request clinic appointments online
                        </div>
                        <div className="auth-feature">
                            <span className="auth-feature-icon"><ShieldCheck size={15} /></span>
                            View your visits from one secure portal
                        </div>
                    </div>
                </div>

                <div className="auth-footer">CCARS · Campus Clinic Appointment &amp; Records System</div>
            </section>

            <section className="auth-form-panel">
                <div className="auth-form-wrap">
                    <div className="auth-mobile-brand">
                        <span className="brand-mark"><Activity size={20} strokeWidth={2.5} /></span>
                        <span>
                            <span className="brand-name">CCARS</span>
                            <span className="brand-caption">Campus care, made easy</span>
                        </span>
                    </div>

                    <div className="auth-form-kicker">Student registration</div>
                    <h2>Create your account</h2>
                    <p className="auth-subtitle">A few details and you’ll be ready to get started.</p>

                    {error && <div className="auth-error" role="alert">{error}</div>}

                    <form className="auth-form register-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="register-student-number">Student number</label>
                            <input
                                id="register-student-number"
                                name="student_number"
                                type="text"
                                autoComplete="off"
                                value={formData.student_number}
                                onChange={handleChange}
                                required
                            />
                        </div>
                        <div className="form-grid">
                            <div className="form-group">
                                <label htmlFor="register-first-name">First name</label>
                                <input
                                    id="register-first-name"
                                    name="first_name"
                                    autoComplete="given-name"
                                    value={formData.first_name}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="register-last-name">Last name</label>
                                <input
                                    id="register-last-name"
                                    name="last_name"
                                    autoComplete="family-name"
                                    value={formData.last_name}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="register-email">Email address</label>
                            <input
                                id="register-email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                placeholder="you@school.edu"
                                value={formData.email}
                                onChange={handleChange}
                                required
                            />
                        </div>
                        <div className="form-grid">
                            <div className="form-group">
                                <label htmlFor="register-course">Course</label>
                                <input
                                    id="register-course"
                                    name="course"
                                    placeholder="e.g., BSCS"
                                    value={formData.course}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="register-year-level">Year level</label>
                                <select
                                    id="register-year-level"
                                    name="year_level"
                                    value={formData.year_level}
                                    onChange={handleChange}
                                    required
                                >
                                    <option value="1st Year">1st Year</option>
                                    <option value="2nd Year">2nd Year</option>
                                    <option value="3rd Year">3rd Year</option>
                                    <option value="4th Year">4th Year</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-grid">
                            <div className="form-group">
                                <label htmlFor="register-section">Section</label>
                                <input
                                    id="register-section"
                                    name="section"
                                    value={formData.section}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="register-contact">Contact number</label>
                                <input
                                    id="register-contact"
                                    name="contact_number"
                                    type="tel"
                                    autoComplete="tel"
                                    value={formData.contact_number}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                        </div>
                        <div className="form-grid">
                            <div className="form-group">
                                <label htmlFor="register-password">Password</label>
                                <input
                                    id="register-password"
                                    name="password"
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={8}
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="register-confirm-password">Confirm password</label>
                                <input
                                    id="register-confirm-password"
                                    name="confirmPassword"
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={8}
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                        </div>
                        <button className="btn-primary full" type="submit" disabled={submitting}>
                            {submitting ? 'Creating account…' : 'Create student account'}
                            {!submitting && <ArrowRight size={16} />}
                        </button>
                    </form>

                    <p className="auth-switch">
                        Already have an account? <Link to="/">Sign in</Link>
                    </p>
                </div>
            </section>
        </main>
    );
};

export default Register;
