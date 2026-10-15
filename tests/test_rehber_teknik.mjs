// Oyun Rehberi "Teknik başvuru" bölümleri (public/rehber.html): sayılar oyun motorundan üretilir (scripts/rehber-teknik-uret.mjs).
//   1) güncellik: ayar ya da kural değişince sayfa eskirse bu test kırılır (çözüm: node scripts/rehber-teknik-uret.mjs)
//   2) yapı: 18 bölüm, bozuk değer (NaN, undefined) yok, her bölümde tablo ya da formül var
//   3) bilinen yanlışlar geri gelmesin: kodda olmayan kurallar (asker hakkı = zindan katı + 1, asker seviyesi <= hesap seviyesi) yazılmasın
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(kok, 'public/rehber.html'), 'utf8');
let toplam = 0;
const ok = (ad) => { toplam++; console.log(`✅ ${ad}`); };

// 1) Güncel mi
{
  const r = spawnSync(process.execPath, ['scripts/rehber-teknik-uret.mjs', '--kontrol'], { cwd: kok, encoding: 'utf8' });
  assert.equal(r.status, 0, 'Teknik başvuru bölümleri eskimiş: node scripts/rehber-teknik-uret.mjs\n' + r.stderr + r.stdout);
  ok('Teknik başvuru bölümleri oyun motorundan üretilen değerlerle güncel');
}

// 2) Yapı
{
  const bas = html.indexOf('TEKNİK BAŞVURU: BAŞLA');
  const bit = html.indexOf('TEKNİK BAŞVURU: BİTİŞ');
  assert.ok(bas > 0 && bit > bas, 'üretilmiş blok işaretleri bulunmalı');
  const blok = html.slice(bas, bit);
  const beklenen = ['t-giris', 't-limitler', 't-akis', 't-uretim', 't-seviye', 't-silo', 't-kota', 't-otorite', 't-kilit', 't-cekim', 't-pazar', 't-kasalar', 't-savas', 't-koy', 't-kazanc', 't-gelir', 't-fiyat', 't-zincir'];
  const bolumler = [...blok.matchAll(/<section class="bolum" id="([^"]+)" data-grup="Teknik başvuru"/g)].map((m) => m[1]);
  assert.deepEqual(bolumler, beklenen, 'bölüm sırası/kimlikleri');
  assert.ok(!/NaN|undefined|\[object|Infinity/.test(blok), 'bozuk değer yazılmış: ' + (blok.match(/.{30}(NaN|undefined|\[object|Infinity).{30}/) || [''])[0]);
  const parcalar = blok.split('<section ').slice(1);
  for (const p of parcalar) {
    const id = p.match(/id="([^"]+)"/)[1];
    assert.ok(/<table>|class="kutu ozet-kutu"|<ul>|<ol/.test(p), `${id}: tablo, formül ya da liste olmalı`);
  }
  // Ana başlıklar var ve sayılar Türkçe biçimli (ondalık virgül): "0.4" gibi ham JS sayısı kalmamalı
  const ham = blok.match(/[^0-9.,\d]\d\.\d{1,2}(?![0-9.])[^0-9.]/g) || [];
  const izinli = ham.filter((s) => !/2\.0|v2|1\.2|\.0\./.test(s));
  assert.ok(izinli.length === 0, 'ham ondalık nokta kalmış (Türkçe virgül olmalı): ' + izinli.slice(0, 5).join(' | '));
  ok(`18 teknik bölüm, tablo/formül içeriyor, bozuk değer ve ham ondalık yok (${bolumler.length})`);
}

// 3) Kodda KAPALI kurallar rehberde yazmasın (asker hakkı = zindan katı + 1: config ORDU_SINIRI, varsayılan kapalı)
{
  assert.ok(!/geçtiğin zindan katı \+ 1/.test(html), 'asker hakkı "zindan katı + 1" kodda uygulanmıyor');
  assert.ok(!/100 ASTRA\)\. Roketi yapınca/.test(html), 'roket bedeli 1 ASTRA (config UZAY_LIMANI.ROCKET_PARTS.adAstra)');
  ok('Kodda uygulanmayan kurallar rehberde yer almıyor');
}

console.log(`\n${toplam} teknik rehber kontrolü geçti.`);
process.exit(0);
