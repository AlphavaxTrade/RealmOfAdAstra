// scripts/kapsam-kontrol.mjs: eşik altı yakalanır, eşik yalnız yukarı gider (kurumsal A3.1)
import assert from 'node:assert/strict';
import { ihlaller, yukselt } from '../scripts/kapsam-kontrol.mjs';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const pct = x => ({ pct: x });
const ozet = {
  total: { lines: pct(90), branches: pct(70), functions: pct(88) },
  'C:\\proje\\server\\app.js': { lines: pct(87), branches: pct(60) },
  '/proje/server/index.js': { lines: pct(50), branches: pct(30) }
};

// 1) Eşik tutuyorsa ihlal yok; altına düşünce açıkça söylenir
{
  const esik = { toplam: { lines: 88, branches: 65, functions: 85 }, dosyalar: { 'server/app.js': { lines: 86 }, 'server/index.js': { lines: 40 } } };
  assert.deepEqual(ihlaller(ozet, esik), []);
  const sert = { toplam: { lines: 91, branches: 65 }, dosyalar: { 'server/app.js': { lines: 90 } } };
  const ih = ihlaller(ozet, sert);
  assert.equal(ih.length, 2);
  assert.ok(ih[0].includes('satır') && ih[0].includes('%90') && ih[0].includes('%91'));
  assert.ok(ih[1].includes('server/app.js'));
  ok('eşik tutarsa temiz, altına düşünce hangi alan olduğu yazılır');
}

// 2) Dosya taşınmış/silinmişse sessiz geçilmez
{
  const ih = ihlaller(ozet, { toplam: {}, dosyalar: { 'server/yok.js': { lines: 10 } } });
  assert.equal(ih.length, 1);
  assert.ok(ih[0].includes('kapsam kaydı yok'));
  ok('kaydı olmayan dosya ihlal sayılır');
}

// 3) yukselt(): yalnız yukarı çeker (ölçülenin 0,5 puan altına), asla indirmez
{
  const esik = { toplam: { lines: 80, branches: 99 }, dosyalar: { 'server/app.js': { lines: 70 } } };
  const yeni = yukselt(ozet, esik);
  assert.equal(yeni.toplam.lines, 89.5, 'satır: 90 - 0,5');
  assert.equal(yeni.toplam.branches, 99, 'ölçülen 70 < eşik 99: eşik İNDİRİLMEZ');
  assert.equal(yeni.dosyalar['server/app.js'].lines, 86.5);
  assert.equal(esik.toplam.lines, 80, 'girdi nesnesi değişmez');
  ok('eşik yalnız yukarı gider, asla aşağı inmez');
}

console.log(`\n${passed}/3 kapsam kapısı testi geçti`);
