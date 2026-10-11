// Realm of AdAstra — GameStateManager yöntemleri: Karnaval (şans çarkı, coşku, ücretsiz oyuncu payı bilgisi)
// Piyango js/gameState/piyango.js içindedir. Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
//
// Çarkın parası: ASTRA ile çevrilen bedelin %80'i doğrudan Karnaval kasasına girer, ödüller o kasadan ödenir.
// Eşya ödülleri (parça, hammadde, anahtar) kasanın parasıyla pazardan satın alınıp verilir; pazar yetmezse ödülün
// ASTRA karşılığı kasadan ödenir. Kasada yeterli para yoksa çark kapalıdır: hiçbir ödül yoktan ödenmez.
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { ammMarket } from '../ammMarket.js';
import { treasury } from '../treasury.js';
import { decayedStreak, streakMultiplier, minContribution, FAUCET_DEFAULTS } from '../economy/faucet.js';
import { RES_KEYS } from './ortak.js';

const tr = n => Number(n).toLocaleString('tr-TR');
const karnavalAyari = () => GAME_CONFIG.CARNIVAL || {};
const yuzdeIsareti = p => (p >= 0 ? '+' : '');

export const karnavalYontemleri = {
  // Karnaval kasasından ödeme: kasada ne varsa o kadarı verilir (v1.25 öncesi boş kasada ödül yoktan ödeniyordu)
  _drawCarnival(miktar) {
    const istenen = Math.max(0, Number(miktar) || 0);
    if (!treasury || !treasury.state || !treasury.state.pools) return 0;
    const havuz = treasury.state.pools.carnival || 0;
    const odenen = Math.min(havuz, istenen);
    if (odenen <= 0) return 0;
    treasury.state.pools.carnival = havuz - odenen;
    if (!treasury.state.outflow) treasury.state.outflow = {};
    treasury.state.outflow.carnival = (treasury.state.outflow.carnival || 0) + odenen;
    treasury.state.lifetimeWithdrawn = (treasury.state.lifetimeWithdrawn || 0) + odenen;
    treasury.save();
    return odenen;
  },

  // Kasa en büyük ödülü karşılayamıyorsa çark geçici olarak kapalıdır
  isCarnivalWheelOpen() {
    const asgari = karnavalAyari().WHEEL_MIN_CARNIVAL_BALANCE || 5000;
    const bakiye = (treasury && treasury.getPool) ? treasury.getPool('carnival') : 0;
    return { open: bakiye >= asgari, balance: bakiye, minBalance: asgari };
  },

  // Karnaval coşkusu: günde bir kez +10 stamina (önceden sınırsızdı; bedava stamina açığıydı)
  carnivalCheer() {
    const sayac = this.getDailyCounters();
    if (sayac.carnivalCheer) return { success: false, message: '🎪 Bugün karnaval coşkusuna zaten katıldın. Yarın yine gel!' };
    sayac.carnivalCheer = 1;
    this.state.stamina = Math.min(this.getMaxStamina(), (this.state.stamina || 0) + 10);
    this.saveState();
    return { success: true, message: '🎪 Karnaval coşkusuna katıldın! +10 ⚡ Moral Staminası kazandın!' };
  },

  // Hammaddeyle bugün kalan çevirme hakkı
  getWheelResourceSpinsLeft() {
    const sinir = karnavalAyari().WHEEL_RESOURCE_DAILY_LIMIT ?? 3;
    return Math.max(0, sinir - (this.getDailyCounters().wheelResourceSpins || 0));
  },

  // Ücretsiz oyuncu payı: şartlar ve sadakat serisi (panel için; dağıtım sunucuda, haftalık)
  getFreePlayerPoolInfo() {
    const ayar = { ...FAUCET_DEFAULTS, ...(GAME_CONFIG.FREE_PLAYER_POOL || {}) };
    const donem = (globalPool && globalPool.state && globalPool.state.epochId) || 1;
    const seviye = Number(this.state.level) || 1;
    const hafta = this.getContributionInfo().week;
    const gereken = Math.ceil(minContribution(this.getAdaPriceMultiplier(), ayar));
    const seri = decayedStreak(this.state.faucetStreak, donem);
    const sayilirsa = (this.state.faucetStreak && this.state.faucetStreak.lastEpoch === donem) ? seri : seri + 1;
    return {
      deposited: (Number(this.state.depositedAda) || 0) > 0,
      minLevel: ayar.MIN_LEVEL, level: seviye, levelOk: seviye >= ayar.MIN_LEVEL,
      needContribution: gereken, weekContribution: hafta, contributionOk: hafta >= gereken,
      streakWeeks: seri, streakMultiplier: streakMultiplier(Math.max(1, sayilirsa), ayar), streakMax: ayar.STREAK_MAX,
      locked: ayar.LOCKED !== false
    };
  },

  // Çark bedeli (ASTRA fiyat çarpanıyla)
  getWheelCostAda() {
    return this.adaPrice(karnavalAyari().WHEEL_COST_ADA || 100);
  },

  // Dilim ağırlıklarıyla tek ödül seçer
  _carkOduluSec() {
    const dilimler = karnavalAyari().WHEEL_REWARDS;
    const toplam = dilimler.reduce((s, r) => s + (r.weight || 1), 0);
    let zar = Math.random() * toplam;
    for (const r of dilimler) {
      if (zar < r.weight) return r;
      zar -= r.weight;
    }
    return dilimler[0];
  },

  // Pazardan alınamayan eşya ödülünün yerine ödülün ASTRA karşılığı Karnaval kasasından verilir
  _carkYedekOdul(deger, etiket) {
    const odenen = this._drawCarnival(deger);
    this.state.adAstraBalance += odenen;
    this._onAdaEarned(odenen);
    return { astra: odenen, yedek: true, ozetMetni: `${etiket} yerine ${tr(odenen)} ASTRA (pazarda şu an alınamadı; 🏛️ Karnaval Hazinesinden)` };
  },

  // Eşya ödülü: kasanın bütçesiyle pazardan alınır (havuzdan mal çıkar, fiyat gerçekten yükselir), sonra teslim edilir.
  // teslim(adet) -> { satilan, astra } silo dolu olabilir; kasa ya da pazar yetmezse yedek ASTRA ödenir.
  _carkGeriAlim({ anahtar, adet, eskiFiyat, yedekDeger, etiket, yedekEtiket = etiket, basamak, ad, simge, teslim }) {
    const kasa = treasury.getPool ? treasury.getPool('carnival') : 0;
    const tahmin = ammMarket.getEstimatedCostForBuy(anahtar, adet);
    const alim = (isFinite(tahmin) && tahmin <= kasa) ? ammMarket.executeBuyAmount(anahtar, adet) : { success: false };
    if (!alim.success) return { ...this._carkYedekOdul(yedekDeger, yedekEtiket), geriAlim: null };

    const yeniFiyat = ammMarket.getPrice(anahtar) || eskiFiyat;
    const fark = yeniFiyat - eskiFiyat;
    const farkYuzde = eskiFiyat > 0 ? (fark / eskiFiyat) * 100 : 0;
    this._drawCarnival(alim.cost);
    const teslimat = teslim(adet) || {};

    let ozetMetni = `${etiket} (🏛️ Karnaval kasası pazardan satın alıp verdi: ${eskiFiyat.toFixed(basamak)} ➔ ${yeniFiyat.toFixed(basamak)} ASTRA, ${yuzdeIsareti(farkYuzde)}%${farkYuzde.toFixed(2)} 📈)`;
    if (teslimat.satilan > 0) {
      ozetMetni += ` — silo dolu olduğu için ${tr(teslimat.satilan)} adedi pazarda satıldı (+${teslimat.astra.toFixed(1)} ASTRA)`;
    }
    return {
      astra: 0, yedek: false, ozetMetni,
      siloSatilan: teslimat.satilan || 0, siloAstra: teslimat.astra || 0,
      geriAlim: {
        item: etiket, resourceKey: anahtar, amount: adet, adaSpent: alim.cost,
        oldPrice: eskiFiyat, newPrice: yeniFiyat, priceDelta: fark, priceDeltaPct: farkYuzde,
        poolName: ad, poolIcon: simge
      }
    };
  },

  // paymentMethod: 'ada' | 'ticket' | hammadde anahtarı
  spinCarnivalWheel(paymentMethod = 'ada') {
    const K = karnavalAyari();
    const bedel = this.getWheelCostAda();
    const env = this.state.inventory;

    const durum = this.isCarnivalWheelOpen();
    if (!durum.open) {
      return { success: false, wheelClosed: true, message: `🎪 Karnaval kasası yenileniyor (${tr(Math.floor(durum.balance))} / ${tr(durum.minBalance)} ASTRA). Pazar ve harcama komisyonlarıyla kasa dolunca çark yeniden açılacak.` };
    }

    // ── Bedel ──
    let burnedInfo = null;
    if (paymentMethod === 'ada') {
      if (this.state.adAstraBalance < bedel) {
        return { success: false, message: `Yetersiz ASTRA! Çark çevirmek için ${bedel} ASTRA gereklidir.` };
      }
      this.state.adAstraBalance -= bedel;
      this._onAdaSpent(bedel);
      // Bedelin %80'i doğrudan Karnaval kasasına (ödüller buradan ödenir), %20'si her harcama gibi dağıtılır
      const pay = Math.max(0, Math.min(1, K.WHEEL_CARNIVAL_SHARE ?? 0.8));
      if (pay > 0 && treasury.depositTo) treasury.depositTo('carnival', bedel * pay);
      globalPool.recordTokenSpend(bedel * (1 - pay));
    } else if (paymentMethod === 'ticket') {
      if ((this.state.lotteryTickets || 0) < 1) {
        return { success: false, message: 'Çark çevirmek için en az 1 Piyango Biletine sahip olmalısın!' };
      }
      // Yakılan biletin ödenen bedeli de piyango ödül hesabından düşer (bilet başına ortalama)
      const biletler = this.state.lotteryTickets || 0;
      const ortalama = this.state.lotteryTicketsPaid != null && biletler > 0 ? this.state.lotteryTicketsPaid / biletler : 0;
      if (this.state.lotteryTicketsPaid != null && biletler > 0) {
        this.state.lotteryTicketsPaid = Math.max(0, this.state.lotteryTicketsPaid - ortalama);
      }
      // Satın alınmış biletin piyango kasasındaki payı Karnaval kasasına geçer (ödülü artık çark öder)
      const tasinan = Math.min(ortalama * (1 - (K.LOTTERY?.AMORTI_SHARE ?? 0.02)), Math.max(0, Number(this.state.lotteryPool) || 0));
      if (tasinan > 0 && treasury.depositTo) { this.state.lotteryPool -= tasinan; treasury.depositTo('carnival', tasinan); }
      this.state.lotteryTickets -= 1;
    } else if (RES_KEYS().includes(paymentMethod)) {
      const gunlukSinir = K.WHEEL_RESOURCE_DAILY_LIMIT ?? 3;
      const sayac = this.getDailyCounters();
      if ((sayac.wheelResourceSpins || 0) >= gunlukSinir) {
        return { success: false, message: `🎪 Bugün hammaddeyle ${gunlukSinir} kez çevirdin (günlük sınır). Yarın yine gel ya da ASTRA / biletle çevir.` };
      }
      const fiyat = ammMarket.getPrice(paymentMethod) || 1.0;
      const gereken = Math.ceil(bedel / fiyat);
      const hamAd = this.getResourceNameTr(paymentMethod);
      if ((env[paymentMethod] || 0) < gereken) {
        return { success: false, message: `Yetersiz ${hamAd}! ${bedel} ASTRA değerinde hammadde için ${gereken} adet gereklidir.` };
      }
      env[paymentMethod] -= gereken;
      sayac.wheelResourceSpins = (sayac.wheelResourceSpins || 0) + 1;
      // Ödenen hammaddenin YARISI yakılır, YARISI pazarda satılır ve gelen ASTRA Karnaval kasasına girer.
      // Pazar fiyatı tabandaysa satılamayan kısım da yakılır. (Burada ASTRA kaydı yapılmaz: ortada ASTRA yok;
      // eskiden recordTokenSpend çağrısı hazineye yoktan para yazıyordu.)
      const satilacak = Math.min(Math.floor(gereken / 2), ammMarket.getMaxSellBeforeFloor(paymentMethod));
      let satilan = 0;
      let kasayaGiren = 0;
      if (satilacak > 0) {
        const satis = ammMarket.executeSell(paymentMethod, satilacak);
        if (satis && satis.success && satis.adAstraReceived > 0) {
          satilan = satilacak;
          kasayaGiren = treasury.depositTo ? treasury.depositTo('carnival', satis.adAstraReceived) : 0;
        }
      }
      const yakilan = gereken - satilan;
      this.recordCarnivalResourceBurn(paymentMethod, yakilan);
      burnedInfo = { resource: paymentMethod, resourceNameTr: hamAd, amount: yakilan, soldQty: satilan, carnivalIn: kasayaGiren, fromPayment: true };
    } else {
      return { success: false, message: 'Geçersiz ödeme yöntemi!' };
    }

    // ── Ödül ──
    const odul = this._carkOduluSec();
    let ozetMetni = odul.name;
    let geriAlimBilgisi = null;
    let kazanc = { astra: 0, yedek: false, siloSatilan: 0, siloAstra: 0, parcaBirikti: false, kod: null };

    const geriAlimUygula = (cfg) => {
      const sonuc = this._carkGeriAlim(cfg);
      ozetMetni = sonuc.ozetMetni;
      geriAlimBilgisi = sonuc.geriAlim;
      kazanc = { ...kazanc, astra: sonuc.astra, yedek: sonuc.yedek, siloSatilan: sonuc.siloSatilan || 0, siloAstra: sonuc.siloAstra || 0 };
    };

    if (odul.type === 'ada') {
      // Havadan basılmaz: doğrudan Karnaval kasasından karşılanır
      const odenen = this._drawCarnival(this.adaPrice(odul.amount || 0));
      this.state.adAstraBalance += odenen;
      this._onAdaEarned(odenen);
      ozetMetni = `${tr(odenen)} ASTRA (🏛️ Karnaval Hazinesinden Karşılandı)`;
      kazanc.astra = odenen;
    } else if (odul.key === 'fragments') {
      const adet = odul.amount || 1;
      const eski = ammMarket.getPrice('fragments') || 45.0;
      geriAlimUygula({
        anahtar: 'fragments', adet, eskiFiyat: eski, basamak: 2,
        yedekDeger: odul.valAda || Math.round(adet * eski),
        etiket: `${adet} Teçhizat Parçası`, ad: 'Teçhizat Parçası', simge: '🧩',
        teslim: (n) => { env.fragments = (env.fragments || 0) + n; }
      });
    } else if (odul.type === 'amm_raw' || RES_KEYS().includes(odul.key)) {
      const anahtar = odul.key;
      const eski = ammMarket.getPrice(anahtar) || 1.0;
      const adet = odul.amount || Math.max(1, Math.round((odul.adaVal || 50) / eski));
      const hamAd = this.getResourceNameTr(anahtar);
      const meta = (GAME_CONFIG.RESOURCE_META || {})[anahtar] || {};
      geriAlimUygula({
        anahtar, adet, eskiFiyat: eski, basamak: 4,
        yedekDeger: odul.adaVal || odul.valAda || 50,
        etiket: `${tr(adet)} ${hamAd}`, yedekEtiket: odul.name, ad: hamAd, simge: meta.icon || '📦',
        teslim: (n) => {
          // Silo doluysa sığmayan kısım kaybolmaz, pazarda satılıp ASTRA olarak verilir
          const depo = this.storeResourceOrSell(anahtar, n, 'Çark ödülü');
          return { satilan: depo.soldQty, astra: depo.adaGained };
        }
      });
    } else if (odul.type === 'key' || odul.id === 'box_key') {
      const adet = odul.amount || 1;
      const eski = ammMarket.getPrice('keys') || 1000.0;
      geriAlimUygula({
        anahtar: 'keys', adet, eskiFiyat: eski, basamak: 1,
        yedekDeger: odul.valAda || Math.round(adet * eski),
        etiket: `${adet} Pandora Kutusu Anahtarı`, ad: 'Arena Anahtarı', simge: '🔑',
        teslim: (n) => { this.state.arenaKeys = (this.state.arenaKeys || 0) + n; }
      });
    } else if (odul.type === 'bot_free') {
      this.buyTavernaAutomationBot(true, odul.hours || 24);
    } else if (odul.type === 'scroll') {
      env[odul.key] = (env[odul.key] || 0) + odul.amount;
    } else if (odul.type === 'ticket_shard') {
      // 3 amorti bileti = 1 çark çevirme / piyango bileti
      this.state.wheelTicketShards = (this.state.wheelTicketShards || 0) + 1;
      if (this.state.wheelTicketShards >= 3) {
        this.state.wheelTicketShards -= 3;
        this.state.lotteryTickets = (this.state.lotteryTickets || 0) + 1;
        ozetMetni += ' (🎉 3 Parça Birikti: +1 Çark Çevirme / Piyango Bileti Kazanıldı!)';
        kazanc.parcaBirikti = true;
      }
    } else if (odul.type === 'analysis_code') {
      const kod = `ALPHAVAX-COIN-${Date.now().toString(36).toUpperCase()}`;
      if (!Array.isArray(this.state.redeemCodes)) this.state.redeemCodes = [];
      this.state.redeemCodes.push({ code: kod, type: 'coin_analysis', created: Date.now(), status: 'pending_integration' });
      // Dürüst açıklama: kod henüz AlphavaxTrade sitesinde geçmiyor, sunucu bağlantısından sonra etkinleşecek
      ozetMetni = `🎫 Coin Analiz Kuponu: ${kod} — Envanterinde saklandı. AlphavaxTrade sitesiyle bağlantı kurulduğunda kullanılabilecek (şu an sitede geçerli değil).`;
      kazanc.kod = kod;
    }

    this.saveState();

    let mesaj;
    if (geriAlimBilgisi) {
      mesaj = `🎉 Çarktan kazandın: ${ozetMetni}! (🏛️ Karnaval kasasından ${tr(geriAlimBilgisi.adaSpent)} ASTRA ile pazardan satın alınıp teslim edildi)`;
    } else if (burnedInfo) {
      mesaj = `🔥 ${tr(burnedInfo.amount)} ${burnedInfo.resourceNameTr} yakıldı${burnedInfo.soldQty > 0 ? `, ${tr(burnedInfo.soldQty)} adedi pazarda satılıp Karnaval kasasına ${tr(Math.floor(burnedInfo.carnivalIn))} ASTRA kazandırdı` : ''}! Çarktan kazandın: ${ozetMetni}`;
    } else {
      mesaj = `🎉 Tebrikler! Çarktan kazandın: ${ozetMetni}`;
    }

    return {
      success: true,
      reward: odul,
      slice: odul,
      rewardSummaryText: ozetMetni,
      burnedInfo,
      buybackInfo: geriAlimBilgisi,
      gain: kazanc,
      message: mesaj
    };
  }
};
