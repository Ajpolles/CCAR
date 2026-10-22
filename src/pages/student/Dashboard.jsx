import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';

const StudentDashboard = () => {
    const { user } = useContext(AuthContext);
    const [appointments, setAppointments] = useState([]);

    useEffect(() => {
        const fetchAppointments = async () => {
            try {
                const res = await fetch('http://localhost:5000/api/appointments', {
                    headers: { 'Authorization': `Bearer ${user.token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setAppointments(data);
                }
            } catch (err) {
                console.error("Failed to fetch appointments");
            }
        };
        fetchAppointments();
    }, [user.token]);

    return (
        <div>
            <h2>Welcome, {user.name}</h2>
            <div className="card" style={{ marginTop: '20px' }}>
                <h3>Your Appointments</h3>
                {appointments.length === 0 ? (
                    <p>No appointments found.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Reason</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {appointments.map(app => (
                                <tr key={app.id}>
                                    <td>{new Date(app.appointment_date).toLocaleDateString()}</td>
                                    <td>{app.appointment_time}</td>
                                    <td>{app.reason}</td>
                                    <td><span className={`badge ${app.status}`}>{app.status}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
export default StudentDashboard;