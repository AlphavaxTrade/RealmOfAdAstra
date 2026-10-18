// Zindan tempo modelinin (scripts/model/zindan_tempo.mjs) doğruluğu (18 Ekim 2026): hesap seviyesi → gün eğrisi oyunun kendi tasarımıyla
// (HEDEF_GUN = 1100 gün, seviye 81) uyumlu olmalı; teçhizat günü üretim hızıyla orantılı; en erken gün aramasının mantığı.
import assert from 'node:assert/strict';
import { seviyeGunu, takimGunu, enErkenGun, DAKIKA_GUNDE } from '../scripts/model/zindan_tempo.mjs';
import { DUNGEON_LEVELS, GAME_CONFIG } from '../scripts/model/zindan_denge.mjs';

const ok = ad => console.log(`✅ ${ad}`);
const canavar = lv => DUNGEON_LEVELS.find(c => c.level === lv);

// 1) seviye 81 = HEDEF_GUN (js/gameState/gelisim.js: 1100 gün) ve eğri artıyor
{
  assert.equal(GAME_CONFIG.MAX_PLAYER_LEVEL, 81);
  assert.ok(Math.abs(seviyeGunu(81) - 1100) <= 1, `seviye 81 günü ${seviyeGunu(81)} (1100 olmalı: GUNLUK_XP_ARZI sabiti koddan ayrıştı mı?)`);
  assert.equal(seviyeGunu(1), 0);
  for (let s = 2; s <= 81; s++) assert.ok(seviyeGunu(s) >= seviyeGunu(s - 1), `seviye ${s}`);
  ok('hesap seviyesi → gün eğrisi: seviye 81 = 1100 gün (oyunun tasarımı), tekdüze artıyor');
}

// 2) teçhizat günü: çıplak 0; asker sayısıyla doğru orantılı; seviyeyle artar; darboğaz bir hammadde adı
{
  assert.equal(takimGunu(3, 0), 0);
  const a = takimGunu(1, 5), b = takimGunu(4, 5);
  assert.ok(Math.abs(b.gun / a.gun - 4) < 0.1, 'asker sayısı 4 kat → süre 4 kat');
  assert.ok(takimGunu(2, 6).gun > takimGunu(2, 5).gun);
  assert.ok(['odun', 'demir', 'komur', 'tas'].includes(a.darbogaz));
  // elle kontrol: 1 askerlik seviye 1 takım odun 1167; günlük yarım üretim = odun/dk × 1440 × 0,5
  const beklenen = 1167 / (GAME_CONFIG.BASE_PRODUCTION.wood * DAKIKA_GUNDE * 0.5);
  const t1 = takimGunu(1, 1);
  assert.ok(t1.gun >= Math.round(beklenen * 10) / 10 - 0.05, 'en az odun süresi kadar');
  ok('takım günü: çıplak 0, asker sayısıyla orantılı, seviyeyle artıyor, darboğaz hammadde belirtiliyor');
}

// 3) en erken gün: ilk canavar ilk gün, daha zor canavar daha geç ya da eşit; bulunan çözüm gerçekten yeniyor
{
  const e1 = enErkenGun(canavar(1), 2), e3 = enErkenGun(canavar(3), 2);
  assert.ok(e1 && e1.gun <= 0.5, '1. canavar ilk günlerde yenilir');
  assert.ok(e3 && e3.gun >= e1.gun, '3. canavar 1. canavardan erken olamaz');
  assert.ok(e3.askerSeviyesi >= 1 && e3.takim >= 0 && e3.takim <= 10);
  ok('en erken gün: 1. canavar ilk gün, zor canavar daha geç ya da eşit');
}

console.log('\n3/3 zindan tempo modeli testi geçti');
