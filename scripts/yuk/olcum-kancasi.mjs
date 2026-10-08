// Yük testi ölçüm kancası (kurumsal A4.1): sunucuya `node --import <bu dosya> --expose-gc server/index.js` ile takılır;
// sunucu koduna DOKUNMAZ. Her YUK_OLCUM_ARALIK_MS (varsayılan 5000) bir CSV satırı yazar:
//   saniye, rss_mb, heap_kullanilan_mb (GC SONRASI: sızıntı göstergesi), heap_toplam_mb, dis_mb, olay_dongusu_p99_ms, olay_dongusu_kullanim
import fs from 'node:fs';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

// Düzgün kapatma (Windows'ta çocuk sürece SIGINT gönderilemez): bu dosya oluşunca süreç normal çıkışla biter,
// böylece --cpu-prof profili diske yazılır.
const durdur = process.env.YUK_DURDUR_DOSYASI;
if (durdur) setInterval(() => { if (fs.existsSync(durdur)) process.exit(0); }, 300).unref();

const dosya = process.env.YUK_OLCUM_DOSYASI;
if (dosya) {
  const aralik = Number(process.env.YUK_OLCUM_ARALIK_MS) || 5000;
  const mb = b => Math.round(b / 1048576 * 10) / 10;
  const gecikme = monitorEventLoopDelay({ resolution: 10 });
  gecikme.enable();
  let sonElu = performance.eventLoopUtilization();
  const t0 = Date.now();
  fs.writeFileSync(dosya, 'saniye,rss_mb,heap_kullanilan_mb,heap_toplam_mb,dis_mb,olay_dongusu_p99_ms,olay_dongusu_kullanim\n');
  setInterval(() => {
    if (typeof globalThis.gc === 'function') globalThis.gc();   // sızıntıyı görmek için ölçümden önce çöp topla
    const m = process.memoryUsage();
    const elu = performance.eventLoopUtilization(sonElu);
    sonElu = performance.eventLoopUtilization();
    fs.appendFileSync(dosya, [Math.round((Date.now() - t0) / 1000), mb(m.rss), mb(m.heapUsed), mb(m.heapTotal), mb(m.external), Math.round(gecikme.percentile(99) / 1e4) / 100, Math.round(elu.utilization * 100) / 100].join(',') + '\n');
    gecikme.reset();
  }, aralik).unref();
}
