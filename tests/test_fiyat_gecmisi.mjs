// Pazar fiyat geçmişi (19 Ekim 2026): kayıt kuralları, yaşlandırma, aralık serisi, pazar motoruna bağlantı ve grafik çizimi.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: k => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: k => { depo.delete(k); }
};
const { GECMIS, kaydet, kirp, aralikSerisi, inceltme, ozet, temizle } = await import('../js/economy/fiyatGecmisi.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { grafikKarti, grafikSvg, noktaBul, grafikEtkilesimiKur } = await import('../js/ui/ekran/fiyatGrafik.js');

const DK = 60000, SA = 3600000, GUN = 86400000;
const T0 = Date.UTC(2026, 9, 1);

// 1) Kayıt kuralları
{
  const s = [];
  kaydet(s, 10, T0);
  assert.deepEqual(s, [[T0, 10]], 'ilk fiyat nokta olur');
  kaydet(s, 10, T0 + 10 * DK);
  assert.equal(s.length, 1, 'fiyat değişmediyse nokta eklenmez');
  kaydet(s, 10.01, T0 + 2 * DK);
  assert.equal(s.length, 2, 'ilk nokta (açılış) hiç ezilmez: küçük oynama bile ikinci nokta olur');
  kaydet(s, 10.02, T0 + 3 * DK);
  assert.equal(s.length, 2, '5 dakikadan kısa ve küçük oynama: son nokta güncellenir, yeni nokta yok');
  assert.deepEqual(s[0], [T0, 10]);
  assert.deepEqual(s[1], [T0 + 2 * DK, 10.02]);
  kaydet(s, 10.3, T0 + 3 * DK);
  assert.equal(s.length, 3, '%1 üstü sıçrama hemen yeni nokta');
  kaydet(s, 10.31, T0 + 9 * DK);
  assert.equal(s.length, 4, '5 dakika geçtiyse küçük oynama da yeni nokta');
  kaydet(s, 0, T0 + 20 * DK);
  kaydet(s, NaN, T0 + 20 * DK);
  assert.equal(s.length, 4, 'sıfır ve bozuk fiyat işlenmez');
  console.log('✅ kayıt kuralları');
}

// 2) Yaşlandırma: 48 saatten eski saatliğe iner, 30 günden eski silinir
{
  const simdi = T0 + 40 * GUN;
  const s = [];
  s.push([simdi - 35 * GUN, 1]);                       // çok eski: silinir
  for (let i = 0; i < 12; i++) s.push([simdi - 10 * GUN + i * 5 * DK, 2 + i]);   // aynı saatte 12 nokta: 1'e iner
  s.push([simdi - 3 * 3600000, 5], [simdi - 1000, 6]);  // ham dönem: aynen kalır
  const k = kirp(s, simdi);
  assert.ok(!k.some(p => p[1] === 1), '30 günden eski silinmeli');
  assert.equal(k.filter(p => p[0] < simdi - GECMIS.HAM_SURE_MS).length, 1, 'aynı saatin noktaları tek noktaya inmeli');
  assert.equal(k.filter(p => p[0] < simdi - GECMIS.HAM_SURE_MS)[0][1], 13, 'saatin SON değeri kalmalı');
  assert.equal(k.slice(-2).map(p => p[1]).join(), '5,6', 'ham dönem aynen kalmalı');
  // Büyük seri kendiliğinden küçülür
  const b = [];
  for (let i = 0; i < 1500; i++) kaydet(b, 1 + (i % 7) * 0.5 + i * 0.001, simdi - 20 * GUN + i * 10 * 60000);
  assert.ok(b.length < 1500, 'uzun seri kırpılmalı: ' + b.length);
  console.log('✅ yaşlandırma ve kırpma');
}

// 3) Aralık serisi: başlangıç değeri, güncel fiyat, inceltme, özet
{
  const simdi = T0 + 10 * GUN;
  const seri = [[simdi - 3 * GUN, 4], [simdi - 20 * SA, 5], [simdi - 2 * SA, 7]];
  const g24 = aralikSerisi(seri, simdi, GUN, 8);
  assert.deepEqual(g24[0], [simdi - GUN, 4], 'aralık başında geçerli fiyat (öncesindeki son nokta) ile başlamalı');
  assert.deepEqual(g24[g24.length - 1], [simdi, 8], 'son nokta güncel fiyat');
  const o = ozet(g24);
  assert.equal(o.acilis, 4); assert.equal(o.kapanis, 8); assert.equal(o.enYuksek, 8); assert.equal(o.enDusuk, 4);
  assert.equal(Math.round(o.degisimYuzde), 100);
  const bos = aralikSerisi([], simdi, GUN, 3);
  assert.deepEqual(bos, [[simdi, 3]], 'geçmişsiz varlık güncel fiyatla tek nokta');
  const cok = Array.from({ length: 5000 }, (_, i) => [T0 + i * 1000, i + 1]);
  const ince = inceltme(cok, GECMIS.EN_FAZLA_NOKTA);
  assert.ok(ince.length <= GECMIS.EN_FAZLA_NOKTA + 1, 'nokta sayısı sınırlanmalı: ' + ince.length);
  assert.deepEqual(ince[0], cok[0]); assert.deepEqual(ince[ince.length - 1], cok[cok.length - 1]);
  assert.deepEqual(temizle([[2, 3], ['x', 1], [1, 2], null, [3, NaN]]), [[1, 2], [2, 3]], 'bozuk girdi atılır, sıralanır');
  console.log('✅ aralık serisi, inceltme, özet');
}

// 4) Pazar motoru: işlem fiyat noktası bırakır, kayıt depoya yazılır, sıfırlama temizler
{
  ammMarket.resetPools();
  const simdi = Date.now();
  ammMarket.recordPrices(simdi, true);
  const once = ammMarket.getPrice('wood');
  const r = ammMarket.executeBuyAmount('wood', 50);
  assert.ok(r.success, 'alım başarılı olmalı: ' + r.message);
  ammMarket.recordPrices(simdi + 10 * DK, true);
  const g = ammMarket.getPriceHistory('wood', '24s', simdi + 10 * DK);
  assert.ok(g && g.points.length >= 2, 'işlem sonrası en az iki nokta olmalı');
  assert.ok(g.kapanis > once, 'alım fiyatı yükseltmeli');
  assert.ok(g.degisimYuzde > 0);
  assert.equal(ammMarket.getPriceHistory('yok-boyle-bir-sey'), null);
  const yuklenen = ammMarket.loadHistory();
  assert.ok(yuklenen.wood && yuklenen.wood.length >= 2, 'geçmiş depodan geri okunmalı');
  ammMarket.resetPools();
  assert.deepEqual(ammMarket.loadHistory(), {}, 'havuz sıfırlanınca geçmiş de silinmeli');
  console.log('✅ pazar motoru geçmişi tutuyor ve saklıyor');
}

// 5) Grafik çizimi
{
  const seri = { key: 'wood', name: 'Odun', aralik: '24s', points: [[T0, 1], [T0 + SA, 1.5], [T0 + 2 * SA, 1.2]], ...ozet([[T0, 1], [T0 + SA, 1.5], [T0 + 2 * SA, 1.2]]) };
  const html = grafikKarti({ ad: 'Odun', aralik: '24s', veri: seri });
  assert.ok(html.includes('<svg') && html.includes('<path'), 'çizgi grafiği çizilmeli');
  assert.ok(html.includes('data-aralik="7g"') && html.includes('data-e="grafikAralik"'), 'aralık düğmeleri olmalı');
  assert.ok(html.includes('is-aktif'), 'seçili aralık işaretli olmalı');
  assert.ok(!/NaN|undefined|Infinity/.test(html), 'grafikte bozuk değer olmamalı');
  const tek = grafikSvg({ ...seri, points: [[T0, 2]], ...ozet([[T0, 2]]) });
  assert.ok(!/NaN|Infinity/.test(tek), 'tek noktalı seri düz çizgi olmalı, bozuk değer yok');
  assert.ok(grafikKarti({ ad: 'Odun', aralik: '7g', durum: 'yukleniyor' }).includes('yükleniyor'));
  assert.ok(grafikKarti({ ad: 'Odun', aralik: '7g', veri: { points: [] } }).includes('henüz fiyat geçmişi yok'));
  console.log('✅ grafik çiziliyor');
}

// 6) Gezdirme: yatay konuma en yakın nokta bulunur, ipucu konumları yüzdedir; kapsayıcı veriyi taşır ve olaylar bağlanır
{
  const pts = [[T0, 1], [T0 + SA, 1.5], [T0 + 2 * SA, 1.2], [T0 + 3 * SA, 2]];
  const v = { key: 'wood', name: 'Odun', points: pts, ...ozet(pts) };
  const sol = noktaBul(v, 0), sag = noktaBul(v, 1), orta = noktaBul(v, 0.34);
  assert.equal(sol.indeks, 0); assert.equal(sag.indeks, 3);
  assert.equal(orta.indeks, 1, 'yaklaşık üçte bir konumu 2. noktaya yakın');
  assert.equal(sag.fiyat, 2); assert.equal(sol.degisimYuzde, 0); assert.equal(Math.round(sag.degisimYuzde), 100);
  for (const r of [sol, orta, sag]) assert.ok(r.xYuzde >= 0 && r.xYuzde <= 100 && r.yYuzde >= 0 && r.yYuzde <= 100, 'konum kapsayıcının içinde');
  assert.ok(noktaBul(v, -5).indeks === 0 && noktaBul(v, 9).indeks === 3, 'taşan konum uca sıkıştırılır');
  assert.equal(noktaBul({ ...v, points: [[T0, 2]], ...ozet([[T0, 2]]) }, 0.7).indeks, 0, 'tek noktalı seride de çalışır');
  const html = grafikKarti({ ad: 'Odun', aralik: '24s', veri: v });
  assert.ok(html.includes('class="ek-fgrafik-kap"') && html.includes('data-fg='), 'kapsayıcı veriyi taşımalı');
  assert.ok(html.includes('ek-fgrafik-ipucu') && html.includes('hidden'), 'ipucu başta gizli');
  // Sahte DOM: bağlama bir kez yapılır, bozuk veride sessizce atlanır
  const dinleyiciler = [];
  const kapSahte = (fg) => ({ dataset: { fg }, querySelector: () => ({ style: {}, hidden: true, querySelector: () => ({}) }), addEventListener: (ad) => dinleyiciler.push(ad), getBoundingClientRect: () => ({ left: 0, width: 100 }) });
  const iyi = kapSahte(html.match(/data-fg="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  const bozuk = kapSahte('{bozuk');
  const kok = { querySelectorAll: () => [iyi, bozuk] };
  grafikEtkilesimiKur(kok); grafikEtkilesimiKur(kok);
  assert.ok(['pointermove', 'pointerdown', 'pointerleave', 'pointerup', 'keydown'].every(a => dinleyiciler.includes(a)), 'fare/dokunma/klavye olayları bağlanmalı');
  assert.equal(dinleyiciler.filter(a => a === 'pointermove').length, 1, 'iki kez çağrılsa da bir kez bağlanır');
  console.log('✅ gezdirme: en yakın nokta, konumlar, kapsayıcı verisi, olay bağlama');
}
