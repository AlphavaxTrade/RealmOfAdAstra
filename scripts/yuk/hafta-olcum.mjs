// Haftalık hesaplaşma ölçeklenme ölçümü (kurumsal A5.6): N oyuncuyla world.settleWeek süresi. Doğrusal (O(N)) mu, karesel (O(N²), N+1 belirtisi) mi?
//   node scripts/yuk/hafta-olcum.mjs [500,2000,5000]
// Her N için temiz bir veritabanı kurar, N oyuncu açar (her biri bir sefer başlatmış, bir kısmı bilet almış), hesaplaşmayı zaman ölçer.
process.env.PAROLA_HAFIF = '1';
import { openDb } from '../../server/db.js';
import { createEngine } from '../../server/engine.js';
import { createWorld } from '../../server/world.js';
import { loadConfig } from '../../server/config.js';

const boyutlar = (process.argv[2] || '500,2000,5000').split(',').map(Number);
const sessiz = { log() {}, warn() {}, error() {} };

export async function olc(n) {
  const db = openDb(':memory:');
  let T = Date.UTC(2026, 9, 8, 12);
  const E = await createEngine(db, { clock: () => T, testMode: true });
  const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true };
  const world = createWorld({ db, engine: E, chain: null, cfg, clock: () => T, log: sessiz });
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const a = 'acc:' + (i + 1);
    db.q.playerAdd.run(a, T, T);
    E.withPlayer(a, () => null);
    E.mutatePlayer(a, gs => { gs.state.adAstraBalance += 5000; gs.state.level = 3 + (i % 20); if (i % 3 === 0) gs.state.lotteryTickets = 1 + (i % 5); gs.state.lastSeenAt = T; });
  }
  const kurulum = performance.now() - t0;
  T += 8 * 86400000;
  const t1 = performance.now();
  world.settleWeek(E.globalPool.state.epochId, null);
  const hesaplasma = performance.now() - t1;
  db.close();
  return { n, kurulumMs: Math.round(kurulum), hesaplasmaMs: Math.round(hesaplasma), oyuncuBasinaMs: Math.round(hesaplasma / n * 100) / 100 };
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/yuk/hafta-olcum.mjs')) {
  const sonuc = [];
  for (const n of boyutlar) { const r = await olc(n); sonuc.push(r); console.log(`N=${String(r.n).padEnd(5)} kurulum=${String(r.kurulumMs).padEnd(7)}ms hesaplaşma=${String(r.hesaplasmaMs).padEnd(7)}ms (oyuncu başına ${r.oyuncuBasinaMs} ms)`); }
  if (sonuc.length > 1) {
    const ilk = sonuc[0], son = sonuc.at(-1);
    const oran = (son.hesaplasmaMs / ilk.hesaplasmaMs) / (son.n / ilk.n);
    console.log(`Ölçeklenme: N ${son.n / ilk.n}× büyüdü, süre ${Math.round(son.hesaplasmaMs / ilk.hesaplasmaMs * 10) / 10}× → ${oran < 1.5 ? 'DOĞRUSAL (iyi)' : 'DOĞRUSALDAN KÖTÜ (N+1 şüphesi)'}  [oran ${Math.round(oran * 100) / 100}]`);
  }
}
