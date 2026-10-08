// Test Laboratuvarı senaryoları (js/dev/senaryolar.js) başsız çalışır: her senaryo TAZE bir oyun motorunda, arayüzdekiyle AYNI tanımla.
// Burada kırmızı çıkan bir senaryo, oyunun bir tasarım kuralının bozulduğu demektir (senaryonun "beklenen" adımları kuralı söyler).
import assert from 'node:assert/strict';

globalThis.localStorage = { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; }, clear() { this.store = {}; } };
const { GameStateManager } = await import('../js/gameState.js');
const { SENARYOLAR, KATEGORILER, senaryoCalistir } = await import('../js/dev/senaryolar.js');

// Yapı: benzersiz kimlik, bilinen kategori, ad/ne/kur/calistir ve en az bir beklenen adım
assert.equal(new Set(SENARYOLAR.map((s) => s.id)).size, SENARYOLAR.length, 'senaryo kimlikleri benzersiz olmalı');
for (const s of SENARYOLAR) {
  assert.ok(KATEGORILER.some((k) => k.id === s.kategori), `${s.id}: bilinmeyen kategori ${s.kategori}`);
  assert.ok(s.ad && s.ne, `${s.id}: ad ve "ne sınar" yazılı olmalı`);
  assert.equal(typeof s.kur, 'function'); assert.equal(typeof s.calistir, 'function');
  assert.ok(s.beklenen.length >= 1 && s.beklenen.every((b) => b.ad && typeof b.tamam === 'function'), `${s.id}: beklenen adımlar eksik`);
}
for (const k of KATEGORILER) assert.ok(SENARYOLAR.some((s) => s.kategori === k.id), `${k.id} kategorisinde senaryo yok`);
console.log(`✅ ${SENARYOLAR.length} senaryo, ${KATEGORILER.length} kategori: yapı doğru`);

// Her senaryo taze motorda geçmeli
const basarisiz = [];
for (const s of SENARYOLAR) {
  const gs = new GameStateManager();
  gs.vanillaReset();
  const r = senaryoCalistir(gs, s);
  if (r.gecti) console.log(`✅ ${s.kategori}/${s.id}: ${s.ad}`);
  else { basarisiz.push(`${s.id}: ${r.hata || r.adimlar.filter((a) => !a.tamam).map((a) => a.ad).join(' | ')}`); console.log(`❌ ${s.id}`); }
}
assert.deepEqual(basarisiz, [], 'başarısız senaryolar:\n' + basarisiz.join('\n'));

// Aynı senaryolar İLERLEMİŞ bir oyuncuda (seviye 30, bol ASTRA) ve ARKA ARKAYA da geçmeli: arayüzde canlı kayıtta, öncekinin bıraktığı durumla çalışırlar.
// (Bu deneme, "kur" adımının taze oyuna güvendiği senaryoları ve 24 saatten uzun seferleri yakalar.)
{
  const sorunlar = [];
  const gs = new GameStateManager();
  gs.vanillaReset(); gs.setDevLevel(30); gs.setDevAdAstra(2e6);
  for (const s of SENARYOLAR) { const r = senaryoCalistir(gs, s); if (!r.gecti) sorunlar.push(`${s.id}: ${r.hata || r.adimlar.filter((a) => !a.tamam).map((a) => a.ad).join(' | ')}`); }
  assert.deepEqual(sorunlar, [], 'seviye 30 + arka arkaya çalışınca başarısız senaryolar: ' + sorunlar.join(' ;; '));
  console.log('✅ ilerlemiş oyuncuda (seviye 30) arka arkaya hepsi geçti');
}

// Şansa bağlı eylemler (zindan savaşı, arena maçı) içeren senaryolar KARARSIZ olmamalı: beklentiler yalnız sonuçtan bağımsız kuralları sınar.
// (Bir senaryo yalnız bazı zarlarda kırmızı olursa, ya senaryo ya da oyunun bir kuralı yanlış anlaşılmıştır: ör. zaferde geri verilen arena anahtarı.)
{
  const sorunlar = {};
  for (let tur = 0; tur < 25; tur++) {
    const gs = new GameStateManager();
    gs.vanillaReset();
    if (tur % 2) { gs.setDevLevel(30); gs.setDevAdAstra(2e6); }
    for (const s of SENARYOLAR.filter((x) => ['zindan', 'kolezyum', 'ordu'].includes(x.kategori))) { const r = senaryoCalistir(gs, s); if (!r.gecti) sorunlar[s.id] = (sorunlar[s.id] || 0) + 1; }
  }
  assert.deepEqual(sorunlar, {}, 'şansa bağlı senaryolar kararsız (kaç turda kırmızı): ' + JSON.stringify(sorunlar));
  console.log('✅ zindan/kolezyum/ordu senaryoları 25 tekrarda kararlı');
}

// Senaryo çalıştırıcı bir hatayı yutmaz, "başarısız" diye raporlar
{
  const gs = new GameStateManager(); gs.vanillaReset();
  const r = senaryoCalistir(gs, { id: 'x', kur() {}, calistir() { throw new Error('patladı'); }, beklenen: [] });
  assert.equal(r.gecti, false); assert.match(r.hata, /patladı/);
  const bos = senaryoCalistir(gs, { id: 'y', kur() {}, calistir() {}, beklenen: [{ ad: 'hep yalan', tamam: () => false }] });
  assert.equal(bos.gecti, false);
  console.log('✅ çalıştırıcı hatayı ve başarısız beklentiyi doğru raporlar');
}

// Kontrol deneyi: oyunun bir kuralını BİLEREK bozunca ilgili senaryo kırmızı olmalı (yoksa senaryo hiçbir şeyi sınamıyor demektir)
{
  const bul = (id) => SENARYOLAR.find((s) => s.id === id);
  const bozuk = (id, yama) => { const gs = new GameStateManager(); gs.vanillaReset(); yama(gs); return senaryoCalistir(gs, bul(id)); };
  assert.equal(bozuk('silo-yuzde-80', (gs) => { gs.upgradeWarehouse = () => ({ success: true, message: 'tamam' }); }).gecti, false, '%80 kuralı kalkarsa senaryo kırmızı olmalı');
  assert.equal(bozuk('sefer-stamina-yok', (gs) => { gs.getExpeditionStaminaCost = () => 0; }).gecti, false, 'stamina kontrolü kalkarsa senaryo kırmızı olmalı');
  assert.equal(bozuk('ordu-astra-yok', (gs) => { gs.getSoldierCost = () => 0; }).gecti, false, 'asker bedeli sıfırlanırsa senaryo kırmızı olmalı');
  assert.equal(bozuk('pazar-al-sat-kayip', (gs) => { gs.marketSell = () => ({ success: true }); }).gecti, false, 'satım hiç ödeme almazsa/çalışmazsa senaryo kırmızı olmalı');
  assert.equal(bozuk('sefer-ikinci-sefer', (gs) => { const orijinal = gs.startExpedition.bind(gs); gs.startExpedition = (n) => { const r = orijinal(n); return r.success === false ? { ...r, success: true } : r; }; }).gecti, false, 'ikinci sefer kabul edilirse senaryo kırmızı olmalı');
  assert.equal(bozuk('zindan-stamina-yok', (gs) => { gs.deductDungeonStamina = () => ({ success: true }); }).gecti, false, 'zindan stamina kontrolü kalkarsa senaryo kırmızı olmalı');
  assert.equal(bozuk('zindan-kat-kilidi', (gs) => { gs.setDungeonProgress = () => { gs.state.dungeonProgress = 18; }; }).gecti, false, 'kat kilidi kalkarsa senaryo kırmızı olmalı');
  assert.equal(bozuk('zindan-harc-ve-antrenman', (gs) => { gs.getDungeonGateFee = () => 5; }).gecti, false, 'harç kuralı bozulursa senaryo kırmızı olmalı');
  assert.equal(bozuk('kolezyum-anahtar-yok', (gs) => { const o = gs.executeColosseum1v1Match.bind(gs); gs.executeColosseum1v1Match = (i) => { gs.state.arenaKeys = 5; return o(i); }; }).gecti, false, 'anahtar şartı kalkarsa senaryo kırmızı olmalı');
  assert.equal(bozuk('ordu-koylu-siniri', (gs) => { gs.getVillageInfo = () => ({ soldierCap: 99, villagers: 99 }); }).gecti, false, 'köylü sınırı bozulursa senaryo kırmızı olmalı');
  console.log('✅ kural bozulunca ilgili senaryolar kırmızı olur (10 kontrol deneyi)');
}
