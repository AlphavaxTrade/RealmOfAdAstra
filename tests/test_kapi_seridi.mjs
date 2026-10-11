// Kapı şeridi metni: bekleme sırası, askı, izin sorusu ve izin; her dinamik değer kaçışlı.
import assert from 'node:assert/strict';
import { kapiSeridiHtml } from '../js/ui/kapi-seridi.js';

const SAAT = 3600 * 1000;
const simdi = 1_800_000_000_000;
const gorevler = ['rehber', 'kurallar', 'hazirim'];

// Vatandaş ya da yeni oyuncu: şerit yok
assert.equal(kapiSeridiHtml({ kapi: { status: 'citizen' }, katilim: null, simdi }), '');
assert.equal(kapiSeridiHtml({ kapi: { status: 'new' }, katilim: {}, simdi }), '');
assert.equal(kapiSeridiHtml({ kapi: null, katilim: null, simdi }), '');

// Bekleme: sıra, vatandaş sayısı ve üç görev düğmesi; yapılan görev devre dışı
{
  const h = kapiSeridiHtml({ kapi: { status: 'waiting', position: 7, citizens: 100, limit: 100 }, katilim: null, hazirAday: { rehber: true }, gorevIdleri: gorevler, simdi });
  assert.ok(h.includes('7. sıra') && h.includes('100/100'));
  assert.equal((h.match(/data-kapi-gorev=/g) || []).length, 3);
  assert.ok(/data-kapi-gorev="rehber" disabled/.test(h) && !/data-kapi-gorev="kurallar" disabled/.test(h));
  assert.ok(h.includes('Aşağıdaki adımları onaylarsan'));
  const davetli = kapiSeridiHtml({ kapi: { status: 'waiting', position: 1, citizens: 99, limit: 100, davet: true }, katilim: null, gorevIdleri: gorevler, simdi });
  assert.ok(davetli.includes('Yerin açıldı'));
}

// Askıda
assert.ok(kapiSeridiHtml({ kapi: { status: 'suspended' }, katilim: null, simdi }).includes('Yerin askıda'));

// İzin sorusu (süre dolmadıysa) ve izin
{
  const h = kapiSeridiHtml({ kapi: { status: 'citizen' }, katilim: { izinSorusu: { sonTarih: simdi + 5 * SAAT } }, simdi });
  assert.ok(h.includes('izin hakkını kullanmak ister misin') && h.includes('5 saat içinde'));
  assert.ok(h.includes('data-kapi="izin-evet"') && h.includes('data-kapi="izin-hayir"'));
  assert.equal(kapiSeridiHtml({ kapi: { status: 'citizen' }, katilim: { izinSorusu: { sonTarih: simdi - 1 } }, simdi }), '', 'süresi dolan soru gösterilmez');

  const izin = kapiSeridiHtml({ kapi: { status: 'citizen' }, katilim: { izinModu: { bitis: simdi + 3 * 24 * SAAT } }, simdi });
  assert.ok(izin.includes('İzindesin') && izin.includes('3 gün kaldı') && izin.includes('data-kapi="izin-bitir"'));
}

// Kaçış: sunucudan gelen sayı alanları ve görev kimlikleri düz yazı olarak kalır
{
  const h = kapiSeridiHtml({ kapi: { status: 'waiting', position: '<b>1</b>', citizens: '<i>x</i>', limit: 1 }, katilim: null, gorevIdleri: ['<img src=x>'], simdi });
  assert.ok(!h.includes('<img') && !h.includes('<b>1</b>') && !h.includes('<i>x</i>'));
}
console.log('✅ kapı şeridi: bekleme, askı, izin, kaçış');
