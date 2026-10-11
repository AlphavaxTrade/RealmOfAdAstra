// Realm of AdAstra — GameStateManager yöntemleri: pazar alım/satım, "hızlı al" planı, depoyu doldurma.
// 11 Ekim 2026'da baştan yazıldı (komut paleti listesi arayüze, js/ui/v3/palet.js'e taşındı).
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { GAME_CONFIG } from '../config.js';
import { ammMarket } from '../ammMarket.js';
import { RES_KEYS, kaynakAdi } from './ortak.js';

// Hızlı al planında alım bedeline eklenen pay: yükseltmenin kendi ASTRA bedeli %3 payla hesaba katılır
const ASTRA_PAYI = 1.03;

const tr = (n) => Number(n).toLocaleString('tr-TR');

export const pazarYontemleri = {
  // Sandık ve anahtar da pazarda satılır; onlar envanterde değil kendi sayaçlarında durur
  _pazarStoku(anahtar) {
    if (anahtar === 'boxes') return this.state.lockedBoxes || 0;
    if (anahtar === 'keys') return this.state.arenaKeys || 0;
    return Number(this.state.inventory[anahtar]) || 0;
  },

  marketSell(resKey, qty) {
    const miktar = Number(qty);
    if (!(miktar > 0)) return { success: false, message: 'Lütfen satmak istediğin geçerli bir miktar gir!' };
    const eldeki = this._pazarStoku(resKey);
    if (eldeki < miktar) {
      return { success: false, message: `Yetersiz ${kaynakAdi(resKey) || resKey}! Envanterinde ${tr(Math.floor(eldeki))} adet var.` };
    }

    const sonuc = ammMarket.executeSell(resKey, miktar);
    if (!sonuc.success) return sonuc;

    if (resKey === 'boxes') this.state.lockedBoxes -= miktar;
    else if (resKey === 'keys') this.state.arenaKeys -= miktar;
    else this.state.inventory[resKey] = (Number(this.state.inventory[resKey]) || 0) - miktar;

    this.state.adAstraBalance = (this.state.adAstraBalance || 0) + sonuc.adAstraReceived;
    this._onAdaEarned(sonuc.adAstraReceived, RES_KEYS().includes(resKey) ? { saleOf: resKey } : undefined);
    this.saveState();
    return { ...sonuc, qty: miktar };
  },

  marketBuy(resKey, qty) {
    const miktar = Number(qty);
    if (!(miktar > 0)) return { success: false, message: 'Lütfen satın almak istediğin geçerli bir miktar gir!' };

    const tahmin = ammMarket.getEstimatedCostForBuy(resKey, miktar);
    if (!isFinite(tahmin)) return { success: false, message: 'Havuzda bu miktarı karşılayacak yeterli likidite yok!' };
    const bakiye = this.state.adAstraBalance || 0;
    if (bakiye < tahmin) {
      return { success: false, message: `Yetersiz ASTRA! Gereken: ~${tahmin.toFixed(2)} ASTRA, bakiyen: ${bakiye.toFixed(2)} ASTRA` };
    }
    if (RES_KEYS().includes(resKey)) {
      const sinir = this.getWarehouseCapacity()[resKey];
      const mevcut = Number(this.state.inventory[resKey]) || 0;
      if (sinir != null && mevcut + miktar > sinir) {
        return { success: false, message: `Silo kapasitesi aşılamaz! Alabileceğin en fazla boş alan: ${tr(Math.max(0, Math.floor(sinir - mevcut)))} ${kaynakAdi(resKey)}` };
      }
    }

    const sonuc = ammMarket.executeBuyAmount(resKey, miktar);
    if (!sonuc.success) return sonuc;

    this.state.adAstraBalance = (this.state.adAstraBalance || 0) - sonuc.cost;
    this._onAdaSpent(sonuc.cost, { boughtResource: resKey });
    if (resKey === 'boxes') this.state.lockedBoxes = (this.state.lockedBoxes || 0) + sonuc.resourceReceived;
    else if (resKey === 'keys') this.state.arenaKeys = (this.state.arenaKeys || 0) + sonuc.resourceReceived;
    else this.state.inventory[resKey] = (Number(this.state.inventory[resKey]) || 0) + sonuc.resourceReceived;
    this.saveState();

    // Duraklamış bot, eksik kaynak alınınca uyanmış olabilir
    const uyanma = this.updateBotPauseState();
    return { ...sonuc, qty: miktar, botJustResumed: !!(uyanma && uyanma.justResumed) };
  },

  /**
   * ⚡ Hızlı al planı: seviye atlama ('levelup'), silo yükseltme ('warehouse') ya da teçhizat dövme
   * ('craft:<yuva>') için eksik kaynaklar ve pazar bedeli. ok = ASTRA hem bu alıma hem işin kendi
   * ASTRA bedeline (%3 payla) yetiyor, silo bu miktarı alıyor ve XP tamam.
   */
  getQuickBuyPlan(kind) {
    const depo = this.state.inventory || {};
    const kapasite = this.getWarehouseCapacity();
    let hedef;
    let ekAstra = 0;
    let xpEksik = false;

    if (kind === 'levelup') {
      const gerek = this.getNextLevelRequirement();
      if (!gerek || gerek.isMaxLevel) return { ok: false, items: [], reason: 'Maksimum seviyedesin.' };
      hedef = { wood: gerek.wood, iron: gerek.iron, wheat: gerek.wheat };
      ekAstra = Number(gerek.adAstra) || 0;
      xpEksik = (Number(this.state.currentXp) || 0) < gerek.xp;
    } else if (kind === 'warehouse') {
      const bedel = this.getWarehouseUpgradeCost();
      if (!bedel) return { ok: false, items: [], reason: 'Silo en üst seviyede.' };
      // Hem yükseltme bedeli hem %80 doluluk şartı karşılanır (bütün hammaddeler)
      hedef = Object.fromEntries(bedel.keys.map(k => [k, Math.max(bedel.costs[k] || 0, bedel.fills[k] || 0)]));
      ekAstra = Number(bedel.adAstra) || 0;
    } else if (String(kind).startsWith('craft:')) {
      const yuva = String(kind).slice(6);
      if (!(GAME_CONFIG.EQUIPMENT_RECIPES || {})[yuva]) return { ok: false, items: [], reason: 'Geçersiz tarif.' };
      const bedel = this.calculateEquipmentCraftCost(yuva);
      hedef = { iron: bedel.ironCost, wood: bedel.woodCost, coal: bedel.coalCost, fragments: bedel.fragCost };
      ekAstra = Number(bedel.adaCost) || 0;
    } else {
      return { ok: false, items: [], reason: 'Geçersiz.' };
    }

    const items = [];
    let toplam = 0;
    let siloYetmiyor = false;
    for (const kaynak of Object.keys(hedef)) {
      const elde = Math.floor(Number(depo[kaynak]) || 0);
      let gerekli = Math.max(0, Math.ceil(hedef[kaynak] - elde));
      const bosYer = kapasite[kaynak] != null ? Math.max(0, Math.floor(kapasite[kaynak] - elde)) : gerekli;
      if (gerekli > bosYer) { gerekli = bosYer; siloYetmiyor = true; }
      if (gerekli <= 0) continue;
      const bedel = ammMarket.getEstimatedCostForBuy(kaynak, gerekli);
      if (!isFinite(bedel)) return { ok: false, items: [], reason: 'Pazarda yeterli hammadde yok.' };
      items.push({ res: kaynak, qty: gerekli, cost: bedel, name: kaynakAdi(kaynak) });
      toplam += bedel;
    }

    const balance = Number(this.state.adAstraBalance) || 0;
    const needAda = toplam + ekAstra * ASTRA_PAYI;
    const ortak = { items, total: toplam, extraAda: ekAstra, balance, needAda, capBlocked: siloYetmiyor };
    if (xpEksik && items.length) {
      return { ok: false, ...ortak, reason: 'Önce deneyimi (XP) tamamla; hammaddeyi seviye atlayabileceğin zaman al.' };
    }

    let neden = '';
    if (items.length === 0) neden = 'Eksik hammadde yok.';
    else if (siloYetmiyor) neden = 'Silon bu kadar hammadde alamıyor: önce siloyu yükselt.';
    else if (balance < needAda) neden = `ASTRA yetmiyor: alım ~${tr(Math.ceil(toplam))} + yükseltme ~${tr(Math.ceil(ekAstra))} ASTRA gerekli.`;
    return { ok: items.length > 0 && balance >= needAda && !siloYetmiyor, ...ortak, reason: neden };
  },

  // 🧺 Depoyu doldur: siloda boş yer kadar; ASTRA yetmezse bütçeye sığan en büyük miktar
  getFillWarehouseQty(resKey) {
    const kapasite = this.getWarehouseCapacity()[resKey];
    const mevcut = Math.floor(Number((this.state.inventory || {})[resKey]) || 0);
    const bosYer = Math.max(0, Math.floor((kapasite || 0) - mevcut));
    const bakiye = Number(this.state.adAstraBalance) || 0;
    const bedelOf = (q) => (q > 0 ? ammMarket.getEstimatedCostForBuy(resKey, q) : 0);

    if (bosYer > 0 && !(bedelOf(bosYer) <= bakiye)) {
      let alt = 0;
      let ust = bosYer;
      while (alt < ust) {
        const orta = Math.ceil((alt + ust) / 2);
        if (bedelOf(orta) <= bakiye) alt = orta; else ust = orta - 1;
      }
      return { qty: alt, room: bosYer, cost: bedelOf(alt), limitedByAda: true };
    }
    return { qty: bosYer, room: bosYer, cost: bedelOf(bosYer), limitedByAda: false };
  }
};
