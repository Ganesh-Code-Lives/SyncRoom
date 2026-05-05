import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';
import { Zap, Instagram, Twitter } from 'lucide-react';

const Footer = () => {
    return (
        <footer className="footer">
            <div className="footer-content">
                {/* Brand Column */}
                <div className="footer-col brand-col">
                    <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <Zap size={20} color="#a855f7" fill="#a855f7" />
                        <h3 className="footer-brand" style={{ margin: 0 }}>SyncRoom</h3>
                    </Link>
                    <p className="footer-desc">
                        A premium, low-latency synchronized media experience for friends, couples, and remote teams.
                    </p>
                    <div className="social-links" style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <a href="https://www.instagram.com/ganesh.exe/" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="Instagram">
                            <Instagram size={20} color="#cbd5e1" />
                        </a>
                        <a href="https://x.com/ganeshXtweets?s=20" target="_blank" rel="noopener noreferrer" className="social-link" aria-label="X (Twitter)">
                            <Twitter size={20} color="#cbd5e1" />
                        </a>
                    </div>
                </div>

                {/* Navigation Columns */}
                <div className="footer-col">
                    <h4>Product</h4>
                    <Link to="/how-to-use" className="footer-link">How to Use</Link>
                    <a href="/#features" className="footer-link">Features</a>
                    <Link to="/faq" className="footer-link">FAQ</Link>
                </div>

                <div className="footer-col">
                    <h4>Company</h4>
                    <Link to="/about" className="footer-link">About Us</Link>
                    <Link to="/blog" className="footer-link">Blog</Link>
                    <Link to="/contact" className="footer-link">Contact</Link>
                </div>

                <div className="footer-col">
                    <h4>Legal</h4>
                    <Link to="/privacy-policy" className="footer-link">Privacy Policy</Link>
                    <Link to="/terms" className="footer-link">Terms of Service</Link>
                </div>
            </div>

            <div className="footer-bottom">
                <p className="copyright">© {new Date().getFullYear()} SyncRoom. All rights reserved.</p>
                <p>Developed by <span className="developer-name">Ganesh Mamidiseththy</span></p>
            </div>
        </footer>
    );
};

export default Footer;

