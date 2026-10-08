// Yedeklerin hepsini doğrular (kurumsal A9.7 üç aylık tatbikat ve CI): manifest + sha256 (hızlı) ya da --derin (açar + SQLite bütünlük).
//   node server/yedek/cli/dogrula.js [--derin] [--son=5]     (YEDEK_KLASORU ve gerekirse YEDEK_ANAHTAR ortamda)
// Çıkış kodu: 0 hepsi sağlam, 1 bozuk yedek var, 2 hiç yedek yok.
import path from 'node:path';
import { loadConfig } from '../../config.js';
import { yedekleriListele } from '../yedekle.js';
import { yedekDogrula } from '../geriyukle.js';

const cfg = loadConfig();
if (!cfg.yedek.klasor) { console.error('⛔ YEDEK_KLASORU tanımlı değil'); process.exit(1); }
const derin = process.argv.includes('--derin');
const sonArg = process.argv.find(a => a.startsWith('--son='));
let liste = yedekleriListele(cfg.yedek.klasor).reverse();
if (sonArg) liste = liste.slice(0, Number(sonArg.slice(6)) || 5);
if (!liste.length) { console.error('⛔ Hiç yedek yok: ' + cfg.yedek.klasor); process.exit(2); }
let bozuk = 0;
for (const y of liste) {
  const s = await yedekDogrula({ dosya: path.join(cfg.yedek.klasor, y.ad), anahtar: cfg.yedek.anahtar, derin });
  if (s.ok) console.log(`✅ ${y.ad}${derin ? ' (derin)' : ''}`);
  else { bozuk++; console.log(`⛔ ${y.ad}: ${s.hatalar.join('; ')}`); }
}
console.log(bozuk ? `\n⛔ ${bozuk}/${liste.length} yedek bozuk` : `\n✅ ${liste.length} yedek sağlam`);
process.exit(bozuk ? 1 : 0);
