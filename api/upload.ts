import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: any, res: any) {
  // Allow CORS just in case
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const filename = (req.query?.name as string) || `upload-${Date.now()}.mp4`;
    
    // Collect binary stream
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      return res.status(400).json({ error: 'Arquivo vazio' });
    }

    // Upload to Catbox from backend (zero CORS)
    const fd = new FormData();
    fd.append('reqtype', 'fileupload');
    const contentType = req.headers['content-type'] || 'video/mp4';
    fd.append('fileToUpload', new Blob([buffer], { type: contentType }), filename);

    const catboxRes = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: fd,
    });

    if (!catboxRes.ok) {
      const errText = await catboxRes.text();
      return res.status(500).json({ error: 'Erro no servidor de armazenamento: ' + errText });
    }

    const publicUrl = (await catboxRes.text()).trim();
    if (!publicUrl.startsWith('http')) {
      return res.status(500).json({ error: 'Resposta inválida do provedor: ' + publicUrl });
    }

    return res.status(200).json({ url: publicUrl });
  } catch (err: any) {
    console.error('Upload error in serverless function:', err);
    return res.status(500).json({ error: err.message || 'Erro interno no upload' });
  }
}
