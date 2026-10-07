// Geliştirici galerisi: ?galeri=town|castle|nature&sayfa=0 — model parçalarını ızgarada adlarıyla çizer, boyutlarını konsola yazar
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PARCALAR } from './parcalar.js';

export function startGaleri(container, set = 'town', page = 0, perPage = 40, cols = 8) {
  const names = (PARCALAR[set] || []).slice(page * perPage, page * perPage + perPage);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.setClearColor(0x2b3340);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(5, 10, 6); scene.add(sun);
  const w = container.clientWidth, h = container.clientHeight; renderer.setSize(w, h, false);
  const rows = Math.ceil(names.length / cols); const cell = 3.2;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  const gridW = cols * cell, gridH = rows * cell;
  const frustumH = Math.max(gridH, gridW / (w / h)) * 0.58;
  camera.left = -frustumH * (w / h); camera.right = frustumH * (w / h); camera.top = frustumH; camera.bottom = -frustumH;
  const center = new THREE.Vector3(gridW / 2 - cell / 2, 0, gridH / 2 - cell / 2);
  camera.position.copy(center).add(new THREE.Vector3(30, 42, 30)); camera.lookAt(center); camera.updateProjectionMatrix();
  const overlay = document.createElement('div'); overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;font:12px/1.2 monospace;color:#fff;'; container.appendChild(overlay);
  const loader = new GLTFLoader(); const bounds = {}; const labels = [];
  names.forEach((name, i) => {
    loader.load(`assets/3d/${set}/${name}.glb`, gltf => {
      const obj = gltf.scene; const b = new THREE.Box3().setFromObject(obj); const size = b.getSize(new THREE.Vector3());
      bounds[name] = { w: +size.x.toFixed(2), h: +size.y.toFixed(2), d: +size.z.toFixed(2), minY: +b.min.y.toFixed(2), cx: +((b.min.x + b.max.x) / 2).toFixed(2), cz: +((b.min.z + b.max.z) / 2).toFixed(2) };
      const s = Math.min(1, 2.4 / Math.max(size.x, size.y, size.z)); obj.scale.setScalar(s);
      obj.position.set((i % cols) * cell, 0, Math.floor(i / cols) * cell); scene.add(obj);
      const lb = document.createElement('div'); lb.textContent = name + ` ${bounds[name].w}×${bounds[name].h}×${bounds[name].d}`; lb.style.cssText = 'position:absolute;transform:translate(-50%,0);background:rgba(0,0,0,.55);padding:1px 4px;border-radius:4px;white-space:nowrap;'; overlay.appendChild(lb); labels.push({ lb, pos: obj.position.clone().add(new THREE.Vector3(0, -0.2, cell * 0.45)) });
      if (Object.keys(bounds).length === names.length) console.log('BOUNDS ' + JSON.stringify(bounds));
    }, undefined, err => console.warn('yüklenemedi', name, err));
  });
  const v = new THREE.Vector3();
  (function frame() { requestAnimationFrame(frame); for (const l of labels) { v.copy(l.pos).project(camera); l.lb.style.left = ((v.x + 1) / 2 * w) + 'px'; l.lb.style.top = ((1 - v.y) / 2 * h) + 'px'; } renderer.render(scene, camera); })();
  if (window.__finishLoadingBar) window.__finishLoadingBar();
}

// Bina galerisi: ?galeri=binalar — her bölge şablonu ızgarada (Kenney parçalarıyla)
export async function startBinaGalerisi(container) {
  const { loadAll } = await import('./yukle.js');
  const { BINA, castle, S, gerekliAnahtarlar, resetSeed } = await import('./binalar.js');
  await loadAll(gerekliAnahtarlar());
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xbfe3ff);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x6a9a4a, 1.0));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.8); sun.position.set(40, 70, 30); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 70, bottom: -70, near: 1, far: 300 }); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x6ab84f, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const names = Object.keys(BINA).filter(k => !k.startsWith('_')).concat(['castle']);
  const cols = 5, cell = 34; const labels = [];
  const overlay = document.createElement('div'); overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;font:bold 13px/1.2 sans-serif;color:#fff;'; container.appendChild(overlay);
  resetSeed();
  names.forEach((name, i) => {
    const g = new THREE.Group(); g.scale.setScalar(S); g.position.set((i % cols) * cell, 0, Math.floor(i / cols) * cell);
    if (name === 'castle') castle(g, 5, 4); else BINA[name](g);
    scene.add(g);
    const lb = document.createElement('div'); lb.textContent = name; lb.style.cssText = 'position:absolute;transform:translate(-50%,0);background:rgba(0,0,0,.6);padding:2px 6px;border-radius:4px;'; overlay.appendChild(lb); labels.push({ lb, pos: g.position.clone().add(new THREE.Vector3(0, 0, cell * 0.42)) });
  });
  const rows = Math.ceil(names.length / cols); const w = container.clientWidth, h = container.clientHeight; renderer.setSize(w, h, false);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
  const fr = Math.max(rows * cell * 0.62, cols * cell * 0.62 / (w / h));
  camera.left = -fr * (w / h); camera.right = fr * (w / h); camera.top = fr; camera.bottom = -fr;
  const center = new THREE.Vector3((cols - 1) * cell / 2, 0, (rows - 1) * cell / 2);
  camera.position.copy(center).add(new THREE.Vector3(120, 150, 120)); camera.lookAt(center); camera.updateProjectionMatrix();
  const v = new THREE.Vector3();
  (function frame() { requestAnimationFrame(frame); for (const l of labels) { v.copy(l.pos).project(camera); l.lb.style.left = ((v.x + 1) / 2 * w) + 'px'; l.lb.style.top = ((1 - v.y) / 2 * h) + 'px'; } renderer.render(scene, camera); })();
  if (window.__finishLoadingBar) window.__finishLoadingBar();
}
