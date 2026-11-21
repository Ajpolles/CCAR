import { apiFetch } from '../../services/api';
import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { User, Mail, Phone, BookOpen, Hash } from 'lucide-react';
import './Dashboard.css';

export default function Profile() {
    const { user, updateUser } = useContext(AuthContext);
    const [profile, setProfile] = useState(null);
    const [form, setForm] = useState({});
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await apiFetch('/api/student/profile', {
                    headers: { 'Authorization': `Bearer ${user.token}` }
                });
                
                if (!res.ok) {
                    throw new Error(`Server returned ${res.status}: Make sure your backend route exists and server is restarted.`);
                }
                
                const data = await res.json();
                if (!data) throw new Error("No profile data found for this user.");
                
                setProfile(data);
                setForm({ first_name: data.first_name || '', last_name: data.last_name || '', email: data.email || '', contact_number: data.contact_number || '' });
            } catch (err) {
                console.error("Profile Fetch Error:", err);
                setErrorMsg(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [user.token]);

    const handleSave = async (event) => {
        event.preventDefault();
        setSaving(true);
        setErrorMsg('');
        setSuccessMsg('');
        try {
            const response = await apiFetch('/api/student/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
                body: JSON.stringify(form)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error || 'Could not save profile');
            setProfile(data);
            setForm({ first_name: data.first_name || '', last_name: data.last_name || '', email: data.email || '', contact_number: data.contact_number || '' });
            updateUser?.(data);
            setEditing(false);
            setSuccessMsg('Profile updated successfully.');
        } catch (error) {
            setErrorMsg(error.message || 'Could not save profile');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="dashboard-container"><p className="empty-text">Loading profile...</p></div>;
    if (errorMsg) return <div className="dashboard-container"><p className="empty-text" style={{color: '#ef4444'}}>Error: {errorMsg}</p></div>;
    if (!profile) return <div className="dashboard-container"><p className="empty-text">Failed to load profile data.</p></div>;

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>My Profile</h1>
                <p>Review your account information and update personal details.</p>
            </div>

            {successMsg && <p role="status" style={{ color: '#166534' }}>{successMsg}</p>}
            {errorMsg && <p role="alert" style={{ color: '#b91c1c' }}>{errorMsg}</p>}

            <div className="section-card">
                <div className="profile-header">
                    <div className="profile-avatar-large">
                        <User size={32} className="text-green" />
                    </div>
                    <div>
                        <h2 style={{margin: '0 0 5px 0', color: '#0f172a'}}>
                            {profile.first_name || 'No First Name'} {profile.last_name || 'No Last Name'}
                        </h2>
                        <span className={`status-badge ${profile.is_active ? 'badge-confirmed' : 'badge-cancelled'}`}>{profile.is_active ? 'Active Student' : 'Inactive Student'}</span>
                    </div>
                </div>

                <div className="profile-grid">
                    <div className="profile-info-group">
                        <Hash size={18} className="text-green" />
                        <span><strong>Student Number :</strong> {profile.student_number || 'Not Set'}</span>
                    </div>
                    
                    <div className="profile-info-group">
                        <Mail size={18} className="text-green" />
                        <span><strong>Email :</strong> {profile.email || 'Not Set'}</span>
                    </div>
                    
                    <div className="profile-info-group">
                        <Phone size={18} className="text-green" />
                        <span><strong>Contact Number :</strong> {profile.contact_number || 'Not Set'}</span>
                    </div>
                    
                    <div className="profile-info-group">
                        <BookOpen size={18} className="text-green" />
                        <span><strong>Course & Year :</strong> {profile.course || 'N/A'} - {profile.year_level || 'N/A'} ({profile.section || 'N/A'})</span>
                    </div>
                    <div className="profile-info-group"><span><strong>Account status :</strong> {profile.is_active ? 'Active' : 'Inactive'}</span></div>
                    <div className="profile-info-group"><span><strong>Registered :</strong> {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Unavailable'}</span></div>
                    <div className="profile-info-group"><span><strong>Last updated :</strong> {profile.updated_at ? new Date(profile.updated_at).toLocaleDateString() : 'Unavailable'}</span></div>
                </div>
                {!editing ? <button type="button" className="action-view-btn" onClick={() => setEditing(true)} style={{ marginTop: 18 }}>Edit personal information</button> : (
                    <form onSubmit={handleSave} style={{ display: 'grid', gap: 12, marginTop: 18, maxWidth: 520 }}>
                        {['first_name', 'last_name', 'email', 'contact_number'].map(field => <label key={field} style={{ display: 'grid', gap: 4, textTransform: 'capitalize' }}>{field.replace('_', ' ')}
                            <input required={field !== 'contact_number'} type={field === 'email' ? 'email' : 'text'} value={form[field] ?? ''} onChange={event => setForm({ ...form, [field]: event.target.value })} />
                        </label>)}
                        <div style={{ display: 'flex', gap: 8 }}><button type="submit" className="action-view-btn" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button><button type="button" onClick={() => { setEditing(false); setForm({ first_name: profile.first_name || '', last_name: profile.last_name || '', email: profile.email || '', contact_number: profile.contact_number || '' }); }}>Cancel</button></div>
                    </form>
                )}
            </div>
        </div>
    );
}
