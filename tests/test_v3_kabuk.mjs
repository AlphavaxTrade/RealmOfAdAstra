// Arayüz v3: gezinme verisi ve ortak bileşenlerin saf (DOM'suz) kuralları.
// Tarayıcı davranışı (açılma, kapanma, ekran taşması) burada denenmez; o iş scripts/tarayici/v3.mjs ile elle yapılır.
import assert from 'node:assert/strict';
import { SEKMELER, HUB, hubHtml, esc } from '../js/ui/v3/hub.js';
import { gitHaritasi } from '../js/ui/v3/kabuk.js';
import { istatSatiri, bosDurum, iskelet } from '../js/ui/v3/bilesenler.js';
import { sadeBaslik, katlaKurali } from '../js/ui/v3/panel.js';
import { TUR_ADIMLARI, turBaslamali, sonrakiAdim, TUR_KAYIT_ANAHTARI } from '../js/ui/v3/tur.js';
import { SOZLUK, terim } from '../js/ui/v3/sozluk.js';

// 1) Alt çubuk: tam 5 sekme (CSS ızgarası repeat(5)), kimlikler benzersiz, Harita ilk
assert.equal(SEKMELER.length, 5, 'alt çubuk 5 sekme olmalı (css/v3/kabuk.css repeat(5))');
assert.equal(new Set(SEKMELER.map((t) => t.id)).size, 5);
assert.equal(SEKMELER[0].id, 'harita');
for (const t of SEKMELER.filter((x) => x.id !== 'harita')) assert.ok(HUB[t.id], `${t.id} sekmesinin ana listesi olmalı`);
console.log('✅ sekmeler');

// 2) Her liste öğesinin bir eylemi var; anahtarlar bütün listelerde benzersiz; ölü eylem yok
const sahteApi = new Proxy({}, { get: (_, ad) => (ad === 'duyurular' ? () => [] : () => {}) });
const git = gitHaritasi(sahteApi, { yanAc() {}, sekmeSec() {}, uyariMetni: () => [], turBaslat() {} });
const anahtarlar = Object.values(HUB).flatMap((h) => h.ogeler.map((o) => o.k));
assert.equal(new Set(anahtarlar).size, anahtarlar.length, 'öğe anahtarları benzersiz olmalı');
for (const k of anahtarlar) assert.equal(typeof git[k], 'function', `${k} öğesinin eylemi yok`);
for (const k of Object.keys(git)) assert.ok(anahtarlar.includes(k), `${k} eylemi hiçbir listede yok (ölü eylem)`);
console.log(`✅ ${anahtarlar.length} öğe, hepsinin eylemi var`);

// 3) Ana liste HTML'i: kilitli öğe nedenini gösterir; metin kaçırılır; yalnız-test öğesi gizlenir
{
  const kilitli = (k) => (k === 'barracks' ? { reason: 'Önce <şunu> yap' } : null);
  const html = hubHtml('savas', kilitli, false);
  assert.match(html, /is-kilitli/);
  assert.match(html, /🔒 Önce &lt;şunu&gt; yap/, 'kilit nedeni kaçırılmış olmalı');
  assert.ok(!html.includes('<şunu>'));
  assert.match(html, /data-v3-git="zindan"/);
  assert.equal((html.match(/is-kilitli/g) || []).length, 1, 'yalnız kilitli öğe işaretlenmeli');
  assert.ok(!hubHtml('ben', null, false).includes('data-v3-git="test"'), 'deneme sürümü yoksa test menüsü görünmemeli');
  assert.ok(hubHtml('ben', null, true).includes('data-v3-git="test"'));
}
console.log('✅ ana liste');

// 4) Ortak bileşenler her metni kaçırır
assert.equal(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
assert.match(istatSatiri('A<b>', '1<2', { ipucu: '"q"', ton: 'kotu' }), /v3-ton-kotu.*title="&quot;q&quot;".*A&lt;b&gt;.*1&lt;2/s);
assert.ok(!istatSatiri('a', 'b', { ton: '" onclick="x' }).includes('onclick'), 'bilinmeyen ton sınıfa girmemeli');
assert.ok(!bosDurum('📦', '<img src=x>', 'm').includes('<img'));
assert.equal((iskelet(3).match(/<i><\/i>/g) || []).length, 3);
assert.equal((iskelet(99).match(/<i><\/i>/g) || []).length, 8, 'iskelet satırı sınırlı');
console.log('✅ bileşenler');

// 5) Panel başlıkları sadeleşir (bağırarak yazılmış ve teknik olanlar), bilinmeyen başlık yalnız 📍 işaretini kaybeder
assert.equal(sadeBaslik('📍 🏪 AMM Pazar Alanı'), '🏪 Pazar');
assert.equal(sadeBaslik('🏰 KRALLIK MERKEZİ'), '🏰 Krallık merkezi');
assert.equal(sadeBaslik('📈 EKONOMİK DENGE, 10B TOKENOMICS & SİMÜLATÖR'), '📈 Ekonomi panosu');
assert.equal(sadeBaslik('🏛️ Sirius Konseyi & Hazine'), '🏛️ Konsey ve hazine');
assert.equal(sadeBaslik('📜 ADASTRA REALM SÜRÜM GEÇMİŞİ & GÜNCELLEME LOGU'), '📜 Sürüm geçmişi');
assert.equal(sadeBaslik('📍 🌿 Şifahane'), '🌿 Şifahane');
assert.equal(sadeBaslik('🏰 Krallık'), '🏰 Krallık', 'zaten sade olan değişmez');
assert.equal(sadeBaslik(''), '');
// Katlama yalnız bilinen yoğun panellerde; ilk kartlar açık kalır
assert.deepEqual(katlaKurali('🏰 Krallık merkezi'), { acik: 2 });
assert.equal(katlaKurali('🌿 Şifahane'), null, 'kısa panel katlanmaz');
assert.equal(katlaKurali('🏪 Pazar'), null, 'işlem ekranı katlanmaz');
console.log('✅ panel düzenleyicileri');

// 6) Sözlük: her terimin adı ve en çok iki cümlelik açıklaması var; düğme HTML'i kaçırılır; bilinmeyen terim sayfayı bozmaz
for (const [k, v] of Object.entries(SOZLUK)) {
  assert.ok(v.ad && v.aciklama, `${k} terimi eksik`);
  assert.ok((v.aciklama.match(/[.!?](\s|$)/g) || []).length <= 2, `${k} açıklaması en çok iki cümle olmalı`);
}
assert.match(terim('amm', 'takas <b>'), /data-v3-terim="amm".*takas &lt;b&gt;/s);
assert.equal(terim('yok-boyle-terim', '<x>'), '&lt;x&gt;', 'bilinmeyen terim düz metin döner');
assert.match(terim('havuz'), />Havuz</, 'etiket verilmezse sözlük adı kullanılır');
console.log('✅ sözlük');

// 7) Yeni oyuncu turu: kimlere başlar, nasıl ilerler
{
  const yeni = { seviye: 1, askerSayisi: 0, ilkSeferYapildi: false, kayit: null };
  assert.equal(turBaslamali(yeni), true, 'yepyeni oyuncuya başlar');
  assert.equal(turBaslamali({ ...yeni, seviye: 2 }), false, 'ilerlemiş (seviye 2+) hesaba başlamaz');
  assert.equal(turBaslamali({ ...yeni, askerSayisi: 1 }), false, 'askeri olana başlamaz');
  assert.equal(turBaslamali({ ...yeni, ilkSeferYapildi: true }), false, 'ilk seferini yapmış hesaba başlamaz');
  assert.equal(turBaslamali({ ...yeni, kayit: { bitti: true } }), false, 'bitirene tekrar başlamaz');
  assert.equal(turBaslamali({ ...yeni, kayit: { atlandi: true } }), false, 'atlayana tekrar başlamaz');
  assert.equal(turBaslamali({ ...yeni, seviye: 1, ilkSeferYapildi: true, kayit: { adim: 4 } }), true, 'yarım kalan tur, ilk sefer yapılmış olsa da devam eder');
  assert.equal(turBaslamali({ ...yeni, seviye: 3, kayit: { adim: 999 } }), false, 'geçersiz adım kaydı ilerlemiş hesabı tura sokmaz')
  assert.equal(TUR_KAYIT_ANAHTARI('0xabc'), 'roa_v3_tur_0xabc');
  assert.equal(TUR_KAYIT_ANAHTARI(''), 'roa_v3_tur_yerel');
  // adımlar: benzersiz kimlik, başlık+metin; ya "Devam" düğmesi ya da eylem koşulu var (ikisi birden değil, ikisi de yok değil)
  assert.equal(new Set(TUR_ADIMLARI.map((a) => a.id)).size, TUR_ADIMLARI.length);
  for (const a of TUR_ADIMLARI) {
    assert.ok(a.baslik && a.metin, `${a.id}: başlık ve metin`);
    assert.ok(!!a.dugme !== !!a.tamam, `${a.id}: ya Devam düğmesi ya eylem koşulu olmalı`);
    if (a.tamam) assert.ok(a.hedef, `${a.id}: eylem adımı parlatılacak bir hedef göstermeli`);
  }
  // eylem koşulları
  const idx = (id) => TUR_ADIMLARI.findIndex((a) => a.id === id);
  const bos = { sekme: 'harita', panelAcik: false, baslik: '', seferSayisi: 0 };
  assert.equal(sonrakiAdim(idx('kralik'), bos), idx('kralik'));
  assert.equal(sonrakiAdim(idx('kralik'), { ...bos, sekme: 'kralik', panelAcik: true }), idx('kralik') + 1);
  assert.equal(sonrakiAdim(idx('merkez'), { ...bos, baslik: '🏰 Krallık merkezi' }), idx('merkez') + 1);
  assert.equal(sonrakiAdim(idx('merkez'), { ...bos, baslik: '🏰 Krallık' }), idx('merkez'), '"Krallık" ana listesi merkez adımını geçirmez');
  assert.equal(sonrakiAdim(idx('sefer'), { ...bos, seferSayisi: 2 }), idx('sefer') + 1);
  assert.equal(sonrakiAdim(idx('hos'), { ...bos, seferSayisi: 9 }), idx('hos'), 'Devam adımı kendiliğinden ilerlemez');
  assert.equal(sonrakiAdim(99, bos), 99);
}
console.log('✅ yeni oyuncu turu');
