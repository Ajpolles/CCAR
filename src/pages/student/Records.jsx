import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { Calendar as CalendarIcon, Stethoscope } from 'lucide-react';
import './Dashboard.css';

export default function Records() {
    const { user } = useContext(AuthContext);
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRecords = async () => {
            try {
                const res = await fetch('http://localhost:5000/api/student/records', {
                    headers: { 'Authorization': `Bearer ${user.token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setRecords(data);
                }
            } catch (err) {
                console.error("Failed to fetch records");
            } finally {
                setLoading(false);
            }
        };
        fetchRecords();
    }, [user.token]);

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Medical Records</h1>
                <p>View your past consultation history and diagnosis notes.</p>
            </div>

            <div className="dashboard-sections">
                <div className="section-card">
                    <div className="section-header">
                        <h3>Consultation History</h3>
                    </div>

                    {loading ? (
                        <p className="no-data">Loading records...</p>
                    ) : records.length === 0 ? (
                        <p className="no-data">No medical records found.</p>
                    ) : (
                        <div className="records-list">
                            {records.map((record) => (
                                <div key={record.id} className="record-item">
                                    <div className="record-header">
                                        <div className="record-date">
                                            <CalendarIcon size={16} color="#64748b" />
                                            <span>{new Date(record.visit_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                                        </div>
                                    </div>
                                    <div className="record-body">
                                        <div className="record-field">
                                            <span className="field-label">Reason for Visit:</span>
                                            <span className="field-value">{record.reason}</span>
                                        </div>
                                        <div className="record-field highlight">
                                            <span className="field-label"><Stethoscope size={16}/> Diagnosis:</span>
                                            <span className="field-value">{record.diagnosis_notes || 'No specific diagnosis recorded.'}</span>
                                        </div>
                                        <div className="record-field">
                                            <span className="field-label">Consultation Notes:</span>
                                            <span className="field-value">{record.consultation_notes || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}