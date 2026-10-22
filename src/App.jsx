import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import RoleProtectedRoute from './routes/RoleProtectedRoute';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import StudentLayout from './layouts/StudentLayout';
import StudentDashboard from './pages/student/Dashboard';
import BookAppointment from './pages/student/BookAppointment';

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
                            <Route path="/student/book" element={<BookAppointment />} />
                        </Route>
                    </Route>

                    <Route element={<RoleProtectedRoute allowedRoles={['admin']} />}>
                        <Route path="/admin/dashboard" element={<h1>Admin Dashboard (To be built)</h1>} />
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