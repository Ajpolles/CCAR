import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import '../student/Dashboard.css';

export default function ManageAppointments() {
    const { user } = useContext(AuthContext);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchAppointments = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/admin/appointments', {
                headers: { 'Authorization': `Bearer ${user.token}` }
            });
            if (res.ok) setAppointments(await res.json());
        } catch (err) {
            console.error("Fetch failed", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAppointments();
    }, [user.token]);

    const updateStatus = async (id, status) => {
        try {
            await fetch(`http://localhost:5000/api/admin/appointments/${id}/status`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
                body: JSON.stringify({ status })
            });
            fetchAppointments(); // Refresh list
        } catch (err) {
            console.error("Update failed", err);
        }
    };

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Manage Appointments</h1>
                <p>Review and update student consultation requests.</p>
            </div>

            <div className="section-card">
                {loading ? <p>Loading...</p> : (
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                <th style={{ padding: '12px' }}>Date & Time</th>
                                <th style={{ padding: '12px' }}>Student</th>
                                <th style={{ padding: '12px' }}>Reason</th>
                                <th style={{ padding: '12px' }}>Status</th>
                                <th style={{ padding: '12px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {appointments.map(appt => (
                                <tr key={appt.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '12px' }}>
                                        {new Date(appt.appointment_date).toLocaleDateString()}<br/>
                                        <span style={{ fontSize: '12px', color: '#64748b' }}>{appt.appointment_time}</span>
                                    </td>
                                    <td style={{ padding: '12px' }}>{appt.student_name}<br/><span style={{ fontSize: '12px', color: '#64748b' }}>{appt.school_id}</span></td>
                                    <td style={{ padding: '12px' }}>{appt.reason}</td>
                                    <td style={{ padding: '12px' }}>
                                        <span className={`appt-status ${appt.status}`}>{appt.status}</span>
                                    </td>
                                    <td style={{ padding: '12px', display: 'flex', gap: '8px' }}>
                                        {appt.status === 'pending' && (
                                            <button onClick={() => updateStatus(appt.id, 'confirmed')} className="submit-btn" style={{ padding: '6px 12px', marginTop: 0 }}>Approve</button>
                                        )}
                                        {appt.status === 'confirmed' && (
                                            <button onClick={() => updateStatus(appt.id, 'completed')} className="submit-btn" style={{ padding: '6px 12px', marginTop: 0, backgroundColor: '#3b82f6' }}>Complete</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}