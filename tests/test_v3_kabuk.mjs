// Arayüz v3: gezinme verisi ve ortak bileşenlerin saf (DOM'suz) kuralları.
// Tarayıcı davranışı (açılma, kapanma, ekran taşması) burada denenmez; o iş scripts/tarayici/v3.mjs ile elle yapılır.
import assert from 'node:assert/strict';
import { SEKMELER, HUB, hubHtml, esc } from '../js/ui/v3/hub.js';
import { gitHaritasi } from '../js/ui/v3/kabuk.js';
import { istatSatiri, bosDurum, iskelet } from '../js/ui/v3/bilesenler.js';

// 1) Alt çubuk: tam 5 sekme (CSS ızgarası repeat(5)), kimlikler benzersiz, Harita ilk
assert.equal(SEKMELER.length, 5, 'alt çubuk 5 sekme olmalı (css/v3/kabuk.css repeat(5))');
assert.equal(new Set(SEKMELER.map((t) => t.id)).size, 5);
assert.equal(SEKMELER[0].id, 'harita');
for (const t of SEKMELER.filter((x) => x.id !== 'harita')) assert.ok(HUB[t.id], `${t.id} sekmesinin ana listesi olmalı`);
console.log('✅ sekmeler');

// 2) Her liste öğesinin bir eylemi var; anahtarlar bütün listelerde benzersiz; ölü eylem yok
const sahteApi = new Proxy({}, { get: (_, ad) => (ad === 'duyurular' ? () => [] : () => {}) });
const git = gitHaritasi(sahteApi, { yanAc() {}, sekmeSec() {}, uyariMetni: () => [] });
const anahtarlar = Object.values(HUB).flatMap((h) => h.ogeler.map((o) => o.k));
assert.equal(new Set(anahtarlar).size, anahtarlar.length, 'öğe anahtarları benzersiz olmalı');
for (const k of anahtarlar) assert.equal(typeof git[k], 'function', `${k} öğesinin eylemi yok`);
for (const k of Object.keys(git)) assert.ok(anahtarlar.includes(k), `${k} eylemi hiçbir listede yok (ölü eylem)`);
console.log(`✅ ${anahtarlar.length} öğe, hepsinin eylemi var`);

// 3) Ana liste HTML'i: kilitli öğe nedenini gösterir; metin kaçırılır; yalnız-test öğesi gizlenir
{
  const kilitli = (k) => (k === 'barracks' ? { reason: 'Önce <şunu> yap' } : null);
  const html = hubHtml('savas', kilitli, false);
  assert.match(html, /is-kilitli/);
  assert.match(html, /🔒 Önce &lt;şunu&gt; yap/, 'kilit nedeni kaçırılmış olmalı');
  assert.ok(!html.includes('<şunu>'));
  assert.match(html, /data-v3-git="zindan"/);
  assert.equal((html.match(/is-kilitli/g) || []).length, 1, 'yalnız kilitli öğe işaretlenmeli');
  assert.ok(!hubHtml('ben', null, false).includes('data-v3-git="test"'), 'deneme sürümü yoksa test menüsü görünmemeli');
  assert.ok(hubHtml('ben', null, true).includes('data-v3-git="test"'));
}
console.log('✅ ana liste');

// 4) Ortak bileşenler her metni kaçırır
assert.equal(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
assert.match(istatSatiri('A<b>', '1<2', { ipucu: '"q"', ton: 'kotu' }), /v3-ton-kotu.*title="&quot;q&quot;".*A&lt;b&gt;.*1&lt;2/s);
assert.ok(!istatSatiri('a', 'b', { ton: '" onclick="x' }).includes('onclick'), 'bilinmeyen ton sınıfa girmemeli');
assert.ok(!bosDurum('📦', '<img src=x>', 'm').includes('<img'));
assert.equal((iskelet(3).match(/<i><\/i>/g) || []).length, 3);
assert.equal((iskelet(99).match(/<i><\/i>/g) || []).length, 8, 'iskelet satırı sınırlı');
console.log('✅ bileşenler');
