// Tutarlı yedek alma (kurumsal A9.1-A9.3). Kayıt dosyası SALT OKUNUR açılır ve SQLite'ın kendi backup API'siyle kopyalanır:
// yazma sürerken bile tek bir tutarlı an görüntüsü alınır (dosyayı cp ile kopyalamak WAL'de bozuk yedek verirdi).
// Sıra: kopya → bütünlük denetimi → gzip (+ isteğe bağlı AES-256-GCM) → sha256 + manifest → saklama budaması → sonrası komutu.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import { DatabaseSync, backup } from 'node:sqlite';
import { saklamaPlani } from './saklama.js';
import { anahtarCoz, sifreleyici } from './sifre.js';

export const DURUM_DOSYASI = 'son-durum.json';
// Kancaya gizli değerler geçmez: dışarı kopyalayan komut (rclone/scp) yalnız yedek dosyasının yolunu bilir
const KANCADAN_CIKARILAN = ['YEDEK_ANAHTAR', 'YEDEK_ANAHTAR_FILE', 'KASA_MASTER_KEY', 'KASA_MASTER_KEY_FILE', 'HESAP_ANAHTARI', 'HESAP_ANAHTARI_FILE', 'GAME_WALLET_PRIVATE_KEY', 'GAME_WALLET_PRIVATE_KEY_FILE', 'ADMIN_TOKEN', 'ADMIN_TOKEN_FILE', 'SMTP_URL', 'SMTP_URL_FILE'];

const damga = ms => { const iso = new Date(ms).toISOString(); return iso.slice(0, 10).split('-').join('') + '-' + iso.slice(11, 19).split(':').join(''); };
const sayisal = s => s.length > 0 && [...s].every(c => c >= '0' && c <= '9');
export function yedekAdiMi(f) {
  if (!f.startsWith('realm-') || !(f.endsWith('.db.gz') || f.endsWith('.db.gz.enc'))) return false;
  const g = f.slice(6, 21);
  return g.length === 15 && g[8] === '-' && sayisal(g.slice(0, 8)) && sayisal(g.slice(9));
}
const adtanZaman = f => Date.UTC(+f.slice(6, 10), +f.slice(10, 12) - 1, +f.slice(12, 14), +f.slice(15, 17), +f.slice(17, 19), +f.slice(19, 21));

export function yedekleriListele(klasor) {
  if (!fs.existsSync(klasor)) return [];
  return fs.readdirSync(klasor).filter(yedekAdiMi).map(ad => ({ ad, t: adtanZaman(ad) })).sort((a, b) => a.t - b.t);
}

export function durumOku(klasor) {
  try { return JSON.parse(fs.readFileSync(path.join(klasor, DURUM_DOSYASI), 'utf8')); } catch { return {}; }   // dosya yok/bozuk = hiç yedek alınmamış sayılır
}
function jsonYaz(yol, nesne) {
  const gecici = yol + '.tmp';
  fs.writeFileSync(gecici, JSON.stringify(nesne, null, 2));
  fs.renameSync(gecici, yol);
}
function durumYaz(klasor, yama) { jsonYaz(path.join(klasor, DURUM_DOSYASI), { ...durumOku(klasor), ...yama }); }

// Son BAŞARILI yedeğin yaşı (sn); hiç yoksa NaN (ölçü yazılmaz → alarm "yok"u fark eder)
export function sonYedekYasiSn(klasor, simdi = Date.now()) {
  const d = durumOku(klasor);
  return Number.isFinite(d.sonBasariMs) ? Math.max(0, Math.round((simdi - d.sonBasariMs) / 1000)) : NaN;
}
// Son deneme başarılı mı: 1/0; hiç deneme yoksa NaN
export function sonDenemeBasarili(klasor) {
  const d = durumOku(klasor);
  if (!Number.isFinite(d.sonBasariMs) && !Number.isFinite(d.sonHataMs)) return NaN;
  if (Number.isFinite(d.sonHataMs) && !(d.sonBasariMs >= d.sonHataMs)) return 0;
  return d.hookHata ? 0 : 1;
}

async function sha256Dosya(yol) {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(yol), h);
  return h.digest('hex');
}

function kancaCalistir(komut, env, log) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const temiz = { ...process.env };
    for (const k of KANCADAN_CIKARILAN) delete temiz[k];
    let son = '';
    const cocuk = spawn(komut, { shell: true, env: { ...temiz, ...env }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
    const topla = d => { son = (son + d.toString()).slice(-500); };
    cocuk.stdout.on('data', topla); cocuk.stderr.on('data', topla);
    cocuk.on('error', err => resolve({ ok: false, kod: null, sureMs: Date.now() - t0, cikti: String(err.message) }));
    cocuk.on('close', kod => { if (kod !== 0) log.warn('Yedek sonrası komutu başarısız', { kod, cikti: son }); resolve({ ok: kod === 0, kod, sureMs: Date.now() - t0, cikti: son }); });
  });
}

export async function yedekAl({ dbFile, klasor, anahtar = '', sonrasiKomut = '', clock = Date.now, log = console, saklama = {} }) {
  const t = clock();
  fs.mkdirSync(klasor, { recursive: true });
  const govde = 'realm-' + damga(t);
  const sifreli = !!anahtar;
  const ad = govde + '.db.gz' + (sifreli ? '.enc' : '');
  const yol = path.join(klasor, ad);
  const geciciDb = path.join(klasor, `.tmp-${govde}.db`);
  const geciciCikti = path.join(klasor, `.tmp-${ad}`);
  const temizle = () => { for (const f of [geciciDb, geciciDb + '-wal', geciciDb + '-shm', geciciDb + '-journal', geciciCikti]) fs.rmSync(f, { force: true }); };
  try {
    const key = sifreli ? anahtarCoz(anahtar) : null;
    const kaynak = new DatabaseSync(dbFile, { readOnly: true });
    let kaynakBoyut = 0;
    try { await backup(kaynak, geciciDb); kaynakBoyut = fs.statSync(dbFile).size; } finally { kaynak.close(); }

    // Bütünlük + manifest bilgileri; kopya tek dosya olsun diye WAL kipi kapatılır (geri yüklemede sunucu yeniden WAL'e geçer)
    const kopya = new DatabaseSync(geciciDb);
    let bilgi;
    try {
      kopya.exec('PRAGMA journal_mode = DELETE');
      const bt = kopya.prepare('PRAGMA integrity_check').all();
      if (bt.length !== 1 || bt[0].integrity_check !== 'ok') throw new Error('Yedek kopyası bütünlük denetiminden geçmedi: ' + JSON.stringify(bt).slice(0, 300));
      const bir = (sql, alan) => { try { return kopya.prepare(sql).get()[alan]; } catch { return null; } };   // eski şemada tablo olmayabilir
      bilgi = { semaSurumu: bir('SELECT MAX(surum) AS v FROM schema_migrations', 'v'), oyuncuSayisi: bir('SELECT COUNT(*) AS v FROM players', 'v'), sonOdemeNo: bir('SELECT MAX(id) AS v FROM payouts', 'v') };
    } finally { kopya.close(); }

    await pipeline(fs.createReadStream(geciciDb), zlib.createGzip({ level: 6 }), ...(sifreli ? [sifreleyici(key)] : []), fs.createWriteStream(geciciCikti));
    fs.renameSync(geciciCikti, yol);
    const manifest = { surum: 1, dosya: ad, olusturma: new Date(t).toISOString(), olusturmaMs: t, sifreli, boyut: fs.statSync(yol).size, sha256: await sha256Dosya(yol), kaynakBoyut, ...bilgi };
    jsonYaz(yol + '.json', manifest);
    temizle();

    durumYaz(klasor, { sonBasariMs: t, sonDosya: ad, sonBoyut: manifest.boyut, hookHata: null });
    // Saklama: eski yedekler (ve manifestleri) birlikte silinir
    const liste = yedekleriListele(klasor);
    const tut = saklamaPlani(liste, t, saklama);
    const silinen = [];
    for (const y of liste) if (!tut.has(y.ad)) { fs.rmSync(path.join(klasor, y.ad), { force: true }); fs.rmSync(path.join(klasor, y.ad + '.json'), { force: true }); silinen.push(y.ad); }

    let hook = null;
    if (sonrasiKomut) {
      hook = await kancaCalistir(sonrasiKomut, { YEDEK_DOSYA: yol, YEDEK_MANIFEST: yol + '.json' }, log);
      durumYaz(klasor, { hookHata: hook.ok ? null : { kod: hook.kod, zaman: t, cikti: hook.cikti } });
    }
    log.info('Yedek alındı', { dosya: ad, boyut: manifest.boyut, sifreli, silinen: silinen.length, hook: hook ? hook.ok : undefined });
    return { dosya: ad, yol, manifest, hook, silinen };
  } catch (err) {
    temizle();
    try { durumYaz(klasor, { sonHata: String(err.message).slice(0, 500), sonHataMs: t }); } catch (e) { log.error('Yedek durum dosyası yazılamadı', { hata: e }); }
    log.error('Yedek alınamadı', { hata: err });
    throw err;
  }
}
