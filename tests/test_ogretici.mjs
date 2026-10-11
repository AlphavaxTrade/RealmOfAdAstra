// Krallık Yolu (öğretici, 11 Ekim 2026): görev listesi tutarlılığı, ASTRA üst sınırı, "ilk kez" işaretleri, ekranı-gördü kancası,
// bölüm ve final ödülü (bir kez, kasadan), eski görev kimlikleri.
import assert from 'node:assert/strict';

globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] ?? null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};
const { GameStateManager } = await import('../js/gameState.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { OGRETICI_KOSULLARI, OGRETICI_GORULENLER, OGRETICI_ISARETLERI } = await import('../js/gameState/ogretici.js');
const { HUB } = await import('../js/ui/v3/hub.js');
const { yolHtml, yolOzeti } = await import('../js/ui/v3/ogretici.js');
const { ACTIONS } = await import('../server/actions.js');

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const fresh = () => { localStorage.clear(); ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset(); const gs = new GameStateManager(); gs.state.warehouseLevel = gs.getWarehouseMaxLevel(); return gs; };

const Q = GAME_CONFIG.ONBOARDING_QUESTS;
const S = GAME_CONFIG.ONBOARDING_SECTIONS;
const F = GAME_CONFIG.ONBOARDING_FINAL;

// 1) Liste tutarlılığı
{
  const idler = Q.map(q => q.id);
  assert.equal(new Set(idler).size, idler.length, 'görev kimlikleri benzersiz');
  assert.ok(Q.length >= 40, `en az 40 görev (var: ${Q.length})`);
  assert.equal(S.length, 10, '10 bölüm');
  for (const b of S) assert.ok(Q.filter(q => q.section === b.id).length >= 3, `${b.id}: en az 3 görev`);
  for (const q of Q) {
    assert.ok(S.some(b => b.id === q.section), `${q.id}: bölümü var`);
    assert.equal(typeof OGRETICI_KOSULLARI[q.id], 'function', `${q.id}: koşulu var`);
    assert.ok(q.title && q.desc && q.icon, `${q.id}: başlık, açıklama, simge`);
    assert.ok(q.rewardAda >= 0, `${q.id}: ödül sayı`);
  }
  for (const id of Object.keys(OGRETICI_KOSULLARI)) assert.ok(idler.includes(id), `koşul tablosunda fazlalık: ${id}`);
  ok(`${Q.length} görev, ${S.length} bölüm: kimlikler benzersiz, her görevin koşulu ve bölümü var`);
}

// 2) "Bana göster" anahtarları gerçek ekranlara gider
{
  const hubAnahtarlari = new Set(Object.values(HUB).flatMap(h => h.ogeler.map(o => o.k)).concat(['bolge']));
  for (const q of Q) assert.ok(hubAnahtarlari.has(q.show), `${q.id}: "${q.show}" bir hub ekranı değil`);
  ok('her görevin "Bana göster" hedefi var olan bir ekran');
}

// 3) ASTRA üst sınırı: görevler + bölüm ödülleri + final ≤ 1.000
{
  const toplam = Q.reduce((s, q) => s + q.rewardAda, 0) + S.reduce((s, b) => s + b.bonusAda, 0) + F.bonusAda;
  assert.ok(toplam <= 1000, `toplam ${toplam} ASTRA, üst sınır 1.000`);
  assert.ok(toplam >= 800, `toplam ${toplam} ASTRA: öğretici anlamlı bir ödül vermeli`);
  ok(`hesap başına toplam ödül ${toplam} ASTRA (≤ 1.000)`);
}

// 4) Eski görev kimlikleri korunur
{
  for (const id of ['first_expedition', 'first_harvest', 'three_expeditions', 'bot_trial', 'first_level_up', 'first_silo_upgrade', 'first_house', 'first_herb_heal', 'first_recycle', 'first_konsey']) {
    assert.ok(Q.some(q => q.id === id), `eski görev ${id} duruyor`);
  }
  ok('eski 10 görev kimliği korundu');
}

// 5) İşaretler: işlem başarılıysa "ilk kez" damgası düşer, başarısızsa düşmez
{
  const gs = fresh();
  gs.state.inventory.wheat = 5000;
  assert.equal(!!(gs.state.firsts || {}).marketSell, false);
  const kotu = gs.marketSell('wheat', 0);
  assert.equal(!!(kotu && kotu.success), false);
  assert.equal(!!(gs.state.firsts || {}).marketSell, false, 'başarısız satış işaret koymaz');
  const iyi = gs.marketSell('wheat', 10);
  assert.equal(iyi.success, true, iyi.message);
  assert.ok((gs.state.firsts || {}).marketSell, 'başarılı satış işareti koyar');
  gs.state.adAstraBalance = 1000;
  const al = gs.marketBuy('wood', 1);
  assert.equal(al.success, true, al.message);
  assert.ok(gs.state.firsts.marketBuy, 'başarılı alım işareti koyar');
  gs.checkOnboardingProgress();
  assert.equal(gs.state.onboarding.market_sell.done, true);
  assert.equal(gs.state.onboarding.market_buy.done, true);
  ok('pazar alım/satımı görev işaretini yalnız başarılıysa düşürür ve görevi tamamlar');
}
{
  // sarmalanan her yöntem gerçekten var (yazım hatası modül yüklenirken zaten hata verir; burada liste de boş değil)
  assert.ok(OGRETICI_ISARETLERI.length >= 15);
  ok('işaret sarmalayıcıları kuruldu');
}

// 6) Ekranı-gördü: yalnız izinli anahtar, görevi tamamlar, ikinci çağrı zararsız
{
  const gs = fresh();
  assert.equal(gs.ogreticiGordu('__proto__').success, false);
  assert.equal(gs.ogreticiGordu('bilinmeyen').success, false);
  assert.equal(gs.ogreticiGordu('merkez').success, true);
  assert.equal(gs.state.onboarding.panel_merkez.done, true, 'Krallık merkezi görevi tamamlandı');
  const once = JSON.stringify(gs.state.onboarding.panel_merkez);
  assert.equal(gs.ogreticiGordu('merkez').success, true);
  assert.equal(JSON.stringify(gs.state.onboarding.panel_merkez), once, 'ikinci çağrı durumu değiştirmez');
  // her izinli anahtarın tamamladığı en az bir görev var (ölü anahtar kalmasın)
  for (const k of OGRETICI_GORULENLER) {
    const g2 = fresh();
    const once = Object.values(g2.state.onboarding || {}).filter(x => x && x.done).length;
    assert.equal(g2.ogreticiGordu(k).success, true);
    const sonra = Object.values(g2.state.onboarding || {}).filter(x => x && x.done).length;
    assert.ok(sonra > once, `${k}: bir görevi tamamlamalı`);
  }
  ok('ekranı-gördü kancası yalnız izinli anahtarları kabul eder ve idempotenttir');
}

// 7) Sunucu beyaz listesi yeni işlemleri tanır
{
  assert.ok(Object.hasOwn(ACTIONS, 'claimOnboardingSection'));
  assert.ok(Object.hasOwn(ACTIONS, 'ogreticiGordu'));
  ok('sunucu beyaz listesinde claimOnboardingSection ve ogreticiGordu var');
}

// 8) Bölüm ödülü: bölüm bitmeden alınmaz, bitince bir kez, kasadan; final bütün bölümlerden sonra
{
  const gs = fresh();
  const b0 = S[0];
  assert.equal(gs.claimOnboardingSection(b0.id).success, false, 'bölüm bitmeden alınamaz');
  assert.equal(gs.claimOnboardingSection('yok_boyle_bolum').success, false);
  assert.equal(gs.claimOnboardingSection(F.id).success, false, 'final bölümlerden önce alınamaz');
  const kasaOnce = treasury.getPool ? treasury.getPool('quest') : null;
  const bakiyeOnce = gs.state.adAstraBalance;
  gs.state.onboarding = gs.state.onboarding || {};
  for (const q of Q.filter(x => x.section === b0.id)) gs.state.onboarding[q.id] = { done: true, claimed: true, at: 1 };
  const r = gs.claimOnboardingSection(b0.id);
  assert.equal(r.success, true, r.message);
  assert.equal(r.granted, Math.floor(b0.bonusAda), 'bölüm ödülü tam sayıya iner');
  assert.equal(gs.state.adAstraBalance, bakiyeOnce + r.granted);
  if (kasaOnce != null) assert.ok(treasury.getPool('quest') <= kasaOnce, 'ödül görev kasasından çıkar');
  assert.equal(gs.claimOnboardingSection(b0.id).success, false, 'ikinci kez alınamaz');
  // diğer bölümler
  for (const b of S.slice(1)) {
    for (const q of Q.filter(x => x.section === b.id)) gs.state.onboarding[q.id] = { done: true, claimed: true, at: 1 };
    assert.equal(gs.claimOnboardingSection(b.id).success, true);
  }
  const f = gs.claimOnboardingSection(F.id);
  assert.equal(f.success, true, f.message);
  assert.equal(gs.claimOnboardingSection(F.id).success, false, 'final bir kez');
  ok('bölüm ve final ödülü: koşullu, bir kez, kasadan');
}

// 9) Ekran verisi: bölüm özeti ve HTML kaçırma
{
  const gs = fresh();
  const veri = gs.getOnboardingSections();
  assert.equal(veri.sections.length, S.length);
  assert.equal(veri.sections.reduce((s, b) => s + b.total, 0), Q.length);
  const html = yolHtml(veri, () => null);
  assert.ok(html.includes('Krallık Yolu') && html.includes('data-ogretici-goster'));
  const oz = yolOzeti(veri);
  assert.equal(oz.toplam, Q.length);
  assert.equal(oz.biten, 0);
  // kötü niyetli başlık kaçırılır
  veri.sections[0].tasks[0].title = '<img src=x onerror=alert(1)>';
  assert.ok(!yolHtml(veri, () => null).includes('<img src=x'), 'görev başlığı kaçırılır');
  ok('Krallık Yolu ekranı: bölümler, sıradaki görev, HTML kaçırma');
}

console.log(`\n${passed} öğretici kontrolü geçti.`);
