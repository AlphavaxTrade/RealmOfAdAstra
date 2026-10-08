// Geçiş 003: oturum anahtarları düz saklanıyordu, SHA-256 özetine çevrilir (kurumsal A2.7 → A5.3'te geçişe alındı).
// Eski kayıt dosyalarındaki satırlar yerinde dönüştürülür (kimse çıkış yapmaz); boş dosyada yapacak iş yoktur.
import { eskiOturumlariOzetle } from '../oturum.js';

export const surum = 3;
export const ad = 'oturum_ozet';

export function up(db) {
  eskiOturumlariOzetle(db);
}
