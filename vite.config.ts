import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function devUploadPlugin() {
  return {
    name: 'dev-upload-plugin',
    configureServer(server: any) {
      server.middlewares.use('/api/upload', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        try {
          const urlObj = new URL(req.url, 'http://localhost');
          const filename = urlObj.searchParams.get('name') || `upload-${Date.now()}.mp4`;
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          }
          const buffer = Buffer.concat(chunks);
          const fd = new FormData();
          fd.append('reqtype', 'fileupload');
          fd.append('fileToUpload', new Blob([buffer]), filename);
          const catboxRes = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: fd,
          });
          const resultUrl = (await catboxRes.text()).trim();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ url: resultUrl }));
        } catch (e: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      devUploadPlugin(),
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.png'],
        manifest: {
          name: 'Cadu Ponce Consultoria',
          short_name: 'Cadu Ponce',
          description: 'Consultoria Esportiva de Alta Performance',
          theme_color: '#020617', // slate-950
          background_color: '#020617',
          display: 'standalone',
          icons: [
            {
              src: 'icon.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          importScripts: ['/push-sw.js']
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
