import React from 'react';
import { Play, Trash2, ThumbsUp } from 'lucide-react';
import './Playlist.css';

const Playlist = ({ playlist, currentMedia, onPlay, onRemove, onVoteSkip, isHost }) => {
    return (
        <div className="playlist-container">
            <h3 className="playlist-header">Up Next</h3>
            <div className="playlist-list">
                {playlist.length === 0 ? (
                    <div className="empty-playlist">
                        <p>Queue is empty.</p>
                        <span className="sub-text">Add videos from the Media Selector!</span>
                    </div>
                ) : (
                    playlist.map((item, index) => (
                        <div key={item.id} className={`playlist-item ${currentMedia?.url === item.url ? 'active' : ''}`}>
                            <div className="playlist-item-info">
                                <span className="item-title">{item.title}</span>
                                <span className="item-artist">{item.artist || 'Unknown'}</span>
                            </div>
                            <div className="playlist-actions">
                                {isHost && (
                                    <>
                                        <button className="icon-btn play-btn" onClick={() => onPlay(item)} title="Play Now">
                                            <Play size={14} />
                                        </button>
                                        <button className="icon-btn delete-btn" onClick={() => onRemove(item.id)} title="Remove">
                                            <Trash2 size={14} />
                                        </button>
                                    </>
                                )}
                                {!isHost && (
                                    <button className="icon-btn vote-btn" onClick={() => onVoteSkip(item.id)} title="Vote to Play">
                                        <ThumbsUp size={14} />
                                        <span className="vote-count">{item.votes || 0}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default Playlist;
