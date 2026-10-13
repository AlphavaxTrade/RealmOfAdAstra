// 13 Ekim 2026 denetimi: ön yüz bulgularının gerileme testleri (QA-04, 07, 08, 09, 10, 14, 15, 16, 17 ve H1).
// Gerçek tarayıcı doğrulaması ayrıca yapıldı (denetim raporu); burada saf kurallar ve çevrimiçi katmanın davranışı sahte bir
// DOM / fetch ile sınanır. Her denetim, düzeltmeden ÖNCEki kodda düşer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = (y) => fs.readFileSync(path.join(kok, y), 'utf8').replace(/\r\n/g, '\n');
let say = 0;
const tamam = (ad) => { say++; console.log('✅ ' + ad); };

// ── 1) Ödeme penceresi tutarları (QA-16) ───────────────────────────────────
const yardim = await import('../js/net/online-yardim.js');
{
  // Sunucu teklifi: maliyet 5 (yukarı yuvarlanmış), bakiye 0 (AŞAĞI yuvarlanmış, oysa 0,01 var), ödenecek 6
  const o = yardim.odemeOzeti({ cost: 5, balance: 0, amountAda: 6 }, 0.01);
  assert.equal(o.maliyet, '5');
  assert.equal(o.bakiye, '0,01', 'kazandığın bakiye 0,01 iken "0" yazılmaz');
  assert.equal(o.eksik, '4,99');
  assert.equal(o.odenecek, '6');
  // Yerel bakiye yoksa teklifteki değer kullanılır
  assert.equal(yardim.odemeOzeti({ cost: 5, balance: 2, amountAda: 4 }, undefined).bakiye, '2');
  assert.equal(yardim.astraYaz(0.004), '<0,01', 'pozitif ama 0,01 altı "0" değil');
  assert.equal(yardim.astraYaz(0), '0');
  assert.equal(yardim.astraYaz(1234.9), '1.234', 'büyük tutar aşağı yuvarlanır (olandan fazlası yazılmaz)');
  assert.equal(yardim.astraYaz(12.3499), '12,34', '2 ondalık, aşağı');
  // Tutarlılık: ödenecek her zaman eksiği karşılar
  for (const [cost, bal] of [[3.2, 0.01], [10, 9.99], [100.5, 0.5], [1, 0.999]]) {
    const amountAda = Math.ceil((Math.ceil(cost) - Math.floor(bal)) * 1.02 + 1);
    const g = yardim.odemeOzeti({ cost: Math.ceil(cost), balance: Math.floor(bal), amountAda }, bal);
    const num = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));
    assert.ok(num(g.odenecek) >= num(g.eksik), `ödenecek (${g.odenecek}) eksiği (${g.eksik}) karşılamalı`);
  }
}
tamam('QA-16: ödeme penceresi tutarları tutarlı (0,01 bakiye "0" görünmez, ödenecek ≥ eksik)');

// ── 2) H1: adres karşılaştırma ve izin tutarı ──────────────────────────────
{
  const SOZ = '0x' + 'a'.repeat(40), TOK = '0x' + 'b'.repeat(40), YAD = '0x' + 'c'.repeat(40);
  const sabit = yardim.sabitAdresler({ VITE_PAYMENTS_CONTRACT: SOZ.toUpperCase().replace('0X', '0x'), VITE_TOKEN_ADDRESS: TOK });
  assert.equal(sabit.sozlesme, SOZ, 'küçük harfe çevrilir');
  assert.deepEqual(yardim.sabitAdresler({ VITE_PAYMENTS_CONTRACT: 'sacma' }), { sozlesme: '', token: '' }, 'geçersiz adres sabitlenmiş sayılmaz');
  assert.deepEqual(yardim.sabitAdresler(undefined), { sozlesme: '', token: '' });
  // Uyuşuyor
  assert.equal(yardim.adresDenetle({ contract: SOZ, token: TOK }, sabit), null);
  // Sunucu başka sözleşme verdi → açık uyarı, ödeme reddi
  const m = yardim.adresDenetle({ contract: YAD, token: TOK }, sabit);
  assert.match(m, /UYUŞMUYOR/); assert.match(m, /ödeme sözleşmesi/); assert.match(m, /hiçbir şey çekilmedi/);
  const m2 = yardim.adresDenetle({ contract: SOZ, token: YAD }, sabit);
  assert.match(m2, /token adresi/);
  // Sabitlenmemiş derleme: geçerli adres kabul, geçersiz biçim yine reddedilir (işlem verisine gömülmesin)
  assert.equal(yardim.adresDenetle({ contract: SOZ, token: TOK }, { sozlesme: '', token: '' }), null);
  assert.ok(yardim.adresDenetle({ contract: 'x', token: TOK }, { sozlesme: '', token: '' }));
  // approve: yalnız gereken tutar, yeterli izin varsa istenmez
  const tutar = 6n * 10n ** 18n;
  assert.equal(yardim.izinIstenecek(0n, tutar), tutar, 'izin yalnız ödeme tutarı kadar');
  assert.notEqual(yardim.izinIstenecek('0x0', tutar), 2n ** 256n - 1n, 'sınırsız (MaxUint256) izin istenmez');
  assert.equal(yardim.izinIstenecek('0x' + (tutar * 2n).toString(16), tutar), null, 'mevcut izin yeterliyse yeniden onay istenmez');
  assert.equal(yardim.izinIstenecek(tutar, tutar), null);
  assert.equal(yardim.izinIstenecek(tutar - 1n, tutar), tutar);
}
tamam('H1: sabit adres karşılaştırması, açık uyarı ve yalnız gereken tutar kadar izin');

// ── 3) H1: gerçek ağ derlemesi bayrağı (vite.config.js) ────────────────────
{
  const { gercekAgSorunlari } = await import('../vite.config.js');
  assert.deepEqual(gercekAgSorunlari({}), [], 'bayrak yoksa deneme/geliştirme derlemesi etkilenmez');
  assert.deepEqual(gercekAgSorunlari({ REALM_GERCEK_AG: '0' }), []);
  assert.deepEqual(gercekAgSorunlari({ NODE_ENV: 'production' }), [], 'yalnız NODE_ENV=production CI/yerel derlemeyi kırmaz');
  const eksik = gercekAgSorunlari({ REALM_GERCEK_AG: '1' });
  assert.equal(eksik.length, 2);
  assert.ok(eksik.join(' ').includes('VITE_PAYMENTS_CONTRACT') && eksik.join(' ').includes('VITE_TOKEN_ADDRESS'));
  assert.equal(gercekAgSorunlari({ REALM_GERCEK_AG: '1', VITE_PAYMENTS_CONTRACT: '0x' + '1'.repeat(40) }).length, 1);
  assert.match(gercekAgSorunlari({ REALM_GERCEK_AG: '1', VITE_PAYMENTS_CONTRACT: 'abc', VITE_TOKEN_ADDRESS: '0x' + '2'.repeat(40) })[0], /geçerli bir 0x adresi değil/);
  assert.deepEqual(gercekAgSorunlari({ REALM_GERCEK_AG: '1', VITE_PAYMENTS_CONTRACT: '0x' + '1'.repeat(40), VITE_TOKEN_ADDRESS: '0x' + '2'.repeat(40) }), []);
  // Dockerfile: ARG'lar derleme aşamasında, build'den önce; varsayılan "deneme" (CI'daki çıplak `docker build .` kırılmaz)
  const d = oku('Dockerfile');
  const derle = d.slice(d.indexOf(' AS derle'), d.indexOf(' AS bagimlilik'));
  assert.match(derle, /^ARG REALM_GERCEK_AG=0$/m);
  assert.match(derle, /^ARG VITE_PAYMENTS_CONTRACT=$/m);
  assert.match(derle, /^ARG VITE_TOKEN_ADDRESS=$/m);
  assert.ok(derle.indexOf('ARG VITE_TOKEN_ADDRESS') < derle.indexOf('RUN npm run build'), 'ARG derlemeden önce');
  assert.ok(!/^ARG REALM_GERCEK_AG=1/m.test(d), 'varsayılan gerçek ağ DEĞİL (deneme imajı)');
  const c = oku('docker-compose.yml');
  assert.ok(c.includes('REALM_GERCEK_AG: ${REALM_GERCEK_AG:-0}') && c.includes('VITE_TOKEN_ADDRESS: ${VITE_TOKEN_ADDRESS:-}'), 'compose build argümanlarını iletir');
  assert.match(oku('.github/workflows/yayin.yml'), /--build-arg REALM_GERCEK_AG=/, 'yayın iş akışı bayrağı iletir');
  assert.ok(!/--build-arg REALM_GERCEK_AG/.test(oku('.github/workflows/ci.yml')), 'CI deneme imajı derler (bayrak yok)');
}
tamam('H1: gerçek ağ derlemesinde adresler zorunlu; deneme/CI derlemesi etkilenmez');

// ── 4) QA-14: zafer kartı kazancı ──────────────────────────────────────────
{
  const { kazancYazisi } = await import('../js/ui/kazanc-yazisi.js');
  const y = kazancYazisi(0.9, 0.2);
  assert.equal(y, '+0,9 ASTRA (0,18 serbest · 0,72 kilitli)');
  assert.ok(!y.startsWith('+0 ASTRA'), '"+0 ASTRA" yazılmaz');
  assert.equal(kazancYazisi(0, 0.2), '+0 ASTRA');
  assert.equal(kazancYazisi(1234.5, 0.2), '+1.234 ASTRA (246,9 serbest · 987,6 kilitli)', 'büyük toplam tam sayı ve aşağı yuvarlanır');
  // Kazanç, serbest + kilitli toplamıdır (bakiyedeki artışla aynı)
  assert.match(kazancYazisi(2, 0.2), /\+2 ASTRA \(0,4 serbest · 1,6 kilitli\)/);
  // Kaynakta eski yuvarlayan biçim kalmadı
  assert.ok(!/\+\$\{tam\(outcome\.adaReward/.test(oku('js/ui/ekran/savashazirlik.js')), 'zindan kartı adaReward\'ı aşağı yuvarlamıyor');
  assert.ok(!/\+\$\{r\.rewardAda\} ASTRA/.test(oku('js/ui/ekran/kolezyum.js')), 'kolezyum kartı ham sayı yazmıyor');
}
tamam('QA-14: sonuç kartı toplam ve kilitli kısmı doğru yazıyor');

// ── 5) QA-07: dar ekran üst çubuk ─────────────────────────────────────────
{
  const { bakiyeYazisi } = await import('../js/ui/hud-verisi.js');
  assert.ok(bakiyeYazisi(12345.67, true).length <= 8, 'dar ekranda 10 bin ve üstü kısaltılır');
  assert.equal(bakiyeYazisi(9999.99, true), bakiyeYazisi(9999.99, false));
  const js = oku('js/ui/v3/kabuk.js');
  assert.ok(js.includes('id="v3-hud-grup"') && js.includes('id="v3-daha"'), 'üç düğme "Daha fazla" menüsüne taşınabilir');
  assert.ok(js.indexOf('id="v3-daha"') < js.indexOf('id="v3-hud-grup"'), 'klavye sırası: ⋯ düğmesi menüden önce');
  assert.ok(/aria-expanded="false" aria-controls="v3-hud-grup"/.test(js));
  const css = oku('css/v3/kabuk.css');
  assert.ok(/@media \(max-width: 359px\)[\s\S]*\.v3-hud-grup\.acik/.test(css), 'dar ekran kuralı');
  assert.ok(/@media \(max-width: 260px\)/.test(css), '%200 yakınlaştırma kuralı');
}
tamam('QA-07: dar ekranda Kaynaklar/Bot/Zil ⋯ menüsüne taşınır');

// ── 6) QA-10: açılış perdesi ──────────────────────────────────────────────
{
  const b = oku('public/boot.js');
  assert.ok(b.includes('window.__v3'), 'perde oyun hazır olana (window.__v3) dek açık kalır');
  assert.ok(/45000/.test(b), 'üst süre 45 sn');
  assert.ok(!/setTimeout\(function\(\) \{\s*clearInterval\(iv\);\s*if \(fill\) fill\.style\.width = '100%';/.test(b), 'perde 2,5 sn sonra koşulsuz kapanmıyor');
  assert.ok(/Yeniden dene/.test(b) && /Krallığa bağlanılıyor/.test(b), 'bağlanıyor göstergesi ve hata kartı');
  // Davranış: sahte zamanla perde çalıştırılır
  const olaylar = { stil: {}, metin: {}, cocuk: [] };
  const el = (id) => ({ id, style: {}, innerText: '', textContent: '', parentNode: { appendChild(c) { olaylar.cocuk.push(c); } }, setAttribute() {}, addEventListener() {} });
  const dom = { 'loading-bar-fill': el('f'), 'loading-percentage': el('p'), 'loading-screen': el('s'), 'loading-quote': el('q') };
  let simdi = 0;
  const zamanlayicilar = [];
  const sahte = {
    document: { getElementById: (id) => dom[id], createElement: () => ({ style: {}, addEventListener() {}, focus() {} }), addEventListener() {} },
    window: { addEventListener() {} },
    Date: { now: () => simdi },
    setInterval: (f, ms) => { const t = { f, ms, son: 0, acik: true }; zamanlayicilar.push(t); return t; },
    clearInterval: (t) => { if (t) t.acik = false; },
    setTimeout: (f, ms) => { const t = { f, ms, son: simdi + ms, tek: true, acik: true }; zamanlayicilar.push(t); return t; },
    Math, Math_: Math, location: { reload() {} }
  };
  const calistir = (ilerle) => {
    const hedef = simdi + ilerle;
    while (simdi < hedef) {
      simdi += 50;
      for (const t of zamanlayicilar.slice()) {
        if (!t.acik) continue;
        if (t.tek) { if (simdi >= t.son) { t.acik = false; t.f(); } } else if (simdi - t.son >= t.ms) { t.son = simdi; t.f(); }
      }
    }
  };
  const govde = b.slice(0, b.indexOf('// Resim yüklenemezse'));
  vm.runInNewContext(govde, {
    document: sahte.document, window: sahte.window, Date: sahte.Date, setInterval: sahte.setInterval,
    clearInterval: sahte.clearInterval, setTimeout: sahte.setTimeout, Math, location: sahte.location
  });
  calistir(5000);
  assert.notEqual(dom['loading-screen'].style.opacity, '0', '5 sn sonra oyun hazır değilse perde AÇIK kalır');
  assert.match(dom['loading-quote'].textContent, /bağlanılıyor/);
  calistir(15000);   // 20 sn
  assert.notEqual(dom['loading-screen'].style.opacity, '0');
  assert.match(dom['loading-quote'].textContent, /yavaş/);
  calistir(30000);   // 50 sn
  assert.match(dom['loading-quote'].textContent, /bağlanılamadı/);
  assert.equal(olaylar.cocuk.length, 1, 'yeniden dene düğmesi eklendi');
}
tamam('QA-10: perde oyun hazır olana dek açık, yavaşlıkta açıklama, 45 sn sonra hata + yeniden dene');

// ── 7) QA-15: toast konumu ────────────────────────────────────────────────
{
  const { toastEkBosluk } = await import('../js/ui/toast.js');
  // 844 yüksek ekran; alt çubuk 60 px; yapışık eylem çubuğu üstü 740'ta (alt çubuğun hemen üstü, 64 px yüksek): bildirim çubuğun üstüne çıkar
  const ek = toastEkBosluk({ cubukUst: 720, pencereYuksekligi: 844, mevcutAlt: 70 });
  assert.ok(ek >= 50 && ek <= 80, 'bildirim eylem çubuğunun üstüne çıkar: ' + ek);
  assert.equal(toastEkBosluk({ cubukUst: 840, pencereYuksekligi: 844, mevcutAlt: 70 }), 0, 'çubuk altta/görünmüyorsa ek boşluk yok');
  assert.equal(toastEkBosluk({ cubukUst: NaN, pencereYuksekligi: 844 }), 0);
  const css = oku('css/v3/kabuk.css');
  assert.ok(/\.toast-container \.toast \{ pointer-events: none !important; \}/.test(css), 'bildirimler dokunuşu engellemez');
  assert.ok(/var\(--toast-ek, 0px\)/.test(css));
}
tamam('QA-15: bildirim eylem çubuğunun üstüne konur ve dokunuşu engellemez');

// ── 8) QA-17: THREE.Clock ve harita resmi ─────────────────────────────────
{
  const v = oku('js/vadi3d/vadi.js');
  assert.ok(!/new THREE\.Clock/.test(v), 'THREE.Clock kullanılmıyor (three 0.186 kaldırdı)');
  assert.ok(/new THREE\.Timer/.test(v) && /timer\.update\(\)/.test(v));
  const boy = fs.statSync(path.join(kok, 'public/assets/adastra_vadisi.webp')).size;
  assert.ok(boy < 700 * 1024, `harita resmi webp ve 700 KB altında (şimdi ${Math.round(boy / 1024)} KB)`);
  assert.ok(!fs.existsSync(path.join(kok, 'public/assets/adastra_vadisi.jpg')), 'eski 949 KB jpg açılışta indirilmez');
  const sahne = oku('js/grandTownScene.js');
  assert.ok(sahne.includes('adastra_vadisi.webp') && !sahne.includes('adastra_vadisi.jpg'));
  assert.ok(!/const v = Date\.now\(\)/.test(sahne), 'harita resmi her açılışta yeniden indirilmez (sabit sürüm eki)');
  assert.match(sahne, /adastra_vadisi\.webp\?v=\d+'/);
}
tamam('QA-17: THREE.Timer, webp harita resmi');

// ── 9) Çevrimiçi katman: QA-09, QA-08 kalanı, QA-15 yankı (sahte DOM + fetch) ──
{
  // Çok küçük sahte DOM: yalnız online.js'in pencere çizimi için
  const olusturulan = [];
  const yeniEl = (etiket = 'div') => {
    const e = {
      etiket, style: { cssText: '', setProperty() {} }, dataset: {}, id: '', _html: '', _q: {}, onclick: null, disabled: false,
      attrs: {},
      set innerHTML(v) { this._html = v; this._q = {}; this.firstElementChild = yeniEl(); this.firstElementChild._html = v; },
      get innerHTML() { return this._html; },
      firstElementChild: null,
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; },
      querySelector(s) { const kutu = this.firstElementChild || this; return (kutu._q[s] ||= Object.assign(yeniEl('alt'), { id: s.replace('#', '') })); },
      querySelectorAll() { return []; },
      contains() { return false; }, focus() {}, addEventListener(t, f) { (this._ev ||= {})[t] = f; }, remove() { if (belge.ov === this) belge.ov = null; },
      appendChild(c) { return c; }, append(...a) { this.parcalar = a; }, isConnected: true,
      offsetWidth: 1, offsetHeight: 1, getClientRects() { return [1]; }
    };
    return e;
  };
  const belge = {
    ov: null, activeElement: null,
    body: { appendChild(c) { belge.ov = c; olusturulan.push(c); } },
    documentElement: {},
    createElement: (t) => yeniEl(t),
    getElementById: (id) => {
      if (id === 'online-overlay') return belge.ov;
      return belge.ov && belge.ov._html.includes('id="' + id + '"') ? belge.ov.querySelector('#' + id) : null;
    },
    addEventListener() {}, hidden: false
  };
  const depo = new Map();
  const pencere = { addEventListener() {}, innerWidth: 390 };
  Object.assign(globalThis, {
    document: belge, window: pencere,
    localStorage: { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => depo.set(k, String(v)), removeItem: (k) => depo.delete(k) },
    location: { search: '', pathname: '/', reload() { globalThis.__yenilendi = true; } },
    history: { replaceState() {} }
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  const cagrilar = [];
  let durum500 = true;
  let healthCokus = false;
  let eylemCokus = false;
  let hiz429 = 0;   // bu kadar istek 429 (hız sınırı) döner
  let action401 = false;
  const bekleyen2fa = [];
  const bekleyenAction = [];
  const player = (notices = []) => ({ level: 7, adAstraBalance: 12.5, pendingNotices: notices });
  globalThis.fetch = async (url, opts = {}) => {
    const yol = String(url).replace(/^https?:\/\/[^/]+/, '');
    cagrilar.push(`${opts.method || 'GET'} ${yol}`);
    if (yol === '/api/health') { if (healthCokus) throw new TypeError('Failed to fetch'); return { ok: true, status: 200, json: async () => ({ ok: true, testMode: true, payments: { enabled: true, simulated: true } }) }; }
    if (yol === '/api/account/login') return { ok: true, status: 200, json: async () => ({ need2fa: true, ticket: 'T1' }) };
    if (yol === '/api/account/login2fa') return new Promise((coz) => { bekleyen2fa.push((govde, durum = 200) => coz({ ok: durum < 400, status: durum, json: async () => govde })); });
    if (yol === '/api/state') {
      if (durum500) return { ok: false, status: 500, json: async () => ({ error: 'Sunucu hatası (istek abc)' }) };
      return { ok: true, status: 200, json: async () => ({ player: player(), world: null, gate: { status: 'citizen' } }) };
    }
    if (yol === '/api/action') {
      if (action401) { action401 = false; return { ok: false, status: 401, json: async () => ({ error: 'Oturum geçersiz' }) }; }
      if (eylemCokus) throw new TypeError('Failed to fetch');
      if (hiz429 > 0) { hiz429--; cagrilar.push('429'); return { ok: false, status: 429, json: async () => ({ error: 'Çok hızlı istek; biraz yavaşla' }) }; }
      return new Promise((coz) => { bekleyenAction.push((govde) => coz({ ok: true, status: 200, json: async () => govde })); });
    }
    return { ok: false, status: 404, json: async () => ({ error: 'yok' }) };
  };
  const { startOnline, online, requireLogin } = await import('../js/net/online.js');
  const gs = {
    state: { level: 1, adAstraBalance: 0, pendingNotices: [] },
    cagri: 0,
    notifyListeners() {},
    consumeNotices() { const l = this.state.pendingNotices; this.state.pendingNotices = []; return l; },
    ogreticiGordu(k) {
      this.cagri++;
      this.state.pendingNotices.push({ message: '🧭 Görev tamamlandı: ' + k, type: 'success', at: 1 });
      return { success: true, message: '✅ Kaydedildi: ' + k };
    }
  };
  const toastlar = [];
  const ctx = { gameState: gs, ammMarket: { pools: {} }, treasury: {}, globalPool: {}, toast: (m, t) => toastlar.push([m, t]), onApplied() {} };

  // a) sunucu ulaşılamaz + kayıtlı oturum → sessiz yerel moda düşülmez
  depo.set('adastra_session_v1', JSON.stringify({ token: 'abc', playerId: 'acc:1' }));
  healthCokus = true;
  assert.equal(await startOnline(ctx), false);
  assert.equal(online.sunucuBeklendi, true, 'oturum açıkken sunucu yoksa "beklenen sunucu" arızası');
  assert.ok(belge.ov && /Hesabın yüklenemedi/.test(belge.ov._html), 'kart gösterildi');
  assert.ok(depo.has('adastra_session_v1'), 'oturum silinmedi');
  belge.ov = null; online.yuklemeHatasi = null;

  // b) /api/state 500: oturum düşmez, kart çıkar, işlemler engellenir
  healthCokus = false; durum500 = true;
  assert.equal(await startOnline(ctx), true);
  assert.ok(depo.has('adastra_session_v1'), '500 oturumu düşürmez (eski kod token = null yapıp boş misafir oyuna düşüyordu)');
  assert.ok(online.yuklemeHatasi, 'yükleme hatası işaretli');
  assert.ok(belge.ov && /Hesabın yüklenemedi/.test(belge.ov._html), 'yeniden dene kartı: ' + (belge.ov && belge.ov._html.slice(0, 80)));
  const r1 = gs.ogreticiGordu('silo');
  assert.equal(r1.success, false);
  assert.match(r1.message, /yüklenemedi/);
  assert.equal(gs.cagri, 0, 'hesap yüklenmeden işlem yerelde uygulanmaz');
  // c) yeniden dene → başarılı
  durum500 = false;
  const tekrar = belge.ov.querySelector('#hy-tekrar');
  await tekrar.onclick();
  assert.equal(online.yuklemeHatasi, null, 'yeniden dene başarılı');
  assert.equal(gs.state.level, 7, 'hesap yüklendi');
  assert.equal(belge.ov, null, 'kart kapandı');
  assert.ok(toastlar.some(([m]) => /yüklendi/.test(m)));

  // d) QA-08: bağlantı yokken işlem hiç uygulanmaz (yerel sahte "Görev tamamlandı" bildirimi oluşmaz)
  navigator.onLine = false;
  const onceki = gs.cagri;
  const r2 = gs.ogreticiGordu('merkez');
  assert.equal(r2.success, false);
  assert.match(r2.message, /İnternet bağlantın yok/);
  assert.equal(gs.cagri, onceki, 'çevrimdışıyken işlem yerelde uygulanmadı');
  assert.equal(gs.state.pendingNotices.length, 0, 'çevrimdışıyken ödül bildirimi üretilmedi');
  assert.ok(!cagrilar.includes('POST /api/action'), 'sunucuya istek gitmedi');
  navigator.onLine = true;

  // e) QA-15: sunucu yanıtı aynı bildirimi geri yollar → ikinci bildirim çıkmaz
  const r3 = gs.ogreticiGordu('koy');
  assert.equal(r3.success, true);
  assert.equal(gs.state.pendingNotices.length, 1, 'yerel bildirim üretildi');
  const gosterilen = gs.state.pendingNotices.map((n) => n.message);
  gs.state.pendingNotices = [];   // oyun döngüsü bildirimi tüketti ve gösterdi
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(bekleyenAction.length, 1, 'işlem sunucuya gönderildi');
  bekleyenAction.shift()({
    player: player([
      { message: gosterilen[0], type: 'success', at: 2 },                       // yankı: atılmalı
      { message: '🏛️ Sunucuda doğan bildirim', type: 'info', at: 3 }            // gerçek yeni bildirim: kalmalı
    ]),
    world: null, result: { success: true }
  });
  await new Promise((r) => setTimeout(r, 20));
  const mesajlar = gs.state.pendingNotices.map((n) => n.message);
  assert.deepEqual(mesajlar, ['🏛️ Sunucuda doğan bildirim'], 'yerel bildirimin sunucu yankısı tekrar gösterilmez, sunucuya özgü olan kalır');

  // f) yankı, oyun döngüsü bildirimi henüz tüketmeden gelirse tek bildirim kalır (kaybolmaz)
  gs.ogreticiGordu('hazine');
  assert.equal(gs.state.pendingNotices.length >= 1, true);
  const yerel = gs.state.pendingNotices[gs.state.pendingNotices.length - 1].message;
  await new Promise((r) => setTimeout(r, 5));
  bekleyenAction.shift()({ player: player([{ message: yerel, type: 'success', at: 4 }]), world: null, result: { success: true } });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(gs.state.pendingNotices.filter((n) => n.message === yerel).length, 1, 'yanıt erken gelirse de bildirim bir kez gösterilir');

  // g) QA-08 kalanı: sunucu ÇÖKMÜŞ (ağ ayakta, istek hata veriyor): yerelde üretilen "Görev tamamlandı" başarı bildirimi geri alınır,
  //    ekranda görünüyorsa kaldırılır; başka işlemin gerçek bildirimi yerinde kalır; hata bildirimi gösterilir.
  {
    const { kurToast } = await import('../js/ui/toast.js');
    const kaldirilan = [];
    const kap = {
      style: { setProperty() {} }, children: [], firstElementChild: null,
      appendChild(c) { c.remove = () => { kaldirilan.push(c); this.children = this.children.filter((x) => x !== c); }; this.children.push(c); this.firstElementChild = this.children[0]; return c; },
      getBoundingClientRect() { return { bottom: 0 }; }
    };
    const gercekToast = kurToast(kap);
    ctx.toast = gercekToast;
    const metinler = () => kap.children.map((c) => (c.parcalar && c.parcalar[2] ? c.parcalar[2].textContent : ''));
    gercekToast('✅ Başka bir işlemin gerçek başarısı', 'success');   // dokunulmamalı

    eylemCokus = true;
    gs.state.pendingNotices = [];
    const r = gs.ogreticiGordu('konsey');   // yerelde uygulanır, sunucuya gönderilir
    assert.equal(r.success, true);
    const yerel = gs.state.pendingNotices.map((n) => n.message);
    assert.equal(yerel.length, 1);
    gercekToast(yerel[0], 'success');   // oyun döngüsü bildirimi tüketip gösterdi
    gercekToast('✅ Kaydedildi: konsey', 'success');   // ekranın işlem sonucundan çıkardığı başarı bildirimi
    assert.ok(metinler().includes(yerel[0]), 'yerel başarı bildirimi ekranda');
    await new Promise((r2) => setTimeout(r2, 30));
    assert.ok(!metinler().includes(yerel[0]), 'sunucu işlemi kabul etmeyince yerel başarı bildirimi ekrandan kalktı');
    assert.ok(!metinler().includes('✅ Kaydedildi: konsey'), 'ekranın "Kaydedildi" bildirimi de kalktı');
    assert.ok(metinler().includes('✅ Başka bir işlemin gerçek başarısı'), 'başka işlemin bildirimi yerinde');
    assert.ok(metinler().some((m) => /ulaşılamadı|bağlantı|kabul etmedi|Failed/i.test(m)), 'hata bildirimi gösterildi: ' + JSON.stringify(metinler()));

    // Aynı metin art arda gelirse (hız sınırında 30 aynı uyarı) tek bildirim görünür
    kap.children.length = 0; kap.firstElementChild = null;
    gercekToast('⚠️ tekrar eden uyarı', 'error'); gercekToast('⚠️ tekrar eden uyarı', 'error'); gercekToast('⚠️ tekrar eden uyarı', 'error');
    assert.equal(metinler().filter((m) => m === '⚠️ tekrar eden uyarı').length, 1, 'aynı metin tek bildirim olarak görünür');

    // Henüz gösterilmemiş yerel bildirim kuyruktan düşer
    gs.state.pendingNotices = [];
    gs.ogreticiGordu('hazine2');
    assert.equal(gs.state.pendingNotices.length, 1);
    await new Promise((r2) => setTimeout(r2, 30));
    assert.equal(gs.state.pendingNotices.filter((n) => /hazine2/.test(n.message)).length, 0, 'gösterilmemiş yerel başarı bildirimi kuyruktan düşürüldü');
    eylemCokus = false;
  }

  // i) Hız sınırı (429): işlem sunucu işlemeden önce reddedilir; kısa beklemeyle yeniden denenir, kaybolmaz, hata bildirimi çıkmaz
  {
    ctx.toast = (m, t) => toastlar.push([m, t]);   // (g) gerçek toast'a çevirmişti
    const once = toastlar.length;
    online.hizBeklemeMs = [20, 20, 20];   // üretimde 700/1500/3000 ms
    hiz429 = 2;
    cagrilar.length = 0;
    gs.state.pendingNotices = [];
    gs.ogreticiGordu('i1');
    await new Promise((r2) => setTimeout(r2, 150));
    assert.equal(cagrilar.filter((c) => c === '429').length, 2, 'iki kez 429 alındı');
    assert.equal(bekleyenAction.length, 1, 'üçüncü denemede istek sunucuya ulaştı (kaybolmadı)');
    bekleyenAction.shift()({ player: player([]), world: null, result: { success: true } });
    await new Promise((r2) => setTimeout(r2, 20));
    assert.ok(!toastlar.slice(once).some(([m, tur]) => tur === 'error'), 'yeniden deneme başarılıysa hata bildirimi yok');
    // Sınır sürerse (4 ret): anlaşılır mesaj, "kabul etmedi" değil
    hiz429 = 99;
    const onceHata = toastlar.length;
    gs.ogreticiGordu('i2');
    await new Promise((r2) => setTimeout(r2, 250));
    const hata = toastlar.slice(onceHata).find(([, tur]) => tur === 'error');
    assert.ok(hata, '429 sürerse hata bildirimi çıkar');
    assert.match(hata[0], /Çok hızlı işlem yaptın/);
    assert.ok(!/kabul etmedi/.test(hata[0]));
    hiz429 = 0;
  }

  // j) Muhafız Mührü kod penceresi (denetim 2. tur B): gönderince kapanmaz, "Doğrulanıyor…" gösterir; yanlış kodda aynı pencere
  //    hata ile yeniden sorar; doğru kodda kapanır; Esc / Vazgeç hemen kapatır
  {
    action401 = true;
    gs.ogreticiGordu('j0');   // sunucu 401 döner: oturum düşer, giriş penceresi açılır
    await new Promise((r2) => setTimeout(r2, 40));
    const giris = requireLogin();   // açık giriş akışının sözü
    const ov = () => belge.ov;
    assert.ok(ov() && /Krallığa Dön/.test(ov()._html), 'giriş penceresi açıldı');
    ov().querySelector('#ol-email').value = 'a@ornek.com';
    ov().querySelector('#ol-pass').value = 'parola-12345';
    ov().querySelector('#ol-go')._ev.click();
    await new Promise((r2) => setTimeout(r2, 25));
    assert.ok(/ac-code/.test(ov()._html), 'kod penceresi açıldı');
    assert.match(ov()._html, /for="ac-code"/, 'alanın etiketi var');
    // yanlış kod: pencere "doğrulanıyor" gösterir, sonuç gelene dek AÇIK kalır
    ov().querySelector('#ac-code').value = '000000';
    ov().querySelector('#ac-go').onclick();
    await new Promise((r2) => setTimeout(r2, 25));
    assert.ok(ov(), 'kod gönderilince pencere kapanmaz (eskiden ekran boş kalıyordu)');
    assert.equal(ov().querySelector('#ac-go').disabled, true, 'gönder düğmesi pasif');
    assert.equal(ov().querySelector('#ac-code').disabled, true, 'alan pasif');
    assert.match(ov().querySelector('#ac-go').textContent, /Doğrulanıyor/);
    assert.equal(bekleyen2fa.length, 1);
    bekleyen2fa.shift()({ error: 'Kod hatalı ya da süresi geçmiş.' }, 401);
    await new Promise((r2) => setTimeout(r2, 25));
    assert.ok(ov() && /ac-code/.test(ov()._html) && /Kod hatalı/.test(ov()._html), 'yanlış kodda aynı pencere hata mesajıyla yeniden sorar');
    // doğru kod → pencere kapanır, giriş tamamlanır
    ov().querySelector('#ac-code').value = '123456';
    ov().querySelector('#ac-go').onclick();
    await new Promise((r2) => setTimeout(r2, 25));
    assert.ok(ov(), 'ikinci gönderimde de pencere sonuç gelene dek açık');
    bekleyen2fa.shift()({ token: 'tok-2fa', playerId: 'acc:9' }, 200);
    const sonuc = await giris;
    assert.equal(sonuc, true, 'giriş tamamlandı');
    assert.equal(ov(), null, 'doğrulama bitince pencere kapandı');
    assert.ok(depo.get('adastra_session_v1') && /tok-2fa/.test(depo.get('adastra_session_v1')), 'oturum kaydedildi');
  }

  // h) Aynı olayı yerel motor da sunucu da bildirir (görev tespiti, bot yenileme...): gösterimde bir kez sayılır
  {
    const sun = (liste) => { bekleyenAction.shift()({ player: player(liste), world: null, result: { success: true } }); };
    const bekle = () => new Promise((r2) => setTimeout(r2, 25));
    // h1) yerel kopya ÖNCE gösterildi, sunucu yankısı sonra gelir → ikinci bildirim yok
    gs.state.pendingNotices = [];
    gs.ogreticiGordu('h1');
    gs.state.pendingNotices = [{ message: '🧭 Görev tamamlandı: Çarkı çevir (h1)', type: 'success', at: 1 }];   // oyun döngüsünün kendi tespiti (proxy dışı)
    assert.equal(gs.consumeNotices().length, 1, 'yerel bildirim bir kez gösterilir');
    await bekle();
    sun([{ message: '🧭 Görev tamamlandı: Çarkı çevir (h1)', type: 'success', at: 2 }, { message: '🏛️ Yalnız sunucuda (h1)', type: 'info', at: 3 }]);
    await bekle();
    assert.deepEqual(gs.consumeNotices().map((n) => n.message), ['🏛️ Yalnız sunucuda (h1)'], 'sunucunun aynı görev bildirimi tekrar gösterilmez');
    // h2) sunucu kopyası ÖNCE gösterildi, yerel tespit sonra gelir → ikinci bildirim yok
    gs.ogreticiGordu('h2');
    await bekle();
    sun([{ message: '🧭 Görev tamamlandı: Piyango (h2)', type: 'success', at: 4 }]);
    await bekle();
    assert.deepEqual(gs.consumeNotices().map((n) => n.message).filter((m) => /h2/.test(m)), ['🧭 Görev tamamlandı: Piyango (h2)'], 'sunucu bildirimi bir kez gösterilir');
    gs.state.pendingNotices = [{ message: '🧭 Görev tamamlandı: Piyango (h2)', type: 'success', at: 5 }];
    assert.equal(gs.consumeNotices().length, 0, 'yerel motorun geç gelen aynı tespiti gösterilmez');
    // h3) farklı metinler etkilenmez
    gs.state.pendingNotices = [{ message: 'Başka bir olay (h3)', type: 'info', at: 6 }];
    assert.equal(gs.consumeNotices().length, 1);
  }
}
tamam('QA-09 / QA-08 / QA-15: hesap yüklenemedi kartı, çevrimdışı engel, bildirim yankısı; 2. tur: çöken sunucuda yerel başarı geri alınır, 429 yeniden denenir, aynı uyarı tek görünür, 2FA kod penceresi sonuç gelene dek açık, yerel + sunucu çift bildirim tekillenir');

console.log(`\n${say}/9 ön yüz denetim testi geçti`);
process.exit(0);   // online.js eşitleme zamanlayıcısı (setInterval) sürece bağlı kalmasın
