// Zindan: ödeme payı dolunca harçlı giriş sürer ama ASTRA kazanılmaz (19 Ekim 2026, kullanıcı kararı).
//  - harç ZERO_REWARD_FEE_MULT katıdır, kasalara girer (doğrudan pay zindan kasasına, kalanı ortak dağılıma)
//  - ASTRA ödülü 0; deneyim ve ganimet sürer; silah aşınır, stamina düşer
//  - günde en çok ZERO_REWARD_MAX_PER_DAY ek giriş; dolunca giriş engellenir ve harç alınmaz
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { treasury } = await import('../js/treasury.js');
const { globalPool } = await import('../js/globalPool.js');

const yeni = () => {
  depo.clear();
  treasury.reset();
  globalPool.vanillaReset();
  const gs = new GameStateManager();
  gs.state.level = 60; gs.state.adAstraBalance = 1e6; gs.state.stamina = 1e7; gs.state.dungeonProgress = 6;
  for (let i = 0; i < 4; i++) gs.buySoldierUnit();
  return gs;
};
const D = GAME_CONFIG.DUNGEON;
let n = 0;
const ok = (ad) => { n++; console.log(`✅ ${ad}`); };

// 1) Ödeme payı dolu + harçsız haklar bitti: harçlı giriş mümkün, harç iki kat, ASTRA yok
{
  const gs = yeni();
  const sayac = gs.getDailyCounters();
  sayac.dungeonRuns = D.DAILY_RUNS;       // harçsız haklar bitti
  sayac.dungeonBudget = 0;                // kasanın bugünkü bütçesi / kişi tavanı tükendi
  sayac.dungeonPaid = 0;
  const kosul = gs.getDungeonEntryTerms(6, false, 4);
  assert.equal(kosul.rewardless, true);
  assert.equal(kosul.budgetBlocked, false);
  assert.equal(kosul.extraEntriesLeft, D.ZERO_REWARD_MAX_PER_DAY);
  const normalHarc = gs.getDungeonGateFee(6, false);
  assert.equal(kosul.fee, Math.round(normalHarc * D.ZERO_REWARD_FEE_MULT * 1000) / 1000, 'harç iki katı');

  const bakiye0 = gs.state.adAstraBalance;
  const zindanKasa0 = treasury.getPool('dungeon');
  const toplamKasa0 = Object.values(treasury.state.pools).reduce((s, v) => s + v, 0);
  const askerCan0 = gs.state.soldierUnits.map((a) => a.hp);
  const r = gs.fightDungeon(6, [0, 1, 2, 3], { payGateFee: true });
  assert.equal(r.success, true, JSON.stringify(r).slice(0, 200));
  assert.equal(r.entry.rewardless, true);
  assert.equal(r.entry.fee, kosul.fee);
  assert.equal(r.entry.staminaCost > 0, true, 'stamina düştü');
  if (r.outcome.victory) assert.equal(r.outcome.adaReward, 0, 'ASTRA kazanılmaz');
  // bakiye yalnız harç kadar azalır (ödül yok)
  assert.ok(Math.abs((bakiye0 - gs.state.adAstraBalance) - kosul.fee) < 1e-6, `bakiye ${bakiye0} → ${gs.state.adAstraBalance}, harç ${kosul.fee}`);
  // harç kasalara girdi: zindan kasası doğrudan payı kadar arttı, toplam kasa harcın hazine payı kadar arttı
  assert.ok(treasury.getPool('dungeon') > zindanKasa0 + kosul.fee * (D ? GAME_CONFIG.DUNGEON_GATE_POOL_SHARE : 1) - 1e-6, 'harcın doğrudan payı zindan kasasına girdi');
  const toplamKasa1 = Object.values(treasury.state.pools).reduce((s, v) => s + v, 0);
  assert.ok(toplamKasa1 > toplamKasa0 + 0.5 * kosul.fee, 'harç oyun kasalarına girdi');
  assert.equal(gs.getDailyCounters().dungeonZeroEntries, 1, 'ek giriş sayıldı');
  assert.ok(gs.state.soldierUnits.some((a, i) => a.hp !== askerCan0[i]) || r.outcome.victory !== undefined, 'savaş oynandı');
  ok('ödeme payı dolu: harçlı giriş sürer, harç iki kat, ASTRA yok, harç kasalara girer');
}

// 2) Ek giriş sınırı: dolunca engel, harç alınmaz, stamina düşmez, bakiye değişmez
{
  const gs = yeni();
  const sayac = gs.getDailyCounters();
  sayac.dungeonRuns = D.DAILY_RUNS; sayac.dungeonBudget = 0; sayac.dungeonPaid = 0;
  sayac.dungeonZeroEntries = D.ZERO_REWARD_MAX_PER_DAY;
  const bakiye0 = gs.state.adAstraBalance, stamina0 = gs.state.stamina;
  const r = gs.fightDungeon(6, [0, 1, 2, 3], { payGateFee: true });
  assert.equal(r.success, false);
  assert.equal(r.budgetBlocked, true);
  assert.equal(gs.state.adAstraBalance, bakiye0, 'harç alınmadı');
  assert.equal(gs.state.stamina, stamina0, 'stamina düşmedi');
  ok(`günlük ${D.ZERO_REWARD_MAX_PER_DAY} ek giriş sınırı dolunca giriş engellenir, harç ve stamina alınmaz`);
}

// 3) Ödeme payı doluyken HARÇSIZ haklar sürüyorsa: ASTRA'sız ama harçsız giriş (eski davranış korunur); ek giriş sayılmaz
{
  const gs = yeni();
  const sayac = gs.getDailyCounters();
  sayac.dungeonBudget = 0; sayac.dungeonPaid = 0;       // harçsız haklar duruyor
  const kosul = gs.getDungeonEntryTerms(6, false, 4);
  assert.equal(kosul.nextNeedsFee, false);
  assert.equal(kosul.rewardless, false, 'harçsız hak varken "ek giriş" kuralı devreye girmez');
  assert.equal(kosul.fee, 0);
  ok('harçsız haklar sürerken ek giriş kuralı devreye girmez');
}

// 4) Ödeme payı dolmamışken harçlı giriş: harç normal (iki kat DEĞİL), ek giriş sayılmaz
{
  const gs = yeni();
  const sayac = gs.getDailyCounters();
  sayac.dungeonRuns = D.DAILY_RUNS;
  const kosul = gs.getDungeonEntryTerms(6, false, 4);
  assert.equal(kosul.nextNeedsFee, true);
  assert.equal(kosul.rewardless, false);
  assert.equal(kosul.fee, gs.getDungeonGateFee(6, false), 'harç normal');
  ok('ödeme payı varken harçlı giriş normal harçla ve ödüllü');
}

// 5) Uçtan uca: ödeme tavanı dolana kadar ödül gelir, TOPLAM tavanı aşmaz; dolduktan sonra her zafer tam 0 ASTRA verir ve harç iki katıdır
{
  const gs = yeni();
  gs.state.dungeonProgress = 9;
  gs.state.fatih = { harcanan: 8417, kazanilan: 0, alindi: false, odul: 0, at: 0 };
  const tavan = gs.getDungeonDailyCap();
  assert.ok(tavan > 100 && tavan < 200, `tavan ~121,5 (boss katı ödülü 24,3 x 5): ${tavan}`);
  const sayac = gs.getDailyCounters();
  sayac.dungeonBudget = 1e9;   // kasanın günlük bütçesi bol: sınır kişi tavanı
  let toplam = 0, doluOnce = 0, doluSonra = 0, sifirOdul = 0, ikiKatHarc = 0;
  // 1. kat (Bataklık Balçığı, ödül 0,9): zayıf ordu bile yener; tavan hesabı hangi katta savaşıldığına bakmaz (ulaşılan en değerli kata göre)
  const normalHarc = gs.getDungeonGateFee(1, false);
  for (let i = 0; i < 700 && doluSonra < 6; i++) {
    gs.state.stamina = 1e7;
    for (const a of gs.state.soldierUnits) a.hp = a.maxHp;
    const kosul = gs.getDungeonEntryTerms(1, false, 4);
    if (kosul.budgetBlocked) break;
    const doluydu = kosul.rewardless;
    const r = gs.fightDungeon(1, [0, 1, 2, 3], { payGateFee: true });
    if (!r.success || !r.outcome.victory) continue;
    toplam += r.outcome.adaReward;
    if (doluydu) {
      doluSonra++;
      if (r.outcome.adaReward === 0) sifirOdul++;
      if (Math.abs(r.entry.fee - normalHarc * 2) < 1e-6) ikiKatHarc++;
    } else doluOnce++;
  }
  assert.ok(toplam <= tavan + 1e-6, `günlük toplam kazanç tavanı aşmaz: ${toplam} / ${tavan}`);
  assert.ok(toplam > tavan - 1, `tavan neredeyse tam dolmalı (son zafer kısmi olabilir): ${toplam} / ${tavan}`);
  assert.ok(doluSonra >= 3, "tavan dolduktan sonra ASTRA'sız girişler yapıldı");
  assert.equal(sifirOdul, doluSonra, 'tavan dolduktan sonraki HER zafer tam 0 ASTRA verir');
  assert.equal(ikiKatHarc, doluSonra, 'tavan dolduktan sonraki HER giriş iki kat harçlıdır');
  ok(`uçtan uca: ${doluOnce} ödüllü zaferle ${toplam.toFixed(1)} / ${tavan} ASTRA, sonra ${doluSonra} ASTRA'sız giriş (hepsi 0 ASTRA, iki kat harç)`);
}

console.log(`\n${n} zindan ASTRA'sız giriş kontrolü geçti.`);
