import { useCallback, useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { apiFetch } from '../../services/api';

const localDate = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function WaitingQueue() {
    const { user } = useContext(AuthContext);
    const token = user?.token;
    const [date, setDate] = useState(localDate);
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await apiFetch(`/api/admin/waiting-queue?date=${encodeURIComponent(date)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not load the waiting queue.');
            setEntries(data);
        } catch (reason) {
            setError(reason.message);
        } finally {
            setLoading(false);
        }
    }, [date, token]);

    useEffect(() => { Promise.resolve().then(load); }, [load]);

    const updateStatus = async (entry, status) => {
        setError('');
        setMessage('');
        const reason = status === 'removed' ? window.prompt('Reason for removing this student from the queue:') : undefined;
        if (status === 'removed' && !reason?.trim()) return;
        try {
            const response = await apiFetch(`/api/admin/waiting-queue/${entry.queue_entry_id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status, ...(reason ? { reason } : {}) })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not update the queue entry.');
            setMessage(`Queue position ${data.entry.position} updated to ${status.replace('_', ' ')}.`);
            await load();
        } catch (failure) {
            setError(failure.message);
        }
    };

    const startConsultation = async entry => {
        setError('');
        setMessage('');
        try {
            const response = await apiFetch(`/api/admin/appointments/${entry.appointment_id}/status`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status: 'in_consultation' })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not start the consultation.');
            setMessage(`Consultation started for ${entry.student_name}. Continue documenting it from Appointments.`);
            await load();
        } catch (failure) { setError(failure.message); }
    };

    return <div className="dashboard-container">
        <div className="dashboard-header"><h1>Clinic Waiting Queue</h1><p>Students enter the queue after attendance is recorded. Queue order follows check-in time; clinical priority is not assigned by the system.</p></div>
        {error && <p role="alert" className="alert alert-error">{error}</p>}
        {message && <p role="status" className="alert alert-success">{message}</p>}
        <section className="section-card">
            <label htmlFor="queue-date">Appointment date</label>{' '}
            <input id="queue-date" type="date" value={date} onChange={event => setDate(event.target.value)} />
            {loading ? <p role="status">Loading queue…</p> : entries.length === 0 ? <p>No students are waiting for this date.</p> :
                <div className="table-responsive"><table className="clean-table">
                    <thead><tr><th>Position</th><th>Student</th><th>Reference</th><th>Appointment</th><th>Attendance</th><th>Waiting since</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>{entries.map(entry => <tr key={entry.queue_entry_id}>
                        <td>{entry.position}</td>
                        <td>{entry.student_name || 'Student account unavailable'}{entry.student_number ? ` · ${entry.student_number}` : ''}</td>
                        <td>{entry.reference_number}</td>
                        <td>{String(entry.appointment_time).slice(0, 5)} · {entry.appointment_type_name || 'Appointment'}</td>
                        <td>{entry.attendance_status?.replace('_', ' ') || 'Not recorded'}</td>
                        <td>{new Date(entry.queue_entered_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</td>
                        <td>{entry.queue_status.replace('_', ' ')}</td>
                        <td style={{ display: 'flex', gap: 8 }}>
                            {entry.queue_status === 'waiting' ? <button type="button" onClick={() => updateStatus(entry, 'called')}>Call student</button> : entry.queue_status === 'called' ? <>
                                <button type="button" onClick={() => startConsultation(entry)}>Start consultation</button>
                                <button type="button" onClick={() => updateStatus(entry, 'waiting')}>Return to waiting</button>
                            </> : <span>Consultation in progress</span>}
                            {entry.queue_status !== 'in_consultation' && <button type="button" onClick={() => updateStatus(entry, 'removed')}>Remove</button>}
                        </td>
                    </tr>)}</tbody>
                </table></div>}
        </section>
    </div>;
}
