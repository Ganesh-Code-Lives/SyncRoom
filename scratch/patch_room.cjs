const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'Room.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add imports
content = content.replace(
    /Maximize, Minimize/g,
    'Maximize, Minimize, UserPlus, Share2'
);

// 2. Add states and handlers
const stateInsertion = `
    const [showVideoOverlay, setShowVideoOverlay] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);

    const inviteLink = \`https://syncroom.live/join/\${room?.code}\`;

    const handleCopyInvite = async (text, type) => {
        try {
            await navigator.clipboard.writeText(text);
            if (type === 'link') {
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
                addToast('Invite link copied!', 'success');
            } else {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
                addToast('Room code copied!', 'success');
            }
        } catch (err) {
            addToast('Failed to copy', 'error');
        }
    };
`;

content = content.replace(
    /const \[showVideoOverlay, setShowVideoOverlay\] = useState\(false\);(\s+)const \[copied, setCopied\] = useState\(false\);/,
    stateInsertion
);

// 3. Add Invite button in sidebar header
const inviteButton = `
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <button 
                                type="button" 
                                className="invite-btn-room"
                                onClick={() => setShowInviteModal(true)}
                                style={{
                                    background: 'rgba(168, 85, 247, 0.2)',
                                    color: '#a855f7',
                                    border: '1px solid rgba(168, 85, 247, 0.3)',
                                    padding: '0.4rem 0.6rem',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    fontSize: '0.8rem',
                                    fontWeight: '600',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <UserPlus size={14} /> Invite
                            </button>
                            <button type="button" className={\`room-code-badge \${copied ? 'copied' : ''}\`} onClick={() => handleCopyInvite(room.code, 'code')}>
                                {copied ? <Check size={14} /> : <Copy size={14} />} {room.code}
                            </button>
`;

content = content.replace(
    /<div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>(\s+)<button type="button" className={`room-code-badge \${copied \? 'copied' : ''}`} onClick={handleCopyCode}>(\s+){copied \? <Check size={14} \/> : <Copy size={14} \/>} {room.code}(\s+)<\/button>/,
    inviteButton
);

// 4. Add Modal at the end (before last </div>)
const modalCode = `
            {/* Invite Modal */}
            <AnimatePresence>
                {showInviteModal && (
                    <motion.div 
                        className="modal-overlay" 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowInviteModal(false)}
                        style={{ zIndex: 3000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <motion.div 
                            className="modal-content glass-panel invite-modal" 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            style={{ maxWidth: '400px', width: '90%', background: 'rgba(30, 41, 59, 0.7)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', padding: '1.5rem', color: 'white' }}
                        >
                            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                                    <Share2 size={24} style={{ color: '#6366f1' }} /> Invite Friends
                                </h3>
                                <button onClick={() => setShowInviteModal(false)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>
                                    <X size={24} />
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {/* Invite Link */}
                                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.5rem' }}>1. Invite Link</label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input 
                                            type="text" 
                                            readOnly 
                                            value={inviteLink}
                                            style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.5rem', borderRadius: '6px', color: 'white', fontSize: '0.8rem' }}
                                        />
                                        <button 
                                            onClick={() => handleCopyInvite(inviteLink, 'link')}
                                            style={{ background: '#6366f1', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer' }}
                                        >
                                            {copiedLink ? <Check size={16} /> : <Copy size={16} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Room Code */}
                                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.5rem' }}>2. Room Code</label>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '6px' }}>
                                        <span style={{ fontSize: '1.5rem', fontWeight: 'bold', letterSpacing: '2px' }}>{room.code}</span>
                                        <button onClick={() => handleCopyInvite(room.code, 'code')} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>
                                            {copied ? <Check size={20} /> : <Copy size={20} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Quick Share */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.75rem' }}>3. Quick Share</label>
                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        <a 
                                            href={\`https://wa.me/?text=Join%20my%20room%20on%20SyncRoom!%20%0ALink:%20\${encodeURIComponent(inviteLink)}%0ACode:%20\${room.code}\`}
                                            target="_blank" rel="noopener noreferrer"
                                            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: 'rgba(37, 211, 102, 0.1)', color: '#25D366', borderRadius: '12px', textDecoration: 'none', border: '1px solid rgba(37, 211, 102, 0.2)' }}
                                        >
                                            <MessageCircle size={24} />
                                            <span style={{ fontSize: '0.7rem' }}>WhatsApp</span>
                                        </a>
                                        <a 
                                            href={\`https://t.me/share/url?url=\${encodeURIComponent(inviteLink)}&text=Join%20my%20SyncRoom!\`}
                                            target="_blank" rel="noopener noreferrer"
                                            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: 'rgba(0, 136, 204, 0.1)', color: '#0088cc', borderRadius: '12px', textDecoration: 'none', border: '1px solid rgba(0, 136, 204, 0.2)' }}
                                        >
                                            <Send size={24} />
                                            <span style={{ fontSize: '0.7rem' }}>Telegram</span>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
`;

content = content.replace(
    /<\/div>(\s+)<\/div>(\s+);(\s+)\};(\s+)export default Room;/,
    `</div>\n${modalCode}\n</div>\n);\n};\nexport default Room;`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched Room.jsx');
