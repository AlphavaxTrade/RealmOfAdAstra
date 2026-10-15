// Realm of AdAstra — GameStateManager yöntemleri: Kilitli bakiye, katkı puanı, Üretim Hakkı, ASTRA fiyat çarpanı
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { ammMarket } from '../ammMarket.js';
import { treasury } from '../treasury.js';
import { RES_KEYS, zeroRes, round3 } from './ortak.js';

export const ekonomiYontemleri = {
  // Hammadde kalıcı yakımı: harcanan hammadde oyuncunun sayacına yazılır, dünya toplam arzından (haftalık kota)
  // düşer ve pazar değeri kadar katkı puanı kazandırır. Döndürür: yakılan miktar.
  burnResource(resourceKey, amount) {
    const miktar = Number(amount) || 0;
    if (miktar <= 0) return 0;

    if (!this.state.burnedResources) this.state.burnedResources = zeroRes();
    this.state.burnedResources[resourceKey] = (this.state.burnedResources[resourceKey] || 0) + miktar;
    globalPool.recordResourceBurn(resourceKey, miktar);

    const birimFiyat = Number(ammMarket.getPrice(resourceKey));
    if (isFinite(birimFiyat) && birimFiyat > 0) {
      this._addContribution(miktar * birimFiyat * (GAME_CONFIG.CONTRIBUTION?.RESOURCE_BURN_WEIGHT ?? 0.5));
      if (this._genesisKatkiYaz) this._genesisKatkiYaz(miktar * birimFiyat, 'yakim');   // Genesis katkı defteri (dolar)
    }
    return miktar;
  },

  // Kullanılınca yok olan eşyaların (parça, anahtar, kutu, parşömen) yakım kaydı: oyuncu + dünya. Yalnız kayıt,
  // ekonomiyi değiştirmez. Eksi miktar kaydı geri alır (ör. Kolezyum sırasından çıkınca anahtar iade edilir).
  burnItem(kind, amount) {
    const miktar = Number(amount) || 0;
    if (!miktar) return 0;
    if (!this.state.burnedItems) this.state.burnedItems = {};
    this.state.burnedItems[kind] = Math.max(0, (this.state.burnedItems[kind] || 0) + miktar);
    globalPool.recordItemBurn(kind, miktar);
    return miktar;
  },

  // Birden çok hammaddeyi birlikte yakar ({ wood: 5, iron: 2 }); tanımsız anahtarlar yok sayılır
  burnResources(amounts = {}) {
    const anahtarlar = RES_KEYS();
    for (const [k, v] of Object.entries(amounts || {})) {
      if (anahtarlar.includes(k) && Number(v) > 0) this.burnResource(k, Number(v));
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
    // Sponsorlu para (SPONSORLUK_TASARIMI.md): bakiyenin içindedir, hiçbir zaman çekilemez; kilitliden bağımsız ve zamanla açılmaz
    const sponsored = Math.min(total - locked, Math.max(0, Number(this.state.sponsorAda) || 0));
    return { total, locked, sponsored, free: total - locked - sponsored };
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
    const serbestPay = L.FREE_SHARE ?? 0.2;
    let kilitli = v * (1 - serbestPay);
    if (saleOf) {
      // Aynı hammaddeyi pazardan alıp geri satmak puan getirmez: önce alım tutarı düşülür
      const c = this._contribution();
      const credit = c.buyCredit;
      const fromCredit = Math.min(credit[saleOf] || 0, v);
      credit[saleOf] = (credit[saleOf] || 0) - fromCredit;
      // Kilitli ASTRA ile alınmış hammaddenin geri satışı: o kısım yine tamamen kilitli döner (kilit al-sat ile aklanamaz;
      // 13 Ekim 2026 denetimi EK-04). Serbest ASTRA ile alınmışsa lockCredit yoktur, olağan %80 kilitli kuralı işler.
      const kc = c.lockCredit;
      if (kc && kc[saleOf] > 0 && fromCredit > 0) {
        const geri = Math.min(kc[saleOf], fromCredit);
        kc[saleOf] -= geri;
        kilitli += geri * serbestPay;
      }
      this._addContribution((v - fromCredit) * (GAME_CONFIG.CONTRIBUTION?.RESOURCE_SALE_WEIGHT ?? 0.5));
    }
    this.state.lockedAda = (Number(this.state.lockedAda) || 0) + kilitli;
  },

  // Kasadan oyuncuya ödül çekimi, haftalık KİŞİ payı tavanıyla (treasury.getPersonWeekCap). Tavan yoksa doğrudan treasury.withdraw.
  // Oyuncunun bu haftaki çektiği state.kasaHaftasi içinde tutulur; hafta kimliği (treasury weekSeq) değişince sıfırlanır.
  _kasaCekKisi(poolId, istenen) {
    const T = treasury;
    const cap = (T && T.getPersonWeekCap) ? T.getPersonWeekCap(poolId) : Infinity;
    if (!(cap < Infinity)) return T.withdraw(poolId, istenen);
    let h = this.state.kasaHaftasi;
    const seq = T.state.weekSeq || 0;
    if (!h || typeof h !== 'object' || h.seq !== seq) h = this.state.kasaHaftasi = { seq };
    const kalan = Math.max(0, cap - (Number(h[poolId]) || 0));
    if (kalan <= 0) return { granted: 0, requested: istenen, scaleFactor: 0, depleted: true, budgetFull: true, personCapped: true };
    const r = T.withdraw(poolId, Math.min(istenen, kalan));
    if (r.granted > 0) h[poolId] = (Number(h[poolId]) || 0) + r.granted;
    return { ...r, requested: istenen, personCapped: istenen > kalan };
  },

  // Tam sayı ödül için aynısı (treasury.withdrawWhole gibi): kesirli artık kasaya iade edilir, kişi sayacından da düşülür.
  _kasaCekKisiTam(poolId, istenen) {
    const r = this._kasaCekKisi(poolId, istenen);
    if (!(r.granted > 0)) return r;
    const tam = Math.floor(r.granted + 1e-9);
    const artik = r.granted - tam;
    if (artik > 1e-12) {
      treasury.refund(poolId, artik);
      const h = this.state.kasaHaftasi;
      if (h && h[poolId]) h[poolId] = Math.max(0, h[poolId] - artik);
    }
    return { ...r, granted: tam, scaleFactor: r.requested > 0 ? tam / r.requested : 0 };
  },

  // Pazardan hammadde alımında sistemin gerçekten aldığı kısım (ASTRA cinsinden): komisyon + yakılan malın değeri.
  // Kilit açma payı yalnız bu tutar üzerinden işler (al-sat döngüsü kilidi açamasın).
  pazarSistemPayi(sonuc) {
    if (!sonuc) return 0;
    const komisyon = Number(sonuc.fee) || 0;
    const yakilanMal = Number(sonuc.resourceBurnFee) || 0;
    const aldigi = Number(sonuc.resourceReceived) || 0;
    const birim = (aldigi + yakilanMal) > 0 ? (Number(sonuc.netCost) || 0) / (aldigi + yakilanMal) : 0;
    return Math.max(0, komisyon + yakilanMal * birim);
  },

  // Oyunda harcanan ASTRA: önce kilitli kısım kullanılır, üstüne harcananın UNLOCK_ON_SPEND'i kadar kilit açılır.
  // boughtResource: pazardan hammadde alımı — puan vermez, aynı hammaddenin sonraki satışından düşülür; kilit açma payı
  // yalnız sinkPart (komisyon + yakılan mal, bkz. pazarSistemPayi) üzerinden işler. Verilmezse config oranlarından türetilir.
  _onAdaSpent(amount, { boughtResource = null, sinkPart = null } = {}) {
    let v = Number(amount) || 0;
    if (!(v > 0)) return;
    const L = GAME_CONFIG.LOCKED_BALANCE || {};
    // Önce sponsorlu para harcanır (oyuna girsin; A'nın kendi parası çekilebilir kalsın). Kilit açılma payı yalnız kendi paradan harcamaya uygulanır.
    const spon = Math.min(Math.max(0, Number(this.state.sponsorAda) || 0), v);
    if (spon > 0) { this.state.sponsorAda = Math.max(0, (Number(this.state.sponsorAda) || 0) - spon); v -= spon; }
    let locked = Math.max(0, Number(this.state.lockedAda) || 0);
    let kilitliOdenen = 0;
    if (v > 0) {
      kilitliOdenen = Math.min(locked, v);
      locked -= kilitliOdenen;
      // Kilit açma payı: sıradan harcamada harcananın tamamı; pazardan hammadde alımında yalnız sistemin aldığı kısım.
      // Eskiden alımın tamamı üzerinden açılıyordu: al-sat döngüsü %20 maliyetle kilidi açıyordu (12 turda 481 ASTRA
      // kayıpla 2.401 serbest). İlan pazarındaki S2b düzeltmesiyle aynı mantık (docs/v2/TARAMA_2026-10.md).
      let acmaTabani = v;
      if (boughtResource) {
        const oran = (GAME_CONFIG.AMM_FEE_RATE ?? 0.02) / (1 + (GAME_CONFIG.AMM_FEE_RATE ?? 0.02)) + (GAME_CONFIG.AMM_RESOURCE_FEE_RATE ?? 0.02);
        acmaTabani = Math.min(v, sinkPart != null ? Math.max(0, Number(sinkPart) || 0) : v * oran);
      }
      locked -= Math.min(locked, acmaTabani * (L.UNLOCK_ON_SPEND ?? 0.2));
    }
    const bal = Math.max(0, Number(this.state.adAstraBalance) || 0);
    this.state.sponsorAda = Math.min(Math.max(0, Number(this.state.sponsorAda) || 0), bal);
    this.state.lockedAda = Math.min(locked, Math.max(0, bal - this.state.sponsorAda));
    // Genesis katkı defteri (dolar): kendi parasından harcanan; pazardan hammadde alımında yalnız sistemin aldığı kısım
    if (v > 0 && this._genesisKatkiYaz) {
      const oran = (GAME_CONFIG.AMM_FEE_RATE ?? 0.02) / (1 + (GAME_CONFIG.AMM_FEE_RATE ?? 0.02)) + (GAME_CONFIG.AMM_RESOURCE_FEE_RATE ?? 0.02);
      this._genesisKatkiYaz(boughtResource ? Math.min(v, sinkPart != null ? Math.max(0, Number(sinkPart) || 0) : v * oran) : v);
    }
    if (boughtResource) {
      const c = this._contribution();
      const credit = c.buyCredit;
      credit[boughtResource] = (credit[boughtResource] || 0) + v;
      if (kilitliOdenen > 0) {                       // kilitli ödenen kısım geri satışta yine kilitli döner (_onAdaEarned)
        if (!c.lockCredit) c.lockCredit = {};
        c.lockCredit[boughtResource] = (c.lockCredit[boughtResource] || 0) + kilitliOdenen;
      }
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
      // Son 4 haftanın puanları (Genesis Yolu: "son 4 haftanın her birinde Altın"); atlanan haftalar 0
      const gecen = Math.max(1, epochId - (Number(c.epochId) || 0));
      const gecmis = Array.isArray(c.gecmis) ? c.gecmis : [];
      gecmis.push(Number(c.week) || 0);
      for (let i = 1; i < Math.min(gecen, 4); i++) gecmis.push(0);
      c.gecmis = gecmis.slice(-4);
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
    if (share > 0 && globalPool.konseyStokuKullan) globalPool.konseyStokuKullan();   // ortak stok boşta kalmaz
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

  // Karnaval çarkında yakılan hammadde: ayrı sayaca yazılır ve normal yakım gibi işlenir
  recordCarnivalResourceBurn(resourceKey, amount) {
    const miktar = Number(amount) || 0;
    if (miktar <= 0) return 0;
    if (!this.state.carnivalBurnedResources) this.state.carnivalBurnedResources = zeroRes();
    this.state.carnivalBurnedResources[resourceKey] = (this.state.carnivalBurnedResources[resourceKey] || 0) + miktar;
    this.burnResource(resourceKey, miktar);
    return miktar;
  },
};
