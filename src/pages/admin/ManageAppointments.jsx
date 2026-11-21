import { apiFetch } from '../../services/api';
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

const createConsultForm = visitDate => ({
    visit_date: visitDate,
    chief_complaint: '', history_of_present_illness: '', relevant_medical_history: '', vital_signs: {}, vital_signs_text: '{}',
    clinical_assessment: '', diagnosis: '', treatment: '', medication_information: '', instructions: '',
    follow_up_recommendation: '', diagnosis_notes: '', consultation_notes: '', finalize: false
});

export default function ManageAppointments() {
    const { user } = useContext(AuthContext);
    const [appointments, setAppointments] = useState([]);
    const [rescheduleRequests, setRescheduleRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [updatingId, setUpdatingId] = useState(null);

    // Filters & Search
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('');
    const [appointmentTypeFilter, setAppointmentTypeFilter] = useState('all');
    const [recordFilter, setRecordFilter] = useState('all');

    // Modals
    const [viewAppt, setViewAppt] = useState(null);
    const [appointmentHistory, setAppointmentHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [informationRequests, setInformationRequests] = useState([]);
    const [informationQuestion, setInformationQuestion] = useState('');
    const [informationSaving, setInformationSaving] = useState(false);
    const [scheduleProposals, setScheduleProposals] = useState([]);
    const [proposalSchedules, setProposalSchedules] = useState([]);
    const [proposalForm, setProposalForm] = useState({ schedule_id: '', date: '', time: '', message: '' });
    const [proposalSaving, setProposalSaving] = useState(false);
    const [attendanceHistory, setAttendanceHistory] = useState([]);
    const [attendanceForm, setAttendanceForm] = useState({ status: 'checked_in', reason: '' });
    const [consultAppt, setConsultAppt] = useState(null);
    const [rescheduleAppt, setRescheduleAppt] = useState(null);
    const [cancelAppt, setCancelAppt] = useState(null);
    const [rejectAppt, setRejectAppt] = useState(null);
    const [rejectRequest, setRejectRequest] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const token = user?.token;

    // Form States
    const [consultForm, setConsultForm] = useState(() => createConsultForm(new Date().toISOString().slice(0, 10)));

    const [rescheduleForm, setRescheduleForm] = useState({
        appointment_date: '',
        appointment_time: ''
    });

    const fetchAppointments = useCallback(async () => {
        if (!token) {
            setError('Please log in again to view appointments.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await apiFetch(
                '/api/admin/appointments',
                {
                    headers: { Authorization: `Bearer ${token}` }
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
    }, [token]);

    useEffect(() => {
        // The appointments request synchronizes this table with the backend.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchAppointments();
    }, [fetchAppointments]);

    const fetchRescheduleRequests = useCallback(async () => {
        if (!token) return;
        try {
            const response = await apiFetch('/api/admin/reschedule-requests', { headers: { Authorization: `Bearer ${token}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to load reschedule requests.');
            setRescheduleRequests(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message || 'Unable to load reschedule requests.');
        }
    }, [token]);

    useEffect(() => {
        // Keep the request queue synchronized with this page.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchRescheduleRequests();
    }, [fetchRescheduleRequests]);

    const handleClearFilters = () => {
        setSearch('');
        setStatusFilter('all');
        setDateFilter('');
        setAppointmentTypeFilter('all');
        setRecordFilter('all');
    };

    const reviewRescheduleRequest = async (requestId, status, reason) => {
        setUpdatingId(requestId);
        setError('');
        try {
            const response = await apiFetch(`/api/admin/reschedule-requests/${requestId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status, ...(reason ? { reason } : {}) })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to review reschedule request.');
            setSuccessMsg(data.message);
            await Promise.all([fetchAppointments(), fetchRescheduleRequests()]);
            return true;
        } catch (err) {
            setError(err.message || 'Unable to review reschedule request.');
            return false;
        } finally {
            setUpdatingId(null);
        }
    };

    const openAppointment = async (appointment) => {
        setViewAppt(appointment);
        setAppointmentHistory([]);
        setInformationRequests([]);
        setInformationQuestion('');
        setScheduleProposals([]);
        setAttendanceHistory([]);
        setAttendanceForm({ status: appointment.attendance_status || 'checked_in', reason: '' });
        setProposalForm({ schedule_id: '', date: '', time: '', message: '' });
        setHistoryLoading(true);
        try {
            const [historyResponse, requestsResponse, proposalsResponse, schedulesResponse, attendanceResponse] = await Promise.all([
                apiFetch(`/api/admin/appointments/${appointment.id}/history`, { headers: { Authorization: `Bearer ${token}` } }),
                apiFetch(`/api/admin/appointments/${appointment.id}/information-requests`, { headers: { Authorization: `Bearer ${token}` } }),
                apiFetch(`/api/admin/appointments/${appointment.id}/schedule-proposals`, { headers: { Authorization: `Bearer ${token}` } }),
                apiFetch('/api/admin/schedules', { headers: { Authorization: `Bearer ${token}` } }),
                apiFetch(`/api/admin/appointments/${appointment.id}/attendance-history`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            const [historyData, requestsData, proposalsData, schedulesData, attendanceData] = await Promise.all([historyResponse.json(), requestsResponse.json(), proposalsResponse.json(), schedulesResponse.json(), attendanceResponse.json()]);
            if (!historyResponse.ok) throw new Error(historyData.error || 'Unable to load appointment history.');
            if (!requestsResponse.ok) throw new Error(requestsData.error || 'Unable to load information requests.');
            if (!proposalsResponse.ok) throw new Error(proposalsData.error || 'Unable to load schedule proposals.');
            if (!schedulesResponse.ok) throw new Error(schedulesData.error || 'Unable to load staff schedules.');
            if (!attendanceResponse.ok) throw new Error(attendanceData.error || 'Unable to load attendance history.');
            setAppointmentHistory(historyData);
            setInformationRequests(requestsData);
            setScheduleProposals(proposalsData);
            setProposalSchedules(schedulesData.filter(schedule => schedule.is_available));
            setAttendanceHistory(attendanceData);
        } catch (error) {
            setError(error.message || 'Unable to load appointment history.');
        } finally {
            setHistoryLoading(false);
        }
    };

    const updateAttendance = async (appointmentId, status, reason = '') => {
        setUpdatingId(appointmentId);
        setError('');
        try {
            const response = await apiFetch(`/api/admin/appointments/${appointmentId}/attendance`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status, ...(reason.trim() ? { reason: reason.trim() } : {}) })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not update attendance.');
            setAppointments(items => items.map(item => item.id === appointmentId ? { ...item, attendance_status: data.attendance.status, checked_in_at: data.attendance.checked_in_at } : item));
            setViewAppt(current => current?.id === appointmentId ? { ...current, attendance_status: data.attendance.status, checked_in_at: data.attendance.checked_in_at } : current);
                    setAttendanceHistory(items => [...items, { id: `local-${Date.now()}`, new_status: status, previous_status: viewAppt?.attendance_status || null, actor_role: user?.role, reason, created_at: new Date().toISOString(), actor_name: user?.name }]);
            setAttendanceForm({ status, reason: '' });
            setSuccessMsg('Attendance updated. Appointment status was not changed.');
            return true;
        } catch (err) {
            setError(err.message || 'Could not update attendance.');
            return false;
        } finally {
            setUpdatingId(null);
        }
    };

    const updateStatus = async (id, status, reason) => {
        setUpdatingId(id);
        setError('');
        setSuccessMsg('');

        try {
            const res = await apiFetch(
                `/api/admin/appointments/${id}/status`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${user.token}`
                    },
                    body: JSON.stringify({ status, ...(reason ? { reason } : {}) })
                }
            );

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update appointment.');

            setSuccessMsg(`Appointment status successfully updated to ${status}.`);
            await fetchAppointments();
            setTimeout(() => setSuccessMsg(''), 4000);
            return true;
        } catch (err) {
            setError(err.message || 'Unable to update appointment.');
            return false;
        } finally {
            setUpdatingId(null);
        }
    };

    const openConsultation = async appointment => {
        if (appointment.status === 'confirmed') {
            const started = await updateStatus(appointment.id, 'in_consultation');
            if (!started) return;
        }
        setConsultAppt({ ...appointment, status: 'in_consultation' });
        setConsultForm(createConsultForm(String(appointment.appointment_date || '').slice(0, 10)));
    };

    const handleConsultSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        setUpdatingId(consultAppt.id);

        try {
            const res = await apiFetch('/api/admin/records', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${user.token}`
                },
                body: JSON.stringify({
                    user_id: consultAppt.user_id,
                    appointment_id: consultAppt.id,
                    ...consultForm,
                    vital_signs: JSON.parse(consultForm.vital_signs_text)
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
            const res = await apiFetch(`/api/admin/appointments/${rescheduleAppt.id}/reschedule`, {
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
            appt.reference_number,
            appt.student_name,
            appt.school_id,
            appt.reason,
            appt.status,
            appt.appointment_type_name
        ].some(val => String(val || '').toLowerCase().includes(searchText));

        const matchesStatus = statusFilter === 'all' || String(appt.status || '').toLowerCase() === statusFilter;
        const matchesDate = !dateFilter || String(appt.appointment_date || '').startsWith(dateFilter);
        const matchesType = appointmentTypeFilter === 'all' || (appt.appointment_type_name || 'Legacy appointment') === appointmentTypeFilter;
        const matchesRecord = 
            recordFilter === 'all' || 
            (recordFilter === 'with' && appt.has_medical_record) || 
            (recordFilter === 'without' && !appt.has_medical_record);

        return matchesSearch && matchesStatus && matchesDate && matchesType && matchesRecord;
    });
    const appointmentTypes = [...new Set(appointments.map(appt => appt.appointment_type_name || 'Legacy appointment'))].sort();

    const totalCount = appointments.length;
    const pendingCount = appointments.filter(a => a.status?.toLowerCase() === 'pending').length;
    const confirmedCount = appointments.filter(a => a.status?.toLowerCase() === 'confirmed').length;
    const completedCount = appointments.filter(a => a.status?.toLowerCase() === 'completed').length;
    const cancelledCount = appointments.filter(a => a.status?.toLowerCase() === 'cancelled').length;

    const getStatusBadge = (status) => {
        const lower = (status || '').toLowerCase();
        if (lower === 'pending') return <span className="status-badge badge-pending">Pending</span>;
        if (lower === 'confirmed') return <span className="status-badge badge-confirmed">Confirmed</span>;
        if (lower === 'checked_in') return <span className="status-badge badge-confirmed">Checked In</span>;
        if (lower === 'in_consultation') return <span className="status-badge badge-pending">In Consultation</span>;
        if (lower === 'completed') return <span className="status-badge badge-completed">Completed</span>;
        if (lower === 'cancelled') return <span className="status-badge badge-cancelled">Cancelled</span>;
        if (lower === 'rejected') return <span className="status-badge badge-cancelled">Rejected</span>;
        if (lower === 'no_show') return <span className="status-badge badge-cancelled">No Show</span>;
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
                        <option value="checked_in">Checked In</option>
                        <option value="in_consultation">In Consultation</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="rejected">Rejected</option>
                        <option value="no_show">No Show</option>
                    </select>

                    <input
                        type="date"
                        value={dateFilter}
                        onChange={e => setDateFilter(e.target.value)}
                        style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.85rem', color: '#334155', outline: 'none' }}
                    />

                    <select
                        aria-label="Filter by appointment type"
                        value={appointmentTypeFilter}
                        onChange={e => setAppointmentTypeFilter(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.85rem', color: '#334155', outline: 'none' }}
                    >
                        <option value="all">All Appointment Types</option>
                        {appointmentTypes.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>

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
                                <th>Attendance</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="7" className="empty-text">Loading appointments...</td>
                                </tr>
                            ) : filteredAppointments.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="empty-text">No matching appointments found.</td>
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
                                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{appt.reference_number}</div>
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
                                            <td>{appt.attendance_status ? <span className="status-badge badge-confirmed">{appt.attendance_status.replace(/_/g, ' ')}</span> : <span className="status-badge badge-default">Not checked in</span>}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    <button
                                                        type="button"
                                                        className="action-view-btn"
                                                        onClick={() => openAppointment(appt)}
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
                                                                style={{ background: '#64748b', color: 'white', borderColor: '#64748b' }}
                                                                onClick={() => { setRejectAppt(appt); setRejectionReason(''); }}
                                                                disabled={updatingId === appt.id}
                                                            >
                                                                Reject
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

                                                    {['confirmed', 'in_consultation'].includes(status) && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                className="action-view-btn"
                                                                style={{ background: '#10b981', color: 'white', borderColor: '#10b981' }}
                                                                onClick={() => openConsultation(appt)}
                                                            >
                                                                <Stethoscope size={14} /> {status === 'in_consultation' ? 'Continue consultation' : 'Consult'}
                                                            </button>
                                                            {status === 'confirmed' && <><button
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
                                                                style={{ background: '#0284c7', color: 'white', borderColor: '#0284c7' }}
                                                                onClick={() => updateAttendance(appt.id, 'checked_in')}
                                                                disabled={updatingId === appt.id}
                                                            >
                                                                Check In
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="action-view-btn"
                                                                style={{ background: '#ef4444', color: 'white', borderColor: '#ef4444' }}
                                                                onClick={() => setCancelAppt(appt)}
                                                            >
                                                                Cancel
                                                            </button></>}
                                                        </>
                                                    )}

                                                    {status === 'completed' && <span>Record finalized</span>}
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

            <section className="panel-card" aria-labelledby="reschedule-requests-title" style={{ marginTop: 20, padding: 20 }}>
                <h2 id="reschedule-requests-title" style={{ marginTop: 0 }}>Student reschedule requests</h2>
                {rescheduleRequests.filter(item => item.status === 'pending').length === 0 ? <p>No pending reschedule requests.</p> : (
                    <div className="table-responsive">
                        <table className="clean-table">
                            <thead><tr><th>Student</th><th>Reference</th><th>Current time</th><th>Requested time</th><th>Reason</th><th>Actions</th></tr></thead>
                            <tbody>{rescheduleRequests.filter(item => item.status === 'pending').map(item => (
                                <tr key={item.id}>
                                    <td>{item.student_name} ({item.student_number})</td>
                                    <td>{item.reference_number}</td>
                                    <td>{formatDate(item.current_appointment_date)} at {formatTime(item.current_appointment_time)}</td>
                                    <td>{formatDate(item.requested_date)} at {formatTime(item.requested_time)}</td>
                                    <td>{item.student_reason}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button type="button" disabled={updatingId === item.id} onClick={() => reviewRescheduleRequest(item.id, 'approved')}>Approve</button>
                                            <button type="button" disabled={updatingId === item.id} onClick={() => { setRejectRequest(item); setRejectionReason(''); }}>Reject</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                )}
            </section>

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
                                <div><strong>Reference:</strong> {viewAppt.reference_number}</div>
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

                        <section aria-label="Appointment review history" style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                            <strong>Review history</strong>
                            {historyLoading ? <p role="status">Loading history…</p> : appointmentHistory.length === 0 ? <p>No history available.</p> : appointmentHistory.map(item => (
                                <div key={item.id} style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 8 }}>
                                    <div><strong>{item.actor_name || item.actor_role}:</strong> {item.event_type === 'rescheduled' ? `Rescheduled to ${item.metadata?.to_date || ''} at ${String(item.metadata?.to_time || '').slice(0, 5)}` : `${item.previous_status ? `${item.previous_status} → ` : ''}${item.new_status}`}</div>
                                    {item.reason && <p style={{ margin: '4px 0' }}>{item.reason}</p>}
                                    <small>{new Date(item.created_at).toLocaleString()}</small>
                                </div>
                            ))}
                        </section>

                        <section aria-label="Attendance" style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                            <strong>Attendance</strong>
                            <p>Current: {viewAppt.attendance_status?.replace(/_/g, ' ') || 'not recorded'}. Appointment status remains {viewAppt.status}.</p>
                            {attendanceHistory.map(item => <div key={item.id} style={{ borderTop: '1px solid #e2e8f0', paddingTop: 6, marginTop: 6 }}>
                                <span>{item.previous_status ? `${item.previous_status} → ` : ''}{item.new_status.replace(/_/g, ' ')}</span>
                                <small> · {item.actor_name || item.actor_role} · {new Date(item.created_at).toLocaleString()}</small>
                                {item.reason && <p style={{ margin: '4px 0' }}>{item.reason}</p>}
                            </div>)}
                            <form onSubmit={async event => {
                                event.preventDefault();
                                const changed = await updateAttendance(viewAppt.id, attendanceForm.status, attendanceForm.reason);
                                if (changed) await fetchAppointments();
                            }} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                                <label htmlFor="appointment-attendance-status">Record attendance</label>
                                <select id="appointment-attendance-status" value={attendanceForm.status} onChange={event => setAttendanceForm(form => ({ ...form, status: event.target.value }))}>
                                    {['checked_in', 'late', 'no_show', 'excused'].map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
                                </select>
                                <label htmlFor="appointment-attendance-reason">Reason {['no_show', 'excused'].includes(attendanceForm.status) ? '(required)' : '(optional)'}</label>
                                <textarea id="appointment-attendance-reason" value={attendanceForm.reason} onChange={event => setAttendanceForm(form => ({ ...form, reason: event.target.value }))} maxLength={1000} rows={2} required={['no_show', 'excused'].includes(attendanceForm.status)} />
                                <button type="submit" disabled={updatingId === viewAppt.id}>{updatingId === viewAppt.id ? 'Saving…' : 'Save attendance'}</button>
                            </form>
                        </section>

                        <section aria-label="Student information requests" style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                            <strong>Request information from student</strong>
                            {informationRequests.map(item => <div key={item.id} style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 8 }}>
                                <div><strong>{item.status === 'answered' ? 'Answered' : 'Awaiting reply'}:</strong> {item.question}</div>
                                {item.response && <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{item.response}</p>}
                                <small>{new Date(item.created_at).toLocaleString()}</small>
                            </div>)}
                            {informationRequests.length === 0 && <p>No information requests.</p>}
                            {!informationRequests.some(item => item.status === 'pending') && <form onSubmit={async event => {
                                event.preventDefault();
                                setInformationSaving(true);
                                setError('');
                                try {
                                    const response = await apiFetch(`/api/admin/appointments/${viewAppt.id}/information-requests`, {
                                        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                        body: JSON.stringify({ question: informationQuestion.trim() })
                                    });
                                    const data = await response.json();
                                    if (!response.ok) throw new Error(data.error || 'Unable to send information request.');
                                    setInformationRequests(items => [data.request, ...items]);
                                    setInformationQuestion('');
                                    setSuccessMsg('Information request sent to student.');
                                } catch (err) {
                                    setError(err.message);
                                } finally {
                                    setInformationSaving(false);
                                }
                            }} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                                <label htmlFor="appointment-information-question">Question</label>
                                <textarea id="appointment-information-question" value={informationQuestion} onChange={event => setInformationQuestion(event.target.value)} maxLength={1000} rows={3} required />
                                <button type="submit" disabled={!informationQuestion.trim() || informationSaving}>{informationSaving ? 'Sending…' : 'Send request'}</button>
                            </form>}
                        </section>

                        <section aria-label="Alternative schedule proposals" style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                            <strong>Propose an alternative schedule</strong>
                            {scheduleProposals.map(item => <div key={item.id} style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 8 }}>
                                <div><strong>{item.status}:</strong> {formatDate(item.proposed_date)} at {formatTime(item.proposed_time)}</div>
                                {item.message && <p style={{ margin: '4px 0' }}>{item.message}</p>}
                                {item.response_reason && <p style={{ margin: '4px 0' }}>Student: {item.response_reason}</p>}
                            </div>)}
                            {scheduleProposals.length === 0 && <p>No schedule proposals.</p>}
                            {!scheduleProposals.some(item => item.status === 'pending') && <form onSubmit={async event => {
                                event.preventDefault();
                                setProposalSaving(true);
                                setError('');
                                try {
                                    const response = await apiFetch(`/api/admin/appointments/${viewAppt.id}/schedule-proposals`, {
                                        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                        body: JSON.stringify(proposalForm)
                                    });
                                    const data = await response.json();
                                    if (!response.ok) throw new Error(data.error || 'Unable to propose that schedule.');
                                    setScheduleProposals(items => [data.proposal, ...items]);
                                    setProposalForm({ schedule_id: '', date: '', time: '', message: '' });
                                } catch (err) {
                                    setError(err.message);
                                } finally {
                                    setProposalSaving(false);
                                }
                            }} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                                <label htmlFor="proposal-date">Date</label>
                                <input id="proposal-date" type="date" value={proposalForm.date} onChange={event => setProposalForm(form => ({ ...form, date: event.target.value, schedule_id: '' }))} required />
                                <label htmlFor="proposal-schedule">Staff schedule</label>
                                <select id="proposal-schedule" value={proposalForm.schedule_id} onChange={event => setProposalForm(form => ({ ...form, schedule_id: event.target.value }))} required>
                                    <option value="">Choose schedule</option>
                                    {proposalSchedules.filter(schedule => schedule.available_date === proposalForm.date).map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.admin_first_name} {schedule.admin_last_name}, {formatTime(schedule.start_time)}–{formatTime(schedule.end_time)}</option>)}
                                </select>
                                <label htmlFor="proposal-time">Start time</label>
                                <input id="proposal-time" type="time" value={proposalForm.time} onChange={event => setProposalForm(form => ({ ...form, time: event.target.value }))} required />
                                <label htmlFor="proposal-message">Message to student</label>
                                <textarea id="proposal-message" value={proposalForm.message} onChange={event => setProposalForm(form => ({ ...form, message: event.target.value }))} maxLength={1000} rows={2} />
                                <button type="submit" disabled={proposalSaving || !proposalForm.schedule_id || !proposalForm.date || !proposalForm.time}>{proposalSaving ? 'Sending…' : 'Send alternative'}</button>
                            </form>}
                        </section>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="button" className="action-view-btn" style={{ background: '#35b1ef', color: 'white', borderColor: '#64838b', padding: '8px 16px' }} onClick={() => setViewAppt(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {(rejectAppt || rejectRequest) && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 1300, padding: 16 }}>
                    <form role="dialog" aria-modal="true" aria-labelledby="reject-appointment-title" onSubmit={async event => {
                        event.preventDefault();
                        if (rejectRequest) {
                            if (await reviewRescheduleRequest(rejectRequest.id, 'rejected', rejectionReason.trim())) setRejectRequest(null);
                        } else if (await updateStatus(rejectAppt.id, 'rejected', rejectionReason.trim())) setRejectAppt(null);
                    }} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, padding: 24, display: 'grid', gap: 12 }}>
                        <h3 id="reject-appointment-title" style={{ margin: 0 }}>{rejectRequest ? 'Reject reschedule request' : 'Reject appointment request'}</h3>
                        <p style={{ margin: 0 }}>Write a short explanation the student can see.</p>
                        <label htmlFor="appointment-rejection-reason">Reason</label>
                        <textarea id="appointment-rejection-reason" value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} maxLength={1000} rows={4} required />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button type="button" onClick={() => { setRejectAppt(null); setRejectRequest(null); }}>Keep request</button>
                            <button type="submit" disabled={!rejectionReason.trim() || updatingId === (rejectRequest?.id ?? rejectAppt?.id)}>Reject request</button>
                        </div>
                    </form>
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
                                <label style={{ display: 'block', fontWeight: '600', fontSize: '0.85rem', marginBottom: '4px' }}>Chief complaint</label>
                                <textarea rows="2" maxLength={10000} value={consultForm.chief_complaint} onChange={e => setConsultForm({ ...consultForm, chief_complaint: e.target.value })} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', fontSize: '0.85rem', marginBottom: '4px' }}>History of present illness</label>
                                <textarea rows="3" maxLength={10000} value={consultForm.history_of_present_illness} onChange={e => setConsultForm({ ...consultForm, history_of_present_illness: e.target.value })} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', fontSize: '0.85rem', marginBottom: '4px' }}>Relevant medical history</label>
                                <textarea rows="3" maxLength={10000} value={consultForm.relevant_medical_history} onChange={e => setConsultForm({ ...consultForm, relevant_medical_history: e.target.value })} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', fontSize: '0.85rem', marginBottom: '4px' }}>Vital signs (JSON object)</label>
                                <textarea rows="2" value={consultForm.vital_signs_text} onChange={e => setConsultForm({ ...consultForm, vital_signs_text: e.target.value })} aria-describedby="vitals-help" />
                                <small id="vitals-help">Example: {`{"temperature":"37 C"}`}. Record only clinic-approved measurements.</small>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontWeight: '600', fontSize: '0.85rem', marginBottom: '4px' }}>Clinical assessment</label>
                                <textarea rows="3" maxLength={10000} value={consultForm.clinical_assessment} onChange={e => setConsultForm({ ...consultForm, clinical_assessment: e.target.value })} />
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

                            {[
                                ['treatment', 'Treatment'], ['medication_information', 'Medication information'],
                                ['instructions', 'Instructions'], ['follow_up_recommendation', 'Follow-up recommendation']
                            ].map(([key, label]) => <div key={key}>
                                <label style={{ display: 'block', fontWeight: '600', fontSize: '0.85rem', marginBottom: '4px' }}>{label}</label>
                                <textarea rows="2" maxLength={10000} value={consultForm[key]} onChange={e => setConsultForm({ ...consultForm, [key]: e.target.value })} />
                            </div>)}

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
                                    <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>Finalize this clinical record</span>
                                </label>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                                <button type="button" className="action-view-btn" style={{ background: '#94a3b8', color: 'white', borderColor: '#94a3b8', padding: '8px 16px' }} onClick={() => setConsultAppt(null)}>Cancel</button>
                                <button type="submit" className="action-view-btn" style={{ background: '#10b981', color: 'white', borderColor: '#10b981', padding: '8px 16px' }} disabled={updatingId === consultAppt.id}>
                                    {updatingId === consultAppt.id ? 'Saving...' : consultForm.finalize ? 'Finalize record' : 'Save draft'}
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
