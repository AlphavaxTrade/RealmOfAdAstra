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
  idxArr: v => Array.isArray(v) && v.length >= 1 && v.length <= 18 && v.every(x => Number.isInteger(x) && x >= 0 && x < 64),
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
  quest: v => typeof v === 'string' && (GAME_CONFIG.ONBOARDING_QUESTS || []).some(q => q.id === v),
  fightOpts: v => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => k === 'payGateFee') &&
    (v.payGateFee === undefined || typeof v.payGateFee === 'boolean')
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
  sweepCompletedExpeditions: A([]),
  // Stamina, seviye, silo, aletler
  refillStaminaWithWheat: A(['qty?']),
  refillStaminaExact: A(['qty']),
  refillStaminaToMaxWithWheat: A([]),
  levelUp: A([]),
  upgradeWarehouse: A([]),
  repairTool: A(['tool']),
  repairAllTools: A([]),
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
  repairEquipment: A(['slot', 'idx?']),
  repairAllEquipmentInKingdom: A([]),
  scrapAllLowTierEquipment: A(['int?']),
  equipSoldierSlot: A(['idx', 'slot']),
  unequipSoldierSlot: A(['idx', 'slot']),
  equipSoldierFromDepot: A(['idx', 'ref']),
  unequipSoldierToArmory: A(['idx', 'slot']),
  unequipAllSoldiers: A([]),
  autoEquipBest: A([]),
  // Taverna ve bot (bedava bot yalnız deneme ile: useFree her zaman false)
  buyTavernaAutomationBot: A(['int'], { call: (gs, [hours], cfg) => {
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
  executeColosseum1v1Match: A(['idx'], { random: true }),
  stakeArmyForWorldBoss: A([]),
  emergencyUnstakeWorldBossArmy: A([]),
  claimWorldBossReward: A([]),
  // Karnaval, kutular, parşömenler
  spinCarnivalWheel: A(['wheelPay'], { random: true }),
  unboxMysteryBox: A([], { random: true }),
  useScroll: A(['scroll', 'str?']),
  carnivalCheer: A([]),
  // Ortak piyango (kasa ve toplam bilet sunucuda ortak; çekiliş haftalık hesaplaşmada)
  buyLotteryTickets: A(['int']),
  claimWinnerLotteryPayout: A([]),
  useLotteryTicketForWheel: A([], { random: true }),
  // Görevler, temel gelir, koleksiyon
  claimOnboardingReward: A(['quest']),
  claimWeeklyUbi: A([]),
  mintGenesisNft: A([])
};

// 🧪 Yalnız DENEME sunucusunda (TEST_MODE=1) açılan test menüsü işlemleri. Gerçek sunucuda hep kapalı.
export const DEV_ACTIONS = ['cheatAddResources', 'setDevResource', 'addDevResource', 'setDevLevel', 'setDevAdAstra', 'addDevAdAstra',
  'cheatSetDungeonProgress', 'setDungeonProgress', 'unlockAllDevArtifacts', 'repairAllDevTools', 'refillDevStamina', 'healAllDevSoldiers',
  'completeAllExpeditionsNow', 'cheatUnlockAllArtifacts', 'cheatRefillStamina', 'cheatMaxEquipAllSoldiers', 'cheatLevelUpPlayer',
  'cheatFinishAllExpeditions', 'addArenaKey', 'activateTavernBuff', 'executeSundayAutoWorldBossBattle', 'fastForwardTime'];
const devArgOk = v => v == null || ['number', 'string', 'boolean'].includes(typeof v) ||
  (Array.isArray(v) && v.length <= 20 && v.every(x => ['number', 'string', 'boolean'].includes(typeof x))) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 8 && Object.values(v).every(x => x == null || ['number', 'string', 'boolean'].includes(typeof x)));

// Tarayıcı modu işareti: bu işlemler sunucuya gönderilir ama sonucu yerelde de hesaplanabilir
export const RANDOM_ACTIONS = Object.keys(ACTIONS).filter(k => ACTIONS[k].random);

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
