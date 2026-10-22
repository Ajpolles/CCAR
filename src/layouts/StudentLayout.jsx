import React, { useContext } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { LayoutDashboard, CalendarPlus, CalendarDays, LogOut } from 'lucide-react';

const StudentLayout = () => {
    const { user, logout } = useContext(AuthContext);
    const location = useLocation();

    return (
        <div className="app-container">
            <div className="sidebar">
                <h2>
                    <div style={{ background: '#e0f2fe', padding: '6px', borderRadius: '8px' }}>
                        <LayoutDashboard size={20} color="#2563eb" />
                    </div>
                    CCARS Portal
                </h2>
                
                <nav>
                    <Link to="/student/dashboard" className={location.pathname === '/student/dashboard' ? 'active' : ''}>
                        <LayoutDashboard size={18} /> Dashboard
                    </Link>
                    <Link to="/student/book" className={location.pathname === '/student/book' ? 'active' : ''}>
                        <CalendarPlus size={18} /> Book Appointment
                    </Link>
                    <Link to="/student/appointments" className={location.pathname === '/student/appointments' ? 'active' : ''}>
                        <CalendarDays size={18} /> My Appointments
                    </Link>
                </nav>

                <div className="sidebar-footer">
                    <div className="user-name">{user?.name || "Student User"}</div>
                    <div className="user-role">Role: Student</div>
                    <button className="btn-outline" onClick={logout} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            </div>
            
            <div className="main-content">
                <Outlet />
            </div>
        </div>
    );
};
export default StudentLayout;