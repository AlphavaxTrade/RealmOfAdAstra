// Realm of AdAstra — GameStateManager yöntemleri: Taverna otomasyon botu (döngü, duraklama, açık kapatma, süre)
// 11 Ekim 2026'da baştan yazıldı; kurallar ve sayılar öncekiyle aynı (4000 adımlık altın kayıt değişmedi).
// Paket satın alma, silo ve ücret hesabı botPaketi.js'te.
import { GAME_CONFIG } from '../config.js';
import { ammMarket } from '../ammMarket.js';
import { RES_KEYS, zeroRes, round3, kaynakAdi } from './ortak.js';

// Botun kesintisiz çalışması için her temel malzemeden depoda bulunması gereken en az miktar
const ASGARI_STOK = Math.max(...['iron', 'wood', 'wheat'].map((k) => Number((GAME_CONFIG.TAVERNA_BOT.REQUIRED_PREREQUISITES || {})[k]) || 50));   // config önkoşulu (19 Ekim 2026: 50 x HAMMADDE_ADEDI_CARPANI)
// Önkoşul listesindeki sıra (eksik metni bu sırayla yazılır)
const ONKOSUL_MALZEMELERI = [
  { key: 'iron', name: 'Demir', icon: '⛏️' },
  { key: 'wood', name: 'Odun', icon: '🌲' },
  { key: 'wheat', name: 'Buğday', icon: '🌾' }
];
const GUN_MS = 24 * 3600 * 1000;

// Botun kasada her zaman bırakacağı ASTRA (önkoşul)
const astraTabani = () => Number(GAME_CONFIG.TAVERNA_BOT?.REQUIRED_PREREQUISITES?.adAstra ?? 0.5);

// Anlık satış fiyatı (alınamıyorsa pazar fiyatı; en az 0,01)
function satisFiyati(anahtar) {
  const tahmin = ammMarket.getEstimatedAdAstraForSell(anahtar, 1);
  const p = (!tahmin || isNaN(tahmin) || tahmin <= 0) ? ammMarket.getPrice(anahtar) : tahmin;
  return Math.max(0.01, p || 0.5);
}

/**
 * Bot ASTRA açığını kapatırken hangi malzemeden kaç birim satacağını planlar (saf kural).
 * Kural: tüm malzemelerden EŞİT miktar satılır; bir malzemenin stoğu yetmezse ortak en düşük
 * stok kadar eşit satılır, kalan açık stoğu artanlar arasında eşit paylaştırılır.
 * @param {string[]} anahtarlar  kaynak anahtarları
 * @param {Object} satilabilir   her kaynaktan satılabilir miktar (taban ve ayrılanlar düşülmüş)
 * @param {Object} fiyat         her kaynağın anlık satış fiyatı
 * @param {number} hedef         toplanması gereken ASTRA
 */
export function esitSatisPlani(anahtarlar, satilabilir, fiyat, hedef) {
  const planlanan = zeroRes();
  const fiyatToplami = anahtarlar.reduce((t, n) => t + fiyat[n], 0);
  const birim = Math.max(1, Math.ceil(hedef / fiyatToplami));
  const enAz = Math.min(...anahtarlar.map(n => satilabilir[n]));

  if (enAz >= birim) {
    for (const n of anahtarlar) planlanan[n] = birim;
  } else if (enAz > 0) {
    for (const n of anahtarlar) planlanan[n] = enAz;
    const kalanAcik = Math.max(0, hedef - enAz * fiyatToplami);
    if (kalanAcik > 0) {
      const artanlar = anahtarlar.filter(n => satilabilir[n] - enAz > 0);
      if (artanlar.length > 0) {
        const artanFiyat = artanlar.reduce((t, n) => t + fiyat[n], 0);
        const ekBirim = Math.ceil(kalanAcik / artanFiyat);
        for (const n of artanlar) planlanan[n] += Math.min(satilabilir[n] - enAz, ekBirim);
      }
    }
  } else {
    // En az bir kaynağın stoğu yok: stoğu olanlar arasında eşit miktar sat
    const eldekiler = anahtarlar.filter(n => satilabilir[n] > 0);
    if (eldekiler.length > 0) {
      const eldekiFiyat = eldekiler.reduce((t, n) => t + fiyat[n], 0);
      const enAzEldeki = Math.min(...eldekiler.map(n => satilabilir[n]));
      let esit = Math.min(Math.ceil(hedef / eldekiFiyat), enAzEldeki);
      if (esit < 1 && enAzEldeki >= 1) esit = 1;
      for (const n of eldekiler) planlanan[n] = Math.min(satilabilir[n], esit);
    }
  }
  return planlanan;
}

export const botYontemleri = {
  // 🤖 24 SAATLİK TAVERNA OTONOM SEFER, HASAT, TAMİR, STAMİNA & SİLO DÖNGÜSÜ
  // Sıra (hasat önkoşuldan ÖNCE: bekleyen ürün toplanmadan pazardan alım yapılmaz):
  //   1. biten seferleri topla  2. önkoşul / duraklama  3. aletleri onar  4. staminayı yalnız
  //   sıradaki seferlere yetecek kadar doldur  5. silo bakımı (yalnız bu turda toplama olduysa)
  //   6. önkoşul / duraklama tekrar  7. seferleri başlat
  runTavernaAutomationCycle() {
    if (!this.hasPurchasedBot()) return { active: false, paused: false, actions: [] };

    const actions = [];
    const duraklatildi = () => {
      if (actions.length > 0) {
        this.state.lastBotActions = actions;
        this.saveState();
      }
      return { active: false, paused: true, actions };
    };

    const topladi = this._botSeferleriTopla(actions);
    this.updateBotPauseState();
    if (this.isBotPaused()) return duraklatildi();

    this._botAletleriOnar(actions);
    const hazirlar = this._botBaslatilabilirSeferler();
    this._botStaminaHazirla(hazirlar.length, actions);
    if (topladi) this._botSiloBakimi(actions);

    this.updateBotPauseState();
    if (this.isBotPaused()) return duraklatildi();

    this._botSeferleriBaslat(hazirlar, actions);
    if (actions.length > 0) {
      this.state.lastBotActions = actions;
      this.saveState();
    }
    return { active: true, actions };
  },

  // Süresi dolan seferleri toplar; en az bir sefer toplandıysa true
  _botSeferleriTopla(actions) {
    let topladi = false;
    for (const nodeId of RES_KEYS()) {
      const sefer = this.state.activeExpeditions ? this.state.activeExpeditions[nodeId] : null;
      if (!sefer || !(sefer.isCompleted || sefer.elapsedSeconds >= sefer.durationSeconds)) continue;
      sefer.isCompleted = true;
      const sonuc = this.claimExpedition(nodeId);
      if (sonuc && sonuc.success) {
        actions.push(`✅ ${GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId].name} seferi toplandı.`);
        topladi = true;
      }
    }
    return topladi;
  },

  // Aşınmış aletleri depodaki kaynakla onarır. Kasa güvenlik payının altına inecekse önce
  // depodan eşit miktar satıp ASTRA toplar; kaynak yetmezse onarım seferlerden gelene kadar bekler.
  _botAletleriOnar(actions) {
    for (const nodeId of RES_KEYS()) {
      const aletId = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId].requiredTool;
      const alet = this.state.tools ? this.state.tools[aletId] : null;
      const azami = GAME_CONFIG.TOOLS[aletId]?.maxDurability || 4320;
      if (!(alet && alet.durability < azami)) continue;

      const bedel = this.calculateRepairCost(aletId);
      if (!bedel || !(bedel.missingDurability > 0)) continue;

      if (!this._botCanSpend(bedel.adAstraCost)) {
        const fon = this.autoFundBotAdaDeficit(bedel.adAstraCost + this.getBotAdaReserve(), { wood: bedel.woodCost, iron: bedel.ironCost });
        if (fon && fon.funded) {
          const satilanlar = Object.entries(fon.toSell || {})
            .filter(([, adet]) => adet > 0)
            .map(([k, adet]) => `${adet} ${kaynakAdi(k)}`)
            .join(', ');
          actions.push(`⚖️ Bot Alet Tamir Finansmanı: Tamir için gereken ${bedel.adAstraCost} ASTRA için kaynaklardan eşit miktarda (${satilanlar}) satılarak +${fon.totalEarned?.toFixed(2)} ASTRA temin edildi.`);
        }
      }

      const depo = this.state.inventory || {};
      if ((depo.wood || 0) >= bedel.woodCost &&
          (depo.iron || 0) >= bedel.ironCost &&
          (this.state.adAstraBalance || 0) >= bedel.adAstraCost) {
        const sonuc = this.repairTool(aletId);
        if (sonuc && sonuc.success) {
          actions.push(`🔨 ${GAME_CONFIG.TOOLS[aletId].name} otomatik tamir edildi (${azami}/${azami}).`);
        }
      }
    }
  },

  // Aleti sağlam ve seferi olmayan kaynaklar: bu turda başlatılabilecek seferler
  _botBaslatilabilirSeferler() {
    return RES_KEYS().filter(nodeId => {
      if (this.state.activeExpeditions && this.state.activeExpeditions[nodeId]) return false;
      const aletId = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId].requiredTool;
      const alet = this.state.tools ? this.state.tools[aletId] : null;
      // Çıkarma hakkı bitmiş kaynakta sefer başlatılmaz: stamina ve alet boşuna harcanmasın (mahsul zaten izin beklerdi)
      if (typeof this.getUretimHakki === 'function') { const hak = this.getUretimHakki(nodeId); if (hak && Number(hak.canTake) < 2) return false; }
      return !!alet && alet.durability > 0;
    });
  },

  // Staminayı asla tamamen doldurmaz; yalnız başlatılacak seferler kadar buğdayla tamamlar
  _botStaminaHazirla(seferSayisi, actions) {
    if (seferSayisi <= 0) return;
    const gerekli = seferSayisi * this.getExpeditionStaminaCost();
    const mevcut = this.state.stamina || 0;
    if (gerekli <= mevcut) return;
    const sonuc = this.refillStaminaExact(gerekli - mevcut);
    if (sonuc && sonuc.success && sonuc.wheatUsed > 0) {
      actions.push(`🍞 ${sonuc.wheatUsed} Buğday ile seferler için +${Math.round(sonuc.gainedStamina)} Stamina sağlandı.`);
    }
  },

  // Silo bakımı yalnız bu turda sefer toplandıysa yapılır: bot alındığı anda ya da boşta beklerken
  // kontrolsüz seviye atlayıp kasayı eritemez. Seçime göre silo yükseltilir ya da fazlası satılır.
  _botSiloBakimi(actions) {
    if (this.state.botSiloAutoUpgrade) {
      const yukseltme = this.getWarehouseUpgradeCost();
      if (yukseltme && yukseltme.is80PercentFull && !yukseltme.accountLevelBlocked) {
        const sonuc = this.tryAutoUpgradeWarehouseWithAdaFinancing();
        if (sonuc && sonuc.upgraded) {
          actions.push(`🏰 Silo otomatik Seviye ${this.state.warehouseLevel}'e yükseltildi!`);
        }
      }
      return;
    }
    for (const nodeId of RES_KEYS()) {
      const sonuc = this.handleBotSiloSpace(nodeId, 1);
      if (sonuc && sonuc.action === 'sold') {
        actions.push(`⚖️ Satış Modu (%50 Rezerve): ${sonuc.amountSold} ${nodeId} satıldı (+${sonuc.adAstraReceived?.toFixed(1)} ASTRA).`);
      }
    }
  },

  _botSeferleriBaslat(hazirlar, actions) {
    for (const nodeId of hazirlar) {
      if (this.state.activeExpeditions && this.state.activeExpeditions[nodeId]) continue;
      const aletId = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId].requiredTool;
      const alet = this.state.tools ? this.state.tools[aletId] : null;
      if (!(alet && alet.durability > 0 && (this.state.stamina || 0) >= this.getExpeditionStaminaCost())) continue;
      const sonuc = this.startExpedition(nodeId);
      if (sonuc && sonuc.success) {
        actions.push(`🚀 ${GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId].name} seferi otonom başlatıldı.`);
      }
    }
  },

  // 🔍 Botun kesintisiz çalışma koşulu: Demir, Odun, Buğday ≥ 50 ve kasada en az taban ASTRA
  checkBotPrerequisites() {
    const depo = this.state.inventory || {};
    const astra = this.state.adAstraBalance || 0;
    const astraGerek = astraTabani();
    const missing = [];

    for (const m of ONKOSUL_MALZEMELERI) {
      const mevcut = depo[m.key] || 0;
      if (mevcut < ASGARI_STOK) {
        missing.push({ key: m.key, name: m.name, icon: m.icon, current: mevcut, required: ASGARI_STOK, missing: Math.ceil(ASGARI_STOK - mevcut) });
      }
    }
    if (astra < astraGerek) {
      missing.push({ key: 'adAstra', name: 'ASTRA', icon: '🟣', current: astra, required: astraGerek, missing: round3(astraGerek - astra) });
    }

    return {
      isMet: missing.length === 0,
      missing,
      missingText: missing.map(m => `${m.missing} ${m.icon} ${m.name}`).join(', ')
    };
  },

  /**
   * 🤖 Bot çalışırken ASTRA yetmezse depodan EŞİT miktarda kaynak satıp açığı kapatır.
   * Her malzemenin 50'lik taban stoğu ve `preserveResources` (örn. tamirde harcanacak odun/demir)
   * satılmaz; satış bu yüzden alım-satım döngüsüne girmez.
   * @param {number} neededTarget  hedef ASTRA bakiyesi
   * @param {Object|null} preserveResources  satılmayacak miktarlar, örn. {wood, iron}
   */
  autoFundBotAdaDeficit(neededTarget = 50, preserveResources = null) {
    const mevcutAstra = Number(this.state.adAstraBalance) || 0;
    if (mevcutAstra >= neededTarget) {
      return { funded: false, reason: 'sufficient_ada', currentBalance: mevcutAstra };
    }

    // %3 marj + 0,02 ASTRA tampon: pazar fiyatı kayarsa da hedefe ulaşılsın
    const toplanacak = Math.max(0.01, (neededTarget - mevcutAstra) * 1.03 + 0.02);
    const depo = this.state.inventory = this.state.inventory || {};
    const anahtarlar = RES_KEYS();

    const fiyat = {};
    const satilabilir = {};
    for (const n of anahtarlar) {
      fiyat[n] = satisFiyati(n);
      satilabilir[n] = Math.max(0, (Number(depo[n]) || 0) - (preserveResources?.[n] || 0) - ASGARI_STOK);
    }

    const toSell = esitSatisPlani(anahtarlar, satilabilir, fiyat, toplanacak);
    if (anahtarlar.every(n => !(toSell[n] > 0))) {
      return { funded: false, reason: 'no_inventory_available' };
    }

    let totalEarned = 0;
    const soldBreakdown = {};
    for (const n of anahtarlar) {
      const adet = toSell[n] || 0;
      if (adet <= 0) continue;
      const sonuc = ammMarket.executeSell(n, adet);
      if (sonuc && sonuc.success) {
        depo[n] = Math.max(0, (depo[n] || 0) - adet);
        const kazanc = Number(sonuc.adAstraReceived) || 0;
        totalEarned += kazanc;
        soldBreakdown[n] = { qty: adet, earned: kazanc };
      }
    }

    if (!(totalEarned > 0)) return { funded: false, reason: 'sell_execution_failed' };

    this.state.adAstraBalance = (this.state.adAstraBalance || 0) + totalEarned;
    for (const [k, v] of Object.entries(soldBreakdown)) this._onAdaEarned(v.earned, { saleOf: k });
    this.saveState();

    const satilanlar = anahtarlar.filter(n => toSell[n] > 0).map(n => `${toSell[n]} ${kaynakAdi(n)}`).join(', ');
    const message = `⚖️ Bot Oto-Finansman: Alet onarımı / tamir için gereken ASTRA açığı giderildi. Depodan eşit miktarda (${satilanlar}) satılarak pazardan +${totalEarned.toFixed(2)} ASTRA elde edildi.`;
    if (!this.state.lastBotActions) this.state.lastBotActions = [];
    this.state.lastBotActions.push(message);

    return { funded: true, toSell, totalEarned, soldBreakdown, newBalance: this.state.adAstraBalance, message };
  },

  /**
   * 🤖 Odun / Demir / Buğday hedefin altındaysa kasadaki ASTRA ile pazardan YALNIZ eksik kadar alır.
   * Botun durmaması içindir; silo asla doldurulmaz. Önkoşul ASTRA tabanı her zaman kasada kalır,
   * parası yetmeyen miktar alınmaz (para yoktan kapanmaz).
   */
  autoBuyBotResourceDeficit(hedef = ASGARI_STOK) {
    const depo = this.state.inventory = this.state.inventory || {};
    let kasa = Number(this.state.adAstraBalance) || 0;
    const taban = astraTabani();
    if (kasa - taban <= 0.005) {
      return { bought: false, reason: 'no_ada_balance', currentBalance: kasa };
    }

    const eksikler = [];
    for (const node of ['wood', 'iron', 'wheat']) {
      const mevcut = Number(depo[node]) || 0;
      if (mevcut < hedef) eksikler.push({ node, missing: Math.ceil(hedef - mevcut) });
    }
    if (eksikler.length === 0) return { bought: false, reason: 'no_missing_resources' };

    let toplamHarcama = 0;
    const boughtBreakdown = {};
    const alinanlar = [];

    for (const { node, missing } of eksikler) {
      const harcanabilir = kasa - taban;
      if (harcanabilir <= 0.001) break;

      let adet = missing;
      const tahmin = ammMarket.getEstimatedCostForBuy(node, adet);
      if (!isFinite(tahmin) || tahmin <= 0 || tahmin > harcanabilir) {
        const fiyat = Math.max(0.01, ammMarket.getPrice(node));
        adet = Math.min(missing, Math.floor(harcanabilir / (fiyat * 1.08)));
        while (adet > 0 && ammMarket.getEstimatedCostForBuy(node, adet) > harcanabilir) adet--;
      }
      if (adet <= 0) continue;

      const sonuc = ammMarket.executeBuyAmount(node, adet);
      if (!sonuc || !sonuc.success) continue;
      kasa -= sonuc.cost;
      this.state.adAstraBalance = kasa;
      this._onAdaSpent(sonuc.cost, { boughtResource: node, sinkPart: this.pazarSistemPayi(sonuc) });
      depo[node] = (Number(depo[node]) || 0) + sonuc.resourceReceived;
      toplamHarcama += sonuc.cost;
      boughtBreakdown[node] = { units: sonuc.resourceReceived, cost: sonuc.cost };
      alinanlar.push(`+${sonuc.resourceReceived} ${sonuc.resourceName || node}`);
    }

    if (!(toplamHarcama > 0)) return { bought: false, reason: 'buy_execution_failed' };

    this.saveState();
    const message = `🛒 Bot Asgari Oto-Tedarik: Botun durmaması için kasadaki ASTRA ile AMM pazarından ${toplamHarcama.toFixed(1)} ASTRA harcanarak (${alinanlar.join(', ')}) tamamlandı.`;
    if (!this.state.lastBotActions) this.state.lastBotActions = [];
    this.state.lastBotActions.push(message);

    return { bought: true, totalSpentAda: toplamHarcama, boughtBreakdown, newBalance: this.state.adAstraBalance, message };
  },

  // Önkoşul eksikse önce ASTRA toplar (gerekirse depodan eşit satış), sonra eksik malzemeyi alır.
  // Satış yalnız 50'nin ÜSTÜNDEKİ fazladan, alım yalnız taban ASTRA'nın ÜSTÜNDEKİ parayla yapılır.
  _botOnkosulunuTamamla() {
    let onkosul = this.checkBotPrerequisites();
    if (onkosul.isMet) return onkosul;

    const eksikMalzemeler = onkosul.missing.filter(m => RES_KEYS().includes(m.key));
    const astraEksik = onkosul.missing.some(m => m.key === 'adAstra');
    if (astraEksik || eksikMalzemeler.length > 0) {
      let alimBedeli = 0;
      for (const m of eksikMalzemeler) {
        const c = ammMarket.getEstimatedCostForBuy(m.key, m.missing);
        if (isFinite(c)) alimBedeli += c;
      }
      const gerekenAstra = astraTabani() + alimBedeli * 1.03 + 0.01;
      if ((this.state.adAstraBalance || 0) < gerekenAstra) {
        const fon = this.autoFundBotAdaDeficit(gerekenAstra);
        if (fon && fon.funded) onkosul = this.checkBotPrerequisites();
      }
    }

    if (!onkosul.isMet) {
      const malzemeEksik = onkosul.missing.some(m => RES_KEYS().includes(m.key));
      if (malzemeEksik && (this.state.adAstraBalance || 0) > astraTabani()) {
        const alim = this.autoBuyBotResourceDeficit(ASGARI_STOK);
        if (alim && alim.bought) onkosul = this.checkBotPrerequisites();
      }
    }
    return onkosul;
  },

  // ⏸️ Duraklatma / süreyi dondurma / uyandırma motoru. Önkoşul sağlanmıyorsa bot durur ve kalan
  // süresi bir saniye bile azalmaz; sağlanınca kaldığı yerden devam eder.
  updateBotPauseState() {
    const now = this._now();
    const durum = this.state;
    const satinAlinmis = (durum.tavernaBotActive && (durum.tavernaBotExpiresAt || 0) > now) ||
                         (durum.botActiveUntil && durum.botActiveUntil > now) ||
                         (durum.activeBuffs && durum.activeBuffs['auto_collector'] && (durum.activeBuffs['auto_collector'].expiresAt || 0) > now) ||
                         (durum.botPaused && (durum.botPausedRemainingMs || 0) > 0);

    if (!satinAlinmis) {
      // Süre bittiyse 24 saatlik otomatik yenileme dene
      const eskiBotIzi = durum.botActiveUntil || durum.tavernaBotExpiresAt || (durum.activeBuffs && durum.activeBuffs['auto_collector']);
      if (durum.botAutoRenew24h && eskiBotIzi && this.checkAndProcessBotAutoRenew()) {
        return { isBotPurchased: true, isPaused: false, justRenewed: true };
      }
      if (durum.botPaused) {
        durum.botPaused = false;
        durum.botPausedRemainingMs = null;
      }
      return { isBotPurchased: false, isPaused: false };
    }

    const bitis = Math.max(durum.botActiveUntil || 0, durum.tavernaBotExpiresAt || 0);
    // Üretim Hakkı bitince bot boşuna çalışmasın (19 Ekim 2026): hiçbir kaynaktan çıkarma hakkı kalmadıysa süre donar, yeni hak açılınca kaldığı yerden devam eder
    const hakBitti = this._botUretimHakkiBitti();
    const onkosul = hakBitti ? this.checkBotPrerequisites() : this._botOnkosulunuTamamla();

    if (!onkosul.isMet || hakBitti) {
      durum.botPauseReason = hakBitti ? 'hak' : 'onkosul';
      if (!durum.botPaused) {
        durum.botPaused = true;
        durum.botPausedRemainingMs = Math.max(1000, bitis - now);
        durum.botPausedAt = now;
        this.saveState();
      } else if (durum.botPausedRemainingMs > 0) {
        // Zaten duraklatılmış: bitiş saati her çağrıda ileri alınır, süre azalmaz
        durum.botActiveUntil = now + durum.botPausedRemainingMs;
        durum.tavernaBotExpiresAt = durum.botActiveUntil;
        if (durum.activeBuffs?.auto_collector) {
          durum.activeBuffs.auto_collector.expiresAt = durum.botActiveUntil;
        }
      }
      return { isBotPurchased: true, isPaused: true, prereq: onkosul, reason: durum.botPauseReason };
    }

    if (!durum.botPaused) return { isBotPurchased: true, isPaused: false };

    // Önkoşullar tamam: bot kaldığı süreyle uyanır ve hemen bir tur çalışır
    durum.botPaused = false;
    durum.botActiveUntil = now + (durum.botPausedRemainingMs || GUN_MS);
    durum.tavernaBotExpiresAt = durum.botActiveUntil;
    durum.botPausedRemainingMs = null;
    durum.botPausedAt = null;
    durum.botPauseReason = null;
    if (!durum.activeBuffs) durum.activeBuffs = {};
    durum.activeBuffs['auto_collector'] = {
      id: 'auto_collector',
      name: '24 Saatlik Otomasyon Botu',
      expiresAt: durum.botActiveUntil
    };
    this.saveState();

    try {
      this.runTavernaAutomationCycle();
    } catch (e) {
      console.warn('Bot uyanma turu hatası:', e);
    }
    return { isBotPurchased: true, isPaused: false, justResumed: true };
  },

  // Altı kaynağın hiçbirinden şu an çıkarılabilir hak yok mu (günlük açılan parça bitti ya da hafta hakkı doldu)
  _botUretimHakkiBitti() {
    if (typeof this.getUretimHakki !== 'function') return false;
    for (const k of RES_KEYS()) {
      const hak = this.getUretimHakki(k);
      if (!hak || Number(hak.canTake) >= 2) return false;
    }
    return true;
  },

  // Bir sonraki hak açılışı (ms; bilinmiyorsa 0)
  getBotNextRightAt() {
    const h = typeof this.getUretimHakki === 'function' ? this.getUretimHakki(RES_KEYS()[0]) : null;
    return h && h.nextReleaseAt ? Number(h.nextReleaseAt) : 0;
  },

  isBotPaused() {
    return !!this.state.botPaused;
  },

  // Süreli bot satın alınmış (duraklatılmış dahil) ya da bot güçlendirmesi açık mı
  hasPurchasedBot() {
    const now = this._now();
    const durum = this.state;
    const tavernaBotu = (durum.botActiveUntil && durum.botActiveUntil > now) ||
                        (durum.tavernaBotActive && durum.tavernaBotExpiresAt > now) ||
                        (durum.botPaused && (durum.botPausedRemainingMs || 0) > 0);
    return !!tavernaBotu ||
           this.isBuffActive('auto_collector') ||
           this.isBuffActive('auto_collector_weekly') ||
           this.isBuffActive('auto_collector_monthly');
  },

  // Önce duraklama durumunu günceller (uyanma / yenileme olabilir), sonra bot var mı bakar
  isAutoCollectorActive() {
    this.updateBotPauseState();
    return this.hasPurchasedBot();
  },

  getAutoCollectorExpiry() {
    if (this.state.botPaused && this.state.botPausedRemainingMs > 0) {
      return this._now() + this.state.botPausedRemainingMs;
    }
    const now = this._now();
    let enGec = 0;
    if (this.state.botActiveUntil && this.state.botActiveUntil > now) {
      enGec = Math.max(enGec, this.state.botActiveUntil);
    }
    if (this.state.tavernaBotActive && this.state.tavernaBotExpiresAt > now) {
      enGec = Math.max(enGec, this.state.tavernaBotExpiresAt);
    }
    for (const id of ['auto_collector', 'auto_collector_weekly', 'auto_collector_monthly']) {
      const guc = this.state.activeBuffs ? this.state.activeBuffs[id] : null;
      if (guc && guc.expiresAt > enGec && guc.expiresAt > now) enGec = guc.expiresAt;
    }
    return enGec;
  },

  getAutoCollectorRemainingSeconds() {
    if (this.state.botPaused && this.state.botPausedRemainingMs > 0) {
      return Math.max(0, Math.floor(this.state.botPausedRemainingMs / 1000));
    }
    return Math.max(0, Math.floor((this.getAutoCollectorExpiry() - this._now()) / 1000));
  },

  getAutoCollectorRemainingText() {
    const sn = this.getAutoCollectorRemainingSeconds();
    if (sn <= 0) return 'Pasif';
    const saat = Math.floor(sn / 3600);
    const dk = Math.floor((sn % 3600) / 60);
    const s = sn % 60;

    let metin;
    if (saat > 0) metin = `${saat}s ${dk}d`;
    else if (dk > 0) metin = `${dk}d ${s}sn`;
    else metin = `${s}sn`;

    return this.state.botPaused ? `⏸️ ${metin} (Donduruldu)` : metin;
  }
};
