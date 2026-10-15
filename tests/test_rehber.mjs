// Oyun Rehberi (public/rehber.html): sayfa bütünlüğü ve oyundaki giriş noktaları.
//   1) her resim dosyası var, her iç bağlantı (#bölüm) var, bölüm kimlikleri benzersiz, CSP'ye uymayan satır içi betik/olay yok
//   2) oyunda: Ben menüsünde "Oyun rehberi" kartı, gezinme haritasında eylemi, komut paletinde girişi var
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUB } from '../js/ui/v3/hub.js';
import { komutListesi } from '../js/ui/v3/palet.js';
import { gitHaritasi } from '../js/ui/v3/kabuk.js';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(kok, 'public/rehber.html'), 'utf8');
let toplam = 0;
const ok = ad => { toplam++; console.log(`✅ ${ad}`); };

// 1) Sayfa
{
  const kimlikler = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(kimlikler).size, kimlikler.length, 'kimlikler benzersiz olmalı: ' + kimlikler.filter((k, i) => kimlikler.indexOf(k) !== i).join(','));
  const bolumler = [...html.matchAll(/<section class="bolum" id="([^"]+)"/g)].map(m => m[1]);
  assert.ok(bolumler.length >= 25, 'en az 25 bölüm: ' + bolumler.length);
  for (const m of html.matchAll(/href="#([^"]+)"/g)) assert.ok(kimlikler.includes(m[1]), `iç bağlantı hedefi yok: #${m[1]}`);
  for (const m of html.matchAll(/(?:src|href)="(rehber\/[^"]+)"/g)) assert.ok(fs.existsSync(path.join(kok, 'public', m[1])), `dosya yok: ${m[1]}`);
  const resimler = [...html.matchAll(/<img src="(rehber\/img\/[^"]+)"[^>]*>/g)];
  assert.ok(resimler.length >= 30, 'bol görsel: ' + resimler.length);
  for (const m of resimler) assert.match(m[0], /alt="[^"]{3,}"/, 'her resmin açıklaması (alt) olmalı: ' + m[1]);
  assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(html), 'satır içi betik olmamalı (CSP script-src self)');
  assert.ok(!/\son(click|load|error)=/i.test(html), 'satır içi olay işleyicisi olmamalı');
  assert.ok(html.includes('rehber/rehber.js') && html.includes('rehber/rehber.css'));
  ok(`Rehber sayfası: ${bolumler.length} bölüm, ${resimler.length} resim, bağlantılar ve dosyalar tam, satır içi betik yok`);
}

// 1b) Menü davranışı (15 Ekim 2026 hatası): menüdeki bağlantıyı scrollIntoView ile ortalamak sayfayı da kaydırıp tıklamayı
// bozuyordu; sayfa içi bağlantılar doğrudan hedefe gider ve görseller yüklendikçe yeniden hizalanır
{
  const js = fs.readFileSync(path.join(kok, 'public/rehber/rehber.js'), 'utf8');
  assert.ok(!js.includes('.scrollIntoView('), 'rehber.js menü için scrollIntoView kullanmamalı');
  assert.ok(js.includes('hizala(') && js.includes("behavior: 'instant'"), 'bölüme gitme yeniden hizalanmalı');
  ok('Rehber menüsü: tıklama hedefe doğrudan gider, menü sayfayı kaydırmaz');
}

// 2) Oyundaki giriş noktaları
{
  const kart = HUB.ben.ogeler.find(o => o.k === 'oyunrehberi');
  assert.ok(kart && /rehber/i.test(kart.ad), 'Ben menüsünde Oyun rehberi kartı');
  const girisler = gitHaritasi({ closeModal() {}, ekranAc() {}, zindanGir() {}, openWallet() {}, openOgretici() {}, openPanel() {} },
    { sekmeSec() {}, uyariMetni: () => [], turBaslat() {}, labAc() {}, ayarlarAc() {}, paletAc() {} });
  assert.equal(typeof girisler.oyunrehberi, 'function', 'gezinme haritasında eylem var');
  const palet = komutListesi({}).find(k => k.id === 'oyunrehberi');
  assert.ok(palet, 'Ara ve git (Ctrl+K) listesinde var');
  ok('Oyun içi girişler: Ben menüsü kartı, gezinme eylemi ve komut paleti kaydı var');
}

console.log(`\n${toplam} rehber kontrolü geçti.`);
process.exit(0);
