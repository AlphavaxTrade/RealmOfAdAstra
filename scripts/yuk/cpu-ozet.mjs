// .cpuprofile dosyalarından "en çok CPU yiyen işlevler" özeti (kurumsal A4.1)
//   node scripts/yuk/cpu-ozet.mjs <klasör-ya-da-.cpuprofile> [kaç=15]
import fs from 'node:fs';
import path from 'node:path';

// Saf yardımcı (testlenir): profil → [{ ad, dosya, satir, ms, yuzde }] kendi süresine (self time) göre sıralı
export function ozetle(profil, kac = 15) {
  const dugumler = new Map(profil.nodes.map(n => [n.id, n]));
  const kendi = new Map();   // düğüm id → mikrosaniye
  const dt = profil.timeDeltas || [];
  (profil.samples || []).forEach((id, i) => kendi.set(id, (kendi.get(id) || 0) + (dt[i] || 0)));
  const toplam = [...kendi.values()].reduce((a, b) => a + b, 0) || 1;
  const gruplu = new Map();
  for (const [id, us] of kendi) {
    const n = dugumler.get(id);
    if (!n) continue;
    const cf = n.callFrame;
    const anahtar = `${cf.functionName || '(anonim)'}|${cf.url}|${cf.lineNumber}`;
    const g = gruplu.get(anahtar) || { ad: cf.functionName || '(anonim)', dosya: cf.url.replace(/^file:\/\/\//, ''), satir: cf.lineNumber + 1, us: 0 };
    g.us += us;
    gruplu.set(anahtar, g);
  }
  return [...gruplu.values()].sort((a, b) => b.us - a.us).slice(0, kac).map(g => ({ ad: g.ad, dosya: g.dosya, satir: g.satir, ms: Math.round(g.us / 100) / 10, yuzde: Math.round(g.us / toplam * 1000) / 10 }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const hedef = process.argv[2];
  const kac = Number(process.argv[3]) || 15;
  if (!hedef) { console.error('Kullanım: node scripts/yuk/cpu-ozet.mjs <klasör|.cpuprofile> [kaç]'); process.exit(2); }
  const dosyalar = fs.statSync(hedef).isDirectory() ? fs.readdirSync(hedef).filter(f => f.endsWith('.cpuprofile')).map(f => path.join(hedef, f)) : [hedef];
  for (const f of dosyalar) {
    const profil = JSON.parse(fs.readFileSync(f, 'utf8'));
    console.log(`\n== ${path.basename(f)}`);
    for (const r of ozetle(profil, kac)) console.log(`${String(r.yuzde).padStart(5)}%  ${String(r.ms).padStart(8)} ms  ${r.ad}  (${r.dosya.split('/').slice(-2).join('/')}:${r.satir})`);
  }
}
