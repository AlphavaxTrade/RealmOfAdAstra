// Yedek doğrulama ve GERİ YÜKLEME (kurumsal A9.4). İlke: canlı dosyaya ancak yedek tamamen doğrulandıktan SONRA dokunulur;
// eski dosya hiçbir zaman silinmez (yan yana ".oncesi-<damga>" adıyla saklanır); geri yüklemeden sonra ÖDEMELER OTOMATİK DURDURULUR:
// yedek eski bir andır, o andan sonra zincire gitmiş bir ödemeyi veritabanı bilmez, yeniden göndermek ÇİFT ÖDEME olur. İnsan zincirle
// karşılaştırır (docs/kurumsal/FELAKET_KURTARMA.md), sonra yönetici panelinden ödemeleri açar.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../db.js';
import { anahtarCoz, cozucuAkislari } from './sifre.js';

const damga = ms => { const iso = new Date(ms).toISOString(); return iso.slice(0, 10).split('-').join('') + '-' + iso.slice(11, 19).split(':').join(''); };

function manifestOku(dosya) {
  try { return JSON.parse(fs.readFileSync(dosya + '.json', 'utf8')); } catch { return null; }
}

async function shaHesapla(yol) {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(yol), h);
  return h.digest('hex');
}

// Yedeği (çöz + gunzip) hedef dosyaya aç; hata türüne göre AÇIK ileti
async function ac(dosya, anahtar, manifest, cikti) {
  const sifreli = manifest.sifreli === true;
  if (sifreli && !anahtar) throw new Error('Bu yedek şifreli: YEDEK_ANAHTAR (ya da --anahtar-dosya) gerekli');
  let akislar;
  try { akislar = sifreli ? cozucuAkislari(dosya, anahtarCoz(anahtar)) : [fs.createReadStream(dosya)]; } catch (err) { throw new Error(err.message); }
  try {
    await pipeline(...akislar, zlib.createGunzip(), fs.createWriteStream(cikti));
  } catch (err) {
    fs.rmSync(cikti, { force: true });
    throw new Error(sifreli ? 'Yedek şifresi çözülemedi: anahtar yanlış ya da dosya bozulmuş' : 'Yedek açılamadı: dosya bozulmuş (gzip: ' + err.message + ')');
  }
}

function butunlukDene(dbDosya) {
  const db = new DatabaseSync(dbDosya, { readOnly: true });
  try {
    const bt = db.prepare('PRAGMA integrity_check').all();
    return bt.length === 1 && bt[0].integrity_check === 'ok' ? null : JSON.stringify(bt).slice(0, 300);
  } finally { db.close(); }
}

// derin=false: manifest + boyut + sha256 (hızlı, dosya bozulmasını yakalar). derin=true: ayrıca açar ve SQLite bütünlük denetimi yapar.
export async function yedekDogrula({ dosya, anahtar = '', derin = false }) {
  const hatalar = [];
  const manifest = manifestOku(dosya);
  if (!manifest) return { ok: false, hatalar: ['manifest yok ya da okunamıyor: ' + path.basename(dosya) + '.json'], manifest: null };
  if (!fs.existsSync(dosya)) return { ok: false, hatalar: ['yedek dosyası yok'], manifest };
  if (fs.statSync(dosya).size !== manifest.boyut) hatalar.push('boyut uyuşmuyor: dosya eksik ya da bozulmuş');
  if (await shaHesapla(dosya) !== manifest.sha256) hatalar.push('sha256 uyuşmuyor: dosya bozulmuş');
  if (!hatalar.length && derin) {
    const gecici = path.join(fs.mkdtempSync(path.join(path.dirname(path.resolve(dosya)), '.tmp-dogrula-')), 'k.db');
    try {
      await ac(dosya, anahtar, manifest, gecici);
      const b = butunlukDene(gecici);
      if (b) hatalar.push('SQLite bütünlük denetimi başarısız: ' + b);
    } catch (err) { hatalar.push(err.message); }
    finally { fs.rmSync(path.dirname(gecici), { recursive: true, force: true }); }
  }
  return { ok: hatalar.length === 0, hatalar, manifest };
}

// Hedef veritabanı başka bir süreç (çalışan sunucu) tarafından açık mı? Günlük kipini DELETE'e çevirmek (WAL'i kontrol noktasına alır)
// yalnız tek bağlantı kalmışsa başarılır; başkası varsa "database is locked" (SQLITE_BUSY=5). Açılamayan/bozuk dosya engel DEĞİLDİR (felaket senaryosu).
function kullanimdaMi(dosya) {
  if (!fs.existsSync(dosya)) return false;
  let db;
  try {
    db = new DatabaseSync(dosya);
    db.exec('PRAGMA busy_timeout = 0');
    db.prepare('PRAGMA journal_mode = DELETE').get();
    return false;
  } catch (err) {
    return err.errcode === 5 || /locked|busy/i.test(String(err.message));
  } finally { try { db?.close(); } catch { /* açılamamış dosyada kapatılacak bir şey yok */ } }
}

export async function geriYukle({ dosya, hedefDbFile, anahtar = '', clock = Date.now, log = console }) {
  const d = await yedekDogrula({ dosya, anahtar });
  if (!d.ok) throw new Error('Yedek doğrulanamadı, geri yükleme yapılmadı: ' + d.hatalar.join('; '));
  const hedef = path.resolve(hedefDbFile);
  if (kullanimdaMi(hedef)) throw new Error('Hedef veritabanı kullanımda (sunucu çalışıyor olabilir): önce sunucuyu durdurun. Canlı dosyaya dokunulmadı.');
  fs.mkdirSync(path.dirname(hedef), { recursive: true });
  const t = clock();
  const gecici = `${hedef}.geri-${damga(t)}.tmp`;
  let oncesi = null;
  try {
    await ac(dosya, anahtar, d.manifest, gecici);                       // 1) hedefin yanına aç (canlıya henüz dokunulmadı)
    const b = butunlukDene(gecici);                                      // 2) bütünlük denetimi
    if (b) throw new Error('Yedek açıldı ama SQLite bütünlük denetiminden geçmedi: ' + b);
    const yanlar = ['', '-wal', '-shm'];                                 // 3) eski dosya (ve WAL/SHM'i BİRLİKTE) yan yana saklanır
    if (fs.existsSync(hedef)) {
      oncesi = `${hedef}.oncesi-${damga(t)}`;
      for (const y of yanlar) if (fs.existsSync(hedef + y)) fs.renameSync(hedef + y, oncesi + y);
    }
    try { fs.renameSync(gecici, hedef); }                                // 4) yeni dosya yerine
    catch (err) { if (oncesi) for (const y of yanlar) if (fs.existsSync(oncesi + y)) fs.renameSync(oncesi + y, hedef + y); throw err; }
  } finally { fs.rmSync(gecici, { force: true }); }

  // 5) Sunucunun kendi açılışıyla aç (eksik şema geçişleri uygulanır), ÖDEMELERİ DURDUR, olay yaz
  const db = openDb(hedef);
  try {
    db.kvSetJson('world:economy', { ...db.kvJson('world:economy', {}), paused: true });
    db.event('restore', null, { yedek: path.basename(dosya), yedekZamani: d.manifest.olusturma, oncesi: oncesi ? path.basename(oncesi) : null });
  } finally { db.close(); }
  log.warn('Yedekten geri yüklendi; ödemeler/çekimler DURDURULDU (zincirle karşılaştırmadan açmayın)', { yedek: path.basename(dosya), yedekZamani: d.manifest.olusturma, oncesi });
  return { hedef, oncesi, manifest: d.manifest, durduruldu: true };
}
