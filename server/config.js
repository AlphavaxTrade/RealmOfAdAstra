// Realm of Astra sunucusu — ayarlar (hepsi ortam değişkenlerinden; bkz. server/.env.example)
export function loadConfig(env = process.env) {
  const num = (k, d) => (env[k] != null && env[k] !== '' ? Number(env[k]) : d);
  const key = (env.GAME_WALLET_PRIVATE_KEY || '').trim();
  return {
    port: num('PORT', 8080),
    host: env.HOST || '0.0.0.0',
    dbFile: env.DB_FILE || './data/realm.db',
    adminToken: (env.ADMIN_TOKEN || '').trim(),
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
    weeklySendCapAda: num('WEEKLY_SEND_CAP_ADA', 100_000_000),   // güvenlik: bir haftada oyunculara gidebilecek en fazla ADA
    minWithdrawAda: num('MIN_WITHDRAW_ADA', 1000),
    depositStartBlock: num('DEPOSIT_START_BLOCK', 0),              // 0: sunucu ilk açıldığı bloktan başlar
    // Eski düzen: oyun cüzdanına doğrudan gönderilen ADASTRA'yı bakiyeye yaz. Yeni düzende KAPALI: ödemeler sözleşmeden,
    // otomatik işler Oyun Kasası'ndan yapılır. (Açılırsa sözleşme ödemeleri ayrıca yatırma sayılmasın diye süzülür.)
    legacyDeposits: env.LEGACY_DEPOSITS === '1',
    treasuryAddress: (env.TREASURY_ADDRESS || '').trim(),          // sözleşmedeki hazine adresi (boşsa oyun cüzdanı)
    launchPriceUsd: num('LAUNCH_PRICE_USD', 0),                    // 0: ilk okunan fiyat açılış fiyatı sayılır
    sessionDays: num('SESSION_DAYS', 30),
    publicUrl: (env.PUBLIC_URL || `http://localhost:${num('PORT', 8080)}`).trim(),   // e-postadaki bağlantılar bu adrese gider
    smtpUrl: (env.SMTP_URL || '').trim(),                          // boşsa e-postalar sunucu günlüğüne yazılır (deneme)
    mailFrom: env.MAIL_FROM || 'Realm of Astra <no-reply@localhost>',
    trustProxy: env.TRUST_PROXY === '1',                           // önünde Caddy/Nginx varsa 1
    paymentsContract: (env.PAYMENTS_CONTRACT || '').trim(),        // RealmPayments sözleşmesinin adresi (boşsa cüzdandan ödeme kapalı)
    payFeeGas: num('PAY_FEE_GAS', 100000),                         // sözleşmedeki feeGas ile aynı olmalı (komisyon = gaz fiyatı × bu)
    kasaMasterKey: (env.KASA_MASTER_KEY || '').trim(),             // 64 hex: Oyun Kasası anahtarlarını şifreler (KAYBEDİLMEMELİ, paylaşılmamalı)
    kasaMinAvax: num('KASA_MIN_AVAX', 0.003),                      // kasada en az bu kadar AVAX yoksa kasa kullanılmaz (aktarım ücreti)
    kasaMinSettle: num('KASA_MIN_SETTLE', 50),                     // bu kadar birikince (ya da 24 saatte bir) kasadan oyuna aktarım
    // Kasa üst sınırı: kasada "günlük ortalama harcama × bu kadar gün"den fazlası birikirse fazlası oyuncunun bağlı
    // cüzdanına otomatik geri gönderilir (sunucu ele geçirilse bile kasalarda az para olsun). Yeni oyuncu için alt sınır
    // KASA_CAP_FLOOR_ADA (fiyat çarpanıyla ölçeklenir).
    kasaCapDays: num('KASA_CAP_DAYS', 30),
    kasaCapFloorAda: num('KASA_CAP_FLOOR_ADA', 20000),
    // Sıcak / soğuk cüzdan: oyun cüzdanında yalnız HOT_WALLET_WEEKS haftalık ihtiyaç kadar ADA durur; fazlası günde bir
    // RESERVE_WALLET adresine (donanım cüzdanı, ör. Ledger) gönderilir. Sunucu yalnız ADRESİ bilir, anahtarını asla.
    reserveWallet: (env.RESERVE_WALLET || '').trim(),
    hotWalletWeeks: num('HOT_WALLET_WEEKS', 1),
    hotWalletMinAda: num('HOT_WALLET_MIN_ADA', 0),                 // geçmiş yokken (ilk haftalar) oyun cüzdanında kalacak en az ADA
    contractOwner: (env.CONTRACT_OWNER || '').trim(),              // ödeme sözleşmesinin olması gereken sahibi (donanım cüzdanı)
    adminEmail: (env.ADMIN_EMAIL || '').trim(),                    // uyarı e-postaları (oyun cüzdanı azaldı vb.)
    testMode: env.TEST_MODE === '1',                               // 🧪 deneme sunucusu: test menüsü + bot rakip (GERÇEKTE KAPALI)
    rateLimitPerSec: num('RATE_LIMIT_PER_SEC', 15),
    ipRateLimitPerSec: num('IP_RATE_LIMIT_PER_SEC', 40),            // IP başına tüm istekler (kimlik denetiminden önce)
    publicRateLimitPerSec: num('PUBLIC_RATE_LIMIT_PER_SEC', 5)        // giriş/kayıt sayfaları (IP başına)
  };
}
