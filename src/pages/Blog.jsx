import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { blogPosts } from '../data/blogPosts';
import './Pages.css';
import { BookOpen, Calendar, Clock, User } from 'lucide-react';

export default function Blog() {
  useEffect(() => {
    
    document.title = 'SyncRoom Blog - Insights on Watch Parties & WebRTC';
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>SyncRoom Blog</h1>
        <p className="page-subtitle">Insights, guides, and technical deep-dives into the world of synchronized media and real-time communication.</p>
      </div>

      <div className="page-content" style={{ maxWidth: '900px' }}>
        <div style={{ display: 'grid', gap: '2rem' }}>
          {blogPosts.map((post) => (
            <article 
              key={post.id} 
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '16px',
                padding: '2rem',
                transition: 'border-color 0.3s, transform 0.2s',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <Link to={`/blog/${post.slug}`} style={{ textDecoration: 'none' }}>
                <h2 style={{ fontSize: '1.6rem', fontWeight: '700', color: '#f1f5f9', marginBottom: '0.5rem', transition: 'color 0.2s' }}>
                  {post.title}
                </h2>
              </Link>
              
              <div style={{ display: 'flex', gap: '1.5rem', color: '#94a3b8', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <User size={14} /> {post.author}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Calendar size={14} /> {post.date}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Clock size={14} /> {post.readTime}
                </span>
              </div>

              <p style={{ color: '#cbd5e1', lineHeight: '1.6', margin: '0.5rem 0' }}>
                {post.excerpt}
              </p>

              <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
                <Link 
                  to={`/blog/${post.slug}`} 
                  style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.5rem', 
                    color: '#a855f7', 
                    fontWeight: '600',
                    textDecoration: 'none'
                  }}
                >
                  <BookOpen size={16} /> Read Article
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
