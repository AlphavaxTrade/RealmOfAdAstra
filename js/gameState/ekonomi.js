// Realm of AdAstra — GameStateManager yöntemleri: Kilitli bakiye, katkı puanı, Üretim Hakkı, ADA fiyat çarpanı
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { ammMarket } from '../ammMarket.js';
import { RES_KEYS, zeroRes, round3 } from './ortak.js';

export const ekonomiYontemleri = {
  // 🔥 HAMMADDE KALICI YAKIMI (BURN) VE TOTAL ARZDAN DÜŞÜLMESİ
  // Oyunda bir odun, demir veya buğday harcandığında anında yakılır, sayacı artar ve küresel total arzdan silinir.
  burnResource(resourceKey, amount) {
    const qty = Number(amount) || 0;
    if (qty <= 0) return 0;

    if (!this.state.burnedResources) {
      this.state.burnedResources = zeroRes();
    }
    this.state.burnedResources[resourceKey] = (this.state.burnedResources[resourceKey] || 0) + qty;

    try {
      if (typeof globalPool !== 'undefined' && globalPool && typeof globalPool.recordResourceBurn === 'function') {
        globalPool.recordResourceBurn(resourceKey, qty);
      }
    } catch (e) {
      console.warn('globalPool recordResourceBurn error:', e);
    }
    // Katkı puanı: yakılan hammaddenin pazar değeri
    const unitPrice = (ammMarket && typeof ammMarket.getPrice === 'function') ? Number(ammMarket.getPrice(resourceKey)) : 0;
    if (isFinite(unitPrice) && unitPrice > 0) this._addContribution(qty * unitPrice * (GAME_CONFIG.CONTRIBUTION?.RESOURCE_BURN_WEIGHT ?? 0.5));
    return qty;
  },

  // Kullanılınca yok olan oyun içi eşyaların yakım kaydı (oyuncu + dünya). Yalnız kayıt; ekonomiyi değiştirmez.
  // Eksi miktar kaydı geri alır (ör. Kolezyum sırasından çıkınca anahtar iade edilir).
  burnItem(kind, amount) {
    const qty = Number(amount) || 0;
    if (!qty) return 0;
    if (!this.state.burnedItems) this.state.burnedItems = {};
    this.state.burnedItems[kind] = Math.max(0, (this.state.burnedItems[kind] || 0) + qty);
    try {
      if (typeof globalPool !== 'undefined' && globalPool && typeof globalPool.recordItemBurn === 'function') globalPool.recordItemBurn(kind, qty);
    } catch (e) { /* kayıt hatası işlemi bozmasın */ }
    return qty;
  },

  // v2: her hammadde için (odun, demir, buğday, taş, kömür, şifalı ot)
  burnResources(amounts = {}) {
    for (const [k, v] of Object.entries(amounts || {})) {
      if (RES_KEYS().includes(k) && Number(v) > 0) this.burnResource(k, Number(v));
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 🔒 KİLİTLİ BAKİYE · 🏅 KATKI PUANI · 💱 ASTRA FİYAT ÇARPANI (ekonomi kararı 30 Eylül 2026)
  // adAstraBalance toplam bakiyedir ve oyunda tamamı harcanabilir. lockedAda bunun kilitli kısmıdır;
  // çekim (sunucu aşaması) yalnız serbest kısımdan yapılır. Katkı puanı, ortak haftalık çekim
  // havuzundan payı belirleyecek (sunucu aşaması); şimdilik yalnız biriktirilir.
  // ═══════════════════════════════════════════════════════════════════════
  getLockedBalanceInfo() {
    const total = Math.max(0, Number(this.state.adAstraBalance) || 0);
    const locked = Math.min(total, Math.max(0, Number(this.state.lockedAda) || 0));
    return { total, locked, free: total - locked };
  },

  // 🔓 Kilit açılma tahmini (panel için): kurallar processLockedUnlock ve _onAdaSpent ile aynı
  getLockedUnlockForecast() {
    const L = GAME_CONFIG.LOCKED_BALANCE || {};
    const { locked, free, total } = this.getLockedBalanceInfo();
    const k = Number(this.state.unlockK) > 0 ? Number(this.state.unlockK) : 1;   // KARAR 6: yalnız taban k ile ölçeklenir; giriş günü primi sabit
    const base = (L.WEEKLY_UNLOCK_BASE ?? 0.01) * k, active = L.WEEKLY_UNLOCK_ACTIVE ?? 0.014, spend = L.UNLOCK_ON_SPEND ?? 0.2;
    const dayBase = 1 - Math.pow(1 - base, 1 / 7);          // zamanla (oyuna girmesen de) günlük
    const dayActive = active / 7;                            // o gün oyuna girersen ek
    const tomorrowActive = locked * (1 - (1 - dayBase) * (1 - dayActive));
    const tomorrowIdle = locked * dayBase;
    const weekActive = locked * (1 - (1 - base) * Math.pow(1 - dayActive, 7));
    const weekIdle = locked * base;
    const today = new Date(this._calendarNow() + 3 * 3600 * 1000).toISOString().slice(0, 10);
    const loggedToday = !!(this.state.lockUnlock && this.state.lockUnlock.activeDay === today);
    return {
      locked, free, total, freeSharePct: Math.round((L.FREE_SHARE ?? 0.2) * 100), spendBonusPct: Math.round(spend * 100),
      weeklyBasePct: base * 100, weeklyActivePct: active * 100,
      tomorrowActive, tomorrowIdle, weekActive, weekIdle, loggedToday,
      // 1.000 ASTRA harcarsan: harcanan kilitliden düşer, üstüne harcananın %20'si serbest kalır
      per1000Free: Math.min(Math.max(0, locked - 1000), 1000 * spend)
    };
  },

  // Oyundan kazanılan ASTRA: FREE_SHARE serbest, kalanı kilitli. saleOf: pazara satılan hammadde (katkı puanı)
  _onAdaEarned(amount, { saleOf = null } = {}) {
    const v = Number(amount) || 0;
    if (!(v > 0)) return;
    const L = GAME_CONFIG.LOCKED_BALANCE || {};
    this.state.lockedAda = (Number(this.state.lockedAda) || 0) + v * (1 - (L.FREE_SHARE ?? 0.2));
    if (saleOf) {
      // Aynı hammaddeyi pazardan alıp geri satmak puan getirmez: önce alım tutarı düşülür
      const credit = this._contribution().buyCredit;
      const fromCredit = Math.min(credit[saleOf] || 0, v);
      credit[saleOf] = (credit[saleOf] || 0) - fromCredit;
      this._addContribution((v - fromCredit) * (GAME_CONFIG.CONTRIBUTION?.RESOURCE_SALE_WEIGHT ?? 0.5));
    }
  },

  // Oyunda harcanan ASTRA: önce kilitli kısım kullanılır, üstüne harcananın UNLOCK_ON_SPEND'i kadar kilit açılır.
  // boughtResource: pazardan hammadde alımı — puan vermez, aynı hammaddenin sonraki satışından düşülür.
  _onAdaSpent(amount, { boughtResource = null } = {}) {
    const v = Number(amount) || 0;
    if (!(v > 0)) return;
    const L = GAME_CONFIG.LOCKED_BALANCE || {};
    let locked = Math.max(0, Number(this.state.lockedAda) || 0);
    locked -= Math.min(locked, v);
    locked -= Math.min(locked, v * (L.UNLOCK_ON_SPEND ?? 0.2));
    this.state.lockedAda = Math.min(locked, Math.max(0, Number(this.state.adAstraBalance) || 0));
    if (boughtResource) {
      const credit = this._contribution().buyCredit;
      credit[boughtResource] = (credit[boughtResource] || 0) + v;
    } else {
      this._addContribution(v * (GAME_CONFIG.CONTRIBUTION?.ADA_SPEND_WEIGHT ?? 1));
    }
  },

  // Zamanla kilit açılması: herkese haftada %1 (geçen süreye oranlı), oyuna girilen her gün ek pay (haftada %1,4)
  processLockedUnlock() {
    const L = GAME_CONFIG.LOCKED_BALANCE || {};
    const now = this._calendarNow();
    const ls = this.state.lockUnlock || (this.state.lockUnlock = { lastAt: now, activeDay: null });
    let locked = Math.max(0, Number(this.state.lockedAda) || 0);
    const days = Math.max(0, (now - (ls.lastAt || now)) / 86400000);
    if (days >= 1 / 24) {
      const k = Number(this.state.unlockK) > 0 ? Number(this.state.unlockK) : 1;
      locked *= Math.pow(1 - (L.WEEKLY_UNLOCK_BASE ?? 0.01) * k, days / 7);
      ls.lastAt = now;
    }
    const today = new Date(now + 3 * 3600 * 1000).toISOString().slice(0, 10);
    if (ls.activeDay !== today) {
      locked *= 1 - (L.WEEKLY_UNLOCK_ACTIVE ?? 0.014) / 7;
      ls.activeDay = today;
    }
    this.state.lockedAda = Math.min(locked, Math.max(0, Number(this.state.adAstraBalance) || 0));
  },

  _contribution() {
    const epochId = (globalPool && globalPool.state && globalPool.state.epochId) || 1;
    let c = this.state.contribution;
    if (!c || typeof c !== 'object') c = this.state.contribution = { total: 0, week: 0, lastWeek: 0, epochId, buyCredit: {} };
    if (!c.buyCredit) c.buyCredit = {};
    if (c.epochId !== epochId) {
      c.lastWeek = c.epochId === epochId - 1 ? c.week : 0;
      c.week = 0;
      c.epochId = epochId;
    }
    return c;
  },

  _addContribution(points) {
    const p = Number(points) || 0;
    if (!(p > 0)) return;
    const c = this._contribution();
    c.total += p;
    c.week += p;
  },

  getContributionInfo() {
    const c = this._contribution();
    return { total: Math.round(c.total), week: Math.round(c.week), lastWeek: Math.round(c.lastWeek || 0) };
  },

  // ═══════════════════════════════════════════════════════════════════════
  // v2 (R2/R4): ÜRETİM HAKKI — kişisel haftalık pay (gün gün açılır), ağırlık, ortak kasa payı
  // ═══════════════════════════════════════════════════════════════════════
  _uretim() {
    const ep = (globalPool && globalPool.state) ? globalPool.state.epochId : 1;
    let u = this.state.uretim;
    if (!u || typeof u !== 'object') u = this.state.uretim = { epochId: ep, used: zeroRes(), activeDays: [], since: this._now() };
    if (u.epochId !== ep) { u.epochId = ep; u.used = zeroRes(); }
    if (!u.used || typeof u.used !== 'object') u.used = zeroRes();
    if (!Array.isArray(u.activeDays)) u.activeDays = [];
    if (!u.since) u.since = this._now();
    return u;
  },

  // Katkı kademesi: GEÇEN haftanın katkı puanı (eşikler fiyat çarpanıyla ölçekli)
  getContributionTier() {
    const U = GAME_CONFIG.URETIM_HAKKI || {};
    const tiers = U.TIERS || [{ id: 'none', name: 'Yok', min: 0, mult: 1 }];
    const score = Number(this.getContributionInfo().lastWeek) || 0;
    const mult = this.getAdaPriceMultiplier();
    let best = tiers[0];
    for (const t of tiers) if (score >= (t.min || 0) * mult) best = t;
    return { ...best, score };
  },

  // Aktiflik: son 7 günde sefer toplanan gün sayısı / 7 (en az 0,25); ilk hafta tam sayılır
  getUretimActivity() {
    const U = GAME_CONFIG.URETIM_HAKKI || {};
    const u = this._uretim();
    const now = this._now();
    const DAY = 86400000;
    if (now - (u.since || now) < 7 * DAY) return 1;
    const today = Math.floor(now / DAY);
    const days = u.activeDays.filter(d => d > today - 7 && d <= today).length;
    return Math.max(U.ACTIVITY_MIN ?? 0.25, Math.min(1, days / 7));
  },

  // Ham ağırlık (tavansız). Dünya kapasitesi (server/world/uretim.js refreshUretim → sumWeight) bundan hesaplanır,
  // ki adalet tavanı pastayı küçültmesin — yalnız KİŞİNİN kendi hakkı tavanlanır (bkz. getUretimWeight).
  _getUretimWeightRaw() {
    const U = GAME_CONFIG.URETIM_HAKKI || {};
    const lvl = Math.max(1, Number(this.state.level) || 1);
    const levelFactor = Math.min(U.LEVEL_WEIGHT_MAX ?? 2, 1 + (U.LEVEL_WEIGHT_PER_LEVEL ?? 0.025) * lvl);
    const tier = this.getContributionTier();
    const activity = this.getUretimActivity();
    // Onaylı kural (E-planı Faz 1, KARAR 8): izindeyken Üretim Hakkı alınmaz — yer tutulur, ekonomiden pay alınmaz
    // (tatil yüzünden diğer vatandaşların payı küçülmesin: toplam ağırlıktan da düşer).
    if (this.izindeMiOkuma && this.izindeMiOkuma()) return { weight: 0, levelFactor: round3(levelFactor), tier, activity: round3(activity), izinde: true };
    return { weight: round3(levelFactor * tier.mult * activity), levelFactor: round3(levelFactor), tier, activity: round3(activity) };
  },

  // v2 düzeltmesi (E-planı S8, 8 Ekim 2026): docs/v2/KARARLAR_KESIN.md "adalet tavanı: en yüksek ağırlık en düşüğün
  // 3 katını geçmez." Eskiden FAIRNESS_CAP yalnız kişinin KENDİ taşan kullanımını (getUretimHakki'deki "extra")
  // sınırlıyordu, ağırlıkların birbirine oranını değil. Sunucu her saat en düşük aktif oyuncunun ham ağırlığını
  // bulup `globalPool.state.uretim.fairnessCapWeight`'e yazar (server/world/uretim.js); burada o tavan uygulanır.
  // Tarayıcıda tek oyuncu modunda (sunucu hiç yazmadıysa) tavan yoktur, davranış değişmez.
  getUretimWeight() {
    const raw = this._getUretimWeightRaw();
    const cap = Number(globalPool && globalPool.state && globalPool.state.uretim && globalPool.state.uretim.fairnessCapWeight);
    if (!(isFinite(cap) && cap > 0) || raw.weight <= cap) return raw;
    return { ...raw, weight: round3(cap), weightCapped: true };
  },

  // Bu hafta bu kaynak için hakkın: haftalık, bugüne kadar açılan, kullanılan, alınabilir (dünya tavanıyla)
  getUretimHakki(key) {
    const U = GAME_CONFIG.URETIM_HAKKI || {};
    const params = globalPool.uretimParams();
    const w = this.getUretimWeight();
    const weekly = Math.floor(globalPool.weeklyRightPerWeight(key, params) * w.weight + 1e-6);
    const dayIndex = globalPool.getEpochDayIndex();
    const released = Math.floor(weekly * (dayIndex + 1) / 7);
    const u = this._uretim();
    const used = Math.floor(Number(u.used[key]) || 0);
    const own = Math.max(0, released - used);
    const info = globalPool.getResourceInfo(key);
    // Başkalarının açılmış ama kullanmadığı hak: hakkını aşanlara (en çok FAIRNESS_CAP katına kadar) akar
    const worldSpare = Math.max(0, (info.releasedCap || 0) - (info.harvestedThisWeek || 0) - own);
    const fairnessCap = Math.floor(released * (U.FAIRNESS_CAP ?? 3));
    const extra = own > 0 ? 0 : Math.max(0, Math.min(worldSpare, fairnessCap - used));
    const canTake = Math.max(0, Math.min(own + extra, info.availableToday || 0));
    return { key, weekly, released, used, remaining: own, extra, worldSpare, canTake, weight: w.weight, qpp: params.qpp[key], dayIndex, nextReleaseAt: info.nextReleaseAt, worldAvailable: info.availableToday || 0 };
  },

  getUretimSummary() {
    return { weight: this.getUretimWeight(), rights: Object.fromEntries(RES_KEYS().map(k => [k, this.getUretimHakki(k)])), params: globalPool.uretimParams(), otorite: globalPool.otoriteWork(globalPool.uretimParams().otoriteLevel) };
  },

  _recordUretimUse(key, amount) {
    const u = this._uretim();
    u.used[key] = (Number(u.used[key]) || 0) + Math.max(0, Number(amount) || 0);
    const today = Math.floor(this._now() / 86400000);
    if (!u.activeDays.includes(today)) { u.activeDays.push(today); if (u.activeDays.length > 14) u.activeDays = u.activeDays.slice(-14); }
    this.snapshotPriceRatios();
  },

  // Ortak kasa payı: çıkarılan miktarın %5'i dünya kapasitesinden ayrıca çıkarılır ve Konsey stoğuna girer; hak kullanımına sayılır
  _takeKonseyShare(key, extracted) {
    const rate = Number(GAME_CONFIG.OTORITE?.COMMON_CHEST_RATE ?? 0.05);
    let share = Math.floor((Number(extracted) || 0) * rate);
    if (share > 0) share = globalPool.takeForKonsey ? globalPool.takeForKonsey(key, share) : 0;
    this._recordUretimUse(key, (Number(extracted) || 0) + share);
    return share;
  },

  // Fiyat/açılış oranı (termostat girdisi): saatte bir ya da zorla kaydedilir
  snapshotPriceRatios(force = false) {
    if (typeof ammMarket === 'undefined' || !ammMarket || !ammMarket.getPrice || !globalPool || !globalPool.recordPriceRatios) return null;
    const now = this._now();
    const u = globalPool.state && globalPool.state.uretim;
    if (!force && u && (now - (Number(u.priceAt) || 0)) < 3600000) return null;
    const ratios = {};
    for (const k of RES_KEYS()) {
      const open = ((GAME_CONFIG.AMM_CORRIDORS || {})[k] || {}).defaultPriceAda || 0;
      const p = ammMarket.getPrice(k) || 0;
      if (open > 0 && p > 0) ratios[k] = Math.round((p / open) * 1000) / 1000;
    }
    globalPool.recordPriceRatios(ratios, now);
    return ratios;
  },

  _fmtWait(ms) {
    const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h} sa ${m} dk` : `${Math.max(1, m)} dk`;
  },

  // 💱 Sabit ASTRA fiyatları ve ödülleri çarpanla ölçeklenir (bkz. GAME_CONFIG.ADA_PRICE_MULTIPLIER)
  getAdaPriceMultiplier() {
    const m = Number(this.state.adaPriceMultiplier);
    return isFinite(m) && m > 0 ? m : (GAME_CONFIG.ADA_PRICE_MULTIPLIER?.DEFAULT ?? 1);
  },

  adaPrice(base) {
    // v2: ASTRA fiyatları küçük (1 ASTRA bilet, 0,5 ASTRA bot önkoşulu); tam sayıya değil 3 basamağa yuvarlanır
    return round3((Number(base) || 0) * this.getAdaPriceMultiplier());
  },

  getAdaPriceMultiplierTarget() {
    const cfg = GAME_CONFIG.ADA_PRICE_MULTIPLIER || {};
    const t = Number(this.state.adaPriceMultiplierTarget ?? cfg.TARGET ?? cfg.DEFAULT ?? 1);
    return Math.max(cfg.MIN ?? 0.05, Math.min(cfg.MAX ?? 20, isFinite(t) && t > 0 ? t : 1));
  },

  setAdaPriceMultiplierTarget(target) {
    const t = Number(target);
    if (!(isFinite(t) && t > 0)) return { success: false, message: 'Geçersiz çarpan.' };
    this.state.adaPriceMultiplierTarget = t;
    this.saveState();
    return { success: true, target: this.getAdaPriceMultiplierTarget() };
  },

  // Her yeni haftada (Pazartesi 00:01 TSİ) çarpan hedefe doğru en fazla MAX_WEEKLY_STEP kadar ilerler
  processPriceMultiplierWeek() {
    const epochId = (globalPool && globalPool.state && globalPool.state.epochId) || 1;
    if (this.state.adaPriceMultiplierEpoch == null) { this.state.adaPriceMultiplierEpoch = epochId; return false; }
    if (epochId <= this.state.adaPriceMultiplierEpoch) return false;
    const weeks = epochId - this.state.adaPriceMultiplierEpoch;
    this.state.adaPriceMultiplierEpoch = epochId;
    const step = GAME_CONFIG.ADA_PRICE_MULTIPLIER?.MAX_WEEKLY_STEP ?? 0.05;
    const target = this.getAdaPriceMultiplierTarget();
    let m = this.getAdaPriceMultiplier();
    for (let i = 0; i < weeks && m !== target; i++) {
      m = Math.max(m * (1 - step), Math.min(m * (1 + step), target));
    }
    this.state.adaPriceMultiplier = Math.round(m * 10000) / 10000;
    return true;
  },

  // Arayüz döngüsünden (2 saniyede bir) çağrılır
  processEconomyTick() {
    this.processLockedUnlock();
    if (this.processPriceMultiplierWeek()) this.saveState();
  },

  // 🎪 Karnaval Çarkında Anında Yakılan Hammaddeler Sayacı
  recordCarnivalResourceBurn(resourceKey, amount) {
    const qty = Number(amount) || 0;
    if (qty <= 0) return 0;
    if (!this.state.carnivalBurnedResources) {
      this.state.carnivalBurnedResources = zeroRes();
    }
    this.state.carnivalBurnedResources[resourceKey] = (this.state.carnivalBurnedResources[resourceKey] || 0) + qty;
    this.burnResource(resourceKey, qty);
    return qty;
  },
};
