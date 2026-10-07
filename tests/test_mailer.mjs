// server/mailer.js: SMTP yokken günlüğe + kayıt (deneme düzeni); SMTP varsa gerçekten gönderir.
// Gönderim, bu dosyanın içindeki küçük sahte SMTP sunucusuyla uçtan uca denenir (internete çıkılmaz).
import assert from 'node:assert/strict';
import net from 'node:net';
import { openDb } from '../server/db.js';
import { createMailer } from '../server/mailer.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

// Çok basit sahte SMTP sunucusu: gelen iletileri toplar
function sahteSmtp() {
  const alinan = [];
  const server = net.createServer(sock => {
    let veri = false, govde = '', zarf = { to: [] };
    sock.write('220 sahte.smtp ESMTP\r\n');
    let tampon = '';
    sock.on('data', d => {
      tampon += d.toString('utf8');
      let i;
      while ((i = tampon.indexOf('\r\n')) >= 0) {
        const satir = tampon.slice(0, i); tampon = tampon.slice(i + 2);
        if (veri) {
          if (satir === '.') { veri = false; alinan.push({ ...zarf, govde }); govde = ''; zarf = { to: [] }; sock.write('250 OK kuyruga alindi\r\n'); }
          else govde += (satir.startsWith('..') ? satir.slice(1) : satir) + '\n';
          continue;
        }
        const k = satir.toUpperCase();
        if (k.startsWith('EHLO') || k.startsWith('HELO')) sock.write('250-sahte.smtp\r\n250 8BITMIME\r\n');
        else if (k.startsWith('MAIL FROM')) { zarf.from = satir.slice(10); sock.write('250 OK\r\n'); }
        else if (k.startsWith('RCPT TO')) { zarf.to.push(satir.slice(8)); sock.write('250 OK\r\n'); }
        else if (k === 'DATA') { veri = true; sock.write('354 Devam\r\n'); }
        else if (k === 'QUIT') { sock.write('221 Gule gule\r\n'); sock.end(); }
        else sock.write('250 OK\r\n');
      }
    });
    sock.on('error', () => { /* istemci bağlantıyı kesti: test için önemsiz */ });
  });
  return new Promise(res => server.listen(0, '127.0.0.1', () => res({ server, alinan, port: server.address().port })));
}

const sessiz = { log() {}, warn() {}, error() {} };

// 1) SMTP yok: deneme düzeni, son 50 e-posta kayıtta, günlüğe yazılır
{
  const db = openDb(':memory:');
  const satirlar = [];
  const m = createMailer({ db, cfg: { smtpUrl: '', mailFrom: 'x@y' }, log: { log: s => satirlar.push(s) } });
  assert.equal(m.isDev, true);
  assert.deepEqual(await m.send({ to: 'a@b.c', subject: 'Merhaba', text: 'Gövde' }), { dev: true });
  const kutu = db.kvJson('dev:outbox', []);
  assert.equal(kutu.length, 1);
  assert.equal(kutu[0].to, 'a@b.c');
  assert.ok(satirlar[0].includes('Merhaba'), 'günlüğe yazıldı');
  for (let i = 0; i < 60; i++) await m.send({ to: 'a@b.c', subject: 'S' + i, text: 't' });
  assert.equal(db.kvJson('dev:outbox', []).length, 50, 'kayıtta en çok 50 e-posta');
  assert.equal(db.kvJson('dev:outbox', [])[0].subject, 'S59', 'en yeni başta');
  db.close();
  ok('SMTP yokken e-posta günlüğe ve kayda yazılır (en çok 50)');
}

// 2) SMTP var: gerçekten gönderilir (sahte sunucu alır)
{
  const { server, alinan, port } = await sahteSmtp();
  try {
    const db = openDb(':memory:');
    const m = createMailer({ db, cfg: { smtpUrl: `smtp://127.0.0.1:${port}`, mailFrom: 'Realm <no-reply@realm.test>' }, log: sessiz });
    assert.equal(m.isDev, false);
    // Not: e-posta gövdesi "quoted-printable" kodlanır ("=" → "=3D", uzun satır bölünür); bu yüzden kısa, "="siz metin
    const r = await m.send({ to: 'oyuncu@ornek.com', subject: 'Doğrulama bağlantın', text: 'Merhaba oyuncu. Baglanti: https://realm.test/dogrula/abc' });
    assert.deepEqual(r, { sent: true });
    assert.equal(alinan.length, 1, 'sunucu iletiyi aldı');
    assert.ok(alinan[0].to[0].includes('oyuncu@ornek.com'));
    assert.ok(alinan[0].from.includes('no-reply@realm.test'));
    assert.ok(alinan[0].govde.includes('https://realm.test/dogrula/abc'), 'gövde iletildi');
    assert.equal(db.kvJson('dev:outbox', null), null, 'gerçek gönderimde deneme kutusuna yazılmaz');
    db.close();
    ok('SMTP varken e-posta gerçekten gönderilir (sahte sunucuda alındı)');
  } finally { server.close(); }
}

// 3) SMTP ulaşılamıyorsa hata fırlatır (çağıran yakalayıp loglar, sessizce yutulmaz)
{
  const db = openDb(':memory:');
  const m = createMailer({ db, cfg: { smtpUrl: 'smtp://127.0.0.1:1', mailFrom: 'x@y' }, log: sessiz });
  await assert.rejects(() => m.send({ to: 'a@b.c', subject: 's', text: 't' }), 'bağlanamayınca hata verir');
  db.close();
  ok('SMTP ulaşılamazsa gönderim hata verir');
}

console.log(`\n${passed}/3 e-posta testi geçti`);
