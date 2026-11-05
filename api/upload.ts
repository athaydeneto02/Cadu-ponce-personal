import { randomUUID } from 'node:crypto';
import { bearerToken, createServerClient, enforceRateLimit, HttpError, postOnly, requireAdmin, safeError } from '../server/security.js';

export const config = { api: { bodyParser: false } };
const maxBytes = 4 * 1024 * 1024;
const formats: Record<string, string> = {
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};

export function matchesMediaType(buffer: Buffer, type: string): boolean {
  if (type === 'image/gif') return ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6));
  if (type === 'image/jpeg') return buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (type === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'image/webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (type === 'video/webm') return buffer.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  return (type === 'video/mp4' || type === 'video/quicktime') && buffer.toString('ascii', 4, 8) === 'ftyp';
}

export default async function handler(req: any, res: any) {
  if (!postOnly(req, res)) return;
  try {
    bearerToken(req);
    const client = createServerClient();
    const admin = await requireAdmin(req, client);
    const contentType = String(req.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!formats[contentType]) throw new HttpError(415, 'Formato de arquivo não permitido.');
    if (Number(req.headers?.['content-length'] || 0) > maxBytes) throw new HttpError(413, 'Use envio direto para arquivos maiores que 4 MB.');
    await enforceRateLimit(client, admin.id, 'upload');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) throw new HttpError(413, 'Arquivo maior que 4 MB.');
      chunks.push(buffer);
    }
    const buffer = Buffer.concat(chunks);
    if (!buffer.length || !matchesMediaType(buffer, contentType)) throw new HttpError(415, 'Conteúdo de arquivo inválido.');
    const path = `${admin.id}/${randomUUID()}.${formats[contentType]}`;
    const bucket = client.storage.from('exercise-videos');
    const { error } = await bucket.upload(path, buffer, { contentType, upsert: false });
    if (error) throw new HttpError(503, 'Não foi possível armazenar o arquivo.');
    const { data, error: urlError } = await bucket.createSignedUrl(path, 3600);
    if (urlError || !data?.signedUrl) throw new HttpError(503, 'Arquivo armazenado, mas indisponível para leitura.');
    return res.status(201).json({ url: data.signedUrl, path, reference: `storage://exercise-videos/${path}` });
  } catch (error) { return safeError(res, error); }
}
