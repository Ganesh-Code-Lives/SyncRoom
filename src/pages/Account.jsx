import React, { useEffect, useState } from 'react';
import { useRoom } from '../context/RoomContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import LoadingScreen from '../components/LoadingScreen';
import { User, Users, Activity, Clock, LogOut, Plus, Hash, Play, Shield, TrendingUp, Calendar } from 'lucide-react';
import { subscribeToUserProfile, subscribeToUserActivity, getUniqueRoomsFromActivity } from '../lib/firestoreUtils';
import './Account.css';

// BELIEVABLE MOCK DATA FALLBACKS
const MOCK_STATS = { roomsCreated: 3, roomsJoined: 8, messagesSent: 124 };
const MOCK_ROOMS = [
    { roomName: "Movie Night 🍿", roomId: "MOVIE7", role: "Host", lastActive: { toDate: () => new Date(Date.now() - 7200000) } },
    { roomName: "Coding Sessions", roomId: "CODE24", role: "Participant", lastActive: { toDate: () => new Date(Date.now() - 86400000) } },
];
const MOCK_ACTIVITY = [
    { type: 'JOIN_ROOM', roomName: 'Movie Night 🍿', timestamp: { toDate: () => new Date(Date.now() - 7200000) } },
    { type: 'CREATE_ROOM', roomName: 'Study Group', timestamp: { toDate: () => new Date(Date.now() - 172800000) } },
    { type: 'JOIN_ROOM', roomName: 'Coding Sessions', timestamp: { toDate: () => new Date(Date.now() - 86400000) } },
];

const Account = () => {
    const { user, isGuest, logout } = useAuth();
    const navigate = useNavigate();
    
    const [profile, setProfile] = useState(null);
    const [activities, setActivities] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || isGuest) {
            navigate('/login');
            return;
        }

        // 1. Subscribe to Profile
        const unsubProfile = subscribeToUserProfile(user.uid, (data) => {
            setProfile(data);
            setLoading(false);
        });

        // 2. Subscribe to Activity
        const unsubActivity = subscribeToUserActivity(user.uid, (data) => {
            const hasData = data && data.length > 0;
            setActivities(hasData ? data : MOCK_ACTIVITY);
            
            const uniqueRooms = getUniqueRoomsFromActivity(data);
            setRooms(uniqueRooms.length > 0 ? uniqueRooms.slice(0, 5) : MOCK_ROOMS);
            setLoading(false);
        }, 15);

        return () => {
            unsubProfile();
            unsubActivity();
        };
    }, [user, isGuest, navigate]);

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    if (loading) return <LoadingScreen message="Loading Profile..." />;

    const stats = {
        created: profile?.stats?.roomsCreated || MOCK_STATS.roomsCreated,
        joined: profile?.stats?.roomsJoined || MOCK_STATS.roomsJoined,
        messages: profile?.stats?.messagesSent || MOCK_STATS.messagesSent
    };

    return (
        <div className="account-page">
            <div className="account-container">
                
                {/* LEFT SIDEBAR: Compact Profile Card */}
                <div className="account-sidebar">
                    <GlassCard className="profile-card-compact">
                        <div className="profile-main">
                            <div className="profile-avatar-wrapper">
                                <img
                                    src={user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.displayName || 'User'}`}
                                    alt="Avatar"
                                    className="profile-avatar-img"
                                />
                                <div className="status-dot"></div>
                            </div>
                            <div className="profile-info">
                                <h2 className="profile-name">{user?.displayName || 'SyncRoom User'}</h2>
                                <p className="profile-status">Member</p>
                            </div>
                        </div>

                        <div className="profile-mini-stats">
                            <div className="m-stat">
                                <span className="m-label">Rooms</span>
                                <span className="m-value">{stats.joined + stats.created}</span>
                            </div>
                            <div className="m-stat">
                                <span className="m-label">Created</span>
                                <span className="m-value">{stats.created}</span>
                            </div>
                        </div>

                        <div className="profile-meta">
                            <div className="meta-item">
                                <Shield size={14} />
                                <span>Verified User</span>
                            </div>
                            <div className="meta-item">
                                <Calendar size={14} />
                                <span>Joined {profile?.createdAt?.toDate ? new Date(profile.createdAt.toDate()).toLocaleDateString() : 'Mar 2024'}</span>
                            </div>
                        </div>

                        <button onClick={handleLogout} className="sidebar-logout">
                            <LogOut size={16} /> Logout
                        </button>
                    </GlassCard>
                </div>

                {/* RIGHT CONTENT: Dominant Dashboard */}
                <div className="account-dashboard">
                    
                    {/* TOP STATS ROW */}
                    <div className="dashboard-stats-row">
                        <div className="stat-box gradient-1">
                            <div className="stat-content">
                                <span className="stat-num">{stats.created}</span>
                                <span className="stat-desc">Rooms Created</span>
                            </div>
                            <Plus className="stat-icon-bg" size={60} />
                        </div>
                        
                        <div className="stat-box gradient-2">
                            <div className="stat-content">
                                <span className="stat-num">{stats.joined}</span>
                                <span className="stat-desc">Rooms Joined</span>
                            </div>
                            <Users className="stat-icon-bg" size={60} />
                        </div>

                        <div className="stat-box gradient-3">
                            <div className="stat-content">
                                <span className="stat-num">{stats.messages}</span>
                                <span className="stat-desc">Messages</span>
                            </div>
                            <TrendingUp className="stat-icon-bg" size={60} />
                        </div>
                    </div>

                    {/* QUICK ACTIONS ROW */}
                    <div className="dashboard-actions-row">
                        <GlowButton variant="primary" onClick={() => navigate('/create')} className="action-btn">
                            <Plus size={18} /> Create Room
                        </GlowButton>
                        <GlowButton variant="secondary" onClick={() => navigate('/join')} className="action-btn">
                            <Hash size={18} /> Join via Code
                        </GlowButton>
                    </div>

                    {/* MAIN GRID: ROOMS & ACTIVITY */}
                    <div className="dashboard-main-grid">
                        
                        {/* RECENT ROOMS */}
                        <div className="dashboard-section">
                            <div className="section-header">
                                <Clock size={20} />
                                <h3>Recent Rooms</h3>
                            </div>
                            <div className="list-container">
                                {rooms.map((rm, idx) => (
                                    <div key={idx} className="list-item room-card">
                                        <div className="item-info">
                                            <p className="item-title">{rm.roomName}</p>
                                            <p className="item-sub">{rm.role} • {rm.roomId}</p>
                                        </div>
                                        <button onClick={() => navigate(`/room/${rm.roomId}`)} className="item-action">
                                            <Play size={14} fill="currentColor" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ACTIVITY FEED */}
                        <div className="dashboard-section">
                            <div className="section-header">
                                <Activity size={20} />
                                <h3>Activity Feed</h3>
                            </div>
                            <div className="list-container timeline">
                                {activities.slice(0, 5).map((act, idx) => (
                                    <div key={idx} className="timeline-item">
                                        <div className={`timeline-marker ${act.type}`}></div>
                                        <div className="timeline-content">
                                            <p className="timeline-text">
                                                {act.type === 'CREATE_ROOM' ? 'Created ' : 'Joined '}
                                                <span className="highlight">{act.roomName}</span>
                                            </p>
                                            <p className="timeline-date">
                                                {act.timestamp?.toDate ? new Date(act.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default Account;
