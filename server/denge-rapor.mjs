// "Bu haftanın denge raporuna bak": Denge İzleme raporunu (server/denge-rapor.js) veritabanından okuyup düz metin yazar. SALT OKUNUR.
// Sunucuda uygulama klasöründen çalışır (scripts/denge-rapor.sh uzaktan çağırır); yerelde de çalışır (DB_FILE, varsayılan ./data/realm.db).
//   node server/denge-rapor.mjs              son 7 gün
//   node server/denge-rapor.mjs --ay         son 30 gün
//   node server/denge-rapor.mjs --json       aynı rapor JSON olarak
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { rapor } from './denge-rapor.js';

const dosya = path.resolve(process.env.DB_FILE || './data/realm.db');
if (!fs.existsSync(dosya)) { console.error(`Veritabanı bulunamadı: ${dosya} (DB_FILE ile göster)`); process.exit(2); }
const raw = new DatabaseSync(dosya, { readOnly: true });
if (!raw.prepare("SELECT 1 FROM sqlite_master WHERE name = 'denge_gunluk'").get()) { console.error('Bu veritabanında denge tabloları yok (sunucu 010 geçişini henüz uygulamamış).'); process.exit(2); }
const r = rapor({ raw }, { pencere: process.argv.includes('--ay') ? 'ay' : 'hafta' });
if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }

const s = (v, n = 2) => (v == null ? '-' : String(Math.round(v * 10 ** n) / 10 ** n));
const yuzde = (v) => (v == null ? '-' : `%${Math.round(v * 100)}`);
const TUR = { dovme: 'dövme', yukselt: 'yükseltme', onar: 'tamir', hurda: 'hurda', asker_al: 'asker alımı', iyilestir: 'iyileştirme', seviye: 'seviye atlama', mod_katki: 'mod katkısı', mod_gecis: 'mod geçişi' };
console.log(`# Denge raporu: ${r.baslangic} → ${r.bitis} (${r.gunSayisi} gün). Veriler özet sayaçlardır; kişisel veri yok.`);
const t = r.tempo;
console.log(t ? `\n## Oyuncular (${t.gun} görüntüsü): ${t.oyuncu} oyuncu, ${t.aktif7} aktif (7 gün); ort. hesap seviyesi ${t.ortSeviye}; ort. ${t.ortAsker} asker (ort. seviye ${t.ortAskerSeviye}); asker hakkı dolu: ${t.hakDolu}; tam takımlı asker: ${t.tamTakimAsker}` : '\n## Oyuncular: henüz dağılım görüntüsü yok (günde bir kez alınır; panelden elle alınabilir)');
if (t) {
  const d = (ad, o) => { if (o && Object.keys(o).length) console.log(`   ${ad}: ${Object.entries(o).map(([k, v]) => `${k}=${v}`).join(', ')}`); };
  d('seviye', t.seviye); d('asker sayısı', t.asker); d('kuşanılan eşya seviyesi', t.takimEsyaSeviye); d('zindan ilerlemesi', t.zindan); d('mod', t.mod);
}
console.log('\n## Otomatik uyarılar');
if (!r.uyarilar.length) console.log('   (yok; yeterli veri yoksa kurallar çalışmaz: en az 20 savaş, 5 oyuncu)');
for (const u of r.uyarilar) console.log(`   [${u.seviye.toUpperCase()}] ${u.konu}: ${u.ileti}\n       → ${u.oneri}`);
const e = r.ekonomi;
console.log(`\n## Ekonomi: zindandan ${e.zindanKazanc} ASTRA kazanıldı (önceki ${e.oncekiZindanKazanc}); işlemlere ${e.harcanan} ASTRA harcandı (önceki ${e.oncekiHarcanan}); net ${e.net}; kazanç/harcama ${yuzde(e.kazancHarcamaOrani)}; tahmini yakım ${e.tahminiYakim} ASTRA; yakılan hammadde ${Object.entries(e.yakilanHammadde).map(([k, v]) => `${v} ${k}`).join(', ') || '-'}`);
console.log('\n## İşlemler (adet / önceki dönem / ASTRA / ret)');
for (const x of r.islemler) console.log(`   ${(TUR[x.tur] || x.tur).padEnd(14)} ${String(x.adet).padStart(5)} / ${String(x.oncekiAdet).padStart(5)} / ${String(x.astra).padStart(9)} / ${x.red}${Object.keys(x.hammadde).length ? '   yakılan: ' + Object.entries(x.hammadde).map(([k, v]) => `${v} ${k}`).join(', ') : ''}`);
console.log('\n## Zindan (mod · canavar: savaş, kazanma, ort. asker/asker sv./takım sv., ilk temizleme medyanı/hedef)');
if (!r.zindan.length) console.log('   (bu pencerede zindan savaşı yok)');
for (const z of r.zindan) console.log(`   ${z.modAd.padEnd(8)} Sv.${String(z.seviye).padStart(2)} ${z.ad.padEnd(26)} savaş ${String(z.giris).padStart(4)}  kazanma ${yuzde(z.oran).padStart(5)}  asker ${s(z.ortAsker, 1)}/${s(z.ortAskerSeviye, 1)}/${s(z.ortTakimSeviye, 1)}  ilk ${z.ilkOyuncu ? `${s(z.ilkMedyanGun, 1)}. gün (${z.ilkOyuncu} oyuncu)` : '-'} / hedef ${s(z.hedefGun, 1)}${z.ilkHedefOrani != null ? ` (×${s(z.ilkHedefOrani)})` : ''}`);
