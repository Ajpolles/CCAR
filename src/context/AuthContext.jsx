import React, { createContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const token = localStorage.getItem('token');
        const role = localStorage.getItem('role');
        const name = localStorage.getItem('name');
        
        if (token && role) {
            setUser({ token, role, name });
        }
        setLoading(false);
    }, []);

    const login = (token, role, name) => {
        localStorage.setItem('token', token);
        localStorage.setItem('role', role);
        localStorage.setItem('name', name);
        setUser({ token, role, name });
        
        if (role === 'user') navigate('/student/dashboard');
        else if (role === 'admin') navigate('/admin/dashboard');
        else if (role === 'super_admin') navigate('/super-admin/dashboard');
    };

    const logout = () => {
        localStorage.clear();
        setUser(null);
        navigate('/');
    };

    if (loading) return <div>Loading...</div>;

    return (
        <AuthContext.Provider value={{ user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};