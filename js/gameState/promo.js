// Realm of AdAstra — GameStateManager yöntemleri: promo kodu ödülü
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { ammMarket } from '../ammMarket.js';
import { treasury } from '../treasury.js';
import { RES_KEYS, kaynakAdi } from './ortak.js';

const EK_KALEMLER = ['fragments', 'keys', 'boxes', 'scroll_heal', 'scroll_stamina'];

export const promoYontemleri = {
  // Kullanıcı kararı (6 Ekim 2026): her kodun ne vereceğini yönetici seçer. Yoktan bir şey basılmaz: ASTRA görev
  // kasasından gelir ve KİLİTLİ verilir (oyunda harcandıkça açılır); hammadde ve eşyalar görev kasasının parasıyla
  // pazardan satın alınıp verilir. Kasa yetmezse ya da pazarda yeterli mal yoksa hiçbir şey verilmez.
  // odul: { ada, <hammadde anahtarları>, fragments, keys, boxes, scroll_heal, scroll_stamina } (tam sayılar)
  applyPromoReward(odul = {}) {
    const ada = Math.max(0, Math.floor(Number(odul.ada) || 0));
    const kalemler = [...RES_KEYS(), ...EK_KALEMLER]
      .map(k => [k, Math.max(0, Math.floor(Number(odul[k]) || 0))])
      .filter(([, v]) => v > 0);
    if (!ada && !kalemler.length) return { success: false, message: 'Bu kodun ödülü yok.' };

    const havuzlar = treasury && treasury.state && treasury.state.pools;
    if (!havuzlar) return { success: false, message: 'Hazine okunamadı.' };

    // Hiçbir şey verilmeden önce toplam maliyet hesaplanır
    let gerekli = ada;
    for (const [k, v] of kalemler) {
      const tahmin = ammMarket.getEstimatedCostForBuy(k, v);
      if (!isFinite(tahmin)) return { success: false, message: `Pazarda yeterli ${kaynakAdi(k)} yok; kod şu an kullanılamıyor.` };
      gerekli += tahmin;
    }
    if ((havuzlar.quest || 0) < gerekli * 1.02) return { success: false, message: 'Görev kasası şu an bu ödülü karşılayamıyor; daha sonra tekrar dene.' };

    const verilen = [];
    let harcanan = 0;
    for (const [k, v] of kalemler) {
      const alim = ammMarket.executeBuyAmount(k, v);
      if (!alim || !alim.success) return { success: false, failedMidway: true, message: (alim && alim.message) || 'Pazardan alınamadı.' };
      harcanan += alim.cost;
      if (RES_KEYS().includes(k)) this.storeResourceOrSell(k, v, 'Promo kodu');
      else if (k === 'keys') this.state.arenaKeys = (this.state.arenaKeys || 0) + v;
      else if (k === 'boxes') this.state.lockedBoxes = (this.state.lockedBoxes || 0) + v;
      else this.state.inventory[k] = (Number(this.state.inventory[k]) || 0) + v;
      verilen.push(`${v.toLocaleString('tr-TR')} ${kaynakAdi(k)}`);
    }

    harcanan += ada;
    havuzlar.quest = (havuzlar.quest || 0) - harcanan;
    if (!treasury.state.outflow) treasury.state.outflow = {};
    treasury.state.outflow.quest = (treasury.state.outflow.quest || 0) + harcanan;
    treasury.state.lifetimeWithdrawn = (treasury.state.lifetimeWithdrawn || 0) + harcanan;
    treasury.save();

    if (ada > 0) {
      this.state.adAstraBalance = (Number(this.state.adAstraBalance) || 0) + ada;
      this.state.lockedAda = Math.min(this.state.adAstraBalance, (Number(this.state.lockedAda) || 0) + ada);
      verilen.unshift(`${ada.toLocaleString('tr-TR')} ASTRA (kilitli)`);
    }
    this.saveState();
    return { success: true, spentFromQuest: harcanan, message: `🎟️ Promo kodu: ${verilen.join(', ')} hesabına eklendi.` };
  }
};
