// Realm of AdAstra sunucusu — oyuncunun çağırabileceği oyun işlemleri (beyaz liste)
// ============================================================================
// Yalnızca bu listedeki işlemler sunucuda çalışır. Her işlemin kabul ettiği bilgiler tek tek tanımlıdır;
// tarayıcıdan gelen başka her şey reddedilir. Test/hile düğmeleri (cheat*, setDev*, addDev*, ileri sarma,
// sıfırlama) listede yoktur. Zamanla ilerleyen işler (sefer ilerlemesi, bot, iyileşme, stamina) sunucu her
// istekte kendisi işler.
//
// random: sonucu şansa bağlı işlemler. Tarayıcı bunların sonucunu kendisi hesaplamaz, sunucuyu bekler.
// ============================================================================

import { GAME_CONFIG } from '../js/config.js';
import { OGRETICI_GORULENLER } from '../js/gameState/ogretici.js';

const SLOT_KEYS = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
const own = (obj, k) => typeof k === 'string' && !!obj && Object.hasOwn(obj, k);
const SCROLLS = ['scroll_heal', 'scroll_stamina', 'scroll_teleport', 'scroll_repair'];
// v2: alanlar ve hammaddeler config'ten (6 kaynak)
const NODES = GAME_CONFIG.RESOURCE_KEYS || ['wood', 'iron', 'wheat'];
const WHEEL_PAY = ['ada', 'ticket', ...NODES];
const RESOURCE_KEYS = [...NODES, 'fragments', 'boxes', 'keys'];

const T = {
  int: v => Number.isInteger(v) && Math.abs(v) <= 1e9,
  idx: v => Number.isInteger(v) && v >= 0 && v < 64,
  qty: v => typeof v === 'number' && isFinite(v) && v > 0 && v <= 1e12,
  bool: v => typeof v === 'boolean',
  str: v => typeof v === 'string' && v.length <= 64,
  name: v => typeof v === 'string' && v.length <= 24,
  slot: v => SLOT_KEYS.includes(v),
  node: v => NODES.includes(v),
  res: v => RESOURCE_KEYS.includes(v),
  idxArr: v => Array.isArray(v) && v.length >= 1 && v.length <= 25 && v.every(x => Number.isInteger(x) && x >= 0 && x < 64),
  slotRef: v => T.slot(v) || T.ref(v),
  // Eşya konumu (eşyanın kendisi değil): { source, slotKey, armoryIndex, soldierIndex, itemId }
  ref: v => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 5 &&
    Object.entries(v).every(([k, x]) => ['source', 'slotKey', 'armoryIndex', 'soldierIndex', 'itemId'].includes(k) &&
      (x == null || (typeof x === 'string' && x.length <= 64) || Number.isInteger(x))) &&
    ['armory', 'kingdom', 'soldier'].includes(v.source) &&
    (v.slotKey == null || SLOT_KEYS.includes(v.slotKey)) &&
    (v.armoryIndex == null || (Number.isInteger(v.armoryIndex) && v.armoryIndex >= 0)) &&
    (v.soldierIndex == null || (Number.isInteger(v.soldierIndex) && v.soldierIndex >= 0 && v.soldierIndex < 64)),
  // Yalnız oyunun kendi tanımladığı adlar ("__proto__" gibi nesne iç adları geçemez)
  buff: v => own(GAME_CONFIG.TAVERN_BUFFS, v),
  tool: v => own(GAME_CONFIG.TOOLS, v),
  scroll: v => SCROLLS.includes(v),
  row: v => v === 'front' || v === 'back',
  wheelPay: v => WHEEL_PAY.includes(v),
  wheelMult: v => (GAME_CONFIG.CARNIVAL.WHEEL_MULTIPLIERS || [1]).includes(v),
  quest: v => typeof v === 'string' && (GAME_CONFIG.ONBOARDING_QUESTS || []).some(q => q.id === v),
  // Krallık Yolu: bölüm kimliği (10 bölüm + final) ve "ekranı gördü" anahtarı (sabit liste)
  section: v => typeof v === 'string' && ((GAME_CONFIG.ONBOARDING_SECTIONS || []).some(b => b.id === v) || v === (GAME_CONFIG.ONBOARDING_FINAL || {}).id),
  gorulen: v => typeof v === 'string' && OGRETICI_GORULENLER.includes(v),
  // Genesis Yolu: koleksiyon eserinin kimliği (yalnız oyunun 18 eseri)
  eser: v => typeof v === 'string' && (GAME_CONFIG.COLLECTION_ARTIFACTS || []).some(c => c.id === v),
  fightOpts: v => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => k === 'payGateFee') &&
    (v.payGateFee === undefined || typeof v.payGateFee === 'boolean'),
  // v2: Konsey katkısı — { hammadde: miktar } (yalnız oyunun 6 hammaddesi, pozitif sayılar)
  amounts: v => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 8 &&
    Object.entries(v).every(([k, x]) => NODES.includes(k) && typeof x === 'number' && isFinite(x) && x >= 0 && x <= 1e12)
};

// name: [argüman türleri] — '?' ile bitenler isteğe bağlı
const A = (types, extra = {}) => ({ types, ...extra });
export const ACTIONS = {
  // Seferler ve hasat
  startExpedition: A(['node']),
  claimExpedition: A(['node']),
  claimPartialExpedition: A(['node']),
  claimAllHarvests: A([]),
  claimAllCompletedExpeditions: A([]),
  claimAndRestartAllExpeditions: A([]),
  // Stamina, seviye, silo, aletler
  refillStaminaWithWheat: A(['qty?']),
  refillStaminaExact: A(['qty']),
  refillStaminaToMaxWithWheat: A([]),
  levelUp: A([]),
  upgradeWarehouse: A([]),
  repairTool: A(['tool']),
  repairAllTools: A([]),
  // v2 (R5/R6): Köy Evleri, Şifahane, Demirhane geri dönüşümü, roket görevi, Sirius Konseyi katkıları
  buildHouse: A([]),
  healSoldierWithHerb: A(['idx']),
  healAllWithHerb: A([]),
  recycleEquipment: A(['ref']),
  buildRocket: A([]),
  contributeToOtorite: A(['amounts']),
  contributeToProject: A(['amounts', 'int?']),
  // v2 (R6/F): Yük İskelesi — Hazırlık Deposu (aşama 1'den itibaren)
  depositToPrepDepot: A(['amounts']),
  withdrawFromPrepDepot: A(['node', 'int']),
  // Ordu
  buySoldierUnit: A([]),
  instantHealSoldierUnit: A(['idx']),
  instantHealAllSoldiers: A([]),
  renameSoldierUnit: A(['idx', 'name']),
  setSoldierRow: A(['idx', 'row']),
  saveCombatPreset: A(['idx', 'name?']),
  applyCombatPreset: A(['idx']),
  // Teçhizat (eşya her zaman konumuyla seçilir; tarayıcı eşya nesnesi gönderemez)
  craftEquipment: A(['slot'], { random: true }),
  upgradeEquipment: A(['slot', 'idx?']),
  upgradeEquipmentByTypeAndLevel: A(['slot', 'int']),
  upgradeAnyEquipment: A(['ref']),
  upgradeAllEquipmentInKingdom: A([]),
  repairEquipment: A(['slotRef', 'idx?']),   // yuva adı (krallık / asker) ya da eşya konumu (cephanelik)
  repairAllEquipmentInKingdom: A([]),
  scrapAllLowTierEquipment: A(['int?']),
  equipSoldierSlot: A(['idx', 'slot']),
  unequipSoldierSlot: A(['idx', 'slot']),
  equipSoldierFromDepot: A(['idx', 'ref']),
  unequipSoldierToArmory: A(['idx', 'slot']),
  unequipAllSoldiers: A([]),
  autoEquipBest: A([]),
  // Taverna ve bot (bedava bot yalnız deneme ile: useFree her zaman false)
  // İstemci yöntemi (useFree, saat) imzasıyla çağırır; useFree sunucuda her zaman false sayılır, saat yoksa 24
  buyTavernaAutomationBot: A(['bool', 'int?'], { call: (gs, [, hours = 24], cfg) => {
    const allowed = cfg.TAVERNA_BOT?.PACKAGE_HOURS || [6, 24];
    if (!allowed.includes(hours)) return { success: false, message: 'Geçersiz bot paketi.' };
    return gs.buyTavernaAutomationBot(false, hours);
  } }),
  startBotTrial: A([]),
  setBotSiloOption: A(['bool']),
  setBotAutoRenew24h: A(['bool']),
  buyTavernBuff: A(['buff']),
  // Pazar
  marketSell: A(['res', 'qty']),
  marketBuy: A(['res', 'qty']),
  // Savaş
  fightDungeon: A(['int', 'idxArr', 'fightOpts?'], { random: true }),
  // Zindan modları: bir üst moda geçiş (hammadde katkısı yakılır, sonra ASTRA ile geçilir)
  contributeToDungeonGate: A(['amounts']),
  advanceDungeonMode: A([]),
  executeColosseum1v1Match: A(['idx'], { random: true }),
  stakeArmyForWorldBoss: A([]),
  emergencyUnstakeWorldBossArmy: A([]),
  claimWorldBossReward: A([]),
  // Karnaval, kutular, parşömenler
  spinCarnivalWheel: A(['wheelPay', 'wheelMult?'], { random: true }),
  unboxMysteryBox: A([], { random: true }),
  useScroll: A(['scroll', 'str?']),
  carnivalCheer: A([]),
  // Ortak piyango (kasa ve toplam bilet sunucuda ortak; çekiliş haftalık hesaplaşmada)
  buyLotteryTickets: A(['int']),
  claimWinnerLotteryPayout: A([]),
  useLotteryTicketForWheel: A([], { random: true }),
  // Görevler, temel gelir, koleksiyon
  claimOnboardingReward: A(['quest']),
  claimOnboardingSection: A(['section']),
  ogreticiGordu: A(['gorulen']),
  claimWeeklyUbi: A([]),
  mintGenesisNft: A([]),
  uyandirEser: A(['eser']),
  // Katılım puanı: izin sorusuna cevap, izni erken bitirme (E-planı Faz 1)
  cevaplaIzinSorusu: A(['bool']),
  bitirIzin: A([])
};

// 🚪 Kapıda SIRADA BEKLEYEN (misafir modu) bir adayın yapabildiği TEK şey: hazır aday onayı. Oyun aksiyonu
// değildir, ekonomiye dokunmaz; bu yüzden server/rotalar/oyun.js'te vatandaşlık kontrolünü atlar (E-planı Faz 1).
export const MISAFIR_ACTIONS = { misafirGorevTamamla: A(['str']) };

export function runMisafirAction(gs, name, args) {
  if (!Object.hasOwn(MISAFIR_ACTIONS, name)) return { success: false, message: 'Bilinmeyen ya da izin verilmeyen adım.', rejected: true };
  const spec = MISAFIR_ACTIONS[name];
  if (!Array.isArray(args) || args.length > spec.types.length) return { success: false, message: 'Argümanlar liste olmalı', rejected: true };
  for (let i = 0; i < spec.types.length; i++) {
    const t = spec.types[i], optional = t.endsWith('?'), check = T[optional ? t.slice(0, -1) : t], v = args[i];
    if (v === undefined || v === null) { if (optional) continue; return { success: false, message: `${i + 1}. argüman eksik`, rejected: true }; }
    if (!check(v)) return { success: false, message: `${i + 1}. argüman geçersiz`, rejected: true };
  }
  if (typeof gs[name] !== 'function') return { success: false, message: 'İşlem bu sürümde yok', rejected: true };
  return gs[name](...args);
}

// 🧪 Yalnız DENEME sunucusunda (TEST_MODE=1) açılan test menüsü işlemleri. Gerçek sunucuda hep kapalı.
export const DEV_ACTIONS = ['cheatAddResources', 'setDevResource', 'addDevResource', 'setDevLevel', 'setDevAdAstra', 'addDevAdAstra',
  'setDungeonProgress', 'unlockAllDevArtifacts', 'repairAllDevTools', 'refillDevStamina', 'healAllDevSoldiers', 'completeAllExpeditionsNow',
  'addArenaKey', 'executeSundayAutoWorldBossBattle', 'fastForwardTime', 'devFinishCouncilProjects', 'devResetCouncilProjects'];
const devArgOk = v => v == null || ['number', 'string', 'boolean'].includes(typeof v) ||
  (Array.isArray(v) && v.length <= 20 && v.every(x => ['number', 'string', 'boolean'].includes(typeof x))) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 8 && Object.values(v).every(x => x == null || ['number', 'string', 'boolean'].includes(typeof x)));


// Yalnız listede birebir tanımlı adlar (__proto__, constructor gibi nesne iç adları geçemez)
const specOf = name => (typeof name === 'string' && Object.hasOwn(ACTIONS, name) ? ACTIONS[name] : null);

export function validateArgs(name, args) {
  const spec = specOf(name);
  if (!spec) return `Bilinmeyen ya da izin verilmeyen işlem: ${String(name).slice(0, 40)}`;
  if (!Array.isArray(args)) return 'Argümanlar liste olmalı';
  if (args.length > spec.types.length) return 'Fazla argüman';
  for (let i = 0; i < spec.types.length; i++) {
    const t = spec.types[i];
    const optional = t.endsWith('?');
    const check = T[optional ? t.slice(0, -1) : t];
    const v = args[i];
    if (v === undefined || v === null) {
      if (optional) continue;
      return `${i + 1}. argüman eksik`;
    }
    if (!check(v)) return `${i + 1}. argüman geçersiz`;
  }
  return null;
}

export function runAction(gs, name, args, cfg, { testMode = false } = {}) {
  if (testMode && DEV_ACTIONS.includes(name)) {
    if (!Array.isArray(args) || args.length > 8 || !args.every(devArgOk)) return { success: false, message: 'Geçersiz test argümanı', rejected: true };
    const r = gs[name](...args.map(v => (v === null ? undefined : v)));
    return r === undefined ? { success: true } : r;
  }
  const err = validateArgs(name, args);
  if (err) return { success: false, message: err, rejected: true };
  const spec = specOf(name);
  const clean = args.filter((v, i) => i < spec.types.length).map(v => (v === null ? undefined : v));
  if (spec.call) return spec.call(gs, clean, cfg);
  if (typeof gs[name] !== 'function') return { success: false, message: 'İşlem bu sürümde yok', rejected: true };
  return gs[name](...clean);
}
