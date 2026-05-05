import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { RoomProvider } from './context/RoomContext';
import { VoiceProvider } from './context/VoiceContext';
import { AuthProvider } from './context/AuthContext';
import Layout from './Layout';
import Landing from './pages/Landing';
import CreateRoom from './pages/CreateRoom';
import JoinRoom from './pages/JoinRoom';
import Room from './pages/Room';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Account from './pages/Account';
import PrivacyPolicy from './pages/PrivacyPolicy';
import About from './pages/About';
import Contact from './pages/Contact';
import Terms from './pages/Terms';
import FAQ from './pages/FAQ';
import HowToUse from './pages/HowToUse';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import ScrollToTop from './components/ScrollToTop';
import CookieBanner from './components/CookieBanner';
import './index.css';

import { ToastProvider } from './context/ToastContext';
import ToastContainer from './components/ToastContainer';

function App() {
  console.log('App rendering...');
  return (
    <Router>
      <ScrollToTop />
      <CookieBanner />
      <ToastProvider>
        <AuthProvider>
          <RoomProvider>
            <VoiceProvider>
              <ToastContainer />
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/" element={<Landing />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/create" element={<CreateRoom />} />
                  <Route path="/join" element={<JoinRoom />} />
                  <Route path="/join/:roomId" element={<JoinRoom />} />
                  <Route path="/room/:roomId" element={<Room />} />
                  <Route path="/account" element={<Account />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/faq" element={<FAQ />} />
                  <Route path="/how-to-use" element={<HowToUse />} />
                  <Route path="/blog" element={<Blog />} />
                  <Route path="/blog/:slug" element={<BlogPost />} />
                </Route>
              </Routes>
            </VoiceProvider>
          </RoomProvider>
        </AuthProvider>
      </ToastProvider>
    </Router>

  );
}

export default App;
