// Telegram bildirimi: server/telegram.js ve ayar doğrulaması (18 Ekim 2026). Ağa çıkılmaz: sahte fetch.
import assert from 'node:assert/strict';
import { createTelegram, MESAJ_EN_COK } from '../server/telegram.js';
import { loadConfig, dogrula } from '../server/config.js';

const ok = ad => console.log(`✅ ${ad}`);
const TOKEN = '123456:' + 'Abc_dEf-Gh'.repeat(4);
const cfg = { telegramToken: TOKEN, telegramSohbet: '987654321' };
const gunluk = () => { const s = []; return { s, log() {}, warn: (...a) => s.push(a.join(' ')), error: (...a) => s.push(a.join(' ')) }; };
const yanit = (govde, durum = 200) => ({ ok: durum >= 200 && durum < 300, status: durum, json: async () => govde });

// 1) ayar yoksa kapalı: ağa çıkılmaz, hata da yok
{
  for (const c of [{}, { telegramToken: TOKEN }, { telegramSohbet: '1' }, { telegramToken: '', telegramSohbet: '' }]) {
    let cagri = 0;
    const t = createTelegram({ cfg: c, log: gunluk(), fetchFn: async () => { cagri++; return yanit({ ok: true }); } });
    assert.equal(t.enabled, false);
    assert.deepEqual(await t.send('merhaba'), { ok: false, atlandi: true });
    assert.equal(cagri, 0);
  }
  ok('anahtar ya da sohbet numarası eksikse bildirim kapalı: ağa çıkılmaz, hata çıkmaz');
}

// 2) doğru çağrı: adres, gövde (düz metin, biçim kipi yok), kırpma
{
  let gelen;
  const t = createTelegram({ cfg, log: gunluk(), fetchFn: async (url, o) => { gelen = { url, o }; return yanit({ ok: true, result: {} }); } });
  assert.equal(t.enabled, true);
  assert.deepEqual(await t.send('📮 RB-1001 *kalın* <b>x</b> _a_'), { ok: true });
  assert.equal(gelen.url, `https://api.telegram.org/bot${TOKEN}/sendMessage`);
  assert.equal(gelen.o.method, 'POST');
  const g = JSON.parse(gelen.o.body);
  assert.equal(g.chat_id, '987654321'); assert.equal(g.text, '📮 RB-1001 *kalın* <b>x</b> _a_'); assert.equal(g.disable_web_page_preview, true);
  assert.ok(!('parse_mode' in g), 'biçim kipi yok: oyuncunun yazdığı işaretler yorumlanmaz');
  await t.send('x'.repeat(MESAJ_EN_COK + 500));
  assert.equal(JSON.parse(gelen.o.body).text.length, MESAJ_EN_COK, 'Telegram sınırına kırpılır');
  ok('POST sendMessage doğru adres ve gövdeyle gider; düz metin; uzun mesaj kırpılır');
}

// 3) hata yolları: istisna fırlatmaz, anahtar günlüğe geçmez
{
  const g1 = gunluk();
  const r1 = await createTelegram({ cfg, log: g1, fetchFn: async () => yanit({ ok: false, description: 'Forbidden: bot was blocked by the user' }, 403) }).send('x');
  assert.deepEqual(r1, { ok: false, durum: 403 });
  assert.match(g1.s[0], /HTTP 403 — Forbidden: bot was blocked/);
  const g2 = gunluk();
  const r2 = await createTelegram({ cfg, log: g2, fetchFn: async (url) => { throw Object.assign(new Error('getaddrinfo ENOTFOUND ' + url), { code: 'ENOTFOUND' }); } }).send('x');
  assert.equal(r2.ok, false); assert.match(g2.s[0], /ENOTFOUND/);
  const g3 = gunluk();
  const r3 = await createTelegram({ cfg, log: g3, fetchFn: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bozuk'); } }) }).send('x');
  assert.equal(r3.ok, false);
  const g4 = gunluk();
  const r4 = await createTelegram({ cfg, log: g4, zamanAsimiMs: 30, fetchFn: (url, o) => new Promise((_, red) => o.signal.addEventListener('abort', () => red(Object.assign(new Error('abort'), { name: 'AbortError' })))) }).send('x');
  assert.equal(r4.ok, false); assert.match(g4.s[0], /zaman aşımı/);
  for (const g of [g1, g2, g3, g4]) assert.ok(!g.s.join('\n').includes(TOKEN) && !g.s.join('\n').includes('Abc_dEf'), 'bot anahtarı günlükte geçmez');
  ok('HTTP hatası, ağ hatası, bozuk yanıt ve zaman aşımı istisna fırlatmaz; bot anahtarı hiçbir günlük satırında yok');
}

// 4) ayar: okunur, gizli dosyadan da verilebilir; üretimde biçim doğrulanır
{
  const c = loadConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: ' 42 ' });
  assert.equal(c.telegramToken, TOKEN); assert.equal(c.telegramSohbet, '42');
  assert.equal(loadConfig({}).telegramToken, '');
  assert.throws(() => loadConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_BOT_TOKEN_FILE: '/yok/dosya' }), /birlikte tanımlı/);
  const uretim = { NODE_ENV: 'production' };
  const sorun = (ek) => dogrula({ ...loadConfig({ ...uretim, ...ek }) }, { ...uretim, ...ek });
  assert.ok(sorun({ TELEGRAM_BOT_TOKEN: 'sacma', TELEGRAM_CHAT_ID: '42' }).hatalar.some(h => /TELEGRAM_BOT_TOKEN biçimi/.test(h)));
  assert.ok(sorun({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: 'abc def' }).hatalar.some(h => /TELEGRAM_CHAT_ID geçersiz/.test(h)));
  assert.ok(!sorun({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: '-1001234567890' }).hatalar.some(h => /TELEGRAM/.test(h)), 'grup/kanal numarası (eksi ile) geçerli');
  assert.ok(!sorun({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: '@kanalim_adi' }).hatalar.some(h => /TELEGRAM/.test(h)));
  assert.ok(sorun({ TELEGRAM_BOT_TOKEN: TOKEN }).uyarilar.some(u => /ikisi birlikte/.test(u)), 'biri eksikse uyarı');
  assert.ok(!sorun({}).uyarilar.some(u => /Telegram/.test(u)), 'hiçbiri yoksa uyarı yok (bildirim isteğe bağlı)');
  ok('ayar: okunur, <AD>_FILE ile çakışma reddedilir; üretimde biçim doğrulanır, biri eksikse uyarı');
}

console.log('\n4/4 telegram testi geçti');
