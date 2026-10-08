// Geçiş 004: indeksler (kurumsal A5.5). Her indeks, `node scripts/db/sorgu-plani.mjs` raporunda TABLOYU BAŞTAN SONA TARAYAN ve
// tablosu zamanla büyüyen bir sorguya karşılık gelir; gerekçe yanında. Kanıtsız indeks eklenmez (her indeks yazmayı biraz yavaşlatır).
export const surum = 4;
export const ad = 'indeksler';

export function up(db) {
  db.exec(`
-- Oturumlar: her girişte süresi dolanlar silinir (db.js sessionsPurge), şifre sıfırlama/çıkışta adrese göre silinir
CREATE INDEX IF NOT EXISTS sessions_bitis ON sessions (expires);
CREATE INDEX IF NOT EXISTS sessions_adres ON sessions (address);
-- Cüzdan imza mesajları: süresi dolanlar temizlenir
CREATE INDEX IF NOT EXISTS nonces_bitis ON nonces (expires);
-- E-posta bağlantıları: hesap+tür ile silinir (kayıt/şifre unuttum), süresi dolanlar temizlenir
CREATE INDEX IF NOT EXISTS email_tokens_hesap ON email_tokens (account_id, kind);
CREATE INDEX IF NOT EXISTS email_tokens_bitis ON email_tokens (expires);
-- Kapı kuralı: her istekte gösterilen vatandaş/sıra sayımı ve sıra listeleri (banned=0 ve gate'e göre)
CREATE INDEX IF NOT EXISTS players_banned_gate ON players (banned, gate);
-- Yatırmalar: oyuncunun geçmişi (adres, en yeni blok önce); işlenmemiş yatırmalar her turda taranır → yalnız onları tutan küçük indeks
CREATE INDEX IF NOT EXISTS deposits_adres_blok ON deposits (address, block DESC);
CREATE INDEX IF NOT EXISTS deposits_bekleyen ON deposits (address) WHERE credited_at IS NULL;
-- Hesaplar: cüzdandan hesap bulma ((wallet = ? OR pending_wallet = ?) sorgusu; wallet zaten UNIQUE indeksli)
CREATE INDEX IF NOT EXISTS accounts_bekleyen_cuzdan ON accounts (pending_wallet);
-- Ödemeler: her turda pending/sending listesi, oyuncu geçmişi, haftalık gönderim toplamı, sıcak cüzdan ihtiyaç hesabı
CREATE INDEX IF NOT EXISTS payouts_durum_id ON payouts (status, id);
CREATE INDEX IF NOT EXISTS payouts_adres_id ON payouts (address, id);
CREATE INDEX IF NOT EXISTS payouts_durum_gonderim ON payouts (status, sent_at);
CREATE INDEX IF NOT EXISTS payouts_epoch ON payouts (epoch);
-- Oyun Kasası işlemleri: bekleyen/gönderilen kuyruk ve oyuncunun son işlemleri
CREATE INDEX IF NOT EXISTS kasa_ops_durum_id ON kasa_ops (status, id);
CREATE INDEX IF NOT EXISTS kasa_ops_oyuncu_id ON kasa_ops (player, id);
-- Ödeme teklifleri: açık ve süresi dolmuşların temizliği
CREATE INDEX IF NOT EXISTS pay_quotes_durum ON pay_quotes (status, expires);
-- İlan pazarı: satıcı/alıcının kapanmış ilanları ((seller = ? OR buyer = ?) sorgusu)
CREATE INDEX IF NOT EXISTS listings_satici ON listings (seller);
CREATE INDEX IF NOT EXISTS listings_alici ON listings (buyer);
`);
}
