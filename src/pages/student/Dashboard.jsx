import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight,
    CalendarCheck2,
    CalendarClock,
    CalendarPlus,
    ClipboardList,
    HeartPulse,
    Sparkles,
} from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';

export default function Dashboard() {
    const { user } = useContext(AuthContext);
    const [appointments, setAppointments] = useState([]);
    const [recordsCount, setRecordsCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();

        const fetchDashboardData = async () => {
            try {
                const headers = { Authorization: `Bearer ${user.token}` };
                const [appointmentsResponse, recordsResponse] = await Promise.all([
                    fetch('/api/appointments', { headers, signal: controller.signal }),
                    fetch('/api/student/records', { headers, signal: controller.signal }),
                ]);
                const [appointmentsData, recordsData] = await Promise.all([
                    appointmentsResponse.json(),
                    recordsResponse.json(),
                ]);

                if (!appointmentsResponse.ok) {
                    throw new Error(appointmentsData.error || 'Could not load your appointments.');
                }
                if (!recordsResponse.ok) {
                    throw new Error(recordsData.error || 'Could not load your medical records.');
                }

                setAppointments(appointmentsData);
                setRecordsCount(recordsData.length);
            } catch (fetchError) {
                if (fetchError.name !== 'AbortError') {
                    setError(fetchError.message || 'Could not load your dashboard.');
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        fetchDashboardData();
        return () => controller.abort();
    }, [user?.token]);

    const pendingCount = appointments.filter(appointment => appointment.status === 'pending').length;
    const confirmedCount = appointments.filter(appointment => appointment.status === 'confirmed').length;

    return (
        <div className="dashboard-page">
            <section className="dashboard-welcome">
                <div className="welcome-content">
                    <div className="welcome-label"><Sparkles size={14} /> Your health, your pace</div>
                    <h1>Good to see you, {user?.name?.split(' ')[0] || 'there'}.</h1>
                    <p>Take care of yourself. Book a visit or check in on your upcoming clinic appointments.</p>
                </div>
                <div className="welcome-illustration" aria-hidden="true">
                    <HeartPulse size={48} strokeWidth={1.6} />
                </div>
            </section>

            {error && <div className="form-message" role="alert">{error}</div>}

            <section className="stats-grid" aria-label="Appointment summary">
                <article className="stat-card">
                    <div className="stat-icon mint"><ClipboardList size={19} /></div>
                    <div>
                        <div className="stat-value">{loading ? '—' : appointments.length}</div>
                        <div className="stat-label">Total appointments</div>
                    </div>
                </article>
                <article className="stat-card">
                    <div className="stat-icon amber"><CalendarClock size={19} /></div>
                    <div>
                        <div className="stat-value">{loading ? '—' : pendingCount}</div>
                        <div className="stat-label">Awaiting confirmation</div>
                    </div>
                </article>
                <article className="stat-card">
                    <div className="stat-icon blue"><CalendarCheck2 size={19} /></div>
                    <div>
                        <div className="stat-value">{loading ? '—' : confirmedCount}</div>
                        <div className="stat-label">Confirmed visits</div>
                    </div>
                </article>
                <article className="stat-card">
                    <div className="stat-icon mint"><HeartPulse size={19} /></div>
                    <div>
                        <div className="stat-value">{loading ? '—' : recordsCount}</div>
                        <div className="stat-label">Medical records</div>
                    </div>
                </article>
            </section>

            <section id="appointments" aria-labelledby="appointments-heading">
                <div className="section-heading">
                    <div>
                        <h2 id="appointments-heading">Your appointments</h2>
                        <p>Keep track of your clinic visits and requests.</p>
                    </div>
                    <Link className="text-link" to="/student/book-appointment">
                        Book a visit <ArrowRight size={15} />
                    </Link>
                </div>

                {loading ? (
                    <div className="card empty-state" role="status">Loading your appointments…</div>
                ) : error ? (
                    <div className="card empty-state">
                        <p>Your appointment list is unavailable right now.</p>
                    </div>
                ) : appointments.length === 0 ? (
                    <div className="card empty-state">
                        <div className="empty-state-icon"><CalendarPlus size={22} /></div>
                        <h3>No appointments yet</h3>
                        <p>When you book a clinic visit, its date and status will show up here.</p>
                        <Link className="btn-primary" to="/student/book-appointment">
                            <CalendarPlus size={16} /> Book an appointment
                        </Link>
                    </div>
                ) : (
                    <div className="card appointment-table-wrap">
                        <table className="appointment-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Time</th>
                                    <th>Reason for visit</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {appointments.slice(0, 6).map(appointment => (
                                    <tr key={appointment.id}>
                                        <td>{new Date(`${appointment.appointment_date}T00:00:00`).toLocaleDateString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                        })}</td>
                                        <td>{appointment.appointment_time?.slice(0, 5) || '—'}</td>
                                        <td>{appointment.reason}</td>
                                        <td>
                                            <span className={`badge ${appointment.status}`}>
                                                {appointment.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
