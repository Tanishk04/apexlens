import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  // Pinned to match `.claude/launch.json`, which declares 5177. Vite's default
  // is 5173, so without this the dev server and the launch config disagreed and
  // the preview opened a dead URL. strictPort surfaces a clash instead of
  // silently drifting to another port and reintroducing the mismatch.
  server: {
    port: 5177,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'src/app/index.html'),
        options: resolve(__dirname, 'src/options/index.html'),
      },
    },
  },
});
