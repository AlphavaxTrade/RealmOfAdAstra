// Sunucu — global haftalık havuzun dağıtımı (19 Ekim 2026 ekonomi planı): refreshUretim oyuncu limitlerini toplar, havuzu taban pay + üst pay olarak dağıtır,
// dünya kapasitesini dağıtılan toplam yapar; havuz oyuncu sayısına değil fiyata/bot girişine bağlıdır.
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { loadConfig } from '../server/config.js';
import { GAME_CONFIG } from '../js/config.js';

const uyarilar = [];
const db = openDb(':memory:');
const E = await createEngine(db);
const world = createWorld({ db, engine: E, cfg: { ...loadConfig({}), dbFile: ':memory:' }, log: { warn: (...a) => uyarilar.push(a.join(' ')), error: (...a) => uyarilar.push(a.join(' ')) } });
const U = GAME_CONFIG.URETIM_HAKKI;
const gp = E.globalPool;

// 40 oyuncu: seviyeleri ve katkı kademeleri farklı
const adresler = [];
for (let i = 0; i < 40; i++) {
  const a = '0x' + (i + 1).toString(16).padStart(2, '0').repeat(20);
  adresler.push(a);
  db.q.playerAdd.run(a, Date.now(), Date.now());
  E.withPlayer(a, () => null);
  E.mutatePlayer(a, gs => {
    gs.state.level = 1 + (i % 10) * 8;
    gs.state.contribution = { total: 0, week: 0, lastWeek: i % 4 === 0 ? 6000 : 0, epochId: gp.state.epochId, buyCredit: {} };
  });
}

// 1) Havuz bol: herkes kişisel limitini alır, kapasite = limitlerin toplamı (havuz G'den küçük)
{
  world.refreshUretim();
  const pay = gp.state.uretim.pay;
  assert.ok(pay.wood && pay.wood.n === 40, 'dağıtım yazıldı (40 oyuncu)');
  const G = gp.globalHavuz('wood', gp.uretimParams());
  assert.ok(pay.wood.total <= G + 1, 'dağıtılan toplam havuzu aşmaz');
  assert.equal(uyarilar.length, 0, `dağıtımda hata/uyarı yok: ${uyarilar.join(' | ')}`);
  console.log(`✅ refreshUretim dağıtımı yazdı: odun taban A=${pay.wood.A}, toplam ${pay.wood.total}, havuz ${Math.floor(G)}`);
}

// 2) Havuz kıtlaşınca (fiyat düşük → arz kısıldı): taban pay herkese eşit, üst pay limite ve kademeye göre; dünya kapasitesi dağıtılan toplam
{
  for (const k of GAME_CONFIG.RESOURCE_KEYS) gp.state.uretim.qpp[k] = U.QPP_MIN;
  gp.saveState();
  world.refreshUretim();
  const pay = gp.state.uretim.pay.wood;
  const G = gp.globalHavuz('wood', gp.uretimParams());
  assert.ok(pay.A != null, 'havuz kıt: taban pay A var');
  assert.ok(pay.total <= G + 1 && pay.total >= G * 0.98, `dağıtılan ${pay.total} ≈ havuz ${Math.floor(G)}`);
  assert.equal(gp.state.resources.wood.baseCap, pay.total, 'dünya kapasitesi = dağıtılan toplam');
  const haklar = adresler.map((a, i) => E.withPlayer(a, gs => ({ hak: gs.getUretimHakki('wood'), seviye: gs.state.level, kademeli: i % 4 === 0 })).result);
  for (const h of haklar) assert.ok(h.hak.weekly <= h.hak.limit, 'kimse kişisel limitini aşmaz');
  const dusuk = haklar.filter(h => h.seviye === 1 && !h.kademeli);   // aynı katkı kademesinde karşılaştır
  const yuksek = haklar.filter(h => h.seviye === 73 && !h.kademeli);
  const enAzYuksek = Math.min(...yuksek.map(h => h.hak.weekly)), enCokDusuk = Math.max(...dusuk.map(h => h.hak.weekly));
  assert.ok(enAzYuksek >= enCokDusuk, 'üst seviye oyuncu alt seviyeden az pay almaz');
  const toplamHak = haklar.reduce((t, h) => t + h.hak.weekly, 0);
  assert.ok(Math.abs(toplamHak - pay.total) <= 40, `oyuncuların haftalık hakları toplamı (${toplamHak}) ≈ dağıtılan (${pay.total})`);
  const kademeli = haklar.filter(h => h.hak.limit > pay.A);
  assert.ok(kademeli.length > 0 && kademeli.every(h => h.hak.weekly >= pay.A - 1), 'limiti tabandan büyük herkes en az taban payı alır');
  assert.equal(uyarilar.length, 0, `hata/uyarı yok: ${uyarilar.join(' | ')}`);
  console.log(`✅ kıt havuz: taban A=${pay.A.toFixed(1)}, toplam ${pay.total}; haklar toplamı ${toplamHak}`);
}

// 3) Oyuncu sayısı artınca kişi başı pay küçülür (havuz aynı)
{
  const once = E.withPlayer(adresler[1], gs => gs.getUretimHakki('wood').weekly).result;
  for (let i = 40; i < 120; i++) {
    const a = '0x' + (i + 1).toString(16).padStart(3, '0').repeat(14).slice(0, 40);
    db.q.playerAdd.run(a, Date.now(), Date.now());
    E.withPlayer(a, () => null);
    E.mutatePlayer(a, gs => { gs.state.level = 1 + (i % 10) * 8; });
  }
  world.refreshUretim();
  const sonra = E.withPlayer(adresler[1], gs => gs.getUretimHakki('wood').weekly).result;
  assert.ok(sonra < once, `3 kat oyuncu → aynı oyuncunun payı küçülür (${once} → ${sonra})`);
  console.log(`✅ oyuncu sayısı 40 → 120: aynı oyuncunun payı ${once} → ${sonra}`);
}
