// Geçiş 008: Muhafız Mührü (iki adımlı doğrulama) yönetici onaylı SIFIRLAMA (14 Ekim 2026).
// Telefonunu ve yedek kodlarını kaybeden oyuncunun parası içeride kalmasın diye yönetici sıfırlamayı başlatır; 48 saat BEKLER
// (e-postadaki "bu ben değilim" bağlantısıyla hesabın gerçek sahibi iptal eder), süre dolunca mühür kalkar.
//   accounts.totp_reset_at   : sıfırlamanın uygulanacağı an (ms); NULL = bekleyen sıfırlama yok
//   accounts.totp_reset_note : yöneticinin yazdığı gerekçe (olay günlüğüne de yazılır)
// İptal bağlantısının belirteci email_tokens'ta 'tfa_reset' türüyle durur (diğer bağlantılar gibi yalnız SHA-256 özeti).
import { kolonEkle } from './kolon.js';

export const surum = 8;
export const ad = 'muhur_sifirlama';

export function up(db) {
  kolonEkle(db, 'accounts', 'totp_reset_at INTEGER');
  kolonEkle(db, 'accounts', 'totp_reset_note TEXT');
}
