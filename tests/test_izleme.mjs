// server/izleme.js: isteğe bağlı hata izleme (APM/Sentry) kancası (kurumsal A7.9): DSN yoksa tamamen kapalı; paket yüklü değilse
// uyarıp sürer (sunucu düşmez); varsa hatalar kimlik bilgisi olmadan iletilir.
import assert from 'node:assert/strict';
import { izlemeKur } from '../server/izleme.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const log = () => { const k = []; return { k, info: (...a) => k.push(['info', a.join(' ')]), warn: (...a) => k.push(['warn', a.join(' ')]), error: (...a) => k.push(['error', a.join(' ')]), log() {} }; };

// 1) DSN yoksa kapalı: hiçbir şey yüklenmez
{
  let yuklendi = false;
  const l = log();
  const z = await izlemeKur({ dsn: '', log: l, yukle: async () => { yuklendi = true; } });
  assert.equal(z.acik, false); assert.equal(yuklendi, false);
  assert.doesNotThrow(() => z.yakala(new Error('x'), { istek: 'abc' }));
  ok('DSN yoksa kapalı, hiçbir paket yüklenmez, yakala() zararsız');
}

// 2) DSN var ama paket yok: uyarı, sunucu düşmez
{
  const l = log();
  const z = await izlemeKur({ dsn: 'https://anahtar@o1.ingest.sentry.io/1', log: l, yukle: async () => { throw Object.assign(new Error("Cannot find package '@sentry/node'"), { code: 'ERR_MODULE_NOT_FOUND' }); } });
  assert.equal(z.acik, false);
  assert.ok(l.k.some(([s, m]) => s === 'warn' && m.includes('@sentry/node')), 'paket yüklü değil uyarısı: ' + JSON.stringify(l.k));
  assert.ok(!l.k.some(([, m]) => m.includes('anahtar@')), 'DSN günlüğe yazılmaz');
  ok('paket yoksa uyarılır, sunucu düşmez, DSN günlüğe sızmaz');
}

// 3) Paket var: başlatılır (kişisel veri gönderilmez), hatalar iletilir, ileten kanca patlarsa sessizce günlüğe
{
  const olaylar = [];
  const sdk = { init: o => olaylar.push(['init', o]), captureException: (e, b) => olaylar.push(['yakala', e.message, b]), flush: async () => true };
  const l = log();
  const z = await izlemeKur({ dsn: 'https://a@b.ingest.sentry.io/1', surum: '2.0.0', ortam: 'production', log: l, yukle: async () => sdk });
  assert.equal(z.acik, true);
  const init = olaylar[0][1];
  assert.equal(init.dsn, 'https://a@b.ingest.sentry.io/1'); assert.equal(init.sendDefaultPii, false); assert.equal(init.release, '2.0.0'); assert.equal(init.environment, 'production');
  z.yakala(new Error('patladı'), { istek: 'abc123def456' });
  assert.deepEqual(olaylar[1], ['yakala', 'patladı', { extra: { istek: 'abc123def456' } }]);
  await z.bosalt(1000);
  const bozuk = await izlemeKur({ dsn: 'x', log: l, yukle: async () => ({ init() {}, captureException() { throw new Error('ağ yok'); }, flush: async () => true }) });
  assert.doesNotThrow(() => bozuk.yakala(new Error('y')));
  ok('paket varsa başlatılır (kişisel veri kapalı), hatalar iletilir; ileten kanca patlarsa uygulama etkilenmez');
}

console.log(`\n${passed}/3 izleme testi geçti`);
