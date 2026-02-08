import React from 'react';
import { useRoom } from '../context/RoomContext';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import { User, Settings, Clock, Shield } from 'lucide-react';
import './Account.css';

const Account = () => {
    const { currentUser } = useRoom();

    if (!currentUser) return <div className="p-8 text-center">Please login first</div>;

    return (
        <div className="account-page">
            <div className="account-container">
                <div className="account-header">
                    <h1>My Account</h1>
                    <p>Manage your profile and preferences</p>
                </div>

                <div className="account-grid">
                    {/* Profile Card */}
                    <GlassCard className="profile-card">
                        <div className="profile-avatar-large">
                            <img
                                src={currentUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.name}`}
                                alt={currentUser.name}
                            />
                        </div>
                        <h2>{currentUser.name}</h2>
                        <p className="profile-email">{currentUser.email || 'user@example.com'}</p>
                        <div className="profile-badge">
                            <Shield size={14} /> Free Plan
                        </div>
                        <GlowButton variant="secondary" size="sm" className="mt-4">Edit Profile</GlowButton>
                    </GlassCard>

                    {/* Settings / History */}
                    <div className="account-content">
                        <GlassCard className="content-section">
                            <div className="section-header">
                                <Clock size={20} className="text-secondary" />
                                <h3>Recent Rooms</h3>
                            </div>
                            <div className="placeholder-list">
                                <div className="list-item">
                                    <span>Movie Night #1</span>
                                    <span className="date">2 days ago</span>
                                </div>
                                <div className="list-item">
                                    <span>Chill Vibes</span>
                                    <span className="date">5 days ago</span>
                                </div>
                                <div className="list-item">
                                    <span>Anime Marathon</span>
                                    <span className="date">1 week ago</span>
                                </div>
                            </div>
                        </GlassCard>

                        <GlassCard className="content-section">
                            <div className="section-header">
                                <Settings size={20} className="text-secondary" />
                                <h3>Preferences</h3>
                            </div>
                            <div className="settings-list">
                                <div className="setting-item">
                                    <span>Email Notifications</span>
                                    <input type="checkbox" checked readOnly />
                                </div>
                                <div className="setting-item">
                                    <span>Dark Mode</span>
                                    <input type="checkbox" checked readOnly />
                                </div>
                            </div>
                        </GlassCard>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Account;
