// Altın kayıt (kurumsal A3.8): sabit saat + rastgelelikle oynanan bir oyun senaryosunun adım adım durum özetleri,
// kaydedilmiş "altın" özetlerle BİREBİR aynı olmalı. Refaktör davranışı bozduysa bu test hangi adımda bozulduğunu söyler.
//   Bilerek davranış değiştirdiysen: node tests/altin/uret.mjs  (ve değişikliği açıkla)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dizin = path.join(path.dirname(fileURLToPath(import.meta.url)), 'altin');
let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

const calistir = () => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [path.join(dizin, 'senaryo.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
  let cikti = '', hata = '';
  p.stdout.on('data', d => { cikti += d; }); p.stderr.on('data', d => { hata += d; });
  p.on('close', kod => (kod === 0 ? resolve(cikti) : reject(new Error('senaryo çıkış kodu ' + kod + '\n' + hata.slice(0, 600)))));
});

// İki bağımsız süreç: aynı sonucu vermeli (belirlenimlilik), kayıtlı altın kayıtla da aynı olmalı
const [bir, iki] = await Promise.all([calistir(), calistir()]);

assert.equal(bir, iki, 'senaryo iki ayrı süreçte farklı sonuç verdi: kayıt belirlenimli değil (saat/rastgelelik sızıyor)');
ok('senaryo iki ayrı süreçte birebir aynı sonucu veriyor (belirlenimli)');

const altin = JSON.parse(fs.readFileSync(path.join(dizin, 'altin_kayit.json'), 'utf8'));
const simdi = JSON.parse(bir);
assert.equal(simdi.length, altin.length, `adım sayısı değişti: ${simdi.length} ≠ ${altin.length}`);
const farklar = [];
simdi.forEach((s, i) => { if (JSON.stringify(s) !== JSON.stringify(altin[i])) farklar.push(`adım ${i + 1} "${s.adim}": oyuncu ${JSON.stringify(s.oyuncu)} dünya ${s.dunya} sonuç ${JSON.stringify(s.sonuc)}  ≠  altın ${JSON.stringify(altin[i].oyuncu)} ${altin[i].dunya} ${JSON.stringify(altin[i].sonuc)}`); });
assert.deepEqual(farklar, [], 'OYUN DAVRANIŞI DEĞİŞTİ. İlk fark:\n' + farklar.slice(0, 3).join('\n'));
ok(`${altin.length} adımın hepsi altın kayıtla birebir aynı`);

// Senaryo anlamlı mı: yeterince işlem gerçekten uygulanmış olmalı (hepsi reddedilen bir senaryo hiçbir şeyi korumaz)
const sonuclar = altin.flatMap(a => (Array.isArray(a.sonuc) ? a.sonuc : []));
const basarili = sonuclar.filter(x => String(x).endsWith(':ok')).length;
assert.ok(basarili >= 30, `senaryoda yeterince işlem uygulanmıyor (${basarili}): altın kayıt zayıf`);
ok(`senaryo anlamlı: ${basarili} işlem oyunda gerçekten uygulandı`);

console.log(`\n${passed}/3 altın kayıt testi geçti`);
