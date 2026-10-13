// 14 Ekim 2026 denetimi, ikinci tur (ekonomi): ekonomi turundan açık kalanlar.
//   1) Kolezyum lig `weeklyAda` / `weeklyKeys` alanları ölüydü: kaldırıldı, haftalık ödül yolu yalnız PvP ilk-10.
//   2) Kişi payı tavanı aktif sayısı bilinmeyen / az olan haftada uygulanmıyor ya da bütçeyi aşıyordu: payda tabana (10) iner.
//   3) Haftalık özet kotası tabana inen hammaddeleri bildirir (izleme: Sv.20+ taş/kömür/şifalı ot kabul edilmiş düşük talebi).
// Gerekçe ve ölçüm: docs/v2/TARAMA_2026-10.md "14 Ekim 2026 ikinci tur", docs/v2/KARARLAR_KESIN.md bölüm O.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GAME_CONFIG } = await import('../js/config.js');
const { TreasuryLedger } = await import('../js/treasury.js');
const { GameStateManager } = await import('../js/gameState.js');

let gecen = 0;
const ok = (ad) => { gecen++; console.log(`✅ ${ad}`); };
const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ═══ 1) Lig ödülü: ölü alanlar kaldırıldı, hiçbir kod okumuyor ═══
{
  for (const lig of GAME_CONFIG.COLOSSEUM.LEAGUES) {
    assert.ok(!('weeklyAda' in lig) && !('weeklyKeys' in lig), `${lig.id}: ölü haftalık lig ödülü alanı kalmamalı`);
    assert.ok(lig.rewardMult >= 1 && lig.minRating >= 0, `${lig.id}: lig yalnız maç ödülü çarpanı ve puan eşiği taşır`);
  }
  // js/ ve server/ içinde bu adlarla bir okuma/yazma kalmadı (dünya bossunun weeklyAdaPool'u başka bir şey)
  const tara = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'node_modules' ? [] : tara(p);
    return /\.(js|mjs)$/.test(d.name) ? [p] : [];
  });
  const kalan = [];
  for (const d of ['js', 'server']) for (const f of tara(path.join(kok, d))) {
    const t = fs.readFileSync(f, 'utf8').split(String.fromCharCode(10)).map((satir) => satir.split('//')[0]).join(' ');   // yorumlar sayılmaz
    if (/weeklyKeys|weeklyAda(?!Pool)/.test(t)) kalan.push(path.relative(kok, f));
  }
  assert.deepEqual(kalan, [], 'weeklyAda / weeklyKeys hiçbir yerde kullanılmıyor');
  // Haftalık ödül yolu: yalnız PvP ilk 10 (kasanın weeklyPoolShare'i); tek bir hazır-rakip galibiyeti lige göre haftalık maaş getirmez
  const { PVP_RULES, weeklyRewards } = await import('../js/economy/pvp.js');
  assert.equal(PVP_RULES.weeklyPoolShare, GAME_CONFIG.TREASURY_WEEKLY_PAYOUT.arena);
  const tablo = {};
  for (let i = 0; i < 25; i++) tablo['a' + i] = { points: 100 - i, name: 'o' + i };
  const odul = weeklyRewards(tablo, 1e6);
  assert.equal(odul.filter((r) => r.amount > 0).length, 10, 'yalnız ilk 10 ödül alır');
  assert.ok(odul.reduce((t, r) => t + r.amount, 0) <= 1e6 * PVP_RULES.weeklyPoolShare + 1e-6, 'toplam kasanın haftalık payını geçmez');
  ok('kolezyum lig: weeklyAda/weeklyKeys kaldırıldı (kod okumuyor); haftalık ödül yalnız PvP ilk-10');
}

// ═══ 2) Kişi payı tavanı: aktif sayısı yokken ya da azken ═══
{
  const B = GAME_CONFIG.TREASURY_WEEKLY_BUDGET;
  assert.equal(B.PERSON_CAP_MIN_ACTIVE, 10);
  const k = B.PERSON_CAP_MULT;
  const yeniKasa = () => { depo.clear(); const t = new TreasuryLedger(); t.reset(); return t; };
  const butce = (t, n) => { t.state.weekBudget.dungeon = n; };

  // a) aktif sayısı hiç verilmedi (sunucunun ilk açılışı): tavan sonsuz değil, bütçenin k/10'u
  let t = yeniKasa();
  t.openWeekBudgets();
  butce(t, 1000);
  assert.ok(Number.isFinite(t.getPersonWeekCap('dungeon')), 'ilk hafta tavan uygulanıyor (eskiden Infinity)');
  assert.equal(t.getPersonWeekCap('dungeon'), 1000 * k / 10);
  assert.ok(t.getPersonWeekCap('dungeon') < 1000, 'tek kişi bütçenin tamamını alamaz');

  // b) 1 aktif oyuncu: formül k × bütçe ÷ 1 = bütçenin 3 katı çıkardı (tavan yok demek); taban 10 ile %30
  t = yeniKasa(); t.openWeekBudgets({ aktif: 1 }); butce(t, 1000);
  assert.equal(t.getPersonWeekCap('dungeon'), 300);
  t = yeniKasa(); t.openWeekBudgets({ aktif: 3 }); butce(t, 1000);
  assert.equal(t.getPersonWeekCap('dungeon'), 300, 'aktif 3 de tabana iner');

  // c) taban aşıldığında formül eskisi gibi: bütçe × 3 ÷ aktif
  t = yeniKasa(); t.openWeekBudgets({ aktif: 50 }); butce(t, 1000);
  assert.equal(t.getPersonWeekCap('dungeon'), 60);
  t = yeniKasa(); t.openWeekBudgets({ aktif: 10 }); butce(t, 1000);
  assert.equal(t.getPersonWeekCap('dungeon'), 300, 'tam taban: iki formül aynı');

  // d) bütçe hiç açılmadıysa (tarayıcı tek oyunculuk) ve hesaplaşma anında (bypassBudget) tavan yok
  t = yeniKasa();
  assert.equal(t.getPersonWeekCap('dungeon'), Infinity, 'tarayıcı tek oyunculuk: bütçe yok, tavan yok');
  t.openWeekBudgets({ aktif: 20 }); butce(t, 1000);
  t.bypassBudget = true;
  assert.equal(t.getPersonWeekCap('dungeon'), Infinity, 'hesaplaşma anında tavan yok');

  // e) Oyuncu düzeyi: ilk haftada tek oyuncu üst üste ödül toplayıp bütçeyi süpüremez; geç gelen payını alır
  depo.clear();
  const mod = await import('../js/treasury.js');
  const T = mod.treasury;
  T.reset();
  T.openWeekBudgets();                                    // aktif yok
  T.state.weekBudget.dungeon = 1000;
  const a = new GameStateManager();
  let alinan = 0;
  for (let i = 0; i < 100; i++) alinan += a._kasaCekKisi('dungeon', 50).granted;
  assert.equal(alinan, 300, 'ilk oyuncu yalnız bütçenin %30\'unu alabildi');
  const b = new GameStateManager();
  b.state.kasaHaftasi = undefined;
  assert.equal(b._kasaCekKisi('dungeon', 50).granted, 50, 'geç gelen oyuncu payını alıyor');
  ok('kişi payı tavanı: aktif sayısı yok/az ise payda 10\'a iner (tavan bütçenin %30\'u); 10+ aktifte bütçe × 3 ÷ aktif');
}

// ═══ 3) Sunucu: ilk açılışta tavan var, haftalık özet kotası tabana inenleri bildiriyor ═══
{
  const { openDb } = await import('../server/db.js');
  const { createEngine } = await import('../server/engine.js');
  const { createWorld } = await import('../server/world.js');
  const { loadConfig } = await import('../server/config.js');
  const db = openDb(':memory:');
  const E = await createEngine(db, { testMode: true });
  assert.ok(Number.isFinite(E.treasury.getPersonWeekCap('dungeon')), 'sunucu ilk açılışında kişi tavanı uygulanıyor');
  assert.ok(E.treasury.getPersonWeekCap('dungeon') < E.treasury.state.weekBudget.dungeon, 'tavan bütçeden küçük');

  const uyarilar = [];
  const world = createWorld({ db, engine: E, cfg: { ...loadConfig({}), dbFile: ':memory:' }, log: { warn: (m) => uyarilar.push(String(m)), error() {}, info() {} } });
  // Kota izlemesi: bir hammaddenin kişi başı kotası tabana indirilir, özet bunu bildirir
  E.globalPool._uretimiHazirla();
  const tabanKota = GAME_CONFIG.URETIM_HAKKI.QPP_MIN;
  E.globalPool.state.uretim.qpp.coal = tabanKota;
  const ozet = await world.runWeekly(1);
  assert.ok(!ozet.skipped, 'hesaplaşma çalıştı: ' + JSON.stringify(ozet.skipped || ''));
  assert.ok(Array.isArray(ozet.kotaTabani), 'özet kotaTabani listesini taşıyor');
  assert.ok(ozet.kotaTabani.includes('coal'), 'tabana inen kömür listede');
  assert.ok(uyarilar.some((m) => /Kota tabana indi/.test(m)), 'yönetici günlüğüne uyarı yazıldı');
  // hesaplaşma sonrası açılan yeni hafta bütçesi de tavanlı (aktif sayısı 0 → kayıtlı oyuncu sayısı → taban)
  assert.ok(Number.isFinite(E.treasury.getPersonWeekCap('dungeon')));
  ok('sunucu: ilk hafta kişi tavanı var; haftalık özet kotası tabana inen hammaddeleri bildiriyor');
}

console.log(`\n${gecen}/3 ikinci tur ekonomi bloğu geçti.`);
process.exit(0);
