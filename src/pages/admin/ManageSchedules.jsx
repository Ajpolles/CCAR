
import { useCallback, useEffect, useState, useContext } from 'react';
import {
    CalendarDays,
    Clock,
    Plus,
    RefreshCw,
    CalendarCheck,
    ClipboardList
} from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import './ManageSchedules.css';

const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

const formatDate = (dateString) => {
    if (!dateString) return 'No date';

    const date = String(dateString).slice(0, 10);
    const [year, month, day] = date.split('-').map(Number);

    return new Date(year, month - 1, day).toLocaleDateString(
        'en-US',
        {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }
    );
};

const formatTime = (timeString) => {
    if (!timeString) return '';

    const [hours, minutes] = String(timeString).split(':').map(Number);
    const date = new Date();

    date.setHours(hours, minutes, 0, 0);

    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
    });
};

const getScheduleStatus = (schedule) => {
    const now = new Date();
    const dateString = String(schedule.available_date).slice(0, 10);
    const [year, month, day] = dateString.split('-').map(Number);

    const [hours, minutes] = String(schedule.end_time)
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

    if (endDateTime.getTime() < now.getTime()) {
        return 'expired';
    }

    if (dateString === getLocalDateString(now)) {
        return 'today';
    }

    return 'upcoming';
};

const getScheduleStatusLabel = (status) => {
    if (status === 'expired') return 'Expired';
    if (status === 'today') return 'Today';
    return 'Upcoming';
};

const getQuickDate = (daysFromToday) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromToday);

    return getLocalDateString(date);
};

export default function ManageSchedules() {
    const { user } = useContext(AuthContext);

    const [schedules, setSchedules] = useState([]);
    const [formData, setFormData] = useState({
        available_date: '',
        start_time: '',
        end_time: ''
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const fetchSchedules = useCallback(async () => {
        if (!user?.token) {
            setSchedules([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await fetch(
                'http://localhost:5000/api/admin/schedules',
                {
                    headers: {
                        Authorization: `Bearer ${user.token}`
                    }
                }
            );

            if (!res.ok) {
                throw new Error('Unable to load clinic schedules.');
            }

            const data = await res.json();

            setSchedules(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(
                err.message || 'Something went wrong while loading schedules.'
            );
        } finally {
            setLoading(false);
        }
    }, [user?.token]);

    useEffect(() => {
        fetchSchedules();
    }, [fetchSchedules]);

    const handleDateChange = (date) => {
        setFormData((previous) => ({
            ...previous,
            available_date: date
        }));

        setError('');
        setSuccess('');
    };

    const handleTimeChange = (field, value) => {
        setFormData((previous) => ({
            ...previous,
            [field]: value
        }));

        setError('');
        setSuccess('');
    };

    const setDuration = (minutes) => {
        if (!formData.start_time) {
            setError('Choose a start time before selecting a duration.');
            return;
        }

        const [hours, mins] = formData.start_time.split(':').map(Number);
        const startMinutes = hours * 60 + mins;
        const endMinutes = startMinutes + minutes;

        if (endMinutes >= 24 * 60) {
            setError('The selected duration would end on the next day.');
            return;
        }

        const endHours = Math.floor(endMinutes / 60);
        const endMins = endMinutes % 60;

        setFormData((previous) => ({
            ...previous,
            end_time: `${String(endHours).padStart(2, '0')}:${String(
                endMins
            ).padStart(2, '0')}`
        }));

        setError('');
        setSuccess('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!user?.token) {
            setError('Your session has expired. Please log in again.');
            return;
        }

        if (formData.available_date < getLocalDateString()) {
            setError('Please choose today or a future date.');
            return;
        }

        if (formData.end_time <= formData.start_time) {
            setError('End time must be later than start time.');
            return;
        }

        setSaving(true);

        try {
            const res = await fetch(
                'http://localhost:5000/api/admin/schedules',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${user.token}`
                    },
                    body: JSON.stringify(formData)
                }
            );

            if (!res.ok) {
                let message = 'Unable to save the schedule.';

                try {
                    const data = await res.json();
                    if (data.message) message = data.message;
                    if (data.error) message = data.error;
                } catch {
                    // Keep the default error message if the response is not JSON.
                }

                throw new Error(message);
            }

            setFormData({
                available_date: '',
                start_time: '',
                end_time: ''
            });

            setSuccess('Clinic schedule saved successfully.');

            await fetchSchedules();
        } catch (err) {
            setError(err.message || 'Failed to save the schedule.');
        } finally {
            setSaving(false);
        }
    };

    const sortedSchedules = [...schedules].sort((a, b) => {
        const dateA = String(a.available_date).slice(0, 10);
        const dateB = String(b.available_date).slice(0, 10);

        if (dateA !== dateB) {
            return dateA.localeCompare(dateB);
        }

        return String(a.start_time).localeCompare(String(b.start_time));
    });

    const today = getLocalDateString();

    const upcomingCount = schedules.filter(
        (schedule) => getScheduleStatus(schedule) === 'upcoming'
    ).length;

    const todayCount = schedules.filter(
        (schedule) => getScheduleStatus(schedule) === 'today'
    ).length;

    const expiredCount = schedules.filter(
        (schedule) => getScheduleStatus(schedule) === 'expired'
    ).length;

    const availableDatesCount = new Set(
        schedules
            .filter((schedule) => getScheduleStatus(schedule) !== 'expired')
            .map((schedule) => String(schedule.available_date).slice(0, 10))
    ).size;

    return (
        <div className="dashboard-container manage-schedules">
            <div className="dashboard-header schedules-header">
                <div>
                    <h1>Clinic Schedules</h1>
                    <p>Manage clinic availability for student appointments.</p>
                </div>

                <button
                    type="button"
                    className="schedule-refresh-btn"
                    onClick={fetchSchedules}
                    disabled={loading}
                >
                    <RefreshCw
                        size={17}
                        className={loading ? 'schedule-spinning' : ''}
                    />
                    <span>Refresh</span>
                </button>
            </div>

            <div className="schedule-stats-grid">
                <div className="schedule-stat-card">
                    <div className="schedule-stat-icon total">
                        <ClipboardList size={23} />
                    </div>
                    <div className="schedule-stat-info">
                        <span>Total Schedules</span>
                        <strong>{schedules.length}</strong>
                    </div>
                </div>

                <div className="schedule-stat-card">
                    <div className="schedule-stat-icon upcoming">
                        <CalendarCheck size={23} />
                    </div>
                    <div className="schedule-stat-info">
                        <span>Upcoming</span>
                        <strong>{upcomingCount}</strong>
                    </div>
                </div>

                <div className="schedule-stat-card">
                    <div className="schedule-stat-icon today">
                        <CalendarDays size={23} />
                    </div>
                    <div className="schedule-stat-info">
                        <span>Today</span>
                        <strong>{todayCount}</strong>
                    </div>
                </div>

                <div className="schedule-stat-card">
                    <div className="schedule-stat-icon expired">
                        <Clock size={23} />
                    </div>
                    <div className="schedule-stat-info">
                        <span>Expired</span>
                        <strong>{expiredCount}</strong>
                    </div>
                </div>
            </div>

            <div className="schedule-layout">
                <section className="schedule-card schedule-form-card">
                    <div className="schedule-card-header">
                        <div className="schedule-heading-icon">
                            <Plus size={21} />
                        </div>
                        <div>
                            <h2>Add Availability</h2>
                            <p>Set the date and hours the clinic is available.</p>
                        </div>
                    </div>

                    <form className="schedule-form" onSubmit={handleSubmit}>
                        <div className="schedule-form-group">
                            <label htmlFor="schedule-date">Available Date</label>

                            <div className="schedule-input-wrapper">
                                <CalendarDays size={19} />
                                <input
                                    id="schedule-date"
                                    type="date"
                                    value={formData.available_date}
                                    min={today}
                                    onChange={(e) =>
                                        handleDateChange(e.target.value)
                                    }
                                    required
                                />
                            </div>

                            <div className="schedule-quick-options">
                                <button
                                    type="button"
                                    className="schedule-quick-btn"
                                    onClick={() => handleDateChange(getQuickDate(0))}
                                >
                                    Today
                                </button>

                                <button
                                    type="button"
                                    className="schedule-quick-btn"
                                    onClick={() => handleDateChange(getQuickDate(1))}
                                >
                                    Tomorrow
                                </button>

                                <button
                                    type="button"
                                    className="schedule-quick-btn"
                                    onClick={() => handleDateChange(getQuickDate(7))}
                                >
                                    Next Week
                                </button>
                            </div>
                        </div>

                        <div className="schedule-form-group">
                            <label htmlFor="schedule-start-time">Start Time</label>

                            <div className="schedule-input-wrapper">
                                <Clock size={19} />
                                <input
                                    id="schedule-start-time"
                                    type="time"
                                    value={formData.start_time}
                                    onChange={(e) =>
                                        handleTimeChange(
                                            'start_time',
                                            e.target.value
                                        )
                                    }
                                    required
                                />
                            </div>

                            <div className="schedule-quick-options">
                                {[
                                    ['08:00', '8:00 AM'],
                                    ['10:00', '10:00 AM'],
                                    ['13:00', '1:00 PM'],
                                    ['15:00', '3:00 PM']
                                ].map(([value, label]) => (
                                    <button
                                        type="button"
                                        key={value}
                                        className="schedule-quick-btn"
                                        onClick={() =>
                                            handleTimeChange('start_time', value)
                                        }
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="schedule-form-group">
                            <label htmlFor="schedule-end-time">End Time</label>

                            <div className="schedule-input-wrapper">
                                <Clock size={19} />
                                <input
                                    id="schedule-end-time"
                                    type="time"
                                    value={formData.end_time}
                                    min={formData.start_time || undefined}
                                    onChange={(e) =>
                                        handleTimeChange(
                                            'end_time',
                                            e.target.value
                                        )
                                    }
                                    required
                                />
                            </div>
                        </div>

                        <div className="schedule-form-group">
                            <label>Quick Duration</label>

                            <div className="schedule-duration-options">
                                <button
                                    type="button"
                                    className="schedule-quick-btn"
                                    onClick={() => setDuration(30)}
                                >
                                    30 minutes
                                </button>

                                <button
                                    type="button"
                                    className="schedule-quick-btn"
                                    onClick={() => setDuration(60)}
                                >
                                    1 hour
                                </button>

                                <button
                                    type="button"
                                    className="schedule-quick-btn"
                                    onClick={() => setDuration(120)}
                                >
                                    2 hours
                                </button>
                            </div>
                            <p className="schedule-field-hint">
                                Choose a start time first.
                            </p>
                        </div>

                        {error && (
                            <div className="schedule-message schedule-error" role="alert">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="schedule-message schedule-success" role="status">
                                {success}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="schedule-submit-btn"
                            disabled={saving}
                        >
                            {saving ? (
                                <>
                                    <RefreshCw
                                        size={18}
                                        className="schedule-spinning"
                                    />
                                    Saving Schedule...
                                </>
                            ) : (
                                <>
                                    <CalendarCheck size={18} />
                                    Save Schedule
                                </>
                            )}
                        </button>
                    </form>
                </section>

                <section className="schedule-card schedule-list-card">
                    <div className="schedule-list-header">
                        <div>
                            <h2>Current Schedules</h2>
                            <p>Review clinic availability and expired schedules.</p>
                        </div>

                        <span className="schedule-count">
                            {schedules.length} total
                        </span>
                    </div>

                    {loading ? (
                        <div className="schedule-empty-state">
                            <RefreshCw
                                size={28}
                                className="schedule-spinning"
                            />
                            <p>Loading schedules...</p>
                        </div>
                    ) : error && schedules.length === 0 ? (
                        <div className="schedule-empty-state schedule-list-error">
                            <CalendarDays size={32} />
                            <p>Could not load schedules.</p>
                            <button
                                type="button"
                                className="schedule-quick-btn"
                                onClick={fetchSchedules}
                            >
                                Try Again
                            </button>
                        </div>
                    ) : sortedSchedules.length === 0 ? (
                        <div className="schedule-empty-state">
                            <CalendarDays size={36} />
                            <h3>No schedules yet</h3>
                            <p>Add clinic availability using the form.</p>
                        </div>
                    ) : (
                        <div className="schedule-records">
                            {sortedSchedules.map((sched) => {
                                const status = getScheduleStatus(sched);

                                return (
                                    <div
                                        key={sched.id}
                                        className={`schedule-record-item ${status}`}
                                    >
                                        <div className="schedule-record-date-icon">
                                            <CalendarDays size={21} />
                                        </div>

                                        <div className="schedule-record-details">
                                            <div className="schedule-record-date">
                                                {formatDate(sched.available_date)}
                                            </div>

                                            <div className="schedule-record-time">
                                                <Clock size={15} />
                                                <span>
                                                    {formatTime(sched.start_time)}
                                                    {' – '}
                                                    {formatTime(sched.end_time)}
                                                </span>
                                            </div>

                                            <div className="schedule-staff-name">
                                                Staff: {sched.staff_name || 'Clinic Staff'}
                                            </div>
                                        </div>

                                        <span
                                            className={`schedule-availability-badge ${status}`}
                                        >
                                            {getScheduleStatusLabel(status)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {!loading && sortedSchedules.length > 0 && (
                        <div className="schedule-list-footer">
                            <span>
                                {availableDatesCount} date
                                {availableDatesCount === 1 ? '' : 's'} with
                                current or upcoming schedules
                            </span>
                            <span>{expiredCount} expired</span>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
