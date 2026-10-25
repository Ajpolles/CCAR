import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import './Dashboard.css';

export default function BookAppointment() {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    
    const [formData, setFormData] = useState({
        date: '',
        time: '',
        reason: ''
    });
    
    const [feedback, setFeedback] = useState({ error: '', success: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFeedback({ error: '', success: '' });
        setIsSubmitting(true);

        try {
            const res = await fetch('http://localhost:5000/api/appointments', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
                body: JSON.stringify(formData)
            });
            
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Failed to book appointment');
            
            setFeedback({ success: 'Appointment booked successfully! Redirecting...', error: '' });
            
            setTimeout(() => {
                navigate('/student/dashboard');
            }, 2000);
            
        } catch (err) {
            setFeedback({ error: err.message, success: '' });
            setIsSubmitting(false);
        }
    };

    const today = new Date().toISOString().split('T')[0];

    return (
        <div className="dashboard-container">
            <div className="form-card">
                <h2>Book a Clinic Appointment</h2>
                <p>Select your preferred date and time for a consultation.</p>
                
                {feedback.error && <div className="alert alert-error">{feedback.error}</div>}
                {feedback.success && <div className="alert alert-success">{feedback.success}</div>}
                
                <form onSubmit={handleSubmit} className="appointment-form">
                    <div className="form-group">
                        <label htmlFor="date">Date</label>
                        <input 
                            type="date" 
                            id="date" 
                            name="date" 
                            min={today}
                            value={formData.date} 
                            onChange={handleChange} 
                            required 
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="time">Time</label>
                        <input 
                            type="time" 
                            id="time" 
                            name="time" 
                            value={formData.time} 
                            onChange={handleChange} 
                            required 
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="reason">Reason for Visit / Symptoms</label>
                        <textarea 
                            id="reason" 
                            name="reason" 
                            rows="4"
                            placeholder="Please briefly describe why you need an appointment..."
                            value={formData.reason} 
                            onChange={handleChange} 
                            required 
                        />
                    </div>

                    <button type="submit" className="submit-btn" disabled={isSubmitting}>
                        {isSubmitting ? 'Booking...' : 'Confirm Appointment'}
                    </button>
                </form>
            </div>
        </div>
    );
}