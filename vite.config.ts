import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function devUploadPlugin() {
  return {
    name: 'dev-api-security',
    configureServer(server: any) {
      server.middlewares.use('/api/', (_req: any, res: any) => {
        // Vite cannot emulate authenticated Vercel functions safely. Use vercel dev.
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Use vercel dev para testar as funções autenticadas localmente.' }));
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
