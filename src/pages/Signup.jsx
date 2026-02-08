import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import Input from '../components/Input';
import { useRoom } from '../context/RoomContext';
import './Auth.css';

const Signup = () => {
    const navigate = useNavigate();
    const { login } = useRoom();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        // Mock signup
        setTimeout(() => {
            login(name || 'New User');
            setLoading(false);
            navigate('/');
        }, 1000);
    };

    return (
        <div className="auth-page">
            <div className="auth-container">
                <GlassCard className="auth-card">
                    <div className="auth-header">
                        <h2>Create Account</h2>
                        <p>Join SyncRoom for the best watch parties</p>
                    </div>

                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <label>Username</label>
                            <Input
                                icon={User}
                                type="text"
                                placeholder="Your display name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                fullWidth
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Email Address</label>
                            <Input
                                icon={Mail}
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                fullWidth
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Password</label>
                            <Input
                                icon={Lock}
                                type="password"
                                placeholder="Create a password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                fullWidth
                                required
                            />
                        </div>

                        <GlowButton type="submit" size="lg" fullWidth disabled={loading}>
                            {loading ? 'Creating Account...' : 'Sign Up'}
                        </GlowButton>
                    </form>

                    <div className="auth-footer">
                        <p>Already have an account? <Link to="/login" className="auth-link">Sign in</Link></p>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
};

export default Signup;
