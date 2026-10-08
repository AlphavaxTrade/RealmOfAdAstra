// Geçiş 002: tabloların SONRADAN eklenen sütunları. Eskiden accounts.js, db.js ve kapi.js içinde try/catch ile ekleniyordu
// (kurumsal A5.3). Sütun varsa dokunmaz; eski kayıt dosyası ve yeni dosya aynı son şemaya varır.
import { kolonEkle } from './kolon.js';

export const surum = 2;
export const ad = 'kolonlar';

export function up(db) {
  // Ödeme imza kaydı (çift ödeme önlemi): eski dosyalarda yoktu
  for (const k of ['raw_tx TEXT', 'tx_nonce INTEGER']) kolonEkle(db, 'payouts', k);
  // İki adımlı doğrulama (TOTP) ve yedek kodlar
  for (const k of ['totp_secret TEXT', 'totp_pending TEXT', 'totp_enabled INTEGER NOT NULL DEFAULT 0', 'totp_step INTEGER NOT NULL DEFAULT 0', 'backup_codes TEXT']) kolonEkle(db, 'accounts', k);
  // Kapı kuralı (vatandaş / bekleme sırası / askı)
  for (const k of ["gate TEXT NOT NULL DEFAULT 'new'", 'gate_at INTEGER', 'gate_prio INTEGER NOT NULL DEFAULT 0', 'warned_at INTEGER']) kolonEkle(db, 'players', k);
}
