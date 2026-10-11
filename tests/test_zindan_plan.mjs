// Zindan planı: 6 kat x 3 oda = 18 seviye; yerleşim ekran içinde, seviye durumları ve ilerleme kuralı.
import assert from 'node:assert/strict';
import { KATLAR, KAT_SAYISI, EN_UST_SEVIYE, katCanavarlari, yerlestir, odaDurumu, kilitMesaji, odaEtiketi, odaIpucu } from '../js/ui/zindan-plan.js';

assert.equal(KATLAR.length, KAT_SAYISI);
const gorulenSeviyeler = [];
KATLAR.forEach((k, i) => {
  assert.equal(k.kat, i + 1);
  assert.equal(k.odalar.length, 3, `${k.kat}. katta 3 oda`);
  const c = katCanavarlari(k.kat);
  assert.equal(c.length, 3, `${k.kat}. katın 3 canavarı`);
  c.forEach((m, j) => { gorulenSeviyeler.push(m.level); assert.ok(m.name && m.hp > 0 && m.atk > 0, `${m.name} alanları`); void j; });
  // Her levha ekranın içinde
  for (const o of [...k.odalar, ...k.gecitler]) {
    assert.ok(o.px - o.bw / 2 >= 0 && o.px + o.bw / 2 <= 1.01, `${k.kat}. kat levha yatayda taşmıyor (${o.px})`);
    assert.ok(o.py - o.bh / 2 >= 0 && o.py + o.bh / 2 <= 1.001, `${k.kat}. kat levha dikeyde taşmıyor (${o.py})`);
  }
  assert.equal(k.gecitler.length > 0, k.kat < KAT_SAYISI, 'son katta geçit yok, diğerlerinde var');
});
assert.deepEqual([...gorulenSeviyeler].sort((a, b) => a - b), Array.from({ length: EN_UST_SEVIYE }, (_, i) => i + 1), '18 seviye tam ve tekil');
console.log('✅ plan: 6 kat, 18 seviye, levhalar ekran içinde');

assert.deepEqual(yerlestir({ px: 0.5, py: 0.25, bw: 0.2, bh: 0.1 }, 1000, 800), { x: 500, y: 200, bw: 200, bh: 80 });
assert.deepEqual(odaDurumu(3, 3), { kilitli: false, yenildi: false, siradaki: true });
assert.deepEqual(odaDurumu(2, 5), { kilitli: false, yenildi: true, siradaki: false });
assert.deepEqual(odaDurumu(7, 5), { kilitli: true, yenildi: false, siradaki: false });
console.log('✅ oda durumu');

// Metinler
const m = { level: 9, name: 'Kadim Taş Golyat' };
assert.match(odaEtiketi(m, odaDurumu(9, 9)), /👑 Seviye 9\nKadim Taş Golyat\n⚔️ Savaşa gir/);
assert.match(odaEtiketi({ level: 2, name: 'Goblin' }, odaDurumu(2, 6)), /✅ Yenildi/);
assert.match(odaEtiketi({ level: 5, name: 'x' }, odaDurumu(5, 1)), /🔒 Kilitli/);
assert.match(kilitMesaji(3, m), /Seviye 3'desiniz.*\[Seviye 9\] Kadim Taş Golyat/);
assert.equal(odaIpucu(m, 0, odaDurumu(9, 9), 9).baslik, 'Oda 1 — Seviye 9: Kadim Taş Golyat');
assert.ok(!/Chamber/.test(odaIpucu(m, 1, odaDurumu(9, 3), 3).baslik), 'İngilizce "Chamber" yok');
console.log('✅ oda metinleri Türkçe');
