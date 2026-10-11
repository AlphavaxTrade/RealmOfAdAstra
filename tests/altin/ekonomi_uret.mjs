// Ekonomi çekirdeği altın kaydını (yeniden) üretir: node tests/altin/ekonomi_uret.mjs
// Yalnızca ekonomi kuralını BİLEREK değiştirdiğinde çalıştır; yeniden yazımda ÇALIŞTIRMA.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calistir, ISLEM_SAYISI, TOHUM } from './ekonomi_senaryo.mjs';

const dizin = path.dirname(fileURLToPath(import.meta.url));
const { ozetler, liste } = calistir(TOHUM, ISLEM_SAYISI);
const sayim = {};
for (const o of liste) sayim[o.ad] = (sayim[o.ad] || 0) + 1;
fs.writeFileSync(path.join(dizin, 'ekonomi_kayit.json'), JSON.stringify({
  aciklama: 'Ekonomi çekirdeği altın kaydı: işlem başına durum özeti (SHA-256 ilk 16 hane)',
  tohum: TOHUM, islemSayisi: ISLEM_SAYISI, islemDagilimi: sayim, ozetler
}));
console.log('Ekonomi altın kaydı yazıldı:', ISLEM_SAYISI, 'işlem', sayim);
