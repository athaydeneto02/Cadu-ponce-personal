/** Only passive media may become a blob URL with this application's origin. */
const passiveTypes = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm',
]);

export function isPassiveMediaType(type: string): boolean {
  return passiveTypes.has(type.toLowerCase().split(';')[0].trim());
}

export function passiveDataUrl(value: string): { type: string; base64: string } | null {
  const match = /^data:([^;,]+);base64,([a-z\d+/=\r\n]+)$/i.exec(value);
  return match && isPassiveMediaType(match[1]) ? { type: match[1].toLowerCase(), base64: match[2] } : null;
}

export function safeHttpUrl(value: string): string {
  if (/[\u0000-\u0020\u007f]/.test(value)) return '';
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function passiveMediaSource(value?: string | null): string {
  if (typeof value !== 'string') return '';
  const source = value.trim();
  if (source.startsWith('data:')) return passiveDataUrl(source) ? source : '';
  if (/^\/assets\/[a-z\d_./-]+$/i.test(source) && !source.split('/').includes('..')) return source;
  return safeHttpUrl(source);
}
