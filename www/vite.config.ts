import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

/** Out-of-root sources that this app imports: the orchard scene and the
 *  imgsmear submodule. Vite only watches files inside its root by default,
 *  so edits there would keep being served from the transform cache (stale
 *  presets/panel, missing component emits). Add them to the watcher. */
const watchExternalSources = (): Plugin => ({
  name: 'watch-external-sources',
  configureServer(server) {
    server.watcher.add([
      fileURLToPath(new URL('../orchard/src', import.meta.url)),
      fileURLToPath(new URL('../ideas/imgsmear/src', import.meta.url)),
    ]);
  },
});

export default defineConfig({
  plugins: [vue(), watchExternalSources()],
  // the orchard scene module must not auto-mount standalone inside the
  // dashboard bundle — mountOrchard() is called explicitly by OrchardPane
  define: {
    'import.meta.env.VITE_WIESE_EMBED': JSON.stringify('1'),
  },
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
