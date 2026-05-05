import React, { useEffect } from 'react';
import './Pages.css';
import { Scale, AlertTriangle, FileText } from 'lucide-react';

export default function Terms() {
  useEffect(() => {
    
    document.title = 'Terms of Service - SyncRoom';
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Terms of Service</h1>
        <p className="page-subtitle">Please read these terms carefully before using our platform.</p>
        <p className="text-sm text-slate-400 mt-2">Last updated: May 4, 2026</p>
      </div>

      <div className="page-content">
        <section>
          <h2><FileText size={24} /> 1. Acceptance of Terms</h2>
          <p>
            By accessing or using the SyncRoom website (syncroom.live) and services (collectively, the "Service"), you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the Service.
          </p>
        </section>

        <section>
          <h2><AlertTriangle size={24} /> 2. Nature of the Service</h2>
          <p>
            SyncRoom is a real-time communication platform that provides tools for users to synchronize web browsing and media playback among themselves. 
          </p>
          <div className="alert-box">
            <p><strong>Crucial Distinction:</strong> We are a synchronization tool, not a content host.</p>
          </div>
          <ul>
            <li><strong>No Content Hosting:</strong> SyncRoom does NOT host, upload, distribute, or store any media content (videos, music, movies) on our servers.</li>
            <li><strong>Synchronization Only:</strong> Our Service only transmits synchronization data (play, pause, timestamp) and direct WebRTC communication streams (camera, microphone, screen sharing data) between connected users.</li>
            <li><strong>Transient Data:</strong> All communication streams are transient and pass through our Selective Forwarding Unit (SFU) without being permanently recorded or archived.</li>
          </ul>
        </section>

        <section>
          <h2><Scale size={24} /> 3. Copyright and User Responsibility</h2>
          <p>
            Because SyncRoom allows users to share their screens and synchronize playback of content hosted on third-party websites, it is imperative that users respect intellectual property rights.
          </p>
          <ul>
            <li><strong>User Liability:</strong> You, the user, are solely responsible for the content you choose to view, share, or synchronize using SyncRoom.</li>
            <li><strong>Legal Rights:</strong> You must ensure that you have the legal right, license, or permission to access and share any media content within your private SyncRoom sessions.</li>
            <li><strong>No Infringement:</strong> You agree not to use SyncRoom to infringe upon the copyright, trademark, or other intellectual property rights of any third party.</li>
            <li><strong>Third-Party Terms:</strong> When synchronizing content from third-party platforms (e.g., YouTube, Netflix), you remain bound by the Terms of Service of those respective platforms.</li>
          </ul>
          <p>
            SyncRoom acts strictly as a "mere conduit" for communication and synchronization data. We actively disclaim any liability for copyright infringement committed by users utilizing our synchronization tools for unauthorized sharing of protected works.
          </p>
        </section>

        <section>
          <h2>4. Acceptable Use</h2>
          <p>You agree not to use the Service to:</p>
          <ul>
            <li>Engage in any unlawful, abusive, or harassing behavior.</li>
            <li>Distribute malware, viruses, or other harmful code.</li>
            <li>Attempt to bypass or disrupt the security or functioning of the Service.</li>
            <li>Use the Service for commercial streaming or public broadcasting without authorization.</li>
          </ul>
          <p>We reserve the right to terminate or suspend access to our Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.</p>
        </section>

        <section>
          <h2>5. Limitation of Liability</h2>
          <p>
            In no event shall SyncRoom, nor its developers, partners, or suppliers, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from (i) your access to or use of or inability to access or use the Service; (ii) any conduct or content of any third party on the Service; (iii) any content obtained from the Service; and (iv) unauthorized access, use or alteration of your transmissions or content.
          </p>
        </section>

        <section>
          <h2>6. Changes to Terms</h2>
          <p>
            We reserve the right, at our sole discretion, to modify or replace these Terms at any time. By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms.
          </p>
        </section>
        
        <section>
          <h2>7. Contact Us</h2>
          <p>If you have any questions about these Terms, please contact us at ganeshmamidisetti69@gmail.com.</p>
        </section>
      </div>
    </div>
  );
}
