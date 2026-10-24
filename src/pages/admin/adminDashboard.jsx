import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { Calendar, Clock, Users, FileText } from 'lucide-react';
import '../student/Dashboard.css'; 

export default function AdminDashboard() {
    const { user } = useContext(AuthContext);
    const [stats, setStats] = useState({ pending: 0, today: 0, completed: 0 });
    const [todayAppointments, setTodayAppointments] = useState([]);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const statsRes = await fetch('http://localhost:5000/api/admin/dashboard-stats', {
                    headers: { 'Authorization': `Bearer ${user.token}` }
                });
                if (statsRes.ok) setStats(await statsRes.json());

                const apptRes = await fetch('http://localhost:5000/api/admin/appointments', {
                    headers: { 'Authorization': `Bearer ${user.token}` }
                });
                if (apptRes.ok) {
                    const data = await apptRes.json();
                    const today = new Date().toISOString().split('T')[0];
                    setTodayAppointments(data.filter(a => a.appointment_date.startsWith(today)));
                }
            } catch (err) {
                console.error("Failed to fetch admin dashboard data");
            }
        };
        fetchDashboardData();
    }, [user.token]);

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Welcome, Dr. {user?.name?.split(' ')[1] || user?.name}!</h1>
                <p>Manage appointments and student records.</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon bg-green"><Calendar size={24} color="#16a34a" /></div>
                    <div className="stat-title">Today's Appointments</div>
                    <div className="stat-value">{stats.today}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon bg-orange"><Clock size={24} color="#ea580c" /></div>
                    <div className="stat-title">Pending Appointments</div>
                    <div className="stat-value">{stats.pending}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon bg-blue"><Users size={24} color="#2563eb" /></div>
                    <div className="stat-title">Total Completed</div>
                    <div className="stat-value">{stats.completed}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon bg-green-alt"><FileText size={24} color="#15803d" /></div>
                    <div className="stat-title">System Load</div>
                    <div className="stat-value">Normal</div>
                </div>
            </div>

            <div className="dashboard-sections">
                <div className="section-card">
                    <div className="section-header">
                        <h3>Today's Appointments</h3>
                    </div>
                    {todayAppointments.length === 0 ? (
                        <p className="no-data">No appointments scheduled for today.</p>
                    ) : (
                        <div className="records-list">
                            {todayAppointments.map(appt => (
                                <div key={appt.id} className="appointment-details" style={{ borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                                    <div className="appt-date-time">
                                        <strong>{appt.appointment_time}</strong>
                                        <span>{appt.student_name}</span>
                                    </div>
                                    <div className={`appt-status ${appt.status}`}>{appt.status}</div>
                                    <div className="appt-reason">{appt.reason}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}