// Realm of AdAstra — GameStateManager yöntemleri: parşömen kullanımı (iyileştirme, stamina)
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { GAME_CONFIG } from '../config.js';

export const parsomenYontemleri = {
  // scrollType: 'scroll_heal' | 'scroll_stamina'; targetId yalnız iyileştirmede (asker kimliği ya da sırası)
  useScroll(scrollType, targetId = null) {
    if (!this.state.inventory) this.state.inventory = {};
    const env = this.state.inventory;
    if ((env[scrollType] || 0) <= 0) {
      return { success: false, message: 'Envanterinde bu parşömenden hiç bulunmuyor!' };
    }

    if (scrollType === 'scroll_heal') {
      const askerler = (this.state.soldierUnits && this.state.soldierUnits.length > 0) ? this.state.soldierUnits : (this.state.soldiers || []);
      if (askerler.length === 0) return { success: false, message: 'İyileştirilecek bir askerin bulunmuyor!' };

      let hedef = null;
      if (targetId !== null && targetId !== undefined) {
        hedef = askerler.find((s, sira) => s.id === targetId || String(sira) === String(targetId));
      }
      if (!hedef) hedef = askerler.find(s => (s.hp || 0) < (s.maxHp || 100));
      if (!hedef) return { success: false, message: 'Ordudaki tüm AdAstra Şampiyonlarının canı zaten tam dolu!' };

      const tabanEn = hedef.maxHp || 100;
      const sira = askerler.indexOf(hedef);
      const savasOnce = (this.state.soldierUnits && sira >= 0) ? this.getSoldierBattleStart(sira) : { hp: hedef.hp, maxHp: tabanEn };
      // Sabit EKRAN canı (SIFAHANE.PARSOMEN_CAN): şifalı otla aynı ölçek. Kayıtlı can taban ölçekte olduğundan oranla çevrilir.
      const ekranCan = GAME_CONFIG.SIFAHANE?.PARSOMEN_CAN ?? 4;
      const oran = Math.min(1, ekranCan / Math.max(1, savasOnce.maxHp));
      hedef.hp = Math.min(tabanEn, (hedef.hp || 0) + tabanEn * oran);
      env.scroll_heal -= 1;
      this.burnItem('scroll_heal', 1);
      this.saveState();
      const savas = (this.state.soldierUnits && sira >= 0) ? this.getSoldierBattleStart(sira) : { hp: hedef.hp, maxHp: tabanEn };
      return {
        success: true,
        message: `📜 Ordu İyileştirme Parşömeni kullanıldı! ${hedef.name} +${ekranCan} can iyileşti (${savas.hp}/${savas.maxHp} can).`
      };
    }

    if (scrollType === 'scroll_stamina') {
      const enFazla = this.getMaxStamina();
      const simdiki = this.state.stamina || 0;
      if (simdiki >= enFazla) return { success: false, message: 'Dayanıklılığın (Stamina) zaten tamamen dolu!' };

      const kazanilan = Math.min(100, enFazla - simdiki);
      this.state.stamina = Math.min(enFazla, simdiki + 100);
      env.scroll_stamina -= 1;
      this.burnItem('scroll_stamina', 1);
      this.saveState();
      return {
        success: true,
        message: `⚡ 100 Stamina Parşömeni kullanıldı! +${Math.round(kazanilan)} Dayanıklılık dolduruldu (${Math.floor(this.state.stamina)}/${enFazla} ⚡).`
      };
    }

    if (scrollType === 'scroll_repair') {
      return { success: false, message: '🔨 Alet onarım parşömenleri oyundan kaldırılmıştır. Aletlerinizi Demirci aracılığıyla (Odun + Demir + ASTRA) tamir edebilirsiniz.' };
    }
    return { success: false, message: 'Bilinmeyen parşömen türü!' };
  }
};
