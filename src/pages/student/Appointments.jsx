import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { Calendar as CalendarIcon, Clock, Activity } from 'lucide-react';
import './Dashboard.css';

export default function Appointments() {
    const { user } = useContext(AuthContext);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);

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
            } finally {
                setLoading(false);
            }
        };
        fetchAppointments();
    }, [user.token]);

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>My Appointments</h1>
                <p>View and track the status of your clinic consultation requests.</p>
            </div>

            <div className="section-card">
                {loading ? (
                    <p className="no-data">Loading appointments...</p>
                ) : appointments.length === 0 ? (
                    <p className="no-data">You have no appointment history. Book a new appointment to get started.</p>
                ) : (
                    <div className="records-list">
                        {appointments.map((appt) => (
                            <div key={appt.id} className="record-item">
                                <div className="record-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div className="record-date">
                                        <CalendarIcon size={16} color="#64748b" />
                                        <span>
                                            {new Date(appt.appointment_date).toLocaleDateString('en-US', { 
                                                weekday: 'long', 
                                                year: 'numeric', 
                                                month: 'long', 
                                                day: 'numeric' 
                                            })}
                                        </span>
                                    </div>
                                    <span className={`appt-status ${appt.status}`}>
                                        {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                                    </span>
                                </div>
                                <div className="record-body">
                                    <div className="record-field">
                                        <span className="field-label"><Clock size={16}/> Time:</span>
                                        <span className="field-value" style={{ fontWeight: '600', color: '#0f172a' }}>
                                            {appt.appointment_time}
                                        </span>
                                    </div>
                                    <div className="record-field highlight">
                                        <span className="field-label"><Activity size={16}/> Reason for Visit:</span>
                                        <span className="field-value">{appt.reason}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}