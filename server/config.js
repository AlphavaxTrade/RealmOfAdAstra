// Realm of AdAstra sunucusu — ayarlar (hepsi ortam değişkenlerinden; bkz. server/.env.example ve docs/kurumsal/ORTAM.md)
import fs from 'node:fs';

export function loadConfig(env = process.env) {
  // Gizli değerler iki yoldan verilebilir: ORTAM DEĞİŞKENİ ya da <AD>_FILE (Docker secrets / systemd LoadCredential: değer dosyada,
  // ortamda ve `docker inspect`te görünmez). İkisi birlikte verilirse belirsizlik olmasın diye hata. Hata mesajları İÇERİĞİ yazmaz.
  const gizli = ad => {
    const duz = (env[ad] || '').trim();
    const dosya = (env[ad + '_FILE'] || '').trim();
    if (duz && dosya) throw new Error(`Ayar hatası: ${ad} ve ${ad}_FILE birlikte tanımlı; yalnız birini kullan`);
    if (!dosya) return duz;
    let icerik;
    try { icerik = fs.readFileSync(dosya, 'utf8'); } catch (e) { throw new Error(`Ayar hatası: ${ad}_FILE okunamadı (${dosya}): ${e.code || 'hata'}`); }
    icerik = icerik.trim();
    if (!icerik) throw new Error(`Ayar hatası: ${ad}_FILE boş (${dosya})`);
    return icerik;
  };
  // Sayı ayarları: boş = varsayılan; sayı olmayan değer sessizce NaN olmaz, başlatmayı AÇIK hatayla durdurur (A3.2)
  const num = (k, d, { min = -Infinity, max = Infinity } = {}) => {
    if (env[k] == null || env[k] === '') return d;
    const v = Number(env[k]);
    if (!Number.isFinite(v)) throw new Error(`Ayar hatası: ${k} bir sayı olmalı (verilen: "${String(env[k]).slice(0, 40)}")`);
    if (v < min || v > max) throw new Error(`Ayar hatası: ${k} ${min} ile ${max} arasında olmalı (verilen: ${v})`);
    return v;
  };
  const key = gizli('GAME_WALLET_PRIVATE_KEY');
  return {
    port: num('PORT', 8080, { min: 0, max: 65535 }),
    host: env.HOST || '0.0.0.0',
    dbFile: env.DB_FILE || './data/realm.db',
    adminToken: gizli('ADMIN_TOKEN'),
    serveDist: env.SERVE_DIST !== '0',
    distDir: env.DIST_DIR || './dist',
    // Zincir
    chainEnabled: env.CHAIN_ENABLED !== '0',
    chainId: num('CHAIN_ID', 43114),                               // 43114 Avalanche, 43113 Fuji deneme ağı
    rpcUrls: (env.RPC_URLS || 'https://api.avax.network/ext/bc/C/rpc,https://avalanche-c-chain-rpc.publicnode.com,https://rpc.ankr.com/avalanche').split(',').filter(Boolean),
    tokenAddress: env.TOKEN_ADDRESS || '0xCA29d740502F4bA1Fa8e9DcAfBD85137b4CebEb0',
    tokenManager: env.TOKEN_MANAGER || '0x8315f1eb449Dd4B779495C3A0b05e5d194446c6e',
    tokenId: num('TOKEN_ID', 106334),
    avaxUsdFeed: env.AVAX_USD_FEED || '0x0A77230d17318075983913bC2145DB16C7366156',   // Chainlink AVAX/USD (doğrulandı 30 Eylül 2026)
    deadAddress: '0x000000000000000000000000000000000000dEaD',
    // Oyun cüzdanı (B seçeneği: sunucu otomatik gönderir). Anahtar yoksa ödemeler yönetici onayı bekler.
    gameWalletKey: key,
    gameWalletAddress: (env.GAME_WALLET_ADDRESS || '').trim(),
    payoutMode: env.PAYOUT_MODE || (key ? 'auto' : 'manual'),
    weeklySendCapAda: num('WEEKLY_SEND_CAP_ADA', 100_000_000),   // güvenlik: bir haftada oyunculara gidebilecek en fazla ASTRA
    minWithdrawAda: num('MIN_WITHDRAW_ADA', 1000),
    depositStartBlock: num('DEPOSIT_START_BLOCK', 0),              // 0: sunucu ilk açıldığı bloktan başlar
    // Eski düzen: oyun cüzdanına doğrudan gönderilen ADASTRA'yı bakiyeye yaz. Yeni düzende KAPALI: ödemeler sözleşmeden,
    // otomatik işler Oyun Kasası'ndan yapılır. (Açılırsa sözleşme ödemeleri ayrıca yatırma sayılmasın diye süzülür.)
    legacyDeposits: env.LEGACY_DEPOSITS === '1',
    treasuryAddress: (env.TREASURY_ADDRESS || '').trim(),          // sözleşmedeki hazine adresi (boşsa oyun cüzdanı)
    launchPriceUsd: num('LAUNCH_PRICE_USD', 0),                    // 0: ilk okunan fiyat açılış fiyatı sayılır
    sessionDays: num('SESSION_DAYS', 30),
    // Oyun dosyaları başka bir adresten sunuluyorsa (ör. https://realmofadastra.vercel.app) o adres(ler) buraya:
    // tarayıcı yalnız bu adreslerden gelen oyun isteklerine izin verir. Virgülle birden çok yazılabilir.
    corsOrigins: (env.CORS_ORIGINS || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(o => /^https?:\/\/[^/\s]+$/.test(o)),
    publicUrl: (env.PUBLIC_URL || `http://localhost:${num('PORT', 8080, { min: 0, max: 65535 })}`).trim(),   // e-postadaki bağlantılar bu adrese gider
    smtpUrl: gizli('SMTP_URL'),                          // boşsa e-postalar sunucu günlüğüne yazılır (deneme)
    mailFrom: env.MAIL_FROM || 'Realm of AdAstra <no-reply@localhost>',
    trustProxy: env.TRUST_PROXY === '1',                           // önünde Caddy/Nginx varsa 1
    paymentsContract: (env.PAYMENTS_CONTRACT || '').trim(),        // RealmPayments sözleşmesinin adresi (boşsa cüzdandan ödeme kapalı)
    // Oyun Kasası sözleşmesi (contracts/OyunKasasi.sol, tek yönlü kilit): doluysa oyunun ASTRA'sı kasada durur; çekim, yakım ve
    // yapımcı payı kasadan çıkar (oyun cüzdanı yalnız "dağıtıcı" anahtardır, para tutmaz). Boşsa düz oyun cüzdanı kullanılır.
    vaultContract: (env.VAULT_CONTRACT || '').trim().toLowerCase(),
    payFeeGas: num('PAY_FEE_GAS', 100000),
    // RealmRates sözleşmesi (kullanıcı kararı 6 Ekim 2026): oyundaki bütün ASTRA oranları burada durur; sunucu 5 dakikada bir okur.
    // Boşsa oyunun kendi ayarları (js/config.js) kullanılır.
    ratesContract: (env.RATES_CONTRACT || '').trim(),                         // sözleşmedeki feeGas ile aynı olmalı (komisyon = gaz fiyatı × bu)
    kasaMasterKey: gizli('KASA_MASTER_KEY'),             // 64 hex: Oyun Kasası anahtarlarını şifreler (KAYBEDİLMEMELİ, paylaşılmamalı)
    hesapAnahtari: gizli('HESAP_ANAHTARI'),              // 64 hex: hesap sırlarını (iki adımlı doğrulama sırrı) veritabanında şifreler; boşsa düz (yalnız deneme)
    kasaMinAvax: num('KASA_MIN_AVAX', 0.003),                      // kasada en az bu kadar AVAX yoksa kasa kullanılmaz (aktarım ücreti)
    kasaMinSettle: num('KASA_MIN_SETTLE', 50),                     // bu kadar birikince (ya da 24 saatte bir) kasadan oyuna aktarım
    // Kasa üst sınırı: kasada "günlük ortalama harcama × bu kadar gün"den fazlası birikirse fazlası oyuncunun bağlı
    // cüzdanına otomatik geri gönderilir (sunucu ele geçirilse bile kasalarda az para olsun). Yeni oyuncu için alt sınır
    // KASA_CAP_FLOOR_ADA (fiyat çarpanıyla ölçeklenir).
    kasaCapDays: num('KASA_CAP_DAYS', 30),
    kasaCapFloorAda: num('KASA_CAP_FLOOR_ADA', 20000),
    // Sıcak / soğuk cüzdan: oyun cüzdanında yalnız HOT_WALLET_WEEKS haftalık ihtiyaç kadar ASTRA durur; fazlası günde bir
    // RESERVE_WALLET adresine (donanım cüzdanı, ör. Ledger) gönderilir. Sunucu yalnız ADRESİ bilir, anahtarını asla.
    reserveWallet: (env.RESERVE_WALLET || '').trim(),
    hotWalletWeeks: num('HOT_WALLET_WEEKS', 1),
    hotWalletMinAda: num('HOT_WALLET_MIN_ADA', 0),                 // geçmiş yokken (ilk haftalar) oyun cüzdanında kalacak en az ASTRA
    contractOwner: (env.CONTRACT_OWNER || '').trim(),              // ödeme sözleşmesinin olması gereken sahibi (donanım cüzdanı)
    adminEmail: (env.ADMIN_EMAIL || '').trim(),                    // uyarı e-postaları (oyun cüzdanı azaldı vb.)
    // Ortak gelir (kullanıcı kararı 6 Ekim 2026): trade sitesindeki (AlphAvax) harcamaların %40'ı ADASTRA olarak oyuna
    // gönderilir. Sunucu PARTNER_INCOME_FROM cüzdan(lar)ından PARTNER_INCOME_TO adresine gelen ADASTRA'yı izler ve her
    // oyun harcaması gibi dağıtır: %5 yakım, %6 temel gelir, %3 yapımcı payı, %86 ödül kasaları. TO boşsa oyun cüzdanı.
    partnerIncomeFrom: (env.PARTNER_INCOME_FROM || '').split(',').map(s => s.trim().toLowerCase()).filter(a => /^0x[0-9a-f]{40}$/.test(a)),
    partnerIncomeTo: (env.PARTNER_INCOME_TO || '').trim().toLowerCase(),
    testMode: env.TEST_MODE === '1',                               // 🧪 deneme sunucusu: test menüsü + bot rakip (GERÇEKTE KAPALI)
    rateLimitPerSec: num('RATE_LIMIT_PER_SEC', 15),
    ipRateLimitPerSec: num('IP_RATE_LIMIT_PER_SEC', 40),            // IP başına tüm istekler (kimlik denetiminden önce)
    publicRateLimitPerSec: num('PUBLIC_RATE_LIMIT_PER_SEC', 5),       // giriş/kayıt sayfaları (IP başına)
    // Yedekleme (server/yedek/, docs/kurumsal/FELAKET_KURTARMA.md): klasör boşsa otomatik yedek ve yedek ölçüleri kapalı
    yedek: {
      klasor: (env.YEDEK_KLASORU || '').trim(),
      aralikDk: num('YEDEK_ARALIK_DK', 60, { min: 1, max: 1440 }),
      anahtar: gizli('YEDEK_ANAHTAR'),                              // 64 hex: doluysa yedekler AES-256-GCM ile şifrelenir (KAYBEDİLMEMELİ)
      sonrasiKomut: (env.YEDEK_SONRASI_KOMUT || '').trim()          // her yedekten sonra çalışır (dışarı kopyalama); YEDEK_DOSYA ve YEDEK_MANIFEST verilir
    }
  };
}

// Üretimde (NODE_ENV=production) başlatma doğrulaması: eksik/yanlış ayar sessizce yarım çalışmasın, başlamadan açık hata versin.
// Geliştirme/deneme ortamında (NODE_ENV=production DEĞİLKEN) hiçbir kural uygulanmaz. { hatalar: [...], uyarilar: [...] }
export function dogrula(cfg, env = process.env) {
  const hatalar = [], uyarilar = [];
  if (env.NODE_ENV !== 'production') return { hatalar, uyarilar };
  const adres = a => /^0x[0-9a-fA-F]{40}$/.test(String(a || ''));
  if (cfg.testMode) hatalar.push('TEST_MODE=1 üretimde (NODE_ENV=production) kullanılamaz');
  if (!String(cfg.publicUrl).startsWith('https://')) hatalar.push(`PUBLIC_URL https:// ile başlamalı (cüzdan bağlama ve e-posta bağlantıları için; şu an: ${cfg.publicUrl})`);
  // Sunucu düz http konuşur; https adresi yalnız önündeki Caddy/Nginx'ten gelir. TRUST_PROXY yoksa bütün ziyaretçiler proxy'nin
  // adresi görünür: 50 yanlış giriş HERKESİN girişini, 10 yanlış yönetici şifresi paneli kilitler (13 Ekim 2026 denetimi, H2).
  else if (!cfg.trustProxy) hatalar.push('TRUST_PROXY=1 olmalı: PUBLIC_URL https:// ise sunucu bir Caddy/Nginx arkasındadır; yoksa bütün ziyaretçiler tek adres görünür ve hız sınırları/giriş kilitleri herkese ortak olur');
  if (cfg.dbFile === ':memory:') hatalar.push('DB_FILE bellek içi (:memory:) olamaz: kayıtlar kalıcı olmalı');
  if (!cfg.smtpUrl) hatalar.push('SMTP_URL tanımlı değil: doğrulama e-postaları gitmez, kimse giriş yapamaz');
  if (!cfg.adminToken) uyarilar.push('ADMIN_TOKEN yok: yönetici paneli kapalı');
  else if (cfg.adminToken.length < 24) hatalar.push('ADMIN_TOKEN en az 24 karakter olmalı (kısaysa yönetici paneli kapalı kalır; openssl rand -hex 32)');
  if (cfg.gameWalletKey && !/^(0x)?[0-9a-fA-F]{64}$/.test(cfg.gameWalletKey)) hatalar.push('GAME_WALLET_PRIVATE_KEY biçimi geçersiz (64 onaltılık hane, başında 0x olabilir)');
  if (cfg.kasaMasterKey && !/^[0-9a-fA-F]{64}$/.test(cfg.kasaMasterKey)) hatalar.push('KASA_MASTER_KEY 64 haneli onaltılık olmalı (openssl rand -hex 32)');
  // Hesap sırları (13 Ekim 2026 denetimi, A2): iki adımlı doğrulama sırrı üretimde şifreli saklanmalı
  if (!cfg.hesapAnahtari) hatalar.push('HESAP_ANAHTARI gerekli: iki adımlı doğrulama sırları veritabanında şifrelenemez (openssl rand -hex 32; KAYBEDİLMEMELİ, veritabanıyla aynı yerde yedeklenmemeli)');
  else if (!/^[0-9a-fA-F]{64}$/.test(cfg.hesapAnahtari)) hatalar.push('HESAP_ANAHTARI 64 haneli onaltılık olmalı (openssl rand -hex 32)');
  if (cfg.paymentsContract && !cfg.kasaMasterKey) hatalar.push('KASA_MASTER_KEY gerekli: PAYMENTS_CONTRACT tanımlı (Oyun Kasası anahtarları şifrelenemez)');
  if (cfg.vaultContract && !adres(cfg.vaultContract)) hatalar.push('VAULT_CONTRACT geçerli bir adres değil');
  if (cfg.vaultContract && !cfg.gameWalletKey) hatalar.push('GAME_WALLET_PRIVATE_KEY gerekli: VAULT_CONTRACT tanımlı (kasadan ödemeyi tetikleyen dağıtıcı anahtar budur)');
  if (cfg.reserveWallet && !adres(cfg.reserveWallet)) hatalar.push('RESERVE_WALLET geçerli bir adres değil');
  if (!cfg.yedek.klasor) uyarilar.push('YEDEK_KLASORU yok: otomatik yedek ve yedek ölçüleri KAPALI (felaket durumunda veri kaybı riski)');
  if (cfg.yedek.anahtar && !/^[0-9a-fA-F]{64}$/.test(cfg.yedek.anahtar)) hatalar.push('YEDEK_ANAHTAR 64 haneli onaltılık olmalı (openssl rand -hex 32)');
  // Yedek dosyası içinde hesap bilgileri, parola özetleri, şifreli Kasa anahtarları durur: klasör tanımlıysa yedekler şifreli olmalı
  if (cfg.yedek.klasor && !cfg.yedek.anahtar) hatalar.push('YEDEK_ANAHTAR gerekli: YEDEK_KLASORU tanımlı (yedekler şifresiz yazılırdı; openssl rand -hex 32; KAYBEDİLMEMELİ, veritabanından AYRI yerde de saklanmalı)');
  if (!cfg.reserveWallet && cfg.chainEnabled && cfg.gameWalletKey) uyarilar.push('RESERVE_WALLET yok: oyun cüzdanındaki fazla ASTRA yedek (donanım) cüzdana aktarılmaz');
  return { hatalar, uyarilar };
}
