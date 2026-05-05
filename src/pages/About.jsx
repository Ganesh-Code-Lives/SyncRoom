import React, { useEffect } from 'react';
import './Pages.css';
import { Info, Users, Shield, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function About() {
  useEffect(() => {
    
    document.title = 'About SyncRoom - Our Mission & Technology';
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>About SyncRoom</h1>
        <p className="page-subtitle">Bridging the gap between distance and shared experiences.</p>
      </div>

      <div className="page-content">
        <section>
          <h2><Info size={24} /> Our Story</h2>
          <p>
            SyncRoom was born out of a simple necessity: wanting to watch movies and share experiences with friends and family who live miles away. Traditional video calls lacked the synchronization needed to truly enjoy media together, and existing tools were often clunky, required downloads, or had high latency.
          </p>
          <p>
            We built SyncRoom to solve this. Our goal is to provide a seamless, synchronized, and low-latency environment where distance doesn't mean missing out on shared moments.
          </p>
        </section>

        <section>
          <h2><Globe size={24} /> The Technology Behind SyncRoom</h2>
          <p>
            SyncRoom is a communication platform built on modern web technologies. We leverage <strong>WebRTC (Web Real-Time Communication)</strong> to enable peer-to-peer and server-relayed audio and video streaming directly in your browser.
          </p>
          <p>
            Unlike peer-to-peer (P2P) systems that struggle when many users join a room, SyncRoom utilizes a <strong>Selective Forwarding Unit (SFU) architecture</strong> powered by Mediasoup. This means your device only sends its media stream to our server once, and our server distributes it to all other participants. This drastically reduces the upload bandwidth required on your end and ensures a stable experience even in larger groups.
          </p>
        </section>

        <section>
          <h2><Users size={24} /> Who is SyncRoom For?</h2>
          <ul>
            <li><strong>Long-Distance Friends & Couples:</strong> Watch your favorite shows, movies, or YouTube videos together in perfect sync.</li>
            <li><strong>Study Groups:</strong> Share educational content, collaborate on web pages, and discuss in real-time.</li>
            <li><strong>Remote Teams:</strong> Review video content, presentations, or simply have a virtual break room.</li>
            <li><strong>Watch Parties:</strong> Host synchronized viewing events with built-in voice and text chat.</li>
          </ul>
        </section>

        <section>
          <h2><Shield size={24} /> Our Commitment to Privacy</h2>
          <p>
            As a communication platform, we prioritize your privacy. We do not record, store, or monitor your audio, video, or chat communications. The media you stream is transient and securely transmitted using industry-standard WebRTC encryption. For more details, please review our <Link to="/privacy-policy">Privacy Policy</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
