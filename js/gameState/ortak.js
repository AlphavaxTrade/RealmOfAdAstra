// Realm of AdAstra — GameStateManager'ın ortak küçük yardımcıları (js/gameState.js'ten AYNEN taşındı, kurumsal A3.11)
import { GAME_CONFIG } from '../config.js';

// Asker portreleri (public/assets/ui, 5 Ekim 2026): numarasına göre sırayla
export const SOLDIER_PORTRAITS = ['assets/ui/soldier_1.webp', 'assets/ui/soldier_2.webp', 'assets/ui/soldier_3.webp', 'assets/ui/soldier_4.webp'];
export const soldierPortraitFor = n => SOLDIER_PORTRAITS[(Math.max(1, Number(n) || 1) - 1) % SOLDIER_PORTRAITS.length];

// Oyuncunun yazdığı isimler başka oyuncuların ekranında da görünür (Kolezyum sıralaması, maç kayıtları):
// HTML/kod gibi çalışabilecek işaretler ve görünmez karakterler atılır.
export const cleanName = (s, max = 24) => String(s == null ? '' : s)
  .replace(/[<>&"'`\\\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
  .replace(/\s+/g, ' ').trim().slice(0, max);

// v2 (7 Ekim 2026): hammadde anahtarları config'ten (6 kaynak); eski kayıtlar için yedek üçlü
export const RES_KEYS = () => GAME_CONFIG.RESOURCE_KEYS || ['wood', 'iron', 'wheat'];
export const zeroRes = () => Object.fromEntries(RES_KEYS().map(k => [k, 0]));
export const round3 = v => Math.round((Number(v) || 0) * 1000) / 1000;

// Geliştirme bedelinin talep çarpanı (19 Ekim 2026): 0 → arz ölçeği (yeni oyuncu takılmasın), 1 → talep ölçeği (config HAMMADDE.ORAN kat). oran 0-1 arası kırpılır.
export const talepCarpani = (oran) => {
  const H = GAME_CONFIG.HAMMADDE || {};
  const o = Math.max(0, Math.min(1, Number(oran) || 0));
  return 1 + ((H.ORAN || 1) - 1) * o;
};

// Oyuncuya gösterilen kaynak adı ve simgesi: önce config'teki RESOURCE_META, sonra savaş/ödül kalemleri
const KALEM_ADLARI = {
  ada: 'ASTRA', adastra: 'ASTRA', ticket: 'Bilet', fragments: 'Teçhizat Parçası', boxes: 'Pandora Kutusu', keys: 'Anahtar',
  scroll_heal: 'Şifa Parşömeni', scroll_stamina: 'Stamina Parşömeni', scroll_teleport: 'Işınlanma Parşömeni'
};
const KALEM_SIMGELERI = { fragments: '🧩', boxes: '📦', keys: '🔑', scroll_heal: '📜', scroll_stamina: '⚡' };

export function kaynakAdi(anahtar) {
  if (!anahtar) return '';
  const k = String(anahtar).toLowerCase();
  const meta = (GAME_CONFIG.RESOURCE_META || {})[k];
  return (meta && meta.name) || KALEM_ADLARI[k] || anahtar;
}

export function kaynakSimgesi(anahtar) {
  const meta = (GAME_CONFIG.RESOURCE_META || {})[anahtar];
  return (meta && meta.icon) || KALEM_SIMGELERI[anahtar] || '';
}
