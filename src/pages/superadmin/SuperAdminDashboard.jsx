import { apiFetch } from '../../services/api';
import { useEffect, useState, useContext, useCallback } from 'react';
import { AuthContext } from '../../context/AuthContext';
import {
    Users,
    Shield,
    Calendar,
    Activity,
    UserPlus,
    UserCheck,
    UserX,
    Search,
    RefreshCw,
    LogOut,
    CheckCircle,
    X,
    Clock,
} from 'lucide-react';
import '../admin/AdminDashboard.css';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const chartColors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4', '#ef4444', '#64748b', '#ec4899'];
const formatTimestamp = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString();
};
const readApiJson = async (response) => {
    if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('The backend returned an HTML page for this API request. Restart the CCARS backend and check that VITE_API_URL points to it.');
    }
    try {
        return await response.json();
    } catch {
        throw new Error('The backend returned invalid JSON for this API request.');
    }
};

export default function SuperAdminDashboard() {
    const { user, logout } = useContext(AuthContext);

    const [stats, setStats] = useState(null);

    const [usersList, setUsersList] = useState([]);
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [analytics, setAnalytics] = useState(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(true);
    const [analyticsError, setAnalyticsError] = useState('');
    const [activityLoading, setActivityLoading] = useState(true);
    const [activityError, setActivityError] = useState('');
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Filter and search
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [courseFilter, setCourseFilter] = useState('');
    const [yearFilter, setYearFilter] = useState('');
    const [positionFilter, setPositionFilter] = useState('');
    const [managementTab, setManagementTab] = useState('students');
    const [accountsLoading, setAccountsLoading] = useState(true);
    const [accountError, setAccountError] = useState('');
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [editingAccount, setEditingAccount] = useState(null);
    const [accountForm, setAccountForm] = useState({});
    const [savingAccount, setSavingAccount] = useState(false);

    // Create Admin Modal
    const [showCreateAdminModal, setShowCreateAdminModal] = useState(false);
    const [accountCreationRole, setAccountCreationRole] = useState('admin');
    const [adminForm, setAdminForm] = useState({
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        password_confirmation: '',
        position: 'Clinic Nurse',
        contact_number: ''
    });
    const [submittingAdmin, setSubmittingAdmin] = useState(false);
    const [updatingUserId, setUpdatingUserId] = useState(null);
    const [trendPeriod, setTrendPeriod] = useState('30d');
    const token = user?.token;
    const displayCount = (value) => loading ? '…' : !stats && error ? '—' : new Intl.NumberFormat().format(value ?? 0);
    const unexpectedStatuses = analytics?.unexpectedStatuses ?? [];

    const fetchData = useCallback(async (signal) => {
        if (!token) return;
        setLoading(true);
        setError('');
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const response = await apiFetch('/api/super-admin/dashboard', { headers, signal });
            const data = await readApiJson(response);
            if (!response.ok) throw new Error(data?.error || 'Dashboard statistics are unavailable');
            if (!data || typeof data !== 'object') throw new Error('Dashboard response was invalid');
            if (!signal?.aborted) setStats(data);
            setError('');
        } catch (err) {
            if (!signal?.aborted) setError(err.message || 'Dashboard statistics are unavailable');
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [token]);

    const fetchAccounts = useCallback(async (signal) => {
        if (!token) return;
        setAccountsLoading(true);
        setAccountError('');
        const query = new URLSearchParams();
        if (searchQuery.trim()) query.set('search', searchQuery.trim());
        if (statusFilter !== 'all') query.set('status', statusFilter);
        if (managementTab === 'students') {
            if (courseFilter.trim()) query.set('course', courseFilter.trim());
            if (yearFilter.trim()) query.set('year_level', yearFilter.trim());
        } else if (positionFilter.trim()) query.set('position', positionFilter.trim());
        try {
            const response = await apiFetch(`/api/super-admin/${managementTab}?${query}`, {
                headers: { Authorization: `Bearer ${token}` }, signal
            });
            const data = await readApiJson(response);
            if (!response.ok) throw new Error(data?.error || 'Account list is unavailable');
            if (!Array.isArray(data)) throw new Error('Account list response was invalid');
            if (!signal?.aborted) setUsersList(data);
        } catch (err) {
            if (!signal?.aborted) setAccountError(err.message || 'Account list is unavailable');
        } finally {
            if (!signal?.aborted) setAccountsLoading(false);
        }
    }, [token, managementTab, searchQuery, statusFilter, courseFilter, yearFilter, positionFilter]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => fetchAccounts(controller.signal), 250);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [fetchAccounts]);

    useEffect(() => {
        const controller = new AbortController();
        // Fetching authenticated dashboard data is the external synchronization for this screen.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchData(controller.signal);
        return () => controller.abort();
    }, [fetchData]);

    const fetchAnalytics = useCallback(async (signal) => {
        if (!token) return;
        setAnalyticsLoading(true);
        setAnalyticsError('');
        try {
            const response = await apiFetch(`/api/super-admin/dashboard/analytics?period=${trendPeriod}`, {
                headers: { Authorization: `Bearer ${token}` }, signal
            });
            const isJson = (result) => result.headers.get('content-type')?.includes('json');
            let data;
            if (response.status === 404 || !isJson(response)) {
                const fallback = await apiFetch('/api/super-admin/dashboard', {
                    headers: { Authorization: `Bearer ${token}` }, signal
                });
                if (!fallback.ok || !isJson(fallback)) {
                    throw new Error('Analytics API returned HTML. Check VITE_API_URL and restart the backend to load the analytics route.');
                }
                const summary = await readApiJson(fallback);
                const trendKey = trendPeriod === '7d' ? 'trend7Days' : 'trend30Days';
                if (!Array.isArray(summary?.appointments?.byStatus) || !Array.isArray(summary?.appointments?.[trendKey])) {
                    throw new Error('Analytics API is unavailable and the dashboard response has no compatible trend data. Restart the backend.');
                }
                data = {
                    period: trendPeriod,
                    distributionScope: 'all_appointments',
                    statusDistribution: summary.appointments.byStatus,
                    unexpectedStatuses: summary.appointments.unexpectedStatuses || [],
                    dailyAppointments: summary.appointments[trendKey]
                };
            } else {
                data = await readApiJson(response);
                if (!response.ok) throw new Error(data?.error || 'Appointment analytics are unavailable');
            }
            if (!data || !Array.isArray(data.statusDistribution) || !Array.isArray(data.dailyAppointments)) {
                throw new Error('Appointment analytics response was invalid');
            }
            const count = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
            const validDate = (value) => {
                if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
                const date = new Date(`${value}T00:00:00Z`);
                return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
            };
            setAnalytics({
                ...data,
                statusDistribution: data.statusDistribution.filter(item => item && typeof item.status === 'string')
                    .map(item => ({ ...item, count: count(item.count) })),
                unexpectedStatuses: Array.isArray(data.unexpectedStatuses)
                    ? data.unexpectedStatuses.filter(item => item && typeof item.status === 'string')
                        .map(item => ({ ...item, count: count(item.count) }))
                    : [],
                dailyAppointments: data.dailyAppointments.filter(item => item && validDate(item.date))
                    .map(item => ({ ...item, count: count(item.count) }))
            });
        } catch (err) {
            if (!signal?.aborted) setAnalyticsError(err.message || 'Appointment analytics are unavailable');
        } finally {
            if (!signal?.aborted) setAnalyticsLoading(false);
        }
    }, [token, trendPeriod]);

    useEffect(() => {
        const controller = new AbortController();
        // The selected trend period synchronizes this chart with its API query.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchAnalytics(controller.signal);
        return () => controller.abort();
    }, [fetchAnalytics]);

    const fetchActivities = useCallback(async (signal) => {
        if (!token) return;
        setActivityLoading(true);
        setActivityError('');
        try {
            const response = await apiFetch('/api/super-admin/activity-logs?limit=15', {
                headers: { Authorization: `Bearer ${token}` }, signal
            });
            const data = await readApiJson(response);
            if (!response.ok) throw new Error(data?.error || 'Recent activities are unavailable');
            if (!Array.isArray(data)) throw new Error('Recent activity response was invalid');
            setActivities(data.filter(item => item && typeof item === 'object').map((item, index) => ({
                ...item,
                id: item.id ?? `activity-${index}`,
                actor_name: typeof item.actor_name === 'string' ? item.actor_name : 'Former Account',
                actor_role: typeof item.actor_role === 'string' ? item.actor_role : 'system',
                category: typeof item.category === 'string' ? item.category : '',
                description: typeof item.description === 'string' ? item.description : 'Activity recorded',
                created_at: typeof item.created_at === 'string' ? item.created_at : null
            })));
        } catch (err) {
            if (!signal?.aborted) setActivityError(err.message || 'Recent activities are unavailable');
        } finally {
            if (!signal?.aborted) setActivityLoading(false);
        }
    }, [token]);

    useEffect(() => {
        const controller = new AbortController();
        // Recent activity is independent from the overview and analytics requests.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchActivities(controller.signal);
        return () => controller.abort();
    }, [fetchActivities]);

    const refreshDashboard = () => {
        fetchData();
        fetchAccounts();
        fetchAnalytics();
        fetchActivities();
    };

    const loadAccount = async (account, edit = false) => {
        setAccountError('');
        try {
            const section = account.role === 'student' ? 'students' : account.role === 'super_admin' ? 'super-admins' : 'admins';
            const response = await apiFetch(`/api/super-admin/${section}/${account.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await readApiJson(response);
            if (!response.ok) throw new Error(data?.error || 'Could not load account profile');
            if (!data || typeof data !== 'object' || data.id !== account.id) throw new Error('Profile response was invalid');
            if (edit) {
                setAccountForm(data);
                setEditingAccount(data);
            } else setSelectedAccount(data);
        } catch (err) {
            setAccountError(err.message || 'Could not load account profile');
        }
    };

    const handleSaveAccount = async (event) => {
        event.preventDefault();
        setSavingAccount(true);
        setAccountError('');
        try {
            const section = editingAccount.role === 'student' ? 'students' : editingAccount.role === 'super_admin' ? 'super-admins' : 'admins';
            const response = await apiFetch(`/api/super-admin/${section}/${editingAccount.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(accountForm)
            });
            const data = await readApiJson(response);
            if (!response.ok) throw new Error(data?.error || 'Could not save account changes');
            setEditingAccount(null);
            setSuccessMsg('Account information updated.');
            await refreshDashboard();
        } catch (err) {
            setAccountError(err.message || 'Could not save account changes');
        } finally {
            setSavingAccount(false);
        }
    };

    const handleToggleStatus = async (targetUser) => {
        if (targetUser.id === (user?.userId ?? user?.id) && targetUser.is_active) {
            setError('You cannot deactivate your own account.');
            return;
        }
        const newStatus = targetUser.is_active ? 'inactive' : 'active';
        const actionLabel = targetUser.is_active ? 'deactivate' : 'activate';
        if (!window.confirm(`Are you sure you want to ${actionLabel} account for ${targetUser.first_name} ${targetUser.last_name}?`)) {
            return;
        }

        setUpdatingUserId(targetUser.id);
        setError('');
        setSuccessMsg('');

        try {
            const res = await apiFetch(`/api/super-admin/users/${targetUser.id}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${user.token}`
                },
                    body: JSON.stringify({ account_status: newStatus })
            });

            const data = await readApiJson(res);
            if (!res.ok) throw new Error(data.error || 'Failed to update account status');

            setSuccessMsg(`Account for ${targetUser.first_name} successfully ${newStatus === 'active' ? 'activated' : 'deactivated'}.`);
            await refreshDashboard();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (err) {
            setError(err.message || 'Status update failed');
        } finally {
            setUpdatingUserId(null);
        }
    };

    const handleCreateAdmin = async (e) => {
        e.preventDefault();
        if (adminForm.password !== adminForm.password_confirmation) {
            setError('Passwords do not match.');
            return;
        }
        setSubmittingAdmin(true);
        setError('');
        setSuccessMsg('');

        try {
            const res = await apiFetch(`/api/super-admin/${accountCreationRole === 'super_admin' ? 'super-admins' : 'admins'}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${user.token}`
                },
                body: JSON.stringify(adminForm)
            });

            const data = await readApiJson(res);
            if (!res.ok) throw new Error(data.error || 'Failed to create staff account');

            setSuccessMsg(`${accountCreationRole === 'super_admin' ? 'Super Admin' : 'Clinic Staff'} account created for ${adminForm.first_name} ${adminForm.last_name}!`);
            setShowCreateAdminModal(false);
            setAdminForm({
                first_name: '',
                last_name: '',
                email: '',
                password: '',
                password_confirmation: '',
                position: 'Clinic Nurse',
                contact_number: ''
            });
            await refreshDashboard();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (err) {
            setError(err.message || 'Failed to create admin');
        } finally {
            setSubmittingAdmin(false);
        }
    };

    const filteredUsers = usersList;

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', color: '#1e293b' }}>
            {/* Top Navigation */}
            <header style={{
                backgroundColor: '#0f172a',
                color: '#fff',
                padding: '16px 32px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ backgroundColor: '#10b981', padding: '8px', borderRadius: '8px', display: 'flex' }}>
                        <Shield size={24} color="#fff" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700' }}>CCARS Super Admin</h2>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>System Governance &amp; Centralized Accounts</span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                        <div style={{ fontWeight: '600' }}>{user?.name || 'Super Administrator'}</div>
                        <div style={{ color: '#10b981' }}>Authorized Super Admin</div>
                    </div>
                    <button
                        type="button"
                        onClick={logout}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: '#334155',
                            color: '#fff',
                            border: 'none',
                            padding: '8px 14px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: '500'
                        }}
                    >
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0, 1fr)', maxWidth: '1500px', margin: '0 auto' }}>
                <aside aria-label="Super Admin navigation" style={{ padding: '28px 16px', background: '#f1f5f9', borderRight: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Navigation</div>
                    {[['Overview', '#dashboard'], ['Accounts', '#accounts'], ['Analytics', '#analytics'], ['Recent activity', '#activity']].map(([label, href]) => (
                        <a key={href} href={href} style={{ display: 'block', padding: '10px 12px', borderRadius: 6, color: '#334155', textDecoration: 'none' }}>{label}</a>
                    ))}
                </aside>
            <main id="dashboard" style={{ minWidth: 0, padding: '32px 24px' }}>
                <div style={{ marginBottom: 20 }}>
                    <h1 style={{ margin: 0, color: '#0f172a', fontSize: '1.5rem' }}>System overview</h1>
                    <p style={{ margin: '6px 0 0', color: '#64748b' }}>Welcome, {user?.name || 'Super Administrator'}. Review accounts, appointments, and clinic activity.</p>
                </div>
                {/* Status messages */}
                {successMsg && (
                    <div style={{
                        backgroundColor: '#dcfce7',
                        color: '#166534',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        marginBottom: '20px',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <CheckCircle size={18} /> {successMsg}
                    </div>
                )}

                {error && (
                    <div style={{
                        backgroundColor: '#fee2e2',
                        color: '#dc2626',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        marginBottom: '20px',
                        fontWeight: '500'
                    }}>
                        {error}
                    </div>
                )}

                {/* Stat cards */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '20px',
                    marginBottom: '32px'
                }}>
                    <div className="stat-card-modern">
                        <div className="stat-icon-wrapper bg-blue-light">
                            <Users size={22} className="text-blue" />
                        </div>
                        <div className="stat-title">Total Students</div>
                        <div className="stat-value">{displayCount(stats?.accounts?.students?.total)}</div>
                    </div>

                    <div className="stat-card-modern">
                        <div className="stat-icon-wrapper bg-green-light">
                            <Shield size={22} className="text-green" />
                        </div>
                        <div className="stat-title">Admin / Clinic Staff</div>
                        <div className="stat-value">{displayCount(stats?.accounts?.admins?.total)}</div>
                    </div>

                    <div className="stat-card-modern">
                        <div className="stat-icon-wrapper bg-purple-light">
                            <Calendar size={22} className="text-purple" />
                        </div>
                        <div className="stat-title">Total Appointments</div>
                        <div className="stat-value">{displayCount(stats?.appointments?.total)}</div>
                    </div>

                    <div className="stat-card-modern">
                        <div className="stat-icon-wrapper bg-orange-light">
                            <Activity size={22} className="text-orange" />
                        </div>
                        <div className="stat-title">System Activity Logs</div>
                        <div className="stat-value">{displayCount(stats?.totalActivityLogs)}</div>
                    </div>
                    {[
                        ['Total Registered Accounts', stats?.accounts?.total], ['Total Super Admins', stats?.accounts?.superAdmins?.total],
                        ['Active Accounts', stats?.accounts?.active], ['Inactive Accounts', stats?.accounts?.inactive],
                        ['Total Patient Records', stats?.patientRecords?.total],
                        ['Records Linked to Appointments', stats?.patientRecords?.associated_with_appointments]
                    ].map(([label, value]) => <div className="stat-card-modern" key={label}>
                        <div className="stat-title">{label}</div><div className="stat-value">{displayCount(value)}</div>
                    </div>)}
                </div>

                <section id="analytics" className="card-panel" style={{ marginBottom: 24 }}>
                    <div className="panel-header"><div className="panel-title"><Calendar size={20} className="text-purple" /><h3>Appointment analytics</h3></div>
                        <select aria-label="Appointment trend period" value={trendPeriod} onChange={event => setTrendPeriod(event.target.value)}>
                            <option value="7d">Last 7 days</option><option value="30d">Last 30 days</option>
                        </select>
                    </div>
                    <div className="panel-body">
                        {analyticsLoading ? <p>Loading appointment analytics…</p> : analyticsError ? <div role="alert" style={{ color: '#b91c1c' }}>
                            <p>{analyticsError}</p><button type="button" className="link-btn" onClick={() => fetchAnalytics()}>Retry analytics</button>
                        </div> : <>
                            <p style={{ color: '#64748b', marginTop: 0 }}>Status distribution includes all appointments. Daily trend shows {trendPeriod === '7d' ? 'the last 7 days' : 'the last 30 days'}, including today.</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                                <div>
                                    <h4>Appointments by status</h4>
                                    {analytics?.statusDistribution?.some(item => item.count > 0) ? <div style={{ height: 260 }}>
                                        <ResponsiveContainer>
                                            <PieChart>
                                                <Pie data={analytics.statusDistribution} dataKey="count" nameKey="status" outerRadius={82}>
                                                    {analytics.statusDistribution.map((item, index) => <Cell key={item.status} fill={chartColors[index % chartColors.length]} />)}
                                                </Pie>
                                                <Tooltip /><Legend formatter={value => String(value).replace(/_/g, ' ')} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div> : <p className="empty-text">No appointments to chart by status.</p>}
                                </div>
                                <div>
                                    <h4>Daily appointment trend</h4>
                                    {analytics?.dailyAppointments?.some(item => item.count > 0) ? <div style={{ height: 260 }}>
                                        <ResponsiveContainer>
                                            <BarChart data={analytics.dailyAppointments}>
                                                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={date => date.slice(5)} />
                                                <YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" name="Appointments" fill="#10b981" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div> : <p className="empty-text">No appointments in this period.</p>}
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16 }}>
                                {analytics.statusDistribution.map(item => <div key={item.status} style={{ background: '#f8fafc', padding: 12, borderRadius: 8 }}>
                                    <div style={{ color: '#64748b', textTransform: 'capitalize' }}>{item.status.replace(/_/g, ' ')}</div>
                                    <strong>{displayCount(item.count)}</strong>
                                </div>)}
                            </div>
                            {analytics?.unexpectedStatuses?.length > 0 && <p role="status" style={{ color: '#b45309', marginBottom: 0 }}>
                                Unexpected appointment statuses: {unexpectedStatuses.map(item => `${item.status} (${displayCount(item.count)})`).join(', ')}
                            </p>}
                        </>}
                    </div>
                </section>

                {/* Management Section */}
                <div id="accounts" style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr', gap: '24px' }}>
                    {/* User Accounts Directory */}
                    <div className="card-panel">
                        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="panel-title">
                                <Users size={20} className="text-blue" />
                                <h3>{managementTab === 'students' ? 'Student Management' : managementTab === 'admins' ? 'Admin / Clinic Staff Management' : 'Super Admin Management'}</h3>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {managementTab === 'admins' && <button
                                    type="button"
                                    onClick={() => { setAccountCreationRole('admin'); setShowCreateAdminModal(true); }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        backgroundColor: '#10b981',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '7px 14px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    <UserPlus size={16} /> Add Clinic Staff
                                </button>}
                                {managementTab === 'super-admins' && <button type="button" onClick={() => { setAccountCreationRole('super_admin'); setShowCreateAdminModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#fff', border: 0, padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}><UserPlus size={16} /> Add Super Admin</button>}
                                <button
                                    type="button"
                                    onClick={refreshDashboard}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        backgroundColor: '#f1f5f9',
                                        color: '#475569',
                                        border: '1px solid #cbd5e1',
                                        padding: '7px 12px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    <RefreshCw size={14} className={loading ? 'schedule-spinning' : ''} /> Refresh
                                </button>
                            </div>
                        </div>

                        <div style={{ padding: '12px 20px 0', display: 'flex', gap: 8 }}>
                            {['students', 'admins', 'super-admins'].map(tab => (
                                <button key={tab} type="button" onClick={() => { setManagementTab(tab); setSearchQuery(''); setStatusFilter('all'); }}
                                    aria-pressed={managementTab === tab}
                                    style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #cbd5e1', cursor: 'pointer', background: managementTab === tab ? '#dbeafe' : '#fff', color: '#1e3a8a', fontWeight: 600 }}>
                                    {tab === 'students' ? 'Students' : tab === 'admins' ? 'Admins / Clinic Staff' : 'Super Admins'}
                                </button>
                            ))}
                        </div>

                        {/* Filters */}
                        <div style={{
                            padding: '16px 20px',
                            borderBottom: '1px solid #f1f5f9',
                            display: 'flex',
                            gap: '12px',
                            flexWrap: 'wrap',
                            alignItems: 'center'
                        }}>
                            <div style={{
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                padding: '0 12px',
                                flex: 1,
                                minWidth: '220px'
                            }}>
                                <Search size={16} className="text-gray-400" style={{ marginRight: '8px' }} />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder={managementTab === 'students' ? 'Search by name, email, or student number...' : managementTab === 'admins' ? 'Search by name, email, or position...' : 'Search by name or email...'}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        padding: '8px 0',
                                        fontSize: '0.85rem',
                                        outline: 'none',
                                        width: '100%'
                                    }}
                                />
                            </div>

                            {managementTab === 'students' ? <>
                                <input aria-label="Filter by course" placeholder="Course" value={courseFilter} onChange={e => setCourseFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', width: 120 }} />
                                <input aria-label="Filter by year level" placeholder="Year level" value={yearFilter} onChange={e => setYearFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', width: 120 }} />
                            </> : managementTab === 'admins' ? <input aria-label="Filter by position" placeholder="Position" value={positionFilter} onChange={e => setPositionFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', width: 150 }} /> : null}

                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    background: 'white',
                                    fontSize: '0.85rem'
                                }}
                            >
                                <option value="all">All Statuses</option>
                                <option value="active">Active Only</option>
                                <option value="inactive">Inactive Only</option>
                            </select>
                            <button type="button" onClick={() => { setSearchQuery(''); setCourseFilter(''); setYearFilter(''); setPositionFilter(''); setStatusFilter('all'); }} className="link-btn">Clear filters</button>
                        </div>

                        {accountError && <div role="alert" style={{ padding: '10px 20px', color: '#b91c1c' }}>{accountError}</div>}

                        {/* Table */}
                        <div className="panel-body table-responsive">
                            <table className="clean-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>User</th>
                                        <th>{managementTab === 'students' ? 'Student / Academic' : managementTab === 'admins' ? 'Position' : 'Account'}</th>
                                        {managementTab === 'super-admins' && <th>Creator</th>}
                                        <th>Contact / Email</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {accountsLoading ? (
                                        <tr>
                                                <td colSpan={managementTab === 'super-admins' ? 7 : 6} className="empty-text">Loading {managementTab} records...</td>
                                        </tr>
                                    ) : filteredUsers.length === 0 ? (
                                        <tr>
                                                <td colSpan={managementTab === 'super-admins' ? 7 : 6} className="empty-text">No {managementTab} found matching filters.</td>
                                        </tr>
                                    ) : (
                                        filteredUsers.map(u => (
                                            <tr key={u.id}>
                                                <td>{u.id}</td>
                                                <td>
                                                    <div style={{ fontWeight: '600', color: '#0f172a' }}>
                                                        {u.first_name} {u.last_name}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                        Created: {new Date(u.created_at).toLocaleDateString()}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        backgroundColor: u.role === 'admin' ? '#e0e7ff' : u.role === 'super_admin' ? '#ede9fe' : '#f1f5f9',
                                                        color: u.role === 'admin' ? '#3730a3' : u.role === 'super_admin' ? '#6d28d9' : '#334155',
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        {managementTab === 'admins' ? (u.position || 'Clinic Staff') : managementTab === 'super-admins' ? 'Super Admin' : 'Student'}
                                                    </span>
                                                    {managementTab === 'students' && u.student_number && (
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                                            No: {u.student_number} · {[u.course, u.year_level, u.section].filter(Boolean).join(' · ')}
                                                        </div>
                                                    )}
                                                </td>
                                                {managementTab === 'super-admins' && <td>{u.creator_name || 'System / initial account'}</td>}
                                                <td>
                                                    <div style={{ fontSize: '0.85rem' }}>{u.email}</div>
                                                    {u.contact_number && (
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                            {u.contact_number}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className={`status-badge ${u.is_active ? 'badge-confirmed' : 'badge-cancelled'}`}>
                                                        {u.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                    <button type="button" onClick={() => loadAccount(u)} className="link-btn">View</button>
                                                    <button type="button" onClick={() => loadAccount(u, true)} className="link-btn">Edit</button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleStatus(u)}
                                                        disabled={updatingUserId === u.id || (u.id === (user?.userId ?? user?.id) && u.is_active)}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            padding: '5px 10px',
                                                            borderRadius: '6px',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '600',
                                                            backgroundColor: u.is_active ? '#fee2e2' : '#dcfce7',
                                                            color: u.is_active ? '#dc2626' : '#166534'
                                                        }}
                                                    >
                                                        {u.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
                                                        {u.is_active ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Activity Feed Column */}
                    <div className="card-panel" id="activity">
                        <div className="panel-header">
                            <div className="panel-title">
                                <Clock size={18} className="text-blue" />
                                <h3>Audit Logs</h3>
                            </div>
                        </div>

                        <div className="panel-body" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                            <div className="activity-feed">
                                {activityLoading ? <p>Loading recent activities…</p> : activityError ? (
                                    <div role="alert" style={{ color: '#b91c1c' }}>
                                        <p>{activityError}</p><button type="button" className="link-btn" onClick={() => fetchActivities()}>Retry activities</button>
                                    </div>
                                ) : activities.length > 0 ? (
                                    activities.slice(0, 15).map(act => (
                                        <div key={act.id} className="activity-row" style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: '500', color: '#1e293b', overflowWrap: 'anywhere' }}>
                                                {act.actor_name || 'Former user'} · {act.description || act.action}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                                                {act.category ? `${act.category.replace(/_/g, ' ')} · ` : ''}Role: <span style={{ fontWeight: '600', color: '#64748b' }}>{act.actor_role || 'system'}</span>
                                                {act.target_role ? ` · Target role ${act.target_role.replace(/_/g, ' ')}` : ''}
                                                {act.target_status ? ` · Target ${act.target_status}` : ''}
                                                {act.target_email && act.target_role ? ` · ${act.target_email}` : ''} · {formatTimestamp(act.created_at)}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="empty-text">No activity recorded yet.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
            </div>

            {/* Create Admin Modal */}
            {showCreateAdminModal && (
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
                        maxWidth: '480px',
                        padding: '24px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '16px',
                            borderBottom: '1px solid #e2e8f0',
                            paddingBottom: '12px'
                        }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>Create {accountCreationRole === 'super_admin' ? 'Super Admin' : 'Clinic Staff'} Account</h3>
                            <button
                                type="button"
                                onClick={() => setShowCreateAdminModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '4px' }}>First Name *</label>
                                    <input
                                        type="text"
                                        required
                                        value={adminForm.first_name}
                                        onChange={e => setAdminForm({ ...adminForm, first_name: e.target.value })}
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '4px' }}>Last Name *</label>
                                    <input
                                        type="text"
                                        required
                                        value={adminForm.last_name}
                                        onChange={e => setAdminForm({ ...adminForm, last_name: e.target.value })}
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '4px' }}>Email Address *</label>
                                <input
                                    type="email"
                                    required
                                    value={adminForm.email}
                                    onChange={e => setAdminForm({ ...adminForm, email: e.target.value })}
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '4px' }}>Password (min 8 chars) *</label>
                                <input
                                    type="password"
                                    required
                                    minLength={8}
                                    value={adminForm.password}
                                    onChange={e => setAdminForm({ ...adminForm, password: e.target.value })}
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '4px' }}>Confirm Password *</label>
                                <input type="password" required minLength={8} value={adminForm.password_confirmation}
                                    onChange={e => setAdminForm({ ...adminForm, password_confirmation: e.target.value })}
                                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    {accountCreationRole === 'admin' && <><label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '4px' }}>Position / Title</label>
                                    <select
                                        value={adminForm.position}
                                        onChange={e => setAdminForm({ ...adminForm, position: e.target.value })}
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    >
                                        <option value="Clinic Nurse">Clinic Nurse</option>
                                        <option value="Clinic Physician">Clinic Physician</option>
                                        <option value="Dentist">Dentist</option>
                                        <option value="Health Services Administrator">Health Administrator</option>
                                    </select>
                                    </>}
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '4px' }}>Contact Number</label>
                                    <input
                                        type="tel"
                                        placeholder="0917 123 4567"
                                        value={adminForm.contact_number}
                                        onChange={e => setAdminForm({ ...adminForm, contact_number: e.target.value })}
                                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowCreateAdminModal(false)}
                                    style={{
                                        padding: '8px 16px',
                                        backgroundColor: '#f1f5f9',
                                        color: '#475569',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: '500'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingAdmin}
                                    style={{
                                        padding: '8px 16px',
                                        backgroundColor: '#10b981',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: '600'
                                    }}
                                >
                                    {submittingAdmin ? 'Creating...' : 'Create Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {selectedAccount && (
                <div role="presentation" onClick={() => setSelectedAccount(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
                    <section role="dialog" aria-modal="true" aria-labelledby="account-profile-title" onClick={event => event.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, padding: 24, maxHeight: '90vh', overflow: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 id="account-profile-title">{selectedAccount.role === 'student' ? 'Student Profile' : selectedAccount.role === 'super_admin' ? 'Super Admin Profile' : 'Clinic Staff Profile'}</h3>
                            <button type="button" aria-label="Close profile" onClick={() => setSelectedAccount(null)}><X size={20} /></button>
                        </div>
                        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
                            {[
                                ['Name', selectedAccount.name], ['ID', selectedAccount.id],
                                ...(selectedAccount.role === 'student' ? [['Student number', selectedAccount.student_number], ['Course', selectedAccount.course], ['Year level', selectedAccount.year_level], ['Section', selectedAccount.section]] : [...(selectedAccount.role === 'admin' ? [['Position', selectedAccount.position]] : []), ['Created by', selectedAccount.creator_name || 'Unavailable']]),
                                ['Email', selectedAccount.email], ['Contact', selectedAccount.contact_number || 'Unavailable'],
                                ['Status', selectedAccount.is_active ? 'Active' : 'Inactive'], ['Registered', selectedAccount.created_at ? formatTimestamp(selectedAccount.created_at) : 'Unavailable'],
                                ['Last updated', selectedAccount.updated_at ? formatTimestamp(selectedAccount.updated_at) : 'Unavailable']
                            ].map(([label, value]) => <div key={label}><dt style={{ color: '#64748b', fontSize: 12 }}>{label}</dt><dd style={{ margin: '2px 0 0', overflowWrap: 'anywhere' }}>{value || 'Unavailable'}</dd></div>)}
                        </dl>
                    </section>
                </div>
            )}

            {editingAccount && (
                <div role="presentation" onClick={() => setEditingAccount(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
                    <form onSubmit={handleSaveAccount} role="dialog" aria-modal="true" aria-labelledby="edit-account-title" onClick={event => event.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, padding: 24, maxHeight: '90vh', overflow: 'auto', display: 'grid', gap: 12 }}>
                        <h3 id="edit-account-title">Edit {editingAccount.role === 'student' ? 'Student' : editingAccount.role === 'super_admin' ? 'Super Admin' : 'Clinic Staff'} Information</h3>
                        {accountError && <div role="alert" style={{ color: '#b91c1c' }}>{accountError}</div>}
                        {(editingAccount.role === 'student'
                            ? [['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email'], ['student_number', 'Student number'], ['course', 'Course'], ['year_level', 'Year level'], ['section', 'Section'], ['contact_number', 'Contact number']]
                            : [['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email'], ...(editingAccount.role === 'admin' ? [['position', 'Position']] : []), ['contact_number', 'Contact number']]
                        ).map(([key, label]) => <label key={key} style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>{label}
                            {key === 'position' ? <select value={accountForm.position ?? ''} onChange={event => setAccountForm({ ...accountForm, position: event.target.value })} style={{ padding: 9, border: '1px solid #cbd5e1', borderRadius: 6 }}>
                                {['Clinic Nurse', 'Clinic Physician', 'Dentist', 'Health Services Administrator', ...(accountForm.position && !['Clinic Nurse', 'Clinic Physician', 'Dentist', 'Health Services Administrator'].includes(accountForm.position) ? [accountForm.position] : [])].map(position => <option key={position} value={position}>{position}</option>)}
                            </select> : <input required={['first_name', 'last_name', 'email', 'student_number'].includes(key)} type={key === 'email' ? 'email' : 'text'} value={accountForm[key] ?? ''} onChange={event => setAccountForm({ ...accountForm, [key]: event.target.value })} style={{ padding: 9, border: '1px solid #cbd5e1', borderRadius: 6 }} />}
                        </label>)}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button type="button" onClick={() => setEditingAccount(null)}>Cancel</button>
                            <button type="submit" disabled={savingAccount}>{savingAccount ? 'Saving...' : 'Save changes'}</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
