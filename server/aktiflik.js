// Realm of AdAstra sunucusu — Katılım Puanı: "aktif vatandaş"ın KESİN tanımı (E-planı Faz 1, 8 Ekim 2026)
// ============================================================================
// Kullanıcı kararı: eski "son 7 günde ≥3 gün giriş + ≥1 sefer" kuralı YETERSİZ bulundu ("1 hafta girmeyip 1 gün
// sefer yapınca hafif kalıyor"). Yerine: oyunun KATILIM_PUANI.KATEGORILER listesindeki (js/config.js) her alana
// o hafta dokunulup dokunulmadığına bakan bir puan. Aynı kategoriyi tekrarlamak ek puan getirmez — amaç ÇEŞİTLİLİK,
// bir eylemi botlamak işe yaramasın. Beklenen eşik seviyeyle büyür (üst seviyeden daha fazla katılım beklenir).
//
// Bu dosya SAF fonksiyonlardır: veritabanına, saate, oyuncuya dokunmaz. Durumu tutan ve haftalık değerlendirmeyi
// yürüten taraf server/kapi.js'tir (haftalikKatilimDegerlendir); oyuncunun hangi kategoriye dokunduğunu işaretleyen
// taraf js/gameState/katilim.js'tir (markKatilimKategori, her başarılı işlemden sonra server/rotalar/oyun.js çağırır).
// ============================================================================
import { GAME_CONFIG } from '../js/config.js';
import { ACTIONS } from './actions.js';
import { esikSeviye } from '../js/economy/katilimEsik.js';

// İşlem adı → kategori. ACTIONS (server/actions.js) beyaz listesindeki her gerçek işlem elle eşlenir; eşlenmeyen
// işlemler (ör. levelUp, claimWeeklyUbi, bot paketi satın alma) katılım puanına girmez — bunlar ya pasif bir ödülün
// toplanması (UBI) ya da zaten başka bir kategorinin doğal sonucudur (seviye, sefer sonucu yükselir).
const KATEGORI_ESLEME = {
  // sefer / hasat
  startExpedition: 'sefer', claimExpedition: 'sefer', claimPartialExpedition: 'sefer',
  claimAllHarvests: 'sefer', claimAllCompletedExpeditions: 'sefer', claimAndRestartAllExpeditions: 'sefer',
  // alet / teçhizat bakımı (onarım, üretim, geliştirme, taverna optimizasyonu)
  repairTool: 'bakim', repairAllTools: 'bakim', craftEquipment: 'bakim', upgradeEquipment: 'bakim',
  upgradeEquipmentByTypeAndLevel: 'bakim', upgradeAnyEquipment: 'bakim', upgradeAllEquipmentInKingdom: 'bakim',
  repairEquipment: 'bakim', repairAllEquipmentInKingdom: 'bakim', scrapAllLowTierEquipment: 'bakim',
  equipSoldierSlot: 'bakim', unequipSoldierSlot: 'bakim', equipSoldierFromDepot: 'bakim',
  unequipSoldierToArmory: 'bakim', unequipAllSoldiers: 'bakim', autoEquipBest: 'bakim', recycleEquipment: 'bakim',
  useScroll: 'bakim', refillStaminaWithWheat: 'bakim', refillStaminaExact: 'bakim', refillStaminaToMaxWithWheat: 'bakim',
  buyTavernaAutomationBot: 'bakim', startBotTrial: 'bakim', setBotSiloOption: 'bakim', setBotAutoRenew24h: 'bakim',
  buyTavernBuff: 'bakim',
  // Kışla (asker, nüfus)
  buySoldierUnit: 'kisla', instantHealSoldierUnit: 'kisla', instantHealAllSoldiers: 'kisla',
  renameSoldierUnit: 'kisla', setSoldierRow: 'kisla', saveCombatPreset: 'kisla', applyCombatPreset: 'kisla',
  healSoldierWithHerb: 'kisla', healAllWithHerb: 'kisla', buildHouse: 'kisla',
  // zindan
  fightDungeon: 'zindan',
  // kolezyum
  executeColosseum1v1Match: 'kolezyum',
  // dünya bossu
  stakeArmyForWorldBoss: 'boss', emergencyUnstakeWorldBossArmy: 'boss', claimWorldBossReward: 'boss',
  // pazar (hammadde + Hazırlık Deposu)
  marketSell: 'pazar', marketBuy: 'pazar', depositToPrepDepot: 'pazar', withdrawFromPrepDepot: 'pazar',
  // Konsey / Otorite / Uzay Limanı hazırlığı
  contributeToOtorite: 'konsey', contributeToProject: 'konsey', buildRocket: 'konsey',
  // karnaval (çark, kutu, piyango, koleksiyon)
  spinCarnivalWheel: 'karnaval', unboxMysteryBox: 'karnaval', carnivalCheer: 'karnaval',
  buyLotteryTickets: 'karnaval', claimWinnerLotteryPayout: 'karnaval', useLotteryTicketForWheel: 'karnaval',
  mintGenesisNft: 'karnaval',
  // rehber görevi
  claimOnboardingReward: 'rehber', claimOnboardingSection: 'rehber'
};

// Eşlemenin ACTIONS beyaz listesiyle tutarlılığını kendi kendine denetler (test_aktiflik.mjs bunu çağırır):
// eşlemedeki her ad gerçek bir işlem olmalı; gerçek bir işlemi eşlemede olmayabilir (kasıtlı, yukarıdaki not).
export function eslemeGecerliMi() {
  return Object.keys(KATEGORI_ESLEME).every(ad => Object.hasOwn(ACTIONS, ad));
}

export function kategoriOf(islemAdi) {
  return KATEGORI_ESLEME[islemAdi] || null;
}

// Beklenen haftalık eşik: tek kaynak js/economy/katilimEsik.js (tarayıcıdaki kişisel karne de aynısını kullanır)
export { esikSeviye };

// Bu haftanın sonucu: touched = { kategori: true, ... } (dokunulan kategoriler); puan = dokunulan kategori sayısı
export function haftaSonucu({ touched = {}, level = 1 } = {}, cfg = GAME_CONFIG.KATILIM_PUANI) {
  const kategoriler = Array.isArray(cfg?.KATEGORILER) ? cfg.KATEGORILER : [];
  const puan = kategoriler.reduce((s, k) => s + (touched[k] ? 1 : 0), 0);
  const esik = esikSeviye(level, cfg);
  return { puan, esik, saglikli: puan >= esik, kategoriSayisi: kategoriler.length };
}

// Hazır aday mı (sırada beklerken onayladığı adımlar) — ham JSON durumundan okur, GameStateManager örneği gerekmez.
// Oyuncunun kendi örneğinde aynı mantık js/gameState/katilim.js hazirMi()'dedir (tek kaynak: KAPI.READY_TASK_IDS).
export function hazirMiState(playerState, kapiCfg = GAME_CONFIG.KAPI) {
  const idler = Array.isArray(kapiCfg?.READY_TASK_IDS) ? kapiCfg.READY_TASK_IDS : [];
  const c = (playerState && playerState.candidateReady) || {};
  return idler.length > 0 && idler.every(id => !!c[id]);
}

// Oyuncunun BELİRLİ bir haftada dokunduğu kategoriler (ham JSON durumundan, durumu değiştirmez). Hafta döndüğünde
// _katilim() kapanan haftayı 'oncekiHafta'ya taşır; değerlendirme geç kalsa (oyuncu Pazartesi 00:00'dan sonra eylem yaptı)
// ya da oyuncu o hafta hiç girmediyse (bayat veri) doğru hafta okunur. haftaNo verilmezse "şimdiki" dokunulanlar.
export function haftaTouched(playerState, haftaNo) {
  const k = playerState && playerState.katilim;
  if (!k) return {};
  if (haftaNo == null || k.epochId === haftaNo) return k.touched || {};
  if (k.oncekiHafta && k.oncekiHafta.epochId === haftaNo) return k.oncekiHafta.touched || {};
  return {};
}

// Oyuncu şu an izinde mi (ham JSON durumundan; GameStateManager örneği gerekmez, durumu DEĞİŞTİRMEZ). İzindeki vatandaş
// yerini korur ama ekonomiden pay almaz: Üretim Hakkı ağırlığı 0, temel gelir/ücretsiz havuz payı yok, "aktif" sayısına girmez.
export function izindeMiState(playerState, now) {
  const k = playerState && playerState.katilim;
  return !!(k && k.izinModu && now < Number(k.izinModu.bitis));
}
