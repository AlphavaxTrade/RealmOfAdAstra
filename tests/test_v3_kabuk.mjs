// Arayüz v3: gezinme verisi ve ortak bileşenlerin saf (DOM'suz) kuralları.
// Tarayıcı davranışı (açılma, kapanma, ekran taşması) burada denenmez; o iş scripts/tarayici/v3.mjs ile elle yapılır.
import assert from 'node:assert/strict';
import { SEKMELER, HUB, hubHtml, esc } from '../js/ui/v3/hub.js';
import { gitHaritasi } from '../js/ui/v3/kabuk.js';
import { istatSatiri, bosDurum, iskelet } from '../js/ui/v3/bilesenler.js';
import { sadeBaslik, katlaKurali } from '../js/ui/v3/panel.js';
import { farkSatirlari, farkHtml, sonucHtml, senaryoKartiHtml, gunlukHtml, kayitEkle } from '../js/ui/v3/lab.js';
import { AYAR_ANAHTARI, AYAR_VARSAYILAN, ayarDogrula, ayarOku, ayarYaz, ayarUygula, yaziOlcegi, baglantiDurumu, ayarlarHtml, KISAYOLLAR } from '../js/ui/v3/ayarlar.js';
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
assert.equal(sadeBaslik('🌙 SEN YOKKEN OLANLAR'), '🌙 Sen yokken olanlar');
assert.equal(sadeBaslik('⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE'), '⚒️ Demirhane');
assert.equal(sadeBaslik('📍 🌲 Zümrüt Ormanı & Oduncu'), '🌲 Zümrüt Ormanı', 'uzun bölge başlığı kısalır (telefonda "..." ile kesilmesin)');
assert.equal(sadeBaslik('🌾 Güneş Tarlası & Değirmen'), '🌾 Güneş Tarlası');
assert.equal(sadeBaslik('⛏️ Maden Ocağı & Tamirhane'), '⛏️ Demir Madeni');
assert.equal(sadeBaslik('🌋 BÜYÜK SAVAŞ ALANI & WORLD BOSS ETKİNLİĞİ'), '🌋 Savaş alanı');
assert.equal(sadeBaslik('🏰 Krallık'), '🏰 Krallık', 'zaten sade olan değişmez');
assert.equal(sadeBaslik(''), '');
// Katlama yalnız bilinen yoğun panellerde; ilk kartlar açık kalır
assert.deepEqual(katlaKurali('🏰 Krallık merkezi'), { acik: 2 });
assert.deepEqual(katlaKurali('📊 Kotalarım'), { acik: 1 });
assert.deepEqual(katlaKurali('🎪 Karnaval'), { acik: 1 });
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

// 8) Test laboratuvarı: fark, sonuç gösterimi (kaçırma), kayıt noktası listesi
{
  const once = { astra: 100, seviye: 1, env: { wood: 10, iron: 5 }, rehberTamam: [] };
  const sonra = { astra: 90, seviye: 1, env: { wood: 25, iron: 5 }, rehberTamam: ['first_expedition'] };
  const f = farkSatirlari(once, sonra);
  assert.deepEqual(f.map((x) => x.alan).sort(), ['ASTRA', 'Envanter: wood', 'Tamamlanan görevler'].sort(), 'yalnız DEĞİŞEN alanlar listelenir');
  assert.equal(farkSatirlari(once, once).length, 0);
  assert.match(farkHtml([]), /Değişen bir şey yok/);
  const sonuc = { id: 'x', gecti: false, adimlar: [{ ad: 'Tamam <b>', tamam: true }, { ad: 'Kötü', tamam: false }], hata: '<script>alert(1)</script>', once, sonra };
  const html = sonucHtml(sonuc);
  assert.match(html, /❌ Kaldı/); assert.match(html, /v3-lab-ok/); assert.match(html, /v3-lab-yok/);
  assert.ok(!html.includes('<script>') && !html.includes('Tamam <b>') && html.includes('Tamam &lt;b&gt;'), 'sonuç metinleri kaçırılmış olmalı');
  assert.match(sonucHtml({ ...sonuc, gecti: true, adimlar: [], hata: '' }), /✅ Geçti/);
  assert.equal(sonucHtml(null), '');
  const kart = senaryoKartiHtml({ id: 'a"b', ad: 'Ad <i>', ne: 'ne' }, null, false);
  assert.ok(kart.includes('disabled') && !kart.includes('<i>') && !kart.includes('a"b'), 'kapalıyken düğmeler devre dışı, kimlik/ad kaçırılmış');
  assert.match(gunlukHtml([]), /Günlük boş/);
  assert.ok(gunlukHtml([{ saat: '1', eylem: '<x>', sonuc: 'y' }]).includes('&lt;x&gt;'));
  // kayıt noktaları: en yeni başta, en çok `sinir` tane, aynı kimlik tekrarlanmaz
  let l = [];
  for (let i = 1; i <= 10; i++) l = kayitEkle(l, { id: `k${i}`, ad: `K${i}` }, 8);
  assert.equal(l.length, 8); assert.equal(l[0].id, 'k10'); assert.equal(l[7].id, 'k3', 'en eski ikisi atıldı');
  assert.equal(kayitEkle(l, { id: 'k5', ad: 'yeni ad' }, 8).filter((k) => k.id === 'k5').length, 1);
  assert.equal(kayitEkle(l, { id: 'k5', ad: 'yeni ad' }, 8)[0].ad, 'yeni ad');
}
console.log('✅ test laboratuvarı');

// 9) Ayarlar ve bağlantı durumu
{
  assert.deepEqual(ayarDogrula(null), AYAR_VARSAYILAN);
  assert.deepEqual(ayarDogrula({ hareketAzalt: 'evet', yaziBoyutu: 'dev' }), AYAR_VARSAYILAN, 'bozuk değerler varsayılana döner');
  assert.deepEqual(ayarDogrula({ hareketAzalt: true, yaziBoyutu: 'buyuk', baska: 1 }), { hareketAzalt: true, yaziBoyutu: 'buyuk' }, 'bilinmeyen alan atılır');
  const depo = { m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = String(v); } };
  assert.deepEqual(ayarOku(depo), AYAR_VARSAYILAN, 'depo boşken varsayılan');
  assert.equal(ayarYaz(depo, { hareketAzalt: true, yaziBoyutu: 'cokbuyuk' }), true);
  assert.deepEqual(ayarOku(depo), { hareketAzalt: true, yaziBoyutu: 'cokbuyuk' });
  depo.m[AYAR_ANAHTARI] = '{bozuk json';
  assert.deepEqual(ayarOku(depo), AYAR_VARSAYILAN, 'bozuk kayıt çökertmez');
  assert.equal(ayarYaz({ setItem() { throw new Error('dolu'); } }, AYAR_VARSAYILAN), false, 'depo yazılamazsa false (çökmez)');
  assert.equal(yaziOlcegi('buyuk'), 1.125); assert.equal(yaziOlcegi('yok'), 1);
  const siniflar = new Set(); const stil = {};
  const kok = { classList: { toggle(c, v) { if (v) siniflar.add(c); else siniflar.delete(c); } }, style: { setProperty(k, v) { stil[k] = v; } } };
  ayarUygula({ hareketAzalt: true, yaziBoyutu: 'cokbuyuk' }, kok);
  assert.ok(siniflar.has('v3-azalt')); assert.equal(stil['--v3-yazi-olcek'], '1.25');
  ayarUygula({ hareketAzalt: false, yaziBoyutu: 'normal' }, kok);
  assert.ok(!siniflar.has('v3-azalt')); assert.equal(stil['--v3-yazi-olcek'], '1');
  // bağlantı durumu eşikleri
  assert.equal(baglantiDurumu(false, 999999), 'yerel');
  assert.equal(baglantiDurumu(true, 0), 'iyi'); assert.equal(baglantiDurumu(true, 44999), 'iyi');
  assert.equal(baglantiDurumu(true, 45000), 'gecikmeli'); assert.equal(baglantiDurumu(true, 119999), 'gecikmeli');
  assert.equal(baglantiDurumu(true, 120000), 'kopuk');
  assert.equal(baglantiDurumu(true, NaN), 'iyi', 'ölçüm yoksa yanlış alarm verilmez');
  // ayar sayfası: seçili düğme işaretli, kısayol listesi dolu
  const html = ayarlarHtml({ hareketAzalt: true, yaziBoyutu: 'buyuk' }, false);
  assert.match(html, /data-v3-ayar="yazi:buyuk"[^>]*aria-pressed="true"/); assert.match(html, /data-v3-ayar="yazi:normal"[^>]*aria-pressed="false"/);
  assert.match(html, /data-v3-ayar="hareket:ac"[^>]*aria-pressed="true"/); assert.match(html, /data-v3-ayar="hareket:kapat"[^>]*aria-pressed="false"/);
  assert.equal((html.match(/<kbd>/g) || []).length, KISAYOLLAR.length);
}
console.log('✅ ayarlar ve bağlantı');

// 9) Karnaval ve Hazine v3 parçaları: düğme kimlikleri korunur, metinler kaçırılır, ana yol tek düğme
{
  const { cevirSecenekleriHtml, havuzlarHtml } = await import('../js/ui/v3/karnaval.js');
  const cevir = cevirSecenekleriHtml({ costAda: 100, tickets: 0, resSpinsLeft: 3, resSpinsMax: 3, resBtnsHtml: '<button class="btn-spin-wheel" data-pay="wood">x</button>' });
  assert.match(cevir, /data-pay="ada"/);
  assert.match(cevir, /id="btn-spin-wheel-ticket"[^>]*disabled/, 'bilet yoksa bilet düğmesi kapalı');
  assert.match(cevir, /<details class="v3-ayrinti"><summary>Hammaddeyle çevir/, 'hammadde seçenekleri katlı');
  assert.equal((cevir.match(/data-pay="ada"/g) || []).length, 1, 'ASTRA ile tek ana düğme');
  const eData = { solvencyPct: 100, burnRatePct: 5, ubiRatePct: 6, creatorRatePct: 3, totalPoolsBalance: 1000, lifetimeBurnedAda: 5, totalDeposited: 10, totalWithdrawn: 4,
    burnedResources: { wood: 1, iron: 2, wheat: 3 }, ammBurnedResources: { wood: 0.5, iron: 0, wheat: 0 }, lottery: { lotteryPool: 12000000, amortiShare: 10, rolloverShare: 20 },
    pools: [{ id: 'x', name: '<img src=x onerror=alert(1)>', icon: '🏰', color: '#fff', sharePct: 23.2, description: 'd', balance: 5, howToEarn: 'h', actionType: 'dungeon', actionText: 'Git' }] };
  const hv = havuzlarHtml({ eData, g: { serbest: 1, kilitli: 2, katki: 3, carpan: 1 }, ucretsizHtml: 'u' });
  assert.ok(!hv.includes('<img src=x'), 'havuz adı kaçırılır');
  assert.match(hv, /btn-eco-pool-jump" data-action="dungeon"/);
  assert.match(hv, /data-action="lottery"/);
  console.log('✅ karnaval v3 parçaları');
}
