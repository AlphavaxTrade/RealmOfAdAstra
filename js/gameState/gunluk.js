// Realm of AdAstra — GameStateManager yöntemleri: günlük sayaçlar (Kolezyum maçı, zindan girişi, zindan kasası bütçesi).
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { globalPool } from '../globalPool.js';

const TURKIYE_SAAT_FARKI_MS = 3 * 3600 * 1000;

export const gunlukYontemleri = {
  // Takvim saati: bilgisayar saati yerine sunucunun HTTP Date başlığıyla düzeltilmiş saat (globalPool);
  // bilgisayar saatini ileri almak günlük hakları yenilemez.
  _calendarNow() {
    return (globalPool && typeof globalPool.getTrustedTime === 'function') ? globalPool.getTrustedTime() : Date.now();
  },

  // Günler Türkiye saatiyle (UTC+3) gece yarısı yenilenir
  getDailyCounters() {
    const bugun = new Date(this._calendarNow() + TURKIYE_SAAT_FARKI_MS).toISOString().slice(0, 10);
    if (!this.state.dailyCounters || this.state.dailyCounters.date !== bugun) {
      this.state.dailyCounters = {
        date: bugun, arenaMatches: 0, dungeonEntries: 0, dungeonRuns: 0, dungeonPaidEntries: 0, dungeonBudget: null, dungeonPaid: 0
      };
    }
    return this.state.dailyCounters;
  }
};
