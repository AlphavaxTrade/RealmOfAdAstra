// Kapı ve saatlik işlerin ölçeklenme ölçümü (yerel doğrulama kampanyası T6): N vatandaşta
//   · kapi.activeCitizens()  (her vatandaşın kaydını okur; saatlik run() ve haftalık kapanışta çağrılır)
//   · kapi.run()             (saatlik kapı işi)
//   · world.refreshUretim()  (saatlik Üretim Hakkı geçişi: tüm oyuncuları yükler)
//   · kapi.recordWeek()      (haftalık gösterge satırı)
//   node scripts/yuk/kapi-olcum.mjs [100,1000,5000]
// Beklenti: süre N ile doğrusal büyür (oran ≈ 1). Karesel büyüme N+1 sorgusu belirtisidir.
process.env.PAROLA_HAFIF = '1';
import { openDb } from '../../server/db.js';
import { createEngine } from '../../server/engine.js';
import { createWorld } from '../../server/world.js';
import { createKapi } from '../../server/kapi.js';
import { loadConfig } from '../../server/config.js';

const boyutlar = (process.argv[2] || '100,1000,5000').split(',').map(Number);
const sessiz = { log() {}, warn() {}, error() {} };
const ms = f => { const t = performance.now(); f(); return Math.round((performance.now() - t) * 10) / 10; };

export async function olc(n) {
  const db = openDb(':memory:');
  let T = Date.UTC(2026, 9, 8, 12);
  const E = await createEngine(db, { clock: () => T, testMode: true });
  E.GAME_CONFIG.KAPI.START_LIMIT = n + 10;
  const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true };
  const kapi = createKapi({ db, engine: E, cfg, clock: () => T, log: sessiz });
  const world = createWorld({ db, engine: E, chain: null, kapi, cfg, clock: () => T, log: sessiz });
  for (let i = 0; i < n; i++) {
    const a = 'acc:' + (i + 1);
    db.q.playerAdd.run(a, T, T);
    E.withPlayer(a, () => null);
    E.mutatePlayer(a, gs => { gs.state.adAstraBalance += 5000; gs.state.level = 3 + (i % 20); gs.state.lastSeenAt = T; });
    kapi.admit(a);
  }
  const r = {
    n,
    vatandas: kapi.counts().citizen,
    aktifHesapMs: ms(() => kapi.activeCitizens()),
    kapiRunMs: ms(() => kapi.run()),
    refreshUretimMs: ms(() => world.refreshUretim()),
    recordWeekMs: ms(() => kapi.recordWeek({ epoch: 1, distributedAda: 1e6, withdrawCapAda: 2e7 }, 2e-7))
  };
  db.close();
  return r;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/yuk/kapi-olcum.mjs')) {
  const sonuc = [];
  for (const n of boyutlar) {
    const r = await olc(n);
    sonuc.push(r);
    console.log(`N=${String(r.n).padEnd(5)} vatandaş=${r.vatandas} activeCitizens=${r.aktifHesapMs}ms  kapi.run=${r.kapiRunMs}ms  refreshUretim=${r.refreshUretimMs}ms  recordWeek=${r.recordWeekMs}ms`);
  }
  if (sonuc.length > 1) {
    const ilk = sonuc[0], son = sonuc.at(-1);
    for (const k of ['aktifHesapMs', 'kapiRunMs', 'refreshUretimMs', 'recordWeekMs']) {
      const oran = (son[k] / Math.max(ilk[k], 0.1)) / (son.n / ilk.n);
      console.log(`${k.padEnd(16)} N ${son.n / ilk.n}× → süre ${Math.round(son[k] / Math.max(ilk[k], 0.1) * 10) / 10}×  [oran ${Math.round(oran * 100) / 100}] ${oran < 1.5 ? 'doğrusal (iyi)' : 'DOĞRUSALDAN KÖTÜ'}`);
    }
  }
}
