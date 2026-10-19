// Realm of AdAstra — GameStateManager yöntemleri: Taverna botunun ücreti (kâr ortaklığı), güvenlik payı,
// satın alma, ücretsiz deneme, ayarlar ve otomatik yenileme. 11 Ekim 2026'da baştan yazıldı; kurallar ve
// sayılar öncekiyle aynı. Bot döngüsü bot.js'te, silo işleri botSilo.js'te.
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { ammMarket } from '../ammMarket.js';
import { RES_KEYS, round3 } from './ortak.js';

const SAAT_MS = 3600 * 1000;
const GUN_DAKIKA = 1440;
const VARSAYILAN_GUVENLIK_PAYI = 5;

export const botPaketiYontemleri = {
  // 🤖 Bot ücreti = 24 saatlik tahmini net kârın %50'si.
  // Tahmin oyuncunun seviyesine (üretim bonusu, sefer süresi, stamina maliyeti), doğal stamina
  // yenilenmesine ve kalan haftalık Üretim Hakkı'na göre yapılır.
  calculateTavernaBotProfitAndCost() {
    const seviye = this.state.level || 1;
    const carpan = this.getLevelProductionMultiplier(seviye);
    const anahtarlar = RES_KEYS();
    const uretim = {};
    const fiyat = {};
    for (const k of anahtarlar) {
      uretim[k] = (GAME_CONFIG.BASE_PRODUCTION[k] || 0) * carpan;
      fiyat[k] = ammMarket.getPrice(k) || ((GAME_CONFIG.AMM_CORRIDORS[k] || {}).defaultPriceAda || 0.01);
    }

    // Dakikada üretilen değerin pazar karşılığı
    const brutDakika = anahtarlar.reduce((t, k) => t + uretim[k] * fiyat[k], 0);

    // Stamina: tüm alanlar çalışırken dakikada harcanan, doğal yenilenmeyi aşan kısmın buğday bedeli
    const seferDakika = Math.max(1, this.getExpeditionDurationMinutes(seviye));
    const dogalYenilenme = 60 / (GAME_CONFIG.STAMINA_NATURAL_REGEN_INTERVAL || 150);
    const staminaDakika = Math.max(0, (anahtarlar.length * this.getExpeditionStaminaCost(seviye)) / seferDakika - dogalYenilenme);
    const staminaBugdayDakika = staminaDakika * (GAME_CONFIG.WHEAT_PER_STAMINA || 3.15);
    const staminaBedelDakika = staminaBugdayDakika * fiyat.wheat;

    // Alet aşınması: onarım = dakikalık odun/demir üretiminin %25'i + bu malzemenin değerinin
    // TOOL_REPAIR_ADA_SHARE kadarı ASTRA
    const aletOdunDakika = uretim.wood * 0.25;
    const aletDemirDakika = uretim.iron * 0.25;
    const aletMalzemeDakika = (aletOdunDakika * fiyat.wood) + (aletDemirDakika * fiyat.iron);
    const aletAstraDakika = aletMalzemeDakika * Number(GAME_CONFIG.TOOL_REPAIR_ADA_SHARE ?? 0.3);
    const aletBedelDakika = aletMalzemeDakika + aletAstraDakika;

    // Üretim Hakkı: bir günde alınabilecek miktar hem dünyanın kalan haftalık kapasitesiyle hem oyuncunun KENDİ hakkıyla
    // sınırlıdır (karar 12 Ekim 2026: ücret eskiden yalnız dünya kotasına bakıyor, oyuncunun payı küçükken fazla çıkıyordu)
    let brutGun = 0;
    for (const k of anahtarlar) {
      const gunlukUretim = uretim[k] * GUN_DAKIKA;
      const bilgi = globalPool.getResourceInfo(k);
      const dunyaKalan = bilgi ? Number(bilgi.remaining) : gunlukUretim;
      brutGun += fiyat[k] * Math.min(gunlukUretim, Math.max(0, dunyaKalan), this._botKisiselGunlukHak(k, gunlukUretim));
    }

    const netDakika = Math.max(0.0001, brutDakika - staminaBedelDakika - aletBedelDakika);
    const net24 = Math.max(0.01, round3(Math.min(netDakika * GUN_DAKIKA, brutGun - (staminaBedelDakika + aletBedelDakika) * GUN_DAKIKA)));

    // Üretim Hakkı sınırı net kârı kırpıyorsa kırpılan kısım ayrıca gösterilir; tablo toplamı tutsun (brüt − stamina − alet − sınır = net)
    const sinirKaybi = Math.max(0, round3((brutDakika - staminaBedelDakika - aletBedelDakika) * GUN_DAKIKA - net24));
    return {
      grossRevenueAda: round3(brutDakika * GUN_DAKIKA),
      rightsLimitLossAda: sinirKaybi,
      staminaWheatCostAda: round3(staminaBedelDakika * GUN_DAKIKA),
      toolRepairCostAda: round3(aletBedelDakika * GUN_DAKIKA),
      netProfitAda: round3(net24),
      botCostAda: Math.max(1, round3(net24 * 0.50)),
      dailyWheatNeededForStamina: Math.round(staminaBugdayDakika * GUN_DAKIKA)
    };
  },

  // Oyuncunun bir günde bu kaynaktan alabileceği miktar: bugün açık olan hak ile günlük açılan pay (haftalık/7) arasında
  // büyük olan; haftada kalan hakkı (artı başkalarının kullanmadığı paydan akan) aşamaz. Hak okunamazsa sınır koymaz.
  _botKisiselGunlukHak(key, varsayilan) {
    if (typeof this.getUretimHakki !== 'function') return varsayilan;
    const hak = this.getUretimHakki(key);
    if (!hak) return varsayilan;
    const gunluk = Math.max(Number(hak.canTake) || 0, (Number(hak.weekly) || 0) / 7);
    const haftaKalan = Math.max(0, (Number(hak.weekly) || 0) - (Number(hak.used) || 0)) + Math.max(0, Number(hak.extra) || 0);
    return Math.min(gunluk, haftaKalan);
  },

  // Paket ücreti: günlük ücretin süreye oranı (6 saat = günlüğün 1/4'ü)
  getBotPackageCost(hours = 24) {
    const saat = Math.max(1, Number(hours) || 24);
    return Math.max(0.5, round3(this.calculateTavernaBotProfitAndCost().botCostAda * saat / 24));
  },

  // 🛡️ Bot güvenlik payı: kasada her zaman bırakılan ASTRA (oto-yenileme açıksa ertesi günün bot ücreti dahil)
  getBotAdaReserve() {
    const alt = (GAME_CONFIG.TAVERNA_BOT && GAME_CONFIG.TAVERNA_BOT.MIN_ADA_RESERVE) || VARSAYILAN_GUVENLIK_PAYI;
    const yenileme = this.state.botAutoRenew24h ? this.calculateTavernaBotProfitAndCost().botCostAda : 0;
    return Math.max(alt, yenileme);
  },

  // Bu tutar harcandıktan sonra kasada güvenlik payı kalıyor mu?
  _botCanSpend(amount) {
    return ((this.state.adAstraBalance || 0) - (Number(amount) || 0)) >= this.getBotAdaReserve();
  },

  buyTavernaAutomationBot(useFree = false, hours = 24) {
    const saat = Math.max(1, Number(hours) || 24);
    const sureMs = saat * SAAT_MS;
    const ucret = useFree ? 0 : this.getBotPackageCost(saat);

    if (!useFree && this.state.adAstraBalance < ucret) {
      return {
        success: false,
        message: `Yetersiz ASTRA! ${saat} Saatlik Otomasyon Botu için ${ucret.toLocaleString()} ASTRA gereklidir (Saf kârın %50'si).`
      };
    }

    if (!useFree) {
      this.state.adAstraBalance -= ucret;
      this._onAdaSpent(ucret);
      globalPool.recordTokenSpend(ucret);
    }

    const now = this._now();
    if (this.state.botPaused && this.state.botPausedRemainingMs > 0) {
      // Duraklatılmış bota eklenen süre dondurulmuş süreye yazılır
      this.state.botPausedRemainingMs += sureMs;
      this.state.botActiveUntil = now + this.state.botPausedRemainingMs;
      this.state.tavernaBotExpiresAt = this.state.botActiveUntil;
    } else {
      const baslangic = (this.state.botActiveUntil && this.state.botActiveUntil > now) ? this.state.botActiveUntil : now;
      this.state.botActiveUntil = baslangic + sureMs;
      this.state.tavernaBotActive = true;
      this.state.tavernaBotExpiresAt = this.state.botActiveUntil;
    }

    // Toplayıcı güçlendirmesi olarak da yazılır (diğer bot kontrolleri buradan okur)
    if (!this.state.activeBuffs) this.state.activeBuffs = {};
    this.state.activeBuffs['auto_collector'] = {
      id: 'auto_collector',
      name: '24 Saatlik Otomasyon Botu',
      expiresAt: this.state.botActiveUntil
    };
    this.saveState();

    // Satın alındığı an ilk turu çalıştır: boştaki seferler hemen başlasın
    try {
      this.runTavernaAutomationCycle();
    } catch (e) {
      console.warn('Bot ilk tur hatası:', e);
    }

    return {
      success: true,
      botActiveUntil: this.state.botActiveUntil,
      costPaid: ucret,
      message: useFree
        ? `🤖 ${saat} Saatlik Otomasyon Botu hediye olarak aktifleştirildi!`
        : `🤖 ${saat} Saatlik Otomasyon Botu aktifleştirildi! (Maliyet: ${ucret.toLocaleString()} ASTRA, Kâr Ortaklığı: %50)`
    };
  },

  // 🎁 Yeni oyunculara bir kerelik ücretsiz bot denemesi
  startBotTrial() {
    if (this.state.botTrialUsed) {
      return { success: false, message: 'Ücretsiz bot denemesini daha önce kullandın.' };
    }
    const saat = (GAME_CONFIG.TAVERNA_BOT && GAME_CONFIG.TAVERNA_BOT.TRIAL_HOURS) || 1;
    this.state.botTrialUsed = true;
    const sonuc = this.buyTavernaAutomationBot(true, saat);
    this.checkOnboardingProgress();
    this.saveState();
    return { ...sonuc, message: `🎁 ${saat} saatlik ücretsiz bot denemesi başladı! Bot seferleri toplayıp aletleri onaracak ve yeniden gönderecek.` };
  },

  // true: silo dolunca otomatik yükselt · false: fazlasını sat (silonun yarısı korunur)
  setBotSiloOption(autoUpgrade = true) {
    this.state.botSiloAutoUpgrade = !!autoUpgrade;
    this.saveState();
    return { success: true, autoUpgrade: this.state.botSiloAutoUpgrade };
  },

  setBotAutoRenew24h(enabled = true) {
    this.state.botAutoRenew24h = !!enabled;
    this.saveState();
    return { success: true, autoRenew: this.state.botAutoRenew24h };
  },

  /**
   * 🔄 Süre bitince botu otomatik yeniden satın alır (oyuncu "24 saat bitince tekrar al" dediyse).
   * Kasada ücret yoksa bot durdurulur ve oyuncuya nedeni yazılır. Yenilendiyse true döner.
   */
  checkAndProcessBotAutoRenew() {
    if (!this.state.botAutoRenew24h) return false;
    const now = this._now();
    const bitis = Math.max(
      this.state.botActiveUntil || 0,
      this.state.tavernaBotExpiresAt || 0,
      this.state.activeBuffs?.auto_collector?.expiresAt || 0
    );

    // Hiç başlamamış ya da süresi bitmemiş bot yenilenmez; eksik kaynak yüzünden donmuş bot da yenilenmez
    if (bitis === 0 || bitis > now) return false;
    if (this.state.botPaused && (this.state.botPausedRemainingMs || 0) > 0) return false;

    const ucret = this.calculateTavernaBotProfitAndCost().botCostAda || 0;

    if (this.state.adAstraBalance >= ucret && ucret > 0) {
      const sonuc = this.buyTavernaAutomationBot(false);
      if (sonuc && sonuc.success) {
        this.state.botRenewCount = (this.state.botRenewCount || 0) + 1;
        if (!this.state.lastBotActions) this.state.lastBotActions = [];
        this.state.lastBotActions.push(`🔄 Bot Otomatik Yenilendi: 24 saat tamamlandı. Kasadaki ${ucret.toLocaleString()} ASTRA ile bot 24 saat daha uzatıldı ve kesintisiz çalışıyor.`);
        this.saveState();
        return true;
      }
      return false;
    }

    if (!this.state.lastBotActions) this.state.lastBotActions = [];
    this.state.lastBotActions.push(`⚠️ Bot Otomatik Yenilenemedi: 24 saat tamamlandı ancak hesapta yeterli ASTRA (${(this.state.adAstraBalance || 0).toFixed(1)} / ${ucret.toLocaleString()} ASTRA) olmadığı için bot durduruldu.`);
    this.state.botActiveUntil = 0;
    this.state.tavernaBotActive = false;
    this.state.tavernaBotExpiresAt = 0;
    if (this.state.activeBuffs && this.state.activeBuffs['auto_collector']) {
      delete this.state.activeBuffs['auto_collector'];
    }
    this.saveState();
    return false;
  }
};
