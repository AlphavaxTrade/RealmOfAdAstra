// Zindan modu ekranı (js/ui/ekran/zindanmod.js; 18 Ekim 2026): mevcut mod kartı, geçiş kartının üç durumu (kilitli / katkı bekliyor / hazır),
// katkı eylemleri ve en yüksek mod. Geçişin kendisi (onay penceresi tarayıcı gerektirir) tests/test_zindan_mod.mjs'te oyun kuralı olarak sınanır.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => { depo.set(k, String(v)); }, removeItem: (k) => { depo.delete(k); } };
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { globalPool } = await import('../js/globalPool.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { treasury } = await import('../js/treasury.js');
await import('../js/ui/ekran/index.js');
const { default: ekran } = await import('../js/ui/ekran/zindanmod.js');

let toplam = 0;
const ok = (ad) => { toplam++; console.log(`✅ ${ad}`); };
depo.clear(); ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
const gs = new GameStateManager();
gs.state.adAstraBalance = 1e9;
const bildirimler = [];
const b = { gameState: gs, GAME_CONFIG, globalPool, ammMarket, treasury, online: { active: false }, bildir: (m, t) => bildirimler.push([m, t]), hudYenile() {}, kilit: () => null };
const html = () => ekran.govde(b, {});
// verilen eylemin <button ...> açılış etiketi (yoksa null); düzenli ifade kullanmaz
const dugme = (h, e) => { const i = h.indexOf(`data-e="${e}"`); if (i < 0) return null; const bas = h.lastIndexOf('<button', i), son = h.indexOf('>', i); return bas < 0 || son < 0 ? null : h.slice(bas, son + 1); };
const el = (veri) => ({ dataset: veri });

// 1) Normal mod, son boss yenilmedi: mevcut mod kartı + kilitli geçiş kartı, katkı düğmesi yok
{
  const h = html();
  assert.match(h, /🟢 Normal mod/); assert.match(h, /mod 1\/4/);
  assert.match(h, /Sonraki mod: Zor/); assert.match(h, /son canavarını \(Sv\.18, Kıyamet Ejderhası\) yenmelisin/);
  assert.match(h, /ASTRA ödül çarpanı<\/span><b>×1<\/b>/); assert.match(h, /1\. kattasın/);
  assert.equal(dugme(h, 'katki'), null); assert.equal(dugme(h, 'gec'), null);
  assert.match(h, /Deneyim \(XP\) ödülü mod çarpanından etkilenmez/);
  ok('Normal mod, boss yenilmedi: mevcut mod kartı, kilitli geçiş kartı, katkı/geçiş düğmesi yok');
}

// 2) Son boss yenildi (ilerleme 19): hammadde ilerlemeleri, "Ver" düğmeleri, geçiş düğmesi pasif
{
  gs.state.dungeonProgress = 19;
  for (const k of GAME_CONFIG.RESOURCE_KEYS) gs.state.inventory[k] = 0;   // başlangıç envanteri boşaltılır
  const h = html();
  assert.match(h, /Tüm 6 kat bitti/);
  for (const ad of ['Odun', 'Demir', 'Kömür', 'Taş']) assert.ok(h.includes(ad), ad + ' çubuğu');
  assert.doesNotMatch(h, /Buğday/, 'Zor modun bedelinde buğday yok');
  assert.match(h, /geri dönmez/);
  assert.ok(dugme(h, 'katki'), 'Ver düğmesi');
  assert.match(dugme(h, 'gec'), /disabled/, 'hammadde tamamlanmadan geçiş düğmesi pasif');
  assert.match(dugme(h, 'katkiHepsi'), /disabled/, 'envanter boşken "hepsini ver" pasif');
  ok('boss yenildi: hammadde çubukları, Ver düğmeleri; hammadde bitmeden geçiş düğmesi pasif');
}

// 3) Katkı eylemleri: tek hammadde, sonra hepsi; geçiş hazır olunca düğme açılır
{
  gs.state.inventory.wood = 2000;
  const once = html();
  assert.doesNotMatch(dugme(once, 'katki'), /disabled/);
  const r = await ekran.eylemler.katki(b, el({ k: 'wood' }));
  assert.equal(r, undefined, 'yeniden çizim istenir');
  assert.equal(gs.state.dungeonGate.verilen.wood, 2000);
  assert.equal(bildirimler.at(-1)[1], 'success');
  assert.equal(await ekran.eylemler.katki(b, el({ k: 'bilinmeyen' })), false, 'bedelde olmayan hammadde yok sayılır');
  assert.equal(await ekran.eylemler.katki(b, el({ k: 'wood' })), undefined, 'envanter boş: sunucu/oyun reddeder, ekran yine yeniden çizilir');
  assert.equal(bildirimler.at(-1)[1], 'error');

  for (const k of ['wood', 'iron', 'coal', 'stone']) gs.state.inventory[k] = 1e7;
  assert.doesNotMatch(dugme(html(), 'katkiHepsi'), /disabled/);
  await ekran.eylemler.katkiHepsi(b);
  const h = html();
  assert.match(h, /tamam ✅/);
  assert.doesNotMatch(dugme(h, 'gec'), /disabled/, 'katkı tamam + ASTRA yeter: geçiş açılır');
  assert.equal(dugme(h, 'katki'), null, 'tamamlanan hammaddede Ver düğmesi kalmaz');
  assert.match(h, /Bakiyen yeter/);
  ok('katkı eylemleri: tek ve toplu; kalan ihtiyaçla sınırlı; tamamlanınca geçiş düğmesi açılır');
}

// 4) Geçiş şartı sağlanmadan "gec" eylemi hiçbir şey yapmaz (onay penceresi bile açılmaz)
{
  depo.clear(); const gs2 = new GameStateManager();   // kayıt deposu temizlenir: önceki oyuncunun durumu yüklenmesin
  const b2 = { ...b, gameState: gs2 };
  assert.equal(await ekran.eylemler.gec(b2), false);
  gs2.state.dungeonProgress = 19;
  assert.equal(await ekran.eylemler.gec(b2), false, 'hammadde yok');
  assert.equal(gs2.state.dungeonMode || 0, 0);
  ok('şartlar eksikken "moda geç" eylemi sessizce reddedilir');
}

// 5) ASTRA yetmezse: kart bunu söyler, geçiş düğmesi pasif kalır
{
  depo.clear(); const gs3 = new GameStateManager();   // kayıt deposu temizlenir: önceki oyuncunun durumu yüklenmesin
  gs3.state.dungeonProgress = 19;
  for (const k of ['wood', 'iron', 'coal', 'stone']) gs3.state.inventory[k] = 1e7;
  gs3.contributeToDungeonGate(Object.fromEntries(Object.entries(GAME_CONFIG.ZINDAN_MODLARI[1].gecis.hammadde)));
  gs3.state.adAstraBalance = 1;
  const h = ekran.govde({ ...b, gameState: gs3 }, {});
  assert.match(h, /Bakiyen yetmiyor/); assert.match(dugme(h, 'gec'), /disabled/);
  ok('ASTRA yetmiyorsa kart söyler ve geçiş düğmesi pasif kalır');
}

// 6) En yüksek mod
{
  depo.clear(); const gs4 = new GameStateManager();   // kayıt deposu temizlenir: önceki oyuncunun durumu yüklenmesin
  gs4.state.dungeonMode = 3; gs4.state.dungeonProgress = 19;
  const h = ekran.govde({ ...b, gameState: gs4 }, {});
  assert.match(h, /⚫ Cehennem mod/); assert.match(h, /en yüksek mod/); assert.match(h, /En yüksek moddasın/);
  assert.equal(dugme(h, 'gec'), null);
  ok('Cehennem: en yüksek mod kartı, geçiş yok');
}

console.log(`\n${toplam} zindan modu ekranı kontrolü geçti.`);
process.exit(0);
