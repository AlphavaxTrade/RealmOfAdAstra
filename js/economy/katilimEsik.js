// Katılım Puanı beklenen haftalık eşik — TEK KAYNAK: sunucu (server/aktiflik.js) da tarayıcı (kişisel karne) da bunu kullanır.
// Eşik seviyeyle büyür: yeni oyuncudan haftada ESIK_TABAN alana dokunması, üst seviyeden ESIK_TAVAN alana dokunması beklenir.
import { GAME_CONFIG } from '../config.js';

export function esikSeviye(level, cfg = GAME_CONFIG.KATILIM_PUANI) {
  const taban = Number(cfg?.ESIK_TABAN) || 0, tavan = Number(cfg?.ESIK_TAVAN) || taban, aralik = Math.max(1, Number(cfg?.ESIK_SEVIYE_ARALIGI) || 10);
  const lvl = Math.max(1, Number(level) || 1);
  return Math.min(tavan, taban + Math.floor((lvl - 1) / aralik));
}
