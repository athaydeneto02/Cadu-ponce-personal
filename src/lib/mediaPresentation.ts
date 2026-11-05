/** Recognize supported YouTube links without mistaking arbitrary URLs for videos. */
export function youtubeVideoId(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be' || host === 'www.youtu.be') id = url.pathname.split('/')[1];
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
      id = url.searchParams.get('v');
      if (!id && /^\/(embed|shorts|live)\//.test(url.pathname)) id = url.pathname.split('/')[2];
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

export function isImageMedia(value?: string | null): boolean {
  return !!value && (/^data:image\//i.test(value) || /\.(gif|png|jpe?g|webp|avif)(?:[?#]|$)/i.test(value));
}
