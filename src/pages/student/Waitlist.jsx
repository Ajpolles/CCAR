import { useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { apiFetch } from '../../services/api';

const dateString = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function Waitlist() {
    const { user } = useContext(AuthContext);
    const [types, setTypes] = useState([]);
    const [entries, setEntries] = useState([]);
    const [form, setForm] = useState({ appointment_type_id: '', start_date: '', end_date: '', preferred_start_time: '', preferred_end_time: '' });
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        const headers = { Authorization: `Bearer ${user?.token}` };
        const [typesResponse, waitlistResponse] = await Promise.all([
            apiFetch('/api/appointment-types', { headers }), apiFetch('/api/waitlist', { headers })
        ]);
        const [typesData, waitlistData] = await Promise.all([typesResponse.json(), waitlistResponse.json()]);
        if (!typesResponse.ok || !waitlistResponse.ok) throw new Error(typesData.error || waitlistData.error || 'Could not load waitlist information.');
        setTypes(Array.isArray(typesData) ? typesData : typesData.appointmentTypes || []);
        setEntries(waitlistData);
    }, [user?.token]);

    useEffect(() => { Promise.resolve().then(load).catch(reason => setError(reason.message)); }, [load]);

    const submit = async event => {
        event.preventDefault();
        setError('');
        setMessage('');
        try {
            const response = await apiFetch('/api/waitlist', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token}` },
                body: JSON.stringify({ ...form, preferred_start_time: form.preferred_start_time || null, preferred_end_time: form.preferred_end_time || null })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not join the waitlist.');
            setForm({ appointment_type_id: '', start_date: '', end_date: '', preferred_start_time: '', preferred_end_time: '' });
            setMessage('Waitlist preferences saved. The system will notify you about matching openings; it will not book a slot automatically.');
            await load();
        } catch (failure) { setError(failure.message); }
    };

    const close = async id => {
        const response = await apiFetch(`/api/waitlist/${id}/close`, { method: 'PATCH', headers: { Authorization: `Bearer ${user?.token}` } });
        const data = await response.json();
        if (!response.ok) return setError(data.error || 'Could not close waitlist entry.');
        await load();
    };

    const respond = async (offerId, decision) => {
        const response = await apiFetch(`/api/waitlist-offers/${offerId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token}` },
            body: JSON.stringify({ decision })
        });
        const data = await response.json();
        if (!response.ok) return setError(data.error || 'Could not respond to this slot notice.');
        setMessage(data.message);
        await load();
    };

    return <div className="dashboard-container">
        <div className="dashboard-header"><h1>Appointment Waitlist</h1><p>Save an appointment type and date/time range. A notice is not a reservation; regular booking rechecks availability.</p></div>
        {error && <p role="alert" className="alert alert-error">{error}</p>}
        {message && <p role="status" className="alert alert-success">{message}</p>}
        <section className="section-card"><h2>Join the waitlist</h2>
            <form onSubmit={submit} className="appointment-form">
                <label>Appointment type<select required value={form.appointment_type_id} onChange={event => setForm({ ...form, appointment_type_id: event.target.value })}>
                    <option value="">Choose a type</option>{types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select></label>
                <label>From<input type="date" min={dateString(new Date())} required value={form.start_date} onChange={event => setForm({ ...form, start_date: event.target.value, end_date: form.end_date < event.target.value ? '' : form.end_date })} /></label>
                <label>Through<input type="date" min={form.start_date || dateString(new Date())} required value={form.end_date} onChange={event => setForm({ ...form, end_date: event.target.value })} /></label>
                <label>Preferred time from (optional)<input type="time" value={form.preferred_start_time} onChange={event => setForm({ ...form, preferred_start_time: event.target.value })} /></label>
                <label>Preferred time until (optional)<input type="time" value={form.preferred_end_time} onChange={event => setForm({ ...form, preferred_end_time: event.target.value })} /></label>
                <button type="submit">Save waitlist preferences</button>
            </form>
        </section>
        <section className="section-card"><h2>Your waitlist preferences and offers</h2>
            {entries.length === 0 ? <p>You have no waitlist preferences.</p> : entries.map(item => <article key={`${item.id}-${item.offer_id || 'entry'}`} style={{ padding: 12, borderTop: '1px solid #e2e8f0' }}>
                <strong>{item.appointment_type_name}</strong> · {item.start_date} to {item.end_date} · {item.status}
                {(item.preferred_start_time || item.preferred_end_time) && ` · ${String(item.preferred_start_time).slice(0, 5)}–${String(item.preferred_end_time).slice(0, 5)}`}
                {item.offer_id && <div style={{ marginTop: 8 }}><p>A time opened: {item.offered_date} at {String(item.offered_time).slice(0, 5)} · {item.offer_status}</p>
                    {item.offer_status === 'notified' && <><button type="button" onClick={() => respond(item.offer_id, 'accepted')}>Accept notice</button>{' '}<button type="button" onClick={() => respond(item.offer_id, 'declined')}>Decline</button></>}
                    {item.offer_status === 'accepted' && <Link to={`/student/book-appointment?appointment_type_id=${item.appointment_type_id}&date=${item.offered_date}&time=${String(item.offered_time).slice(0, 5)}`}>Continue with this offered time</Link>}
                </div>}
                {['active', 'notified'].includes(item.status) && <button type="button" onClick={() => close(item.id)}>Close waitlist</button>}
            </article>)}
        </section>
    </div>;
}
