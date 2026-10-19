// Bot ve Üretim Hakkı (19 Ekim 2026): hiçbir kaynaktan çıkarma hakkı kalmadıysa bot boşuna çalışmaz, satın alınan süre donar;
// hak açılınca kalan süreyle devam eder. Ücret tablosu "hak bitti" notunu verir. Ayrıca Konsey katkı geçmişi kaydedilir.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => { depo.set(k, String(v)); }, removeItem: (k) => { depo.delete(k); } };
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');

let n = 0;
const ok = (ad) => { n++; console.log(`✅ ${ad}`); };
const yeni = () => {
  depo.clear(); ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
  const gs = new GameStateManager();
  gs.state.warehouseLevel = gs.getWarehouseMaxLevel();
  gs.state.adAstraBalance = 100000;
  for (const k of GAME_CONFIG.RESOURCE_KEYS) gs.state.inventory[k] = 5000;
  return gs;
};

// 1) Hak yokken bot durur, süre donar; hak gelince kalan süreyle devam eder
{
  const gs = yeni();
  let t = Date.now();
  gs._now = () => t;
  const gercek = gs.getUretimHakki.bind(gs);
  gs.buyTavernaAutomationBot(true, 2);   // 2 saatlik süre
  assert.equal(gs.isBotPaused(), false, 'hak varken bot çalışır');

  gs.getUretimHakki = (k) => ({ ...gercek(k), canTake: 0 });
  gs.updateBotPauseState();
  assert.equal(gs.isBotPaused(), true, 'hak bitince bot durur');
  assert.equal(gs.state.botPauseReason, 'hak');
  const donmus = gs.state.botPausedRemainingMs;
  assert.ok(donmus > 0 && donmus <= 2 * 3600 * 1000, 'kalan süre dondurulur');

  t += 90 * 60 * 1000;   // 90 dakika geçti
  gs.updateBotPauseState();
  assert.equal(gs.state.botPausedRemainingMs, donmus, 'duraklamada süre azalmaz');
  assert.equal(gs.getAutoCollectorRemainingSeconds(), Math.floor(donmus / 1000));

  gs.getUretimHakki = gercek;   // yeni hak açıldı
  gs.updateBotPauseState();
  assert.equal(gs.isBotPaused(), false, 'hak açılınca bot uyanır');
  assert.ok(Math.abs(gs.state.botActiveUntil - (t + donmus)) < 5000, 'kalan süreyle devam eder');
  ok('bot: hak bitince durur ve süre donar, hak açılınca kalan süreyle devam eder');
}

// 2) Ücret tablosu: hak yokken not için bayrak
{
  const gs = yeni();
  const gercek = gs.getUretimHakki.bind(gs);
  gs.getUretimHakki = (k) => ({ ...gercek(k), canTake: 0, weekly: 0, used: 0, extra: 0 });
  const h = gs.calculateTavernaBotProfitAndCost();
  assert.equal(h.rightsExhausted, true, 'hak yok bayrağı');
  assert.ok(h.botCostAda <= 1.0001, 'ücret en düşük tutarda');
  gs.getUretimHakki = gercek;
  assert.equal(gs.calculateTavernaBotProfitAndCost().rightsExhausted, false, 'hak varken bayrak kapalı');
  ok('ücret tablosu: hak bitince bayrak açılır');
}

// 3) Konsey katkı geçmişi: hızlı katkı tek kayıt yazar (tur başına değil), puan ve ilerleme dolu
{
  const gs = yeni();
  gs.state.adAstraBalance = 1e6;
  const r = gs.konseyHizliKatki('otorite', 2000);
  assert.equal(r.success, true, r.message);
  const son = gs.getContributionStanding().son;
  assert.equal(son.length, 1, 'tek hızlı katkı = tek kayıt');
  assert.equal(son[0].hedef, 'Madencilik Otoritesi');
  assert.ok(son[0].puan > 400 && son[0].astra > 1500, `puan ve ASTRA yazıldı (${son[0].puan}, ${son[0].astra})`);
  assert.ok(son[0].ilerleme > 0, 'hedef ilerlemesi yazıldı');
  gs.state.inventory.stone = 1000;
  gs.contributeToOtorite({ stone: 500 });
  assert.equal(gs.getContributionStanding().son.length, 2, 'elle katkı da kayda geçer');
  assert.ok(gs.getContributionStanding().son[0].puan > 0);
  ok('Konsey: katkı geçmişi (hızlı ve elle) kaydedilir');
}

console.log(`\n${n} bot hak bekleme / katkı geçmişi kontrolü geçti.`);
