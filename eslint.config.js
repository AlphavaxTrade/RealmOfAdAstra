// ESLint (kurumsal A2.3): bilerek DAR. Amaç stil değil; gerçek hata ve güvenlik kokusu yakalamak.
// Kapsam dışı: research/, scripts/model/ (deney betikleri), contracts/build/, dist/, veri klasörleri.
import security from 'eslint-plugin-security';
import globals from 'globals';

const ortak = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
  'no-empty': ['error', { allowEmptyCatch: false }],   // boş catch yasak (içinde en az bir açıklama satırı olmalı)
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-class-members': 'error',
  'no-unreachable': 'error',
  'no-self-assign': 'error',
  'no-unsafe-finally': 'error',
  'no-redeclare': 'error',
  'no-prototype-builtins': 'off',
  'use-isnan': 'error',
  'valid-typeof': 'error'
};

const guvenlik = {
  'security/detect-eval-with-expression': 'error',
  'security/detect-unsafe-regex': 'error',
  'security/detect-buffer-noassert': 'error',
  'security/detect-new-buffer': 'error',
  'security/detect-pseudoRandomBytes': 'error',
  'security/detect-disable-mustache-escape': 'error',
  'security/detect-child-process': 'warn',
  'security/detect-non-literal-regexp': 'warn',
  'security/detect-possible-timing-attacks': 'warn'
};

export default [
  { ignores: ['dist/**', 'node_modules/**', 'claude-proje-kiti/**', 'research/**', 'scripts/model/**', 'contracts/build/**', 'data/**', 'logs/**', 'public/**', '.claude/**'] },
  {
    files: ['server/**/*.js', 'scripts/**/*.mjs', 'tests/**/*.mjs', 'contracts/*.mjs', 'knip.json', 'eslint.config.js', 'vite.config.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', globals: { ...globals.node } },
    plugins: { security },
    rules: { ...ortak, ...guvenlik }
  },
  {
    // Sunucuda Math.random yasak: gerçek değerli sonuçlar server/rastgele.js'ten gelmeli (kurumsal A2.5)
    files: ['server/**/*.js'],
    rules: { 'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Sunucuda server/rastgele.js (rastgele/tamsayi) kullan.' }] }
  },
  {
    // Tarayıcıda çalışan yönetici paneli betiği
    files: ['server/admin.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'script', globals: { ...globals.browser } }
  },
  {
    files: ['js/**/*.js'],
    // oyun kodu sunucuda da çalışır (server/engine.js). gameState / renderHUD: js/app.js bunları window'a atar,
    // diğer modüller `typeof gameState !== 'undefined'` korumasıyla kullanır.
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', globals: { ...globals.browser, ...globals.node, gameState: 'readonly', renderHUD: 'readonly' } },
    plugins: { security },
    rules: { ...ortak, ...guvenlik }
  },
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'commonjs', globals: { ...globals.node } },
    plugins: { security },
    rules: { ...ortak, ...guvenlik }
  }
];
