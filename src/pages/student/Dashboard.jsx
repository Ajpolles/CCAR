import { apiFetch } from '../../services/api';
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
    const [loading, setLoading] = useState(true);
    const [dashboardError, setDashboardError] = useState('');
    const now = new Date();
    const appointmentDate = (appointment) => new Date(`${String(appointment.appointment_date || '').slice(0, 10)}T${String(appointment.appointment_time || '00:00').slice(0, 5)}:00`);
    const upcomingAppointments = appointments.filter(a => ['pending', 'confirmed'].includes(String(a.status).toLowerCase()) && appointmentDate(a) >= now);
    const upcoming = upcomingAppointments.length;
    const totalAppointments = appointments.length;
    const pending = appointments.filter(a => String(a.status).toLowerCase() === 'pending').length;
    const confirmed = appointments.filter(a => String(a.status).toLowerCase() === 'confirmed').length;
    const completed = appointments.filter(a => String(a.status).toLowerCase() === 'completed').length;
    const cancelled = appointments.filter(a => ['cancelled', 'rejected'].includes(String(a.status).toLowerCase())).length;
    const upcomingAppt = [...upcomingAppointments].sort((a, b) => appointmentDate(a) - appointmentDate(b))[0] || null;

    useEffect(() => {
        let cancelledRequest = false;
        const fetchDashboardData = async () => {
            if (!user?.token) { setLoading(false); return; }
            setLoading(true);
            setDashboardError('');
            try {
                const apptRes = await apiFetch('/api/appointments', {
                    headers: { 'Authorization': `Bearer ${user.token}` }
                });
                const appointmentData = await apptRes.json();
                if (!apptRes.ok) throw new Error(appointmentData?.error || 'Could not load appointments');
                if (!Array.isArray(appointmentData)) throw new Error('Appointment response was invalid');

                const recRes = await apiFetch('/api/student/records', {
                    headers: { 'Authorization': `Bearer ${user.token}` }
                });
                const recordData = await recRes.json();
                if (!recRes.ok) throw new Error(recordData?.error || 'Could not load medical history');
                if (!Array.isArray(recordData)) throw new Error('Medical record response was invalid');
                if (!cancelledRequest) { setAppointments(appointmentData); setRecordsCount(recordData.length); }
            } catch (err) {
                if (!cancelledRequest) setDashboardError(err.message || 'Failed to fetch dashboard data');
            } finally {
                if (!cancelledRequest) setLoading(false);
            }
        };
        fetchDashboardData();
        return () => { cancelledRequest = true; };
    }, [user?.token]);

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Welcome, {user?.name?.split(' ')[0] || 'Student'}!</h1>
                <p>Here's your health center overview.</p>
            </div>

            {dashboardError && <p role="alert" style={{ color: '#b91c1c' }}>{dashboardError}</p>}

            <div className="stats-grid">
                <div className="stat-card-modern"><div className="stat-icon-wrapper bg-green-light"><Calendar size={20} className="text-green" /></div><div className="stat-title">Total Appointments</div><div className="stat-value">{loading ? '—' : totalAppointments}</div></div>
                <div className="stat-card-modern">
                    <div className="stat-icon-wrapper bg-green-light">
                        <Calendar size={20} className="text-green" />
                    </div>
                    <div className="stat-title">Upcoming Appointments</div>
                    <div className="stat-value">{loading ? '—' : upcoming}</div>
                </div>
                <div className="stat-card-modern"><div className="stat-icon-wrapper bg-green-light"><CheckCircle size={20} className="text-green" /></div><div className="stat-title">Confirmed Appointments</div><div className="stat-value">{loading ? '—' : confirmed}</div></div>
                <div className="stat-card-modern"><div className="stat-icon-wrapper bg-orange-light"><Clock size={20} className="text-orange" /></div><div className="stat-title">Pending Requests</div><div className="stat-value">{loading ? '—' : pending}</div></div>
                <div className="stat-card-modern">
                    <div className="stat-icon-wrapper bg-green-light">
                        <FileText size={20} className="text-green" />
                    </div>
                    <div className="stat-title">Medical Records</div>
                    <div className="stat-value">{loading ? '—' : recordsCount}</div> 
                </div>
                <div className="stat-card-modern">
                    <div className="stat-icon-wrapper bg-green-light">
                        <CheckCircle size={20} className="text-green" />
                    </div>
                    <div className="stat-title">Completed Visits</div>
                    <div className="stat-value">{loading ? '—' : completed}</div>
                </div>
                <div className="stat-card-modern"><div className="stat-icon-wrapper bg-orange-light"><Clock size={20} className="text-orange" /></div><div className="stat-title">Cancelled / Rejected</div><div className="stat-value">{loading ? '—' : cancelled}</div></div>
            </div>

            <div className="dashboard-sections">
                <div className="section-card">
                    <div className="section-header">
                        <h3><Calendar size={18} className="text-green"/> Upcoming Appointment</h3>
                        <button className="view-all" onClick={() => navigate('/student/appointments')}>
                            View All →
                        </button>
                    </div>
                    <div className="table-responsive">
                        <table className="clean-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Time</th>
                                    <th>Reason</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {upcomingAppt ? (
                                    <tr>
                                        <td>{new Date(upcomingAppt.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                                        <td style={{ fontWeight: '600' }}>{upcomingAppt.appointment_time}</td>
                                        <td>{upcomingAppt.reason}</td>
                                        <td><span className={`status-badge ${String(upcomingAppt.status).toLowerCase() === 'confirmed' ? 'badge-confirmed' : 'badge-pending'}`}>{String(upcomingAppt.status || 'pending').replace(/_/g, ' ')}</span></td>
                                    </tr>
                                ) : (
                                    <tr>
                                        <td colSpan="4" className="empty-text">No upcoming appointments.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="section-card">
                    <div className="section-header">
                        <h3><PlusSquare size={18} className="text-green"/> Quick Actions</h3>
                    </div>
                    <div className="quick-actions-list">
                        <button className="quick-action-btn" onClick={() => navigate('/student/book-appointment')}>
                            <Calendar size={18} className="text-green" />
                            Book New Appointment
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
