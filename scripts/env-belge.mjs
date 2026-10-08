// Ortam değişkeni belgesi (kurumsal A6.3): server/ kodunun OKUDUĞU her değişken burada açıklanmalı; belge koddan üretilir.
//   node scripts/env-belge.mjs            → docs/kurumsal/ORTAM.md ve docs/kurumsal/env.ornek.txt yazar
// tests/test_env_belge.mjs: kodda olup burada olmayan / burada olup kodda olmayan değişken ve bayat belge testi kırar.
// Gizli değerler (G): <AD>_FILE ile dosyadan da verilebilir (Docker secrets). Z: NODE_ENV=production iken zorunlu.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ORTAM_YOLU = path.join(kok, 'docs/kurumsal/ORTAM.md');
export const ORNEK_YOLU = path.join(kok, 'docs/kurumsal/env.ornek.txt');

// [grup, ad, açıklama, varsayılan, bayrak ('G' gizli, 'Z' üretimde zorunlu, 'T' yalnız test)]
export const DEGISKENLER = [
  ['Sunucu', 'NODE_ENV', 'production ise başlatma doğrulaması katı çalışır (zorunlu ayarlar, https, güçlü şifre...). Docker imajında hazır gelir', '(boş)', ''],
  ['Sunucu', 'PORT', 'Dinlenen port (0-65535)', '8080', ''],
  ['Sunucu', 'HOST', 'Dinlenen adres. Docker/Caddy arkasında 127.0.0.1 ya da konteyner içinde 0.0.0.0', '0.0.0.0', ''],
  ['Sunucu', 'PUBLIC_URL', 'Oyunun dış adresi. E-postadaki bağlantılar ve HSTS buna göre. Üretimde https:// ile başlamalı', 'http://localhost:PORT', 'Z'],
  ['Sunucu', 'TRUST_PROXY', '1: önünde Caddy/Nginx var; istemci adresi X-Forwarded-For\'un SON girdisinden alınır (hız sınırları için)', '0', ''],
  ['Sunucu', 'SERVE_DIST', '0: oyunun statik dosyaları sunulmaz (başka yerden sunuluyorsa)', '1', ''],
  ['Sunucu', 'DIST_DIR', 'Derlenmiş oyun klasörü', './dist', ''],
  ['Sunucu', 'CORS_ORIGINS', 'Oyun dosyaları başka adresten sunuluyorsa izinli adresler (virgülle). Yönetici uçlarına asla izin verilmez', '(boş)', ''],
  ['Sunucu', 'DB_FILE', 'SQLite kayıt dosyası. Üretimde kalıcı bir yol (Docker\'da /data/realm.db), :memory: olamaz', './data/realm.db', 'Z'],
  ['Sunucu', 'SESSION_DAYS', 'Oturum geçerlilik süresi (gün)', '30', ''],
  ['Hız sınırı', 'RATE_LIMIT_PER_SEC', 'Oturum başına saniyede en çok istek', '15', ''],
  ['Hız sınırı', 'IP_RATE_LIMIT_PER_SEC', 'IP başına saniyede en çok istek (kimlik denetiminden önce)', '40', ''],
  ['Hız sınırı', 'PUBLIC_RATE_LIMIT_PER_SEC', 'Giriş/kayıt gibi herkese açık uçlar için IP başına', '5', ''],
  ['Yönetici ve e-posta', 'ADMIN_TOKEN', 'Yönetici paneli şifresi (en az 24 karakter; `openssl rand -hex 32`). Boş ya da kısaysa panel KAPALI', '(boş)', 'G'],
  ['Yönetici ve e-posta', 'ADMIN_EMAIL', 'Uyarı e-postaları (oyun cüzdanı azaldı, zamanlayıcı hatası...)', '(boş)', ''],
  ['Yönetici ve e-posta', 'SMTP_URL', 'E-posta sunucusu: smtp://kullanici:sifre@sunucu:587. Boşsa e-postalar günlüğe yazılır (yalnız deneme). Üretimde zorunlu', '(boş)', 'GZ'],
  ['Yönetici ve e-posta', 'MAIL_FROM', 'Gönderen adı ve adresi', 'Realm of AdAstra <no-reply@localhost>', ''],
  ['Zincir (Avalanche)', 'CHAIN_ENABLED', '0: zincire hiç bağlanma (deneme/yerel)', '1', ''],
  ['Zincir (Avalanche)', 'CHAIN_ID', '43114 Avalanche ana ağ, 43113 Fuji deneme ağı', '43114', ''],
  ['Zincir (Avalanche)', 'RPC_URLS', 'Virgülle ayrılmış RPC adresleri (sırayla yedeğe geçer)', 'avax.network, publicnode, ankr', ''],
  ['Zincir (Avalanche)', 'TOKEN_ADDRESS', 'ADASTRA sözleşme adresi', '0xCA29…bEb0', ''],
  ['Zincir (Avalanche)', 'TOKEN_MANAGER', 'Arena TokenManager adresi', '0x8315…6c6e', ''],
  ['Zincir (Avalanche)', 'TOKEN_ID', 'Arena token numarası', '106334', ''],
  ['Zincir (Avalanche)', 'AVAX_USD_FEED', 'Chainlink AVAX/USD fiyat kaynağı', '0x0A77…6156', ''],
  ['Zincir (Avalanche)', 'DEPOSIT_START_BLOCK', 'Yatırma taramasının başlayacağı blok (0: ilk açılış bloğu)', '0', ''],
  ['Zincir (Avalanche)', 'LEGACY_DEPOSITS', '1: eski düzen, oyun cüzdanına doğrudan gönderilen ADASTRA bakiyeye yazılır (varsayılan kapalı)', '0', ''],
  ['Zincir (Avalanche)', 'PAYMENTS_CONTRACT', 'RealmPayments sözleşme adresi. Boşsa cüzdandan ödeme ve Oyun Kasası kapalı', '(boş)', ''],
  ['Zincir (Avalanche)', 'RATES_CONTRACT', 'RealmRates sözleşme adresi (ADA oranları; 5 dakikada bir okunur). Boşsa oyunun kendi ayarları', '(boş)', ''],
  ['Zincir (Avalanche)', 'PAY_FEE_GAS', 'Ödeme komisyonu gaz çarpanı (sözleşmedeki feeGas ile aynı olmalı)', '100000', ''],
  ['Zincir (Avalanche)', 'TREASURY_ADDRESS', 'Sözleşmedeki hazine adresi (boşsa oyun cüzdanı)', '(boş)', ''],
  ['Zincir (Avalanche)', 'CONTRACT_OWNER', 'Ödeme sözleşmesinin olması gereken sahibi (donanım cüzdanı); panelde doğrulanır', '(boş)', ''],
  ['Cüzdanlar ve para', 'GAME_WALLET_PRIVATE_KEY', 'Oyun cüzdanının gizli anahtarı (0x + 64 hane). Sunucu çekimleri bununla gönderir. Boşsa ödemeler yönetici onayında', '(boş)', 'G'],
  ['Cüzdanlar ve para', 'GAME_WALLET_ADDRESS', 'Anahtar yokken yalnız okumak için oyun cüzdanı adresi', '(boş)', ''],
  ['Cüzdanlar ve para', 'KASA_MASTER_KEY', 'Oyun Kasası anahtarlarını şifreleyen ana anahtar (64 onaltılık hane). KAYBEDİLMEZ, PAYLAŞILMAZ, veritabanıyla AYNI YERDE yedeklenmez', '(boş)', 'GZ'],
  ['Cüzdanlar ve para', 'PAYOUT_MODE', 'auto: sunucu kendisi gönderir; manual: yönetici panelinden onaylanınca', 'anahtar varsa auto, yoksa manual', ''],
  ['Cüzdanlar ve para', 'WEEKLY_SEND_CAP_ADA', 'Bir haftada oyunculara gidebilecek en fazla ADA (güvenlik sınırı)', '100000000', ''],
  ['Cüzdanlar ve para', 'MIN_WITHDRAW_ADA', 'En düşük çekim', '1000', ''],
  ['Cüzdanlar ve para', 'LAUNCH_PRICE_USD', 'Açılış fiyatı ($). 0: sunucunun ilk okuduğu fiyat', '0', ''],
  ['Cüzdanlar ve para', 'RESERVE_WALLET', 'Soğuk (donanım) cüzdan adresi: oyun cüzdanındaki fazla ADA günde bir buraya gider', '(boş)', ''],
  ['Cüzdanlar ve para', 'HOT_WALLET_WEEKS', 'Oyun cüzdanında kaç haftalık ihtiyaç tutulur', '1', ''],
  ['Cüzdanlar ve para', 'HOT_WALLET_MIN_ADA', 'İlk haftalarda oyun cüzdanında kalacak en az ADA', '0', ''],
  ['Cüzdanlar ve para', 'KASA_MIN_AVAX', 'Kasada en az bu kadar AVAX yoksa kasa kullanılmaz (aktarım ücreti)', '0.003', ''],
  ['Cüzdanlar ve para', 'KASA_MIN_SETTLE', 'Bu kadar birikince (ya da 24 saatte bir) kasadan oyuna aktarım', '50', ''],
  ['Cüzdanlar ve para', 'KASA_CAP_DAYS', 'Kasada en çok kaç günlük harcama birikir (fazlası oyuncuya iade)', '30', ''],
  ['Cüzdanlar ve para', 'KASA_CAP_FLOOR_ADA', 'Yeni oyuncu için kasa üst sınırının alt değeri', '20000', ''],
  ['Ortak gelir', 'PARTNER_INCOME_FROM', 'Trade sitesinin ödemeyi yaptığı cüzdan(lar) (virgülle)', '(boş)', ''],
  ['Ortak gelir', 'PARTNER_INCOME_TO', 'Paranın geldiği adres (boşsa oyun cüzdanı)', '(boş)', ''],
  ['Deneme / test', 'TEST_MODE', '1: deneme sunucusu (test menüsü, taklit Kasa, bot rakip). GERÇEK SUNUCUDA KAPALI; gerçek anahtar/ana ağ sözleşmesiyle birlikte açılmaz', '0', ''],
  ['Deneme / test', 'PAROLA_HAFIF', 'YALNIZ testler: parola özetini hafifletir. Gerçek sunucuda başlatma reddedilir', '(boş)', 'T'],
  ['Deneme / test', 'TEST_RASTGELE', 'YALNIZ testler: rastgeleliği sabit tohumla tekrarlanabilir yapar (altın kayıt testi)', '(boş)', 'T']
];

// Kodun okuduğu değişken adları (server/ altındaki bütün .js dosyaları)
export function koddaOkunanlar() {
  const set = new Set();
  const gez = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const y = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'gecis') gez(y); } else if (e.name.endsWith('.js')) {
    const t = fs.readFileSync(y, 'utf8');
    for (const m of t.matchAll(/(?:process\.env|[^A-Za-z0-9_$.]env)\.([A-Z][A-Z0-9_]+)/g)) set.add(m[1]);
    for (const m of t.matchAll(/(?:num|gizli)\('([A-Z][A-Z0-9_]+)'/g)) set.add(m[1]);
  } } };
  gez(path.join(kok, 'server'));
  return [...set].sort();
}

export function belgeUret() {
  let md = `# Ortam değişkenleri\n\n> **Otomatik üretilir**: \`node scripts/env-belge.mjs\` (kaynak: \`scripts/env-belge.mjs\`; güncelliği \`tests/test_env_belge.mjs\` korur).\n> Hazır örnek dosya: [\`env.ornek.txt\`](env.ornek.txt) → \`server/.env\` olarak kopyalanır.\n\n`;
  md += `**Bayraklar:** 🔒 gizli değer (\`<AD>_FILE\` ile **dosyadan** da verilebilir: Docker secrets / systemd; ikisi birlikte verilemez) · ⚠️ \`NODE_ENV=production\` iken zorunlu · 🧪 yalnız test.\n\n`;
  md += `Üretimde (\`NODE_ENV=production\`) sunucu, eksik/yanlış ayarı **başlamadan** açık hatayla bildirir (\`dogrula()\` in \`server/config.js\`).\n\n`;
  const gruplar = [...new Set(DEGISKENLER.map(d => d[0]))];
  for (const g of gruplar) {
    md += `## ${g}\n\n| Değişken | Açıklama | Varsayılan |\n|---|---|---|\n`;
    for (const [, ad, acik, varsayilan, bayrak] of DEGISKENLER.filter(d => d[0] === g)) {
      const isaret = `${bayrak.includes('G') ? '🔒 ' : ''}${bayrak.includes('Z') ? '⚠️ ' : ''}${bayrak.includes('T') ? '🧪 ' : ''}`;
      md += `| ${isaret}\`${ad}\` | ${acik.replace(/\|/g, '\\|')} | ${varsayilan.replace(/\|/g, '\\|')} |\n`;
    }
    md += '\n';
  }
  return md.trimEnd() + '\n';
}

export function ornekUret() {
  let t = `# Realm of AdAstra — ortam değişkenleri örneği (docs/kurumsal/ORTAM.md'den üretilir; kopyala: server/.env)\n# GİZLİ DEĞERLERİ BURAYA GERÇEK HÂLİYLE YAZMA ve bu dosyayı git'e koyma. Gizli olanlar için <AD>_FILE ile dosya yolu da verilebilir.\n\n`;
  for (const g of [...new Set(DEGISKENLER.map(d => d[0]))]) {
    t += `# ── ${g} ──\n`;
    for (const [, ad, acik, varsayilan, bayrak] of DEGISKENLER.filter(d => d[0] === g)) {
      if (bayrak.includes('T')) continue;   // test bayrakları örnek dosyaya konmaz
      t += `# ${acik}${bayrak.includes('Z') ? ' [üretimde zorunlu]' : ''}${bayrak.includes('G') ? ' [GİZLİ]' : ''}\n${ad}=\n`;
      void varsayilan;
    }
    t += '\n';
  }
  return t.trimEnd() + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(ORTAM_YOLU, belgeUret());
  fs.writeFileSync(ORNEK_YOLU, ornekUret());
  console.log('Yazıldı:', ORTAM_YOLU, 've', ORNEK_YOLU);
}
