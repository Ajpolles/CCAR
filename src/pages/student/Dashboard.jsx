import { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { Calendar, FileText, CheckCircle, Clock, PlusSquare } from 'lucide-react';
import './Dashboard.css';

export default function Dashboard() {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    
    const [appointments, setAppointments] = useState([]);
    const [recordsCount, setRecordsCount] = useState(0);
    
    const upcoming = appointments.filter(a => a.status === 'confirmed').length;
    const pending = appointments.filter(a => a.status === 'pending').length;
    const completed = appointments.filter(a => a.status === 'completed').length;
    const upcomingAppt = appointments.find(a => a.status === 'confirmed') || null;

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const apptRes = await fetch('http://localhost:5000/api/appointments', {
                    headers: { 'Authorization': `Bearer ${user.token}` }
                });
                if (apptRes.ok) {
                    const data = await apptRes.json();
                    setAppointments(data);
                }

                const recRes = await fetch('http://localhost:5000/api/student/records', {
                    headers: { 'Authorization': `Bearer ${user.token}` }
                });
                if (recRes.ok) {
                    const data = await recRes.json();
                    setRecordsCount(data.length); 
                }
            } catch (err) {
                console.error("Failed to fetch dashboard data");
            }
        };
        fetchDashboardData();
    }, [user.token]);

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Welcome, {user?.name?.split(' ')[0] || 'Student'}!</h1>
                <p>Here's your health center overview.</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon bg-blue"><Calendar size={24} color="#2563eb" /></div>
                    <div className="stat-title">Upcoming Appointments</div>
                    <div className="stat-value">{upcoming}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon bg-green"><FileText size={24} color="#16a34a" /></div>
                    <div className="stat-title">Medical Records</div>
                    <div className="stat-value">{recordsCount}</div> 
                </div>
                <div className="stat-card">
                    <div className="stat-icon bg-green-alt"><CheckCircle size={24} color="#15803d" /></div>
                    <div className="stat-title">Completed Visits</div>
                    <div className="stat-value">{completed}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon bg-orange"><Clock size={24} color="#ea580c" /></div>
                    <div className="stat-title">Pending Requests</div>
                    <div className="stat-value">{pending}</div>
                </div>
            </div>

            <div className="dashboard-sections">
                <div className="section-card">
                    <div className="section-header">
                        <h3>Upcoming Appointment</h3>
                        <button 
                            className="view-all" 
                            onClick={() => navigate('/student/appointments')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                            View All
                        </button>
                    </div>
                    {upcomingAppt ? (
                        <div className="appointment-details">
                            <div className="appt-date-time">
                                <strong>{new Date(upcomingAppt.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                                <span>{upcomingAppt.appointment_time}</span>
                            </div>
                            <div className="appt-status confirmed">Confirmed</div>
                            <div className="appt-reason">{upcomingAppt.reason}</div>
                        </div>
                    ) : (
                        <p className="no-data">No upcoming appointments.</p>
                    )}
                </div>

                <div className="section-card">
                    <div className="section-header">
                        <h3>Quick Actions</h3>
                    </div>
                    <button className="quick-action-btn" onClick={() => navigate('/student/book-appointment')}>
                        <PlusSquare size={20} /> Book New Appointment
                    </button>
                </div>
            </div>
        </div>
    );
}