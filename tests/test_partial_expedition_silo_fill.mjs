import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import { GAME_CONFIG } from '../js/config.js';

describe('Silo Kısmi Doldurma ve Kalan Mahsulü Seferde Bekletme Mekanizması Testi', () => {
  // Mock localStorage
  globalThis.localStorage = {
    store: {},
    getItem(k) { return this.store[k] || null; },
    setItem(k, v) { this.store[k] = String(v); },
    removeItem(k) { delete this.store[k]; },
    clear() { this.store = {}; }
  };

  const gs = new GameStateManager();

  // v2 ölçeği: Seviye 1 buğday silosu 1 saatlik üretim (540); 18 dakikalık sefer 162 buğday getirir
  const cap = gs.getWarehouseCapacity(1).wheat;
  const yieldWheat = Math.floor(gs.getResourceRatePerMinute('wheat') * 18);
  const room = 100;                 // depoda boş yer
  const rest = yieldWheat - room;   // seferde bekleyecek kısım
  assert.ok(rest > 0, 'Sefer mahsulü boş yerden büyük olmalı ki kısmi dolum test edilsin');

  it('Kullanıcı Senaryosu: siloda boş yer kadar toplanıp ambar tam doldurulmalı, kalan seferde beklemeli', () => {
    gs.state.warehouseLevel = 1;
    gs.state.inventory.wheat = cap - room;
    assert.strictEqual(gs.getWarehouseCapacity().wheat, cap, `Seviye 1 ambar kapasitesi ${cap} olmalı`);

    gs.state.activeExpeditions.wheat = {
      nodeId: 'wheat',
      durationMinutes: 18,
      durationHours: 0.3,
      durationSeconds: 1080,
      elapsedSeconds: 1080,
      isCompleted: true
    };

    const accrued = gs.getAccruedExpeditionHarvest('wheat');
    assert.strictEqual(accrued.accruedAmount, yieldWheat, `Sefer mahsulü ${yieldWheat} buğday olmalı`);

    const res = gs.claimExpedition('wheat');
    assert.strictEqual(res.success, true, 'Kısmi ambar doldurma başarılı olmalı');
    assert.strictEqual(res.isPartialSiloFill, true, 'Kısmi ambar dolum bayrağı true olmalı');
    assert.strictEqual(res.harvestedAmount, room, `Depodaki boş yer kadar (${room}) toplanmalı`);
    assert.strictEqual(res.stillRemaining, rest, `Seferde kalan miktar ${rest} olmalı`);
    assert.strictEqual(gs.state.inventory.wheat, cap, 'Depodaki buğday tam kapasite (%100) olmalı');

    assert.ok(gs.state.activeExpeditions.wheat, 'Sefer aktif kalmaya devam etmeli');
    assert.strictEqual(gs.state.activeExpeditions.wheat.claimedAmount, room, 'Seferden çekilen miktar kaydedilmeli');
  });

  it('Depo tamamen doluyken tekrar toplanmak istendiğinde net uyarı verilmeli', () => {
    assert.strictEqual(gs.state.inventory.wheat, cap, 'Depo şu an tam dolu');

    const res = gs.claimExpedition('wheat');
    assert.strictEqual(res.success, false, 'Depo doluyken ek kaynak alınamamalı');
    assert.strictEqual(res.isWarehouseFull, true, 'isWarehouseFull true olmalı');
    assert.ok(res.message.includes('tamamen dolu'), 'Silo tamamen dolu mesajı içermeli');
  });

  it('Depoda yer açıldığında kalan mahsul toplanmalı ve sefer tamamlanmalı', () => {
    // Oyuncu buğday harcasın: kalanın tamamı + 40 kadar boş yer olsun
    gs.state.inventory.wheat = cap - rest - 40;

    const accrued = gs.getAccruedExpeditionHarvest('wheat');
    assert.strictEqual(accrued.accruedAmount, rest, `Kalan mahsul ${rest} buğday olarak hesaplanmalı`);

    const res = gs.claimExpedition('wheat');
    assert.strictEqual(res.success, true, 'Kalan mahsul toplama başarılı olmalı');
    assert.strictEqual(res.isPartialSiloFill, false, 'Sefer tamamen bittiği için isPartialSiloFill false olmalı');
    assert.strictEqual(res.harvestedAmount, rest, 'Kalan buğdayın hepsi toplanmalı');
    assert.strictEqual(res.stillRemaining, 0, 'Kalan miktar 0 olmalı');
    assert.strictEqual(gs.state.inventory.wheat, cap - 40, 'Depo: açılan yerin kalan kadarı dolmalı');

    assert.strictEqual(gs.state.activeExpeditions.wheat, undefined, 'Sefer silinmiş olmalı ve yeni sefere hazır olmalı');
  });
});
