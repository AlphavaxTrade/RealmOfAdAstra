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
  playClick: () => {},
  playHarvest: () => {},
  playBreakWarning: () => {}
};

import { GAME_CONFIG } from '../js/config.js';
globalThis.GAME_CONFIG = GAME_CONFIG;

import { ammMarket } from '../js/ammMarket.js';
globalThis.ammMarket = ammMarket;

import { globalPool } from '../js/globalPool.js';
globalThis.globalPool = globalPool;

import { GameStateManager } from '../js/gameState.js';

test('🌾 Botun Kaynak Biriktirme, Silo Büyütme ve 3 Saatlik Çevrimdışı İlerleme Testi', async (t) => {
  localStorage.clear();
  const gs = new GameStateManager();
  gs.state.level = 2;   // silo 1→2 için hesap seviyesi 2 yeter: silo hesabı geçemez (19 Ekim 2026)

  await t.test('1. "Siloyu Yükselt" seçiliyken kaynaklar erken panik satışı ile satılmamalı, depoda korunmalı', () => {
    gs.state.botActiveUntil = Date.now() + 24 * 3600 * 1000;
    gs.state.tavernaBotActive = true;
    gs.state.tavernaBotExpiresAt = gs.state.botActiveUntil;
    gs.state.botPaused = false;
    gs.state.botSiloAutoUpgrade = true;

    // v2: Seviye 1 silo = 1 saatlik üretim (odun 324, demir 216, buğday 540); depolar %60 dolu, gelecek hasat sığıyor
    const cap1 = gs.getWarehouseCapacity(1);
    gs.state.inventory.wood = Math.floor(cap1.wood * 0.6);
    gs.state.inventory.iron = Math.floor(cap1.iron * 0.6);
    gs.state.inventory.wheat = Math.floor(cap1.wheat * 0.6);
    const wheat0 = gs.state.inventory.wheat;
    gs.state.adAstraBalance = 50000;

    // handleBotSiloSpace çağrıldığında
    const res = gs.handleBotSiloSpace('wheat', Math.floor(cap1.wheat * 0.3));

    // Kaynak pazarda satılmamış olmalı (action != 'sold')!
    assert.notEqual(res.action, 'sold', 'Kullanıcı siloyu yükseltmek isterken buğdayı pazarda satmamalı!');
    assert.equal(gs.state.inventory.wheat, wheat0, 'Buğday miktarı korunmalı!');
  });

  await t.test('2. Depolar doldukça ve %80 barajı aşıldığında silo otomatik yükseltilmeli', () => {
    gs.state.botSiloAutoUpgrade = true;
    // v2: 6 depo da %80 barajını aşmış olsun
    const capA = gs.getWarehouseCapacity(1);
    for (const k of GAME_CONFIG.RESOURCE_KEYS) gs.state.inventory[k] = Math.floor(capA[k] * 0.9);
    gs.state.adAstraBalance = 100000;

    const initialLvl = gs.state.warehouseLevel;
    const upRes = gs.upgradeWarehouse();

    assert.ok(upRes.success, 'Silo yükseltme başarılı olmalı');
    assert.equal(gs.state.warehouseLevel, initialLvl + 1, 'Silo seviye atlamalı');
    
    // Yeni kapasiteler Seviye 2'ye çıkmalı
    const newCap = gs.getWarehouseCapacity();
    assert.ok(newCap.wheat > capA.wheat, 'Buğday kapasitesi artmalı');
    assert.ok(newCap.wood > capA.wood, 'Odun kapasitesi artmalı');
  });

  await t.test('3. 3 Saatlik (180 dakika) Çevrimdışı / Arka Plan Zamanında Çoklu Sefer Döngüsü Doğrulaması', () => {
    gs.state.warehouseLevel = 2; // Kapasite 1800/1200/900
    gs.state.inventory.wood = 100;
    gs.state.inventory.iron = 100;
    gs.state.inventory.wheat = 200;
    gs.state.stamina = 100;
    gs.state.tools.axe.durability = 4000;
    gs.state.tools.pickaxe.durability = 4000;
    gs.state.tools.sickle.durability = 4000;

    // Aktif bir buğday seferi tanımla
    const expDurSec = 1080; // 18 dk
    gs.state.activeExpeditions = {
      wheat: {
        nodeId: 'wheat',
        durationMinutes: 18,
        durationSeconds: expDurSec,
        elapsedSeconds: 0,
        startedAt: Date.now() - 3600000,
        lastTickAt: Date.now() - 3600000, // 1 saat (3600s) öncesi
        isCompleted: false
      }
    };

    const initialWheat = gs.state.inventory.wheat;

    // v2: her çağrı bir seferi tamamlar, bot yenisini başlatır; 3 çağrı = 3 sefer döngüsü (18 dk sefer 162 buğday)
    const yieldWheat = Math.floor(gs.getResourceRatePerMinute('wheat') * 18);
    for (let i = 0; i < 3; i++) gs.updateExpeditions(3600);

    // Envanterdeki buğday 1 seferlik değil, çoklu döngü kadar artmış olmalı (bot stamina için buğday harcasa bile)!
    assert.ok(gs.state.inventory.wheat > initialWheat + 1.5 * yieldWheat, `Buğday çoklu sefer kadar artmalı! Mevcut: ${gs.state.inventory.wheat}, Başlangıç: ${initialWheat}`);
  });
});
