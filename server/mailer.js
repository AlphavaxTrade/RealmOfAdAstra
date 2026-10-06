// Realm of AdAstra sunucusu — e-posta gönderimi
// SMTP_URL tanımlıysa gerçek e-posta gönderilir (ör. smtps://kullanici:sifre@smtp.saglayici.com:465).
// Tanımlı değilse e-postalar sunucu günlüğüne yazılır ve son 50'si kayıtta tutulur (deneme düzeni).
import nodemailer from 'nodemailer';

export function createMailer({ db, cfg, log = console }) {
  const transport = cfg.smtpUrl ? nodemailer.createTransport(cfg.smtpUrl) : null;

  async function send({ to, subject, text }) {
    const mail = { to, subject, text, at: Date.now() };
    if (!transport) {
      const box = db.kvJson('dev:outbox', []);
      box.unshift(mail);
      db.kvSetJson('dev:outbox', box.slice(0, 50));
      log.log(`📧 [deneme e-postası] ${to} — ${subject}\n${text}\n`);
      return { dev: true };
    }
    await transport.sendMail({ from: cfg.mailFrom, to, subject, text });
    return { sent: true };
  }

  return { send, isDev: !transport };
}
