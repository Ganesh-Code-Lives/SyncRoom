import React, { useEffect } from 'react';
import { useVoice } from '../../context/VoiceContext';
import VoicePanel from '../VoicePanel';
import { motion, AnimatePresence } from 'framer-motion';

const VoiceBottomSheet = () => {
    const { isVoiceOpenMobile, setIsVoiceOpenMobile } = useVoice();

    // Prevent body scroll when open
    useEffect(() => {
        if (isVoiceOpenMobile) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isVoiceOpenMobile]);

    return (
        <AnimatePresence>
            {isVoiceOpenMobile && (
                <>
                    <motion.div
                        className="voice-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsVoiceOpenMobile(false)}
                    />
                    <motion.div
                        className="voice-sheet"
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    >
                        <div className="sheet-handle" onClick={() => setIsVoiceOpenMobile(false)} />
                        <VoicePanel />
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default VoiceBottomSheet;
