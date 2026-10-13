// server/world/odemeler.js: zincir ödeme kuyruğu (kurumsal A3.12). PARA YOLU: çift ödeme olmamalı.
// pending → sending → sent; imzalandıktan sonra hata alan ödeme "sending" kalır ve TEKRAR GÖNDERİLMEZ.
// Gerçek ağa çıkılmaz: sahte zincir (sendAda / checkPayout) verilir.
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { olusturOdemeler } from '../server/world/odemeler.js';
import { loadConfig } from '../server/config.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const ADRES = i => '0x' + String(i).padStart(2, '0').repeat(20);

async function kur({ chain, cfgEk = {} } = {}) {
  const db = openDb(':memory:');
  const E = await createEngine(db, { testMode: true });
  let T = Date.UTC(2026, 9, 8, 12);
  const cfg = { ...loadConfig({}), dbFile: ':memory:', payoutMode: 'auto', weeklySendCapAda: 100, ...cfgEk };
  const econ = () => db.kvJson('world:economy', {});
  const world = olusturOdemeler({ db, E, chain, cfg, clock: () => T, econ });
  world.setPaused = p => db.kvSetJson('world:economy', { ...econ(), paused: !!p });
  const satirlar = () => db.raw.prepare('SELECT id, kind, address, amount, status, tx_hash, error, sent_at FROM payouts ORDER BY id').all();
  return { db, E, world, satirlar, zaman: ms => { T += ms; } };
}
// Sahte zincir: her gönderim sıralı hash döner; davranış dışarıdan ayarlanır
function sahteZincir(ayar = {}) {
  const z = { canSend: true, gameWallet: ADRES(99), gonderilen: [], n: 0, kontrol: ayar.kontrol || (async () => 'waiting'),
    async sendAda(adres, tutar, imzali) {
      z.gonderilen.push({ adres, tutar });
      const no = ++z.n;
      if (ayar.oncedenHata && ayar.oncedenHata(no)) throw Object.assign(new Error('ağ hatası (imzadan önce)'), {});
      imzali({ hash: '0xhash' + no, raw: '0xraw' + no, nonce: no });
      if (ayar.sonradanHata && ayar.sonradanHata(no)) throw Object.assign(new Error('bağlantı koptu (imzadan sonra)'), { reverted: ayar.reverted === true });
      if (ayar.bekle) await ayar.bekle(no);
      return '0xhash' + no;
    },
    checkPayout: (...a) => z.kontrol(...a) };
  return z;
}

// 1) Atlama koşulları: cüzdan yok / gönderemez / duraklatılmış / elle mod
{
  let s = await kur({ chain: null });
  assert.deepEqual(await s.world.processPayouts(), { skipped: 'no-wallet' });
  s = await kur({ chain: { canSend: false } });
  assert.deepEqual(await s.world.processPayouts(), { skipped: 'no-wallet' });
  const z = sahteZincir();
  s = await kur({ chain: z });
  s.world.queuePayout(1, 'burn', ADRES(1), 10);
  s.world.setPaused(true);
  assert.deepEqual(await s.world.processPayouts(), { skipped: 'paused' });
  assert.equal(z.gonderilen.length, 0, 'duraklatılmışken hiçbir şey gönderilmez');
  s = await kur({ chain: sahteZincir(), cfgEk: { payoutMode: 'manual' } });
  s.world.queuePayout(1, 'burn', ADRES(1), 10);
  assert.deepEqual(await s.world.processPayouts(), { skipped: 'manual' });
  assert.deepEqual(await s.world.processPayouts({ force: true }), { sent: 1, failed: 0 }, 'yönetici zorlayınca elle modda da gider');
  ok('atlama koşulları: cüzdan yok, gönderemez, duraklatılmış, elle mod (force ile gider)');
}

// 2) Kuyruk: 1 ASTRA altı satır olmaz AMA KAYBOLMAZ (devredilir); tutar 2 ondalığa kırpılır; mutlu yol sent + hash
{
  const z = sahteZincir();
  const s = await kur({ chain: z });
  s.world.queuePayout(1, 'burn', ADRES(1), 0.99);
  s.world.queuePayout(1, 'burn', ADRES(1), 0);
  s.world.queuePayout(1, 'burn', ADRES(1), NaN);
  assert.equal(s.satirlar().length, 0, '1 altı / geçersiz tutar kuyruğa girmez');
  // 0,99 devredildi (eskiden sessizce kayboluyordu): sonraki ödemeye eklenir
  s.world.queuePayout(1, 'burn', ADRES(1), 12.3456);
  s.world.queuePayout(1, 'creator', ADRES(2), 500);
  assert.equal(s.satirlar()[0].amount, 13.33, '0,99 devri + 12,3456 = 13,3356 → 2 ondalığa KIRPILIR (yukarı yuvarlanmaz)');
  assert.ok(Math.abs(s.db.kvJson('world:payout:devir', {})['burn|' + ADRES(1)] - 0.0056) < 1e-9, 'kırpılan kırıntı da devredildi (0,0056)');
  const r = await s.world.processPayouts();
  assert.deepEqual(r, { sent: 2, failed: 0 });
  const k = s.satirlar();
  assert.deepEqual(k.map(x => x.status), ['sent', 'sent']);
  assert.deepEqual(k.map(x => x.tx_hash), ['0xhash1', '0xhash2']);
  assert.ok(k.every(x => x.sent_at > 0));
  assert.deepEqual(z.gonderilen.map(g => g.tutar), [13.33, 500]);
  assert.deepEqual(await s.world.processPayouts(), { sent: 0, failed: 0 }, 'gönderilenler bir daha gönderilmez');
  assert.equal(z.gonderilen.length, 2);
  ok('kuyruk: 1 altı yazılmaz ama devredilir, tutar kırpılır, gönderilen bir daha gönderilmez');
}

// 3) İmzadan ÖNCE hata: pending'e döner, hata yazılır, sonraki turda tekrar denenir
{
  const z = sahteZincir({ oncedenHata: no => no === 1 });
  const s = await kur({ chain: z });
  s.world.queuePayout(1, 'burn', ADRES(1), 50);
  assert.deepEqual(await s.world.processPayouts(), { sent: 0, failed: 1 });
  let k = s.satirlar()[0];
  assert.equal(k.status, 'pending');
  assert.match(k.error, /imzadan önce/);
  assert.equal(k.tx_hash, null);
  assert.deepEqual(await s.world.processPayouts(), { sent: 1, failed: 0 }, 'ikinci turda gider');
  assert.equal(s.satirlar()[0].status, 'sent');
  ok('imzadan önceki hata: pending\'e döner, sonraki turda gider');
}

// 4) İmzadan SONRA hata: "sending" kalır, TEKRAR GÖNDERİLMEZ (çift ödeme önlemi)
{
  const z = sahteZincir({ sonradanHata: no => no === 1 });
  const s = await kur({ chain: z });
  s.world.queuePayout(1, 'burn', ADRES(1), 50);
  assert.deepEqual(await s.world.processPayouts(), { sent: 0, failed: 1 });
  const k = s.satirlar()[0];
  assert.equal(k.status, 'sending', 'imzalanmış ödeme belirsiz: sending');
  assert.match(k.error, /Onay bekleniyor/);
  assert.equal(k.tx_hash, '0xhash1', 'imza kimliği kayıtlı (zincirden sorgulanabilir)');
  for (let i = 0; i < 3; i++) await s.world.processPayouts();
  assert.equal(z.gonderilen.length, 1, 'sending ödeme ASLA tekrar gönderilmez');
  ok('imzadan sonraki hata: sending kalır, tekrar gönderilmez (çift ödeme olmaz)');
}

// 5) İmzadan sonra "reverted" (zincir reddetti): güvenle yeniden kuyruğa
{
  const z = sahteZincir({ sonradanHata: no => no === 1, reverted: true });
  const s = await kur({ chain: z });
  s.world.queuePayout(1, 'burn', ADRES(1), 50);
  await s.world.processPayouts();
  assert.equal(s.satirlar()[0].status, 'pending', 'zincirin reddettiği işlem yeniden denenir');
  ok('zincirin reddettiği (reverted) işlem yeniden kuyruğa girer');
}

// 6) Haftalık gönderim sınırı yalnız çekimlere uygulanır; sınırı aşan çekim pending kalır
{
  const z = sahteZincir();
  const s = await kur({ chain: z, cfgEk: { weeklySendCapAda: 100 } });
  s.world.queuePayout(1, 'withdraw', ADRES(1), 60);
  s.world.queuePayout(1, 'withdraw', ADRES(2), 60);
  s.world.queuePayout(1, 'burn', ADRES(3), 1000);
  const r = await s.world.processPayouts();
  assert.deepEqual(r, { sent: 2, failed: 0 });
  const k = s.satirlar();
  assert.deepEqual(k.map(x => x.status), ['sent', 'pending', 'sent'], 'ikinci çekim sınırı aştı, yakım sınırdan etkilenmez');
  assert.match(k[1].error, /Haftalık güvenlik sınırı/);
  assert.equal(z.gonderilen.some(g => g.adres === ADRES(2)), false, 'sınırı aşan çekim zincire gitmedi');
  ok('haftalık sınır: çekimler sınırlanır, yakım/yapımcı payı etkilenmez');
}

// 7) Eşzamanlılık: bir tur sürerken ikincisi "busy"
{
  let birak;
  const kapi = new Promise(r => { birak = r; });
  const z = sahteZincir({ bekle: () => kapi });
  const s = await kur({ chain: z });
  s.world.queuePayout(1, 'burn', ADRES(1), 50);
  const ilk = s.world.processPayouts();
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(await s.world.processPayouts(), { skipped: 'busy' }, 'iki tur aynı anda çalışmaz');
  birak();
  assert.deepEqual(await ilk, { sent: 1, failed: 0 });
  assert.equal(z.gonderilen.length, 1);
  assert.deepEqual(await s.world.processPayouts(), { sent: 0, failed: 0 }, 'kilit turdan sonra açılır');
  ok('eşzamanlılık: aynı anda iki tur çalışmaz (busy), kilit sonra açılır');
}

// 8) Tur ortasında duraklatma: kalanlar gönderilmez
{
  let s;
  const z = sahteZincir({ bekle: no => { if (no === 1) s.world.setPaused(true); } });
  s = await kur({ chain: z });
  for (let i = 1; i <= 3; i++) s.world.queuePayout(1, 'burn', ADRES(i), 10);
  const r = await s.world.processPayouts();
  assert.deepEqual(r, { sent: 1, failed: 0 });
  assert.deepEqual(s.satirlar().map(x => x.status), ['sent', 'pending', 'pending'], 'duraklatma anında kalan ödemeler bekler');
  ok('tur ortasında duraklatma: kalan ödemeler gönderilmez');
}

// 9) reconcilePayouts: sending ödemeleri zincirden sonuçlandırır
{
  const durumlar = { '0xhash1': 'sent', '0xhash2': 'failed', '0xhash3': 'waiting', '0xhash4': 'patla' };
  const z = sahteZincir({ sonradanHata: () => true, kontrol: async ({ hash }) => { if (durumlar[hash] === 'patla') throw new Error('RPC yok'); return durumlar[hash]; } });
  const s = await kur({ chain: z });
  for (let i = 1; i <= 4; i++) s.world.queuePayout(1, 'burn', ADRES(i), 10);
  await s.world.processPayouts();   // dördü de imzalandı ve belirsiz: sending
  assert.deepEqual(s.satirlar().map(x => x.status), ['sending', 'sending', 'sending', 'sending']);
  s.db.raw.prepare("INSERT INTO payouts (epoch, kind, address, amount, status, created_at) VALUES (1, 'burn', ?, 5, 'sending', 0)").run(ADRES(9));   // imza kaydı olmayan
  const r = await s.world.reconcilePayouts();
  assert.deepEqual(r, { sent: 1, retry: 1, waiting: 2, unknown: 1 }, JSON.stringify(r));
  assert.deepEqual(s.satirlar().map(x => x.status), ['sent', 'pending', 'sending', 'sending', 'sending']);
  assert.match(s.satirlar()[1].error, /zincirde işlenmedi/);
  assert.deepEqual(await (await kur({ chain: null })).world.reconcilePayouts(), { skipped: true });
  ok('reconcile: işlenen sent, işlenmeyen yeniden kuyruğa, bekleyen/imzasız olduğu gibi');
}

console.log(`\n${passed}/9 ödeme kuyruğu testi geçti`);
