import { useContext, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { LayoutDashboard, CalendarCheck, CalendarDays, Clock, FilePlus, ListChecks, LogOut, Bell, Users, ClipboardList, BarChart3 } from 'lucide-react';
import './layout.css';
import { apiFetch } from '../services/api';

export default function AdminLayout() {
    const { user, logout, updateUser } = useContext(AuthContext);
    const [profileOpen, setProfileOpen] = useState(false);
    const [profile, setProfile] = useState(null);
    const [profileForm, setProfileForm] = useState({});
    const [profileError, setProfileError] = useState('');
    const [profileMessage, setProfileMessage] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);

    const openProfile = async () => {
        setProfileOpen(true);
        setProfileError('');
        try {
            const response = await apiFetch('/api/admin/profile', { headers: { Authorization: `Bearer ${user?.token}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error || 'Could not load profile');
            setProfile(current => ({ ...current, ...data, creator_name: current?.creator_name ?? data.creator_name }));
            setProfileForm({ first_name: data.first_name || '', last_name: data.last_name || '', email: data.email || '', contact_number: data.contact_number || '', position: data.position || '' });
        } catch (error) {
            setProfileError(error.message || 'Could not load profile');
        }
    };

    const saveProfile = async (event) => {
        event.preventDefault();
        setProfileSaving(true);
        setProfileError('');
        try {
            const response = await apiFetch('/api/admin/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token}` },
                body: JSON.stringify(profileForm)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error || 'Could not save profile');
            setProfile(current => ({ ...current, ...data, creator_name: current?.creator_name ?? data.creator_name }));
            setProfileForm({ first_name: data.first_name || '', last_name: data.last_name || '', email: data.email || '', contact_number: data.contact_number || '', position: data.position || '' });
            updateUser?.(data);
            setProfileMessage('Profile updated successfully.');
        } catch (error) {
            setProfileError(error.message || 'Could not save profile');
        } finally {
            setProfileSaving(false);
        }
    };

    return (
        <div className="app-layout">
            <aside className="sidebar" style={{ backgroundColor: '#0f172a' }}>
                <div className="sidebar-brand">
                    <h2>CCARS Admin</h2>
                </div>
                <nav className="sidebar-nav">
                    <NavLink to="/admin/dashboard" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <LayoutDashboard size={20} /> Dashboard
                    </NavLink>
                    <NavLink to="/admin/appointments" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <CalendarCheck size={20} /> Appointments
                    </NavLink>
                    <NavLink to="/admin/waiting-queue" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Users size={20} /> Waiting Queue
                    </NavLink>
                    <NavLink to="/admin/follow-ups" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <ClipboardList size={20} /> Follow-ups
                    </NavLink>
                    <NavLink to="/admin/reports" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <BarChart3 size={20} /> Reports
                    </NavLink>
                    <NavLink to="/admin/notifications" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Bell size={20} /> Notifications
                    </NavLink>
                    <NavLink to="/admin/schedules" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Clock size={20} /> Staff Schedules
                    </NavLink>
                    <NavLink to="/admin/appointment-types" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <ListChecks size={20} /> Appointment Types
                    </NavLink>
                    <NavLink to="/admin/clinic-availability" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <CalendarDays size={20} /> Clinic Availability
                    </NavLink>
                    <NavLink to="/admin/records" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <FilePlus size={20} /> Patient Records
                    </NavLink>
                </nav>
                <div className="sidebar-footer">
                    <button onClick={logout} className="logout-btn">
                        <LogOut size={20} /> Logout
                    </button>
                </div>
            </aside>
            
            <main className="main-content">
                <header className="top-header">
                    <button type="button" className="header-profile" onClick={openProfile} aria-label="Open my profile" style={{ border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                        <div className="avatar" style={{ backgroundColor: '#10b981' }}>
                            <span style={{ color: 'white', fontWeight: 'bold' }}>{user?.name?.charAt(0)}</span>
                        </div>
                        <div className="profile-info">
                            <span className="profile-name"> {user?.last_name || user?.name}</span>
                            <span className="profile-role">{user?.position}</span>
                        </div>
                    </button>
                </header>
                <div className="page-content">
                    <Outlet />
                </div>
            </main>
            {profileOpen && <div role="presentation" onClick={() => setProfileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 1500, padding: 16 }}>
                <section role="dialog" aria-modal="true" aria-labelledby="admin-profile-title" onClick={event => event.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 540, padding: 24, maxHeight: '90vh', overflow: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 id="admin-profile-title">My Admin Profile</h2><button type="button" onClick={() => setProfileOpen(false)}>Close</button></div>
                    {profileError && <p role="alert" style={{ color: '#b91c1c' }}>{profileError}</p>}
                    {profileMessage && <p role="status" style={{ color: '#166534' }}>{profileMessage}</p>}
                    {profile ? <><p>Status: {profile.is_active ? 'Active' : 'Inactive'} · Registered {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Unavailable'}</p>
                        <p>Created by: {profile.creator_name || 'Unavailable'} · Updated {profile.updated_at ? new Date(profile.updated_at).toLocaleDateString() : 'Unavailable'}</p>
                        <form onSubmit={saveProfile} style={{ display: 'grid', gap: 10 }}>
                            {['first_name', 'last_name', 'email', 'position', 'contact_number'].map(field => <label key={field} style={{ display: 'grid', gap: 4, textTransform: 'capitalize' }}>{field.replace('_', ' ')}
                                <input required={field !== 'contact_number'} type={field === 'email' ? 'email' : 'text'} value={profileForm[field] ?? ''} onChange={event => setProfileForm({ ...profileForm, [field]: event.target.value })} />
                            </label>)}
                            <button type="submit" disabled={profileSaving}>{profileSaving ? 'Saving…' : 'Save profile'}</button>
                        </form>
                    </> : !profileError && <p>Loading profile…</p>}
                </section>
            </div>}
        </div>
    );
}
