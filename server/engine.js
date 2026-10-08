// Realm of AdAstra sunucusu — oyun motorunu sunucuda çalıştırır
// ============================================================================
// Tarayıcıdaki oyun motoru (js/*.js) burada aynen kullanılır. Farklar:
//  • Kayıtlar tarayıcı deposu yerine sunucu veritabanına yazılır (localStorage taklidi, kv tablosu).
//  • Dünya (pazar havuzları, hazine, haftalık kota, temel gelir kasası) bütün oyuncular için TEKTİR.
//  • Her oyuncu isteğinde: oyuncunun kaydı yüklenir → aradan geçen süre işlenir (sefer, bot, stamina,
//    iyileşme, kilit açılması) → işlem çalışır → kayıt yazılır. Node tek iş parçacıklı olduğu ve bu adımlar
//    senkron olduğu için iki istek birbirine karışamaz.
// ============================================================================
import { runAction, ACTIONS } from './actions.js';
import { guvenliRastgeleKur } from './rastgele.js';

const BACKUP_SUFFIX = '__yedek';

function installShims(db) {
  const cache = new Map();
  const K = k => 'ls:' + k;
  globalThis.localStorage = {
    getItem(k) {
      if (k.endsWith(BACKUP_SUFFIX)) return null;      // veritabanı kalıcı; tarayıcı yedeğine gerek yok
      if (cache.has(k)) return cache.get(k);
      const v = db.kvGet(K(k));
      if (cache.size > 5000) cache.clear();
      cache.set(k, v);
      return v;
    },
    setItem(k, v) {
      if (k.endsWith(BACKUP_SUFFIX)) return;
      const s = String(v);
      if (cache.size > 5000) cache.clear();       // bellek sınırı: çok oyunculu sunucuda kopya sınırsız büyümesin
      cache.set(k, s);
      db.kvSet(K(k), s);
    },
    removeItem(k) { cache.delete(k); db.kvDel(K(k)); },
    key() { return null; },
    get length() { return 0; },
    clear() { cache.clear(); }
  };
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, innerWidth: 1280 };
  }
}

export const SYSTEM = 'system';
export const playerKey = address => 'player:' + String(address).toLowerCase();

export async function createEngine(db, { clock = () => Date.now(), testMode = false } = {}) {
  installShims(db);
  // Oyun kodu (js/gameState.js...) çark, zindan ganimeti, kutu gibi sonuçları Math.random ile çözer; sunucuda bunlar
  // gerçek değerli, o yüzden kriptografik rastgeleliğe geçilir (sahte Math.random koyan testlere dokunulmaz).
  guvenliRastgeleKur();
  const { GAME_CONFIG } = await import('../js/config.js');
  const { gameState: gs } = await import('../js/gameState.js');
  const { globalPool } = await import('../js/globalPool.js');
  const { treasury } = await import('../js/treasury.js');
  const { ammMarket } = await import('../js/ammMarket.js');
  const { levelWeight } = await import('../js/economy/ubi.js');

  // KARAR 7: haftalık ödeme bütçesi ilk açılışta bir kez kurulur (sonra her hafta hesaplaşmanın sonunda yenilenir)
  if (!Object.keys(treasury.state.weekBudget || {}).length) treasury.openWeekBudgets();

  // Sunucuda "güvenilir saat" sunucunun kendi saatidir
  globalPool.serverTimeOffset = 0;
  globalPool.trustedTimeReady = true;
  globalPool.getTrustedTime = () => clock();

  // Temel gelir: hak sahiplerinin gerçek ağırlık toplamı (hafta başında hesaplanır, bkz. world.js)
  const world = () => db.kvJson('world:economy', {});
  globalPool.getUbiTotalWeight = (playerLevel = 1) => {
    const own = levelWeight(playerLevel);
    return Math.max(own, Number(world().ubiTotalWeight) || 0);
  };

  let current = null;              // şu an yüklü oyuncunun adresi
  let kasa = null;                 // Oyun Kasası (server/kasa.js): oyuncu yokken çalışan işler için
  const setKasa = k => { kasa = k; };
  let quietSave = false;           // mutatePlayer sırasında motorun kendi kaydı kapalı (son görülme değişmesin)
  gs.saveState = (orig => function () { if (current && !quietSave) return orig.call(this); })(gs.saveState);

  // 🎟️ Ortak piyango: kasa, amorti kasası ve toplam bilet herkes için tek (world:lottery).
  // Oyuncunun kendi biletleri kendi kaydında kalır; işlemden sonra farklar ortak kayda işlenir.
  const lotterySeed = () => Number(GAME_CONFIG.CARNIVAL?.LOTTERY?.SEED_POOL_ADA) || 0;
  const lottery = () => db.kvJson('world:lottery', null) || { pool: lotterySeed(), amortiPool: 0, totalTickets: 0 };
  const setLottery = L => db.kvSetJson('world:lottery', L);
  let lotBefore = null;
  // Temsili "diğer oyuncular" yok: gerçek oyuncuların biletleri sayılır
  gs.getLotterySimHolders = () => [{ id: 'others', tickets: Math.max(0, (lottery().totalTickets || 0) - (Number(gs.state.lotteryTickets) || 0)), paid: 0 }];
  gs.simulateOtherLotteryBuyers = () => {};
  // Oyuncu başına çekiliş yok (çekiliş haftalık hesaplaşmada bütün oyuncular arasında yapılır)
  gs.processScheduledLottery = () => null;

  function applyWorldOverrides() {
    const w = world();
    const m = Number(w.priceMultiplier) > 0 ? Number(w.priceMultiplier) : 1;
    gs.state.adaPriceMultiplier = m;
    gs.state.unlockK = Number(w.k) > 0 ? Number(w.k) : 1;   // KARAR 6: kilit açılma tabanı (haftalık %1) × k
    gs.state.adaPriceMultiplierTarget = m;
    gs.state.adaPriceMultiplierEpoch = globalPool.state.epochId;
    const L = lottery();
    gs.state.lotteryPool = L.pool;
    gs.state.lotteryAmortiPool = L.amortiPool;
    gs.state.lotterySimHolders = null;
    lotBefore = { pool: L.pool, amortiPool: L.amortiPool, tickets: Number(gs.state.lotteryTickets) || 0 };
  }

  function mergeLottery() {
    if (!lotBefore) return;
    const L = lottery();
    L.pool += (Number(gs.state.lotteryPool) || 0) - lotBefore.pool;
    L.amortiPool += (Number(gs.state.lotteryAmortiPool) || 0) - lotBefore.amortiPool;
    L.totalTickets = Math.max(0, (L.totalTickets || 0) + (Number(gs.state.lotteryTickets) || 0) - lotBefore.tickets);
    setLottery(L);
    lotBefore = null;
  }

  function load(address) {
    current = String(address).toLowerCase();
    gs.storageKey = playerKey(current);
    gs._simNow = null;
    gs._isFastForwarding = false;
    gs.state = gs.loadState();
    if (!db.kvGet('ls:' + gs.storageKey) && current !== SYSTEM) {
      // Yeni oyuncu: başlangıç profili; piyango ve kasa bilgileri dünyadan gelir
      gs.state.lastSeenAt = clock();
      gs.state.lastLotteryDrawEpoch = globalPool.state.epochId;
      // Kullanıcı kararı (2 Ekim 2026): yeni hesap 0 ADA ve 0 kaynakla başlar
      gs.state.adAstraBalance = 0;
      gs.state.lockedAda = 0;
      gs.state.inventory = { ...gs.state.inventory, ...Object.fromEntries((GAME_CONFIG.RESOURCE_KEYS || ['wood', 'iron', 'wheat']).map(k => [k, 0])), fragments: 0 };   // v2: 6 hammadde
      gs.state.lockedBoxes = 0;
      gs.state.arenaKeys = 0;
    }
    applyWorldOverrides();
  }

  // Oyuncunun kaydını yükler, aradan geçen süreyi işler, fn'yi çalıştırır, kaydeder.
  function withPlayer(address, fn) {
    load(address);
    try {
      globalPool.checkEpochExpiration();
      // 🏦 Oyuncu yokken çalışan işler (pasif iyileşme, bot, botun pazar işleri, alet onarımı) önce oyunda kazanılmış
      // bakiyeyi, yetmezse Oyun Kasası'nı kullanır. Kasa en alttaki katmandır: harcama önce kazanılmış bakiyeden düşer.
      const kasaAvail = kasa && current !== SYSTEM ? Math.max(0, kasa.available(current)) : 0;
      if (kasaAvail > 0) gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + kasaAvail;
      const last = Number(gs.state.lastSeenAt) || clock();
      const gapSec = (clock() - last) / 1000;
      if (gapSec >= 1) gs.processOfflineProgress(gapSec, last);
      applyWorldOverrides();
      gs.processLockedUnlock();
      gs.checkOnboardingProgress();
      gs.updateBotPauseState();
      if (kasaAvail > 0) {
        const total = Number(gs.state.adAstraBalance) || 0;
        const used = total >= kasaAvail ? 0 : kasaAvail - total;
        gs.state.adAstraBalance = Math.max(0, total - kasaAvail);
        gs.state.lockedAda = Math.min(Number(gs.state.lockedAda) || 0, gs.state.adAstraBalance);
        if (used > 0) kasa.consume(current, used);
      }
      // Tıklamalı işlemler yalnız kazanılmış bakiyeyi kullanır (yetmezse cüzdandan ödeme; kasa kullanılmaz)
      const result = fn(gs);
      // Kapı kuralı: kayıt harcı (vatandaş olunca yazılan borç) ilk ASTRA'dan düşer; her harcama gibi dağıtılır
      const kh = gs.state.kayitHarci;
      if (kh && current !== SYSTEM && Number(kh.due) > (Number(kh.paid) || 0)) {
        const rem = Math.round((Number(kh.due) - (Number(kh.paid) || 0)) * 1000) / 1000;
        const bal = Number(gs.state.adAstraBalance) || 0;
        if (bal >= rem && rem > 0) {
          gs.state.adAstraBalance = Math.round((bal - rem) * 1000) / 1000;
          kh.paid = Number(kh.due); kh.paidAt = clock();
          if (typeof gs._onAdaSpent === 'function') gs._onAdaSpent(rem);
          if (typeof globalPool.recordTokenSpend === 'function') globalPool.recordTokenSpend(rem);
          gs.pushNotice(`🎫 Kayıt harcı ödendi: ${rem} ASTRA. Artık tam vatandaşsın.`, 'info');
        }
      }
      mergeLottery();
      // Bildirimler ve "sen yokken olanlar" raporu oyuncuya bir kez teslim edilir, kayıttan silinir
      const notices = Array.isArray(gs.state.pendingNotices) ? gs.state.pendingNotices : [];
      const offlineReport = gs.state.offlineReport || null;
      gs.state.pendingNotices = [];
      gs.state.offlineReport = null;
      gs.saveState();
      return { result, state: { ...gs.state, pendingNotices: notices, offlineReport } };
    } finally {
      current = null;
    }
  }

  function act(address, name, args) {
    return withPlayer(address, g => runAction(g, name, args || [], GAME_CONFIG));
  }

  // Dünya görüntüsü: tarayıcı bunu kendi pazar/hazine/kota kopyasına yazar
  function worldSnapshot() {
    return {
      amm: ammMarket.pools,
      ammFees: ammMarket.feeStats,
      treasury: treasury.state,
      globalPool: globalPool.state,
      economy: world(),
      rates: (db.kvJson('world:rates', null) || {}).active || null,   // RealmRates oranları (tarayıcı kendi ayarına yazar)
      universeStage: Number(GAME_CONFIG.UNIVERSE_STAGE) || 0,            // Universe aşaması (yönetici; tarayıcı kendi ayarına yazar)
      serverTime: clock()
    };
  }

  // Oyuncunun kaydını geçen süreyi işlemeden okur (yönetici ve haftalık işler için)
  function readPlayer(address) {
    const raw = db.kvGet('ls:' + playerKey(address));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  // Oyuncunun kaydını doğrudan değiştirir (haftalık dağıtımlar: çekim, kira, ücretsiz havuz, yatırım).
  // Geçen süreyi işlemez ve "son görülme" zamanına dokunmaz: oyuncu döndüğünde aradaki süre yine işlenir.
  function mutatePlayer(address, fn) {
    load(address);
    const key = gs.storageKey;
    quietSave = true;
    try {
      const r = fn(gs);
      mergeLottery();
      globalThis.localStorage.setItem(key, JSON.stringify(gs.state));
      return r;
    } finally {
      quietSave = false;
      current = null;
    }
  }

  // Bellekteki dünya kopyalarını kayıttan yeniden yükler (yarıda kalan bir işlem geri alındığında)
  function reloadWorld() {
    globalThis.localStorage.clear();
    treasury.state = treasury.load();
    globalPool.state = globalPool.loadState();
    ammMarket.pools = ammMarket.loadPools();
    ammMarket.feeStats = ammMarket.loadFeeStats();
  }

  const runActionFor = (g, name, args) => runAction(g, name, args, GAME_CONFIG, { testMode });

  // Bir işlemin ADA tutarını ölçer: işlem bol bakiyeyle "deneme" olarak çalıştırılır, sonra HER ŞEY geri alınır
  // (veritabanı + bellekteki dünya). Döner: { succeeds, spent, balance, message }
  const ROLLBACK = Symbol('geri-al');
  function quoteCost(address, name, args) {
    let out = null;
    try {
      db.tx(() => {
        withPlayer(address, g => {
          const BIG = 1e12;
          const real = Math.max(0, Number(g.state.adAstraBalance) || 0);
          g.state.adAstraBalance = real + BIG;
          const r = runActionFor(g, name, args) || {};
          const after = Number(g.state.adAstraBalance) || 0;
          out = { succeeds: r.success !== false && !r.rejected, spent: Math.max(0, real + BIG - after), balance: real, message: r.message || '' };
        });
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    } finally {
      reloadWorld();
    }
    return out;
  }

  return { setKasa, quoteCost, testMode, lottery, setLottery, runAction: runActionFor, reloadWorld, GAME_CONFIG, gs, globalPool, treasury, ammMarket, levelWeight, withPlayer, act, worldSnapshot, readPlayer, mutatePlayer, ACTIONS };
}
