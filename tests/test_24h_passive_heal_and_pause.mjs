import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import { GAME_CONFIG } from '../js/config.js';

describe('24 Saatlik Pasif İyileşme ve Kaynak Yetersizliğinde Durdurma & Uyarı Testi', () => {
  // Mock localStorage
  globalThis.localStorage = {
    store: {},
    getItem(k) { return this.store[k] || null; },
    setItem(k, v) { this.store[k] = String(v); },
    removeItem(k) { delete this.store[k]; },
    clear() { this.store = {}; }
  };

  const gs = new GameStateManager();
  const soldier = gs.createSoldierUnit(0);
  gs.state.soldierUnits = [soldier];

  it('Pasif iyileşme süresi tam 24 saat (86400 saniye / 1440 dakika) olmalı', () => {
    assert.strictEqual(GAME_CONFIG.SOLDIER_PASSIVE_HEAL.FULL_HEAL_SECONDS, 86400, 'Tam iyileşme 86400 saniye (24 saat) olmalı');
  });

  it('Yaralı şampiyonun kalan süresi 24 saat formülüyle hesaplanmalı', () => {
    // 1. askeri 50 HP'ye indirelim (100 HP max)
    gs.state.soldierUnits[0].hp = 50;
    gs.state.soldierUnits[0].maxHp = 100;

    const healInfo = gs.getSoldierHealInfo(0);
    assert.strictEqual(healInfo.missingHp, 50, 'Eksik HP 50 olmalı');
    // %50 can için 86400 * 0.5 = 43200 saniye (12 saat)
    assert.strictEqual(healInfo.secondsRemaining, 43200, 'Kalan süre 43200 saniye (12 saat) olmalı');
  });

  it('Hesapta yeterli Buğday ve ADA varken pasif iyileşme normal çalışmalı', () => {
    gs.state.soldierUnits[0].hp = 50;
    gs.state.inventory.wheat = 100;
    gs.state.adAstraBalance = 100;

    const prevHp = gs.state.soldierUnits[0].hp;
    const res = gs.processSoldierPassiveHealing(3600); // 1 saat

    assert.strictEqual(res.isPaused, false, 'Kaynaklar varken iyileşme duraklatılmamalı');
    assert.ok(gs.state.soldierUnits[0].hp > prevHp, '1 saatte can artmış olmalı');
    assert.strictEqual(gs.isArmyPassiveHealBlocked(), false, 'Ordu iyileşmesi bloke olmamalı');
  });

  it('Hesapta Buğday YOKSA (0 Buğday) iyileşme süreci DERHAL durdurulmalı ve can artmamalı', () => {
    gs.state.soldierUnits[0].hp = 50;
    gs.state.inventory.wheat = 0; // Buğday bitti!
    gs.state.adAstraBalance = 100;

    const prevHp = gs.state.soldierUnits[0].hp;
    const res = gs.processSoldierPassiveHealing(3600); // 1 saat geçse bile

    assert.strictEqual(res.isPaused, true, 'Buğday yokken iyileşme süreci durdurulmalı');
    assert.strictEqual(gs.state.soldierUnits[0].hp, prevHp, 'Buğday yokken kesinlikle can artmamalı');
    assert.strictEqual(gs.isArmyPassiveHealBlocked(), true, 'Ordu iyileşmesi bloke olarak işaretlenmeli');

    const healInfo = gs.getSoldierHealInfo(0);
    assert.strictEqual(healInfo.isPaused, true, 'Asker heal info isPaused true olmalı');
    assert.ok(healInfo.pauseMessage.toLowerCase().includes('yeteri kadar $adastra veya buğday yok'), 'Net uyarı mesajı bulunmalı');
    assert.ok(healInfo.pauseMessage.toLowerCase().includes('askerlerin iyileşmesi durduruldu'), 'Durduruldu mesajı içermeli');
  });

  it('Hesapta $ADASTRA YOKSA (0 ADA) iyileşme süreci DERHAL durdurulmalı ve can artmamalı', () => {
    gs.state.soldierUnits[0].hp = 50;
    gs.state.inventory.wheat = 100;
    gs.state.adAstraBalance = 0; // ADA bitti!

    const prevHp = gs.state.soldierUnits[0].hp;
    const res = gs.processSoldierPassiveHealing(3600); // 1 saat geçse bile

    assert.strictEqual(res.isPaused, true, 'ADA yokken iyileşme süreci durdurulmalı');
    assert.strictEqual(gs.state.soldierUnits[0].hp, prevHp, 'ADA yokken kesinlikle can artmamalı');
    assert.strictEqual(gs.isArmyPassiveHealBlocked(), true, 'Ordu iyileşmesi bloke olarak işaretlenmeli');

    const healInfo = gs.getSoldierHealInfo(0);
    assert.strictEqual(healInfo.isPaused, true, 'Asker heal info isPaused true olmalı');
  });

  it('Buğday ve ADA tekrar temin edildiğinde iyileşme otomatik olarak devam etmeli', () => {
    gs.state.soldierUnits[0].hp = 50;
    gs.state.inventory.wheat = 50;
    gs.state.adAstraBalance = 50;

    const prevHp = gs.state.soldierUnits[0].hp;
    const res = gs.processSoldierPassiveHealing(3600);

    assert.strictEqual(res.isPaused, false, 'Kaynaklar gelince iyileşme devam etmeli');
    assert.ok(gs.state.soldierUnits[0].hp > prevHp, 'Can tekrar artmaya başlamalı');
    assert.strictEqual(gs.isArmyPassiveHealBlocked(), false, 'Bloke durumu kalkmalı');
  });
});
