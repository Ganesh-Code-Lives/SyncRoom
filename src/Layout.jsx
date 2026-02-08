import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import './Layout.css';

const Layout = () => {
    const location = useLocation();
    const isRoom = location.pathname.startsWith('/room/');

    return (
        <div className="app-shell">
            {!isRoom && <Header />}

            <main className="main-content-area">
                <Outlet />
            </main>

            {!isRoom && <Footer />}

            {/* Global Toast Container could go here */}
        </div>
    );
};

export default Layout;
