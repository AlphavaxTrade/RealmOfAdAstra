// Geçiş 014: UOA tohumu (19 Ekim 2026, kullanıcı kararı).
//  - Universe Tohum Rezervi (20 M) kaldırıldı: bakiyesi altı ödeme kasasına ÖDEME KAPASİTESİYLE orantılı dağıtılır
//    (zindan 4,604 / kolezyum 1,939 / boss 3,780 / geri alım 4,760 / görev 2,908 / karnaval 2,009 M, yani yüzde 23,02 / 9,695 / 18,9 / 23,8 / 14,54 / 10,045).
//  - Sirius Konseyi kasası (10 M) kaldırıldı: bakiyesi yedi kasaya (zindan, kolezyum, boss, geri alım, görev, karnaval, Fatih) EŞİT bölünür.
//  - Yeni "uoaTohum" kasası 0 ile açılır; bundan sonra oyundaki harcamanın %4'üyle dolar (js/treasury.js).
// Toplam ASTRA korunur (kuruşlar son kasaya); hazine defterindeki "lifetimeDeposited" değişmez (iç aktarım). Eski anahtarlar yoksa hiçbir şey yapılmaz (yeni dünya,
// ya da zaten uygulanmış), bu yüzden ikinci çalıştırma zararsızdır. Tek seferlik (schema_migrations).
export const surum = 14;
export const ad = 'uoa_tohum_dagitim';

const HAZINE = 'ls:adastra_treasury_ledger_v4';
const k2 = (n) => Math.round(Number(n) * 100) / 100;
// Universe rezervi: kasa → pay (ödeme kapasitesi, M ASTRA); toplamı 20
const UNIVERSE_PAYLARI = { dungeon: 4604, arena: 1939, worldBoss: 3780, ammBuyback: 4760, quest: 2908, carnival: 2009 };
const KONSEY_KASALARI = ['dungeon', 'arena', 'worldBoss', 'ammBuyback', 'quest', 'carnival', 'fatih'];

export function up(db) {
  const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(HAZINE);
  if (!r) return;
  let hazine;
  try { hazine = JSON.parse(r.value); } catch { return; }
  if (!hazine || !hazine.pools || typeof hazine.pools !== 'object') return;
  const p = hazine.pools;
  const universe = Number(p.universe) || 0;
  const konsey = Number(p.konsey) || 0;
  const eskiVar = ('universe' in p) || ('konsey' in p);
  if (!eskiVar && 'uoaTohum' in p) return;

  const ekle = (id, miktar) => { p[id] = k2((Number(p[id]) || 0) + miktar); };
  if (universe > 0) {
    const ids = Object.keys(UNIVERSE_PAYLARI);
    const toplamPay = ids.reduce((s, id) => s + UNIVERSE_PAYLARI[id], 0);
    let verilen = 0;
    ids.forEach((id, i) => {
      const parca = i === ids.length - 1 ? k2(universe - verilen) : k2(universe * UNIVERSE_PAYLARI[id] / toplamPay);
      verilen = k2(verilen + parca);
      ekle(id, parca);
    });
  }
  if (konsey > 0) {
    const esit = Math.floor(konsey / KONSEY_KASALARI.length * 100) / 100;
    let verilen = 0;
    KONSEY_KASALARI.forEach((id, i) => {
      const parca = i === 0 ? 0 : esit;
      verilen = k2(verilen + parca);
      if (parca) ekle(id, parca);
    });
    ekle(KONSEY_KASALARI[0], k2(konsey - verilen));   // kuruş farkı + ilk payı zindana
  }
  delete p.universe;
  delete p.konsey;
  if (!('uoaTohum' in p)) p.uoaTohum = 0;
  for (const alan of ['inflow', 'outflow']) {
    if (hazine[alan] && typeof hazine[alan] === 'object') { delete hazine[alan].universe; delete hazine[alan].konsey; }
  }
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(HAZINE, JSON.stringify(hazine));
}
