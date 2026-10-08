// Parola özeti (kurumsal A2.12): güçlü ve sunucuyu bloklamayan scrypt; eski özetler girişte kendiliğinden yenilenir.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parolaOzetle, parolaDogrula, GUCLU, HAFIF } from '../server/parola.js';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts } from '../server/accounts.js';

process.env.PAROLA_HAFIF = '0';   // run_all.mjs diğer testler için '1' verir; bu dosya güçlü ayarı sınar (5. bölüm hız için kendisi '1' yapar)
let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const quiet = { log() {}, warn() {}, error() {} };

// Eski biçim (A2 öncesi): scrypt$tuz$özet, N=16384 r=8 p=1
const eskiOzet = pw => { const salt = crypto.randomBytes(16); return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`; };

// 1) Güçlü ayarlar OWASP asgarisinin altına düşmemeli; yeni biçimde ayarlar özetin içinde saklanır
{
  assert.ok(GUCLU.N >= 65536 && GUCLU.p >= 2 && GUCLU.r >= 8, 'GUCLU ayarları OWASP eşdeğerinden zayıf olmamalı (N≥2^16, r≥8, p≥2)');
  const h = await parolaOzetle('Gizli-Parola-1', GUCLU);
  const [ad, N, r, p, tuz, ozet] = h.split('$');
  assert.deepEqual([ad, Number(N), Number(r), Number(p)], ['scrypt2', GUCLU.N, GUCLU.r, GUCLU.p]);
  assert.equal(tuz.length, 32);
  assert.equal(ozet.length, 128);
  assert.notEqual(h, await parolaOzetle('Gizli-Parola-1', GUCLU), 'her özet farklı tuz kullanır');
  const d = await parolaDogrula('Gizli-Parola-1', h);
  assert.equal(d.ok, true);
  assert.equal(d.yenile, false, 'güçlü ve güncel özet yenilenmez');
  assert.equal((await parolaDogrula('yanlis-parola', h)).ok, false);
  ok('yeni özet biçimi scrypt2$N$r$p$tuz$özet; doğru/yanlış parola');
}

// 2) Eski biçim doğrulanır ve "yenile" işareti verir; bozuk kayıtlar çökertmez
{
  const eski = eskiOzet('Eski-Parola-9');
  const d = await parolaDogrula('Eski-Parola-9', eski);
  assert.deepEqual([d.ok, d.yenile], [true, true]);
  assert.deepEqual(Object.values(await parolaDogrula('baska', eski)).slice(0, 1), [false]);
  for (const bozuk of ['', 'x', 'scrypt$', 'scrypt$aa', 'scrypt2$1$2$3', 'scrypt2$65536$8$2$zz$zz', null, undefined, 'bcrypt$a$b', 'scrypt2$99999999999$8$2$aa$bb']) {
    const s = await parolaDogrula('x', bozuk);
    assert.equal(s.ok, false, 'bozuk kayıt reddedilir: ' + String(bozuk));
  }
  ok('eski biçim doğrulanır ve yenilenmeye işaretlenir; bozuk kayıt reddedilir');
}

// 3) Ayarı hedefin altında kalan yeni biçim de yenilenir
{
  const zayif = await parolaOzetle('Parola-3', { N: 4096, r: 8, p: 1 });
  const d = await parolaDogrula('Parola-3', zayif);
  assert.deepEqual([d.ok, d.yenile], [true, true]);
  ok('hedefin altındaki ayarlar yenilenmeye işaretlenir');
}

// 4) Olay döngüsü bloklanmaz: 4 güçlü özet paralel hesaplanırken zamanlayıcı düzenli çalışmalı
{
  let enBuyukBosluk = 0, son = Date.now();
  const tur = setInterval(() => { const s = Date.now(); enBuyukBosluk = Math.max(enBuyukBosluk, s - son); son = s; }, 10);
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 4 }, (_, i) => parolaOzetle('Parola-' + i, GUCLU)));
  clearInterval(tur);
  assert.ok(Date.now() - t0 > 30, 'hesaplama gerçekten ağır olmalı (aksi halde ayar zayıf): ' + (Date.now() - t0) + ' ms');
  assert.ok(enBuyukBosluk < 150, 'olay döngüsü bloklandı: en büyük boşluk ' + enBuyukBosluk + ' ms');
  ok(`4 paralel güçlü özet sırasında olay döngüsü akıyor (en büyük boşluk ${enBuyukBosluk} ms)`);
}

// 5) Uçtan uca: eski özetli hesap girişte yenilenir; yanlış parola yenilemez; yeni kayıt güncel biçimde
{
  process.env.PAROLA_HAFIF = '1';   // bu bölümde hız için hafif ayar (biçim ve akış aynı)
  const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: 'yonetici-test-anahtari-uzun-1234567890', serveDist: false, rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000, testMode: true };
  const db = openDb(':memory:');
  const engine = await createEngine(db, { testMode: true });
  const mailer = createMailer({ db, cfg, log: quiet });
  const accounts = createAccounts({ db, cfg, mailer, verifyMessage: () => '0x0' });
  const world = createWorld({ db, engine, chain: null, accounts, mailer, cfg, log: quiet });
  const app = createApp({ db, engine, world, accounts, chain: null, cfg, log: quiet });
  const server = app.server().listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (p, body) => { const res = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: res.status, body: await res.json() }; };
  const lastLink = kind => { const m = db.kvJson('dev:outbox', [])[0]; for (const x of (m ? m.text : '').matchAll(/[?&](\w+)=([a-f0-9]+)/g)) if (x[1] === kind) return x[2]; return null; };
  const hashOf = e => db.raw.prepare('SELECT pass_hash FROM accounts WHERE email = ?').get(e).pass_hash;
  try {
    await call('/api/account/register', { email: 'yeni@ornek.com', password: 'Yeni-Parola-123' });
    assert.ok(hashOf('yeni@ornek.com').startsWith('scrypt2$'), 'yeni kayıt güncel biçimde');
    assert.equal((await call('/api/account/verify', { token: lastLink('verify') })).status, 200);
    // Eski özetli hesap: kayıt olup özeti eski biçime çevir
    await call('/api/account/register', { email: 'eski@ornek.com', password: 'Eski-Parola-123' });
    await call('/api/account/verify', { token: lastLink('verify') });
    db.raw.prepare('UPDATE accounts SET pass_hash = ? WHERE email = ?').run(eskiOzet('Eski-Parola-123'), 'eski@ornek.com');
    assert.ok(hashOf('eski@ornek.com').startsWith('scrypt$'));
    assert.equal((await call('/api/account/login', { email: 'eski@ornek.com', password: 'yanlis-parola' })).status, 401);
    assert.ok(hashOf('eski@ornek.com').startsWith('scrypt$'), 'yanlış parola özeti yenilemez');
    const g = await call('/api/account/login', { email: 'eski@ornek.com', password: 'Eski-Parola-123' });
    assert.equal(g.status, 200, JSON.stringify(g.body));
    assert.ok(g.body.token);
    assert.ok(hashOf('eski@ornek.com').startsWith('scrypt2$'), 'başarılı girişte özet güncel biçime yenilendi');
    assert.equal((await call('/api/account/login', { email: 'eski@ornek.com', password: 'Eski-Parola-123' })).status, 200, 'yenilenen özetle tekrar giriş çalışır');
    ok('eski özetli hesap girişte yenilenir; yanlış parola dokunmaz; yeni kayıt güncel biçimde');
  } finally { server.close(); }
}

console.log(`\n${passed}/5 parola testi geçti (hafif ayar: N=${HAFIF.N})`);
