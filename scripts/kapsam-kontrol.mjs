// Test kapsamı kapısı (kurumsal A3.1): `npm run kapsam` sonrası coverage/coverage-summary.json, kapsam-esik.json'daki
// alt sınırların altına düşerse hata verir. Kural: eşikler yalnız YUKARI gider (kapsam düşürülemez).
//   node scripts/kapsam-kontrol.mjs            → kontrol (çıkış 1: eşik altında)
//   node scripts/kapsam-kontrol.mjs --yukselt  → ölçülen değer eşiğin üstündeyse eşiği yükseltir (aşağı asla indirmez)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dosyaKaydi = (ozet, dosya) => Object.entries(ozet).find(([k]) => k !== 'total' && k.split(path.sep).join('/').endsWith('/' + dosya));

// Saf yardımcı (testlenir): ölçülen özet ve eşikten ihlal listesi çıkarır
export function ihlaller(ozet, esik) {
  const out = [];
  for (const [alan, ad] of [['lines', 'satır'], ['branches', 'dal'], ['functions', 'fonksiyon']]) {
    const alt = esik.toplam && esik.toplam[alan];
    const olcu = ozet.total && ozet.total[alan] && ozet.total[alan].pct;
    if (typeof alt === 'number' && typeof olcu === 'number' && olcu + 1e-9 < alt) out.push(`toplam ${ad} kapsamı %${olcu} < eşik %${alt}`);
  }
  for (const [dosya, alanlar] of Object.entries(esik.dosyalar || {})) {
    const kayit = dosyaKaydi(ozet, dosya);
    if (!kayit) { out.push(`${dosya}: kapsam kaydı yok (dosya taşındı mı?)`); continue; }
    for (const [alan, alt] of Object.entries(alanlar)) {
      const olcu = kayit[1][alan] && kayit[1][alan].pct;
      if (typeof olcu === 'number' && olcu + 1e-9 < alt) out.push(`${dosya}: ${alan} %${olcu} < eşik %${alt}`);
    }
  }
  return out;
}

// Eşiği yalnız yukarı çeker (ölçülenin 0,5 puan altına kadar: küçük dalgalanmaya pay)
export function yukselt(ozet, esik) {
  const yeni = JSON.parse(JSON.stringify(esik));
  const kes = x => Math.floor((x - 0.5) * 10) / 10;
  for (const alan of Object.keys(yeni.toplam || {})) {
    const olcu = ozet.total[alan] && ozet.total[alan].pct;
    if (typeof olcu === 'number' && kes(olcu) > yeni.toplam[alan]) yeni.toplam[alan] = kes(olcu);
  }
  for (const [dosya, alanlar] of Object.entries(yeni.dosyalar || {})) {
    const kayit = dosyaKaydi(ozet, dosya);
    if (!kayit) continue;
    for (const alan of Object.keys(alanlar)) {
      const olcu = kayit[1][alan] && kayit[1][alan].pct;
      if (typeof olcu === 'number' && kes(olcu) > alanlar[alan]) alanlar[alan] = kes(olcu);
    }
  }
  return yeni;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ozetYolu = path.join(kok, 'coverage', 'coverage-summary.json');
  const esikYolu = path.join(kok, 'kapsam-esik.json');
  if (!fs.existsSync(ozetYolu)) { console.error('❌ coverage/coverage-summary.json yok: önce `npm run kapsam` çalıştır.'); process.exit(2); }
  const ozet = JSON.parse(fs.readFileSync(ozetYolu, 'utf8'));
  const esik = JSON.parse(fs.readFileSync(esikYolu, 'utf8'));
  if (process.argv.includes('--yukselt')) {
    const yeni = yukselt(ozet, esik);
    fs.writeFileSync(esikYolu, JSON.stringify(yeni, null, 2) + '\n');
    console.log('Eşikler güncellendi (yalnız yukarı):', JSON.stringify(yeni.toplam));
    process.exit(0);
  }
  const ih = ihlaller(ozet, esik);
  if (!ih.length) { console.log(`✅ Kapsam eşikleri tutuyor (satır %${ozet.total.lines.pct}, dal %${ozet.total.branches.pct}).`); process.exit(0); }
  console.error('❌ Kapsam eşiğin altına düştü:\n   ' + ih.join('\n   '));
  process.exit(1);
}
