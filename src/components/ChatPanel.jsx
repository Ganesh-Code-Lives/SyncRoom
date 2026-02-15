import React, { useState, useRef, useEffect } from 'react';
import classNames from 'classnames';
import { Send, Smile, Crown, MoreVertical, Reply, Trash2, Edit2, X, CornerDownRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import GlowButton from './GlowButton';
import './ChatPanel.css';

const EMOJI_LIST = ['😀', '😂', '😍', '🔥', '👍', '👎', '🎉', '❤️', '👀', '🚀'];
const REACTION_EMOJIS = ['❤️', '🔥', '😂', '👍', '😮', '👏'];

const getInitials = (name) => {
    return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '?';
};

const ChatPanel = ({ chat, currentUser, participants, onSendMessage, onSendReaction, editMessage, deleteMessage }) => {
    const [message, setMessage] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showMentionList, setShowMentionList] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');
    const [hoveredMessageId, setHoveredMessageId] = useState(null);
    const [showReactionPicker, setShowReactionPicker] = useState(null);
    const [clickedMessageId, setClickedMessageId] = useState(null);

    // New State for Features
    const [replyingTo, setReplyingTo] = useState(null);
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [editContent, setEditContent] = useState('');
    const [showMoreMenuId, setShowMoreMenuId] = useState(null);

    const inputRef = useRef(null);
    const chatEndRef = useRef(null);
    const reactionPickerRef = useRef(null);
    const moreMenuRef = useRef(null);
    const hoverTimeoutRef = useRef(null);
    const editInputRef = useRef(null);

    // Auto-scroll to bottom on new message
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chat]);

    // Focus edit input when editing starts
    useEffect(() => {
        if (editingMessageId && editInputRef.current) {
            editInputRef.current.focus();
        }
    }, [editingMessageId]);

    const handleMouseEnter = (msgId) => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        setHoveredMessageId(msgId);
    };

    const handleMouseLeave = () => {
        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredMessageId(null);
        }, 300); // 300ms delay to allow bridging gaps
    };

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (message.trim()) {
            onSendMessage(message, replyingTo); // Pass reply context
            setMessage('');
            setReplyingTo(null);
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
        setClickedMessageId(null);
    };

    const handleMessageClick = (messageId, e) => {
        // Only toggle if not clicking interactive elements
        if (e.target.closest('button') || e.target.closest('.reaction-badge-stuck')) return;

        e.stopPropagation();
        if (clickedMessageId === messageId) {
            setClickedMessageId(null);
            setShowReactionPicker(null);
            setShowMoreMenuId(null);
        } else {
            setClickedMessageId(messageId);
        }
    };

    // Outside click handler
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (reactionPickerRef.current && !reactionPickerRef.current.contains(event.target)) {
                setShowReactionPicker(null);
            }
            if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
                setShowMoreMenuId(null);
            }
            // Clear clicked state if clicking background
            if (!event.target.closest('.chat-message')) {
                setClickedMessageId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredParticipants = (participants || []).filter(p =>
        p.name.toLowerCase().includes(mentionFilter.toLowerCase())
    );

    // Feature Handlers
    const startReply = (msg) => {
        setReplyingTo({
            id: msg.id,
            senderName: msg.senderName,
            content: msg.content
        });
        inputRef.current?.focus();
    };

    const cancelReply = () => {
        setReplyingTo(null);
    };

    const startEdit = (msg) => {
        setEditingMessageId(msg.id);
        setEditContent(msg.content);
        setShowMoreMenuId(null);
    };

    const cancelEdit = () => {
        setEditingMessageId(null);
        setEditContent('');
    };

    const saveEdit = (messageId) => {
        if (editContent.trim()) {
            if (editMessage) editMessage(messageId, editContent);
            setEditingMessageId(null);
            setEditContent('');
        }
    };

    const confirmDelete = (messageId) => {
        if (window.confirm('Are you sure you want to delete this message?')) {
            if (deleteMessage) deleteMessage(messageId);
        }
        setShowMoreMenuId(null);
    };

    return (
        <div className="chat-panel">
            {/* Messages Area */}
            <div className="chat-messages">
                {chat.map((msg, index) => {
                    const isSystem = msg.type === 'system';
                    const isOwn = !isSystem && msg.senderId === currentUser?.oderId;
                    const senderParticipant = participants?.find(p => p.oderId === msg.senderId);
                    const isHovered = hoveredMessageId === msg.id;
                    const isClicked = clickedMessageId === msg.id;
                    const showActions = isHovered || isClicked;
                    const isEditing = editingMessageId === msg.id;

                    const canModify = isOwn || currentUser?.isHost;

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
                            onMouseEnter={() => !isSystem && handleMouseEnter(msg.id)} // Use new handler
                            onMouseLeave={handleMouseLeave} // Use new handler
                            onClick={(e) => !isSystem && handleMessageClick(msg.id, e)}
                        >
                            {isSystem ? (
                                <span className="chat-system-text">{msg.content}</span>
                            ) : (
                                <>
                                    {/* Avatar (Left only) */}
                                    {!isOwn && (
                                        <div className="chat-avatar">
                                            {msg.senderAvatar ? (
                                                <img src={msg.senderAvatar} alt={msg.senderName} />
                                            ) : (
                                                <span>{getInitials(msg.senderName)}</span>
                                            )}
                                        </div>
                                    )}

                                    <div className="chat-message-inner">
                                        {/* Name & Time (Left only) */}
                                        {!isOwn && (
                                            <div className="chat-message-meta">
                                                <span className="chat-sender-name">{msg.senderName || 'Unknown'}</span>
                                                {senderParticipant?.isHost && (
                                                    <span className="chat-host-badge">
                                                        <Crown size={10} /> HOST
                                                    </span>
                                                )}
                                                <span className="chat-time">
                                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        )}

                                        {/* Reply Config (Bubble Context) */}
                                        {msg.replyTo && (
                                            <div className="reply-context-bubble">
                                                <div className="reply-line"></div>
                                                <span className="reply-sender">{msg.replyTo.senderName}</span>
                                                <span className="reply-preview">{msg.replyTo.content}</span>
                                            </div>
                                        )}

                                        {/* Main Bubble */}
                                        <div className="chat-bubble-container">
                                            <div className="chat-bubble">
                                                {isEditing ? (
                                                    <div className="inline-edit-area">
                                                        <input
                                                            ref={editInputRef}
                                                            value={editContent}
                                                            onChange={(e) => setEditContent(e.target.value)}
                                                            className="inline-edit-input"
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') saveEdit(msg.id);
                                                                if (e.key === 'Escape') cancelEdit();
                                                            }}
                                                        />
                                                        <div className="inline-edit-actions">
                                                            <button onClick={cancelEdit} className="edit-cancel-btn">Cancel</button>
                                                            <button onClick={() => saveEdit(msg.id)} className="edit-save-btn">Save</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="chat-bubble-content">
                                                        {msg.content.split(' ').map((word, i) => (
                                                            word.startsWith('@') ? <span key={i} className="mention-tag">{word} </span> : word + ' '
                                                        ))}
                                                        {msg.isEdited && <span className="edited-label">(edited)</span>}
                                                    </div>
                                                )}

                                                {/* Stuck Reactions */}
                                                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                                    <div className="sticky-reactions">
                                                        {Object.entries(msg.reactions).map(([emoji, data]) => (
                                                            data.count > 0 && (
                                                                <button
                                                                    key={emoji}
                                                                    className="sticky-reaction-pill"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleReactionClick(msg.id, emoji);
                                                                    }}
                                                                >
                                                                    <span>{emoji}</span>
                                                                    {data.count > 1 && <span className="count">{data.count}</span>}
                                                                </button>
                                                            )
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Hover Actions Menu (Absolute Positioned) */}
                                            {showActions && !isEditing && (
                                                <AnimatePresence>
                                                    <motion.div
                                                        className={classNames("message-hover-actions", { "own": isOwn })}
                                                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                                    >
                                                        <button onClick={(e) => { e.stopPropagation(); startReply(msg); }} title="Reply">
                                                            <Reply size={14} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id);
                                                                setShowMoreMenuId(null);
                                                            }}
                                                            title="React"
                                                            className={showReactionPicker === msg.id ? 'active' : ''}
                                                        >
                                                            <Smile size={14} />
                                                        </button>
                                                        {canModify && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setShowMoreMenuId(showMoreMenuId === msg.id ? null : msg.id);
                                                                    setShowReactionPicker(null);
                                                                }}
                                                                className={showMoreMenuId === msg.id ? 'active' : ''}
                                                            >
                                                                <MoreVertical size={14} />
                                                            </button>
                                                        )}

                                                        {/* Reaction Picker Popup */}
                                                        {showReactionPicker === msg.id && (
                                                            <div className="hover-reaction-picker" ref={reactionPickerRef}>
                                                                {REACTION_EMOJIS.map(emoji => (
                                                                    <button key={emoji} onClick={(e) => { e.stopPropagation(); handleReactionClick(msg.id, emoji); }}>
                                                                        {emoji}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* More Menu Dropdown */}
                                                        {showMoreMenuId === msg.id && (
                                                            <div className="hover-more-menu" ref={moreMenuRef}>
                                                                <button onClick={(e) => { e.stopPropagation(); startEdit(msg); }}>
                                                                    <Edit2 size={12} /> Edit
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); confirmDelete(msg.id); }} className="delete-opt">
                                                                    <Trash2 size={12} /> Delete
                                                                </button>
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                </AnimatePresence>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    );
                })}
                <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="chat-input-area-v2">
                {/* Reply Preview Banner */}
                <AnimatePresence>
                    {replyingTo && (
                        <motion.div
                            className="reply-preview-banner"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                        >
                            <div className="reply-preview-content">
                                <span className="reply-to-text">Replying to {replyingTo.senderName}</span>
                                <span className="reply-msg-text">{replyingTo.content}</span>
                            </div>
                            <button type="button" onClick={cancelReply} className="close-reply-btn">
                                <X size={14} />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

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
                        placeholder={replyingTo ? "Type your reply..." : "Message... (@ to mention)"}
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
