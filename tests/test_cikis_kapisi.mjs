// Akış dengesi ve Ödeme Kadranı (kullanıcı kuralı 15 Ekim 2026; docs/v2/MAKRO_EKONOMI_PLANI.md, server/economy.js):
//   1) Ödeme Kadranı saf kuralı: ısınma, kök, sınırlar, haftalık adım, kasa koruması
//   2) Haftalık hesaplaşma: trade alımı yokken çekim de yapımcı payı da çıkmaz (talep bakiyeye döner, yapımcı payı devreder)
//   3) Trade alımı ve net piyasa alımı olunca zarf açılır: önce yapımcı payı, kalan oyunculara; zarf ikisinin yarısını geçmez
//   4) Kadran fiyat geçmişinden hesaplanır ve kasaların haftalık bütçesini çarpar (giriş payını çarpmaz)
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { loadConfig } from '../server/config.js';
import { odemeKadrani, oyunIciEndeks, etkinCarpan, WEEKLY_RULES as R } from '../server/economy.js';

let toplam = 0;
const ok = ad => { toplam++; console.log(`✅ ${ad}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const DAY = 86400000;

// 1) Kadran
{
  const v = { kisaOrt: 2, uzunOrt: 1, veriGun: 91 };
  assert.equal(odemeKadrani({ ...v, veriGun: R.kadranWarmupDays - 1 }), 1, 'ilk 28 gün: 1');
  assert.equal(odemeKadrani({ ...v, onceki: 1 }), 1.05, 'yükselişte haftada en çok %5');
  assert.equal(odemeKadrani({ kisaOrt: 0.5, uzunOrt: 1, veriGun: 91, onceki: 1 }), 0.95, 'düşüşte haftada en çok %5');
  assert.equal(odemeKadrani({ kisaOrt: 1.3, uzunOrt: 1, veriGun: 91, onceki: 1.14 }), Math.round(Math.sqrt(1.3) * 1e4) / 1e4, 'hedef = oranın karekökü');
  assert.equal(odemeKadrani({ kisaOrt: 100, uzunOrt: 1, veriGun: 91, onceki: 1.5 }), 1.5, 'tavan 1,5');
  assert.equal(odemeKadrani({ kisaOrt: 0.01, uzunOrt: 1, veriGun: 91, onceki: 0.6 }), 0.6, 'taban 0,6');
  assert.equal(odemeKadrani({ kisaOrt: 2, uzunOrt: 1, veriGun: 91, onceki: 1.2, kasaSagligi: 0.4 }), 1.14, 'kasa sağlığı < 0,5: hedef en çok 1 (haftada %5 iner)');
  assert.equal(odemeKadrani({ kisaOrt: 2, uzunOrt: 1, veriGun: 91, onceki: 0.8, kasaSagligi: 0.2 }), 0.8, 'kasa sağlığı < 0,25: en çok 0,8');
  ok('Ödeme Kadranı: ısınma, karekök hedef, 0,6-1,5, haftada ±%5, kasa koruması');
}

// Dünya kurulumu: sahte zincir, 1 oyuncu (cüzdanı kendi adresi), katkı puanı var
const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true, weeklySendCapAda: 1e12, minWithdrawAda: 100 };
const db = openDb(':memory:');
const E = await createEngine(db, { testMode: true });
let T = Date.UTC(2026, 9, 12, 12);
const clock = () => T;
let supply = 1e9, price = 1e-7;
const chain = {
  gameWallet: '0x' + '11'.repeat(20), canSend: true,
  async readMarket() { return { at: T, graduated: false, supply, dead: 0, curveSupply: supply, priceAvax: price / 10, avaxUsd: 10, priceUsd: price, mcapUsd: price * supply, walletAda: 1e12 }; },
  async latestBlock() { return 1; }
};
const world = createWorld({ db, engine: E, chain, cfg, clock, log: { warn() {}, error() {} } });
const P = '0x' + 'aa'.repeat(20);
db.q.playerAdd.run(P, T, T);
const hazirla = (epoch, istek) => {
  E.mutatePlayer(P, gs => {
    gs.state.adAstraBalance = 1e6; gs.state.lockedAda = 0; gs.state.level = 5;
    gs.state.contribution = { total: 10, week: 10, lastWeek: 0, epochId: epoch, buyCredit: {} };
  });
  const r = world.requestWithdraw(P, istek);
  assert.ok(r.success, r.message);
};
const cikislar = kind => db.raw.prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM payouts WHERE kind = ?').get(kind).t;
E.globalPool.state.creatorRoyaltyTotal = 500; E.globalPool.saveState();   // ödenmeyi bekleyen yapımcı payı

// 2) Trade alımı yok: çıkış yok
{
  await world.snapshotMarket();
  const ep = E.globalPool.state.epochId;
  hazirla(ep, 10000);
  const s = world.settleWeek(ep, world.econ().market);
  assert.equal(s.withdraw.zarf, 0, 'zarf 0');
  assert.equal(s.creator, 0, 'yapımcı payı ödenmedi');
  assert.equal(s.creatorDeferred, 500, 'yapımcı payı devretti');
  assert.equal(cikislar('withdraw') + cikislar('creator'), 0, 'zincire çıkış kuyruğu yok');
  const st = E.readPlayer(P);
  assert.equal(st.pendingWithdrawAda, 0);
  assert.ok(near(st.adAstraBalance, 1e6 + s.faucet.totalAda, 0.01), 'talep bakiyeye döndü (+ aynı hesaplaşmadaki ücretsiz oyuncu payı)');
  assert.equal(world.econ().settled.creator, 0, 'yapımcı payı ödenmiş sayılmadı');
  ok('Trade alımı yokken çekim ve yapımcı payı çıkmaz; talep bakiyeye döner, yapımcı payı devreder');
}

// 3) Trade alımı + net piyasa alımı: zarf açılır, önce yapımcı payı
{
  T += 2 * DAY; supply += 1e7; await world.snapshotMarket();          // müşteriler piyasadan 10 M ASTRA aldı
  db.raw.prepare('INSERT INTO partner_income (tx_hash, log_index, sender, amount, block, at) VALUES (?, ?, ?, ?, ?, ?)').run('0xt1', 0, '0xbb', 4e6, 1, T);   // %40'ı oyuna
  const ep = E.globalPool.state.epochId + 1;
  hazirla(ep, 10000);
  const beklenenZarf = Math.min(0.5 * (4e6 / R.tradeGameShare) / R.flowWeeks, 0.5 * 1e7 / R.flowWeeks);
  const s = world.settleWeek(ep, world.econ().market);
  assert.ok(near(s.withdraw.zarf, beklenenZarf, 1), `zarf = trade alımı ve net alım ölçülerinin yarısının küçüğü: ${s.withdraw.zarf} ≈ ${beklenenZarf}`);
  assert.equal(s.creator, 500, 'önce yapımcı payı');
  assert.ok(near(s.withdraw.cap, beklenenZarf - 500, 1), 'oyunculara kalan = zarf − yapımcı payı');
  assert.equal(s.withdraw.sent > 0 && s.withdraw.requested, 10000, 'oyuncu talebi karşılandı');
  assert.ok(near(cikislar('creator'), 500, 0.01) && cikislar('withdraw') > 0, 'zincir kuyruğunda yapımcı ve çekim');
  assert.equal(world.econ().settled.creator, 500);
  assert.ok(s.withdraw.zarf <= 0.5 * s.withdraw.tradeAlimi + 1e-6 && s.withdraw.zarf <= 0.5 * s.withdraw.netAlim + 1e-6, 'zarf ≤ ölçülerin yarısı');
  ok('Trade alımı ve net piyasa alımı olunca zarf açılır: önce yapımcı payı, kalanı oyunculara; zarf ölçülerin yarısını geçmez');
}

// 4) Kadran: 91 günlük yükselen fiyat geçmişi → gelecek haftanın kasa bütçesi büyür
{
  const TB = E.GAME_CONFIG.TREASURY_WEEKLY_BUDGET;
  const kasa = E.treasury;
  // Saf karşılaştırma: aynı kasa ve giriş geçmişiyle kadran 1 ve 1,2
  const kopya = JSON.parse(JSON.stringify({ mark: kasa.state.inflowMark, hist: kasa.state.inflowHistory, inflow: kasa.state.inflow }));
  const ac = kd => { kasa.state.inflowMark = JSON.parse(JSON.stringify(kopya.mark)); kasa.state.inflowHistory = JSON.parse(JSON.stringify(kopya.hist)); kasa.state.inflow = JSON.parse(JSON.stringify(kopya.inflow)); return kasa.openWeekBudgets({ aktif: 10, kadran: kd }); };
  const b1 = ac(1), b12 = ac(1.2);
  const saglik = Math.max(TB.HEALTH_MIN, kasa.getPoolHealth('dungeon'));
  assert.ok(near(b12.dungeon - b1.dungeon, kasa.state.pools.dungeon * TB.RATES.dungeon * saglik * 0.2, 1e-6), 'kadran yalnız kasa × oran kısmını çarpar');

  // Fiyat geçmişi: 84 gün 1e-7, son 7 gün 2e-7 → hedef √(2 / 1,08) > 1,05; tek haftada en çok 1,05
  const bas = T - 91 * DAY;
  for (let g = 0; g <= 91; g++) { const at = bas + g * DAY; const p = at >= T - 7 * DAY ? 2e-7 : 1e-7; db.q.priceAdd.run(at, p, p * supply, supply, 0, 10, 0); }
  const ep = E.globalPool.state.epochId + 2;
  hazirla(ep, 100);
  const s = world.settleWeek(ep, world.econ().market);
  assert.equal(s.kadran, 1.05, `kadran yükselişte haftada %5 artar: ${s.kadran}`);
  assert.equal(world.econ().kadran, 1.05, 'kadran saklandı');
  ok('Kadran fiyat geçmişinden hesaplanır, saklanır ve kasa bütçesinin kasa × oran kısmını çarpar');
}

// 5) Oyun İçi Fiyat Endeksi (makro plan B1): dağıtım tasarımın üstüne çıkınca bedel çarpanı yükselir
{
  const tas = 8082;
  assert.equal(oyunIciEndeks({ kisiBasiSeri: [], tasarimKisi: tas, onceki: 2 }), 2, 'veri yoksa önceki değer');
  assert.equal(oyunIciEndeks({ kisiBasiSeri: [tas * 10], tasarimKisi: tas, onceki: 1 }), 1.25, 'yükselişte haftada en çok %25');
  assert.equal(oyunIciEndeks({ kisiBasiSeri: [0], tasarimKisi: tas, onceki: 1 }), 0.95, 'düşüşte haftada en çok %5');
  assert.equal(oyunIciEndeks({ kisiBasiSeri: [tas * 3, tas * 3, tas * 3, tas * 3], tasarimKisi: tas, onceki: 2.9 }), 3, 'hedef = son 4 haftanın kişi başı dağıtımı ÷ tasarım');
  assert.equal(etkinCarpan({ priceMultiplier: 0.3, oyunEndeksi: 2 }), 2, 'bol ASTRA: endeks');
  assert.equal(etkinCarpan({ priceMultiplier: 1.8, oyunEndeksi: 1.1 }), 1.8, 'fiyat düşünce dolar tabanı');
  assert.equal(etkinCarpan({}), 1);
  const tasarim = Object.keys(E.GAME_CONFIG.TREASURY_WEEKLY_BUDGET.RATES).reduce((s, id) => s + E.GAME_CONFIG.TREASURY_SEED[id] * E.GAME_CONFIG.TREASURY_WEEKLY_BUDGET.RATES[id], 0) / E.GAME_CONFIG.KAPI.START_LIMIT;
  assert.equal(tasarim, tas, 'tasarım payı: tohum kasaların haftalık oranıyla 100 vatandaşa ~8.082 ASTRA (karnaval kasası parça havuzu artığıyla 4,91 M)');

  // Dünya: bol dağıtım haftası → endeks %25 artar, oyuncunun bedel çarpanı en büyüğü(fiyat çarpanı, endeks) olur
  const once = Number(world.econ().oyunEndeksi) || 1;
  E.treasury.state.weekSpent = { ...(E.treasury.state.weekSpent || {}), dungeon: 1e9 };
  const ep = E.globalPool.state.epochId + 3;
  hazirla(ep, 100);
  const s = world.settleWeek(ep, world.econ().market);
  assert.equal(s.oyunEndeksi, Math.round(once * 1.25 * 1e4) / 1e4, `endeks haftada %25 yükseldi: ${once} → ${s.oyunEndeksi}`);
  const { result: m } = E.withPlayer(P, gs => gs.getAdaPriceMultiplier());
  assert.equal(m, Math.max(world.econ().priceMultiplier || 1, s.oyunEndeksi), 'oyuncunun bedel çarpanı = en büyüğü(fiyat çarpanı, endeks)');
  ok(`Oyun İçi Fiyat Endeksi: dağıtım tasarımı aşınca haftada en çok %25 yükselir (${once} → ${s.oyunEndeksi}); bedel çarpanı en büyüğü`);
}

db.close();
console.log(`\n${toplam} akış dengesi / kadran / endeks kontrolü geçti.`);
process.exit(0);
