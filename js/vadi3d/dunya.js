// AdAstra Vadisi — dünya kurulumu: zemin, dağlar (uçurum blokları), nehir ve köprü, yollar, serpili doğa, kale, bölgeler
import * as THREE from 'three';
import { piece, instancedPiece, xform, loadAll } from './yukle.js';
import { BINA, castle, S, gerekliAnahtarlar, resetSeed } from './binalar.js';

let seed = 5;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function grassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const ctx = c.getContext('2d');
  ctx.fillStyle = '#6cb752'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { ctx.fillStyle = ['#63ad49', '#74c05a', '#5fa646', '#7cc462'][i % 4]; const x = Math.random() * 256, y = Math.random() * 256, r = 3 + Math.random() * 9; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, Math.random() * 3, 0, 6.28); ctx.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function roadTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, 'rgba(201,166,107,0)'); g.addColorStop(0.22, 'rgba(201,166,107,0.95)'); g.addColorStop(0.78, 'rgba(201,166,107,0.95)'); g.addColorStop(1, 'rgba(201,166,107,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 60; i++) { ctx.fillStyle = 'rgba(160,125,75,0.35)'; ctx.beginPath(); ctx.ellipse(12 + Math.random() * 40, Math.random() * 256, 2 + Math.random() * 3, 1.5, 0, 0, 6.28); ctx.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function buildWorld(scene, { W, H, toWorld, zones, onProgress }) {
  await loadAll(gerekliAnahtarlar(), onProgress);
  resetSeed(); seed = 5;
  const out = { zoneGroups: new Map(), zoneTop: new Map(), pickables: [], animated: [] };

  // Zemin: çimen dokusu, hafif dalgalı
  const geo = new THREE.PlaneGeometry(W * 1.8, H * 2.0, 72, 44);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); pos.setZ(i, (Math.sin(x * 0.09) * Math.cos(y * 0.12)) * 0.7 - 0.7); }
  geo.computeVertexNormals();
  const gt = grassTexture(); gt.repeat.set(36, 22);
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: gt, roughness: 1, metalness: 0 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // Yollar: meydan kapısından bölgelere yumuşak kenarlı toprak şeritler
  const rt = roadTexture();
  const road = (x1, z1, x2, z2, w = 4.2) => { const len = Math.hypot(x2 - x1, z2 - z1); const t = rt.clone(); t.needsUpdate = true; t.repeat.set(1, len / 12); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 1, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(x2 - x1, z2 - z1) + Math.PI; m.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2); m.receiveShadow = true; scene.add(m); };
  const cc = toWorld(0.465, 0.47); const gate = { x: cc.x, z: cc.z + 9 * S + 4 };
  for (const id of ['forest', 'spaceport', 'farm', 'barracks', 'battlefield', 'dungeon', 'quarry', 'colosseum', 'warehouse', 'healer', 'herbgarden']) { const z = zones.find(t => t.id === id); if (z) { const p = toWorld(z.px, z.py); road(gate.x, gate.z, p.x, p.z); } }
  road(gate.x, gate.z, cc.x, cc.z - 6 * S, 5);

  // Nehir: sağ taraf, kıvrımlı; kıyıda kaya ve nilüfer; taş köprü
  const pts = [[0.99, -0.05], [0.93, 0.25], [0.86, 0.45], [0.85, 0.6], [0.8, 0.78], [0.82, 1.06]].map(([px, py]) => { const p = toWorld(px, py); return new THREE.Vector3(p.x, 0.2, p.z); });
  const curve = new THREE.CatmullRomCurve3(pts);
  const water = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 3.2, 8, false), new THREE.MeshStandardMaterial({ color: 0x4fb3e8, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.92 }));
  water.scale.y = 0.1; water.receiveShadow = true; scene.add(water); out.water = water;
  const bank = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 3.9, 8, false), new THREE.MeshStandardMaterial({ color: 0xc9b37a, roughness: 1 })); bank.scale.y = 0.06; bank.position.y = -0.02; scene.add(bank);
  const rockT = []; for (let i = 0; i < 26; i++) { const p = curve.getPointAt(rnd()); const side = rnd() > 0.5 ? 1 : -1; rockT.push(xform(p.x + side * (3.6 + rnd() * 1.5), 0, p.z + (rnd() - 0.5) * 2, rnd() * 6, 2 + rnd() * 1.5)); }
  scene.add(instancedPiece('nature/rock_largeA', rockT));
  const bp = curve.getPointAt(0.56); const tangent = curve.getTangentAt(0.56);
  const bridge = piece('nature/bridge_stone', { x: bp.x, y: 0.1, z: bp.z, ry: Math.atan2(tangent.x, tangent.z) + Math.PI / 2, s: 4.2 }); scene.add(bridge);

  // Dağlar: sol üst ve üst kenarda büyük kaya kümeleri (gri / kahverengi), yükseklerde karlı tepe
  const peaks = [[-0.02, -0.04, 7], [0.08, -0.1, 9], [0.19, -0.09, 8], [0.3, -0.1, 7], [0.42, -0.08, 6], [0.55, -0.1, 5], [-0.1, 0.12, 7], [-0.09, 0.32, 6], [-0.08, 0.52, 5], [0.68, -0.09, 4], [-0.06, 0.72, 4]];
  const rockKinds = ['nature/rock_tallA', 'nature/rock_tallB', 'nature/stone_tallB', 'nature/stone_largeA', 'nature/rock_largeC'];
  const peakT = Object.fromEntries(rockKinds.map(k => [k, []])); const snowT = [];
  for (const [px, py, hmax] of peaks) {
    const c = toWorld(px, py);
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 14; const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r * 0.8;
      const sc = (hmax * 2.2) * (0.5 + rnd() * 0.7) * (1 - r / 24);
      const key = rockKinds[Math.floor(rnd() * rockKinds.length)];
      peakT[key].push(xform(x, -0.6, z, rnd() * 6.28, Math.max(5, sc)));
      if (sc > hmax * 1.6) snowT.push(xform(x, sc * 0.55, z, rnd() * 6.28, sc * 0.45));
    }
  }
  for (const [k, t] of Object.entries(peakT)) if (t.length) scene.add(instancedPiece(k, t));
  const snowMesh = instancedPiece('nature/stone_tallB', snowT); snowMesh.traverse(o => { if (o.isInstancedMesh) { o.material = o.material.clone(); o.material.color.set(0xf8fafc); o.material.map = null; } }); scene.add(snowMesh);

  // Kale (castle kiti) — meydanın çevresi
  const kale = new THREE.Group(); kale.position.set(cc.x, 0, cc.z); kale.scale.setScalar(S); castle(kale, 12, 9); scene.add(kale);

  // Bölgeler
  for (const z of zones) {
    const g = new THREE.Group(); const p = toWorld(z.px, z.py); g.position.set(p.x, 0, p.z); g.scale.setScalar(S);
    const info = (BINA[z.id] || (gg => { BINA.village(gg); return { top: 8 }; }))(g);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(Math.max(5, z.pr * W * 0.9) / S, 20), new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.12; g.add(disc);
    g.userData.zoneId = z.id; g.traverse(o => { if (o.isMesh) o.userData.zoneId = z.id; });
    if (g.userData.blades) out.animated.push({ obj: g.userData.blades, axis: 'x', speed: 0.9 });
    if (g.userData.wheel) out.animated.push({ obj: g.userData.wheel, axis: 'z', speed: 0.35 });
    scene.add(g); out.zoneGroups.set(z.id, g); out.zoneTop.set(z.id, info.top || 8); out.pickables.push(g);
  }

  // Serpili doğa: bölgelerden ve kaleden uzak boş yerlere ağaç, çalı, çiçek, kaya (instancing)
  const far = (x, z) => zones.every(t => { const p = toWorld(t.px, t.py); return Math.hypot(p.x - x, p.z - z) > Math.max(9, t.pr * W) + 5; }) && !(Math.abs(x - cc.x) < 13.5 * S && Math.abs(z - cc.z) < 10.5 * S) && x < W / 2 - 34 && !(z < -H / 2 + 24 && x < 0) && !(x < -W / 2 + 18);
  const kinds = { 'nature/tree_default': [], 'nature/tree_pineDefaultA': [], 'nature/tree_oak': [], 'nature/tree_pineRoundA': [], 'nature/tree_default_dark': [], 'nature/plant_bush': [], 'nature/plant_bushLarge': [], 'nature/flower_redA': [], 'nature/flower_yellowA': [], 'nature/rock_largeC': [], 'nature/stone_tallB': [], 'nature/grass_large': [] };
  const keys = Object.keys(kinds);
  for (let i = 0; i < 420; i++) {
    const x = -W / 2 - 10 + rnd() * (W + 20), z = -H / 2 - 6 + rnd() * (H + 16);
    if (!far(x, z)) continue;
    const r = rnd(); const key = r < 0.42 ? keys[Math.floor(rnd() * 5)] : r < 0.62 ? keys[5 + Math.floor(rnd() * 2)] : r < 0.8 ? keys[7 + Math.floor(rnd() * 2)] : r < 0.9 ? keys[9 + Math.floor(rnd() * 2)] : keys[11];
    const s = key.includes('tree') ? 2.6 + rnd() * 1.6 : key.includes('rock') || key.includes('stone') ? 2 + rnd() * 1.5 : 1.8 + rnd() * 1.2;
    kinds[key].push(xform(x, -0.1, z, rnd() * 6.28, s));
  }
  for (const [k, t] of Object.entries(kinds)) if (t.length) scene.add(instancedPiece(k, t));

  out.gate = gate;
  return out;
}
