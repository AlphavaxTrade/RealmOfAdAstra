// "Yeni sürüm geldi" bildirimi: sürüm günlüğünde oyuncunun son gördüğünden yeni sürüm varsa zil panelinde "Oku" düğmeli bildirim çıkar;
// sürüm geçmişi açılınca ya da bildirim temizlenince bir daha çıkmaz; ilk seviyedeki taze hesaba çıkmaz.
import assert from 'node:assert/strict';
import { SURUM_ANAHTARI, yeniSurumler, surumBildirimi, surumuGoruldu } from '../js/ui/v3/surum-bildirim.js';
import { bildirimEkle, bildirimPaneliHtml } from '../js/ui/v3/bildirim.js';

const depoYap = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, _m: m }; };
const gunluk = [
  { version: 'v1.1', title: 'Birinci' },
  { version: 'v1.2', title: 'İkinci' },
  { version: 'v1.3', title: 'Üçüncü <b>' }
];

// Sürüm sırası günlükteki yerinden gelir (eskiden yeniye)
assert.deepEqual(yeniSurumler(gunluk, 'v1.2').map((k) => k.version), ['v1.3']);
assert.deepEqual(yeniSurumler(gunluk, 'v1.3'), []);
assert.equal(yeniSurumler(gunluk, null).length, 3, 'hiç görmemişse hepsi yeni');
assert.equal(yeniSurumler(gunluk, 'v0.9').length, 3, 'tanınmayan sürüm: hepsi yeni');
assert.deepEqual(yeniSurumler(undefined, 'v1.2'), []);

// Eski oyuncu (görülen kayıt yok): bildirim çıkar, düğmesi Sürüm geçmişini açar, kaç sürüm atlandığı yazar
{
  const depo = depoYap();
  const b = surumBildirimi(gunluk, { depo, yeniOyuncu: false });
  assert.ok(b, 'bildirim var');
  assert.match(b.metin, /Yeni sürüm geldi: v1\.3 · Üçüncü/);
  assert.ok(!/daha/.test(b.metin), 'hiç görmemiş oyuncuya sürüm sayısı söylenmez');
  depo.setItem(SURUM_ANAHTARI, 'v1.1');
  assert.match(surumBildirimi(gunluk, { depo }).metin, /\+1 sürüm daha/, 'bir sürüm görmüşse kaç sürüm atladığı yazar');
  depo._m.delete(SURUM_ANAHTARI);
  assert.equal(b.eylem.ekran, 'surum');
  assert.equal(b.eylem.ad, 'Oku');
  assert.equal(depo.getItem(SURUM_ANAHTARI), null, 'bildirimin çıkması sürümü görüldü saymaz');
  assert.ok(surumBildirimi(gunluk, { depo }), 'okunmadıkça her açılışta tekrar çıkar');
  surumuGoruldu(gunluk, depo);
  assert.equal(depo.getItem(SURUM_ANAHTARI), 'v1.3');
  assert.equal(surumBildirimi(gunluk, { depo }), null, 'okunduktan sonra çıkmaz');
  // sonradan yeni sürüm gelirse yine çıkar, yalnız yeniyi söyler
  const yeni = [...gunluk, { version: 'v1.4', title: 'Dördüncü' }];
  const b2 = surumBildirimi(yeni, { depo });
  assert.match(b2.metin, /v1\.4 · Dördüncü/);
  assert.ok(!/daha/.test(b2.metin), 'tek yeni sürüm: "daha" eki yok');
}

// Taze hesap: bildirim yok, son sürüm sessizce görüldü yazılır
{
  const depo = depoYap();
  assert.equal(surumBildirimi(gunluk, { depo, yeniOyuncu: true }), null);
  assert.equal(depo.getItem(SURUM_ANAHTARI), 'v1.3');
}

// Güvenlik: depo yok ya da hata atıyorsa oyun bozulmaz
assert.equal(surumBildirimi(gunluk, { depo: null }), null);
assert.equal(surumBildirimi([], { depo: depoYap() }), null);
{
  const bozuk = { getItem() { throw new Error('kapalı'); }, setItem() { throw new Error('kapalı'); } };
  assert.ok(surumBildirimi(gunluk, { depo: bozuk }), 'okunamıyorsa bildirim çıkar');
  surumuGoruldu(gunluk, bozuk);   // hata fırlatmaz
}

// Zil paneli: eylemli bildirimde düğme var, metin kaçışlı; eylemsizde düğme yok
{
  const liste = [];
  const b = surumBildirimi(gunluk, { depo: depoYap() });
  bildirimEkle(liste, b.simge, b.metin, 1000, b.eylem);
  bildirimEkle(liste, '⚔️', 'Maç kazanıldı', 2000);
  assert.equal(liste[1].eylem.ekran, 'surum');
  assert.equal(liste[0].eylem, undefined);
  const html = bildirimPaneliHtml(liste);
  assert.equal((html.match(/data-bildirim-git="surum"/g) || []).length, 1, 'yalnız eylemli bildirimde düğme');
  assert.ok(html.includes('>Oku<'));
  assert.ok(!/<b>Üçüncü/.test(html) && html.includes('Üçüncü &lt;b&gt;'), 'sürüm başlığı kaçışlanır');
  assert.equal(bildirimEkle([], '🔔', 'x', 1, { ad: 'Aç' })[0].eylem, undefined, 'ekransız eylem eklenmez');
}
console.log('✅ yeni sürüm bildirimi: sürüm sırası, okundu, taze hesap, düğme');
