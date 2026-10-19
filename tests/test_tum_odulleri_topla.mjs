// "Tüm ödülleri topla" (19 Ekim 2026): hazır görev ödülleri, tamamlanan bölümlerin ödülleri ve (açıldıysa) final tek adımda alınır;
// aynı ödül iki kez verilmez; haftalık ödeme payı dolarsa kalan yeni haftaya bırakılır; düğmeler kartta ve panelde görünür.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { treasury } = await import('../js/treasury.js');
const { yolKutusu } = await import('../js/ui/yol.js');
const { yolHtml } = await import('../js/ui/v3/ogretici.js');

const yeni = () => {
  depo.clear();
  treasury.reset();
  treasury.state.pools.quest = 1e9;
  const gs = new GameStateManager();
  gs.state.adAstraBalance = 0;
  return gs;
};
const gorevler = GAME_CONFIG.ONBOARDING_QUESTS;
const bolumler = GAME_CONFIG.ONBOARDING_SECTIONS;

// 1) hiçbir şey hazır değilken
{
  const gs = yeni();
  const r = gs.claimAllOnboarding();
  assert.equal(r.success, false);
  assert.equal(r.count, 0);
}

// 2) yalnız ilk bölümün görevleri bitti: görev ödülleri + o bölümün ödülü; diğer bölümlere dokunulmaz
{
  const gs = yeni();
  const ilk = bolumler[0];
  const ilkGorevler = gorevler.filter((q) => q.section === ilk.id);
  gs.state.onboarding = Object.fromEntries(ilkGorevler.map((q) => [q.id, { done: true, claimed: false }]));
  // kasa tam sayı öder (kesirli artık kasada kalır): her ödül ayrı yuvarlanır
  const beklenen = ilkGorevler.reduce((s, q) => s + Math.floor(q.rewardAda || 0), 0) + Math.floor(ilk.bonusAda || 0);
  const r = gs.claimAllOnboarding();
  assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(r.count, ilkGorevler.length + 1, 'her görev + bölüm ödülü');
  assert.equal(Math.round(r.granted), Math.round(beklenen));
  assert.equal(Math.round(gs.state.adAstraBalance), Math.round(beklenen), 'bakiye verilen kadar artar');
  assert.ok(ilkGorevler.every((q) => gs.state.onboarding[q.id].claimed));
  assert.equal(gs.state.onboardingSections[ilk.id].claimed, true);
  assert.ok(!(gs.state.onboardingSections[bolumler[1].id] || {}).claimed, 'bitmemiş bölüm alınmaz');
  // ikinci basış ödülü tekrar vermez
  const bakiye = gs.state.adAstraBalance;
  const r2 = gs.claimAllOnboarding();
  assert.equal(r2.success, false);
  assert.equal(gs.state.adAstraBalance, bakiye);
}

// 3) bütün görevler bitti: tek seferde görevler, bütün bölümler ve final
{
  const gs = yeni();
  gs.state.onboarding = Object.fromEntries(gorevler.map((q) => [q.id, { done: true, claimed: false }]));
  const r = gs.claimAllOnboarding();
  assert.equal(r.success, true);
  assert.equal(r.count, gorevler.length + bolumler.length + 1);
  const final = GAME_CONFIG.ONBOARDING_FINAL;
  assert.equal(gs.state.onboardingSections[final.id].claimed, true, 'final unvan da alınır');
  assert.equal(gs.getOnboardingSections().sections.every((b) => b.claimed), true);
}

// 4) haftalık ödeme payı dolunca durur, kalanı kaybolmaz; yeni haftada tekrar basınca alınır
{
  const gs = yeni();
  gs.state.onboarding = Object.fromEntries(gorevler.map((q) => [q.id, { done: true, claimed: false }]));
  treasury.state.weekBudget = { ...(treasury.state.weekBudget || {}), quest: 30 };
  treasury.state.weekSpent = { ...(treasury.state.weekSpent || {}), quest: 0 };
  const r = gs.claimAllOnboarding();
  assert.equal(r.budgetFull, true, 'pay doldu');
  assert.ok(r.count < gorevler.length + bolumler.length + 1, 'hepsi alınamadı');
  const kalan = gorevler.filter((q) => !gs.state.onboarding[q.id].claimed).length;
  assert.ok(kalan > 0, 'alınmayan görev işaretlenmedi (kaybolmadı)');
  treasury.state.weekSpent = {};
  treasury.state.weekBudget = { ...treasury.state.weekBudget, quest: 1e9 };
  const sonra = gs.claimAllOnboarding();
  assert.equal(sonra.success, true);
  assert.ok(gorevler.every((q) => gs.state.onboarding[q.id].claimed), 'yeni haftada kalan alındı');
}

// 5) arayüz: hazır ödül varsa kartta ve panelde düğme var, yoksa yok
{
  const ozet = (hazir) => ({ toplam: 47, biten: 40, hazir, siradaki: { title: 'X' } });
  assert.ok(yolKutusu(ozet(8)).html.includes('data-guide-claim-all'), 'kartta düğme');
  assert.ok(!yolKutusu(ozet(0)).html.includes('data-guide-claim-all'), 'ödül yoksa düğme yok');
  const gs = yeni();
  gs.state.onboarding = Object.fromEntries(gorevler.slice(0, 3).map((q) => [q.id, { done: true, claimed: false }]));
  assert.ok(yolHtml(gs.getOnboardingSections()).includes('data-claim-all'), 'panelde düğme');
  const bos = yeni();
  assert.ok(!yolHtml(bos.getOnboardingSections()).includes('data-claim-all'), 'ödül yokken panelde düğme yok');
}
console.log('✅ tüm ödülleri topla');
