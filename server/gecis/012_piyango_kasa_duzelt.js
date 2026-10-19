// Geçiş 012: Geçiş 011'in (piyango kasasını 4 M'ye indirip fazlayı üç kasaya bölme) EKSİK KALAN yarısını tamamlar (19 Ekim 2026).
// Olay: sunucu açılırken hazine defteri diskten okunmadan tohumla kurulup üzerine yazılıyordu (server/engine.js düzeltildi); bu yüzden 011 piyango
// kasasından 16.000.090,23 ASTRA'yı çıkardı ama kasalara yazdığı 15,33 M / 9,33 M / 11,33 M bakiyeler silindi, yalnız tohum artışı (+8 M) kaldı.
// Bu geçiş eksik kalan farkı (kasa başına ~2.666.696 ASTRA, toplam 8.000.090,23) kasalara ekler ve defterin giriş kayıtlarını düzeltir.
// KİMLİK KONTROLÜ: yalnız bu olaydan etkilenen dünyada çalışır (piyango bakiyesi tam 4 M, amorti 2,02, 94 bilet, kasalar tohum değerlerinde). Başka
// bir dünyada ya da düzeltilmiş dünyada hiçbir şey yapmaz. Tek seferlik (schema_migrations).
export const surum = 12;
export const ad = 'piyango_kasa_duzelt';

const PIYANGO = 'world:lottery';
const HAZINE = 'ls:adastra_treasury_ledger_v4';
const k2 = (n) => Math.round(Number(n) * 100) / 100;
// 011'in canlıda hesaplaması gereken pay: (20.000.090,22960553 - 4.000.000) / 3 aşağı yuvarlanmış 2 ondalık = 5.333.363,41 (son kasaya kalan: aynı)
const HEDEF_PAY = 5333363.41;
// Kasa → (011'den ÖNCEKİ tohum, tohum artışından kalan pay). Sonrası bakiye ≈ eski tohum + 2.666.667 (zindan, kolezyum) / 2.666.666 (dünya bossu)
const KASALAR = { dungeon: 10000000, arena: 4000000, worldBoss: 6000000 };

export function up(db) {
  const oku = (anahtar) => {
    const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(anahtar);
    if (!r) return null;
    try { return JSON.parse(r.value); } catch { return null; }
  };
  const piyango = oku(PIYANGO);
  const hazine = oku(HAZINE);
  if (!piyango || !hazine || !hazine.pools) return;
  // olay kimliği
  if (piyango.pool !== 4000000 || piyango.amortiPool !== 2.02 || piyango.totalTickets !== 94) return;
  const yakin = (deger, taban) => Math.abs(Number(deger) - (taban + 2666667)) < 1000;
  if (!Object.entries(KASALAR).every(([id, taban]) => yakin(hazine.pools[id], taban))) return;

  hazine.inflow = hazine.inflow && typeof hazine.inflow === 'object' ? hazine.inflow : {};
  let toplam = 0;
  for (const [id, taban] of Object.entries(KASALAR)) {
    const hedef = taban + HEDEF_PAY;
    const eksik = k2(hedef - Number(hazine.pools[id]));
    if (!(eksik > 0)) continue;
    hazine.pools[id] = k2(Number(hazine.pools[id]) + eksik);
    hazine.inflow[id] = k2((Number(hazine.inflow[id]) || 0) + eksik);
    toplam += eksik;
  }
  hazine.lifetimeDeposited = k2((Number(hazine.lifetimeDeposited) || 0) + toplam);
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(HAZINE, JSON.stringify(hazine));
}
