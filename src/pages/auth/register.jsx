import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './auth.css';

export default function Register() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        student_number: '', first_name: '', last_name: '', 
        email: '', password: '', confirmPassword: '', 
        course: '', year_level: '1st Year', section: '', contact_number: ''
    });
    const [error, setError] = useState('');

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.password !== formData.confirmPassword) {
            return setError('Passwords do not match');
        }

        try {
            const res = await fetch('http://localhost:5000/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error);
            navigate('/', { state: { message: 'Registration successful! Please log in.' } });
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="auth-container">
            <form className="auth-form" onSubmit={handleSubmit}>
                <h2>Student Registration</h2>
                {error && <div className="error-alert">{error}</div>}
                
                <input type="text" name="student_number" placeholder="Student Number" onChange={handleChange} required />
                <div className="name-group">
                    <input type="text" name="first_name" placeholder="First Name" onChange={handleChange} required />
                    <input type="text" name="last_name" placeholder="Last Name" onChange={handleChange} required />
                </div>
                <input type="email" name="email" placeholder="Email Address" onChange={handleChange} required />
                
                <div className="school-group">
                    <input type="text" name="course" placeholder="Course (e.g., BSCS)" onChange={handleChange} required />
                    <select name="year_level" value={formData.year_level} onChange={handleChange} required>
                        <option value="1st Year">1st Year</option>
                        <option value="2nd Year">2nd Year</option>
                        <option value="3rd Year">3rd Year</option>
                        <option value="4th Year">4th Year</option>
                    </select>
                    <input type="text" name="section" placeholder="Section" onChange={handleChange} required />
                </div>
                
                <input type="tel" name="contact_number" placeholder="Contact Number" onChange={handleChange} required />
                <input type="password" name="password" placeholder="Password" onChange={handleChange} required />
                <input type="password" name="confirmPassword" placeholder="Confirm Password" onChange={handleChange} required />
                
                <button type="submit">Register</button>
                <p>Already have an account? <Link to="/">Login here</Link></p>
            </form>
        </div>
    );
}