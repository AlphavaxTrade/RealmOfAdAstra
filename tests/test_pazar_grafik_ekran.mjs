// Pazar fiyat grafiği: sunucu rotası ve Al/Sat ekranındaki grafik kartı (19 Ekim 2026).
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import ilanRotalari from '../server/rotalar/ilan.js';

// ── Sunucu rotası ──
const db = openDb(':memory:');
const E = await createEngine(db);
const rota = ilanRotalari({ E, pazar: null, readBody: async () => ({}), pazarOp: async () => null })['GET /api/pazar/gecmis'];
assert.ok(rota, 'rota tanımlı olmalı');
E.ammMarket.recordPrices(Date.now(), true);
const ok = rota({ url: '/api/pazar/gecmis?kaynak=wood&aralik=7g' });
assert.equal(ok.key, 'wood'); assert.equal(ok.aralik, '7g');
assert.ok(ok.points.length >= 1 && ok.kapanis > 0, 'güncel fiyatla en az bir nokta');
assert.equal(rota({ url: '/api/pazar/gecmis?kaynak=wood&aralik=zararli' }).aralik, '24s', 'bilinmeyen aralık 24s olur');
assert.equal(rota({ url: '/api/pazar/gecmis?kaynak=yok' })[0], 404, 'bilinmeyen varlık 404');
assert.equal(rota({ url: '/api/pazar/gecmis' })[0], 404, 'varlık verilmezse 404');
console.log('✅ GET /api/pazar/gecmis: nokta döner, zararlı aralık ve bilinmeyen varlık güvenli');

// ── Ekran ──
const depo = new Map();
globalThis.localStorage = { getItem: k => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => { depo.set(k, String(v)); }, removeItem: k => { depo.delete(k); } };
await import('../js/ui/ekran/index.js');
const { ekranlar } = await import('../js/ui/ekran/cekirdek.js');
const pazar = ekranlar().find(e => e.id === 'pazar');
assert.ok(pazar, 'pazar ekranı kayıtlı olmalı');
const { GameStateManager } = await import('../js/gameState.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');

ammMarket.resetPools();
const gs = new GameStateManager();
let cagri = 0;
const b = { gameState: gs, GAME_CONFIG, globalPool, ammMarket, treasury, online: { active: false }, bildir() {}, hudYenile() {}, kilit: () => null };

// Tek oyunculu: geçmiş tarayıcıdaki pazardan, hemen çizilir
{
  const s = { bolum: 'alsat', kaynak: 'wood' };
  const html = pazar.govde(b, s);
  assert.ok(html.includes('Odun fiyat grafiği') || html.includes('fiyat grafiği'), 'grafik kartı görünmeli');
  assert.ok(html.includes('data-e="grafikAralik"'), 'aralık düğmeleri görünmeli');
  pazar.eylemler.grafikAralik(b, { dataset: { aralik: '7g' } }, s);
  assert.equal(s.grafikAralik, '7g');
  assert.ok(pazar.govde(b, s).includes('aria-selected="true" class="ek-sekme is-aktif" data-e="grafikAralik" data-aralik="7g"'), 'seçili aralık işaretlenmeli');
  console.log('✅ tek oyunculu pazar grafiği çiziliyor ve aralık değişiyor');
}

// Çevrimiçi: veri sunucudan gelir; gelene kadar "yükleniyor", sonra çizilir; hata mesajı
{
  const online = { ...b, online: { active: true }, pazar: { gecmis: async (k, a) => { cagri++; return { key: k, aralik: a, name: 'Odun', points: [[1, 2], [2, 3]], acilis: 2, kapanis: 3, enYuksek: 3, enDusuk: 2, degisimYuzde: 50 }; } } };
  const s = { bolum: 'alsat', kaynak: 'wood' };
  assert.ok(pazar.govde(online, s).includes('yükleniyor'), 'veri gelene kadar yükleniyor');
  await pazar.sonra(online, s);
  assert.equal(cagri, 1);
  const html = pazar.govde(online, s);
  assert.ok(html.includes('<svg') && !html.includes('yükleniyor'), 'veri gelince grafik çizilir');
  await pazar.sonra(online, s);
  assert.equal(cagri, 1, 'taze veri varken yeniden istenmez');
  const bozuk = { ...online, pazar: { gecmis: async () => { throw new Error('ağ yok'); } } };
  const s2 = { bolum: 'alsat', kaynak: 'stone' };
  await pazar.sonra(bozuk, s2);
  assert.ok(pazar.govde(bozuk, s2).includes('henüz fiyat geçmişi yok'), 'hata kullanıcıya sade mesajla gösterilir');
  console.log('✅ çevrimiçi pazar grafiği: yükleniyor → çizim, taze veri tekrar istenmiyor, hata sade');
}
