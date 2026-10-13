// 11 Ekim 2026 ön yüz taramasından düzeltilen bulguların gerileme testleri: çift dokunma koruması, bozuk kayıttaki sayı
// alanları, oyuncu adındaki yönlendirici/görünmez karakterler, engellenmiş depolama, bildirim sınıfı.
import assert from 'node:assert/strict';

// 1) Ekran çekirdeği: bir eylem sürerken gelen ikinci dokunuş yok sayılır
{
  const { ac, baglamKur, ekranKaydet } = await import('../js/ui/ekran/cekirdek.js');
  const dinleyiciler = {};
  const sahteKok = {
    scrollTop: 0, firstElementChild: { dataset: {} },
    contains: () => true, querySelector: () => null, querySelectorAll: () => [],
    addEventListener(tur, fn) { dinleyiciler[tur] = fn; }
  };
  globalThis.document = { activeElement: null };
  globalThis.CSS = { escape: (s) => s };
  baglamKur({ panelKok: () => sahteKok, panelYaz() {}, bildir() {}, hudYenile() {}, kilit: () => null, panelAcik: () => true });
  let cagri = 0;
  let birak;
  const bekle = new Promise((r) => { birak = r; });
  ekranKaydet({
    id: 'cift-dokunus', baslik: () => ['🧪', 'Deneme'], govde: () => '<div class="ek"></div>',
    eylemler: { harca: async () => { cagri++; await bekle; } }
  });
  ac('cift-dokunus');
  const dugme = { dataset: { e: 'harca' }, disabled: false, getAttribute: () => null };
  const olay = { target: { closest: () => dugme }, stopPropagation() {}, preventDefault() {} };
  dinleyiciler.click(olay);
  dinleyiciler.click(olay);   // ikinci dokunuş: ilk eylem bitmeden
  dinleyiciler.click(olay);
  assert.equal(cagri, 1, 'sürerken gelen dokunuşlar yok sayılır');
  birak();
  await new Promise((r) => setTimeout(r, 20));
  dinleyiciler.click(olay);
  assert.equal(cagri, 2, 'eylem bitince yeni dokunuş çalışır');
}
console.log('✅ çift dokunma koruması');

// 2) Oyuncu adı: yönlendirici ve görünmez karakterler atılır
{
  const { cleanName } = await import('../js/gameState/ortak.js');
  assert.equal(cleanName('A⁦B⁩C'), 'ABC', 'çift yönlü izolatlar atılır');
  assert.equal(cleanName('﻿Ad⁠Soyad'), 'AdSoyad', 'BOM ve kelime birleştirici atılır');
  assert.equal(cleanName('<b>Ali</b>'), 'bAli/b', 'HTML işaretleri atılır (< ve > yok)');
}
console.log('✅ oyuncu adı temizliği');

// 3) Hasarlı kayıt: sayı alanları geçersizse başlangıca döner (ekranlar NaN yazmaz, stamina NaN kalmaz)
{
  const depo = new Map();
  globalThis.localStorage = {
    getItem: (k) => (depo.has(k) ? depo.get(k) : null),
    setItem: (k, v) => { depo.set(k, String(v)); },
    removeItem: (k) => { depo.delete(k); }
  };
  const { GameStateManager } = await import('../js/gameState.js');
  const ilk = new GameStateManager();
  const anahtar = ilk.storageKey;
  depo.set(anahtar, JSON.stringify({ level: null, stamina: 'x', adAstraBalance: 'abc', currentXp: '7' }));
  const gs = new GameStateManager();
  assert.ok(Number.isFinite(gs.state.level) && gs.state.level >= 1);
  assert.ok(Number.isFinite(gs.state.stamina) && gs.state.stamina >= 0);
  assert.ok(Number.isFinite(gs.state.adAstraBalance) && gs.state.adAstraBalance >= 0);
  assert.equal(gs.state.currentXp, 7, 'sayıya çevrilebilen metin korunur');
  assert.equal(gs.startExpedition('wood').success !== undefined, true);
}
console.log('✅ bozuk kayıt sayı alanları');

// 4) Engellenmiş depolama: localStorage erişimi hata fırlatsa da depolama modülü çökmez
{
  const { hasStorage } = await import('../js/storage.js');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  assert.equal(hasStorage(), false);
  delete globalThis.localStorage;
}
console.log('✅ engellenmiş depolama');

// 5) Bildirim sınıfı: bilinmeyen tür serbest sınıf olarak girmez
{
  const { kurToast } = await import('../js/ui/toast.js');
  const eklenen = [];
  const sahteKap = { appendChild: (e) => eklenen.push(e) };
  const kayit = [];
  const roller = [];
  globalThis.document = { createElement: () => ({ style: {}, append() {}, set className(v) { kayit.push(v); }, setAttribute(a, v) { if (a === 'role') roller.push(v); }, remove() {} }) };
  const toast = kurToast(sahteKap);
  toast('x', 'success"><img src=x');
  toast('y', 'error');
  assert.deepEqual(kayit, ['toast info', 'toast error']);
  assert.deepEqual(roller, ['status', 'alert'], 'bildirim ekran okuyucuya duyurulur: hata alert, diğerleri status (denetim QA-05)');
}
console.log('✅ bildirim sınıfı');

console.log('\n5/5 ön yüz tarama düzeltmesi bloğu geçti.');
