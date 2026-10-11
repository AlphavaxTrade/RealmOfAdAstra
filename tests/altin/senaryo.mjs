// "Altın kayıt" senaryosu (kurumsal A3.8): sabit saat + sabit rastgelelikle bir oyun dünyasını baştan sona oynatır ve
// her adımın sonunda oyuncu/dünya durumunun özetini (hash) çıkarır. Refaktörden önce üretilen kayıtla sonra üretilen aynı
// olmalı: fark varsa davranış değişmiş demektir (geri al). Çalıştırma: node tests/altin/senaryo.mjs → JSON basar.
process.env.TEST_RASTGELE = '1';
process.env.PAROLA_HAFIF = '1';
import crypto from 'node:crypto';

// ── Sabit zaman ve rastgelelik (motor yüklenmeden ÖNCE) ──
const GercekTarih = Date;
let T = Date.UTC(2026, 9, 8, 12, 0, 0);
globalThis.Date = class extends GercekTarih {
  constructor(...a) { if (a.length === 0) super(T); else super(...a); }
  static now() { return T; }
};
function tohumlu(a) { return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
Math.random = tohumlu(7);   // oyun kodu (çark, zindan, kutu...) bunu kullanır; createEngine yerleşik değilse dokunmaz

const { sabitTohum } = await import('../../server/rastgele.js');
sabitTohum(11);             // sunucu tarafı (piyango çekilişi, PvP tohumu)
const { openDb } = await import('../../server/db.js');
const { createEngine } = await import('../../server/engine.js');
const { createArena } = await import('../../server/arena.js');
const { createWorld } = await import('../../server/world.js');
const { loadConfig } = await import('../../server/config.js');

const SAAT = 3600000, GUN = 24 * SAAT;
const A = '0x' + 'a1'.repeat(20), B = '0x' + 'b2'.repeat(20), C = '0x' + 'c3'.repeat(20);

// Kararlı özet: anahtarlar sıralı, sayılar 12 anlamlı basamak
function kararli(x) {
  if (Array.isArray(x)) return x.map(kararli);
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, kararli(x[k])]));
  if (typeof x === 'number') return Number.isFinite(x) ? Number(x.toPrecision(12)) : String(x);
  return x;
}
const ozet = x => crypto.createHash('sha256').update(JSON.stringify(kararli(x))).digest('hex').slice(0, 16);

export async function senaryoyuCalistir() {
  const db = openDb(':memory:');
  const E = await createEngine(db, { clock: () => T, testMode: true });
  const arena = createArena({ db, engine: E, clock: () => T });
  const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true };
  const world = createWorld({ db, engine: E, arena, cfg, clock: () => T, log: { log() {}, warn() {}, error() {} } });
  const kayit = [];
  const NODES = E.GAME_CONFIG.RESOURCE_KEYS;

  const durum = adres => E.readPlayer(adres);
  const dunya = () => ({ hazine: E.treasury.state, havuzlar: E.ammMarket.pools, kota: E.globalPool.state, piyango: E.lottery(), ekonomi: db.kvJson('world:economy', {}) });
  const adim = (ad, sonuc, ...oyuncular) => {
    const o = { adim: ad, oyuncu: oyuncular.map(a => ozet(durum(a))), dunya: ozet(dunya()) };
    if (sonuc !== undefined) o.sonuc = sonuc;
    kayit.push(o);
  };
  const eylem = (adres, ad, args = []) => { const r = E.act(adres, ad, args).result; return `${ad}:${r && r.success === false ? 'RED' : 'ok'}`; };
  const ilerle = ms => { T += ms; };

  // Kurulum: 3 oyuncu, paralı, seviyeli
  for (const a of [A, B, C]) {
    db.q.playerAdd.run(a, T, T);
    E.withPlayer(a, () => null);
    E.mutatePlayer(a, gs => {
      gs.state.adAstraBalance += 60000; gs.state.arenaKeys = 5; gs.state.level = 6; gs.state.dungeonProgress = 3;
      gs.state.maxStamina = gs.getMaxStamina(6); gs.state.stamina = gs.state.maxStamina * 40;   // 6 sefer bedeli (≈191 ⚡ her biri) + savaşlar için bol stamina
      gs.state.currentXp = 1e7;                                     // seviye atlama için
      gs.state.inventory.fragments = 400; gs.state.lockedBoxes = 3; gs.state.inventory.boxes = 3;   // teçhizat parçası ve Pandora kutusu
      const kap = gs.getWarehouseCapacity(1);
      for (const k of NODES) gs.state.inventory[k] = Math.floor((kap[k] || 4000) * 0.95);   // silo yükseltmesi için %80 üstü dolu
    });
  }
  adim('kurulum', undefined, A, B, C);

  // Seferler ve hasat
  adim('seferler basladi', NODES.map(n => eylem(A, 'startExpedition', [n])), A);
  ilerle(3 * SAAT);
  adim('3 saat sonra toplandi', [eylem(A, 'claimAllHarvests')], A);
  adim('tamir', [eylem(A, 'repairAllTools')], A);

  // Ordu ve teçhizat
  adim('ordu', [eylem(A, 'buySoldierUnit'), eylem(A, 'buySoldierUnit'), eylem(A, 'renameSoldierUnit', [0, 'Kara Sövalye']), eylem(A, 'setSoldierRow', [1, 'back'])], A);
  adim('teçhizat', ['weapon', 'armor', 'helmet', 'boots', 'legs'].map(s => eylem(A, 'craftEquipment', [s])).concat([eylem(A, 'autoEquipBest'), eylem(A, 'upgradeAllEquipmentInKingdom'), eylem(A, 'recycleEquipment', [{ source: 'armory', armoryIndex: 0 }])]), A);
  E.mutatePlayer(A, gs => { const kap = gs.getWarehouseCapacity(gs.state.warehouseLevel || 1); for (const k of NODES) gs.state.inventory[k] = Math.floor((kap[k] || 1000) * 0.95); });
  adim('silo', [eylem(A, 'upgradeWarehouse'), eylem(A, 'levelUp')], A);

  // Pazar
  adim('pazar', [eylem(A, 'marketSell', [NODES[0], 100]), eylem(A, 'marketBuy', [NODES[1], 50]), eylem(A, 'marketSell', [NODES[2], 1e9])], A);

  // Bot (24 saat) ve çevrimdışı ilerleme
  adim('bot alindi', [eylem(A, 'buyTavernaAutomationBot', [false, 24]), eylem(A, 'setBotSiloOption', [true])], A);
  ilerle(12 * SAAT);
  adim('bot 12 saat calisti', [eylem(A, 'claimAllCompletedExpeditions')], A);

  // Savaş ve şans oyunları
  adim('zindan', [eylem(A, 'fightDungeon', [1, [0]]), eylem(A, 'fightDungeon', [1, [0, 1]]), eylem(A, 'fightDungeon', [2, [0, 1]])], A);
  adim('karnaval', [eylem(A, 'spinCarnivalWheel', ['ada']), eylem(A, 'spinCarnivalWheel', [NODES[0]]), eylem(A, 'unboxMysteryBox'), eylem(A, 'carnivalCheer')], A);
  adim('piyango bileti', [eylem(A, 'buyLotteryTickets', [5]), eylem(B, 'buyLotteryTickets', [3])], A, B);

  // İkinci oyuncu ve Kolezyum eşleşmesi
  adim('B ordu', [eylem(B, 'buySoldierUnit'), eylem(B, 'startExpedition', [NODES[0]]), eylem(B, 'levelUp')], B);
  adim('C ordu', [eylem(C, 'buySoldierUnit'), eylem(C, 'levelUp')], C);
  const q1 = arena.queue(B, '1v1', [0]);
  const q2 = arena.queue(C, '1v1', [0]);
  adim('kolezyum', { sira: q1.result && q1.result.queued, eslesti: q2.result && q2.result.matched, sonuc: q2.result && q2.result.result }, B, C);

  // Günler geçer
  for (let g = 1; g <= 3; g++) {
    ilerle(GUN);
    adim(`gun ${g}`, [eylem(A, 'claimAllHarvests'), eylem(A, 'claimWeeklyUbi'), eylem(B, 'claimAllHarvests')], A, B);
  }

  // Haftalık hesaplaşma: piyango çekilişi, kasa dağıtımı, UBI, kolezyum ödülü
  ilerle(8 * GUN);
  const hafta = world.settleWeek(E.globalPool.state.epochId, null);
  adim('haftalik hesaplasma', { piyangoCekildi: !!(hafta && hafta.lottery), kolezyum: hafta && hafta.pvp ? hafta.pvp.players : null }, A, B, C);
  adim('hafta sonrasi', [eylem(A, 'claimWinnerLotteryPayout'), eylem(B, 'claimWinnerLotteryPayout'), eylem(A, 'claimWeeklyUbi')], A, B, C);

  db.close();
  return kayit;
}

// Doğrudan çalıştırılırsa kaydı JSON olarak basar
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/altin/senaryo.mjs')) {
  const k = await senaryoyuCalistir();
  process.stdout.write(JSON.stringify(k, null, 1) + '\n');
}
