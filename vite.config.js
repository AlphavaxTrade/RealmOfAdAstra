import { defineConfig } from 'vite';

export default defineConfig({
  // Public dir: Vite serves this folder at / (root URL)
  // public/assets/ → accessible at /assets/xxx.jpg (matches current Phaser paths)
  publicDir: 'public',

  server: {
    host: '0.0.0.0',
    port: 5180,
    strictPort: true,
    open: false,
    cors: true,
  },

  // Allow .jpg, .png image assets
  assetsInclude: ['**/*.jpg', '**/*.png', '**/*.jpeg', '**/*.gif', '**/*.webp'],

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: 'index.html',
      // Phaser ayrı dosyada: oyun kodu değiştiğinde tarayıcı önbelleğindeki Phaser yeniden indirilmez
      output: { manualChunks: { phaser: ['phaser'], three: ['three'] } },
    },
    chunkSizeWarningLimit: 1600,
  },
});
