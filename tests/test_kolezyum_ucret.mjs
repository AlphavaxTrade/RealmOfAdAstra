// Kolezyum (hazır rakip): giriş ücreti ASTRA'dır (anahtar değil). Ücretin ENTRY_ARENA_SHARE'i arena kasasına girer, kalanı her harcama gibi
// dağıtılır; zaferde anahtar düşmez (eskiden %25 şansla düşüyordu); ASTRA yoksa maç reddedilir ve hiçbir şey harcanmaz.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: k => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: k => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { treasury } = await import('../js/treasury.js');

const C = GAME_CONFIG.COLOSSEUM;
assert.equal(C.ENTRY_KEY_COST, undefined, 'giriş için anahtar ayarı kalmadı');
assert.ok(C.ENTRY_FEE_ASTRA > 0 && C.ENTRY_ARENA_SHARE > 0 && C.ENTRY_ARENA_SHARE < 1, 'ücret ve arena payı tanımlı');

function oyuncu() {
  depo.clear();
  const gs = new GameStateManager();
  gs.setDevAdAstra(1e6);
  gs.buySoldierUnit();
  gs.healAllDevSoldiers();
  gs.state.stamina = 60;   // azami staminanın altında (iade tavana takılmasın)
  treasury.state.pools.arena = 1e6; treasury.save();
  return gs;
}

// 1) Ücret düşer, arena kasası payını alır, anahtar değişmez
{
  const gs = oyuncu();
  const ucret = gs.getColosseumEntryFee();
  assert.equal(ucret, gs.adaPrice(C.ENTRY_FEE_ASTRA), 'ücret ayardaki tutar × oyun içi fiyat çarpanı');
  assert.equal(gs.getColosseumEntryStatus().blockReason, '', 'koşullar tamam: giriş engeli yok');
  gs.state.arenaKeys = 3;
  const bakiye0 = gs.state.adAstraBalance, kasa0 = treasury.getPool('arena');
  const r = gs.executeColosseum1v1Match(0);
  assert.equal(r.success, true, r.message);
  assert.equal(r.rewardKeys, undefined, 'sonuçta anahtar ödülü yok');
  assert.equal(gs.state.arenaKeys, 3, 'maç anahtar harcamaz');
  assert.ok(Math.abs((bakiye0 - gs.state.adAstraBalance) - (ucret - (r.rewardAda || 0))) < 1e-6, 'bakiye ücret kadar düştü (zaferde ödül eklenir)');
  // ödül arena kasasından çıkmış olabilir; ücretin arena payı kasaya girmiş olmalı: net fark ≥ pay − ödül
  assert.ok(treasury.getPool('arena') - kasa0 >= ucret * C.ENTRY_ARENA_SHARE - (r.rewardAda || 0) - 1e-6, 'ücretin arena payı arena kasasına girdi');
  console.log('✅ ücret düşüyor, arena kasası payını alıyor, anahtar harcanmıyor');
}

// 2) 40 zaferli/zaferiz maç boyunca anahtar hiç artmaz (eski %25 anahtar şansı kalktı)
{
  const gs = oyuncu();
  gs.state.arenaKeys = 0;
  const kayip = Math.random;
  let maclar = 0, zafer = 0;
  try {
    for (let i = 0; i < 40; i++) {
      gs.getDailyCounters().arenaMatches = 0; gs.getDailyCounters().arenaAda = 0;
      gs.healAllDevSoldiers(); gs.state.stamina = 60;
      Math.random = () => 0.01;   // eski kodda %25 anahtar şansı bu zarla kesin tutardı
      const r = gs.executeColosseum1v1Match(0);
      if (r.success) { maclar++; if (r.isVictory) zafer++; }
    }
  } finally { Math.random = kayip; }
  assert.ok(maclar >= 30, `maçlar oynandı (${maclar})`);
  assert.equal(gs.state.arenaKeys, 0, `${maclar} maçta (${zafer} zafer) anahtar düşmedi`);
  console.log(`✅ ${maclar} maç, ${zafer} zafer: anahtar düşmedi`);
}

// 3) ASTRA yoksa maç reddedilir, stamina ve günlük hak harcanmaz
{
  const gs = oyuncu();
  gs.state.adAstraBalance = 0;
  const stamina0 = gs.state.stamina, mac0 = gs.getDailyCounters().arenaMatches || 0, kasa0 = treasury.getPool('arena');
  const r = gs.executeColosseum1v1Match(0);
  assert.equal(r.success, false);
  assert.match(r.message, /giriş ücreti/i);
  assert.match(gs.getColosseumEntryStatus().blockReason, /giriş ücreti/i);
  assert.equal(gs.state.stamina, stamina0);
  assert.equal(gs.getDailyCounters().arenaMatches || 0, mac0);
  assert.equal(treasury.getPool('arena'), kasa0);
  console.log('✅ ASTRA yoksa maç reddedilir, hiçbir şey harcanmaz');
}

// 4) Gerçek rakip sırası: ücret emanettedir; iade tam, eski (anahtarlı) sıra kaydı anahtarla iade edilir
{
  const gs = oyuncu();
  const bakiye0 = gs.state.adAstraBalance, stamina0 = gs.state.stamina;
  const odeme = gs.payPvpEntry();
  assert.equal(odeme.success, true);
  assert.equal(odeme.fee, gs.getColosseumEntryFee());
  assert.ok(Math.abs(bakiye0 - gs.state.adAstraBalance - odeme.fee) < 1e-9, 'ücret bakiyeden emanete alındı');
  gs.state.pvpQueue = { mode: '1v1', indices: [0], at: 0, fee: odeme.fee };
  gs.refundPvpEntry();
  assert.ok(Math.abs(gs.state.adAstraBalance - bakiye0) < 1e-9, 'sıradan çıkınca ücret tamamen iade');
  assert.ok(Math.abs(gs.state.stamina - stamina0) < 1e-9, 'stamina iade');
  gs.state.pvpQueue = { mode: '1v1', indices: [0], at: 0 };   // ücret alanı olmayan eski kayıt: anahtarla girmişti
  gs.state.arenaKeys = 0;
  gs.refundPvpEntry();
  assert.equal(gs.state.arenaKeys, 1, 'eski sıra kaydına 1 anahtar iade edilir');
  console.log('✅ gerçek rakip sırasında ücret emanette, iade tam, eski kayıt anahtarla iade');
}
