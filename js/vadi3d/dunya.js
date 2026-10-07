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

  // ADA: yuvarlatılmış dikdörtgen çimen üst yüzeyi, altında kaya yamacı, çevresinde deniz; kenar boyunca uçurum blokları
  const M = 9, R = 22;                                  // kenar payı, köşe yuvarlağı
  const hw = W / 2 + M, hd = H / 2 + M;
  const shape = new THREE.Shape();
  shape.moveTo(-hw + R, -hd); shape.lineTo(hw - R, -hd); shape.quadraticCurveTo(hw, -hd, hw, -hd + R); shape.lineTo(hw, hd - R); shape.quadraticCurveTo(hw, hd, hw - R, hd);
  shape.lineTo(-hw + R, hd); shape.quadraticCurveTo(-hw, hd, -hw, hd - R); shape.lineTo(-hw, -hd + R); shape.quadraticCurveTo(-hw, -hd, -hw + R, -hd);
  const gt = grassTexture(); gt.repeat.set(1 / 6.5, 1 / 6.5);
  const topGeo = new THREE.ShapeGeometry(shape, 24);
  const ground = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ map: gt, roughness: 1, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; scene.add(ground);
  const skirt = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 9, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 2, curveSegments: 24 }), new THREE.MeshStandardMaterial({ color: 0x9a6b45, roughness: 1 }));
  skirt.rotation.x = Math.PI / 2; skirt.position.y = -1.75; skirt.receiveShadow = true; scene.add(skirt);   // pah üstü çimenin altında kalır
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ color: 0x3f9ad6, roughness: 0.35, metalness: 0.05 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -7; sea.receiveShadow = true; scene.add(sea); out.sea = sea;
  // Kenar blokları: ada çevresi boyunca uçurum blokları (instancing)
  const edgeT = []; const edgeCurve = shape.getPoints(160);
  let acc = 0;
  for (let i = 0; i < edgeCurve.length; i++) {
    const p = edgeCurve[i], q = edgeCurve[(i + 1) % edgeCurve.length]; acc += Math.hypot(q.x - p.x, q.y - p.y);
    if (acc < 4.1) continue; acc = 0;
    const ang = Math.atan2(q.y - p.y, q.x - p.x); const nx = (q.y - p.y), nz = -(q.x - p.x); const nl = Math.hypot(nx, nz) || 1;
    const sc = 4.2 * (0.9 + rnd() * 0.25);
    edgeT.push(xform(p.x + nx / nl * 1.6, -sc - 0.9, p.y + nz / nl * 1.6, -ang, sc));   // adanın hemen dışında, üstü çimenden biraz aşağıda
  }
  scene.add(instancedPiece('nature/cliff_block_stone', edgeT));
  const island = { hw, hd };

  // Yollar: meydan kapısından bölgelere yumuşak kenarlı toprak şeritler
  const rt = roadTexture();
  const road = (x1, z1, x2, z2, w = 4.2) => { const len = Math.hypot(x2 - x1, z2 - z1); const t = rt.clone(); t.needsUpdate = true; t.repeat.set(1, len / 12); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 1, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(x2 - x1, z2 - z1) + Math.PI; m.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2); m.receiveShadow = true; scene.add(m); };
  const cc = toWorld(0.465, 0.47); const gate = { x: cc.x, z: cc.z + 9 * S + 4 };
  for (const id of ['forest', 'spaceport', 'farm', 'barracks', 'battlefield', 'dungeon', 'quarry', 'colosseum', 'warehouse', 'healer', 'herbgarden']) { const z = zones.find(t => t.id === id); if (z) { const p = toWorld(z.px, z.py); road(gate.x, gate.z, p.x, p.z); } }
  road(gate.x, gate.z, cc.x, cc.z - 6 * S, 5);
  // Yol ayrıntıları: ana yollarda fenerler, kapı önünde tabela ve araba
  for (const id of ['farm', 'barracks', 'forest', 'battlefield']) { const z = zones.find(t => t.id === id); if (!z) continue; const p = toWorld(z.px, z.py); const n = 3; for (let i = 1; i <= n; i++) { const k = i / (n + 1); scene.add(piece('town/lantern', { x: gate.x + (p.x - gate.x) * k + 3.2, y: 0, z: gate.z + (p.z - gate.z) * k, s: S })); } }
  scene.add(piece('nature/sign', { x: gate.x + 4.5, z: gate.z + 2, s: S * 1.4, ry: 0.5 })); scene.add(piece('town/cart-high', { x: gate.x - 5, z: gate.z + 3, s: S, ry: -0.4 }));
  scene.add(piece('nature/plant_bushLarge', { x: gate.x + 7, z: gate.z - 1, s: S })); scene.add(piece('nature/plant_bushLarge', { x: gate.x - 7.5, z: gate.z - 1, s: S }));

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
  const peaks = [[0.02, 0.02, 7], [0.12, 0.0, 9], [0.22, 0.0, 8], [0.33, 0.02, 7], [0.44, 0.0, 6], [0.56, 0.02, 5], [-0.01, 0.14, 7], [-0.01, 0.32, 6], [-0.01, 0.8, 5], [0.68, 0.0, 4]];
  const rockKinds = ['nature/rock_tallA', 'nature/rock_tallB', 'nature/stone_tallB', 'nature/stone_largeA', 'nature/rock_largeC'];
  const peakT = Object.fromEntries(rockKinds.map(k => [k, []])); const snowT = [];
  for (const [px, py, hmax] of peaks) {
    const c = toWorld(px, py);
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 11; const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r * 0.8;
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
  const far = (x, z) => zones.every(t => { const p = toWorld(t.px, t.py); return Math.hypot(p.x - x, p.z - z) > Math.max(9, t.pr * W) + 5; }) && !(Math.abs(x - cc.x) < 13.5 * S && Math.abs(z - cc.z) < 10.5 * S) && x < W / 2 - 30 && !(z < -H / 2 + 16 && x < W * 0.2) && !(x < -W / 2 + 12) && Math.abs(x) < W / 2 + 4 && Math.abs(z) < H / 2 + 4;
  const kinds = { 'nature/tree_default': [], 'nature/tree_pineDefaultA': [], 'nature/tree_oak': [], 'nature/tree_pineRoundA': [], 'nature/tree_default_dark': [], 'nature/plant_bush': [], 'nature/plant_bushLarge': [], 'nature/flower_redA': [], 'nature/flower_yellowA': [], 'nature/rock_largeC': [], 'nature/stone_tallB': [], 'nature/grass_large': [] };
  const keys = Object.keys(kinds);
  for (let i = 0; i < 420; i++) {
    const x = -W / 2 - 4 + rnd() * (W + 8), z = -H / 2 - 4 + rnd() * (H + 8);
    if (!far(x, z)) continue;
    const r = rnd(); const key = r < 0.42 ? keys[Math.floor(rnd() * 5)] : r < 0.62 ? keys[5 + Math.floor(rnd() * 2)] : r < 0.8 ? keys[7 + Math.floor(rnd() * 2)] : r < 0.9 ? keys[9 + Math.floor(rnd() * 2)] : keys[11];
    const s = key.includes('tree') ? 2.6 + rnd() * 1.6 : key.includes('rock') || key.includes('stone') ? 2 + rnd() * 1.5 : 1.8 + rnd() * 1.2;
    kinds[key].push(xform(x, -0.1, z, rnd() * 6.28, s));
  }
  for (const [k, t] of Object.entries(kinds)) if (t.length) scene.add(instancedPiece(k, t));

  out.gate = gate; out.island = island;
  return out;
}
