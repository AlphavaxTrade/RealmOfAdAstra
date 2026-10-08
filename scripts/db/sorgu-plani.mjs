// Sorgu planı denetimi (kurumsal A5.5): server/ altındaki bütün SABİT SQL ifadelerini (prepare/exec) bulur, migrate edilmiş boş bir
// veritabanında EXPLAIN QUERY PLAN çalıştırır ve TABLOYU BAŞTAN SONA TARAYAN ("SCAN tablo", indeks kullanmayan) sorguları listeler.
//   node scripts/db/sorgu-plani.mjs            → tam rapor
//   node scripts/db/sorgu-plani.mjs --yalniz-tarama   → yalnız tam tarayanlar
// Amaç tahmin değil kanıt: indeks, burada tarama çıkan ve tablosu büyüyen bir sorgu için eklenir (gecis/00N_indeksler.js).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser } from 'acorn';
import { openDb } from '../../server/db.js';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function jsDosyalari(klasor) {
  const out = [];
  for (const d of fs.readdirSync(klasor, { withFileTypes: true })) {
    const yol = path.join(klasor, d.name);
    if (d.isDirectory()) { if (d.name !== 'gecis') out.push(...jsDosyalari(yol)); }   // geçişler şema kurar, sorgu değil
    else if (d.name.endsWith('.js')) out.push(yol);
  }
  return out;
}

// AST'de .prepare('...') ve .exec('...') çağrılarının sabit (ifadesiz) SQL metinleri. Dinamik SQL atlanır (zaten sabit listelerden).
export function sorgulariBul(kod, dosya = '(kod)') {
  const out = [];
  const ast = Parser.parse(kod, { ecmaVersion: 2025, sourceType: 'module', locations: true });
  (function gez(n) {
    if (!n || typeof n.type !== 'string') return;
    // .prepare('SQL')  ve  db.js'teki prep('ad', 'SQL') yardımcısı
    const prepMi = n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'prep' && n.arguments[1];
    if (n.type === 'CallExpression' && ((n.callee.type === 'MemberExpression' && n.callee.property.name === 'prepare' && n.arguments[0]) || prepMi)) {
      const a = prepMi ? n.arguments[1] : n.arguments[0];
      let sql = null;
      if (a.type === 'Literal' && typeof a.value === 'string') sql = a.value;
      else if (a.type === 'TemplateLiteral' && a.expressions.length === 0) sql = a.quasis[0].value.cooked;
      if (sql) out.push({ dosya, satir: n.loc.start.line, sql: sql.replace(/\s+/g, ' ').trim() });
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(gez); else if (v && typeof v === 'object') gez(v);
    }
  })(ast);
  return out;
}

// EXPLAIN QUERY PLAN sonucu: { tarama: [...], gecici: [...], satirlar: [...] }
export function planOzeti(db, sql) {
  const satirlar = db.prepare('EXPLAIN QUERY PLAN ' + sql).all().map(r => r.detail);
  return {
    satirlar,
    // "SCAN tablo" (USING INDEX yok) = tam tarama; "SCAN tablo USING COVERING INDEX" indeks taraması (kabul)
    tarama: satirlar.filter(s => /^SCAN /.test(s) && !/USING (COVERING )?INDEX/.test(s)),
    gecici: satirlar.filter(s => /USE TEMP B-TREE/.test(s))
  };
}

export function rapor({ yalnizTarama = false } = {}) {
  const db = openDb(':memory:');
  const bulgular = [];
  for (const f of jsDosyalari(path.join(kok, 'server'))) {
    for (const s of sorgulariBul(fs.readFileSync(f, 'utf8'), path.relative(kok, f).split(path.sep).join('/'))) {
      if (!/^(SELECT|UPDATE|DELETE|INSERT)/i.test(s.sql)) continue;
      let p;
      try { p = planOzeti(db.raw, s.sql); } catch (e) { bulgular.push({ ...s, hata: e.message }); continue; }
      bulgular.push({ ...s, ...p });
    }
  }
  db.close();
  return yalnizTarama ? bulgular.filter(b => b.hata || (b.tarama && b.tarama.length)) : bulgular;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const yalnizTarama = process.argv.includes('--yalniz-tarama');
  const r = rapor({ yalnizTarama });
  const tarayan = r.filter(b => b.tarama && b.tarama.length);
  for (const b of r) {
    if (b.hata) { console.log(`❌ ${b.dosya}:${b.satir}  PLAN ALINAMADI: ${b.hata}\n     ${b.sql.slice(0, 120)}`); continue; }
    const isaret = b.tarama.length ? '⚠️ TAM TARAMA' : (b.gecici.length ? '↕️ geçici sıralama' : '✅');
    if (yalnizTarama && !b.tarama.length) continue;
    console.log(`${isaret}  ${b.dosya}:${b.satir}\n     ${b.sql.slice(0, 140)}\n     → ${b.satirlar.join(' | ')}`);
  }
  console.log(`\n${r.length} sorgu, ${tarayan.length} tanesi tabloyu baştan sona tarıyor.`);
}
