import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { appPwa } from './scripts/pwa-build.mjs';

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
      appPwa()
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
