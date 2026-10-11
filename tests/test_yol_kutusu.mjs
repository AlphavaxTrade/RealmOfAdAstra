// Rehber kutusunun durumu: ne zaman gizlenir, ne yazar; görev başlığı kaçışlı.
import assert from 'node:assert/strict';
import { yolKutusu } from '../js/ui/yol.js';

const ozet = (o) => ({ toplam: 47, biten: 10, hazir: 0, siradaki: { title: 'İlk seferini başlat' }, ...o });

assert.equal(yolKutusu(ozet({ toplam: 0 })).gizli, true, 'görev yoksa gizli');
assert.equal(yolKutusu(ozet({ biten: 47, siradaki: null })).gizli, true, 'hepsi bittiyse gizli');
assert.equal(yolKutusu(ozet({}), true).gizli, true, 'kapatıldı ve ödül yok → gizli');
assert.equal(yolKutusu(ozet({ hazir: 2 }), true).gizli, false, 'ödül hazırsa kapatılsa da görünür');

{
  const d = yolKutusu(ozet({}));
  assert.equal(d.gizli, false);
  assert.equal(d.odulVar, false);
  assert.ok(d.html.includes('İlk seferini başlat') && d.html.includes('10/47') && d.html.includes('width:21%'));
}
{
  const d = yolKutusu(ozet({ hazir: 3 }));
  assert.equal(d.odulVar, true);
  assert.ok(d.html.includes('3 ödül hazır'));
}
assert.ok(!yolKutusu(ozet({ siradaki: { title: '<img src=x onerror=1>' } })).html.includes('<img'), 'başlık kaçışlı');
console.log('✅ yol kutusu durumu');
