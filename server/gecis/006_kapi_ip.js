// Geçiş 006: kapı kuralına istemci adresi kotası (13 Ekim 2026 denetimi, EK-02b). HAM IP SAKLANMAZ: yalnız tuzlu özeti.
//   players.kayit_ip      : hesabın doğrulandığı istemci adresinin tuzlu özeti (kota ve davet sırası için)
//   kapi_ip_kabul         : "şu adres özetinden şu oyuncu şu an vatandaşlığa kabul edildi" kayıtları (24 saatlik kota sayımı)
// Kayıtlar 48 saatten eskiyse kod tarafından silinir (server/kapi.js).
import { kolonEkle } from './kolon.js';

export const surum = 6;
export const ad = 'kapi_ip';

export function up(db) {
  kolonEkle(db, 'players', 'kayit_ip TEXT');
  db.exec(`
CREATE TABLE IF NOT EXISTS kapi_ip_kabul (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT NOT NULL, player TEXT NOT NULL, at INTEGER NOT NULL
);
-- Kota sayımı: "bu adres özeti son 24 saatte kaç kişiyi vatandaş yaptı"
CREATE INDEX IF NOT EXISTS kapi_ip_kabul_ip_at ON kapi_ip_kabul (ip, at);
CREATE INDEX IF NOT EXISTS kapi_ip_kabul_at ON kapi_ip_kabul (at);
-- Aynı adres özetini taşıyan bekleyen adaylar (davet sırası kota denetimi)
CREATE INDEX IF NOT EXISTS players_kayit_ip ON players (kayit_ip);
`);
}
