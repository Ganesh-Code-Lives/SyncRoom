import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './PrivacyPolicy.css';

export default function PrivacyPolicy() {
  useEffect(() => {
    
    document.title = 'Privacy Policy – SyncRoom';
  }, []);

  return (
    <div className="privacy-container">
      <div className="privacy-header">
        <div className="privacy-logo">
          <svg width="32" height="32" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <polygon points="60,6 26,54 46,54 40,94 74,46 54,46" fill="#a855f7" />
          </svg>
          <span>SyncRoom</span>
        </div>
        <h1>Privacy Policy</h1>
        <p className="privacy-updated">Last updated: May 4, 2026</p>
      </div>

      <div className="privacy-content">

        <section>
          <h2>1. Introduction</h2>
          <p>
            Welcome to SyncRoom ("we", "our", or "us"). We are committed to protecting your personal
            information and your right to privacy. This Privacy Policy explains how we collect, use,
            and share information when you use our website at <strong>syncroom.live</strong> and our
            real-time communication services.
          </p>
          <p>
            By using SyncRoom, you agree to the collection and use of information in accordance with this policy.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>
          <h3>2.1 Information You Provide</h3>
          <ul>
            <li><strong>Account Information:</strong> When you create an account, we collect your email address and a display name.</li>
            <li><strong>Room Data:</strong> Room names and settings you create or join.</li>
          </ul>

          <h3>2.2 Information Collected Automatically</h3>
          <ul>
            <li><strong>Usage Data:</strong> Pages visited, features used, and session duration.</li>
            <li><strong>Device Information:</strong> Browser type, operating system, and screen resolution.</li>
            <li><strong>IP Address:</strong> Used for connection routing and security (not stored permanently).</li>
            <li><strong>Cookies:</strong> Small data files stored on your device to remember your preferences.</li>
          </ul>

          <h3>2.3 Media Data</h3>
          <p>
            SyncRoom uses WebRTC technology for real-time audio and video communication. Your camera and
            microphone data is transmitted directly between users via our Selective Forwarding Unit (SFU)
            server. <strong>We do NOT record, store, or archive your audio or video streams.</strong>
          </p>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <ul>
            <li>To provide, maintain, and improve our services.</li>
            <li>To authenticate you and manage your account.</li>
            <li>To enable real-time communication features (video, audio, chat).</li>
            <li>To analyze usage patterns and fix bugs.</li>
            <li>To display relevant advertisements (see Section 5).</li>
            <li>To send you important service-related notices.</li>
          </ul>
        </section>

        <section>
          <h2>4. Cookies</h2>
          <p>
            We use cookies and similar tracking technologies to track activity on our service and store certain information.
          </p>
          <h3>Types of cookies we use:</h3>
          <ul>
            <li><strong>Essential Cookies:</strong> Required for the website to function (authentication, session management).</li>
            <li><strong>Analytics Cookies:</strong> Help us understand how users interact with our site.</li>
            <li><strong>Advertising Cookies:</strong> Used by our advertising partners to show you relevant ads.</li>
          </ul>
          <p>You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.</p>
        </section>

        <section>
          <h2>5. Third-Party Advertising (Google AdSense)</h2>
          <p>
            We use <strong>Google AdSense</strong> to display advertisements on our website. Google, as a
            third-party vendor, uses cookies to serve ads based on a user's prior visits to our website
            or other websites on the internet.
          </p>
          <p>
            Google's use of advertising cookies enables it and its partners to serve ads to you based on your
            visit to our site and/or other sites on the Internet. You may opt out of personalized advertising
            by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">Google Ads Settings</a>.
          </p>
          <p>
            For more information about how Google uses data when you use our partners' sites or apps, visit:
            <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
              How Google uses information from sites or apps that use our services
            </a>.
          </p>
        </section>

        <section>
          <h2>6. Data Sharing and Disclosure</h2>
          <p>We do not sell your personal information. We may share data with:</p>
          <ul>
            <li><strong>Service Providers:</strong> Trusted third parties who assist us in operating our website (e.g., hosting providers like Oracle Cloud, Vercel).</li>
            <li><strong>Advertising Partners:</strong> Google AdSense as described above.</li>
            <li><strong>Legal Requirements:</strong> If required by law or in response to valid legal requests.</li>
          </ul>
        </section>

        <section>
          <h2>7. Data Retention</h2>
          <p>
            We retain your account information for as long as your account is active. You may request deletion
            of your account and associated data at any time by contacting us. Media data (audio/video) is
            never stored and is not retained.
          </p>
        </section>

        <section>
          <h2>8. Security</h2>
          <p>
            We take the security of your data seriously. All connections to SyncRoom are encrypted via
            HTTPS/TLS. Our backend uses secure WebSocket (WSS) connections. However, no method of
            transmission over the Internet is 100% secure.
          </p>
        </section>

        <section>
          <h2>9. Children's Privacy</h2>
          <p>
            SyncRoom is not intended for children under the age of 13. We do not knowingly collect
            personal information from children under 13. If you become aware that a child has provided
            us with personal data, please contact us.
          </p>
        </section>

        <section>
          <h2>10. Your Rights</h2>
          <p>Depending on your location, you may have the right to:</p>
          <ul>
            <li>Access the personal information we hold about you.</li>
            <li>Request correction of inaccurate data.</li>
            <li>Request deletion of your personal data.</li>
            <li>Opt out of personalized advertising.</li>
            <li>Lodge a complaint with your local data protection authority.</li>
          </ul>
        </section>

        <section>
          <h2>11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any changes by
            posting the new policy on this page and updating the "Last updated" date at the top. We
            recommend reviewing this policy periodically.
          </p>
        </section>

        <section>
          <h2>12. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy or our data practices, please contact us:
          </p>
          <ul>
            <li><strong>Website:</strong> <a href="https://syncroom.live">syncroom.live</a></li>
            <li><strong>Email:</strong> ganeshmamidisetti69@gmail.com</li>
          </ul>
        </section>

      </div>

      <div className="privacy-footer">
        <p>© {new Date().getFullYear()} SyncRoom. All rights reserved.</p>
        <Link to="/" className="privacy-back-btn">← Return to Home</Link>
      </div>
    </div>
  );
}
