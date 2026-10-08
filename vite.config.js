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
    // The dev server only serves js/, css/, public/ and index.html. Watching the whole root made
    // it burn 1+ CPU core around the clock (tests, coverage, logs and the database file change all day).
    watch: {
      ignored: [
        '**/node_modules/**', '**/.git/**', '**/.claude/**', '**/claude-proje-kiti/**',
        '**/coverage/**', '**/data/**', '**/logs/**', '**/deploy/**', '**/tests/**',
        '**/docs/**', '**/dist/**', '**/server/**', '**/contracts/**', '**/scripts/**',
      ],
    },
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
