// Yedekleme ve geri yükleme (kurumsal A9): tutarlı yedek (yazma sürerken), bütünlük + sha256, saatlik/günlük/haftalık saklama,
// isteğe bağlı AES-256-GCM şifreleme (yanlış anahtar / bozulma yakalanır), geri yükleme TATBİKATI (veri aynı, ödemeler otomatik DURDURULUR,
// eski dosya silinmez), sonrası komutu kancası (gizli bilgi görmez), yedek yaşı ölçüsü.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { openDb } from '../server/db.js';
import { saklamaPlani } from '../server/yedek/saklama.js';
import { yedekAl, yedekleriListele, sonYedekYasiSn } from '../server/yedek/yedekle.js';
import { yedekDogrula, geriYukle } from '../server/yedek/geriyukle.js';
import { donguCalistir } from '../server/yedek/dongu.js';
import { spawnSync } from 'node:child_process';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const sessiz = { info() {}, warn() {}, error() {}, log() {} };
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'yedek-'));
const yeniKlasor = ad => { const k = path.join(gecici, ad); fs.mkdirSync(k, { recursive: true }); return k; };
const SAAT = 3600000, GUN = 24 * SAAT;
const ANAHTAR = 'ab'.repeat(32);
// Gerçek bir kayıt dosyası: kv + oyuncular + ödemeler
const kayitKur = (ad, oyuncu = 20) => {
  const dosya = path.join(gecici, ad + '.db');
  const db = openDb(dosya);
  for (let i = 0; i < oyuncu; i++) db.q.playerAdd.run('acc:' + i, 1000 + i, 2000 + i);
  db.kvSet('deneme:isaret', 'ozel-isaret-degeri-12345');
  db.q.payoutAdd.run(1, 'weekly', 'acc:1', 12.5, 3000);
  return { db, dosya };
};

try {
  // 1) Saklama planı: saatlik 48, günlük 14, haftalık 8; en yeni her zaman kalır
  {
    const simdi = Date.UTC(2026, 9, 8, 12, 30, 0);
    const liste = [];
    for (let t = simdi - 90 * GUN; t <= simdi; t += SAAT) liste.push({ ad: 'b' + t, t });
    const tut = saklamaPlani(liste, simdi);
    const kalan = liste.filter(x => tut.has(x.ad));
    assert.ok(tut.has(liste.at(-1).ad), 'en yeni yedek her zaman kalır');
    assert.ok(kalan.length <= 48 + 14 + 8 && kalan.length >= 48, 'toplam sınırlı: ' + kalan.length);
    for (let h = 0; h < 48; h++) assert.ok(kalan.some(x => Math.floor(x.t / SAAT) === Math.floor(simdi / SAAT) - h), `son 48 saatin ${h}. saati yedekli`);
    for (let d = 0; d < 14; d++) assert.ok(kalan.some(x => Math.floor(x.t / GUN) === Math.floor(simdi / GUN) - d), `son 14 günün ${d}. günü yedekli`);
    assert.ok(kalan.every(x => x.t > simdi - 9 * 7 * GUN), '8 haftadan eski yedek kalmaz');
    // Aynı saatte iki yedek: yalnız sonuncusu (eski bir saatteyse)
    const eski = simdi - 5 * GUN;
    const ikili = saklamaPlani([{ ad: 'x1', t: eski }, { ad: 'x2', t: eski + 60000 }, { ad: 'yeni', t: simdi }], simdi);
    assert.ok(ikili.has('x2') && !ikili.has('x1'), 'günlük kovada en yeni kalır');
    assert.equal(saklamaPlani([], simdi).size, 0);
    ok('saklama planı: son 48 saat + 14 gün + 8 hafta kapsanır, toplam ≤ 70, 8 haftadan eski silinir, en yeni korunur');
  }

  // 2) Yedek alma: dosya, bütünlük, manifest, geçici dosya kalmaz
  {
    const { db, dosya } = kayitKur('kaynak1');
    const klasor = yeniKlasor('y1');
    const saat = Date.UTC(2026, 9, 8, 10, 0, 0);
    const s = await yedekAl({ dbFile: dosya, klasor, clock: () => saat, log: sessiz });
    assert.equal(s.dosya, 'realm-20261008-100000.db.gz');
    const m = JSON.parse(fs.readFileSync(path.join(klasor, s.dosya + '.json'), 'utf8'));
    assert.equal(m.sifreli, false); assert.equal(m.oyuncuSayisi, 20); assert.equal(m.sonOdemeNo, 1); assert.ok(m.semaSurumu >= 4);
    assert.match(m.sha256, /^[0-9a-f]{64}$/); assert.equal(m.boyut, fs.statSync(path.join(klasor, s.dosya)).size); assert.equal(m.olusturmaMs, saat);
    assert.deepEqual(fs.readdirSync(klasor).filter(f => f.includes('.tmp')), [], 'geçici dosya kalmadı');
    const d = await yedekDogrula({ dosya: path.join(klasor, s.dosya), derin: true });
    assert.equal(d.ok, true, JSON.stringify(d));
    const durum = JSON.parse(fs.readFileSync(path.join(klasor, 'son-durum.json'), 'utf8'));
    assert.equal(durum.sonBasariMs, saat); assert.equal(durum.sonDosya, s.dosya);
    assert.equal(sonYedekYasiSn(klasor, saat + 90_000), 90);
    assert.ok(Number.isNaN(sonYedekYasiSn(yeniKlasor('bos'), saat)), 'hiç yedek yoksa NaN (ölçü yazılmaz → alarm "yok"u fark eder)');
    db.close();
    ok('yedek: tutarlı kopya, bütünlük sağlam, manifest (sha256, oyuncu sayısı, son ödeme, şema sürümü), geçici dosya yok, yedek yaşı ölçülür');
  }

  // 3) Yazma sürerken alınan yedek tutarlı (bozuk/yarım kayıt yok)
  {
    const { db, dosya } = kayitKur('kaynak2', 50);
    const klasor = yeniKlasor('y2');
    let dur = false, yazilan = 0;
    const yazici = (async () => { while (!dur) { db.q.playerAdd.run('canli:' + yazilan++, 1, 1); await new Promise(r => setImmediate(r)); } })();
    const s = await yedekAl({ dbFile: dosya, klasor, clock: () => 1_800_000_000_000, log: sessiz });
    dur = true; await yazici;
    const d = await yedekDogrula({ dosya: path.join(klasor, s.dosya), derin: true });
    assert.equal(d.ok, true, JSON.stringify(d));
    const m = JSON.parse(fs.readFileSync(path.join(klasor, s.dosya + '.json'), 'utf8'));
    assert.ok(m.oyuncuSayisi >= 50 && m.oyuncuSayisi <= 50 + yazilan, 'anlık görüntü: yedek başlangıç ile bitiş arasındaki tutarlı bir an');
    db.close();
    ok('yazma sürerken alınan yedek tutarlı ve bütünlük denetiminden geçer');
  }

  // 4) TATBİKAT: yedekle → canlıyı bozup/sil → geri yükle → veri aynı, ödemeler durdurulmuş, eski dosya saklanmış
  {
    const { db, dosya } = kayitKur('kaynak3', 30);
    const klasor = yeniKlasor('y3');
    const s = await yedekAl({ dbFile: dosya, klasor, clock: () => Date.UTC(2026, 9, 8, 11, 0, 0), log: sessiz });
    db.raw.exec('DELETE FROM players; DELETE FROM payouts'); db.kvDel('deneme:isaret'); db.close();   // felaket: veri gitti
    const sonuc = await geriYukle({ dosya: path.join(klasor, s.dosya), hedefDbFile: dosya, clock: () => Date.UTC(2026, 9, 8, 13, 0, 0), log: sessiz });
    assert.equal(sonuc.durduruldu, true);
    assert.ok(sonuc.oncesi && fs.existsSync(sonuc.oncesi), 'önceki (bozuk) dosya silinmeden yan klasöre alındı: ' + sonuc.oncesi);
    const geri = openDb(dosya);
    assert.equal(geri.raw.prepare('SELECT COUNT(*) AS n FROM players').get().n, 30, 'oyuncular geri geldi');
    assert.equal(geri.kvGet('deneme:isaret'), 'ozel-isaret-degeri-12345');
    assert.equal(geri.raw.prepare('SELECT COUNT(*) AS n FROM payouts').get().n, 1, 'ödeme kayıtları geri geldi');
    assert.equal(geri.kvJson('world:economy', {}).paused, true, 'ÇİFT ÖDEME ÖNLEMİ: ödemeler/çekimler otomatik durduruldu');
    assert.ok(geri.q.eventsRecent.all(5).some(e => e.type === 'restore'), 'geri yükleme olay günlüğüne yazıldı');
    assert.equal(geri.raw.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(geri.raw.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n >= 4, true, 'şema geçişleri tamam');
    geri.close();
    ok('geri yükleme tatbikatı: veri aynı, ödemeler otomatik durdurulur, eski dosya saklanır, olay kaydı, bütünlük tamam');
  }

  // 5) Boş hedefe geri yükleme (sunucu kaybı senaryosu: yeni makinede dosya yok)
  {
    const { db, dosya } = kayitKur('kaynak4', 7);
    const klasor = yeniKlasor('y4');
    const s = await yedekAl({ dbFile: dosya, klasor, clock: () => 1_800_000_100_000, log: sessiz });
    db.close();
    const yeni = path.join(gecici, 'yeni-makine', 'veri', 'realm.db');
    const sonuc = await geriYukle({ dosya: path.join(klasor, s.dosya), hedefDbFile: yeni, log: sessiz });
    assert.equal(sonuc.oncesi, null);
    const geri = openDb(yeni);
    assert.equal(geri.raw.prepare('SELECT COUNT(*) AS n FROM players').get().n, 7); geri.close();
    ok('boş makineye geri yükleme (klasör yoksa oluşturulur, "önceki dosya" yok)');
  }

  // 6) Şifreleme: AES-256-GCM; düz metin sızmaz; yanlış anahtar / anahtarsız / bozulma hedefe DOKUNMADAN reddedilir
  {
    const { db, dosya } = kayitKur('kaynak5', 10);
    const klasor = yeniKlasor('y5');
    const s = await yedekAl({ dbFile: dosya, klasor, anahtar: ANAHTAR, clock: () => 1_800_000_200_000, log: sessiz });
    assert.ok(s.dosya.endsWith('.db.gz.enc'));
    const yol = path.join(klasor, s.dosya);
    const bayt = fs.readFileSync(yol);
    assert.equal(bayt.subarray(0, 5).toString(), 'RLMB1', 'başlık');
    assert.throws(() => zlib.gunzipSync(bayt), 'şifreli dosya doğrudan açılamaz');
    assert.equal(JSON.parse(fs.readFileSync(yol + '.json', 'utf8')).sifreli, true);
    assert.equal((await yedekDogrula({ dosya: yol, anahtar: ANAHTAR, derin: true })).ok, true);
    const hedef = path.join(gecici, 'sifreli-hedef.db');
    await assert.rejects(geriYukle({ dosya: yol, hedefDbFile: hedef, anahtar: 'cd'.repeat(32), log: sessiz }), /şifre|anahtar/i, 'yanlış anahtar');
    await assert.rejects(geriYukle({ dosya: yol, hedefDbFile: hedef, log: sessiz }), /şifreli|anahtar/i, 'anahtarsız');
    assert.equal(fs.existsSync(hedef), false, 'başarısız denemelerde hedef dosya oluşmadı');
    // bozulma: ortadan bir bayt çevir (sha256 zaten yakalar; manifesti güncelleyip GCM doğrulamasını da sına)
    const bozuk = Buffer.from(bayt); bozuk[Math.floor(bozuk.length / 2)] ^= 0xff;
    const bozukYol = path.join(klasor, 'realm-bozuk.db.gz.enc'); fs.writeFileSync(bozukYol, bozuk);
    const sha = (await import('node:crypto')).createHash('sha256').update(bozuk).digest('hex');
    fs.writeFileSync(bozukYol + '.json', JSON.stringify({ ...JSON.parse(fs.readFileSync(yol + '.json', 'utf8')), dosya: 'realm-bozuk.db.gz.enc', sha256: sha }));
    await assert.rejects(geriYukle({ dosya: bozukYol, hedefDbFile: hedef, anahtar: ANAHTAR, log: sessiz }), /bozul|doğrulan|çözülemedi/i, 'kurcalama/bozulma GCM ile yakalanır');
    assert.equal(fs.existsSync(hedef), false);
    db.close();
    ok('şifreli yedek: düz metin açılamaz; yanlış anahtar, anahtarsız ve kurcalanmış dosya hedefe dokunmadan reddedilir');
  }

  // 7) Bozulma (şifresiz): sha256 uyuşmazlığı doğrulamada ve geri yüklemede yakalanır; mevcut canlı dosya korunur
  {
    const { db, dosya } = kayitKur('kaynak6', 5);
    const klasor = yeniKlasor('y6');
    const s = await yedekAl({ dbFile: dosya, klasor, clock: () => 1_800_000_300_000, log: sessiz });
    const yol = path.join(klasor, s.dosya);
    const b = fs.readFileSync(yol); b[Math.floor(b.length / 2)] ^= 0x55; fs.writeFileSync(yol, b);
    const d = await yedekDogrula({ dosya: yol });
    assert.equal(d.ok, false); assert.ok(d.hatalar.some(h => /sha256/i.test(h)), JSON.stringify(d));
    const oncesi = fs.readFileSync(dosya);
    await assert.rejects(geriYukle({ dosya: yol, hedefDbFile: dosya, log: sessiz }), /sha256|bozul/i);
    assert.deepEqual(fs.readFileSync(dosya), oncesi, 'başarısız geri yükleme canlı dosyaya dokunmaz');
    fs.rmSync(yol + '.json'); assert.equal((await yedekDogrula({ dosya: yol })).ok, false, 'manifesti eksik yedek doğrulanmaz');
    db.close();
    ok('bozulmuş yedek (sha256) ve manifestsiz yedek reddedilir; başarısız geri yükleme canlı dosyayı değiştirmez');
  }

  // 8) Saklama yedekAl içinde uygulanır (sahte saatle 5 gün saatlik yedek); manifestler dosyayla birlikte silinir; durum dosyası kalır
  {
    const { db, dosya } = kayitKur('kaynak7', 3);
    const klasor = yeniKlasor('y7');
    let t = Date.UTC(2026, 9, 1, 0, 0, 0);
    for (let i = 0; i < 24 * 5; i++) { await yedekAl({ dbFile: dosya, klasor, clock: () => t, log: sessiz }); t += SAAT; }
    const liste = yedekleriListele(klasor);
    const simdi = t - SAAT;
    assert.ok(liste.length < 24 * 5, 'eski saatlikler budandı: ' + liste.length);
    assert.ok(liste.length >= 48, 'son 48 saat duruyor');
    for (let h = 0; h < 48; h++) assert.ok(liste.some(x => Math.floor(x.t / SAAT) === Math.floor(simdi / SAAT) - h), 'saat ' + h);
    const jsonlar = fs.readdirSync(klasor).filter(f => f.endsWith('.json') && f !== 'son-durum.json');
    assert.equal(jsonlar.length, liste.length, 'her yedeğin tek manifesti var, yetim manifest yok');
    assert.ok(fs.existsSync(path.join(klasor, 'son-durum.json')));
    db.close();
    ok('saklama yedek alırken uygulanır: eski saatlikler budanır, manifestler birlikte gider, yetim dosya kalmaz');
  }

  // 9) Sonrası komutu: yedek dosyası ve manifest yolu verilir, GİZLİ anahtarlar ortamdan çıkarılır; kanca başarısızsa yedek yine geçerli
  {
    const { db, dosya } = kayitKur('kaynak8', 3);
    const klasor = yeniKlasor('y8');
    const cikti = path.join(gecici, 'kanca-cikti.json');
    const betik = path.join(gecici, 'kanca.mjs');
    fs.writeFileSync(betik, "import fs from 'node:fs'; fs.writeFileSync(process.argv[2], JSON.stringify({ dosya: process.env.YEDEK_DOSYA, manifest: process.env.YEDEK_MANIFEST, anahtar: process.env.YEDEK_ANAHTAR || null, kasa: process.env.KASA_MASTER_KEY || null, yonetici: process.env.ADMIN_TOKEN || null }));");
    process.env.YEDEK_ANAHTAR = ANAHTAR; process.env.KASA_MASTER_KEY = 'ee'.repeat(32); process.env.ADMIN_TOKEN = 'y'.repeat(40);
    const s = await yedekAl({ dbFile: dosya, klasor, clock: () => 1_800_000_400_000, log: sessiz, sonrasiKomut: `node "${betik}" "${cikti}"` });
    delete process.env.YEDEK_ANAHTAR; delete process.env.KASA_MASTER_KEY; delete process.env.ADMIN_TOKEN;
    assert.equal(s.hook.ok, true, JSON.stringify(s.hook));
    const g = JSON.parse(fs.readFileSync(cikti, 'utf8'));
    assert.equal(path.basename(g.dosya), s.dosya); assert.ok(g.manifest.endsWith('.json'));
    assert.deepEqual([g.anahtar, g.kasa, g.yonetici], [null, null, null], 'kancaya yedek anahtarı, kasa ana anahtarı ve yönetici şifresi geçmez');
    const kotu = await yedekAl({ dbFile: dosya, klasor, clock: () => 1_800_000_500_000, log: sessiz, sonrasiKomut: 'node -e "process.exit(3)"' });
    assert.equal(kotu.hook.ok, false); assert.equal(kotu.hook.kod, 3);
    assert.equal((await yedekDogrula({ dosya: path.join(klasor, kotu.dosya) })).ok, true, 'kanca hata verse de yedek geçerli');
    const durum = JSON.parse(fs.readFileSync(path.join(klasor, 'son-durum.json'), 'utf8'));
    assert.equal(durum.hookHata != null, true, 'kanca hatası durum dosyasında görünür (alarm için)');
    db.close();
    ok('sonrası komutu: yedek yolu verilir, gizli anahtarlar çıkarılır; kanca hatası yedeği bozmaz ama durumda görünür');
  }

  // 10) Başarısız yedek: kaynak yoksa fırlatır, durum dosyasına hata yazar, eski yedekler silinmez
  {
    const { db, dosya } = kayitKur('kaynak9', 3);
    const klasor = yeniKlasor('y9');
    const iyi = await yedekAl({ dbFile: dosya, klasor, clock: () => 1_800_000_600_000, log: sessiz });
    db.close();
    await assert.rejects(yedekAl({ dbFile: path.join(gecici, 'yok.db'), klasor, clock: () => 1_800_000_700_000, log: sessiz }));
    const durum = JSON.parse(fs.readFileSync(path.join(klasor, 'son-durum.json'), 'utf8'));
    assert.ok(durum.sonHata && durum.sonHataMs === 1_800_000_700_000);
    assert.equal(durum.sonBasariMs, 1_800_000_600_000, 'son BAŞARI zamanı hatayla ezilmez (yaş ölçüsü doğru kalır)');
    assert.ok(fs.existsSync(path.join(klasor, iyi.dosya)), 'eski yedek duruyor');
    assert.deepEqual(fs.readdirSync(klasor).filter(f => f.includes('.tmp')), []);
    ok('başarısız yedek: açık hata, durumda hata zamanı, son başarı zamanı ve eski yedekler korunur, artık dosya yok');
  }
  // 11) Yedek döngüsü: hata turu durdurmaz, aralık beklenir, durdur() mevcut turu bitirip çıkar
  {
    const turlar = []; const beklemeler = [];
    const cfg = { yedek: { aralikDk: 15 } };
    let n = 0;
    const d = donguCalistir({ cfg, log: sessiz, tur: async () => { turlar.push(++n); if (n === 2) throw new Error('disk dolu'); }, bekle: async ms => { beklemeler.push(ms); if (turlar.length >= 4) d.durdur(); await new Promise(r => setImmediate(r)); } });
    await d.bitti;
    assert.deepEqual(turlar, [1, 2, 3, 4], 'hatalı 2. tur döngüyü durdurmadı');
    assert.ok(beklemeler.every(ms => ms === 15 * 60000), 'bekleme = YEDEK_ARALIK_DK');
    ok('yedek döngüsü: hatalı tur döngüyü durdurmaz, aralık ayarına uyulur, durdurulabilir');
  }

  // 12) Komut satırı araçları GERÇEK SÜREÇ olarak: yedekle → dogrula (derin) → geri-yukle (--evet); yanlış girdide sıfırdan farklı çıkış
  {
    const { db, dosya } = kayitKur('kaynak10', 12);
    const klasor = yeniKlasor('y10');
    const ortam = { ...process.env, NODE_ENV: '', TEST_MODE: '', DB_FILE: dosya, YEDEK_KLASORU: klasor, YEDEK_ANAHTAR: ANAHTAR, YEDEK_ANAHTAR_FILE: '', YEDEK_SONRASI_KOMUT: '', LOG_LEVEL: 'error' };
    const kos = (betik, args = []) => spawnSync(process.execPath, [betik, ...args], { env: ortam, encoding: 'utf8', timeout: 120000 });
    const y = kos('server/yedek/cli/yedekle.js');
    assert.equal(y.status, 0, y.stdout + y.stderr);
    assert.match(y.stdout, /şifreli/);
    const dg = kos('server/yedek/cli/dogrula.js', ['--derin']);
    assert.equal(dg.status, 0, dg.stdout + dg.stderr); assert.match(dg.stdout, /1 yedek sağlam/);
    db.close();
    const yedekAdi = fs.readdirSync(klasor).find(f => f.endsWith('.enc'));
    const hedef = path.join(gecici, 'cli-hedef', 'realm.db');
    const g = kos('server/yedek/cli/geri-yukle.js', [path.join(klasor, yedekAdi), '--hedef=' + hedef, '--evet']);
    assert.equal(g.status, 0, g.stdout + g.stderr); assert.match(g.stdout, /ÖDEMELER DURDURULDU/);
    const geri = openDb(hedef);
    assert.equal(geri.raw.prepare('SELECT COUNT(*) AS n FROM players').get().n, 12); assert.equal(geri.kvJson('world:economy', {}).paused, true); geri.close();
    const yanlis = spawnSync(process.execPath, ['server/yedek/cli/geri-yukle.js', path.join(klasor, yedekAdi), '--hedef=' + hedef + '2', '--evet'], { env: { ...ortam, YEDEK_ANAHTAR: 'cd'.repeat(32) }, encoding: 'utf8', timeout: 120000 });
    assert.equal(yanlis.status, 1); assert.match(yanlis.stderr, /dokunulmadı/); assert.equal(fs.existsSync(hedef + '2'), false);
    const bos = spawnSync(process.execPath, ['server/yedek/cli/yedekle.js'], { env: { ...ortam, YEDEK_KLASORU: '' }, encoding: 'utf8', timeout: 60000 });
    assert.equal(bos.status, 1);
    ok('komut satırı araçları (gerçek süreç): şifreli yedekle → derin doğrula → geri yükle; yanlış anahtar ve eksik ayar sıfırdan farklı çıkış verir');
  }
  // 13) Sunucu çalışırken (hedef veritabanı kullanımda) geri yükleme REDDEDİLİR; kapanınca olur. Bozuk (açılmayan) hedef engel değildir.
  {
    const { db, dosya } = kayitKur('kaynak11', 4);
    const klasor = yeniKlasor('y11');
    const s = await yedekAl({ dbFile: dosya, klasor, clock: () => 1_800_000_800_000, log: sessiz });
    const oncesi = fs.readFileSync(dosya);
    await assert.rejects(geriYukle({ dosya: path.join(klasor, s.dosya), hedefDbFile: dosya, log: sessiz }), /kullanımda|sunucu/i, 'açık bağlantı varken reddedilir');
    assert.deepEqual(fs.readFileSync(dosya), oncesi, 'reddedilince hedef değişmedi');
    assert.deepEqual(fs.readdirSync(path.dirname(dosya)).filter(f => f.startsWith('kaynak11.db') && (f.includes('.geri-') || f.includes('.oncesi-'))), [], 'artık/yan dosya kalmadı');
    db.close();
    const bozuk = path.join(gecici, 'bozuk-hedef.db'); fs.writeFileSync(bozuk, 'bu bir veritabani dosyasi degil'.repeat(50));
    const g = await geriYukle({ dosya: path.join(klasor, s.dosya), hedefDbFile: bozuk, log: sessiz });
    assert.ok(g.oncesi && fs.existsSync(g.oncesi), 'bozuk hedef engel olmaz: yan yana saklanıp yerine yedek konur');
    const geri = openDb(bozuk); assert.equal(geri.raw.prepare('SELECT COUNT(*) AS n FROM players').get().n, 4); geri.close();
    ok('hedef veritabanı kullanımdayken (sunucu çalışıyor) geri yükleme reddedilir; bozuk/açılmayan hedef engel olmaz');
  }

  // 14) Bilgisayardaki kopya klasörünü budama aracı (cli/buda.js): saklama planı uygulanır, yetim manifest ve tanınmayan dosyalar doğru ele alınır, --kuru silmez
  {
    const klasor = yeniKlasor('y14');
    const simdi = Date.now();
    const damga = ms => { const iso = new Date(ms).toISOString(); return iso.slice(0, 10).split('-').join('') + '-' + iso.slice(11, 19).split(':').join(''); };
    for (let sa = 0; sa < 24 * 40; sa++) { const ad = `realm-${damga(simdi - sa * SAAT)}.db.gz.enc`; fs.writeFileSync(path.join(klasor, ad), 'x'); fs.writeFileSync(path.join(klasor, ad + '.json'), '{}'); }
    fs.writeFileSync(path.join(klasor, 'realm-20200101-000000.db.gz.enc.json'), '{}');   // yetim manifest (yedek dosyası yok)
    fs.writeFileSync(path.join(klasor, 'notlarim.txt'), 'bana ait');                       // yedek olmayan dosyaya DOKUNULMAZ
    const say = () => fs.readdirSync(klasor).filter(f => f.endsWith('.db.gz.enc')).length;
    const once = say();
    const kuru = spawnSync(process.execPath, ['server/yedek/cli/buda.js', klasor, '--kuru'], { encoding: 'utf8' });
    assert.equal(kuru.status, 0, kuru.stdout + kuru.stderr); assert.equal(say(), once, '--kuru hiçbir şey silmez'); assert.match(kuru.stdout, /silinecek/);
    const gercek = spawnSync(process.execPath, ['server/yedek/cli/buda.js', klasor], { encoding: 'utf8' });
    assert.equal(gercek.status, 0, gercek.stdout + gercek.stderr);
    const kalan = yedekleriListele(klasor);
    assert.ok(kalan.length < once && kalan.length >= 48 && kalan.length <= 70, `saklama planı uygulandı: ${once} → ${kalan.length}`);
    for (let sa = 0; sa < 48; sa++) assert.ok(kalan.some(x => Math.floor(x.t / SAAT) === Math.floor((simdi - sa * SAAT) / SAAT)), 'son 48 saat duruyor: ' + sa);
    assert.ok(!fs.existsSync(path.join(klasor, 'realm-20200101-000000.db.gz.enc.json')), 'yetim manifest silindi');
    assert.ok(fs.existsSync(path.join(klasor, 'notlarim.txt')), 'tanınmayan dosyaya dokunulmadı');
    const jsonlar = fs.readdirSync(klasor).filter(f => f.endsWith('.json')).length;
    assert.equal(jsonlar, kalan.length, 'her yedeğin tek manifesti kaldı');
    const bos = spawnSync(process.execPath, ['server/yedek/cli/buda.js', path.join(gecici, 'yok-klasor')], { encoding: 'utf8' });
    assert.equal(bos.status, 1, 'olmayan klasör açık hatayla reddedilir');
    ok('buda aracı: saklama planı bilgisayardaki kopyaya uygulanır, yetim manifest silinir, yabancı dosyaya dokunulmaz, --kuru güvenli');
  }
} finally {
  // Windows'ta bir doğrulama patlayınca açık kalan veritabanı dosyası silmeyi engeller; bu temizlik hatası asıl hatayı GİZLEMESİN
  try { fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { console.warn('geçici klasör silinemedi (asıl hata yukarıda):', e.code); }
}

console.log(`\n${passed}/14 yedekleme testi geçti`);
