// Savaş motoru: altın kayıt (1.500 tohumlu savaş) + her savaşta değişmezlik kontrolleri.
// Eski motordan alınan kayıt (tests/altin/savas_kayit.json) yeni motorla birebir aynı çıkmalı.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calistir, SENARYO_SAYISI } from './altin/savas_senaryo.mjs';
import { makeRng, createUnit, simulateBattle, predictBattle } from '../js/combat.js';

const dizin = path.dirname(fileURLToPath(import.meta.url));
const kayit = JSON.parse(fs.readFileSync(path.join(dizin, 'altin', 'savas_kayit.json'), 'utf8'));
assert.equal(kayit.ozetler.length, SENARYO_SAYISI, 'altın kayıt senaryo sayısı');

const farklar = [];
for (let n = 0; n < SENARYO_SAYISI; n++) {
  const { sonuc, ozet } = calistir(n);
  if (ozet !== kayit.ozetler[n]) farklar.push(n);

  // Her savaşta geçerli olması gerekenler
  for (const u of [...sonuc.allies, ...sonuc.enemies]) {
    assert.ok(u.hp >= 0 && u.hp <= u.maxHp, `senaryo ${n}: ${u.uid} can sınırı dışında (${u.hp}/${u.maxHp})`);
    assert.ok(Number.isFinite(u.damageDealt) && Number.isFinite(u.damageTaken), `senaryo ${n}: sayaç sayı değil`);
  }
  assert.ok(sonuc.roundCount <= 40, `senaryo ${n}: tur sınırı aşıldı`);
  const hasarKayitlari = sonuc.log.filter(e => e.type === 'damage');
  for (const e of hasarKayitlari) {
    assert.ok(e.amount >= 0 && e.targetHp >= 0 && e.targetHp <= e.targetMaxHp, `senaryo ${n}: hasar kaydı bozuk`);
  }
  assert.equal(sonuc.rounds.length, sonuc.roundCount, `senaryo ${n}: tur kaydı sayısı`);
}
assert.deepEqual(farklar, [], `altın kayıttan sapan senaryolar: ${farklar.slice(0, 10).join(', ')} (toplam ${farklar.length})`);
console.log(`✅ ${SENARYO_SAYISI} savaş altın kayıtla birebir aynı, değişmezlikler tuttu`);

// Aynı tohum aynı savaş
{
  const kur = () => ({
    allies: [createUnit({ uid: 'a', name: 'A', atk: 40, maxHp: 300, skills: ['shockwave', 'stunStrike'] })],
    enemies: [createUnit({ uid: 'e', name: 'E', atk: 35, maxHp: 280, abilities: ['sunder', 'cleave'] })]
  });
  const bir = simulateBattle({ ...kur(), seed: 77 });
  const iki = simulateBattle({ ...kur(), seed: 77 });
  assert.deepEqual(bir.log, iki.log);
  assert.equal(bir.winner, iki.winner);
  console.log('✅ aynı tohum aynı savaşı verir');
}

// Tohumlu rastgele sayı üreteci sabit kalmalı (sunucu ile tarayıcı aynı sonucu görsün)
{
  const r = makeRng(12345);
  // değerler eski motordan alındı (git: js/combat.js, 11 Ekim 2026)
  assert.deepEqual([r(), r(), r()].map(x => +x.toFixed(6)), [0.979728, 0.306752, 0.484205]);
  console.log('✅ makeRng tekrarlanabilir');
}

// Tahmin: tohum tabanı verilince tekrarlanabilir
{
  const A = () => [createUnit({ uid: 'a', atk: 40, maxHp: 300 })];
  const E = () => [createUnit({ uid: 'e', atk: 30, maxHp: 250 })];
  const bir = predictBattle(A, E, 30, { seedBase: 99 });
  const iki = predictBattle(A, E, 30, { seedBase: 99 });
  assert.deepEqual(bir, iki);
  assert.equal(bir.samples, 30);
  console.log('✅ predictBattle seedBase ile tekrarlanabilir');
}
