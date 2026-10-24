import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import '../student/Dashboard.css';

export default function PatientRecords() {
    const { user } = useContext(AuthContext);
    const [records, setRecords] = useState([]);
    const [students, setStudents] = useState([]);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [foundStudent, setFoundStudent] = useState(null);
    
    const [formData, setFormData] = useState({ 
        appointment_id: '', 
        visit_date: '', 
        diagnosis_notes: '', 
        consultation_notes: '' 
    });

    const fetchData = async () => {
        try {
            
            const recordsRes = await fetch('http://localhost:5000/api/admin/records', {
                headers: { 'Authorization': `Bearer ${user.token}` }
            });
            if (recordsRes.ok) setRecords(await recordsRes.json());

            
            const studentsRes = await fetch('http://localhost:5000/api/admin/students', {
                headers: { 'Authorization': `Bearer ${user.token}` }
            });
            if (studentsRes.ok) setStudents(await studentsRes.json());
        } catch (err) {
            console.error("Failed to fetch data:", err);
        }
    };

    useEffect(() => { 
        fetchData(); 
    }, [user.token]);

    
    const handleSearch = async (e) => {
        e.preventDefault();
        const res = await fetch(`http://localhost:5000/api/admin/users/search/${searchQuery}`, {
            headers: { 'Authorization': `Bearer ${user.token}` }
        });
        if (res.ok) {
            setFoundStudent(await res.json());
            setSearchQuery(''); 
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            alert('Student ID not found in the system.');
        }
    };

    
    const handleSelectFromTable = (student) => {
        setFoundStudent(student);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    
    const handleSubmitRecord = async (e) => {
        e.preventDefault();
        await fetch('http://localhost:5000/api/admin/records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
            body: JSON.stringify({ ...formData, student_db_id: foundStudent.id })
        });
        
        setFormData({ appointment_id: '', visit_date: '', diagnosis_notes: '', consultation_notes: '' });
        setFoundStudent(null); 
        fetchData(); 
    };

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Patient Records</h1>
                <p>Log and review medical histories.</p>
            </div>

            <div className="dashboard-sections" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', marginBottom: '32px' }}>
                
                <div className="form-card" style={{ maxWidth: '100%', height: 'fit-content' }}>
                    
                    {!foundStudent ? (
                        <>
                            <h2>Find Student</h2>
                            <p style={{ marginBottom: '16px' }}>Search by ID or select from the table below.</p>
                            <form onSubmit={handleSearch} className="form-group">
                                <label>Search by Student Number</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. 2026-0001"
                                        value={searchQuery} 
                                        onChange={e => setSearchQuery(e.target.value)} 
                                        required 
                                        style={{ flex: 1 }}
                                    />
                                    <button type="submit" className="submit-btn" style={{ marginTop: 0, padding: '0 16px', backgroundColor: '#3b82f6' }}>
                                        Search
                                    </button>
                                </div>
                            </form>
                        </>
                    ) : (
                        <>
                            <h2>Log New Record</h2>
                            <form onSubmit={handleSubmitRecord} className="appointment-form">
                                <div className="alert alert-success" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span><strong>Patient:</strong> {foundStudent.full_name} ({foundStudent.school_id})</span>
                                    <button 
                                        type="button" 
                                        onClick={() => setFoundStudent(null)} 
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}
                                    >
                                        Change Student
                                    </button>
                                </div>
                                
                                <div className="form-group">
                                    <label>Date of Visit</label>
                                    <input type="date" value={formData.visit_date} onChange={e => setFormData({...formData, visit_date: e.target.value})} required />
                                </div>
                                <div className="form-group">
                                    <label>Appt ID (Optional)</label>
                                    <input type="number" placeholder="Leave blank if walk-in" value={formData.appointment_id} onChange={e => setFormData({...formData, appointment_id: e.target.value})} />
                                </div>
                                <div className="form-group">
                                    <label>Diagnosis</label>
                                    <textarea value={formData.diagnosis_notes} onChange={e => setFormData({...formData, diagnosis_notes: e.target.value})} required rows="3" />
                                </div>
                                <div className="form-group">
                                    <label>Consultation Notes</label>
                                    <textarea value={formData.consultation_notes} onChange={e => setFormData({...formData, consultation_notes: e.target.value})} rows="3" />
                                </div>
                                
                                <button type="submit" className="submit-btn">Save Record</button>
                            </form>
                        </>
                    )}
                </div>

                <div className="section-card">
                    <h3>Recent Patient Records</h3>
                    <div className="records-list" style={{ marginTop: '16px' }}>
                        {records.length === 0 ? (
                            <p className="no-data">No medical records found.</p>
                        ) : (
                            records.map(rec => (
                                <div key={rec.id} className="record-item">
                                    <div className="record-header">
                                        <strong>{rec.student_name} ({rec.school_id})</strong> - {new Date(rec.visit_date).toLocaleDateString()}
                                    </div>
                                    <div className="record-body">
                                        <div className="record-field highlight">
                                            <span className="field-label">Diagnosis:</span>
                                            <span className="field-value">{rec.diagnosis_notes}</span>
                                        </div>
                                        <div className="record-field">
                                            <span className="field-label">Notes:</span>
                                            <span className="field-value">{rec.consultation_notes}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <div className="section-card">
                <h3>Registered Students</h3>
                <div style={{ overflowX: 'auto', marginTop: '16px' }}>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                <th style={{ padding: '12px', color: '#475569' }}>Student Number</th>
                                <th style={{ padding: '12px', color: '#475569' }}>Full Name</th>
                                <th style={{ padding: '12px', color: '#475569', textAlign: 'right' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.length === 0 ? (
                                <tr>
                                    <td colSpan="3" style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>No students registered yet.</td>
                                </tr>
                            ) : (
                                students.map(student => (
                                    <tr key={student.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '12px', fontWeight: '500' }}>{student.school_id}</td>
                                        <td style={{ padding: '12px' }}>{student.full_name}</td>
                                        <td style={{ padding: '12px', textAlign: 'right' }}>
                                            <button 
                                                onClick={() => handleSelectFromTable(student)}
                                                className="submit-btn"
                                                style={{ margin: 0, padding: '6px 16px', fontSize: '14px', backgroundColor: '#3b82f6' }}
                                            >
                                                Select Patient
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}