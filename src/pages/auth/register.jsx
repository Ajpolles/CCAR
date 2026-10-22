import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const Register = () => {
    const [formData, setFormData] = useState({ student_id: '', full_name: '', email: '', password: '' });
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('http://localhost:5000/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) navigate('/');
            else {
                const data = await res.json();
                setError(data.error);
            }
        } catch (err) {
            setError('Server connection failed.');
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <div className="card" style={{ width: '400px' }}>
                <h2>Student Registration</h2>
                {error && <p style={{ color: 'red' }}>{error}</p>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Student ID</label>
                        <input type="text" onChange={e => setFormData({...formData, student_id: e.target.value})} required />
                    </div>
                    <div className="form-group">
                        <label>Full Name</label>
                        <input type="text" onChange={e => setFormData({...formData, full_name: e.target.value})} required />
                    </div>
                    <div className="form-group">
                        <label>Email</label>
                        <input type="email" onChange={e => setFormData({...formData, email: e.target.value})} required />
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <input type="password" onChange={e => setFormData({...formData, password: e.target.value})} required />
                    </div>
                    <button type="submit" className="btn-primary" style={{ width: '100%' }}>Register</button>
                </form>
                <p style={{ marginTop: '15px', textAlign: 'center' }}>
                    Already have an account? <Link to="/">Login</Link>
                </p>
            </div>
        </div>
    );
};
export default Register;