// Bildirim merkezi: liste kuralları (sınır, okundu) ve panel HTML'inin kaçışı.
import assert from 'node:assert/strict';
import { bildirimEkle, okunmamisSayisi, hepsiniOkunduYap, bildirimPaneliHtml, BILDIRIM_SINIRI } from '../js/ui/v3/bildirim.js';

const liste = [];
bildirimEkle(liste, '⚔️', 'Maç kazanıldı', 1000);
bildirimEkle(liste, null, 'Sefer toplandı', 2000);
assert.equal(liste.length, 2);
assert.equal(liste[0].metin, 'Sefer toplandı', 'en yeni üstte');
assert.equal(liste[0].simge, '🔔', 'simge yoksa zil');
assert.equal(okunmamisSayisi(liste), 2);
hepsiniOkunduYap(liste);
assert.equal(okunmamisSayisi(liste), 0);

// Sınır: liste sınırsız büyümez
for (let i = 0; i < BILDIRIM_SINIRI + 20; i++) bildirimEkle(liste, '🔔', `olay ${i}`, 3000 + i);
assert.equal(liste.length, BILDIRIM_SINIRI);
assert.equal(liste[0].metin, `olay ${BILDIRIM_SINIRI + 19}`);

// Panel: en çok 10 bildirim, bot uyarısı en üstte, metinler kaçışlı
{
  const l = [];
  bildirimEkle(l, '🗡️', '<img src=x onerror=alert(1)> seni yendi', 5000);
  const html = bildirimPaneliHtml(l, { title: 'Bot <b>durdu</b>', text: 'Eksik: 50 "Demir"' });
  assert.ok(!/<img/.test(html) && !/<b>durdu/.test(html), 'etiket kaçışlanır');
  assert.ok(html.includes('&lt;img'), 'oyuncu metni düz yazı olarak görünür');
  assert.ok(html.indexOf('is-uyari') < html.indexOf('is-yeni'), 'uyarı bildirimlerden önce gelir');
  assert.ok(html.includes('data-bildirim-temizle'));

  const cok = [];
  for (let i = 0; i < 30; i++) bildirimEkle(cok, '🔔', `m${i}`, 6000 + i);
  assert.equal((bildirimPaneliHtml(cok).match(/v3-bildirim-oge/g) || []).length, 10, 'en çok 10 satır');
  assert.ok(bildirimPaneliHtml([]).includes('Yeni bildirim yok'));
  assert.ok(!bildirimPaneliHtml([]).includes('v3-bildirim-oge'));
}
console.log('✅ v3 bildirim merkezi: liste ve panel');
