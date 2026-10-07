// Üretim bağımlılıklarının güvenlik denetimi (kurumsal A2.2).
// Neden ayrı betik: bu projede `npm audit --omit=dev` yanıltıcı (ganache'ın içine gömülü test paketleri kilit
// dosyasında üretim gibi işaretli, yüzlerce sahte uyarı verir). Burada devDependencies çıkarılmış geçici bir kopyada
// KİLİT DOSYASINDAKİ aynı sürümlerle yalnız üretim ağacı kurulur ve o denetlenir.
//
//   node scripts/audit-uretim.mjs                  → yüksek (high) ve üstü varsa çıkış 1
//   node scripts/audit-uretim.mjs --seviye=moderate
//   node scripts/audit-uretim.mjs --json           → ham sonuç (araçlar için)
// Ağ gerekir (npm kayıt defteri).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEVIYELER = ['info', 'low', 'moderate', 'high', 'critical'];

// Saf yardımcı (testlenir): npm audit --json çıktısından özet çıkarır
export function ozet(j, esik = 'high') {
  const v = (j && j.metadata && j.metadata.vulnerabilities) || {};
  const esikSira = SEVIYELER.indexOf(esik);
  const ustu = SEVIYELER.filter((s, i) => i >= esikSira).reduce((t, s) => t + (v[s] || 0), 0);
  const liste = Object.entries((j && j.vulnerabilities) || {})
    .filter(([, x]) => SEVIYELER.indexOf(x.severity) >= esikSira)
    .map(([ad, x]) => ({ ad, seviye: x.severity, dogrudan: !!x.isDirect, duzeltme: x.fixAvailable && x.fixAvailable.name ? `${x.fixAvailable.name}@${x.fixAvailable.version}` : !!x.fixAvailable }));
  return { sayim: v, esikUstu: ustu, liste, paket: (j && j.metadata && j.metadata.dependencies && j.metadata.dependencies.total) || 0 };
}

// Üretim-yalnız geçici proje klasörü hazırlar, yolunu döndürür
export function uretimKlasoru(kaynak = kok) {
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-uretim-'));
  const pkg = JSON.parse(fs.readFileSync(path.join(kaynak, 'package.json'), 'utf8'));
  delete pkg.devDependencies;
  delete pkg.scripts;
  fs.writeFileSync(path.join(gecici, 'package.json'), JSON.stringify(pkg, null, 2));
  const kilit = path.join(kaynak, 'package-lock.json');
  if (fs.existsSync(kilit)) fs.copyFileSync(kilit, path.join(gecici, 'package-lock.json'));
  return gecici;
}

function npm(args, cwd) {
  return spawnSync('npm', args, { cwd, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const esik = (process.argv.find(a => a.startsWith('--seviye=')) || '--seviye=high').split('=')[1];
  const gecici = uretimKlasoru();
  try {
    const k = npm(['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], gecici);
    if (k.status !== 0) { console.error('❌ Üretim kilit dosyası hazırlanamadı:\n' + (k.stderr || k.stdout)); process.exit(2); }
    const a = npm(['audit', '--json'], gecici);
    let j;
    try { j = JSON.parse(a.stdout); } catch { console.error('❌ npm audit çıktısı okunamadı (ağ yok mu?):\n' + (a.stderr || a.stdout).slice(0, 500)); process.exit(2); }
    if (j.error) { console.error('❌ npm audit hata verdi: ' + (j.error.summary || JSON.stringify(j.error))); process.exit(2); }
    if (process.argv.includes('--json')) { console.log(JSON.stringify(j, null, 2)); process.exit(0); }
    const o = ozet(j, esik);
    console.log(`Üretim ağacı: ${o.paket} paket. Sayım: ${JSON.stringify(o.sayim)}`);
    if (o.esikUstu === 0) { console.log(`✅ ${esik} ve üstü açık yok.`); process.exit(0); }
    console.error(`❌ ${o.esikUstu} adet ${esik}+ açık:`);
    for (const x of o.liste) console.error(`   - ${x.ad} (${x.seviye}${x.dogrudan ? ', doğrudan' : ''})  düzeltme: ${x.duzeltme}`);
    process.exit(1);
  } finally {
    fs.rmSync(gecici, { recursive: true, force: true });
  }
}
