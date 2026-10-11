// Savaş motoru altın kaydını (yeniden) üretir: node tests/altin/savas_uret.mjs
// Yalnızca savaş kuralını BİLEREK değiştirdiğinde çalıştır. Refaktörde çalıştırma: amaç davranışın aynı kaldığını göstermek.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calistir, SENARYO_SAYISI } from './savas_senaryo.mjs';

const dizin = path.dirname(fileURLToPath(import.meta.url));
const ozetler = [];
const istatistik = { zafer: 0, yenilgi: 0, berabere: 0, turToplam: 0 };
for (let n = 0; n < SENARYO_SAYISI; n++) {
  const { sonuc, ozet } = calistir(n);
  ozetler.push(ozet);
  if (sonuc.winner === 'ally') istatistik.zafer++;
  else if (sonuc.winner === 'enemy') istatistik.yenilgi++;
  else istatistik.berabere++;
  istatistik.turToplam += sonuc.roundCount;
}
const cikti = { aciklama: 'Savaş motoru altın kaydı: senaryo başına sonuç özeti (SHA-256 ilk 16 hane)', istatistik, ozetler };
fs.writeFileSync(path.join(dizin, 'savas_kayit.json'), JSON.stringify(cikti));
console.log('Savaş altın kaydı yazıldı:', SENARYO_SAYISI, 'senaryo', istatistik);
