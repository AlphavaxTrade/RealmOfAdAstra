// KARAR 6 (tek fiyat çarpanı k) — E-planı, 8 Ekim 2026 — ve AKIŞ DENGESİ (KARAR 5'in yerini aldı, kullanıcı kuralı 15 Ekim 2026).
//  k = son günlerin fiyatı / 30 günlük zirve, 0,5–1,5; kilit açılma tabanına (haftalık %1 × k) ve çekim tavanına (× k) uygulanır.
//  Çekim tavanı = en küçüğü(0,5 × trade alımı, 0,5 × net piyasa alımı (kendi çıkışımız geri eklenmiş), fiyat kuralı × k); TABAN YOK.
//  (KARAR 5'te tavan = en büyüğü(fiyat kuralının %20'si, en küçüğü(fiyat kuralı × k, 4 haftalık TOPLAM dış alımın %50'si)) idi: alım
//  yokken de çıkış vardı ve haftalık alımın 2 katına kadar çıkış olabiliyordu. Kullanıcı: "oyundan çıkan, trade alımını hiçbir zaman geçmesin".)
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { loadConfig } from '../server/config.js';
import { priceFactorK, ekosistemCikisTavani, haftalikOlcu, netTokenFlow, WEEKLY_RULES } from '../server/economy.js';
import { gameState } from '../js/gameState.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const DAY = 86400000;

// 1) k: sınırlar ve veri yokluğu
{
  assert.equal(priceFactorK({ cur: 80, peak: 100 }), 0.8);
  assert.equal(priceFactorK({ cur: 10, peak: 100 }), 0.5, 'alt sınır 0,5');
  assert.equal(priceFactorK({ cur: 300, peak: 100 }), 1.5, 'üst sınır 1,5');
  assert.equal(priceFactorK({}), 1, 'veri yoksa 1');
  assert.equal(priceFactorK({ cur: 5, peak: 0 }), 1);
  ok('k: cur/peak oranı 0,5–1,5 aralığına sıkıştırılır; veri yoksa 1');
}

// 2) Akış dengesi tavanı
{
  const bol = [1e12, 1e12, 1e12, 1e12];
  assert.equal(ekosistemCikisTavani({ tb: [0, 0, 0, 0], na: bol, fiyatEtkisiTavani: 1000 }), 0, 'trade alımı yok: çıkış yok (taban yok)');
  assert.equal(ekosistemCikisTavani({ tb: bol, na: [0, 0, 0, 0], fiyatEtkisiTavani: 1000 }), 0, 'net piyasa alımı yok: çıkış yok');
  assert.equal(ekosistemCikisTavani({ tb: [600, 600, 600, 600], na: bol, fiyatEtkisiTavani: 1000 }), 300, 'trade alımının yarısı');
  assert.equal(ekosistemCikisTavani({ tb: bol, na: [400, 400, 400, 400], fiyatEtkisiTavani: 1000 }), 200, 'net piyasa alımının yarısı');
  assert.equal(ekosistemCikisTavani({ tb: bol, na: bol, fiyatEtkisiTavani: 1000, k: 1 }), 1000, 'alım çok: fiyat kuralı (%2)');
  assert.equal(ekosistemCikisTavani({ tb: bol, na: bol, fiyatEtkisiTavani: 1000, k: 0.5 }), 500, 'k fiyat kuralını ölçekler');
  assert.equal(ekosistemCikisTavani({ tb: bol, na: bol, fiyatEtkisiTavani: 1000, gonderimTavani: 7 }), 7, 'haftalık gönderim sınırı');
  // Ölçü: son 4 haftanın ortalaması ile son haftanın küçüğü; eksik haftalar sıfır sayılır
  assert.equal(haftalikOlcu([400, 400, 400, 400]), 400);
  assert.equal(haftalikOlcu([400, 400, 400, 0]), 0, 'trade bu hafta durdu: ortalama beklenmez');
  assert.equal(haftalikOlcu([0, 0, 0, 400]), 100, 'ani artış: 4 haftalık ortalama (2 katı çıkış olmaz)');
  assert.equal(haftalikOlcu([800]), 200, 'tek haftalık veri: eksik haftalar 0 (temkinli)');
  assert.equal(haftalikOlcu([-50, -50, -50, -50]), 0, 'eksi olmaz');
  assert.equal(WEEKLY_RULES.exitTradeShare, 0.5);
  ok('Akış dengesi: çıkış ≤ trade alımının yarısı ve ≤ net piyasa alımının yarısı; taban yok; ani artış/düşüşte temkinli ölçü');
}

// 3) Net token akışı
{
  const eg = (s) => ({ graduated: false, curveSupply: s });
  assert.equal(netTokenFlow(eg(100), eg(160)), 60, 'eğride arz artışı = net alım');
  assert.equal(netTokenFlow(eg(160), eg(100)), -60, 'satım negatif');
  const dx = (r) => ({ graduated: true, poolTokenReserve: r });
  assert.equal(netTokenFlow(dx(1000), dx(900)), 100, 'havuzdan token çıkması = alım');
  assert.equal(netTokenFlow(eg(100), dx(900)), 0, 'geçiş anı ölçülmez');
  assert.equal(netTokenFlow(null, eg(1)), 0);
  ok('netTokenFlow: eğri ve havuz için alım +, satım −; geçişte ve ilk ölçümde 0');
}

// 4) Dünya: günlük akış kutuları, haftalık pencereler, ortak gelir = trade alımının %40'ı, kendi çıkışımız geri eklenir, canlı tavan
{
  const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true, weeklySendCapAda: 1e12 };
  const db = openDb(':memory:');
  const engine = await createEngine(db, { testMode: true });
  let T = Date.UTC(2026, 9, 8, 12);
  const clock = () => T;
  let supply = 1e9, price = 1e-7;
  const chain = {
    gameWallet: '0x' + '11'.repeat(20), canSend: true,
    async readMarket() { return { at: T, graduated: false, supply, dead: 0, curveSupply: supply, priceAvax: price / 10, avaxUsd: 10, priceUsd: price, mcapUsd: price * supply, walletAda: 1e12 }; },
    async latestBlock() { return 1; }
  };
  const world = createWorld({ db, engine, chain, cfg, clock, log: { warn() {}, error() {} } });
  const ortakGelir = (miktar, at) => db.raw.prepare('INSERT INTO partner_income (tx_hash, log_index, sender, amount, block, at) VALUES (?, ?, ?, ?, ?, ?)').run('0x' + at.toString(16), 0, '0xbb', miktar, 1, at);

  await world.snapshotMarket();                       // ilk ölçüm: akış 0
  assert.equal(world.currentCap(), 0, 'alım yok: çıkış yok (eski kuralda %20 taban vardı)');

  T += 2 * DAY; supply += 4e6;                        // 4 milyon token net piyasa alımı, trade alımı yok
  await world.snapshotMarket();
  assert.equal(world.akisSerileri().netAlim, 1e6, 'net alım ölçüldü (4 haftalık ortalama: 4 M ÷ 4)');
  assert.equal(world.currentCap(), 0, 'trade alımı olmadan piyasa alımı tek başına çıkış açmaz');

  ortakGelir(1e6, T);                                 // trade sitesinden oyuna 1 M (= trade alımı 2,5 M)
  const a = world.akisSerileri();
  assert.ok(near(a.tb[a.tb.length - 1], 2.5e6, 1), 'trade alımı = ortak gelir ÷ 0,40');
  assert.ok(near(a.tradeAlimi, 2.5e6 / 4, 1), 'ölçü: 4 haftalık ortalama (2,5 M ÷ 4) ile son haftanın küçüğü');
  assert.ok(near(world.currentCap(), 0.5 * 2.5e6 / 4, 1), `tavan = trade alımı ölçüsünün yarısı: ${world.currentCap()}`);

  // Kendi çıkışımız (çekim + yapımcı payı) net alıma geri eklenir: oyuncu çektiğini satınca kapı kendini kısmaz
  db.q.payoutAdd.run(1, 'withdraw', '0x' + '22'.repeat(20), 3e6, T);
  supply -= 3e6; T += 1000; await world.snapshotMarket();
  assert.equal(world.akisSerileri().netAlim, 1e6, 'çekilip satılan 3 M net alımı düşürmez (geri eklendi)');

  T += 30 * DAY;                                      // haftalık pencerelerin dışına çıktı
  assert.equal(world.currentCap(), 0, '28 günden eski alım ve ortak gelir sayılmaz');

  ortakGelir(1e6, T); supply -= 3e6; T += DAY;        // trade alımı var ama piyasada net satış: ikinci bekçi kapıyı kapatır
  await world.snapshotMarket();
  assert.equal(world.currentCap(), 0, 'net piyasa satışı varken çıkış yok');
  ok('Dünya: haftalık pencereler, ortak gelir ÷ 0,40, kendi çıkışımız geri eklenir, taban yok, net satışta kapı kapanır');

  // k: fiyat zirveden düşünce (fiyata bakar; piyasa değeri yakımla düşüyordu)
  price = 1e-7; T += DAY; await world.snapshotMarket();
  price = 6e-8; T += DAY; await world.snapshotMarket();
  const k = world.econ().k;
  assert.ok(k >= 0.5 && k < 1, `fiyat düşünce k 1'in altında: ${k}`);
  ok(`Dünya: fiyat zirvenin altına inince k = ${k}`);
}

// 5) Kilit açılma tabanı k ile ölçeklenir; giriş günü primi sabit
{
  const run = k => {
    gameState.vanillaReset();
    gameState.state.adAstraBalance = 100000; gameState.state.lockedAda = 100000;
    gameState.state.unlockK = k;
    gameState._calendarNow = () => 1e12;
    gameState.state.lockUnlock = { lastAt: 1e12 - 7 * DAY, activeDay: new Date(1e12 + 3 * 3600 * 1000).toISOString().slice(0, 10) };   // bugünkü giriş primi zaten işlendi
    gameState.processLockedUnlock();
    return 100000 - gameState.state.lockedAda;       // bu hafta açılan miktar
  };
  const k1 = run(1), k05 = run(0.5);
  assert.ok(near(k1, 1000, 1), `k=1: haftalık %1 açılır (${k1})`);
  assert.ok(near(k05, 500, 1), `k=0,5: haftalık %0,5 açılır (${k05})`);
  const f = (() => { gameState.state.unlockK = 0.5; return gameState.getLockedUnlockForecast(); })();
  assert.ok(near(f.weeklyBasePct, 0.5, 1e-9) && near(f.weeklyActivePct, 1.4, 1e-9), 'tahmin ekranı: taban ×k, giriş primi %1,4 sabit');
  ok('Kilit açılma: taban haftalık %1 × k; giriş günü primi (%1,4) k\'den etkilenmez');
}

console.log(`\n${passed} KARAR 5/6 kontrolü geçti.`);
process.exit(0);
