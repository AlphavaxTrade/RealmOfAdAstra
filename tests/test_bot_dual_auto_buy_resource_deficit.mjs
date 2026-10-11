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

test('🤖 Bot Çift Yönlü Dengeleme: Eksik Hammadde Oto-Tedarik ve Duraklama / Uyanma', async (t) => {
  localStorage.clear();

  await t.test('1. Depoda Odun:0, Demir:0, Buğday:0 iken autoBuyBotResourceDeficit AMM pazarından asgari önkoşul miktarını satın alarak botun durmasını engellemeli', () => {
    const gs = new GameStateManager();
    gs.state.level = 2; // Oyuncu Seviye 2
    gs.state.inventory = { wood: 0, iron: 0, wheat: 0, fragments: 0 };
    gs.state.adAstraBalance = 20000;

    const buyRes = gs.autoBuyBotResourceDeficit();

    // KULLANICI KURALI: Kasada ASTRA varken botun durmaması için asgari önkoşul satın alınır!
    assert.equal(buyRes.bought, true, 'AMMden asgari satın alım başarıyla yapılmalı');
    assert.ok(buyRes.totalSpentAda > 0 && buyRes.totalSpentAda < 2000, 'Siloyu fullemeden sadece asgari harcama yapılmalı');
    assert.ok(gs.state.inventory.wood >= 50, 'Odun en az 50 olmalı');
    assert.ok(gs.state.inventory.iron >= 50, 'Demir en az 50 olmalı');
    assert.ok(gs.state.inventory.wheat >= 50, 'Buğday en az 50 olmalı');
    assert.ok(gs.state.inventory.wood < 500, 'Silo kontrolsüz biçimde doldurulmamalı');
  });

  await t.test('2. Silo Seviye Yükseltildiğinde ambarlar sıfırlansa bile bot aktifse bot durmamalı', () => {
    const gs = new GameStateManager();
    const now = Date.now();
    gs.state.level = 2; // Oyuncu Seviye 2
    gs.state.tavernaBotActive = true;
    gs.state.tavernaBotExpiresAt = now + 24 * 3600 * 1000;
    gs.state.botActiveUntil = gs.state.tavernaBotExpiresAt;

    // Depoları Seviye 2 için doldur ve siloyu Seviye 3'e yükselt
    gs.state.warehouseLevel = 2;
    const cap = gs.getWarehouseCapacity(2);
    // v2: 6 depo da dolu olsun (silo yükseltmesi hepsinde %80 ister)
    gs.state.inventory = { ...Object.fromEntries(GAME_CONFIG.RESOURCE_KEYS.map(k => [k, cap[k]])), fragments: 0 };
    gs.state.adAstraBalance = 30000;

    const upRes = gs.upgradeWarehouse();
    assert.equal(upRes.success, true, 'Silo yükseltilmiş olmalı');
    assert.equal(gs.state.warehouseLevel, 3, 'Silo Seviye 3 olmalı');

    // Yükseltme sonrası depo dolu kalır: bot önkoşulu (6 kaynak 50 üstü) sağlanmalı ve bot durmamalı
    assert.equal(gs.checkBotPrerequisites().isMet, true, 'Yükseltme sonrası botun önkoşulları tamam olmalı');
    for (const k of ['wood', 'iron', 'wheat']) {
      assert.ok((gs.state.inventory[k] || 0) >= 50, `Yükseltme sonrası ${k} >= 50 olmalı, ambar: ${gs.state.inventory[k]}`);
    }
    assert.equal(gs.isBotPaused(), false, 'Bot asla duraklatılmamış olmalı');
  });

  await t.test('3. Dondurulmuş (Paused) bot, kasada ASTRA varken updateBotPauseState anında asgari tedarikle uyanmalı; ASTRA yoksa donuk kalmalı', () => {
    const gs = new GameStateManager();
    gs.state.level = 1;
    gs.state.tavernaBotActive = true;
    const initialExpiry = Date.now() + 20 * 3600 * 1000;
    gs.state.tavernaBotExpiresAt = initialExpiry;
    gs.state.botPaused = true;
    gs.state.botPausedRemainingMs = 20 * 3600 * 1000; // 20 saat dondurulmuş
    gs.state.inventory.wood = 0;
    gs.state.inventory.iron = 0;
    gs.state.inventory.wheat = 0;
    gs.state.adAstraBalance = 0; // ASTRA YOK!
    gs.state.stamina = 100;
    for (const t of Object.values(gs.state.tools)) t.durability = 4320;   // v2: 6 alet, hepsi sağlam

    // ASTRA yokken updateBotPauseState çağrıldığında alım yapamaz ve donuk kalır
    const pauseState = gs.updateBotPauseState();
    assert.equal(pauseState.isPaused, true, 'ADA yokken bot donuk kalmalı');
    assert.equal(gs.isBotPaused(), true, 'Bot güvenle duraklatılmış olmalı');

    // Kullanıcı hesaba ASTRA yatırdığında (Örn: 8.000 ASTRA) bot asgari kaynak alıp anında uyanmalı
    gs.state.adAstraBalance = 8000;
    const resumeCheck = gs.updateBotPauseState();
    assert.equal(resumeCheck.isPaused, false, 'ADA gelince asgari kaynak alınıp bot uyanmalı');
    assert.equal(gs.isBotPaused(), false, 'Bot artık duraklatılmış olmamalı');
    assert.ok(gs.state.inventory.wood >= 50, 'Odun >= 50 olmalı');
    assert.ok(gs.state.inventory.iron >= 50, 'Demir >= 50 olmalı');
    assert.ok(gs.state.inventory.wheat >= 50, 'Buğday >= 50 olmalı');
  });
});
