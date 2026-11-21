import { Component, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import RoleProtectedRoute from './routes/RoleProtectedRoute';

import './App.css';

const CCARSLandingPage = lazy(() => import('./pages/landingpage/LandingPage'));
const Login = lazy(() => import('./pages/auth/login'));
const Register = lazy(() => import('./pages/auth/register'));
const StudentLayout = lazy(() => import('./layouts/StudentLayout'));
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'));
const BookAppointment = lazy(() => import('./pages/student/BookAppointment'));
const Appointments = lazy(() => import('./pages/student/Appointments'));
const Records = lazy(() => import('./pages/student/Records'));
const Waitlist = lazy(() => import('./pages/student/Waitlist'));
const Profile = lazy(() => import('./pages/student/Profile'));
const PatientRecords = lazy(() => import('./pages/admin/PatientRecords'));
const ManageAppointments = lazy(() => import('./pages/admin/ManageAppointments'));
const ManageSchedules = lazy(() => import('./pages/admin/ManageSchedules'));
const ManageAppointmentTypes = lazy(() => import('./pages/admin/ManageAppointmentTypes'));
const ManageClinicAvailability = lazy(() => import('./pages/admin/ManageClinicAvailability'));
const WaitingQueue = lazy(() => import('./pages/admin/WaitingQueue'));
const ManageFollowUps = lazy(() => import('./pages/admin/ManageFollowUps'));
const AppointmentReports = lazy(() => import('./pages/admin/AppointmentReports'));
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/adminDashboard'));
const SuperAdminDashboard = lazy(() => import('./pages/superadmin/SuperAdminDashboard'));
const Notifications = lazy(() => import('./pages/shared/Notifications'));

class AppErrorBoundary extends Component {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        console.error('CCARS page render failed:', error, info);
    }

    render() {
        if (!this.state.hasError) return this.props.children;
        return (
            <main className="app-error-screen" role="alert">
                <p className="app-error-kicker">CCARS</p>
                <h1>This page could not load</h1>
                <p>Refresh the page to try again. The error was recorded in the browser console.</p>
                <button type="button" onClick={() => window.location.reload()}>Refresh page</button>
            </main>
        );
    }
}

function NotFoundPage() {
    return (
        <main className="app-error-screen">
            <p className="app-error-kicker">CCARS</p>
            <h1>Page not found</h1>
            <p>This address does not match a CCARS page.</p>
            <Link to="/">Return to CCARS</Link>
        </main>
    );
}

function App() {
    return (
        <BrowserRouter>
            <AppErrorBoundary>
              <AuthProvider>
                <Suspense fallback={<main className="app-loading-screen" role="status">Loading CCARS…</main>}>
                  <Routes>
                    {/* Landing Page set as the initial route */}
                    <Route path="/" element={<CCARSLandingPage />} />
                    
                    {/* Authentication Routes */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    
                    {/* Student Routes */}
                    <Route element={<RoleProtectedRoute allowedRoles={['student']} />}>
                        <Route element={<StudentLayout />}>
                            <Route path="/student/dashboard" element={<StudentDashboard />} />
                            <Route path="/student/book-appointment" element={<BookAppointment />} />
                            <Route path="/student/appointments" element={<Appointments />} />
                            <Route path="/student/notifications" element={<Notifications />} />
                            <Route path="/student/records" element={<Records />} />
                            <Route path="/student/waitlist" element={<Waitlist />} />
                            <Route path="/student/profile" element={<Profile />} />
                        </Route>
                    </Route>

                    {/* Admin Routes */}
                    <Route element={<RoleProtectedRoute allowedRoles={['admin']} />}>
                        <Route element={<AdminLayout />}>
                            <Route path="/admin/dashboard" element={<AdminDashboard />} />
                            <Route path="/admin/appointments" element={<ManageAppointments />} />
                            <Route path="/admin/waiting-queue" element={<WaitingQueue />} />
                            <Route path="/admin/follow-ups" element={<ManageFollowUps />} />
                            <Route path="/admin/reports" element={<AppointmentReports />} />
                            <Route path="/admin/notifications" element={<Notifications />} />
                            <Route path="/admin/schedules" element={<ManageSchedules />} />
                            <Route path="/admin/appointment-types" element={<ManageAppointmentTypes />} />
                            <Route path="/admin/clinic-availability" element={<ManageClinicAvailability />} />
                            <Route path="/admin/records" element={<PatientRecords />} />
                        </Route>
                    </Route>

                    {/* Super Admin Routes */}
                    <Route element={<RoleProtectedRoute allowedRoles={['super_admin']} />}>
                        <Route path="/super-admin/dashboard" element={<SuperAdminDashboard />} />
                    </Route>

                    <Route path="/unauthorized" element={<h1>403 - Access Denied</h1>} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </AuthProvider>
            </AppErrorBoundary>
        </BrowserRouter>
    );
}

export default App;
