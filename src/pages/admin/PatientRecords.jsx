import { useEffect, useRef, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import {
    FileText,
    Search,
    Eye,
    PlusCircle,
    Users,
    Activity,
    FileSignature,
    Download,
    ChevronRight,
    Stethoscope,
    Clock,
    FileCheck
} from 'lucide-react';
import './PatientRecords.css';

export default function PatientRecords() {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const searchInputRef = useRef(null);

    const [stats, setStats] = useState({
        totalStudents: 0,
        withRecords: 0,
        newThisMonth: 0,
        activeConditions: 0
    });

    const [students, setStudents] = useState([]);
    const [filteredStudents, setFilteredStudents] = useState([]);
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);

    const [searchId, setSearchId] = useState('');
    const [courseFilter, setCourseFilter] = useState('All Courses');
    const [yearFilter, setYearFilter] = useState('All Year Levels');
    const [currentPage, setCurrentPage] = useState(1);

    const itemsPerPage = 8;

    useEffect(() => {
        let cancelled = false;

        const fetchRecordsData = async () => {
            if (!user?.token) {
                setLoading(false);
                return;
            }

            setLoading(true);

            try {
                const headers = {
                    Authorization: `Bearer ${user.token}`
                };

                const [statsRes, studentsRes, activityRes] = await Promise.all([
                    fetch('http://localhost:5000/api/admin/patient-records/stats', {
                        headers
                    }),
                    fetch('http://localhost:5000/api/admin/patient-records/students', {
                        headers
                    }),
                    fetch('http://localhost:5000/api/admin/patient-records/activity', {
                        headers
                    })
                ].map(request =>
                    request.catch(error => {
                        console.error('Patient records request failed:', error);
                        return null;
                    })
                ));

                if (cancelled) return;

                if (statsRes?.ok) {
                    const data = await statsRes.json();

                    if (!cancelled) {
                        setStats(previous => ({
                            ...previous,
                            ...data
                        }));
                    }
                }

                if (studentsRes?.ok) {
                    const data = await studentsRes.json();
                    const studentList = Array.isArray(data) ? data : [];

                    if (!cancelled) {
                        setStudents(studentList);
                        setFilteredStudents(studentList);
                    }
                }

                if (activityRes?.ok) {
                    const data = await activityRes.json();

                    if (!cancelled) {
                        setActivities(Array.isArray(data) ? data : []);
                    }
                }
            } catch (error) {
                if (!cancelled) {
                    console.error('Failed to fetch patient records data:', error);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchRecordsData();

        return () => {
            cancelled = true;
        };
    }, [user?.token]);

    const handleSearch = () => {
        let filtered = [...students];

        if (searchId.trim()) {
            const searchValue = searchId.trim().toLowerCase();

            filtered = filtered.filter(student =>
                String(student.student_number ?? '')
                    .toLowerCase()
                    .includes(searchValue)
            );
        }

        if (courseFilter !== 'All Courses') {
            filtered = filtered.filter(student =>
                student.course === courseFilter
            );
        }

        if (yearFilter !== 'All Year Levels') {
            filtered = filtered.filter(student =>
                student.year_level === yearFilter
            );
        }

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

    const handleViewAll = () => {
        handleClear();
    };

    const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);

    const paginatedStudents = filteredStudents.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const firstStudent = filteredStudents.length === 0
        ? 0
        : (currentPage - 1) * itemsPerPage + 1;

    const lastStudent = Math.min(
        currentPage * itemsPerPage,
        filteredStudents.length
    );

    return (
        <div className="patient-records-container" style={{ padding: '24px' }}>
            <div className="page-heading">
                <div className="title-icon-wrapper bg-blue-light">
                    <FileText size={28} className="text-blue" />
                </div>

                <div className="title-text">
                    <h2>Patient Records</h2>
                    <p>View and manage student medical records.</p>
                </div>
            </div>

            <div className="records-stats-grid">
                <div className="stat-card-modern">
                    <div className="stat-icon-wrapper bg-blue-light">
                        <Users size={20} className="text-blue" />
                    </div>
                    <div className="stat-title">Total Registered Students</div>
                    <div className="stat-value">
                        {loading ? '...' : stats.totalStudents}
                    </div>
                    <div className="stat-trend trend-green">
                        Registered students
                    </div>
                </div>

                <div className="stat-card-modern">
                    <div className="stat-icon-wrapper bg-green-light">
                        <FileCheck size={20} className="text-green" />
                    </div>
                    <div className="stat-title">With Medical Records</div>
                    <div className="stat-value">
                        {loading ? '...' : stats.withRecords}
                    </div>
                    <div className="stat-trend trend-green">
                        Medical records tracked
                    </div>
                </div>

                <div className="stat-card-modern">
                    <div className="stat-icon-wrapper bg-orange-light">
                        <PlusCircle size={20} className="text-orange" />
                    </div>
                    <div className="stat-title">New This Month</div>
                    <div className="stat-value">
                        {loading ? '...' : stats.newThisMonth}
                    </div>
                    <div className="stat-trend trend-green">
                        New records this month
                    </div>
                </div>

                <div className="stat-card-modern">
                    <div className="stat-icon-wrapper bg-purple-light">
                        <Stethoscope size={20} className="text-purple" />
                    </div>
                    <div className="stat-title">Active Medical Conditions</div>
                    <div className="stat-value">
                        {loading ? '...' : stats.activeConditions}
                    </div>
                    <div className="stat-trend trend-green">
                        Conditions being monitored
                    </div>
                </div>
            </div>

            <div className="records-grid-layout">
                <div className="left-column">
                    <div className="card-panel table-card">
                        <div className="panel-header border-none padding-bottom-small">
                            <div className="panel-title">
                                <Users size={20} className="text-blue" />
                                <h3>Registered Students</h3>
                            </div>
                        </div>

                        <p className="panel-subtitle">
                            Search and view student medical records.
                        </p>

                        <div className="records-toolbar">
                            <div className="search-input-wrapper">
                                <Search size={18} className="text-gray-400" />

                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="Search student number..."
                                    value={searchId}
                                    onChange={event => setSearchId(event.target.value)}
                                    onKeyDown={event => {
                                        if (event.key === 'Enter') {
                                            handleSearch();
                                        }
                                    }}
                                />
                            </div>

                            <select
                                className="filter-select"
                                value={courseFilter}
                                onChange={event => setCourseFilter(event.target.value)}
                            >
                                <option value="All Courses">All Courses</option>
                                <option value="BSCS">BSCS</option>
                                <option value="BSIT">BSIT</option>
                                <option value="BSN">BSN</option>
                                <option value="BSCE">BSCE</option>
                                <option value="BSBA">BSBA</option>
                            </select>

                            <select
                                className="filter-select"
                                value={yearFilter}
                                onChange={event => setYearFilter(event.target.value)}
                            >
                                <option value="All Year Levels">All Year Levels</option>
                                <option value="1st Year">1st Year</option>
                                <option value="2nd Year">2nd Year</option>
                                <option value="3rd Year">3rd Year</option>
                                <option value="4th Year">4th Year</option>
                            </select>

                            <button
                                type="button"
                                className="btn-primary"
                                onClick={handleSearch}
                            >
                                Search
                            </button>

                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={handleClear}
                            >
                                Clear
                            </button>
                        </div>

                        <div className="table-responsive">
                            <table className="clean-table">
                                <thead>
                                    <tr>
                                        <th>Student Number</th>
                                        <th>Full Name</th>
                                        <th>Course</th>
                                        <th>Year Level</th>
                                        <th>Last Visit</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan="6" className="empty-text">
                                                Loading students...
                                            </td>
                                        </tr>
                                    ) : paginatedStudents.length > 0 ? (
                                        paginatedStudents.map(student => (
                                            <tr key={student.id}>
                                                <td>
                                                    <strong>
                                                        {student.student_number || '—'}
                                                    </strong>
                                                </td>

                                                <td>{student.full_name || '—'}</td>
                                                <td>{student.course || '—'}</td>
                                                <td>{student.year_level || '—'}</td>

                                                <td>
                                                    {student.last_visit
                                                        ? new Date(student.last_visit).toLocaleDateString(
                                                            'en-US',
                                                            {
                                                                month: 'short',
                                                                day: '2-digit',
                                                                year: 'numeric'
                                                            }
                                                        )
                                                        : 'No visits'}
                                                </td>

                                                <td>
                                                    <button
                                                        type="button"
                                                        className="action-view-btn"
                                                        onClick={() =>
                                                            navigate(`/admin/records/${student.id}`)
                                                        }
                                                    >
                                                        <Eye size={14} />
                                                        View
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="6" className="empty-text">
                                                No students found matching the criteria.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="pagination-container">
                            <div className="pagination-info">
                                Showing {firstStudent}–{lastStudent} of{' '}
                                {filteredStudents.length} students
                            </div>

                            <div className="pagination-controls">
                                <button
                                    type="button"
                                    disabled={currentPage <= 1}
                                    onClick={() =>
                                        setCurrentPage(page => Math.max(page - 1, 1))
                                    }
                                >
                                    &lt;
                                </button>

                                {Array.from(
                                    { length: totalPages },
                                    (_, index) => index + 1
                                ).map(page => (
                                    <button
                                        type="button"
                                        key={page}
                                        className={currentPage === page ? 'active' : ''}
                                        onClick={() => setCurrentPage(page)}
                                    >
                                        {page}
                                    </button>
                                ))}

                                <button
                                    type="button"
                                    disabled={
                                        totalPages === 0 || currentPage >= totalPages
                                    }
                                    onClick={() =>
                                        setCurrentPage(page =>
                                            Math.min(page + 1, totalPages)
                                        )
                                    }
                                >
                                    &gt;
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="cta-banner">
                        <div className="cta-content">
                            <Stethoscope
                                size={32}
                                className="text-blue cta-icon"
                            />

                            <div>
                                <h4>Need to add a new patient record?</h4>
                                <p>
                                    Create a medical record for a registered student.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            className="btn-primary cta-btn"
                            onClick={() => navigate('/admin/records/new')}
                        >
                            + Add New Record
                        </button>
                    </div>
                </div>

                <div className="right-column">
                    <div className="card-panel">
                        <div className="panel-header">
                            <div className="panel-title">
                                <Activity size={18} className="text-blue" />
                                <h3>Quick Actions</h3>
                            </div>
                        </div>

                        <div className="panel-body quick-actions-list-detailed">
                            <button
                                type="button"
                                className="qa-item-detailed"
                                onClick={() => searchInputRef.current?.focus()}
                            >
                                <div className="qa-icon bg-blue-light">
                                    <Search size={18} className="text-blue" />
                                </div>

                                <div className="qa-text">
                                    <span className="qa-title">
                                        Search Patient Records
                                    </span>
                                    <span className="qa-desc">
                                        Find student medical records
                                    </span>
                                </div>

                                <ChevronRight
                                    size={16}
                                    className="text-gray-400 ml-auto"
                                />
                            </button>

                            <button
                                type="button"
                                className="qa-item-detailed"
                                onClick={handleViewAll}
                            >
                                <div className="qa-icon bg-purple-light">
                                    <FileSignature
                                        size={18}
                                        className="text-purple"
                                    />
                                </div>

                                <div className="qa-text">
                                    <span className="qa-title">
                                        View All Records
                                    </span>
                                    <span className="qa-desc">
                                        Browse the complete student list
                                    </span>
                                </div>

                                <ChevronRight
                                    size={16}
                                    className="text-gray-400 ml-auto"
                                />
                            </button>

                            <button
                                type="button"
                                className="qa-item-detailed"
                                onClick={() => navigate('/admin/records/new')}
                            >
                                <div className="qa-icon bg-green-light">
                                    <PlusCircle
                                        size={18}
                                        className="text-green"
                                    />
                                </div>

                                <div className="qa-text">
                                    <span className="qa-title">
                                        Add New Record
                                    </span>
                                    <span className="qa-desc">
                                        Create a new medical record
                                    </span>
                                </div>

                                <ChevronRight
                                    size={16}
                                    className="text-gray-400 ml-auto"
                                />
                            </button>

                            <button
                                type="button"
                                className="qa-item-detailed"
                                onClick={() =>
                                    window.open(
                                        'http://localhost:5000/api/admin/patient-records/export',
                                        '_blank',
                                        'noopener,noreferrer'
                                    )
                                }
                            >
                                <div className="qa-icon bg-orange-light">
                                    <Download
                                        size={18}
                                        className="text-orange"
                                    />
                                </div>

                                <div className="qa-text">
                                    <span className="qa-title">
                                        Export Records
                                    </span>
                                    <span className="qa-desc">
                                        Download patient data
                                    </span>
                                </div>

                                <ChevronRight
                                    size={16}
                                    className="text-gray-400 ml-auto"
                                />
                            </button>
                        </div>
                    </div>

                    <div className="card-panel">
                        <div className="panel-header">
                            <div className="panel-title">
                                <Clock size={18} className="text-blue" />
                                <h3>Recent Patient Activity</h3>
                            </div>

                            <button
                                type="button"
                                className="link-btn"
                                onClick={() => navigate('/admin/activity')}
                            >
                                View All
                            </button>
                        </div>

                        <div className="panel-body">
                            <div className="activity-timeline">
                                {activities.length > 0 ? (
                                    activities.map(activity => (
                                        <div
                                            key={activity.id}
                                            className="timeline-item"
                                        >
                                            <div className="timeline-dot bg-green" />

                                            <div className="timeline-content">
                                                <p className="timeline-title">
                                                    {activity.action_type || 'Record activity'}
                                                </p>

                                                <p className="timeline-target">
                                                    {activity.student_name || 'Unknown student'}
                                                    {activity.student_number
                                                        ? ` (${activity.student_number})`
                                                        : ''}
                                                </p>

                                                <span className="timeline-time">
                                                    {activity.created_at
                                                        ? new Date(
                                                            activity.created_at
                                                        ).toLocaleString('en-US', {
                                                            month: 'short',
                                                            day: '2-digit',
                                                            year: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })
                                                        : 'Time unavailable'}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="empty-text py-4">
                                        No recent records activity.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}