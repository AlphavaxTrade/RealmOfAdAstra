// Yedekten geri yükleme (kurumsal A9.4). SUNUCU DURDURULMUŞKEN çalıştırın (systemctl stop realm / docker compose stop realm).
//   node server/yedek/cli/geri-yukle.js <yedek-dosyasi> [--hedef=./data/realm.db] [--anahtar-dosya=/yol/anahtar.txt] [--evet]
// Eski dosya silinmez (.oncesi-<damga> olarak yanında kalır). Geri yüklemeden sonra ÖDEMELER DURDURULMUŞ başlar:
// docs/kurumsal/FELAKET_KURTARMA.md "Geri yükleme sonrası" adımlarını izlemeden açmayın (çift ödeme riski).
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { loadConfig } from '../../config.js';
import { createLogger } from '../../log.js';
import { geriYukle } from '../geriyukle.js';

const arg = ad => process.argv.find(a => a.startsWith(`--${ad}=`))?.slice(ad.length + 3);
const dosya = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!dosya) { console.error('Kullanım: node server/yedek/cli/geri-yukle.js <yedek-dosyasi> [--hedef=...] [--anahtar-dosya=...] [--evet]'); process.exit(1); }
const cfg = loadConfig();
const hedef = arg('hedef') || cfg.dbFile;
let anahtar = cfg.yedek.anahtar;
if (arg('anahtar-dosya')) anahtar = fs.readFileSync(arg('anahtar-dosya'), 'utf8').trim();

if (!process.argv.includes('--evet')) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const c = await rl.question(`"${hedef}" dosyasının yerine "${dosya}" geri yüklenecek (eskisi yan yana saklanır, ödemeler durdurulur). Sunucu durdu mu? Devam? [evet/hayır] `);
  rl.close();
  if (c.trim().toLowerCase() !== 'evet') { console.log('Vazgeçildi.'); process.exit(1); }
}
const log = createLogger({ seviye: 'info', bicim: 'duz' });
try {
  const s = await geriYukle({ dosya, hedefDbFile: hedef, anahtar, log });
  console.log(`\n✅ Geri yüklendi: ${s.hedef}\n   Yedek zamanı : ${s.manifest.olusturma}\n   Eski dosya   : ${s.oncesi || '(yoktu)'}\n   ÖDEMELER DURDURULDU. Sonraki adımlar: docs/kurumsal/FELAKET_KURTARMA.md → "Geri yükleme sonrası".`);
} catch (err) {
  console.error('\n⛔ ' + err.message + '\n   Canlı dosyaya dokunulmadı.');
  process.exit(1);
}
