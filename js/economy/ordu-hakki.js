// Realm of AdAstra — Zindan ilerlemesine bağlı asker hakkı (saf hesap; 18 Ekim 2026).
// Kural (30 Eylül 2026 kararı 5, 18 Ekim 2026'da ölçümle yeniden kuruldu): asker sayısı <= geçilen zindan katı + 1.
//   • Normal mod: 1. katta 2, 2. katta 3 … 6. katta 7 asker. İlerleme, o an savaşılacak canavarın katıdır (dungeonProgress).
//   • Zindan modları (Zor, Uzman, Cehennem: js/config.js ZINDAN_MODLARI, sonraki adım): her mod 6 kat daha ekler; hak modlar arasında
//     BİRİKİR ve hiç düşmez (Zor 8-13, Uzman 14-19, Cehennem 20-25).
// Hak yalnız YENİ asker alımını sınırlar: zaten sahip olunan asker hiçbir zaman silinmez (eski kayıtlar korunur).
// Neden: teçhizat (dövme, geliştirme, aşınma, tamir) döngüsünü zorunlu kılar; asker sayısı sınırlıyken tek yol askerleri güçlendirmektir.
// Ölçüm ve gerekçe: scripts/model/zindan_denge.mjs, zindan_tempo.mjs, zindan_ayarla.mjs.
import { DUNGEON_LEVELS, getDungeonEntry } from '../bestiary.js';

export const KAT_SAYISI = Math.max(...DUNGEON_LEVELS.map((e) => e.floor));   // 6
export const ENFAZLA_SEVIYE = DUNGEON_LEVELS.length;                          // 18

// Bir zindan seviyesinin (1-18) katı; sınır dışı değerler 1-18 aralığına çekilir
export const katOf = (seviye) => getDungeonEntry(Math.min(ENFAZLA_SEVIYE, Math.max(1, Math.floor(Number(seviye) || 1)))).floor;

// ilerleme: state.dungeonProgress (savaşılacak canavarın seviyesi; 18 yenilince 19 olur), mod: state.dungeonMode (0 Normal)
export function askerHakki({ ilerleme = 1, mod = 0 } = {}) {
  const m = Math.max(0, Math.floor(Number(mod) || 0));
  return m * KAT_SAYISI + katOf(ilerleme) + 1;
}
