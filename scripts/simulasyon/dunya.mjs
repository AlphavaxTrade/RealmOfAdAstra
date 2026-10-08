// Yerel simülasyon dünyası (T3, yerel doğrulama kampanyası): GERÇEK sunucu kodu (motor, hesaplar, kapı, dünya, pvp, HTTP uygulaması),
// SAHTE saat ve SAHTE zincir. Gerçek ağa/paraya/canlı sunucuya dokunmaz.
//
// ÖNEMLİ: bu dosya motoru içe almadan ÖNCE global Date'i değiştirir (oyun kuralları Date.now()'ı doğrudan okur) ve rastgeleliği
// tohumlar; bu yüzden süreç başına yalnız bir dünya kurulabilir ve motoru başka bir dosya bundan ÖNCE içe almamalıdır.
import http from 'node:http';
process.env.TEST_RASTGELE = '1';
process.env.PAROLA_HAFIF = '1';

const GercekTarih = Date;
export const zaman = { T: Date.UTC(2026, 9, 12, 12, 0, 0) };     // Pazartesi 12:00 UTC
globalThis.Date = class extends GercekTarih {
  constructor(...a) { if (a.length === 0) super(zaman.T); else super(...a); }
  static now() { return zaman.T; }
};

export const SAAT = 3600000, GUN = 24 * SAAT;
export function tohumlu(a) { return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const BAGLANTI_DESENI = { verify: /[?&]verify=([a-f0-9]+)/, wallet: /[?&]wallet=([a-f0-9]+)/ };
const ORTAK_GONDEREN = '0x' + 'aa'.repeat(20);
const OYUN_CUZDANI = '0x' + '11'.repeat(20);

// opts: { tohum, ortakGelir (bool), fiyat: (gunNo) => çarpan }
export async function dunyaKur(opts = {}) {
  const tohum = opts.tohum ?? 11;
  Math.random = tohumlu(tohum);
  const { sabitTohum } = await import('../../server/rastgele.js');
  sabitTohum(tohum + 1000);
  const { openDb } = await import('../../server/db.js');
  const { createEngine, SYSTEM } = await import('../../server/engine.js');
  const { createArena } = await import('../../server/arena.js');
  const { createWorld } = await import('../../server/world.js');
  const { createApp } = await import('../../server/app.js');
  const { loadConfig } = await import('../../server/config.js');
  const { createMailer } = await import('../../server/mailer.js');
  const { createAccounts } = await import('../../server/accounts.js');
  const { createKapi } = await import('../../server/kapi.js');

  const clock = () => zaman.T;
  const sessiz = { log() {}, warn() {}, info() {}, error: (...a) => { dunya.hatalar.push(a.map(x => (x && x.stack) || String(x)).join(' ').slice(0, 400)); } };
  const cfg = {
    ...loadConfig({}), dbFile: ':memory:', adminToken: 'sim-yonetici-anahtari-uzun-1234567890', serveDist: false, testMode: true,
    rateLimitPerSec: 1e9, publicRateLimitPerSec: 1e9, ipRateLimitPerSec: 1e9, sessionDays: 5000, payoutMode: 'auto',
    partnerIncomeFrom: opts.ortakGelir ? [ORTAK_GONDEREN] : [], partnerIncomeTo: opts.ortakGelir ? OYUN_CUZDANI : ''
  };
  const db = openDb(':memory:');
  const E = await createEngine(db, { clock, testMode: true });

  // ── Sahte zincir: fiyat senaryoya göre değişir; gönderimler kaydedilir; trade sitesi girişi kuyruğa konabilir ──
  const arz = opts.arz || 2.1325e9;   // küçük arz = çekim tavanı (fiyatı %2 düşürecek miktar) gerçekten bağlar
  const zincir = { fiyatUsd: 2e-7, avaxUsd: 11.4, arz, olu: arz * 0.0774, blok: 1000, ortakKuyruk: [], gonderilen: [], ortakSayac: 0 };
  const chain = {
    gameWallet: OYUN_CUZDANI, canSend: true,
    async readMarket() {
      const priceUsd = zincir.fiyatUsd * (opts.fiyat ? opts.fiyat((zaman.T - zincir.baslangic) / GUN) : 1);
      return { at: zaman.T, graduated: false, supply: zincir.arz, dead: zincir.olu, curveSupply: zincir.arz, poolTokenReserve: 0, poolAvaxReserve: 0,
        priceAvax: priceUsd / zincir.avaxUsd, avaxUsd: zincir.avaxUsd, priceUsd, mcapUsd: priceUsd * (zincir.arz - zincir.olu), walletAda: 2e8, pairAddress: null };
    },
    async latestBlock() { zincir.blok += 1; return zincir.blok; },
    async scanDeposits() { return []; },
    async scanTransfers() { const l = zincir.ortakKuyruk; zincir.ortakKuyruk = []; return l; },
    async sendAda(to, amount, onSigned = () => {}) { const hash = '0x' + (zincir.gonderilen.length + 1).toString(16).padStart(64, '0'); onSigned({ hash, raw: '0x', nonce: zincir.gonderilen.length }); zincir.gonderilen.push({ to, amount, at: zaman.T }); return hash; },
    async checkPayout() { return 'sent'; }
  };
  zincir.baslangic = zaman.T;
  zincir.ortakGelirEkle = amount => { zincir.ortakKuyruk.push({ txHash: '0xortak' + (++zincir.ortakSayac), logIndex: 0, from: ORTAK_GONDEREN, amount, block: zincir.blok }); };

  const mailer = createMailer({ db, cfg, log: sessiz });
  // Cüzdan bağlama sahte imzayla: imza = adresin kendisi (gerçek kriptografi bu testin konusu değil)
  const accounts = createAccounts({ db, cfg, mailer, clock, verifyMessage: (m, s) => s });
  if (opts.limit) E.GAME_CONFIG.KAPI.START_LIMIT = opts.limit;
  const kapi = createKapi({ db, engine: E, accounts, mailer, cfg, clock, log: sessiz });
  const arena = createArena({ db, engine: E, clock });
  const world = createWorld({ db, engine: E, chain, arena, accounts, mailer, kapi, cfg, clock, log: sessiz });
  const app = createApp({ db, engine: E, world, accounts, kapi, arena, chain, cfg, clock, log: sessiz });
  const server = app.server();
  server.on('connection', sk => sk.setNoDelay(true));
  server.listen(0, '127.0.0.1');
  const agent = new http.Agent({ keepAlive: true, maxSockets: 16 });
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const dunya = {
    E, db, cfg, world, kapi, accounts, arena, chain, zincir, app, server, base, SYSTEM, zaman, hatalar: [],
    oyuncular: [], ADMIN: cfg.adminToken,
    // Taşıma: kalıcı bağlantı + Nagle kapalı (Windows'ta fetch her istekte ~13 ms bekliyordu; bu yol ~1 ms)
    call(method, p, body, token) {
      return new Promise((res, rej) => {
        const data = body ? JSON.stringify(body) : null;
        const r = http.request({ host: '127.0.0.1', port: server.address().port, method, path: p, agent, noDelay: true,
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, rs => {
          let b = ''; rs.setEncoding('utf8'); rs.on('data', d => { b += d; });
          rs.on('end', () => { let json = null; try { json = b ? JSON.parse(b) : null; } catch { /* JSON olmayan yanıt */ } res({ status: rs.statusCode, body: json }); });
        });
        r.on('error', rej);
        if (data) r.write(data);
        r.end();
      });
    },
    sonBaglanti(tur) { const m = db.kvJson('dev:outbox', [])[0]; const r = BAGLANTI_DESENI[tur].exec(m ? m.text : ''); return r && r[1]; },
    async hesapAc(eposta) {
      const r = await dunya.call('POST', '/api/account/register', { email: eposta, password: 'gizli-sifre-123' });
      if (r.status !== 200) throw new Error('kayıt: ' + JSON.stringify(r.body));
      const v = await dunya.call('POST', '/api/account/verify', { token: dunya.sonBaglanti('verify') });
      if (v.status !== 200) throw new Error('doğrulama: ' + JSON.stringify(v.body));
      return { token: v.body.token, pid: v.body.playerId };
    },
    // Hesaba sahte cüzdan bağla (çekim talepleri için)
    async cuzdanBagla(oy, n) {
      const adres = '0x' + n.toString(16).padStart(40, '0');
      const nonce = await dunya.call('POST', '/api/account/wallet/nonce', { address: adres }, oy.token);
      if (nonce.status !== 200) throw new Error('nonce: ' + JSON.stringify(nonce.body));
      const l = await dunya.call('POST', '/api/account/wallet/link', { signature: adres }, oy.token);
      if (l.status !== 200) throw new Error('bağlama: ' + JSON.stringify(l.body));
      const c = await dunya.call('POST', '/api/account/wallet/confirm', { token: dunya.sonBaglanti('wallet') });
      if (c.status !== 200) throw new Error('onay: ' + JSON.stringify(c.body));
      oy.cuzdan = adres;
    },
    ilerle(ms) { zaman.T += ms; },
    async tick() { await world.tick(); },
    async kapat() { agent.destroy(); await new Promise(r => server.close(r)); db.close(); }
  };
  return dunya;
}
