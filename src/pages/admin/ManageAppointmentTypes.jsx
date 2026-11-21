import { useCallback, useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { apiFetch } from '../../services/api';

const initialForm = { name: '', description: '', duration_minutes: 30, capacity_per_slot: 1, requires_approval: true, required_information_text: '', scheduling_restrictions_text: '{}' };

export default function ManageAppointmentTypes() {
    const { user } = useContext(AuthContext);
    const [types, setTypes] = useState([]);
    const [form, setForm] = useState(initialForm);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const loadTypes = useCallback(async () => {
        const response = await apiFetch('/api/admin/appointment-types', { headers: { Authorization: `Bearer ${user?.token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load appointment types.');
        setTypes(Array.isArray(data) ? data : []);
    }, [user?.token]);

    useEffect(() => {
        let active = true;
        Promise.resolve().then(loadTypes).catch(reason => {
            if (active) setError(reason.message || 'Could not load appointment types.');
        });
        return () => { active = false; };
    }, [loadTypes]);

    const saveType = async event => {
        event.preventDefault();
        setSaving(true);
        setError('');
        setMessage('');
        try {
            let schedulingRestrictions;
            try { schedulingRestrictions = JSON.parse(form.scheduling_restrictions_text || '{}'); }
            catch { throw new Error('Scheduling restrictions must be valid JSON.'); }
            const response = await apiFetch(editingId ? `/api/admin/appointment-types/${editingId}` : '/api/admin/appointment-types', {
                method: editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token}` },
                body: JSON.stringify({
                    ...form,
                    duration_minutes: Number(form.duration_minutes),
                    capacity_per_slot: Number(form.capacity_per_slot),
                    required_information: form.required_information_text.split(',').map(value => value.trim()).filter(Boolean),
                    scheduling_restrictions: schedulingRestrictions
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not save appointment type.');
            setForm(initialForm);
            setEditingId(null);
            setMessage(editingId ? 'Appointment type updated.' : 'Appointment type created inactive. Review it before making it bookable.');
            await loadTypes();
        } catch (reason) {
            setError(reason.message || 'Could not save appointment type.');
        } finally {
            setSaving(false);
        }
    };

    const editType = type => {
        setEditingId(type.id);
        setForm({
            name: type.name,
            description: type.description || '',
            duration_minutes: type.duration_minutes,
            capacity_per_slot: type.capacity_per_slot,
            requires_approval: type.requires_approval,
            required_information_text: type.required_information.join(', '),
            scheduling_restrictions_text: JSON.stringify(type.scheduling_restrictions, null, 2)
        });
        setError('');
        setMessage('');
    };

    const toggleType = async type => {
        setError('');
        setMessage('');
        try {
            const response = await apiFetch(`/api/admin/appointment-types/${type.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token}` },
                body: JSON.stringify({ is_active: !type.is_active })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not update appointment type.');
            await loadTypes();
        } catch (reason) {
            setError(reason.message || 'Could not update appointment type.');
        }
    };

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Appointment Types</h1>
                <p>Configure clinic-approved services. New types start inactive and must be reviewed before students can book them.</p>
            </div>
            <section className="section-card form-card">
                {error && <p className="alert alert-error" role="alert">{error}</p>}
                {message && <p className="alert alert-success" role="status">{message}</p>}
                <form className="appointment-form" onSubmit={saveType}>
                    <div className="form-group"><label htmlFor="type-name">Name</label><input id="type-name" required maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></div>
                    <div className="form-group"><label htmlFor="type-description">Description</label><textarea id="type-description" maxLength={1000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></div>
                    <div className="form-group"><label htmlFor="type-duration">Duration (minutes)</label><input id="type-duration" type="number" min="5" max="480" required value={form.duration_minutes} onChange={event => setForm({ ...form, duration_minutes: event.target.value })} /></div>
                    <div className="form-group"><label htmlFor="type-capacity">Capacity per slot</label><input id="type-capacity" type="number" min="1" max="100" required value={form.capacity_per_slot} onChange={event => setForm({ ...form, capacity_per_slot: event.target.value })} /></div>
                    <div className="form-group"><label htmlFor="type-required-information">Required information fields (comma separated)</label><input id="type-required-information" value={form.required_information_text} onChange={event => setForm({ ...form, required_information_text: event.target.value })} /></div>
                    <div className="form-group"><label htmlFor="type-restrictions">Scheduling restrictions (JSON)</label><textarea id="type-restrictions" rows="4" value={form.scheduling_restrictions_text} onChange={event => setForm({ ...form, scheduling_restrictions_text: event.target.value })} /></div>
                    <label><input type="checkbox" checked={form.requires_approval} onChange={event => setForm({ ...form, requires_approval: event.target.checked })} /> Requires staff approval</label>
                    <button type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create appointment type'}</button>
                    {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(initialForm); }}>Cancel edit</button>}
                </form>
            </section>
            <section className="section-card" aria-labelledby="appointment-types-list-title">
                <h2 id="appointment-types-list-title">Configured types</h2>
                {types.length === 0 ? <p>No appointment types configured yet.</p> : types.map(type => (
                    <article key={type.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '16px 0', borderBottom: '1px solid #e2e8f0' }}>
                        <div><h3>{type.name}</h3><p>{type.description || 'No description'} · {type.duration_minutes} minutes · Capacity {type.capacity_per_slot} · {type.requires_approval ? 'Approval required' : 'Auto-confirm'}</p><p>{type.is_active ? 'Bookable by students' : 'Inactive'}</p></div>
                        <div style={{ display: 'flex', alignItems: 'start', gap: 8 }}><button type="button" onClick={() => editType(type)}>Edit</button><button type="button" onClick={() => toggleType(type)}>{type.is_active ? 'Deactivate' : 'Activate'}</button></div>
                    </article>
                ))}
            </section>
        </div>
    );
}
