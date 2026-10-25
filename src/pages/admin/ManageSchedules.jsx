import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import '../student/Dashboard.css';

export default function ManageSchedules() {
    const { user } = useContext(AuthContext);
    const [schedules, setSchedules] = useState([]);
    const [formData, setFormData] = useState({ available_date: '', start_time: '', end_time: '' });

    const fetchSchedules = async () => {
        const res = await fetch('http://localhost:5000/api/admin/schedules', {
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        if (res.ok) setSchedules(await res.json());
    };

    useEffect(() => { fetchSchedules(); }, [user.token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        await fetch('http://localhost:5000/api/admin/schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
            body: JSON.stringify(formData)
        });
        setFormData({ available_date: '', start_time: '', end_time: '' });
        fetchSchedules();
    };

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Clinic Schedules</h1>
                <p>Set availability for student appointments.</p>
            </div>

            <div className="dashboard-sections" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
                <div className="form-card" style={{ maxWidth: '100%', height: 'fit-content' }}>
                    <h2>Add Availability</h2>
                    <form onSubmit={handleSubmit} className="appointment-form">
                        <div className="form-group">
                            <label>Date</label>
                            <input type="date" value={formData.available_date} onChange={e => setFormData({...formData, available_date: e.target.value})} required />
                        </div>
                        <div className="form-group">
                            <label>Start Time</label>
                            <input type="time" value={formData.start_time} onChange={e => setFormData({...formData, start_time: e.target.value})} required />
                        </div>
                        <div className="form-group">
                            <label>End Time</label>
                            <input type="time" value={formData.end_time} onChange={e => setFormData({...formData, end_time: e.target.value})} required />
                        </div>
                        <button type="submit" className="submit-btn">Save Schedule</button>
                    </form>
                </div>

                <div className="section-card">
                    <h3>Current Schedules</h3>
                    <div className="records-list" style={{ marginTop: '16px' }}>
                        {schedules.map(sched => (
                            <div key={sched.id} className="record-item">
                                <strong>{new Date(sched.available_date).toLocaleDateString()}</strong> | {sched.start_time} - {sched.end_time}
                                <br/><span style={{ fontSize: '14px', color: '#64748b' }}>Staff: {sched.staff_name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}