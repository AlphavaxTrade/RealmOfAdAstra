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

import { buildWorld } from './dunya.js';
const shadowed = m => { m.castShadow = true; m.receiveShadow = true; return m; };
const mat = (hex, opts = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8, flatShading: true, ...opts });
const sphere = (r, c, x = 0, y = 0, z = 0, seg = 8) => { const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), mat(c))); m.position.set(x, y, z); return m; };
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// ── Sahne ─────────────────────────────────────────────────────────────────
export function startVadi3D(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0xbfe3ff);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab;';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe6ff, 320, 760);
  scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x6a9a4a, 1.0));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.8); sun.position.set(60, 90, 40); sun.castShadow = true;
  sun.shadow.mapSize.set(isMobile() ? 1024 : 2048, isMobile() ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 90, bottom: -90, near: 10, far: 300 }); sun.shadow.bias = -0.0005;
  scene.add(sun); scene.add(sun.target);

  // Dünya: Kenney parçaları yüklenince kurulur (yükleme çubuğu ilerler); o ana kadar yalnız gökyüzü ve bulutlar
  let zoneGroups = new Map(), zoneMeshes = new Map(), zoneTop = new Map(), pickables = [], animated = [], water = null, ready = false;
  let gate = { x: 0, z: 30 };
  // Bulutlar
  const clouds = [];
  for (let i = 0; i < 6; i++) { const c = new THREE.Group(); for (let k = 0; k < 3; k++) { const s = sphere(2.2 + rnd() * 1.6, 0xffffff, -2 + k * 2.2, rnd() * 0.6, rnd() * 1.2, 7); s.castShadow = false; s.material = mat(0xffffff, { transparent: true, opacity: 0.85 }); c.add(s); } c.position.set(-W / 2 + rnd() * W, 26 + rnd() * 6, -H / 2 + rnd() * H); scene.add(c); clouds.push(c); }

  // Karakter (basit: gövde + baş); tıklanan binaya yürür
  const hero = new THREE.Group();
  hero.add(shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.1, 3, 8), mat(0x2563eb)))).position.y = 1.2;
  hero.add(sphere(0.5, 0xf5cba7, 0, 2.35, 0, 8)); hero.add(sphere(0.52, 0x3f2a1d, 0, 2.5, -0.1, 8)).scale.set(1, 0.6, 1);
  hero.position.set(gate.x, 0, gate.z + 2); scene.add(hero);
  buildWorld(scene, { W, H, toWorld, zones: TOWN_ZONES, onProgress: p => { if (window.__updateLoadingBar) window.__updateLoadingBar(30 + p * 60); } }).then(world => {
    zoneGroups = world.zoneGroups; zoneTop = world.zoneTop; pickables = world.pickables; animated = world.animated; water = world.water; gate = world.gate;
    for (const [id, g] of zoneGroups) { const arr = []; g.traverse(o => { if (o.isMesh && o.material && 'emissive' in o.material) arr.push(o); }); zoneMeshes.set(id, arr); }
    hero.position.set(gate.x, 0, gate.z + 2); target.set(gate.x, 0, gate.z - 10); placeCamera();
    ready = true; if (window.__finishLoadingBar) window.__finishLoadingBar();
  }).catch(err => console.error('3B dünya kurulamadı:', err));
  const walk = { from: null, to: null, t: 0, dur: 0, done: null };

  // Kamera (eğik ortografik)
  const AZ = Math.PI / 4, EL = 0.62;
  const dir = new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
  const right = new THREE.Vector3(Math.cos(AZ), 0, -Math.sin(AZ));
  const fwd = new THREE.Vector3(-Math.sin(AZ), 0, -Math.cos(AZ));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
  const target = new THREE.Vector3(0, 0, 10);
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
  const screenOf = (zoneId, yOff = 0) => { const g = zoneGroups.get(zoneId); if (!g) return { x: -999, y: -999 }; v3.set(g.position.x, yOff, g.position.z).project(camera); return { x: (v3.x + 1) / 2 * size.w, y: (1 - v3.y) / 2 * size.h }; };

  function setHover(zone) {
    if (hoverZone === zone) return;
    if (hoverZone) { labels.get(hoverZone.id)?.classList.remove('is-hover'); for (const m of (zoneMeshes.get(hoverZone.id) || [])) m.material = m.userData.baseMat || m.material; }
    hoverZone = zone;
    if (zone) { labels.get(zone.id)?.classList.add('is-hover'); for (const m of (zoneMeshes.get(zone.id) || [])) { if (!m.userData.baseMat) m.userData.baseMat = m.material; m.material = m.userData.baseMat.clone(); m.material.emissive = new THREE.Color(0x3a3a2a); } }
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
    if (!ready) return;
    if (!gameState.isFeatureUnlocked(z.id)) { openZone(z); return; }
    const g = zoneGroups.get(z.id); const to = new THREE.Vector3(g.position.x, 0, g.position.z + Math.max(5, z.pr * W * 0.9) + 1.5);
    const dist = hero.position.distanceTo(to);
    walk.from = hero.position.clone(); walk.to = to; walk.t = 0; walk.dur = Math.min(0.75, dist / 90); walk.done = () => openZone(z);
    hero.rotation.y = Math.atan2(to.x - hero.position.x, to.z - hero.position.z);
    if (walk.dur < 0.05) { walk.from = null; openZone(z); }
  }
  function flyTo(zoneId, { open = false } = {}) {
    const z = TOWN_ZONES.find(x => x.id === zoneId); if (!z || !ready) return;
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
    for (const a of animated) a.obj.rotation[a.axis] += dt * a.speed;
    if (water) water.position.y = Math.sin(t * 1.2) * 0.04;
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

  return {
    show() { visible = true; container.style.display = ''; },
    hide() { visible = false; setHover(null); container.style.display = 'none'; },
    flyTo,
    destroy() { running = false; ro.disconnect(); renderer.dispose(); container.innerHTML = ''; }
  };
}
