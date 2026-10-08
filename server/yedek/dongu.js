// Yedek döngüsü (kurumsal A9.5): compose "yedek" servisi ve `node server/yedek/dongu.js` için. Her YEDEK_ARALIK_DK dakikada bir yedek alır.
// Bir tur hata verse bile döngü sürer (disk geçici dolu, kopyalama komutu düştü...): hata günlüğe + durum dosyasına yazılır, /metrics ve alarm görür.
// systemd kullananlar bunun yerine deploy/realm-yedek.timer ile `server/yedek/cli/yedekle.js` çalıştırır (aynı kod, aynı sonuç).
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.js';
import { createLogger } from '../log.js';
import { olumculKur } from '../olumcul.js';
import { yedekAl } from './yedekle.js';

export const yedekTuru = (cfg, log) => yedekAl({ dbFile: cfg.dbFile, klasor: cfg.yedek.klasor, anahtar: cfg.yedek.anahtar, sonrasiKomut: cfg.yedek.sonrasiKomut, log });

// tur ve bekle dışarıdan verilebilir (test); durdur() çağrılınca mevcut tur biter, döngü çıkar
export function donguCalistir({ cfg, log, tur = yedekTuru, bekle = ms => new Promise(r => setTimeout(r, ms)) }) {
  let dur = false;
  const bitti = (async () => {
    while (!dur) {
      try { await tur(cfg, log); } catch (err) { log.error('Yedek turu başarısız (sonraki turda yeniden denenecek)', { hata: err }); }
      if (dur) break;
      await bekle(cfg.yedek.aralikDk * 60000);
    }
  })();
  return { durdur: () => { dur = true; return bitti; }, bitti };
}

// Doğrudan çalıştırıldığında (import edildiğinde değil)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const log = createLogger({ seviye: process.env.LOG_LEVEL, bicim: process.env.LOG_FORMAT });
  olumculKur({ log });
  let cfg;
  try { cfg = loadConfig(); } catch (err) { log.error('⛔ ' + err.message); process.exit(1); }
  if (!cfg.yedek.klasor) { log.error('⛔ YEDEK_KLASORU tanımlı değil: yedek döngüsü başlatılamaz'); process.exit(1); }
  log.info('Yedek döngüsü başladı', { klasor: cfg.yedek.klasor, aralikDk: cfg.yedek.aralikDk, sifreli: !!cfg.yedek.anahtar, kopyalamaKomutu: !!cfg.yedek.sonrasiKomut });
  const d = donguCalistir({ cfg, log });
  const kapat = ad => async () => { log.info('Yedek döngüsü kapanıyor', { neden: ad }); await d.durdur(); process.exit(0); };
  process.on('SIGTERM', kapat('SIGTERM'));
  process.on('SIGINT', kapat('SIGINT'));
}
