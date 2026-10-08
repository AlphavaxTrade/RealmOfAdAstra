// İzin modunun ekonomik etkisi (onaylı kural, E-planı Faz 1 KARAR 8): izindeki vatandaş YERİNİ korur ama ekonomiden pay ALMAZ —
// Üretim Hakkı ağırlığı 0, haftalık temel gelir talebi reddedilir, ücretsiz havuza ve temel gelir toplam ağırlığına girmez.
// (Yerel doğrulama kampanyasında bulundu: izindeMi() tanımlıydı ama hiçbir ekonomi yolu onu okumuyordu.)
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { loadConfig } from '../server/config.js';
import { izindeMiState } from '../server/aktiflik.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const quiet = { log() {}, warn() {}, error() {} };

// Saf yardımcı
{
  const now = 1_000_000;
  assert.equal(izindeMiState({ katilim: { izinModu: { bitis: now + 10 } } }, now), true);
  assert.equal(izindeMiState({ katilim: { izinModu: { bitis: now - 1 } } }, now), false, 'süresi dolan izin izin değildir');
  assert.equal(izindeMiState({ katilim: { izinModu: null } }, now), false);
  assert.equal(izindeMiState({}, now), false); assert.equal(izindeMiState(null, now), false);
  ok('izindeMiState: aktif izin / süresi dolmuş / izin yok / kayıt yok');
}

const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true };
const db = openDb(':memory:');
const E = await createEngine(db, { testMode: true });
const world = createWorld({ db, engine: E, chain: null, cfg, log: quiet });
const now = Date.now();
const A = 'acc:normal1', B = 'acc:izinli', C = 'acc:normal2';
for (const a of [A, B, C]) {
  db.q.playerAdd.run(a, now, now);
  E.withPlayer(a, () => null);
  E.mutatePlayer(a, gs => { gs.state.level = 5; gs.state.adAstraBalance = 100; gs.state.lastSeenAt = now; });
}
const ep = E.globalPool.state.epochId;
for (const a of [A, B, C]) E.mutatePlayer(a, gs => { gs.state.contribution = { epochId: ep, week: 50, lastWeek: 0 }; });
E.mutatePlayer(B, gs => { gs._katilim().izinModu = { baslangic: now, bitis: now + 5 * 86400000, gun: 5 }; });

// 1) Üretim Hakkı ağırlığı
{
  const w = a => E.withPlayer(a, gs => gs.getUretimWeight()).result;
  assert.ok(w(A).weight > 0 && w(C).weight > 0, 'normal oyuncunun ağırlığı var');
  assert.equal(w(B).weight, 0, 'izindeki oyuncunun Üretim Hakkı ağırlığı 0');
  assert.equal(E.withPlayer(B, gs => gs.getUretimHakki('wood').weekly).result, 0, 'izindeyken haftalık hakkı da 0');
  ok('İzindeyken Üretim Hakkı ağırlığı ve haftalık hak 0; normal oyuncuda var');
}

// 2) Temel gelir talebi
{
  E.globalPool.state.ubiClaimPot = 10000; E.globalPool.state.ubiClaimPotAtOpen = 10000;
  const r = E.act(B, 'claimWeeklyUbi', []).result;
  assert.equal(r.success, false); assert.match(r.message, /İzindeyken/);
  const rA = E.act(A, 'claimWeeklyUbi', []).result;
  assert.doesNotMatch(String(rA.message), /İzindeyken/, 'normal oyuncu izin nedeniyle reddedilmez');
  ok('İzindeki oyuncunun haftalık temel gelir talebi izin gerekçesiyle reddediliyor');
}

// 3) Haftalık hesaplaşma: ücretsiz havuz + temel gelir toplam ağırlığı
{
  const market = { at: now, priceUsd: 2e-7, mcapUsd: 400, supply: 2.1325e9, dead: 1.65e8, curveSupply: 2.1325e9, graduated: false, walletAda: 2e8, poolTokenReserve: 0 };
  const before = a => E.readPlayer(a).adAstraBalance;
  const [bA, bB, bC] = [before(A), before(B), before(C)];
  const ozet = world.settleWeek(ep, market);
  assert.equal(ozet.faucet.players, 2, 'ücretsiz havuza yalnız izinde olmayan iki oyuncu girdi: ' + JSON.stringify(ozet.faucet));
  assert.ok(before(A) > bA && before(C) > bC, 'normal oyuncular pay aldı');
  assert.equal(before(B), bB, 'izindeki oyuncu ücretsiz havuzdan pay almadı');
  assert.equal(world.econ().ubiTotalWeight, E.levelWeight(5) * 2, 'temel gelir toplam ağırlığı izindekini içermiyor');
  ok('Haftalık hesaplaşma: ücretsiz havuz 2 kişiye (izindeki hariç), temel gelir toplam ağırlığı izindekini saymıyor');
}

// 4) İzin bitince her şey geri gelir
{
  E.mutatePlayer(B, gs => { gs._katilim().izinModu.bitis = Date.now() - 1; });
  assert.ok(E.withPlayer(B, gs => gs.getUretimWeight()).result.weight > 0, 'izin bitince ağırlık geri geldi');
  ok('İzin süresi dolunca Üretim Hakkı ağırlığı geri geliyor');
}

console.log(`\n${passed} izin ekonomisi kontrolü geçti.`);
process.exit(0);
