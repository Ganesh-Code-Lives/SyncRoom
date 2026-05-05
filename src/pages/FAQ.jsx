import React, { useEffect } from 'react';
import './Pages.css';
import { HelpCircle } from 'lucide-react';

export default function FAQ() {
  useEffect(() => {
    
    document.title = 'Frequently Asked Questions - SyncRoom';
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Frequently Asked Questions</h1>
        <p className="page-subtitle">Everything you need to know about using SyncRoom.</p>
      </div>

      <div className="page-content">
        <section>
          <h2><HelpCircle size={24} /> General Questions</h2>
          
          <div className="faq-item">
            <div className="faq-question">What is SyncRoom?</div>
            <div className="faq-answer">
              SyncRoom is a real-time web application that allows friends, couples, and groups to watch videos, listen to music, and browse the web together in perfect synchronization, regardless of distance. It includes built-in video, audio, and text chat.
            </div>
          </div>

          <div className="faq-item">
            <div className="faq-question">Is SyncRoom free to use?</div>
            <div className="faq-answer">
              Yes! SyncRoom is currently 100% free to use. You can create a room, invite friends, and start watching together without paying any subscription fees.
            </div>
          </div>

          <div className="faq-item">
            <div className="faq-question">Do I need to download an app or extension?</div>
            <div className="faq-answer">
              No. SyncRoom runs entirely within your web browser (Chrome, Edge, Firefox, Safari). There are no software downloads or browser extensions required to use the core synchronization features.
            </div>
          </div>
        </section>

        <section>
          <h2><HelpCircle size={24} /> Technical & Usage</h2>

          <div className="faq-item">
            <div className="faq-question">How does the synchronization work?</div>
            <div className="faq-answer">
              When someone in the room pauses, plays, or seeks a video, SyncRoom sends a tiny data packet through our servers to everyone else in the room, telling their browsers to perform the exact same action instantly.
            </div>
          </div>

          <div className="faq-item">
            <div className="faq-question">Why does my camera or microphone not work?</div>
            <div className="faq-answer">
              First, ensure you have granted your browser permission to access your camera and microphone. If you are still having issues, check if another application (like Zoom or Teams) is currently using your hardware.
            </div>
          </div>

          <div className="faq-item">
            <div className="faq-question">Is it legal to use SyncRoom?</div>
            <div className="faq-answer">
              Yes, using the SyncRoom tool is completely legal. However, users are responsible for the content they choose to stream and share. You must ensure you have the right to view and share any copyrighted material within your private room sessions. We do not host any media content on our servers.
            </div>
          </div>
          
          <div className="faq-item">
            <div className="faq-question">How many people can join a room?</div>
            <div className="faq-answer">
              While there is no hard limit, we recommend keeping rooms to under 10-15 participants for the best audio/video quality, as streaming multiple high-definition camera feeds depends heavily on your local internet connection.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
