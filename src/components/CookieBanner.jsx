import React, { useState, useEffect } from 'react';
import './CookieBanner.css';

const CookieBanner = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const consent = localStorage.getItem('syncroom_cookie_consent');
        if (!consent) {
            // Add a small delay for a smoother entrance
            const timer = setTimeout(() => setIsVisible(true), 1000);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem('syncroom_cookie_consent', 'true');
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <div className="cookie-banner-overlay">
            <div className="cookie-banner">
                <div className="cookie-content">
                    <h4>We value your privacy</h4>
                    <p>
                        We use cookies to enhance your browsing experience, serve personalized ads or content, and analyze our traffic. By clicking "Accept Cookies", you consent to our use of cookies.
                    </p>
                </div>
                <div className="cookie-actions">
                    <button className="btn btn-primary" onClick={handleAccept}>
                        Accept Cookies
                    </button>
                    <a href="/privacy-policy" className="btn btn-ghost" style={{ fontSize: '0.875rem' }}>
                        Read Policy
                    </a>
                </div>
            </div>
        </div>
    );
};

export default CookieBanner;
