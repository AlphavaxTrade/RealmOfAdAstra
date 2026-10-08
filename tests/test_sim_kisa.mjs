// Kısa yerel simülasyon (T3): 24 vatandaş + 5 aday, 5 hafta, GERÇEK sunucu kodu + sahte saat + sahte zincir. Her haftanın sonunda
// ekonomi/kapı değişmezleri denetlenir (ASTRA korunumu, kasa defteri, kapı sayımları, UBI devri, gösterge, izin kuralı...).
// Uzun sürümler (100 vatandaş × 52 hafta, senaryolar): node scripts/simulasyon/yil.mjs --hafta=52 --senaryo=taban
// Ekonomiyi değiştiren her iş bu denetimden geçmeden girmemeli.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

const calistir = args => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [path.join(kok, 'scripts/simulasyon/yil.mjs'), ...args, '--sessiz'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
  p.on('close', kod => resolve({ kod, out, err }));
  p.on('error', reject);
});

const r = await calistir(['--hafta=5', '--vatandas=24', '--aday=5', '--tohum=3', '--senaryo=taban']);
const son = r.out.trim().split('\n').filter(Boolean).at(-1) || '{}';
let ozet; try { ozet = JSON.parse(son); } catch { ozet = null; }
assert.ok(ozet, 'simülasyon özet satırı üretmedi:\n' + r.out.slice(-400) + r.err.slice(-400));
assert.equal(r.kod, 0, 'Kritik değişmez ihlali ya da sunucu hatası: ' + JSON.stringify(ozet));
assert.equal(ozet.kritik, 0);
assert.equal(ozet.sunucuHata, 0);
ok(`5 hafta × 29 hesap simülasyonu: kritik ihlal yok, sunucu hatası yok (${ozet.sureSn} sn); bulgu ihlalleri: ${JSON.stringify(Object.fromEntries(Object.entries(ozet.ihlalSayac).filter(([k]) => !k.endsWith(':kritik'))))}`);

console.log(`\n${passed} kısa simülasyon kontrolü geçti.`);
