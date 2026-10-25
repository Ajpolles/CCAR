import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import AppointmentSearchFilter from '../../components/AppointmentSearchFilter.jsx'


// Converts a date to YYYY-MM-DD (local time) so it can be compared with the date filters
const toInputDate = (value) => {
    const d = new Date(value);
    if (isNaN(d)) return '';
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
};

const SearchAppointments = () => {
    const { user } = useContext(AuthContext);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    useEffect(() => {
        const fetchAppointments = async () => {
            try {
                const res = await fetch('http://localhost:5000/api/appointments', {
                    headers: { 'Authorization': `Bearer ${user.token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setAppointments(data);
                }
            } catch (err) {
                console.error("Failed to fetch appointments");
            } finally {
                setLoading(false);
            }
        };
        fetchAppointments();
    }, [user.token]);

    const statuses = [...new Set(appointments.map(app => app.status))];

    const filteredAppointments = appointments.filter(app => {
        const q = search.trim().toLowerCase();
        const day = toInputDate(app.appointment_date);
        const matchesSearch = !q || [app.reason, app.status, app.appointment_time, day]
            .some(field => String(field || '').toLowerCase().includes(q));
        const matchesStatus = statusFilter === 'All' || app.status === statusFilter;
        const matchesFrom = !dateFrom || day >= dateFrom;
        const matchesTo = !dateTo || day <= dateTo;
        return matchesSearch && matchesStatus && matchesFrom && matchesTo;
    });

    const hasFilters = search || statusFilter !== 'All' || dateFrom || dateTo;

    const clearFilters = () => {
        setSearch('');
        setStatusFilter('All');
        setDateFrom('');
        setDateTo('');
    };

    return (
        <div>
            <h2>Search Appointments</h2>
            <div className="card" style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end', marginBottom: '10px' }}>
                    <input
                        type="search"
                        placeholder="Search by reason, status, date or time"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search appointments"
                        style={{ flex: '1 1 220px', padding: '8px' }}
                    />
                    <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
                        Status
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '6px' }}>
                            <option value="All">All</option>
                            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
                        From
                        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: '6px' }} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
                        To
                        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ padding: '6px' }} />
                    </label>
                    {hasFilters && (
                        <button type="button" onClick={clearFilters}>Clear filters</button>
                    )}
                </div>

                {loading ? (
                    <p>Loading appointments...</p>
                ) : appointments.length === 0 ? (
                    <p>No appointments found.</p>
                ) : (
                    <>
                        <p style={{ fontSize: '0.9rem' }} aria-live="polite">
                            Showing {filteredAppointments.length} of {appointments.length} appointments
                        </p>
                        {filteredAppointments.length === 0 ? (
                            <p>No appointments match your search. Try a different keyword or clear the filters.</p>
                        ) : (
                            <table>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Time</th>
                                        <th>Reason</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAppointments.map(app => (
                                        <tr key={app.id}>
                                            <td>{new Date(app.appointment_date).toLocaleDateString()}</td>
                                            <td>{app.appointment_time}</td>
                                            <td>{app.reason}</td>
                                            <td><span className={`badge ${app.status}`}>{app.status}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
export default SearchAppointments;