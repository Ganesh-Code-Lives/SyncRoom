export function classifyUrl(url) {
    if (!url || typeof url !== 'string') return 'shared';

    const cleanUrl = url.trim().toLowerCase();

    // TYPE B — YouTube (CHECK FIRST)
    if (
        cleanUrl.includes('youtube.com/watch') ||
        cleanUrl.includes('youtube.com/embed') ||
        cleanUrl.includes('youtu.be/')
    ) {
        return 'youtube';
    }

    // TYPE A — Direct video (regex to match extensions even with query params)
    const fileExtensionRegex = /\.(mp4|webm|ogg|m3u8|mp3|wav)(?:\?.*)?$/i;
    if (fileExtensionRegex.test(cleanUrl)) {
        return 'direct';
    }

    // TYPE C — Shared View (Kosmi-style)
    return 'shared';
}

export function normalizeYoutubeUrl(url) {
    const idMatch = url.match(
        /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/
    );

    if (!idMatch) return url;

    return `https://www.youtube.com/watch?v=${idMatch[1]}`;
}
