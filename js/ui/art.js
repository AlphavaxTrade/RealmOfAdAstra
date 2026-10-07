// Oyun görselleri (Gemini ile üretilen piksel sanatı, 5 Ekim 2026) — public/assets/ui/
// Resim yüklenemezse data-fb ile eski emoji gösterilir (bkz. public/boot.js).

export const EQUIP_ART = {
  weapon: 'assets/ui/eq_weapon.webp',
  helmet: 'assets/ui/eq_helmet.webp',
  armor: 'assets/ui/eq_armor.webp',
  legs: 'assets/ui/eq_legs.webp',
  boots: 'assets/ui/eq_boots.webp'
};

export const SOLDIER_PORTRAITS = ['assets/ui/soldier_1.webp', 'assets/ui/soldier_2.webp', 'assets/ui/soldier_3.webp', 'assets/ui/soldier_4.webp'];
export const DEFAULT_SOLDIER_AVATAR = 'assets/soldier_avatar.jpg';

// Asker numarasına (1'den başlar) göre sırayla portre
export const portraitFor = n => SOLDIER_PORTRAITS[(Math.max(1, Number(n) || 1) - 1) % SOLDIER_PORTRAITS.length];

// Askerin portresi: kendine özel resmi varsa o, yoksa sırasına göre
export function soldierPortrait(sol, idx) {
  const a = sol && sol.avatar;
  return a && a !== DEFAULT_SOLDIER_AVATAR ? a : portraitFor(idx + 1);
}

const attr = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Eşya simgesi (yuva türüne göre); emoji yedek
export function equipImg(slot, emoji = '', cls = '') {
  const src = EQUIP_ART[slot];
  if (!src) return attr(emoji);
  return `<img src="${src}" alt="" class="art-ico ${cls}" draggable="false" loading="lazy" data-fb="text:${attr(emoji)}">`;
}

// Hammadde simgeleri (pazar, silo, üst çubuk)
export const RES_ART = {
  wood: 'assets/ui/res_wood.webp', iron: 'assets/ui/res_iron.webp', wheat: 'assets/ui/res_wheat.webp',
  stone: 'assets/ui/res_stone.webp', coal: 'assets/ui/res_coal.webp', herb: 'assets/ui/res_herb.webp',
  fragments: 'assets/ui/res_fragments.webp', keys: 'assets/ui/res_keys.webp', boxes: 'assets/ui/res_boxes.webp'
};
export function resImg(key, emoji = '', style = '') {
  const src = RES_ART[key];
  if (!src) return attr(emoji);
  return `<img src="${src}" alt="" class="art-ico" style="image-rendering:pixelated;object-fit:contain;${style}" draggable="false" loading="lazy" data-fb="text:${attr(emoji)}">`;
}

// Çark ödülleri: ödül türüne göre resim
export function rewardArtSrc(r) {
  if (!r) return null;
  if (r.id === 'ada_5000') return 'assets/ui/rw_jackpot.webp';
  if (r.type === 'ada') return 'assets/ui/rw_ada.webp';
  if (r.type === 'bot_free') return 'assets/ui/bot.webp';
  if (r.type === 'ticket_shard') return 'assets/ui/rw_ticket.webp';
  if (r.type === 'analysis_code') return 'assets/ui/rw_coupon.webp';
  if (r.type === 'key') return RES_ART.keys;
  if (r.key && RES_ART[r.key]) return RES_ART[r.key];
  return null;
}
export function rewardImg(r, size = 32) {
  const src = rewardArtSrc(r);
  const emoji = (r && r.icon) || '🎁';
  if (!src) return attr(emoji);
  return `<img src="${src}" alt="" draggable="false" style="width:${size}px;height:${size}px;object-fit:contain;image-rendering:pixelated;display:inline-block;" data-fb="text:${attr(emoji)}">`;
}
