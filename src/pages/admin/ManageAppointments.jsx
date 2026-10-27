
import { useEffect, useState, useContext, useCallback } from 'react';
import { AuthContext } from '../../context/AuthContext';
import {
    Search,
    RefreshCw,
    CalendarDays,
    Clock,
    UserRound,
    ClipboardList
} from 'lucide-react';
import './ManageAppointments.css';

export default function ManageAppointments() {
    const { user } = useContext(AuthContext);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [updatingId, setUpdatingId] = useState(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

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
                    headers: {
                        Authorization: `Bearer ${user.token}`
                    }
                }
            );

            const data = await res.json();

            if (!res.ok) {
                throw new Error(
                    data.error || 'Failed to fetch appointments.'
                );
            }

            setAppointments(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Fetch appointments failed:', err);
            setError(err.message || 'Unable to load appointments.');
        } finally {
            setLoading(false);
        }
    }, [user?.token]);

    useEffect(() => {
        fetchAppointments();
    }, [fetchAppointments]);

    const updateStatus = async (id, status) => {
        if (!user?.token) {
            setError('Please log in again before updating appointments.');
            return;
        }

        setUpdatingId(id);
        setError('');

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

            if (!res.ok) {
                throw new Error(
                    data.error || 'Failed to update appointment.'
                );
            }

            await fetchAppointments();
        } catch (err) {
            console.error('Update appointment failed:', err);
            setError(err.message || 'Unable to update appointment.');
        } finally {
            setUpdatingId(null);
        }
    };

    const filteredAppointments = appointments.filter(appt => {
        const searchText = search.trim().toLowerCase();

        const matchesSearch = [
            appt.student_name,
            appt.school_id,
            appt.reason,
            appt.status
        ].some(value =>
            String(value || '').toLowerCase().includes(searchText)
        );

        const matchesStatus =
            statusFilter === 'all' ||
            String(appt.status || '').toLowerCase() === statusFilter;

        return matchesSearch && matchesStatus;
    });

    const pendingCount = appointments.filter(
        appt => appt.status?.toLowerCase() === 'pending'
    ).length;

    const confirmedCount = appointments.filter(
        appt => appt.status?.toLowerCase() === 'confirmed'
    ).length;

    const completedCount = appointments.filter(
        appt => appt.status?.toLowerCase() === 'completed'
    ).length;

    const formatDate = date => {
        if (!date) return 'No date set';

        const parsedDate = new Date(date);

        if (Number.isNaN(parsedDate.getTime())) {
            return 'Invalid date';
        }

        return parsedDate.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const formatTime = time => {
        if (!time) return 'No time set';

        const parts = String(time).split(':');

        if (parts.length < 2) return time;

        const date = new Date();
        date.setHours(Number(parts[0]), Number(parts[1]), 0, 0);

        return date.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    return (
        <div className="dashboard-container manage-appointments">
            <div className="dashboard-header">
                <h1>Manage Appointments</h1>
                <p>Review and update student consultation requests.</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-info">
                        <p>Total Appointments</p>
                        <h2>{appointments.length}</h2>
                    </div>
                    <div className="stat-icon">
                        <CalendarDays size={24} />
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-info">
                        <p>Pending</p>
                        <h2>{pendingCount}</h2>
                    </div>
                    <div className="stat-icon">
                        <Clock size={24} />
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-info">
                        <p>Confirmed</p>
                        <h2>{confirmedCount}</h2>
                    </div>
                    <div className="stat-icon">
                        <UserRound size={24} />
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-info">
                        <p>Completed</p>
                        <h2>{completedCount}</h2>
                    </div>
                    <div className="stat-icon">
                        <ClipboardList size={24} />
                    </div>
                </div>
            </div>

            <div className="section-card appointments-section">
                <div className="appointments-section-header">
                    <div>
                        <h2>Appointment Requests</h2>
                        <p>View student bookings and manage their status.</p>
                    </div>

                    <button
                        type="button"
                        className="submit-btn refresh-btn"
                        onClick={fetchAppointments}
                        disabled={loading}
                    >
                        <RefreshCw size={16} />
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>

                <div className="appointments-toolbar">
                    <div className="appointments-search">
                        <Search size={18} />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search student, ID, reason..."
                            aria-label="Search appointments"
                        />
                    </div>

                    <select
                        className="appointments-filter"
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        aria-label="Filter appointments by status"
                    >
                        <option value="all">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>

                {error && (
                    <div className="appointments-error" role="alert">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="appointments-empty">
                        Loading appointments...
                    </div>
                ) : filteredAppointments.length === 0 ? (
                    <div className="appointments-empty">
                        <CalendarDays size={36} />
                        <h3>
                            {appointments.length === 0
                                ? 'No appointments yet'
                                : 'No matching appointments'}
                        </h3>
                        <p>
                            {appointments.length === 0
                                ? 'Student appointment requests will appear here.'
                                : 'Try another search term or status filter.'}
                        </p>
                    </div>
                ) : (
                    <div className="appointments-table-wrapper">
                        <table className="appointments-table">
                            <thead>
                                <tr>
                                    <th>Date &amp; Time</th>
                                    <th>Student</th>
                                    <th>Reason</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>

                            <tbody>
                                {filteredAppointments.map(appt => {
                                    const status = String(
                                        appt.status || 'pending'
                                    ).toLowerCase();

                                    return (
                                        <tr key={appt.id}>
                                            <td>
                                                <div className="appointment-date">
                                                    {formatDate(appt.appointment_date)}
                                                </div>
                                                <span className="appointment-time">
                                                    {formatTime(appt.appointment_time)}
                                                </span>
                                            </td>

                                            <td>
                                                <div className="appointment-student">
                                                    {appt.student_name || 'Unknown student'}
                                                </div>
                                                <span className="appointment-student-number">
                                                    {appt.school_id || 'No student number'}
                                                </span>
                                            </td>

                                            <td className="appointment-reason">
                                                {appt.reason || 'No reason provided'}
                                            </td>

                                            <td>
                                                <span className={`appt-status ${status}`}>
                                                    {status}
                                                </span>
                                            </td>

                                            <td>
                                                <div className="appointment-actions">
                                                    {status === 'pending' && (
                                                        <button
                                                            type="button"
                                                            className="submit-btn appointment-action-btn"
                                                            onClick={() => updateStatus(appt.id, 'confirmed')}
                                                            disabled={updatingId === appt.id}
                                                        >
                                                            {updatingId === appt.id
                                                                ? 'Saving...'
                                                                : 'Approve'}
                                                        </button>
                                                    )}

                                                    {status === 'confirmed' && (
                                                        <button
                                                            type="button"
                                                            className="submit-btn appointment-action-btn complete-btn"
                                                            onClick={() => updateStatus(appt.id, 'completed')}
                                                            disabled={updatingId === appt.id}
                                                        >
                                                            {updatingId === appt.id
                                                                ? 'Saving...'
                                                                : 'Complete'}
                                                        </button>
                                                    )}

                                                    {status === 'completed' && (
                                                        <span className="appointment-finished">
                                                            Finished
                                                        </span>
                                                    )}

                                                    {status === 'cancelled' && (
                                                        <span className="appointment-finished">
                                                            Cancelled
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && filteredAppointments.length > 0 && (
                    <div className="appointments-results-count">
                        Showing {filteredAppointments.length} of {appointments.length} appointments
                    </div>
                )}
            </div>
        </div>
    );
}
