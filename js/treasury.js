// Realm of AdAstra — Hazine Defteri (Treasury Ledger)
// ============================================================================
// EKONOMİK ANAYASA, YASA 1: "Ödül basılmaz, transfer edilir."
//
// Hiçbir modül oyuncunun bakiyesine doğrudan ASTRA eklemez. Her ödül bu defterden
// withdraw() ile çekilir; kasada para yoksa ödül küçülür ya da hiç verilmez.
// Dağıtılan toplam, biriken toplamı aşamaz.
//
// Defterin tuttuğu kasalar (config: TREASURY_SEED): zindan, kolezyum (arena), dünya
// bossu, geri alım, görev, karnaval, Fatih, Konsey, Universe rezervi (kilitli).
// ============================================================================

import { GAME_CONFIG } from './config.js';
import { readJSON, writeJSON, removeJSON } from './storage.js';

const TOHUMLAR = GAME_CONFIG.TREASURY_SEED;
const KASA_KIMLIKLERI = Object.keys(TOHUMLAR);
const KILITLI_KASALAR = new Set(GAME_CONFIG.TREASURY_LOCKED_POOLS || []);
const kasaMi = id => KASA_KIMLIKLERI.includes(id);
const sifirKasalar = () => Object.fromEntries(KASA_KIMLIKLERI.map(id => [id, 0]));

// Geri alım kasası fiyat savunmasıdır, vatandaşa ödeme sayılmaz
const VATANDASA_ODENMEZ = 'ammBuyback';

function tohumDurumu() {
  return {
    pools: { ...TOHUMLAR },
    lifetimeDeposited: 0,
    lifetimeWithdrawn: 0,
    lifetimeBurned: 0,
    inflow: sifirKasalar(),     // kasa bazında toplam giriş (ödeme gücü hesabı için)
    outflow: sifirKasalar(),    // kasa bazında toplam çıkış
    lastScaleFactor: 1,         // son ödülün isteğe oranı (panelde gösterilir)
    // Bu hafta kasalardan vatandaşlara gerçekten ödenen toplam; server/kapi.js her hafta okuyup sıfırlar
    weekGrantedToCitizens: 0,
    // Haftalık ödeme bütçesi: kasa → bu hafta çekilebilecek tavan / harcanan; son haftaların girişi
    weekBudget: {},
    weekSpent: {},
    inflowMark: {},
    inflowHistory: []
  };
}

export class TreasuryLedger {
  constructor() {
    this.storageKey = 'adastra_treasury_ledger_v4';
    this.bypassBudget = false;   // true iken haftalık bütçe yok sayılır (haftalık hesaplaşma ödemeleri)
    this.state = this.load();
  }

  // ── Kayıt ──────────────────────────────────────────────────────────────
  load() {
    const taban = tohumDurumu();
    if (typeof localStorage === 'undefined') return taban;
    const { data } = readJSON(this.storageKey);
    if (!data) return taban;
    return {
      ...taban,
      ...data,
      pools: { ...taban.pools, ...(data.pools || {}) },
      inflow: { ...taban.inflow, ...(data.inflow || {}) },
      outflow: { ...taban.outflow, ...(data.outflow || {}) }
    };
  }

  save() {
    if (typeof localStorage === 'undefined') return;
    writeJSON(this.storageKey, this.state);
  }

  reset() {
    if (typeof localStorage !== 'undefined') removeJSON(this.storageKey);
    this.state = this.load();
    this.save();
  }

  resetToSeed() {
    this.reset();
  }

  // ── Giriş ──────────────────────────────────────────────────────────────
  // Oyuncu harcamasının hazine payı TREASURY_ALLOCATION oranlarıyla kasalara bölünür.
  // (Universe rezervi pay almaz.)
  deposit(treasuryShare) {
    const miktar = Number(treasuryShare);
    if (!isFinite(miktar) || miktar <= 0) return { allocations: {} };

    const oranlar = GAME_CONFIG.TREASURY_ALLOCATION;
    const allocations = {};
    for (const id of KASA_KIMLIKLERI) {
      const pay = miktar * (oranlar[id] || 0);
      if (!(pay > 0)) continue;
      this.state.pools[id] = (this.state.pools[id] || 0) + pay;
      this.state.inflow[id] = (this.state.inflow[id] || 0) + pay;
      allocations[id] = pay;
    }
    this.state.lifetimeDeposited += miktar;
    this.save();
    return { allocations };
  }

  // Tek bir kasaya doğrudan giriş (ör. zindan kapı harcının tamamı zindan kasasına)
  depositTo(poolId, amount) {
    const miktar = Number(amount);
    if (!kasaMi(poolId) || !isFinite(miktar) || miktar <= 0) return 0;
    this.state.pools[poolId] = (this.state.pools[poolId] || 0) + miktar;
    this.state.inflow[poolId] = (this.state.inflow[poolId] || 0) + miktar;
    this.state.lifetimeDeposited += miktar;
    this.save();
    return miktar;
  }

  recordBurn(amount) {
    if (!isFinite(amount) || amount <= 0) return;
    this.state.lifetimeBurned += amount;
    this.save();
  }

  // ── Haftalık ödeme bütçesi ─────────────────────────────────────────────
  _budgeted(poolId) {
    return !this.bypassBudget && this.state.weekBudget && this.state.weekBudget[poolId] != null;
  }

  _budgetLeft(poolId) {
    if (!this._budgeted(poolId)) return Infinity;
    return Math.max(0, this.state.weekBudget[poolId] - (this.state.weekSpent[poolId] || 0));
  }

  // Yeni haftanın bütçelerini açar (haftalık hesaplaşmanın sonunda; ilk açılışta da bir kez).
  // Giriş = kasanın kümülatif girişindeki artış. Son INFLOW_WEEKS haftanın ortalamasının INFLOW_SHARE'i
  // bütçeye eklenir; ayrıca kasa × oran × sağlık çarpanı kadar da çekilebilir.
  // opts.aktif: o hafta aktif vatandaş sayısı (sunucu verir; kişi başı pay tavanı için). Verilmezse ya da PERSON_CAP_MIN_ACTIVE'in
  // altındaysa kişi tavanı taban sayıya göre hesaplanır (getPersonWeekCap).
  openWeekBudgets(opts = {}) {
    const B = GAME_CONFIG.TREASURY_WEEKLY_BUDGET;
    if (!B) return {};
    const st = this.state;
    st.weekSeq = (Number(st.weekSeq) || 0) + 1;                           // oyuncuların hafta sayacı bununla sıfırlanır
    st.weekActive = Math.max(0, Math.floor(Number(opts && opts.aktif) || 0));
    const isaret = st.inflowMark || {};
    const kimlikler = Object.keys(B.RATES);
    const ilkAcilis = !Object.keys(isaret).length;   // o ana dek biriken giriş bir haftanın girişi sayılmaz

    const bu = {};
    for (const id of kimlikler) {
      bu[id] = ilkAcilis ? 0 : Math.max(0, (st.inflow[id] || 0) - (Number(isaret[id]) || 0));
    }
    if (!ilkAcilis) st.inflowHistory = [...(st.inflowHistory || []), bu].slice(-B.INFLOW_WEEKS);
    st.inflowMark = Object.fromEntries(kimlikler.map(id => [id, st.inflow[id] || 0]));

    // Biten haftanın bütçesi ve harcananı izlenebilsin
    if (Object.keys(st.weekBudget || {}).length) {
      st.lastWeekBudget = st.weekBudget;
      st.lastWeekSpent = st.weekSpent;
    }
    st.weekBudget = {};
    st.weekSpent = {};
    for (const [id, oran] of Object.entries(B.RATES)) {
      const gecmis = st.inflowHistory;
      const ortalamaGiris = gecmis.reduce((t, h) => t + (h[id] || 0), 0) / Math.max(1, gecmis.length);
      const saglik = Math.max(B.HEALTH_MIN, this.getPoolHealth(id));
      st.weekBudget[id] = (st.pools[id] || 0) * oran * saglik + ortalamaGiris * B.INFLOW_SHARE;
    }
    this.save();
    return { ...st.weekBudget };
  }

  // Kişi başı haftalık pay tavanı: bütçe × PERSON_CAP_MULT ÷ max(aktif vatandaş, PERSON_CAP_MIN_ACTIVE) (13 Ekim 2026 denetimi
  // EK-05; taban 14 Ekim 2026 ikinci tur). Bütçe ya da çarpan yoksa Infinity (tarayıcı tek oyunculuk: bütçe hiç açılmaz, hesaplaşma
  // anı: bypassBudget). Aktif sayısı bilinmiyorsa (sunucunun ilk açılışı, boş hafta) ya da azsa payda tabana iner: eskiden bu
  // durumlarda tavan hiç uygulanmıyordu, ya da payda 1-3 iken çarpan yüzünden tavan bütçeyi aşıyordu.
  getPersonWeekCap(poolId) {
    const B = GAME_CONFIG.TREASURY_WEEKLY_BUDGET;
    const k = Number(B && B.PERSON_CAP_MULT);
    if (!(k > 0) || this.bypassBudget || !this._budgeted(poolId)) return Infinity;
    const taban = Math.max(1, Math.floor(Number(B.PERSON_CAP_MIN_ACTIVE) || 1));
    const aktif = Math.max(taban, Math.floor(Number(this.state.weekActive) || 0));
    return this.state.weekBudget[poolId] * k / aktif;
  }

  // Bu haftanın vatandaşa dağıtılan toplamını okur ve sıfırlar (haftalık hesaplaşmada bir kez)
  drainWeekGrantedToCitizens() {
    const toplam = Number(this.state.weekGrantedToCitizens) || 0;
    this.state.weekGrantedToCitizens = 0;
    this.save();
    return toplam;
  }

  // ── Çıkış ──────────────────────────────────────────────────────────────
  // Ödül talebi. Dönen granted, oyuncunun gerçekten alacağı miktardır; kasa zayıfsa küçülür.
  withdraw(poolId, requested) {
    const istenen = Number(requested);
    if (!kasaMi(poolId) || KILITLI_KASALAR.has(poolId) || !isFinite(istenen) || istenen <= 0) {
      return { granted: 0, requested: Math.max(0, istenen || 0), scaleFactor: 0, depleted: true, locked: KILITLI_KASALAR.has(poolId) };
    }

    const mevcut = this.state.pools[poolId] || 0;
    const butceKalan = this._budgetLeft(poolId);
    if (butceKalan <= 0) {
      return { granted: 0, requested: istenen, scaleFactor: 0, depleted: true, budgetExhausted: true, budgetFull: true };
    }

    // Tek ödül kasayı süpüremez: tek seferde en fazla TREASURY_SINGLE_DRAW_CAP kadarı
    let verilen = Math.min(istenen, mevcut * GAME_CONFIG.TREASURY_SINGLE_DRAW_CAP);

    // Sağlık yumuşatması: bütçesi olan kasalarda bütçenin kendi sağlık çarpanı bunu zaten yapar
    // (ikinci kez uygulamak zayıflamayı iki kez hissettiriyordu); bütçesiz kasalarda burada uygulanır.
    if (!this._budgeted(poolId)) {
      const saglik = this.getPoolHealth(poolId);
      if (saglik < 1) verilen *= Math.max(GAME_CONFIG.TREASURY_MIN_PAYOUT_RATIO, saglik);
    }

    const butceOncesi = Math.min(verilen, mevcut);
    verilen = Math.max(0, Math.min(butceOncesi, butceKalan));
    const butceDoldu = this._budgeted(poolId) && verilen < butceOncesi;
    if (verilen <= 0) return { granted: 0, requested: istenen, scaleFactor: 0, depleted: true };

    this.state.pools[poolId] = mevcut - verilen;
    this.state.outflow[poolId] = (this.state.outflow[poolId] || 0) + verilen;
    this.state.lifetimeWithdrawn += verilen;
    this.state.lastScaleFactor = verilen / istenen;
    if (this._budgeted(poolId)) this.state.weekSpent[poolId] = (this.state.weekSpent[poolId] || 0) + verilen;
    if (poolId !== VATANDASA_ODENMEZ) {
      this.state.weekGrantedToCitizens = (Number(this.state.weekGrantedToCitizens) || 0) + verilen;
    }
    this.save();

    return {
      granted: verilen,
      requested: istenen,
      scaleFactor: verilen / istenen,
      depleted: false,
      budgetFull: butceDoldu,
      poolRemaining: this.state.pools[poolId]
    };
  }

  // Çekilen miktarın bir kısmını kasaya geri koyar; withdraw()'ın kayıtlarını (çıkış, yaşam boyu çıkış,
  // bu haftanın dağıtılanı, harcanan bütçe) aynen geri alır. Ödülü yuvarlayan yollarda kesirli artık
  // kasada kalsın, ASTRA ne kaybolsun ne yoktan oluşsun diye.
  refund(poolId, amount) {
    const miktar = Number(amount);
    if (!kasaMi(poolId) || !isFinite(miktar) || miktar <= 0) return 0;
    this.state.pools[poolId] = (this.state.pools[poolId] || 0) + miktar;
    this.state.outflow[poolId] = Math.max(0, (this.state.outflow[poolId] || 0) - miktar);
    this.state.lifetimeWithdrawn = Math.max(0, this.state.lifetimeWithdrawn - miktar);
    if (this._budgeted(poolId)) {
      this.state.weekSpent[poolId] = Math.max(0, (this.state.weekSpent[poolId] || 0) - miktar);
    }
    if (poolId !== VATANDASA_ODENMEZ) {
      this.state.weekGrantedToCitizens = Math.max(0, (Number(this.state.weekGrantedToCitizens) || 0) - miktar);
    }
    this.save();
    return miktar;
  }

  // Tam sayı ASTRA ödülü: withdraw() gibi, ama oyuncuya verilen tam sayıya indirilir; kesirli artık iade edilir.
  withdrawWhole(poolId, requested) {
    const r = this.withdraw(poolId, requested);
    if (!(r.granted > 0)) return r;
    const tam = Math.floor(r.granted + 1e-9);
    const artik = r.granted - tam;
    if (artik > 1e-12) this.refund(poolId, artik);
    return { ...r, granted: tam, scaleFactor: r.requested > 0 ? tam / r.requested : 0 };
  }

  // Geri alım kasasından AMM fiyat desteği için bütçe çekilir (ödül değildir: bütçeye ve vatandaş toplamına girmez)
  drawBuyback(amount) {
    const mevcut = this.state.pools.ammBuyback || 0;
    const verilen = Math.max(0, Math.min(Number(amount) || 0, mevcut));
    if (verilen <= 0) return 0;
    this.state.pools.ammBuyback = mevcut - verilen;
    this.state.outflow.ammBuyback += verilen;
    this.save();
    return verilen;
  }

  // ── Okuma ──────────────────────────────────────────────────────────────
  // Kasa sağlığı: hedef rezervin ne kadarı duruyor? (1 = tam, 0 = boş)
  getPoolHealth(poolId) {
    const hedef = GAME_CONFIG.TREASURY_TARGET_RESERVE[poolId] || 1;
    return Math.max(0, Math.min(1, (this.state.pools[poolId] || 0) / hedef));
  }

  getPool(poolId) {
    return this.state.pools[poolId] || 0;
  }

  getSummary() {
    const pools = KASA_KIMLIKLERI.map(id => ({
      id,
      name: GAME_CONFIG.TREASURY_POOL_NAMES[id] || id,
      balance: this.state.pools[id] || 0,
      target: GAME_CONFIG.TREASURY_TARGET_RESERVE[id] || 0,
      health: this.getPoolHealth(id),
      inflow: this.state.inflow[id] || 0,
      outflow: this.state.outflow[id] || 0
    }));

    const { lifetimeDeposited, lifetimeWithdrawn, lifetimeBurned } = this.state;
    return {
      pools,
      totalBalance: pools.reduce((t, p) => t + p.balance, 0),
      avgHealth: pools.reduce((t, p) => t + p.health, 0) / pools.length,
      lifetimeDeposited,
      lifetimeWithdrawn,
      lifetimeBurned,
      // Ödeme gücü: girenin ne kadarı hâlâ dağıtılabilir durumda
      solvency: lifetimeDeposited > 0 ? 1 - (lifetimeWithdrawn / lifetimeDeposited) : 1
    };
  }
}

export const treasury = new TreasuryLedger();
