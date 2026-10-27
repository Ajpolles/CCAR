import { useEffect, useRef, useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import {
    FileText, Search, Eye, Users, Activity, Clock, FileCheck, X
} from 'lucide-react';
import './PatientRecords.css';

const formatTime = (timeString) => {
    if (!timeString) return '—';
    const [hours, minutes] = String(timeString).split(':').map(Number);
    if (Number.isNaN(hours)) return '—';
    const date = new Date();
    date.setHours(hours, minutes || 0, 0, 0);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export default function PatientRecords() {
    const { user } = useContext(AuthContext);

    const [stats, setStats] = useState({ totalStudents: 0, withRecords: 0, newThisMonth: 0 });
    const [students, setStudents] = useState([]);
    const [filteredStudents, setFilteredStudents] = useState([]);
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);

    const [searchId, setSearchId] = useState('');
    const [courseFilter, setCourseFilter] = useState('All Courses');
    const [yearFilter, setYearFilter] = useState('All Year Levels');
    const [currentPage, setCurrentPage] = useState(1);

    // Read-only History Modal State
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [studentHistory, setStudentHistory] = useState([]);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);

    const itemsPerPage = 8;

    const fetchRecordsData = async () => {
        if (!user?.token) return;
        setLoading(true);
        try {
            const headers = { Authorization: `Bearer ${user.token}` };
            const [statsRes, studentsRes, activityRes] = await Promise.all([
                fetch('http://localhost:5000/api/admin/patient-records/stats', { headers }),
                fetch('http://localhost:5000/api/admin/patient-records/students', { headers }),
                fetch('http://localhost:5000/api/admin/patient-records/activity', { headers })
            ]);

            if (statsRes?.ok) setStats(await statsRes.json());
            if (studentsRes?.ok) {
                const data = await studentsRes.json();
                setStudents(data); 
                setFilteredStudents(data);
            }
            if (activityRes?.ok) setActivities(await activityRes.json());
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchRecordsData(); }, [user?.token]);

    const handleSearch = () => {
        let filtered = [...students];
        if (searchId.trim()) filtered = filtered.filter(s => String(s.student_number ?? '').toLowerCase().includes(searchId.trim().toLowerCase()));
        if (courseFilter !== 'All Courses') filtered = filtered.filter(s => s.course === courseFilter);
        if (yearFilter !== 'All Year Levels') filtered = filtered.filter(s => s.year_level === yearFilter);
        setFilteredStudents(filtered); 
        setCurrentPage(1);
    };

    const handleClear = () => { 
        setSearchId(''); 
        setCourseFilter('All Courses'); 
        setYearFilter('All Year Levels'); 
        setFilteredStudents(students); 
        setCurrentPage(1); 
    };

    // Opens Read-Only History Modal
    const handleViewDetails = async (student) => {
        setSelectedStudent(student); 
        setIsHistoryModalOpen(true); 
        setHistoryLoading(true);
        try {
            const res = await fetch(`http://localhost:5000/api/admin/patient-records/${student.id}/history`, { headers: { Authorization: `Bearer ${user?.token}` } });
            setStudentHistory(res.ok ? await res.json() : []);
        } catch { 
            setStudentHistory([]); 
        } finally { 
            setHistoryLoading(false); 
        }
    };

    const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
    const paginatedStudents = filteredStudents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="patient-records-container" style={{ padding: '24px' }}>
            <div className="page-heading">
                <div className="title-icon-wrapper bg-blue-light"><FileText size={28} className="text-blue" /></div>
                <div className="title-text">
                    <h2>Patient Records</h2>
                    <p>View student information and read-only medical history.</p>
                </div>
            </div>

            <div className="records-stats-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <div className="stat-card-modern">
                    <div className="stat-icon-wrapper bg-blue-light"><Users size={20} className="text-blue" /></div>
                    <div className="stat-title">Total Registered Students</div>
                    <div className="stat-value">{loading ? '...' : stats.totalStudents}</div>
                    <div className="stat-trend trend-green">Registered students</div>
                </div>
                <div className="stat-card-modern">
                    <div className="stat-icon-wrapper bg-green-light"><FileCheck size={20} className="text-green" /></div>
                    <div className="stat-title">With Medical Records</div>
                    <div className="stat-value">{loading ? '...' : stats.withRecords}</div>
                    <div className="stat-trend trend-green">Medical records tracked</div>
                </div>
                <div className="stat-card-modern">
                    <div className="stat-icon-wrapper bg-orange-light"><Clock size={20} className="text-orange" /></div>
                    <div className="stat-title">New This Month</div>
                    <div className="stat-value">{loading ? '...' : stats.newThisMonth}</div>
                    <div className="stat-trend trend-green">New records this month</div>
                </div>
            </div>

            <div className="records-grid-layout">
                <div className="left-column">
                    <div className="card-panel table-card">
                        <div className="panel-header border-none padding-bottom-small">
                            <div className="panel-title"><Users size={20} className="text-blue" /><h3>Registered Students</h3></div>
                        </div>

                        <div className="records-toolbar">
                            <div className="search-input-wrapper">
                                <Search size={18} className="text-gray-400" />
                                <input type="text" placeholder="Search student number..." value={searchId} onChange={e => setSearchId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                            </div>
                            <select className="filter-select" value={courseFilter} onChange={e => setCourseFilter(e.target.value)}>
                                <option value="All Courses">All Courses</option><option value="BSCS">BSCS</option><option value="BSIT">BSIT</option><option value="BSN">BSN</option><option value="BSCE">BSCE</option><option value="BSBA">BSBA</option>
                            </select>
                            <select className="filter-select" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
                                <option value="All Year Levels">All Year Levels</option><option value="1st Year">1st Year</option><option value="2nd Year">2nd Year</option><option value="3rd Year">3rd Year</option><option value="4th Year">4th Year</option>
                            </select>
                            <button type="button" className="btn-primary" onClick={handleSearch}>Search</button>
                            <button type="button" className="btn-secondary" onClick={handleClear}>Clear</button>
                        </div>

                        <div className="table-responsive">
                            <table className="clean-table">
                                <thead>
                                    <tr>
                                        <th>Student Number</th>
                                        <th>Full Name</th>
                                        <th>Course/Yr</th>
                                        <th>Total Records</th>
                                        <th>Last Visit</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (<tr><td colSpan="6" className="empty-text">Loading students...</td></tr>) : paginatedStudents.length > 0 ? (
                                        paginatedStudents.map(student => (
                                            <tr key={student.id}>
                                                <td><strong>{student.student_number || '—'}</strong></td>
                                                <td>{student.full_name || '—'}</td>
                                                <td>{student.course} - {student.year_level}</td>
                                                <td>{student.record_count || 0}</td>
                                                <td>{student.last_visit ? new Date(student.last_visit).toLocaleDateString() : 'No visits'}</td>
                                                <td>
                                                    <button type="button" className="action-view-btn" onClick={() => handleViewDetails(student)}><Eye size={14} /> View History</button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (<tr><td colSpan="6" className="empty-text">No students found.</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                        <div className="pagination-container">
                            <div className="pagination-info">Showing page {currentPage} of {totalPages || 1}</div>
                            <div className="pagination-controls">
                                <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}>&lt;</button>
                                <button type="button" disabled={totalPages === 0 || currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}>&gt;</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="right-column">
                    <div className="card-panel">
                        <div className="panel-header"><div className="panel-title"><Clock size={18} className="text-blue" /><h3>Recent Activity</h3></div></div>
                        <div className="panel-body">
                            <div className="activity-timeline">
                                {activities.length > 0 ? (
                                    activities.map(activity => (
                                        <div key={activity.id} className="timeline-item">
                                            <div className="timeline-dot bg-green" />
                                            <div className="timeline-content">
                                                <p className="timeline-title">{activity.action_type || activity.action || 'System Event'}</p>
                                                <span className="timeline-time">{activity.created_at ? new Date(activity.created_at).toLocaleString() : '—'}</span>
                                            </div>
                                        </div>
                                    ))
                                ) : (<p className="empty-text py-4">No recent activity.</p>)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- Read-Only Student Medical History Modal --- */}
            {isHistoryModalOpen && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '16px' }}>
                    <div className="modal-content card-panel" style={{ width: '90%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#fff', padding: '24px', borderRadius: '8px' }}>
                        <div className="panel-header border-none padding-bottom-small" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div className="panel-title"><FileText size={20} className="text-blue" /><h3 style={{ margin: 0 }}>Student Medical History</h3></div>
                            <button type="button" onClick={() => setIsHistoryModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={24} className="text-gray-400 hover:text-gray-600" /></button>
                        </div>
                        
                        <div className="panel-subtitle" style={{ marginBottom: '20px', padding: '14px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', fontSize: '0.9em' }}>
                                <div><strong>Name:</strong> {selectedStudent?.full_name || '—'}</div>
                                <div><strong>Student Number:</strong> {selectedStudent?.student_number || '—'}</div>
                                <div><strong>Course / Year:</strong> {selectedStudent?.course} - {selectedStudent?.year_level}</div>
                                <div><strong>Total Recorded Visits:</strong> {studentHistory.length}</div>
                            </div>
                        </div>

                        <div className="table-responsive">
                            <table className="clean-table">
                                <thead>
                                    <tr>
                                        <th>Visit Date &amp; Time</th>
                                        <th>Reason &amp; Findings</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyLoading ? (
                                        <tr><td colSpan="3" className="empty-text">Loading medical history...</td></tr>
                                    ) : studentHistory.length > 0 ? (
                                        studentHistory.map(appt => (
                                            <tr key={appt.id}>
                                                <td>
                                                    <div style={{ fontWeight: '600' }}>{appt.appointment_date ? new Date(appt.appointment_date).toLocaleDateString() : '—'}</div>
                                                    <div style={{ fontSize: '0.85em', color: '#6b7280' }}>{formatTime(appt.appointment_time)}</div>
                                                </td>
                                                <td>
                                                    <div style={{ marginBottom: '6px' }}><strong>Reason:</strong> {appt.reason || '—'}</div>
                                                    {(appt.diagnosis_notes || appt.consultation_notes) ? (
                                                        <div style={{ fontSize: '0.9em', color: '#374151', backgroundColor: '#f3f4f6', padding: '8px', borderRadius: '4px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            {appt.diagnosis_notes && <div><strong>Diagnosis / Findings:</strong> {appt.diagnosis_notes}</div>}
                                                            {appt.consultation_notes && <div><strong>Consultation Notes:</strong> {appt.consultation_notes}</div>}
                                                        </div>
                                                    ) : (
                                                        <div style={{ fontSize: '0.85em', fontStyle: 'italic', color: '#9ca3af' }}>No consultation records documented yet.</div>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className={`status-badge badge-${(appt.status || 'unknown').toLowerCase()}`}>
                                                        {appt.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan="3" className="empty-text">No medical history found for this student.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}