// "Sorun bildir" uçtan uca: gerçek HTTP sunucusu üzerinden (18 Ekim 2026)
// Oyuncu gönderir → panelde listelenir/okunur → sahibi cevaplar → oyuncu cevabı görür; yetkiler, gövde sınırı, hız sınırı.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mailer.js';
import { createTelegram } from '../server/telegram.js';
import { createGeriBildirim } from '../server/geri-bildirim.js';
import { tokenOzeti } from '../server/oturum.js';

const ok = ad => console.log(`✅ ${ad}`);
const sessiz = { log() {}, warn() {}, error() {} };
const ADMIN = 'yonetici-test-anahtari-uzun-1234567890';
const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: ADMIN, adminEmail: 'sahip@ornek.com', serveDist: false, rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000 };
const db = openDb(':memory:');
const engine = await createEngine(db, { testMode: true });
let now = Date.UTC(2026, 9, 18, 12);
const clock = () => now;
const mailer = createMailer({ db, cfg, log: sessiz });
const world = createWorld({ db, engine, chain: null, accounts: null, mailer, cfg, clock, log: sessiz });
// Telegram: gerçek createTelegram, ağ yerine sahte fetch (giden istekler `giden` listesinde)
const giden = [];
const telegram = createTelegram({ cfg: { telegramToken: '123456:' + 'Abc_dEf-Gh'.repeat(4), telegramSohbet: '987654321' }, log: sessiz,
  fetchFn: async (url, o) => { giden.push({ url, govde: JSON.parse(o.body) }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; } });
const geriBildirim = createGeriBildirim({ db, engine, telegram, mailer, cfg, clock, log: sessiz });
const app = createApp({ db, engine, world, accounts: null, geriBildirim, telegram, chain: null, cfg: { ...cfg, telegramToken: 'x', telegramSohbet: '1' }, clock, log: sessiz });
const server = app.server().listen(0);
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

// iki oyuncu + oturum anahtarları (oturum tablosunda yalnız SHA-256 özeti durur)
const oyuncu = ad => {
  const adres = 'oyuncu-' + ad, token = crypto.randomBytes(24).toString('hex');
  db.q.playerAdd.run(adres, now, now);
  db.q.sessionAdd.run(tokenOzeti(token), adres, now + 86400000);
  return { adres, token };
};
const ali = oyuncu('ali'), veli = oyuncu('veli');
const call = async (method, p, body, token) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const JPG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString('base64');
const govde = (ek = {}) => ({ konu: 'hata', mesaj: 'Zindanda canavar yenilince ödül gelmedi.', ekler: [PNG, JPG], baglam: { sayfa: '#/zindan', surum: '2.0.0', cihaz: 'test', ekran: '390x844' }, ...ek });

try {
  // 1) yetkiler: oyuncu ucu giriş ister, yönetici uçları yalnız yönetici şifresiyle açılır
  {
    assert.equal((await call('POST', '/api/feedback', govde())).status, 401, 'girişsiz gönderilemez');
    assert.equal((await call('GET', '/api/feedback/mine')).status, 401);
    for (const [m, p, b] of [['GET', '/api/admin/feedback'], ['GET', '/api/admin/feedback/detail?no=RB-1001'], ['POST', '/api/admin/feedback/update', { no: 'RB-1001', durum: 'cozuldu' }]]) {
      assert.equal((await call(m, p, b)).status, 401, `${p} şifresiz`);
      assert.equal((await call(m, p, b, ali.token)).status, 401, `${p} oyuncu anahtarıyla`);
    }
    ok('yetkiler: oyuncu uçları giriş ister; yönetici uçları oyuncu anahtarıyla da açılmaz');
  }

  // 2) gönder -> bilet numarası, sahibine e-posta
  let no;
  {
    const r = await call('POST', '/api/feedback', govde(), ali.token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.ok, r.body.bilet, r.body.no], [true, 'RB-1001', 1001]);
    no = r.body.bilet;
    await new Promise(x => setImmediate(x));
    assert.equal(giden.length, 1, 'sahibine tek Telegram mesajı');
    assert.match(giden[0].url, /^https:\/\/api\.telegram\.org\/bot123456:.*\/sendMessage$/);
    assert.equal(giden[0].govde.chat_id, '987654321');
    assert.match(giden[0].govde.text, /RB-1001/); assert.match(giden[0].govde.text, /2 ekran görüntüsü/);
    assert.ok(!giden[0].govde.text.includes('data:image'), 'görüntü verisi Telegram mesajına girmez');
    assert.equal(db.kvJson('dev:outbox', []).filter(m => m.to === 'sahip@ornek.com').length, 0, 'ADMIN_EMAIL tanımlı olsa da e-posta gitmez');
    const r2 = await call('POST', '/api/feedback', govde({ konu: 'oneri', mesaj: 'Haritaya arama kutusu gelsin.', ekler: [] }), veli.token);
    assert.equal(r2.body.bilet, 'RB-1002');
    ok('gönderim: RB-1001 / RB-1002 numarası, sahibine Telegram mesajı (e-posta yok)');
  }

  // 2b) yönetici paneli: Telegram durumu ve deneme mesajı
  {
    assert.equal((await call('POST', '/api/admin/telegram/dene')).status, 401, 'şifresiz');
    assert.equal((await call('POST', '/api/admin/telegram/dene', undefined, ali.token)).status, 401, 'oyuncu anahtarıyla');
    assert.equal((await call('GET', '/api/admin/status', undefined, ADMIN)).body.telegramAcik, true);
    const once = giden.length;
    const r = await call('POST', '/api/admin/telegram/dene', undefined, ADMIN);
    assert.equal(r.status, 200); assert.equal(giden.length, once + 1);
    assert.match(giden[giden.length - 1].govde.text, /Telegram bildirimi çalışıyor/);
    ok('panel: telegramAcik durumu, deneme mesajı yalnız yönetici şifresiyle gider');
  }

  // 3) oyuncu yalnız kendi biletlerini görür
  {
    const a = await call('GET', '/api/feedback/mine', undefined, ali.token);
    assert.equal(a.status, 200); assert.deepEqual(a.body.list.map(x => x.bilet), ['RB-1001']);
    assert.ok(!JSON.stringify(a.body).includes('Haritaya arama') && !JSON.stringify(a.body).includes('data:image'));
    assert.deepEqual((await call('GET', '/api/feedback/mine', undefined, veli.token)).body.list.map(x => x.bilet), ['RB-1002']);
    ok('oyuncu yalnız kendi biletini görür; başkasının metni ve görüntü verisi listede yok');
  }

  // 4) yönetici: liste, ayrıntı (görüntüler + bağlam + oyuncu özeti), cevap
  {
    const l = await call('GET', '/api/admin/feedback?durum=yeni', undefined, ADMIN);
    assert.equal(l.status, 200); assert.equal(l.body.toplam, 2); assert.deepEqual(l.body.sayi, { yeni: 2, inceleniyor: 0, cozuldu: 0 });
    assert.deepEqual(l.body.rows.map(r => r.bilet), ['RB-1002', 'RB-1001']);
    assert.deepEqual((await call('GET', '/api/admin/feedback?ara=RB-1001', undefined, ADMIN)).body.rows.map(r => r.bilet), ['RB-1001']);
    const d = await call('GET', '/api/admin/feedback/detail?no=' + encodeURIComponent(no), undefined, ADMIN);
    assert.equal(d.status, 200);
    assert.deepEqual(d.body.bilet.ekler, [PNG, JPG], 'görüntüler birebir');
    assert.equal(d.body.bilet.baglam.sayfa, '#/zindan'); assert.equal(d.body.bilet.oyuncu, ali.adres);
    assert.ok('oyuncuOzeti' in d.body.bilet);
    const g = await call('POST', '/api/admin/feedback/update', { no, durum: 'cozuldu', cevap: 'Düzelttik, teşekkürler.' }, ADMIN);
    assert.equal(g.status, 200); assert.equal(g.body.bilet.durum, 'cozuldu');
    const a = await call('GET', '/api/feedback/mine', undefined, ali.token);
    assert.equal(a.body.list[0].durum, 'cozuldu'); assert.equal(a.body.list[0].cevap, 'Düzelttik, teşekkürler.');
    assert.equal((await call('GET', '/api/admin/feedback/detail?no=RB-9999', undefined, ADMIN)).status, 404);
    assert.equal((await call('GET', '/api/admin/feedback/detail?no=sacma', undefined, ADMIN)).status, 400);
    assert.equal((await call('POST', '/api/admin/feedback/update', { no, durum: 'sacma' }, ADMIN)).status, 400);
    ok('yönetici: liste + arama, ayrıntıda görüntüler birebir, durum + cevap; oyuncu cevabı kendi listesinde görür; hatalı girişler 400/404');
  }

  // 5) doğrulama hataları HTTP\'de 400
  {
    assert.equal((await call('POST', '/api/feedback', govde({ konu: 'x' }), veli.token)).status, 400);
    assert.equal((await call('POST', '/api/feedback', govde({ ekler: [PNG, PNG, PNG, PNG, PNG] }), veli.token)).status, 400);
    const sahte = 'data:image/png;base64,' + Buffer.from('<html>').toString('base64');
    const r = await call('POST', '/api/feedback', govde({ ekler: [sahte] }), veli.token);
    assert.equal(r.status, 400); assert.match(r.body.error, /resim değil/);
    ok('geçersiz konu / 5 görüntü / sahte resim 400 ile reddedilir');
  }

  // 6) gövde sınırı: geri bildirim ucu 1,5 MB'a kadar alır; başka uçların 64 KB sınırı değişmez
  {
    const buyuk = JSON.stringify({ x: 'a'.repeat(100 * 1024) });
    const diger = await fetch(base + '/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ali.token }, body: buyuk }).then(r => r.status, () => 'kesildi');
    assert.ok(diger === 400 || diger === 'kesildi', '100 KB gövde diğer uçta reddedilir: ' + diger);
    const dev = await fetch(base + '/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + veli.token }, body: JSON.stringify({ konu: 'hata', mesaj: 'x'.repeat(2 * 1024 * 1024) }) }).then(r => r.status, () => 'kesildi');
    assert.ok(dev === 400 || dev === 'kesildi', '2 MB gövde geri bildirim ucunda da reddedilir: ' + dev);
    // 4 görüntü x ~290 KB (sınıra yakın) kabul edilir
    const buyukResim = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(214_000, 1)]).toString('base64');
    assert.ok(buyukResim.length < 300_000);
    now += 11 * 60e3;
    const r = await call('POST', '/api/feedback', govde({ ekler: [buyukResim, buyukResim, buyukResim, buyukResim] }), veli.token);
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
    ok('gövde sınırı: geri bildirim ucu 4 büyük görüntüyü alır; 2 MB ve diğer uçlarda 100 KB reddedilir');
  }

  // 7) hız sınırı: oyuncu 10 dakikada 5 bildirim
  {
    const yeni = oyuncu('hizli');
    for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/feedback', govde({ ekler: [] }), yeni.token)).status, 200);
    const r = await call('POST', '/api/feedback', govde({ ekler: [] }), yeni.token);
    assert.equal(r.status, 429); assert.match(r.body.error, /çok bildirim/);
    ok('hız sınırı: 6. bildirim 10 dakika içinde 429');
  }
} finally {
  server.close();
  db.close && db.close();
}
console.log('\n8/8 geri bildirim uç testi geçti');
