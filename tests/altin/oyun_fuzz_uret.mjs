// Oyun kuralları altın kaydını (yeniden) üretir: node tests/altin/oyun_fuzz_uret.mjs
// Yalnızca oyun kuralını BİLEREK değiştirdiğinde çalıştır; yeniden yazımda ÇALIŞTIRMA.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calistir, ADIM_SAYISI, TOHUM } from './oyun_fuzz_senaryo.mjs';

const dizin = path.dirname(fileURLToPath(import.meta.url));
const { kayit, plan } = await calistir(ADIM_SAYISI, TOHUM);
const dagilim = {};
for (const o of plan) {
  const k = o.tur === 'islem' ? `${o.ad}:${o.sonuc.startsWith('HATA') ? 'HATA' : o.sonuc}` : o.tur;
  dagilim[k] = (dagilim[k] || 0) + 1;
}
fs.writeFileSync(path.join(dizin, 'oyun_fuzz_kayit.json'), JSON.stringify({
  aciklama: 'Oyun kuralları altın kaydı: adım başına oyuncu+dünya özeti (SHA-256 ilk 12 hane)',
  tohum: TOHUM, adimSayisi: ADIM_SAYISI, kayit
}));
const basarili = Object.entries(dagilim).filter(([k]) => k.endsWith(':ok')).length;
const hatalar = Object.entries(dagilim).filter(([k]) => k.endsWith(':HATA'));
console.log(`Oyun altın kaydı yazıldı: ${ADIM_SAYISI} adım; ${basarili} farklı işlem en az bir kez başarılı oldu; HATA veren: ${hatalar.length}`);
if (process.argv.includes('--dagilim')) console.log(dagilim);
