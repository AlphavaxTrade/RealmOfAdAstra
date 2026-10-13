/* global document, getComputedStyle, window */
// ESKİ STİL DOSYALARINI SADELEŞTİRİR (görünümü değiştirmeden). ELLE çalıştırılır, dakikalar sürer.
//   node scripts/tarayici/css-sadelestir.mjs <dom.json> [--yaz] [--dosya css/style.css]...
//   (dom.json: node scripts/tarayici/stil-kaydi.mjs <cikti.json> --html <dom.json>)
// Yöntem: her ekran durumunun DOM'u sabit bir sayfaya konur; stil dosyalarındaki her bildirim (declaration) tek tek çıkarılıp
// aynı DOM'da görünümün değişip değişmediğine bakılır (konum/boyut: bütün öğeler; hesaplanmış stil: etkilenen öğenin alt ağacı,
// ::before/::after dahil). Hiçbir durumda ve hiçbir genişlikte fark çıkarmayan bildirim silinir, boşalan kural da.
// Dokunulmaz olanlar: @media/@supports/@keyframes içindekiler, :hover/:focus/:active/:disabled gibi durum sınıfları ve
// ::-webkit-* sözde öğeleri (kayıtta yok), hiçbir durumda eşleşmeyen kurallar (etkisi bilinmiyor), genişlik dışı @media
// bloklarında (hover, pointer, renk şeması) geçen özellik aileleri. Bir bildirimin ailesi (padding, margin, ...) genişliğe bağlı
// bir @media bloğunda da geçiyorsa her kırılma aralığından bir genişlikte sınanır (yoksa yalnız 390 ve 1280).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const postcss = require('postcss');

const args = process.argv.slice(2);
const domYolu = args.find((a) => !a.startsWith('--'));
if (!domYolu) { console.error('Kullanım: node scripts/tarayici/css-sadelestir.mjs <dom.json> [--yaz] [--dosya css/style.css]...'); process.exit(2); }
const YAZ = args.includes('--yaz');
const DOGRULA = args.includes('--dogrula');   // arama yok: HEAD'deki stil dosyaları ile çalışma ağacındakileri karşılaştırır
const secilen = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--dosya' && args[i + 1]) secilen.push(args[i + 1]);
const SIRA = ['css/style.css', 'css/battle-arena.css', 'css/theme.css', 'css/v3/kabuk.css', 'css/v3/ekran.css'];   // index.html sırası
const HEDEFLER = secilen.length ? secilen : ['css/style.css', 'css/battle-arena.css', 'css/theme.css'];
const baslangic = Date.now();
const gecen = () => `${Math.round((Date.now() - baslangic) / 1000)} sn`;

// ── Durumlar: aynı DOM'u tekrar ölçmemek için tekilleştirilir ──
const dom = JSON.parse(fs.readFileSync(domYolu, 'utf8'));
const tekil = {};          // anahtar → { ad, grup, veri }
for (const [ad, v] of Object.entries(dom)) {
  const grup = ad.split('_')[0];
  const anahtar = grup + '|' + crypto.createHash('sha1').update(v.htmlSinif + '|' + v.govdeSinif + '|' + v.html).digest('hex');
  if (!tekil[anahtar]) tekil[anahtar] = { ad, grup, veri: v };
}
const durumlar = Object.entries(tekil).map(([anahtar, x]) => ({ anahtar, ad: x.ad, grup: x.grup, veri: x.veri }));
const grubaGore = (grup) => durumlar.filter((d) => d.grup === grup);

// ── Genişlik sınaması: kırılma noktaları ve etkilenen özellik aileleri ──
function importSil(m) { return m.replace(/@import\s+url\([^)]*\)\s*;/g, ''); }   // yazı tipi @import'u çevrimdışı ölçümde gereksiz
const metin = Object.fromEntries(SIRA.map((d) => [d, DOGRULA && HEDEFLER.includes(d) ? execSync(`git -C "${PROJE}" show HEAD:${d}`, { encoding: 'utf8', maxBuffer: 1 << 26 }) : fs.readFileSync(path.join(PROJE, d), 'utf8')]));   // özgün (@import dahil)
const KIRILMA = new Set();
const medyaAileleri = new Set();
const korunanAileler = new Set();
const aile = (p) => p.replace(/^-(webkit|moz|ms|o)-/, '').split('-')[0];
for (const d of SIRA) {
  postcss.parse(metin[d]).walkAtRules('media', (m) => {
    const w = [...m.params.matchAll(/\((?:max|min)-width:\s*([\d.]+)px\)/g)].map((x) => Number(x[1]));
    w.forEach((x) => KIRILMA.add(x));
    m.walkDecls((dc) => (w.length ? medyaAileleri : korunanAileler).add(aile(dc.prop)));
  });
}
korunanAileler.add('transition');
korunanAileler.add('animation');
const kirilmaSirali = [...KIRILMA].sort((a, b) => a - b);
const genislikler = [360, ...kirilmaSirali.slice(0, -1).map((x, i) => Math.round((x + kirilmaSirali[i + 1]) / 2)), kirilmaSirali[kirilmaSirali.length - 1] + 300];
const GORUNUM = {};
for (const w of genislikler) GORUNUM['w' + w] = { w, h: w <= 820 ? 844 : 800, grup: w <= 820 ? 'tel' : 'masa' };
GORUNUM.w390 = { w: 390, h: 844, grup: 'tel' };
GORUNUM.w1280 = { w: 1280, h: 800, grup: 'masa' };
const TEMEL = ['w390', 'w1280'];

const kokler = Object.fromEntries(HEDEFLER.map((d) => [d, postcss.parse(DOGRULA ? fs.readFileSync(path.join(PROJE, d), 'utf8') : metin[d], { from: d })]));
const DURUM_SINIFI = /:(hover|focus|focus-within|focus-visible|active|disabled|checked|visited|target|enabled|invalid|valid|placeholder-shown|read-only|open)\b|::-webkit-|::-moz-|::selection|::placeholder|::backdrop|::marker|::first-/;
const aday = (kural) => kural.parent && kural.parent.type === 'root' && !DURUM_SINIFI.test(kural.selector);

// ── Tarayıcı sayfaları: genişlik başına bir tane; stil metni tembel uygulanır ──
const tarayici = await chromium.launch({ executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const sayfalar = {};
for (const [ad, { w, h }] of Object.entries(GORUNUM)) {
  // Telefon görünümleri dokunmatik/mobil kipte açılır: (hover: none) ve (pointer: coarse) sorguları gerçekteki gibi eşleşsin
  const telefon = w <= 820;
  const baglam = await tarayici.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce', hasTouch: telefon, isMobile: telefon });
  const s = await baglam.newPage();
  await s.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
  await s.evaluate((SIRA_) => {
    for (const d of SIRA_) { const e = document.createElement('style'); e.id = 'css-' + d; document.head.appendChild(e); }
    // Geçiş ve animasyonlar ölçümde dondurulur (zamana bağlı konum oynamaması için); bu yüzden transition/animation aileleri
    // aşağıda korunanAileler'e eklenir ve hiçbir zaman silinmez.
    const e = document.createElement('style'); e.id = 'css-sabit'; e.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'; document.head.appendChild(e);
  }, SIRA);
  sayfalar[ad] = { s, uygulanan: {} };
}
const guncel = Object.fromEntries(SIRA.map((d) => [d, importSil(metin[d])]));   // tarayıcıya giden (çevrimdışı) metin
async function hazirla(g) {                     // sayfa, güncel stil metinleriyle aynı olsun
  const p = sayfalar[g];
  for (const d of SIRA) {
    if (p.uygulanan[d] === guncel[d]) continue;
    await p.s.evaluate(([id, m]) => { document.getElementById('css-' + id).textContent = m; }, [d, guncel[d]]);
    p.uygulanan[d] = guncel[d];
  }
}

// Ölçülen özellikler: görünüm belirleyen aileler (geri kalanı görünüme etki etmez)
const OZ = ['display', 'position', 'top', 'left', 'right', 'bottom', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
  'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'backgroundClip', 'backgroundAttachment',
  'color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textAlign',
  'textTransform', 'textDecorationLine', 'textShadow', 'textIndent', 'whiteSpace', 'wordBreak', 'overflowWrap', 'overflowX', 'overflowY',
  'textOverflow', 'opacity', 'visibility', 'zIndex', 'boxShadow', 'transform', 'transformOrigin', 'filter', 'backdropFilter', 'mixBlendMode',
  'cursor', 'pointerEvents', 'userSelect', 'flexDirection', 'flexWrap', 'flexGrow', 'flexShrink', 'flexBasis', 'justifyContent', 'alignItems',
  'alignSelf', 'alignContent', 'order', 'rowGap', 'columnGap', 'gridTemplateColumns', 'gridTemplateRows', 'gridColumnStart', 'gridColumnEnd',
  'gridRowStart', 'gridRowEnd', 'gridAutoFlow', 'objectFit', 'objectPosition', 'aspectRatio', 'outlineStyle', 'outlineWidth', 'outlineColor',
  'outlineOffset', 'listStyleType', 'verticalAlign', 'boxSizing', 'clipPath', 'maskImage', 'float', 'clear', 'content', 'animationName',
  'animationDuration', 'transitionProperty', 'transitionDuration', 'willChange', 'touchAction', 'resize', 'appearance', 'scrollBehavior',
  'fill', 'stroke', 'strokeWidth', 'webkitTextStrokeWidth', 'webkitTextFillColor', 'webkitBackgroundClip'];

// Silme adayı olabilecek özellikler: yalnız ölçülenler. Sağlayıcı önekli (-webkit-, -moz-: Chrome sınaması Safari'yi göstermez),
// ölçülmeyen (scrollbar-*, isolation, grid-template-areas, all, accent-color ...) ve transition/animation bildirimleri
// hiçbir zaman silinmez.
const kebabYap = (c) => c.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const olculenAd = new Set(OZ.filter((p) => !['transitionProperty', 'transitionDuration', 'animationName', 'animationDuration', 'willChange', 'touchAction', 'appearance', 'scrollBehavior', 'fill', 'stroke', 'strokeWidth', 'webkitTextStrokeWidth', 'webkitTextFillColor', 'webkitBackgroundClip'].includes(p)).map(kebabYap));
const KISA = { margin: 'margin-top', padding: 'padding-top', border: 'border-top-width', 'border-top': 'border-top-width', 'border-right': 'border-right-width', 'border-bottom': 'border-bottom-width', 'border-left': 'border-left-width', 'border-radius': 'border-top-left-radius', background: 'background-color', font: 'font-size', flex: 'flex-grow', gap: 'row-gap', inset: 'top', outline: 'outline-width', overflow: 'overflow-x', 'list-style': 'list-style-type', 'text-decoration': 'text-decoration-line', 'grid-column': 'grid-column-start', 'grid-row': 'grid-row-start', 'border-color': 'border-top-color', 'border-style': 'border-top-style', 'border-width': 'border-top-width', 'flex-flow': 'flex-direction', 'place-items': 'align-items', 'place-content': 'align-content' };
const olculenMi = (p) => !p.startsWith('-') && (olculenAd.has(p) || (KISA[p] && olculenAd.has(KISA[p])));

// Bir durumu kurar ve parmak izini verir: bütün öğelerin konumu + seçicilerle eşleşen öğelerin alt ağacının stili.
// yukluAnahtar aynıysa DOM yeniden kurulmaz (aynı durumda art arda ölçümler).
const OLC = (g, durum, secicilerJson) => sayfalar[g].s.evaluate(async ([d, anahtar, dizi, OZ_]) => {
  if (window.__yuklu !== anahtar) {
    document.documentElement.className = d.htmlSinif || '';
    document.body.className = d.govdeSinif || '';
    document.body.innerHTML = d.html;
    // Resimler aynı sabit 1x1 görüntüye çevrilir ve çözülmesi beklenir: yüklenme zamanlaması ölçümü oynatmasın
    const bos = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const resimler = [...document.body.querySelectorAll('img')];
    resimler.forEach((r) => { r.removeAttribute('srcset'); r.removeAttribute('loading'); r.src = bos; });
    await Promise.all(resimler.map((r) => r.decode().catch(() => null)));
    window.__yuklu = anahtar;
  }
  const secicilerDizi = JSON.parse(dizi);
  const hepsi = [...document.body.querySelectorAll('*')];
  const tam = new Set();
  for (const sec of secicilerDizi) {
    let liste = [];
    try { liste = [...document.body.querySelectorAll(sec)]; } catch { /* geçersiz seçici */ }
    for (const e of liste) { tam.add(e); for (const x of e.querySelectorAll('*')) tam.add(x); }
  }
  let h = 2166136261;
  const ekle = (t) => { for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  hepsi.forEach((e, i) => {
    const r = e.getBoundingClientRect();
    ekle(`${i}:${Math.round(r.x * 10)},${Math.round(r.y * 10)},${Math.round(r.width * 10)},${Math.round(r.height * 10)};`);
    if (!tam.has(e)) return;
    for (const sozde of [null, '::before', '::after']) {
      const cs = getComputedStyle(e, sozde);
      if (sozde && (cs.content === 'none' || cs.content === 'normal')) continue;
      let x = sozde || '';
      for (const p of OZ_) x += cs[p] + '|';
      ekle(x + ';');
    }
  });
  return h + ':' + hepsi.length;
}, [durum.veri, durum.anahtar, secicilerJson, OZ]);

// Seçici → eşleştiği durumlar (grup başına)
async function eslesme(g, secicilerDizi) {
  const grup = GORUNUM[g].grup;
  const sonuc = new Map();
  await hazirla(g);
  for (const d of grubaGore(grup)) {
    const eslesen = await sayfalar[g].s.evaluate(([v, dizi]) => {
      document.documentElement.className = v.htmlSinif || '';
      document.body.className = v.govdeSinif || '';
      document.body.innerHTML = v.html;
      window.__yuklu = null;
      return dizi.filter((sec) => { try { return !!document.body.querySelector(sec); } catch { return false; } });
    }, [d.veri, secicilerDizi]);
    for (const sec of eslesen) { if (!sonuc.has(sec)) sonuc.set(sec, new Set()); sonuc.get(sec).add(d); }
  }
  return sonuc;
}

const adaySecicileri = new Set();
for (const d of HEDEFLER) kokler[d].walkRules((k) => { if (aday(k)) for (const p of k.selectors) adaySecicileri.add(p); });
const secDizi = [...adaySecicileri];
console.log(`${Object.keys(dom).length} durum (${durumlar.length} tekil), ${secDizi.length} aday seçici, ${Object.keys(GORUNUM).length} genişlik (${genislikler.join(', ')}), genişliğe bağlı aile ${medyaAileleri.size}, korunan aile ${korunanAileler.size}`);

const eslesmeler = { tel: await eslesme('w390', secDizi), masa: await eslesme('w1280', secDizi) };
const durumlarBilgi = (grup, kural, ornekSayisi = Infinity) => {
  const set = new Set();
  for (const p of kural.selectors) { const s = eslesmeler[grup].get(p); if (s) for (const x of s) set.add(x); }
  const hepsi = [...set].sort((a, b) => a.anahtar.localeCompare(b.anahtar));
  if (hepsi.length <= ornekSayisi) return hepsi;
  // eşit aralıklı örnek (deterministik)
  return Array.from({ length: ornekSayisi }, (_, i) => hepsi[Math.floor((i * hepsi.length) / ornekSayisi)]);
};
const ORNEK_TEMEL = Number(process.env.ORNEK_TEMEL) || 8;     // 390 ve 1280'de kural başına durum sayısı
const ORNEK_GENIS = Number(process.env.ORNEK_GENIS) || 3;     // diğer genişliklerde

// Kuralın eşleştiği durumlarda, seçilen genişliklerde parmak izi aynı mı?
async function olc(kural, genislikSeti) {
  const json = JSON.stringify(kural.selectors);
  const sonuc = {};
  await Promise.all(genislikSeti.map(async (g) => {
    await hazirla(g);
    for (const d of durumlarBilgi(GORUNUM[g].grup, kural, TEMEL.includes(g) ? ORNEK_TEMEL : ORNEK_GENIS)) sonuc[g + '|' + d.anahtar] = await OLC(g, d, json);
  }));
  return sonuc;
}
const ayniMi = (a, b) => Object.keys(a).every((k) => a[k] === b[k]);

const toplamOnce = HEDEFLER.reduce((t, d) => t + metin[d].length, 0);
let silinenBildirim = 0, silinenKural = 0, denenen = 0, islenen = 0;
const kabul = [];   // kabul edilen silmeler (geri alma için)
for (let tur = 1; tur <= (DOGRULA ? 0 : 2); tur++) {
  let degisti = false;
  for (const dosya of HEDEFLER) {
    const kok = kokler[dosya];
    const kurallar = [];
    kok.walkRules((k) => { if (aday(k)) kurallar.push(k); });
    for (const kural of kurallar) {
      if (!kural.parent) continue;
      islenen++;
      if (islenen % 25 === 0) console.log(`  ${gecen()} · ${dosya} · ${islenen}. kural · ${denenen} deneme · ${silinenBildirim} bildirim, ${silinenKural} kural silindi`);
      if (!['tel', 'masa'].some((g) => durumlarBilgi(g, kural).length)) continue;   // hiçbir durumda eşleşmiyor: dokunma
      const bildirimler = kural.nodes.filter((n) => n.type === 'decl' && !korunanAileler.has(aile(n.prop)) && olculenMi(n.prop));
      if (!bildirimler.length) continue;
      const bakilacak = bildirimler.some((b) => medyaAileleri.has(aile(b.prop))) ? Object.keys(GORUNUM) : TEMEL;
      guncel[dosya] = importSil(kok.toString());
      const taban = await olc(kural, bakilacak);

      // Bildirimleri çıkarıp görünümün aynı kalıp kalmadığına bakar; değişirse geri koyar. Kabul edilenler kaydedilir
      // (örneklemeyle kaçan farklar için son doğrulamadan sonra geri alınabilsin).
      const dene = async (liste) => {
        denenen++;
        const oncekiler = kural.nodes.slice();
        const kayit = liste.map((n) => ({ dosya, kural, dugum: n, indeks: oncekiler.indexOf(n) }));
        liste.forEach((n) => n.remove());
        guncel[dosya] = importSil(kok.toString());
        const sonra = await olc(kural, bakilacak);
        const ok = ayniMi(taban, sonra);
        if (!ok) { kural.removeAll(); oncekiler.forEach((n) => kural.append(n)); guncel[dosya] = importSil(kok.toString()); }
        else kabul.push(...kayit);
        return ok;
      };
      if (await dene(bildirimler)) { silinenBildirim += bildirimler.length; degisti = true; continue; }
      for (const b of bildirimler) {
        if (!b.parent) continue;
        if (await dene([b])) { silinenBildirim++; degisti = true; }
      }
    }
    guncel[dosya] = importSil(kok.toString());
    console.log(`tur ${tur} · ${dosya}: ${metin[dosya].length} → ${guncel[dosya].length} bayt (${silinenBildirim} bildirim silindi, ${denenen} deneme, ${gecen()})`);
  }
  if (!degisti) break;
}

// ── Son doğrulama: bütün genişliklerde, bütün durumların TAM stil parmak izi, dokunulmamış CSS'le birebir aynı mı? ──
async function tamParmak(css, ciftler = null) {
  for (const d of SIRA) guncel[d] = importSil(css[d]);
  const o = {};
  for (const g of Object.keys(GORUNUM)) {
    await hazirla(g);
    for (const d of grubaGore(GORUNUM[g].grup)) {
      const anahtar = g + '|' + d.anahtar;
      if (ciftler && !ciftler.has(anahtar)) continue;
      o[anahtar] = await OLC(g, d, JSON.stringify(['*']));
    }
  }
  return o;
}
const yazilacak = () => {
  const c = { ...metin };
  for (const d of HEDEFLER) c[d] = kokler[d].toString();   // @import'lar yerinde
  return c;
};
const once = await tamParmak(metin);
// Taban iki kez ölçülür: kendi kendine farklı çıkan (yüklenme zamanlamasına bağlı) çiftler karşılaştırmaya girmez
const once2 = await tamParmak(metin);
const gurultulu = new Set(Object.keys(once).filter((k) => once[k] !== once2[k]));
console.log(`Taban ölçüldü: ${Object.keys(once).length} (genişlik × durum) çifti, ${gurultulu.size} gürültülü (${gecen()})`);
let farkli = [];
for (let deneme = 1; deneme <= 3; deneme++) {
  const sonra = await tamParmak(yazilacak(), deneme === 1 ? null : new Set(farkli));
  farkli = Object.keys(sonra).filter((k) => !gurultulu.has(k) && once[k] !== sonra[k]);
  console.log(`Doğrulama ${deneme}: ${Object.keys(sonra).length} çift ölçüldü, ${farkli.length} fark (${gecen()})`);
  if (!farkli.length) break;
  // Örneklemenin kaçırdığı farklar: bozuk her (genişlik × durum) çifti için, o durumda eşleşen kurallardaki kabul edilmiş
  // silmeler arasından asıl suçluları ikili aramayla bulur ve yalnız onları geri koyar.
  let geriAlinan = 0;
  const ekle = (kayit) => {
    const hedef = kayit.kural;
    const yer = Math.min(kayit.indeks, hedef.nodes.length);
    if (yer >= hedef.nodes.length) hedef.append(kayit.dugum); else hedef.insertBefore(hedef.nodes[yer], kayit.dugum);
  };
  const cikar = (kayit) => kayit.dugum.remove();
  const ciftOlc = async (g, durum) => {
    for (const d of HEDEFLER) guncel[d] = importSil(kokler[d].toString());
    await hazirla(g);
    return OLC(g, durum, JSON.stringify(['*']));
  };
  for (const k of farkli) {
    const ilk = k.indexOf('|');                 // anahtar "genişlik|grup|sha1" biçimindedir; durum anahtarının kendisi de '|' içerir
    const g = k.slice(0, ilk);
    const durum = durumlar.find((d) => d.anahtar === k.slice(ilk + 1));
    const grup = GORUNUM[g].grup;
    const adaylar = kabul.filter((kayit) => !kayit.geriAlindi && kayit.kural.selectors.some((p) => { const set = eslesmeler[grup].get(p); return set && set.has(durum); }));
    let bozuk = (await ciftOlc(g, durum)) !== once[k];
    while (bozuk && adaylar.length) {
      let lo = 1, hi = adaylar.length;          // en küçük önek: adaylar[0..lo) geri konunca durum eşitlenir
      while (lo < hi) {
        const orta = (lo + hi) >> 1;
        const onek = adaylar.slice(0, orta);
        onek.forEach(ekle);
        const esit = (await ciftOlc(g, durum)) === once[k];
        onek.forEach(cikar);
        if (esit) hi = orta; else lo = orta + 1;
      }
      const suclu = adaylar.splice(lo - 1, 1)[0];
      ekle(suclu);
      suclu.geriAlindi = true;
      silinenBildirim--;
      geriAlinan++;
      bozuk = (await ciftOlc(g, durum)) !== once[k];
    }
  }
  console.log(`  ${geriAlinan} silme geri alındı (${gecen()})`);
}

// Boşalan kuralları temizle
for (const d of HEDEFLER) kokler[d].walkRules((k) => { if (k.parent && k.parent.type === 'root' && !k.nodes.some((n) => n.type === 'decl' || n.type === 'comment')) { k.remove(); silinenKural++; } });
const sonCss = yazilacak();
const toplamSonra = HEDEFLER.reduce((t, d) => t + sonCss[d].length, 0);
console.log(`
Son durum: ${farkli.length} fark. (${gecen()})`);
console.log(`Boyut: ${toplamOnce} → ${toplamSonra} bayt (%${Math.round((1 - toplamSonra / toplamOnce) * 100)} küçüldü); ${silinenBildirim} bildirim, ${silinenKural} boş kural silindi.`);
await tarayici.close();

if (farkli.length) { console.log('FARK VAR, dosyalar yazılmadı:', farkli.slice(0, 10)); process.exit(1); }
if (YAZ) {
  for (const d of HEDEFLER) fs.writeFileSync(path.join(PROJE, d), sonCss[d]);
  console.log('Dosyalar yazıldı:', HEDEFLER.join(', '));
} else {
  console.log('Kuru çalıştırma: --yaz verilmediği için dosyalar yazılmadı.');
}
