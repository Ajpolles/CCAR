import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { User, Mail, Phone, BookOpen, Hash } from 'lucide-react';
import './Dashboard.css';

export default function Profile() {
    const { user } = useContext(AuthContext);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await fetch('http://localhost:5000/api/student/profile', {
                    headers: { 'Authorization': `Bearer ${user.token}` }
                });
                
                if (!res.ok) {
                    throw new Error(`Server returned ${res.status}: Make sure your backend route exists and server is restarted.`);
                }
                
                const data = await res.json();
                if (!data) throw new Error("No profile data found for this user.");
                
                setProfile(data);
            } catch (err) {
                console.error("Profile Fetch Error:", err);
                setErrorMsg(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [user.token]);

    if (loading) return <div className="dashboard-container"><p>Loading profile...</p></div>;
    if (errorMsg) return <div className="dashboard-container"><p style={{color: 'red'}}>Error: {errorMsg}</p></div>;
    if (!profile) return <div className="dashboard-container"><p>Failed to load profile data.</p></div>;

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>My Profile</h1>
                <p>Manage your personal information.</p>
            </div>

            <div className="dashboard-sections">
                <div className="section-card">
                    <div className="profile-header">
                        <div className="profile-avatar-large">
                            <User size={48} color="#2563eb" />
                        </div>
                        <div>
                            <h2 style={{margin: '0 0 5px 0', color: '#0f172a'}}>
                                {profile.first_name || 'No First Name'} {profile.last_name || 'No Last Name'}
                            </h2>
                            <span className="appt-status confirmed">Active Student</span>
                        </div>
                    </div>

                    <div className="profile-grid">
                        <div className="profile-info-group">
                            <Hash size={18} color="#64748b" />
                            <div>
                                <label>Student Number</label>
                                <span>{profile.student_number || 'Not Set'}</span>
                            </div>
                        </div>
                        <div className="profile-info-group">
                            <Mail size={18} color="#64748b" />
                            <div>
                                <label>Email Address</label>
                                <span>{profile.email || 'Not Set'}</span>
                            </div>
                        </div>
                        <div className="profile-info-group">
                            <Phone size={18} color="#64748b" />
                            <div>
                                <label>Contact Number</label>
                                <span>{profile.contact_number || 'Not Set'}</span>
                            </div>
                        </div>
                        <div className="profile-info-group">
                            <BookOpen size={18} color="#64748b" />
                            <div>
                                <label>Course & Year</label>
                                <span>{profile.course || 'N/A'} - {profile.year_level || 'N/A'} ({profile.section || 'N/A'})</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}