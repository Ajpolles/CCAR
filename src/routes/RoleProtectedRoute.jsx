import { Navigate, Outlet } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

const RoleProtectedRoute = ({ allowedRoles }) => {
    const { user } = useContext(AuthContext);

    if (!user) return <Navigate to="/" replace />;
    if (!allowedRoles.includes(user.role)) return <Navigate to="/unauthorized" replace />;

    return <Outlet />;
};

export default RoleProtectedRoute;