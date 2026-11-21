import { useCallback, useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { apiFetch } from '../../services/api';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const blankException = { kind: 'break', staff_id: 'self', start_date: '', end_date: '', all_day: false, start_time: '', end_time: '', reason: '' };

export default function ManageClinicAvailability() {
    const { user } = useContext(AuthContext);
    const [hours, setHours] = useState([]);
    const [exceptions, setExceptions] = useState([]);
    const [exceptionForm, setExceptionForm] = useState(blankException);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [affectedAppointments, setAffectedAppointments] = useState([]);
    const [attendancePolicy, setAttendancePolicy] = useState({ self_checkin_enabled: false, timezone: '', opens_minutes_before: '', closes_minutes_after: '' });
    const [clinicalPermissions, setClinicalPermissions] = useState([]);
    const [appointmentPolicy, setAppointmentPolicy] = useState({
        pending_requests_reserve_capacity: true, pending_expiration_minutes: '',
        max_active_appointments_per_student: '', student_cancellation_deadline_hours: '',
        clinic_timezone: '', reminder_offsets_text: '', reason: ''
    });

    const load = useCallback(async () => {
        const headers = { Authorization: `Bearer ${user?.token}` };
        const [hoursResponse, exceptionResponse, attendanceResponse, clinicalResponse, policyResponse] = await Promise.all([
            apiFetch('/api/admin/clinic-hours', { headers }),
            apiFetch('/api/admin/schedule-exceptions', { headers }),
            apiFetch('/api/admin/attendance-policy', { headers }),
            apiFetch('/api/admin/clinical-permissions', { headers }),
            apiFetch('/api/admin/appointment-policy', { headers })
        ]);
        const [hoursData, exceptionData, attendanceData, clinicalData, policyData] = await Promise.all([hoursResponse.json(), exceptionResponse.json(), attendanceResponse.json(), clinicalResponse.json(), policyResponse.json()]);
        if (!hoursResponse.ok || !exceptionResponse.ok || !attendanceResponse.ok || !clinicalResponse.ok || !policyResponse.ok) throw new Error(hoursData.error || exceptionData.error || attendanceData.error || clinicalData.error || policyData.error || 'Could not load clinic availability.');
        setHours(hoursData);
        setExceptions(exceptionData);
        setAttendancePolicy({ ...attendanceData, timezone: attendanceData.timezone || '',
            opens_minutes_before: attendanceData.opens_minutes_before ?? '', closes_minutes_after: attendanceData.closes_minutes_after ?? '' });
        setClinicalPermissions(clinicalData);
        setAppointmentPolicy({ ...policyData,
            pending_expiration_minutes: policyData.pending_expiration_minutes ?? '',
            max_active_appointments_per_student: policyData.max_active_appointments_per_student ?? '',
            student_cancellation_deadline_hours: policyData.student_cancellation_deadline_hours ?? '',
            clinic_timezone: policyData.clinic_timezone || '', reminder_offsets_text: (policyData.reminder_offsets_minutes || []).join(', '), reason: '' });
    }, [user?.token]);

    useEffect(() => {
        let active = true;
        Promise.resolve().then(load).catch(reason => { if (active) setError(reason.message); });
        return () => { active = false; };
    }, [load]);

    const saveHours = async (weekday, event) => {
        const form = new FormData(event.currentTarget);
        const is_closed = form.get('is_closed') === 'on';
        setError('');
        setMessage('');
        try {
            const response = await apiFetch(`/api/admin/clinic-hours/${weekday}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token}` },
                body: JSON.stringify({ open_time: form.get('open_time') || null, close_time: form.get('close_time') || null, is_closed })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not save clinic hours.');
            setAffectedAppointments(data.affected_appointments || []);
            setMessage(data.affected_appointments?.length
                ? `${days[weekday]} hours saved. ${data.affected_appointments.length} appointment${data.affected_appointments.length === 1 ? ' may' : 's may'} be affected; review the list below.`
                : `${days[weekday]} hours saved. No current appointments fall outside them.`);
            await load();
        } catch (reason) { setError(reason.message); }
    };

    const createException = async event => {
        event.preventDefault();
        setError('');
        setMessage('');
        try {
            const body = {
                ...exceptionForm,
                staff_id: exceptionForm.staff_id === 'all' ? null : user.user_id,
                end_date: exceptionForm.end_date || exceptionForm.start_date,
                start_time: exceptionForm.all_day ? null : exceptionForm.start_time,
                end_time: exceptionForm.all_day ? null : exceptionForm.end_time
            };
            delete body.all_day;
            const response = await apiFetch('/api/admin/schedule-exceptions', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token}` }, body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not add schedule exception.');
            setExceptionForm(blankException);
            setAffectedAppointments(data.affected_appointments || []);
            setMessage(data.affected_appointments?.length
                ? `Schedule exception saved. ${data.affected_appointments.length} appointment${data.affected_appointments.length === 1 ? ' may' : 's may'} be affected; review the list below.`
                : 'Schedule exception saved. No current appointments overlap it.');
            await load();
        } catch (reason) { setError(reason.message); }
    };

    const toggleException = async exception => {
        setError('');
        try {
            const response = await apiFetch(`/api/admin/schedule-exceptions/${exception.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token}` },
                body: JSON.stringify({ is_active: !exception.is_active })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not update schedule exception.');
            await load();
        } catch (reason) { setError(reason.message); }
    };

    const saveAttendancePolicy = async event => {
        event.preventDefault();
        setError('');
        setMessage('');
        try {
            const response = await apiFetch('/api/admin/attendance-policy', {
                method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token}` },
                body: JSON.stringify({
                    self_checkin_enabled: attendancePolicy.self_checkin_enabled,
                    timezone: attendancePolicy.timezone,
                    opens_minutes_before: attendancePolicy.opens_minutes_before === '' ? null : Number(attendancePolicy.opens_minutes_before),
                    closes_minutes_after: attendancePolicy.closes_minutes_after === '' ? null : Number(attendancePolicy.closes_minutes_after)
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not save attendance policy.');
            setAttendancePolicy({ ...data.policy, timezone: data.policy.timezone || '',
                opens_minutes_before: data.policy.opens_minutes_before ?? '', closes_minutes_after: data.policy.closes_minutes_after ?? '' });
            setMessage('Attendance policy saved and audited.');
        } catch (reason) { setError(reason.message); }
    };

    const saveClinicalPermissions = async staff => {
        setError('');
        setMessage('');
        try {
            const response = await apiFetch(`/api/admin/clinical-permissions/${staff.user_id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token}` },
                body: JSON.stringify({ can_view_records: staff.can_view_records, can_document: staff.can_document,
                    can_finalize: staff.can_finalize, reason: staff.permission_reason || '' })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not save clinical permissions.');
            setMessage(`Clinical access updated for ${staff.first_name} ${staff.last_name}.`);
            await load();
        } catch (reason) { setError(reason.message); }
    };

    const saveAppointmentPolicy = async event => {
        event.preventDefault();
        setError('');
        setMessage('');
        const offsets = appointmentPolicy.reminder_offsets_text.split(',').map(value => value.trim()).filter(Boolean).map(Number);
        try {
            const response = await apiFetch('/api/admin/appointment-policy', {
                method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token}` },
                body: JSON.stringify({
                    pending_requests_reserve_capacity: appointmentPolicy.pending_requests_reserve_capacity,
                    pending_expiration_minutes: appointmentPolicy.pending_expiration_minutes === '' ? null : Number(appointmentPolicy.pending_expiration_minutes),
                    max_active_appointments_per_student: appointmentPolicy.max_active_appointments_per_student === '' ? null : Number(appointmentPolicy.max_active_appointments_per_student),
                    student_cancellation_deadline_hours: appointmentPolicy.student_cancellation_deadline_hours === '' ? null : Number(appointmentPolicy.student_cancellation_deadline_hours),
                    clinic_timezone: appointmentPolicy.clinic_timezone || null, reminder_offsets_minutes: offsets,
                    reason: appointmentPolicy.reason
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not save appointment policy.');
            setMessage('Appointment policy saved and audited.');
            await load();
        } catch (reason) { setError(reason.message); }
    };

    return <div className="dashboard-container">
        <div className="dashboard-header"><h1>Clinic Availability</h1><p>Set weekly hours and record breaks, leave, closures, or other unavailable periods.</p></div>
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        {message && <p className="alert alert-success" role="status">{message}</p>}
        {affectedAppointments.length > 0 && <section className="section-card" aria-label="Appointments affected by schedule change">
            <h2>Appointments to review</h2>
            <p>The schedule change does not move or cancel existing appointments. Contact each student and propose another time if needed.</p>
            <div className="table-responsive"><table className="clean-table">
                <thead><tr><th>Reference</th><th>Student</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
                <tbody>{affectedAppointments.map(appointment => <tr key={appointment.id}>
                    <td>{appointment.reference_number}</td>
                    <td>{[appointment.student_first_name, appointment.student_last_name].filter(Boolean).join(' ') || 'Student account unavailable'}</td>
                    <td>{appointment.appointment_date}</td><td>{String(appointment.appointment_time).slice(0, 5)}</td><td>{appointment.status}</td>
                </tr>)}</tbody>
            </table></div>
        </section>}
        <section className="section-card"><h2>Weekly clinic hours</h2><p>Unconfigured weekdays do not restrict existing staff schedules.</p>
            {days.map((day, weekday) => {
                const current = hours.find(item => item.weekday === weekday) || {};
                return <form key={`${day}-${current.updated_at || 'unconfigured'}`} onSubmit={event => { event.preventDefault(); saveHours(weekday, event); }} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 12, padding: '12px 0', borderBottom: '1px solid #e2e8f0' }}>
                    <strong style={{ minWidth: 110 }}>{day}</strong>
                    <label>Opens<input name="open_time" type="time" defaultValue={String(current.open_time || '').slice(0, 5)} disabled={current.is_closed} /></label>
                    <label>Closes<input name="close_time" type="time" defaultValue={String(current.close_time || '').slice(0, 5)} disabled={current.is_closed} /></label>
                    <label><input name="is_closed" type="checkbox" defaultChecked={current.is_closed || false} /> Closed</label>
                    <button type="submit">Save</button>
                </form>;
            })}
        </section>
        <section className="section-card form-card"><h2>Student self check-in policy</h2>
            <p>Self check-in stays off until the clinic approves a timezone and before/after window. Staff-assisted attendance recording remains available.</p>
            <form className="appointment-form" onSubmit={saveAttendancePolicy}>
                <label><input type="checkbox" checked={attendancePolicy.self_checkin_enabled} onChange={event => setAttendancePolicy(policy => ({ ...policy, self_checkin_enabled: event.target.checked }))} /> Enable student self check-in</label>
                {attendancePolicy.self_checkin_enabled && <>
                    <div className="form-group"><label htmlFor="attendance-timezone">Clinic timezone (IANA)</label><input id="attendance-timezone" value={attendancePolicy.timezone} onChange={event => setAttendancePolicy(policy => ({ ...policy, timezone: event.target.value }))} placeholder="e.g. Asia/Manila" required /></div>
                    <div className="form-group"><label htmlFor="checkin-before">Opens before appointment (minutes)</label><input id="checkin-before" type="number" min="0" max="1440" value={attendancePolicy.opens_minutes_before} onChange={event => setAttendancePolicy(policy => ({ ...policy, opens_minutes_before: event.target.value }))} required /></div>
                    <div className="form-group"><label htmlFor="checkin-after">Closes after appointment (minutes)</label><input id="checkin-after" type="number" min="0" max="1440" value={attendancePolicy.closes_minutes_after} onChange={event => setAttendancePolicy(policy => ({ ...policy, closes_minutes_after: event.target.value }))} required /></div>
                </>}
                <button type="submit">Save attendance policy</button>
            </form>
        </section>
        <section className="section-card"><h2>Clinical record access</h2>
            <p>Administrative roles do not grant clinical access. Assign access only to staff authorized by clinic policy; every change is audited.</p>
            {clinicalPermissions.length === 0 ? <p>No active clinic staff accounts.</p> : clinicalPermissions.map(staff => <fieldset key={staff.user_id} style={{ margin: '14px 0', padding: 14, border: '1px solid #cbd5e1', borderRadius: 8 }}>
                <legend>{staff.first_name} {staff.last_name} {staff.position ? `· ${staff.position}` : ''}</legend>
                {[
                    ['can_view_records', 'View clinical records'],
                    ['can_document', 'Write consultation drafts'],
                    ['can_finalize', 'Finalize and amend records']
                ].map(([key, label]) => <label key={key} style={{ display: 'block', margin: '8px 0' }}><input type="checkbox" checked={staff[key]} disabled={(key === 'can_view_records' && staff.can_document) || (key === 'can_document' && staff.can_finalize)} onChange={event => setClinicalPermissions(items => items.map(item => item.user_id === staff.user_id ? {
                    ...item,
                    [key]: event.target.checked,
                    ...(key === 'can_view_records' && !event.target.checked ? { can_document: false, can_finalize: false } : {}),
                    ...(key === 'can_document' && !event.target.checked ? { can_finalize: false } : {})
                } : item))} /> {label}</label>)}
                <label style={{ display: 'block', margin: '8px 0' }}>Reason for permission change<input maxLength={1000} value={staff.permission_reason || ''} onChange={event => setClinicalPermissions(items => items.map(item => item.user_id === staff.user_id ? { ...item, permission_reason: event.target.value } : item))} required /></label>
                <button type="button" onClick={() => saveClinicalPermissions(staff)}>Save access</button>
                <small style={{ display: 'block', marginTop: 6 }}>Last updated {staff.updated_at ? new Date(staff.updated_at).toLocaleString() : 'Never'}{staff.granted_by_first_name ? ` by ${staff.granted_by_first_name} ${staff.granted_by_last_name}` : ''}</small>
            </fieldset>)}
        </section>
        <section className="section-card form-card"><h2>Appointment booking and reminder policy</h2>
            <p>Pending requests reserve capacity by default, matching current booking checks. Optional limits, expiration, cancellation deadlines, and in-app reminders remain unset until the clinic approves them.</p>
            <form className="appointment-form" onSubmit={saveAppointmentPolicy}>
                <label><input type="checkbox" checked={appointmentPolicy.pending_requests_reserve_capacity} onChange={event => setAppointmentPolicy(policy => ({ ...policy, pending_requests_reserve_capacity: event.target.checked }))} /> Pending requests reserve slot capacity</label>
                <div className="form-group"><label htmlFor="pending-expiration">Expire pending requests after minutes (blank disables)</label><input id="pending-expiration" type="number" min="5" max="43200" value={appointmentPolicy.pending_expiration_minutes} onChange={event => setAppointmentPolicy(policy => ({ ...policy, pending_expiration_minutes: event.target.value }))} /></div>
                <div className="form-group"><label htmlFor="student-booking-limit">Maximum active appointments per student (blank disables)</label><input id="student-booking-limit" type="number" min="1" max="100" value={appointmentPolicy.max_active_appointments_per_student} onChange={event => setAppointmentPolicy(policy => ({ ...policy, max_active_appointments_per_student: event.target.value }))} /></div>
                <div className="form-group"><label htmlFor="cancellation-deadline">Student cancellation deadline in hours (blank disables)</label><input id="cancellation-deadline" type="number" min="0" max="720" value={appointmentPolicy.student_cancellation_deadline_hours} onChange={event => setAppointmentPolicy(policy => ({ ...policy, student_cancellation_deadline_hours: event.target.value }))} /></div>
                <div className="form-group"><label htmlFor="appointment-policy-timezone">Clinic timezone for cancellation and reminder rules</label><input id="appointment-policy-timezone" value={appointmentPolicy.clinic_timezone} onChange={event => setAppointmentPolicy(policy => ({ ...policy, clinic_timezone: event.target.value }))} placeholder="e.g. Asia/Manila" /></div>
                <div className="form-group"><label htmlFor="reminder-offsets">In-app reminder offsets in minutes, comma separated (blank disables)</label><input id="reminder-offsets" value={appointmentPolicy.reminder_offsets_text} onChange={event => setAppointmentPolicy(policy => ({ ...policy, reminder_offsets_text: event.target.value }))} placeholder="e.g. 1440, 60" /></div>
                <div className="form-group"><label htmlFor="appointment-policy-reason">Reason for policy change</label><input id="appointment-policy-reason" required maxLength={1000} value={appointmentPolicy.reason} onChange={event => setAppointmentPolicy(policy => ({ ...policy, reason: event.target.value }))} /></div>
                <button type="submit">Save appointment policy</button>
            </form>
        </section>
        <section className="section-card form-card"><h2>Schedule exception</h2>
            <form className="appointment-form" onSubmit={createException}>
                <div className="form-group"><label htmlFor="exception-kind">Type</label><select id="exception-kind" value={exceptionForm.kind} onChange={event => setExceptionForm({ ...exceptionForm, kind: event.target.value })}>{['break', 'leave', 'closure', 'unavailable'].map(kind => <option key={kind} value={kind}>{kind}</option>)}</select></div>
                <div className="form-group"><label htmlFor="exception-scope">Applies to</label><select id="exception-scope" value={exceptionForm.staff_id} onChange={event => setExceptionForm({ ...exceptionForm, staff_id: event.target.value })}><option value="self">My schedule</option><option value="all">Entire clinic</option></select></div>
                <div className="form-group"><label htmlFor="exception-start-date">Start date</label><input id="exception-start-date" type="date" required value={exceptionForm.start_date} onChange={event => setExceptionForm({ ...exceptionForm, start_date: event.target.value })} /></div>
                <div className="form-group"><label htmlFor="exception-end-date">End date</label><input id="exception-end-date" type="date" min={exceptionForm.start_date} value={exceptionForm.end_date} onChange={event => setExceptionForm({ ...exceptionForm, end_date: event.target.value })} /></div>
                <label><input type="checkbox" checked={exceptionForm.all_day} onChange={event => setExceptionForm({ ...exceptionForm, all_day: event.target.checked })} /> All day</label>
                {!exceptionForm.all_day && <><div className="form-group"><label htmlFor="exception-start-time">From</label><input id="exception-start-time" type="time" required value={exceptionForm.start_time} onChange={event => setExceptionForm({ ...exceptionForm, start_time: event.target.value })} /></div><div className="form-group"><label htmlFor="exception-end-time">To</label><input id="exception-end-time" type="time" required value={exceptionForm.end_time} onChange={event => setExceptionForm({ ...exceptionForm, end_time: event.target.value })} /></div></>}
                <div className="form-group"><label htmlFor="exception-reason">Reason</label><input id="exception-reason" required maxLength={500} value={exceptionForm.reason} onChange={event => setExceptionForm({ ...exceptionForm, reason: event.target.value })} /></div>
                <button type="submit">Save exception</button>
            </form>
        </section>
        <section className="section-card"><h2>Recorded exceptions</h2>{exceptions.length === 0 ? <p>No exceptions recorded.</p> : exceptions.map(exception => <article key={exception.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid #e2e8f0' }}><div><strong>{exception.kind}</strong> · {exception.start_date}{exception.end_date !== exception.start_date ? ` – ${exception.end_date}` : ''}<p>{exception.staff_id === null ? 'Entire clinic' : `${exception.staff_first_name || ''} ${exception.staff_last_name || ''}`}: {exception.reason}</p></div><button type="button" onClick={() => toggleException(exception)}>{exception.is_active ? 'Deactivate' : 'Reactivate'}</button></article>)}</section>
    </div>;
}
