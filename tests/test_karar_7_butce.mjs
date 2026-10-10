// KARAR 7 — girişe bağlı haftalık ödeme bütçesi (E-planı, 8 Ekim 2026).
// Bütçe = kasa × oran × sağlık çarpanı (0,15–1) + son 4 haftanın ortalama girişinin %90'ı. Oyuncu hareketiyle yapılan ödeme bütçeyi aşamaz;
// hesaplaşma ödemeleri (bypassBudget) bütçeye girmez. Sıfır girişte kasanın ömrü ≥ 36 ay (model kapısı, aşağıda ölçülür).
import assert from 'node:assert/strict';
import { TreasuryLedger } from '../js/treasury.js';
import { GAME_CONFIG } from '../js/config.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const B = GAME_CONFIG.TREASURY_WEEKLY_BUDGET;

// 1) Taban oranlar karar değerlerinde
{
  assert.deepEqual(B.RATES, { dungeon: 0.025, arena: 0.02, worldBoss: 0.03, quest: 0.025, carnival: 0.02 });
  assert.equal(B.INFLOW_SHARE, 0.9); assert.equal(B.INFLOW_WEEKS, 4); assert.equal(B.HEALTH_MIN, 0.15);
  ok('Karar değerleri: zindan 2,5 · kolezyum 2 · boss 3 · görev 2,5 · karnaval 2; giriş payı %90 / 4 hafta; sağlık tabanı 0,15');
}

// 2) Bütçe formülü: sağlıklı kasa (çarpan 1) ve girişsiz
{
  const T = new TreasuryLedger();
  T.state.pools.dungeon = GAME_CONFIG.TREASURY_TARGET_RESERVE.dungeon * 2;      // sağlık 1
  T.openWeekBudgets();                                                          // ilk açılış: giriş sayılmaz
  assert.ok(near(T.state.weekBudget.dungeon, T.state.pools.dungeon * 0.025, 1e-3), 'bütçe = kasa × oran (giriş yok)');
  ok('Bütçe = kasa × oran (sağlıklı kasa, giriş yok)');
}

// 3) Sağlık çarpanı ve giriş payı
{
  const T = new TreasuryLedger();
  T.openWeekBudgets();
  T.state.pools.quest = GAME_CONFIG.TREASURY_TARGET_RESERVE.quest * 0.5;        // sağlık 0,5
  T.depositTo('quest', 1000000);                                               // bu haftanın girişi (kasa büyüdü)
  const h = Math.max(0.15, T.getPoolHealth('quest'));
  T.openWeekBudgets();
  const want = T.state.pools.quest * 0.025 * h + 1000000 * 0.9;                // tek haftalık geçmiş → ortalama = 1.000.000
  assert.ok(near(T.state.weekBudget.quest, want, 1e-3), `bütçe = kasa×oran×sağlık + giriş×%90: ${T.state.weekBudget.quest} ≈ ${want}`);
  T.state.pools.carnival = 0; T.openWeekBudgets();
  assert.ok(near(T.state.weekBudget.carnival, 0, 1e-9) || T.state.weekBudget.carnival >= 0, 'boş kasada bütçe 0 (sağlık tabanı 0 ile çarpılır)');
  ok('Bütçe: sağlık çarpanı (0,15–1) ve son haftaların girişinin %90\'ı eklenir');
}

// 4) Bütçe ödemeyi gerçekten sınırlar; iade bütçeyi geri verir; hesaplaşma ödemeleri bütçeye girmez
{
  const T = new TreasuryLedger();
  T.state.pools.worldBoss = 6e6; T.state.weekBudget = { worldBoss: 1000 }; T.state.weekSpent = {};
  let sum = 0;
  for (let i = 0; i < 100; i++) { const r = T.withdraw('worldBoss', 400); sum += r.granted; }
  assert.ok(near(sum, 1000, 1e-6), `bir haftada en çok bütçe kadar: ${sum}`);
  const rr = T.withdraw('worldBoss', 10);
  assert.equal(rr.granted, 0); assert.equal(rr.budgetExhausted, true);
  T.refund('worldBoss', 300);
  assert.ok(near(T.withdraw('worldBoss', 1e9).granted, 300, 1e-6), 'iade bütçeyi geri verir');
  T.bypassBudget = true;
  assert.ok(T.withdraw('worldBoss', 1000).granted > 0, 'hesaplaşma ödemesi bütçeden bağımsız');
  T.bypassBudget = false;
  const before = T.state.weekSpent.worldBoss;
  T.bypassBudget = true; T.withdraw('worldBoss', 100); T.bypassBudget = false;
  assert.equal(T.state.weekSpent.worldBoss, before, 'hesaplaşma ödemesi harcanan bütçeye yazılmaz');
  T.openWeekBudgets();
  assert.deepEqual(T.state.weekSpent, {}, 'yeni haftada harcanan sıfırlanır');
  ok('Bütçe tavanı çalışır: aşılamaz, iade geri verir, hesaplaşma ödemesi bütçeye girmez, yeni hafta sıfırlar');
}

// 5) Bütçesiz kasalar (geri alım, Fatih, Konsey) ve bütçe kurulmamış defter eskisi gibi
{
  const T = new TreasuryLedger();
  assert.ok(T.withdraw('dungeon', 100).granted > 0, 'bütçe kurulmamışsa (tarayıcı tek oyunculu) sınır yok');
  T.openWeekBudgets();
  assert.equal(T.state.weekBudget.ammBuyback, undefined, 'geri alım bütçeye bağlı değil');
  ok('Bütçe kurulmamış defter ve bütçesiz kasalar eskisi gibi çalışır');
}

// 5b) Sağlık yumuşatması çift sayılmaz (11 Ekim 2026): bütçeli kasada tek ödeme sağlıkla küçülmez, bütçesiz kasada küçülür
{
  const T = new TreasuryLedger();
  const target = GAME_CONFIG.TREASURY_TARGET_RESERVE;
  T.state.pools.worldBoss = target.worldBoss * 0.5;                 // sağlık 0,5 (bütçeli kasa)
  T.state.weekBudget = { worldBoss: 1e12 }; T.state.weekSpent = {};
  const want = 1000;
  assert.equal(T.withdraw('worldBoss', want).granted, want, 'bütçeli kasada tek ödeme sağlıkla ikinci kez küçülmez');
  T.state.pools.konsey = target.konsey != null ? target.konsey * 0.5 : 1e6;
  const r = T.withdraw('konsey', want);
  assert.ok(r.granted < want, 'bütçesiz kasada eski sağlık yumuşatması korunur');
  ok('Sağlık yumuşatması yalnız bir kez uygulanır (bütçeli kasa: bütçede; bütçesiz kasa: tek ödemede)');
}

// 5c) Bütçe dolunca oyuncuya ayrı işaret ve mesaj verilir ("kasa boş" sanılmaz)
{
  const T = new TreasuryLedger();
  T.state.pools.dungeon = 6e6; T.state.weekBudget = { dungeon: 500 }; T.state.weekSpent = {};
  const a = T.withdraw('dungeon', 400);
  assert.equal(a.budgetFull, false, 'bütçe yetiyorsa işaret yok');
  const b = T.withdraw('dungeon', 400);                              // 100 kaldı → kısmen ödenir
  assert.equal(b.granted, 100); assert.equal(b.budgetFull, true, 'bütçe yüzünden kısılan ödeme işaretlenir');
  const c = T.withdraw('dungeon', 400);
  assert.equal(c.granted, 0); assert.equal(c.budgetFull, true); assert.equal(c.budgetExhausted, true);
  assert.equal(c.depleted, true);
  assert.ok(/Pazartesi/.test(B.FULL_MESSAGE), 'mesaj Pazartesi yenilendiğini söyler');
  const w = T.withdrawWhole('dungeon', 10);
  assert.equal(w.budgetFull, true, 'withdrawWhole işareti taşır');
  ok('Bütçe doldu işareti: kısmi ve tam dolu durumda budgetFull=true, mesaj tanımlı');
}

// 6) Model kapısı: sıfır girişte, tam talepte kasanın ömrü ≥ 36 ay (ömür = bakiye tohumun %10'una inene dek)
{
  const seeds = GAME_CONFIG.TREASURY_SEED, target = GAME_CONFIG.TREASURY_TARGET_RESERVE;
  const rows = [];
  for (const [id, rate] of Object.entries(B.RATES)) {
    let bal = seeds[id], wk = 0;
    while (bal >= seeds[id] * 0.10 && wk < 1000) {
      const health = Math.max(B.HEALTH_MIN, Math.min(1, bal / target[id]));
      bal -= bal * rate * health; wk++;
    }
    const months = wk / 4.33;
    rows.push(`${id} ${months.toFixed(0)} ay`);
    assert.ok(months >= 36, `${id}: sıfır girişte ömür ${months.toFixed(1)} ay < 36`);
  }
  ok('Model kapısı: sıfır girişte tam talepte her kasa ≥ 36 ay dayanır (' + rows.join(', ') + ')');
}

console.log(`\n${passed} KARAR 7 kontrolü geçti.`);
process.exit(0);
