import { useContext } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { LayoutDashboard, CalendarPlus, Calendar, FileText, User, LogOut } from 'lucide-react';
import './layout.css';

export default function StudentLayout() {
    const { user, logout } = useContext(AuthContext);
    const navigate = useNavigate();

    return (
        <div className="app-layout">
            <aside className="sidebar">
                <div className="sidebar-brand">
                    <h2>CCARS</h2>
                </div>
                <nav className="sidebar-nav">
                    <NavLink to="/student/dashboard" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <LayoutDashboard size={20} /> Dashboard
                    </NavLink>
                    <NavLink to="/student/book-appointment" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <CalendarPlus size={20} /> Book Appointment
                    </NavLink>
                    <NavLink to="/student/appointments" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Calendar size={20} /> My Appointments
                    </NavLink>
                    <NavLink to="/student/records" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <FileText size={20} /> Medical Records
                    </NavLink>
                    <NavLink to="/student/profile" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <User size={20} /> Profile
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
                        <div className="avatar">
                            <User size={24} color="#fff" />
                        </div>
                        <div className="profile-info">
                            <span className="profile-name">{user?.name}</span>
                            <span className="profile-role">Student</span>
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