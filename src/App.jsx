import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import RoleProtectedRoute from './routes/RoleProtectedRoute';

import './App.css';
import Login from './pages/auth/login';
import Register from './pages/auth/register';
import StudentLayout from './layouts/StudentLayout';
import StudentDashboard from './pages/student/Dashboard';
import BookAppointment from './pages/student/BookAppointment';
import Appointments from './pages/student/Appointments';
import Records from './pages/student/Records';
import Profile from './pages/student/Profile';

import PatientRecords from './pages/admin/PatientRecords';
import ManageAppointments from './pages/admin/ManageAppointments';
import ManageSchedules from './pages/admin/ManageSchedules';
import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './pages/admin/adminDashboard';

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    <Route path="/" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    
                    <Route element={<RoleProtectedRoute allowedRoles={['user']} />}>
                        <Route element={<StudentLayout />}>
                            <Route path="/student/dashboard" element={<StudentDashboard />} />
                            <Route path="/student/book-appointment" element={<BookAppointment />} />
                            <Route path="/student/appointments" element={<Appointments />} />
                            <Route path="/student/records" element={<Records />} />
                            <Route path="/student/profile" element={<Profile />} />
                        </Route>
                    </Route>

                    <Route element={<RoleProtectedRoute allowedRoles={['admin']} />}>
                        <Route element={<AdminLayout />}>
                            <Route path="/admin/dashboard" element={<AdminDashboard />} />
                            <Route path="/admin/appointments" element={<ManageAppointments />} />
                            <Route path="/admin/schedules" element={<ManageSchedules />} />
                            <Route path="/admin/records" element={<PatientRecords />} />
                        </Route>
                    </Route>

                    <Route element={<RoleProtectedRoute allowedRoles={['super_admin']} />}>
                        <Route path="/super-admin/dashboard" element={<h1>Super Admin Dashboard (To be built)</h1>} />
                    </Route>

                    <Route path="/unauthorized" element={<h1>403 - Access Denied</h1>} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    );
}
export default App;