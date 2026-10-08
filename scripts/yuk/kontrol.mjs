// Yük regresyon kapısı (kurumsal A4.6): kısa bir yük koşusu yapar, scripts/yuk/esik.json eşiklerinin ALTINA düşerse (yavaşlama, hata, bellek şişmesi) hata verir.
//   node scripts/yuk/kontrol.mjs        (≈1 dk; npm run yuk-kontrol)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ana } from './yuk.mjs';

const dizin = path.dirname(fileURLToPath(import.meta.url));

// Saf yardımcı (testlenir): koşu sonucu ve eşikten ihlal listesi
export function kontrolEt(sonuc, esik) {
  const ih = [];
  for (const ad of ['state', 'karma']) {
    const r = sonuc.senaryolar.find(s => s.ad === ad);
    const e = esik[ad];
    if (!r) { ih.push(`${ad} senaryosu koşulmadı`); continue; }
    if (r.rps < e.rpsMin) ih.push(`${ad}: ${r.rps} istek/sn < alt sınır ${e.rpsMin}`);
    if (r.p95 > e.p95MaxMs) ih.push(`${ad}: p95 ${r.p95} ms > üst sınır ${e.p95MaxMs}`);
  }
  const hata = sonuc.senaryolar.reduce((t, s) => t + (s.hata || 0), 0);
  if (hata > esik.hataMax) ih.push(`${hata} hatalı istek (en çok ${esik.hataMax})`);
  const c = sonuc.senaryolar.map(s => s.sunucu).filter(Boolean).at(-1);
  if (c && c.heapSon - c.heapIlk > esik.heapBuyumeMaxMB) ih.push(`bellek (GC sonrası heap) ${c.heapSon - c.heapIlk} MB büyüdü > ${esik.heapBuyumeMaxMB} MB`);
  return ih;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const esik = JSON.parse(fs.readFileSync(path.join(dizin, 'esik.json'), 'utf8'));
  const sonuc = await ana(['--oyuncu=200', '--baglanti=50', '--sure=10', '--senaryo=state,karma', '--port=18390']);
  const ih = kontrolEt(sonuc, esik);
  if (!ih.length) { console.log('✅ Yük regresyon kapısı geçti.'); process.exit(0); }
  console.error('❌ Yük regresyonu:\n   ' + ih.join('\n   '));
  process.exit(1);
}
