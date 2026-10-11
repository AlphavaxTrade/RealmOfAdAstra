import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import '../js/config.js';

test('Taverna Otonom Botu Durum ve Kalan Süre Takip Fonksiyonları Testi', async (t) => {
  const gs = new GameStateManager();

  await t.test('1. Başlangıçta Bot Pasif ve Süre Sıfır Olmalı', () => {
    assert.equal(gs.isAutoCollectorActive(), false, 'Başlangıçta bot pasif olmalı');
    assert.equal(gs.getAutoCollectorRemainingSeconds(), 0, 'Kalan saniye 0 olmalı');
    assert.equal(gs.getAutoCollectorRemainingText(), 'Pasif', 'Kalan süre metni "Pasif" olmalı');
  });

  await t.test('2. Bot Satın Alındığında Kalan Süre ~24 Saat Olmalı ve Metin Doğru Formatlanmalı', () => {
    gs.state.inventory = { iron: 100, wood: 100, wheat: 100 };
    gs.state.adAstraBalance = 100000;
    const res = gs.buyTavernaAutomationBot(false);
    assert.equal(res.success, true, 'Bot başarıyla satın alınmalı');

    assert.equal(gs.isAutoCollectorActive(), true, 'Bot aktif olmalı');
    const remSec = gs.getAutoCollectorRemainingSeconds();
    assert.ok(remSec >= 86390 && remSec <= 86400, `Kalan saniye 24 saat civarı olmalı, alınan: ${remSec}`);

    const remText = gs.getAutoCollectorRemainingText();
    assert.ok(remText.includes('23s') || remText.includes('24s'), `Kalan metin saat içermeli, alınan: ${remText}`);
  });

  await t.test('3. runTavernaAutomationCycle Otonom Sefer Başlatma & Tamirat Döngüsü', () => {
    gs.state.inventory = { iron: 100, wood: 100, wheat: 100 };
    gs.state.stamina = 100;
    gs.state.tools.axe.durability = 1000;
    gs.state.tools.pickaxe.durability = 1000;
    gs.state.tools.sickle.durability = 1000;

    const cycleRes = gs.runTavernaAutomationCycle();
    assert.ok(cycleRes, 'Döngü sonucu dönmeli');
    const activeExps = Object.keys(gs.state.activeExpeditions);
    assert.ok(activeExps.length > 0, 'Otonom bot boştaki seferleri başlatmış olmalı');
  });
});
