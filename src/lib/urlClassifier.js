/**
 * Classifies a URL to determine the correct playback technology.
 * TYPE A: Direct video file → Sync Playback (HTML5 video)
 * TYPE B: YouTube → YouTube IFrame API + Sync Playback
 * TYPE C: Website/streaming → Shared View Mode (Kosmi-style tab capture)
 */

const DIRECT_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.m3u8'];

const YOUTUBE_PATTERNS = ['youtube.com', 'youtu.be'];

export function classifyUrl(url) {
    if (!url || typeof url !== 'string') {
        return { type: 'shared_view', label: 'Shared View', mode: 'shared_view' };
    }

    const trimmed = url.trim().toLowerCase();

    // TYPE A — Direct video file
    for (const ext of DIRECT_VIDEO_EXTENSIONS) {
        if (trimmed.endsWith(ext) || trimmed.includes(ext + '?')) {
            return {
                type: 'direct',
                source: 'url',
                label: 'Sync Playback',
                mode: 'sync',
                metadata: { quality: 'Native', duration: '--:--' }
            };
        }
    }

    // TYPE B — YouTube
    for (const pattern of YOUTUBE_PATTERNS) {
        if (trimmed.includes(pattern)) {
            return {
                type: 'youtube',
                source: 'youtube',
                label: 'YouTube Sync',
                mode: 'sync',
                metadata: { quality: 'HD', duration: '--:--' }
            };
        }
    }

    // TYPE C — Website / streaming (anime, OTT, unknown)
    return {
        type: 'shared_view',
        source: 'shared_view',
        label: 'Shared View',
        mode: 'shared_view',
        metadata: { quality: 'Tab Stream', duration: 'Live' }
    };
}
