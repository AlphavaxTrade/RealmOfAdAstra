import { defineConfig } from 'vite';

const ADRES_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Gerçek ağ derlemesi denetimi (denetim raporu H1). Gerçek ASTRA ile çalışacak derlemede ödeme sözleşmesi ve token adresi
 * derlemeye SABİTLENMEK zorundadır; yoksa tarayıcı, sunucunun verdiği her adrese ASTRA izni verebilir (sunucu ele geçirilirse
 * cüzdan boşaltılır). Bayrak REALM_GERCEK_AG=1 (Dockerfile ARG'ı / CI değişkeni); deneme (TEST_MODE) ve geliştirme derlemelerinde
 * bayrak yoktur, hiçbir şey zorunlu olmaz ve mevcut CI / yerel `npm run build` aynen çalışır.
 * Saf işlev: testlerde doğrudan çağrılır (tests/test_denetim_2026_10_arayuz.mjs).
 * @param {Record<string, string|undefined>} env  process.env (+ .env dosyalarından VITE_*)
 * @returns {string[]} sorun listesi; boşsa derleme devam eder
 */
export function gercekAgSorunlari(env) {
  const e = env || {};
  if (String(e.REALM_GERCEK_AG || '') !== '1') return [];
  const sorunlar = [];
  for (const ad of ['VITE_PAYMENTS_CONTRACT', 'VITE_TOKEN_ADDRESS']) {
    const v = String(e[ad] || '').trim();
    if (!v) sorunlar.push(`${ad} verilmemiş`);
    else if (!ADRES_RE.test(v)) sorunlar.push(`${ad} geçerli bir 0x adresi değil`);
  }
  return sorunlar;
}

// Bayrak açıkken sorun varsa derleme HATA verir (yalnız `vite build`; geliştirme sunucusu etkilenmez)
const gercekAgDenetimi = {
  name: 'realm-gercek-ag-denetimi',
  apply: 'build',
  configResolved(cfg) {
    const sorunlar = gercekAgSorunlari({ ...cfg.env, ...process.env });
    if (sorunlar.length) {
      throw new Error('Gerçek ağ derlemesi (REALM_GERCEK_AG=1) için ödeme sözleşmesi ve token adresi derlemeye sabitlenmeli: '
        + sorunlar.join('; ') + '. Örnek: VITE_PAYMENTS_CONTRACT=0x… VITE_TOKEN_ADDRESS=0x… (Docker: --build-arg). Deneme derlemesi için REALM_GERCEK_AG verme.');
    }
  }
};

export default defineConfig({
  // Public dir: Vite serves this folder at / (root URL)
  // public/assets/ → accessible at /assets/xxx.jpg (matches current Phaser paths)
  publicDir: 'public',

  plugins: [gercekAgDenetimi],

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
