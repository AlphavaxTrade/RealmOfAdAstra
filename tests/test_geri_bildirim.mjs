// "Sorun bildir" (geri bildirim / bilet) sistemi: server/geri-bildirim.js (18 Ekim 2026)
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createGeriBildirim, biletCoz, biletAdi, EK_EN_COK_ADET, MESAJ_EN_COK } from '../server/geri-bildirim.js';

const ok = ad => console.log(`✅ ${ad}`);
const sessiz = { log() {}, warn() {}, error() {} };
let now = Date.UTC(2026, 9, 18, 12);
const clock = () => now;

// geçerli küçük görüntüler (yalnız başlık baytları önemli)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const JPG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString('base64');
const WEBP = 'data:image/webp;base64,' + Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 ')]).toString('base64');

const kur = (ekstra = {}) => {
  const db = openDb(':memory:');
  const postalar = [];
  const mailer = { send: async m => { postalar.push(m); return { dev: true }; } };
  const engine = { readPlayer: () => ({ level: 7, village: { villagers: 31 }, soldierUnits: [{ level: 3 }, { level: 5 }, {}], warehouseLevel: 2, adAstraBalance: 12.3456, lockedAda: 80, botActiveUntil: 0 }) };
  const gb = createGeriBildirim({ db, engine, mailer, cfg: { adminEmail: 'sahip@ornek.com' }, clock, log: sessiz, ...ekstra });
  return { db, gb, postalar };
};
const gecerli = (ekle = {}) => ({ konu: 'hata', mesaj: 'Zindanda canavar yenilince ödül gelmedi.', ekler: [], baglam: { sayfa: '#/zindan', surum: '2.0.0', cihaz: 'test', ekran: '390x844' }, ...ekle });

// 1) doğrulama: konu, mesaj uzunluğu, görüntü sayısı/boyutu/türü/başlığı
{
  const { gb } = kur();
  assert.match(gb.temizle(null).hata, /Geçersiz/);
  assert.match(gb.temizle(gecerli({ konu: 'sacma' })).hata, /konu/i);
  assert.match(gb.temizle(gecerli({ mesaj: 'a' })).hata, /anlat/);
  assert.match(gb.temizle(gecerli({ mesaj: 'x'.repeat(MESAJ_EN_COK + 1) })).hata, /en çok/);
  const t = gb.temizle(gecerli({ ekler: [PNG, JPG, WEBP, PNG] }));
  assert.equal(t.hata, undefined);
  assert.equal(t.ekler.length, EK_EN_COK_ADET);
  assert.match(gb.temizle(gecerli({ ekler: [PNG, PNG, PNG, PNG, PNG] })).hata, /En çok 4/);
  assert.match(gb.temizle(gecerli({ ekler: 'bu bir liste degil' })).hata, /okunamadı/);
  assert.match(gb.temizle(gecerli({ ekler: ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='] })).hata, /JPG, PNG/);
  assert.match(gb.temizle(gecerli({ ekler: ['javascript:alert(1)'] })).hata, /JPG, PNG/);
  // türü PNG diyen ama içi PNG olmayan dosya (sahte başlık) reddedilir
  const sahte = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');
  assert.match(gb.temizle(gecerli({ ekler: [sahte] })).hata, /geçerli bir resim değil/);
  assert.match(gb.temizle(gecerli({ ekler: ['data:image/png;base64,' + 'A'.repeat(310_000)] })).hata, /çok büyük/);
  // denetim karakterleri temizlenir, bağlam kırpılır
  const t2 = gb.temizle(gecerli({ mesaj: 'merhaba\u0000 dunya\u0007 test', baglam: { sayfa: 'x'.repeat(500), cihaz: 5 } }));
  assert.equal(t2.mesaj, 'merhaba dunya test');
  assert.equal(t2.baglam.sayfa.length, 200);
  ok('doğrulama: konu, mesaj, en çok 4 görüntü, tür + gerçek başlık kontrolü, boyut, temizlik');
}

// 2) bilet numarası: 1001'den başlar, ardışık, okunuşu esnek
{
  const { gb } = kur();
  const a = gb.kaydet('p-1', gb.temizle(gecerli({ ekler: [PNG, JPG] })));
  const b = gb.kaydet('p-2', gb.temizle(gecerli({ konu: 'oneri' })));
  assert.equal(a.no, 1001); assert.equal(a.bilet, 'RB-1001'); assert.equal(b.no, 1002);
  assert.equal(biletAdi(1003), 'RB-1003'); assert.equal(biletAdi(0), '');
  for (const v of ['RB-1001', 'rb-1001', 'RB 1001', '#1001', '1001', ' 1001 ']) assert.equal(biletCoz(v), 1001, v);
  for (const v of ['GB-1001', 'RB-', 'abc', '', null, '10.01', '-5']) assert.equal(biletCoz(v), null, String(v));
  ok('bilet numarası 1001\'den ardışık; RB-1001 / #1001 / 1001 aynı bileti gösterir, GB- (trade) numarası kabul edilmez');
}

// 3) kayıt + ayrıntı: metin, bağlam, oyuncu özeti, görüntüler birebir
{
  const { gb } = kur();
  const t = gb.temizle(gecerli({ ekler: [PNG, JPG, WEBP] }));
  const { no } = gb.kaydet('oyuncu-x', t);
  const r = gb.ayrinti('RB-' + no);
  assert.equal(r.mesaj, t.mesaj); assert.equal(r.konu, 'hata'); assert.equal(r.durum, 'yeni'); assert.equal(r.oyuncu, 'oyuncu-x');
  assert.deepEqual(r.ekler, [PNG, JPG, WEBP], 'görüntüler sırayla ve birebir');
  assert.equal(r.ekSayisi, 3);
  assert.equal(r.baglam.sayfa, '#/zindan'); assert.equal(r.baglam.ekran, '390x844');
  assert.equal(r.oyuncuOzeti.seviye, 7); assert.equal(r.oyuncuOzeti.koylu, 31); assert.equal(r.oyuncuOzeti.asker, 3);
  assert.deepEqual(r.oyuncuOzeti.askerSeviyeleri, [3, 5, 1]);
  assert.equal(r.oyuncuOzeti.siloSeviyesi, 2); assert.equal(r.oyuncuOzeti.serbestAstra, 12.35); assert.equal(r.oyuncuOzeti.kilitliAstra, 80); assert.equal(r.oyuncuOzeti.botAcik, false);
  assert.equal(gb.ayrinti(no, { ekleri: false }).ekler.length, 0);
  assert.equal(gb.ekOku(no, 1), JPG); assert.equal(gb.ekOku(no, 9), null);
  assert.throws(() => gb.ayrinti('RB-9999'), e => e.kod === 404);
  assert.throws(() => gb.ayrinti('sacma'), e => e.kod === 400);
  ok('kayıt: metin, bağlam, oyuncu özeti ve görüntüler bilet numarasından birebir okunuyor');
}

// 4) oyuncu yalnız kendi biletlerini görür (başkasınınkini ve görüntüleri görmez)
{
  const { gb } = kur();
  gb.kaydet('ali', gb.temizle(gecerli({ ekler: [PNG] })));
  gb.kaydet('veli', gb.temizle(gecerli({ mesaj: 'veli yazdi bunu' })));
  gb.kaydet('ali', gb.temizle(gecerli({ konu: 'soru', mesaj: 'ikinci soru burada' })));
  const ali = gb.benimkiler('ali');
  assert.deepEqual(ali.map(x => x.no), [1003, 1001], 'en yeni önce, yalnız kendisininkiler');
  assert.ok(!JSON.stringify(ali).includes('veli yazdi'));
  assert.ok(!('ekler' in ali[0]) && !('oyuncu' in ali[0]) && !JSON.stringify(ali).includes('data:image'), 'liste görüntü ve başkasının kimliğini taşımaz');
  assert.deepEqual(gb.benimkiler('kimse'), []);
  ok('oyuncu yalnız kendi biletlerini görür; listede görüntü verisi yok');
}

// 5) yönetici listesi: durum süzgeci, sayılar, arama (oyuncu, metin, bilet no), LIKE özel karakterleri
{
  const { gb } = kur();
  gb.kaydet('ali', gb.temizle(gecerli({ mesaj: 'zindan odulu gelmedi %100 sorun' })));
  gb.kaydet('veli', gb.temizle(gecerli({ konu: 'oneri', mesaj: 'harita biraz daha buyuk olsun' })));
  gb.kaydet('ayse', gb.temizle(gecerli({ konu: 'odeme', mesaj: 'cekim bekliyor' })));
  gb.guncelle(1002, { durum: 'inceleniyor' });
  gb.guncelle(1003, { durum: 'cozuldu' });
  let l = gb.liste();
  assert.equal(l.toplam, 3); assert.deepEqual(l.sayi, { yeni: 1, inceleniyor: 1, cozuldu: 1 });
  assert.deepEqual(l.rows.map(r => r.no), [1003, 1002, 1001]);
  assert.deepEqual(gb.liste({ durum: 'inceleniyor' }).rows.map(r => r.no), [1002]);
  assert.deepEqual(gb.liste({ ara: 'veli' }).rows.map(r => r.no), [1002], 'oyuncuya göre');
  assert.deepEqual(gb.liste({ ara: 'harita' }).rows.map(r => r.no), [1002], 'metne göre');
  assert.deepEqual(gb.liste({ ara: 'RB-1003' }).rows.map(r => r.no), [1003], 'bilet numarasına göre');
  assert.deepEqual(gb.liste({ ara: '%' }).rows.map(r => r.no), [1001], '% joker değil, düz harf');
  assert.deepEqual(gb.liste({ ara: '_' }).rows, [], '_ joker değil');
  assert.deepEqual(gb.liste({ durum: 'sacma' }).rows.length, 3, 'bilinmeyen durum süzgeci yok sayılır');
  ok('panel listesi: durum süzgeci, sayılar, arama (oyuncu / metin / bilet no) ve joker karakterler güvenli');
}

// 6) sahibinin cevabı ve durumu
{
  const { gb } = kur();
  const { no } = gb.kaydet('ali', gb.temizle(gecerli()));
  now += 60_000;
  const g = gb.guncelle(no, { durum: 'inceleniyor', cevap: '  Bakıyoruz, teşekkürler.  ' });
  assert.equal(g.durum, 'inceleniyor'); assert.equal(g.cevap, 'Bakıyoruz, teşekkürler.'); assert.equal(g.cevapAt, now);
  const onceki = g.cevapAt;
  now += 60_000;
  const g2 = gb.guncelle(no, { durum: 'cozuldu' });
  assert.equal(g2.cevap, 'Bakıyoruz, teşekkürler.', 'yalnız durum değişince cevap kalır'); assert.equal(g2.cevapAt, onceki); assert.equal(g2.durum, 'cozuldu');
  assert.equal(gb.benimkiler('ali')[0].cevap, 'Bakıyoruz, teşekkürler.');
  assert.throws(() => gb.guncelle(no, { durum: 'sacma' }), e => e.kod === 400);
  assert.throws(() => gb.guncelle(no, { cevap: 'x'.repeat(2001) }), e => e.kod === 400);
  assert.throws(() => gb.guncelle(4242, { durum: 'cozuldu' }), e => e.kod === 404);
  ok('sahibin cevabı ve durumu kaydedilir; yalnız durum değişince cevap ve zamanı bozulmaz; geçersiz giriş reddedilir');
}

// 7) hız sınırı: oyuncu 10 dakikada 5, günde 20; adres 10 dakikada 15
{
  const { gb } = kur();
  for (let i = 0; i < 5; i++) { assert.equal(gb.cokHizli('ali'), false); gb.kaydet('ali', gb.temizle(gecerli())); }
  assert.equal(gb.cokHizli('ali'), true, '6. bildirim 10 dakika içinde reddedilir');
  assert.equal(gb.cokHizli('veli'), false, 'başkası etkilenmez');
  now += 11 * 60e3;
  assert.equal(gb.cokHizli('ali'), false, '10 dakika sonra yeniden serbest');
  const g2 = kur().gb;
  for (let i = 0; i < 15; i++) assert.equal(g2.cokHizli('u' + i, '1.2.3.4'), false);
  assert.equal(g2.cokHizli('u99', '1.2.3.4'), true, 'aynı adresten 16. bildirim');
  // günlük 20
  const { gb: g3 } = kur();
  for (let i = 0; i < 20; i++) { g3.kaydet('mehmet', g3.temizle(gecerli())); now += 3 * 60e3; }
  assert.equal(g3.cokHizli('mehmet'), true, 'günde 20');
  now += 25 * 3600e3;
  assert.equal(g3.cokHizli('mehmet'), false, 'ertesi gün serbest');
  ok('hız sınırı: oyuncu 10 dakikada 5 / günde 20, adres 10 dakikada 15; süre dolunca açılır');
}

// 8) sahibine e-posta: ADMIN_EMAIL varsa gider, yoksa sessiz; e-posta hatası bildirimi bozmaz
{
  const { gb, postalar } = kur();
  gb.kaydet('ali', gb.temizle(gecerli({ ekler: [PNG] })));
  await new Promise(r => setImmediate(r));
  assert.equal(postalar.length, 1);
  assert.equal(postalar[0].to, 'sahip@ornek.com'); assert.match(postalar[0].subject, /RB-1001/); assert.match(postalar[0].text, /1 ekran görüntüsü/);
  const { gb: yok, postalar: p2 } = kur({ cfg: {} });
  yok.kaydet('ali', yok.temizle(gecerli()));
  assert.equal(p2.length, 0, 'ADMIN_EMAIL yoksa e-posta yok');
  const bozuk = kur({ mailer: { send: async () => { throw new Error('smtp yok'); } } }).gb;
  assert.equal(bozuk.kaydet('ali', bozuk.temizle(gecerli())).no, 1001, 'e-posta hatası bildirimi engellemez');
  await new Promise(r => setImmediate(r));
  ok('sahibine e-posta (ADMIN_EMAIL varsa); e-posta hatası bildirimi bozmaz');
}

console.log('\n8/8 geri bildirim testi geçti');
