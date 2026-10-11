// Realm of AdAstra — GameStateManager yöntemleri: Taverna botunun silo yönetimi (yer açma, fazlayı satma,
// ASTRA finansmanıyla silo yükseltme). 11 Ekim 2026'da baştan yazıldı; kurallar öncekiyle aynı.
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { ammMarket } from '../ammMarket.js';

// Bot aynı saniyede arka arkaya silo yükseltmesin (ileri sarmada bu bekleme yok)
const YUKSELTME_BEKLEMESI_MS = 3000;
// Silo yükseltme için gereken doluluk barajı ve "sat" modunda korunan pay
const BARAJ_ORANI = 0.8;
const SATIS_MODU_KORUMA = 0.5;

export const botSiloYontemleri = {
  // Fazlalığı pazarda satıp kasaya yazar; başarılıysa kazancı, olmadıysa null döner.
  _botKaynakSat(nodeId, adet) {
    const sonuc = ammMarket.executeSell(nodeId, adet);
    if (!sonuc || !sonuc.success) return null;
    const kazanc = sonuc.adAstraReceived || 0;
    this.state.inventory[nodeId] = Math.max(0, (this.state.inventory[nodeId] || 0) - adet);
    this.state.adAstraBalance = (this.state.adAstraBalance || 0) + kazanc;
    this._onAdaEarned(kazanc, { saleOf: nodeId });
    return { kazanc };
  },

  _botYuksetmeZamaniGeldi(now) {
    return this._isFastForwarding || !this.state.lastAutoWarehouseUpgradeTime ||
           (now - this.state.lastAutoWarehouseUpgradeTime >= YUKSELTME_BEKLEMESI_MS);
  },

  // Siloyu yükseltir ve zamanı kaydeder; yükseltildiyse true
  _botSiloyuYukselt(now) {
    const sonuc = this.upgradeWarehouse();
    if (!(sonuc && sonuc.success)) return false;
    this.state.lastAutoWarehouseUpgradeTime = now;
    return true;
  },

  /**
   * 🤖 Bir sefer bitiminde (ya da satış modunda her turda) bot bu kaynağın silodaki yerini yönetir.
   * "Siloyu yükselt" seçiliyse:
   *   0. Yükseltilebiliyorsa (kasada güvenlik payı kalarak) HER ZAMAN önce yükselt.
   *   1. Tüm depolar %80 dolu ama ASTRA yetmiyorsa, %80 barajının üstündeki fazlayı yükseltme parası
   *      birikene kadar pazarda sat.
   *   2. Sefer ürünü siloya sığmayacaksa tam gereken yer kadarını sat.
   * "Kaynakları sat" seçiliyse silonun yarısı korunur, fazlası satılır.
   * Dönüş: { handled, action?: 'upgraded' | 'sold' | 'sold_for_ada', amountSold?, adAstraReceived?, message? }
   */
  handleBotSiloSpace(nodeId, harvestYield) {
    const limit = this.getWarehouseCapacity()[nodeId];
    if (limit == null) return { handled: true, reason: 'no_limit' };

    const mevcut = Number(this.state.inventory[nodeId]) || 0;
    const gelen = Math.max(1, Number(harvestYield) || 0);
    const now = this._now();
    const yukseltebilir = this._botYuksetmeZamaniGeldi(now);

    if (!this.state.botSiloAutoUpgrade) {
      // Satış modu: silonun yarısı kalır, fazlası ve taşacak kısım satılır
      const yarim = Math.floor(limit * SATIS_MODU_KORUMA);
      const beklenen = mevcut + gelen;
      if (beklenen > yarim) {
        const yarimUstu = Math.max(0, mevcut - yarim);
        const tasacak = Math.max(0, beklenen - limit);
        const adet = Math.min(mevcut, Math.max(yarimUstu, tasacak));
        if (adet > 0) {
          const satis = this._botKaynakSat(nodeId, adet);
          if (satis) {
            this.saveState();
            return {
              handled: true,
              action: 'sold',
              amountSold: adet,
              adAstraReceived: satis.kazanc,
              message: `🤖 Kaynak Satış Modu: Silo yarısı (%50) korunup ${adet} ${nodeId} satıldı (+${satis.kazanc.toFixed(1)} ASTRA).`
            };
          }
        }
      }
      return { handled: true, reason: 'space_sufficient', neededSell: 0 };
    }

    // KURAL 0: yükseltilebiliyorsa önce siloyu yükselt
    if (yukseltebilir) {
      const bedel = this.getWarehouseUpgradeCost();
      if (bedel && bedel.canUpgrade && this._botCanSpend(bedel.adAstra) && this._botSiloyuYukselt(now)) {
        return { handled: true, action: 'upgraded', newCapacity: this.getWarehouseCapacity()[nodeId] };
      }
    }

    // KURAL 1: %80 dolu ama yükseltme parası yok → baraj üstündeki fazlayı sat
    const bedel = this.getWarehouseUpgradeCost();
    if (bedel && bedel.is80PercentFull && !(bedel.canAffordCost && this._botCanSpend(bedel.adAstra))) {
      const baraj = Math.round(limit * BARAJ_ORANI);
      const fazla = Math.max(0, mevcut - baraj);
      const astraAcigi = Math.max(0, bedel.adAstra + this.getBotAdaReserve() - (this.state.adAstraBalance || 0));

      if (fazla > 0 && astraAcigi > 0) {
        const fiyat = ammMarket.getPrice(nodeId) || 1;
        const adet = Math.min(fazla, Math.max(1, Math.ceil(astraAcigi / fiyat)));
        const satis = this._botKaynakSat(nodeId, adet);
        if (satis) {
          this.saveState();

          // Satıştan sonra para tamamlandıysa hemen yükselt
          const yeni = this.getWarehouseUpgradeCost();
          if (yeni && yeni.canUpgrade && yukseltebilir && this._botCanSpend(yeni.adAstra) && this._botSiloyuYukselt(now)) {
            return { handled: true, action: 'upgraded', newCapacity: this.getWarehouseCapacity()[nodeId] };
          }
          return {
            handled: true,
            action: 'sold_for_ada',
            amountSold: adet,
            adAstraReceived: satis.kazanc,
            message: `🤖 Silo yükseltme ASTRA açığını kapatmak için %80 barajı üzerindeki ${adet} ${nodeId} satıldı (+${satis.kazanc.toFixed(1)} ASTRA).`
          };
        }
      }
    }

    // KURAL 2: sefer ürünü siloya sığmıyorsa tam gereken yer kadarını sat
    // (örn. 324 odun gelecek, 200 yer var: 124 satılır, 324'ün hepsi depolanır)
    const bosYer = Math.max(0, limit - mevcut);
    if (bosYer < gelen) {
      const adet = Math.min(mevcut, gelen - bosYer);
      if (adet > 0) {
        const satis = this._botKaynakSat(nodeId, adet);
        if (satis) {
          this.saveState();
          return {
            handled: true,
            action: 'sold',
            amountSold: adet,
            adAstraReceived: satis.kazanc,
            message: `🤖 Sefer hasadı için tam gereken yer açıldı: ${adet} ${nodeId} AMM'de satıldı (+${satis.kazanc.toFixed(1)} ASTRA).`
          };
        }
      }
    }

    return { handled: true, reason: 'space_sufficient', neededSell: 0, amountSold: 0 };
  },

  /**
   * 🤖 Silo yükseltme ve %80 barajında ASTRA finansmanı: her sefer bitiminde denenir.
   * Hammaddeler yeterli ama ASTRA (güvenlik payı dahil) eksikse, %80 barajının üstündeki fazla kaynak
   * pazarda satılarak ASTRA tamamlanır ve silo hemen yükseltilir. Kasada her zaman güvenlik payı kalır.
   */
  tryAutoUpgradeWarehouseWithAdaFinancing() {
    if (!this.state.botSiloAutoUpgrade) return { success: false, reason: 'auto_upgrade_disabled' };

    const now = this._now();
    if (!this._botYuksetmeZamaniGeldi(now)) return { success: false, reason: 'cooldown' };

    const bedel = this.getWarehouseUpgradeCost();
    if (!bedel) return { success: false, reason: 'max_level' };

    if (bedel.canUpgrade && this._botCanSpend(bedel.adAstra) && this._botSiloyuYukselt(now)) {
      return { success: true, upgraded: true, newLevel: this.state.warehouseLevel };
    }

    const parasizSiloDolu = bedel.is80PercentFull && !(bedel.canAffordCost && this._botCanSpend(bedel.adAstra));
    if (!parasizSiloDolu) return { success: false, reason: 'conditions_not_met' };

    const depo = this.state.inventory || {};
    const hammaddeTamam = bedel.keys.every(k => (depo[k] || 0) >= (bedel.costs[k] || 0));
    if (!hammaddeTamam) return { success: false, reason: 'conditions_not_met' };

    let acik = Math.max(0, bedel.adAstra + this.getBotAdaReserve() - (this.state.adAstraBalance || 0));
    if (acik <= 0) return { success: false, reason: 'conditions_not_met' };

    let satilanAstra = 0;
    for (const node of bedel.keys) {
      if (acik <= 0) break;
      const baraj = Math.round((bedel.currentCap[node] || 0) * BARAJ_ORANI);
      const fazla = Math.max(0, (Number(depo[node]) || 0) - baraj);
      if (fazla <= 0) continue;

      const fiyat = ammMarket.getPrice(node) || 1;
      const adet = Math.min(fazla, Math.max(1, Math.ceil((acik * 1.03 + 0.02) / fiyat)));
      const satis = this._botKaynakSat(node, adet);
      if (satis) {
        satilanAstra += satis.kazanc;
        acik = Math.max(0, acik - satis.kazanc);
      }
    }
    this.saveState();

    const yeni = this.getWarehouseUpgradeCost();
    if (yeni && yeni.canUpgrade && this._botCanSpend(yeni.adAstra) && this._botSiloyuYukselt(now)) {
      return { success: true, upgraded: true, newLevel: this.state.warehouseLevel, totalSoldAda: satilanAstra };
    }
    return { success: false, reason: 'conditions_not_met' };
  }
};
