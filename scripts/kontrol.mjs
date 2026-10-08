// Tek komutta CI'ın aynısı (kurumsal A8): `npm run kontrol`. İlk başarısız adımda durur ve hangisi olduğunu söyler.
// `--hizli`: yalnız gizli bilgi + lint + hızlı testler (~15 sn); tam sürüm ~4 dk (kapsam ölçümlü testler dahil).
import { spawnSync } from 'node:child_process';

const hizli = process.argv.includes('--hizli');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const TAM = ['lint', 'olu-kod', 'gizli-tara', 'kapsam', 'kapsam-kontrol', 'build', 'audit-uretim'];
const HIZLI = [['gizli-tara'], ['lint'], ['hizli-test']];

const adimlar = hizli ? HIZLI : TAM.map(a => [a]);
const t0 = Date.now();
for (const [ad] of adimlar) {
  const s = Date.now();
  console.log(`\n▶ ${ad}`);
  const r = ad === 'hizli-test'
    ? spawnSync(process.execPath, ['tests/run_all.mjs', '--hizli'], { stdio: 'inherit' })
    : spawnSync(npm, ['run', ad], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`\n⛔ "${ad}" başarısız (${((Date.now() - s) / 1000).toFixed(0)} sn). Sonraki adımlar çalıştırılmadı.`); process.exit(1); }
  console.log(`✅ ${ad} (${((Date.now() - s) / 1000).toFixed(0)} sn)`);
}
console.log(`\n✅ Tüm kapılar yeşil (${((Date.now() - t0) / 1000).toFixed(0)} sn).`);
