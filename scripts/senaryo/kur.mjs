// Senaryo dünyası kurucusu (T7, yerel doğrulama kampanyası): kullanıcının elle denemesi için AYRI bir deneme veritabanı
// (data/senaryo.db) kurar ve içine hazır durumda hesaplar koyar: sıradaki aday, daveti gelmiş aday, izin sorusu bekleyen
// vatandaş, izinde olan, askıdakiler… Kullanıcının asıl deneme dünyasına (data/local.db, :8080) HİÇ dokunmaz.
//   node scripts/senaryo/kur.mjs [--db=data/senaryo.db]
// Sunucuyu SENARYO-DUNYASI-BASLAT.bat başlatır (port 8081). Bu betik her çalıştığında dünya BAŞTAN kurulur ("tazele").
// Saat hızlandırılamadığı için süreli durumlar (72 saatlik davet, izin) gerçek "şimdi"ye göre yazılır.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { openDb } from '../../server/db.js';
import { createEngine } from '../../server/engine.js';
import { loadConfig } from '../../server/config.js';
import { createMailer } from '../../server/mailer.js';
import { createAccounts } from '../../server/accounts.js';
import { createKapi } from '../../server/kapi.js';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const dbDosya = path.resolve(kok, arg.db || 'data/senaryo.db');
const SIFRE = 'Deneme-2026';

fs.mkdirSync(path.dirname(dbDosya), { recursive: true });
for (const ek of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbDosya + ek); } catch { /* yok */ } }

const sessiz = { log() {}, warn() {}, info() {}, error() {} };
const cfg = { ...loadConfig({}), dbFile: dbDosya, testMode: true };
const db = openDb(dbDosya);
db.kvSet('world:testModeEver', '1');                      // index.js bu kayıt dosyasını yalnız deneme modunda açar
const E = await createEngine(db, { testMode: true });
const mailer = createMailer({ db, cfg, log: sessiz });
const accounts = createAccounts({ db, cfg, mailer, verifyMessage: (m, s) => ethers.verifyMessage(m, s) });
const kapi = createKapi({ db, engine: E, accounts, mailer, cfg, log: sessiz });
const sonBaglanti = tur => { const m = db.kvJson('dev:outbox', [])[0]; const r = { verify: /[?&]verify=([a-f0-9]+)/, wallet: /[?&]wallet=([a-f0-9]+)/ }[tur].exec(m ? m.text : ''); return r && r[1]; };
const GUN = 86400000, SAAT = 3600000, simdi = Date.now();
const HAZIR = E.GAME_CONFIG.KAPI.READY_TASK_IDS;

async function hesap(ad) {
  const eposta = `${ad}@ornek.com`;
  const kayit = await accounts.register(eposta, SIFRE);
  await accounts.verifyEmail(sonBaglanti('verify'), SIFRE);
  kapi.admit(kayit.playerId);
  return { ad, eposta, pid: kayit.playerId };
}
const durum = (pid, fn) => E.mutatePlayer(pid, gs => fn(gs.state, gs));

// 1) Vatandaşlar (limit 100 iken hepsi içeri girer); sonra limit vatandaş sayısına indirilir ki sıradakiler sırada kalsın
const H = {};
for (const ad of ['yeni', 'deneyimli', 'izin-sorusu', 'izin-sorusu-2', 'izinde', 'uyarili', 'son-uyari', 'askida-oncelikli', 'askida-oncelik-yok']) H[ad] = await hesap('senaryo-' + ad);
for (const a of ['askida-oncelikli', 'askida-oncelik-yok']) kapi.adminSetPlayer(H[a].pid, 'suspended');
durum(H['askida-oncelik-yok'].pid, (st, gs) => { gs._katilim().oncelikVar = false; });   // önceki askısı "son uyarı" yoluyla: dönüşte öncelik YOK
kapi.adminSet({ limit: 7 });
// 2) Bekleme sırası (kayıt sırası = sıra): davetli olacak hazır aday ilk, sonra hazır olan, sonra hazır olmayan
for (const ad of ['davetli', 'sirada-hazir', 'sirada-degil']) H[ad] = await hesap('senaryo-' + ad);
for (const ad of ['davetli', 'sirada-hazir']) durum(H[ad].pid, st => { st.candidateReady = Object.fromEntries(HAZIR.map(id => [id, true])); });
kapi.adminSet({ limit: 8 });                               // bir yer açıldı → ilk hazır aday (davetli) 72 saatlik davet alır
kapi.fillSeats();

// 3) Durumlar
durum(H.yeni.pid, st => { st.adAstraBalance = 300; });
durum(H.deneyimli.pid, st => {
  st.level = 32; st.adAstraBalance = 60000; st.lockedAda = 20000; st.warehouseLevel = 6;
  for (const k of E.GAME_CONFIG.RESOURCE_KEYS) st.inventory[k] = 3000;
});
for (let i = 0; i < 4; i++) E.act(H.deneyimli.pid, 'buySoldierUnit', []);
for (const ad of ['izin-sorusu', 'izin-sorusu-2']) {
  durum(H[ad].pid, (st, gs) => {
    st.adAstraBalance = 800;
    const k = gs._katilim(); k.dusukHaftaSayisi = 3; k.izinSorusu = { soruldu: simdi, sonTarih: simdi + 72 * SAAT };
    gs.pushNotice('🏖️ Katılımın 3 haftadır düşük. İzin hakkını kullanmak ister misin? 72 saat içinde cevap ver, yoksa yerin bekleyen birine geçer.', 'warning');
  });
}
durum(H.izinde.pid, (st, gs) => { st.adAstraBalance = 800; const k = gs._katilim(); k.izinModu = { baslangic: simdi - 2 * GUN, bitis: simdi + 8 * GUN, gun: 10 }; k.izinYillikKalan = 20; });
durum(H.uyarili.pid, (st, gs) => { st.adAstraBalance = 500; gs._katilim().dusukHaftaSayisi = 2; gs.pushNotice('⚠️ Katılım puanın düşük (bu hafta 0/2 kategori). Düşük giderse izin hakkını kullanman istenecek.', 'warning'); });
durum(H['son-uyari'].pid, (st, gs) => {
  st.adAstraBalance = 500;
  const k = gs._katilim(); k.dusukHaftaSayisi = 3; k.izinYillikKalan = 0; k.sonUyari = { baslangic: simdi };
  gs.pushNotice('🚨 Bu yıl için izin hakkın bitti ve katılımın hâlâ düşük. 72 saat içinde katılımını artırmazsan yerin bekleyen birine geçer; döndüğünde sıranın önceliği olmaz.', 'warning');
});
for (const a of ['askida-oncelikli', 'askida-oncelik-yok']) durum(H[a].pid, st => { st.adAstraBalance = 400; });

const ozet = kapi.publicSummary();
const satirlar = Object.entries(H).map(([ad, h]) => `${h.eposta.padEnd(42)} ${kapi.statusOf(h.pid).status.padEnd(10)} ${ad}`);
console.log(`Senaryo dünyası kuruldu: ${dbDosya}`);
console.log(`Vadi: ${ozet.citizens} vatandaş / sınır ${ozet.limit} · sırada ${ozet.waiting} · askıda ${ozet.suspended}`);
console.log(`Hesaplar (hepsinin şifresi: ${SIFRE}):`);
for (const s of satirlar) console.log('  ' + s);
db.close();
process.exit(0);
