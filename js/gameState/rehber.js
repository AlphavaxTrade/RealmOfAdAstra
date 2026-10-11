// Realm of AdAstra — GameStateManager yöntemleri: Rehber görevleri ve özellik kilitleri
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { sound } from '../audio.js';
import { treasury } from '../treasury.js';
import { OGRETICI_KOSULLARI } from './ogretici.js';

export const rehberYontemleri = {
  // =========================================================================
  // 🧭 v1.25: YENİ OYUNCU REHBERİ (Görevler oyunun durumundan otomatik algılanır)
  // =========================================================================
  checkOnboardingProgress() {
    if (!this.state.onboarding || typeof this.state.onboarding !== 'object') this.state.onboarding = {};
    const ob = this.state.onboarding;
    // Koşullar js/gameState/ogretici.js OGRETICI_KOSULLARI içindedir (görev kimliği → koşul)
    let newlyDone = [];
    for (const q of (GAME_CONFIG.ONBOARDING_QUESTS || [])) {
      const kosul = OGRETICI_KOSULLARI[q.id];
      if (kosul && kosul(this) && !(ob[q.id] && ob[q.id].done)) {
        ob[q.id] = { done: true, claimed: false, at: this._now() };
        newlyDone.push(q);
      }
    }
    if (newlyDone.length > 0 && !this._isFastForwarding) {
      // Birden çok görev aynı anda tamamlanırsa (ör. seviye atlayınca) tek özet bildirim: bildirim kutusu dolmasın
      if (newlyDone.length > 2) {
        const toplam = newlyDone.reduce((s, q) => s + (q.rewardAda || 0), 0);
        this.pushNotice(`🧭 ${newlyDone.length} görev tamamlandı — ödüllerini Krallık Yolu panelinden al (+${Math.round(toplam * 10) / 10} ASTRA)`, 'success');
      } else {
        newlyDone.forEach(q => this.pushNotice(`🧭 Görev tamamlandı: ${q.title} — ödülünü Krallık Yolu panelinden al (+${q.rewardAda} ASTRA)`, 'success'));
      }
    }
    return newlyDone;
  },

  // 🔓 v1.25: İlk oturumda menüler adım adım açılır. Kurallar oyunun durumundan hesaplanır; zaten
  // ilerlemiş (Sv.3+, askeri olan, silosunu yükseltmiş) hesaplarda her şey açıktır.
  getFeatureLock(zoneId) {
    if (GAME_CONFIG.PROGRESSIVE_UNLOCK === false) return null;
    const st = this.state;
    const ob = st.onboarding || {};
    const done = (id) => !!(ob[id] && ob[id].done);
    const lvl = st.level || 1;
    const soldiers = (st.soldierUnits || []).length;
    const dungeonCleared = (st.dungeonProgress || 1) > 1;
    const veteran = lvl >= 3 || soldiers > 0 || (st.warehouseLevel || 1) >= 2 || dungeonCleared;
    const rules = {
      market:      { name: 'Meydan Pazarı', ok: veteran || done('first_harvest'),                  reason: 'İlk hasadını topladıktan sonra açılır.' },
      blacksmith:  { name: 'Demirci',       ok: veteran || done('three_expeditions'),              reason: 'Odun, demir ve buğday seferlerini aynı anda çalıştırınca açılır.' },
      barracks:    { name: 'Kışla',         ok: veteran || done('three_expeditions'),              reason: 'Odun, demir ve buğday seferlerini aynı anda çalıştırınca açılır.' },
      carnival:    { name: 'Karnaval',      ok: veteran || lvl >= 2,                               reason: 'Seviye 2\'ye ulaşınca açılır.' },
      dungeon:     { name: 'Zindan',        ok: soldiers > 0 || lvl >= 3,                          reason: 'Kışladan ilk askerini alınca açılır.' },
      colosseum:   { name: 'Kolezyum',      ok: dungeonCleared || lvl >= 3,                        reason: 'Zindanda ilk zaferinden sonra açılır.' },
      battlefield: { name: 'Savaş Alanı',   ok: dungeonCleared || lvl >= 3,                        reason: 'Zindanda ilk zaferinden sonra açılır.' }
    };
    const r = rules[zoneId];
    if (!r || r.ok) return null;
    return { zoneId, name: r.name, reason: r.reason };
  },

  isFeatureUnlocked(zoneId) {
    return !this.getFeatureLock(zoneId);
  },

  getOnboardingStatus() {
    const ob = this.state.onboarding || {};
    const quests = (GAME_CONFIG.ONBOARDING_QUESTS || []).map(q => ({
      ...q,
      rewardAda: q.rewardAda || 0,   // v2: ödüller sabit ASTRA (fiyat çarpanı yalnız bedellere)
      done: !!(ob[q.id] && ob[q.id].done),
      claimed: !!(ob[q.id] && ob[q.id].claimed)
    }));
    const doneCount = quests.filter(q => q.done).length;
    const claimable = quests.filter(q => q.done && !q.claimed);
    return {
      quests,
      doneCount,
      total: quests.length,
      allClaimed: quests.every(q => q.claimed),
      claimableCount: claimable.length,
      claimableAda: claimable.reduce((s, q) => s + (q.rewardAda || 0), 0),
      next: quests.find(q => !q.done) || null
    };
  },

  // Ödül Görev & Ücretsiz Oyuncu Kasası'ndan çekilir (basılmaz); kasa boşsa ödül küçülür
  claimOnboardingReward(questId) {
    const q = (GAME_CONFIG.ONBOARDING_QUESTS || []).find(x => x.id === questId);
    if (!q) return { success: false, message: 'Görev bulunamadı.' };
    const ob = this.state.onboarding || (this.state.onboarding = {});
    const entry = ob[questId];
    if (!entry || !entry.done) return { success: false, message: 'Bu görev henüz tamamlanmadı.' };
    if (entry.claimed) return { success: false, message: 'Bu görevin ödülünü zaten aldın.' };
    let granted = 0;
    let budgetFull = false;
    if ((q.rewardAda || 0) > 0 && treasury && treasury.withdraw) {
      const draw = treasury.withdrawWhole('quest', q.rewardAda);   // tam sayı ödül; kesirli artık kasada kalır
      granted = draw.granted || 0;
      budgetFull = !!draw.budgetFull;
    }
    entry.claimed = true;
    this.state.adAstraBalance = (this.state.adAstraBalance || 0) + granted;
    this._onAdaEarned(granted);
    sound.playLevelUp();
    this.saveState();
    const budgetNote = budgetFull ? ` ⏳ ${GAME_CONFIG.TREASURY_WEEKLY_BUDGET.FULL_MESSAGE}` : '';
    return { success: true, granted, budgetFull, message: `🧭 ${q.title} ödülü: +${granted.toLocaleString('tr-TR')} ASTRA (Krallık Hazinesinden)${budgetNote}` };
  },
};
