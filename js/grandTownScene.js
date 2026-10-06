// Realm of AdAstra — Krallık Haritası (v1.25)
// ============================================================================
//  • Harita oranı bozulmadan ekranı doldurur (cover); sürükle-kaydır, tekerlek/iki parmakla yakınlaştır
//  • Binanın üzerine gelince bilgi kartı (ad, açıklama, canlı durum); biten seferde küçük "Hazır" rozeti
//  • Hareketli süsler (köylüler, bulut, kuş, duman, gece karartması) kullanıcı isteğiyle kaldırıldı
// Harita resmi 1024×572; tüm koordinatlar resim pikseli cinsindendir.
// ============================================================================
import { gameState } from './gameState.js';
import { globalPool } from './globalPool.js';
import { ammMarket } from './ammMarket.js';
import { GAME_CONFIG } from './config.js';
import { sound } from './audio.js';
import Phaser from 'phaser';

const IMG_W = 1024;
const IMG_H = 572;
const MIN_ZOOM = 1;
const MAX_ZOOM = 2.2;

// Konumlar — px/py resim üzerindeki oran, pr tıklama yarıçapı (resim genişliğine oran)
export const TOWN_ZONES = [
  { id: 'dungeon',     icon: '💀', name: 'Zindan Mağarası',   sub: '18 seviyeli zindana in',          px: 0.078, py: 0.295, pr: 0.055, color: '#a855f7' },
  { id: 'warehouse',   icon: '📦', name: 'Krallık Silosu',    sub: 'Ambar, envanter ve yükseltme',     px: 0.105, py: 0.550, pr: 0.065, color: '#fbbf24' },
  { id: 'barracks',    icon: '⚔️', name: 'Kışla',             sub: 'Ordu, asker ve teçhizat',          px: 0.160, py: 0.840, pr: 0.090, color: '#60a5fa' },
  { id: 'mine',        icon: '⛏️', name: 'Maden Ocağı',       sub: 'Demir seferleri',                  px: 0.275, py: 0.185, pr: 0.065, color: '#38bdf8' },
  { id: 'blacksmith',  icon: '⚒️', name: 'Demirci',           sub: 'Silah ve zırh dövme, onarım',      px: 0.275, py: 0.515, pr: 0.045, color: '#fb923c' },
  { id: 'market',      icon: '🏪', name: 'Meydan Pazarı',     sub: 'AMM pazar: al ve sat',             px: 0.380, py: 0.535, pr: 0.065, color: '#f43f5e' },
  { id: 'carnival',    icon: '🎪', name: 'Karnaval',          sub: 'Şans çarkı ve haftalık piyango',   px: 0.465, py: 0.415, pr: 0.050, color: '#ec4899' },
  { id: 'tavern',      icon: '🍺', name: 'Taverna',           sub: 'Otomasyon botu ve rehber',         px: 0.585, py: 0.275, pr: 0.065, color: '#eab308' },
  { id: 'colosseum',   icon: '🏟️', name: 'Kolezyum',          sub: 'Gladyatör düelloları',             px: 0.745, py: 0.535, pr: 0.110, color: '#ef4444' },
  { id: 'farm',        icon: '🌾', name: 'Güneş Tarlası',     sub: 'Buğday seferleri',                 px: 0.945, py: 0.540, pr: 0.065, color: '#facc15' },
  { id: 'forest',      icon: '🌲', name: 'Zümrüt Ormanı',     sub: 'Odun seferleri',                   px: 0.845, py: 0.165, pr: 0.070, color: '#4ade80' },
  { id: 'battlefield', icon: '🚩', name: 'Savaş Alanı',       sub: 'Dünya Bossu cephesi',              px: 0.530, py: 0.860, pr: 0.120, color: '#f87171' }
];

const NODE_OF_ZONE = { forest: 'wood', mine: 'iron', farm: 'wheat' };

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
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}s ${String(m).padStart(2, '0')}d`;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export class GrandTownScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GrandTownScene' });
    this.hoverZone = null;
    this.labels = new Map();
    this.statusTimer = 0;
  }

  preload() {
    const v = Date.now();
    this.load.image('grand_town_map', 'assets/adastra_grand_town.jpg?v=' + v);
    // Zindan katları da burada yüklenir (DungeonScene aynı anahtarları kullanır)
    this.load.image('dungeon_tex_f1', 'assets/dungeon_map.jpg?v=' + v);
    this.load.image('dungeon_tex_f2', 'assets/dungeon_floor2.jpg?v=' + v);
    this.load.image('dungeon_tex_f3', 'assets/dungeon_floor3.jpg?v=' + v);
    this.load.image('dungeon_tex_f4', 'assets/dungeon_floor4.jpg?v=' + v);
    this.load.image('dungeon_tex_f5', 'assets/dungeon_floor5.jpg?v=' + v);
    this.load.image('dungeon_tex_f6', 'assets/dungeon_floor6.jpg?v=' + v);
    this.load.on('progress', (value) => {
      if (window.__updateLoadingBar) window.__updateLoadingBar(30 + value * 60);
    });
    this.load.on('loaderror', (file) => console.error('[Phaser] Yüklenemedi:', file.key, file.src));
  }

  create() {
    if (window.__finishLoadingBar) window.__finishLoadingBar();

    if (this.textures.exists('grand_town_map')) {
      this.map = this.add.image(0, 0, 'grand_town_map').setOrigin(0, 0);
    } else {
      this.map = this.add.rectangle(0, 0, IMG_W, IMG_H, 0x1a2a14).setOrigin(0, 0);
    }
    this.map.setDepth(0);


    this.layout(true);
    this.createOverlay();
    this.bindInput();

    this.resizeHandler = () => this.layout(false);
    this.scale.on('resize', this.resizeHandler);

    window.realmMap = {
      flyTo: (zoneId, opts = {}) => this.flyTo(zoneId, opts),
      zones: TOWN_ZONES
    };

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.resizeHandler);
      const overlay = document.getElementById('map-overlay');
      if (overlay) overlay.classList.add('is-hidden');
      if (window.realmMap && window.realmMap.flyTo) window.realmMap.flyTo = () => {};
    });

    this.refreshStatuses();
  }

  // ── Yerleşim: cover ölçek, dünya sınırları, kamera ────────────────────────
  layout(initial) {
    const parent = this.game.canvas && this.game.canvas.parentElement;
    const w = (parent && parent.clientWidth) || window.innerWidth;
    const h = (parent && parent.clientHeight) || window.innerHeight;
    try {
      if (this.scale.width !== w || this.scale.height !== h) this.scale.resize(w, h);
    } catch (e) { /* yoksay */ }

    const cam = this.cameras.main;
    const prevCenter = (!initial && this.worldScale)
      ? { x: (cam.worldView.centerX) / this.worldScale, y: (cam.worldView.centerY) / this.worldScale }
      : { x: 430, y: 300 }; // ilk açılış: kasaba meydanı biraz sağında
    const prevZoom = initial ? 1 : cam.zoom;

    this.worldScale = Math.max(w / IMG_W, h / IMG_H);
    this.worldW = IMG_W * this.worldScale;
    this.worldH = IMG_H * this.worldScale;

    this.map.setScale(this.worldScale);
    cam.setSize(w, h);
    cam.setBounds(0, 0, this.worldW, this.worldH);
    cam.setZoom(Phaser.Math.Clamp(prevZoom, MIN_ZOOM, MAX_ZOOM));
    cam.centerOn(prevCenter.x * this.worldScale, prevCenter.y * this.worldScale);
  }

  toWorld(ix, iy) { return { x: ix * this.worldScale, y: iy * this.worldScale }; }
  zoneWorld(z) { return { x: z.px * this.worldW, y: z.py * this.worldH, r: Math.min(z.pr * this.worldW, 170 * this.worldScale) }; }

  // ── Giriş: sürükle, tıkla, yakınlaştır ────────────────────────────────────
  bindInput() {
    this.input.addPointer(1);
    const cam = this.cameras.main;
    let down = null;
    let pinch = null;

    this.input.on('pointerdown', (p) => {
      if (isAnyModalActive()) return;
      down = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY, dragging: false, onCanvas: true };
      const p1 = this.input.pointer1, p2 = this.input.pointer2;
      if (p1 && p2 && p1.isDown && p2.isDown) {
        pinch = { d: Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y), z: cam.zoom };
      }
    });

    this.input.on('pointermove', (p) => {
      if (isAnyModalActive()) { this.setHover(null); return; }
      const p1 = this.input.pointer1, p2 = this.input.pointer2;
      if (pinch && p1 && p2 && p1.isDown && p2.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        this.zoomAt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, pinch.z * (d / Math.max(1, pinch.d)));
        if (down) down.dragging = true;
        return;
      }
      if (down && p.isDown) {
        const dx = p.x - down.x, dy = p.y - down.y;
        if (!down.dragging && Math.hypot(dx, dy) > 6) down.dragging = true;
        if (down.dragging) {
          cam.scrollX = down.sx - dx / cam.zoom;
          cam.scrollY = down.sy - dy / cam.zoom;
          this.setHover(null);
          if (this.game.canvas) this.game.canvas.style.cursor = 'grabbing';
          return;
        }
      }
      this.setHover(this.zoneAtScreen(p.x, p.y));
    });

    this.input.on('pointerup', (p) => {
      const wasDown = down;
      down = null;
      if (!this.input.pointer2 || !this.input.pointer2.isDown) pinch = null;
      if (this.game.canvas) this.game.canvas.style.cursor = this.hoverZone ? 'pointer' : 'grab';
      if (!wasDown || !wasDown.onCanvas || wasDown.dragging) return;
      if (isAnyModalActive()) return;
      const z = this.zoneAtScreen(p.x, p.y);
      if (z) this.openZone(z);
    });

    this.input.on('wheel', (p, _objs, _dx, dy) => {
      if (isAnyModalActive()) return;
      const factor = dy > 0 ? 0.9 : 1.1;
      this.zoomAt(p.x, p.y, cam.zoom * factor);
    });

    this.input.on('gameout', () => this.setHover(null));

    if (this.game.canvas) this.game.canvas.style.cursor = 'grab';
  }

  zoomAt(sx, sy, targetZoom) {
    const cam = this.cameras.main;
    const z = Phaser.Math.Clamp(targetZoom, MIN_ZOOM, MAX_ZOOM);
    const before = cam.getWorldPoint(sx, sy);
    cam.setZoom(z);
    const after = cam.getWorldPoint(sx, sy);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
  }

  zoneAtScreen(sx, sy) {
    const wp = this.cameras.main.getWorldPoint(sx, sy);
    let best = null, bestD = Infinity;
    for (const z of TOWN_ZONES) {
      const c = this.zoneWorld(z);
      const d = Math.hypot(wp.x - c.x, wp.y - c.y);
      if (d <= c.r && d < bestD) { best = z; bestD = d; }
    }
    return best;
  }

  setHover(zone) {
    if (this.hoverZone === zone) return;
    if (this.hoverZone) {
      const el = this.labels.get(this.hoverZone.id);
      if (el) el.classList.remove('is-hover');
    }
    this.hoverZone = zone;
    if (zone) {
      const el = this.labels.get(zone.id);
      if (el) el.classList.add('is-hover');
    }
    this.fillCard(zone);
    if (this.game.canvas) this.game.canvas.style.cursor = zone ? 'pointer' : 'grab';
  }

  // ── Bilgi kartı ───────────────────────────────────────────────────────────
  fillCard(zone) {
    const card = this.card;
    if (!card) return;
    if (!zone) {
      card.classList.remove('is-visible');
      return;
    }
    card.style.setProperty('--zc', zone.color);
    card.querySelector('.mc-icon').textContent = zone.icon;
    card.querySelector('.mc-name').textContent = zone.name;
    card.querySelector('.mc-sub').textContent = zone.sub;
    const locked = !gameState.isFeatureUnlocked(zone.id);
    card.classList.toggle('is-locked', locked);
    card.querySelector('.mc-hint-text').textContent = locked ? 'Henüz kilitli' : (zone.id === 'dungeon' ? 'Zindana inmek için tıkla' : 'Açmak için tıkla');
    this.syncCardStatus();
    this.cardSize = null;
    card.classList.add('is-visible');
    this.positionCard();
  }

  syncCardStatus() {
    if (!this.card || !this.hoverZone) return;
    const label = this.labels.get(this.hoverZone.id);
    const text = label ? (label.querySelector('[data-status]')?.textContent || '') : '';
    const statusEl = this.card.querySelector('.mc-status');
    this.card.querySelector('.mc-status-text').textContent = text;
    statusEl.hidden = !text;
    this.card.dataset.tone = (label && label.dataset.tone) || '';
  }

  positionCard() {
    const card = this.card;
    if (!card || !this.hoverZone) return;
    const cam = this.cameras.main;
    const view = cam.worldView;
    const zoom = cam.zoom;
    const c = this.zoneWorld(this.hoverZone);
    const ax = (c.x - view.x) * zoom;
    const topY = (c.y - c.r * 0.55 - view.y) * zoom;
    const bottomY = (c.y + c.r * 0.45 - view.y) * zoom;
    if (!this.cardSize) this.cardSize = { w: card.offsetWidth || 270, h: card.offsetHeight || 120 };
    const { w, h } = this.cardSize;
    const gap = 14;
    const below = topY - h - gap < 8;
    const y = below ? Math.min(bottomY + gap, cam.height - h - 8) : topY - h - gap;
    const left = Math.max(8, Math.min(cam.width - w - 8, ax - w / 2));
    const arrowX = Math.max(18, Math.min(w - 18, ax - left));
    card.classList.toggle('is-below', below);
    card.style.setProperty('--arrow-x', `${arrowX.toFixed(0)}px`);
    card.style.transform = `translate(${left.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  openZone(z) {
    if (!gameState.isFeatureUnlocked(z.id)) {
      window.dispatchEvent(new CustomEvent('feature-locked', { detail: { zoneId: z.id } }));
      return;
    }
    try { sound.playPickaxe(); } catch (e) { /* ses kapalı olabilir */ }
    if (z.id === 'dungeon') {
      window.dispatchEvent(new CustomEvent('enter-dungeon-view'));
      this.scene.start('DungeonScene');
      return;
    }
    window.dispatchEvent(new CustomEvent('open-town-modal', { detail: { zoneId: z.id, zoneName: `${z.icon} ${z.name.toLocaleUpperCase('tr-TR')}` } }));
  }

  // DFK tarzı: konuma uç, sonra aç
  flyTo(zoneId, { open = false } = {}) {
    const z = TOWN_ZONES.find(x => x.id === zoneId);
    if (!z) return;
    const c = this.zoneWorld(z);
    const cam = this.cameras.main;
    const targetZoom = Math.max(cam.zoom, 1.35);
    cam.pan(c.x, c.y, 550, 'Sine.easeInOut', true);
    cam.zoomTo(targetZoom, 550, 'Sine.easeInOut', true);
    this.setHover(z);
    if (open) this.time.delayedCall(600, () => { this.setHover(null); this.openZone(z); });
  }

  // ── DOM etiketleri (net yazı, CSS ile tasarlanır) ────────────────────────
  createOverlay() {
    const container = document.getElementById('phaser-game-container');
    if (!container) return;
    let overlay = document.getElementById('map-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'map-overlay';
      overlay.className = 'map-overlay';
      container.appendChild(overlay);
    }
    overlay.classList.remove('is-hidden');
    overlay.innerHTML = '';
    this.labels.clear();
    for (const z of TOWN_ZONES) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'map-label';
      el.dataset.zone = z.id;
      el.style.setProperty('--zc', z.color);
      el.innerHTML = `
        <span class="ml-icon" aria-hidden="true">${z.icon}</span>
        <span class="ml-body">
          <span class="ml-name">${z.name}</span>
          <span class="ml-status" data-status></span>
        </span>`;
      el.setAttribute('aria-label', `${z.name} — ${z.sub}`);
      el.addEventListener('mouseenter', () => this.setHover(z));
      el.addEventListener('mouseleave', () => { if (this.hoverZone === z) this.setHover(null); });
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (isAnyModalActive()) return;
        this.openZone(z);
      });
      overlay.appendChild(el);
      this.labels.set(z.id, el);
    }

    const card = document.createElement('div');
    card.className = 'map-card';
    card.id = 'map-hover-card';
    card.setAttribute('role', 'tooltip');
    card.innerHTML = `
      <div class="mc-head">
        <span class="mc-icon" aria-hidden="true"></span>
        <span class="mc-titles"><span class="mc-name"></span><span class="mc-sub"></span></span>
      </div>
      <div class="mc-status"><span class="mc-dot"></span><span class="mc-status-text"></span></div>
      <div class="mc-hint"><span class="mc-hint-text">Açmak için tıkla</span><span class="mc-hint-arrow" aria-hidden="true">→</span></div>`;
    overlay.appendChild(card);
    this.card = card;
  }

  positionLabels() {
    const cam = this.cameras.main;
    const view = cam.worldView;
    const zoom = cam.zoom;
    const compact = cam.width < 720;
    for (const z of TOWN_ZONES) {
      const el = this.labels.get(z.id);
      if (!el) continue;
      const c = this.zoneWorld(z);
      const sx = (c.x - view.x) * zoom;
      const sy = (c.y - c.r * 0.55 - view.y) * zoom;
      const visible = sx > -80 && sx < cam.width + 80 && sy > -40 && sy < cam.height + 60;
      el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
      el.classList.toggle('is-offscreen', !visible);
      el.classList.toggle('is-compact', compact);
    }
  }

  // ── Canlı durum levhaları ─────────────────────────────────────────────────
  refreshStatuses() {
    const st = gameState.state;
    const set = (id, text, tone = '') => {
      const el = this.labels.get(id);
      if (!el) return;
      const s = el.querySelector('[data-status]');
      if (s && s.textContent !== text) s.textContent = text;
      el.dataset.tone = tone;
    };

    for (const zoneId of Object.keys(NODE_OF_ZONE)) {
      const node = NODE_OF_ZONE[zoneId];
      const exp = st.activeExpeditions && st.activeExpeditions[node];
      if (!exp) set(zoneId, 'Boşta · sefer gönder', 'idle');
      else if (exp.isCompleted) set(zoneId, '✅ Hazır · topla', 'ready');
      else {
        const pct = Math.min(100, Math.floor((exp.elapsedSeconds / exp.durationSeconds) * 100));
        set(zoneId, `⏳ ${fmtCountdown(exp.durationSeconds - exp.elapsedSeconds)} · %${pct}`, 'busy');
      }
    }

    // Taverna: bot durumu
    if (gameState.isBotPaused()) set('tavern', '⏸️ Bot duraklatıldı', 'warn');
    else if (gameState.hasPurchasedBot()) set('tavern', `🤖 Bot aktif · ${fmtCountdown(gameState.getAutoCollectorRemainingSeconds())}`, 'ready');
    else set('tavern', st.botTrialUsed ? 'Bot kapalı' : '🎁 Ücretsiz bot denemesi', st.botTrialUsed ? '' : 'gift');

    // Silo doluluğu
    const cap = gameState.getWarehouseCapacity();
    const inv = st.inventory || {};
    const fill = Math.max(...['wood', 'iron', 'wheat'].map(r => (Number(inv[r]) || 0) / Math.max(1, cap[r] || 1)));
    set('warehouse', `Sv.${st.warehouseLevel || 1} · %${Math.round(fill * 100)} dolu`, fill >= 0.95 ? 'warn' : '');

    // Kışla
    const units = st.soldierUnits || [];
    const wounded = units.filter(s => s && s.hp < s.maxHp).length;
    set('barracks', units.length ? `${units.length} asker${wounded ? ` · ${wounded} yaralı` : ''}` : 'İlk askerini al', wounded ? 'warn' : '');

    // Pazar
    set('market', `🌲 ${ammMarket.getPrice('wood').toFixed(2)} · ⛏️ ${ammMarket.getPrice('iron').toFixed(2)} ADA`, '');

    // Karnaval / piyango
    if ((st.lotteryPendingPayout || 0) > 0) set('carnival', '🎟️ Piyango kazancın hazır!', 'gift');
    else set('carnival', `Çark · ${st.lotteryTickets || 0} bilet`, '');

    // Kolezyum
    const counters = (typeof gameState.getDailyCounters === 'function') ? gameState.getDailyCounters() : { arenaMatches: 0 };
    const cap10 = (GAME_CONFIG.COLOSSEUM && GAME_CONFIG.COLOSSEUM.DAILY_MATCH_CAP) || 10;
    set('colosseum', `Bugün ${Math.max(0, cap10 - (counters.arenaMatches || 0))} maç hakkı`, '');

    set('blacksmith', 'Dövme · onarım', '');
    set('dungeon', `Kat ${Math.ceil((st.dungeonProgress || 1) / 3)} · Sv.${st.dungeonProgress || 1}`, '');
    set('battlefield', st.worldBoss && st.worldBoss.userStaked ? '🔒 Ordun savaşta' : 'Dünya Bossu', st.worldBoss && st.worldBoss.claimableRewardAda > 0 ? 'gift' : '');

    // 🔓 İlk oturumda henüz açılmamış bölümler: kilit ve nasıl açılacağı
    for (const z of TOWN_ZONES) {
      const lock = gameState.getFeatureLock(z.id);
      const el = this.labels.get(z.id);
      if (el) el.classList.toggle('is-locked', !!lock);
      if (lock) set(z.id, `🔒 ${lock.reason.replace(/ açılır\.?$/, '')}`, 'locked');
    }

    if (this.hoverZone) {
      const before = this.card && this.card.querySelector('.mc-status-text').textContent;
      this.syncCardStatus();
      if (this.card && this.card.querySelector('.mc-status-text').textContent.length !== (before || '').length) this.cardSize = null;
    }
  }

  update(time, delta) {
    if (this.hoverZone && isAnyModalActive()) this.setHover(null);
    this.positionCard();
    this.positionLabels();

    this.statusTimer += delta;
    if (this.statusTimer >= 500) {
      this.statusTimer = 0;
      this.refreshStatuses();
    }
  }
}
