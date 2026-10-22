import React, { useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const BookAppointment = () => {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ date: '', time: '', reason: '' });
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('http://localhost:5000/api/appointments', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                setMessage('Appointment requested successfully!');
                setTimeout(() => navigate('/student/dashboard'), 1500);
            } else {
                setMessage('Failed to book appointment.');
            }
        } catch (err) {
            setMessage('Server error.');
        }
    };

    return (
        <div>
            <h2>Book an Appointment</h2>
            <div className="card" style={{ marginTop: '20px', maxWidth: '500px' }}>
                {message && <p style={{ color: 'green', marginBottom: '10px' }}>{message}</p>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Preferred Date</label>
                        <input type="date" required onChange={e => setFormData({...formData, date: e.target.value})} />
                    </div>
                    <div className="form-group">
                        <label>Preferred Time</label>
                        <input type="time" required onChange={e => setFormData({...formData, time: e.target.value})} />
                    </div>
                    <div className="form-group">
                        <label>Reason for Consultation</label>
                        <textarea rows="4" required onChange={e => setFormData({...formData, reason: e.target.value})}></textarea>
                    </div>
                    <button type="submit" className="btn-primary">Submit Request</button>
                </form>
            </div>
        </div>
    );
};
export default BookAppointment;