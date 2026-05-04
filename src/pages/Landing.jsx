import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Video, Zap, ArrowRight } from 'lucide-react';
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
                            Watch. Discuss.<br />
                            <span className="text-gradient">Hang out. Together.</span>
                        </h1>
                        <p className="hero-subtitle">
                            SyncRoom brings your friends closer. Experience movies and conversation in perfect sync, no matter the distance.
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

                {/* What is SyncRoom - SEO Text Block */}
                <section className="seo-text-section">
                    <h2 className="section-title">What is SyncRoom?</h2>
                    <div className="seo-text-grid">
                        <p>
                            SyncRoom is a free, web-based platform designed to bring people together through synchronized media. Whether you are in a long-distance relationship, running a remote study group, or just want to hang out with friends across the country, our platform ensures you are always on the same page—literally.
                        </p>
                        <p>
                            We use advanced WebRTC technology and a Selective Forwarding Unit (SFU) to ensure that when you press play, pause, or skip, the action happens instantly for everyone in your private room. Combined with built-in low-latency video and audio chat, it is the closest thing to sharing a couch in the digital world.
                        </p>
                    </div>
                </section>

                {/* Features Grid */}
                <section id="features" className="features-section">
                    <h2 className="section-title" style={{ textAlign: 'center' }}>Why SyncRoom?</h2>
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
                            <div className="feature-icon-wrapper icon-users">
                                <Users size={24} />
                            </div>
                            <h3 className="feature-title">Real-time Chat</h3>
                            <p className="feature-desc">
                                Discuss the plot twist or react to every moment with built-in text chat and reactions.
                            </p>
                        </Card>

                        <Card hover className="feature-card">
                            <div className="feature-icon-wrapper icon-video" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                                <Video size={24} />
                            </div>
                            <h3 className="feature-title">Tab Sharing</h3>
                            <p className="feature-desc">
                                Stream any website or browser tab directly to your friends with high-performance SFU tech.
                            </p>
                        </Card>
                    </div>
                </section>

                {/* Who is it for? */}
                <section className="use-cases-section">
                    <div className="use-cases-container">
                        <h2 className="section-title" style={{ textAlign: 'center' }}>Who Uses SyncRoom?</h2>
                        <div className="use-cases-grid">
                            <Card className="use-case-card">
                                <h3>Long-Distance Couples</h3>
                                <p>Bridge the physical gap by scheduling weekly movie nights. SyncRoom's precise timing means you'll both jump at the scary parts at the exact same time.</p>
                            </Card>
                            <Card className="use-case-card">
                                <h3>Study Groups & Students</h3>
                                <p>Review recorded lectures or share educational YouTube videos. Use the chat to discuss complex topics without interrupting the video flow.</p>
                            </Card>
                            <Card className="use-case-card">
                                <h3>Remote Teams</h3>
                                <p>Need a break from formal meetings? Host a virtual team lunch and watch entertaining content together in a relaxed, synchronized environment.</p>
                            </Card>
                        </div>
                    </div>
                </section>

                {/* How it Works */}
                <section id="how-it-works" className="how-it-works">
                    <div className="steps-container">
                        <div className="step-item">
                            <div className="step-number">1</div>
                            <h3>Create a Room</h3>
                            <p>Start a session and pick your favorite video content.</p>
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
                            <p>Play, pause, and explore web content together.</p>
                        </div>
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '3rem' }}>
                        <p style={{ color: '#cbd5e1', marginBottom: '1rem' }}>Need more detailed instructions?</p>
                        <Button variant="secondary" onClick={() => navigate('/how-to-use')}>Read the Full Guide</Button>
                    </div>
                </section>

                {/* Mini FAQ for SEO */}
                <section className="mini-faq-section">
                    <h2 className="section-title" style={{ textAlign: 'center' }}>Frequently Asked Questions</h2>
                    <div className="faq-list">
                        <Card className="faq-card">
                            <h3>Is SyncRoom completely free?</h3>
                            <p>Yes, creating rooms and inviting friends is currently 100% free with no hidden subscriptions or forced downloads.</p>
                        </Card>
                        <Card className="faq-card">
                            <h3>Do I need to install an extension?</h3>
                            <p>No! Unlike many competitors, SyncRoom runs entirely in your browser. There are no extensions or desktop apps to install.</p>
                        </Card>
                        <Card className="faq-card">
                            <h3>Can I use my camera and microphone?</h3>
                            <p>Absolutely. SyncRoom features built-in WebRTC video and audio chat so you can see and hear your friends' reactions in real-time while you watch.</p>
                        </Card>
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                        <Button variant="ghost" onClick={() => navigate('/faq')}>View All FAQs</Button>
                    </div>
                </section>

            </main>
        </div >
    );
};

export default Landing;
