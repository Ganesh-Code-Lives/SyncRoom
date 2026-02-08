import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Zap, LogOut, User, Menu, X, Plus, Play } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { useAuth } from '../context/AuthContext';
import Button from './Button';
import './Header.css';

const Header = () => {
    const { room, leaveRoom } = useRoom();
    const { user, isGuest, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const isRoomPage = location.pathname.startsWith('/room');

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [joinCode, setJoinCode] = useState('');

    const menuRef = useRef(null);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

    const handleLogout = () => {
        setIsMenuOpen(false);
        logout();
    };

    const handleJoinSubmit = (e) => {
        e.preventDefault();
        if (joinCode.trim()) {
            navigate(`/join?code=${joinCode}`);
            setShowJoinModal(false);
            setJoinCode('');
        }
    };

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const getInitials = (name) => {
        return name
            ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
            : 'U';
    };

    return (
        <header className="header">
            <div className="header-container">
                {/* Left: Logo */}
                <Link to="/" className="logo-link">
                    <div className="logo-icon-wrapper">
                        <Zap size={20} fill="currentColor" className="logo-icon" />
                    </div>
                    <span className="logo-text">SyncRoom</span>
                </Link>

                {/* Center: Navigation (Desktop) */}
                {!isRoomPage && (
                    <nav className="header-nav desktop-only">
                        <Link to="/" className="nav-link">Home</Link>
                        <a href="#features" className="nav-link">Features</a>
                        <a href="#how-it-works" className="nav-link">How It Works</a>
                    </nav>
                )}

                {/* Right: Actions */}
                <div className="header-actions">
                    {/* Join Room Quick Action */}
                    {!isRoomPage && (
                        <button
                            className="join-room-btn desktop-only"
                            onClick={() => setShowJoinModal(true)}
                        >
                            <Play size={16} fill="currentColor" />
                            <span>Join Room</span>
                        </button>
                    )}

                    {isRoomPage && room && (
                        <div className="room-info-badge">
                            <span className="room-code-label">Code:</span>
                            <span className="room-code-value">{room.code}</span>
                        </div>
                    )}

                    {isRoomPage ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={leaveRoom}
                            className="leave-btn"
                        >
                            <LogOut size={16} />
                            <span className="leave-text">Leave</span>
                        </Button>
                    ) : (
                        user ? (
                            <div className="user-menu-container" ref={menuRef}>
                                <button
                                    className={`user-avatar-btn ${isMenuOpen ? 'active' : ''}`}
                                    onClick={toggleMenu}
                                    aria-label="User menu"
                                >
                                    {user.photoURL ? (
                                        <img src={user.photoURL} alt={user.displayName} className="user-avatar-img" />
                                    ) : (
                                        <div className="user-avatar-placeholder">
                                            {getInitials(user.displayName || (isGuest ? 'Guest' : 'User'))}
                                        </div>
                                    )}
                                    <span className="status-indicator online"></span>
                                </button>

                                {isMenuOpen && (
                                    <div className="dropdown-menu">
                                        <div className="dropdown-header">
                                            <div className="dropdown-user-info">
                                                <p className="dropdown-name">{user.displayName || (isGuest ? 'Guest' : 'User')}</p>
                                                <p className="dropdown-email">{isGuest ? 'Guest User' : user.email}</p>
                                            </div>
                                        </div>
                                        <div className="dropdown-divider"></div>
                                        <Link to="/account" className="dropdown-item" onClick={() => setIsMenuOpen(false)}>
                                            <User size={16} />
                                            <span>Profile</span>
                                        </Link>
                                        <button className="dropdown-item text-danger" onClick={handleLogout}>
                                            <LogOut size={16} />
                                            <span>Logout</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="auth-buttons">
                                <Link to="/login">
                                    <Button variant="primary" size="sm">Get Started</Button>
                                </Link>
                            </div>
                        )
                    )}

                    {/* Mobile Menu Toggle */}
                    <button className="mobile-menu-toggle" onClick={toggleMobileMenu}>
                        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>
            </div>

            {/* Mobile Navigation Menu */}
            {isMobileMenuOpen && (
                <div className="mobile-menu">
                    <nav className="mobile-nav">
                        <Link to="/" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>Home</Link>
                        <a href="#features" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>Features</a>
                        <a href="#how-it-works" className="mobile-nav-link" onClick={() => setIsMobileMenuOpen(false)}>How It Works</a>
                        <button
                            className="mobile-nav-link text-left"
                            onClick={() => {
                                setIsMobileMenuOpen(false);
                                setShowJoinModal(true);
                            }}
                        >
                            Join Room
                        </button>
                    </nav>
                </div>
            )}

            {/* Join Room Modal */}
            {showJoinModal && (
                <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
                    <div className="modal-content glass-panel" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Join a Room</h3>
                            <button className="close-btn" onClick={() => setShowJoinModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleJoinSubmit} className="modal-form">
                            <input
                                type="text"
                                placeholder="Enter Room Code"
                                className="modal-input"
                                value={joinCode}
                                onChange={e => setJoinCode(e.target.value)}
                                autoFocus
                            />
                            <Button type="submit" fullWidth disabled={!joinCode.trim()}>
                                Join Now
                            </Button>
                        </form>
                    </div>
                </div>
            )}
        </header>
    );
};

export default Header;
