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

test('🤖 Bot Çift Yönlü Dengeleme: Eksik Hammadde Oto-Tedarik & Seviyeye Göre Sefer Tamiratı +%50 Rezerv Güvencesi', async (t) => {
  localStorage.clear();

  await t.test('1. getBotDynamicResourceDeficitTargets: Seviye arttıkça (Lv 1, 2, 3) tamirat bedelleri ve +%50 hedef orantılı artmalı', () => {
    const gs = new GameStateManager();

    // v2 ölçeği: hedef = en az 50 ya da (1 seferlik, 3 aletlik aşınmanın 1,5 katı); silo kapasitesinin %80 tavanı
    const expect = (lvl, res) => {
      const dur = gs.getExpeditionDurationMinutes(lvl);
      const perMin = (gs.getResourceRatePerMinute(res) * 0.25) / 3;
      const one = Math.ceil(3 * dur * perMin);
      const cap = gs.getWarehouseCapacity()[res];
      return Math.min(Math.floor(cap * 0.8), Math.max(50, Math.ceil(one * 1.5)));
    };
    const lv1Data = gs.getBotDynamicResourceDeficitTargets(1);
    assert.equal(lv1Data.durationMinutes, 18, 'Lv 1 sefer süresi 18 dakika olmalı');
    assert.equal(lv1Data.targets.wood, expect(1, 'wood'), `Lv 1 Odun hedefi formülle aynı olmalı, bulunan: ${lv1Data.targets.wood}`);
    assert.equal(lv1Data.targets.iron, expect(1, 'iron'), `Lv 1 Demir hedefi formülle aynı olmalı, bulunan: ${lv1Data.targets.iron}`);

    const lv2Data = gs.getBotDynamicResourceDeficitTargets(2);
    assert.equal(lv2Data.durationMinutes, 72, 'Lv 2 sefer süresi 72 dakika olmalı');
    assert.ok(lv2Data.targets.wood > lv1Data.targets.wood, 'Lv 2 Odun hedefi Lv 1den büyük olmalı');
    assert.ok(lv2Data.targets.iron > lv1Data.targets.iron, 'Lv 2 Demir hedefi Lv 1den büyük olmalı');
    assert.equal(lv2Data.targets.wood, expect(2, 'wood'), `Lv 2 Odun hedefi formülle aynı olmalı, bulunan: ${lv2Data.targets.wood}`);
    assert.equal(lv2Data.targets.iron, expect(2, 'iron'), `Lv 2 Demir hedefi formülle aynı olmalı, bulunan: ${lv2Data.targets.iron}`);

    const lv3Data = gs.getBotDynamicResourceDeficitTargets(3);
    assert.equal(lv3Data.durationMinutes, 126, 'Lv 3 sefer süresi 126 dakika olmalı');
    assert.ok(lv3Data.targets.wood > lv2Data.targets.wood, 'Lv 3 Odun hedefi Lv 2den büyük olmalı');
    assert.ok(lv3Data.targets.iron > lv2Data.targets.iron, 'Lv 3 Demir hedefi Lv 2den büyük olmalı');
    assert.equal(lv3Data.targets.wood, expect(3, 'wood'), `Lv 3 Odun hedefi formülle aynı olmalı, bulunan: ${lv3Data.targets.wood}`);
    assert.equal(lv3Data.targets.iron, expect(3, 'iron'), `Lv 3 Demir hedefi formülle aynı olmalı, bulunan: ${lv3Data.targets.iron}`);
  });

  await t.test('2. Depoda Odun:0, Demir:0, Buğday:0 iken autoBuyBotResourceDeficit AMM pazarından asgari önkoşul miktarını satın alarak botun durmasını engellemeli', () => {
    const gs = new GameStateManager();
    gs.state.level = 2; // Oyuncu Seviye 2
    gs.state.inventory = { wood: 0, iron: 0, wheat: 0, fragments: 0 };
    gs.state.adAstraBalance = 20000;

    const buyRes = gs.autoBuyBotResourceDeficit();

    // KULLANICI KURALI: Kasada ADA varken botun durmaması için asgari önkoşul satın alınır!
    assert.equal(buyRes.bought, true, 'AMMden asgari satın alım başarıyla yapılmalı');
    assert.ok(buyRes.totalSpentAda > 0 && buyRes.totalSpentAda < 2000, 'Siloyu fullemeden sadece asgari harcama yapılmalı');
    assert.ok(gs.state.inventory.wood >= 50, 'Odun en az 50 olmalı');
    assert.ok(gs.state.inventory.iron >= 50, 'Demir en az 50 olmalı');
    assert.ok(gs.state.inventory.wheat >= 50, 'Buğday en az 50 olmalı');
    assert.ok(gs.state.inventory.wood < 500, 'Silo kontrolsüz biçimde doldurulmamalı');
  });

  await t.test('3. Silo Seviye Yükseltildiğinde ambarlar sıfırlansa bile bot aktifse Seviye Tamiratı +%50 kadar satın alıp güvenceye almalı', () => {
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

    // Yükseltme sonrası bot aktif olduğu için ambarlar 0 veya 50 değil; Lv 2 tamiratının %50 fazlası kadar olmalı!
    const expectedTargets = gs.getBotDynamicResourceDeficitTargets(2).targets;
    assert.ok((gs.state.inventory.wood || 0) >= expectedTargets.wood, `Yükseltme sonrası Odun >= ${expectedTargets.wood} olmalı, ambar: ${gs.state.inventory.wood}`);
    assert.ok((gs.state.inventory.iron || 0) >= expectedTargets.iron, `Yükseltme sonrası Demir >= ${expectedTargets.iron} olmalı, ambar: ${gs.state.inventory.iron}`);
    assert.ok((gs.state.inventory.wheat || 0) >= expectedTargets.wheat, `Yükseltme sonrası Buğday >= ${expectedTargets.wheat} olmalı, ambar: ${gs.state.inventory.wheat}`);
    assert.equal(gs.isBotPaused(), false, 'Bot asla duraklatılmamış olmalı');
  });

  await t.test('4. Dondurulmuş (Paused) bot, kasada ADA varken updateBotPauseState anında asgari tedarikle uyanmalı; ADA yoksa donuk kalmalı', () => {
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
    gs.state.adAstraBalance = 0; // ADA YOK!
    gs.state.stamina = 100;
    for (const t of Object.values(gs.state.tools)) t.durability = 4320;   // v2: 6 alet, hepsi sağlam

    // ADA yokken updateBotPauseState çağrıldığında alım yapamaz ve donuk kalır
    const pauseState = gs.updateBotPauseState();
    assert.equal(pauseState.isPaused, true, 'ADA yokken bot donuk kalmalı');
    assert.equal(gs.isBotPaused(), true, 'Bot güvenle duraklatılmış olmalı');

    // Kullanıcı hesaba ADA yatırdığında (Örn: 8.000 ADA) bot asgari kaynak alıp anında uyanmalı
    gs.state.adAstraBalance = 8000;
    const resumeCheck = gs.updateBotPauseState();
    assert.equal(resumeCheck.isPaused, false, 'ADA gelince asgari kaynak alınıp bot uyanmalı');
    assert.equal(gs.isBotPaused(), false, 'Bot artık duraklatılmış olmamalı');
    assert.ok(gs.state.inventory.wood >= 50, 'Odun >= 50 olmalı');
    assert.ok(gs.state.inventory.iron >= 50, 'Demir >= 50 olmalı');
    assert.ok(gs.state.inventory.wheat >= 50, 'Buğday >= 50 olmalı');
  });
});
