import React, { useEffect, useState } from 'react';
import './Pages.css';
import { Mail, MessageSquare, Send } from 'lucide-react';
import Button from '../components/Button';
import { useToast } from '../context/ToastContext';

export default function Contact() {
  const { addToast } = useToast();
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    
    document.title = 'Contact Us - SyncRoom';
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      addToast('Message sent successfully! We will get back to you soon.', 'success');
      setFormData({ name: '', email: '', message: '' });
    }, 1000);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Contact Us</h1>
        <p className="page-subtitle">Have questions, feedback, or need support? We're here to help.</p>
      </div>

      <div className="page-content">
        <section>
          <h2><MessageSquare size={24} /> Get in Touch</h2>
          <p>
            Whether you've found a bug, have a feature request, or just want to say hello, we'd love to hear from you. 
            Fill out the form below, and our team will respond as soon as possible.
          </p>

          <form className="contact-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">Your Name</label>
              <input 
                type="text" 
                id="name" 
                name="name" 
                className="form-control" 
                placeholder="John Doe"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input 
                type="email" 
                id="email" 
                name="email" 
                className="form-control" 
                placeholder="john@example.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="message">Message</label>
              <textarea 
                id="message" 
                name="message" 
                className="form-control" 
                placeholder="How can we help you today?"
                value={formData.message}
                onChange={handleChange}
                required
              ></textarea>
            </div>

            <Button type="submit" disabled={isSubmitting} size="lg">
              {isSubmitting ? 'Sending...' : <><Send size={18} className="mr-2" /> Send Message</>}
            </Button>
          </form>
        </section>

        <section>
          <h2><Mail size={24} /> Direct Contact</h2>
          <p>
            Prefer to use your own email client? You can reach our support and administrative team directly at:
          </p>
          <div className="alert-box info">
            <p><strong>Email:</strong> ganeshmamidisetti69@gmail.com</p>
          </div>
          <p>We aim to respond to all inquiries within 24-48 business hours.</p>
        </section>
      </div>
    </div>
  );
}
