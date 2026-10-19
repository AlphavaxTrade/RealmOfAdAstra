// Arayüzün küçük parçaları: yükleme sözleri, zindan ganimet şansı, üst çubuk verisi ve ekranların "görüldü" kancası.
// DOM'a dokunmayan saf işlevler doğrudan, ekran çekirdeği ise küçük bir sahte belgeyle denenir.
import assert from 'node:assert/strict';
import { sozSirasi } from '../js/ui/yukleme.js';
import { ganimetSanslari } from '../js/ui/zindan/plan.js';
import { botDurumu, bakiyeYazisi, hudVerisi } from '../js/ui/hud-verisi.js';
import { ac, baglamKur, ekranKaydet } from '../js/ui/ekran/cekirdek.js';

// 1) Yükleme sözü yüzdeye göre dört basamak
assert.equal(sozSirasi(0), 0);
assert.equal(sozSirasi(30), 0);
assert.equal(sozSirasi(31), 1);
assert.equal(sozSirasi(61), 2);
assert.equal(sozSirasi(99), 3);
console.log('✅ yükleme sözleri');

// 2) Boss katlarında (3 ve 6) parça ve kutu şansı iki katı
{
  const gs = { getFragmentDropRate: (lv) => 0.01 * lv, getBoxDropRate: (lv) => 0.001 * lv, formatDropChance: (r) => `%${(r * 100).toFixed(2)}` };
  const normal = ganimetSanslari(gs, 5, 2);
  const boss = ganimetSanslari(gs, 5, 3);
  assert.equal(normal.boss, false);
  assert.equal(boss.boss, true);
  assert.equal(ganimetSanslari(gs, 5, 6).boss, true);
  assert.ok(Math.abs(normal.parca.etkin - 0.05) < 1e-12);
  assert.ok(Math.abs(boss.parca.etkin - 0.1) < 1e-12);
  assert.ok(Math.abs(boss.kutu.etkin - 0.01) < 1e-12);
  assert.equal(boss.parca.taban, normal.parca.taban, 'taban şans kata bağlı değil');
}
console.log('✅ zindan ganimet şansı');

// 3) Üst çubuk verisi: kaynak yüzdesi sınırlanır, bot durumu üç hâl, bakiye dar ekranda kısalır
{
  const gs = {
    state: { level: 7, stamina: 41.8, adAstraBalance: 1234567.891, inventory: { wood: 500, iron: 0, fragments: 12 } },
    getMaxStamina: () => 100,
    getWarehouseCapacity: () => ({ wood: 1000, iron: 0 }),
    isBotPaused: () => false,
    isAutoCollectorActive: () => true,
    getAutoCollectorRemainingText: () => '5 sa 10 dk',
    checkBotPrerequisites: () => ({ missingText: 'demir' })
  };
  const v = hudVerisi({ gs, kaynaklar: ['wood', 'iron'], okunmamis: 3, danisman: { advice: '<b>Sefer</b> gönder', action: 'open_dashboard' }, darEkran: false });
  assert.equal(v.seviye, 'Lv.7');
  assert.equal(v.staminaMetin, '41/100');
  assert.equal(Math.round(v.staminaYuzde), 41);
  assert.equal(v.xpYuzde, 0, 'gs XP bilgisi vermiyorsa XP çubuğu 0 (NaN değil)');
  assert.equal(v.kaynaklar.wood.yuzde, 50);
  assert.equal(v.kaynaklar.iron.yuzde, 0, 'kapasite 0 ise yüzde 0 (NaN değil)');
  assert.equal(v.kaynaklar.fragments.deger, '12');
  assert.equal(v.bot.durum, 'on');
  assert.equal(v.bildirim, 3);
  assert.equal(v.danisman.metin, 'Sefer gönder', 'danışman metninden etiketler atılır');
  assert.equal(v.danisman.baslik, 'Kralın Danışmanı');
  assert.ok(!/NaN|undefined/.test(JSON.stringify(v)));

  assert.equal(botDurumu({ ...gs, isBotPaused: () => true }).durum, 'paused');
  assert.match(botDurumu({ ...gs, isBotPaused: () => true }).ipucu, /demir/);
  assert.equal(botDurumu({ ...gs, isAutoCollectorActive: () => false }).durum, 'off');

  const dar = bakiyeYazisi(1234567.891, true);
  const genis = bakiyeYazisi(1234567.891, false);
  assert.ok(dar.length < genis.length, `dar ekranda bakiye kısalmalı (${dar} / ${genis})`);
  assert.equal(bakiyeYazisi(500, true), bakiyeYazisi(500, false), '100 binin altı kısaltılmaz');
}
console.log('✅ üst çubuk verisi');

// 4) Ekran çekirdeği: ekran çizilince "görüldü" anahtarı bildirilir (düz anahtar, işlev ve dizi); hata çizimi bozmaz
{
  const sahteKok = {
    scrollTop: 0, firstElementChild: { dataset: {} },
    contains: () => false, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}
  };
  globalThis.document = { activeElement: null };
  globalThis.CSS = { escape: (s) => s };
  const gorulenler = [];
  baglamKur({
    panelKok: () => sahteKok,
    panelYaz: () => {},
    bildir() {}, hudYenile() {}, kilit: () => null,
    goruldu: (a) => gorulenler.push(a)
  });
  ekranKaydet({ id: 'dene-duz', goruldu: 'merkez', baslik: () => ['🏰', 'a'], govde: () => '<div class="ek"></div>' });
  ekranKaydet({ id: 'dene-islev', goruldu: (b, s) => (s.sekme === 'lig' ? ['lig', 'havuzlar'] : null), baslik: () => ['🏆', 'b'], govde: () => '<div class="ek"></div>' });
  ekranKaydet({ id: 'dene-hata', goruldu: () => { throw new Error('kanca bozuk'); }, baslik: () => ['⚠️', 'c'], govde: () => '<div class="ek"></div>' });

  ac('dene-duz');
  assert.deepEqual(gorulenler, ['merkez']);
  ac('dene-islev', { sekme: 'duel' });
  assert.deepEqual(gorulenler, ['merkez'], 'koşul tutmazsa bildirilmez');
  ac('dene-islev', { sekme: 'lig' });
  assert.deepEqual(gorulenler, ['merkez', 'lig', 'havuzlar']);
  const uyari = console.warn;
  console.warn = () => {};
  try { assert.doesNotThrow(() => ac('dene-hata')); } finally { console.warn = uyari; }
}
console.log('✅ ekran "görüldü" kancası');

console.log('\n4/4 arayüz parçası testi geçti.');
