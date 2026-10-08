// server/log.js: yapılandırılmış (JSON) günlük (kurumsal A7.1): seviyeler, console uyumlu çağrı biçimleri, Error serileştirme,
// GİZLİ BİLGİ MASKELEME (anahtar adları, Bearer, bağlantı adresindeki şifre, e-posta), döngüsel nesne ve uzun metin güvenliği.
import assert from 'node:assert/strict';
import { createLogger, maskele, istekBaglami } from '../server/log.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const yakala = (ayar = {}) => { const satirlar = []; const l = createLogger({ cikti: s => satirlar.push(s), zaman: () => '2026-10-08T12:00:00.000Z', ...ayar }); return { l, satirlar, json: () => satirlar.map(s => JSON.parse(s)) }; };

// 1) Her satır tek JSON; seviye süzgeci; log() = info; child alanları
{
  const { l, satirlar, json } = yakala({ seviye: 'info' });
  l.debug('görünmez'); l.info('merhaba', { oyuncu: 'acc:1' }); l.warn('uyarı'); l.error('hata'); l.log('eski stil');
  assert.equal(satirlar.length, 4, 'debug süzüldü');
  assert.ok(satirlar.every(s => !s.includes('\n')), 'her kayıt tek satır');
  assert.deepEqual(json().map(x => x.sev), ['info', 'warn', 'error', 'info']);
  assert.deepEqual(json()[0], { t: '2026-10-08T12:00:00.000Z', sev: 'info', ileti: 'merhaba', oyuncu: 'acc:1' });
  const c = l.child({ bilesen: 'odemeler' });
  c.info('x', { n: 1 });
  assert.deepEqual(json().at(-1), { t: '2026-10-08T12:00:00.000Z', sev: 'info', ileti: 'x', bilesen: 'odemeler', n: 1 });
  const d = yakala({ seviye: 'debug' }); d.l.debug('görünür'); assert.equal(d.satirlar.length, 1);
  const e = yakala({ seviye: 'error' }); e.l.warn('x'); e.l.info('y'); e.l.error('z'); assert.equal(e.satirlar.length, 1);
  ok('JSON satırı, seviye süzgeci, log()=info, child alanları');
}

// 2) console uyumlu çağrılar: log.warn('Metin:', err.message), log.error('Metin', err), log.log(`çok\nsatır`)
{
  const { l, json } = yakala();
  l.warn('Kapı:', 'şu oldu', 42);
  l.error('İşlem hatası', 'acc:7', new TypeError('bozuk'));
  l.log('📧 [deneme] a@b.c — konu\nsatır 2');
  const k = json();
  assert.equal(k[0].ileti, 'Kapı: şu oldu 42');
  assert.equal(k[1].ileti, 'İşlem hatası acc:7');
  assert.equal(k[1].hata.ad, 'TypeError');
  assert.equal(k[1].hata.mesaj, 'bozuk');
  assert.ok(k[1].hata.yigin.includes('TypeError'), 'yığın kaydı var');
  assert.ok(k[1].hata.yigin.split('\n').length <= 6, 'yığın kısaltılır');
  assert.ok(k[2].ileti.includes('\n'), 'çok satırlı ileti JSON içinde kaçışlı korunur');
  ok('console uyumlu çağrı biçimleri ve Error serileştirme');
}

// 3) GİZLİ BİLGİ asla yazılmaz
{
  const { l, satirlar } = yakala();
  l.info('giriş', { token: 'abc123', sifre: 'p4ss', password: 'x', authorization: 'Bearer zzz', apiKey: 'kdeger', privateKey: '0x' + 'ab'.repeat(32), cookie: 'ax=1', imza: '0xsig', raw_tx: '0xraw', kasaMasterKey: 'mdeger', ic: { derin: { secret: 'sdeger' } }, dizi: [{ token: 'tdeger' }] });
  const s = satirlar.at(-1);
  for (const gizli of ['abc123', 'p4ss', 'zzz', 'kdeger', 'ab'.repeat(32), 'ax=1', '0xsig', '0xraw', 'mdeger', 'sdeger', 'tdeger']) assert.ok(!s.includes(gizli), 'sızdı: ' + gizli + ' → ' + s);
  assert.ok(s.includes('[GİZLİ]'));
  l.warn('İstek Authorization: Bearer abcdef0123456789abcdef0123456789 ile geldi');
  assert.ok(!satirlar.at(-1).includes('abcdef0123456789abcdef0123456789'), 'ileti içindeki Bearer maskelenir');
  l.error('SMTP hatası smtps://kullanici:cokgizli@posta.ornek.com:465 bağlanamadı');
  assert.ok(!satirlar.at(-1).includes('cokgizli') && satirlar.at(-1).includes('posta.ornek.com'), 'adresteki şifre maskelenir, sunucu adı kalır');
  l.info('hesap ayse.yilmaz@ornek.com giriş yaptı', { email: 'bora@ornek.com' });
  const son = satirlar.at(-1);
  assert.ok(!son.includes('ayse.yilmaz') && !son.includes('bora@'), 'e-posta maskelenir: ' + son);
  assert.ok(son.includes('@ornek.com'), 'alan adı kalır (hata ayıklama için)');
  assert.equal(maskele('tx 0x' + '12'.repeat(32) + ' tamam'), 'tx 0x' + '12'.repeat(32) + ' tamam', 'işlem özeti (tx hash) gizli DEĞİL, ayıklamak için kalır');
  ok('anahtar adları, Bearer, bağlantı adresindeki şifre ve e-posta maskelenir; tx özeti kalır');
}

// 4) Güvenlik: döngüsel nesne, çok uzun metin, çok derin nesne, çökmez
{
  const { l, satirlar } = yakala();
  const d = { ad: 'x' }; d.kendisi = d;
  l.info('döngü', d);
  assert.ok(satirlar.at(-1).includes('[DÖNGÜ]'), 'döngü kesilir');
  l.info('uzun ' + 'a'.repeat(50000));
  assert.ok(satirlar.at(-1).length < 6000, 'uzun ileti kırpılır');
  let derin = {}; const kok = derin; for (let i = 0; i < 50; i++) { derin.i = {}; derin = derin.i; }
  l.info('derin', kok);
  assert.ok(satirlar.at(-1).includes('[ÇOK DERİN]'));
  l.info('bigint ve özel', { b: 10n, f: () => 1, u: undefined, s: Symbol('x'), d: new Date(0) });
  const son = JSON.parse(satirlar.at(-1));
  assert.equal(son.b, '10'); assert.equal(son.d, '1970-01-01T00:00:00.000Z');
  assert.doesNotThrow(() => l.info(null, undefined, NaN));
  ok('döngüsel/çok derin/çok uzun girdi ve özel türler günlüğü çökertmez');
}

// 4b) Geliştirici biçimi ve varsayılan çıktı yönü
{
  const { l, satirlar } = yakala({ bicim: 'duz' });
  l.warn('dikkat', { n: 2, token: 'gizli1' });
  assert.equal(satirlar.at(-1), '12:00:00 WARN  dikkat {"n":2,"token":"[GİZLİ]"}');
  const yon = []; const k = createLogger({ cikti: (s, sev) => yon.push(sev) });
  k.info('a'); k.warn('b'); k.error('c');
  assert.deepEqual(yon, ['info', 'warn', 'error'], 'çıktı işlevi seviyeyi de alır (warn ve error stderre yönlenir)');
  assert.equal(createLogger({ seviye: 'ERROR', cikti: (s, sev) => yon.push(sev) }).warn('x'), undefined);
  assert.equal(yon.length, 3, 'büyük harfli LOG_LEVEL=ERROR da kabul edilir');
  ok('duz biçim, seviye bilgisi çıktı işlevine iletilir, LOG_LEVEL büyük/küçük harf');
}

// 4c) İstek bağlamı: istek içinde yazılan her satıra kimlik kendiliğinden eklenir, dışında eklenmez
{
  const { l, json } = yakala();
  await istekBaglami.run({ istek: 'abc123def456' }, async () => { l.info('içeride'); await new Promise(r => setTimeout(r, 5)); l.warn('zaman uyumsuz sonrası da'); });
  l.info('dışarıda');
  const k = json();
  assert.equal(k[0].istek, 'abc123def456'); assert.equal(k[1].istek, 'abc123def456'); assert.equal(k[2].istek, undefined);
  ok('istek kimliği isteğin bütün günlük satırlarına (await sonrası dahil) kendiliğinden eklenir');
}

// 5) Çıktı yazma hatası uygulamayı düşürmez
{
  const l = createLogger({ cikti: () => { throw new Error('disk dolu'); } });
  assert.doesNotThrow(() => l.error('x'));
  ok('günlük yazılamasa bile uygulama düşmez');
}

console.log(`\n${passed}/7 günlük testi geçti`);
