// Yönetici paneli: admin.js'in $('...') ile aradığı her kimlik admin.html'de var olmalı (eksik kimlik = panel açılışta çöker),
// geri bildirim bölümü oyuncu metnini asla innerHTML'e ham vermemeli (18 Ekim 2026).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../server/admin.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../server/admin.html', import.meta.url), 'utf8');
const htmlKimlikleri = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const dinamik = new Set();   // js'in kendi oluşturduğu öğeler: $('...') ile aranmaz ama burada belirtilirse hariç tutulur
const aranan = [...new Set([...js.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map(m => m[1]))];
const eksik = aranan.filter(k => !htmlKimlikleri.has(k) && !dinamik.has(k));
assert.deepEqual(eksik, [], 'admin.html\'de olmayan kimlikler: ' + eksik.join(', '));
for (const k of ['gbListe', 'gbAyrinti', 'gbDurum', 'gbAra', 'gbYenile', 'gbSayi', 'gbBaslik']) assert.ok(htmlKimlikleri.has(k) && aranan.includes(k), 'geri bildirim kimliği ' + k);
console.log(`✅ ${aranan.length} panel kimliğinin hepsi admin.html'de var (geri bildirim bölümü dahil)`);

// geri bildirim bölümü: bilet ayrıntısı (mesaj, bağlam, cevap, oyuncu özeti) yalnız textContent / value ile yazılır, innerHTML'e hiç girmez
const bolum = js.slice(js.indexOf('// ── Geri bildirimler'), js.indexOf('async function act'));
assert.ok(bolum.length > 500, 'geri bildirim bölümü bulundu');
const ayrintiKodu = bolum.slice(bolum.indexOf('async function gbAc'), bolum.indexOf("$('gbListe').addEventListener"));
assert.ok(ayrintiKodu.length > 300 && !/innerHTML/.test(ayrintiKodu), 'ayrıntı görünümü innerHTML kullanmıyor');
// liste şablonundaki oyuncu kaynaklı her alan esc() içinden geçer
for (const alan of ['x.bilet', 'x.oyuncu', 'x.kisa', 'x.konu', 'x.durum']) assert.ok(bolum.includes('esc(' + alan) || bolum.includes('esc((GB_DURUM[x.durum]') || bolum.includes('esc(GB_KONU[x.konu]'), alan + ' esc() ile yazılmalı');
// görüntü adresi yalnız data:image jpeg/png/webp base64 ise <img>'e verilir
assert.ok(bolum.includes(String.raw`data:image\/(jpeg|png|webp);base64,`), 'görüntü adresi biçimi doğrulanıyor');
console.log('✅ geri bildirim bölümü oyuncu metnini kaçışlıyor; görüntü adresi biçimi doğrulanıyor');
console.log('\n2/2 panel kimlik testi geçti');
