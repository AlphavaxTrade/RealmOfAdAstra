import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GameStateManager } from '../js/gameState.js';

test('Zindan Parşömen Düşüşü, Görselleri ve Resimli Ganimet Doğrulama Testi', async (t) => {
  await t.test('1. Tüm Ganimet ve Parşömen Görsel Dosyaları Varlık Klasöründe Bulunmalı', () => {
    const requiredAssets = [
      'assets/scroll_heal.jpg',
      'assets/scroll_stamina.jpg',
      'assets/loot_fragments.jpg',
      'assets/loot_box.jpg',
      'assets/loot_key.jpg',
      'assets/loot_adastra.jpg'
    ];

    for (const assetRelPath of requiredAssets) {
      const fullPath = path.resolve(process.cwd(), 'public', assetRelPath);
      assert.ok(fs.existsSync(fullPath), `Görsel dosyası eksik: ${assetRelPath}`);
      const stats = fs.statSync(fullPath);
      assert.ok(stats.size > 10000, `Görsel dosyası çok küçük veya bozuk: ${assetRelPath} (${stats.size} bayt)`);
    }
  });

  await t.test('2. addDungeonXpAndDrops Parşömen Düştüğünde İmaj ve Envanter Güncellemesi Yapmalı', () => {
    const gs = new GameStateManager();
    const initialHeal = gs.state.inventory.scroll_heal || 0;
    const initialStamina = gs.state.inventory.scroll_stamina || 0;

    // Şans eseri düşene kadar birkaç kez deneyelim veya Boss döngüsü çalıştıralım
    let foundScroll = false;
    for (let i = 0; i < 50; i++) {
      const res = gs.addDungeonXpAndDrops(9, true); // Lv 9 Boss (%40 şans)
      if (res.scrollGained) {
        foundScroll = true;
        assert.ok(res.scrollGained.type === 'scroll_heal' || res.scrollGained.type === 'scroll_stamina', 'Geçerli parşömen tipi olmalı');
        assert.ok(res.scrollGained.name, 'Parşömen adı olmalı');
        assert.ok(res.scrollGained.image && res.scrollGained.image.includes('assets/scroll_'), 'Parşömen görsel yolu tanımlı olmalı');
        break;
      }
    }

    assert.ok(foundScroll, '50 Boss zaferinde en az 1 parşömen düşmeli');
    const totalScrolls = (gs.state.inventory.scroll_heal || 0) + (gs.state.inventory.scroll_stamina || 0);
    assert.ok(totalScrolls > (initialHeal + initialStamina), 'Envanterdeki toplam parşömen artmış olmalı');
  });

  await t.test('3. Boss Canavarlarda Ekstra Ganimet ve Anahtar Çarpanı Devreye Girmeli', () => {
    const gs = new GameStateManager();
    const resNormal = gs.addDungeonXpAndDrops(1, false);
    const resBoss = gs.addDungeonXpAndDrops(9, true);

    assert.equal(resNormal.isBoss, false);
    assert.equal(resBoss.isBoss, true);
    assert.ok(resBoss.xpGained > resNormal.xpGained, 'Boss daha yüksek XP vermeli');
    assert.ok(resBoss.adAstraGained > resNormal.adAstraGained, 'Boss daha yüksek ASTRA vermeli');
  });
});
