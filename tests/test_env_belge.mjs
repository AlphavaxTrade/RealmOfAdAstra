// Ortam değişkeni belgesi kayma koruması (kurumsal A6.3): kod yeni bir değişken okursa belgelenmeden geçemez; belge koddan üretilmiş hâliyle aynı olmalı
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEGISKENLER, koddaOkunanlar, belgeUret, ornekUret, ORTAM_YOLU, ORNEK_YOLU } from '../scripts/env-belge.mjs';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const belgeli = new Set(DEGISKENLER.map(d => d[1]));
const kodda = koddaOkunanlar();

// 1) Kodun okuduğu her değişken belgelenmiş (ve tersi)
{
  const eksik = kodda.filter(a => !belgeli.has(a));
  assert.deepEqual(eksik, [], 'Kod şu değişkenleri okuyor ama scripts/env-belge.mjs DEGISKENLER listesinde yok: ' + eksik.join(', '));
  const fazla = [...belgeli].filter(a => !kodda.includes(a));
  assert.deepEqual(fazla, [], 'Belgelenmiş ama kodda artık okunmayan değişken: ' + fazla.join(', '));
  assert.equal(new Set(DEGISKENLER.map(d => d[1])).size, DEGISKENLER.length, 'aynı değişken iki kez belgelenmiş');
  ok(`${kodda.length} değişkenin hepsi belgeli, fazlası yok`);
}

// 2) Her satır eksiksiz; gizli bayraklı değişkenlerin gerçekten dosyadan okunabildiği config.js'te doğrulanır
{
  for (const [grup, ad, acik, varsayilan] of DEGISKENLER) assert.ok(grup && ad && acik.length > 10 && varsayilan, 'eksik alan: ' + ad);
  const config = fs.readFileSync(new URL('../server/config.js', import.meta.url), 'utf8');
  for (const [, ad] of DEGISKENLER.filter(d => d[4].includes('G'))) assert.ok(config.includes(`gizli('${ad}')`), `${ad} "gizli" işaretli ama config.js dosyadan (X_FILE) okumuyor`);
  ok('her satır dolu; gizli işaretliler gerçekten *_FILE destekli');
}

// 3) Üretilen belge ve örnek dosya güncel
{
  const oku = y => (fs.existsSync(y) ? fs.readFileSync(y, 'utf8').replace(/\r\n/g, '\n') : '');
  assert.equal(oku(ORTAM_YOLU), belgeUret(), 'docs/kurumsal/ORTAM.md güncel değil: node scripts/env-belge.mjs');
  assert.equal(oku(ORNEK_YOLU), ornekUret(), 'docs/kurumsal/env.ornek.txt güncel değil: node scripts/env-belge.mjs');
  const ornek = ornekUret();
  assert.ok(!/PAROLA_HAFIF|TEST_RASTGELE/.test(ornek), 'test bayrakları örnek dosyada olmamalı');
  assert.ok(/^ADMIN_TOKEN=$/m.test(ornek), 'gizli değerler örnekte BOŞ');
  ok('ORTAM.md ve env.ornek.txt koddan üretilmiş hâliyle aynı');
}

// 4) server/.env.example (elle kopyalanan şablon) belgedeki her ayarı içeriyor; yeni ayar eklenip şablon unutulursa test kırılır
{
  const ornek = fs.readFileSync(new URL('../server/.env.example', import.meta.url), 'utf8').split(String.fromCharCode(13) + String.fromCharCode(10)).join(String.fromCharCode(10)).split(String.fromCharCode(10));
  const eksik = DEGISKENLER.filter(d => !d[4].includes('T')).map(d => d[1]).filter(ad => !ornek.some(s => s.startsWith(ad + '=')));
  assert.deepEqual(eksik, [], 'server/.env.example içinde olmayan ayarlar: docs/kurumsal/env.ornek.txt içeriğini kopyalayın');
  assert.ok(!ornek.some(s => s.startsWith('PAROLA_HAFIF=') || s.startsWith('TEST_RASTGELE=')), 'test bayrakları şablonda olmamalı');
  for (const gizli of DEGISKENLER.filter(d => d[4].includes('G')).map(d => d[1])) assert.ok(ornek.includes(gizli + '='), `gizli ayar ${gizli} şablonda BOŞ olmalı`);
  ok('server/.env.example belgedeki bütün ayarları içeriyor, gizli olanlar boş, test bayrakları yok');
}

console.log(`\n${passed}/4 ortam belgesi testi geçti`);
