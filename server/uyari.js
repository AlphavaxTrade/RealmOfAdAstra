// Yöneticiye uyarı e-postası (kurumsal A7.8). Aynı konu (anahtar) saatte en çok BİR kez gider: bozuk bir iş dakikada bir hata verse de
// gelen kutusu dolmaz. Başarısız gönderimde de sınır işler (SMTP düşükken her dakika yeniden denenmez). Asla fırlatmaz.
import { maskele } from './log.js';

export function createUyari({ mailer, cfg, log = console, clock = () => Date.now(), aralikMs = 3600000 }) {
  const son = new Map();   // anahtar → son deneme zamanı

  async function bildir(anahtar, konu, ayrinti = '') {
    if (!mailer || !cfg.adminEmail) return 'kapali';
    const simdi = clock();
    if (simdi - (son.get(anahtar) ?? -Infinity) < aralikMs) return 'sinirli';
    son.set(anahtar, simdi);
    try {
      const govde = maskele(String(ayrinti)).slice(0, 2000);
      await mailer.send({ to: cfg.adminEmail, subject: `Realm of AdAstra — uyarı: ${konu}`, text: `${konu}\n\n${govde}\n\nBu uyarı aynı konu için saatte en çok bir kez gönderilir. Ayrıntı için sunucu günlüğüne bakın.` });
      return 'gonderildi';
    } catch (err) {
      log.error('Uyarı e-postası gönderilemedi', { konu, hata: err });
      return 'hata';
    }
  }

  return { bildir };
}
