// v2 (8 Ekim 2026): Savunma Duvarı (Sirius Konseyi'nin 5. projesi) GERÇEK bir etki taşır: tamamlanınca Dünya Bossu savaşından
// erken çekilme cezası %18'den %12'ye iner. (Eskiden "bossun hasarı −%10" yazıyordu ama dünya bossu oyunculara vurmadığı için etkisi yoktu.)
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
const { ACTIONS } = await import('../server/actions.js');

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const fresh = () => {
  localStorage.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  const gs = new GameStateManager();
  gs.state.warehouseLevel = gs.getWarehouseMaxLevel();
  return gs;
};
// Sıradaki açık projeyi tamamlar (hammadde + emek)
const projeBitir = () => { const s = globalPool.getProjectStatus(); return globalPool.contributeProject({ stone: s.need.stone, iron: s.need.iron, wood: s.need.wood }, s.active.labor); };
const duvarIndeks = GAME_CONFIG.KONSEY_PROJELERI.findIndex(p => p.id === 'wall');
// Yeni hesapta asker yok (köylüyle başlar): bakiye ver, asker al, ordu kilitle, tahmini kazancı büyüt
const orduKilitle = gs => { gs.state.adAstraBalance = 1e12; const a = gs.buySoldierUnit(); assert.ok(a.success, a.message); const k = gs.stakeArmyForWorldBoss(); assert.ok(k.success, k.message); gs.state.worldBoss.userStakedAtk = 1_000_000; };

// 1) Yapılandırma: etki tanımlı, açıklama dürüst (artık "hasar" vaadi yok), ceza sabiti yapılandırmada
{
  const wall = GAME_CONFIG.KONSEY_PROJELERI[duvarIndeks];
  assert.equal(duvarIndeks, GAME_CONFIG.KONSEY_PROJELERI.length - 1, 'Savunma Duvarı son proje');
  assert.equal(wall.bonus.bossPenaltyPoints, -0.06, 'bonus: ceza 6 puan düşer');
  assert.ok(!('bossDamage' in wall.bonus), 'etkisiz eski alan kaldırıldı');
  assert.match(wall.desc, /erken çekilme/i); assert.ok(wall.desc.includes("%18") && wall.desc.includes("%12"));
  assert.equal(GAME_CONFIG.WORLD_BOSS.EARLY_UNSTAKE_PENALTY, 0.18, 'taban ceza yapılandırmada (kodda gömülü sayı yok)');
  ok('yapılandırma: Savunma Duvarı erken çekilme cezasını %18 → %12 yapar; eski etkisiz alan yok');
}

// 2) Bonus yalnız Savunma Duvarı BİTİNCE açılır (önceki 4 proje tek başına etkilemez)
{
  const gs = fresh();
  assert.equal(gs.getWorldBossEarlyUnstakeRate(), 0.18, 'başlangıçta %18');
  for (let i = 0; i < duvarIndeks; i++) projeBitir();
  assert.equal(globalPool.getProjectStatus().active.id, 'wall', 'sıra Savunma Duvarı\'nda');
  assert.equal(gs.getWorldBossEarlyUnstakeRate(), 0.18, 'önceki 4 proje cezayı değiştirmez');
  const r = projeBitir();
  assert.equal(r.completed, true);
  assert.equal(gs.getWorldBossEarlyUnstakeRate(), 0.12, 'duvar bitince %12 (kayan nokta hatası yok)');
  ok('ceza oranı: duvar bitene dek %18, bitince tam %12');
}

// 3) Gerçek tahsilat: aynı ordu için duvar öncesi %18, sonrası %12 ASTRA kesilir; güç özetinde oran görünür
{
  const kes = duvarVar => {
    const gs = fresh();
    if (duvarVar) for (let i = 0; i <= duvarIndeks; i++) projeBitir();
    orduKilitle(gs);                                              // tahmini kazanç büyük: 1 ASTRA tabanı ayrımı gizlemesin
    const guc = gs.calculateUserWorldBossPower();
    const once = gs.state.adAstraBalance;
    const r = gs.emergencyUnstakeWorldBossArmy();
    assert.ok(r.success, r.message);
    return { guc, kesilen: once - gs.state.adAstraBalance, mesaj: r.message, ceza: r.penaltyPaid };
  };
  const a = kes(false), b = kes(true);
  assert.ok(a.guc.estimatedAda > 100000, 'tahmini kazanç ayırt edici büyüklükte: ' + a.guc.estimatedAda);
  assert.equal(a.guc.earlyUnstakePenaltyRate, 0.18); assert.equal(b.guc.earlyUnstakePenaltyRate, 0.12);
  assert.equal(a.kesilen, Math.round(a.guc.estimatedAda * 0.18), 'duvar öncesi %18');
  assert.equal(b.kesilen, Math.round(b.guc.estimatedAda * 0.12), 'duvar sonrası %12');
  assert.equal(a.ceza, a.kesilen); assert.equal(b.ceza, b.kesilen);
  assert.ok(b.kesilen < a.kesilen, 'duvarlı oyuncu daha az öder');
  assert.match(a.mesaj, /%18/); assert.match(b.mesaj, /%12/); assert.ok(!/%18/.test(b.mesaj), 'mesaj yeni oranı söyler');
  ok('erken çekilmede gerçekten kesilen tutar: %18 → %12; mesajlar ve güç özeti doğru oranı gösterir');
}

// 4) Hazine dengesi: ceza hâlâ harcama sayılır (yakım/UBI/hazine bölüşümü), azalan ceza ASTRA BASMAZ
{
  const gs = fresh();
  for (let i = 0; i <= duvarIndeks; i++) projeBitir();
  orduKilitle(gs);
  const toplamOnce = gs.state.adAstraBalance;
  const r = gs.emergencyUnstakeWorldBossArmy();
  assert.equal(toplamOnce - gs.state.adAstraBalance, r.penaltyPaid, 'oyuncunun kaybı = ödenen ceza (ek kazanç/para yok)');
  assert.ok(r.penaltyPaid > 0);
  ok('azalan ceza ASTRA basmaz: oyuncudan çıkan tutar = ödenen ceza, yine harcama olarak bölüştürülür');
}

// 5) Sunucu yolu: aynı yöntem beyaz listede; oran kaydı dünya durumundan (globalPool) okunur, oyuncu verisinden değil
{
  assert.ok(ACTIONS.emergencyUnstakeWorldBossArmy, 'işlem sunucuda çalışır');
  const gs = fresh();
  for (let i = 0; i <= duvarIndeks; i++) projeBitir();
  const baskasi = new GameStateManager();                          // aynı dünyada başka bir oyuncu kaydı
  assert.equal(baskasi.getWorldBossEarlyUnstakeRate(), 0.12, 'bonus dünyaya aittir: herkes aynı oranı görür');
  assert.equal(gs.getWorldBossEarlyUnstakeRate(), 0.12);
  ok('bonus dünya (ortak) durumundan gelir: projeyi bitiren herkes için geçerli, sunucuda aynı yöntem çalışır');
}

// 6) Deneme menüsü: Konsey projelerini bitirme (normal oyunda her proje 6 M birim + 50.000 emek: elle test edilemezdi)
{
  const { DEV_ACTIONS } = await import('../server/actions.js');
  assert.ok(DEV_ACTIONS.includes('devFinishCouncilProjects'), 'yalnız deneme kipinde çalışan işlem listesinde');
  assert.ok(!ACTIONS.devFinishCouncilProjects, 'normal (gerçek) işlem listesinde YOK: gerçek sunucuda çağrılamaz');
  const gs = fresh();
  const bir = gs.devFinishCouncilProjects(1);
  assert.equal(bir.success, true); assert.equal(bir.finished, 1);
  assert.equal(globalPool.getProjectStatus().done.length, 1, 'tek proje bitti');
  assert.equal(gs.getWorldBossEarlyUnstakeRate(), 0.18, 'ilk proje cezayı değiştirmez');
  const hepsi = gs.devFinishCouncilProjects(10);
  assert.equal(hepsi.finished, GAME_CONFIG.KONSEY_PROJELERI.length - 1, 'kalan projeler bitti, fazlası yok sayıldı');
  assert.equal(globalPool.getProjectStatus().active, null, 'açık proje kalmadı');
  assert.equal(gs.getWorldBossEarlyUnstakeRate(), 0.12);
  assert.equal(gs.devFinishCouncilProjects(3).finished, 0, 'bitmiş dünyada tekrar çağırmak zararsız');
  // Geri alma: projeler başa döner, bonus kalkar (deneme sunucusunu bozmadan denemek için)
  assert.ok(DEV_ACTIONS.includes('devResetCouncilProjects') && !ACTIONS.devResetCouncilProjects, 'sıfırlama da yalnız deneme kipinde');
  const geri = gs.devResetCouncilProjects();
  assert.equal(geri.success, true); assert.equal(geri.reset, 5);
  assert.equal(globalPool.getProjectStatus().done.length, 0); assert.equal(globalPool.getProjectStatus().active.id, GAME_CONFIG.KONSEY_PROJELERI[0].id, 'sıra başa döndü');
  assert.equal(gs.getWorldBossEarlyUnstakeRate(), 0.18, 'bonus kalktı');
  assert.equal(gs.devFinishCouncilProjects(1).finished, 1, 'sıfırlamadan sonra yeniden ilerlenebilir');
  ok('deneme menüsü: Konsey projelerini sırayla bitirir (yalnız DEV_ACTIONS, gerçek listede yok); tekrar çağrısı zararsız');
}

console.log(`\n${passed}/6 Savunma Duvarı testi geçti`);
