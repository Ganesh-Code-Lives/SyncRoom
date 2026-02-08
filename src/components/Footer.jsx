import React from 'react';
import './Footer.css';

const Footer = () => {
    return (
        <footer className="footer">
            <div className="footer-content">
                {/* Column 1: Brand */}
                <div className="footer-col brand-col">
                    <h3 className="footer-brand">SyncRoom</h3>
                    <p className="footer-desc">
                        Watch together, listen together. A premium synchronized media experience for friends.
                    </p>
                    <p className="copyright">© {new Date().getFullYear()} SyncRoom.</p>
                </div>

                {/* Column 2: Product */}
                <div className="footer-col">
                    <h4>Product</h4>
                    <a href="#" className="footer-link">Features</a>
                    <a href="#" className="footer-link">Pricing</a>
                    <a href="#" className="footer-link">Download</a>
                    <a href="#" className="footer-link">Changelog</a>
                </div>

                {/* Column 3: Resources */}
                <div className="footer-col">
                    <h4>Resources</h4>
                    <a href="#" className="footer-link">Community</a>
                    <a href="#" className="footer-link">Help Center</a>
                    <a href="#" className="footer-link">Status</a>
                    <a href="#" className="footer-link">Terms of Service</a>
                </div>

                {/* Column 4: Social */}
                <div className="footer-col">
                    <h4>Connect</h4>
                    <a href="#" className="footer-link">Twitter</a>
                    <a href="#" className="footer-link">Discord</a>
                    <a href="#" className="footer-link">GitHub</a>
                    <a href="#" className="footer-link">Instagram</a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
