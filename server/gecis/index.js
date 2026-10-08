// Veritabanı şema geçişleri (migration) çalıştırıcısı (kurumsal A5.2).
// Sıralı, numaralı, TEK SEFERLİK ve işlem (transaction) içinde: bir geçiş yarıda patlarsa o geçişin hiçbir değişikliği kalmaz.
// Uygulananlar schema_migrations tablosuna yazılır. Uygulanmış bir geçişin numarası/adı değişirse ya da veritabanı uygulamadan
// DAHA YENİ bir şemadaysa (eski uygulama yeni dosyayı açmaya çalışıyor) başlatma açık hatayla durur.
import { GECISLER as VARSAYILAN } from './liste.js';

export function gecisleriCalistir(db, { gecisler = VARSAYILAN, saat = () => Date.now() } = {}) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (surum INTEGER PRIMARY KEY, ad TEXT NOT NULL, uygulandi INTEGER NOT NULL)');
  const uygulanan = new Map(db.prepare('SELECT surum, ad FROM schema_migrations').all().map(r => [r.surum, r.ad]));
  const enBuyuk = Math.max(0, ...gecisler.map(g => g.surum));
  const adlar = new Set();
  for (const g of gecisler) {
    if (!Number.isInteger(g.surum) || g.surum < 1) throw new Error(`Geçiş numarası geçersiz: ${g.ad}`);
    if (adlar.has(g.surum)) throw new Error(`Geçiş numarası iki kez kullanılmış: ${g.surum}`);
    adlar.add(g.surum);
  }
  for (const [s, a] of uygulanan) {
    if (s > enBuyuk) throw new Error(`Veritabanı bu uygulamadan daha YENİ bir şema sürümünde (${s} > ${enBuyuk}). Uygulamayı güncelle ya da yedekten dön; eski uygulamayla açılmaz.`);
    const bilinen = gecisler.find(g => g.surum === s);
    if (!bilinen || bilinen.ad !== a) throw new Error(`Uygulanmış geçiş ${s} ("${a}") kodda yok ya da adı değişmiş. Uygulanmış geçişler silinmez/yeniden adlandırılmaz.`);
  }
  const yeni = [];
  for (const g of [...gecisler].sort((a, b) => a.surum - b.surum)) {
    if (uygulanan.has(g.surum)) continue;
    db.exec('BEGIN');
    try {
      g.up(db);
      db.prepare('INSERT INTO schema_migrations (surum, ad, uygulandi) VALUES (?, ?, ?)').run(g.surum, g.ad, saat());
      db.exec('COMMIT');
      yeni.push(g.surum);
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Şema geçişi ${String(g.surum).padStart(3, '0')}_${g.ad} başarısız, geri alındı: ${e.message}`);
    }
  }
  return { uygulanan: yeni, son: enBuyuk };
}
