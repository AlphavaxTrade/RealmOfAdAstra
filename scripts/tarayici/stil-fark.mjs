// CSS yeniden yazımı: iki stil kaydını (stil-kaydi.mjs) karşılaştırır. ELLE çalıştırılır.
//   node scripts/tarayici/stil-fark.mjs <once.json> <sonra.json> [--ayrinti]
// Çıkış kodu: 0 = fark yok (aynı görünüm), 1 = fark var. Farklar özellik ve sınıf bazında gruplanır.
import fs from 'node:fs';

const [, , a, b] = process.argv;
if (!a || !b) { console.error('Kullanım: node scripts/tarayici/stil-fark.mjs <once.json> <sonra.json> [--ayrinti]'); process.exit(2); }
const ayrinti = process.argv.includes('--ayrinti');
const A = JSON.parse(fs.readFileSync(a, 'utf8'));
const B = JSON.parse(fs.readFileSync(b, 'utf8'));
const oz = A.ozellikler;
const farklar = [];
let karsilastirilan = 0;
let eksikDurum = 0;

for (const [ad, once] of Object.entries(A.durumlar)) {
  const sonra = B.durumlar[ad];
  if (!sonra) { eksikDurum++; farklar.push({ ad, tur: 'durum yok' }); continue; }
  const harita = new Map(sonra.map((e) => [e[0], e]));
  const gorulen = new Set();
  for (const [yol, sinif, kutu, deger] of once) {
    gorulen.add(yol);
    const e = harita.get(yol);
    karsilastirilan++;
    if (!e) { farklar.push({ ad, tur: 'öğe silindi', yol, sinif }); continue; }
    if (e[2] !== kutu) farklar.push({ ad, tur: 'konum/boyut', yol, sinif, once: kutu, sonra: e[2] });
    if (e[3] !== deger) {
      const x = deger.split('|'); const y = e[3].split('|');
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) farklar.push({ ad, tur: oz[i], yol, sinif, once: x[i], sonra: y[i] });
    }
  }
  for (const [yol, , sinif] of sonra) if (!gorulen.has(yol)) farklar.push({ ad, tur: 'öğe eklendi', yol, sinif });
}

const gruplar = new Map();
for (const f of farklar) {
  const k = `${f.tur} :: ${f.sinif || ''}`;
  const g = gruplar.get(k) || { sayi: 0, ornek: f, durumlar: new Set() };
  g.sayi++; g.durumlar.add(f.ad);
  gruplar.set(k, g);
}
console.log(`${karsilastirilan} öğe karşılaştırıldı, ${farklar.length} fark, ${gruplar.size} grup${eksikDurum ? `, ${eksikDurum} durum eksik` : ''}.`);
const sirali = [...gruplar.entries()].sort((x, y) => y[1].sayi - x[1].sayi);
for (const [k, g] of sirali.slice(0, ayrinti ? 400 : 40)) {
  const o = g.ornek;
  console.log(`  ${g.sayi}× ${k}${o.once !== undefined ? `  [${String(o.once).slice(0, 60)} → ${String(o.sonra).slice(0, 60)}]` : ''}  (${[...g.durumlar].slice(0, 3).join(', ')})`);
}
process.exit(farklar.length ? 1 : 0);
