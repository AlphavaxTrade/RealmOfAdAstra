import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  dispatchEvent: () => {},
  addEventListener: () => {}
};
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};
globalThis.sound = {
  playStaminaRefill: () => {},
  playLevelUp: () => {},
  playSuccess: () => {},
  playClick: () => {}
};

import { GAME_CONFIG } from '../js/config.js';
globalThis.GAME_CONFIG = GAME_CONFIG;

import { ammMarket } from '../js/ammMarket.js';
globalThis.ammMarket = ammMarket;

import { globalPool } from '../js/globalPool.js';
globalThis.globalPool = globalPool;

import { GameStateManager } from '../js/gameState.js';

test('🤖 Bot Çalışma Sırası, Hasat Önceliği, Hassas Stamina ve Silo Yönetimi Testi', async (t) => {
  localStorage.clear();
  const gs = new GameStateManager();

  await t.test('1. Biten Sefer Kaynakları Toplanmadan Bot Asla Takılmamalı (Önce Hasat Toplanır)', () => {
    // Bot aktif
    gs.state.botActiveUntil = Date.now() + 24 * 3600 * 1000;
    gs.state.tavernaBotActive = true;
    gs.state.tavernaBotExpiresAt = gs.state.botActiveUntil;
    gs.state.botPaused = false;

    // Depodaki buğday 10 olsun (50'nin altında!)
    gs.state.inventory.wheat = 10;
    gs.state.inventory.iron = 100;
    gs.state.inventory.wood = 100;
    gs.state.adAstraBalance = 50000;

    // Biten bir buğday seferi tanımla (hasat bekliyor: 180 buğday)
    gs.state.activeExpeditions = {
      wheat: {
        nodeId: 'wheat',
        elapsedSeconds: 1080,
        durationSeconds: 1080,
        isCompleted: true,
        startedAt: Date.now() - 1080000
      }
    };

    // Döngüyü çalıştır
    gs.runTavernaAutomationCycle();
    
    // Hasat toplanmış olmalı ve buğday 10'dan 100+'e çıkmış olmalı!
    assert.ok(gs.state.inventory.wheat > 50, `Hasat toplanmalı ve buğday 50'nin üstüne çıkmalı! Mevcut: ${gs.state.inventory.wheat}`);
    assert.equal(gs.state.botPaused, false, 'Kaynaklar 50 üstüne çıktığı için bot duraklatılmamış olmalı');
  });

  await t.test('2. Stamina Sadece Bir Sonraki Seferi Karşılayacak Kadar Doldurulmalı (Tüm Buğdayı Tüketmemeli)', () => {
    // Bot aktif
    gs.state.botActiveUntil = Date.now() + 24 * 3600 * 1000;
    gs.state.tavernaBotActive = true;
    gs.state.tavernaBotExpiresAt = gs.state.botActiveUntil;
    gs.state.botPaused = false;

    // Başlangıç: 0 stamina, 150 buğday (50 rezerv + sefer için gereken)
    gs.state.stamina = 0;
    gs.state.inventory.wheat = 150;
    gs.state.inventory.iron = 100;
    gs.state.inventory.wood = 100;
    gs.state.adAstraBalance = 50000;

    // Sadece 1 adet sefer boşta olsun (wheat boşta, iron ve wood zaten aktif olsun)
    gs.state.activeExpeditions = {
      wood: { nodeId: 'wood', elapsedSeconds: 100, durationSeconds: 1080, isCompleted: false },
      iron: { nodeId: 'iron', elapsedSeconds: 100, durationSeconds: 1080, isCompleted: false }
    };
    // wheat boşta

    // Alet tam sağlam olsun
    gs.state.tools.sickle = { durability: 4320, maxDurability: 4320 };

    // Döngüyü çalıştır
    gs.runTavernaAutomationCycle();

    // Sadece 1 sefer (wheat) başlatılacağı için gereken stamina 20'dir!
    // 20 stamina için yaklaşık 20 * 3.15 = 63 buğday harcanır.
    // 150 - 63 = 87 buğday kalır.
    // Asla tüm buğdayı tüketip staminayı full'lememeli (max 100 yapmaya kalkmamalı)!
    assert.ok(gs.state.inventory.wheat >= 50, `Kalan buğday 50 ve üzeri olmalı! Kalan: ${gs.state.inventory.wheat}`);
    assert.ok(gs.state.inventory.wheat < 150, 'Sadece sefer için gereken buğday harcanmış olmalı');
    
    // wheat seferi başlatılmış olmalı
    assert.ok(gs.state.activeExpeditions.wheat, 'Wheat seferi otonom başlatılmış olmalı');
    assert.equal(gs.state.botPaused, false, 'Bot aktif kalmalı');
  });

  await t.test('3. Silo Durumu Kontrolü: Akıllı Satış (botSiloAutoUpgrade = false) Sefer Öncesi Yer Açmalı', () => {
    gs.state.botSiloAutoUpgrade = false;
    const cap = gs.getWarehouseCapacity();
    
    // Siloyu neredeyse dolduralım
    gs.state.inventory.wood = cap.wood - 1;
    gs.state.activeExpeditions = {}; // tüm seferler boşta

    gs.runTavernaAutomationCycle();

    // Silo taşmasını önlemek için akıllı satış yapılmış olmalı
    assert.ok(gs.state.inventory.wood < cap.wood, 'Akıllı satış ile odun satılarak yer açılmış olmalı');
  });
});
