// Realm of AdAstra — AdAstra Vadisi, 3 boyutlu harita (7 Ekim 2026)
// ============================================================================
// kampuse.com tarzı: gerçek 3B sahne (three.js), düşük poligon, düz renkler, eğik ortografik (izometrik) kamera,
// sürükle-kaydır, tekerlek / iki parmakla yakınlaştır. Bütün binalar koddan üretilir (model dosyası yok):
// her bölge kendi siluetiyle (Silo = iki yüksek tahıl kulesi) ayırt edilir. Bölgeye tıklayınca karakter oraya
// yürür ve eski ekran (modal) açılır: oyun kuralları ve ekran içerikleri değişmez.
// Eski 2B harita (Phaser, grandTownScene.js) ?harita=2d ile hâlâ açılır; zindan Phaser'da kalır.
// ============================================================================
import * as THREE from 'three';
import Phaser from 'phaser';
import { gameState } from '../gameState.js';
import { ammMarket } from '../ammMarket.js';
import { GAME_CONFIG } from '../config.js';
import { sound } from '../audio.js';
import { TOWN_ZONES } from '../grandTownScene.js';

const W = 200, H = 112;                       // dünya birimleri (harita oranı 2048:1143)
const toWorld = (px, py) => ({ x: px * W - W / 2, z: py * H - H / 2 });
const NODE_OF_ZONE = Object.fromEntries((GAME_CONFIG.RESOURCE_KEYS || ['wood', 'iron', 'wheat']).map(k => [((GAME_CONFIG.RESOURCE_META || {})[k] || {}).zone || k, k]));
const RES_KEYS = () => GAME_CONFIG.RESOURCE_KEYS || ['wood', 'iron', 'wheat'];
const isMobile = () => window.innerWidth < 720;

// Zindan dokularını yükleyen sessiz Phaser sahnesi (2B haritada bunu kasaba sahnesi yapıyordu)
export class VadiBootScene extends Phaser.Scene {
  constructor() { super({ key: 'VadiBootScene' }); }
  preload() {
    const v = Date.now();
    this.load.image('dungeon_tex_f1', 'assets/dungeon_map.jpg?v=' + v);
    for (let i = 2; i <= 6; i++) this.load.image('dungeon_tex_f' + i, `assets/dungeon_floor${i}.jpg?v=` + v);
    this.load.on('loaderror', (file) => console.error('[Phaser] Yüklenemedi:', file.key, file.src));
  }
  create() { if (window.__finishLoadingBar) window.__finishLoadingBar(); }
}

function isAnyModalActive() {
  const rpgModal = document.getElementById('rpg-modal');
  const devModal = document.getElementById('dev-modal');
  const arena = document.getElementById('battle-arena-modal');
  return (rpgModal && rpgModal.classList.contains('active')) ||
    (devModal && !devModal.classList.contains('hidden')) ||
    (arena && arena.classList.contains('active')) ||
    document.body.classList.contains('modal-open');
}
function fmtCountdown(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  if (h > 0) return `${h}s ${String(m).padStart(2, '0')}d`;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// ── Malzeme ve ilkel şekiller ──────────────────────────────────────────────
const MATS = new Map();
const mat = (hex, opts = {}) => {
  const key = hex + JSON.stringify(opts);
  if (!MATS.has(key)) MATS.set(key, new THREE.MeshLambertMaterial({ color: hex, flatShading: true, ...opts }));
  return MATS.get(key);
};
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };   // tekrarlanabilir rastgele
const shadowed = m => { m.castShadow = true; m.receiveShadow = true; return m; };
const box = (w, h, d, c, x = 0, y = 0, z = 0) => { const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c))); m.position.set(x, y + h / 2, z); return m; };
const cyl = (rt, rb, h, c, seg = 10, x = 0, y = 0, z = 0) => { const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c))); m.position.set(x, y + h / 2, z); return m; };
const cone = (r, h, c, seg = 8, x = 0, y = 0, z = 0) => { const m = shadowed(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(c))); m.position.set(x, y + h / 2, z); return m; };
const sphere = (r, c, x = 0, y = 0, z = 0, seg = 8) => { const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), mat(c))); m.position.set(x, y, z); return m; };
const pyramid = (w, d, h, c, x = 0, y = 0, z = 0) => { const m = cone(Math.SQRT1_2 * Math.max(w, d), h, c, 4, x, y, z); m.rotation.y = Math.PI / 4; m.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); return m; };
// Çatı: iki eğik düzlem yerine 4 kenarlı koni (piramit) — düşük poligon görünümü
function gableRoof(w, d, h, c, x = 0, y = 0, z = 0) {
  // Üçgen kesit, bina boyunca uzatılır (ExtrudeGeometry +z yönünde uzar; grup y ekseninde çevrilir)
  const shape = new THREE.Shape(); shape.moveTo(-d / 2, 0); shape.lineTo(d / 2, 0); shape.lineTo(0, h); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false }); geo.translate(0, 0, -w / 2);
  const m = shadowed(new THREE.Mesh(geo, mat(c))); m.rotation.y = Math.PI / 2; m.position.set(x, y, z); return m;
}
function house(w, d, h, wall, roof, x = 0, z = 0, roofH = null) {
  const g = new THREE.Group();
  g.add(box(w, h, d, wall, 0, 0, 0));
  const rh = roofH ?? Math.max(1.6, Math.min(w, d) * 0.6);
  if (w / d >= 1.5 || d / w >= 1.5) { const r = gableRoof(Math.max(w, d) * 1.08, Math.min(w, d) * 1.15, rh, roof, 0, h, 0); if (d > w) r.rotation.y = 0; g.add(r); }
  else g.add(pyramid(w * 1.15, d * 1.15, rh, roof, 0, h, 0));
  g.position.set(x, 0, z);
  return g;
}
function tree(x, z, s = 1, leaf = 0x3f9d4a) {
  const g = new THREE.Group();
  g.add(cyl(0.25 * s, 0.35 * s, 1.4 * s, 0x7a4b24, 6));
  g.add(cone(1.6 * s, 3.6 * s, leaf, 7, 0, 1.2 * s, 0));
  g.add(cone(1.2 * s, 2.6 * s, leaf, 7, 0, 3.0 * s, 0));
  g.position.set(x, 0, z);
  return g;
}
function flag(x, z, color = 0xdc2626, h = 4) {
  const g = new THREE.Group();
  g.add(cyl(0.08, 0.08, h, 0x5b3a1e, 5));
  const f = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), mat(color, { side: THREE.DoubleSide }));
  f.position.set(0.85, h - 0.6, 0); g.add(f);
  g.position.set(x, 0, z);
  return g;
}

// ── Bölge binaları (her biri kendi siluetiyle) ─────────────────────────────
const BUILDERS = {
  dungeon(g) {
    const hill = sphere(7, 0x3b2a52, 0, -1.2, 0, 10); hill.scale.y = 0.7; g.add(hill);
    g.add(box(4.5, 4, 3, 0x120a1e, 0, 0, 5.2));
    for (let i = 0; i < 7; i++) { const c = cone(0.7 + rnd() * 0.5, 2.5 + rnd() * 2.5, 0xc084fc, 5, -7 + rnd() * 14, 0, -6 + rnd() * 12); c.rotation.z = (rnd() - 0.5) * 0.6; g.add(c); }
    return { top: 7 };
  },
  coalmine(g) { return BUILDERS._mine(g, 0x2b2f3a, 0x111318); },
  mine(g) { return BUILDERS._mine(g, 0x6b7280, 0x93c5fd); },
  quarry(g) { return BUILDERS._mine(g, 0xb8b2a7, 0xe7e5e4); },
  _mine(g, rock, ore) {
    const mound = sphere(7, rock, 0, -2, 0, 9); mound.scale.set(1.2, 0.65, 1); g.add(mound);
    g.add(box(4, 3.4, 3, 0x1f2937, 0, 0, 5));
    g.add(box(4.6, 0.5, 0.5, 0x7a4b24, 0, 3.4, 5.1));
    for (let i = 0; i < 6; i++) g.add(box(1 + rnd(), 0.8 + rnd() * 0.8, 1 + rnd(), i % 2 ? ore : rock, -8 + rnd() * 16, 0, 3 + rnd() * 6));
    g.add(box(2, 1.2, 1.3, 0x4b5563, 4.5, 0, 7.5));                  // vagon
    return { top: 5 };
  },
  forest(g) {
    for (let i = 0; i < 34; i++) { const a = rnd() * Math.PI * 2, r = 2 + rnd() * 15; g.add(tree(Math.cos(a) * r, Math.sin(a) * r * 0.7, 0.8 + rnd() * 0.7, i % 3 ? 0x3f9d4a : 0x2f7d3a)); }
    g.add(box(1, 1, 5, 0x9a6b3c, -2, 0, 9)); g.add(box(1, 1, 5, 0xb07d48, -0.8, 0, 9.2)); g.add(box(1, 1, 5, 0x9a6b3c, -1.4, 1, 9.1));   // kütükler
    return { top: 7 };
  },
  spaceport(g) {
    g.add(cyl(8, 8, 0.6, 0x9ca3af, 20));
    g.add(cyl(1.5, 1.5, 9, 0xf3f4f6, 12, 0, 0.6, 0));
    g.add(cone(1.5, 2.6, 0xef4444, 12, 0, 9.6, 0));
    for (let i = 0; i < 3; i++) { const f = box(0.4, 2.2, 1.8, 0xef4444, 0, 0.6, 0); f.position.x = Math.cos(i * 2.09) * 1.6; f.position.z = Math.sin(i * 2.09) * 1.6; f.rotation.y = -i * 2.09; g.add(f); }
    g.add(box(1.6, 13, 1.6, 0x6b7280, 5.5, 0, 0)); g.add(box(4, 0.6, 1, 0x6b7280, 3.5, 11, 0));
    for (let i = 0; i < 4; i++) g.add(box(2, 2, 2, [0x3b82f6, 0xf59e0b, 0xef4444, 0x10b981][i], -8 + i * 2.4, 0, 7));   // konteynerler
    return { top: 13 };
  },
  healer(g) { g.add(house(5, 4.5, 3.2, 0xf1f5f9, 0x16a34a)); g.add(box(0.5, 2, 0.5, 0xef4444, 0, 3.6, 2.4)); g.add(box(2, 0.5, 0.5, 0xef4444, 0, 4.3, 2.4)); return { top: 6 }; },
  carnival(g) {
    g.add(cone(4.5, 5.5, 0xdc2626, 10)); g.add(cone(2.6, 2, 0xfef3c7, 10, 0, 5.5, 0));
    const wheel = new THREE.Group(); wheel.add(shadowed(new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.18, 6, 18), mat(0xfbbf24))));
    for (let i = 0; i < 8; i++) { const c = box(0.9, 0.9, 0.9, [0x3b82f6, 0xef4444, 0x10b981, 0xf59e0b][i % 4]); c.position.set(Math.cos(i * 0.785) * 3.2, Math.sin(i * 0.785) * 3.2, 0); wheel.add(c); }
    wheel.position.set(6.5, 3.8, -1); g.add(wheel); g.userData.wheel = wheel;
    g.add(box(0.3, 3.8, 0.3, 0x6b7280, 5.6, 0, -1)); g.add(box(0.3, 3.8, 0.3, 0x6b7280, 7.4, 0, -1));
    return { top: 8 };
  },
  council(g) {
    g.add(box(9, 4.5, 7, 0xe2e8f0)); g.add(sphere(3.2, 0xa78bfa, 0, 5.6, 0, 10));
    for (let i = 0; i < 4; i++) g.add(cyl(0.45, 0.45, 4.5, 0xf8fafc, 8, -3.4 + i * 2.27, 0, 4));
    g.add(box(10, 0.6, 8.4, 0xcbd5e1, 0, 4.5, 0));
    return { top: 9 };
  },
  blacksmith(g) { g.add(house(5.5, 4.5, 3, 0x78350f, 0x44403c)); g.add(box(1, 2.2, 1, 0x57534e, 1.6, 3, -1)); g.add(box(1.6, 0.6, 0.8, 0x1f2937, 3.8, 0, 2)); g.add(cyl(0.9, 0.9, 1.2, 0x9a3412, 8, 3.8, 0, -1.5)); return { top: 6 }; },
  market(g) {
    g.add(cyl(2, 2.2, 0.7, 0x94a3b8, 14)); g.add(cyl(1.5, 1.5, 0.3, 0x38bdf8, 14, 0, 0.7, 0)); g.add(cyl(0.3, 0.3, 2.2, 0x94a3b8, 8, 0, 0.9, 0));
    const colors = [0xef4444, 0x3b82f6, 0xf59e0b, 0x10b981, 0xec4899, 0x8b5cf6];
    for (let i = 0; i < 6; i++) { const a = i * 1.047; const x = Math.cos(a) * 6.5, z = Math.sin(a) * 4.5; g.add(box(2.2, 1.1, 1.6, 0xd6b38a, x, 0, z)); g.add(pyramid(2.8, 2.2, 1.2, colors[i], x, 2.2, z)); g.add(box(0.15, 2.2, 0.15, 0x7a4b24, x - 1.2, 0, z + 0.9)); g.add(box(0.15, 2.2, 0.15, 0x7a4b24, x + 1.2, 0, z + 0.9)); }
    return { top: 4 };
  },
  village(g) { const c = [0xfde68a, 0xfca5a5, 0xbfdbfe, 0xd9f99d, 0xfed7aa]; for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.4; g.add(house(3 + rnd(), 2.6 + rnd(), 2.2 + rnd() * 0.6, c[i], 0x9f1239, Math.cos(a) * 5.5, Math.sin(a) * 4)); } return { top: 5 }; },
  tavern(g) { g.add(house(6, 4.5, 3.4, 0xd6b38a, 0x7c2d12)); g.add(box(2.4, 1.2, 0.2, 0xfbbf24, 0, 2.2, 2.5)); g.add(cyl(0.9, 0.9, 1.4, 0x92400e, 8, 3.8, 0, 2.2)); return { top: 6 }; },
  colosseum(g) {
    const outer = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 6, 28, 1, true), mat(0xd6d3d1, { side: THREE.DoubleSide }))); outer.position.y = 3; g.add(outer);
    const inner = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 3.5, 28, 1, true), mat(0xa8a29e, { side: THREE.DoubleSide }))); inner.position.y = 1.75; g.add(inner);
    g.add(cyl(11.2, 11.2, 0.5, 0xe7e5e4, 28)); g.add(cyl(8, 8, 0.6, 0xf5deb3, 28, 0, 0.5, 0));
    for (let i = 0; i < 6; i++) g.add(flag(Math.cos(i * 1.047) * 10.5, Math.sin(i * 1.047) * 10.5, i % 2 ? 0xdc2626 : 0xfbbf24, 2.5).translateY(6));
    return { top: 9 };
  },
  farm(g) {
    g.add(box(28, 0.8, 20, 0xeab308)); g.add(box(28, 0.3, 20, 0xfacc15, 0, 0.8, 0));
    const mill = new THREE.Group(); mill.add(cyl(1.6, 2.2, 7, 0xf5f5f4, 8)); mill.add(cone(2.2, 2.2, 0x7c2d12, 8, 0, 7, 0));
    const blades = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = box(0.5, 4.2, 0.12, 0xe7e5e4); b.position.set(Math.cos(i * 1.571) * 2.1, Math.sin(i * 1.571) * 2.1, 0); b.rotation.z = i * 1.571; blades.add(b); }
    blades.position.set(0, 6, 2.3); mill.add(blades); mill.position.set(6, 1.1, 2); g.add(mill); g.userData.blades = blades;
    for (let i = 0; i < 4; i++) g.add(cone(1.4, 2.2, 0xfbbf24, 8, -9 + i * 3.2, 1.1, -6));
    return { top: 10 };
  },
  herbgarden(g) { g.add(box(12, 0.5, 9, 0x7c4a1d)); for (let i = 0; i < 4; i++) g.add(box(11, 0.9, 1.2, i % 2 ? 0x22c55e : 0x4ade80, 0, 0.5, -3.3 + i * 2.2)); g.add(box(0.2, 1.6, 9, 0x9a6b3c, -6.2, 0, 0)); g.add(box(0.2, 1.6, 9, 0x9a6b3c, 6.2, 0, 0)); return { top: 3 }; },
  warehouse(g) {
    // SİLO: iki yüksek tahıl kulesi + ambar — haritada bir bakışta tanınır
    for (const x of [-3, 3]) { g.add(cyl(2.3, 2.3, 10, 0xf1f5f9, 14, x, 0, -1)); g.add(cyl(2.4, 2.4, 1.2, 0x94a3b8, 14, x, 4.5, -1)); g.add(cone(2.7, 2.6, 0xdc2626, 14, x, 10, -1)); g.add(box(0.5, 1.2, 0.3, 0x1f2937, x, 2.4, 1.35)); }
    g.add(house(7, 4, 2.8, 0xb45309, 0x7c2d12, 0, 5.2)); g.add(box(1.4, 1.4, 1.4, 0xd6b38a, 5.6, 0, 5)); g.add(box(1.2, 1.2, 1.2, 0xd6b38a, 5.4, 1.4, 5.2)); g.add(box(1.4, 1.4, 1.4, 0xd6b38a, -5.6, 0, 5.4));
    return { top: 13 };
  },
  barracks(g) {
    g.add(house(12, 4.2, 3.6, 0x92400e, 0x57534e, 0, -5, 2.4));
    const ring = shadowed(new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.2, 5, 28), mat(0x9a6b3c))); ring.rotation.x = Math.PI / 2; ring.position.y = 0.9; g.add(ring);
    for (let i = 0; i < 14; i++) g.add(box(0.3, 1.2, 0.3, 0x9a6b3c, Math.cos(i * 0.449) * 5.5, 0, Math.sin(i * 0.449) * 5.5));
    g.add(cyl(5.4, 5.4, 0.25, 0xd4b483, 28));
    g.add(box(1.2, 1.2, 2.4, 0x7c2d12, 0, 0.3, 0)); g.add(sphere(0.6, 0x7c2d12, 0, 1.9, -1.2)); g.add(cyl(0.3, 0.3, 1.2, 0x7c2d12, 6, 0.5, 0.3, 0.7)); g.add(cyl(0.3, 0.3, 1.2, 0x7c2d12, 6, -0.5, 0.3, -0.7));   // at
    g.add(flag(-7, -2, 0xdc2626)); g.add(flag(7, -2, 0xdc2626));
    return { top: 7 };
  },
  battlefield(g) {
    const geo = new THREE.BoxGeometry(0.9, 1.6, 0.9); const inst = new THREE.InstancedMesh(geo, mat(0xb91c1c), 90); const m = new THREE.Matrix4();
    for (let i = 0; i < 90; i++) { m.makeTranslation(-14 + (i % 15) * 2, 0.8, -6 + Math.floor(i / 15) * 2.4); inst.setMatrixAt(i, m); }
    inst.castShadow = true; g.add(inst);
    const helm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 6, 6), mat(0xe5e7eb), 90);
    for (let i = 0; i < 90; i++) { m.makeTranslation(-14 + (i % 15) * 2, 1.9, -6 + Math.floor(i / 15) * 2.4); helm.setMatrixAt(i, m); }
    g.add(helm);
    for (let i = 0; i < 4; i++) g.add(flag(-12 + i * 8, -9, 0xdc2626, 5));
    return { top: 6 };
  }
};

// Merkezdeki kale duvarı (meydan, pazar, Konsey, karnaval, köy ve taverna içeride)
function castle(scene) {
  const c = toWorld(0.465, 0.47); const hw = 29, hd = 21, h = 4;
  const wall = (w, d, x, z) => scene.add(box(w, h, d, 0x9ca3af, x, 0, z));
  wall(hw * 2, 1.6, c.x, c.z - hd); wall(1.6, hd * 2, c.x - hw, c.z); wall(1.6, hd * 2, c.x + hw, c.z);
  wall(hw - 4, 1.6, c.x - hw / 2 - 2, c.z + hd); wall(hw - 4, 1.6, c.x + hw / 2 + 2, c.z + hd);   // alt duvar: ortada kapı
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { scene.add(cyl(2.4, 2.6, 7, 0x9ca3af, 10, c.x + sx * hw, 0, c.z + sz * hd)); scene.add(cone(2.9, 2.6, 0x1d4ed8, 10, c.x + sx * hw, 7, c.z + sz * hd)); }
  scene.add(box(2.4, 2.4, 2, 0x6b7280, c.x - 4, 0, c.z + hd)); scene.add(box(2.4, 2.4, 2, 0x6b7280, c.x + 4, 0, c.z + hd)); scene.add(box(6.4, 0.8, 2, 0x6b7280, c.x, 2.4, c.z + hd));
  return { gate: { x: c.x, z: c.z + hd + 3 } };
}

function mountains(scene) {
  const peaks = [[-0.02, -0.06, 24], [0.09, -0.12, 30], [0.2, -0.1, 26], [0.31, -0.11, 22], [0.42, -0.09, 18], [0.55, -0.1, 16], [-0.1, 0.1, 22], [-0.09, 0.3, 18], [-0.08, 0.5, 15], [0.68, -0.1, 14]];
  for (const [px, py, h] of peaks) { const p = toWorld(px, py); scene.add(cone(h * 0.9, h, 0x6b7280, 7, p.x, -1, p.z)); scene.add(cone(h * 0.36, h * 0.4, 0xf8fafc, 7, p.x, h * 0.6 - 1, p.z)); }
}

function river(scene) {
  const pts = [[0.98, 0.02], [0.93, 0.25], [0.85, 0.45], [0.84, 0.6], [0.8, 0.78], [0.82, 1.02]].map(([px, py]) => { const p = toWorld(px, py); return new THREE.Vector3(p.x, 0.15, p.z); });
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 2.6, 6, false), mat(0x38bdf8)); tube.scale.y = 0.12; tube.receiveShadow = true; scene.add(tube);
  const b = toWorld(0.845, 0.6); scene.add(box(2.6, 0.5, 8, 0x9ca3af, b.x, 0.5, b.z)); scene.add(box(0.3, 1, 8, 0x6b7280, b.x - 1.2, 1, b.z)); scene.add(box(0.3, 1, 8, 0x6b7280, b.x + 1.2, 1, b.z));
}

function ground(scene) {
  const geo = new THREE.PlaneGeometry(W * 1.6, H * 1.8, 64, 40);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); pos.setZ(i, (Math.sin(x * 0.11) * Math.cos(y * 0.13)) * 0.9 - 0.9); }
  geo.computeVertexNormals();
  const g = new THREE.Mesh(geo, mat(0x6ab84f)); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  // Yollar: meydandan dışarı toprak şeritler
  const road = (x1, z1, x2, z2, w = 3) => { const len = Math.hypot(x2 - x1, z2 - z1); const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), mat(0xc9a66b)); m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(z2 - z1, x2 - x1); m.position.set((x1 + x2) / 2, 0.06, (z1 + z2) / 2); m.receiveShadow = true; scene.add(m); };
  const c = toWorld(0.465, 0.47);
  for (const id of ['forest', 'spaceport', 'farm', 'barracks', 'battlefield', 'dungeon', 'quarry', 'colosseum', 'warehouse']) { const z = TOWN_ZONES.find(t => t.id === id); if (z) { const p = toWorld(z.px, z.py); road(c.x, c.z + 24, p.x, p.z); } }
}

// ── Sahne ─────────────────────────────────────────────────────────────────
export function startVadi3D(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xbfe3ff);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab;';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe6ff, 320, 760);
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x5b8f3a, 0.95));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.25); sun.position.set(60, 90, 40); sun.castShadow = true;
  sun.shadow.mapSize.set(isMobile() ? 1024 : 2048, isMobile() ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 90, bottom: -90, near: 10, far: 300 }); sun.shadow.bias = -0.0005;
  scene.add(sun); scene.add(sun.target);

  ground(scene); mountains(scene); river(scene);
  // Serpiştirilmiş doğa: bölgelerin dışında kalan boş yerlere ağaç, çalı, kaya
  const farFromZones = (x, z) => TOWN_ZONES.every(t => { const p = toWorld(t.px, t.py); return Math.hypot(p.x - x, p.z - z) > Math.max(9, t.pr * W) + 4; });
  const cc = toWorld(0.465, 0.47);
  for (let i = 0; i < 140; i++) {
    const x = -W / 2 + rnd() * W, z = -H / 2 + rnd() * H;
    if (!farFromZones(x, z) || (Math.abs(x - cc.x) < 33 && Math.abs(z - cc.z) < 25) || x > W / 2 - 36) continue;
    const k = rnd();
    if (k < 0.55) scene.add(tree(x, z, 0.6 + rnd() * 0.6, k < 0.2 ? 0x2f7d3a : 0x3f9d4a));
    else if (k < 0.85) { const b = sphere(0.9 + rnd() * 0.6, 0x4f9d3f, x, 0.5, z, 6); b.scale.y = 0.7; scene.add(b); }
    else scene.add(box(1 + rnd() * 1.4, 0.7 + rnd() * 0.8, 1 + rnd(), 0x8d8d8d, x, 0, z));
  }
  const { gate } = castle(scene);

  // Bölgeler
  const zoneGroups = new Map(), zoneMeshes = new Map(), zoneTop = new Map();
  const pickables = [];
  for (const z of TOWN_ZONES) {
    const g = new THREE.Group(); const p = toWorld(z.px, z.py); g.position.set(p.x, 0, p.z);
    const info = (BUILDERS[z.id] || ((gg) => { gg.add(house(4, 4, 3, 0xd6b38a, 0x7c2d12)); return { top: 5 }; }))(g);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(Math.max(5, z.pr * W * 0.9), 20), new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.3; g.add(disc);
    g.userData.zoneId = z.id; g.traverse(o => { if (o.isMesh) o.userData.zoneId = z.id; });
    scene.add(g); zoneGroups.set(z.id, g); zoneTop.set(z.id, info.top || 5); pickables.push(g);
    zoneMeshes.set(z.id, []); g.traverse(o => { if (o.isMesh && o.material && o.material.emissive) zoneMeshes.get(z.id).push(o); });
  }

  // Bulutlar
  const clouds = [];
  for (let i = 0; i < 6; i++) { const c = new THREE.Group(); for (let k = 0; k < 3; k++) { const s = sphere(2.2 + rnd() * 1.6, 0xffffff, -2 + k * 2.2, rnd() * 0.6, rnd() * 1.2, 7); s.castShadow = false; s.material = mat(0xffffff, { transparent: true, opacity: 0.85 }); c.add(s); } c.position.set(-W / 2 + rnd() * W, 26 + rnd() * 6, -H / 2 + rnd() * H); scene.add(c); clouds.push(c); }

  // Karakter (basit: gövde + baş); tıklanan binaya yürür
  const hero = new THREE.Group();
  hero.add(shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.1, 3, 8), mat(0x2563eb)))).position.y = 1.2;
  hero.add(sphere(0.5, 0xf5cba7, 0, 2.35, 0, 8)); hero.add(sphere(0.52, 0x3f2a1d, 0, 2.5, -0.1, 8)).scale.set(1, 0.6, 1);
  hero.position.set(gate.x, 0, gate.z + 2); scene.add(hero);
  const walk = { from: null, to: null, t: 0, dur: 0, done: null };

  // Kamera (eğik ortografik)
  const AZ = Math.PI / 4, EL = 0.62;
  const dir = new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
  const right = new THREE.Vector3(Math.cos(AZ), 0, -Math.sin(AZ));
  const fwd = new THREE.Vector3(-Math.sin(AZ), 0, -Math.cos(AZ));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
  const target = new THREE.Vector3(gate.x, 0, gate.z - 10);
  let zoom = isMobile() ? 0.8 : 1.0; const MIN_ZOOM = 0.55, MAX_ZOOM = 2.8, FRUSTUM = 46;
  let size = { w: 1, h: 1 };
  function layout() {
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight - 92;
    size = { w, h }; renderer.setSize(w, h, false);
    const aspect = w / h; camera.left = -FRUSTUM * aspect; camera.right = FRUSTUM * aspect; camera.top = FRUSTUM; camera.bottom = -FRUSTUM;
    camera.zoom = zoom; camera.updateProjectionMatrix();
  }
  function placeCamera() {
    target.x = Math.max(-W / 2 - 10, Math.min(W / 2 + 10, target.x)); target.z = Math.max(-H / 2 - 10, Math.min(H / 2 + 14, target.z));
    camera.position.copy(target).addScaledVector(dir, 260); camera.lookAt(target); camera.zoom = zoom; camera.updateProjectionMatrix();
  }
  layout(); placeCamera();
  const unitsPerPx = () => (2 * FRUSTUM) / size.h / zoom;

  // Giriş: sürükle, tıkla, yakınlaştır
  const el = renderer.domElement;
  const raycaster = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  const pointers = new Map(); let drag = null, pinch = null, hoverZone = null;
  const zoneAt = (sx, sy) => {
    ndc.set((sx / size.w) * 2 - 1, -(sy / size.h) * 2 + 1); raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, true);
    for (const h of hits) { let o = h.object; while (o && !o.userData.zoneId) o = o.parent; if (o) return TOWN_ZONES.find(z => z.id === o.userData.zoneId) || null; }
    return null;
  };
  const rel = e => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  el.addEventListener('pointerdown', e => {
    if (isAnyModalActive()) return;
    el.setPointerCapture(e.pointerId); const p = rel(e); pointers.set(e.pointerId, p);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; drag = null; return; }
    drag = { x: p.x, y: p.y, tx: target.x, tz: target.z, moved: false };
  });
  el.addEventListener('pointermove', e => {
    const p = rel(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinch.z * d / Math.max(1, pinch.d))); placeCamera(); return; }
    if (drag && pointers.has(e.pointerId)) {
      const dx = p.x - drag.x, dy = p.y - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
      if (drag.moved) { const u = unitsPerPx(); target.x = drag.tx - (right.x * dx * u) - (fwd.x * dy * u / Math.sin(EL)); target.z = drag.tz - (right.z * dx * u) - (fwd.z * dy * u / Math.sin(EL)); placeCamera(); setHover(null); el.style.cursor = 'grabbing'; return; }
    }
    if (isAnyModalActive()) { setHover(null); return; }
    if (e.pointerType === 'mouse') setHover(zoneAt(p.x, p.y));
  });
  const up = e => {
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
    const d = drag; drag = null; el.style.cursor = hoverZone ? 'pointer' : 'grab';
    if (!d || d.moved || isAnyModalActive()) return;
    const p = rel(e); const z = zoneAt(p.x, p.y); if (z) goAndOpen(z);
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); drag = null; pinch = null; });
  el.addEventListener('wheel', e => { if (isAnyModalActive()) return; e.preventDefault(); zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * (e.deltaY > 0 ? 0.9 : 1.1))); placeCamera(); }, { passive: false });
  el.addEventListener('pointerleave', () => setHover(null));

  // ── Etiketler ve bilgi kartı (eski haritayla aynı CSS) ──
  let overlay = container.querySelector('#map-overlay');
  if (!overlay) { overlay = document.createElement('div'); overlay.id = 'map-overlay'; overlay.className = 'map-overlay'; container.appendChild(overlay); }
  overlay.innerHTML = '';
  const labels = new Map();
  for (const z of TOWN_ZONES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'map-label'; b.dataset.zone = z.id; b.style.setProperty('--zc', z.color);
    b.innerHTML = `<span class="ml-icon" aria-hidden="true">${z.icon}</span><span class="ml-body"><span class="ml-name">${z.name}</span><span class="ml-status" data-status></span></span>`;
    b.addEventListener('mouseenter', () => setHover(z)); b.addEventListener('mouseleave', () => { if (hoverZone === z) setHover(null); });
    b.addEventListener('click', ev => { ev.stopPropagation(); if (!isAnyModalActive()) goAndOpen(z); });
    overlay.appendChild(b); labels.set(z.id, b);
  }
  const card = document.createElement('div'); card.className = 'map-card'; card.id = 'map-hover-card'; card.setAttribute('role', 'tooltip');
  card.innerHTML = `<div class="mc-head"><span class="mc-icon" aria-hidden="true"></span><span class="mc-titles"><span class="mc-name"></span><span class="mc-sub"></span></span></div><div class="mc-status"><span class="mc-dot"></span><span class="mc-status-text"></span></div><div class="mc-hint"><span class="mc-hint-text">Açmak için tıkla</span><span class="mc-hint-arrow" aria-hidden="true">→</span></div>`;
  overlay.appendChild(card);
  let cardSize = null;

  const v3 = new THREE.Vector3();
  const screenOf = (zoneId, yOff = 0) => { const g = zoneGroups.get(zoneId); v3.set(g.position.x, yOff, g.position.z).project(camera); return { x: (v3.x + 1) / 2 * size.w, y: (1 - v3.y) / 2 * size.h }; };

  function setHover(zone) {
    if (hoverZone === zone) return;
    if (hoverZone) { labels.get(hoverZone.id)?.classList.remove('is-hover'); for (const m of zoneMeshes.get(hoverZone.id)) m.material = m.userData.baseMat || m.material; }
    hoverZone = zone;
    if (zone) { labels.get(zone.id)?.classList.add('is-hover'); for (const m of zoneMeshes.get(zone.id)) { if (!m.userData.baseMat) m.userData.baseMat = m.material; m.material = m.userData.baseMat.clone(); m.material.emissive = new THREE.Color(0x2a2a2a); } }
    fillCard(zone); el.style.cursor = zone ? 'pointer' : 'grab';
  }
  function fillCard(zone) {
    if (!zone) { card.classList.remove('is-visible'); return; }
    card.style.setProperty('--zc', zone.color);
    card.querySelector('.mc-icon').textContent = zone.icon; card.querySelector('.mc-name').textContent = zone.name; card.querySelector('.mc-sub').textContent = zone.sub;
    const locked = !gameState.isFeatureUnlocked(zone.id); card.classList.toggle('is-locked', locked);
    card.querySelector('.mc-hint-text').textContent = locked ? 'Henüz kilitli' : (zone.id === 'dungeon' ? 'Zindana inmek için tıkla' : 'Açmak için tıkla');
    syncCardStatus(); cardSize = null; card.classList.add('is-visible'); positionCard();
  }
  function syncCardStatus() {
    if (!hoverZone) return; const label = labels.get(hoverZone.id); const text = label ? (label.querySelector('[data-status]')?.textContent || '') : '';
    card.querySelector('.mc-status-text').textContent = text; card.querySelector('.mc-status').hidden = !text; card.dataset.tone = (label && label.dataset.tone) || '';
  }
  function positionCard() {
    if (!hoverZone) return;
    const top = screenOf(hoverZone.id, zoneTop.get(hoverZone.id) + 1), bottom = screenOf(hoverZone.id, -2);
    if (!cardSize) cardSize = { w: card.offsetWidth || 272, h: card.offsetHeight || 120 };
    const { w, h } = cardSize, gap = 14; const below = top.y - h - gap < 8;
    const y = below ? Math.min(bottom.y + gap, size.h - h - 8) : top.y - h - gap; const left = Math.max(8, Math.min(size.w - w - 8, top.x - w / 2));
    card.classList.toggle('is-below', below); card.style.setProperty('--arrow-x', `${Math.max(18, Math.min(w - 18, top.x - left)).toFixed(0)}px`); card.style.transform = `translate(${left.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
  function positionLabels() {
    const compact = size.w < 720;
    for (const z of TOWN_ZONES) { const b = labels.get(z.id); const s = screenOf(z.id, zoneTop.get(z.id) + 0.5); const visible = s.x > -80 && s.x < size.w + 80 && s.y > -40 && s.y < size.h + 60; b.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`; b.classList.toggle('is-offscreen', !visible); b.classList.toggle('is-compact', compact); }
  }

  // ── Canlı durum levhaları (2B haritayla aynı kurallar) ──
  function refreshStatuses() {
    const st = gameState.state;
    const set = (id, text, tone = '') => { const b = labels.get(id); if (!b) return; const s = b.querySelector('[data-status]'); if (s && s.textContent !== text) s.textContent = text; b.dataset.tone = tone; };
    for (const zoneId of Object.keys(NODE_OF_ZONE)) {
      const exp = st.activeExpeditions && st.activeExpeditions[NODE_OF_ZONE[zoneId]];
      if (!exp) set(zoneId, 'Boşta · sefer gönder', 'idle');
      else if (exp.isCompleted) set(zoneId, '✅ Hazır · topla', 'ready');
      else set(zoneId, `⏳ ${fmtCountdown(exp.durationSeconds - exp.elapsedSeconds)} · %${Math.min(100, Math.floor((exp.elapsedSeconds / exp.durationSeconds) * 100))}`, 'busy');
    }
    if (gameState.isBotPaused()) set('tavern', '⏸️ Bot duraklatıldı', 'warn');
    else if (gameState.hasPurchasedBot()) set('tavern', `🤖 Bot aktif · ${fmtCountdown(gameState.getAutoCollectorRemainingSeconds())}`, 'ready');
    else set('tavern', st.botTrialUsed ? 'Bot kapalı' : '🎁 Ücretsiz bot denemesi', st.botTrialUsed ? '' : 'gift');
    const cap = gameState.getWarehouseCapacity(); const inv = st.inventory || {};
    const fill = Math.max(...RES_KEYS().map(r => (Number(inv[r]) || 0) / Math.max(1, cap[r] || 1)));
    set('warehouse', `Sv.${st.warehouseLevel || 1} · %${Math.round(fill * 100)} dolu`, fill >= 0.95 ? 'warn' : '');
    const units = st.soldierUnits || []; const wounded = units.filter(s => s && s.hp < s.maxHp).length;
    set('barracks', units.length ? `${units.length} asker${wounded ? ` · ${wounded} yaralı` : ''}` : 'İlk askerini al', wounded ? 'warn' : '');
    set('market', `🌲 ${ammMarket.getPrice('wood').toFixed(2)} · ⛏️ ${ammMarket.getPrice('iron').toFixed(2)} ASTRA`, '');
    if ((st.lotteryPendingPayout || 0) > 0) set('carnival', '🎟️ Piyango kazancın hazır!', 'gift'); else set('carnival', `Çark · ${st.lotteryTickets || 0} bilet`, '');
    const counters = (typeof gameState.getDailyCounters === 'function') ? gameState.getDailyCounters() : { arenaMatches: 0 };
    const cap10 = (GAME_CONFIG.COLOSSEUM && GAME_CONFIG.COLOSSEUM.DAILY_MATCH_CAP) || 10;
    set('colosseum', `Bugün ${Math.max(0, cap10 - (counters.arenaMatches || 0))} maç hakkı`, '');
    set('blacksmith', 'Dövme · onarım', ''); set('dungeon', `Kat ${Math.ceil((st.dungeonProgress || 1) / 3)} · Sv.${st.dungeonProgress || 1}`, '');
    set('battlefield', st.worldBoss && st.worldBoss.userStaked ? '🔒 Ordun savaşta' : 'Dünya Bossu', st.worldBoss && st.worldBoss.claimableRewardAda > 0 ? 'gift' : '');
    const vi = gameState.getVillageInfo ? gameState.getVillageInfo() : null; if (vi) set('village', `${vi.villagers} köylü · ${vi.houses} ev`, vi.starving ? 'warn' : '');
    const rk = gameState.getRocketStatus ? gameState.getRocketStatus() : null; if (rk) set('spaceport', rk.ready ? '🚀 Roket hazır' : 'Roket görevi', rk.ready ? 'ready' : '');
    for (const z of TOWN_ZONES) { const lock = gameState.getFeatureLock(z.id); const b = labels.get(z.id); if (b) b.classList.toggle('is-locked', !!lock); if (lock) set(z.id, `🔒 ${lock.reason.replace(/ açılır\.?$/, '')}`, 'locked'); }
    if (hoverZone) syncCardStatus();
  }

  // ── Bölgeye git / aç ──
  function openZone(z) {
    if (!gameState.isFeatureUnlocked(z.id)) { window.dispatchEvent(new CustomEvent('feature-locked', { detail: { zoneId: z.id } })); return; }
    try { sound.playPickaxe(); } catch (e) { /* ses kapalı olabilir */ }
    if (z.id === 'dungeon') { window.dispatchEvent(new CustomEvent('enter-dungeon-view')); return; }
    window.dispatchEvent(new CustomEvent('open-town-modal', { detail: { zoneId: z.id, zoneName: `${z.icon} ${z.name.toLocaleUpperCase('tr-TR')}` } }));
  }
  function goAndOpen(z) {
    if (!gameState.isFeatureUnlocked(z.id)) { openZone(z); return; }
    const g = zoneGroups.get(z.id); const to = new THREE.Vector3(g.position.x, 0, g.position.z + Math.max(5, z.pr * W * 0.9) + 1.5);
    const dist = hero.position.distanceTo(to);
    walk.from = hero.position.clone(); walk.to = to; walk.t = 0; walk.dur = Math.min(0.75, dist / 90); walk.done = () => openZone(z);
    hero.rotation.y = Math.atan2(to.x - hero.position.x, to.z - hero.position.z);
    if (walk.dur < 0.05) { walk.from = null; openZone(z); }
  }
  function flyTo(zoneId, { open = false } = {}) {
    const z = TOWN_ZONES.find(x => x.id === zoneId); if (!z) return;
    const g = zoneGroups.get(zoneId); fly.from = target.clone(); fly.to = new THREE.Vector3(g.position.x, 0, g.position.z); fly.t = 0; fly.zoomTo = Math.max(zoom, 1.5); fly.zoomFrom = zoom;
    setHover(z); if (open) setTimeout(() => { setHover(null); goAndOpen(z); }, 650);
  }
  const fly = { from: null, to: null, t: 0 };

  // ── Döngü ──
  const clock = new THREE.Clock(); let statusTimer = 0, running = true, visible = true;
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(0.05, clock.getDelta()); const t = clock.elapsedTime;
    for (const [, g] of zoneGroups) { if (g.userData.blades) g.userData.blades.rotation.z += dt * 0.8; if (g.userData.wheel) g.userData.wheel.rotation.z += dt * 0.35; }
    for (const c of clouds) { c.position.x += dt * 1.2; if (c.position.x > W / 2 + 30) c.position.x = -W / 2 - 30; }
    if (walk.from) { walk.t += dt; const k = Math.min(1, walk.t / walk.dur); hero.position.lerpVectors(walk.from, walk.to, k); hero.position.y = Math.abs(Math.sin(k * walk.dur * 14)) * 0.35; if (k >= 1) { hero.position.y = 0; const d = walk.done; walk.from = null; walk.done = null; if (d) d(); } }
    else hero.position.y = Math.sin(t * 2) * 0.05;
    if (fly.from) { fly.t += dt / 0.55; const k = fly.t >= 1 ? 1 : 0.5 - Math.cos(Math.PI * fly.t) / 2; target.lerpVectors(fly.from, fly.to, k); zoom = fly.zoomFrom + (fly.zoomTo - fly.zoomFrom) * k; placeCamera(); if (fly.t >= 1) fly.from = null; }
    if (hoverZone && isAnyModalActive()) setHover(null);
    positionCard(); positionLabels();
    statusTimer += dt; if (statusTimer >= 0.5) { statusTimer = 0; try { refreshStatuses(); } catch (e) { /* oyun yüklenirken */ } }
    renderer.render(scene, camera);
  }
  frame();
  const ro = new ResizeObserver(() => { layout(); placeCamera(); }); ro.observe(container);
  window.realmMap = { flyTo, zones: TOWN_ZONES, mode: '3d' };
  if (window.__finishLoadingBar) window.__finishLoadingBar();

  return {
    show() { visible = true; container.style.display = ''; },
    hide() { visible = false; setHover(null); container.style.display = 'none'; },
    flyTo,
    destroy() { running = false; ro.disconnect(); renderer.dispose(); container.innerHTML = ''; }
  };
}
