import React, { useState } from 'react';
import { MessageCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';
import ChatPanel from './ChatPanel';
import './FullscreenChatOverlay.css';
import { motion, AnimatePresence } from 'framer-motion';

const FullscreenChatOverlay = ({ chat, currentUser, participants, onSendMessage, onSendReaction }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            {/* Toggle Button (Always visible in fullscreen) */}
            <button
                className={`fs-chat-toggle ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                title={isOpen ? "Close Chat" : "Open Chat"}
            >
                {isOpen ? <ChevronRight size={24} /> : <ChevronLeft size={24} />}
            </button>

            {/* Chat Overlay Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className="fs-chat-panel"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    >
                        <div className="fs-chat-header">
                            <h3>Chat</h3>
                            <button onClick={() => setIsOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="fs-chat-content">
                            <ChatPanel
                                chat={chat}
                                currentUser={currentUser}
                                participants={participants}
                                onSendMessage={onSendMessage}
                                onSendReaction={onSendReaction}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default FullscreenChatOverlay;
