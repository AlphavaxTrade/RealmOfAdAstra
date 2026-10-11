import test from 'node:test';
import assert from 'node:assert/strict';
import { gameState } from '../js/gameState.js';
import '../js/config.js';

test('Sağ Menü Krallık Kontrol Merkezi & Hızlı Hasat Testi', async (t) => {
  gameState.vanillaReset();

  await t.test('Biten sefer yokken sweepCompletedExpeditions güvenli şekilde false dönmeli', () => {
    delete gameState.state.activeExpeditions['iron'];
    delete gameState.state.activeExpeditions['wood'];
    delete gameState.state.activeExpeditions['wheat'];

    const res = gameState.sweepCompletedExpeditions();
    assert.equal(res.success, false, 'Hazır sefer yokken false dönmeli');
  });

  await t.test('Biten seferler tek tıkla toplanmalı ve depoya aktarılmalı', () => {
    gameState.state.activeExpeditions['wood'] = {
      nodeId: 'wood',
      durationMinutes: 10,
      durationSeconds: 600,
      elapsedSeconds: 600,
      claimedSeconds: 0,
      isCompleted: true
    };

    const initialWood = gameState.state.inventory.wood || 0;
    const res = gameState.sweepCompletedExpeditions();
    assert.equal(res.success, true, 'Biten sefer başarıyla toplanmalı');
    assert(res.totalHarvested > 0, 'Toplanan odun 0 dan büyük olmalı');
    assert((gameState.state.inventory.wood || 0) > initialWood, 'Envanterdeki odun artmış olmalı');
    assert.equal(gameState.state.activeExpeditions['wood'], undefined, 'Toplanan sefer silinmiş olmalı');
  });

  await t.test('Tüm aletleri tek tıkla onarma maliyeti ve repairAllTools çalışmalı', () => {
    gameState.state.tools.axe.durability = 10;
    const costs = gameState.getAllRepairCost();
    assert.equal(costs.count, 1, '1 adet hasarlı alet tespit edilmeli');
    assert(costs.totalAda > 0, 'ADA tamir bedeli hesaplanmalı');

    gameState.state.inventory.wood = 50000;
    gameState.state.inventory.iron = 50000;
    gameState.state.adAstraBalance = 500000;

    const repairRes = gameState.repairAllTools();
    assert.equal(repairRes.success, true, 'Tüm aletler başarıyla onarılmalı');
    assert.equal(gameState.state.tools.axe.durability, 4320, 'Balta tam sağlığa kavuşmalı');
  });
});
