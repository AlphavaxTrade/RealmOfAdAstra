// Geçiş 013: Geçiş 012'nin yapamadığı onarım (19 Ekim 2026). 012'nin kimlik kontrolü piyango bakiyesinin TAM 4.000.000 olmasını bekliyordu; canlıda
// o arada bilet satıldığı için (bakiye 4.000.097, 193 bilet) eşleşmedi ve 012 hiçbir şey yapmadan "uygulandı" sayıldı.
// Amaç aynı: 011'in piyango kasasından çıkarıp kasalara YAZAMADIĞI 8.000.090,23 ASTRA'yı Zindan, Kolezyum ve Dünya Boss kasalarına eklemek.
// (Sebep: sunucu açılırken hazine defteri diskten okunmadan tohumla ezilmişti; server/engine.js düzeltildi.)
// Kimlik kontrolü bu kez ESNEK ama hâlâ olaya özgü: piyango bakiyesi 4 M ile 4,5 M arasında, en az 94 bilet satılmış, ve üç kasa hâlâ "eski tohum + tohum
// artışı" civarında (±3.000: aradaki küçük ödeme/giriş farkları). Düzeltilmiş bir dünyada kasalar 2,67 M yukarıda olur: kontrol tutmaz, bir şey yapılmaz.
// Eklenen tutar SABİTTİR (kasadaki küçük farklar korunur). Tek seferlik (schema_migrations).
export const surum = 13;
export const ad = 'piyango_kasa_duzelt2';

const PIYANGO = 'world:lottery';
const HAZINE = 'ls:adastra_treasury_ledger_v4';
const k2 = (n) => Math.round(Number(n) * 100) / 100;
// Kasa → (011'den önceki tohum + 011 sırasında seed artışıyla zaten eklenen tutar, eklenecek eksik)
const KASALAR = {
  dungeon: { zatenVar: 12666667, ekle: 2666696.41 },
  arena: { zatenVar: 6666667, ekle: 2666696.41 },
  worldBoss: { zatenVar: 8666666, ekle: 2666697.41 }
};
const TOLERANS = 3000;

export function up(db) {
  const oku = (anahtar) => {
    const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(anahtar);
    if (!r) return null;
    try { return JSON.parse(r.value); } catch { return null; }
  };
  const piyango = oku(PIYANGO);
  const hazine = oku(HAZINE);
  if (!piyango || !hazine || !hazine.pools) return;
  const havuz = Number(piyango.pool);
  if (!(havuz >= 4000000 && havuz < 4500000) || !(Number(piyango.totalTickets) >= 94) || !(Number(piyango.amortiPool) >= 2.02)) return;
  if (!Object.entries(KASALAR).every(([id, k]) => Math.abs(Number(hazine.pools[id]) - k.zatenVar) < TOLERANS)) return;

  hazine.inflow = hazine.inflow && typeof hazine.inflow === 'object' ? hazine.inflow : {};
  let toplam = 0;
  for (const [id, k] of Object.entries(KASALAR)) {
    hazine.pools[id] = k2(Number(hazine.pools[id]) + k.ekle);
    hazine.inflow[id] = k2((Number(hazine.inflow[id]) || 0) + k.ekle);
    toplam += k.ekle;
  }
  hazine.lifetimeDeposited = k2((Number(hazine.lifetimeDeposited) || 0) + toplam);
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(HAZINE, JSON.stringify(hazine));
}
