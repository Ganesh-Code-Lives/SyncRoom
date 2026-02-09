import React, { useState, useRef, useEffect } from 'react';
import classNames from 'classnames';
import { Send, Smile, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import GlowButton from './GlowButton';
import './ChatPanel.css';

const EMOJI_LIST = ['😀', '😂', '😍', '🔥', '👍', '👎', '🎉', '❤️', '👀', '🚀'];
const REACTION_EMOJIS = ['❤️', '🔥', '😂', '👍', '😮', '👏'];

const getInitials = (name) => {
    return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '?';
};

const ChatPanel = ({ chat, currentUser, participants, onSendMessage, onSendReaction }) => {
    const [message, setMessage] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showMentionList, setShowMentionList] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');
    const [hoveredMessageId, setHoveredMessageId] = useState(null);
    const [showReactionPicker, setShowReactionPicker] = useState(null);
    const inputRef = useRef(null);
    const chatEndRef = useRef(null);

    // Auto-scroll to bottom on new message
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chat]);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (message.trim()) {
            onSendMessage(message);
            setMessage('');
            setShowEmojiPicker(false);
            setShowMentionList(false);
        }
    };

    const handleInputChange = (e) => {
        const val = e.target.value;
        setMessage(val);

        const lastWord = val.split(' ').pop();
        if (lastWord.startsWith('@')) {
            setShowMentionList(true);
            setMentionFilter(lastWord.slice(1));
        } else {
            setShowMentionList(false);
        }
    };

    const addEmoji = (emoji) => {
        setMessage(prev => prev + emoji);
        inputRef.current?.focus();
    };

    const selectMention = (userName) => {
        const words = message.split(' ');
        words.pop();
        setMessage(words.join(' ') + ' @' + userName + ' ');
        setShowMentionList(false);
        inputRef.current?.focus();
    };

    const handleReactionClick = (messageId, emoji) => {
        onSendReaction(messageId, emoji);
        setShowReactionPicker(null);
    };

    const filteredParticipants = (participants || []).filter(p =>
        p.name.toLowerCase().includes(mentionFilter.toLowerCase())
    );

    return (
        <div className="chat-panel">
            {/* Messages Area */}
            <div className="chat-messages">
                {chat.map((msg, index) => {
                    const isSystem = msg.type === 'system';
                    const isOwn = !isSystem && msg.senderId === currentUser?.oderId;
                    const senderParticipant = participants?.find(p => p.oderId === msg.senderId);

                    return (
                        <motion.div
                            key={msg.id}
                            className={classNames('chat-message', {
                                'chat-message-own': isOwn,
                                'chat-message-other': !isSystem && !isOwn,
                                'chat-message-system': isSystem
                            })}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            onMouseEnter={() => !isSystem && setHoveredMessageId(msg.id)}
                            onMouseLeave={() => setHoveredMessageId(null)}
                        >
                            {isSystem ? (
                                <span className="chat-system-text">{msg.content}</span>
                            ) : (
                                <div className="chat-message-inner">
                                    {!isOwn && (
                                        <div className="chat-message-meta">
                                            <div className="chat-avatar">
                                                {msg.senderAvatar ? (
                                                    <img src={msg.senderAvatar} alt={msg.senderName} />
                                                ) : (
                                                    <span>{getInitials(msg.senderName)}</span>
                                                )}
                                            </div>
                                            <div className="chat-meta-header">
                                                <span className="chat-sender-name">{msg.senderName}</span>
                                                {senderParticipant?.isHost && (
                                                    <span className="chat-host-badge">
                                                        <Crown size={10} /> HOST
                                                    </span>
                                                )}
                                                {msg.timestamp && (
                                                    <span className="chat-time">
                                                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {/* Bubble with click-to-react support */}
                                    <div
                                        className="chat-bubble"
                                        style={{ position: 'relative', cursor: 'pointer' }}
                                        onClick={(e) => {
                                            // Toggle picker on click (Mobile friendly)
                                            if (!isSystem) {
                                                e.stopPropagation();
                                                setHoveredMessageId(hoveredMessageId === msg.id ? null : msg.id);
                                            }
                                        }}
                                    >
                                        <div className="chat-bubble-content">
                                            {msg.content.split(' ').map((word, i) => (
                                                word.startsWith('@') ? <span key={i} className="mention-tag">{word} </span> : word + ' '
                                            ))}
                                        </div>

                                        {/* Reaction Display */}
                                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                            <div style={{
                                                display: 'flex',
                                                gap: '4px',
                                                marginTop: '4px',
                                                flexWrap: 'wrap'
                                            }}>
                                                {Object.entries(msg.reactions).map(([emoji, data]) => (
                                                    data.count > 0 && (
                                                        <button
                                                            key={emoji}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleReactionClick(msg.id, emoji);
                                                            }}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '2px',
                                                                padding: '2px 6px',
                                                                borderRadius: '12px',
                                                                background: 'rgba(88, 101, 242, 0.15)',
                                                                border: '1px solid rgba(88, 101, 242, 0.3)',
                                                                fontSize: '0.75rem',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s'
                                                            }}
                                                            onMouseEnter={(e) => e.target.style.background = 'rgba(88, 101, 242, 0.25)'}
                                                            onMouseLeave={(e) => e.target.style.background = 'rgba(88, 101, 242, 0.15)'}
                                                        >
                                                            <span>{emoji}</span>
                                                            <span style={{ color: '#a5b4fc' }}>{data.count}</span>
                                                        </button>
                                                    )
                                                ))}
                                            </div>
                                        )}

                                        {/* Reaction Picker on Hover - Uses CSS Class for stability */}
                                        {hoveredMessageId === msg.id && (
                                            <div className="mini-reaction-picker">
                                                {REACTION_EMOJIS.map(emoji => (
                                                    <button
                                                        key={emoji}
                                                        onClick={() => handleReactionClick(msg.id, emoji)}
                                                        className="reaction-picker-btn"
                                                        title={`React with ${emoji}`}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    );
                })}
                <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="chat-input-area-v2">
                {/* Mention List Popover */}
                {showMentionList && filteredParticipants.length > 0 && (
                    <div className="mention-popover">
                        {filteredParticipants.map(user => (
                            <div key={user.id} className="mention-item" onClick={() => selectMention(user.name)}>
                                <img src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`} alt={user.name} />
                                <span>{user.name}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Emoji Picker Popover */}
                {showEmojiPicker && (
                    <div className="emoji-popover">
                        {EMOJI_LIST.map(emoji => (
                            <button key={emoji} type="button" onClick={() => addEmoji(emoji)}>{emoji}</button>
                        ))}
                    </div>
                )}

                <div className="input-wrapper">
                    <button
                        type="button"
                        className="emoji-trigger-btn"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    >
                        <Smile size={20} />
                    </button>

                    <input
                        ref={inputRef}
                        className="glass-input-field-v2"
                        placeholder="Message... (@ to mention)"
                        value={message}
                        onChange={handleInputChange}
                    />

                    <GlowButton type="submit" size="sm" className="send-btn-v2">
                        <Send size={18} />
                    </GlowButton>
                </div>
            </form>
        </div>
    );
};

export default ChatPanel;
