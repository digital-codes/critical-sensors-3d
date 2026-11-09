import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  // photos, site.json, textures and the php dir resolve from the orchard
  // public tree without copying (see dashboard-prototype design)
  publicDir: fileURLToPath(new URL('../orchard/public', import.meta.url)),
  server: {
    port: 5212,
    proxy: {
      // sensor API in dev: php -S 127.0.0.1:9000 -t ../orchard/public/php ../orchard/public/php/router.php
      '/php': {
        target: 'http://127.0.0.1:9000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/php/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@imgsmear': fileURLToPath(new URL('../ideas/imgsmear/src', import.meta.url)),
    },
  },
});
