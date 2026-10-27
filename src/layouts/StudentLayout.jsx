import { useContext } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
    Activity,
    Bell,
    CalendarDays,
    CalendarPlus,
    FileText,
    LayoutDashboard,
    LogOut,
    ShieldCheck,
    UserRound,
    User,
} from 'lucide-react';

export default function StudentLayout() {
    const { user, logout } = useContext(AuthContext);
    const location = useLocation();
    const initials = (user?.name || 'Student')
        .split(/\s+/)
        .map(part => part[0])
        .slice(0, 2)
        .join('');

    return (
        <div className="app-container">
            <aside className="sidebar">
                <Link className="brand-lockup" to="/student/dashboard" aria-label="CCARS home">
                    <span className="brand-mark"><Activity size={21} strokeWidth={2.5} /></span>
                    <span>
                        <span className="brand-name">CCARS</span>
                        <span className="brand-caption">Campus care, made easy</span>
                    </span>
                </Link>

                <div className="sidebar-label">Student portal</div>
                <nav aria-label="Student navigation">
                    <Link
                        to="/student/dashboard"
                        className={location.pathname === '/student/dashboard' ? 'active' : ''}
                    >
                        <LayoutDashboard size={18} /> Dashboard
                    </Link>
                    <Link
                        to="/student/book-appointment"
                        className={location.pathname.startsWith('/student/book') ? 'active' : ''}
                    >
                        <CalendarPlus size={18} /> Book appointment
                    </Link>
                    <Link to="/student/dashboard#appointments">
                        <CalendarDays size={18} /> My appointments
                    </Link>
                    <Link
                        to="/student/records"
                        className={location.pathname.startsWith('/student/records') ? 'active' : ''}
                    >
                        <FileText size={18} /> Medical Records
                    </Link>
                    <Link
                        to="/student/health-records"
                        className={location.pathname === '/student/health-records' ? 'active' : ''}
                    >
                        <UserRound size={18} /> Personal Health
                    </Link>
                    <Link
                        to="/student/notifications"
                        className={location.pathname === '/student/notifications' ? 'active' : ''}
                    >
                        <Bell size={18} /> Notifications
                    </Link>
                    <Link
                        to="/student/profile"
                        className={location.pathname === '/student/profile' ? 'active' : ''}
                    >
                        <User size={18} /> Profile
                    </Link>
                </nav>
                <div className="sidebar-footer">
                    <div className="user-avatar" aria-hidden="true">{initials}</div>
                    <div>
                        <div className="user-name">{user?.name || 'Student'}</div>
                        <div className="user-role">Student account</div>
                    </div>
                    <button
                        className="logout-button"
                        onClick={logout}
                        type="button"
                        aria-label="Log out"
                        title="Log out"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </aside>

            <main className={`main-content${location.pathname.startsWith('/student/book') ? '' : ' student-main-background'}`}>
                <header className="topbar">
                    <div className="topbar-eyebrow">Your campus health portal</div>
                    <div className="topbar-date">
                        <ShieldCheck size={15} />
                        Private &amp; secure
                    </div>
                </header>
                <Outlet />
            </main>
        </div>
    );
};
