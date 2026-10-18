// Oyun kuralları altın kaydı (rastgele işlem dizisi): sabit saat + sabit rastgelelikle 3 oyuncu, beyaz listedeki
// BÜTÜN işlemlerden tohumlu rastgele seçilen binlerce işlemi uygular; her adımda oyuncu ve dünya durumunun özetini alır.
// js/gameState/*.js dosyaları baştan yazılırken özetler birebir aynı çıkmak zorundadır.
// Bilerek değiştirirsen: node tests/altin/oyun_fuzz_uret.mjs   (farkı commit mesajında açıkla)
// Eski kodla kayıt üretmek için: eski commit'in tüm ağacı (git archive) başka bir klasöre çıkarılır, bu iki dosya oraya kopyalanır.
process.env.TEST_RASTGELE = '1';
process.env.PAROLA_HAFIF = '1';
import crypto from 'node:crypto';

const GercekTarih = Date;
let T = GercekTarih.UTC(2026, 9, 8, 12, 0, 0);
globalThis.Date = class extends GercekTarih {
  constructor(...a) { if (a.length === 0) super(T); else super(...a); }
  static now() { return T; }
};
function tohumlu(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = tohumlu(7);

const { sabitTohum } = await import('../../server/rastgele.js');
sabitTohum(11);
const { openDb } = await import('../../server/db.js');
const { createEngine } = await import('../../server/engine.js');
const { createArena } = await import('../../server/arena.js');
const { createWorld } = await import('../../server/world.js');
const { loadConfig } = await import('../../server/config.js');
const { ACTIONS, DEV_ACTIONS } = await import('../../server/actions.js');

const SAAT = 3600000, GUN = 24 * SAAT;
const ADRESLER = ['a1', 'b2', 'c3'].map(h => '0x' + h.repeat(20));

function kararli(x) {
  if (Array.isArray(x)) return x.map(kararli);
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, kararli(x[k])]));
  if (typeof x === 'number') return Number.isFinite(x) ? Number(x.toPrecision(12)) : String(x);
  if (x === undefined) return '__undefined__';
  return x;
}
const ozet = x => crypto.createHash('sha256').update(JSON.stringify(kararli(x))).digest('hex').slice(0, 12);

export const ADIM_SAYISI = 4000;
export const TOHUM = 20261012;

// Argüman türü başına gerçekçi örnekler (server/actions.js doğrulayıcılarını geçecek değerler)
function ornekler(E) {
  const NODES = E.GAME_CONFIG.RESOURCE_KEYS;
  const SLOTS = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
  const cfg = E.GAME_CONFIG;
  return {
    int: [0, 1, 1, 2, 3, 5, 10, 18],
    idx: [0, 0, 1, 1, 2, 3, 4, 5],
    qty: [1, 1, 5, 10, 50, 100, 500, 2500],
    bool: [true, false],
    str: ['', 'a', 'Kara'],
    name: ['Ali', 'Kara Sövalye', 'Ş', 'x'.repeat(24)],
    slot: SLOTS,
    slotRef: [...SLOTS, { source: 'armory', armoryIndex: 0 }, { source: 'armory', armoryIndex: 1 }, { source: 'soldier', soldierIndex: 0, slotKey: 'weapon' }],
    node: NODES,
    res: [...NODES, 'fragments'],
    idxArr: [[0], [0, 1], [0, 1, 2], [1], [2, 3]],
    ref: [
      { source: 'armory', armoryIndex: 0 }, { source: 'armory', armoryIndex: 1 },
      { source: 'soldier', soldierIndex: 0, slotKey: 'weapon' }, { source: 'soldier', soldierIndex: 1, slotKey: 'armor' },
      { source: 'kingdom', slotKey: 'weapon' }
    ],
    buff: Object.keys(cfg.TAVERN_BUFFS || {}),
    tool: Object.keys(cfg.TOOLS || {}),
    scroll: ['scroll_heal', 'scroll_stamina', 'scroll_teleport', 'scroll_repair'],
    row: ['front', 'back'],
    wheelPay: ['ada', 'ticket', ...NODES],
    quest: (cfg.ONBOARDING_QUESTS || []).map(q => q.id),
    section: [...(cfg.ONBOARDING_SECTIONS || []).map(b => b.id), (cfg.ONBOARDING_FINAL || {}).id],
    gorulen: ['merkez', 'bolge', 'kota', 'koy', 'hazine', 'ekonomi', 'profil', 'zindanOnizleme', 'ilan', 'yakim', 'lig', 'havuzlar', 'tur'],
    fightOpts: [{}, { payGateFee: true }, { payGateFee: false }],
    amounts: [{}, { wood: 50 }, { stone: 20, iron: 20 }, Object.fromEntries(NODES.map(k => [k, 25]))]
  };
}

export async function calistir(adimSayisi = ADIM_SAYISI, tohum = TOHUM) {
  const r = tohumlu(tohum);
  const sec = a => a[Math.floor(r() * a.length)];

  const db = openDb(':memory:');
  const E = await createEngine(db, { clock: () => T, testMode: true });
  const arena = createArena({ db, engine: E, clock: () => T });
  const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true };
  const world = createWorld({ db, engine: E, arena, cfg, clock: () => T, log: { log() {}, warn() {}, error() {} } });
  const NODES = E.GAME_CONFIG.RESOURCE_KEYS;
  const O = ornekler(E);
  const islemler = Object.keys(ACTIONS).filter(a => !DEV_ACTIONS.includes(a));

  const zenginlestir = adres => E.mutatePlayer(adres, gs => {
    const s = gs.state;
    s.adAstraBalance = Math.max(Number(s.adAstraBalance) || 0, 40000);
    s.arenaKeys = Math.max(s.arenaKeys || 0, 3);
    s.level = Math.min(24, Math.max(s.level || 1, 6) + (r() < 0.2 ? 1 : 0));
    s.maxStamina = gs.getMaxStamina(s.level);
    s.stamina = s.maxStamina * 30;
    s.currentXp = Math.max(s.currentXp || 0, 1e6);
    s.dungeonProgress = Math.max(s.dungeonProgress || 0, 3);
    s.inventory.fragments = Math.max(s.inventory.fragments || 0, 150);
    s.inventory.boxes = Math.max(s.inventory.boxes || 0, 2);
    const kap = gs.getWarehouseCapacity(s.warehouseLevel || 1);
    for (const k of NODES) s.inventory[k] = Math.max(s.inventory[k] || 0, Math.floor((kap[k] || 2000) * 0.5));
  });

  for (const a of ADRESLER) {
    db.q.playerAdd.run(a, T, T);
    E.withPlayer(a, () => null);
    zenginlestir(a);
  }

  const kayit = [];
  const plan = [];
  const dunya = () => ({ hazine: E.treasury.state, havuzlar: E.ammMarket.pools, kota: E.globalPool.state, piyango: E.lottery() });

  for (let i = 0; i < adimSayisi; i++) {
    const p = r();
    const adres = sec(ADRESLER);
    let o;
    if (p < 0.03) {
      const ms = sec([10 * 60000, SAAT, 3 * SAAT, 8 * SAAT, GUN]);
      T += ms;
      o = { tur: 'zaman', ms };
    } else if (p < 0.035) {
      T += 8 * GUN;
      let hafta = null;
      try { hafta = world.settleWeek(E.globalPool.state.epochId, null); } catch (e) { hafta = { hata: String(e && e.message) }; }
      o = { tur: 'hafta', sonuc: hafta && hafta.hata ? hafta : !!hafta };
    } else if (p < 0.075) {
      zenginlestir(adres);
      o = { tur: 'zenginlestir', adres };
    } else if (p < 0.09) {
      const rakip = sec(ADRESLER.filter(x => x !== adres));
      const q1 = arena.queue(adres, sec(['1v1', '1v1', '3v3']), sec([[0], [0, 1], [0, 1, 2]]));
      o = { tur: 'arena', adres, rakip, sonuc: q1 && q1.result ? { sira: q1.result.queued, eslesti: q1.result.matched } : null };
    } else {
      const ad = sec(islemler);
      const tipler = ACTIONS[ad].types;
      const args = tipler.map(t => (t.endsWith('?') && r() < 0.3 ? undefined : sec(O[t.replace('?', '')] || [0])));
      while (args.length && args[args.length - 1] === undefined) args.pop();
      let sonuc;
      try {
        const cevap = E.act(adres, ad, args.map(a => (a === undefined ? null : a)));
        const res = cevap && cevap.result;
        sonuc = res && res.success === false ? 'RED' : 'ok';
      } catch (e) {
        sonuc = 'HATA:' + String(e && e.message).slice(0, 60);
      }
      o = { tur: 'islem', adres, ad, args, sonuc };
    }
    plan.push(o);
    kayit.push(ozet({ o, oyuncular: ADRESLER.map(a => E.readPlayer(a)), dunya: dunya() }));
  }
  db.close();
  return { kayit, plan };
}
