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

      <div className="page-content" style={{ lineHeight: '1.8' }}>
        <section style={{ marginBottom: '3rem' }}>
          <h2><Info size={24} /> Our Story</h2>
          <p>
            SyncRoom was born out of a simple, universal necessity: wanting to watch movies, share experiences, and spend quality time with friends and family who live miles away. In an increasingly globalized world, traditional video calls simply lacked the synchronization needed to truly enjoy media together. We found ourselves constantly dealing with the "1, 2, 3, hit play" countdowns, only for someone's stream to buffer, completely ruining the shared experience. Existing tools were often clunky, required heavy desktop downloads, hid their best features behind expensive paywalls, or suffered from incredibly high latency that made natural conversation impossible.
          </p>
          <p>
            We built SyncRoom to solve this exact problem from the ground up. Our primary goal is to provide a seamless, perfectly synchronized, and ultra-low-latency environment where distance doesn't mean missing out on shared moments. Whether you are continents apart or just across the city, SyncRoom makes it feel like you are sitting on the same couch, enjoying the same content, at the exact same millisecond.
          </p>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2><Globe size={24} /> The Technology Behind SyncRoom</h2>
          <p>
            SyncRoom is a cutting-edge communication platform built entirely on modern web technologies. We leverage <strong>WebRTC (Web Real-Time Communication)</strong> to enable peer-to-peer and server-relayed audio and video streaming directly in your browser. This means you do not need to install any third-party extensions or executable files; everything runs securely within your standard web browser.
          </p>
          <p>
            Unlike basic peer-to-peer (P2P) systems that struggle and degrade in quality when more than two users join a room, SyncRoom utilizes a robust <strong>Selective Forwarding Unit (SFU) architecture</strong> powered by enterprise-grade WebRTC media servers. This architectural choice is critical: it means your device only needs to send its media stream to our server once, and our server efficiently distributes it to all other participants in the room. This drastically reduces the upload bandwidth required on your end, saves battery life on mobile devices, and ensures a stable, high-definition experience even in larger group watch parties. By separating the media routing from the application logic, we achieve the lowest possible latency for voice, video, and playback synchronization.
          </p>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2><Users size={24} /> Who is SyncRoom For?</h2>
          <p>We designed SyncRoom to be versatile and accommodate a wide variety of use cases:</p>
          <ul style={{ marginTop: '1rem' }}>
            <li style={{ marginBottom: '1rem' }}><strong>Long-Distance Friends & Couples:</strong> Watch your favorite shows, movies, or YouTube videos together in perfect sync. Our chat and reaction features allow you to interact without talking over the dialogue.</li>
            <li style={{ marginBottom: '1rem' }}><strong>Study Groups & Education:</strong> Share educational content, collaborate on complex web pages, and discuss in real-time. Students can pause lectures to ask questions, ensuring everyone understands the material before moving on.</li>
            <li style={{ marginBottom: '1rem' }}><strong>Remote Teams:</strong> Review video content, design presentations, or simply have a virtual break room. SyncRoom provides a more relaxed and engaging environment compared to traditional corporate conferencing tools.</li>
            <li style={{ marginBottom: '1rem' }}><strong>Global Watch Parties:</strong> Host synchronized viewing events for live streams or e-sports with built-in voice and text chat, scaling smoothly as your friend group grows.</li>
          </ul>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2><Shield size={24} /> Our Commitment to Privacy and Security</h2>
          <p>
            As a real-time communication platform, we prioritize your privacy above all else. We fundamentally believe that your private rooms should remain private. We do not record, store, or monitor your audio, video, or chat communications. The media you stream is entirely transient and is securely transmitted using industry-standard WebRTC encryption protocols (DTLS and SRTP). 
          </p>
          <p>
            We also comply with modern web standards regarding data collection and tracking. For complete transparency on what limited analytical data we collect to keep our servers running, how we use cookies, and our relationship with third-party advertising partners like Google AdSense, please review our comprehensive <Link to="/privacy-policy" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>Privacy Policy</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
