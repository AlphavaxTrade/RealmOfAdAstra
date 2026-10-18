// Denge İzleme (18 Ekim 2026): oyun çekirdeğinin ölçüm kancası → server/denge.js günlük özetler → server/denge-rapor.js rapor ve uyarılar.
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createDenge, goruntuHesapla, gunOf, TURLER } from '../server/denge.js';
import { rapor, uyarilar, ESIK } from '../server/denge-rapor.js';
import { GAME_CONFIG } from '../js/config.js';

const ok = (ad) => console.log(`✅ ${ad}`);
const sessiz = { log() {}, warn() {}, error() {} };
const satirlar = (db) => Object.fromEntries(db.raw.prepare('SELECT anahtar, SUM(adet) AS adet, SUM(toplam) AS toplam FROM denge_gunluk GROUP BY anahtar').all().map((r) => [r.anahtar, r]));

// 1) Türkiye günü: UTC+3, gece yarısı sınırı
{
  assert.equal(gunOf(Date.UTC(2026, 9, 18, 20, 59, 59)), '2026-10-18');   // 23:59:59 TR
  assert.equal(gunOf(Date.UTC(2026, 9, 18, 21, 0, 0)), '2026-10-19');     // 00:00:00 TR
  assert.equal(gunOf(Date.UTC(2026, 9, 18, 0, 0, 0)), '2026-10-18');
  ok('gün = Türkiye günü (UTC+3)');
}

// 2) Gerçek motor + kanca: işlemler sayılır; ilk temizleme tuzlu özetle; izleme oyunu bozmaz
{
  const db = openDb(':memory:');
  const E = await createEngine(db, { testMode: true });
  const denge = createDenge({ db, log: sessiz });
  E.setTelemetri((olay, veri, oyuncu) => denge.kaydet(olay, veri, oyuncu));
  const a = '0x' + 'd7'.repeat(20);
  db.q.playerAdd.run(a, Date.now(), Date.now());
  E.withPlayer(a, () => null);
  E.mutatePlayer(a, (gs) => { gs.state.adAstraBalance += 1e6; gs.state.level = 30; for (const k of GAME_CONFIG.RESOURCE_KEYS) gs.state.inventory[k] = 1e6; gs.state.inventory.fragments = 1e4; gs.state.stamina = 5000; });
  assert.equal(E.act(a, 'buySoldierUnit', []).result.success, true);
  assert.equal(E.act(a, 'buySoldierUnit', []).result.success, true);
  assert.equal(E.act(a, 'buySoldierUnit', []).result.success, false, 'hak dolu (1. kat: 2 asker)');
  E.mutatePlayer(a, (gs) => { for (const u of gs.state.soldierUnits) { u.level = 60; u.maxHp = 9000; u.hp = 9000; u.baseAtk = 900; } });
  assert.equal(E.act(a, 'craftEquipment', ['weapon']).result.success, true);
  const sav = E.act(a, 'fightDungeon', [1, [0, 1]]).result;
  assert.equal(sav.success, true);
  assert.equal(sav.outcome.victory, true, 'güçlü ordu 1. canavarı yener');
  const k = satirlar(db);
  assert.equal(k['i|asker_al'].adet, 2); assert.ok(k['i|asker_al'].toplam > 0, 'ASTRA harcaması yazıldı');
  assert.equal(k['i|asker_al|red'].adet, 1, 'reddedilen işlem sayıldı');
  assert.equal(k['i|dovme'].adet, 1); assert.ok(k['h|dovme|wood'].toplam > 0 && k['h|dovme|iron'].toplam > 0, 'yakılan hammadde yazıldı');
  assert.equal(k['z|m0|l1|giris'].adet, 1); assert.equal(k['z|m0|l1|zafer'].toplam, 1);
  assert.equal(k['z|m0|l1|asker'].toplam, 2); assert.equal(k['z|m0|l1|askerSv'].toplam, 60);
  assert.ok(k['z|m0|l1|odul'] && k['z|m0|l1|odul'].toplam >= 0);
  const ilk = db.raw.prepare('SELECT * FROM denge_ilk').all();
  assert.equal(ilk.length, 1); assert.equal(ilk[0].mod, 0); assert.equal(ilk[0].seviye, 1);
  assert.ok(!JSON.stringify(ilk).includes(a.slice(2, 12)), 'oyuncu kimliği ham yazılmaz (tuzlu özet)');
  assert.match(ilk[0].oyuncu, /^[0-9a-f]{12}$/);
  // aynı canavarı tekrar yenmek ilk temizleme sayılmaz
  E.act(a, 'fightDungeon', [1, [0, 1]]);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM denge_ilk').get().n, 1);
  assert.equal(satirlar(db)['z|m0|l1|giris'].adet, 2);
  // kanca hata verse bile oyun işlemi normal döner
  E.setTelemetri(() => { throw new Error('izleme çöktü'); });
  assert.equal(E.act(a, 'repairEquipment', ['weapon']).result.success !== undefined, true, 'izleme çökse de işlem yanıt verir');
  E.setTelemetri(null);
  E.mutatePlayer(a, (gs) => { const kap = gs.getWarehouseCapacity(); for (const k of GAME_CONFIG.RESOURCE_KEYS) gs.state.inventory[k] = kap[k]; });   // silo sınırı: envanter kapasiteye çekilir
  { const rr = E.act(a, 'craftEquipment', ['helmet']).result; assert.equal(rr.success, true, 'kanca yokken de çalışır: ' + rr.message); }
  ok('gerçek motor + kanca: işlem, ret, hammadde yakımı, savaş ve ilk temizleme sayılır; oyuncu kimliği tuzlu; izleme çökse de oyun bozulmaz');
}

// 3) Tarayıcıda (kanca yok) oyun aynen çalışır
{
  const depo = new Map();
  globalThis.localStorage = { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => { depo.set(k, String(v)); }, removeItem: (k) => { depo.delete(k); } };
  const { GameStateManager } = await import('../js/gameState.js');
  const gs = new GameStateManager();
  assert.equal(gs.telemetriKancasi, undefined);
  gs.state.adAstraBalance = 1e6;
  assert.equal(gs.buySoldierUnit().success, true);
  ok('tarayıcıda kanca yok: sarılmış işlemler aynen çalışır');
}

// 4) Dağılım görüntüsü (saf hesap) ve günde bir kez kuralı
{
  const simdi = Date.UTC(2026, 9, 18, 12);
  const durum = (o) => ({ level: 5, lastSeenAt: simdi - 3600e3, soldierUnits: [], dungeonProgress: 1, dungeonMode: 0, adAstraBalance: 10, lockedAda: 2, inventory: { wood: 100 }, ...o });
  const tam = { weapon: { level: 3 }, helmet: { level: 3 }, armor: { level: 2 }, legs: { level: 1 }, boots: { level: 1 } };
  const g = goruntuHesapla([
    durum({}),
    durum({ level: 25, soldierUnits: [{ level: 20, equipment: tam }, { level: 18, equipment: { weapon: { level: 10 } } }], dungeonProgress: 4 }),
    durum({ level: 45, lastSeenAt: simdi - 30 * 86400e3, soldierUnits: new Array(8).fill({ level: 40, equipment: tam }), dungeonProgress: 1, dungeonMode: 1, inventory: { wood: 50, iron: 20 } }),
    null, 'bozuk'
  ], simdi);
  assert.equal(g.oyuncu, 3); assert.equal(g.aktif7, 2);
  assert.deepEqual(g.seviye, { '5-9': 1, '20-29': 1, '40+': 1 });
  assert.deepEqual(g.asker, { 0: 1, 2: 1, '8-10': 1 });
  assert.equal(g.hakDolu, 1, 'yalnız 8 askerli oyuncu dolu: Zor modun başında hak 8 (2 asker/ilerleme 4: hak 3, dolu değil)');
  assert.deepEqual(g.takimEsyaSeviye, { 1: 18, 2: 9, 3: 18, 10: 1 }, 'kuşanılan eşya sayısı seviyeye göre');
  assert.equal(g.tamTakimAsker, 9);
  assert.deepEqual(g.mod, { 0: 2, 1: 1 }); assert.equal(g.zindan['m1|l1'], 1); assert.equal(g.zindan['m0|l4'], 1);
  assert.equal(g.astra.toplam, 30); assert.equal(g.astra.kilitli, 6); assert.equal(g.hammadde.wood, 250);
  assert.equal(g.ortAsker, 3.33); assert.equal(g.ortSeviye, 25);
  assert.ok(!JSON.stringify(g).includes('0x'), 'kişisel veri yok');
  const bos = goruntuHesapla([], simdi); assert.equal(bos.oyuncu, 0); assert.equal(bos.ortSeviye, 0);

  const db = openDb(':memory:');
  let say = 0;
  const denge = createDenge({ db, clock: () => simdi, log: sessiz });
  assert.ok(denge.gunlukGoruntu(() => { say++; return [durum({})]; }));
  assert.equal(denge.gunlukGoruntu(() => { say++; return [durum({})]; }), null, 'aynı gün ikinci kez tarama yapılmaz');
  assert.equal(say, 1, 'durum listesi gereksiz yere hesaplanmaz');
  assert.ok(denge.gunlukGoruntu(() => { say++; return [durum({}), durum({})]; }, { zorla: true }).oyuncu === 2, 'elle alınınca yenilenir');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM denge_goruntu').get().n, 1);
  ok('dağılım görüntüsü: seviye/asker/takım/ilerleme/mod/ASTRA; kişisel veri yok; günde bir kez, elle yenilenir');
  // sunucu bağlantısı: baglan çekirdeğin bildirimini yazar; gunlukTik oyuncuları motordan okur, hata olursa sunucuyu düşürmez
  const db2 = openDb(':memory:');
  const uyarilar = [];
  let kanca = null;
  const sahteMotor = { setTelemetri: (f) => { kanca = f; }, readPlayer: () => durum({}) };
  const d2 = createDenge({ db: db2, engine: sahteMotor, clock: () => simdi, log: { warn: (m) => uyarilar.push(m) } });
  d2.baglan();
  kanca('islem', { tur: 'dovme', ok: true, astra: 5 }, 'o1');
  assert.ok(db2.raw.prepare('SELECT COUNT(*) AS n FROM denge_gunluk').get().n >= 1, 'bildirilen işlem yazıldı');
  db2.q.playersAll = { all: () => [{ address: '0xa1' }, { address: '0xb2' }] };
  d2.gunlukTik();
  assert.equal(db2.raw.prepare('SELECT COUNT(*) AS n FROM denge_goruntu').get().n, 1, 'günlük görüntü alındı');
  const db3 = openDb(':memory:'); db3.q.playersAll = { all: () => [{ address: '0xa1' }] };
  const d3 = createDenge({ db: db3, engine: { readPlayer: () => { throw new Error('patladı'); } }, clock: () => simdi, log: { warn: (m) => uyarilar.push(m) } });
  d3.gunlukTik();
  assert.equal(uyarilar.length, 1, 'tarama hatası günlüğe uyarı olarak yazılır, fırlatılmaz');
  createDenge({ db: db3, log: sessiz }).baglan(); createDenge({ db: db3, log: sessiz }).gunlukTik();   // motor yoksa sessizce geçer
  ok('sunucu bağlantısı: baglan yazar, gunlukTik görüntü alır, hata sunucuyu düşürmez');
}

// 5) Rapor: pencereler, oranlar, medyan, hedef kıyası, ekonomi ve önceki dönem
{
  const gun = (n) => Date.UTC(2026, 9, 18 - n, 12);
  const db = openDb(':memory:');
  const t0 = gun(0);
  const denge = createDenge({ db, clock: () => t0, log: sessiz });
  const savasYaz = (g, mod, lv, kazandi, ek = {}) => { const d = createDenge({ db, clock: () => g, log: sessiz }); d.kaydet('zindan', { mod, seviye: lv, kazandi, asker: 3, askerSeviyeOrt: 10, takimOrt: 2, tur: 8, kayip: 1, odul: kazandi ? 1.8 : 0, xp: 100, parca: 0, kutu: 0, harc: 0, odullu: true, ...ek }, 'oyuncu-x'); };
  for (let i = 0; i < 30; i++) savasYaz(gun(i % 5), 0, 2, i % 10 !== 0);   // 30 savaş, %90 zafer, son 5 gün içinde
  for (let i = 0; i < 25; i++) savasYaz(gun(1), 0, 3, i < 3);                // 25 savaş, %12 zafer
  savasYaz(gun(12), 0, 2, true);                                               // önceki pencerede (hafta için: 7-13 gün önce)
  const islem = (g, tur, ada, ham = {}, basarili = true) => createDenge({ db, clock: () => g, log: sessiz }).kaydet('islem', { tur, basarili, ada, hammadde: ham, getiriAda: 0, getiri: {} });
  for (let i = 0; i < 4; i++) islem(gun(2), 'dovme', 50, { wood: 1000, iron: 500 });
  islem(gun(3), 'asker_al', 200); islem(gun(3), 'yukselt', 80, { wood: 300 });
  for (let i = 0; i < 12; i++) islem(gun(1), 'onar', 0, {}, false);
  islem(gun(10), 'dovme', 40, { wood: 100 });                                  // önceki pencere
  // ilk temizleme günleri: canavar 2 için 5 oyuncu, medyan 2 gün (hedef 1) → hedefin 2 katı
  const ilk = db.raw.prepare('INSERT INTO denge_ilk (oyuncu, mod, seviye, hesap_gunu, at) VALUES (?, ?, ?, ?, ?)');
  [1.5, 2, 2, 2.5, 3].forEach((d, i) => ilk.run('o' + i, 0, 2, d, t0));
  [0.1, 0.2, 0.3, 0.2, 0.1].forEach((d, i) => ilk.run('h' + i, 0, 4, d, t0));   // canavar 4: hedef 5 gün, medyan 0.2 → modelden çok hızlı
  denge.gunlukGoruntu(() => new Array(6).fill({ level: 10, lastSeenAt: t0 - 3600e3, soldierUnits: [{ level: 8, equipment: {} }], dungeonProgress: 1, adAstraBalance: 5, inventory: {} }));

  const r = rapor(db, { pencere: 'hafta', simdi: t0 });
  assert.equal(r.gunSayisi, 7); assert.equal(r.bitis, gunOf(t0));
  const z2 = r.zindan.find((z) => z.seviye === 2 && z.mod === 0), z3 = r.zindan.find((z) => z.seviye === 3 && z.mod === 0);
  assert.equal(z2.giris, 30, 'önceki pencerenin savaşı bu pencerede sayılmaz'); assert.equal(z2.zafer, 27); assert.equal(z2.oran, 0.9);
  assert.equal(z2.ortAsker, 3); assert.equal(z2.ortAskerSeviye, 10); assert.equal(z2.ortTakimSeviye, 2); assert.equal(z2.ortTur, 8);
  assert.equal(z3.giris, 25); assert.equal(z3.oran, 0.12);
  assert.equal(z2.ilkOyuncu, 5); assert.equal(z2.ilkMedyanGun, 2); assert.equal(z2.hedefGun, 1); assert.equal(z2.ilkHedefOrani, 2);
  assert.equal(r.zindan.find((z) => z.seviye === 4).ilkHedefOrani, 0.04, 'hedef 5 gün, medyan 0,2: hedefin altı');
  const dovme = r.islemler.find((x) => x.tur === 'dovme');
  assert.deepEqual([dovme.adet, dovme.astra, dovme.oncekiAdet, dovme.hammadde.wood, dovme.hammadde.iron], [4, 200, 1, 4000, 2000], 'önceki pencerenin dövmesi (gün 10) ayrı sayılır');
  assert.equal(r.islemler.find((x) => x.tur === 'onar').red, 12);
  assert.equal(r.ekonomi.harcanan, 480); assert.equal(r.ekonomi.zindanKazanc, 54);   // (27 + 3) zafer × 1,8
  assert.equal(r.ekonomi.yakilanHammadde.wood, 4300); assert.equal(r.ekonomi.yakilanHammaddeToplam, 6300);
  assert.equal(r.ekonomi.tahminiYakim, Math.round(480 * (Number(GAME_CONFIG.TOKEN_BURN_RATE) || 0) * 100) / 100);
  assert.equal(r.tempo.oyuncu, 6); assert.equal(r.tempo.aktif7, 6);
  const rAy = rapor(db, { pencere: 'ay', simdi: t0 });
  assert.equal(rAy.gunSayisi, 30); assert.equal(rAy.zindan.find((z) => z.seviye === 2).giris, 31, '30 günlük pencere eski savaşı da kapsar');
  assert.equal(rapor(db, { pencere: 'saçma', simdi: t0 }).gunSayisi, 7, 'bilinmeyen pencere haftaya düşer');
  assert.equal(rapor(openDb(':memory:'), { simdi: t0 }).zindan.length, 0, 'boş veritabanında rapor boş ama hatasız');
  ok('rapor: pencere ve önceki dönem ayrımı, kazanma oranı, ortalamalar, ilk temizleme medyanı ve hedef oranı, işlem, ekonomi');


}

// 6) Uyarı kuralları (saf): her kural eşikte tetiklenir, eşiğin altında tetiklenmez
{
  const z = (o) => ({ mod: 0, modAd: 'Normal', seviye: 5, ad: 'Deneme', giris: 40, zafer: 20, oran: 0.5, ortAsker: 3, ortTakimSeviye: 2, ilkOyuncu: 0, ilkMedyanGun: null, hedefGun: 7, ilkHedefOrani: null, ...o });
  const taban = { zindan: [], islemler: TURLER.map((tur) => ({ tur, adet: 5, astra: 10, red: 0, oncekiAdet: 5, hammadde: { wood: 10 } })), ekonomi: { zindanKazanc: 10, harcanan: 100, kazancHarcamaOrani: 0.1, yakilanHammaddeToplam: 100, yakilanHammadde: {} }, tempo: { oyuncu: 10, aktif7: 10, hakDolu: 2 } };
  const hepsi = (r) => uyarilar({ ...taban, ...r }).map((x) => `${x.seviye}:${x.konu}`);
  assert.deepEqual(hepsi({ zindan: [z({ oran: 0.5 })] }), [], 'dengeli canavar: uyarı yok');
  assert.ok(hepsi({ zindan: [z({ oran: 0.95 })] }).some((x) => /^uyari:Normal mod/.test(x)), 'çok kolay');
  assert.ok(hepsi({ zindan: [z({ oran: 0.2 })] }).some((x) => /^uyari:Normal mod/.test(x)), 'çok zor');
  assert.deepEqual(hepsi({ zindan: [z({ oran: 0.99, giris: 5 })] }), [], 'az savaşta oran yorumlanmaz');
  assert.ok(hepsi({ zindan: [z({ ilkOyuncu: 6, ilkMedyanGun: 30, ilkHedefOrani: 4.3 })] }).some((x) => /^uyari:/.test(x)), 'ilk temizleme çok yavaş');
  assert.ok(hepsi({ zindan: [z({ ilkOyuncu: 6, ilkMedyanGun: 2, ilkHedefOrani: 0.3 })] }).some((x) => /^kritik:/.test(x)), 'modelden hızlı = kritik');
  assert.deepEqual(hepsi({ zindan: [z({ ilkOyuncu: 3, ilkHedefOrani: 9 })] }), [], 'az oyuncuyla medyan yorumlanmaz');
  const gear0 = { islemler: taban.islemler.map((x) => (x.tur === 'dovme' || x.tur === 'yukselt' ? { ...x, adet: 0 } : x)) };
  assert.ok(hepsi(gear0).includes('kritik:Teçhizat döngüsü'), 'aktif oyuncu var, dövme/yükseltme yok');
  assert.ok(!hepsi({ ...gear0, tempo: { oyuncu: 10, aktif7: 2, hakDolu: 0 } }).includes('kritik:Teçhizat döngüsü'), 'az aktif oyuncuda uyarı yok');
  assert.ok(hepsi({ ekonomi: { ...taban.ekonomi, yakilanHammaddeToplam: 0 } }).includes('kritik:Hammadde yakımı'));
  assert.ok(hepsi({ ekonomi: { ...taban.ekonomi, zindanKazanc: 95, kazancHarcamaOrani: 0.95 } }).includes('uyari:ASTRA dengesi'), 'kazanç harcamaya yaklaştı');
  assert.ok(hepsi({ ekonomi: { ...taban.ekonomi, zindanKazanc: 1, kazancHarcamaOrani: 0.01 } }).includes('bilgi:ASTRA dengesi'), 'kazanç çok düşük');
  assert.ok(hepsi({ tempo: { oyuncu: 10, aktif7: 10, hakDolu: 9 } }).includes('bilgi:Asker hakkı'));
  assert.ok(hepsi({ islemler: taban.islemler.map((x) => (x.tur === 'onar' ? { ...x, adet: 2, red: 30 } : x)) }).some((x) => /tamir reddi/.test(x)));
  // sıralama: kritik → uyarı → bilgi
  const karisik = uyarilar({ ...taban, zindan: [z({ oran: 0.2 })], ekonomi: { ...taban.ekonomi, yakilanHammaddeToplam: 0 }, tempo: { oyuncu: 10, aktif7: 10, hakDolu: 9 } }).map((x) => x.seviye);
  assert.deepEqual(karisik, [...karisik].sort((a, b) => ({ kritik: 0, uyari: 1, bilgi: 2 })[a] - ({ kritik: 0, uyari: 1, bilgi: 2 })[b]));
  assert.ok(ESIK.enAzGiris === 20 && ESIK.enAzAktif === 5);
  ok('uyarı kuralları: eşikte tetiklenir, altında tetiklenmez; az veriyle yorum yok; kritik önce sıralanır');
}

console.log('\nDenge İzleme testleri geçti.');
process.exit(0);
