// Altın kaydı (yeniden) üretir: node tests/altin/uret.mjs
// SADECE oyun davranışını bilerek değiştirdiğinde çalıştır (ör. onaylı bir kural değişikliği) ve diff'i commit mesajında açıkla.
// Refaktör sırasında bu dosyayı ÇALIŞTIRMA: amaç, davranışın değişmediğini test_altin_kayit.mjs ile kanıtlamak.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dizin = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(dizin, 'senaryo.mjs')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (r.status !== 0) { console.error('Senaryo çalışmadı:\n' + r.stderr); process.exit(1); }
JSON.parse(r.stdout);   // geçerli JSON mu
fs.writeFileSync(path.join(dizin, 'altin_kayit.json'), r.stdout);
console.log('Altın kayıt yazıldı:', path.join(dizin, 'altin_kayit.json'), `(${JSON.parse(r.stdout).length} adım)`);
