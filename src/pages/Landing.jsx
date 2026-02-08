import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Music, Video, Zap, ArrowRight } from 'lucide-react';
import Button from '../components/Button';
import Input from '../components/Input';
import Card from '../components/Card';
import Header from '../components/Header';
import Footer from '../components/Footer';
import './Landing.css';

const Landing = () => {
    const navigate = useNavigate();
    const [joinCode, setJoinCode] = useState('');

    const handleCreateRoom = () => {
        navigate('/create');
    };

    const handleJoinRoom = (e) => {
        e.preventDefault();
        if (joinCode.trim()) {
            navigate(`/join?code=${joinCode}`);
        }
    };

    return (
        <div className="landing-page">
            <main className="landing-main">
                {/* Hero Section */}
                <section className="hero-section">
                    <div className="hero-content">
                        <h1 className="hero-title">
                            Watch. Listen.<br />
                            <span className="text-gradient">Hang out. Together.</span>
                        </h1>
                        <p className="hero-subtitle">
                            SyncRoom brings your friends closer. Experience movies, music, and conversation in perfect sync, no matter the distance.
                        </p>

                        <div className="hero-actions">
                            <Button size="lg" onClick={handleCreateRoom}>
                                <Zap size={20} className="mr-2" />
                                Create Room
                            </Button>

                            <form onSubmit={handleJoinRoom} className="join-form">
                                <Input
                                    placeholder="Enter Room Code"
                                    value={joinCode}
                                    onChange={(e) => setJoinCode(e.target.value)}
                                    className="join-input"
                                />
                                <Button variant="secondary" size="lg" disabled={!joinCode.trim()}>
                                    Join
                                </Button>
                            </form>
                        </div>
                    </div>
                </section>

                {/* Features Grid */}
                <section className="features-section">
                    <h2 className="section-title">Why SyncRoom?</h2>
                    <div className="features-grid">
                        <Card hover className="feature-card">
                            <div className="feature-icon-wrapper icon-video">
                                <Video size={24} />
                            </div>
                            <h3 className="feature-title">Synchronized Viewing</h3>
                            <p className="feature-desc">
                                Watch YouTube or direct video links in perfect harmony. Pause, play, and seek together.
                            </p>
                        </Card>

                        <Card hover className="feature-card">
                            <div className="feature-icon-wrapper icon-music">
                                <Music size={24} />
                            </div>
                            <h3 className="feature-title">Shared Listening</h3>
                            <p className="feature-desc">
                                Jam to your favorite tracks. Everyone hears the same beat at the same time.
                            </p>
                        </Card>

                        <Card hover className="feature-card">
                            <div className="feature-icon-wrapper icon-users">
                                <Users size={24} />
                            </div>
                            <h3 className="feature-title">Real-time Chat</h3>
                            <p className="feature-desc">
                                Discuss the plot twist or the guitar solo with built-in text chat and reactions.
                            </p>
                        </Card>
                    </div>
                </section>

                {/* How it Works */}
                <section className="how-it-works">
                    <div className="steps-container">
                        <div className="step-item">
                            <div className="step-number">1</div>
                            <h3>Create a Room</h3>
                            <p>Start a session and choose your media type.</p>
                        </div>
                        <div className="step-divider"><ArrowRight size={20} /></div>
                        <div className="step-item">
                            <div className="step-number">2</div>
                            <h3>Invite Friends</h3>
                            <p>Share the unique room code with your crew.</p>
                        </div>
                        <div className="step-divider"><ArrowRight size={20} /></div>
                        <div className="step-item">
                            <div className="step-number">3</div>
                            <h3>Enjoy Together</h3>
                            <p>Play, pause, and chat in real-time.</p>
                        </div>
                    </div>
                </section>

            </main>
        </div >
    );
};

export default Landing;
