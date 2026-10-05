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
  fragments: 'assets/ui/res_fragments.webp', keys: 'assets/ui/res_keys.webp', boxes: 'assets/ui/res_boxes.webp'
};
export function resImg(key, emoji = '', style = '') {
  const src = RES_ART[key];
  if (!src) return attr(emoji);
  return `<img src="${src}" alt="" class="art-ico" style="image-rendering:pixelated;object-fit:contain;${style}" draggable="false" loading="lazy" data-fb="text:${attr(emoji)}">`;
}
