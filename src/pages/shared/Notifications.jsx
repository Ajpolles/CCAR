import { useCallback, useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { apiFetch } from '../../services/api';
import '../student/Dashboard.css';

export default function Notifications() {
    const { user } = useContext(AuthContext);
    const token = user?.token;
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const pageSize = 20;

    const loadNotifications = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await apiFetch(`/api/notifications?limit=${pageSize}&offset=${offset}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not load notifications.');
            setNotifications(data.notifications);
            setUnreadCount(data.unread_count);
        } catch (err) {
            setError(err.message || 'Could not load notifications.');
        } finally {
            setLoading(false);
        }
    }, [offset, token]);

    useEffect(() => {
        // Fetch notifications when the page or selected page changes.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadNotifications();
    }, [loadNotifications]);

    const markRead = async (notification) => {
        try {
            const response = await apiFetch(`/api/notifications/${notification.id}/read`, {
                method: 'PATCH', headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not update notification.');
            setNotifications(items => items.map(item => item.id === notification.id ? data.notification : item));
            setUnreadCount(count => Math.max(0, count - (notification.is_read ? 0 : 1)));
        } catch (err) {
            setError(err.message || 'Could not update notification.');
        }
    };

    const markAllRead = async () => {
        try {
            const response = await apiFetch('/api/notifications/read-all', {
                method: 'PATCH', headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not mark notifications as read.');
            setNotifications(items => items.map(item => ({ ...item, is_read: true, read_at: item.read_at || new Date().toISOString() })));
            setUnreadCount(0);
        } catch (err) {
            setError(err.message || 'Could not mark notifications as read.');
        }
    };

    return (
        <main className="dashboard-container">
            <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
                <div><h1>Notifications</h1><p>You have {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}.</p></div>
                <button type="button" onClick={markAllRead} disabled={unreadCount === 0}>Mark all as read</button>
            </div>
            {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
            <section className="section-card" aria-label="Notification history">
                {loading ? <p role="status" style={{ padding: 16 }}>Loading notifications…</p> : notifications.length === 0 ?
                    <p style={{ padding: 16 }}>No notifications yet.</p> : notifications.map(notification => <article key={notification.id} style={{ padding: 16, borderBottom: '1px solid #e2e8f0', background: notification.is_read ? '#fff' : '#f0f9ff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
                            <div><h2 style={{ fontSize: '1rem', margin: '0 0 6px' }}>{notification.title}</h2><p style={{ margin: '0 0 8px' }}>{notification.message}</p><time dateTime={notification.created_at}>{new Date(notification.created_at).toLocaleString()}</time></div>
                            {!notification.is_read && <button type="button" onClick={() => markRead(notification)}>Mark as read</button>}
                        </div>
                    </article>)}
                <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <button type="button" disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - pageSize))}>Newer</button>
                    <button type="button" disabled={notifications.length < pageSize || loading} onClick={() => setOffset(value => value + pageSize)}>Older</button>
                </div>
            </section>
        </main>
    );
}
