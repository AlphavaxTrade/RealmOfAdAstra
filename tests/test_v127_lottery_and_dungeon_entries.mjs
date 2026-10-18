// v1.27 — Piyango haftalık sınırı ve devreden biletler, zindan günlük giriş kuralları, kota paneli
import assert from 'node:assert/strict';

globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] ?? null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const { GameStateManager } = await import('../js/gameState.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { default: kotalarEkrani } = await import('../js/ui/ekran/kotalar.js');

const fresh = () => {
  localStorage.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  return new GameStateManager();
};
const nextWeek = () => { globalPool.state.epochId = (globalPool.state.epochId || 1) + 1; };
let passed = 0;
const ok = (name) => { passed++; console.log(`✅ ${name}`); };

const L = GAME_CONFIG.CARNIVAL.LOTTERY;
const WEEK = L.MAX_TICKETS_PER_ACCOUNT;

// 1) Haftalık alım sınırı: tek seferde de parça parça da aşılamaz
{
  const gs = fresh();
  gs.state.adAstraBalance = 10_000_000;
  assert.equal(gs.buyLotteryTickets(WEEK + 1).success, false, 'Sınırın üstü tek seferde alınamamalı');
  assert.equal(gs.buyLotteryTickets(WEEK - 1).success, true);
  assert.equal(gs.buyLotteryTickets(1).success, true);
  const r = gs.buyLotteryTickets(1);
  assert.equal(r.success, false, 'Haftalık sınır dolunca alım reddedilmeli');
  assert.match(r.message, /haftada en fazla/);
  assert.equal(gs.getLotteryStatus().canBuy, 0);
  ok(`Piyango: hesap başı haftalık ${WEEK} bilet sınırı`);
}

// 2) Kazanmayan biletler yanmaz ve sayı sınırı olmadan sonraki haftalara devreder
{
  const gs = fresh();
  gs.state.adAstraBalance = 100_000_000;
  for (let w = 0; w < 10; w++) {
    assert.equal(gs.buyLotteryTickets(WEEK).success, true, `${w + 1}. hafta ${WEEK} bilet alınabilmeli`);
    nextWeek();
  }
  const st = gs.getLotteryStatus();
  assert.equal(st.myTickets, WEEK * 10, 'Biletler haftalar boyunca birikmeli, elde tutma sınırı olmamalı');
  assert.equal(st.paid, WEEK * 10 * L.TICKET_COST_ADA);
  assert.equal(st.canBuy, WEEK, 'Yeni haftada yine yalnız haftalık sınır geçerli');
  ok('Piyango: kazanmayan biletler yanmaz, sınırsız devreder');
}

// 3) Çekilişte kazanamayanın biletleri yanmaz, sonraki haftaya aynen geçer
{
  const gs = fresh();
  gs.state.adAstraBalance = 1_000_000;
  gs.buyLotteryTickets(50);
  // Temsili oyunculara çok bilet ver ki kazanan büyük olasılıkla onlar olsun; kazanan biz olursak tekrar dene
  let res;
  for (let i = 0; i < 20; i++) {
    const snap = JSON.stringify(gs.state);
    gs.getLotterySimHolders().forEach(h => { h.tickets = 1000; h.paid = 100000; });
    res = gs.drawWeeklyLottery();
    if (!res.userWon) break;
    gs.state = JSON.parse(snap);
  }
  assert.equal(res.userWon, false);
  assert.equal(gs.state.lotteryTickets, 50, 'Kazanamayanın biletleri yanmamalı');
  ok('Piyango: çekilişte çıkmayan biletler sonraki haftaya devreder');
}

// 5) Zindan: her girişte stamina; 1. girişte silah aşınmaz, 2–5 aşınır, 6+ harçlı
{
  const gs = fresh();
  gs.state.adAstraBalance = 100_000;
  gs.state.stamina = 1000;
  const lvl = 3;
  const cost = gs.getDungeonStaminaCost(lvl, 2);

  const t1 = gs.getDungeonEntryTerms(lvl, false, 2);
  assert.equal(t1.staminaCost, cost, 'İlk girişte de stamina harcanmalı');
  const e1 = gs.beginDungeonEntry(lvl, false, { soldierCount: 2 });
  assert.equal(e1.success, true);
  assert.equal(e1.rewarded, true);
  assert.equal(e1.firstEntry, true);
  assert.equal(e1.weaponWear, false, 'İlk girişte silah aşınmamalı');
  assert.equal(1000 - gs.state.stamina, cost, 'İlk girişte stamina düşmeli');

  for (let n = 2; n <= 5; n++) {
    const before = gs.state.stamina;
    const e = gs.beginDungeonEntry(lvl, false, { soldierCount: 2 });
    assert.equal(e.success, true);
    assert.equal(e.entryNumber, n);
    assert.equal(e.rewarded, true, `${n}. giriş harçsız ödüllü olmalı`);
    assert.equal(e.fee, 0);
    assert.equal(e.weaponWear, true, `${n}. girişte silah aşınmalı`);
    assert.equal(before - gs.state.stamina, cost, `${n}. girişte stamina harcanmalı`);
  }

  const t6 = gs.getDungeonEntryTerms(lvl, false, 2);
  assert.equal(t6.nextNeedsFee, true, '6. girişte harç devreye girmeli');
  assert.ok(t6.fee > 0);
  const training = gs.beginDungeonEntry(lvl, false, { soldierCount: 2 });
  assert.equal(training.rewarded, false, 'Harç ödenmezse antrenman');
  const adaBefore = gs.state.adAstraBalance;
  const paid = gs.beginDungeonEntry(lvl, false, { soldierCount: 2, payGateFee: true });
  assert.equal(paid.rewarded, true);
  assert.ok(Math.abs((adaBefore - gs.state.adAstraBalance) - t6.fee) < 1e-9, 'Harç bakiyeden düşmeli');
  assert.equal(gs.getDungeonDayStatus().entriesToday, 7);
  ok('Zindan: her girişte stamina, 1. giriş aşınmasız, 2–5 aşınmalı, 6+ harçlı');
}

// 6) Zindan: stamina yetmezse ilk giriş dahil hiçbir giriş yapılamaz ve sayılmaz
{
  const gs = fresh();
  gs.state.stamina = 0;
  const e1 = gs.beginDungeonEntry(5, false, { soldierCount: 3 });
  assert.equal(e1.success, false, 'Stamina yoksa ilk giriş de reddedilmeli');
  assert.equal(gs.getDungeonDayStatus().entriesToday, 0, 'Reddedilen giriş sayılmamalı');
  // Harç yetmezse stamina harcanmadan reddedilir
  const gs2 = fresh();
  gs2.state.stamina = 1000;
  gs2.state.adAstraBalance = 0;
  gs2.state.dailyCounters = { ...gs2.getDailyCounters(), dungeonEntries: 5, dungeonRuns: 5 };
  const r = gs2.beginDungeonEntry(5, false, { soldierCount: 1, payGateFee: true });
  assert.equal(r.success, false);
  assert.equal(gs2.state.stamina, 1000, 'Harç reddinde stamina düşmemeli');
  ok('Zindan: reddedilen giriş sayılmaz, stamina boşa harcanmaz');
}

// 7) Silah aşınması: yalnız savaşa girenlerin silahı 1 düşer
{
  const gs = fresh();
  gs.state.soldierUnits = [
    { name: 'A', equipment: { weapon: { durability: 13, maxDurability: 13 } } },
    { name: 'B', equipment: { weapon: { durability: 5, maxDurability: 13 } } }
  ];
  const worn = gs.applyDungeonWeaponWear([1]);
  assert.equal(worn.length, 1);
  assert.equal(gs.state.soldierUnits[0].equipment.weapon.durability, 13);
  assert.equal(gs.state.soldierUnits[1].equipment.weapon.durability, 4);
  ok('Zindan: silah aşınması yalnız savaşa giren askere uygulanır');
}

// 7b) Aşınma rastgele bir eşyaya düşer: beş yuvanın hepsi şansı bulur, her seferinde yalnız biri 1 azalır, kırık parça sağlam varken seçilmez
{
  const gs = fresh();
  const yuvalar = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
  const yeniTakim = () => Object.fromEntries(yuvalar.map((y) => [y, { name: y, durability: 13, maxDurability: 13 }]));
  gs.state.soldierUnits = [{ name: 'A', equipment: yeniTakim() }];
  const secilen = Object.fromEntries(yuvalar.map((y) => [y, 0]));
  for (let i = 0; i < 300; i++) {
    gs.state.soldierUnits[0].equipment = yeniTakim();
    const worn = gs.applyDungeonWeaponWear([0]);
    assert.equal(worn.length, 1, 'asker başına tek satır');
    const dusen = yuvalar.filter((y) => gs.state.soldierUnits[0].equipment[y].durability === 12);
    assert.equal(dusen.length, 1, 'tam bir eşya 1 azalır');
    secilen[dusen[0]]++;
  }
  for (const y of yuvalar) assert.ok(secilen[y] > 20, `${y} yuvası da aşınabiliyor (${secilen[y]}/300)`);
  gs.state.soldierUnits[0].equipment = yeniTakim();
  for (const y of yuvalar.slice(1)) gs.state.soldierUnits[0].equipment[y].durability = 0;
  gs.applyDungeonWeaponWear([0]);
  assert.equal(gs.state.soldierUnits[0].equipment.weapon.durability, 12, 'tek sağlam parça o olduğundan o aşınır');
  assert.ok(yuvalar.slice(1).every((y) => gs.state.soldierUnits[0].equipment[y].durability === 0), 'kırıklar 0 kalır');
  gs.state.soldierUnits = [{ name: 'Çıplak', equipment: {} }];
  gs.state.equipment = { weapon: { durability: 13, maxDurability: 13 } };
  assert.match(gs.applyDungeonWeaponWear([0])[0], /Krallık Kılıcı/);
  assert.equal(gs.state.equipment.weapon.durability, 12, 'eşyasız askerde eski kural: krallık kılıcı');
  ok('Zindan: aşınma takılı eşyalardan rastgele birine düşer');
}

// 8) Eski kayıt: toplam giriş sayacı yoksa ödüllü + harçlı girişlerden türetilir
{
  const gs = fresh();
  const c = gs.getDailyCounters();
  delete c.dungeonEntries;
  c.dungeonRuns = 2;
  c.dungeonPaidEntries = 1;
  const st = gs.getDungeonDayStatus();
  assert.equal(st.entriesToday, 3);
  assert.equal(st.nextIsFirstEntry, false);
  ok('Zindan: eski kayıtlarla uyumlu giriş sayacı');
}

// 9) Kota paneli ve giriş basamakları hatasız üretilir
{
  const gs = fresh();
  const html = kotalarEkrani.govde({ gameState: gs, globalPool, GAME_CONFIG });
  for (const s of ['Üretim hakkın', 'Sirius kapasitesi', GAME_CONFIG.RESOURCE_META.wood.name, 'Zindan: harçsız ödüllü giriş', 'Piyango: bu hafta aldığın bilet', 'Kolezyum maçı']) {
    assert.ok(html.includes(s), `Ekranda "${s}" olmalı`);
  }
  assert.ok(!/NaN|undefined|Infinity/.test(html), 'Ekranda NaN/undefined/Infinity olmamalı');
  // Zindan giriş basamakları: kullanılanlar yeşil, sıradaki vurgulu
  const ozel = Object.create(gs);
  ozel.getDungeonDayStatus = () => ({ ...gs.getDungeonDayStatus(), freeTotal: 5, entriesToday: 2, freeUsed: 2 });
  const basamak = kotalarEkrani.govde({ gameState: ozel, globalPool, GAME_CONFIG });
  const etiketler = basamak.match(/<div class="ek-etiketler">.*?<[/]div>/gs).find((e) => e.includes('1. giriş'));
  assert.equal((etiketler.match(/is-iyi/g) || []).length, 2);
  assert.equal((etiketler.match(/is-vurgu/g) || []).length, 1);
  ok('Kotalarım ekranı: tüm bölümler hatasız üretiliyor');
}

console.log(`\n${passed} v1.27 testi geçti.`);
