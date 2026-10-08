// server/olumcul.js: yakalanmamış hata / reddedilen söz (kurumsal A7.4): ölümcül kayıt (hata ayrıntısıyla), izleme kancasına iletme,
// kısa bekleyip çıkış kodu 1 (systemd/Docker yeniden başlatır), tekrarlayan hatada çift çıkış yok.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { olumculKur } from '../server/olumcul.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const bekle = ms => new Promise(r => setTimeout(r, ms));
const kur = ek => {
  const proses = new EventEmitter(); const kayit = []; const cikislar = []; const yakalanan = [];
  const log = { error: (...a) => kayit.push(a), info() {}, warn() {}, log() {} };
  olumculKur({ proses, log, izleme: { yakala: (e, b) => yakalanan.push([e, b]), bosalt: async () => {} }, cikis: k => cikislar.push(k), bekleMs: 30, ...ek });
  return { proses, kayit, cikislar, yakalanan };
};

// 1) uncaughtException: kaydedilir, izlemeye gider, kısa süre sonra 1 ile çıkılır
{
  const { proses, kayit, cikislar, yakalanan } = kur();
  const hata = new Error('beklenmeyen');
  proses.emit('uncaughtException', hata, 'uncaughtException');
  assert.equal(kayit.length, 1); assert.ok(String(kayit[0][0]).includes('ÖLÜMCÜL')); assert.ok(kayit[0].some(x => x && x.hata === hata || x === hata), 'hata nesnesi günlüğe iletildi');
  assert.equal(yakalanan.length, 1);
  assert.deepEqual(cikislar, [], 'hemen çıkılmaz: günlüğün/izlemenin yazılmasına kısa süre tanınır');
  await bekle(120);
  assert.deepEqual(cikislar, [1]);
  ok('uncaughtException: ölümcül kayıt + izleme + gecikmeli çıkış 1');
}

// 2) unhandledRejection: Error olmayan neden de güvenle işlenir; birden çok olay tek çıkış
{
  const { proses, kayit, cikislar } = kur();
  proses.emit('unhandledRejection', 'sadece metin');
  proses.emit('unhandledRejection', new Error('ikinci'));
  proses.emit('uncaughtException', new Error('üçüncü'));
  assert.equal(kayit.length, 1, 'ilk ölümcül hata yazılır; sonrakiler çıkışı tekrarlamaz');
  await bekle(120);
  assert.deepEqual(cikislar, [1], 'tek çıkış');
  ok('reddedilen söz (metin de olur) işlenir; art arda hatalar tek çıkışla sonuçlanır');
}

// 3) Kanca hataları çıkışı engellemez
{
  const { proses, cikislar } = kur({ izleme: { yakala() { throw new Error('izleme çöktü'); }, bosalt: async () => { throw new Error('x'); } } });
  proses.emit('uncaughtException', new Error('a'));
  await bekle(120);
  assert.deepEqual(cikislar, [1], 'izleme patlasa da süreç çıkar');
  ok('izleme kancası patlasa da süreç yine de çıkar');
}

console.log(`\n${passed}/3 ölümcül hata testi geçti`);
