// Tek seferlik yedek (kurumsal A9.5): systemd zamanlayıcısı, cron ya da elle. Ayarlar sunucuyla aynı ortam değişkenlerinden (server/.env dahil değil:
// ortamı systemd/Docker verir). Çıkış kodu 0 = yedek alındı; 1 = alınamadı.
//   node server/yedek/cli/yedekle.js
import { loadConfig } from '../../config.js';
import { createLogger } from '../../log.js';
import { yedekTuru } from '../dongu.js';

const log = createLogger({ seviye: process.env.LOG_LEVEL, bicim: process.env.LOG_FORMAT });
let cfg;
try { cfg = loadConfig(); } catch (err) { log.error('⛔ ' + err.message); process.exit(1); }
if (!cfg.yedek.klasor) { log.error('⛔ YEDEK_KLASORU tanımlı değil'); process.exit(1); }
try {
  const s = await yedekTuru(cfg, log);
  console.log(`✅ ${s.dosya} (${(s.manifest.boyut / 1048576).toFixed(1)} MB${s.manifest.sifreli ? ', şifreli' : ''})${s.hook && !s.hook.ok ? ' — UYARI: sonrası komutu başarısız' : ''}`);
  process.exit(s.hook && !s.hook.ok ? 2 : 0);
} catch {
  process.exit(1);   // ayrıntı zaten günlükte (yedekAl yazdı)
}
