import React, { useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { blogPosts } from '../data/blogPosts';
import './Pages.css';
import { ArrowLeft, Calendar, Clock, User, Share2 } from 'lucide-react';

export default function BlogPost() {
  const { slug } = useParams();
  const post = blogPosts.find(p => p.slug === slug);

  useEffect(() => {
    if (post) {
      window.scrollTo(0, 0);
      document.title = `${post.title} - SyncRoom Blog`;
    }
  }, [post]);

  if (!post) {
    return <Navigate to="/blog" replace />;
  }

  return (
    <div className="page-container">
      {/* Blog specific header layout */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.02)',
        borderBottom: '1px solid rgba(168, 85, 247, 0.15)',
        padding: '3rem 2rem',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <Link to="/blog" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            color: '#a855f7',
            textDecoration: 'none',
            fontSize: '0.9rem',
            fontWeight: '500',
            marginBottom: '2rem'
          }}>
            <ArrowLeft size={16} /> Back to all articles
          </Link>
          
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: '800',
            color: '#f1f5f9',
            margin: '0 0 1.5rem 0',
            lineHeight: '1.2'
          }}>{post.title}</h1>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.5rem',
            color: '#94a3b8',
            fontSize: '0.95rem',
            flexWrap: 'wrap'
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <User size={16} /> {post.author}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Calendar size={16} /> Published: {post.date}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={16} /> {post.readTime}
            </span>
          </div>
        </div>
      </div>

      <div style={{
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '3rem 2rem',
        display: 'grid',
        gridTemplateColumns: '1fr 300px',
        gap: '3rem',
        alignItems: 'start'
      }} className="blog-layout">
        
        {/* Main Content Area */}
        <article className="page-content" style={{ padding: 0, margin: 0, maxWidth: '100%' }}>
          <div 
            dangerouslySetInnerHTML={{ __html: post.content }}
            style={{ fontSize: '1.1rem', lineHeight: '1.8' }}
          />

          {/* Ad Placeholder / Content Break */}
          <div style={{
            margin: '3rem 0',
            padding: '2rem',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px dashed rgba(168, 85, 247, 0.3)',
            borderRadius: '12px',
            textAlign: 'center',
            color: '#64748b'
          }}>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>Advertisement Space</p>
          </div>

          {/* Author Box */}
          <div style={{
            marginTop: '4rem',
            padding: '2rem',
            background: 'rgba(15, 14, 26, 0.6)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: '16px',
            display: 'flex',
            gap: '1.5rem',
            alignItems: 'center'
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #a855f7, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '1.5rem',
              flexShrink: 0
            }}>
              {post.author.charAt(0)}
            </div>
            <div>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#f1f5f9', fontSize: '1.2rem' }}>About the Author</h4>
              <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.5' }}>
                Written by the {post.author}. We are passionate about real-time communication, WebRTC, and building tools that bring people closer together online.
              </p>
            </div>
          </div>
        </article>

        {/* Sidebar (For Ads & Related Links) */}
        <aside style={{
          position: 'sticky',
          top: '2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '2rem'
        }} className="desktop-only">
          
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            padding: '1.5rem'
          }}>
            <h3 style={{ color: '#c084fc', margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Share this article</h3>
            <button style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: '100%',
              padding: '0.8rem',
              background: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '8px',
              color: '#a855f7',
              cursor: 'pointer',
              fontWeight: '600'
            }} onClick={() => navigator.clipboard.writeText(window.location.href)}>
              <Share2 size={18} /> Copy Link
            </button>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px dashed rgba(168, 85, 247, 0.3)',
            borderRadius: '12px',
            padding: '1.5rem',
            minHeight: '250px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748b'
          }}>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>Sidebar Ad Space</p>
          </div>
          
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            padding: '1.5rem'
          }}>
            <h3 style={{ color: '#f1f5f9', margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Helpful Resources</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <li><Link to="/how-to-use" style={{ color: '#60a5fa', textDecoration: 'none' }}>How to use SyncRoom</Link></li>
              <li><Link to="/faq" style={{ color: '#60a5fa', textDecoration: 'none' }}>Frequently Asked Questions</Link></li>
              <li><Link to="/about" style={{ color: '#60a5fa', textDecoration: 'none' }}>About Our Technology</Link></li>
            </ul>
          </div>
        </aside>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media (max-width: 900px) {
          .blog-layout {
            grid-template-columns: 1fr !important;
          }
          .desktop-only {
            display: none !important;
          }
        }
        .page-content h3 {
          color: #c084fc !important;
          font-size: 1.4rem !important;
          margin-top: 2.5rem !important;
        }
        .page-content p {
          color: #e2e8f0 !important;
        }
      `}} />
    </div>
  );
}
