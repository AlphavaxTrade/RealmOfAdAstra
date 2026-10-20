// Katkı puanı kaynağı (20 Ekim 2026): puanın hangi işten ve hangi cinsten geldiği kaydedilir ve Konsey ekranında dökülür.
import assert from 'node:assert/strict';
const depo = new Map();
globalThis.localStorage = { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => { depo.set(k, String(v)); }, removeItem: (k) => { depo.delete(k); } };
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { globalPool } = await import('../js/globalPool.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { treasury } = await import('../js/treasury.js');
const ekran = await import('../js/ui/ekran/index.js');

ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
const gs = new GameStateManager();
gs.state.level = 5; gs.state.warehouseLevel = 6; gs.state.adAstraBalance = 5e6;
const gerek = gs.getNextLevelRequirement();
gs.state.currentXp = gerek.xp + 5;
for (const k of Object.keys(gerek.costs)) gs.state.inventory[k] = gerek.costs[k] + 5;

const once = gs.getContributionInfo().total;
assert.ok(gs.levelUp().success);
const toplam1 = gs.getContributionInfo().total - once;
const k = gs.getContributionSources();
const hesap = k.toplam.find((e) => e.ad === 'Hesap yükseltme');
assert.ok(hesap && hesap.p > 0, 'hesap yükseltme kaynağı yazıldı: ' + JSON.stringify(k.toplam));
assert.ok(hesap.astra > 0 && hesap.yakim > 0, 'hem harcanan ASTRA hem yakılan hammadde cinsi var');
assert.ok(Math.abs(hesap.p - toplam1) < 1, `kaynak toplamı yazılan puanla aynı (${hesap.p} / ${toplam1})`);
assert.ok(Math.abs(hesap.astra - gerek.adAstra) < 1, 'ASTRA kısmı = harcanan ASTRA (1 ASTRA = 1 puan)');

// Başka iş: teçhizat dövme ayrı satır; toplam kaynaklar toplamı genel toplamla eşit (eski kayıt yok)
gs.state.inventory.fragments = 20;
for (const key of ['iron', 'wood', 'coal']) gs.state.inventory[key] = 1e6;
assert.ok(gs.craftEquipment('boots').success);
const k2 = gs.getContributionSources();
assert.ok(k2.toplam.some((e) => e.ad === 'Teçhizat dövme'), 'dövme ayrı satırda');
const izlenen = k2.toplam.reduce((t, e) => t + e.p, 0);
assert.ok(Math.abs(izlenen - gs.getContributionInfo().total) < 2, 'kaynakların toplamı katkı puanıyla aynı');
assert.equal(k2.eski, 0, 'yeni hesapta eski kayıt yok');
assert.ok(k2.hafta.length >= 2);

// Eski kayıt: kaynak tutulmadan önce yazılmış puan "eski" görünür
gs.state.contribution.total += 1000;
assert.ok(gs.getContributionSources().eski >= 999);

// Hafta dönümünde haftalık döküm sıfırlanır, toplam kalır
globalPool.state.epochId += 1;
gs._contribution();
assert.equal(gs.getContributionSources().hafta.length, 0, 'yeni haftada haftalık döküm boş');
assert.ok(gs.getContributionSources().toplam.length >= 2, 'toplam döküm kalır');

// Ekran: Konsey'de döküm bölümü görünür
const b = { gameState: gs, GAME_CONFIG, globalPool, ammMarket, treasury, online: { active: false }, bildir() {}, hudYenile() {}, kilit: () => null };
const html = ekran.ekranlar().find((e) => e.id === 'konsey').govde(b, {});
assert.match(html, /Katkı puanın nereden geliyor/);
assert.match(html, /Hesap yükseltme/);
assert.match(html, /Eski kayıtlar/);
console.log('✅ katkı puanı kaynağı: işe ve cinse göre kayıt, döküm, hafta sıfırlama, ekran');
console.log('\n1 katkı kaynağı kontrolü geçti.');
