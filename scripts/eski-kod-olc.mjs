// Eski kod ölçeri: izlenen metin dosyalarında satırların kaçı SINIR tarihinden önce yazılmış ve o günden beri hiç değişmemiş.
// Gemini dönemi (Eylül 2026 öncesi) temizliğinin ilerlemesini sayıyla izlemek için; hiçbir şeyi değiştirmez (salt okuma).
// Kullanım: node scripts/eski-kod-olc.mjs [--sinir 2026-09-29] [--ilk 25] [--json dosya.json]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (ad, varsayilan) => { const i = process.argv.indexOf(ad); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : varsayilan; };
const SINIR_TARIHI = arg('--sinir', '2026-09-29');
const SINIR = Date.parse(`${SINIR_TARIHI}T00:00:00+03:00`) / 1000;
const ILK = Number(arg('--ilk', '25'));
const JSON_YOLU = arg('--json', '');

const git = (...a) => execFileSync('git', a, { cwd: KOK, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
const dosyalar = git('ls-files').split('\n').filter(Boolean);
const METIN = /\.(js|mjs|cjs|css|html|json|md|sol|yml|yaml|txt|bat|vbs|sh|ps1)$/;
// Üretilmiş ya da üçüncü taraf dosyalar ölçüme girmez
const HARIC = [/^package-lock\.json$/, /^docs\/api\//, /^docs\/openapi\.yaml$/, /^tests\/altin\/altin_kayit\.json$/, /^claude-proje-kiti\//];

const sonuc = [];
for (const f of dosyalar) {
  if (!METIN.test(f) || HARIC.some(r => r.test(f))) continue;
  let cikti;
  try { cikti = git('blame', '-w', '--line-porcelain', '--', f); } catch { continue; }
  let eski = 0, yeni = 0;
  for (const m of cikti.matchAll(/^author-time (\d+)$/gm)) { if (Number(m[1]) < SINIR) eski++; else yeni++; }
  sonuc.push({ dosya: f, eski, yeni });
}

const eski = sonuc.reduce((s, r) => s + r.eski, 0);
const yeni = sonuc.reduce((s, r) => s + r.yeni, 0);
const oran = (a, b) => (a + b ? Math.round((100 * a) / (a + b)) : 0);
console.log(`Sınır: ${SINIR_TARIHI} · ${sonuc.length} dosya · eski ${eski} satır · yeni ${yeni} satır · eski oranı %${oran(eski, yeni)}\n`);

const klasor = {};
for (const r of sonuc) {
  const k = r.dosya.includes('/') ? r.dosya.split('/')[0] : '(kök)';
  klasor[k] = klasor[k] || { e: 0, y: 0 };
  klasor[k].e += r.eski; klasor[k].y += r.yeni;
}
console.log('Klasör bazında:');
for (const [k, v] of Object.entries(klasor).sort((a, b) => b[1].e - a[1].e)) {
  console.log(`  ${k.padEnd(14)} eski ${String(v.e).padStart(6)}  yeni ${String(v.y).padStart(6)}  %${oran(v.e, v.y)}`);
}
console.log(`\nEn çok eski satırı olan ${ILK} dosya:`);
for (const r of sonuc.slice().sort((a, b) => b.eski - a.eski).slice(0, ILK)) {
  console.log(`  ${String(r.eski).padStart(6)} eski · %${String(oran(r.eski, r.yeni)).padStart(3)} · ${String(r.eski + r.yeni).padStart(6)} satır  ${r.dosya}`);
}
if (JSON_YOLU) fs.writeFileSync(JSON_YOLU, JSON.stringify({ sinir: SINIR_TARIHI, eski, yeni, dosyalar: sonuc }, null, 1));
