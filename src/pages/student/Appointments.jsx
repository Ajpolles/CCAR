import { apiFetch } from '../../services/api';
import { useEffect, useState, useContext, useCallback } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { Calendar as CalendarIcon, Eye, X, Search } from 'lucide-react';
import './Dashboard.css';

export default function Appointments() {
    const { user } = useContext(AuthContext);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedAppt, setSelectedAppt] = useState(null);
    const [cancelling, setCancelling] = useState(false);
    const [actionMessage, setActionMessage] = useState({ text: '', type: '' });
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [informationRequests, setInformationRequests] = useState([]);
    const [informationResponses, setInformationResponses] = useState({});
    const [informationSaving, setInformationSaving] = useState(null);
    const [scheduleProposals, setScheduleProposals] = useState([]);
    const [proposalSaving, setProposalSaving] = useState(null);
    const [attendance, setAttendance] = useState(null);
    const [attendancePolicy, setAttendancePolicy] = useState({ self_checkin_enabled: false });
    const [checkingIn, setCheckingIn] = useState(false);
    const [rescheduleRequests, setRescheduleRequests] = useState([]);
    const [rescheduleTarget, setRescheduleTarget] = useState(null);
    const [scheduleOptions, setScheduleOptions] = useState([]);
    const [rescheduleForm, setRescheduleForm] = useState({ schedule_id: '', appointment_time: '', reason: '' });
    const [rescheduleSaving, setRescheduleSaving] = useState(false);
    const [withdrawingRequest, setWithdrawingRequest] = useState(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const token = user?.token;

    const fetchAppointments = useCallback(async () => {
        try {
            const res = await apiFetch('/api/appointments', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAppointments(data);
            }
        } catch {
            console.error("Failed to fetch appointments");
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        // The appointment request synchronizes this history page with the API.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchAppointments();
    }, [fetchAppointments]);

    const handleCancelAppointment = async (apptId) => {
        if (!window.confirm('Are you sure you want to cancel this appointment?')) return;
        setCancelling(true);
        setActionMessage({ text: '', type: '' });
        try {
            const res = await apiFetch(`/api/appointments/${apptId}/cancel`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${user.token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to cancel appointment');
            setActionMessage({ text: 'Appointment cancelled successfully.', type: 'success' });
            setSelectedAppt(null);
            await fetchAppointments();
        } catch (err) {
            setActionMessage({ text: err.message, type: 'error' });
        } finally {
            setCancelling(false);
        }
    };

    const getStatusClass = (status) => {
        const s = String(status).toLowerCase();
        if (s === 'pending') return 'badge-pending';
        if (s === 'confirmed' || s === 'checked_in') return 'badge-confirmed';
        if (s === 'in_consultation') return 'badge-pending';
        if (s === 'completed') return 'badge-completed';
        if (s === 'cancelled' || s === 'rejected' || s === 'no_show') return 'badge-cancelled';
        return 'badge-default';
    };

    const formatStatusLabel = (status) => {
        if (!status) return 'Unknown';
        return String(status).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };
    const filteredAppointments = appointments.filter(appt => {
        const query = search.trim().toLowerCase();
        const matchesSearch = [appt.reference_number, appt.reason, appt.status, appt.appointment_date].some(value => String(value || '').toLowerCase().includes(query));
        return matchesSearch && (statusFilter === 'all' || String(appt.status || '').toLowerCase() === statusFilter);
    });

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>My Appointments</h1>
                <p>View and track the status of your clinic consultation requests.</p>
            </div>

            {actionMessage.text && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    fontWeight: '500',
                    backgroundColor: actionMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
                    color: actionMessage.type === 'success' ? '#166534' : '#dc2626'
                }}>
                    {actionMessage.text}
                </div>
            )}

            <div className="section-card">
                <div className="section-header">
                    <h3><CalendarIcon size={18} className="text-blue"/> Appointment History</h3>
                </div>
                <div style={{ display: 'flex', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}><Search size={16} /><input aria-label="Search appointments" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search date, status, or reason" /></label>
                    <select aria-label="Filter appointments by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{['pending', 'confirmed', 'checked_in', 'in_consultation', 'completed', 'cancelled', 'rejected', 'no_show'].map(status => <option key={status} value={status}>{formatStatusLabel(status)}</option>)}</select>
                    <button type="button" onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear filters</button>
                </div>
                
                <div className="table-responsive">
                    <table className="clean-table">
                        <thead>
                            <tr>
                                <th>Reference</th>
                                <th>Appointment Type</th>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Reason for Visit</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="7" className="empty-text">Loading appointments...</td></tr>
                            ) : filteredAppointments.length === 0 ? (
                                <tr><td colSpan="7" className="empty-text">{appointments.length ? 'No appointments match these filters.' : 'You have no appointment history. Book a new appointment to get started.'}</td></tr>
                            ) : (
                                filteredAppointments.map((appt) => (
                                    <tr key={appt.id}>
                                        <td>{appt.reference_number}</td>
                                        <td>{appt.appointment_type_name || 'Legacy appointment'}</td>
                                        <td style={{ fontWeight: '500' }}>
                                            {new Date(appt.appointment_date).toLocaleDateString('en-US', { 
                                                year: 'numeric', month: 'short', day: 'numeric' 
                                            })}
                                        </td>
                                        <td>{appt.appointment_time}</td>
                                        <td style={{ maxWidth: '300px' }}>{appt.reason}</td>
                                        <td>
                                            <span className={`status-badge ${getStatusClass(appt.status)}`}>
                                                {formatStatusLabel(appt.status)}
                                            </span>
                                        </td>
                                        <td>
                                            <button 
                                                type="button" 
                                                className="action-view-btn"
                                                onClick={async () => {
                                                    setSelectedAppt(appt);
                                                    setHistory([]);
                                                    setRescheduleRequests([]);
                                                    setInformationRequests([]);
                                                    setInformationResponses({});
                                                    setScheduleProposals([]);
                                                    setAttendance(null);
                                                    setHistoryLoading(true);
                                                    try {
                                                        const response = await apiFetch(`/api/appointments/${appt.id}/history`, { headers: { Authorization: `Bearer ${token}` } });
                                                        const data = await response.json();
                                                        if (!response.ok) throw new Error(data.error || 'Could not load appointment history.');
                                                        setHistory(data);
                                                        const requestResponse = await apiFetch(`/api/appointments/${appt.id}/reschedule-requests`, { headers: { Authorization: `Bearer ${token}` } });
                                                        const requests = await requestResponse.json();
                                                        if (!requestResponse.ok) throw new Error(requests.error || 'Could not load reschedule requests.');
                                                        setRescheduleRequests(requests);
                                                        const informationResponse = await apiFetch(`/api/appointments/${appt.id}/information-requests`, { headers: { Authorization: `Bearer ${token}` } });
                                                        const informationData = await informationResponse.json();
                                                        if (!informationResponse.ok) throw new Error(informationData.error || 'Could not load information requests.');
                                                        setInformationRequests(informationData);
                                                        const proposalResponse = await apiFetch(`/api/appointments/${appt.id}/schedule-proposals`, { headers: { Authorization: `Bearer ${token}` } });
                                                        const proposals = await proposalResponse.json();
                                                        if (!proposalResponse.ok) throw new Error(proposals.error || 'Could not load schedule proposals.');
                                                        setScheduleProposals(proposals);
                                                        const [attendanceResponse, policyResponse] = await Promise.all([
                                                            apiFetch(`/api/appointments/${appt.id}/attendance`, { headers: { Authorization: `Bearer ${token}` } }),
                                                            apiFetch('/api/attendance-policy', { headers: { Authorization: `Bearer ${token}` } })
                                                        ]);
                                                        const [attendanceData, policyData] = await Promise.all([attendanceResponse.json(), policyResponse.json()]);
                                                        if (!attendanceResponse.ok) throw new Error(attendanceData.error || 'Could not load attendance.');
                                                        if (!policyResponse.ok) throw new Error(policyData.error || 'Could not load check-in settings.');
                                                        setAttendance(attendanceData.attendance);
                                                        setAttendancePolicy(policyData);
                                                    } catch (error) {
                                                        setActionMessage({ text: error.message, type: 'error' });
                                                    } finally {
                                                        setHistoryLoading(false);
                                                    }
                                                }}
                                            >
                                                <Eye size={14} /> Details
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Appointment Details Modal */}
            {selectedAppt && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '16px'
                }}>
                    <div style={{
                        backgroundColor: '#fff',
                        borderRadius: '12px',
                        width: '100%',
                        maxWidth: '520px',
                        padding: '24px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>Appointment Details</h3>
                            <button
                                type="button"
                                onClick={() => setSelectedAppt(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                <span style={{ color: '#64748b', fontWeight: '500' }}>Reference</span>
                                <span style={{ fontWeight: '600', color: '#0f172a' }}>{selectedAppt.reference_number}</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                <span style={{ color: '#64748b', fontWeight: '500' }}>Date &amp; Time</span>
                                <span style={{ fontWeight: '600', color: '#0f172a' }}>
                                    {new Date(selectedAppt.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {selectedAppt.appointment_time}
                                </span>
                            </div>

                            <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                <strong style={{ display: 'block', marginBottom: '8px' }}>Appointment history</strong>
                                {historyLoading ? <span role="status">Loading history…</span> : history.length === 0 ? <span>No history available.</span> : history.map(item => (
                                    <div key={item.id} style={{ padding: '6px 0', borderTop: '1px solid #e2e8f0' }}>
                                        <span>{item.event_type === 'rescheduled' ? `Rescheduled to ${item.metadata?.to_date || ''} at ${String(item.metadata?.to_time || '').slice(0, 5)}` : formatStatusLabel(item.new_status)}</span>
                                        <span style={{ color: '#64748b' }}> · {new Date(item.created_at).toLocaleString()}</span>
                                        {item.reason && <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{item.reason}</p>}
                                    </div>
                                ))}
                            </div>

                            <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                <strong style={{ display: 'block', marginBottom: '8px' }}>Rescheduling requests</strong>
                                {rescheduleRequests.length === 0 ? <span>No reschedule requests.</span> : rescheduleRequests.map(item => (
                                    <div key={item.id} style={{ padding: '6px 0', borderTop: '1px solid #e2e8f0' }}>
                                        <span>{formatStatusLabel(item.status)} · {String(item.requested_date).slice(0, 10)} at {String(item.requested_time).slice(0, 5)}</span>
                                        {item.review_reason && <p style={{ margin: '4px 0 0' }}>{item.review_reason}</p>}
                                        {item.status === 'pending' && <button type="button" disabled={withdrawingRequest === item.id} onClick={async () => {
                                            setWithdrawingRequest(item.id);
                                            try {
                                                const response = await apiFetch(`/api/appointments/${selectedAppt.id}/reschedule-requests/${item.id}/cancel`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
                                                const data = await response.json();
                                                if (!response.ok) throw new Error(data.error || 'Could not withdraw reschedule request.');
                                                setRescheduleRequests(items => items.map(request => request.id === item.id ? data.request : request));
                                                setActionMessage({ text: data.message, type: 'success' });
                                            } catch (error) {
                                                setActionMessage({ text: error.message, type: 'error' });
                                            } finally {
                                                setWithdrawingRequest(null);
                                            }
                                        }}>{withdrawingRequest === item.id ? 'Withdrawing…' : 'Withdraw request'}</button>}
                                    </div>
                                ))}
                            </div>

                            <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                <strong style={{ display: 'block', marginBottom: '8px' }}>Clinic information requests</strong>
                                {informationRequests.length === 0 ? <span>No information requests.</span> : informationRequests.map(item => <div key={item.id} style={{ padding: '8px 0', borderTop: '1px solid #e2e8f0' }}>
                                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}><strong>Question:</strong> {item.question}</p>
                                    {item.response ? <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}><strong>Your response:</strong> {item.response}</p> : <form onSubmit={async event => {
                                        event.preventDefault();
                                        setInformationSaving(item.id);
                                        try {
                                            const response = await apiFetch(`/api/appointments/${selectedAppt.id}/information-requests/${item.id}`, {
                                                method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                body: JSON.stringify({ response: informationResponses[item.id] || '' })
                                            });
                                            const data = await response.json();
                                            if (!response.ok) throw new Error(data.error || 'Could not send your response.');
                                            setInformationRequests(items => items.map(request => request.id === item.id ? data.request : request));
                                            setActionMessage({ text: 'Your response was sent to the clinic.', type: 'success' });
                                        } catch (error) {
                                            setActionMessage({ text: error.message, type: 'error' });
                                        } finally {
                                            setInformationSaving(null);
                                        }
                                    }} style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                                        <label htmlFor={`information-response-${item.id}`}>Your response</label>
                                        <textarea id={`information-response-${item.id}`} value={informationResponses[item.id] || ''} onChange={event => setInformationResponses(values => ({ ...values, [item.id]: event.target.value }))} maxLength={2000} rows={3} required />
                                        <button type="submit" disabled={informationSaving === item.id || !(informationResponses[item.id] || '').trim()}>{informationSaving === item.id ? 'Sending…' : 'Send response'}</button>
                                    </form>}
                                </div>)}
                            </div>

                            <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                <strong style={{ display: 'block', marginBottom: '8px' }}>Alternative appointment times</strong>
                                {scheduleProposals.length === 0 ? <span>No alternatives proposed.</span> : scheduleProposals.map(item => <div key={item.id} style={{ padding: '8px 0', borderTop: '1px solid #e2e8f0' }}>
                                    <div><strong>{formatStatusLabel(item.status)}:</strong> {new Date(`${item.proposed_date}T00:00:00`).toLocaleDateString()} at {item.proposed_time}</div>
                                    {item.message && <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{item.message}</p>}
                                    {item.status === 'pending' && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                        <button type="button" disabled={proposalSaving === item.id} onClick={async () => {
                                            setProposalSaving(item.id);
                                            try {
                                                const response = await apiFetch(`/api/appointments/${selectedAppt.id}/schedule-proposals/${item.id}`, {
                                                    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                    body: JSON.stringify({ decision: 'accepted' })
                                                });
                                                const data = await response.json();
                                                if (!response.ok) throw new Error(data.error || 'Could not accept the proposed time.');
                                                setScheduleProposals(items => items.map(proposal => proposal.id === item.id ? data.proposal : proposal));
                                                setSelectedAppt(current => current?.id === selectedAppt.id ? {
                                                    ...current, appointment_date: item.proposed_date, appointment_time: item.proposed_time, schedule_id: item.schedule_id
                                                } : current);
                                                setActionMessage({ text: 'The proposed appointment time is confirmed.', type: 'success' });
                                                await fetchAppointments();
                                            } catch (error) {
                                                setActionMessage({ text: error.message, type: 'error' });
                                                if (error.message.includes('proposal expired')) setScheduleProposals(items => items.map(proposal => proposal.id === item.id ? { ...proposal, status: 'expired' } : proposal));
                                            } finally {
                                                setProposalSaving(null);
                                            }
                                        }}>{proposalSaving === item.id ? 'Saving…' : 'Accept'}</button>
                                        <button type="button" disabled={proposalSaving === item.id} onClick={async () => {
                                            setProposalSaving(item.id);
                                            try {
                                                const response = await apiFetch(`/api/appointments/${selectedAppt.id}/schedule-proposals/${item.id}`, {
                                                    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                    body: JSON.stringify({ decision: 'rejected' })
                                                });
                                                const data = await response.json();
                                                if (!response.ok) throw new Error(data.error || 'Could not decline the proposed time.');
                                                setScheduleProposals(items => items.map(proposal => proposal.id === item.id ? data.proposal : proposal));
                                            } catch (error) {
                                                setActionMessage({ text: error.message, type: 'error' });
                                            } finally {
                                                setProposalSaving(null);
                                            }
                                        }}>Decline</button>
                                    </div>}
                                    {item.response_reason && <p style={{ margin: '4px 0' }}>{item.response_reason}</p>}
                                </div>)}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                <span style={{ color: '#64748b', fontWeight: '500' }}>Current Status</span>
                                <span className={`status-badge ${getStatusClass(selectedAppt.status)}`}>
                                    {formatStatusLabel(selectedAppt.status)}
                                </span>
                            </div>

                            <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                <strong>Attendance:</strong> {attendance?.status?.replace(/_/g, ' ') || 'Not checked in'}
                                {attendance?.checked_in_at && <div>Checked in {new Date(attendance.checked_in_at).toLocaleString()}</div>}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                <span style={{ color: '#64748b', fontWeight: '500' }}>Appointment Type</span>
                                <span style={{ fontWeight: '600', color: '#0f172a' }}>{selectedAppt.appointment_type_name || 'Legacy appointment'}</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                <span style={{ color: '#64748b', fontWeight: '500' }}>Attending Staff</span>
                                <span style={{ fontWeight: '600', color: '#0f172a' }}>
                                    {[selectedAppt.admin_first_name, selectedAppt.admin_last_name].filter(Boolean).join(' ') || 'Assigned on arrival'}
                                </span>
                            </div>

                            <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                <span style={{ display: 'block', color: '#64748b', fontWeight: '500', marginBottom: '6px' }}>Reason for Visit:</span>
                                <p style={{ margin: 0, color: '#1e293b', whiteSpace: 'pre-wrap' }}>{selectedAppt.reason || 'None specified'}</p>
                            </div>
                            {Object.entries(selectedAppt.additional_information || {}).map(([field, value]) => <div key={field} style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                <span style={{ display: 'block', color: '#64748b', fontWeight: '500', marginBottom: '6px' }}>{field.replace(/[_-]/g, ' ')}:</span>
                                <p style={{ margin: 0, color: '#1e293b', whiteSpace: 'pre-wrap' }}>{value}</p>
                            </div>)}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            {String(selectedAppt.status).toLowerCase() === 'confirmed' && !attendance && attendancePolicy.self_checkin_enabled && (
                                <button type="button" disabled={checkingIn} onClick={async () => {
                                    setCheckingIn(true);
                                    setActionMessage({ text: '', type: '' });
                                    try {
                                        const response = await apiFetch(`/api/appointments/${selectedAppt.id}/check-in`, {
                                            method: 'POST', headers: { Authorization: `Bearer ${token}` }
                                        });
                                        const data = await response.json();
                                        if (!response.ok) throw new Error(data.error || 'Could not check in.');
                                        setAttendance(data.attendance);
                                        setActionMessage({ text: 'You are checked in. Your appointment status was not changed.', type: 'success' });
                                    } catch (error) {
                                        setActionMessage({ text: error.message, type: 'error' });
                                    } finally {
                                        setCheckingIn(false);
                                    }
                                }}>{checkingIn ? 'Checking in…' : 'Check in'}</button>
                            )}
                            {['pending', 'confirmed'].includes(String(selectedAppt.status).toLowerCase()) && !rescheduleRequests.some(item => item.status === 'pending') && (
                                <button type="button" onClick={async () => {
                                    setRescheduleForm({ schedule_id: '', appointment_time: '', reason: '' });
                                    setRescheduleTarget(selectedAppt);
                                    try {
                                        const response = await apiFetch('/api/schedules', { headers: { Authorization: `Bearer ${token}` } });
                                        const data = await response.json();
                                        if (!response.ok) throw new Error(data.error || 'Could not load schedules.');
                                        setScheduleOptions(data);
                                    } catch (error) {
                                        setActionMessage({ text: error.message, type: 'error' });
                                        setRescheduleTarget(null);
                                    }
                                }}>Request reschedule</button>
                            )}
                            {['pending', 'confirmed'].includes(String(selectedAppt.status).toLowerCase()) && (
                                <button
                                    type="button"
                                    onClick={() => handleCancelAppointment(selectedAppt.id)}
                                    disabled={cancelling}
                                    style={{
                                        padding: '8px 16px',
                                        backgroundColor: '#fee2e2',
                                        color: '#dc2626',
                                        border: '1px solid #fecaca',
                                        borderRadius: '6px',
                                        fontWeight: '600',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {cancelling ? 'Cancelling...' : 'Cancel Appointment'}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setSelectedAppt(null)}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: '#0f172a',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontWeight: '500',
                                    cursor: 'pointer'
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {rescheduleTarget && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center', padding: 16 }}>
                    <form role="dialog" aria-modal="true" aria-labelledby="student-reschedule-title" onSubmit={async event => {
                        event.preventDefault();
                        setRescheduleSaving(true);
                        try {
                            const response = await apiFetch(`/api/appointments/${rescheduleTarget.id}/reschedule-requests`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ ...rescheduleForm, appointment_date: String(scheduleOptions.find(item => String(item.id) === rescheduleForm.schedule_id)?.available_date || '').slice(0, 10) })
                            });
                            const data = await response.json();
                            if (!response.ok) throw new Error(data.error || 'Could not submit reschedule request.');
                            setActionMessage({ text: data.message, type: 'success' });
                            setRescheduleTarget(null);
                            setSelectedAppt(null);
                        } catch (error) {
                            setActionMessage({ text: error.message, type: 'error' });
                        } finally {
                            setRescheduleSaving(false);
                        }
                    }} style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 12, padding: 24, display: 'grid', gap: 12 }}>
                        <h3 id="student-reschedule-title" style={{ margin: 0 }}>Request a new appointment time</h3>
                        <p style={{ margin: 0 }}>Your current appointment stays in place until the clinic reviews this request. The new time is not reserved while it is pending.</p>
                        <label htmlFor="reschedule-schedule">Available clinic schedule</label>
                        <select id="reschedule-schedule" required value={rescheduleForm.schedule_id} onChange={event => setRescheduleForm({ ...rescheduleForm, schedule_id: event.target.value, appointment_time: '' })}>
                            <option value="">Choose a schedule</option>
                            {scheduleOptions.map(item => <option key={item.id} value={item.id}>{String(item.available_date).slice(0, 10)} · {String(item.start_time).slice(0, 5)}–{String(item.end_time).slice(0, 5)}</option>)}
                        </select>
                        <label htmlFor="reschedule-time">Preferred time</label>
                        <input id="reschedule-time" type="time" required value={rescheduleForm.appointment_time} onChange={event => setRescheduleForm({ ...rescheduleForm, appointment_time: event.target.value })} />
                        <label htmlFor="reschedule-reason">Reason for your request</label>
                        <textarea id="reschedule-reason" required maxLength={1000} rows={3} value={rescheduleForm.reason} onChange={event => setRescheduleForm({ ...rescheduleForm, reason: event.target.value })} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button type="button" onClick={() => setRescheduleTarget(null)}>Keep current appointment</button>
                            <button type="submit" disabled={rescheduleSaving || !scheduleOptions.some(item => String(item.id) === rescheduleForm.schedule_id)}>{rescheduleSaving ? 'Submitting…' : 'Send request'}</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
