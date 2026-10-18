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

  it('Hesapta yeterli şifalı ot ve ASTRA varken pasif iyileşme normal çalışmalı', () => {
    gs.state.soldierUnits[0].hp = 50;
    gs.state.inventory.herb = 100;
    gs.state.adAstraBalance = 100;

    const prevHp = gs.state.soldierUnits[0].hp;
    const res = gs.processSoldierPassiveHealing(3600); // 1 saat

    assert.strictEqual(res.isPaused, false, 'Kaynaklar varken iyileşme duraklatılmamalı');
    assert.ok(gs.state.soldierUnits[0].hp > prevHp, '1 saatte can artmış olmalı');
    assert.strictEqual(gs.isArmyPassiveHealBlocked(), false, 'Ordu iyileşmesi bloke olmamalı');
  });

  it('Hesapta şifalı ot YOKSA (0 ot) iyileşme süreci DERHAL durdurulmalı ve can artmamalı', () => {
    gs.state.soldierUnits[0].hp = 50;
    gs.state.inventory.herb = 0; // Şifalı ot bitti!
    gs.state.adAstraBalance = 100;

    const prevHp = gs.state.soldierUnits[0].hp;
    const res = gs.processSoldierPassiveHealing(3600); // 1 saat geçse bile

    assert.strictEqual(res.isPaused, true, 'Şifalı ot yokken iyileşme süreci durdurulmalı');
    assert.strictEqual(gs.state.soldierUnits[0].hp, prevHp, 'Şifalı ot yokken kesinlikle can artmamalı');
    assert.strictEqual(gs.isArmyPassiveHealBlocked(), true, 'Ordu iyileşmesi bloke olarak işaretlenmeli');

    const healInfo = gs.getSoldierHealInfo(0);
    assert.strictEqual(healInfo.isPaused, true, 'Asker heal info isPaused true olmalı');
    assert.ok(healInfo.pauseMessage.toLowerCase().includes('yeteri kadar şifalı ot veya astra yok'), 'Net uyarı mesajı bulunmalı');
    assert.ok(healInfo.pauseMessage.toLowerCase().includes('iyileşmesi durduruldu'), 'Durduruldu mesajı içermeli');
  });

  it('Hesapta ASTRA YOKSA (0 ASTRA) iyileşme süreci DERHAL durdurulmalı ve can artmamalı', () => {
    gs.state.soldierUnits[0].hp = 50;
    gs.state.inventory.herb = 100;
    gs.state.adAstraBalance = 0; // ASTRA bitti!

    const prevHp = gs.state.soldierUnits[0].hp;
    const res = gs.processSoldierPassiveHealing(3600); // 1 saat geçse bile

    assert.strictEqual(res.isPaused, true, 'ADA yokken iyileşme süreci durdurulmalı');
    assert.strictEqual(gs.state.soldierUnits[0].hp, prevHp, 'ADA yokken kesinlikle can artmamalı');
    assert.strictEqual(gs.isArmyPassiveHealBlocked(), true, 'Ordu iyileşmesi bloke olarak işaretlenmeli');

    const healInfo = gs.getSoldierHealInfo(0);
    assert.strictEqual(healInfo.isPaused, true, 'Asker heal info isPaused true olmalı');
  });

  it('Şifalı ot ve ASTRA tekrar temin edildiğinde iyileşme otomatik olarak devam etmeli', () => {
    gs.state.soldierUnits[0].hp = 50;
    gs.state.inventory.herb = 50;
    gs.state.adAstraBalance = 50;

    const prevHp = gs.state.soldierUnits[0].hp;
    const res = gs.processSoldierPassiveHealing(3600);

    assert.strictEqual(res.isPaused, false, 'Kaynaklar gelince iyileşme devam etmeli');
    assert.ok(gs.state.soldierUnits[0].hp > prevHp, 'Can tekrar artmaya başlamalı');
    assert.strictEqual(gs.isArmyPassiveHealBlocked(), false, 'Bloke durumu kalkmalı');
  });

  it('Ot yarıda biterse eldeki otun yettiği kadar iyileşir, ot ekrandaki can başına harcanır ve yakılır', () => {
    const asker = gs.state.soldierUnits[0];
    asker.hp = 20; asker.maxHp = 100;
    gs.state.adAstraBalance = 100;
    const P = GAME_CONFIG.SOLDIER_PASSIVE_HEAL;
    const olcek = gs.getSoldierBattleStart(0).maxHp / 100;
    gs.state.inventory.herb = 2;   // 3600 sn'de ~4,2 taban can = ~4,2 ekran can iyileşir (0,42 ot); az ot için bunu zorlamak üzere 1 saat yerine 10 saat
    const yakilan0 = Object.values(gs.state.burnedResources || {}).length ? (gs.state.burnedResources.herb || 0) : 0;
    gs.processSoldierPassiveHealing(10 * 3600);
    const kazanc = asker.hp - 20;
    assert.ok(kazanc > 0, 'kısmen iyileşmeli');
    const harcanan = 2 - gs.state.inventory.herb;
    assert.ok(Math.abs(harcanan - kazanc * olcek * P.herbPerHp) < 1e-4, `ot ekrandaki can başına harcanmalı: ${harcanan} vs ${kazanc * olcek * P.herbPerHp}`);
    assert.ok(((gs.state.burnedResources || {}).herb || 0) - yakilan0 > 0, 'harcanan ot yakılmalı');
  });
});
