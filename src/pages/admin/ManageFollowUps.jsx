import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { apiFetch } from '../../services/api';

export default function ManageFollowUps() {
    const { user } = useContext(AuthContext);
    const [requests, setRequests] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [selectedAppointments, setSelectedAppointments] = useState({});
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        setError('');
        const headers = { Authorization: `Bearer ${user?.token}` };
        const [followUpsResponse, appointmentsResponse] = await Promise.all([
            apiFetch('/api/admin/follow-ups?status=requested', { headers }),
            apiFetch('/api/admin/appointments', { headers })
        ]);
        const [followUpsData, appointmentsData] = await Promise.all([followUpsResponse.json(), appointmentsResponse.json()]);
        if (!followUpsResponse.ok || !appointmentsResponse.ok) throw new Error(followUpsData.error || appointmentsData.error || 'Could not load follow-up requests.');
        setRequests(followUpsData);
        setAppointments(appointmentsData);
    }, [user?.token]);

    useEffect(() => { Promise.resolve().then(load).catch(reason => setError(reason.message)); }, [load]);

    const appointmentsByStudent = useMemo(() => appointments.reduce((groups, appointment) => {
        if (['pending', 'confirmed'].includes(appointment.status)) groups.set(appointment.user_id, [...(groups.get(appointment.user_id) || []), appointment]);
        return groups;
    }, new Map()), [appointments]);

    const decide = async (item, status) => {
        setError('');
        setMessage('');
        let reason;
        if (status === 'declined') reason = window.prompt('Reason for declining this request:');
        if (status === 'declined' && !reason?.trim()) return;
        const related_appointment_id = selectedAppointments[item.id];
        if (status === 'scheduled' && !related_appointment_id) {
            setError('Select an existing appointment. Follow-up review does not create a booking.');
            return;
        }
        try {
            const response = await apiFetch(`/api/admin/follow-ups/${item.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token}` },
                body: JSON.stringify({ status, related_appointment_id, ...(reason ? { reason } : {}) })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not update follow-up request.');
            setMessage(`Follow-up request ${status}.`);
            await load();
        } catch (failure) { setError(failure.message); }
    };

    return <div className="dashboard-container">
        <div className="dashboard-header"><h1>Follow-up Requests</h1><p>Link a request to an appointment the student already booked, or decline it with a reason. This page never creates an appointment.</p></div>
        {error && <p role="alert" className="alert alert-error">{error}</p>}
        {message && <p role="status" className="alert alert-success">{message}</p>}
        <section className="section-card">
            {requests.length === 0 ? <p>No follow-up requests need review.</p> : requests.map(item => {
                const options = appointmentsByStudent.get(item.requested_by) || [];
                return <article key={item.id} style={{ padding: '16px 0', borderBottom: '1px solid #e2e8f0' }}>
                    <h2>{item.student_name} · {item.student_number || 'No student number'}</h2>
                    <p>Request for {item.reference_number} · {item.requested_date ? String(item.requested_date).slice(0, 10) : 'No preferred date'}</p>
                    {item.recommendation && <p>Recommendation: {item.recommendation}</p>}
                    <label htmlFor={`followup-appointment-${item.id}`}>Existing student appointment</label>{' '}
                    <select id={`followup-appointment-${item.id}`} value={selectedAppointments[item.id] || ''} onChange={event => setSelectedAppointments(current => ({ ...current, [item.id]: event.target.value }))}>
                        <option value="">Select an existing appointment</option>
                        {options.filter(appointment => appointment.id !== item.appointment_id).map(appointment => <option key={appointment.id} value={appointment.id}>
                            {appointment.reference_number} · {String(appointment.appointment_date).slice(0, 10)} {String(appointment.appointment_time).slice(0, 5)} · {appointment.status}
                        </option>)}
                    </select>{' '}
                    <button type="button" disabled={!options.length} onClick={() => decide(item, 'scheduled')}>Link appointment</button>{' '}
                    <button type="button" onClick={() => decide(item, 'declined')}>Decline</button>
                    {!options.length && <p>No existing eligible appointment is available to link. The student may book one through the regular booking flow.</p>}
                </article>;
            })}
        </section>
    </div>;
}
