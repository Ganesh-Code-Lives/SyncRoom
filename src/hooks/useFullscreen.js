import { useState, useEffect } from 'react';

/**
 * Custom hook to track fullscreen state.
 * Isolated from global context to prevent unnecessary re-renders.
 * 
 * @returns {boolean} isFullscreen
 */
const useFullscreen = () => {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            const isFs = !!(
                document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement ||
                document.msFullscreenElement
            );
            setIsFullscreen(isFs);
        };

        // Standard
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        // Safari / Old WebKit
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        // Firefox
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        // IE/Edge
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        // Initial check
        handleFullscreenChange();

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        };
    }, []);

    return isFullscreen;
};

export default useFullscreen;
