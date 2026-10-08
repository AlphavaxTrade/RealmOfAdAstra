// server/uyari.js: yöneticiye uyarı e-postası (kurumsal A7.8): aynı konu saatte en çok bir kez, kapalıysa sessiz, hata uygulamayı düşürmez,
// gövdeden gizli bilgi maskelenir.
import assert from 'node:assert/strict';
import { createUyari } from '../server/uyari.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const kayit = { info() {}, warn() {}, error() {}, log() {} };
const yapay = (ek = {}) => { const giden = []; let t = 1_000_000; const mailer = { send: async m => { if (ek.hata) throw new Error('smtp koptu: smtps://k:gizlisifre@posta.ornek.com'); giden.push(m); } }; // gizli-tara: izin
  const u = createUyari({ mailer, cfg: { adminEmail: ek.adres ?? 'yonetici@ornek.com' }, log: ek.log || kayit, clock: () => t });
  return { u, giden, ilerle: ms => { t += ms; } }; };

// 1) Aynı konu saatte bir; farklı konu bağımsız; bir saat sonra yeniden
{
  const { u, giden, ilerle } = yapay();
  assert.equal(await u.bildir('zamanlayici', 'Dünya zamanlayıcısı hata veriyor', 'Hata: x'), 'gonderildi');
  assert.equal(await u.bildir('zamanlayici', 'Dünya zamanlayıcısı hata veriyor', 'Hata: x'), 'sinirli');
  assert.equal(await u.bildir('odeme', 'Ödeme kuyruğu birikti', 'y'), 'gonderildi');
  assert.equal(giden.length, 2);
  ilerle(59 * 60000);
  assert.equal(await u.bildir('zamanlayici', 'k', 'x'), 'sinirli', '59 dakika sonra hâlâ sınırlı');
  ilerle(2 * 60000);
  assert.equal(await u.bildir('zamanlayici', 'k', 'x'), 'gonderildi', '1 saat geçince yeniden');
  assert.equal(giden[0].to, 'yonetici@ornek.com');
  assert.match(giden[0].subject, /^Realm of AdAstra — uyarı: /);
  ok('aynı konu saatte en çok bir e-posta; farklı konu bağımsız; süre dolunca yeniden');
}

// 2) Adres yoksa sessiz ve zararsız; gönderim hatası düşürmez, günlüğe yazılır, gizli bilgi sızmaz
{
  const bos = yapay({ adres: '' });
  assert.equal(await bos.u.bildir('a', 'k', 'x'), 'kapali');
  assert.equal(bos.giden.length, 0);
  const satirlar = [];
  const h = yapay({ hata: true, log: { ...kayit, error: (...a) => satirlar.push(a.map(String).join(' ')) } });
  assert.equal(await h.u.bildir('a', 'k', 'x'), 'hata');
  assert.equal(await h.u.bildir('a', 'k', 'x'), 'sinirli', 'başarısız denemede de sınır işler (SMTP düşükken dakikada bir denenmez)');
  assert.ok(satirlar.length >= 1);
  ok('adres yoksa kapalı; gönderim hatası uygulamayı düşürmez ve tekrar tekrar denenmez');
}

// 3) Gövde: gizli bilgi maskelenir, çok uzun metin kırpılır
{
  const { u, giden } = yapay();
  await u.bildir('a', 'konu', 'Bağlantı smtps://kul:cokgizli@posta.ornek.com koptu. Authorization: Bearer abcdef0123456789abcdef0123456789 ' + 'x'.repeat(10000)); // gizli-tara: izin
  assert.ok(!giden[0].text.includes('cokgizli') && !giden[0].text.includes('abcdef0123456789abcdef0123456789'));
  assert.ok(giden[0].text.length < 3000);
  ok('e-posta gövdesinde gizli bilgi maskelenir, uzun metin kırpılır');
}

console.log(`\n${passed}/3 uyarı testi geçti`);
