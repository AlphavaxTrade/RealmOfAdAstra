// Realm of AdAstra — tüm testleri çalıştırıcı
// tests/ klasöründeki test_*.mjs dosyalarının HEPSİNİ ayrı süreçlerde sırayla çalıştırır.
// (v1.25 öncesinde test listesi package.json'da elle tutuluyordu; 10 dosya listede yoktu ve
// ikisi bozuk olduğu hâlde kimse fark etmiyordu.)
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter(f => /^test_.*\.mjs$/.test(f)).sort();
const failed = [];
const sureler = [];
const t0 = Date.now();

for (const f of files) {
  // PAROLA_HAFIF=1: testlerde parola özeti hafif ayarla (yüzlerce kayıt test süresini uzatmasın); güçlü ayar tests/test_parola.mjs'te sınanır
  const t1 = Date.now();
  const r = spawnSync(process.execPath, [join(dir, f)], { encoding: 'utf8', env: { ...process.env, PAROLA_HAFIF: '1' } });
  sureler.push([f, Date.now() - t1]);
  if (r.status === 0) {
    console.log(`✅ ${f}`);
  } else {
    failed.push(f);
    console.log(`❌ ${f}`);
    const out = `${r.stdout || ''}\n${r.stderr || ''}`.split('\n').filter(l => /Error|assert|expected|actual|message/i.test(l)).slice(0, 8);
    out.forEach(l => console.log(`     ${l.trim()}`));
  }
}

// En yavaş 6 test (yavaşlama fark edilsin)
console.log('En yavaş testler: ' + sureler.sort((a, b) => b[1] - a[1]).slice(0, 6).map(([ad, ms]) => `${ad} ${(ms / 1000).toFixed(1)}sn`).join(' · '));
console.log(`\n${files.length - failed.length}/${files.length} test dosyası geçti (${((Date.now() - t0) / 1000).toFixed(1)} sn).`);
if (failed.length) {
  console.log(`Kalanlar: ${failed.join(', ')}`);
  process.exit(1);
}
