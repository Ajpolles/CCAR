import { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, CalendarCheck2, HeartPulse, ShieldCheck } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';

export default function Login() {
    const { login } = useContext(AuthContext);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async event => {
        event.preventDefault();
        setError('');
        setSubmitting(true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Login failed.');
            }
            login(data.token, data.role, data.name, data.userId);
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
                    <div className="auth-kicker"><HeartPulse size={15} /> Campus clinic, connected</div>
                    <h1>Care that fits your campus life.</h1>
                    <p>One simple place to request clinic appointments and stay up to date with your care.</p>
                    <div className="auth-feature-list">
                        <div className="auth-feature">
                            <span className="auth-feature-icon"><CalendarCheck2 size={15} /></span>
                            Book a clinic visit in just a few steps
                        </div>
                        <div className="auth-feature">
                            <span className="auth-feature-icon"><ShieldCheck size={15} /></span>
                            Keep your appointments in one secure place
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

                    <div className="auth-form-kicker">Welcome back</div>
                    <h2>Sign in to CCARS</h2>
                    <p className="auth-subtitle">Access your clinic appointments and account.</p>

                    {error && <div className="auth-error" role="alert">{error}</div>}

                    <form className="auth-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="login-email">Email address</label>
                            <input
                                id="login-email"
                                type="email"
                                autoComplete="email"
                                placeholder="you@school.edu"
                                value={email}
                                onChange={event => setEmail(event.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="login-password">Password</label>
                            <input
                                id="login-password"
                                type="password"
                                autoComplete="current-password"
                                placeholder="Enter your password"
                                value={password}
                                onChange={event => setPassword(event.target.value)}
                                required
                            />
                        </div>
                        <button className="btn-primary full" type="submit" disabled={submitting}>
                            {submitting ? 'Signing in…' : 'Sign in'}
                            {!submitting && <ArrowRight size={16} />}
                        </button>
                    </form>

                    <p className="auth-switch">
                        New to CCARS? <Link to="/register">Create a student account</Link>
                    </p>
                </div>
            </section>
        </main>
    );
}
