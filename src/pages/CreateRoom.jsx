import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Video, Music, ArrowLeft, Lock, Globe, AlertCircle } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { useAuth } from '../context/AuthContext';
import GlowButton from '../components/GlowButton';
import Input from '../components/Input';
import GlassCard from '../components/GlassCard';
import './CreateRoom.css';

const CreateRoom = () => {
    const navigate = useNavigate();
    const { createRoom, isConnected } = useRoom();
    const { user, isGuest } = useAuth();

    const [roomName, setRoomName] = useState('');
    const [roomType, setRoomType] = useState('video');
    const [privacy, setPrivacy] = useState('private');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!roomName.trim()) {
            setError('Room name is required');
            return;
        }

        if (!user || isGuest) {
            setError('You must be logged in to create a room.');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const code = await createRoom(roomName, roomType, privacy);
            navigate(`/room/${code}`);
        } catch (err) {
            setError(err.message || 'Failed to create room');
        } finally {
            setIsLoading(false);
        }
    };

    // Auth gate UI
    if (!user) {
        return (
            <div className="page-wrapper-centered">
                <GlassCard className="create-room-card">
                    <div className="card-header">
                        <button onClick={() => navigate('/')} className="back-link">
                            <ArrowLeft size={20} />
                        </button>
                        <h1 className="card-title">Create Room</h1>
                    </div>
                    <div className="auth-gate">
                        <AlertCircle size={48} className="text-warning" />
                        <h2>Login Required</h2>
                        <p>You need to be logged in to create a room.</p>
                        <Link to="/login">
                            <GlowButton size="lg">Sign In</GlowButton>
                        </Link>
                    </div>
                </GlassCard>
            </div>
        );
    }

    if (isGuest) {
        return (
            <div className="page-wrapper-centered">
                <GlassCard className="create-room-card">
                    <div className="card-header">
                        <button onClick={() => navigate('/')} className="back-link">
                            <ArrowLeft size={20} />
                        </button>
                        <h1 className="card-title">Create Room</h1>
                    </div>
                    <div className="auth-gate">
                        <AlertCircle size={48} className="text-warning" />
                        <h2>Account Required</h2>
                        <p>Guests cannot create rooms. Please sign in with Google.</p>
                        <Link to="/login">
                            <GlowButton size="lg">Sign In with Google</GlowButton>
                        </Link>
                    </div>
                </GlassCard>
            </div>
        );
    }

    return (
        <div className="page-wrapper-centered">
            <GlassCard className="create-room-card">
                <div className="card-header">
                    <button onClick={() => navigate('/')} className="back-link">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="card-title">Create Room</h1>
                </div>

                {!isConnected && (
                    <div className="connection-warning">
                        <AlertCircle size={16} /> Connecting to server...
                    </div>
                )}

                <form onSubmit={handleSubmit} className="create-form">
                    <Input
                        label="Room Name"
                        placeholder="e.g. Movie Night, Chill Vibes"
                        value={roomName}
                        onChange={(e) => {
                            setRoomName(e.target.value);
                            setError('');
                        }}
                        error={error && !roomName.trim() ? 'Room name is required' : ''}
                        fullWidth
                        autoFocus
                        className="glass-input"
                    />

                    <div className="form-group">
                        <label className="input-label">Room Type</label>
                        <div className="type-selector">
                            <button
                                type="button"
                                className={`type-option ${roomType === 'video' ? 'active' : ''}`}
                                onClick={() => setRoomType('video')}
                            >
                                <Video size={20} />
                                <span>Video</span>
                            </button>
                            <button
                                type="button"
                                className={`type-option ${roomType === 'audio' ? 'active' : ''}`}
                                onClick={() => setRoomType('audio')}
                            >
                                <Music size={20} />
                                <span>Audio</span>
                            </button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="input-label">Privacy</label>
                        <div className="type-selector">
                            <button
                                type="button"
                                className={`type-option ${privacy === 'private' ? 'active' : ''}`}
                                onClick={() => setPrivacy('private')}
                            >
                                <Lock size={18} />
                                <span>Private</span>
                            </button>
                            <button
                                type="button"
                                className={`type-option ${privacy === 'public' ? 'active' : ''}`}
                                onClick={() => setPrivacy('public')}
                            >
                                <Globe size={18} />
                                <span>Public</span>
                            </button>
                        </div>
                    </div>

                    {error && <p className="error-message">{error}</p>}

                    <GlowButton type="submit" size="lg" fullWidth disabled={isLoading || !isConnected}>
                        {isLoading ? 'Creating...' : 'Create & Enter'}
                    </GlowButton>
                </form>
            </GlassCard>
        </div>
    );
};

export default CreateRoom;

