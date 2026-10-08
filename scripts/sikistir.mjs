// Derleme sonrası ön-sıkıştırma (kurumsal A4.5): dist/ içindeki metin dosyaları için .br (brotli) ve .gz kopyaları üretir.
// Sunucu (server/statik.js) tarayıcı kabul ediyorsa bunları doğrudan sunar: phaser 1,46 MB → ≈335 KB, anında (CPU harcamadan).
//   node scripts/sikistir.mjs [klasör=dist]     (npm run build bunu otomatik çalıştırır)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const SIKISTIRILIR = new Set(['.js', '.mjs', '.css', '.html', '.json', '.svg', '.txt', '.xml']);

function dosyalar(klasor) {
  const out = [];
  for (const ad of fs.readdirSync(klasor, { withFileTypes: true })) {
    const yol = path.join(klasor, ad.name);
    if (ad.isDirectory()) out.push(...dosyalar(yol));
    else if (SIKISTIRILIR.has(path.extname(ad.name).toLowerCase())) out.push(yol);
  }
  return out;
}

// Yalnız ≥ minBoyut ve gerçekten küçülen dosyalar için kopya yazar. Güncel kopyaya dokunmaz. { dosya, kazancBayt }
export function sikistirKlasor(klasor, { minBoyut = 1024 } = {}) {
  let sayi = 0, kazanc = 0;
  for (const f of dosyalar(klasor)) {
    const st = fs.statSync(f);
    if (st.size < minBoyut) continue;
    const icerik = fs.readFileSync(f);
    let yazildi = false;
    for (const [uz, sikistir] of [
      ['.br', b => zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length } })],
      ['.gz', b => zlib.gzipSync(b, { level: 9 })]
    ]) {
      const hedef = f + uz;
      if (fs.existsSync(hedef) && fs.statSync(hedef).mtimeMs >= st.mtimeMs) continue;   // güncel
      const s = sikistir(icerik);
      if (s.length >= icerik.length * 0.95) { fs.rmSync(hedef, { force: true }); continue; }   // anlamlı küçülme yok: kopya tutma
      fs.writeFileSync(hedef, s);
      kazanc += icerik.length - s.length; yazildi = true;
    }
    if (yazildi) sayi++;
  }
  return { dosya: sayi, kazancBayt: kazanc };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const klasor = path.resolve(process.argv[2] || 'dist');
  if (!fs.existsSync(klasor)) { console.error('Klasör yok: ' + klasor); process.exit(1); }
  const r = sikistirKlasor(klasor);
  console.log(`Ön-sıkıştırma: ${r.dosya} dosya, toplam ${(r.kazancBayt / 1048576).toFixed(2)} MB kazanç (${klasor}).`);
}
