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
          <h3>2.1 Information You Provide to Us</h3>
          <ul>
            <li><strong>Account Information:</strong> When you create an account, we collect your email address and a display name. This is used solely for authentication and personalizing your profile.</li>
            <li><strong>Room Data:</strong> Room names and settings you create or join are temporarily processed to route you to the correct session.</li>
            <li><strong>Contact Information:</strong> If you contact us directly, we may receive your name, email address, phone number, the contents of the message and/or attachments you may send us, and any other information you may choose to provide.</li>
          </ul>

          <h3>2.2 Information Collected Automatically</h3>
          <p>When you visit, use, or navigate the site, we automatically collect certain information. This information does not reveal your specific identity (like your name or contact information) but may include device and usage information:</p>
          <ul>
            <li><strong>Usage Data:</strong> Pages visited, features used, and session duration. This helps us understand how the platform is used and how we can improve it.</li>
            <li><strong>Device Information:</strong> We collect information about the computer, phone, tablet, or other device you use to access the service. Depending on the device used, this device data may include information such as your IP address (or proxy server), device and application identification numbers, location, browser type, hardware model, operating system, and system configuration information.</li>
            <li><strong>IP Address:</strong> Used strictly for connection routing, establishing peer-to-peer or server connections via WebRTC, and security monitoring. IP addresses are not stored permanently.</li>
            <li><strong>Cookies:</strong> Small data files stored on your device to remember your preferences (see Section 4 for details).</li>
          </ul>

          <h3>2.3 Media Data (Audio, Video, and Chat)</h3>
          <p>
            SyncRoom uses WebRTC technology for real-time audio and video communication. Your camera and
            microphone data is transmitted directly between users via our Selective Forwarding Unit (SFU)
            server. <strong>We strictly do NOT record, store, archive, or monitor your audio, video, or chat streams.</strong> Once a session ends, all media data is immediately discarded.
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
          <h2>4. Cookies and Tracking Technologies</h2>
          <p>
            We use cookies and similar tracking technologies (like web beacons and pixels) to access or store information, track activity on our service, and analyze usage. 
          </p>
          <h3>Types of cookies we use:</h3>
          <ul>
            <li><strong>Essential / Strictly Necessary Cookies:</strong> Required for the website to function (authentication, session management, security). Without these, the service cannot be provided.</li>
            <li><strong>Analytics / Performance Cookies:</strong> Help us understand how users interact with our site, track page visits, and identify errors.</li>
            <li><strong>Advertising / Targeting Cookies:</strong> Used by our advertising partners (such as Google AdSense) to show you relevant ads based on your browsing history.</li>
          </ul>
          <p><strong>Your Choices:</strong> You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do not accept essential cookies, you may not be able to use certain features of our service.</p>
        </section>

        <section>
          <h2>5. Third-Party Advertising (Google AdSense)</h2>
          <p>
            We use <strong>Google AdSense</strong> to display advertisements on our website. This helps us keep the service free for all users.
          </p>
          <p>
            Google, as a third-party vendor, uses cookies (specifically the DoubleClick cookie) to serve ads based on a user's prior visits to our website or other websites on the internet. Google's use of advertising cookies enables it and its partners to serve targeted ads to you based on your visit to our site and/or other sites across the Internet.
          </p>
          <p>
            <strong>Opting Out:</strong> You may opt out of personalized advertising by visiting the <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">Google Ads Settings</a> page. Alternatively, you can opt out of a third-party vendor's use of cookies for personalized advertising by visiting <a href="https://youradchoices.com/" target="_blank" rel="noopener noreferrer">www.aboutads.info</a>.
          </p>
          <p>
            For more information about how Google uses data when you use our partners' sites or apps, please visit:
            <br/>
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
