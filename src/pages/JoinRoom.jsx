import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import GlowButton from '../components/GlowButton';
import Input from '../components/Input';
import GlassCard from '../components/GlassCard';
import './CreateRoom.css';

const JoinRoom = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { joinRoom, isConnected } = useRoom();

    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const codeFromUrl = searchParams.get('code');
        if (codeFromUrl) {
            setCode(codeFromUrl.toUpperCase());
        }
    }, [searchParams]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!code.trim()) {
            setError('Room code is required');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            await joinRoom(code);
            navigate(`/room/${code.toUpperCase()}`);
        } catch (err) {
            setError(err.message || 'Failed to join room. Check the code and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="page-wrapper-centered">
            <GlassCard className="create-room-card">
                <div className="card-header">
                    <button onClick={() => navigate('/')} className="back-link">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="card-title">Join Room</h1>
                </div>

                {!isConnected && (
                    <div className="connection-warning">
                        <AlertCircle size={16} /> Connecting to server...
                    </div>
                )}

                <form onSubmit={handleSubmit} className="create-form">
                    <Input
                        label="Room Code"
                        placeholder="e.g. XD45GH"
                        value={code}
                        onChange={(e) => {
                            setCode(e.target.value.toUpperCase());
                            setError('');
                        }}
                        error={error}
                        fullWidth
                        autoFocus
                        className="glass-input"
                    />

                    <GlowButton type="submit" size="lg" fullWidth disabled={isLoading || !isConnected}>
                        {isLoading ? 'Joining...' : 'Join Room'}
                    </GlowButton>
                </form>
            </GlassCard>
        </div>
    );
};

export default JoinRoom;

