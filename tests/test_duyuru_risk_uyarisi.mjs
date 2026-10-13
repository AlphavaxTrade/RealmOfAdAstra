// Duyurular (Ben → Duyurular ve üstteki tek satır uyarı): 13 Ekim 2026'da eski risk uyarısı ve v1.25 sürüm notu kullanıcı
// isteğiyle kaldırıldı. Liste boş olabilir (şerit görünmez); eklenen her duyurunun biçimi geçerli olmalı ve eski metin geri gelmemeli.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CONFIG } from '../js/config.js';

test('Duyurular: eski risk uyarısı kaldırıldı, biçim doğru', async (t) => {
  await t.test('1. ANNOUNCEMENTS tanımlı bir dizi', () => {
    assert.ok(Array.isArray(GAME_CONFIG.ANNOUNCEMENTS));
  });

  await t.test('2. Eski "antigravity / audit yapılmamıştır" risk metni ve v1.25 notu geri gelmedi', () => {
    const tumu = JSON.stringify(GAME_CONFIG.ANNOUNCEMENTS).toLocaleLowerCase('tr');
    for (const eski of ['antigravity', 'audit yapılmamıştır', 'audit_risk_warning', 'v125_economy_update']) {
      assert.ok(!tumu.includes(eski), `"${eski}" duyurularda olmamalı`);
    }
  });

  await t.test('3. Varsa her duyuru { id, badge, text } taşır ve kimlikleri benzersiz', () => {
    const kimlikler = new Set();
    for (const d of GAME_CONFIG.ANNOUNCEMENTS) {
      assert.ok(typeof d.id === 'string' && d.id, 'id');
      assert.ok(typeof d.text === 'string' && d.text.length > 0, `${d.id}: text`);
      assert.ok(!kimlikler.has(d.id), `${d.id} tekrarlanıyor`);
      kimlikler.add(d.id);
    }
  });
});
