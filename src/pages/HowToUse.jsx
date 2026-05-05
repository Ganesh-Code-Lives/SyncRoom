import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Pages.css';
import { Play, Share2, Video, MessageSquare } from 'lucide-react';
import Button from '../components/Button';

export default function HowToUse() {
  useEffect(() => {
    
    document.title = 'How to Use SyncRoom - Step by Step Guide';
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>How to Use SyncRoom</h1>
        <p className="page-subtitle">A simple, step-by-step guide to hosting your first synchronized watch party.</p>
      </div>

      <div className="page-content">
        <section>
          <h2><Play size={24} /> Step 1: Create a Room</h2>
          <p>
            Starting a watch party is incredibly easy. You don't even need an account to get started as a guest.
          </p>
          <ol>
            <li>Navigate to the <Link to="/">SyncRoom Homepage</Link>.</li>
            <li>Click the large <strong>"Create Room"</strong> button.</li>
            <li>Enter your display name. This is how your friends will identify you in the room.</li>
            <li>Click "Create & Join". You will instantly be taken to your new private room.</li>
          </ol>
        </section>

        <section>
          <h2><Share2 size={24} /> Step 2: Invite Your Friends</h2>
          <p>
            A watch party isn't a party without friends. Here is how you bring them in:
          </p>
          <ol>
            <li>Once inside the room, look at the top left corner of the screen. You will see a unique <strong>Room Code</strong> (e.g., `abc-123-xyz`).</li>
            <li>Copy this code or copy the full URL from your browser's address bar.</li>
            <li>Send the code or link to your friends via Discord, WhatsApp, iMessage, or email.</li>
            <li>Your friends simply need to click the link, enter their display name, and they will join your room.</li>
          </ol>
        </section>

        <section>
          <h2><Video size={24} /> Step 3: Load Media & Sync</h2>
          <p>
            Now for the fun part: watching content together.
          </p>
          <ol>
            <li>In the center of the room, you will see a media player input box.</li>
            <li>Paste a link to a supported video (such as a YouTube video URL, a direct .mp4 link, or a SoundCloud track).</li>
            <li>Click <strong>"Load Media"</strong>. The video will appear on everyone's screen simultaneously.</li>
            <li><strong>The Magic:</strong> When you click play, pause, or skip to a specific timestamp, it happens for everyone else in the room at the exact same time. Anyone can control the playback!</li>
          </ol>
        </section>

        <section>
          <h2><MessageSquare size={24} /> Step 4: Chat and React</h2>
          <p>
            Discuss the movie or video in real-time using our communication tools:
          </p>
          <ul>
            <li><strong>Video/Audio Chat:</strong> Click the camera or microphone icons at the bottom of the screen to enable WebRTC voice and video chat. You can see and hear your friends' reactions live!</li>
            <li><strong>Text Chat:</strong> Use the chat panel on the right side of the screen to send text messages, share links, or drop emojis without talking over the movie.</li>
            <li><strong>Screen Sharing:</strong> Want to show a specific website instead of a video? Click the screen share icon to broadcast your browser tab directly to the group.</li>
          </ul>
        </section>
        
        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
          <h3>Ready to try it out?</h3>
          <Link to="/create">
            <Button size="lg" style={{ marginTop: '1rem' }}>Create a Room Now</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
