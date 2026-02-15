import React from 'react';
import { Zap } from 'lucide-react';
import './LoadingScreen.css';

const LoadingScreen = ({ message = "Loading SyncRoom..." }) => {
    return (
        <div className="loading-screen-container">
            <div className="loading-glow-backdrop"></div>

            <div className="loading-card glass-panel">
                <div className="loading-logo-wrapper">
                    <div className="loading-logo-circle">
                        <Zap size={32} fill="currentColor" className="loading-icon" />
                    </div>
                </div>

                <h2 className="loading-title">{message}</h2>

                <div className="loading-progress-container">
                    <div className="loading-progress-bar">
                        <div className="loading-progress-shimmer"></div>
                    </div>
                </div>

                <div className="loading-status-text">
                    Establishing secure connection...
                </div>
            </div>
        </div>
    );
};

export default LoadingScreen;
