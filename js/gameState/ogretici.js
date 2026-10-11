// Realm of AdAstra — Krallık Yolu (öğretici): görev koşulları, "ilk kez yapıldı" işaretleri, bölüm ve final ödülleri.
// Görev listesi GAME_CONFIG.ONBOARDING_QUESTS / ONBOARDING_SECTIONS / ONBOARDING_FINAL (js/config.js) içindedir;
// bu dosya her görevin NASIL algılandığını tek yerde tutar. Görevler oyun durumundan otomatik algılanır (tarayıcının
// beyanı sayılmaz: çevrimiçi modda aynı koşullar sunucuda, oyuncunun kaydından hesaplanır).
import { GAME_CONFIG } from '../config.js';
import { treasury } from '../treasury.js';

const ilk = (gs, anahtar) => !!(gs.state.firsts || {})[anahtar];
const toplanan = (gs) => Object.values(gs.state.tools || {}).some(t => t && t.totalGathered > 0);
const askerSayisi = (gs) => (gs.state.soldierUnits || []).length;
const aktif = (gs) => gs.state.activeExpeditions || {};

// Ekranı "görme" görevleri: oyuncu panelin ya da sekmenin gerçekten açıldığını arayüzden bildirir (ogreticiGordu).
// Bu görevler yalnız küçük ödül verir; asıl ödül gerçek işlerden ve bölüm bonuslarından gelir.
export const OGRETICI_GORULENLER = ['merkez', 'bolge', 'kota', 'koy', 'hazine', 'ekonomi', 'profil', 'zindanOnizleme', 'ilan', 'yakim', 'lig', 'havuzlar', 'tur'];
const gordu = (anahtar) => (gs) => ilk(gs, 'gordu_' + anahtar);

// görev kimliği → koşul(gs)
export const OGRETICI_KOSULLARI = {
  // 1. Başlangıç
  first_expedition: (gs) => Object.keys(aktif(gs)).length > 0 || toplanan(gs),
  first_harvest: (gs) => toplanan(gs),
  first_level_up: (gs) => (gs.state.level || 1) >= 2,
  panel_merkez: gordu('merkez'),
  bolge_ac: gordu('bolge'),
  // 2. Üretim
  three_expeditions: (gs) => ['wood', 'iron', 'wheat'].every(n => !!aktif(gs)[n]),
  alti_hammadde: (gs) => {
    const araclar = Object.values(GAME_CONFIG.TOOLS || {});
    return araclar.length > 0 && araclar.every(a => ((gs.state.tools || {})[a.id] || {}).totalGathered > 0);
  },
  tool_repair: (gs) => ilk(gs, 'toolRepair'),
  kota_gor: gordu('kota'),
  bot_trial: (gs) => !!gs.state.botTrialUsed,
  first_silo_upgrade: (gs) => (gs.state.warehouseLevel || 1) >= 2,
  // 3. Köy
  first_house: (gs) => ((gs.state.village || {}).houses || 1) >= 2,
  kasaba_20: (gs) => ((gs.state.village || {}).villagers || 0) >= 20,
  first_herb_heal: (gs) => ilk(gs, 'herbHeal'),
  koy_gor: gordu('koy'),
  // 4. Pazar
  market_buy: (gs) => ilk(gs, 'marketBuy'),
  market_sell: (gs) => ilk(gs, 'marketSell'),
  ilan_gor: gordu('ilan'),
  yakim_gor: gordu('yakim'),
  // 5. Ordu
  first_soldier: (gs) => askerSayisi(gs) >= 1,
  soldier_rename: (gs) => ilk(gs, 'soldierRename'),
  equip: (gs) => ilk(gs, 'equip'),
  four_soldiers: (gs) => askerSayisi(gs) >= 4,
  row_change: (gs) => ilk(gs, 'rowChange'),
  preset_save: (gs) => ilk(gs, 'presetSave'),
  // 6. Demirhane
  craft: (gs) => ilk(gs, 'craft'),
  upgrade_gear: (gs) => ilk(gs, 'upgradeGear'),
  gear_repair: (gs) => ilk(gs, 'gearRepair'),
  first_recycle: (gs) => ilk(gs, 'recycle'),
  // 7. Zindan
  dungeon_preview: gordu('zindanOnizleme'),
  dungeon_win: (gs) => (gs.state.dungeonProgress || 1) > 1,
  fragment_drop: (gs) => ilk(gs, 'fragmentDrop') || ilk(gs, 'boxDrop') || ((gs.state.inventory || {}).fragments || 0) > 0,
  heal_soldier: (gs) => ilk(gs, 'healSoldier') || ilk(gs, 'herbHeal'),
  dungeon_boss3: (gs) => (gs.state.dungeonProgress || 1) > 9,
  // 8. Kolezyum ve Karnaval
  colosseum_first: (gs) => { const c = gs.state.colosseumStats || {}; return ((c.wins || 0) + (c.losses || 0)) >= 1; },
  league_gor: gordu('lig'),
  wheel_spin: (gs) => ilk(gs, 'wheelSpin'),
  lottery_buy: (gs) => ilk(gs, 'lotteryBuy') || (gs.state.lotteryTickets || 0) > 0,
  pools_gor: gordu('havuzlar'),
  // 9. Konsey ve hazine
  first_konsey: (gs) => ilk(gs, 'konsey'),
  treasury_gor: gordu('hazine'),
  economy_gor: gordu('ekonomi'),
  boss_join: (gs) => ilk(gs, 'bossJoin'),
  level_5: (gs) => (gs.state.level || 1) >= 5,
  // 10. Hesap
  profil_gor: gordu('profil'),
  level_10: (gs) => (gs.state.level || 1) >= 10,
  tur_bitir: gordu('tur')
};

// Başarıyla biten işlemden sonra state.firsts içine "ilk kez" işareti düşer. [yöntem, işaret, (sonuç) => bool?]
// (varsayılan koşul: sonuç.success). Yöntemler gameState.js'te bütün karışımlar eklendikten sonra sarılır.
export const OGRETICI_ISARETLERI = [
  ['marketBuy', 'marketBuy'], ['marketSell', 'marketSell'],
  ['craftEquipment', 'craft'],
  ['upgradeEquipment', 'upgradeGear'], ['upgradeAnyEquipment', 'upgradeGear'],
  ['repairEquipment', 'gearRepair'], ['repairTool', 'toolRepair'],
  ['renameSoldierUnit', 'soldierRename'],
  ['equipSoldierSlot', 'equip'], ['equipSoldierFromDepot', 'equip'],
  ['saveCombatPreset', 'presetSave'], ['setSoldierRow', 'rowChange'],
  ['spinCarnivalWheel', 'wheelSpin'], ['buyLotteryTickets', 'lotteryBuy'],
  ['stakeArmyForWorldBoss', 'bossJoin'], ['healSoldierInstantly', 'healSoldier'],
  ['addDungeonXpAndDrops', 'fragmentDrop', (r) => !!r && r.fragmentsGained > 0],
  ['addDungeonXpAndDrops', 'boxDrop', (r) => !!r && r.boxGained > 0]
];

export function ogreticiIsaretleriKur(proto) {
  for (const [yontem, anahtar, kosul] of OGRETICI_ISARETLERI) {
    const asil = proto[yontem];
    if (typeof asil !== 'function') throw new Error(`Öğretici işareti için yöntem yok: ${yontem}`);
    proto[yontem] = function (...args) {
      const sonuc = asil.apply(this, args);
      const tamam = kosul ? kosul(sonuc) : !!(sonuc && sonuc.success);
      if (tamam && typeof this._markFirst === 'function') this._markFirst(anahtar);
      return sonuc;
    };
  }
}

export const ogreticiYontemleri = {
  // Arayüz, bir panelin/sekmenin açıldığını bildirir. Yalnız izin verilen anahtarlar; işlem bayrak koyar, başka bir şey yapmaz.
  ogreticiGordu(anahtar) {
    if (!OGRETICI_GORULENLER.includes(anahtar)) return { success: false, message: 'Bilinmeyen öğretici anahtarı.' };
    if (!ilk(this, 'gordu_' + anahtar)) {
      this._markFirst('gordu_' + anahtar);
      this.checkOnboardingProgress();
      this.saveState();
    }
    return { success: true };
  },

  // Bir bölümün tüm görevleri tamamsa bölüm ödülü Görev kasasından çekilir (bir kez). Final: bütün bölümler alınınca.
  claimOnboardingSection(bolumId) {
    const final = GAME_CONFIG.ONBOARDING_FINAL;
    const bolumler = GAME_CONFIG.ONBOARDING_SECTIONS || [];
    const isFinal = !!final && bolumId === final.id;
    const bolum = isFinal ? null : bolumler.find(b => b.id === bolumId);
    if (!isFinal && !bolum) return { success: false, message: 'Bölüm bulunamadı.' };
    if (!this.state.onboarding || typeof this.state.onboarding !== 'object') this.state.onboarding = {};
    if (!this.state.onboardingSections || typeof this.state.onboardingSections !== 'object') this.state.onboardingSections = {};
    const alinan = this.state.onboardingSections;
    if (alinan[bolumId] && alinan[bolumId].claimed) return { success: false, message: 'Bu bölümün ödülünü zaten aldın.' };
    const ob = this.state.onboarding;
    if (isFinal) {
      if (!bolumler.every(b => alinan[b.id] && alinan[b.id].claimed)) return { success: false, message: 'Önce bütün bölümlerin ödülünü al.' };
    } else {
      const eksik = (GAME_CONFIG.ONBOARDING_QUESTS || []).filter(q => q.section === bolumId && !(ob[q.id] && ob[q.id].done));
      if (eksik.length) return { success: false, message: `Bu bölümde ${eksik.length} görev kaldı.` };
    }
    const bonus = (isFinal ? final.bonusAda : bolum.bonusAda) || 0;
    let granted = 0;
    let budgetFull = false;
    if (bonus > 0 && treasury && treasury.withdrawWhole) {
      const draw = treasury.withdrawWhole('quest', bonus);   // tam sayı ödül; kesirli artık kasada kalır
      granted = draw.granted || 0;
      budgetFull = !!draw.budgetFull;
    }
    // Haftalık ödeme payı dolduysa bölüm "alındı" sayılmaz (ödül kaybolmasın; yeni haftada tekrar alınır)
    if (bonus > 0 && granted <= 0 && budgetFull) {
      return { success: false, granted: 0, budgetFull: true, message: `⏳ ${GAME_CONFIG.TREASURY_WEEKLY_BUDGET.FULL_MESSAGE}` };
    }
    alinan[bolumId] = { claimed: true, at: this._now(), granted };
    this.state.adAstraBalance = (this.state.adAstraBalance || 0) + granted;
    this._onAdaEarned(granted);
    this.saveState();
    const ad = isFinal ? final.title : bolum.title;
    const budgetNote = budgetFull ? ` ⏳ ${GAME_CONFIG.TREASURY_WEEKLY_BUDGET.FULL_MESSAGE}` : '';
    return { success: true, granted, budgetFull, message: `🏅 ${ad}: bölüm ödülü +${granted.toLocaleString('tr-TR')} ASTRA${budgetNote}` };
  },

  // Bölüm kartları için: her bölümün görevleri, tamamlanma ve alınabilir ödülleri
  getOnboardingSections() {
    const ob = this.state.onboarding || {};
    const alinan = this.state.onboardingSections || {};
    const gorevler = (GAME_CONFIG.ONBOARDING_QUESTS || []).map(q => ({
      ...q,
      rewardAda: q.rewardAda || 0,
      done: !!(ob[q.id] && ob[q.id].done),
      claimed: !!(ob[q.id] && ob[q.id].claimed)
    }));
    const bolumler = (GAME_CONFIG.ONBOARDING_SECTIONS || []).map(b => {
      const tasks = gorevler.filter(q => q.section === b.id);
      const doneCount = tasks.filter(q => q.done).length;
      const complete = tasks.length > 0 && doneCount === tasks.length;
      const claimed = !!(alinan[b.id] && alinan[b.id].claimed);
      return { ...b, tasks, doneCount, total: tasks.length, complete, claimed, claimable: complete && !claimed };
    });
    const final = GAME_CONFIG.ONBOARDING_FINAL || null;
    const finalDurum = final ? {
      ...final,
      ready: bolumler.length > 0 && bolumler.every(b => b.claimed),
      claimed: !!(alinan[final.id] && alinan[final.id].claimed)
    } : null;
    return { sections: bolumler, final: finalDurum };
  }
};
