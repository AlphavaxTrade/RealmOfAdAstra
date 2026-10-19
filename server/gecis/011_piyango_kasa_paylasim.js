// Geçiş 011: Piyango kasası küçültülür, artan kısım üç oyuncu kasasına eşit paylaştırılır (kullanıcı kararı, 19 Ekim 2026).
// Gerekçe: günlük 100 bilet sınırıyla bile kasa 20 yılda bitmiyordu (en büyük tek kazanç ~1 M); büyük kısmı boşta duruyordu.
// Kasada 4 M ASTRA kalır; üstü dünya bossu, Kolezyum (arena) ve zindan kasalarına üçe bölünür (kuruş farkı son kasaya).
// Toplam korunur: piyangodan çıkan = kasalara giren (200 M toplam tohum değişmez). Kasa bakiyesi zaten 4 M'ye eşit ya da küçükse
// (ya da dünya/hazine kaydı henüz yoksa) hiçbir şey yapılmaz. Geçiş tek seferliktir (schema_migrations kaydı).
export const surum = 11;
export const ad = 'piyango_kasa_paylasim';

const HEDEF = 4000000;
const KASALAR = ['worldBoss', 'arena', 'dungeon'];
const PIYANGO = 'world:lottery';
const HAZINE = 'ls:adastra_treasury_ledger_v4';
const k2 = (n) => Math.round(Number(n) * 100) / 100;

export function up(db) {
  const oku = (anahtar) => {
    const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(anahtar);
    if (!r) return null;
    try { return JSON.parse(r.value); } catch { return null; }
  };
  const yaz = (anahtar, nesne) => db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(anahtar, JSON.stringify(nesne));

  const piyango = oku(PIYANGO);
  const hazine = oku(HAZINE);
  if (!piyango || !hazine || typeof hazine.pools !== 'object' || !hazine.pools) return;
  const havuz = Number(piyango.pool);
  if (!(havuz > HEDEF)) return;

  const artan = k2(havuz - HEDEF);
  const pay = Math.floor((artan / KASALAR.length) * 100) / 100;
  const paylar = KASALAR.map((_, i) => (i < KASALAR.length - 1 ? pay : k2(artan - pay * (KASALAR.length - 1))));

  piyango.pool = HEDEF;
  hazine.inflow = hazine.inflow && typeof hazine.inflow === 'object' ? hazine.inflow : {};
  KASALAR.forEach((id, i) => {
    hazine.pools[id] = k2((Number(hazine.pools[id]) || 0) + paylar[i]);
    hazine.inflow[id] = k2((Number(hazine.inflow[id]) || 0) + paylar[i]);
  });
  hazine.lifetimeDeposited = k2((Number(hazine.lifetimeDeposited) || 0) + artan);
  yaz(PIYANGO, piyango);
  yaz(HAZINE, hazine);
}
