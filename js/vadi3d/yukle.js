// Kenney CC0 model parçaları: yükleme, önbellek, kopyalama (public/assets/3d/<set>/<ad>.glb)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();     // 'town/wall' → { scene, box }
const pending = new Map();

export function loadPiece(key) {
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (pending.has(key)) return pending.get(key);
  const p = new Promise((resolve) => {
    loader.load(`assets/3d/${key}.glb`, gltf => {
      const scene = gltf.scene;
      scene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          if (o.material && o.material.map) { o.material.map.colorSpace = THREE.SRGBColorSpace; o.material.map.magFilter = THREE.NearestFilter; }
        }
      });
      const box = new THREE.Box3().setFromObject(scene);
      const rec = { scene, box, size: box.getSize(new THREE.Vector3()) };
      cache.set(key, rec); resolve(rec);
    }, undefined, err => { console.warn('[3B] parça yüklenemedi:', key, err && err.message); const rec = { scene: new THREE.Group(), box: new THREE.Box3(), size: new THREE.Vector3() }; cache.set(key, rec); resolve(rec); });
  });
  pending.set(key, p);
  return p;
}

export function loadAll(keys, onProgress) {
  let done = 0; const list = [...new Set(keys)];
  return Promise.all(list.map(k => loadPiece(k).then(r => { done++; if (onProgress) onProgress(done / list.length); return r; })));
}

// Kopya: geometri ve malzeme paylaşılır, dönüşüm ayrı. Konum model kökenine göredir (Kenney: taban y=0, karo merkezi).
export function piece(key, { x = 0, y = 0, z = 0, ry = 0, s = 1, sx = null, sy = null, sz = null, tint = null } = {}) {
  const rec = cache.get(key);
  if (!rec) { console.warn('[3B] parça yüklenmemiş:', key); return new THREE.Group(); }
  const obj = rec.scene.clone(true);
  obj.position.set(x, y, z); obj.rotation.y = ry; obj.scale.set(sx ?? s, sy ?? s, sz ?? s);
  if (tint) obj.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(tint)); } });
  obj.userData.piece = key;
  return obj;
}

export const sizeOf = key => (cache.get(key) || {}).size || new THREE.Vector3(1, 1, 1);
export const hasPiece = key => cache.has(key);

// Çok sayıda kopya (ağaç, kaya, uçurum bloğu): her alt ağ için InstancedMesh; transforms = Matrix4 listesi
export function instancedPiece(key, transforms) {
  const rec = cache.get(key); const out = new THREE.Group();
  if (!rec || !transforms.length) return out;
  rec.scene.updateMatrixWorld(true);
  rec.scene.traverse(o => {
    if (!o.isMesh) return;
    const inst = new THREE.InstancedMesh(o.geometry, o.material, transforms.length);
    const m = new THREE.Matrix4();
    transforms.forEach((t, i) => { m.multiplyMatrices(t, o.matrixWorld); inst.setMatrixAt(i, m); });
    inst.castShadow = true; inst.receiveShadow = true; inst.instanceMatrix.needsUpdate = true;
    out.add(inst);
  });
  return out;
}
export const xform = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
