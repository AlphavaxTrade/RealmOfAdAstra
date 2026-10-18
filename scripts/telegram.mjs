// Telegram bildirimi için iki küçük yardımcı (18 Ekim 2026). Bot anahtarı ORTAMDAN okunur ve hiçbir yere yazdırılmaz.
//   TELEGRAM_BOT_TOKEN=<anahtar> node scripts/telegram.mjs bul     botuna yazılmış son mesajlardan sohbet numarasını (TELEGRAM_CHAT_ID) bulur
//   TELEGRAM_BOT_TOKEN=<anahtar> TELEGRAM_CHAT_ID=<numara> node scripts/telegram.mjs dene     o sohbete deneme mesajı gönderir
// (anahtar yerine TELEGRAM_BOT_TOKEN_FILE=<dosya yolu> da verilebilir). Önce Telegram'da BotFather'dan bir bot aç, sonra o bota BİR MESAJ YAZ.
import fs from 'node:fs';
import { createTelegram } from '../server/telegram.js';

const env = process.env;
let token = (env.TELEGRAM_BOT_TOKEN || '').trim();
if (!token && env.TELEGRAM_BOT_TOKEN_FILE) token = fs.readFileSync(env.TELEGRAM_BOT_TOKEN_FILE, 'utf8').trim();
const komut = process.argv[2];
if (!token || !['bul', 'dene'].includes(komut)) {
  console.error('Kullanım: TELEGRAM_BOT_TOKEN=<anahtar> node scripts/telegram.mjs bul | dene   (dene için TELEGRAM_CHAT_ID de gerekir)');
  process.exit(2);
}

if (komut === 'bul') {
  const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  const j = r ? await r.json().catch(() => null) : null;
  if (!j || !j.ok) { console.error(`Telegram yanıt vermedi ya da anahtar yanlış (${r ? 'HTTP ' + r.status : 'ağ hatası'}).`); process.exit(1); }
  const sohbetler = new Map();
  for (const u of j.result || []) {
    const m = u.message || u.edited_message || u.channel_post || (u.my_chat_member && u.my_chat_member.chat ? { chat: u.my_chat_member.chat } : null);
    if (m && m.chat) sohbetler.set(m.chat.id, m.chat);
  }
  if (!sohbetler.size) { console.log('Hiç mesaj görünmüyor. Telegram\'da botuna (adını BotFather söylemişti) bir mesaj yaz, sonra bunu tekrar çalıştır.'); process.exit(0); }
  console.log('Botuna yazan sohbetler (TELEGRAM_CHAT_ID olarak "numara" sütununu kullan):');
  for (const [id, c] of sohbetler) console.log(`  numara: ${id}   tür: ${c.type}   ad: ${[c.first_name, c.last_name].filter(Boolean).join(' ') || c.title || '-'}${c.username ? '   @' + c.username : ''}`);
} else {
  const t = createTelegram({ cfg: { telegramToken: token, telegramSohbet: (env.TELEGRAM_CHAT_ID || '').trim() }, log: { log() {}, warn: (...a) => console.error(...a), error: (...a) => console.error(...a) } });
  if (!t.enabled) { console.error('TELEGRAM_CHAT_ID boş: önce "bul" komutuyla numarayı bul.'); process.exit(2); }
  const s = await t.send('✅ Realm of AdAstra: Telegram bildirimi çalışıyor (deneme mesajı).');
  console.log(s.ok ? 'Gönderildi: Telegram uygulamana bak.' : 'Gönderilemedi (nedeni yukarıda).');
  process.exit(s.ok ? 0 : 1);
}
