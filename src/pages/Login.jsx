import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, User } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

const Login = () => {
    const navigate = useNavigate();
    const { signInWithGoogle, signInAsGuest } = useAuth();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleGoogleLogin = async () => {
        try {
            setError('');
            setLoading(true);
            await signInWithGoogle();
            navigate('/');
        } catch (err) {
            setError('Failed to sign in with Google. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleGuestLogin = async () => {
        try {
            setError('');
            setLoading(true);
            await signInAsGuest();
            navigate('/');
        } catch (err) {
            setError('Failed to continue as guest. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-container">
                <GlassCard className="auth-card">
                    <div className="auth-header">
                        <div className="logo-icon-wrapper mb-4 mx-auto" style={{ width: '48px', height: '48px' }}>
                            <Zap size={24} fill="currentColor" className="logo-icon" />
                        </div>
                        <h2>SyncRoom</h2>
                        <p>Sign in to host rooms or continue as guest</p>
                    </div>

                    {error && <div className="error-msg text-center mb-4">{error}</div>}

                    <div className="auth-form">
                        <GlowButton
                            variant="secondary"
                            size="lg"
                            fullWidth
                            onClick={handleGuestLogin}
                            disabled={loading}
                        >
                            <User size={18} className="mr-2" />
                            Continue as Guest
                        </GlowButton>

                        <div className="divider">
                            <span>OR</span>
                        </div>

                        <button
                            className="google-btn"
                            onClick={handleGoogleLogin}
                            disabled={loading}
                        >
                            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" />
                            <span>Sign in with Google</span>
                        </button>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
};

export default Login;
