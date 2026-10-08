// Bir klasördeki yedeklere saklama planını (saatlik 48 / günlük 14 / haftalık 8) uygular. Sunucudaki yedek servisi bunu kendi klasörüne zaten yapar;
// bu araç BAŞKA bir yerdeki kopya içindir (örn. bilgisayara indirilen yedekler: scripts/windows/yedek-indir.ps1).
//   node server/yedek/cli/buda.js <klasor> [--kuru]       (--kuru: yalnız ne silineceğini yazar, silmez)
// Yalnız tanınan yedek dosyalarına (realm-YYYYMMDD-HHMMSS.db.gz[.enc]) ve manifestlerine dokunur; klasördeki başka dosyalar kalır.
// Çıkış kodu: 0 tamam, 1 klasör yok / kullanım hatası.
import fs from 'node:fs';
import path from 'node:path';
import { saklamaPlani } from '../saklama.js';
import { yedekAdiMi, yedekleriListele } from '../yedekle.js';

const klasor = process.argv.slice(2).find(a => !a.startsWith('--'));
const kuru = process.argv.includes('--kuru');
if (!klasor || !fs.existsSync(klasor) || !fs.statSync(klasor).isDirectory()) {
  console.error('Kullanım: node server/yedek/cli/buda.js <klasor> [--kuru]   (klasör bulunamadı)');
  process.exit(1);
}

const liste = yedekleriListele(klasor);
const tut = saklamaPlani(liste, Date.now());
const silinecek = [];
for (const y of liste) if (!tut.has(y.ad)) silinecek.push(y.ad, y.ad + '.json');
// Yetim manifest: karşılığında yedek dosyası olmayan "realm-….json"
for (const f of fs.readdirSync(klasor)) {
  if (f.endsWith('.json') && yedekAdiMi(f.slice(0, -5)) && !fs.existsSync(path.join(klasor, f.slice(0, -5)))) silinecek.push(f);
}
const gercek = [...new Set(silinecek)].filter(f => fs.existsSync(path.join(klasor, f)));
if (!kuru) for (const f of gercek) fs.rmSync(path.join(klasor, f), { force: true });
console.log(`${liste.length} yedek var; saklama planına göre ${tut.size} kalır; ${kuru ? 'silinecek' : 'silindi'}: ${gercek.length} dosya`);
process.exit(0);
