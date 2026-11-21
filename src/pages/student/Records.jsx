import { apiFetch } from '../../services/api';
import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { Calendar as CalendarIcon, Stethoscope, FileText } from 'lucide-react';
import './Dashboard.css';

export default function Records() {
    const { user } = useContext(AuthContext);
    const [records, setRecords] = useState([]);
    const [followUps, setFollowUps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [followUpMessage, setFollowUpMessage] = useState('');

    useEffect(() => {
        const fetchRecords = async () => {
            try {
                const res = await apiFetch('/api/student/records', {
                    headers: { 'Authorization': `Bearer ${user.token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setRecords(data);
                }
                const followUpResponse = await apiFetch('/api/student/follow-ups', {
                    headers: { 'Authorization': `Bearer ${user.token}` }
                });
                if (followUpResponse.ok) setFollowUps(await followUpResponse.json());
            } catch {
                console.error("Failed to fetch records");
            } finally {
                setLoading(false);
            }
        };
        fetchRecords();
    }, [user.token]);

    const requestFollowUp = async appointmentId => {
        setFollowUpMessage('');
        try {
            const response = await apiFetch(`/api/appointments/${appointmentId}/follow-ups`, {
                method: 'POST', headers: { Authorization: `Bearer ${user.token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not request follow-up care.');
            setFollowUps(items => [data.follow_up, ...items]);
            setFollowUpMessage('Follow-up request sent to the clinic. No appointment was booked automatically.');
        } catch (error) {
            setFollowUpMessage(error.message);
        }
    };

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Medical Records</h1>
                <p>View your past consultation history and diagnosis notes.</p>
            </div>

            <div className="section-card">
                <div className="section-header">
                    <h3><FileText size={18} className="text-blue"/> Consultation History</h3>
                </div>

                {followUpMessage && <p role="status">{followUpMessage}</p>}
                {loading ? (
                    <p className="empty-text">Loading records...</p>
                ) : records.length === 0 ? (
                    <p className="empty-text">No medical records found.</p>
                ) : (
                    <div className="records-list">
                        {records.map((record) => (
                            <div key={record.id} className="record-item">
                                <div className="record-header">
                                    <div className="record-date">
                                        <CalendarIcon size={16} className="text-blue" />
                                        <span>{new Date(record.visit_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                                    </div>
                                </div>
                                <div className="record-body">
                                    <div className="record-field">
                                        <span className="field-label">Reason for Visit:</span>
                                        <span className="field-value">{record.reason}</span>
                                    </div>
                                    <div className="record-field highlight">
                                        <span className="field-label"><Stethoscope size={16} className="text-blue"/> Diagnosis:</span>
                                        <span className="field-value">{record.diagnosis_notes || 'No specific diagnosis recorded.'}</span>
                                    </div>
                                    <div className="record-field">
                                        <span className="field-label">Consultation Notes:</span>
                                        <span className="field-value">{record.consultation_notes || 'N/A'}</span>
                                    </div>
                                    {record.chief_complaint && <div className="record-field"><span className="field-label">Chief complaint:</span><span className="field-value">{record.chief_complaint}</span></div>}
                                    {record.clinical_assessment && <div className="record-field"><span className="field-label">Clinical assessment:</span><span className="field-value">{record.clinical_assessment}</span></div>}
                                    {record.treatment && <div className="record-field"><span className="field-label">Treatment:</span><span className="field-value">{record.treatment}</span></div>}
                                    {record.medication_information && <div className="record-field"><span className="field-label">Medication information:</span><span className="field-value">{record.medication_information}</span></div>}
                                    {record.instructions && <div className="record-field"><span className="field-label">Instructions:</span><span className="field-value">{record.instructions}</span></div>}
                                    {record.follow_up_recommendation && <div className="record-field"><span className="field-label">Follow-up recommendation:</span><span className="field-value">{record.follow_up_recommendation}</span></div>}
                                    <button type="button" disabled={followUps.some(item => item.appointment_id === record.appointment_id && ['requested', 'scheduled'].includes(item.status))} onClick={() => requestFollowUp(record.appointment_id)}>
                                        {followUps.some(item => item.appointment_id === record.appointment_id && item.status === 'requested') ? 'Follow-up requested' : followUps.some(item => item.appointment_id === record.appointment_id && item.status === 'scheduled') ? 'Follow-up linked' : 'Request follow-up'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {followUps.length > 0 && <div className="section-card"><div className="section-header"><h3>Follow-up requests</h3></div>
                {followUps.map(item => <article key={item.id} style={{ padding: '10px 0', borderTop: '1px solid #e2e8f0' }}>
                    <strong>{item.status.replace('_', ' ')}</strong> · {item.recommendation || 'Clinic follow-up'}
                    {item.requested_date && ` · Requested for ${String(item.requested_date).slice(0, 10)}`}
                    {item.related_appointment_id && ` · Linked to appointment ${item.related_appointment_id}`}
                </article>)}
            </div>}
        </div>
    );
}
