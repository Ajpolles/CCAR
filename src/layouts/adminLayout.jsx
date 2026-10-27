import { useContext } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { LayoutDashboard, CalendarCheck, Clock, FilePlus, LogOut } from 'lucide-react';
import './layout.css';

export default function AdminLayout() {
    const { user, logout } = useContext(AuthContext);
    const navigate = useNavigate();

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
                    <NavLink to="/admin/schedules" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Clock size={20} /> Staff Schedules
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
                    <div className="header-profile">
                        <div className="avatar" style={{ backgroundColor: '#10b981' }}>
                            <span style={{ color: 'white', fontWeight: 'bold' }}>{user?.name?.charAt(0)}</span>
                        </div>
                        <div className="profile-info">
                            <span className="profile-name"> {user?.last_name || user?.name}</span>
                            <span className="profile-role">{user?.position}</span>
                        </div>
                    </div>
                </header>
                <div className="page-content">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}