import { createContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../services/api';

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext();

const getStoredToken = () => {
    try {
        return JSON.parse(localStorage.getItem('ccars_auth') || 'null')?.token
            || localStorage.getItem('token');
    } catch {
        return localStorage.getItem('token');
    }
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(() => Boolean(getStoredToken()));
    const navigate = useNavigate();

    const logout = useCallback(() => {
        localStorage.removeItem('ccars_auth');
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('name');
        localStorage.removeItem('userId');
        setUser(null);
        navigate('/', { replace: true });
    }, [navigate]);

    useEffect(() => {
        window.addEventListener('ccars:unauthorized', logout);
        return () => window.removeEventListener('ccars:unauthorized', logout);
    }, [logout]);

    useEffect(() => {
        let cancelled = false;

        const restoreSession = async () => {
            const token = getStoredToken();

            if (!token) return;

            try {
                const response = await apiFetch('/api/auth/me', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!response.ok) throw new Error('Session expired');

                const { user: account } = await response.json();
                const authUser = { ...account, token };
                if (!cancelled) {
                    setUser(authUser);
                    localStorage.setItem('ccars_auth', JSON.stringify({ token }));
                    localStorage.removeItem('role');
                    localStorage.removeItem('name');
                    localStorage.removeItem('userId');
                    localStorage.removeItem('token');
                }
            } catch {
                if (!cancelled) logout();
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        restoreSession();
        return () => { cancelled = true; };
    }, [logout]);

    const login = ({ token, user: account }) => {
        if (!token || !account || !['student', 'admin', 'super_admin'].includes(account.role)) {
            return;
        }

        setUser({ ...account, token });
        localStorage.setItem('ccars_auth', JSON.stringify({ token }));
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('name');
        localStorage.removeItem('userId');

        if (account.role === 'student') navigate('/student/dashboard');
        else if (account.role === 'admin') navigate('/admin/dashboard');
        else navigate('/super-admin/dashboard');
    };

    const updateUser = (updates) => setUser(current => current ? { ...current, ...updates } : current);

    if (loading) return <div>Loading...</div>;

    return (
        <AuthContext.Provider value={{ user, login, logout, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
};
