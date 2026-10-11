// Kullanılmayan içe aktarma ve değişkenleri (ESLint no-unused-vars uyarıları) güvenle kaldırır.
// Yan etkisi olabilecek ifadeler (çağrı, await import) korunur: yalnız adı atılır, ifade kalır.
// Kullanım: node scripts/kullanilmayan-sil.mjs <dosya_ya_da_klasor...> [--uygula]   (varsayılan: deneme, yalnız rapor)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(KOK, 'package.json'));
const acorn = require('acorn');
const uygula = process.argv.includes('--uygula');
const hedefler = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!hedefler.length) { console.error('Kullanım: node scripts/kullanilmayan-sil.mjs <dosya_ya_da_klasor...> [--uygula]'); process.exit(2); }

let json;
try {
  json = execFileSync(process.execPath, [path.join(KOK, 'node_modules/eslint/bin/eslint.js'), ...hedefler, '-f', 'json'], { cwd: KOK, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
} catch (e) { json = e.stdout ? e.stdout.toString() : '[]'; }
const sonuclar = JSON.parse(json);

let degisenDosya = 0, kaldirilan = 0, atlanan = 0;
for (const r of sonuclar) {
  const uyarilar = r.messages.filter(m => m.ruleId === 'no-unused-vars' && /defined but never used|assigned a value but never used/.test(m.message));
  if (!uyarilar.length) continue;
  const raw = fs.readFileSync(r.filePath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let kaynak = raw.split('\r\n').join('\n');
  const ast = acorn.parse(kaynak, { ecmaVersion: 'latest', sourceType: 'module' });
  const satirBasi = [0];
  for (let i = 0; i < kaynak.length; i++) if (kaynak[i] === '\n') satirBasi.push(i + 1);
  const konum = (m) => satirBasi[m.line - 1] + m.column - 1;

  const duzenleme = [];   // { bas, son, yeni }
  const gez = (n, ust) => {
    if (!n || typeof n.type !== 'string') return;
    n.__ust = ust;
    for (const k of Object.keys(n)) {
      if (k === '__ust') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && gez(c, n));
      else if (v && typeof v.type === 'string') gez(v, n);
    }
  };
  gez(ast, null);
  const bul = (n, p) => {
    if (!n || typeof n.type !== 'string') return null;
    if (n.type === 'Identifier' && n.start === p) return n;
    for (const k of Object.keys(n)) {
      if (k === '__ust') continue;
      const v = n[k];
      const alt = Array.isArray(v) ? v : [v];
      for (const c of alt) { if (c && typeof c.type === 'string' && c.start <= p && c.end >= p) { const b = bul(c, p); if (b) return b; } }
    }
    return null;
  };

  const silinecekOzellikler = new Set();   // ObjectPattern Property düğümleri
  const silinecekSpecifier = new Set();
  const silinecekDeklarator = new Set();
  for (const m of uyarilar) {
    const id = bul(ast, konum(m));
    if (!id) { atlanan++; continue; }
    const ust = id.__ust;
    if (ust && (ust.type === 'ImportSpecifier' || ust.type === 'ImportDefaultSpecifier' || ust.type === 'ImportNamespaceSpecifier')) silinecekSpecifier.add(ust);
    else if (ust && ust.type === 'Property' && ust.__ust && ust.__ust.type === 'ObjectPattern') silinecekOzellikler.add(ust);
    else if (ust && ust.type === 'VariableDeclarator' && ust.id === id) silinecekDeklarator.add(ust);
    else atlanan++;
  }

  // import bildirimleri
  const importlar = new Map();
  for (const sp of silinecekSpecifier) { const imp = sp.__ust; (importlar.get(imp) || importlar.set(imp, new Set()).get(imp)).add(sp); }
  for (const [imp, set] of importlar) {
    const kalan = imp.specifiers.filter(s => !set.has(s));
    if (kalan.length === imp.specifiers.length) continue;
    const kaynakYolu = kaynak.slice(imp.source.start, imp.source.end);
    if (kalan.length === 0) { duzenleme.push({ bas: imp.start, son: imp.end + (kaynak[imp.end] === '\n' ? 1 : 0), yeni: `import ${kaynakYolu};` + (kaynak[imp.end] === '\n' ? '\n' : '') }); }
    else {
      const varsayilan = kalan.find(s => s.type === 'ImportDefaultSpecifier');
      const adli = kalan.filter(s => s.type === 'ImportSpecifier').map(s => kaynak.slice(s.start, s.end));
      const parcalar = [];
      if (varsayilan) parcalar.push(kaynak.slice(varsayilan.start, varsayilan.end));
      if (adli.length) parcalar.push(`{ ${adli.join(', ')} }`);
      duzenleme.push({ bas: imp.start, son: imp.end, yeni: `import ${parcalar.join(', ')} from ${kaynakYolu};` });
    }
    kaldirilan += set.size;
  }
  // const { a, b } = await import(...)  ve  const x = <ifade>
  const deklarasyonlar = new Map();
  for (const p of silinecekOzellikler) {
    const dekl = p.__ust.__ust;   // ObjectPattern -> VariableDeclarator
    if (!dekl || dekl.type !== 'VariableDeclarator') { atlanan++; continue; }
    (deklarasyonlar.get(dekl) || deklarasyonlar.set(dekl, new Set()).get(dekl)).add(p);
  }
  for (const [dekl, set] of deklarasyonlar) {
    const stmt = dekl.__ust;
    if (!stmt || stmt.type !== 'VariableDeclaration' || stmt.declarations.length !== 1) { atlanan += set.size; continue; }
    const kalan = dekl.id.properties.filter(p => !set.has(p));
    const init = kaynak.slice(dekl.init.start, dekl.init.end);
    if (kalan.length === 0) duzenleme.push({ bas: stmt.start, son: stmt.end, yeni: `${init};` });
    else duzenleme.push({ bas: dekl.id.start, son: dekl.id.end, yeni: `{ ${kalan.map(p => kaynak.slice(p.start, p.end)).join(', ')} }` });
    kaldirilan += set.size;
  }
  for (const dekl of silinecekDeklarator) {
    const stmt = dekl.__ust;
    if (!stmt || stmt.type !== 'VariableDeclaration' || stmt.declarations.length !== 1 || !dekl.init) { atlanan++; continue; }
    const yanEtkili = ['CallExpression', 'AwaitExpression', 'NewExpression', 'AssignmentExpression', 'UpdateExpression'].includes(dekl.init.type);
    let son = stmt.end;
    if (kaynak[son] === '\n') son++;
    if (yanEtkili) duzenleme.push({ bas: stmt.start, son: stmt.end, yeni: `${kaynak.slice(dekl.init.start, dekl.init.end)};` });
    else duzenleme.push({ bas: stmt.start, son, yeni: '' });
    kaldirilan++;
  }
  if (!duzenleme.length) continue;
  duzenleme.sort((a, b) => b.bas - a.bas);
  let cikti = kaynak;
  for (const e of duzenleme) {
    let b = e.bas;
    if (e.yeni === '') while (b > 0 && (cikti[b - 1] === ' ' || cikti[b - 1] === '\t')) b--;
    cikti = cikti.slice(0, b) + e.yeni + cikti.slice(e.son);
  }
  degisenDosya++;
  if (uygula) fs.writeFileSync(r.filePath, cikti.split('\n').join(eol));
}
console.log(`${uygula ? 'Uygulandı' : 'Deneme'}: ${degisenDosya} dosya, ${kaldirilan} bağlama kaldırıldı, ${atlanan} uyarı elle bakılmak üzere atlandı.`);
