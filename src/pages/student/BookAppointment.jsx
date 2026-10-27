import { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    CalendarDays,
    CheckCircle2,
    Clock3,
    HeartPulse,
    Send,
} from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';

export default function BookAppointment() {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ date: '', time: '', reason: '' });
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const handleChange = event => {
        setFormData(current => ({ ...current, [event.target.name]: event.target.value }));
    };

    const handleSubmit = async event => {
        event.preventDefault();
        setMessage('');
        setIsError(false);
        setSubmitting(true);

        try {
            const response = await fetch('/api/appointments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${user.token}`,
                },
                body: JSON.stringify(formData),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to request an appointment.');
            }

            setMessage('Your appointment request has been sent.');
            window.setTimeout(() => navigate('/student/dashboard'), 1500);
        } catch (error) {
            setIsError(true);
            setMessage(error.message || 'Unable to connect to the server.');
        } finally {
            setSubmitting(false);
        }
    };

    const today = new Date().toISOString().slice(0, 10);

    return (
        <div className="booking-page">
            <div className="page-heading">
                <Link className="text-link" to="/student/dashboard">
                    <ArrowLeft size={15} /> Back to dashboard
                </Link>
                <h1>Book an appointment</h1>
                <p>Choose a time that works for you. The clinic will review and confirm your request.</p>
            </div>

            <section className="card form-card">
                <div className="form-card-heading">
                    <div className="stat-icon mint"><HeartPulse size={19} /></div>
                    <div>
                        <h2>Appointment details</h2>
                        <p>All fields are required to submit your request.</p>
                    </div>
                </div>

                {message && (
                    <div className={`form-message${isError ? '' : ' success'}`} role={isError ? 'alert' : 'status'}>
                        {isError ? null : <CheckCircle2 size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />}
                        {message}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-group">
                            <label htmlFor="appointment-date">Preferred date</label>
                            <input
                                id="appointment-date"
                                name="date"
                                type="date"
                                min={today}
                                value={formData.date}
                                onChange={handleChange}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="appointment-time">Preferred time</label>
                            <input
                                id="appointment-time"
                                name="time"
                                type="time"
                                value={formData.time}
                                onChange={handleChange}
                                required
                            />
                        </div>
                        <div className="form-group full-width">
                            <label htmlFor="appointment-reason">Reason for visit</label>
                            <textarea
                                id="appointment-reason"
                                name="reason"
                                rows="4"
                                placeholder="Briefly describe what you’d like help with"
                                value={formData.reason}
                                onChange={handleChange}
                                required
                            />
                        </div>
                    </div>
                    <button className="btn-primary" type="submit" disabled={submitting}>
                        <Send size={15} />
                        {submitting ? 'Sending request…' : 'Submit appointment request'}
                    </button>
                </form>
            </section>

            <aside className="booking-note">
                <div className="stat-icon blue"><Clock3 size={18} /></div>
                <p><strong>What happens next?</strong><br />Your request will appear on the dashboard while the clinic reviews it.</p>
                <CalendarDays className="booking-note-decoration" size={24} />
            </aside>
        </div>
    );
}
