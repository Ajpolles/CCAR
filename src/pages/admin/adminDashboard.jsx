import { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import {
    Calendar, Clock, Users, XCircle, CheckCircle,
    Bell, Search, Eye, PlusCircle, FileText,
    ChevronRight, Activity, CalendarDays,
    CalendarCheck, CalendarX, X
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import './AdminDashboard.css';
import './AdminModal.css';

const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

const formatDate = (dateString) => {
    if (!dateString) return '—';

    const [year, month, day] = String(dateString)
        .slice(0, 10)
        .split('-')
        .map(Number);

    if (!year || !month || !day) return '—';

    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
};

const formatTime = (timeString) => {
    if (!timeString) return '—';

    const [hours, minutes] = String(timeString).split(':').map(Number);

    if (Number.isNaN(hours)) return '—';

    const date = new Date();
    date.setHours(hours, minutes || 0, 0, 0);

    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
    });
};

const getScheduleStatus = (schedule) => {
    const dateString = String(schedule.available_date || '').slice(0, 10);

    if (!dateString) return 'Unknown';

    const [year, month, day] = dateString.split('-').map(Number);
    const [hours, minutes] = String(schedule.end_time || '23:59')
        .split(':')
        .map(Number);

    const endDateTime = new Date(
        year,
        month - 1,
        day,
        hours,
        minutes || 0,
        0,
        0
    );

    if (Number.isNaN(endDateTime.getTime())) return 'Unknown';
    if (endDateTime < new Date()) return 'Expired';

    if (dateString === getLocalDateString()) return 'Today';

    return 'Upcoming';
};

export default function AdminDashboard() {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();

    const [stats, setStats] = useState({
        today: 0,
        pending: 0,
        confirmed: 0,
        completed: 0,
        totalPatients: 0,
        cancelled: 0
    });

    const [todayAppointments, setTodayAppointments] = useState([]);
    const [analytics, setAnalytics] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [recentActivity, setRecentActivity] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dashboardError, setDashboardError] = useState('');
    const [selectedAppointment, setSelectedAppointment] = useState(null);

    useEffect(() => {
        if (!user?.token) {
            setLoading(false);
            setDashboardError('Your session has expired. Please log in again.');
            return;
        }

        let cancelled = false;

        const fetchDashboardData = async () => {
            setLoading(true);
            setDashboardError('');

            try {
                const headers = {
                    Authorization: `Bearer ${user.token}`
                };

                const [
                    statsRes,
                    apptRes,
                    analyticsRes,
                    schedulesRes,
                    activityRes
                ] = await Promise.all([
                    fetch('http://localhost:5000/api/admin/dashboard-stats', { headers }).catch(() => null),
                    fetch('http://localhost:5000/api/admin/appointments', { headers }).catch(() => null),
                    fetch('http://localhost:5000/api/admin/analytics', { headers }).catch(() => null),
                    fetch('http://localhost:5000/api/admin/schedules', { headers }).catch(() => null),
                    fetch('http://localhost:5000/api/admin/activity-logs', { headers }).catch(() => null)
                ]);

                if (cancelled) return;

                if (statsRes?.ok) {
                    const data = await statsRes.json();
                    setStats((prev) => ({ ...prev, ...data }));
                }

                if (apptRes?.ok) {
                    const data = await apptRes.json();
                    const todayLocal = getLocalDateString();
                    setTodayAppointments(
                        Array.isArray(data)
                            ? data.filter((appointment) =>
                                String(appointment.appointment_date || '').slice(0, 10) === todayLocal
                            )
                            : []
                    );
                }

                if (analyticsRes?.ok) {
                    const data = await analyticsRes.json();
                    setAnalytics(Array.isArray(data) ? data : []);
                }

                if (schedulesRes?.ok) {
                    const data = await schedulesRes.json();
                    setSchedules(Array.isArray(data) ? data : []);
                }

                if (activityRes?.ok) {
                    const data = await activityRes.json();
                    setRecentActivity(Array.isArray(data) ? data : []);
                }

                if (!statsRes?.ok && !apptRes?.ok && !analyticsRes?.ok && !schedulesRes?.ok && !activityRes?.ok) {
                    setDashboardError('Unable to load dashboard information. Check your backend connection.');
                }
            } catch (err) {
                if (!cancelled) {
                    console.error('Failed to fetch admin dashboard data:', err);
                    setDashboardError('Failed to load dashboard information.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchDashboardData();

        return () => {
            cancelled = true;
        };
    }, [user?.token]);

    const barChartData = analytics.map((day) => ({
        name: day.date_formatted,
        Confirmed: Number(day.confirmed_count) || 0,
        Pending: Number(day.pending_count) || 0,
        Completed: Number(day.completed_count) || 0,
        Cancelled: Number(day.cancelled_count) || 0
    }));

    const pieData = [
        { name: 'Confirmed', value: Number(stats.confirmed) || 0, color: '#3b82f6' },
        { name: 'Completed', value: Number(stats.completed) || 0, color: '#10b981' },
        { name: 'Pending', value: Number(stats.pending) || 0, color: '#f59e0b' },
        { name: 'Cancelled', value: Number(stats.cancelled) || 0, color: '#ef4444' }
    ].filter((item) => item.value > 0);

    const totalPieValue = pieData.reduce((total, item) => total + item.value, 0);

    const getStatusBadge = (status) => {
        const lower = (status || '').toLowerCase();
        if (lower === 'pending') return <span className="status-badge badge-pending">Pending</span>;
        if (lower === 'confirmed') return <span className="status-badge badge-confirmed">Confirmed</span>;
        if (lower === 'completed') return <span className="status-badge badge-completed">Completed</span>;
        if (lower === 'cancelled') return <span className="status-badge badge-cancelled">Cancelled</span>;
        return <span className="status-badge badge-default">{status || 'Unknown'}</span>;
    };

    const getActivityIcon = (type) => {
        const description = (type || '').toLowerCase();
        if (description.includes('submitted') || description.includes('new')) return <PlusCircle size={16} className="text-blue" />;
        if (description.includes('confirmed') || description.includes('completed')) return <CheckCircle size={16} className="text-green" />;
        if (description.includes('cancelled')) return <XCircle size={16} className="text-red" />;
        return <FileText size={16} className="text-purple" />;
    };

    const sortedSchedules = [...schedules].sort((a, b) => {
        const dateA = String(a.available_date || '').slice(0, 10);
        const dateB = String(b.available_date || '').slice(0, 10);
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return String(a.start_time || '').localeCompare(String(b.start_time || ''));
    });

    const visibleSchedules = sortedSchedules
        .filter((schedule) => getScheduleStatus(schedule) !== 'Expired')
        .slice(0, 5);

    return (
        <div className="admin-dashboard-container">
            <div className="admin-header">
                <div className="header-left">
                    <h1>Welcome back, {user?.name?.split(' ')[0] || user?.name}!</h1>
                    <p>Here's what's happening at the campus clinic today.</p>
                </div>
            </div>

            {dashboardError && (
                <div className="dashboard-error-message" role="alert">
                    {dashboardError}
                </div>
            )}

            <div className="stats-grid-6">
                {[
                    { title: "Today's Appointments", value: stats.today ?? 0, icon: <CalendarDays size={20} className="text-blue" />, bg: 'bg-blue-light' },
                    { title: 'Pending Appointments', value: stats.pending ?? 0, icon: <Clock size={20} className="text-orange" />, bg: 'bg-orange-light' },
                    { title: 'Confirmed Appointments', value: stats.confirmed ?? 0, icon: <CalendarCheck size={20} className="text-blue" />, bg: 'bg-blue-light' },
                    { title: 'Completed Appointments', value: stats.completed ?? 0, icon: <CheckCircle size={20} className="text-green" />, bg: 'bg-green-light' },
                    { title: 'Total Patients', value: stats.totalPatients ?? 0, icon: <Users size={20} className="text-purple" />, bg: 'bg-purple-light' },
                    { title: 'Cancelled Appointments', value: stats.cancelled ?? 0, icon: <CalendarX size={20} className="text-red" />, bg: 'bg-red-light' }
                ].map((stat) => (
                    <div className="stat-card-modern" key={stat.title}>
                        <div className={`stat-icon-wrapper ${stat.bg}`}>
                            {stat.icon}
                        </div>
                        <div className="stat-title">{stat.title}</div>
                        <div className="stat-value">
                            {loading ? '-' : stat.value}
                        </div>
                    </div>
                ))}
            </div>

            <div className="dashboard-grid-layout">
                <div className="card-panel panel-span-2">
                    <div className="panel-header">
                        <div className="panel-title">
                            <CalendarDays size={18} className="text-blue" />
                            <h3>Today's Appointments</h3>
                        </div>
                        <button type="button" className="link-btn" onClick={() => navigate('/admin/appointments')}>
                            View All Appointments →
                        </button>
                    </div>

                    <div className="panel-body table-responsive">
                        <table className="clean-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Student Name</th>
                                    <th>Reason for Visit</th>
                                    <th>Staff</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {todayAppointments.length > 0 ? (
                                    todayAppointments.slice(0, 5).map((appt) => (
                                        <tr key={appt.id}>
                                            <td>{formatTime(appt.appointment_time)}</td>
                                            <td>{appt.student_name || 'Unknown Student'}</td>
                                            <td>{appt.reason || '—'}</td>
                                            <td>
                                                {[appt.admin_first_name, appt.admin_last_name].filter(Boolean).join(' ') || 'Unassigned'}
                                            </td>
                                            <td>{getStatusBadge(appt.status)}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="action-view-btn"
                                                    onClick={() => setSelectedAppointment(appt)}>
                                                    <Eye size={14} /> View Details
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="6" className="empty-text">
                                            {loading ? 'Loading appointments...' : 'No appointments today.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="card-panel">
                    <div className="panel-header">
                        <div className="panel-title">
                            <Activity size={18} className="text-blue" />
                            <h3>Quick Actions</h3>
                        </div>
                    </div>

                    <div className="panel-body quick-actions-list">
                        <button type="button" className="qa-item" onClick={() => navigate('/admin/appointments?status=pending')}>
                            <div className="qa-icon bg-orange-light">
                                <Clock size={18} className="text-orange" />
                            </div>
                            <span>View Pending Appointments</span>
                            <ChevronRight size={16} className="text-gray-400 ml-auto" />
                        </button>

                        <button type="button" className="qa-item" onClick={() => navigate('/admin/schedules')}>
                            <div className="qa-icon bg-blue-light">
                                <Calendar size={18} className="text-blue" />
                            </div>
                            <span>Manage Staff Schedules</span>
                            <ChevronRight size={16} className="text-gray-400 ml-auto" />
                        </button>

                        <button type="button" className="qa-item" onClick={() => navigate('/admin/records')}>
                            <div className="qa-icon bg-purple-light">
                                <Search size={18} className="text-purple" />
                            </div>
                            <span>Search Patient Records</span>
                            <ChevronRight size={16} className="text-gray-400 ml-auto" />
                        </button>

                        <button type="button" className="qa-item" onClick={() => navigate('/admin/appointments')}>
                            <div className="qa-icon bg-green-light">
                                <CalendarCheck size={18} className="text-green" />
                            </div>
                            <span>View All Appointments</span>
                            <ChevronRight size={16} className="text-gray-400 ml-auto" />
                        </button>
                    </div>
                </div>

                <div className="card-panel panel-span-2">
                    <div className="panel-header">
                        <div className="panel-title">
                            <CalendarCheck size={18} className="text-blue" />
                            <h3>Appointment Overview</h3>
                        </div>
                    </div>

                    <div className="charts-container">
                        <div className="chart-box">
                            <h4 className="chart-subtitle">Appointments (Last 7 Days)</h4>
                            <div className="recharts-wrapper" style={{ height: 220 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                                        <Tooltip cursor={{ fill: 'transparent' }} />
                                        <Bar dataKey="Confirmed" stackId="a" fill="#3b82f6" radius={[0, 0, 4, 4]} barSize={16} />
                                        <Bar dataKey="Pending" stackId="a" fill="#f59e0b" />
                                        <Bar dataKey="Completed" stackId="a" fill="#10b981" />
                                        <Bar dataKey="Cancelled" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="chart-legend">
                                <span><span className="legend-dot bg-blue"></span>Confirmed</span>
                                <span><span className="legend-dot bg-orange"></span>Pending</span>
                                <span><span className="legend-dot bg-green"></span>Completed</span>
                                <span><span className="legend-dot bg-red"></span>Cancelled</span>
                            </div>
                        </div>

                        <div className="chart-box">
                            <h4 className="chart-subtitle">Status Breakdown (Last 7 Days)</h4>
                            <div className="donut-chart-wrapper" style={{ height: 220, display: 'flex', alignItems: 'center' }}>
                                <ResponsiveContainer width="50%" height="100%">
                                    <PieChart>
                                        <Pie data={pieData} innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
                                            {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="donut-center-text">
                                    <span className="total-num">{totalPieValue}</span>
                                    <span className="total-lbl">Total Appointments</span>
                                </div>
                                <div className="donut-legend">
                                    {pieData.map((item) => (
                                        <div key={item.name} className="donut-legend-item">
                                            <div className="legend-left">
                                                <span className="legend-dot" style={{ backgroundColor: item.color }}></span>
                                                <span className="legend-label">{item.name}</span>
                                            </div>
                                            <div className="legend-right">
                                                <span className="legend-val">{item.value}</span>
                                                <span className="legend-pct">({totalPieValue ? ((item.value / totalPieValue) * 100).toFixed(0) : 0}%)</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card-panel">
                    <div className="panel-header">
                        <div className="panel-title">
                            <Users size={18} className="text-blue" />
                            <h3>Clinic Staff Schedule</h3>
                        </div>
                        <button type="button" className="link-btn" onClick={() => navigate('/admin/schedules')}>
                            Manage Schedules →
                        </button>
                    </div>

                    <div className="panel-body table-responsive">
                        <table className="clean-table compact-table">
                            <thead>
                                <tr>
                                    <th>Staff Name</th>
                                    <th>Date</th>
                                    <th>Time Slots</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleSchedules.length > 0 ? (
                                    visibleSchedules.map((schedule) => {
                                        const status = getScheduleStatus(schedule);
                                        const scheduleStaffName = [schedule.staff_name, schedule.admin_first_name, schedule.admin_last_name].filter(Boolean);
                                        return (
                                            <tr key={schedule.id}>
                                                <td>{scheduleStaffName[0] || 'Clinic Staff'}</td>
                                                <td>{formatDate(schedule.available_date)}</td>
                                                <td>{formatTime(schedule.start_time)} {' – '} {formatTime(schedule.end_time)}</td>
                                                <td>
                                                    <span className={`status-badge ${status === 'Today' ? 'badge-confirmed' : 'badge-completed'}`}>
                                                        {status}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="4" className="empty-text">
                                            {loading ? 'Loading schedules...' : 'No upcoming schedules found.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="card-panel panel-span-full">
                    <div className="panel-header">
                        <div className="panel-title">
                            <Clock size={18} className="text-blue" />
                            <h3>Recent Activity</h3>
                        </div>
                        <button type="button" className="link-btn" onClick={() => navigate('/admin/activity')}>
                            View All Activity →
                        </button>
                    </div>

                    <div className="panel-body">
                        <div className="activity-feed">
                            {recentActivity.length > 0 ? (
                                recentActivity.map((activity) => (
                                    <div key={activity.id} className="activity-row">
                                        <div className="activity-left">
                                            <div className="activity-icon-wrapper">
                                                {getActivityIcon(activity.description)}
                                            </div>
                                            <span className="activity-desc">{activity.description}</span>
                                        </div>
                                        <div className="activity-time">
                                            {new Date(activity.created_at).toLocaleString('en-US', {
                                                month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                            })}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="empty-text py-4">
                                    {loading ? 'Loading recent activity...' : 'No recent activities found.'}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* --- Student & Appointment Details Modal --- */}
            {selectedAppointment && (
                <div className="admin-modal-backdrop">
                    <div className="admin-modal-container">
                        <div className="admin-modal-header">
                            <h3>Appointment & Student Details</h3>
                            <button
                                type="button"
                                className="admin-modal-close-btn"
                                onClick={() => setSelectedAppointment(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="admin-modal-body">
                            <div className="admin-modal-section">
                                <h4>Student Information</h4>
                                <div className="admin-modal-grid">
                                    <div><strong>Name:</strong> {selectedAppointment.student_name || '—'}</div>
                                    <div><strong>Student Number:</strong> {selectedAppointment.school_id || selectedAppointment.student_number || '—'}</div>
                                    <div><strong>Course:</strong> {selectedAppointment.course || '—'}</div>
                                    <div><strong>Year Level:</strong> {selectedAppointment.year_level || '—'}</div>
                                    <div><strong>Section:</strong> {selectedAppointment.section || '—'}</div>
                                    <div><strong>Email:</strong> {selectedAppointment.student_email || '—'}</div>
                                    <div><strong>Contact Number:</strong> {selectedAppointment.contact_number || '—'}</div>
                                </div>
                            </div>

                            <div className="admin-modal-section">
                                <h4>Appointment Information</h4>
                                <div className="admin-modal-grid">
                                    <div><strong>Date:</strong> {formatDate(selectedAppointment.appointment_date)}</div>
                                    <div><strong>Time:</strong> {formatTime(selectedAppointment.appointment_time)}</div>
                                    <div><strong>Status:</strong> {getStatusBadge(selectedAppointment.status)}</div>
                                    <div><strong>Assigned Staff:</strong> {[selectedAppointment.admin_first_name, selectedAppointment.admin_last_name].filter(Boolean).join(' ') || 'Unassigned'}</div>
                                </div>
                                <div className="admin-modal-reason">
                                    <strong>Reason for Visit:</strong>
                                    <p>{selectedAppointment.reason || 'No reason provided.'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="admin-modal-footer">
                            <button
                                type="button"
                                className="admin-modal-action-close"
                                onClick={() => setSelectedAppointment(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}