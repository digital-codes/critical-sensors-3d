import { defineConfig } from 'vite';

// orchard 3D app. The /php proxy serves the sensor API during development:
//   php -S 127.0.0.1:9000 -t public/php public/php/router.php
// (see public/php/README.md). Everything else stays Vite default.
export default defineConfig({
  server: {
    proxy: {
      '/php': {
        target: 'http://127.0.0.1:9000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/php/, ''),
      },
    },
  },
});
