// AdAstra Vadisi — bölge binaları Kenney parçalarından (karo birimi 1; grup S katıyla büyütülür)
// Her kurucu bir gruba parçaları ekler ve { top } (etiket yüksekliği, dünya birimi) döndürür.
import * as THREE from 'three';
import { piece } from './yukle.js';

export const S = 2.3;   // 1 karo = 2,3 dünya birimi
let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
export const resetSeed = () => { seed = 11; };
const T = k => 'town/' + k, C = k => 'castle/' + k, N = k => 'nature/' + k;

// Düz renkli yardımcı şekiller (model bulunmayan yerler için)
const matCache = new Map();
const mat = hex => { if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0, flatShading: true })); return matCache.get(hex); };
const sh = m => { m.castShadow = true; m.receiveShadow = true; return m; };
const box = (w, h, d, c, x = 0, y = 0, z = 0) => { const m = sh(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c))); m.position.set(x, y + h / 2, z); return m; };
const cyl = (rt, rb, h, c, seg, x = 0, y = 0, z = 0) => { const m = sh(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c))); m.position.set(x, y + h / 2, z); return m; };
const cone = (r, h, c, seg, x = 0, y = 0, z = 0) => { const m = sh(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(c))); m.position.set(x, y + h / 2, z); return m; };

// Duvar paneli: karo merkezi (tx, tz), kenar yönü dir (0 doğu +x, 1 kuzey −z, 2 batı, 3 güney +z), kat seviyesi lv
const panel = (g, key, tx, tz, dir, lv = 0) => g.add(piece(key, { x: tx, y: lv, z: tz, ry: dir * Math.PI / 2 }));

// Ev: w × d karo, floors kat; güney ortada kapı; çatı kirişi x boyunca (w ≥ d) ya da z boyunca
export function house(g, { w = 3, d = 2, floors = 1, x = 0, z = 0, wood = false, roof = 'roof-gable', chimney = true, banner = null, ry = 0 } = {}) {
  const h = new THREE.Group(); h.position.set(x, 0, z); h.rotation.y = ry;
  const pre = wood ? 'wall-wood' : 'wall';
  const x0 = -(w - 1) / 2, z0 = -(d - 1) / 2;
  for (let lv = 0; lv < floors; lv++) {
    for (let i = 0; i < w; i++) {
      const tx = x0 + i;
      const southKey = (lv === 0 && i === Math.floor(w / 2)) ? `${pre}-door` : (i % 2 === 0 ? `${pre}-window-shutters` : pre);
      panel(h, T(southKey), tx, z0 + d - 1, 3, lv);
      panel(h, T(i % 2 ? `${pre}-window-small` : pre), tx, z0, 1, lv);
    }
    for (let j = 0; j < d; j++) {
      const tz = z0 + j;
      panel(h, T(j % 2 ? `${pre}-window-shutters` : pre), x0 + w - 1, tz, 0, lv);
      panel(h, T(j % 2 ? pre : `${pre}-window-small`), x0, tz, 2, lv);
    }
  }
  // Çatı: kiriş uzun kenar boyunca; gable parçası 1 karo genişliğinde, derinliği d'ye ölçeklenir
  const alongX = w >= d;
  const len = alongX ? w : d, dep = alongX ? d : w;
  for (let i = 0; i < len; i++) {
    const key = T(i === 0 || i === len - 1 ? 'roof-gable-end' : roof);
    const p = piece(key, { y: floors, sz: dep / 1.07 * 1.02, sx: 1.02, sy: 1 });
    if (alongX) { p.position.x = x0 + i; p.position.z = 0; } else { p.position.z = z0 + i; p.position.x = 0; p.rotation.y = Math.PI / 2; }
    h.add(p);
  }
  if (chimney) h.add(piece(T('chimney'), { x: x0 + 0.2, y: floors + 0.3, z: alongX ? -0.2 : 0 }));
  if (banner) h.add(piece(T(banner), { x: x0 + w - 1, y: 0.1, z: z0 + d - 1 + 0.1, ry: Math.PI }));
  g.add(h);
  return h;
}

function tree(g, x, z, kind = 'tree_default', s = 1) { g.add(piece(N(kind), { x, z, s: s * 1.4, ry: rnd() * 6.28 })); }
function fenceRing(g, r, n = 14, key = 'fence_simple') { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.add(piece(N(key), { x: Math.cos(a) * r, z: Math.sin(a) * r, ry: -a, sx: (2 * Math.PI * r / n), s: 1 })); } }

export const BINA = {
  village(g) {
    house(g, { w: 2, d: 2, x: -2.6, z: -1.6, banner: 'banner-red' });
    house(g, { w: 3, d: 2, x: 1.4, z: -1.8, wood: true });
    house(g, { w: 2, d: 3, x: -2.2, z: 2.2, roof: 'roof-gable' });
    house(g, { w: 3, d: 2, floors: 2, x: 1.6, z: 2.4, wood: true, banner: 'banner-green' });
    g.add(piece(T('lantern'), { x: 0, z: 0.3 })); g.add(piece(T('cart'), { x: -0.2, z: -0.6, ry: 0.4 }));
    for (let i = 0; i < 4; i++) g.add(piece(N(['flower_redA', 'flower_yellowA', 'flower_purpleA', 'plant_bushSmall'][i]), { x: -4 + i * 2.6, z: 4.4, s: 1.2 }));
    return { top: 3.6 * S };
  },
  tavern(g) {
    house(g, { w: 4, d: 3, floors: 2, wood: true, banner: 'banner-red' });
    g.add(piece(T('stall-bench'), { x: -1.3, z: 2.3 })); g.add(piece(T('stall-bench'), { x: 1.3, z: 2.3 })); g.add(piece(T('lantern'), { x: 2.7, z: 1.9 }));
    g.add(piece(N('log_stack'), { x: -2.9, z: 0.8 }));
    return { top: 4 * S };
  },
  healer(g) {
    house(g, { w: 3, d: 2, chimney: false, banner: 'banner-green' });
    for (let i = 0; i < 3; i++) g.add(piece(N(i === 1 ? 'crops_leafsStageB' : 'plant_bushSmall'), { x: -1.2 + i * 1.2, z: 2 }));
    g.add(piece(N('pot_large'), { x: 2.3, z: 1.4 })); g.add(piece(N('flower_purpleC'), { x: -2.3, z: 1.5, s: 1.3 }));
    return { top: 3 * S };
  },
  blacksmith(g) {
    house(g, { w: 3, d: 2, wood: true, roof: 'roof-gable' });
    g.add(piece(T('chimney'), { x: 0.8, y: 1.2, z: -0.3, s: 1.4 }));
    g.add(piece(T('planks'), { x: 2.4, z: 0.6 })); g.add(piece(N('log_stack'), { x: 2.4, z: 0.6, s: 1.2 }));
    g.add(box(0.6, 0.35, 0.3, 0x3b3b3b, -1.9, 0.3, 1.5)); g.add(cyl(0.35, 0.4, 0.3, 0x6b4a2b, 8, -1.9, 0, 1.5));   // örs + kütük
    g.add(cyl(0.5, 0.55, 0.5, 0x7f8c8d, 10, 2.3, 0, -1.0)); g.add(cyl(0.2, 0.3, 0.7, 0xff6a00, 10, 2.3, 0.5, -1.0));   // ocak
    return { top: 3 * S };
  },
  market(g) {
    g.add(piece(T('fountain-round'), { s: 1.4 })); g.add(piece(T('fountain-center'), { y: 0.28, s: 1.4 })); g.add(cyl(0.12, 0.12, 1, 0xdfe6ee, 8, 0, 0.3, 0));
    const stalls = ['stall-red', 'stall-green', 'stall-red', 'stall-green', 'stall-red', 'stall-green'];
    stalls.forEach((k, i) => { const a = i / 6 * Math.PI * 2 + 0.3; g.add(piece(T(k), { x: Math.cos(a) * 3.2, z: Math.sin(a) * 2.6, ry: -a + Math.PI / 2 })); });
    g.add(piece(T('cart-high'), { x: 4.2, z: 1.2, ry: 0.6 })); g.add(piece(T('lantern'), { x: -4, z: -1 })); g.add(piece(T('lantern'), { x: 4, z: -2.2 }));
    for (let i = 0; i < 6; i++) g.add(piece(T('planks'), { x: -3.5 + i * 1.4, z: 3.9 }));
    return { top: 2 * S };
  },
  council(g) {
    // Taş saray: 5×3, 2 kat, önde sütunlar, kubbe
    house(g, { w: 5, d: 3, floors: 2, chimney: false, roof: 'roof-gable' });
    for (let i = 0; i < 5; i++) g.add(piece(T('pillar-stone'), { x: -2 + i, y: 0, z: 2.2, sy: 2 }));
    g.add(piece(T('planks'), { x: 0, y: 2, z: 2.2, sx: 5.2 }));
    g.add(sh(new THREE.Mesh(new THREE.SphereGeometry(1.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xa78bfa)))).position.set(0, 3.1, 0);
    g.add(piece(T('banner-red'), { x: -2.4, y: 0.6, z: 1.55, ry: Math.PI })); g.add(piece(T('banner-red'), { x: 2.4, y: 0.6, z: 1.55, ry: Math.PI }));
    g.add(piece(N('statue_obelisk'), { x: -3.6, z: 2.6, s: 1.3 })); g.add(piece(N('statue_obelisk'), { x: 3.6, z: 2.6, s: 1.3 }));
    return { top: 4.6 * S };
  },
  carnival(g) {
    g.add(piece(N('tent_detailedOpen'), { s: 3.6, ry: 0.3 }));
    g.add(piece(N('tent_smallClosed'), { x: 3.2, z: 1.2, s: 2.6 })); g.add(piece(N('tent_smallClosed'), { x: -3.1, z: 1.6, s: 2.2, ry: 0.5 }));
    const wheel = new THREE.Group(); wheel.add(sh(new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.08, 6, 20), mat(0xfbbf24))));
    for (let i = 0; i < 8; i++) { const c = box(0.42, 0.42, 0.42, [0x3b82f6, 0xef4444, 0x10b981, 0xf59e0b][i % 4]); c.position.set(Math.cos(i * 0.785) * 1.5, Math.sin(i * 0.785) * 1.5, 0); wheel.add(c); }
    for (let i = 0; i < 4; i++) { const sp = box(0.05, 3, 0.05, 0xfde68a); sp.position.y = 0; sp.rotation.z = i * 0.785; wheel.add(sp); }
    wheel.position.set(0.2, 2.1, -3.2); g.add(wheel); g.userData.wheel = wheel;
    g.add(box(0.14, 2.1, 0.14, 0x6b7280, -0.6, 0, -3.2)); g.add(box(0.14, 2.1, 0.14, 0x6b7280, 1.0, 0, -3.2));
    g.add(piece(T('banner-red'), { x: -1.8, z: 2.4, ry: Math.PI })); g.add(piece(T('banner-green'), { x: 1.8, z: 2.4, ry: Math.PI }));
    g.add(piece(T('stall-red'), { x: 2.8, z: -1.6, ry: -0.6 }));
    return { top: 4 * S };
  },
  warehouse(g) {
    // SİLO: iki altıgen kule (castle kiti) + ambar; haritada bir bakışta tanınır
    for (const x of [-1.6, 1.6]) {
      g.add(piece(C('tower-hexagon-base'), { x, z: -1.2, s: 1.5 }));
      for (let i = 0; i < 3; i++) g.add(piece(C('tower-hexagon-mid'), { x, y: 1.31 * 1.5 + i * 0.46 * 1.5, z: -1.2, s: 1.5 }));
      g.add(piece(C('tower-hexagon-roof'), { x, y: (1.31 + 3 * 0.46) * 1.5, z: -1.2, s: 1.5 }));
    }
    house(g, { w: 4, d: 2, x: 0, z: 1.8, wood: true, chimney: false });
    g.add(piece(T('planks'), { x: 3.4, z: 2.2 })); g.add(piece(N('log_stack'), { x: 3.4, z: 2.2, s: 1.3 })); g.add(piece(T('cart'), { x: -3.4, z: 2.4, ry: 1.2 }));
    g.add(box(0.7, 0.7, 0.7, 0xd6b38a, -3.3, 0, 0.3)); g.add(box(0.6, 0.6, 0.6, 0xc9a46c, -3.2, 0.7, 0.4));
    return { top: 5 * S };
  },
  barracks(g) {
    house(g, { w: 5, d: 2, x: 0, z: -2.6, wood: true, chimney: false, banner: 'banner-red' });
    fenceRing(g, 2.6, 16);
    g.add(cyl(2.5, 2.5, 0.08, 0xd9c08d, 24));
    g.add(piece(C('siege-catapult'), { x: 4.1, z: -1.2, s: 1.1, ry: -0.6 }));
    g.add(piece(N('tent_smallClosed'), { x: -4.2, z: -0.4, s: 2.2 })); g.add(piece(N('tent_smallClosed'), { x: -4.4, z: 1.6, s: 2.2, ry: 0.4 }));
    g.add(piece(C('flag'), { x: -3.2, z: -3.6, s: 2.2 })); g.add(piece(C('flag'), { x: 3.2, z: -3.6, s: 2.2 }));
    g.add(box(0.5, 0.5, 1.1, 0x7c2d12, 0, 0.3, 0)); g.add(sh(new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), mat(0x7c2d12)))).position.set(0, 0.95, -0.6);   // at
    return { top: 3.4 * S };
  },
  battlefield(g) {
    const soldier = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.8, 0.42), mat(0xb91c1c), 84); const helm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 6), mat(0xe5e7eb), 84); const m = new THREE.Matrix4();
    for (let i = 0; i < 84; i++) { const x = -6 + (i % 14) * 0.95, z = -2 + Math.floor(i / 14) * 1.1; m.makeTranslation(x, 0.4, z); soldier.setMatrixAt(i, m); m.makeTranslation(x, 0.95, z); helm.setMatrixAt(i, m); }
    soldier.castShadow = true; g.add(soldier); g.add(helm);
    g.add(piece(C('siege-trebuchet'), { x: -6.5, z: -4.6, s: 1.4 })); g.add(piece(C('siege-tower'), { x: 6.2, z: -4.8, s: 1.3, ry: Math.PI })); g.add(piece(C('siege-catapult'), { x: 0, z: -4.8, s: 1.3 }));
    for (let i = 0; i < 4; i++) g.add(piece(C('flag-banner-long'), { x: -5 + i * 3.3, z: 4.2, s: 1.6 }));
    g.add(piece(N('tent_detailedOpen'), { x: 7.5, z: 2.4, s: 2.2, ry: -0.8 }));
    return { top: 3.2 * S };
  },
  colosseum(g) {
    // Kemerli daire: iki kat 'wall-arch-top' panelleri, üstte bayraklar
    const n = 22, r = 3.6;
    for (let lv = 0; lv < 2; lv++) for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.add(piece(T('wall-arch-top'), { x: Math.cos(a) * r, y: lv, z: Math.sin(a) * r, ry: -a, sz: (2 * Math.PI * r / n) })); }   // panelin normali (x) dışa bakar
    g.add(cyl(r - 0.1, r - 0.1, 0.1, 0xe8d9b0, 32)); g.add(cyl(r + 0.5, r + 0.5, 0.08, 0xbdb7a8, 32));
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.add(piece(C(i % 2 ? 'flag' : 'flag-pennant'), { x: Math.cos(a) * r, y: 2, z: Math.sin(a) * r, s: 1.3 })); }
    return { top: 3.2 * S };
  },
  farm(g) {
    for (let i = 0; i < 6; i++) g.add(piece(N('crops_dirtRow'), { x: -4.5 + i * 1.8, z: 0, sz: 7, s: 1.0 }));
    for (let i = 0; i < 6; i++) for (let j = 0; j < 7; j++) g.add(piece(N(j % 3 === 1 ? 'crops_wheatStageA' : 'crops_wheatStageB'), { x: -4.5 + i * 1.8, z: -3 + j * 1.0, s: 1.6 }));
    // Yel değirmeni: altıgen kule + kanatlar
    const mx = 5.2, mz = -1.5;
    g.add(piece(C('tower-hexagon-base'), { x: mx, z: mz, s: 1.3 })); g.add(piece(C('tower-hexagon-mid'), { x: mx, y: 1.31 * 1.3, z: mz, s: 1.3 })); g.add(piece(C('tower-hexagon-roof'), { x: mx, y: (1.31 + 0.46) * 1.3, z: mz, s: 1.3 }));
    const blades = piece(T('windmill'), { x: mx, y: 2.0, z: mz + 0.7, s: 0.9 }); g.add(blades); g.userData.blades = blades;
    for (let i = 0; i < 3; i++) g.add(cone(0.55, 0.9, 0xfbbf24, 8, 4.6 + i * 1.0, 0, 2.6));
    fenceRing(g, 0, 0);
    for (let i = 0; i < 7; i++) { g.add(piece(N('fence_simple'), { x: -5.5 + i * 1.0, z: 4.1 })); g.add(piece(N('fence_simple'), { x: -5.5 + i * 1.0, z: -4.1 })); }
    return { top: 3.8 * S };
  },
  herbgarden(g) {
    for (let i = 0; i < 4; i++) g.add(piece(N('crops_dirtRow'), { x: 0, z: -1.5 + i * 1.0, ry: Math.PI / 2, sz: 5 }));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) g.add(piece(N(i % 2 ? 'crops_leafsStageB' : 'crops_leafsStageA'), { x: -2 + j, z: -1.5 + i, s: 1.4 }));
    for (let i = 0; i < 6; i++) { g.add(piece(N('fence_simple'), { x: -2.5 + i, z: -2.4 })); g.add(piece(N('fence_simple'), { x: -2.5 + i, z: 2.4 })); }
    g.add(piece(N('pot_large'), { x: 3.2, z: 0 })); g.add(piece(N('flower_purpleA'), { x: -3.2, z: 0.5, s: 1.5 })); g.add(piece(N('flower_yellowA'), { x: -3.2, z: -0.6, s: 1.5 }));
    return { top: 1.6 * S };
  },
  forest(g) {
    const kinds = ['tree_default', 'tree_pineDefaultA', 'tree_oak', 'tree_pineRoundA', 'tree_detailed', 'tree_tall', 'tree_pineTallA'];
    for (let i = 0; i < 30; i++) { const a = rnd() * Math.PI * 2, r = 1 + rnd() * 6.5; tree(g, Math.cos(a) * r, Math.sin(a) * r * 0.75, kinds[i % kinds.length], 1.1 + rnd() * 0.9); }
    g.add(piece(N('log_stack'), { x: 0.4, z: 4.3, s: 1.8 })); g.add(piece(N('log'), { x: -1.4, z: 4.6, s: 1.8, ry: 0.6 })); g.add(piece(N('stump_round'), { x: 1.9, z: 4.9, s: 1.6 }));
    g.add(piece(T('cart'), { x: -2.6, z: 5.2, ry: 1.4 }));
    return { top: 3.4 * S };
  },
  _mine(g, rockKind, oreColor) {
    const blk = rockKind === 'rock' ? 'cliff_block_rock' : 'cliff_block_stone';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) g.add(piece(N(blk), { x: -1.5 + i, y: 0, z: -2.2 + j, s: 1 }));
    for (let i = 0; i < 3; i++) g.add(piece(N(blk), { x: -1 + i, y: 1, z: -1.8, s: 1 }));
    g.add(piece(N(blk), { x: 0, y: 2, z: -1.6 }));
    g.add(piece(N(rockKind === 'rock' ? 'cliff_cave_rock' : 'cliff_cave_stone'), { x: 0, y: 0, z: -1.2 + 0.5, s: 1 }));
    g.add(piece(N(rockKind === 'rock' ? 'rock_largeC' : 'stone_largeA'), { x: 2.6, z: 0.4, s: 1.6 })); g.add(piece(N(rockKind === 'rock' ? 'rock_tallB' : 'stone_tallB'), { x: -2.7, z: 0.2, s: 1.3 }));
    g.add(piece(T('cart'), { x: 1.2, z: 1.2, ry: -0.3 })); g.add(piece(T('poles-horizontal'), { x: -1.2, z: 1.0 }));
    for (let i = 0; i < 4; i++) g.add(box(0.35, 0.28, 0.35, oreColor, -1.6 + i * 1.0, 0, 2.0));
    g.add(piece(T('lantern'), { x: 0.9, z: -0.3 }));
    return { top: 3.3 * S };
  },
  coalmine(g) { return BINA._mine(g, 'rock', 0x1f2430); },
  mine(g) { return BINA._mine(g, 'stone', 0x9fb3c8); },
  quarry(g) { return BINA._mine(g, 'stone', 0xe7e5e4); },
  dungeon(g) {
    // Kayalık tepe içinde mağara ağzı, mor kristaller, meşaleler
    for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.55; g.add(piece(N(i % 2 ? 'rock_tallA' : 'stone_tallB'), { x: Math.cos(a + 1.3) * 3.2, z: -1.2 - Math.sin(a) * 1.6, s: 2.8 + (i % 3) * 0.6, ry: a, tint: '#7d6f9c' })); }
    g.add(piece(N('cliff_cave_stone'), { x: 0, z: 0.4, s: 2.2, tint: '#8a7fb0' }));
    g.add(piece(N('rock_largeC'), { x: -3.4, z: 1.2, s: 2.2, tint: '#7d6f9c' })); g.add(piece(N('stone_largeA'), { x: 3.4, z: 1.4, s: 2.2, tint: '#7d6f9c' }));
    for (let i = 0; i < 7; i++) { const c = cone(0.22 + rnd() * 0.2, 0.9 + rnd() * 1.1, 0xc084fc, 5, -3 + rnd() * 6, 0, 1.2 + rnd() * 2.2); c.rotation.z = (rnd() - 0.5) * 0.5; g.add(c); }
    g.add(piece(T('lantern'), { x: -1.4, z: 2.4 })); g.add(piece(T('lantern'), { x: 1.4, z: 2.4 }));
    g.add(piece(N('mushroom_red'), { x: 2.6, z: 3, s: 2 })); g.add(piece(N('mushroom_tanGroup'), { x: -2.6, z: 3.2, s: 2 }));
    return { top: 3.4 * S };
  },
  spaceport(g) {
    g.add(cyl(3.4, 3.4, 0.25, 0x8b949e, 24)); g.add(cyl(2.4, 2.4, 0.08, 0x5b636d, 24, 0, 0.25, 0));
    g.add(cyl(0.7, 0.7, 4.2, 0xf3f4f6, 14, 0, 0.3, 0)); g.add(cone(0.7, 1.3, 0xef4444, 14, 0, 4.5, 0)); g.add(cyl(0.72, 0.72, 0.3, 0xef4444, 14, 0, 1.6, 0));
    for (let i = 0; i < 3; i++) { const f = box(0.18, 1.1, 0.9, 0xef4444); f.position.set(Math.cos(i * 2.09) * 0.75, 0.85, Math.sin(i * 2.09) * 0.75); f.rotation.y = -i * 2.09; g.add(f); }
    g.add(piece(C('tower-square-base'), { x: 2.4, z: 0, s: 1.1 })); g.add(piece(C('tower-square-mid-open'), { x: 2.4, y: 1.01 * 1.1, z: 0, s: 1.1 })); g.add(piece(C('tower-square-mid-open'), { x: 2.4, y: 2.02 * 1.1, z: 0, s: 1.1 })); g.add(piece(C('tower-square-top'), { x: 2.4, y: 3.03 * 1.1, z: 0, s: 1.1 }));
    g.add(box(1.4, 0.2, 0.3, 0x8b949e, 1.5, 3.4, 0));
    for (let i = 0; i < 4; i++) g.add(box(0.9, 0.9, 0.9, [0x3b82f6, 0xf59e0b, 0xef4444, 0x10b981][i], -3.6 + i * 1.1, 0, 3.2));
    g.add(piece(T('lantern'), { x: -3.2, z: -2.6 })); g.add(piece(N('platform_stone'), { x: -3, z: 0.6, s: 2 }));
    return { top: 5.5 * S };
  }
};

// Kale duvarı (castle kiti): hw × hd karo yarı genişlik/derinlik; köşelerde kuleler, güneyde kapı
export function castle(g, hw, hd) {
  const wall = (x, z, ry) => g.add(piece(C('wall'), { x, z, ry }));
  for (let i = -hw + 1; i <= hw - 1; i++) { wall(i, -hd, 0); if (Math.abs(i) > 1) wall(i, hd, 0); }
  for (let j = -hd + 1; j <= hd - 1; j++) { wall(-hw, j, Math.PI / 2); wall(hw, j, Math.PI / 2); }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.add(piece(C('tower-square'), { x: sx * hw, z: sz * hd })); g.add(piece(C('tower-square-top-roof'), { x: sx * hw, y: 1.31, z: sz * hd })); g.add(piece(C('flag'), { x: sx * hw, y: 2.31, z: sz * hd, s: 1.2 })); }
  g.add(piece(C('wall-doorway'), { x: -1, z: hd })); g.add(piece(C('wall-doorway'), { x: 1, z: hd, ry: Math.PI }));
  g.add(piece(C('gate'), { x: 0, z: hd, ry: Math.PI / 2, s: 1.3 }));
  g.add(piece(C('tower-square'), { x: -1.5, z: hd + 0.2, s: 0.8 })); g.add(piece(C('tower-square'), { x: 1.5, z: hd + 0.2, s: 0.8 }));
  g.add(piece(C('tower-square-top'), { x: -1.5, y: 1.31 * 0.8, z: hd + 0.2, s: 0.8 })); g.add(piece(C('tower-square-top'), { x: 1.5, y: 1.31 * 0.8, z: hd + 0.2, s: 0.8 }));
}

// Gerekli parça listesi (önceden yüklenir)
export const GEREKLI = {
  town: ['wall', 'wall-window-shutters', 'wall-window-small', 'wall-door', 'wall-wood', 'wall-wood-window-shutters', 'wall-wood-window-small', 'wall-wood-door', 'roof-gable', 'roof-gable-end', 'chimney', 'lantern', 'cart', 'cart-high', 'banner-red', 'banner-green', 'stall-red', 'stall-green', 'stall-bench', 'fountain-round', 'fountain-center', 'planks', 'pillar-stone', 'wall-arch-top', 'windmill', 'poles-horizontal'],
  castle: ['wall', 'wall-doorway', 'gate', 'tower-square', 'tower-square-top-roof', 'tower-square-top', 'tower-square-base', 'tower-square-mid-open', 'tower-hexagon-base', 'tower-hexagon-mid', 'tower-hexagon-roof', 'flag', 'flag-pennant', 'flag-banner-long', 'siege-catapult', 'siege-trebuchet', 'siege-tower', 'bridge-straight'],
  nature: ['tree_default', 'tree_pineDefaultA', 'tree_oak', 'tree_pineRoundA', 'tree_detailed', 'tree_tall', 'tree_pineTallA', 'tree_default_dark', 'tree_pineDefaultB', 'tree_fat', 'tree_simple', 'plant_bush', 'plant_bushSmall', 'plant_bushLarge', 'flower_redA', 'flower_yellowA', 'flower_purpleA', 'flower_purpleC', 'rock_largeA', 'rock_largeC', 'rock_tallA', 'rock_tallB', 'stone_largeA', 'stone_tallB', 'stone_largeB', 'log', 'log_stack', 'stump_round', 'crops_dirtRow', 'crops_wheatStageA', 'crops_wheatStageB', 'crops_leafsStageA', 'crops_leafsStageB', 'fence_simple', 'tent_detailedOpen', 'tent_smallClosed', 'pot_large', 'statue_obelisk', 'cliff_block_rock', 'cliff_block_stone', 'cliff_cave_rock', 'cliff_cave_stone', 'cliff_large_stone', 'cliff_large_rock', 'cliff_top_stone', 'mushroom_red', 'mushroom_tanGroup', 'platform_stone', 'bridge_stone', 'grass', 'grass_large', 'sign']
};
export const gerekliAnahtarlar = () => [].concat(...Object.entries(GEREKLI).map(([s, arr]) => arr.map(n => `${s}/${n}`)));
