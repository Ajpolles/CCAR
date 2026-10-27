import { useEffect, useState, useContext, useCallback } from 'react';
import { AuthContext } from '../../context/AuthContext';
import {
    CalendarDays,
    Clock,
    Users,
    CalendarCheck,
    CalendarX,
    Search,
    RefreshCw,
    Eye,
    Stethoscope,
    X,
    CheckCircle,
    ChevronRight
} from 'lucide-react';
import './AdminDashboard.css';

const formatTime = (time) => {
    if (!time) return '—';
    const parts = String(time).split(':');
    if (parts.length < 2) return time;
    const date = new Date();
    date.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const formatDate = (date) => {
    if (!date) return '—';
    const [year, month, day] = String(date).slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return '—';
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
};

export default function ManageAppointments() {
    const { user } = useContext(AuthContext);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [updatingId, setUpdatingId] = useState(null);

    // Filters & Search
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('');
    const [recordFilter, setRecordFilter] = useState('all');

    // Modals
    const [viewAppt, setViewAppt] = useState(null);
    const [consultAppt, setConsultAppt] = useState(null);
    const [rescheduleAppt, setRescheduleAppt] = useState(null);
    const [cancelAppt, setCancelAppt] = useState(null);

    // Form States
    const [consultForm, setConsultForm] = useState({
        visit_date: new Date().toISOString().slice(0, 10),
        diagnosis_notes: '',
        consultation_notes: '',
        finalize: true
    });

    const [rescheduleForm, setRescheduleForm] = useState({
        appointment_date: '',
        appointment_time: ''
    });

    const fetchAppointments = useCallback(async () => {
        if (!user?.token) {
            setError('Please log in again to view appointments.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await fetch(
                'http://localhost:5000/api/admin/appointments',
                {
                    headers: { Authorization: `Bearer ${user.token}` }
                }
            );

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch appointments.');

            setAppointments(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message || 'Unable to load appointments.');
        } finally {
            setLoading(false);
        }
    }, [user?.token]);

    useEffect(() => {
        fetchAppointments();
    }, [fetchAppointments]);

    const handleClearFilters = () => {
        setSearch('');
        setStatusFilter('all');
        setDateFilter('');
        setRecordFilter('all');
    };

    const updateStatus = async (id, status) => {
        setUpdatingId(id);
        setError('');
        setSuccessMsg('');

        try {
            const res = await fetch(
                `http://localhost:5000/api/admin/appointments/${id}/status`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${user.token}`
                    },
                    body: JSON.stringify({ status })
                }
            );

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update appointment.');

            setSuccessMsg(`Appointment status successfully updated to ${status}.`);
            await fetchAppointments();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (err) {
            setError(err.message || 'Unable to update appointment.');
        } finally {
            setUpdatingId(null);
        }
    };

    const handleConsultSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        setUpdatingId(consultAppt.id);

        try {
            const res = await fetch('http://localhost:5000/api/admin/records', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${user.token}`
                },
                body: JSON.stringify({
                    student_id: consultAppt.student_id,
                    appointment_id: consultAppt.id,
                    ...consultForm
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save consultation.');

            setSuccessMsg('Consultation completed and medical record saved successfully.');
            setConsultAppt(null);
            await fetchAppointments();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (err) {
            setError(err.message || 'Failed to save consultation.');
        } finally {
            setUpdatingId(null);
        }
    };

    const handleRescheduleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        setUpdatingId(rescheduleAppt.id);

        try {
            const res = await fetch(`http://localhost:5000/api/admin/appointments/${rescheduleAppt.id}/reschedule`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${user.token}`
                },
                body: JSON.stringify(rescheduleForm)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to reschedule appointment.');

            setSuccessMsg('Appointment rescheduled successfully.');
            setRescheduleAppt(null);
            await fetchAppointments();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (err) {
            setError(err.message || 'Unable to reschedule appointment.');
        } finally {
            setUpdatingId(null);
        }
    };

    const handleCancelSubmit = async () => {
        if (!cancelAppt) return;
        await updateStatus(cancelAppt.id, 'cancelled');
        setCancelAppt(null);
    };

    const filteredAppointments = appointments.filter(appt => {
        const searchText = search.trim().toLowerCase();
        const matchesSearch = [
            appt.student_name,
            appt.school_id,
            appt.reason,
            appt.status
        ].some(val => String(val || '').toLowerCase().includes(searchText));

        const matchesStatus = statusFilter === 'all' || String(appt.status || '').toLowerCase() === statusFilter;
        const matchesDate = !dateFilter || String(appt.appointment_date || '').startsWith(dateFilter);
        const matchesRecord = 
            recordFilter === 'all' || 
            (recordFilter === 'with' && appt.has_medical_record) || 
            (recordFilter === 'without' && !appt.has_medical_record);

        return matchesSearch && matchesStatus && matchesDate && matchesRecord;
    });

    const totalCount = appointments.length;
    const pendingCount = appointments.filter(a => a.status?.toLowerCase() === 'pending').length;
    const confirmedCount = appointments.filter(a => a.status?.toLowerCase() === 'confirmed').length;
    const completedCount = appointments.filter(a => a.status?.toLowerCase() === 'completed').length;
    const cancelledCount = appointments.filter(a => a.status?.toLowerCase() === 'cancelled').length;

    const getStatusBadge = (status) => {
        const lower = (status || '').toLowerCase();
        if (lower === 'pending') return <span className="status-badge badge-pending">Pending</span>;
        if (lower === 'confirmed') return <span className="status-badge badge-confirmed">Confirmed</span>;
        if (lower === 'completed') return <span className="status-badge badge-completed">Completed</span>;
        if (lower === 'cancelled') return <span className="status-badge badge-cancelled">Cancelled</span>;
        return <span className="status-badge badge-default">{status || 'Unknown'}</span>;
    };

    return (
        <div className="admin-dashboard-container">
            <div className="admin-header">
                <div className="header-left">
                    <h1>Manage Appointments</h1>
                    <p>Review bookings, confirm schedules, and conduct student consultations.</p>
                </div>
            </div>

            {successMsg && (
                <div style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle size={18} /> {successMsg}
                </div>
            )}

            {error && (
                <div style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontWeight: '500' }} role="alert">
                    {error}
                </div>
            )}

            {/* 6-Column Modern Stats Grid */}
            <div className="stats-grid-6">
                {[
                    { title: "Total Appointments", value: totalCount, icon: <CalendarDays size={20} className="text-blue" />, bg: 'bg-blue-light' },
                    { title: 'Pending', value: pendingCount, icon: <Clock size={20} className="text-orange" />, bg: 'bg-orange-light' },
                    { title: 'Confirmed', value: confirmedCount, icon: <CalendarCheck size={20} className="text-blue" />, bg: 'bg-blue-light' },
                    { title: 'Completed', value: completedCount, icon: <CheckCircle size={20} className="text-green" />, bg: 'bg-green-light' },
                    { title: 'Cancelled', value: cancelledCount, icon: <CalendarX size={20} className="text-red" />, bg: 'bg-red-light' },
                    { title: 'Active Filtered', value: filteredAppointments.length, icon: <Users size={20} className="text-purple" />, bg: 'bg-purple-light' }
                ].map((stat) => (
                    <div className="stat-card-modern" key={stat.title}>
                        <div className={`stat-icon-wrapper ${stat.bg}`}>
                            {stat.icon}
                        </div>
                        <div className="stat-title">{stat.title}</div>
                        <div className="stat-value">{loading ? '-' : stat.value}</div>
                    </div>
                ))}
            </div>

            {/* Main Content Panel */}
            <div className="card-panel panel-span-full">
                <div className="panel-header">
                    <div className="panel-title">
                        <CalendarDays size={18} className="text-blue" />
                        <h3>Appointment Directory</h3>
                    </div>
                    <button
                        type="button"
                        className="action-view-btn"
                        onClick={fetchAppointments}
                        disabled={loading}
                        style={{ padding: '6px 14px' }}
                    >
                        <RefreshCw size={14} /> {loading ? 'Refreshing...' : 'Refresh List'}
                    </button>
                </div>

                {/* Toolbar Filters */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div className="appointments-search" style={{ position: 'relative', display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 12px', flex: 1, minWidth: '240px' }}>
                        <Search size={16} className="text-gray-400" style={{ marginRight: '8px' }} />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search by student name or student number..."
                            style={{ border: 'none', background: 'transparent', padding: '8px 0', fontSize: '0.85rem', color: '#1e293b', outline: 'none', width: '100%' }}
                        />
                    </div>

                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.85rem', color: '#334155', outline: 'none' }}
                    >
                        <option value="all">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>

                    <input
                        type="date"
                        value={dateFilter}
                        onChange={e => setDateFilter(e.target.value)}
                        style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.85rem', color: '#334155', outline: 'none' }}
                    />

                    <select
                        value={recordFilter}
                        onChange={e => setRecordFilter(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.85rem', color: '#334155', outline: 'none' }}
                    >
                        <option value="all">All Medical Records</option>
                        <option value="with">With Medical Record</option>
                        <option value="without">No Medical Record</option>
                    </select>

                    <button
                        type="button"
                        onClick={handleClearFilters}
                        style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '500', color: '#475569', cursor: 'pointer' }}
                    >
                        Clear Filters
                    </button>
                </div>

                <div className="panel-body table-responsive">
                    <table className="clean-table">
                        <thead>
                            <tr>
                                <th>Date &amp; Time</th>
                                <th>Student Name</th>
                                <th>Reason</th>
                                <th>Medical Record</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="empty-text">Loading appointments...</td>
                                </tr>
                            ) : filteredAppointments.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="empty-text">No matching appointments found.</td>
                                </tr>
                            ) : (
                                filteredAppointments.map(appt => {
                                    const status = String(appt.status || 'pending').toLowerCase();
                                    return (
                                        <tr key={appt.id}>
                                            <td>
                                                <div style={{ fontWeight: '600', color: '#0f172a' }}>{formatDate(appt.appointment_date)}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{formatTime(appt.appointment_time)}</div>
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: '600', color: '#1e293b' }}>{appt.student_name || 'Unknown Student'}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{appt.school_id || 'No ID'}</div>
                                            </td>
                                            <td style={{ maxWidth: '220px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                                {appt.reason || '—'}
                                            </td>
                                            <td>
                                                {appt.has_medical_record ? (
                                                    <span className="status-badge badge-completed" style={{ fontSize: '0.7rem' }}>With Record</span>
                                                ) : (
                                                    <span className="status-badge badge-default" style={{ fontSize: '0.7rem' }}>No Record</span>
                                                )}
                                            </td>
                                            <td>{getStatusBadge(appt.status)}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    <button
                                                        type="button"
                                                        className="action-view-btn"
                                                        onClick={() => setViewAppt(appt)}
                                                        title="View Details"
                                                    >
                                                        <Eye size={14} /> View Details
                                                    </button>

                                                    {status === 'pending' && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                className="action-view-btn"
                                                                style={{ background: '#3b82f6', color: 'white', borderColor: '#3b82f6' }}
                                                                onClick={() => updateStatus(appt.id, 'confirmed')}
                                                                disabled={updatingId === appt.id}
                                                            >
                                                                Confirm
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="action-view-btn"
                                                                style={{ background: '#f59e0b', color: 'white', borderColor: '#f59e0b' }}
                                                                onClick={() => {
                                                                    setRescheduleAppt(appt);
                                                                    setRescheduleForm({
                                                                        appointment_date: String(appt.appointment_date || '').slice(0, 10),
                                                                        appointment_time: appt.appointment_time || ''
                                                                    });
                                                                }}
                                                            >
                                                                Reschedule
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="action-view-btn"
                                                                style={{ background: '#ef4444', color: 'white', borderColor: '#ef4444' }}
                                                                onClick={() => setCancelAppt(appt)}
                                                            >
                                                                Cancel
                                                            </button>
                                                        </>
                                                    )}

                                                    {status === 'confirmed' && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                className="action-view-btn"
                                                                style={{ background: '#10b981', color: 'white', borderColor: '#10b981' }}
                                                                onClick={() => {
                                                                    setConsultAppt(appt);
                                                                    setConsultForm({
                                                                        visit_date: String(appt.appointment_date || '').slice(0, 10),
                                                                        diagnosis_notes: '',
                                                                        consultation_notes: '',
                                                                        finalize: true
                                                                    });
                                                                }}
                                                            >
                                                                <Stethoscope size={14} /> Consult
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="action-view-btn"
                                                                style={{ background: '#f59e0b', color: 'white', borderColor: '#f59e0b' }}
                                                                onClick={() => {
                                                                    setRescheduleAppt(appt);
                                                                    setRescheduleForm({
                                                                        appointment_date: String(appt.appointment_date || '').slice(0, 10),
                                                                        appointment_time: appt.appointment_time || ''
                                                                    });
                                                                }}
                                                            >
                                                                Reschedule
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="action-view-btn"
                                                                style={{ background: '#ef4444', color: 'white', borderColor: '#ef4444' }}
                                                                onClick={() => setCancelAppt(appt)}
                                                            >
                                                                Cancel
                                                            </button>
                                                        </>
                                                    )}

                                                    {status === 'completed' && (
                                                        <button
                                                            type="button"
                                                            className="action-view-btn"
                                                            style={{ background: '#0284c7', color: 'white', borderColor: '#0284c7' }}
                                                            onClick={() => {
                                                                setConsultAppt(appt);
                                                                setConsultForm({
                                                                    visit_date: String(appt.appointment_date || '').slice(0, 10),
                                                                    diagnosis_notes: '',
                                                                    consultation_notes: '',
                                                                    finalize: true
                                                                });
                                                            }}
                                                        >
                                                            Edit Consult
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {!loading && filteredAppointments.length > 0 && (
                    <div style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', fontSize: '0.85rem', color: '#64748b' }}>
                        Showing {filteredAppointments.length} of {appointments.length} appointments
                    </div>
                )}
            </div>

            {/* --- View Details Modal --- */}
            {viewAppt && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, padding: '16px' }}>
                    <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1f2937' }}>Appointment &amp; Student Details</h3>
                            <button type="button" onClick={() => setViewAppt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '0.9rem', marginBottom: '20px' }}>
                            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <h4 style={{ margin: '0 0 8px 0', color: '#3b82f6', fontSize: '0.95rem' }}>Student Information</h4>
                                <div><strong>Name:</strong> {viewAppt.student_name}</div>
                                <div><strong>Student Number:</strong> {viewAppt.school_id}</div>
                                <div><strong>Course:</strong> {viewAppt.course || '—'}</div>
                                <div><strong>Year Level:</strong> {viewAppt.year_level || '—'}</div>
                                <div><strong>Section:</strong> {viewAppt.section || '—'}</div>
                                <div><strong>Email:</strong> {viewAppt.student_email || '—'}</div>
                                <div><strong>Contact:</strong> {viewAppt.contact_number || '—'}</div>
                            </div>

                            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <h4 style={{ margin: '0 0 8px 0', color: '#3b82f6', fontSize: '0.95rem' }}>Appointment Details</h4>
                                <div><strong>Date:</strong> {formatDate(viewAppt.appointment_date)}</div>
                                <div><strong>Time:</strong> {formatTime(viewAppt.appointment_time)}</div>
                                <div><strong>Status:</strong> <span style={{ textTransform: 'capitalize', fontWeight: 'bold' }}>{viewAppt.status}</span></div>
                                <div><strong>Medical Record:</strong> {viewAppt.has_medical_record ? 'With Medical Record' : 'No Medical Record'}</div>
                                <div><strong>Created At:</strong> {viewAppt.created_at ? new Date(viewAppt.created_at).toLocaleString() : '—'}</div>
                            </div>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                            <strong style={{ display: 'block', marginBottom: '4px', color: '#374151' }}>Reason for Appointment:</strong>
                            <p style={{ margin: 0, color: '#4b5563', whiteSpace: 'pre-wrap' }}>{viewAppt.reason || 'No reason provided.'}</p>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="button" className="action-view-btn" style={{ background: '#35b1ef', color: 'white', borderColor: '#64838b', padding: '8px 16px' }} onClick={() => setViewAppt(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- Consult Student Modal --- */}
            {consultAppt && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, padding: '16px' }}>
                    <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Stethoscope className="text-blue" size={20} />
                                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Student Consultation &amp; Medical Record</h3>
                            </div>
                            <button type="button" onClick={() => setConsultAppt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        <div style={{ marginBottom: '16px', padding: '12px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.85rem', border: '1px solid #e2e8f0' }}>
                            <div><strong>Student:</strong> {consultAppt.student_name} ({consultAppt.school_id})</div>
                            <div><strong>Appointment Reason:</strong> {consultAppt.reason}</div>
                            <div><strong>Scheduled Date:</strong> {formatDate(consultAppt.appointment_date)} at {formatTime(consultAppt.appointment_time)}</div>
                        </div>

                        <form onSubmit={handleConsultSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontWeight: '600', fontSize: '0.85rem', marginBottom: '4px' }}>Visit Date *</label>
                                <input
                                    type="date"
                                    required
                                    value={consultForm.visit_date}
                                    onChange={e => setConsultForm({ ...consultForm, visit_date: e.target.value })}
                                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', fontSize: '0.85rem', marginBottom: '4px' }}>Diagnosis / Medical Findings</label>
                                <textarea
                                    rows="3"
                                    value={consultForm.diagnosis_notes}
                                    onChange={e => setConsultForm({ ...consultForm, diagnosis_notes: e.target.value })}
                                    placeholder="Enter diagnosis or findings..."
                                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', resize: 'vertical' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', fontSize: '0.85rem', marginBottom: '4px' }}>Consultation Notes</label>
                                <textarea
                                    rows="4"
                                    value={consultForm.consultation_notes}
                                    onChange={e => setConsultForm({ ...consultForm, consultation_notes: e.target.value })}
                                    placeholder="Enter treatment notes, prescriptions, or advice..."
                                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', resize: 'vertical' }}
                                />
                            </div>

                            <div style={{ marginTop: '4px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={consultForm.finalize}
                                        onChange={e => setConsultForm({ ...consultForm, finalize: e.target.checked })}
                                    />
                                    <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>Finalize consultation and mark appointment as Completed</span>
                                </label>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                                <button type="button" className="action-view-btn" style={{ background: '#94a3b8', color: 'white', borderColor: '#94a3b8', padding: '8px 16px' }} onClick={() => setConsultAppt(null)}>Cancel</button>
                                <button type="submit" className="action-view-btn" style={{ background: '#10b981', color: 'white', borderColor: '#10b981', padding: '8px 16px' }} disabled={updatingId === consultAppt.id}>
                                    {updatingId === consultAppt.id ? 'Saving...' : 'Complete Consultation'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- Reschedule Modal --- */}
            {rescheduleAppt && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, padding: '16px' }}>
                    <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '500px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Reschedule Appointment</h3>
                            <button type="button" onClick={() => setRescheduleAppt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        <div style={{ marginBottom: '16px', fontSize: '0.85rem', color: '#4b5563' }}>
                            Rescheduling for <strong>{rescheduleAppt.student_name}</strong>. Current schedule: {formatDate(rescheduleAppt.appointment_date)} at {formatTime(rescheduleAppt.appointment_time)}.
                        </div>

                        <form onSubmit={handleRescheduleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontWeight: '600', fontSize: '0.85rem', marginBottom: '4px' }}>New Date *</label>
                                <input
                                    type="date"
                                    required
                                    value={rescheduleForm.appointment_date}
                                    onChange={e => setRescheduleForm({ ...rescheduleForm, appointment_date: e.target.value })}
                                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', fontSize: '0.85rem', marginBottom: '4px' }}>New Time *</label>
                                <input
                                    type="time"
                                    required
                                    value={rescheduleForm.appointment_time}
                                    onChange={e => setRescheduleForm({ ...rescheduleForm, appointment_time: e.target.value })}
                                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                                <button type="button" className="action-view-btn" style={{ background: '#94a3b8', color: 'white', borderColor: '#94a3b8', padding: '8px 16px' }} onClick={() => setRescheduleAppt(null)}>Cancel</button>
                                <button type="submit" className="action-view-btn" style={{ background: '#f59e0b', color: 'white', borderColor: '#f59e0b', padding: '8px 16px' }} disabled={updatingId === rescheduleAppt.id}>
                                    {updatingId === rescheduleAppt.id ? 'Saving...' : 'Save New Schedule'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- Cancel Confirmation Dialog --- */}
            {cancelAppt && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, padding: '16px' }}>
                    <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '450px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
                        <h3 style={{ margin: '0 0 12px 0', color: '#ef4444', fontSize: '1.15rem' }}>Confirm Appointment Cancellation</h3>
                        <p style={{ margin: '0 0 20px 0', color: '#4b5563', fontSize: '0.9rem' }}>
                            Are you sure you want to cancel the appointment for <strong>{cancelAppt.student_name}</strong> ({cancelAppt.school_id}) scheduled on {formatDate(cancelAppt.appointment_date)}? This action cannot be undone.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button type="button" className="action-view-btn" style={{ background: '#94a3b8', color: 'white', borderColor: '#94a3b8', padding: '8px 16px' }} onClick={() => setCancelAppt(null)}>Keep Appointment</button>
                            <button type="button" className="action-view-btn" style={{ background: '#ef4444', color: 'white', borderColor: '#ef4444', padding: '8px 16px' }} onClick={handleCancelSubmit} disabled={updatingId === cancelAppt.id}>
                                {updatingId === cancelAppt.id ? 'Cancelling...' : 'Yes, Cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}