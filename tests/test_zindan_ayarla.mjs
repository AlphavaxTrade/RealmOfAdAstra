// Zindan canavar ayar aracının (scripts/model/zindan_ayarla.mjs) mantığı (18 Ekim 2026). Tam öneri tablosu dakikalar sürer, burada yalnız
// yardımcılar ve tek canavarlık bir ayar sınanır.
import assert from 'node:assert/strict';
import { azalmayan, olcekle, ayarla, NORMAL_TAKVIM, BOSSLAR } from '../scripts/model/zindan_ayarla.mjs';
import { enErkenGun } from '../scripts/model/zindan_tempo.mjs';
import { DUNGEON_LEVELS, HAK_KURALLARI } from '../scripts/model/zindan_denge.mjs';

const ok = ad => console.log(`✅ ${ad}`);

// 1) izotonik (azalmayan) düzeltme: zaten artan dizi aynen kalır; ihlal komşu ortalamasına çekilir; toplam korunur
{
  assert.deepEqual(azalmayan([1, 2, 3, 4]), [1, 2, 3, 4]);
  assert.deepEqual(azalmayan([1, 5, 3, 7]), [1, 4, 4, 7]);
  assert.deepEqual(azalmayan([5, 4, 3]), [4, 4, 4]);
  const girdi = [10, 30, 20, 25, 15, 40], cikti = azalmayan(girdi);
  for (let i = 1; i < cikti.length; i++) assert.ok(cikti[i] >= cikti[i - 1] - 1e-9);
  assert.ok(Math.abs(cikti.reduce((a, b) => a + b) - girdi.reduce((a, b) => a + b)) < 1e-9, 'toplam korunur');
  ok('azalmayan (izotonik) düzeltme: artan dizi aynen, ihlaller ortalamayla giderilir, toplam korunur');
}

// 2) ölçekleme: can 50, saldırı 5 adımına yuvarlanır; yetenek/ödül alanları korunur; en az bir adım
{
  const c = DUNGEON_LEVELS[1], y = olcekle(c, 2);
  assert.equal(y.hp, Math.round(c.hp * 2 / 50) * 50); assert.equal(y.atk, Math.round(c.atk * 2 / 5) * 5);
  assert.deepEqual(y.abilities, c.abilities); assert.equal(y.rewardXp, c.rewardXp); assert.equal(y.level, c.level);
  assert.equal(olcekle(c, 0.0001).hp, 50); assert.equal(olcekle(c, 0.0001).atk, 5);
  ok('olcekle: can 50, saldırı 5 adımına yuvarlanır; yetenek ve ödül XP korunur');
}

// 3) takvim: 18 canavar, artan günler; bosslar 9 ve 18
{
  const gunler = Object.keys(NORMAL_TAKVIM).map(Number).sort((a, b) => a - b).map(k => NORMAL_TAKVIM[k]);
  assert.equal(gunler.length, 18);
  for (let i = 1; i < gunler.length; i++) assert.ok(gunler[i] >= gunler[i - 1], 'takvim azalmıyor');
  assert.equal(gunler[17], 120); assert.deepEqual(BOSSLAR, [9, 18]);
  ok('Normal mod takvimi: 18 canavar, günler artıyor, son boss 120. gün');
}

// 4) tek canavar ayarı: 4. canavar hedef gün 5; araç bulunan değerle gerçekten hedefe yaklaşıyor
{
  const c = DUNGEON_LEVELS.find(x => x.level === 4), hak = HAK_KURALLARI['kat+1'](c);
  const r = ayarla(m => olcekle(c, m), hak, NORMAL_TAKVIM[4]);
  assert.ok(r, 'çarpan bulundu');
  const e = enErkenGun(olcekle(c, r.m), hak);
  assert.equal(e.gun, r.gun);
  assert.ok(e.gun >= 3.5 && e.gun <= 7.5, `hedef 5 gün, bulunan ${e.gun}`);
  ok('4. canavar için ayar: hedef 5 gün, bulunan ' + e.gun);
}

console.log('\n4/4 zindan ayar aracı testi geçti');
