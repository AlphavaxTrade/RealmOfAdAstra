// Ölü CSS ayıklayıcı: seçicisindeki sınıf/kimlik, oyunun HTML'inde ve JS metinlerinde HİÇ geçmeyen kuralları bulur (ve isteğe bağlı siler).
// Muhafazakâr: bir adın JS içinde herhangi bir yerde parça olarak geçmesi, ya da "on-ek-" + değişken biçiminde üretilmesi yeterince canlıdır.
// Kullanım: node scripts/olu-css.mjs            (deneme: yalnız rapor)
//           node scripts/olu-css.mjs --uygula   (kuralları dosyalardan siler)
//           node scripts/olu-css.mjs --liste    (ölü adları da yazar)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uygula = process.argv.includes('--uygula');
const liste = process.argv.includes('--liste');
const CSS_DOSYALARI = ['css/theme.css', 'css/style.css', 'css/barracks.css', 'css/battle-arena.css', 'css/v3/kabuk.css'];

// 1) Adların geçebileceği bütün metin: index.html + js/ + public/*.js
const kaynakParcalari = [fs.readFileSync(path.join(KOK, 'index.html'), 'utf8')];
(function gez(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { gez(p); continue; }
    if (/\.(js|mjs|html)$/.test(f.name)) kaynakParcalari.push(fs.readFileSync(p, 'utf8'));
  }
})(path.join(KOK, 'js'));
for (const f of fs.readdirSync(path.join(KOK, 'public'))) if (/\.(js|html)$/.test(f)) kaynakParcalari.push(fs.readFileSync(path.join(KOK, 'public', f), 'utf8'));
const TUM = kaynakParcalari.join('\n');

const onEkIleUretiliyor = (ad) => {
  const p = ad.split('-');
  for (let i = 1; i < p.length; i++) {
    const onEk = p.slice(0, i).join('-') + '-';
    if (onEk.length < 3) continue;
    for (const son of ["'", '"', '`', '$']) if (TUM.includes(onEk + son)) return true;
  }
  return false;
};
const onbellek = new Map();
const canliMi = (ad) => {
  if (!onbellek.has(ad)) onbellek.set(ad, TUM.includes(ad) || onEkIleUretiliyor(ad));
  return onbellek.get(ad);
};

// 2) CSS ayrıştırıcı (yorum, dizgi, iç içe @media/@supports)
function ayristir(css) {
  const n = css.length;
  const yorumSonu = (p) => { const e = css.indexOf('*/', p + 2); return e < 0 ? n : e + 2; };
  function blokSonu(acilis) {
    let d = 0;
    for (let p = acilis; p < n; p++) {
      if (css.startsWith('/*', p)) { p = yorumSonu(p) - 1; continue; }
      const ch = css[p];
      if (ch === '"' || ch === "'") { let e = p + 1; while (e < n && css[e] !== ch) { if (css[e] === '\\') e++; e++; } p = e; continue; }
      if (ch === '{') d++;
      else if (ch === '}') { d--; if (d === 0) return p; }
    }
    return n - 1;
  }
  function oku(bas, son) {
    const liste = [];
    let p = bas;
    while (p < son) {
      while (p < son && /\s/.test(css[p])) p++;
      if (p >= son) break;
      if (css.startsWith('/*', p)) { p = yorumSonu(p); continue; }
      let q = p; let bulundu = null;
      for (; q < son; q++) {
        if (css.startsWith('/*', q)) { q = yorumSonu(q) - 1; continue; }
        const ch = css[q];
        if (ch === '"' || ch === "'") { let e = q + 1; while (e < son && css[e] !== ch) { if (css[e] === '\\') e++; e++; } q = e; continue; }
        if (ch === '{' || ch === ';') { bulundu = ch; break; }
      }
      if (bulundu !== '{') { p = q + 1; continue; }
      const baslik = css.slice(p, q).trim();
      const kapat = blokSonu(q);
      const dg = { tur: baslik.startsWith('@') ? 'at' : 'kural', bas: p, son: kapat + 1, baslik, icBas: q + 1 };
      if (dg.tur === 'at' && /^@(media|supports|layer|container)/i.test(baslik)) dg.cocuk = oku(q + 1, kapat);
      liste.push(dg);
      p = kapat + 1;
    }
    return liste;
  }
  return oku(0, n);
}

function secicilereBol(baslik) {
  const out = []; let d = 0, cur = '';
  for (const ch of baslik) {
    if (ch === '(' || ch === '[') d++; else if (ch === ')' || ch === ']') d--;
    if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const oluAdlar = new Set();
function oluMu(secici) {
  // :not() :is() :where() :has() içindeki adlar eşlemeyi zorunlu kılmaz; öznitelik seçiciler ([data-x]) canlı sayılır
  let s = secici;
  for (let k = 0; k < 6; k++) s = s.replace(/:(not|is|where|has|matches)\([^()]*\)/g, '');
  s = s.replace(/\[[^\]]*\]/g, '');
  let olu = false;
  for (const m of s.matchAll(/[.#](-?[_a-zA-Z][-_a-zA-Z0-9]*)/g)) {
    // ondalık sayı ya da dosya adı gibi sahte eşleşmeleri ele: yalnız sınıf/kimlik adı gibi görünenler
    if (!canliMi(m[1])) { olu = true; oluAdlar.add(m[1]); }
  }
  return olu;
}

// Hiçbir yerde kullanılmayan @keyframes: adı CSS ve JS metinlerinde yalnız tanımında geçer
const TUM_CSS = CSS_DOSYALARI.filter(f => fs.existsSync(path.join(KOK, f))).map(f => fs.readFileSync(path.join(KOK, f), 'utf8')).join('\n');
const keyframeKullaniliyor = (ad) => (TUM_CSS + '\n' + TUM).split(ad).length - 1 >= 2;

let toplamKural = 0, toplamSatir = 0;
for (const d of CSS_DOSYALARI) {
  const yol = path.join(KOK, d);
  if (!fs.existsSync(yol)) continue;
  const raw = fs.readFileSync(yol, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const css = raw.split('\r\n').join('\n');
  const duzenleme = [];
  let silinen = 0;
  (function isle(dugumler) {
    for (const dg of dugumler) {
      if (dg.tur === 'kural') {
        const secs = secicilereBol(dg.baslik);
        const canli = secs.filter(x => !oluMu(x));
        if (canli.length === 0) { duzenleme.push({ bas: dg.bas, son: dg.son, yeni: '' }); silinen++; }
        else if (canli.length < secs.length) { duzenleme.push({ bas: dg.bas, son: dg.icBas, yeni: canli.join(',\n') + ' {' }); silinen++; }
      } else if (dg.cocuk) isle(dg.cocuk);
      else if (dg.tur === 'at') {
        const km = /^@keyframes\s+([-_a-zA-Z0-9]+)/.exec(dg.baslik);
        if (km && !keyframeKullaniliyor(km[1])) { duzenleme.push({ bas: dg.bas, son: dg.son, yeni: '' }); silinen++; oluAdlar.add('@' + km[1]); }
      }
    }
  })(ayristir(css));
  duzenleme.sort((a, b) => b.bas - a.bas);
  let cikti = css;
  for (const e of duzenleme) {
    let b = e.bas, s = e.son;
    if (e.yeni === '') { while (b > 0 && (cikti[b - 1] === ' ' || cikti[b - 1] === '\t')) b--; if (cikti[s] === '\n') s++; }
    cikti = cikti.slice(0, b) + e.yeni + cikti.slice(s);
  }
  cikti = cikti.replace(/@media[^{}]*\{\s*\}\s*/g, '').replace(/\n{3,}/g, '\n\n');
  const fark = css.split('\n').length - cikti.split('\n').length;
  console.log(`${d}: ${silinen} kural, ${fark} satır${uygula ? ' (silindi)' : ''}`);
  toplamKural += silinen; toplamSatir += fark;
  if (uygula && silinen) fs.writeFileSync(yol, cikti.split('\n').join(eol));
}
console.log(`TOPLAM: ${toplamKural} kural, ${toplamSatir} satır ${uygula ? 'silindi' : '(deneme: hiçbir şey değişmedi)'} · ölü ad sayısı ${oluAdlar.size}`);
if (liste) console.log([...oluAdlar].sort().join(' '));
