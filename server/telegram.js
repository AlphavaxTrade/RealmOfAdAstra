// Realm of AdAstra sunucusu — Telegram bildirimi (18 Ekim 2026): sahibine kısa mesaj (şimdilik: yeni "Sorun bildir" bileti).
// Telegram Bot API'ye tek çağrı: POST https://api.telegram.org/bot<TOKEN>/sendMessage. Ek kütüphane yok (Node'un kendi fetch'i).
// Ayar: TELEGRAM_BOT_TOKEN (gizli; BotFather'dan) ve TELEGRAM_CHAT_ID (sahibin sohbet numarası; botla bir kez konuşunca
// `node scripts/telegram.mjs bul` gösterir). İkisinden biri boşsa bildirim KAPALI: hiçbir şey gönderilmez, hata da çıkmaz.
// Kurallar: gönderim hiçbir zaman istisna fırlatmaz ve bekletmez (bildirim gitmedi diye oyuncunun bileti kaybolmaz); anahtar
// hiçbir günlük satırında geçmez (adresin içindedir: hata mesajına adres konmaz, yalnız durum kodu ve Telegram'ın açıklaması).
export const MESAJ_EN_COK = 4000;   // Telegram sınırı 4096 karakter

export function createTelegram({ cfg, log = console, fetchFn = (...a) => fetch(...a), zamanAsimiMs = 8000 }) {
  const token = (cfg && cfg.telegramToken) || '';
  const sohbet = (cfg && cfg.telegramSohbet) || '';
  const enabled = !!(token && sohbet);

  // metin düz yazıdır (biçim kipi yok): oyuncunun yazdığı işaretler Telegram'da biçim olarak yorumlanmaz
  async function send(metin) {
    if (!enabled) return { ok: false, atlandi: true };
    const kes = new AbortController();
    const sayac = setTimeout(() => kes.abort(), zamanAsimiMs);
    try {
      const r = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: kes.signal,
        body: JSON.stringify({ chat_id: sohbet, text: String(metin).slice(0, MESAJ_EN_COK), disable_web_page_preview: true })
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ok) {
        log.warn(`Telegram bildirimi gitmedi: HTTP ${r.status}${j && j.description ? ' — ' + String(j.description).slice(0, 120) : ''}`);
        return { ok: false, durum: r.status };
      }
      return { ok: true };
    } catch (e) {
      log.warn(`Telegram bildirimi gitmedi: ${e && e.name === 'AbortError' ? 'zaman aşımı' : (e && e.code) || (e && e.name) || 'hata'}`);
      return { ok: false };
    } finally { clearTimeout(sayac); }
  }

  return { enabled, send };
}
