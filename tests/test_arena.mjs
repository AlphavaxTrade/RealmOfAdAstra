// Canlı savaş arenasının saf kısımları: resim seçimi, olay kuyruğu, olayın birime etkisi, birim kurma.
import assert from 'node:assert/strict';
import { canavarResmi, birimResmi, olayKuyrugu, olayiUygula, sonCanlariEsitle, olayBeklemesi, birimleriKur } from '../js/ui/arena.js';

// Canavar resmi: kat numarası önce, sonra ad ipucu, yoksa varsayılan
assert.equal(canavarResmi(9, 'Bilinmeyen'), 'assets/monster_stone_goliath.jpg');
assert.equal(canavarResmi(99, 'Ateş İblisi'), 'assets/monster_fire_demon.jpg');
assert.equal(canavarResmi(99, 'Kemik Okçusu'), 'assets/monster_skeleton.jpg');
assert.equal(canavarResmi(99, 'x'), 'assets/monster_swamp_slime.jpg');
for (let k = 1; k <= 18; k++) assert.match(canavarResmi(k, ''), /^assets\/monster_.*[.]jpg$/, `kat ${k} resim`);
console.log('✅ canavar resmi seçimi');

// Birim resmi: kendi resmi > müttefik varsayılanı > gladyatör adı > canavar
assert.equal(birimResmi({ avatar: 'a.png' }), 'a.png');
assert.equal(birimResmi({ side: 'ally', name: 'Ali' }), 'assets/ui/soldier_1.webp');
assert.equal(birimResmi({ side: 'enemy', name: 'Gölge Gladyatörü Kael' }), 'assets/gladiator_rival.jpg');
assert.equal(birimResmi({ side: 'enemy', name: 'Kurt', level: 99 }), 'assets/monster_shadow_wolf.jpg');
console.log('✅ birim resmi seçimi');

// Olay kuyruğu: tura bağlı olaylar sırayla, tura bağlı olmayan başlangıç olayları (log'da olup turda olmayan) başa
{
  const e1 = { type: 'damage', targetUid: 'u1', targetHp: 5 };
  const e2 = { type: 'heal', targetUid: 'u1', targetHp: 9 };
  const baslangic = { type: 'modifier', text: 'Kat etkisi' };
  const k = olayKuyrugu({ rounds: [{ round: 1, events: [e1] }, { round: 2, events: [e2] }], log: [baslangic, e1, e2] });
  assert.deepEqual(k.map((x) => [x.round, x.ev.type]), [[0, 'modifier'], [1, 'damage'], [2, 'heal']]);
  assert.deepEqual(olayKuyrugu(null), []);
  assert.deepEqual(olayKuyrugu({}), []);
  console.log('✅ olay kuyruğu');
}

// Olayın etkisi: hasar canı düşürür ve ölümü işaretler; iyileştirme canı yükseltir; bilinmeyen hedef sessizce geçilir
{
  const birimler = [{ uid: 'a', hp: 50, dead: false }, { uid: 'b', hp: 20, dead: false }];
  olayiUygula(birimler, { type: 'damage', targetUid: 'b', targetHp: 0, died: true });
  assert.deepEqual([birimler[1].hp, birimler[1].dead], [0, true]);
  olayiUygula(birimler, { type: 'damage', targetUid: 'a', targetHp: -7 });
  assert.equal(birimler[0].hp, 0, 'can eksiye düşmez');
  assert.equal(birimler[0].dead, true);
  const c = [{ uid: 'c', hp: 5, dead: false }];
  olayiUygula(c, { type: 'heal', targetUid: 'c', targetHp: 30 });
  assert.equal(c[0].hp, 30);
  olayiUygula(c, { type: 'damage', targetUid: 'yok', targetHp: 1 });
  olayiUygula(c, { type: 'ability', actorUid: 'c' });
  assert.equal(c[0].hp, 30);
  console.log('✅ olayın birime etkisi');
}

// Son canlar kayda eşitlenir (atlanan olaylar sonucu bozmaz)
{
  const b = [{ uid: 'a', hp: 100, dead: false }, { uid: 'e', hp: 100, dead: false }];
  sonCanlariEsitle(b, { allies: [{ uid: 'a', hp: 31.6 }], enemies: [{ uid: 'e', hp: 0 }] });
  assert.deepEqual([b[0].hp, b[0].dead, b[1].hp, b[1].dead], [32, false, 0, true]);
  sonCanlariEsitle(b, null);
  console.log('✅ son can eşitleme');
}

// Bekleme süreleri ve birim kurma varsayılanları
assert.ok(olayBeklemesi({ type: 'phase' }) > olayBeklemesi({ type: 'ability' }) && olayBeklemesi({ type: 'ability' }) > olayBeklemesi({ type: 'damage' }));
{
  const u = birimleriKur([{ name: 'A', hp: 40, atk: 0 }], [{ name: 'Boss', level: 9, hp: 300, boss: true }, { name: 'Fare', level: 1, hp: 0 }], 'dungeon');
  assert.equal(u.length, 3);
  assert.deepEqual(u.map((x) => x.id), ['a0', 'e0', 'e1']);
  assert.equal(u[0].atk, 25, 'saldırısız müttefik varsayılanı 25');
  assert.deepEqual(u[0].skills, ['shieldWall']);
  assert.deepEqual(u[1].skills, ['cleave', 'roar'], 'boss varsayılan yetenekleri');
  assert.equal(u[1].avatar, 'assets/monster_stone_goliath.jpg');
  assert.equal(u[2].hp, 1, 'can en az 1');
  const k = birimleriKur([], [{ name: 'Rakip' }], 'colosseum');
  assert.equal(k[0].avatar, 'assets/gladiator_rival.jpg');
  console.log('✅ birim kurma');
}
