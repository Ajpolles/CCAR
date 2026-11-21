import { useCallback, useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { apiFetch } from '../../services/api';

const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function AppointmentReports() {
    const { user } = useContext(AuthContext);
    const token = user?.token;
    const [filters, setFilters] = useState(() => {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 29);
        return { from: localDate(from), to: localDate(to), appointment_type_id: '', staff_id: '' };
    });
    const [types, setTypes] = useState([]);
    const [staff, setStaff] = useState([]);
    const [report, setReport] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const loadOptions = useCallback(async () => {
        const headers = { Authorization: `Bearer ${token}` };
        const [typesResponse, schedulesResponse] = await Promise.all([
            apiFetch('/api/appointment-types', { headers }), apiFetch('/api/admin/schedules', { headers })
        ]);
        const [typesData, schedulesData] = await Promise.all([typesResponse.json(), schedulesResponse.json()]);
        if (!typesResponse.ok || !schedulesResponse.ok) throw new Error(typesData.error || schedulesData.error || 'Could not load report filters.');
        setTypes(Array.isArray(typesData) ? typesData : typesData.appointmentTypes || []);
        const uniqueStaff = new Map(schedulesData.map(item => [item.user_id, item]));
        setStaff([...uniqueStaff.values()]);
    }, [token]);

    const loadReport = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const query = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)));
            const response = await apiFetch(`/api/admin/reports/appointments?${query}`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not load appointment report.');
            setReport(data);
        } catch (failure) { setError(failure.message); }
        finally { setLoading(false); }
    }, [filters, token]);

    useEffect(() => { Promise.resolve().then(loadOptions).catch(reason => setError(reason.message)); }, [loadOptions]);
    useEffect(() => { Promise.resolve().then(loadReport); }, [loadReport]);

    return <div className="dashboard-container">
        <div className="dashboard-header"><h1>Appointment Reports</h1><p>Counts come from current database records and can be filtered by date, appointment type, and assigned staff.</p></div>
        {error && <p role="alert" className="alert alert-error">{error}</p>}
        <section className="section-card"><form className="appointment-form" onSubmit={event => { event.preventDefault(); loadReport(); }}>
            <label>From<input type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} /></label>
            <label>Through<input type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} /></label>
            <label>Appointment type<select value={filters.appointment_type_id} onChange={event => setFilters({ ...filters, appointment_type_id: event.target.value })}><option value="">All types</option>{types.map(type => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label>
            <label>Staff<select value={filters.staff_id} onChange={event => setFilters({ ...filters, staff_id: event.target.value })}><option value="">All staff</option>{staff.map(item => <option value={item.user_id} key={item.user_id}>{item.admin_first_name} {item.admin_last_name}</option>)}</select></label>
            <button type="submit" disabled={loading}>{loading ? 'Loading…' : 'Update report'}</button>
        </form></section>
        {report && <>
            <section className="stats-grid-6" aria-label="Appointment report summary">
                {Object.entries(report.summary).map(([key, value]) => <article className="stat-card-modern" key={key}><div className="stat-title">{key.replaceAll('_', ' ')}</div><div className="stat-value">{value}</div></article>)}
            </section>
            <section className="section-card"><h2>By appointment type</h2><table className="clean-table"><thead><tr><th>Type</th><th>Appointments</th></tr></thead><tbody>{report.byType.map(item => <tr key={item.appointment_type}><td>{item.appointment_type}</td><td>{item.count}</td></tr>)}</tbody></table></section>
            <section className="section-card"><h2>Staff workload</h2><table className="clean-table"><thead><tr><th>Staff</th><th>Appointments</th><th>Completed</th></tr></thead><tbody>{report.staffWorkload.map(item => <tr key={item.staff_id}><td>{item.staff_name}</td><td>{item.appointments}</td><td>{item.completed}</td></tr>)}</tbody></table></section>
        </>}
    </div>;
}
