// AdAstra: Genesis Realm - Pixiland v2.7.0 Modern Controller
import Phaser from 'phaser';
import { GAME_CONFIG } from './config.js';
import { gameState } from './gameState.js';
import { globalPool } from './globalPool.js';
import { ammMarket } from './ammMarket.js';
import { sound } from './audio.js';
import { GrandTownScene } from './grandTownScene.js';
import { DungeonScene } from './dungeonScene.js';
import { startVadi3D, VadiBootScene } from './vadi3d/vadi.js';   // 3B vadi (kampuse tarzı); ?harita=2d eski haritayı açar
import { createUnit, simulateBattle, DEFAULT_BOSS_PHASES, PLAYER_SKILLS } from './combat.js';
import { AdAstraBattleArena, getMonsterAvatar, getUnitAvatar } from './battleArena.js';
import { renderQuotaTracker, renderLimitMeter, renderDungeonEntryLadder, formatDuration, fmtInt } from './ui/limits.js';
import { consumeStorageEvents, CORRUPT_SUFFIX } from './storage.js';
import { treasury } from './treasury.js';
import { createBarracksUI } from './ui/barracks.js';
import { equipImg, resImg, soldierPortrait, rewardImg } from './ui/art.js';
import { startOnline, openWalletPanel, online, pvp, pazar, isLoggedIn, requireLogin, devVanillaReset } from './net/online.js';

// 🧪 Test menüsü yalnızca geliştirme sunucusunda (npm run dev) açılır; yayına çıkan sürümde oyuncular göremez.
const DEV_TOOLS = !!(import.meta.env && import.meta.env.DEV);

let speedMultiplier = 1;
let lastTickTime = performance.now();
let phaserGame = null;
let battleArenaInstance = null;
window.gameState = gameState;
window.globalPool = globalPool;

function getBattleArena() {
  if (!battleArenaInstance) {
    const rootEl = document.getElementById('battle-arena-modal');
    if (rootEl) {
      battleArenaInstance = new AdAstraBattleArena(rootEl);
    }
  }
  return battleArenaInstance;
}

function openBattleArenaModal() {
  const modal = document.getElementById('battle-arena-modal');
  if (modal) {
    modal.classList.add('active');
    document.body.classList.add('modal-open');
  }
}

function closeBattleArenaModal() {
  const modal = document.getElementById('battle-arena-modal');
  if (modal) {
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
  }
  if (battleArenaInstance) {
    battleArenaInstance.stop();
  }
}
window.openBattleArenaModal = openBattleArenaModal;
window.closeBattleArenaModal = closeBattleArenaModal;

// PHASE 2: GAMEFI & RPG EKONOMİSİ - MODAL SEKME & GEÇİCİ DURUM DEĞİŞKENLERİ
let barracksActiveTab = 'army';
let mineActiveTab = 'mining';
let marketActiveTab = 'resources';
let selectedSoldierIndex = 0;
let editingSoldierNameIndex = null;
let collectionActiveTab = 'koleksiyon';
let lastBoxResult = null;
let barracksLiveRefreshAccumulator = 0;

// DOM Referansları
const dom = {
  playerLevel: document.getElementById('player-level'),
  staminaText: document.getElementById('stamina-text'),
  adAstraBalance: document.getElementById('adastra-balance'),
  resWheat: document.getElementById('res-wheat'),
  resWood: document.getElementById('res-wood'),
  resIron: document.getElementById('res-iron'),
  resFragments: document.getElementById('res-fragments'),
  btnDailyLimits: document.getElementById('btn-daily-limits'),
  profileBadgeBtn: document.getElementById('profile-badge-btn'),
  btnDockWorkers: document.getElementById('btn-dock-workers'),
  btnDockInventory: document.getElementById('btn-dock-inventory'),
  btnDockBarracks: document.getElementById('btn-dock-barracks'),
  btnDockMarket: document.getElementById('btn-dock-market'),
  btnDockMap: document.getElementById('btn-dock-map'),
  btnAudioToggle: document.getElementById('btn-audio-toggle'),
  btnDungeonReturnTown: document.getElementById('btn-dungeon-return-town'),
  dungeonHudFragVal: document.getElementById('dungeon-hud-frag-val'),
  dungeonHudBoxVal: document.getElementById('dungeon-hud-box-val'),
  dungeonBadgeFrag: document.getElementById('dungeon-badge-frag'),
  dungeonBadgeBox: document.getElementById('dungeon-badge-box'),

  // Sağ Menü Paneli (Realm Sidebar)
  sidebarCharacterCard: document.getElementById('sidebar-character-card'),
  sidebarPlayerLevel: document.getElementById('sidebar-player-level'),
  sidebarStaminaText: document.getElementById('sidebar-stamina-text'),
  sidebarStaminaFill: document.getElementById('sidebar-stamina-fill'),
  sidebarAdAstraBalance: document.getElementById('sidebar-adastra-balance'),
  sidebarAvaxBalance: document.getElementById('sidebar-avax-balance'),
  sidebarFragmentRate: document.getElementById('sidebar-fragment-rate'),
  sidebarBoxRate: document.getElementById('sidebar-box-rate'),
  sideBtnInventory: document.getElementById('side-btn-inventory'),
  sideBtnWorkers: document.getElementById('side-btn-workers'),
  sideBtnBarracks: document.getElementById('side-btn-barracks'),
  sideBtnColosseum: document.getElementById('side-btn-colosseum'),
  sideBtnCollection: document.getElementById('side-btn-collection'),
  sideBtnBoxes: document.getElementById('side-btn-boxes'),
  sidebarBoxBadge: document.getElementById('sidebar-box-badge'),
  expFillIron: document.getElementById('exp-fill-iron'),
  expTimeIron: document.getElementById('exp-time-iron'),
  expFillWood: document.getElementById('exp-fill-wood'),
  expTimeWood: document.getElementById('exp-time-wood'),
  expFillWheat: document.getElementById('exp-fill-wheat'),
  expTimeWheat: document.getElementById('exp-time-wheat'),
  sidebarResetTimer: document.getElementById('sidebar-reset-timer'),
  toastContainer: document.getElementById('toast-container'),
  rpgModal: document.getElementById('rpg-modal'),
  modalTitle: document.getElementById('modal-title'),
  modalBody: document.getElementById('modal-body'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  loadingScreen: document.getElementById('loading-screen'),
  loadingBarFill: document.getElementById('loading-bar-fill'),
  loadingPercentage: document.getElementById('loading-percentage'),
  loadingQuote: document.getElementById('loading-quote')
};

// 🛡️ Kışla arayüzü (Ordu + Cephanelik)
const barracksUI = createBarracksUI({
  gameState, GAME_CONFIG, PLAYER_SKILLS,
  showToast: (...a) => showToast(...a),
  renderTopBar: () => renderTopBar(),
  reopen: (o) => openBarracksModal(o || {}),
  getSelected: () => selectedSoldierIndex, setSelected: (i) => { selectedSoldierIndex = i; },
  getTab: () => barracksActiveTab, setTab: (t) => { barracksActiveTab = t; },
  getEditing: () => editingSoldierNameIndex, setEditing: (i) => { editingSoldierNameIndex = i; },
  openScrapReport: (r) => openScrapReportModal(r)
});

// Modal Visibility Helper - Checks if ANY modal is currently open
function isAnyModalOpen() {
  const isRpg = dom.rpgModal && dom.rpgModal.classList.contains('active');
  const devModal = document.getElementById('dev-modal');
  const isDev = devModal && !devModal.classList.contains('hidden');
  return isRpg || isDev || document.body.classList.contains('modal-open');
}

let currentBattleInterval = null;

function displayModal() {
  if (dom.rpgModal) {
    dom.rpgModal.classList.add('active');
    document.body.classList.add('modal-open');
  }
}

function closeModal() {
  if (currentBattleInterval) {
    clearInterval(currentBattleInterval);
    currentBattleInterval = null;
  }
  if (dom.rpgModal) {
    dom.rpgModal.classList.remove('active');
  }
  const devModal = document.getElementById('dev-modal');
  const isDevOpen = devModal && !devModal.classList.contains('hidden');
  if (!isDevOpen) {
    document.body.classList.remove('modal-open');
  }
}

// Toast Bildirimi
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let icon = '✨';
  if (type === 'error') icon = '⚠️';

  // Mesaj DÜZ YAZI olarak konur (innerHTML değil): bildirimler başka oyuncuların adlarını içerebilir (savunma katmanı, A2.11)
  const iconEl = document.createElement('span'); iconEl.textContent = icon;
  const msgEl = document.createElement('span'); msgEl.textContent = String(message ?? '');
  toast.append(iconEl, ' ', msgEl);
  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// Cinematic Loading Bar - Pürüzsüz & Güvenilir Yükleme Akışı
function runCinematicLoadingSequence() {
  let progress = 0;
  const quotes = [
    'Zümrüt meşeler ve kadim ormanlar filizleniyor...',
    'Dağ madenleri ve derin demir damarları kazılıyor...',
    'Büyük Kolezyum ve gladyatör arenası kuruluyor...',
    'Zindan mağarası ve canavarlar uyanıyor...'
  ];

  let quoteIdx = 0;

  function updateProgress(newProgress) {
    if (!dom.loadingBarFill || !dom.loadingPercentage) return;
    progress = Math.max(progress, Math.min(Math.floor(newProgress), 99));
    dom.loadingBarFill.style.width = `${progress}%`;
    dom.loadingPercentage.innerText = `%${progress}`;

    if (progress > 30 && quoteIdx === 0 && dom.loadingQuote) { quoteIdx = 1; dom.loadingQuote.innerText = quotes[1]; }
    else if (progress > 60 && quoteIdx === 1 && dom.loadingQuote) { quoteIdx = 2; dom.loadingQuote.innerText = quotes[2]; }
    else if (progress > 85 && quoteIdx === 2 && dom.loadingQuote) { quoteIdx = 3; dom.loadingQuote.innerText = quotes[3]; }
  }

  // Smooth visual progress ticker
  const bootInterval = setInterval(() => {
    progress += Math.floor(Math.random() * 15) + 10;
    if (progress >= 90) {
      progress = 90;
      clearInterval(bootInterval);
    }
    updateProgress(progress);
  }, 100);

  window.__updateLoadingBar = updateProgress;

  function finishLoading() {
    clearInterval(bootInterval);
    if (dom.loadingBarFill) dom.loadingBarFill.style.width = '100%';
    if (dom.loadingPercentage) dom.loadingPercentage.innerText = '%100';
    setTimeout(() => {
      if (dom.loadingScreen) dom.loadingScreen.classList.add('hidden');
    }, 250);
  }

  window.__finishLoadingBar = finishLoading;

  // Güvenlik: Maksimum 1.2 saniye içinde her durumda ekranı aç
  setTimeout(() => {
    finishLoading();
  }, 1200);
}


// Top Bar Render
// 🚪 Kapı kuralı: bekleme sırasındaki ya da askıdaki hesaba üstte şerit (vatandaşa görünmez)
function renderGateBanner() {
  const el = document.getElementById('gate-banner');
  if (!el) return;
  const g = online.gate;
  if (!g || g.status === 'citizen' || g.status === 'new') { el.hidden = true; el.innerHTML = ''; return; }
  const k = online.kapi || {};
  const txt = g.status === 'waiting'
    ? `⏳ <strong>Bekleme sırasındasın: ${g.position || '?'}. sıra.</strong> Vadide şu an ${g.citizens}/${g.limit} vatandaş var. Gezebilir, her yere bakabilirsin; işlem yapmak için yerinin açılmasını bekle. Yerin açılınca e-posta ve oyun içi haber gelir. ${k.suspendDays || 30} gün girmeyen vatandaşın yeri sıradakine geçer.`
    : `⏸️ <strong>Yerin askıda.</strong> Uzun süre girmediğin için yerin bekleyen bir vatandaşa verildi. Hesabın duruyor; sıranın önündesin, ilk boşalan yer senin.`;
  el.innerHTML = `<span class="gate-banner-icon">🚪</span><span>${txt}</span>`;
  el.hidden = false;
}

// 🏷️ İlan pazarı (teçhizat; yalnız sunucuda): ilanlar sunucudan ayrıca çekilir, kabuk hemen çizilir
function renderIlanPazariShell() {
  if (!online.active) return `<div class="clean-card"><div class="card-title">🏷️ İlan Pazarı</div><div class="clean-desc">Oyuncular arası teçhizat satışı yalnız çevrimiçi sunucuda çalışır (bilgisayardaki deneme modunda kapalı).</div></div>`;
  return `<div class="clean-card" style="border-color:#f59e0b;"><div class="card-title-row"><div class="card-title" style="color:#fcd34d;">🏷️ İlan Pazarı — oyuncudan oyuncuya teçhizat</div><span class="card-badge">komisyon %2 · 7 gün · 10 ilan</span></div><div class="clean-desc">Cephanelik'teki bir eşyayı "Pazara koy" ile ilana verirsin; eşya ilanda bekler. Alıcı önce kilitli ASTRA'sından öder; satıcıya gelen paranın %80'i kilitli gelir. Komisyonun yarısı yakılır, yarısı kasalara gider. 7 günde satılmazsa eşya sana döner.</div><div id="ilan-pazari-body" style="margin-top:10px; color:#94a3b8; font-size:0.85rem;">Yükleniyor…</div></div>`;
}
async function loadIlanPazari() {
  const body = document.getElementById('ilan-pazari-body');
  if (!body || !online.active) return;
  let d;
  try { d = await pazar.list(); } catch (e) { body.textContent = 'İlanlar alınamadı: ' + e.message; return; }
  const left = ms => { const h = Math.max(0, Math.round(ms / 3600000)); return h >= 48 ? `${Math.floor(h / 24)} gün` : `${h} sa`; };
  const itemTxt = it => `${it.icon || '🛡️'} <strong>${it.name || 'Eşya'}</strong> sv.${it.level || 1} · ⚔️${it.atkBonus || 0} ❤️${it.hpBonus || 0} · dayanıklılık ${it.durability ?? '?'}/${it.maxDurability ?? '?'}`;
  const card = (l, btn) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 10px; background:rgba(255,255,255,.04); border-radius:8px; margin-bottom:6px; flex-wrap:wrap;"><div style="font-size:0.84rem;">${itemTxt(l.item)}<div style="font-size:0.75rem; color:#94a3b8;">${l.mine ? 'senin ilanın' : 'satıcı ' + String(l.seller).slice(0, 10) + '…'} · kalan ${left(l.expires - d.now)}</div></div><div style="display:flex; align-items:center; gap:8px;"><strong style="color:#facc15;">${fmt3(l.price)} ASTRA</strong>${btn}</div></div>`;
  const mine = (d.mine || []).map(l => card(l, `<button class="btn-clean btn-clean-outline btn-ilan-cancel" data-id="${l.id}" style="width:auto; padding:6px 10px; font-size:0.78rem;">↩️ Geri çek</button>`)).join('');
  const others = (d.listings || []).filter(l => !l.mine).map(l => card(l, `<button class="btn-clean btn-ilan-buy" data-id="${l.id}" data-price="${l.price}" data-name="${String(l.item.name || 'Eşya').replace(/"/g, '')}" style="width:auto; padding:6px 12px; font-size:0.8rem;">🛒 Satın al</button>`)).join('');
  body.innerHTML = `<div style="font-weight:800; color:#e2e8f0; margin-bottom:6px;">Senin ilanların (${(d.mine || []).length}/${d.maxListings})</div>${mine || '<div style="color:#64748b; margin-bottom:8px;">İlanın yok. Cephanelik\'te bir eşyanın yanındaki "Pazara koy" düğmesini kullan.</div>'}<div style="font-weight:800; color:#e2e8f0; margin:10px 0 6px;">Satıştakiler (${(d.listings || []).filter(l => !l.mine).length})</div>${others || '<div style="color:#64748b;">Şu an satışta eşya yok.</div>'}`;
}

function renderTopBar() {
  const state = gameState.state;
  dom.playerLevel.innerText = `Lv.${state.level}`;

  const maxStamina = gameState.getMaxStamina(state.level);
  const staminaInt = Math.floor(state.stamina);
  dom.staminaText.innerText = `${staminaInt}/${maxStamina}`;
  const stFill = document.getElementById('hud-stamina-fill');
  if (stFill) stFill.style.width = `${Math.max(0, Math.min(100, (staminaInt / Math.max(1, maxStamina)) * 100))}%`;

  // Dar ekranda büyük bakiye kısaltılır (1,97 Mn); tam değer ipucunda
  const fullBalance = state.adAstraBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const compactBalance = window.innerWidth <= 520 && state.adAstraBalance >= 100000;
  dom.adAstraBalance.innerText = compactBalance
    ? state.adAstraBalance.toLocaleString('tr-TR', { notation: 'compact', maximumFractionDigits: 2 })
    : fullBalance;
  if (dom.adAstraBalance.parentElement) {
    const lk = gameState.getLockedBalanceInfo();
    const f2 = v => v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
    dom.adAstraBalance.parentElement.title = `ASTRA bakiyen: ${fullBalance}\n🔓 Serbest: ${f2(lk.free)} · 🔒 Kilitli: ${f2(lk.locked)}`;
  }

  const siloCap = gameState.getWarehouseCapacity();
  const fmtRes = (v) => Math.floor(Number(v) || 0).toLocaleString('tr-TR');
  RES_KEYS().map(key => [key, document.getElementById('res-' + key)]).forEach(([key, el]) => {
    const cur = Number(state.inventory[key]) || 0;
    const cap = siloCap[key] || 0;
    if (el) el.innerText = fmtRes(cur);
    const capEl = document.getElementById(`res-cap-${key}`);
    if (capEl && cap > 0) {
      const pct = Math.max(0, Math.min(100, (cur / cap) * 100));
      capEl.style.width = `${pct}%`;
      capEl.parentElement.classList.toggle('is-full', pct >= 99.5);
      capEl.parentElement.classList.toggle('is-high', pct >= 80 && pct < 99.5);
      const pill = document.getElementById(`res-pill-${key}`);
      if (pill) pill.dataset.tip = `${fmtRes(cur)} / ${fmtRes(cap)} (silo %${Math.round(pct)})`;
    }
  });
  if (dom.resFragments) dom.resFragments.innerText = fmtRes(state.inventory.fragments);

  if (dom.sidebarBoxBadge) {
    const boxCount = state.lockedBoxes || 0;
    dom.sidebarBoxBadge.innerText = boxCount;
    dom.sidebarBoxBadge.classList.toggle('hidden', boxCount <= 0);
  }

  // 🤖 Üst Menü Canlı Bot Durumu Güncellemesi
  const topBotText = document.getElementById('top-bot-status-text');
  const topBotDot = document.getElementById('top-bot-indicator-dot');
  const topBotBtn = document.getElementById('btn-top-taverna-bot-status');
  if (topBotText && topBotDot) {
    const isPaused = gameState.isBotPaused();
    const isBotActive = gameState.isAutoCollectorActive();
    let botState = 'off';
    let botText = 'Bot: Kapalı';
    let botTip = 'Otomasyon botu kapalı — Tavernadan başlat';
    if (isPaused) {
      const prereq = gameState.checkBotPrerequisites();
      botState = 'paused';
      botText = 'Bot: Durdu';
      botTip = `Bot durdu, süresi donduruldu. Eksik: ${prereq.missingText || 'kaynak'}`;
    } else if (isBotActive) {
      const remText = gameState.getAutoCollectorRemainingText();
      botState = 'on';
      botText = `Bot · ${remText}`;
      botTip = `Bot çalışıyor, kalan süre: ${remText}`;
    }
    if (topBotText.innerText !== botText) topBotText.innerText = botText;
    if (topBotBtn) {
      topBotBtn.dataset.state = botState;
      topBotBtn.title = botTip;
    }
    document.querySelectorAll('#mobile-tabbar [data-tab="bot"]').forEach(b => { b.dataset.state = botState; });
  }

  // 🧙‍♂️ Akıllı Kral Danışmanı Canlı Güncellemesi
  updateRoyalAdvisorUI();

  renderRealmSidebar(state, maxStamina, staminaInt);

  // Zindandayken Canlı Ganimet Rozetlerini Güncel Tut
  if (document.body.classList.contains('in-dungeon')) {
    updateDungeonLiveDropRatesUI();
  }
}
window.renderHUD = renderTopBar;

// Akıllı Kral Danışmanı DOM Güncellemesi
function updateRoyalAdvisorUI() {
  const advisor = gameState.getRoyalAdvisorAdvice();
  const avatarEl = document.getElementById('advisor-avatar');
  const titleEl = document.getElementById('advisor-title');
  const textEl = document.getElementById('advisor-text');
  const actBtn = document.getElementById('btn-advisor-action');

  if (avatarEl) avatarEl.innerText = advisor.icon || '🧙‍♂️';
  if (titleEl) titleEl.innerText = advisor.title || 'Kralın Danışmanı';
  if (textEl) textEl.innerHTML = advisor.advice || '';
  if (actBtn) {
    actBtn.innerHTML = `<span>${advisor.actionLabel || '✨ İncele'}</span>`;
    actBtn.dataset.action = advisor.action || '';
  }
}

// =========================================================================
// SAĞ MENÜ PANELİ (REALM SIDEBAR) - KARAKTER KARTI & SEFER TAKİPÇİSİ
// =========================================================================
function formatCountdown(remainingSeconds) {
  const secs = Math.max(0, Math.ceil(remainingSeconds));
  const hh = Math.floor(secs / 3600);
  const mm = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
  const ss = (secs % 60).toString().padStart(2, '0');
  if (hh > 0) {
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

function renderExpeditionTracker(nodeId, fillEl, timeEl) {
  if (!fillEl || !timeEl) return false;
  const exp = gameState.state.activeExpeditions[nodeId];
  const cardEl = document.getElementById(`side-card-${nodeId}`);

  if (!exp) {
    fillEl.className = 'sidebar-exp-fill idle';
    fillEl.style.width = '0%';
    timeEl.innerText = 'BOŞTA';
    timeEl.className = 'sidebar-exp-time';
    if (cardEl) cardEl.classList.remove('is-ready');
    return false;
  }

  const pct = Math.min(100, Math.floor((exp.elapsedSeconds / exp.durationSeconds) * 100));
  fillEl.style.width = `${pct}%`;

  if (exp.isCompleted) {
    fillEl.className = 'sidebar-exp-fill done';
    timeEl.innerText = '✅ HAZIR';
    timeEl.className = 'sidebar-exp-time ready-text';
    if (cardEl) cardEl.classList.add('is-ready');
    return true;
  } else {
    fillEl.className = `sidebar-exp-fill ${nodeId}`;
    timeEl.innerText = formatCountdown(exp.durationSeconds - exp.elapsedSeconds);
    timeEl.className = 'sidebar-exp-time';
    if (cardEl) cardEl.classList.remove('is-ready');
    return false;
  }
}

function renderRealmSidebar(state, maxStamina, staminaInt) {
  // Kilitli bölümlerin yan menü düğmeleri soluk ve kilit simgeli görünür
  [['side-btn-barracks', 'barracks'], ['side-btn-dungeon', 'dungeon'], ['side-btn-colosseum', 'colosseum'], ['side-btn-carnival', 'carnival'], ['side-btn-market', 'market']].forEach(([id, zone]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const lock = gameState.getFeatureLock(zone);
    btn.classList.toggle('is-locked', !!lock);
    if (lock) btn.dataset.lock = lock.reason; else delete btn.dataset.lock;
  });
  if (dom.sidebarPlayerLevel) dom.sidebarPlayerLevel.innerText = `Lv.${state.level}`;

  // 1. Canlı Otomasyon Botu Rozeti
  const botPill = document.getElementById('sidebar-bot-pill');
  const botText = document.getElementById('sidebar-bot-status-text');
  if (botPill && botText) {
    const isPaused = gameState.isBotPaused();
    const isBotActive = gameState.isAutoCollectorActive();
    if (isPaused) {
      botPill.classList.remove('active');
      botPill.classList.add('paused');
      botText.innerText = '⏸️ Bot: Duraklatıldı';
      botText.style.color = '#fde047';
    } else if (isBotActive) {
      botPill.classList.add('active');
      botPill.classList.remove('paused');
      const remSec = gameState.getAutoCollectorRemainingSeconds();
      botText.innerText = `Bot: ${formatCountdown(remSec)}`;
      botText.style.color = '#4ade80';
    } else {
      botPill.classList.remove('active', 'paused');
      botText.innerText = 'Bot: Pasif';
      botText.style.color = '';
    }
  }

  // 2. Aktif Seferler & Tamamlanma Sayacı
  let readyCount = 0;
  for (const k of RES_KEYS()) {
    if (renderExpeditionTracker(k, document.getElementById(`exp-fill-${k}`), document.getElementById(`exp-time-${k}`))) readyCount++;
  }

  const sweepBtn = document.getElementById('side-btn-sweep-harvest');
  const readyBadge = document.getElementById('sidebar-exp-completed-count');
  if (readyBadge) {
    if (readyCount > 0) {
      readyBadge.classList.remove('hidden');
      readyBadge.innerText = `${readyCount} Hazır`;
    } else {
      readyBadge.classList.add('hidden');
    }
  }
  if (sweepBtn) {
    sweepBtn.disabled = (readyCount === 0);
    sweepBtn.innerHTML = readyCount > 0 ? `⚡ ${readyCount} BİTEN SEFERİ TOPLA` : '⚡ BİTEN TÜM SEFERLERİ TOPLA';
  }

  // 3. Kota özeti: çubuğun açık kısmı bugüne kadar açılan kota, dolu kısmı şu an çıkarılabilecek miktar
  // v2: kenar çubuğu kişisel Üretim Hakkı'nı gösterir (açık kısım bugüne kadar açılan hak, dolu kısım şu an alınabilir)
  for (const key of RES_KEYS()) {
    const hak = gameState.getUretimHakki(key);
    const base = hak.weekly || 1;
    const textEl = document.getElementById(`sidebar-limit-text-${key}`);
    const fillEl = document.getElementById(`sidebar-limit-fill-${key}`);
    const relEl = document.getElementById(`sidebar-limit-released-${key}`);
    if (textEl) textEl.innerText = `${fmtInt(hak.canTake)} / ${fmtInt(hak.weekly)}`;
    if (relEl) relEl.style.width = `${Math.min(100, (hak.released / base) * 100)}%`;
    if (fillEl) {
      fillEl.style.left = `${Math.min(100, (hak.used / base) * 100)}%`;
      fillEl.style.width = `${Math.min(100, (hak.canTake / base) * 100)}%`;
    }
  }
  if (dom.sidebarResetTimer) {
    const nextRel = globalPool.getResourceInfo(RES_KEYS()[0]).nextReleaseAt;
    dom.sidebarResetTimer.innerText = `⏳ +1 gün: ${formatDuration(nextRel - Date.now())}`;
  }
  const personalEl = document.getElementById('sidebar-personal-limits');
  if (personalEl) {
    const dun = gameState.getDungeonDayStatus();
    const lot = gameState.getLotteryStatus();
    const html = `
      <span class="spl-chip" title="Zindan: bugünkü harçsız ödüllü giriş">💀 ${dun.freeUsed}/${dun.freeTotal}</span>
      <span class="spl-chip" title="Piyango: bu hafta alınan bilet">🎟️ ${lot.boughtThisWeek}/${lot.maxPerWeek}</span>`;
    if (personalEl.innerHTML !== html) personalEl.innerHTML = html;
  }

  // 4. Kışla Yaralı Asker Rozeti
  const barracksBadge = document.getElementById('side-badge-barracks');
  if (barracksBadge) {
    const soldierList = Array.isArray(state.soldierUnits) ? state.soldierUnits : [];
    const injuredSoldiers = soldierList.filter(s => s && s.hp != null && s.maxHp != null && s.hp < s.maxHp).length;
    if (injuredSoldiers > 0) {
      barracksBadge.classList.remove('hidden');
      barracksBadge.innerText = `${injuredSoldiers} Yaralı`;
    } else {
      barracksBadge.classList.add('hidden');
    }
  }

  // 5. Sandık Rozeti
  const boxBadge = document.getElementById('sidebar-box-badge');
  if (boxBadge) {
    const boxCount = (state.inventory?.lootbox || 0) + (state.lockedBoxes || 0);
    if (boxCount > 0) {
      boxBadge.classList.remove('hidden');
      boxBadge.innerText = boxCount;
    } else {
      boxBadge.classList.add('hidden');
    }
  }

  // 6. Tüm Aletleri Onar Butonu Canlı Maliyet
  const repairAllBtn = document.getElementById('side-btn-repair-all');
  const repairCostLabel = document.getElementById('side-repair-all-cost');
  if (repairAllBtn && repairCostLabel) {
    const rCosts = gameState.getAllRepairCost();
    if (rCosts.count > 0) {
      repairAllBtn.disabled = false;
      repairCostLabel.innerText = `${rCosts.totalWood}🌲 ${rCosts.totalIron}⛏️ ${rCosts.totalAda}🟣`;
    } else {
      repairAllBtn.disabled = true;
      repairCostLabel.innerText = 'Tam Sağlam';
    }
  }
}

// =========================================================================
// ZİNDAN CANLI GANİMET (TEÇHİZAT PARÇASI & PANDORA KUTUSU) ORANLARI HUD'I
// =========================================================================
let currentActiveDungeonFloor = 1;

function updateDungeonLiveDropRatesUI(activeFloor) {
  if (typeof activeFloor === 'number' && activeFloor >= 1 && activeFloor <= 6) {
    currentActiveDungeonFloor = activeFloor;
  } else {
    const activeTab = document.querySelector('.floor-tab.active');
    if (activeTab && activeTab.dataset.floor) {
      currentActiveDungeonFloor = parseInt(activeTab.dataset.floor, 10) || 1;
    }
  }

  const fragValEl = dom.dungeonHudFragVal || document.getElementById('dungeon-hud-frag-val');
  const boxValEl = dom.dungeonHudBoxVal || document.getElementById('dungeon-hud-box-val');
  const fragBadgeEl = dom.dungeonBadgeFrag || document.getElementById('dungeon-badge-frag');
  const boxBadgeEl = dom.dungeonBadgeBox || document.getElementById('dungeon-badge-box');

  if (!fragValEl || !boxValEl) return;

  const curLvl = gameState.state.level || 1;
  const isBossFloor = (currentActiveDungeonFloor === 3 || currentActiveDungeonFloor === 6);
  const bossMultiplier = isBossFloor ? 2.0 : 1.0;

  const baseFragRate = gameState.getFragmentDropRate(curLvl);
  const baseBoxRate = gameState.getBoxDropRate(curLvl);

  const effectiveFragRate = baseFragRate * bossMultiplier;
  const effectiveBoxRate = baseBoxRate * bossMultiplier;

  const fragFormatted = gameState.formatDropChance(effectiveFragRate);
  const boxFormatted = gameState.formatDropChance(effectiveBoxRate);

  fragValEl.textContent = isBossFloor ? `${fragFormatted} 🔥 2x` : fragFormatted;
  boxValEl.textContent = isBossFloor ? `${boxFormatted} 🔥 2x` : boxFormatted;

  if (fragBadgeEl) {
    fragBadgeEl.classList.toggle('boss-active', isBossFloor);
    fragBadgeEl.title = isBossFloor
      ? `Boss Katı Şansı (+%100 Artış!): %${(baseFragRate * 100).toFixed(3)} ➜ %${(effectiveFragRate * 100).toFixed(3)}`
      : `Zindan Parça Düşürme Şansı: ${fragFormatted} (Lv.${curLvl})`;
  }
  if (boxBadgeEl) {
    boxBadgeEl.classList.toggle('boss-active', isBossFloor);
    boxBadgeEl.title = isBossFloor
      ? `Boss Katı Şansı (+%100 Artış!): %${(baseBoxRate * 100).toFixed(5)} ➜ %${(effectiveBoxRate * 100).toFixed(5)}`
      : `Zindan Pandora Kutusu Düşürme Şansı: ${boxFormatted} (Lv.${curLvl})`;
  }
}

// Zindan Mağarasına Geçiş (Sağ Menü Kısayolu & Kolezyum Modalı Ortak Kullanır)
// 🔓 v1.25: Kilitli bir bölüm açılmak istenirse neden kilitli olduğu söylenir ve açılmaz
function featureGate(zoneId) {
  const lock = gameState.getFeatureLock(zoneId);
  if (!lock) return true;
  showToast(`🔒 ${lock.name} henüz kapalı: ${lock.reason}`, 'info');
  return false;
}
window.addEventListener('feature-locked', (e) => featureGate(e.detail && e.detail.zoneId));

function enterDungeonScene() {
  if (!featureGate('dungeon')) return;
  closeModal();
  if (phaserGame && phaserGame.scene) {
    if (phaserGame.scene.isActive('GrandTownScene')) {
      phaserGame.scene.stop('GrandTownScene');
    }
    if (window.__vadi3d) window.__vadi3d.hide();   // 3B vadi gizlenir, zindan (Phaser) görünür
    phaserGame.scene.start('DungeonScene');

    // Üst şerit menüyü Zindan Menüsüyle değiştir & hammadde pillerini gizle
    document.body.classList.add('in-dungeon');
    const topNavMenu = document.querySelector('.top-nav-menu');
    const floorBar = document.getElementById('dungeon-floor-bar');
    if (topNavMenu) topNavMenu.classList.add('hidden');
    if (floorBar) floorBar.classList.remove('hidden');

    // Canlı ganimet oranlarını güncelle
    updateDungeonLiveDropRatesUI(currentActiveDungeonFloor || 1);
  }
}

// Zindandan Kasaba Meydanına Temiz Dönüş (Kat Barı Butonu & Alt Menü Kısayolu Ortak Kullanır)
function returnToTown() {
  if (!(phaserGame && phaserGame.scene)) return;
  if (phaserGame.scene.isActive('DungeonScene')) {
    phaserGame.scene.stop('DungeonScene');
  }
  if (window.__vadi3d) window.__vadi3d.show();
  else phaserGame.scene.start('GrandTownScene');

  // Üst şerit menüyü Kasaba Menüsüne geri döndür
  document.body.classList.remove('in-dungeon');
  const topNavMenu = document.querySelector('.top-nav-menu');
  const floorBar = document.getElementById('dungeon-floor-bar');
  if (topNavMenu) topNavMenu.classList.remove('hidden');
  if (floorBar) floorBar.classList.add('hidden');

  showToast('🏰 Kasaba meydanına dönüldü!', 'info');
}

window.addEventListener('enter-dungeon-view', () => {
  enterDungeonScene();
});

// =========================================================================
// 1. KOTA VE SINIRLAR PANELİ (haftalık kota, günlük açılan kota, kişisel sınırlar)
// =========================================================================
// Kayıt kurtarma ve yazma hatalarını oyuncuya bildir (her hata türü oturumda bir kez)
const reportedStorageIssues = new Set();
function reportStorageEvents() {
  for (const ev of consumeStorageEvents()) {
    if (reportedStorageIssues.has(ev.type + ev.key)) continue;
    reportedStorageIssues.add(ev.type + ev.key);
    if (ev.type === 'recovered') {
      showToast(`💾 Kayıt dosyası okunamadı; oyun son sağlam yedekten açıldı. Bozuk kopya "${ev.key}${CORRUPT_SUFFIX}" adıyla saklandı.`, 'warning');
    } else if (ev.type === 'lost') {
      showToast(`⚠️ Kayıt dosyası okunamadı ve yedek bulunamadı; oyun yeni profille açıldı. Bozuk kopya "${ev.key}${CORRUPT_SUFFIX}" adıyla saklandı.`, 'error');
    } else if (ev.type === 'write-failed') {
      showToast('⚠️ İlerleme kaydedilemedi: tarayıcının depolama alanı dolu olabilir.', 'error');
    }
  }
}

// Panel açıkken sayaçlar saniyede bir güncellenir (kaydırma konumu korunur)
function refreshQuotaTrackerUI() {
  const el = dom.modalBody && dom.modalBody.querySelector('.quota-tracker');
  if (!el) return;
  const scroll = dom.modalBody.scrollTop;
  dom.modalBody.innerHTML = renderQuotaTracker({ gameState, globalPool, config: GAME_CONFIG });
  dom.modalBody.scrollTop = scroll;
}

function openDailyLimitsModal() {
  dom.modalTitle.innerHTML = `<span>📊</span> <span>KOTA VE SINIRLAR</span>`;
  dom.modalBody.innerHTML = renderQuotaTracker({ gameState, globalPool, config: GAME_CONFIG });
  displayModal();
}

let economyActiveTab = 'overview';
let simPlayerCount = 500;
let simDays = 30;
let simResults = null;

// =========================================================================
// 1.5 📊 EKONOMİK DENGE, 10B MAKRO TOKENOMICS & CANLI SİMÜLATÖR PANELİ
// =========================================================================
function openEconomyDashboardModal(tab = economyActiveTab) {
  economyActiveTab = tab;
  dom.modalTitle.innerHTML = `<span>📈</span> <span>EKONOMİK DENGE, 10B TOKENOMICS & SİMÜLATÖR</span>`;

  const poolState = globalPool.state;
  const treasury = poolState.treasury || { dungeon: 0, ammBuyback: 0, arena: 0, staking: 0 };
  const metrics = globalPool.getEconomicHealthMetrics();

  const tabsHtml = `
    <div class="phase2-tab-row">
      <button class="phase2-tab-btn economy-tab-btn ${economyActiveTab === 'overview' ? 'active' : ''}" data-tab="overview">🌐 10B Tokenomics & Hazine</button>
      <button class="phase2-tab-btn economy-tab-btn ${economyActiveTab === 'health' ? 'active' : ''}" data-tab="health">🩺 Canlı Denge Metrikleri</button>
      <button class="phase2-tab-btn economy-tab-btn ${economyActiveTab === 'simulator' ? 'active' : ''}" data-tab="simulator">🎮 Makro Simülatör</button>
    </div>
  `;

  let contentHtml = '';

  if (economyActiveTab === 'overview') {
    contentHtml = `
      <div class="clean-card" style="border-color: #c084fc; background: #160e1c;">
        <div class="card-title-row">
          <div class="card-title">🟣 ASTRA Avalanche C-Chain Tokenomics</div>
          <span class="card-badge" style="color: #4ade80;">10 Milyar Sabit Arz</span>
        </div>
        <div style="font-size: 0.8rem; color: #cbd5e1; word-break: break-all; margin-top: 4px; background: #0e0712; padding: 6px 10px; border-radius: 6px; border: 1px solid #581c87;">
          Kontrat: <strong style="color: #e9d5ff;">${globalPool.state.contractAddress}</strong>
        </div>
      </div>

      <!-- Yakım & Hazine 2'li Kolon -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div class="clean-card" style="border-color: #ef4444; background: #1a0a0a;">
          <div style="font-size: 0.82rem; color: #fca5a5; font-weight: 700;">🔥 Toplam Kalıcı Yakım (%18)</div>
          <div style="font-size: 1.25rem; font-weight: 800; color: #f87171; margin-top: 4px;">
            ${Math.floor(poolState.totalBurned).toLocaleString('tr-TR')} ASTRA
          </div>
          <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 2px;">Ebediyen dolaşımdan çıkarıldı</div>
        </div>

        <div class="clean-card" style="border-color: #38bdf8; background: #081520;">
          <div style="font-size: 0.82rem; color: #7dd3fc; font-weight: 700;">💎 Toplam Hazine Kasası (%82)</div>
          <div style="font-size: 1.25rem; font-weight: 800; color: #38bdf8; margin-top: 4px;">
            ${Math.floor(poolState.totalTreasury).toLocaleString('tr-TR')} ASTRA
          </div>
          <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 2px;">4 kolda ekosisteme dağıtılıyor</div>
        </div>
      </div>

      <!-- %82 Hazine Alt Dağılımı -->
      <div class="clean-card">
        <div class="card-title">💎 %82 Hazine & Ödül Havuzları Alt Dağılımı</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
          
          <div style="background: #151a26; padding: 10px; border-radius: 8px; border: 1px solid #583007;">
            <div style="display: flex; justify-content: space-between; font-size: 0.82rem;">
              <span style="color: #f87171; font-weight: 700;">🏰 Zindan & Bosslar (%35)</span>
            </div>
            <div style="font-size: 1.05rem; font-weight: 800; color: #fca5a5; margin-top: 2px;">
              ${Math.floor(treasury.dungeon).toLocaleString('tr-TR')} ASTRA
            </div>
            <div style="font-size: 0.72rem; color: #94a3b8;">PvE canavar ve boss ödülleri</div>
          </div>

          <div style="background: #151a26; padding: 10px; border-radius: 8px; border: 1px solid #583007;">
            <div style="display: flex; justify-content: space-between; font-size: 0.82rem;">
              <span style="color: #38bdf8; font-weight: 700;">💧 AMM DEX Geri Alım (%30)</span>
            </div>
            <div style="font-size: 1.05rem; font-weight: 800; color: #7dd3fc; margin-top: 2px;">
              ${Math.floor(treasury.ammBuyback).toLocaleString('tr-TR')} ASTRA
            </div>
            <div style="font-size: 0.72rem; color: #94a3b8;">DEX fiyat tabanı & likidite desteği</div>
          </div>

          <div style="background: #151a26; padding: 10px; border-radius: 8px; border: 1px solid #583007;">
            <div style="display: flex; justify-content: space-between; font-size: 0.82rem;">
              <span style="color: #facc15; font-weight: 700;">🏟️ Kolezyum Arena (%25)</span>
            </div>
            <div style="font-size: 1.05rem; font-weight: 800; color: #fde047; margin-top: 2px;">
              ${Math.floor(treasury.arena).toLocaleString('tr-TR')} ASTRA
            </div>
            <div style="font-size: 0.72rem; color: #94a3b8;">18v18 gladyatör şampiyonluk havuzu</div>
          </div>

          <div style="background: #151a26; padding: 10px; border-radius: 8px; border: 1px solid #583007;">
            <div style="display: flex; justify-content: space-between; font-size: 0.82rem;">
              <span style="color: #c084fc; font-weight: 700;">🔒 Staking Rezervi (%10)</span>
            </div>
            <div style="font-size: 1.05rem; font-weight: 800; color: #e9d5ff; margin-top: 2px;">
              ${Math.floor(treasury.staking).toLocaleString('tr-TR')} ASTRA
            </div>
            <div style="font-size: 0.72rem; color: #94a3b8;">%8-12 APY pasif kilitli getiri</div>
          </div>

        </div>
      </div>

      <!-- Dış Likidite Enjeksiyonu -->
      <div class="clean-card" style="border-color: #22c55e; background: #0c1a0e;">
        <div class="card-title-row">
          <div class="card-title" style="color: #4ade80;">📺 Avalanche Arena Yayın Geliri Buyback Desteği</div>
          <span class="card-badge" style="color: #4ade80;">%35 Gelir Enjeksiyonu</span>
        </div>
        <div style="font-size: 0.85rem; color: #cbd5e1; margin-top: 4px;">
          AlphAvax yayınlarından gelen gelirin <strong>%35'i</strong> ile DEX'ten açık piyasadan token satın alınır; %50'si yakılır, %50'si AMM likiditesine kilitlenir.
        </div>
        <div style="font-size: 1.1rem; font-weight: 800; color: #4ade80; margin-top: 6px;">
          Aktif Buyback Hacmi: ${Math.floor(poolState.buybackFromBroadcasting).toLocaleString('tr-TR')} ASTRA
        </div>
      </div>
    `;
  } else if (economyActiveTab === 'health') {
    contentHtml = `
      <div class="clean-card">
        <div class="card-title-row">
          <div class="card-title">🩺 DeepSeek R1 Master Ekonomik Denge Denetleyicisi</div>
          <span class="card-badge" style="color: ${metrics.statusBadgeColor};">${metrics.statusText}</span>
        </div>
        <div class="clean-desc">
          Tüm kaynakların üretim (musluk) ve tüketim (lavabo) oranları anlık olarak diferansiyel denklemlerle denetlenmektedir.
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <!-- E_net -->
        <div class="clean-card" style="padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 0.95rem; font-weight: 800; color: #c084fc;">🪙 Net Token Emisyon Katsayısı (E_net ≤ 0)</div>
              <div style="font-size: 0.78rem; color: #94a3b8;">Harcanan tokenlerin yakım hızı ödül dağıtım hızından yüksektir.</div>
            </div>
            <span class="card-badge" style="color: #22c55e; font-size: 0.95rem;">${metrics.E_net} (Deflasyonist)</span>
          </div>
        </div>

        <!-- Sigma Wheat -->
        <div class="clean-card" style="padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 0.95rem; font-weight: 800; color: #facc15;">🌾 Buğday Biyolojik Tüketim Oranı (Σ ≥ 1.00)</div>
              <div style="font-size: 0.78rem; color: #94a3b8;">Ordunun 18 dakikada bir iyileşmesi ve stamina doldurma tüketimi.</div>
            </div>
            <span class="card-badge" style="color: #22c55e; font-size: 0.95rem;">${metrics.sigmaWheat} (Dengede)</span>
          </div>
        </div>

        <!-- Sigma Iron & Wood -->
        <div class="clean-card" style="padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 0.95rem; font-weight: 800; color: #38bdf8;">⛏️ Demir & 🌲 Odun Aşınma Oranı (Σ ≥ 1.00)</div>
              <div style="font-size: 0.78rem; color: #94a3b8;">3 Alet tamiri ve 5 Parça 13/13 Ekipman dövme tüketimi.</div>
            </div>
            <span class="card-badge" style="color: #22c55e; font-size: 0.95rem;">${metrics.sigmaIron} (Dengede)</span>
          </div>
        </div>
      </div>
    `;
  } else if (economyActiveTab === 'simulator') {
    if (!simResults) {
      simResults = globalPool.simulateMacroEconomy(simPlayerCount, simDays);
    }

    const simTableRows = simResults.slice(0, 10).map(r => `
      <tr style="border-bottom: 1px solid #38200f; font-size: 0.78rem; text-align: center;">
        <td style="padding: 6px; font-weight: 700; color: #facc15;">Gün ${r.day}</td>
        <td style="padding: 6px; color: #38bdf8;">${r.activePlayers}</td>
        <td style="padding: 6px; color: #cbd5e1;">${r.dailySpend.toLocaleString('tr-TR')} ASTRA</td>
        <td style="padding: 6px; color: #f87171; font-weight: 700;">-${r.dailyBurn.toLocaleString('tr-TR')} ASTRA</td>
        <td style="padding: 6px; color: #4ade80;">${r.dungeonVault.toLocaleString('tr-TR')} ASTRA</td>
        <td style="padding: 6px; color: #c084fc;">${(r.circulatingSupply / 1000000).toFixed(2)}M</td>
      </tr>
    `).join('');

    contentHtml = `
      <div class="clean-card">
        <div class="card-title">🎮 Makro Ekonomi Projeksiyon Simülatörü</div>
        <div class="clean-desc">
          Farklı aktif oyuncu kitleleri ve zaman dilimlerinde ASTRA yakımını, hazine büyümesini ve dolaşım arzını canlı simüle et.
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: flex-end; margin-top: 10px;">
          <div>
            <label style="font-size: 0.8rem; color: #94a3b8; font-weight: 700;">Aktif Oyuncu (DAU):</label>
            <input type="number" id="sim-input-players" value="${simPlayerCount}" min="10" max="100000" class="amm-number-input" style="width: 100%; margin-top: 4px;" />
          </div>
          <div>
            <label style="font-size: 0.8rem; color: #94a3b8; font-weight: 700;">Simülasyon Süresi (Gün):</label>
            <select id="sim-input-days" class="amm-number-input" style="width: 100%; margin-top: 4px;">
              <option value="7" ${simDays === 7 ? 'selected' : ''}>7 Gün</option>
              <option value="30" ${simDays === 30 ? 'selected' : ''}>30 Gün (1 Ay)</option>
              <option value="90" ${simDays === 90 ? 'selected' : ''}>90 Gün (1 Sezon)</option>
              <option value="365" ${simDays === 365 ? 'selected' : ''}>365 Gün (1 Yıl)</option>
            </select>
          </div>
          <button id="btn-run-simulation" class="btn-clean btn-clean-green" style="padding: 10px 16px; font-size: 0.85rem; height: 38px;">
            ▶️ ÇALIŞTIR
          </button>
        </div>
      </div>

      <div class="clean-card" style="padding: 8px;">
        <div style="font-weight: 800; font-size: 0.85rem; color: #facc15; margin-bottom: 6px;">📋 ${simDays} Günlük Simülasyon Sonuç Tablosu (İlk 10 Gün)</div>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #151a26; font-size: 0.75rem; color: #94a3b8; border-bottom: 2px solid #583007;">
                <th style="padding: 6px;">Gün</th>
                <th style="padding: 6px;">Aktif</th>
                <th style="padding: 6px;">Harcama</th>
                <th style="padding: 6px;">Yakılan (%18)</th>
                <th style="padding: 6px;">Zindan Kasası</th>
                <th style="padding: 6px;">Kalan Arz</th>
              </tr>
            </thead>
            <tbody>
              ${simTableRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  dom.modalBody.innerHTML = `${tabsHtml}${contentHtml}`;
  displayModal();
}

// =========================================================================
// 2. SİLO / DEPO & KARAKTER GELİŞİMİ MENÜLERİ
// =========================================================================
function openWarehouseModal() {
  const state = gameState.state;
  dom.modalTitle.innerHTML = `<span>📦</span> <span>KRALLIK SİLO & DEPO YÖNETİMİ</span>`;

  const wood = state.inventory.wood || 0;
  const iron = state.inventory.iron || 0;
  const wheat = state.inventory.wheat || 0;
  const adAstra = state.adAstraBalance || 0;
  const RK = RES_KEYS(), RM = RES_META();
  const inv = k => Math.floor(Number(state.inventory[k]) || 0);

  const cap = gameState.getWarehouseCapacity();
  const cost = gameState.getWarehouseUpgradeCost();

  let upgradeSection = '';
  if (cost) {
    const is80 = cost.is80PercentFull;
    const canAfford = cost.canAffordCost;

    let buttonHtml = '';
    if (!is80) {
      buttonHtml = `
        <button id="btn-modal-upgrade-warehouse" class="btn-clean" disabled style="margin-top: 12px; width: 100%; font-size: 0.95rem; padding: 13px; font-weight: 800; background: #3b1404; color: #f59e0b; border: 1px solid #78350f; cursor: not-allowed;">
          ⚠️ TÜM KAYNAK DEPOLARI EN AZ %80 DOLU OLMALIDIR
        </button>
      `;
    } else if (!canAfford) {
      buttonHtml = `
        <button id="btn-modal-upgrade-warehouse" class="btn-clean" disabled style="margin-top: 12px; width: 100%; font-size: 0.95rem; padding: 13px; font-weight: 800; background: #450a0a; color: #f87171; border: 1px solid #7f1d1d; cursor: not-allowed;">
          ⚠️ YETERSİZ KAYNAK VEYA ASTRA BAKİYESİ
        </button>
      `;
    } else {
      buttonHtml = `
        <button id="btn-modal-upgrade-warehouse" class="btn-clean btn-clean-green" style="margin-top: 12px; width: 100%; font-size: 1.05rem; padding: 13px; font-weight: 800;">
          🔨 SİLOYU SEVİYE ${cost.nextLevel}'E YÜKSELT
        </button>
      `;
    }

    upgradeSection = `
      <!-- %80 Doluluk Ön Koşulu -->
      <div style="background: #151a26; padding: 12px; border-radius: 8px; border: 1px solid ${is80 ? '#22c55e' : '#f59e0b'}; margin-top: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="color: #fde047; font-weight: 800; font-size: 0.9rem;">📋 Yükseltme Ön Koşulu: En Az %80 Doluluk</span>
          <span style="font-size: 0.8rem; font-weight: 700; color: ${is80 ? '#4ade80' : '#f59e0b'};">${is80 ? '✅ KOŞUL SAĞLANDI' : '⚠️ DOLULUK BEKLENİYOR'}</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; font-size: 0.82rem;">
          ${cost.keys.map(k => `<div style="color: ${cost.fillOk[k] ? '#4ade80' : '#f87171'}; font-weight: 700;">${(RM[k] || {}).icon || ''} ${inv(k)}/${cost.fills[k]} (%80) ${cost.fillOk[k] ? '✅' : '❌'}</div>`).join('')}
        </div>
      </div>

      <!-- Yükseltme Maliyeti (Kapasitenin %50'si + Anlık DEX Pazar ASTRA Değeri) -->
      <div style="background: #151a26; padding: 12px; border-radius: 8px; border: 1px solid #583007; margin-top: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="color: #cbd5e1; font-weight: 800; font-size: 0.9rem;">Seviye ${cost.nextLevel} Yükseltme Maliyeti:</span>
          <span style="font-size: 0.74rem; color: #a78bfa; background: #2e1065; padding: 2px 8px; border-radius: 6px; border: 1px solid #7c3aed; font-weight: 700;">
            🤖 AMM DEX Canlı Bot: Anlık Değer
          </span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.88rem;">
          ${cost.keys.map(k => `<div style="color: ${inv(k) >= cost.costs[k] ? '#4ade80' : '#f87171'}; font-weight: 700;">${(RM[k] || {}).icon || ''} ${inv(k)}/${cost.costs[k]} ${(RM[k] || {}).name || k}</div>`).join('')}
          <div style="color: ${adAstra >= cost.adAstra ? '#4ade80' : '#f87171'}; font-weight: 700;" id="live-warehouse-ada-cost">
            🟣 <span id="val-warehouse-ada-cur">${adAstra.toFixed(1)}</span> / <span id="val-warehouse-ada-req">${cost.adAstra.toLocaleString('tr-TR')}</span> ASTRA
          </div>
        </div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #3e2205; font-size: 0.78rem; color: #94a3b8; display: flex; justify-content: space-between; align-items: center;">
          <span>Yeni Kapasiteler (Lv.${cost.nextLevel}): <strong style="color: #fde047;">${cost.keys.map(k => `${(RM[k] || {}).icon || ''} ${cost.nextCap[k]}`).join(' | ')}</strong></span>
          <span style="color: #a78bfa; font-size: 0.74rem;">⚡ Saniye başı AMM güncellenir</span>
        </div>
      </div>

      ${quickBuyHtml('warehouse')}
      ${buttonHtml}
    `;
  } else {
    upgradeSection = `<div style="text-align: center; color: #facc15; margin-top: 12px; font-weight: 800; font-size: 0.95rem;">✅ Silo bu sürümdeki en üst seviyede (Seviye ${state.warehouseLevel}; 13. seviye ve üstü Universe açılınca)</div>`;
  }

  dom.modalBody.innerHTML = `
    <div class="clean-card" style="border-color: #ca8a04; background: #181109; padding: 16px;">
      <div class="card-title-row">
        <div class="card-title" style="font-size: 1.1rem; color: #fde047;">📦 Silo & Depo (Seviye ${state.warehouseLevel})</div>
        <span style="font-size: 0.85rem; color: #fde047; font-weight: 700;">Kapasite Yönetimi</span>
      </div>
      
      <div class="clean-desc" style="margin-bottom: 12px;">
        Depo seviyeni yükselterek 6 hammaddenin stok kapasitesini artırabilirsin. Siloyu yükseltmek için <strong>tüm depolar en az %80 dolu</strong> olmalı ve kapasitenin <strong>%50'si + anlık pazar değeri kadar ASTRA</strong> harcanır.
      </div>

      <div class="inv-grid" style="gap: 10px; margin-top: 8px;">
        ${RK.map(k => { const mm = RM[k] || {}; const c = cap[k] || 1; const v = inv(k); const pct = Math.min(100, (v / c) * 100); return `
        <div style="background: #151a26; padding: 12px; border-radius: 8px; border: 1px solid #583007;">
          <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 6px; font-weight: 700;"><span style="display:inline-block;width:20px;height:20px;vertical-align:-5px;margin-right:4px;">${resImg(k, mm.icon || '', 'width:20px;height:20px;')}</span>${mm.name || k} Silosu (%${Math.round(pct)})</div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="flex: 1; height: 18px; background: #0c1018; border-radius: 4px; border: 1px solid #583007; overflow: hidden;">
              <div style="height: 100%; background: ${mm.color || '#94a3b8'}; width: ${pct}%;"></div>
            </div>
            <span style="font-weight: 800; color: ${mm.color || '#94a3b8'}; min-width: 80px; text-align: right;">${v}/${c}</span>
          </div>
        </div>`; }).join('')}
      </div>

      ${upgradeSection}
    </div>
  `;

  displayModal();
}

// ⚡ Hızlı al: seviye atlama / silo yükseltme için eksik hammaddeleri pazardan alır (ADA yetiyorsa)
function quickBuyHtml(kind) {
  const plan = gameState.getQuickBuyPlan(kind);
  if (!plan.items.length) return '';
  const list = plan.items.map(i => `${i.qty.toLocaleString('tr-TR')} ${i.name}`).join(' · ');
  return `
    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; background:#0f172a; border:1px dashed #4ade80; border-radius:8px; padding:9px 12px; margin:8px 0;">
      <div style="font-size:0.8rem; color:#cbd5e1; line-height:1.45;">
        <strong style="color:#86efac;">Eksikler:</strong> ${list} <span style="color:#94a3b8;">· pazardan ~${Math.ceil(plan.total).toLocaleString('tr-TR')} ASTRA</span>
        ${plan.capBlocked ? '<br><span style="color:#fbbf24;">Siloda yer yetmediği için bir kısmı alınamıyor.</span>' : ''}
        ${!plan.ok && plan.reason ? `<br><span style="color:#fca5a5;">${plan.reason}</span>` : ''}
      </div>
      <button class="btn-clean btn-quick-buy" data-kind="${kind}" ${plan.ok ? '' : 'disabled'} style="width:auto; padding:8px 14px; font-size:0.85rem; font-weight:800; background:#15803d; border-color:#4ade80; color:#fff;">
        ⚡ Hızlı al
      </button>
    </div>`;
}

// 📊 v1.25: Seviye atlamanın somut faydası — şimdiki ve sonraki seviye yan yana
function renderLevelBenefitTable(level) {
  const maxLvl = GAME_CONFIG.MAX_PLAYER_LEVEL || 81;
  if (level >= maxLvl) return '';
  const a = gameState.getLevelBenefits(level);
  const b = gameState.getLevelBenefits(level + 1);
  const pct = (x) => `%${(x * 100).toFixed(x < 0.01 ? 3 : 2)}`;
  const saving = a.wheatPer1000 > 0 ? Math.round((1 - b.wheatPer1000 / a.wheatPer1000) * 1000) / 10 : 0;
  const row = (label, cur, next, good = true, note = '') => `
    <div class="lb-row">
      <span class="lb-label">${label}</span>
      <span class="lb-cur">${cur}</span>
      <span class="lb-arrow">→</span>
      <span class="lb-next ${good ? 'is-good' : ''}">${next}${note ? ` <em>${note}</em>` : ''}</span>
    </div>`;
  return `
    <div class="level-benefit-card">
      <div class="lb-title">⭐ Seviye ${level + 1}'e çıkınca ne kazanırsın?</div>
      ${row('🏭 Üretim bonusu (dakikada)', `+%${a.productionBonusPct}`, `+%${b.productionBonusPct}`)}
      ${row('🌾 1.000 hammadde için stamina buğdayı', `${Math.round(a.wheatPer1000).toLocaleString('tr-TR')}`, `${Math.round(b.wheatPer1000).toLocaleString('tr-TR')}`, true, saving > 0 ? `%${String(saving).replace('.', ',')} tasarruf` : '')}
      ${row('⚡ Maksimum stamina', a.maxStamina.toLocaleString('tr-TR'), b.maxStamina.toLocaleString('tr-TR'))}
      ${row('⏳ Sefer süresi', `${a.expeditionHours} sa`, `${b.expeditionHours} sa`, true, 'daha az tıklama')}
      ${row('🧩 Zindan parça şansı', pct(a.fragmentRate), pct(b.fragmentRate))}
      ${row('🏛️ Haftalık UBI payı', a.ubiEligible ? `×${a.ubiWeight}` : 'yok (Sv.3+)', b.ubiEligible ? `×${b.ubiWeight}` : 'yok (Sv.3+)')}
    </div>`;
}

function openInventoryModal() {
  const state = gameState.state;
  dom.modalTitle.innerHTML = `<span>🧙‍♂️</span> <span>KARAKTER GELİŞİMİ & ENVANTER</span>`;

  const wood = state.inventory.wood || 0;
  const iron = state.inventory.iron || 0;
  const wheat = state.inventory.wheat || 0;
  const adAstra = state.adAstraBalance || 0;
  const currentDuration = gameState.getExpeditionDurationHours();

  const req = gameState.getNextLevelRequirement();
  const maxStamina = gameState.getMaxStamina();

  const axeCost = gameState.calculateRepairCost('axe') || { woodCost: 0, ironCost: 0, adAstraCost: 0, missingDurability: 0 };
  const pickaxeCost = gameState.calculateRepairCost('pickaxe') || { woodCost: 0, ironCost: 0, adAstraCost: 0, missingDurability: 0 };
  const sickleCost = gameState.calculateRepairCost('sickle') || { woodCost: 0, ironCost: 0, adAstraCost: 0, missingDurability: 0 };

  const axe = state.tools.axe || { durability: 4320 };
  const pickaxe = state.tools.pickaxe || { durability: 4320 };
  const sickle = state.tools.sickle || { durability: 4320 };

  const scrollHeal = state.inventory.scroll_heal || 0;
  const scrollStamina = state.inventory.scroll_stamina || 0;
  const wheelShards = state.wheelTicketShards || 0;
  const lotteryTickets = state.lotteryTickets || 0;
  const arenaKeys = state.arenaKeys || 0;

  const ubiInfo = globalPool.getUbiPoolInfo(state.level || 1, state.lastClaimedUbiEpoch || 0);

  dom.modalBody.innerHTML = `
    <!-- Karakter Seviye Atlama Kartı -->
    <div class="clean-card" style="border-color: #facc15; background: #1c140c;">
      <div class="card-title-row">
        <div class="card-title">👑 Seviye ${state.level} AlphAvax Gezgini</div>
        <div class="card-badge" style="color: #fde047;">Sefer Süresi: ${currentDuration} Saat</div>
      </div>
      
      <!-- Anlık Hesap Zindan Ganimet Oranları Rozetleri -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0 10px 0;">
        <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 8px; padding: 7px 10px; display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 0.8rem; color: #93c5fd; font-weight: 700; display: flex; align-items: center; gap: 4px;">
            <span>🧩</span> Teçhizat Parçası Şansı:
          </span>
          <span style="font-size: 0.88rem; color: #38bdf8; font-weight: 800;">${req.curFragRateFormatted}</span>
        </div>
        <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(192, 132, 252, 0.4); border-radius: 8px; padding: 7px 10px; display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 0.8rem; color: #e9d5ff; font-weight: 700; display: flex; align-items: center; gap: 4px;">
            <span>📦</span> Pandora Kutusu Şansı:
          </span>
          <span style="font-size: 0.88rem; color: #c084fc; font-weight: 800;">${req.curBoxRateFormatted}</span>
        </div>
      </div>

      <div class="clean-desc" style="line-height: 1.5; margin-bottom: 10px;">
        Seviye atladığında sefer süren <strong>${req.durationHours} Saate</strong> ve Maksimum Staminan <strong>${gameState.getMaxStamina(state.level + 1)} ⚡'ya</strong> çıkar!<br>
        Zindan ganimet şansın: 🧩 Teçhizat Parçası <strong>${req.curFragRateFormatted} ➜ <span style="color: #4ade80;">${req.nextFragRateFormatted}</span></strong>, 📦 Pandora Kutusu <strong>${req.curBoxRateFormatted} ➜ <span style="color: #c084fc;">${req.nextBoxRateFormatted}</span></strong> seviyesine yükselir!
      </div>

      ${renderLevelBenefitTable(state.level)}

      <!-- İlerleme & Gereksinimler -->
      <div style="background: #151a26; padding: 12px; border-radius: 10px; border: 1px solid #583007; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.88rem; font-weight: 700;">
            <span style="color: #60a5fa; display:flex; align-items:center; gap:4px;">✨ Deneyim (XP):</span>
            <span style="color: ${state.currentXp >= req.xp ? '#4ade80' : '#f87171'}; font-weight: 900;">
              ${state.currentXp} / ${req.xp} XP ${state.currentXp >= req.xp ? '✅' : `(Eksik: ${req.xp - state.currentXp} XP)`}
            </span>
          </div>
          <div style="height: 8px; width: 100%; background: #1e293b; border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
            <div style="height: 100%; width: ${Math.min(100, Math.round((state.currentXp / req.xp) * 100))}%; background: ${state.currentXp >= req.xp ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #f59e0b, #ef4444)'}; transition: width 0.3s ease;"></div>
          </div>
          ${state.currentXp < req.xp ? `
            <div style="font-size: 0.73rem; color: #fbbf24; display:flex; align-items:center; gap:4px; margin-top: 1px;">
              <span>💡</span> <span>XP kazanmak için haritadan <strong>Orman, Maden veya Çiftlik</strong> seferlerine çıkmalısın.</span>
            </div>
          ` : ''}
        </div>
        
        <div style="font-size: 0.85rem; font-weight: 700; color: #cbd5e1; margin-top: 4px; display: flex; justify-content: space-between; align-items: center;">
          <span>Gereken Hammadde & Token:</span>
          <span style="font-size: 0.74rem; color: #a78bfa; background: #2e1065; padding: 2px 7px; border-radius: 6px; border: 1px solid #7c3aed; font-weight: 700;">🤖 AMM DEX Canlı Bot</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 0.82rem; font-weight: 600;">
          <div style="color: ${wood >= req.wood ? '#4ade80' : '#f87171'};">🌲 ${wood}/${req.wood} Odun</div>
          <div style="color: ${iron >= req.iron ? '#4ade80' : '#f87171'};">⛏️ ${iron}/${req.iron} Demir</div>
          <div style="color: ${wheat >= req.wheat ? '#4ade80' : '#f87171'};">🌾 ${wheat}/${req.wheat} Buğday</div>
          <div style="color: ${adAstra >= req.adAstra ? '#4ade80' : '#f87171'};" id="live-levelup-ada-box">
            🟣 <span id="val-levelup-ada-cur">${adAstra.toFixed(1)}</span> / <span id="val-levelup-ada-req">${req.adAstra.toLocaleString('tr-TR')}</span> ASTRA
          </div>
        </div>
        
        <div style="font-size: 0.74rem; color: #94a3b8; margin-top: 2px; border-top: 1px dashed #3e2205; padding-top: 5px; display: flex; justify-content: space-between; align-items: center;">
          <span>💡 Ekstra ASTRA bedeli, istenen odun/demir/buğdayın DEX pazar değeridir.</span>
          <span style="color: #a78bfa; font-size: 0.72rem;">⚡ Canlı Bot Aktif</span>
        </div>
      </div>

      ${quickBuyHtml('levelup')}
      <div id="levelup-feedback-box"></div>

      ${(() => {
        const hasXp = state.currentXp >= req.xp;
        const hasWood = wood >= req.wood;
        const hasIron = iron >= req.iron;
        const hasWheat = wheat >= req.wheat;
        const hasAda = adAstra >= req.adAstra;
        const canLevelUp = hasXp && hasWood && hasIron && hasWheat && hasAda;

        if (req.isMaxLevel) {
          return `
            <button id="btn-modal-levelup" class="btn-clean" style="margin-top: 4px; background: #334155; border-color: #64748b; color: #94a3b8; cursor: not-allowed;" disabled>
              🏆 MAKSİMUM SEVİYEYE (LV.81) ULAŞILDI
            </button>
          `;
        } else if (!canLevelUp) {
          let missingReason = '';
          if (!hasXp) missingReason = `Yetersiz Deneyim (${state.currentXp}/${req.xp} XP)`;
          else if (!hasAda) missingReason = `Yetersiz ASTRA (${adAstra.toFixed(0)}/${req.adAstra} ASTRA)`;
          else missingReason = 'Eksik Hammadde Bulunuyor';

          return `
            <button id="btn-modal-levelup" class="btn-clean" style="margin-top: 4px; background: #1f2937; border: 1.5px solid #ef4444; color: #fca5a5; font-weight: 800; cursor: pointer;">
              🔒 SEVİYE ${state.level + 1}'E YÜKSELT — ${missingReason}
            </button>
          `;
        } else {
          return `
            <button id="btn-modal-levelup" class="btn-clean btn-clean-green" style="margin-top: 4px; font-weight: 900; box-shadow: 0 4px 15px rgba(16,185,129,0.4);">
              ✨ SEVİYE ${state.level + 1}'E YÜKSELT (TÜM KOŞULLAR HAZIR!)
            </button>
          `;
        }
      })()}
    </div>

    <!-- 🏛️ EVRENSEL TEMEL GELİR (UBI) & SEVİYE STAKE HAVUZU KARTI -->
    <div class="clean-card" style="border-color: #c084fc; background: linear-gradient(180deg, #1f112e 0%, #12091c 100%); box-shadow: 0 4px 15px rgba(192, 132, 252, 0.15);">
      <div class="card-title-row">
        <div class="card-title" style="display: flex; align-items: center; gap: 8px;">
          <span>🏛️</span>
          <span style="color: #f3e8ff;">EVRENSEL TEMEL GELİR (UBI)</span>
        </div>
        <span class="card-badge" style="background: #581c87; color: #e9d5ff; border: 1px solid #a855f7;">
          Seviye Stake Havuzu
        </span>
      </div>

      <div class="clean-desc" style="line-height: 1.5; margin: 6px 0 10px 0; color: #d8b4fe; font-size: 0.82rem;">
        Oyundaki her harcamanın <strong>%6'sı</strong> bu havuzda toplanır. Biriken fonlar <strong>3 ayda (12 haftada)</strong> dağıtılacak takvimle her hafta Pazarı Pazartesiye bağlayan gece <strong>00:01 TRT'de</strong> hesap seviyenize göre pasif gelir olarak açılır.
      </div>

      <!-- İstatistik ve Seviye Maaş Grid'i -->
      <div style="background: rgba(15, 10, 25, 0.8); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.82rem;">
          <div>
            <div style="color: #a855f7; font-size: 0.72rem; font-weight: 700;">TOPLAM UBI HAVUZU:</div>
            <div id="ubi-total-pool-val" style="color: #f3e8ff; font-weight: 800; font-size: 0.95rem;">${ubiInfo.totalPool.toLocaleString('tr-TR')} 🟣 ASTRA</div>
          </div>
          <div>
            <div style="color: #a855f7; font-size: 0.72rem; font-weight: 700;">BU HAFTALIK BÜTÇE (1/12):</div>
            <div id="ubi-weekly-budget-val" style="color: #38bdf8; font-weight: 800; font-size: 0.95rem;">${ubiInfo.weeklyBudget.toLocaleString('tr-TR')} 🟣 ASTRA</div>
          </div>
        </div>

        <div style="border-top: 1px dashed rgba(168, 85, 247, 0.3); padding-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.82rem;">
          <div>
            <div style="color: #cbd5e1; font-size: 0.74rem;">Mevcut Seviyeniz (Lv.${state.level}):</div>
            <div id="ubi-player-payout-val" style="color: #4ade80; font-weight: 900; font-size: 1.05rem;">${ubiInfo.payout.toFixed(2)} 🟣 ASTRA / Hafta</div>
          </div>
          <div>
            <div style="color: #cbd5e1; font-size: 0.74rem;">Sonraki Seviye (Lv.${Math.min(81, state.level + 1)}):</div>
            <div id="ubi-next-payout-box" style="color: #facc15; font-weight: 800; font-size: 0.95rem;">
              <span id="ubi-next-payout-val">${ubiInfo.nextLevelPayout.toFixed(2)}</span> ASTRA 
              <span id="ubi-increase-pct-val" style="font-size: 0.75rem; color: #4ade80;">(+%${ubiInfo.increasePct})</span>
            </div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.74rem; color: #94a3b8; border-top: 1px dashed rgba(168, 85, 247, 0.2); padding-top: 5px;">
          <span>⏳ Döngü: Pazar ➜ Pazartesi 00:01 TRT</span>
          <span style="color: #c084fc; font-weight: 700;">Lv.81 Pay Çarpanı: 3.375x</span>
        </div>
      </div>

      <!-- Claim Butonu -->
      ${ubiInfo.alreadyClaimedThisWeek ? `
        <button id="btn-claim-ubi" class="btn-clean" style="margin-top: 8px; background: #2e1065; border-color: #581c87; color: #a78bfa; cursor: not-allowed;" disabled>
          ✅ BU HAFTAKİ TEMEL GELİRİNİZ ALINDI (Sonraki: Pazar 00:01)
        </button>
      ` : `
        <button id="btn-claim-ubi" class="btn-clean" style="margin-top: 8px; background: linear-gradient(135deg, #7e22ce 0%, #a855f7 100%); color: #fff; font-weight: 900; font-size: 0.95rem; border: 1.5px solid #d8b4fe; box-shadow: 0 0 15px rgba(168, 85, 247, 0.4);">
          🏛️ HAFTALIK EVRENSEL TEMEL GELİRİ AL <span id="ubi-btn-claim-amount">(+${ubiInfo.payout.toFixed(2)} ASTRA)</span>
        </button>
      `}
    </div>

    <!-- Stamina Yönetimi & Buğday ile Doldurma -->
    <div class="clean-card" style="border-color: #38bdf8; background: #0c1524;">
      <div class="card-title-row">
        <div class="card-title">⚡ Dayanıklılık (Stamina)</div>
        <span class="card-badge" style="color: #38bdf8;">${Math.floor(state.stamina)} / ${maxStamina} ⚡</span>
      </div>
      <div class="clean-desc">
        Seviye atlandıkça maksimum stamina artar. 1 Stamina doldurmak için dakikada çıkarılan buğdayın %21'i (3.15 Buğday) tüketilir. Depodaki buğday ile staminanı hemen yenileyebilirsin.
      </div>
      <div style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px;">
        <button id="btn-wheat-stamina-refill" class="btn-clean btn-clean-outline" style="flex: 1; min-width: 170px; font-size: 0.85rem; padding: 10px;" ${wheat < 63 || state.stamina >= maxStamina ? 'disabled' : ''}>
          🍞 +20 ⚡ Stamina Doldur (63 Buğday)
        </button>
        <button id="btn-wheat-stamina-refill-max" class="btn-clean btn-clean-gold" style="flex: 1.3; min-width: 200px; font-size: 0.85rem; padding: 10px; font-weight: 800;" ${wheat <= 0 || state.stamina >= maxStamina ? 'disabled' : ''}>
          ⚡ Tek Tıkla Tam Doldur (${Math.ceil(Math.max(0, maxStamina - Math.floor(state.stamina)) * 3.15)} Buğday)
        </button>
        ${scrollStamina > 0 ? `
          <button class="btn-clean btn-clean-purple btn-use-scroll" data-scroll="scroll_stamina" style="flex: 1; min-width: 180px; font-size: 0.85rem; padding: 10px; font-weight: 800;" ${state.stamina >= maxStamina ? 'disabled' : ''} title="100 Stamina Doldurma Parşömeni Kullan">
            📜 Parşömen Kullan (${scrollStamina} Adet • +100 ⚡)
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Depolanan Hammaddeler -->
    <div class="clean-card">
      <div class="card-title">📦 Depolanan Hammaddeler</div>
      <div class="inv-grid">
        <div class="inv-slot"><div class="inv-icon">🌲</div><div class="inv-qty">${(Number(wood) || 0).toFixed(2)}</div><div class="inv-name">Odun</div></div>
        <div class="inv-slot"><div class="inv-icon">⛏️</div><div class="inv-qty">${(Number(iron) || 0).toFixed(2)}</div><div class="inv-name">Demir</div></div>
        <div class="inv-slot"><div class="inv-icon">🌾</div><div class="inv-qty">${(Number(wheat) || 0).toFixed(2)}</div><div class="inv-name">Buğday</div></div>
        <div class="inv-slot"><div class="inv-icon">🧩</div><div class="inv-qty">${(Number(state.inventory.fragments) || 0).toFixed(2)}</div><div class="inv-name">Teçhizat Parçaları</div></div>
      </div>
    </div>

    <!-- 📜 Büyülü Parşömenler & Kadim Eşyalar (Scrolls) -->
    <div class="clean-card" style="border-color: #a855f7; background: #160c22;">
      <div class="card-title-row">
        <div class="card-title" style="color: #d8b4fe;">📜 Büyülü Parşömenler & Kadim Eşyalar</div>
        <span class="card-badge" style="color: #c084fc; border-color: #a855f7;">Çark & AMM DEX Envanteri</span>
      </div>
      <div class="clean-desc">
        Karnaval Şans Çarkı'ndan veya AMM DEX Pazarından edindiğin kadim parşömenleri buradan görebilir ve doğrudan kullanabilirsin.
      </div>
      
      <div class="inventory-scrolls-grid">
        <!-- İyileştirme Parşömeni -->
        <div class="inventory-scroll-card">
          <div class="inventory-scroll-header">
            <div class="inventory-scroll-title">
              <span style="font-size: 1.3rem;">📜</span>
              <span>Ordu İyileştirme</span>
            </div>
            <span class="inventory-scroll-count">${scrollHeal} Adet</span>
          </div>
          <div class="inventory-scroll-desc">
            AdAstra Şampiyonuna anında <strong>+10 HP Can</strong> kazandırır.
          </div>
          <button class="btn-clean btn-clean-purple inventory-scroll-btn btn-use-scroll" data-scroll="scroll_heal" ${scrollHeal <= 0 ? 'disabled' : ''}>
            ${scrollHeal > 0 ? '✨ Parşömeni Kullan (+10 HP)' : 'Tükendi'}
          </button>
        </div>

        <!-- Stamina Parşömeni -->
        <div class="inventory-scroll-card">
          <div class="inventory-scroll-header">
            <div class="inventory-scroll-title">
              <span style="font-size: 1.3rem;">⚡</span>
              <span>100 Stamina Doldurma</span>
            </div>
            <span class="inventory-scroll-count">${scrollStamina} Adet</span>
          </div>
          <div class="inventory-scroll-desc">
            Dayanıklılığına (Stamina) anında <strong>+100 Stamina</strong> ekler.
          </div>
          <button class="btn-clean btn-clean-gold inventory-scroll-btn btn-use-scroll" data-scroll="scroll_stamina" ${scrollStamina <= 0 ? 'disabled' : ''}>
            ${scrollStamina > 0 ? '⚡ Parşömeni Kullan (+100 ⚡)' : 'Tükendi'}
          </button>
        </div>
      </div>

      <!-- Ek Özel Eşyalar & Biletler -->
      <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed rgba(168, 85, 247, 0.3); display: flex; flex-wrap: wrap; gap: 8px; font-size: 0.82rem;">
        <div style="background: rgba(0,0,0,0.4); padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); color: #cbd5e1;">
          🎟️ Piyango/Çark Bileti: <strong style="color: #f472b6;">${lotteryTickets} Adet</strong>
        </div>
        <div style="background: rgba(0,0,0,0.4); padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); color: #cbd5e1;">
          🎟️ Çark Amorti Parçası: <strong style="color: #fde047;">${wheelShards}/10</strong>
        </div>
        <div style="background: rgba(0,0,0,0.4); padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); color: #cbd5e1;">
          🔑 Pandora Anahtarı: <strong style="color: #38bdf8;">${arenaKeys} Adet</strong>
        </div>
      </div>
    </div>

    <!-- Aletler & Tamirat (Odun + Demir + 1 ASTRA/dk - Buğday Gerekmez) -->
    <div class="clean-card">
      <div class="card-title-row">
        <div class="card-title">🔨 Aletler & Dayanıklılık</div>
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span style="font-size: 0.85rem; color: #fde047; font-weight: 700;">Odun + Demir + ASTRA ile Onarım (Buğdaysız)</span>
        </div>
      </div>

      <!-- Balta -->
      <div class="durability-row">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.4rem;">🪓</span>
          <div>
            <div style="font-size: 0.95rem; font-weight: 800;">Acemi Baltası</div>
            <div style="font-size: 0.8rem; color: #94a3b8;">${axe.durability >= 4320 ? '✅ Tam Sağlam (4320/4320 dk)' : `Onarım Maliyeti (-${axeCost.missingDurability} dk): <strong>${axeCost.woodCost} Odun</strong> + <strong>${axeCost.ironCost} Demir</strong> + <strong>${axeCost.adAstraCost} ASTRA</strong>`}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="card-badge" style="color: ${axe.durability <= 720 ? '#ef4444' : '#22c55e'};">${axe.durability}/4320 dk (%${Math.round((axe.durability / 4320) * 100)})</span>
          <button class="btn-clean btn-clean-outline btn-modal-repair" data-tool="axe" style="padding: 6px 12px; font-size: 0.8rem; width: auto;" ${axe.durability >= 4320 ? 'disabled' : ''}>${axe.durability >= 4320 ? 'Tam' : 'Onar'}</button>
        </div>
      </div>

      <!-- Kazma -->
      <div class="durability-row">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.4rem;">⛏️</span>
          <div>
            <div style="font-size: 0.95rem; font-weight: 800;">Bronz Kazma</div>
            <div style="font-size: 0.8rem; color: #94a3b8;">${pickaxe.durability >= 4320 ? '✅ Tam Sağlam (4320/4320 dk)' : `Onarım Maliyeti (-${pickaxeCost.missingDurability} dk): <strong>${pickaxeCost.woodCost} Odun</strong> + <strong>${pickaxeCost.ironCost} Demir</strong> + <strong>${pickaxeCost.adAstraCost} ASTRA</strong>`}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="card-badge" style="color: ${pickaxe.durability <= 720 ? '#ef4444' : '#22c55e'};">${pickaxe.durability}/4320 dk (%${Math.round((pickaxe.durability / 4320) * 100)})</span>
          <button class="btn-clean btn-clean-outline btn-modal-repair" data-tool="pickaxe" style="padding: 6px 12px; font-size: 0.8rem; width: auto;" ${pickaxe.durability >= 4320 ? 'disabled' : ''}>${pickaxe.durability >= 4320 ? 'Tam' : 'Onar'}</button>
        </div>
      </div>

      <!-- Orak -->
      <div class="durability-row">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.4rem;">🌾</span>
          <div>
            <div style="font-size: 0.95rem; font-weight: 800;">Demir Orak</div>
            <div style="font-size: 0.8rem; color: #94a3b8;">${sickle.durability >= 4320 ? '✅ Tam Sağlam (4320/4320 dk)' : `Onarım Maliyeti (-${sickleCost.missingDurability} dk): <strong>${sickleCost.woodCost} Odun</strong> + <strong>${sickleCost.ironCost} Demir</strong> + <strong>${sickleCost.adAstraCost} ASTRA</strong>`}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="card-badge" style="color: ${sickle.durability <= 720 ? '#ef4444' : '#22c55e'};">${sickle.durability}/4320 dk (%${Math.round((sickle.durability / 4320) * 100)})</span>
          <button class="btn-clean btn-clean-outline btn-modal-repair" data-tool="sickle" style="padding: 6px 12px; font-size: 0.8rem; width: auto;" ${sickle.durability >= 4320 ? 'disabled' : ''}>${sickle.durability >= 4320 ? 'Tam' : 'Onar'}</button>
        </div>
      </div>
    </div>
  `;

  displayModal();
}

export function updateUbiCardLive() {
  const elTotal = document.getElementById('ubi-total-pool-val');
  if (!elTotal) return;

  const state = gameState.state;
  const ubiInfo = globalPool.getUbiPoolInfo(state.level || 1, state.lastClaimedUbiEpoch || 0);

  const elBudget = document.getElementById('ubi-weekly-budget-val');
  const elPayout = document.getElementById('ubi-player-payout-val');
  const elNext = document.getElementById('ubi-next-payout-val');
  const elPct = document.getElementById('ubi-increase-pct-val');
  const elBtnAmt = document.getElementById('ubi-btn-claim-amount');

  elTotal.innerText = `${ubiInfo.totalPool.toLocaleString('tr-TR')} 🟣 ASTRA`;
  if (elBudget) elBudget.innerText = `${ubiInfo.weeklyBudget.toLocaleString('tr-TR')} 🟣 ASTRA`;
  if (elPayout) elPayout.innerText = `${ubiInfo.payout.toFixed(2)} 🟣 ASTRA / Hafta`;
  if (elNext) elNext.innerText = `${ubiInfo.nextLevelPayout.toFixed(2)}`;
  if (elPct) elPct.innerText = `(+%${ubiInfo.increasePct})`;
  if (elBtnAmt) elBtnAmt.innerText = `(+${ubiInfo.payout.toFixed(2)} ASTRA)`;
}
window.updateUbiCardLive = updateUbiCardLive;

// ═══════════════════════════════════════════════════════════════════════════
// v2 (7 Ekim 2026): 6 hammadde alanı tek şablondan (config.RESOURCE_META: ad, simge, renk, alet, alan)
// ═══════════════════════════════════════════════════════════════════════════
const RES_KEYS = () => GAME_CONFIG.RESOURCE_KEYS || ['wood', 'iron', 'wheat'];
const RES_META = () => GAME_CONFIG.RESOURCE_META || {};
const ZONE_OF_NODE = key => ((RES_META()[key] || {}).zone) || key;
const NODE_OF_ZONE_UI = zoneId => RES_KEYS().find(k => ZONE_OF_NODE(k) === zoneId) || null;
const ZONE_NAMES = { wheat: 'Güneş Tarlası & Değirmen', stone: 'Taş Ocağı', wood: 'Zümrüt Ormanı & Oduncu', coal: 'Kömür Ocağı', iron: 'Demir Madeni & Tamirhane', herb: 'Şifalı Ot Bahçesi' };
const ZONE_LABELS = { village: '🏘️ Köy Evleri', council: '🏛️ Sirius Konseyi', healer: '🌿 Şifahane', spaceport: '🚀 Uzay Limanı' };
const TOOL_NAMES = { sickle: 'Orak', chisel: 'Keski', axe: 'Balta', coalpick: 'Kömür Kazması', pickaxe: 'Kazma', herbknife: 'Ot Bıçağı' };
const ZONE_TITLE = key => { const m = RES_META()[key] || {}; const cap = (GAME_CONFIG.GLOBAL_RESOURCE_CAPS || {})[key] || {}; return `${m.icon || cap.icon || ''} ${ZONE_NAMES[key] || cap.name || key}`; };
const fmt3 = v => (Math.round((Number(v) || 0) * 1000) / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 3 });

function renderResourceZoneHtml(nodeId) {
  const state = gameState.state;
  const meta = RES_META()[nodeId] || {};
  const cap = (GAME_CONFIG.GLOBAL_RESOURCE_CAPS || {})[nodeId] || {};
  const toolId = meta.tool || cap.requiredTool;
  const toolCfg = (GAME_CONFIG.TOOLS || {})[toolId] || {};
  const maxDur = toolCfg.maxDurability || 4320;
  const tool = (state.tools || {})[toolId] || { durability: maxDur };
  const durPct = Math.round(((tool.durability != null ? tool.durability : maxDur) / maxDur) * 100);
  const repCost = gameState.calculateRepairCost(toolId) || { woodCost: 0, ironCost: 0, adAstraCost: 0, missingDurability: 0 };
  const activeExp = state.activeExpeditions[nodeId];
  const isSpeedActive = gameState.isBuffActive('speed_' + nodeId);
  const currentDuration = gameState.getExpeditionDurationHours();
  const currentDurationMin = gameState.getExpeditionDurationMinutes();
  const ratePm = gameState.getResourceRatePerMinute(nodeId);
  const estYield = Math.floor(ratePm * currentDurationMin * (isSpeedActive ? 1.5 : 1));
  const name = meta.name || cap.name || nodeId;
  const icon = meta.icon || cap.icon || '';
  const toolName = toolCfg.name || TOOL_NAMES[toolId] || toolId;
  const staminaCost = gameState.getExpeditionStaminaCost();
  const lowStamina = state.stamina < staminaCost;
  const hak = gameState.getUretimHakki ? gameState.getUretimHakki(nodeId) : null;
  return `
      <div class="clean-card">
        <div class="card-title-row">
          <div class="card-title">${icon} ${name} Seferi</div>
          <div class="card-badge">${currentDuration} Saat (${currentDurationMin} dk) ${isSpeedActive ? '⚡ 1.5x Hızlı' : ''}</div>
        </div>
        <div style="font-size: 0.84rem; color: #94a3b8; margin: 4px 0 10px 0; line-height: 1.4;">
          ⚡ <strong>Üretim:</strong> ${(Math.round(ratePm * 100) / 100).toLocaleString('tr-TR')} ${name} / dakika (${Math.round(ratePm * 60).toLocaleString('tr-TR')} / saat, seviye bonusu dahil)<br>
          📦 <strong>Beklenen sefer kazancı:</strong> ~${estYield} ${name} | 🔧 <strong>Aşınma:</strong> -${currentDurationMin} dk
          ${hak ? `<br>🎫 <strong>Üretim Hakkın:</strong> bugün alınabilir <strong style="color:${hak.canTake > 0 ? '#4ade80' : '#f87171'};">${fmtInt(hak.canTake)}</strong> ${name} · bu hafta ${fmtInt(hak.used)} / ${fmtInt(hak.released)} açılan (haftalık ${fmtInt(hak.weekly)}, ağırlık ×${hak.weight})${hak.extra > 0 ? ` · +${fmtInt(hak.extra)} başkalarının kullanmadığı` : ''}` : ''}
        </div>
        <div class="durability-row">
          <span style="font-size: 0.95rem; font-weight: 700;">🔧 ${toolName} Durumu:</span>
          <span class="card-badge" style="color: ${tool.durability <= maxDur / 6 ? '#ef4444' : '#22c55e'};">${tool.durability} / ${maxDur} dk (%${durPct})</span>
        </div>
        ${activeExp ? renderExpeditionActiveBox(nodeId) : `
          <button class="btn-clean btn-modal-start" data-node="${nodeId}" ${tool.durability <= 0 || lowStamina ? 'disabled' : ''}>
            ${currentDuration} Saatlik ${name} Görevine Gönder (-${staminaCost.toLocaleString('tr-TR')} ⚡)
          </button>
          ${lowStamina && (state.inventory.scroll_stamina || 0) > 0 ? `
            <button class="btn-clean btn-clean-purple btn-use-scroll" data-scroll="scroll_stamina" style="margin-top: 6px; width: 100%; font-weight: 800;" title="100 Stamina Doldurma Parşömeni Kullan">
              ⚡ Yetersiz Stamina! Parşömen Kullan (${state.inventory.scroll_stamina} Adet • +100 ⚡)
            </button>
          ` : ''}
        `}
      </div>

      <div class="clean-card">
        <div class="card-title-row">
          <div class="card-title">🔨 ${toolName} Tamiratı</div>
          <span style="font-size: 0.85rem; color: #fde047; font-weight: 700;">
            ${repCost.missingDurability > 0 ? `${repCost.woodCost} Odun + ${repCost.ironCost} Demir + ${fmt3(repCost.adAstraCost)} ASTRA` : '✅ Tam Sağlam'}
          </span>
        </div>
        <div style="font-size: 0.78rem; color: #94a3b8; margin-bottom: 8px;">
          Onarım bedeli: aşınan her dakika için odun + demir (dakikalık üretimin %25'i, aletlere bölünmüş) + bu malzemenin pazar değerinin %30'u kadar ASTRA (Eksik: ${repCost.missingDurability} dk)
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn-clean btn-clean-outline btn-modal-repair" data-tool="${toolId}" style="flex: 1; min-width: 160px;" ${repCost.missingDurability <= 0 ? 'disabled' : ''}>
            ${repCost.missingDurability <= 0 ? `${toolName} Tamamen Sağlam` : `${toolName} Onar (${repCost.woodCost}🌲 + ${repCost.ironCost}⛏️ + ${fmt3(repCost.adAstraCost)} 🪙)`}
          </button>
        </div>
      </div>
    `;
}

function renderExpeditionActiveBox(nodeId) {
  const nodeConfig = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId];
  const accrued = gameState.getAccruedExpeditionHarvest(nodeId);
  const colorMap = Object.fromEntries(RES_KEYS().map(k => [k, (RES_META()[k] || {}).color]));
  const nodeColor = colorMap[nodeId] || '#ca8a04';

  const cap = gameState.getWarehouseCapacity();
  const limit = cap[nodeId];
  const currentInv = Number(gameState.state.inventory[nodeId]) || 0;
  const availableRoom = limit != null ? Math.max(0, limit - currentInv) : accrued.accruedAmount;
  const isCompletelyFull = limit != null && availableRoom <= 0;
  const isPartialRoom = limit != null && availableRoom > 0 && (availableRoom < accrued.accruedAmount);
  const resourceDisplayNames = Object.fromEntries(RES_KEYS().map(k => [k, ((RES_META()[k] || {}).name || k).toLocaleLowerCase('tr-TR')]));
  const rLabel = resourceDisplayNames[nodeId] || nodeConfig.name;

  return `
    <div class="expedition-active-box" id="modal-exp-box-${nodeId}" style="border-color: ${nodeColor};">
      <div class="exp-active-header">
        <span class="exp-live-label" style="color: ${nodeColor};">⏳ ${nodeConfig.name} Seferi Sürüyor</span>
        <span class="exp-live-pct" id="modal-exp-pct-${nodeId}">%${accrued.pct}</span>
      </div>
      
      <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #94a3b8; font-weight: 700;">
        <span>Kalan Süre:</span>
        <strong id="modal-exp-time-${nodeId}" style="color: #fff; font-size: 0.95rem;">${formatCountdown(accrued.remainingSeconds)}</strong>
      </div>

      <div class="exp-live-track">
        <div class="exp-live-fill" id="modal-exp-fill-${nodeId}" style="width: ${accrued.pct}%; background: linear-gradient(90deg, #ca8a04, ${nodeColor});"></div>
      </div>

      <div class="exp-accrued-row">
        <span>${nodeConfig.icon} Biriken Kaynak:</span>
        <strong class="exp-accrued-val" id="modal-exp-accrued-${nodeId}">+${accrued.accruedAmount} ${nodeConfig.name} (+${accrued.accruedXp || 0} XP)</strong>
      </div>

      ${isCompletelyFull ? `
        <div style="background: rgba(185, 28, 28, 0.25); border: 1.5px solid #ef4444; border-radius: 8px; padding: 10px 12px; margin-top: 8px; font-size: 0.84rem; color: #fca5a5; text-align: center; font-weight: 800; line-height: 1.4;">
          ⚠️ Silo'nuz tamamen dolu (${currentInv.toFixed(0)} / ${limit})!
          <div style="font-size: 0.76rem; color: #fee2e2; font-weight: 400; margin-top: 3px;">Seferdeki +${accrued.accruedAmount} ${nodeConfig.name} mahsulünü almak için lütfen silonuzu büyütün veya silonuzda yer açın.</div>
        </div>
      ` : isPartialRoom ? `
        <div style="background: rgba(30, 58, 138, 0.35); border: 1.5px solid #38bdf8; border-radius: 8px; padding: 10px 12px; margin-top: 8px; font-size: 0.84rem; color: #bae6fd; text-align: center; font-weight: 800; line-height: 1.4;">
          📥 Siloda ${availableRoom.toFixed(0)} Adet Boş Yer Var (Mevcut: ${currentInv.toFixed(0)} / ${limit})
          <div style="font-size: 0.76rem; color: #e0f2fe; font-weight: 400; margin-top: 3px;">Silonuzu dolduracak kadar (+${availableRoom.toFixed(0)} ${nodeConfig.name}) toplayabilirsiniz! Kalan ${(accrued.accruedAmount - availableRoom).toFixed(0)} ${nodeConfig.name} seferde bekletilecek, ambarınız %100 dolacağı için silonuzu hemen büyütebilirsiniz!</div>
        </div>
      ` : ''}

      <div class="exp-btn-row">
        <button class="btn-clean btn-clean-purple btn-modal-partial-claim" data-node="${nodeId}" id="btn-modal-partial-${nodeId}" style="flex: 1;" ${accrued.accruedAmount <= 0 || isCompletelyFull ? 'disabled' : ''}>
          ${isPartialRoom ? `⚡ BOŞ YERİ DOLDUR (+${availableRoom.toFixed(0)} Al)` : `⚡ ERKEN TOPLA (+${accrued.accruedAmount} Al)`}
        </button>
        ${accrued.isCompleted ? `
          <button class="btn-clean ${isCompletelyFull ? 'btn-clean-amber' : isPartialRoom ? 'btn-clean-blue' : 'btn-clean-green'} btn-modal-claim" data-node="${nodeId}" style="flex: 1; ${isCompletelyFull ? 'background: #78350f; color: #fde047; border: 1px solid #f59e0b;' : isPartialRoom ? 'background: #0284c7; color: #fff; border: 1.5px solid #38bdf8; font-weight: 800;' : ''}">
            ${isCompletelyFull 
              ? `⚠️ SİLO TAMAMEN DOLU: YER AÇIN` 
              : isPartialRoom 
                ? `📥 SİLOYU DOLDUR (+${availableRoom.toFixed(0)} Al, Kalanı Beklet)` 
                : '🏁 TAMAMLANDI - TÜMÜNÜ TOPLA'}
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

// =========================================================================
// 4. BÖLGE MODALLERİ (ORMAN, MADEN, ÇİFTLİK, BALIKÇI, KIŞLA, TAVERNA, AMM PAZAR, KOLEZYUM)
// =========================================================================
function openTownZoneModal(zoneId, zoneName) {
  if (!featureGate(zoneId)) return;
  if (zoneId === 'barracks' || zoneId === 'battlefield') {
    openBarracksModal();
    return;
  }
  if (zoneId === 'colosseum') {
    openColosseumModal();
    return;
  }
  if (zoneId === 'council') {
    openTreasuryVaultModal();
    return;
  }

  const state = gameState.state;
  dom.modalTitle.innerHTML = `<span>📍</span> <span>${zoneName}</span>`;
  const currentDuration = gameState.getExpeditionDurationHours();

  let html = '';

  // 1-3. HAMMADDE ALANLARI (v2: tarla, taş ocağı, orman, kömür ocağı, maden, ot bahçesi — tek şablon)
  const zoneNode = NODE_OF_ZONE_UI(zoneId);
  if (zoneNode) {
    html = renderResourceZoneHtml(zoneNode);
  }

  // 2.5 DEMİRCİ & TAMİRHANE (ŞEHİR MERKEZİNDEKİ EV) - Geniş Ekran 3 Sütunlu Entegre Cephanelik, Dövme ve Donatım Merkezi
  else if (zoneId === 'blacksmith') {
    const pickaxeTool = state.tools.pickaxe || { durability: 0 };
    const axeTool = state.tools.axe || { durability: 0 };
    const sickleTool = state.tools.sickle || { durability: 0 };
    const pickCost = gameState.calculateRepairCost('pickaxe');
    const axeCost = gameState.calculateRepairCost('axe');
    const sickleCost = gameState.calculateRepairCost('sickle');

    const equipConfig = GAME_CONFIG.EQUIPMENT_RECIPES;
    const currentEquip = state.equipment || {};
    const slots = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
    const slotNames = { weapon: 'Silah', helmet: 'Miğfer', armor: 'Gövde Zırhı', legs: 'Pantolon', boots: 'Ayakkabı' };

    const armoryList = gameState.getAllArmoryEquipmentList();
    const soldiers = state.soldierUnits || [];

    // Kategori Filtresi & Sıralama Hafızası
    window.blacksmithCategoryFilter = window.blacksmithCategoryFilter || 'all';
    window.blacksmithSortOrder = window.blacksmithSortOrder || 'level_desc';
    const activeCategory = window.blacksmithCategoryFilter;
    const activeSort = window.blacksmithSortOrder;

    // Seçili asker indeksi (varsayılan: 0)
    let curSoldierIdx = window.blacksmithSelectedSoldierIndex != null ? window.blacksmithSelectedSoldierIndex : 0;
    if (curSoldierIdx >= soldiers.length && soldiers.length > 0) curSoldierIdx = 0;
    window.blacksmithSelectedSoldierIndex = curSoldierIdx;
    const currentSelectedSoldier = soldiers[curSoldierIdx] || null;

    // Hasarlı eşya sayısı kontrolü
    const damagedArmoryItems = armoryList.filter(e => (e.item.durability || 13) < (e.item.maxDurability || 13));

    // Filtreleme ve Sıralama
    let filteredArmoryList = armoryList.filter(entry => {
      if (activeCategory !== 'all' && entry.item.slot !== activeCategory) return false;
      return true;
    });

    if (activeSort === 'level_desc') {
      filteredArmoryList.sort((a, b) => (b.item.level || 1) - (a.item.level || 1));
    } else if (activeSort === 'level_asc') {
      filteredArmoryList.sort((a, b) => (a.item.level || 1) - (b.item.level || 1));
    } else if (activeSort === 'durability_asc') {
      filteredArmoryList.sort((a, b) => (a.item.durability || 13) - (b.item.durability || 13));
    }

    // Kategori sayıları
    const catCounts = {
      all: armoryList.length,
      weapon: armoryList.filter(e => e.item.slot === 'weapon').length,
      helmet: armoryList.filter(e => e.item.slot === 'helmet').length,
      armor: armoryList.filter(e => e.item.slot === 'armor').length,
      legs: armoryList.filter(e => e.item.slot === 'legs').length,
      boots: armoryList.filter(e => e.item.slot === 'boots').length
    };

    // Mevcut eşyalardan özelleştirilmiş geliştirme kısayolları
    const lvl1Weapons = armoryList.filter(e => e.item.slot === 'weapon' && (e.item.level || 1) === 1);
    const lvl2Weapons = armoryList.filter(e => e.item.slot === 'weapon' && (e.item.level || 1) === 2);
    const lvl1Helmets = armoryList.filter(e => e.item.slot === 'helmet' && (e.item.level || 1) === 1);
    const lvl1Armors = armoryList.filter(e => e.item.slot === 'armor' && (e.item.level || 1) === 1);

    // 60+ Yaş Yaşlı Dostu Tasarım: 2 Net Ana Sekme (1. Silah Döv / 2. Çantam & Teçhizatlarım)
    const activeBlacksmithTab = window.blacksmithActiveTab || 'forge';

    html = `
      <!-- Üst Sekme Barı: 2 Büyük, Net ve Okunabilir Seçenek -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
        <button class="phase2-tab-btn btn-bs-tab ${activeBlacksmithTab === 'forge' ? 'active' : ''}" data-bstab="forge" style="padding: 12px; font-size: 1rem; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span style="font-size: 1.3rem;">🔥</span>
          <span>1. YENİ SİLAH & ZIRH DÖV</span>
        </button>
        <button class="phase2-tab-btn btn-bs-tab ${activeBlacksmithTab === 'armory' ? 'active' : ''}" data-bstab="armory" style="padding: 12px; font-size: 1rem; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span style="font-size: 1.3rem;">🎒</span>
          <span>2. ÇANTAM & EŞYALARIM (${armoryList.length})</span>
        </button>
      </div>

      ${activeBlacksmithTab === 'forge' ? `
        <!-- 1. SEKME: YENİ SİLAH & ZIRH DÖVME (KOCAMAN SİMGELER & NET MALİYET) -->
        <div style="display: flex; flex-direction: column; gap: 12px;">
          
          <div class="clean-card" style="border-left: 4px solid #f59e0b;">
            <div style="font-size: 1.05rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 8px;">
              <span>🔨 Ocağın Başı: Ne Üretmek İstersin?</span>
            </div>
            <div style="font-size: 0.88rem; color: #94a3b8; display:flex; flex-wrap:wrap; gap:8px; justify-content:space-between; align-items:center;">
              <span>Bir parça seç ve döv. Eksik hammaddeyi tek tuşla pazardan alabilirsin. Dövülen eşyayı Kışla → Cephanelik'ten askerine takarsın. Yeni eşyanın dayanıklılığı 13/13.</span>
              <button class="btn-clean btn-goto-armory" style="width:auto; padding:6px 12px; font-size:0.8rem; background:transparent; border:1px solid #475569; color:#cbd5e1;">⚔️ Kışla → Cephanelik</button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
            ${slots.map(slot => {
              const recipe = equipConfig[slot];
              const cost = gameState.calculateEquipmentCraftCost(slot);
              const canAfford = (state.inventory.iron || 0) >= cost.ironCost &&
                                (state.inventory.wood || 0) >= cost.woodCost &&
                                (state.inventory.fragments || 0) >= cost.fragCost &&
                                state.adAstraBalance >= cost.adaCost;

              return `
                <div class="clean-card" style="display: flex; flex-direction: column; justify-content: space-between; gap: 12px; padding: 16px; border: 1.5px solid ${canAfford ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)'};">
                  <div style="display: flex; align-items: center; gap: 14px;">
                    <div style="font-size: 2.4rem; background: rgba(0,0,0,0.4); width: 64px; height: 64px; padding: 6px; box-sizing: border-box; border-radius: 12px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.1);">
                      ${equipImg(slot, recipe.icon).replace('class="art-ico ', 'style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated;" class="art-ico ')}
                    </div>
                    <div>
                      <div style="font-size: 1.15rem; font-weight: 800; color: #fff;">${slotNames[slot]}</div>
                      <div style="font-size: 0.88rem; font-weight: 700; color: #4ade80; margin-top: 2px;">
                        ${recipe.baseAtk > 0 ? `⚔️ +${recipe.baseAtk} Saldırı Gücü ` : ''}
                        ${recipe.baseHp > 0 ? `❤️ +${recipe.baseHp} Can Puanı` : ''}
                        <span style="color:#fde047; font-size:0.8rem; font-weight:normal;">(Dayanıklılık: 13/13)</span>
                      </div>
                    </div>
                  </div>

                  ${(() => {
                    const f0 = v => Math.floor(Number(v) || 0).toLocaleString('tr-TR');
                    const capNow = gameState.getWarehouseCapacity();
                    const line = (icon, name, have, need, capRes) => {
                      const ok = have >= need;
                      const overCap = capRes != null && need > capRes;
                      return `<div style="display:flex; justify-content:space-between; gap:6px;"><span>${icon} ${name}</span><span style="font-weight:800; color:${ok ? '#4ade80' : '#f87171'};">${f0(have)} / ${f0(need)}${overCap ? ' <span title="Silon bu kadar alamıyor" style="color:#fbbf24;">⚠ silo</span>' : ''}</span></div>`;
                    };
                    return `<div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 10px; font-size: 0.82rem; color: #cbd5e1; display:grid; gap:4px;">
                      ${line(resImg('iron', '⛏️', 'width:16px;height:16px;vertical-align:-3px;'), 'Demir', state.inventory.iron || 0, cost.ironCost, capNow.iron)}
                      ${line(resImg('wood', '🌲', 'width:16px;height:16px;vertical-align:-3px;'), 'Odun', state.inventory.wood || 0, cost.woodCost, capNow.wood)}
                      ${line(resImg('fragments', '🧩', 'width:16px;height:16px;vertical-align:-3px;'), 'Parça', state.inventory.fragments || 0, cost.fragCost, null)}
                      ${line('🟣', 'ASTRA', state.adAstraBalance || 0, cost.adaCost, null)}
                    </div>`;
                  })()}

                  ${(() => {
                    if (canAfford) return `<button class="btn-clean btn-craft-equipment" data-slot="${slot}" style="padding: 12px; font-size: 1rem; font-weight: 800; background: #16a34a; border-color: #4ade80; color: #fff;">🔨 ${slotNames[slot]} döv</button>`;
                    const plan = gameState.getQuickBuyPlan('craft:' + slot);
                    if (plan.ok) return `<button class="btn-clean btn-quick-craft" data-slot="${slot}" style="padding: 12px; font-size: 0.95rem; font-weight: 800; background: #15803d; border-color: #4ade80; color: #fff;" title="${plan.items.map(i => i.qty.toLocaleString('tr-TR') + ' ' + i.name).join(', ')}">⚡ Eksikleri al ve döv · ~${Math.ceil(plan.total).toLocaleString('tr-TR')} ASTRA</button>`;
                    const why = plan.capBlocked ? 'Silon bu tarif için yetersiz: önce siloyu yükselt.' : (plan.reason || 'Eksik hammadde var.');
                    return `<button class="btn-clean" disabled style="padding: 12px; font-size: 0.85rem; font-weight: 700; background: #334155; border-color: #475569; color: #cbd5e1;">⚠️ ${why}</button>`;
                  })()}
                </div>
              `;
            }).join('')}
          </div>

        </div>
      ` : `
        <!-- 2. SEKME: ÇANTAM & TEÇHİZATLARIM (YENİLENMİŞ KATEGORİK FİLTRE VE SIRALAMA) -->
        <div style="display: flex; flex-direction: column; gap: 12px;">

          <!-- Kategori Filtre Butonları -->
          <div style="display: flex; gap: 8px; flex-wrap: wrap; background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08);">
            <button class="btn-clean btn-bs-cat-filter ${activeCategory === 'all' ? 'active' : ''}" data-cat="all" style="width: auto; padding: 6px 12px; font-size: 0.85rem; ${activeCategory === 'all' ? 'background:#38bdf8; color:#000; font-weight:800;' : 'background:#1e293b; color:#94a3b8;'}">
              🎒 Tümü (${catCounts.all})
            </button>
            <button class="btn-clean btn-bs-cat-filter ${activeCategory === 'weapon' ? 'active' : ''}" data-cat="weapon" style="width: auto; padding: 6px 12px; font-size: 0.85rem; ${activeCategory === 'weapon' ? 'background:#f59e0b; color:#000; font-weight:800;' : 'background:#1e293b; color:#94a3b8;'}">
              🗡️ Silahlar (${catCounts.weapon})
            </button>
            <button class="btn-clean btn-bs-cat-filter ${activeCategory === 'helmet' ? 'active' : ''}" data-cat="helmet" style="width: auto; padding: 6px 12px; font-size: 0.85rem; ${activeCategory === 'helmet' ? 'background:#a855f7; color:#fff; font-weight:800;' : 'background:#1e293b; color:#94a3b8;'}">
              🪖 Miğferler (${catCounts.helmet})
            </button>
            <button class="btn-clean btn-bs-cat-filter ${activeCategory === 'armor' ? 'active' : ''}" data-cat="armor" style="width: auto; padding: 6px 12px; font-size: 0.85rem; ${activeCategory === 'armor' ? 'background:#22c55e; color:#000; font-weight:800;' : 'background:#1e293b; color:#94a3b8;'}">
              🛡️ Gövde Zırhları (${catCounts.armor})
            </button>
            <button class="btn-clean btn-bs-cat-filter ${activeCategory === 'legs' ? 'active' : ''}" data-cat="legs" style="width: auto; padding: 6px 12px; font-size: 0.85rem; ${activeCategory === 'legs' ? 'background:#06b6d4; color:#000; font-weight:800;' : 'background:#1e293b; color:#94a3b8;'}">
              👖 Pantolonlar (${catCounts.legs})
            </button>
            <button class="btn-clean btn-bs-cat-filter ${activeCategory === 'boots' ? 'active' : ''}" data-cat="boots" style="width: auto; padding: 6px 12px; font-size: 0.85rem; ${activeCategory === 'boots' ? 'background:#eab308; color:#000; font-weight:800;' : 'background:#1e293b; color:#94a3b8;'}">
              👢 Botlar (${catCounts.boots})
            </button>
          </div>

          <!-- Toplu Akıllı İşlem Barı & Sıralama -->
          <div class="clean-card" style="border-left: 4px solid #38bdf8; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px 16px;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap:wrap;">
              <span style="font-size: 0.85rem; font-weight: 700; color: #cbd5e1;">📊 Sıralama:</span>
              <select id="select-bs-sort" style="background: #1e293b; color: #fde047; border: 1px solid #475569; border-radius: 6px; padding: 6px 10px; font-size: 0.82rem; font-weight: 700;">
                <option value="level_desc" ${activeSort === 'level_desc' ? 'selected' : ''}>En Yüksek Seviyeden Başla (Azalan)</option>
                <option value="level_asc" ${activeSort === 'level_asc' ? 'selected' : ''}>En Düşük Seviyeden Başla (Artan)</option>
                <option value="durability_asc" ${activeSort === 'durability_asc' ? 'selected' : ''}>Hasarlılar Önce (Dayanıklılık)</option>
              </select>
            </div>

            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="btn-clean btn-armory-upgrade-all" style="width: auto; background: linear-gradient(135deg, #7c3aed, #4f46e5); border-color: #a78bfa; padding: 8px 14px; font-size: 0.84rem; font-weight: 800;">
                ⚡ Hepsini Toplu Geliştir
              </button>
              <button class="btn-clean btn-armory-repair-all" style="width: auto; background: #0284c7; border-color: #38bdf8; padding: 8px 14px; font-size: 0.84rem;" ${damagedArmoryItems.length === 0 ? 'disabled' : ''}>
                🔨 Kırılan Her Şeyi Onar (${damagedArmoryItems.length})
              </button>
              <button class="btn-clean btn-smart-auto-equip" style="width: auto; background: #16a34a; border-color: #4ade80; padding: 8px 14px; font-size: 0.84rem;">
                ⚡ En İyileri Askerlerime Giydir
              </button>
              <button class="btn-clean btn-smart-unequip-all" style="width: auto; background: #334155; border-color: #64748b; padding: 8px 14px; font-size: 0.84rem;">
                🔄 Tümünü Çantaya Topla
              </button>
            </div>
          </div>

          <!-- Özelleştirilmiş Hızlı Geliştirme Paneli -->
          <div class="clean-card" style="border-left: 4px solid #f59e0b; padding: 12px 16px; background: rgba(30,20,10,0.4);">
            <div style="font-size: 0.9rem; font-weight: 800; color: #fde047; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <span>🎯 Özelleştirilmiş Hızlı Geliştirme</span>
              <span style="font-size: 0.75rem; color: #94a3b8; font-weight: normal;">(Sadece belirli seviye ve türdeki eşyaları geliştir)</span>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
              ${lvl1Weapons.length > 0 ? `
                <button class="btn-clean btn-custom-upgrade-shortcut" data-slot="weapon" data-level="1" style="width: auto; padding: 6px 12px; font-size: 0.8rem; background: #7c3aed; border-color: #a78bfa;">
                  ⚡ Sadece Seviye 1 Silahları Geliştir (${lvl1Weapons.length})
                </button>
              ` : ''}
              ${lvl2Weapons.length > 0 ? `
                <button class="btn-clean btn-custom-upgrade-shortcut" data-slot="weapon" data-level="2" style="width: auto; padding: 6px 12px; font-size: 0.8rem; background: #6d28d9; border-color: #a78bfa;">
                  ⚡ Sadece Seviye 2 Silahları Geliştir (${lvl2Weapons.length})
                </button>
              ` : ''}
              ${lvl1Helmets.length > 0 ? `
                <button class="btn-clean btn-custom-upgrade-shortcut" data-slot="helmet" data-level="1" style="width: auto; padding: 6px 12px; font-size: 0.8rem; background: #0284c7; border-color: #38bdf8;">
                  ⚡ Sadece Seviye 1 Miğferleri Geliştir (${lvl1Helmets.length})
                </button>
              ` : ''}
              ${lvl1Armors.length > 0 ? `
                <button class="btn-clean btn-custom-upgrade-shortcut" data-slot="armor" data-level="1" style="width: auto; padding: 6px 12px; font-size: 0.8rem; background: #059669; border-color: #34d399;">
                  ⚡ Sadece Seviye 1 Zırhları Geliştir (${lvl1Armors.length})
                </button>
              ` : ''}

              <!-- Özel Seçici Grubu -->
              <div style="display: flex; gap: 6px; align-items: center; margin-left: auto; flex-wrap:wrap;">
                <select id="custom-up-slot" style="background: #1e293b; color: #fff; border: 1px solid #475569; border-radius: 6px; padding: 5px 8px; font-size: 0.78rem;">
                  <option value="weapon">🗡️ Silah</option>
                  <option value="helmet">🪖 Miğfer</option>
                  <option value="armor">🛡️ Zırh</option>
                  <option value="legs">👖 Pantolon</option>
                  <option value="boots">👢 Bot</option>
                </select>
                <select id="custom-up-level" style="background: #1e293b; color: #fff; border: 1px solid #475569; border-radius: 6px; padding: 5px 8px; font-size: 0.78rem;">
                  <option value="1">Seviye 1</option>
                  <option value="2">Seviye 2</option>
                  <option value="3">Seviye 3</option>
                  <option value="4">Seviye 4</option>
                  <option value="5">Seviye 5</option>
                </select>
                <button class="btn-clean btn-trigger-custom-upgrade" style="width: auto; padding: 5px 12px; font-size: 0.78rem; background: #d97706; border-color: #f59e0b; color: #fff; font-weight: 800;">
                  ⚡ Bu Grubu Geliştir
                </button>
              </div>
            </div>
          </div>

          <!-- Eşya Listesi -->
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${filteredArmoryList.length === 0 ? `
              <div class="clean-card" style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                <div style="font-size: 2.5rem; margin-bottom: 8px;">🎒</div>
                <div style="font-size: 1.1rem; font-weight: 700; color: #fff;">Bu Kategori İçin Çantanızda Eşya Yok</div>
                <div style="font-size: 0.9rem; margin-top: 4px;">Yukarıdaki <strong>"1. YENİ SİLAH & ZIRH DÖV"</strong> sekmesine tıklayarak ordunuz için yeni eşya üretebilirsiniz.</div>
              </div>
            ` : filteredArmoryList.map((entry, idx) => {
              const { source, slotKey, slotName, soldierIndex, soldierName, locationLabel, item, armoryIndex } = entry;
              const isMaxLvl = (item.level || 1) >= (GAME_CONFIG.EQUIPMENT_MAX_LEVEL || 10);
              const nextLvl = (item.level || 1) + 1;
              const maxDur = item.maxDurability || 13;
              const curDur = item.durability != null ? item.durability : maxDur;
              const isDamaged = curDur < maxDur;

              const upCost = !isMaxLvl ? gameState.calculateEquipmentUpgradeCost(item) : null;
              const canAffordUp = upCost ? (
                (state.inventory.iron || 0) >= upCost.ironCost &&
                (state.inventory.wood || 0) >= upCost.woodCost &&
                (state.inventory.fragments || 0) >= upCost.fragCost &&
                state.adAstraBalance >= upCost.adaCost
              ) : false;

              const repCost = isDamaged ? gameState.calculateEquipmentRepairCost(item) : null;
              const canAffordRep = repCost ? (
                (state.inventory.iron || 0) >= repCost.ironCost &&
                (state.inventory.wood || 0) >= repCost.woodCost &&
                state.adAstraBalance >= repCost.adaCost
              ) : false;

              const isEquipped = source === 'soldier';

              return `
                <div class="clean-card" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; border-left: 5px solid ${isEquipped ? '#22c55e' : '#38bdf8'}; padding: 14px 18px;">
                  
                  <!-- Sol: Eşya İkonu, Adı ve Özellikleri -->
                  <div style="display: flex; align-items: center; gap: 14px;">
                    <div style="font-size: 2.2rem; background: rgba(0,0,0,0.4); width: 54px; height: 54px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                      ${item.icon}
                    </div>
                    <div>
                      <div style="font-size: 1.1rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 8px;">
                        <span>${item.name}</span>
                        <span class="card-badge" style="background: #2563eb; color: #fff; border: none; font-size: 0.8rem; padding: 2px 8px;">Seviye ${item.level || 1}</span>
                      </div>
                      <div style="font-size: 0.85rem; color: #94a3b8; margin-top: 3px; display: flex; gap: 12px; flex-wrap:wrap;">
                        <span style="color: #4ade80; font-weight: 700;">
                          ${item.atkBonus > 0 ? `⚔️ +${item.atkBonus} Saldırı ` : ''}${item.hpBonus > 0 ? `❤️ +${item.hpBonus} Can` : ''}
                        </span>
                        <span style="color: ${curDur <= 4 ? '#ef4444' : '#cbd5e1'};">
                          🛡️ Dayanıklılık: <strong>${curDur}/${maxDur}</strong>
                        </span>
                        <span style="color: ${isEquipped ? '#86efac' : '#7dd3fc'}; font-weight: 700;">
                          📍 Konum: ${locationLabel}
                        </span>
                      </div>
                      ${upCost ? `
                        <div style="font-size:0.75rem; color:#a78bfa; margin-top:4px;">
                          ✨ Lv.${nextLvl} Geliştirme: ${upCost.ironCost}⛏️ Demir • ${upCost.woodCost}🌲 Odun • ${upCost.fragCost}🧩 Parça • ${upCost.adaCost}🟣 ASTRA
                        </div>
                      ` : ''}
                      ${repCost ? `
                        <div style="font-size:0.75rem; color:#38bdf8; margin-top:2px;">
                          🔧 Tamir Bedeli: ${repCost.ironCost}⛏️ Demir • ${repCost.woodCost}🌲 Odun • ${repCost.adaCost}🟣 ASTRA
                        </div>
                      ` : ''}
                    </div>
                  </div>

                  <!-- Sağ: Aksiyon Butonları -->
                  <div style="display: flex; gap: 8px; align-items: center; flex-wrap:wrap;">
                    ${!isMaxLvl ? `
                      <button class="btn-clean btn-armory-direct-upgrade" 
                        data-source="${source}" 
                        data-slot="${slotKey}" 
                        data-armory-idx="${armoryIndex !== undefined ? armoryIndex : ''}" 
                        data-soldier-idx="${soldierIndex !== null ? soldierIndex : ''}" 
                        data-item-id="${item.id}"
                        style="width: auto; background: #7c3aed; border-color: #a78bfa; padding: 10px 16px; font-size: 0.88rem;"
                        ${canAffordUp ? '' : 'disabled'}>
                        ✨ Seviye ${nextLvl}'ye Yükselt
                      </button>
                    ` : `
                      <span style="color: #facc15; font-size: 0.85rem; font-weight: 800; padding: 8px;">🏆 Maksimum Güç</span>
                    `}

                    ${online.active ? `<button class="btn-clean btn-clean-outline btn-sell-equipment" data-source="${source}" data-slot="${slotKey}" data-armory-idx="${armoryIndex !== undefined && armoryIndex !== null ? armoryIndex : ''}" data-soldier-idx="${soldierIndex !== null ? soldierIndex : ''}" style="width:auto; padding:10px 12px; font-size:0.82rem; border-color:#f59e0b; color:#fcd34d;" title="İlan pazarına koy: komisyon %2, 7 gün, en çok 10 ilan">🏷️ Pazara koy</button>` : ''}
                    ${(() => { const rv = gameState.getRecycleValue ? gameState.getRecycleValue(item) : null; if (!rv) return ''; const txt = `${rv.wood}🌲 ${rv.iron}⛏️${rv.coal ? ` ${rv.coal}⚫` : ''}`; return `<button class="btn-clean btn-clean-outline btn-recycle-equipment" data-source="${source}" data-slot="${slotKey}" data-armory-idx="${armoryIndex !== undefined && armoryIndex !== null ? armoryIndex : ''}" data-soldier-idx="${soldierIndex !== null ? soldierIndex : ''}" data-value="${txt}" style="width:auto; padding:10px 12px; font-size:0.82rem; border-color:#f97316; color:#fdba74;" title="Geri dönüşüm: hammaddelerin %70'i geri gelir, ASTRA gelmez; eşya yok olur">♻️ Geri dönüştür (${txt})</button>`; })()}
                    ${isDamaged ? `
                      <button class="btn-clean btn-armory-repair btn-equip-repair" 
                        data-slot="${slotKey}" 
                        data-soldier-idx="${soldierIndex !== null ? soldierIndex : ''}"
                        style="width: auto; background: #0284c7; border-color: #38bdf8; padding: 10px 14px; font-size: 0.88rem;"
                        ${canAffordRep ? '' : 'disabled'}>
                        🔧 Onar (${repCost ? repCost.adaCost : 0} ASTRA)
                      </button>
                    ` : ''}

                    ${isEquipped ? `
                      <button class="btn-clean btn-unequip-soldier-slot" 
                        data-soldier-idx="${soldierIndex}" 
                        data-slot="${slotKey}"
                        style="width: auto; background: #475569; border-color: #64748b; padding: 10px 14px; font-size: 0.88rem;">
                        ✕ Üzerinden Çıkar
                      </button>
                    ` : `
                      <button class="btn-clean btn-smart-auto-equip" 
                        style="width: auto; background: #16a34a; border-color: #4ade80; padding: 10px 14px; font-size: 0.88rem;">
                        🛡️ Askerime Giydir
                      </button>
                    `}
                  </div>

                </div>
              `;
            }).join('')}
          </div>

        </div>
      `}
    `;
  }

  // 3. ÇİFTLİK (WHEAT)
  // 3. YENİ BİNALAR (v2 R5/R6): Köy Evleri, Şifahane, Uzay Limanı
  else if (zoneId === 'village') {
    const vi = gameState.getVillageInfo();
    const costTxt = vi.nextHouseCost ? Object.entries(vi.nextHouseCost).map(([k, n]) => `${(RES_META()[k] || {}).icon || ''} ${fmtInt(n)} ${(RES_META()[k] || {}).name || k}`).join(' + ') : '—';
    const canAfford = vi.nextHouseCost ? Object.entries(vi.nextHouseCost).every(([k, n]) => (state.inventory[k] || 0) >= n) : false;
    html = `
      <div class="clean-card">
        <div class="card-title-row"><div class="card-title">🏘️ Köy Evleri</div><div class="card-badge">${vi.houses} ev · ${vi.villagers} / ${vi.capacity} köylü</div></div>
        <div class="clean-desc">Köylüler günde 2 buğday yer; buğday varsa nüfus günde %2 büyür (ev kapasitesine kadar), ${vi.starveDays} gün aç kalırsa günde %5 göç eder. Her köylü günde 1 emek puanı üretir (Konsey projeleri için). Her 10 köylü üretimi %1 artırır (en çok %20). Her asker için 1 köylü gerekir. Universe açılınca köylüler kolonist olarak gönderilebilir.</div>
        ${vi.starving ? `<div style="background:rgba(185,28,28,.25); border:1px solid #ef4444; border-radius:8px; padding:8px 12px; margin-bottom:8px; color:#fca5a5; font-weight:700;">⚠️ Köy aç! ${vi.starvingDays} gündür buğday yok; ${vi.starveDays} günden sonra köylüler göç eder. Günlük ihtiyaç: ${vi.wheatPerDay} buğday.</div>` : ''}
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:8px; font-size:0.85rem;">
          <div class="stat-tile"><span class="stat-tile-label">Köylü</span><strong>${vi.villagers}</strong><span class="stat-tile-sub">kapasite ${vi.capacity} · günde +%${Math.round(vi.growthPerDay * 100)}</span></div>
          <div class="stat-tile"><span class="stat-tile-label">Günlük buğday</span><strong>${vi.wheatPerDay}</strong><span class="stat-tile-sub">depoda ${fmtInt(state.inventory.wheat || 0)}</span></div>
          <div class="stat-tile"><span class="stat-tile-label">Emek puanı</span><strong>${fmtInt(vi.labor)}</strong><span class="stat-tile-sub">günde +${vi.laborPerDay}</span></div>
          <div class="stat-tile"><span class="stat-tile-label">Üretim bonusu</span><strong>+%${Math.round(vi.bonus * 100)}</strong><span class="stat-tile-sub">her 10 köylü +%1</span></div>
          <div class="stat-tile"><span class="stat-tile-label">Asker hakkı</span><strong>${vi.soldiers} / ${vi.soldierCap}</strong><span class="stat-tile-sub">her asker 1 köylü</span></div>
        </div>
      </div>
      <div class="clean-card">
        <div class="card-title-row"><div class="card-title">🏗️ Yeni ev</div><span class="card-badge">${vi.houses} / ${vi.maxHouses} (hesap seviyesi kadar)</span></div>
        <div style="font-size:0.85rem; color:#cbd5e1; margin-bottom:8px;">Bedel: ${costTxt}</div>
        <button class="btn-clean btn-clean-green" id="btn-build-house" style="width:auto; padding:9px 18px;" ${vi.canBuildHouse && canAfford ? '' : 'disabled'}>🏘️ Ev yap (+${GAME_CONFIG.KOY?.VILLAGERS_PER_HOUSE ?? 10} köylü kapasitesi)</button>
        ${!vi.canBuildHouse && vi.houseLimitReason ? `<div style="font-size:0.78rem; color:#94a3b8; margin-top:6px;">${vi.houseLimitReason}.</div>` : (!canAfford ? `<div style="font-size:0.78rem; color:#94a3b8; margin-top:6px;">Malzeme eksik.</div>` : '')}
      </div>`;
  }
  else if (zoneId === 'healer') {
    const S = GAME_CONFIG.SIFAHANE || {};
    const herbs = Math.floor(state.inventory.herb || 0);
    const rows = (state.soldierUnits || []).map((sv, i) => ({ i, sv, info: gameState.getHerbHealInfo(i) })).filter(x => x.info && !x.info.isFull);
    html = `
      <div class="clean-card">
        <div class="card-title-row"><div class="card-title">🌿 Şifahane</div><div class="card-badge">${fmtInt(herbs)} şifalı ot</div></div>
        <div class="clean-desc">Şifalı ot ile iyileştirme: 1 ot = ${S.HP_PER_HERB ?? 5} can; buğday harcanmaz, ASTRA bedeli anında iyileştirmenin %${Math.round((S.ADA_SHARE_WITH_HERB ?? 0.5) * 100)}'i. Şifalı ot yalnız Şifalı Ot Bahçesi seferlerinden gelir.</div>
        ${rows.length === 0 ? '<div style="color:#4ade80; font-weight:700;">✅ Bütün askerler tam can.</div>' : `
        <div style="display:grid; gap:6px;">
          ${rows.map(({ i, sv, info }) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; background:rgba(255,255,255,.04); padding:8px 10px; border-radius:8px; font-size:0.85rem;">
            <span><strong>${sv.name}</strong> · ${info.hp}/${info.maxHp} can</span>
            <button class="btn-clean btn-clean-green btn-heal-herb" data-soldier-idx="${i}" style="width:auto; padding:6px 12px;" ${herbs >= info.herbsNeeded && (state.adAstraBalance || 0) >= info.herbAdaCost ? '' : 'disabled'}>🌿 İyileştir (${info.herbsNeeded} ot + ${fmt3(info.herbAdaCost)} ASTRA)</button>
          </div>`).join('')}
        </div>
        <button class="btn-clean btn-clean-green" id="btn-heal-herb-all" style="margin-top:10px; width:auto; padding:8px 16px;">🌿 Hepsini otla iyileştir</button>`}
        <div style="margin-top:10px;"><button class="btn-clean btn-clean-outline" id="btn-healer-open-barracks" style="width:auto; padding:6px 14px;">⚔️ Kışlaya git (buğdayla iyileştirme)</button></div>
      </div>`;
  }
  else if (zoneId === 'spaceport') {
    const U = GAME_CONFIG.UZAY_LIMANI || {};
    const rk = gameState.getRocketStatus();
    const vi = gameState.getVillageInfo();
    const soldiers = (state.soldierUnits || []).length;
    const genesis = !!state.genesisNftMinted;
    const stage = GAME_CONFIG.UNIVERSE_STAGE || 0;
    const stageNames = ['Aşama 0 — Realm (Universe kapalı)', 'Aşama 1 — Hazırlık (Hazırlık Deposu açık)', 'Aşama 2 — Ön sipariş', 'Aşama 3 — Universe açık'];
    const prep = gameState.getUniversePrepProgress();
    const progress = prep.pct;
    const dp = prep.depot;
    const depotRows = dp.rows.map(r => `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:0.82rem; padding:4px 0; border-bottom:1px solid rgba(255,255,255,.05);"><span>${r.icon} ${r.name}</span><span><strong>${fmtInt(r.stored)}</strong> / ${fmtInt(r.cap)}</span><span style="display:flex; gap:4px;"><button class="btn-clean btn-clean-outline btn-depot-put" data-res="${r.key}" style="width:auto; padding:4px 8px; font-size:0.74rem;" ${dp.open && r.have >= 2 && r.room > 0 ? '' : 'disabled'} title="Elindekinin yarısını depoya koy">📦 yarısını koy (${fmtInt(Math.min(Math.floor(r.have / 2), r.room))})</button><button class="btn-clean btn-clean-outline btn-depot-take" data-res="${r.key}" style="width:auto; padding:4px 8px; font-size:0.74rem;" ${r.stored > 0 ? '' : 'disabled'} title="Hepsini geri al (%${Math.round(dp.cancelFee * 100)} kesinti)">↩️ geri al</button></span></div>`).join('');
    const depotHtml = `
      <div class="clean-card" style="border-color:${dp.open ? '#38bdf8' : '#475569'};">
        <div class="card-title-row"><div class="card-title">📦 Yük İskelesi — Hazırlık Deposu</div><span class="card-badge">${dp.open ? `doluluk %${Math.round(dp.fill * 100)} · değer ${fmt3(dp.value)} ASTRA` : '🔒 Aşama 1\'de açılır'}</span></div>
        <div class="clean-desc">Universe'e götüreceğin hammaddeyi buraya koyarsın: silodan çıkar, pazara giremez. Sınır: her hammaddede ${dp.weeksCap} haftalık Üretim Hakkın; dünya toplamı ${fmtInt(dp.worldCap)} ASTRA değeri (şu an ${fmt3(dp.worldTotal)}). Geri alırsan %${Math.round(dp.cancelFee * 100)} kesinti yakılır. Universe açılış günü depoyu Sirius Konseyi teslim alır.</div>
        ${dp.open ? `<div style="margin-top:8px;">${depotRows}</div>` : ''}
      </div>`;
    const partRows = rk.parts.map(p => `<div style="display:flex; justify-content:space-between;"><span>${p.icon} ${p.name}</span><span style="font-weight:800; color:${p.ok ? '#4ade80' : '#f87171'};">${fmtInt(p.have)} / ${fmtInt(p.need)}</span></div>`).join('');
    html = `
      <div class="clean-card">
        <div class="card-title-row"><div class="card-title">🚀 Uzay Limanı</div><div class="card-badge">${stageNames[stage] || stageNames[0]}</div></div>
        <div class="clean-desc">Universe'e hazırlık merkezi: Roket Rampası (roket görevi), Yük İskelesi (Hazırlık Deposu) ve Gözlem Kulesi (kilitli). Realm tek başına en az 1 yıl oynanır; Universe açıldığında geçiş buradan yapılır.</div>
        <div style="margin:8px 0 4px; font-weight:800; color:#e2e8f0;">Universe'e hazırlık: %${progress}</div>
        <div style="height:10px; background:rgba(255,255,255,.08); border-radius:99px; overflow:hidden;"><div style="height:100%; width:${progress}%; background:linear-gradient(90deg,#38bdf8,#a78bfa);"></div></div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:8px; font-size:0.82rem; margin-top:10px;">
          <div class="stat-tile"><span class="stat-tile-label">Roket</span><strong>${rk.ready ? 'Hazır ✅' : 'Yapılmadı'}</strong><span class="stat-tile-sub">hesap seviyesi ${rk.minLevel}+</span></div>
          <div class="stat-tile"><span class="stat-tile-label">Hazırlık Deposu</span><strong>${dp.open ? `%${Math.round(dp.fill * 100)}` : 'Kilitli'}</strong><span class="stat-tile-sub">${dp.open ? `${fmt3(dp.value)} ASTRA değeri` : 'Aşama 1\'de açılır'}</span></div>
          <div class="stat-tile"><span class="stat-tile-label">Köylü</span><strong>${vi.villagers} / 100</strong><span class="stat-tile-sub">kolonist adayı</span></div>
          <div class="stat-tile"><span class="stat-tile-label">Asker</span><strong>${soldiers} / 10</strong><span class="stat-tile-sub">mürettebat adayı</span></div>
          <div class="stat-tile"><span class="stat-tile-label">Genesis NFT</span><strong>${genesis ? 'Var ✅' : 'Yok'}</strong><span class="stat-tile-sub">gezegen satın alma hakkı</span></div>
        </div>
      </div>
      <div class="clean-card">
        <div class="card-title-row"><div class="card-title">🛠️ Roket Rampası — roket parçaları</div><span class="card-badge">${rk.ready ? '🏅 Roket hazır' : (rk.levelOk ? 'parçalar' : `seviye ${rk.minLevel} gerekli`)}</span></div>
        <div style="display:grid; gap:4px; font-size:0.85rem; color:#cbd5e1; background:rgba(0,0,0,.3); border-radius:8px; padding:10px;">${partRows}</div>
        <div style="margin-top:10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button class="btn-clean btn-clean-green" id="btn-build-rocket" style="width:auto; padding:9px 18px;" ${rk.canBuild ? '' : 'disabled'}>🚀 Roketi yap</button>
          ${rk.reason && !rk.ready ? `<span style="font-size:0.8rem; color:#94a3b8;">${rk.reason}</span>` : ''}
          ${rk.ready ? `<span style="font-size:0.8rem; color:#4ade80;">Roket ${new Date(rk.builtAt).toLocaleDateString('tr-TR')} tarihinde hazırlandı; Universe'e geçiş kilidi burada açılacak.</span>` : ''}
        </div>
      </div>
      ${depotHtml}`;
  }

  // 4. AMM PAZAR YERİ (AUTOMATED MARKET MAKER DEX SWAP & P2P MARKET)
  else if (zoneId === 'market') {
    const marketTabsHtml = `
      <div class="phase2-tab-row">
        <button class="phase2-tab-btn market-tab-btn ${marketActiveTab === 'resources' ? 'active' : ''}" data-tab="resources">🪙 Hammadde & Pandora Havuzları</button>
        <button class="phase2-tab-btn market-tab-btn ${marketActiveTab === 'fragments' ? 'active' : ''}" data-tab="fragments">🧩 Teçhizat Parçaları</button>
        <button class="phase2-tab-btn market-tab-btn ${marketActiveTab === 'p2p_collection' ? 'active' : ''}" data-tab="p2p_collection">👑 P2P Koleksiyon</button>
        <button class="phase2-tab-btn market-tab-btn ${marketActiveTab === 'buyback_vault' ? 'active' : ''}" data-tab="buyback_vault" style="${marketActiveTab === 'buyback_vault' ? 'border-color:#38bdf8; color:#38bdf8;' : ''}">🛡️ Otonom Buyback & Yakım</button>
        <button class="phase2-tab-btn market-tab-btn ${marketActiveTab === 'ilan' ? 'active' : ''}" data-tab="ilan" style="${marketActiveTab === 'ilan' ? 'border-color:#f59e0b; color:#fcd34d;' : ''}">🏷️ İlan Pazarı</button>
      </div>
    `;

    html = `
      <div class="clean-card">
        <div class="card-title-row">
          <div class="card-title">🏪 AMM Pazar Yeri & P2P Koleksiyon Pazarı</div>
          <span style="font-size: 0.85rem; color: #c084fc; font-weight: 700;">Bakiye: ${state.adAstraBalance.toFixed(1)} ASTRA</span>
        </div>
        <div class="clean-desc">
          Hammadde, Pandora Kutusu ve anahtar al-sat. Fiyatı havuzdaki arz belirler: çok alınan pahalanır, çok satılan ucuzlar. Her işlemde %2 hammadde yakılır, %2 ASTRA harcı oyun kasalarına gider.
        </div>
      </div>

      ${marketTabsHtml}
    `;

    const renderAmmTradeCard = (resKey) => {
      const pool = ammMarket.pools[resKey];
      if (!pool) return '';
      const price = ammMarket.getPrice(resKey);
      const invAmount = resKey === 'boxes'
        ? (state.lockedBoxes || 0)
        : resKey === 'keys'
          ? (state.arenaKeys || 0)
          : (state.inventory[resKey] || 0);

      const initialBuy = 1;
      const initialSell = Math.min(1, invAmount > 0 ? invAmount : 1);

      const buyCost = ammMarket.getEstimatedCostForBuy(resKey, initialBuy);
      const sellGain = ammMarket.getEstimatedAdAstraForSell(resKey, initialSell);

      return `
        <div class="amm-card" data-res="${resKey}">
          <div class="amm-card-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="width: 44px; height: 44px; font-size: 1.6rem; display: inline-flex; align-items: center; justify-content: center;">${resImg(resKey, pool.icon, 'width:44px;height:44px;')}</span>
              <div>
                <div style="font-size: 1.02rem; font-weight: 800; color: #fff;">${pool.name}</div>
                <div style="font-size: 0.78rem; color: #94a3b8;">
                  Havuz: <strong>${Math.floor(pool.resourceReserve).toLocaleString('tr-TR')} ${pool.name}</strong> • <strong>${Math.floor(pool.adAstraReserve).toLocaleString('tr-TR')} ASTRA</strong>
                </div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.95rem; font-weight: 800; color: #facc15;">1 ${pool.name} = ${price >= 1000 ? price.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : price.toFixed(4)} ASTRA</div>
              ${(() => {
                const capAll = RES_KEYS().includes(resKey) ? gameState.getWarehouseCapacity() : null;
                const cap = capAll ? capAll[resKey] : null;
                if (!cap) return `<div style="font-size: 0.78rem; color: #cbd5e1;">Elinde: <strong style="color: #4ade80;">${invAmount.toLocaleString('tr-TR')}</strong></div>`;
                const pct = Math.min(100, Math.round(invAmount / cap * 100));
                return `<div style="font-size: 0.78rem; color: #cbd5e1;">Silo: <strong style="color: #4ade80;">${Math.floor(invAmount).toLocaleString('tr-TR')}</strong> / ${cap.toLocaleString('tr-TR')}</div>
                  <div style="height:4px; width:140px; margin:4px 0 0 auto; background:rgba(255,255,255,.08); border-radius:99px; overflow:hidden;"><div style="height:100%; width:${pct}%; background:${pct >= 95 ? '#f2b23a' : '#43d19a'};"></div></div>`;
              })()}
            </div>
          </div>

          <div class="amm-trade-grid">
            <!-- Satın Al (Buy) -->
            <div class="amm-trade-box">
              <div class="amm-trade-title" style="color: #4ade80;">
                <span>🛒</span> <span>${pool.name} Satın Al</span>
              </div>
              <div class="amm-input-row">
                <input type="number" min="1" class="amm-number-input amm-buy-qty" data-res="${resKey}" value="${initialBuy}" placeholder="Adet..." />
              </div>
              <div style="display:flex; gap:4px; flex-wrap:wrap;">${[100, 1000, 10000].map(q => `<button type="button" class="btn-amm-q" data-side="buy" data-res="${resKey}" data-q="${q}" style="padding:3px 8px; font-size:0.72rem; font-weight:700; border-radius:6px; border:1px solid #334155; background:transparent; color:#cbd5e1; cursor:pointer;">+${q.toLocaleString('tr-TR')}</button>`).join('')}</div>
              <div class="amm-est-display">
                <span style="color: #94a3b8;">Ödeyeceğin (harç dahil):</span>
                <strong class="amm-est-cost-text" data-res="${resKey}" style="color: #f87171;">
                  ${isFinite(buyCost) ? `~${buyCost.toFixed(2)} ASTRA` : 'Yetersiz Likidite'}
                </strong>
              </div>
              <button class="btn-clean btn-clean-green btn-amm-confirm-buy" data-res="${resKey}" style="padding: 8px 12px; font-size: 0.82rem;">
                Satın al
              </button>
              ${RES_KEYS().includes(resKey) ? (() => {
                const fq = gameState.getFillWarehouseQty(resKey);
                return `<button class="btn-clean btn-amm-fill" data-res="${resKey}" ${fq.qty > 0 ? '' : 'disabled'} style="padding: 7px 12px; font-size: 0.8rem; margin-top: 6px; background: transparent; border: 1px dashed #4ade80; color: #86efac;" title="Silo dolana kadar al (ADA yetmezse alınabildiği kadar)">
                  Depoyu doldur (${fq.qty.toLocaleString('tr-TR')} adet · ~${Math.ceil(fq.cost).toLocaleString('tr-TR')} ASTRA${fq.limitedByAda ? ', ASTRA kadar' : ''})
                </button>`;
              })() : ''}
            </div>

            <!-- Sat (Sell) -->
            <div class="amm-trade-box">
              <div class="amm-trade-title" style="color: #facc15;">
                <span>💰</span> <span>${pool.name} Sat</span>
              </div>
              <div class="amm-input-row">
                <input type="number" min="1" class="amm-number-input amm-sell-qty" data-res="${resKey}" value="${initialSell}" placeholder="Adet..." />
              </div>
              <div style="display:flex; gap:4px; flex-wrap:wrap;">${[['%25', 0.25], ['Yarısı', 0.5], ['%75', 0.75]].map(([l, f]) => `<button type="button" class="btn-amm-q" data-side="sell" data-res="${resKey}" data-frac="${f}" style="padding:3px 8px; font-size:0.72rem; font-weight:700; border-radius:6px; border:1px solid #334155; background:transparent; color:#cbd5e1; cursor:pointer;">${l}</button>`).join('')}</div>
              <div class="amm-est-display">
                <span style="color: #94a3b8;">Eline geçecek (harç sonrası):</span>
                <strong class="amm-est-gain-text" data-res="${resKey}" style="color: #4ade80;">
                  ~${sellGain.toFixed(2)} ASTRA
                </strong>
              </div>
              <button class="btn-clean btn-clean-outline btn-amm-confirm-sell" data-res="${resKey}" style="padding: 8px 12px; font-size: 0.82rem; border-color: #facc15; color: #fde047;">
                Sat
              </button>
              ${typeof (gameState.state.inventory || {})[resKey] === 'number' ? `
              <button class="btn-clean btn-amm-sell-all" data-res="${resKey}" ${Math.floor(gameState.state.inventory[resKey] || 0) > 0 ? '' : 'disabled'} style="padding: 7px 12px; font-size: 0.8rem; margin-top: 6px; background: transparent; border: 1px dashed #facc15; color: #fde047;" title="Silodaki bütün ${pool.name} tek seferde satılır">
                Hepsini sat (${Math.floor(gameState.state.inventory[resKey] || 0).toLocaleString('tr-TR')} adet)
              </button>` : ''}
            </div>
          </div>
        </div>
      `;
    };

    if (marketActiveTab === 'ilan') {
      html += renderIlanPazariShell();
      dom.modalBody.innerHTML = html;
      displayModal();
      loadIlanPazari();
      return;
    }

    if (marketActiveTab === 'fragments') {
      html += `
        <div class="amm-trade-container">
          ${renderAmmTradeCard('fragments')}
        </div>
      `;
      dom.modalBody.innerHTML = html;
      displayModal();
      return;
    }

    if (marketActiveTab === 'p2p_collection') {
      const listings = gameState.getP2PArtifactListings();
      const userArtifacts = (state.collectionArtifacts || []).filter(a => a.discovered);

      const listingCards = listings.map(item => {
        const cfg = GAME_CONFIG.COLLECTION_ARTIFACTS.find(c => c.id === item.artifactId);
        if (!cfg) return '';
        const isUser = item.isUserListing;

        return `
          <div class="clean-card" style="margin-bottom:10px; background:#121824; border-color:${isUser ? '#ca8a04' : '#334155'}; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:1.8rem;">${cfg.icon}</span>
                <div>
                  <div style="font-weight:800; font-size:0.98rem; color:#fff;">${cfg.name}</div>
                  <div style="font-size:0.75rem; color:#94a3b8;">Satıcı: <strong style="color:${isUser ? '#facc15' : '#38bdf8'};">${item.sellerName} ${isUser ? '(Sen)' : ''}</strong></div>
                </div>
              </div>
              <div style="text-align:right;">
                <span class="card-badge rarity-${cfg.rarity}" style="font-size:0.7rem;">${cfg.rarity.toUpperCase()}</span>
                <div style="font-weight:800; font-size:1.05rem; color:#fde047; margin-top:3px;">🟣 ${item.priceAda.toLocaleString()} ASTRA</div>
              </div>
            </div>
            <div style="font-size:0.76rem; color:#cbd5e1; margin:8px 0; font-style:italic;">"${cfg.lore}"</div>
            <div style="display:flex; justify-content:flex-end;">
              ${isUser ? `
                <button class="btn-clean btn-clean-sm btn-p2p-cancel-listing" data-id="${item.id}" style="width:auto; padding:6px 14px; background:#7f1d1d; border-color:#ef4444;">
                  ❌ İlanı İptal Et
                </button>
              ` : `
                <button class="btn-clean btn-clean-sm btn-p2p-buy-listing" data-id="${item.id}" style="width:auto; padding:6px 16px; background:#15803d; border-color:#22c55e;">
                  🛒 SATIN AL (${item.priceAda} ASTRA)
                </button>
              `}
            </div>
          </div>
        `;
      }).join('');

      const userArtifactOptions = userArtifacts.length > 0 ? userArtifacts.map(a => {
        const cfg = GAME_CONFIG.COLLECTION_ARTIFACTS.find(c => c.id === a.id);
        return `<option value="${a.id}">${cfg ? cfg.icon + ' ' + cfg.name : a.id}</option>`;
      }).join('') : '<option value="">Keşfedilmiş eser yok</option>';

      html += `
        <div class="clean-card" style="border-color:#ca8a04; background:#161007; margin-bottom:12px;">
          <div class="card-title-row">
            <div class="card-title">👑 P2P Koleksiyon Eseri Satış İlanı Oluştur</div>
            <span class="card-badge" style="color:#fde047;">${userArtifacts.length} Eser Sahip</span>
          </div>
          <div class="clean-desc">Zindandan veya Pandora Kutularından çıkardığın nadir koleksiyon eserlerini istediğin ASTRA fiyatı ile diğer oyunculara sat!</div>
          
          ${userArtifacts.length > 0 ? `
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; align-items:center;">
              <select id="p2p-artifact-select" style="flex:1; background:#10141e; color:#fff; border:1px solid #ca8a04; padding:8px 12px; border-radius:6px; font-family:var(--font-game);">
                ${userArtifactOptions}
              </select>
              <input type="number" id="p2p-price-input" min="10" value="150" placeholder="ADA Fiyat..." style="width:120px; background:#10141e; color:#fde047; border:1px solid #ca8a04; padding:8px 12px; border-radius:6px; font-weight:800; font-family:var(--font-game);" />
              <button id="btn-create-p2p-listing" class="btn-clean btn-clean-gold" style="width:auto; padding:8px 18px;">
                🚀 İLAN VER
              </button>
            </div>
          ` : `
            <div style="color:#94a3b8; font-size:0.82rem; margin-top:8px;">⚠️ Henüz keşfettiğin bir koleksiyon eseri yok. Zindan bosslarını yenerek veya Pandora Kutusu açarak eser kazanabilirsin.</div>
          `}
        </div>

        <div style="font-weight:800; font-size:0.95rem; color:#fde047; margin:14px 0 8px 2px;">🛍️ Canlı Pazar İlanları (${listings.length} İlan):</div>
        <div>
          ${listings.length > 0 ? listingCards : '<div class="clean-card" style="text-align:center; color:#94a3b8;">Pazarda henüz açık ilan bulunmuyor.</div>'}
        </div>
      `;

      dom.modalBody.innerHTML = html;
      displayModal();
      return;
    }

    if (marketActiveTab === 'buyback_vault') {
      const analysis = ammMarket.getBuybackAnalysis(0.10);
      const lastReport = ammMarket.getLastBuybackReport();

      html += `
        <div class="clean-card" style="border-color: #38bdf8; background: rgba(15, 23, 42, 0.85); margin-bottom: 12px; padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <div style="font-weight: 800; font-size: 1.05rem; color: #38bdf8; display: flex; align-items: center; gap: 8px;">
                <span>🛡️</span> <span>AMM Hazine Rezervi & Otonom Buyback-Burn Motoru</span>
              </div>
              <div style="font-size: 0.78rem; color: #94a3b8; margin-top: 4px; max-width: 580px; line-height: 1.4;">
                Oyundaki <strong>tüm ASTRA harcamalarının %18'i</strong> doğrudan bu kasaya akar. Varlıklar başlangıç fiyatından düştükçe üstel katsayıyla (döngü başına %10 tavan) piyasadan malzeme satın alınıp kalıcı yakılır.
              </div>
            </div>
            <div style="text-align: right; background: rgba(30,41,59,0.6); padding: 8px 14px; border-radius: 8px; border: 1px solid rgba(56,189,248,0.2);">
              <div style="font-size: 0.72rem; color: #94a3b8;">AMM Kasası Mevcut Bakiye:</div>
              <div style="font-size: 1.25rem; font-weight: 900; color: #facc15;">${analysis.availableTreasury.toLocaleString('tr-TR')} ASTRA</div>
              <div style="font-size: 0.72rem; color: #38bdf8; margin-top: 2px;">Döngü Başına Müdahale Tavanı (%10): <strong>${analysis.maxCycleFund.toLocaleString('tr-TR')} ASTRA</strong></div>
            </div>
          </div>
        </div>

        <!-- 6 Varlık Analiz Tablosu -->
        <div class="clean-card" style="margin-bottom: 12px; padding: 12px;">
          <div style="font-weight: 800; font-size: 0.9rem; color: #fde047; margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center;">
            <span>📊 6 Varlık Piyasa Durumu & Hazine Tahsis Matrisi (%75 Hammadde Ağırlığı)</span>
            <span style="font-size:0.75rem; color:#94a3b8;">Aciliyet Katsayısı: %${(analysis.maxUrgency * 100).toFixed(2)}</span>
          </div>

          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: #94a3b8;">
                  <th style="padding: 6px 8px;">Varlık</th>
                  <th style="padding: 6px 8px;">Genesis Fiyat</th>
                  <th style="padding: 6px 8px;">Anlık Fiyat</th>
                  <th style="padding: 6px 8px;">Düşüş (Δ)</th>
                  <th style="padding: 6px 8px;">Hazine Ağırlığı</th>
                  <th style="padding: 6px 8px;">Ayrılan Bütçe</th>
                  <th style="padding: 6px 8px;">Yakılacak Adet</th>
                </tr>
              </thead>
              <tbody>
                ${analysis.assets.map(a => {
                  const isCrashed = a.dropPct >= 50;
                  const isDrop = a.dropPct > 0;
                  const dropColor = isCrashed ? '#ef4444' : isDrop ? '#f97316' : '#22c55e';
                  return `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                      <td style="padding: 8px; font-weight: 700; color: #fff;">${a.icon} ${a.name}</td>
                      <td style="padding: 8px; color: #94a3b8;">${a.genesisPrice.toLocaleString('tr-TR')} ASTRA</td>
                      <td style="padding: 8px; font-weight: 700; color: #facc15;">${a.currentPrice >= 100 ? a.currentPrice.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : a.currentPrice.toFixed(3)} ASTRA</td>
                      <td style="padding: 8px; font-weight: 800; color: ${dropColor};">
                        ${isDrop ? `-%${a.dropPct}` : '✅ Sağlıklı'}
                      </td>
                      <td style="padding: 8px; color: #38bdf8;">%${Math.round(a.weight * 100)}</td>
                      <td style="padding: 8px; font-weight: 700; color: ${a.allocatedBudget > 0 ? '#f87171' : '#94a3b8'};">
                        ${a.allocatedBudget > 0 ? `${a.allocatedBudget.toLocaleString('tr-TR')} ASTRA` : '0 ASTRA'}
                      </td>
                      <td style="padding: 8px; font-weight: 800; color: ${a.estimatedUnitsToBurn > 0 ? '#4ade80' : '#94a3b8'};">
                        ${a.estimatedUnitsToBurn > 0 ? `🔥 ~${a.estimatedUnitsToBurn.toLocaleString('tr-TR')} Adet` : '-'}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);">
            <div>
              <span style="font-size: 0.82rem; color: #94a3b8;">Bu Döngü Kullanılacak Fon:</span>
              <strong style="font-size: 1.05rem; color: ${analysis.totalFundToSpend > 0 ? '#f87171' : '#4ade80'}; margin-left: 6px;">
                ${analysis.totalFundToSpend.toLocaleString('tr-TR')} ASTRA
              </strong>
            </div>
            <button id="btn-run-amm-buyback" class="btn-clean btn-clean-gold" style="padding: 8px 18px; font-weight: 800; font-size: 0.85rem; width: auto;" ${analysis.totalFundToSpend <= 1 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
              ⚡ OTONOM BUYBACK & YAKIM ÇALIŞTIR
            </button>
          </div>
        </div>

        ${lastReport ? `
          <div class="clean-card" style="background: rgba(30, 41, 59, 0.4); border-color: rgba(255,255,255,0.08); padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-weight: 800; font-size: 0.85rem; color: #4ade80;">✅ Son Buyback Operasyonu Raporu</span>
              <span style="font-size: 0.72rem; color: #94a3b8;">${new Date(lastReport.timestamp).toLocaleString('tr-TR')}</span>
            </div>
            <div style="font-size: 0.78rem; color: #cbd5e1; margin-bottom: 8px;">
              Hazine Kasasından Toplam <strong>${lastReport.totalSpent.toLocaleString('tr-TR')} ASTRA</strong> harcandı ve malzemeler yakılarak total arzdan silindi:
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${lastReport.items.map(item => `
                <div style="background: rgba(15,23,42,0.6); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06); font-size: 0.75rem;">
                  <span>${item.icon} ${item.name}:</span>
                  <strong style="color: #4ade80;">-${item.unitsBurned.toLocaleString('tr-TR')} Adet</strong>
                  <span style="color: #fde047;">(${item.budgetSpent.toLocaleString('tr-TR')} ASTRA)</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      `;

      dom.modalBody.innerHTML = html;
      displayModal();
      return;
    }

    html += `
      <!-- Havuzlar: 6 hammadde + Pandora kutusu + anahtar -->
      <div class="amm-trade-container">
        ${RES_KEYS().map(k => renderAmmTradeCard(k)).join('')}
        ${renderAmmTradeCard('boxes')}
        ${renderAmmTradeCard('keys')}
      </div>
    `;
  }

  // 5. TAVERNA (MATEMATİKSEL BOOSTLAR & OTOMASYON)
  else if (zoneId === 'tavern') {
    const isPaused = gameState.isBotPaused();
    const isBotActive = gameState.isAutoCollectorActive();
    const prereq = gameState.checkBotPrerequisites();
    const expiry = gameState.getAutoCollectorExpiry();
    const remainingMs = isPaused ? (gameState.state.botPausedRemainingMs || 0) : Math.max(0, expiry - Date.now());
    const remHours = Math.floor(remainingMs / (3600 * 1000));
    const remMinutes = Math.floor((remainingMs % (3600 * 1000)) / (60 * 1000));
    const botRemainingText = `${remHours} saat ${remMinutes} dakika`;

    const botCalc = gameState.calculateTavernaBotProfitAndCost();
    const isSiloAutoUpgrade = gameState.state.botSiloAutoUpgrade !== false;

    const n0 = v => Math.round(Number(v) || 0).toLocaleString('tr-TR');
    const expState = k => gameState.state.activeExpeditions?.[k] ? (gameState.state.activeExpeditions[k].isCompleted ? '✅ toplanıyor' : '⏳ sürüyor') : '💤 boşta';
    const statusColor = isPaused ? '#facc15' : (isBotActive ? '#4ade80' : '#94a3b8');
    html = `
      <!-- 1. Bot: durum ve satın alma (en üstte) -->
      <div class="clean-card" style="border-color: ${isPaused ? '#eab308' : (isBotActive ? '#4ade80' : '#f59e0b')}; background: #181109;">
        <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
          <div style="width:84px; height:84px; flex:0 0 auto; font-size:3rem; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.35); border-radius:14px; border:1px solid rgba(255,255,255,.08);">
            <img src="assets/ui/bot.webp" alt="" draggable="false" style="width:76px; height:76px; object-fit:contain; image-rendering:pixelated;" data-fb="text:🤖">
          </div>
          <div style="flex:1; min-width:220px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
              <div style="font-size:1.1rem; font-weight:900; color:#fff;">Otomasyon Botu</div>
              <div class="card-badge" style="color:${statusColor}; font-weight:800;">${isPaused ? `⏸️ Duraklatıldı · ${botRemainingText} donduruldu` : (isBotActive ? `✅ Çalışıyor · ${botRemainingText} kaldı` : '💤 Kapalı')}</div>
            </div>
            <div style="font-size:0.85rem; color:#cbd5e1; line-height:1.5; margin-top:4px;">
              Sen yokken altı alanda (buğday, taş, odun, kömür, demir, şifalı ot) seferleri kendisi başlatır, staminayı buğdayla doldurur ve aletleri onarır. Ücreti, botun sana kazandıracağı <strong>günlük net kârın yarısı</strong>: şu an 24 saat için <strong style="color:#facc15;">~${n0(botCalc?.dailyBotCostAda || botCalc?.botCostAda)} ASTRA</strong> (sana kalan net kâr ~${n0((botCalc?.dailyNetProfitAda || botCalc?.netProfitAda || 0) - (botCalc?.dailyBotCostAda || botCalc?.botCostAda || 0))} ASTRA).
            </div>
          </div>
        </div>
        ${isPaused ? `
          <div style="background: rgba(234,179,8,0.15); border: 1px solid #ca8a04; border-radius: 8px; padding: 10px 12px; margin-top: 10px; font-size: 0.82rem; color: #fef08a; line-height:1.5;">
            <strong>Bot bekliyor:</strong> çalışmak ve aletleri onarmak için deponda en az 50 demir, 50 odun, 50 buğday ve 50 ASTRA olmalı. Kalan süren (${botRemainingText}) bu sırada azalmaz.
            <br><strong>Eksikler:</strong> ${prereq.missingText} — tamamladığın anda bot kaldığı yerden devam eder.
          </div>
        ` : ''}
        <div class="bot-package-row" style="margin-top:12px;">
          ${((GAME_CONFIG.TAVERNA_BOT && GAME_CONFIG.TAVERNA_BOT.PACKAGE_HOURS) || [24]).map(h => `
            <button class="btn-clean btn-gold btn-buy-bot-package" id="${h === 24 ? 'btn-buy-taverna-bot' : 'btn-buy-taverna-bot-' + h}" data-hours="${h}">
              <span class="pkg-title">${isBotActive ? '⚡ +' + h + ' saat uzat' : '🤖 ' + h + ' saatlik bot'}</span>
              <span class="pkg-price" data-bot-pkg-price="${h}">${gameState.getBotPackageCost(h).toLocaleString('tr-TR')} ASTRA</span>
            </button>`).join('')}
          ${!gameState.state.botTrialUsed ? `
            <button class="btn-clean btn-outline" id="btn-start-bot-trial">
              <span class="pkg-title">🎁 ${(GAME_CONFIG.TAVERNA_BOT && GAME_CONFIG.TAVERNA_BOT.TRIAL_HOURS) || 1} saat ücretsiz dene</span>
              <span class="pkg-price">Bir kerelik hediye</span>
            </button>` : ''}
        </div>
      </div>

      <!-- 2. Seferlerin durumu -->
      <div class="clean-card" style="padding:12px 14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <span style="font-weight:800; font-size:0.88rem; color:${isBotActive ? '#4ade80' : '#94a3b8'};">${isBotActive ? '🟢 Bot çalışıyor' : '⚪ Bot beklemede'} · seferler</span>
          ${isBotActive ? `<button id="btn-trigger-bot-cycle" class="btn-clean" style="width:auto; padding:4px 10px; font-size:0.75rem; background:rgba(34,197,94,0.2); border:1px solid #22c55e; color:#4ade80; cursor:pointer;" title="Boştaki seferleri hemen başlat">⚡ Boş seferleri şimdi başlat</button>` : ''}
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:8px; font-size:0.8rem;">
          ${RES_KEYS().map(k => { const mm = RES_META()[k] || {}; return [k, mm.name || k, mm.color || '#94a3b8', mm.icon || '']; }).map(([k, nm, c, e]) => `
            <div style="background:rgba(255,255,255,0.04); padding:8px 10px; border-radius:6px; border-left:3px solid ${c}; display:flex; align-items:center; gap:8px;">
              <span style="width:22px; height:22px; display:inline-flex;">${resImg(k, e, 'width:22px;height:22px;')}</span>
              <span><span style="color:#94a3b8;">${nm}:</span> <strong style="color:#fff;">${expState(k)}</strong></span>
            </div>`).join('')}
        </div>
      </div>

      <!-- 3. Ayarlar -->
      <div class="clean-card" style="padding:12px 14px;">
        <div style="font-weight:800; font-size:0.88rem; color:#e2e8f0; margin-bottom:8px;">⚙️ Bot ayarları</div>
        <div style="font-size:0.8rem; color:#94a3b8; margin-bottom:4px;">Silo dolarsa:</div>
        <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 0.8rem; color: #cbd5e1; cursor: pointer; margin-bottom: 4px;">
          <input type="radio" name="bot_silo_opt" value="upgrade" ${isSiloAutoUpgrade ? 'checked' : ''} style="margin-top:2px;" />
          <span><strong>Siloyu büyüt</strong> — güvenlik payının üstündeki ASTRA'yı kullanır, yetmezse fazla ürünü satar.</span>
        </label>
        <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 0.8rem; color: #cbd5e1; cursor: pointer; margin-bottom: 10px;">
          <input type="radio" name="bot_silo_opt" value="sell" ${!isSiloAutoUpgrade ? 'checked' : ''} style="margin-top:2px;" />
          <span><strong>Fazlasını sat</strong> — silonun yarısını yedek tutar, fazlasını pazarda satar.</span>
        </label>
        <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer; border-top:1px solid rgba(255,255,255,.06); padding-top:10px;">
          <input type="checkbox" id="chk-bot-auto-renew" style="margin-top: 3px; transform: scale(1.2); accent-color: #10b981; cursor: pointer;" ${gameState.state.botAutoRenew24h ? 'checked' : ''} />
          <span style="font-size:0.8rem; color:#cbd5e1;"><strong style="color:#34d399;">Süre bitince otomatik yenile</strong> — hesabında yeterli ASTRA varsa bot 24 saat daha çalışır.</span>
        </label>
      </div>

      <!-- 4. Ayrıntı -->
      <details class="clean-card" style="padding:12px 14px;">
        <summary style="cursor:pointer; font-weight:800; font-size:0.86rem; color:#fde047;">📊 Ücret nasıl hesaplanıyor?</summary>
        <div style="display:grid; grid-template-columns: 1fr auto; gap:6px; font-size:0.8rem; color:#cbd5e1; margin-top:10px;">
          <div>24 saatlik üretimin pazar değeri</div><div style="text-align:right; font-weight:700; color:#4ade80;">+${n0(botCalc?.dailyGrossValAda || botCalc?.grossRevenueAda)} ASTRA</div>
          <div>Stamina için buğday (${n0(botCalc?.dailyWheatNeededForStamina)} buğday)</div><div style="text-align:right; font-weight:700; color:#f87171;">−${n0(botCalc?.dailyStaminaCostAda || botCalc?.staminaWheatCostAda)} ASTRA</div>
          <div>Alet onarımı</div><div style="text-align:right; font-weight:700; color:#f87171;">−${n0(botCalc?.dailyToolRepairAda || botCalc?.toolRepairCostAda)} ASTRA</div>
          <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:4px; font-weight:800; color:#fff;">Net kâr</div><div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:4px; text-align:right; font-weight:800; color:#38bdf8;">+${n0(botCalc?.dailyNetProfitAda || botCalc?.netProfitAda)} ASTRA</div>
          <div style="font-weight:800; color:#ca8a04;">Bot ücreti (net kârın yarısı)</div><div style="text-align:right; font-weight:900; color:#facc15;">${n0(botCalc?.dailyBotCostAda || botCalc?.botCostAda)} ASTRA</div>
        </div>
        <div style="font-size:0.78rem; color:#94a3b8; margin-top:10px; line-height:1.5;">
          🛡️ <strong>Güvenlik payı:</strong> Bot kasanda en az <strong>${gameState.getBotAdaReserve().toLocaleString('tr-TR')} ASTRA</strong> bırakır${gameState.state.botAutoRenew24h ? ' (ertesi günün bot ücreti dahil)' : ''}. Siloyu bu parayla büyütmez; alet onarımı için önce fazla ürünü satar, satacak ürün kalmazsa botun durmaması için onarımı bu paradan yapar. Oyun kapalıyken de çalışır; döndüğünde "Sen yokken olanlar" raporunu görürsün.
        </div>
      </details>
    `;
  }

  // 6. KARNAVAL & SİRK (ŞENLİKLER, 14 ÖDÜLLÜ ÇARK & HAFTALIK PİYANGO)
  else if (zoneId === 'carnival') {
    html = renderCarnivalHtml(window.carnivalActiveTab || 'wheel');
  }

  dom.modalBody.innerHTML = html;
  displayModal();

  if (zoneId === 'carnival' && (window.carnivalActiveTab || 'wheel') === 'wheel') {
    initCarnivalWheelCanvas();
    requestAnimationFrame(() => initCarnivalWheelCanvas());
    setTimeout(() => initCarnivalWheelCanvas(), 60);
  }
}

// =========================================================================
// 4.5 PHASE 2: ASKERİ KIŞLA (18 KİŞİLİK ORDU & AKILLI SİLAH DEPOSU)
// =========================================================================
// Kışla (Ordu + Cephanelik): yeni arayüz js/ui/barracks.js içinde (4 Ekim 2026)
function renderBarracksHtml() {
  return barracksUI.render();
}

// =========================================================================
// 4.4B KRALLIK KARNAVALI & ŞANS ÇARKI (15 ÖDÜL) & HAFTALIK PİYANGO
// =========================================================================
window.carnivalActiveTab = 'wheel';
window.carnivalWheelRotation = 0;
window.carnivalWheelIsSpinning = false;

const WHEEL_COLORS = [
  '#7c3aed', '#059669', '#d97706', '#dc2626', '#2563eb', 
  '#db2777', '#0891b2', '#4f46e5', '#ca8a04', '#16a34a',
  '#9333ea', '#e11d48', '#0284c7', '#ea580c', '#10b981',
  '#8b5cf6', '#f59e0b', '#06b6d4'
];

function getResourceNameTr(key) {
  if (!key) return '';
  const map = {
    wood: 'Odun',
    iron: 'Demir',
    wheat: 'Buğday',
    ada: 'ASTRA',
    adastra: 'ASTRA',
    ticket: 'Bilet',
    fragments: 'Teçhizat Parçası',
    boxes: 'Pandora Kutusu',
    keys: 'Anahtar'
  };
  return map[String(key).toLowerCase()] || (window.gameState?.getResourceNameTr ? window.gameState.getResourceNameTr(key) : key);
}

// Çarkın dürüst ortalama dönüşü: bot hariç; 3 bilet parçası = 1 bedava çevirme hesaba katılır
function wheelReturnStats(wheelRewards) {
  const W = wheelRewards.reduce((s, r) => s + (r.weight || 0), 0) || 10000;
  const shard = wheelRewards.filter(r => r.type === 'ticket_shard').reduce((s, r) => s + r.weight / W, 0);
  const base = wheelRewards.filter(r => r.type !== 'ticket_shard' && r.type !== 'bot_free').reduce((s, r) => s + (r.weight / W) * (r.valAda || 0), 0);
  const rtp = base / (1 - shard / 3) / (GAME_CONFIG.CARNIVAL?.WHEEL_COST_ADA || 100) * 100;
  const back = wheelRewards.filter(r => (r.valAda || 0) >= 100 && r.type !== 'bot_free').reduce((s, r) => s + r.weight / W, 0) * 100;
  return { rtp: Math.round(rtp), back: Math.round(back) };
}

const WHEEL_SHORT_LABELS = {
  'ada_5000': '5K ASTRA 💎',
  'frag_10': '10 Parça',
  'raw_1000_wood': '1K Odun',
  'raw_1000_iron': '1K Demir',
  'raw_1000_wheat': '1K Buğday',
  'raw_100_wood': '100 Odun',
  'raw_100_iron': '100 Demir',
  'raw_100_wheat': '100 Buğday',
  'free_bot_24h': '24s Bot',
  'ada_200': '200 ASTRA',
  'ada_1000': '1K ASTRA 👑',
  'ada_50': '50 ASTRA',
  'box_key': 'Kutu Anahtarı',
  'wheel_ticket_shard': 'Bilet Parça',
  'coin_analysis_code': 'Coin Analiz'
};

function drawCarnivalWheel(ctx, angle = 0) {
  if (!ctx || !ctx.canvas) return;
  angle = Number(angle) || 0;
  const canvas = ctx.canvas;
  if (!canvas.width || canvas.width === 0) canvas.width = 460;
  if (!canvas.height || canvas.height === 0) canvas.height = 460;
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = cx - 12;

  ctx.clearRect(0, 0, width, height);

  const rewards = GAME_CONFIG.CARNIVAL?.WHEEL_REWARDS || [];
  const numSlices = rewards.length;
  if (numSlices === 0) return;
  const arc = (2 * Math.PI) / numSlices;

  // 1. Dış Halka & Arka Plan
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 8, 0, 2 * Math.PI);
  ctx.fillStyle = '#1c1328';
  ctx.fill();
  ctx.lineWidth = 7;
  const outerGrad = ctx.createRadialGradient(cx, cy, radius, cx, cy, radius + 8);
  outerGrad.addColorStop(0, '#f59e0b');
  outerGrad.addColorStop(0.5, '#fef08a');
  outerGrad.addColorStop(1, '#b45309');
  ctx.strokeStyle = outerGrad;
  ctx.stroke();
  ctx.restore();

  // 2. Dilimleri Çiz
  for (let i = 0; i < numSlices; i++) {
    const startAngle = angle + i * arc;
    const endAngle = startAngle + arc;
    const r = rewards[i];

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.closePath();

    ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
    ctx.fill();

    // Dilim İç Gölgelendirme (Radial Gradient)
    const sliceGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius);
    sliceGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
    sliceGrad.addColorStop(0.5, 'rgba(0,0,0,0.15)');
    sliceGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sliceGrad;
    ctx.fill();

    // Dilim Altın Ayracı
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Dilim Metin ve Simgesi
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(startAngle + arc / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    // İkon
    ctx.font = '16px "Segoe UI Emoji", sans-serif';
    ctx.fillText(r.icon || '🎁', radius - 12, 0);

    // Kısa İsim
    const label = WHEEL_SHORT_LABELS[r.id] || (r.name ? r.name.substring(0, 10) : '');
    ctx.font = 'bold 9.5px "Outfit", "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 3;
    ctx.fillText(label, radius - 34, 0);

    ctx.restore();
  }

  // 3. Dış Pimler (Bulbs/Pegs)
  for (let i = 0; i < numSlices; i++) {
    const pegAngle = angle + i * arc;
    const px = cx + Math.cos(pegAngle) * (radius + 2);
    const py = cy + Math.sin(pegAngle) * (radius + 2);

    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#eab308';
    ctx.stroke();
    ctx.restore();
  }

  // 4. Merkez Göbek (Central Hub Badge)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 32, 0, 2 * Math.PI);
  const hubGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 32);
  hubGrad.addColorStop(0, '#fef08a');
  hubGrad.addColorStop(0.7, '#eab308');
  hubGrad.addColorStop(1, '#78350f');
  ctx.fillStyle = hubGrad;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fde047';
  ctx.stroke();

  // Göbek İç Daire
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, 2 * Math.PI);
  ctx.fillStyle = '#3b0764';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#c084fc';
  ctx.stroke();

  // Göbek İkonu
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('👑', cx, cy);
  ctx.restore();
}

function updateCarnivalWheelUI(options = { updateShards: true }) {
  const state = gameState.state;
  const shards = state.wheelTicketShards || 0;
  const myTickets = state.lotteryTickets || 0;

  // 1. Amorti Bilet Parçaları Rozeti Canlı Güncelleme
  if (options.updateShards) {
    const shardsBadge = document.getElementById('carnival-shards-badge');
    if (shardsBadge) {
      shardsBadge.innerHTML = `🎟️ Amorti Bilet Parçaları: <strong>${shards}/3</strong> ${shards >= 3 ? '🎉 (+1 Bilet Eklendi!)' : ''}`;
      shardsBadge.style.transform = 'scale(1.12)';
      shardsBadge.style.borderColor = '#fde047';
      shardsBadge.style.background = 'rgba(250,204,21,0.25)';
      setTimeout(() => {
        if (shardsBadge) {
          shardsBadge.style.transform = 'scale(1)';
          shardsBadge.style.borderColor = 'rgba(250,204,21,0.3)';
          shardsBadge.style.background = 'rgba(0,0,0,0.4)';
        }
      }, 350);
    }
  }

  // 2. Bilet ile Çevir Butonu Canlı Güncelleme
  const ticketBtn = document.getElementById('btn-spin-wheel-ticket');
  if (ticketBtn) {
    ticketBtn.innerHTML = `🎟️ 1 Bilet İle Çevir (${myTickets} Bilet)`;
    ticketBtn.disabled = myTickets <= 0;
    ticketBtn.style.opacity = myTickets > 0 ? '1' : '0.5';
    ticketBtn.style.cursor = myTickets > 0 ? 'pointer' : 'not-allowed';
  }

  // 3. AMM Fiyatlarına Göre Canlı Hammadde Maliyetleri
  for (const k of RES_KEYS()) {
    const mm = RES_META()[k] || {};
    const p = ammMarket.getPrice(k) || 1.0;
    const btn = document.querySelector(`.btn-spin-wheel[data-pay="${k}"]`);
    if (btn) btn.innerHTML = `${mm.icon || ''} ${Math.ceil(gameState.getWheelCostAda() / p)} ${mm.name || k} İle Çevir`;
  }

  // 4. Kazanılan Redeem Kodları Listesi Canlı Güncelleme
  const redeemContainer = document.getElementById('carnival-redeem-codes-container');
  const redeemCodes = state.redeemCodes || [];
  if (redeemContainer) {
    if (redeemCodes.length > 0) {
      redeemContainer.innerHTML = `
        <div class="clean-card" style="border-left: 4px solid #ca8a04;">
          <div style="font-weight: 800; color: #fde047; font-size: 0.9rem; margin-bottom: 6px;">👑 Kazandığın AlphAvax Coin Analiz Kodları:</div>
          ${redeemCodes.map(c => `
            <div style="font-family: monospace; font-size: 0.85rem; color: #fff; background: rgba(0,0,0,0.5); padding: 6px 10px; border-radius: 4px; margin-top: 4px; display:flex; justify-content:space-between; align-items:center;">
              <span>🎟️ Kod: <strong>${c.code}</strong></span>
              <span style="color:#4ade80; font-size:0.75rem;">(Vercel App Redeem Aktif)</span>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      redeemContainer.innerHTML = '';
    }
  }
}

function initCarnivalWheelCanvas() {
  const canvas = document.getElementById('carnival-wheel-canvas');
  if (!canvas) return;
  if (!canvas.width || canvas.width === 0) canvas.width = 460;
  if (!canvas.height || canvas.height === 0) canvas.height = 460;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Çarkı temel oryantasyonda (0 açısında) anında çiziyoruz
  drawCarnivalWheel(ctx, 0);
  window.carnivalWheelCurrentDeg = 0;
  canvas.style.transform = `rotate(${window.carnivalWheelCurrentDeg}deg)`;
}

async function spinCarnivalWheelAnimated(payMethod) {
  if (window.carnivalWheelIsSpinning) return;

  const canvas = document.getElementById('carnival-wheel-canvas');
  const pointer = document.getElementById('carnival-wheel-pointer');
  const statusEl = document.getElementById('carnival-wheel-status-text');
  const resBox = document.getElementById('carnival-wheel-result');

  // Önce gameState çağrısı ile kaynak kontrolü ve ödül tespiti yapılır
  const res = await gameState.spinCarnivalWheel(payMethod);
  if (!res.success) {
    showToast(res.message, 'error');
    return;
  }

  // Harcama anında yansıdı, bilet veya kaynak butonu güncellensin (shards henüz çark durana dek sürpriz kalır)
  updateCarnivalWheelUI({ updateShards: false });
  renderTopBar();

  const rewards = GAME_CONFIG.CARNIVAL?.WHEEL_REWARDS || [];
  const numSlices = rewards.length;
  if (!canvas || numSlices === 0) {
    // Failsafe: Canvas yoksa doğrudan sonucu göster
    showToast(`🎉 Çarktan Kazandın: ${res.rewardSummaryText}`, 'success');
    if (resBox) {
      const buybackReceiptHtml = res.buybackInfo ? `
        <div style="background:rgba(15,23,42,0.92); border:1px solid #22c55e; border-radius:8px; padding:10px 14px; margin-top:12px; text-align:left; font-size:0.82rem; box-shadow:0 4px 14px rgba(34,197,94,0.15);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(34,197,94,0.3); padding-bottom:6px; margin-bottom:8px;">
            <span style="font-weight:900; color:#4ade80;">🏛️ KARNAVAL HAZİNESİ AMM BUYBACK DEKONTU</span>
            <span style="color:#38bdf8; font-weight:800; font-size:0.75rem;">FİZİKİ PİYASA EMRİ</span>
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap:6px; margin-bottom:8px;">
            <div style="background:rgba(255,255,255,0.04); padding:6px 8px; border-radius:6px;">
              <div style="color:#94a3b8; font-size:0.72rem;">🛒 Piyasadan Alınan:</div>
              <div style="font-weight:800; color:#fff;">+${res.buybackInfo.amount.toLocaleString('tr-TR')} ${res.buybackInfo.poolIcon} ${res.buybackInfo.poolName}</div>
            </div>
            <div style="background:rgba(255,255,255,0.04); padding:6px 8px; border-radius:6px;">
              <div style="color:#94a3b8; font-size:0.72rem;">💰 Karnaval Kasası Ödedi:</div>
              <div style="font-weight:800; color:#facc15;">-${res.buybackInfo.adaSpent.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ASTRA</div>
            </div>
            <div style="background:rgba(255,255,255,0.04); padding:6px 8px; border-radius:6px;">
              <div style="color:#94a3b8; font-size:0.72rem;">📈 Canlı AMM Fiyatı:</div>
              <div style="font-weight:800; color:#4ade80;">
                ${res.buybackInfo.oldPrice.toFixed(4)} ➔ ${res.buybackInfo.newPrice.toFixed(4)} ASTRA <span style="font-size:0.72rem; color:#22c55e;">(+%${res.buybackInfo.priceDeltaPct.toFixed(2)})</span>
              </div>
            </div>
          </div>
          <div style="font-size:0.73rem; color:#cbd5e1; line-height:1.4;">
            ℹ️ Bu ödül havadan basılmadı; Karnaval Kasasındaki tohum bütçesiyle doğrudan AMM DEX likidite havuzundan satın alınarak satış baskısı kırıldı ve fiziki olarak hesabınıza teslim edildi.
          </div>
        </div>
      ` : '';

      resBox.innerHTML = `
        <div class="clean-card" style="border:2px solid #ec4899; background:linear-gradient(135deg, rgba(236,72,153,0.3), rgba(168,85,247,0.3)); text-align:center; padding:16px; margin-top:10px;">
          <div style="font-size:2.5rem;">${rewardImg(res.reward, 72)}</div>
          <div style="font-size:1.15rem; font-weight:900; color:#fff; margin-top:4px;">🎉 TEBRİKLER KAZANDINIZ!</div>
          <div style="font-size:1.05rem; font-weight:800; color:#fde047; margin-top:4px;">${res.rewardSummaryText}</div>
          ${buybackReceiptHtml}
        </div>
      `;
    }
    renderTopBar();
    renderHUD();
    updateCarnivalWheelUI({ updateShards: true });
    return;
  }

  // Kazanan dilim indeksi
  let winIndex = rewards.findIndex(r => r.id === res.reward?.id);
  if (winIndex === -1) winIndex = 0;

  // Açı Hesaplaması (İbre 12 o'clock = 270 derece)
  // Dilim i'nin orta açısı saat yönünde (i + 0.5) * (360 / numSlices)
  // Canvas döndürüldüğünde ibrenin altına gelmesi için:
  // wheelAngle = 270 - sliceCenterAngle (mod 360)
  const sliceAngle = 360 / numSlices;
  const sliceCenter = (winIndex + 0.5) * sliceAngle;
  let targetAngleMod = (270 - sliceCenter) % 360;
  if (targetAngleMod < 0) targetAngleMod += 360;

  const currentDeg = window.carnivalWheelCurrentDeg || 0;
  const fullRotations = (5 + Math.floor(Math.random() * 3)) * 360; // 5-7 tam tur
  const currentMod = ((currentDeg % 360) + 360) % 360;
  let delta = targetAngleMod - currentMod;
  if (delta < 0) delta += 360;

  const finalDeg = currentDeg + fullRotations + delta;
  const duration = 4200; // 4.2 saniye akıcı dönüş
  const startTime = performance.now();

  window.carnivalWheelIsSpinning = true;
  document.querySelectorAll('.btn-spin-wheel').forEach(b => b.disabled = true);

  if (statusEl) {
    statusEl.innerHTML = `🌀 <span style="color:#fde047; font-weight:800;">Krallık Çarkı Dönüyor...</span> Şans seninle olsun!`;
  }
  if (resBox) {
    resBox.innerHTML = '';
  }

  // Akıcı Easing Fonksiyonu (Cubic Out)
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  let lastClickSlice = -1;

  function animate(now) {
    // Modal kapanmışsa döngüyü kes
    if (!document.getElementById('carnival-wheel-canvas')) {
      window.carnivalWheelIsSpinning = false;
      return;
    }

    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const easeProgress = easeOutCubic(progress);

    const curAngle = currentDeg + (finalDeg - currentDeg) * easeProgress;
    window.carnivalWheelCurrentDeg = curAngle;
    canvas.style.transform = `rotate(${curAngle}deg)`;

    // İbre çıt çıt efekti (her dilim geçişinde minik sallanma)
    const normAngle = ((270 - curAngle) % 360 + 360) % 360;
    const activeSlice = Math.floor(normAngle / sliceAngle);
    if (activeSlice !== lastClickSlice) {
      lastClickSlice = activeSlice;
      if (pointer) {
        pointer.style.transform = 'rotate(-18deg)';
        setTimeout(() => {
          if (pointer) pointer.style.transform = 'rotate(0deg)';
        }, 40);
      }
    }

    if (progress < 1) {
      window.carnivalWheelAnimFrame = requestAnimationFrame(animate);
    } else {
      // Çark durdu!
      window.carnivalWheelCurrentDeg = finalDeg;
      canvas.style.transform = `rotate(${finalDeg}deg)`;
      if (pointer) pointer.style.transform = 'rotate(0deg)';
      window.carnivalWheelIsSpinning = false;

      // Butonları tekrar aktif et
      document.querySelectorAll('.btn-spin-wheel').forEach(b => {
        const pay = b.getAttribute('data-pay');
        if (pay === 'ticket') {
          const myT = gameState.state.lotteryTickets || 0;
          b.disabled = myT <= 0;
        } else {
          b.disabled = false;
        }
      });

      // Kazanan ödül görseli & kutlama
      const burnedNameTr = res.burnedInfo ? (res.burnedInfo.resourceNameTr || getResourceNameTr(res.burnedInfo.resource)) : '';
      if (res.burnedInfo) {
        showToast(`🔥 ${res.burnedInfo.amount} ${burnedNameTr} anında yakıldı ve sistemden silindi!`, 'warning');
      }
      showToast(`🎉 Çarktan Kazandın: ${res.rewardSummaryText}`, 'success');
      sound.playLevelUp();

      if (statusEl) {
        const burnedTxt = res.burnedInfo ? `<div style="color:#f97316; font-size:0.8rem; margin-top:2px;">🔥 ${res.burnedInfo.amount} ${burnedNameTr} kalıcı olarak yakıldı ve sistemden silindi.</div>` : '';
        statusEl.innerHTML = `🏆 <span style="color:#4ade80; font-size:0.92rem;">Harika! Kazandın: <strong>${res.rewardSummaryText}</strong></span>${burnedTxt}`;
      }

      if (resBox) {
        const burnedBoxTxt = res.burnedInfo ? `<div style="font-size:0.82rem; color:#f97316; margin-top:4px;">🔥 ${res.burnedInfo.amount} ${burnedNameTr} anında yakılarak kalıcı silindi.</div>` : '';
        const buybackReceiptHtml = res.buybackInfo ? `
          <div style="background:rgba(15,23,42,0.92); border:1px solid #22c55e; border-radius:8px; padding:10px 14px; margin-top:12px; text-align:left; font-size:0.82rem; box-shadow:0 4px 14px rgba(34,197,94,0.15);">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(34,197,94,0.3); padding-bottom:6px; margin-bottom:8px;">
              <span style="font-weight:900; color:#4ade80;">🏛️ KARNAVAL HAZİNESİ AMM BUYBACK DEKONTU</span>
              <span style="color:#38bdf8; font-weight:800; font-size:0.75rem;">FİZİKİ PİYASA EMRİ</span>
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap:6px; margin-bottom:8px;">
              <div style="background:rgba(255,255,255,0.04); padding:6px 8px; border-radius:6px;">
                <div style="color:#94a3b8; font-size:0.72rem;">🛒 Piyasadan Alınan:</div>
                <div style="font-weight:800; color:#fff;">+${res.buybackInfo.amount.toLocaleString('tr-TR')} ${res.buybackInfo.poolIcon} ${res.buybackInfo.poolName}</div>
              </div>
              <div style="background:rgba(255,255,255,0.04); padding:6px 8px; border-radius:6px;">
                <div style="color:#94a3b8; font-size:0.72rem;">💰 Karnaval Kasası Ödedi:</div>
                <div style="font-weight:800; color:#facc15;">-${res.buybackInfo.adaSpent.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ASTRA</div>
              </div>
              <div style="background:rgba(255,255,255,0.04); padding:6px 8px; border-radius:6px;">
                <div style="color:#94a3b8; font-size:0.72rem;">📈 Canlı AMM Fiyatı:</div>
                <div style="font-weight:800; color:#4ade80;">
                  ${res.buybackInfo.oldPrice.toFixed(4)} ➔ ${res.buybackInfo.newPrice.toFixed(4)} ASTRA <span style="font-size:0.72rem; color:#22c55e;">(+%${res.buybackInfo.priceDeltaPct.toFixed(2)})</span>
                </div>
              </div>
            </div>
            <div style="font-size:0.73rem; color:#cbd5e1; line-height:1.4;">
              ℹ️ Bu ödül havadan basılmadı; Karnaval Kasasındaki tohum bütçesiyle doğrudan AMM DEX likidite havuzundan satın alınarak satış baskısı kırıldı ve fiziki olarak hesabınıza teslim edildi.
            </div>
          </div>
        ` : '';

        resBox.innerHTML = `
          <div class="clean-card" style="border:2px solid #ec4899; background:linear-gradient(135deg, rgba(236,72,153,0.35), rgba(168,85,247,0.35)); text-align:center; padding:16px; margin-top:10px; animation: pulse 1s infinite alternate;">
            <div style="font-size:3rem; filter: drop-shadow(0 0 12px #fde047);">${res.reward?.icon || '🎁'}</div>
            <div style="font-size:1.25rem; font-weight:900; color:#fff; margin-top:4px;">🎉 TEBRİKLER KAZANDINIZ!</div>
            <div style="font-size:1.1rem; font-weight:800; color:#fde047; margin-top:4px;">${res.rewardSummaryText}</div>
            ${burnedBoxTxt}
            ${buybackReceiptHtml}
          </div>
        `;
      }

      renderTopBar();
      renderHUD();
      updateCarnivalWheelUI({ updateShards: true });
    }
  }

  window.carnivalWheelAnimFrame = requestAnimationFrame(animate);
}

function renderCarnivalHtml(activeTab = 'wheel') {
  window.carnivalActiveTab = activeTab;
  const state = gameState.state;
  const eco = gameState.getEconomyAndPoolsSummary ? gameState.getEconomyAndPoolsSummary() : null;
  const wheelRewards = GAME_CONFIG.CARNIVAL?.WHEEL_REWARDS || [];
  const wheelResBtns = RES_KEYS().map(k => {
    const mm = RES_META()[k] || {};
    const p = ammMarket.getPrice(k) || 1.0;
    return `<button class="btn-clean btn-spin-wheel" data-pay="${k}" ${gameState.getWheelResourceSpinsLeft() > 0 ? '' : 'disabled'} style="background:#1f2937; border-color:${mm.color || '#94a3b8'}; font-weight:800; padding:10px;">
              ${mm.icon || ''} ${Math.ceil(gameState.getWheelCostAda() / p)} ${mm.name || k} İle Çevir
            </button>`;
  }).join('');

  const myTickets = state.lotteryTickets || 0;
  const shards = state.wheelTicketShards || 0;
  const redeemCodes = state.redeemCodes || [];

  const tabsNavHtml = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 14px;">
      <button class="phase2-tab-btn carnival-tab-btn ${activeTab === 'wheel' ? 'active' : ''}" data-carnival-tab="wheel" style="padding: 12px 14px; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; gap: 8px;">
        <span style="font-size: 1.3rem;">🎡</span>
        <span>1. 15 ÖDÜLLÜ ŞANS ÇARKI</span>
      </button>
      <button class="phase2-tab-btn carnival-tab-btn ${activeTab === 'lottery' ? 'active' : ''}" data-carnival-tab="lottery" style="padding: 12px 14px; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; gap: 8px;">
        <span style="font-size: 1.3rem;">🎟️</span>
        <span>2. KRALLIK PİYANGOSU</span>
      </button>
      <button class="phase2-tab-btn carnival-tab-btn ${activeTab === 'pools' ? 'active' : ''}" data-carnival-tab="pools" style="padding: 12px 14px; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; gap: 8px; border-color: #eab308;">
        <span style="font-size: 1.3rem;">🏛️</span>
        <span>3. HAZİNE & HAVUZ ÖDÜLLERİ</span>
      </button>
    </div>
  `;

  let tabContentHtml = '';

  if (activeTab === 'wheel') {
    tabContentHtml = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div class="clean-card" style="border-left: 4px solid #ec4899; background: #1a0f1d;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <div style="font-size: 1.1rem; font-weight: 900; color: #fff; display:flex; align-items:center; gap:8px;">
                <span>🎡 15 Potansiyel Ödüllü Krallık Çarkı</span>
                <span class="card-badge" style="background:#ec4899; color:#fff; border:none; font-weight:800;">Ortalama dönüş ~%${wheelReturnStats(wheelRewards).rtp} • Kasa Garantili</span>
              </div>
              <div style="font-size: 0.85rem; color: #cbd5e1; margin-top:2px;">
                ${gameState.getWheelCostAda().toLocaleString('tr-TR')} ASTRA veya bu tutara denk gelen hammadde ile çevirebilir, ya da piyango biletini çark hakkına dönüştürebilirsin!
              </div>
            </div>
            <div id="carnival-shards-badge" style="font-size:0.82rem; color:#fde047; background:rgba(0,0,0,0.4); padding:6px 14px; border-radius:8px; border:1px solid rgba(250,204,21,0.3); transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, border-color 0.2s ease;">
              🎟️ Amorti Bilet Parçaları: <strong>${shards}/3</strong> ${shards >= 3 ? '🎉 (+1 Bilet Eklendi!)' : ''}
            </div>
          </div>
        </div>

        <!-- 🎡 Gerçek Dönen Şans Çarkı Sahnesi -->
        <div class="carnival-wheel-stage">
          <div class="carnival-wheel-wrapper">
            <!-- İbre (Pointer/Needle) -->
            <div id="carnival-wheel-pointer" class="carnival-wheel-pointer">
              <svg width="34" height="42" viewBox="0 0 34 42" fill="none">
                <path d="M17 40 L4 12 A14 14 0 1 1 30 12 Z" fill="url(#pointerGoldGrad)" stroke="#78350f" stroke-width="2" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.6))" />
                <circle cx="17" cy="14" r="5" fill="#fef08a" stroke="#ca8a04" stroke-width="2" />
                <defs>
                  <linearGradient id="pointerGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#fef08a" />
                    <stop offset="50%" stop-color="#eab308" />
                    <stop offset="100%" stop-color="#b45309" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <!-- HTML5 2D Dönen Çark Canvas'ı -->
            <canvas id="carnival-wheel-canvas" width="460" height="460" class="carnival-wheel-canvas"></canvas>

            <!-- Göbek Rozeti (Hub Cap) -->
            <div class="carnival-wheel-hub">
              <div class="carnival-wheel-hub-inner">
                <span style="font-size: 1.6rem;">🎪</span>
                <span style="font-size: 0.65rem; font-weight: 900; color: #fde047; letter-spacing: 0.5px; text-transform: uppercase;">AdAstra</span>
              </div>
            </div>
          </div>

          <div id="carnival-wheel-status-text" class="carnival-wheel-status">
            🎡 Çevirmek için aşağıdaki ödeme seçeneklerinden birini seçin!
          </div>
        </div>

        <!-- Sonuç Gösterge Kutusu -->
        <div id="carnival-wheel-result"></div>

        ${(() => {
          const ws = gameState.isCarnivalWheelOpen();
          return ws.open ? '' : `<div class="clean-card notice-card notice-warn">🎪 Karnaval kasası yenileniyor (${Math.floor(ws.balance).toLocaleString('tr-TR')} / ${ws.minBalance.toLocaleString('tr-TR')} ASTRA). Kasa en büyük ödülü karşılayacak kadar dolunca çark yeniden açılır.</div>`;
        })()}

        <!-- 4 Farklı Ödeme Yöntemi ile Çarkı Çevir Butonları -->
        <div class="clean-card" style="border-color: #ec4899; background: #120914;">
          <div style="font-size:0.88rem; font-weight:800; color:#f472b6; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <span>🪙 Çarkı Çevirme Seçenekleri (${gameState.getWheelCostAda().toLocaleString('tr-TR')} ASTRA Eşdeğeri):</span>
            <span style="font-size:0.75rem; color:#fde047;">Hammaddenin yarısı yakılır, yarısı satılıp Karnaval kasasına girer · bugün hammaddeyle kalan: ${gameState.getWheelResourceSpinsLeft()}/${GAME_CONFIG.CARNIVAL?.WHEEL_RESOURCE_DAILY_LIMIT ?? 3}</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px;">
            <button class="btn-clean btn-spin-wheel" data-pay="ada" style="background:#7c3aed; border-color:#a78bfa; font-weight:800; padding:10px;">
              🟣 ${gameState.getWheelCostAda().toLocaleString('tr-TR')} ASTRA İle Çevir
            </button>
            ${wheelResBtns}
            <button id="btn-spin-wheel-ticket" class="btn-clean btn-spin-wheel" data-pay="ticket" ${myTickets > 0 ? '' : 'disabled'} style="background:#db2777; border-color:#f472b6; font-weight:800; padding:10px;">
              🎟️ 1 Bilet İle Çevir (${myTickets} Bilet)
            </button>
          </div>
        </div>

        <!-- 15 Ödül Listesi / Detaylı İnceleme Bölümü -->
        <div class="clean-card" style="border-color: rgba(255,255,255,0.1); background: rgba(10,10,18,0.6); padding:12px;">
          <div style="font-size:0.85rem; font-weight:800; color:#cbd5e1; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <span>📋 Çarktaki 15 Dilim Ödül Tablosu: <span style="font-weight:600; color:#94a3b8; font-size:0.75rem;">hammadde, parça ve anahtar ödülleri Karnaval kasasının parasıyla pazardan geri alınıp sana verilir</span></span>
            <span style="font-size:0.75rem; color:#facc15;">${(() => { const w = wheelReturnStats(wheelRewards); return `Ortalama dönüş ~%${w.rtp} · bedelini geri alma ~%${w.back}`; })()}</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 6px;">
            ${(() => {
              const totalWeight = wheelRewards.reduce((s, r) => s + (r.weight || 0), 0) || 10000;
              return wheelRewards.map((r) => {
                const prob = (r.weight / totalWeight) * 100;
                const probText = prob < 0.1 ? prob.toFixed(2) : (prob < 10 ? prob.toFixed(2) : prob.toFixed(1));
                return `
                  <div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 6px 8px; text-align:center;">
                    <div style="font-size: 1.2rem; height: 40px; display: flex; align-items: center; justify-content: center;">${rewardImg(r, 40)}</div>
                    <div style="font-size: 0.74rem; font-weight: 800; color: #fff; line-height: 1.2; margin-top:2px;">${r.name}</div>
                    <div style="font-size: 0.65rem; color: #facc15; margin-top: 2px;">Şans: %${probText}</div>
                  </div>
                `;
              }).join('');
            })()}
          </div>
        </div>

        <div id="carnival-redeem-codes-container">
          ${redeemCodes.length > 0 ? `
            <div class="clean-card" style="border-left: 4px solid #ca8a04;">
              <div style="font-weight: 800; color: #fde047; font-size: 0.9rem; margin-bottom: 6px;">👑 Kazandığın AlphAvax Coin Analiz Kodları:</div>
              ${redeemCodes.map(c => `
                <div style="font-family: monospace; font-size: 0.85rem; color: #fff; background: rgba(0,0,0,0.5); padding: 6px 10px; border-radius: 4px; margin-top: 4px; display:flex; justify-content:space-between; align-items:center;">
                  <span>🎟️ Kod: <strong>${c.code}</strong></span>
                  <span style="color:#4ade80; font-size:0.75rem;">(Vercel App Redeem Aktif)</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

      </div>
    `;
  } else if (activeTab === 'lottery') {
    const lot = gameState.getLotteryStatus();
    const pending = lot.pendingPayout || 0;
    const last = lot.lastResult;
    const nextDraw = globalPool.getNextWeeklyResetTRT ? globalPool.getNextWeeklyResetTRT() : Date.now();
    const fmt = (n) => Math.floor(Number(n) || 0).toLocaleString('tr-TR');
    const blockedBy = lot.canBuy > 0 ? '' : 'Bu haftalık alım sınırın doldu. Yeni hafta Pazartesi 00:01 (TSİ) başlar.';
    tabContentHtml = `
      <div class="lottery-v2">
        <div class="clean-card lottery-hero">
          <div class="card-title-row">
            <div class="card-title">🎟️ Haftalık Krallık Piyangosu</div>
            <span class="card-badge">Çekiliş: Pazartesi 00:01 (TSİ)</span>
          </div>
          <div class="clean-desc">
            Her hafta <strong>tek kazanan</strong> çıkar; kazanma şansın elindeki bilet sayısıyla orantılıdır.
            Kazanan, biletlerine ödediğinin <strong>2 katını</strong> kasadan alır. Kazanamayanın biletleri yanmaz, sonraki haftaya devreder.
          </div>
        </div>

        <div class="stat-grid">
          <div class="stat-tile"><span class="stat-tile-label">Piyango kasası</span><strong class="tone-violet">${fmt(lot.pool)} ASTRA</strong></div>
          <div class="stat-tile"><span class="stat-tile-label">Kazanırsan alacağın</span><strong class="tone-gold">${fmt(lot.potentialPrize)} ASTRA</strong><span class="stat-tile-sub">${fmt(lot.paid)} ASTRA ödedin × 2</span></div>
          <div class="stat-tile"><span class="stat-tile-label">Kazanma şansın</span><strong class="tone-green">%${(lot.chance * 100).toFixed(2)}</strong><span class="stat-tile-sub">${fmt(lot.myTickets)} / ${fmt(lot.totalTickets)} bilet</span></div>
          <div class="stat-tile"><span class="stat-tile-label">Sonraki çekiliş</span><strong>${formatDuration(nextDraw - Date.now())}</strong></div>
        </div>

        <div class="clean-card">
          <div class="card-title-row">
            <div class="card-title">🛡️ Balina koruması: haftalık bilet sınırın</div>
          </div>
          <div class="limit-list">
            ${renderLimitMeter({ icon: '🗓️', label: 'Bu hafta aldığın', used: lot.boughtThisWeek, max: lot.maxPerWeek, note: 'Her hesap haftada en fazla bu kadar bilet alabilir.' })}
          </div>
          <div class="quota-ubi">
            <span>🎟️ Elindeki bilet (önceki haftalardan devredenler dahil)</span>
            <strong>${fmt(lot.myTickets)} bilet</strong>
          </div>
          <div class="pe-note">Kazanmayan biletler yanmaz; kazanana kadar her hafta çekilişe girmeye devam eder.</div>
        </div>

        <div class="clean-card lottery-buy">
          <div class="lottery-buy-row">
            <label for="lottery-ticket-count" class="lottery-buy-label">Bilet adedi</label>
            <input type="number" id="lottery-ticket-count" class="lottery-buy-input" value="${Math.min(1, lot.canBuy) || 1}" min="1" max="${Math.max(1, lot.canBuy)}" ${lot.canBuy > 0 ? '' : 'disabled'} />
            <button id="btn-buy-lottery-action" class="btn-clean btn-gold" ${lot.canBuy > 0 ? '' : 'disabled'}>
              ${lot.canBuy > 0 ? `🎟️ Bilet al (${gameState.getLotteryRules().ticketPrice.toLocaleString('tr-TR')} ASTRA/adet) · en fazla ${lot.canBuy}` : '🚫 Şu an bilet alamazsın'}
            </button>
          </div>
          ${blockedBy ? `<div class="pe-note pe-warn">${blockedBy}</div>` : ''}
          <div class="pe-note">Bilet bedelinin %2'si amorti kasasına (şu an ${fmt(lot.amortiPool)} ASTRA), kalanı piyango kasasına gider. Amorti yalnız kasa biterse kalan tüm biletlere eşit dağıtılır. Beklemek istemezsen biletini çarkta 1 bilet = 1 çevirme olarak kullanabilirsin.</div>
        </div>

        <div class="clean-card lottery-draw-card ${pending > 0 ? 'is-winner' : ''}">
          <div class="card-title-row">
            <div class="card-title">👑 Kazancın</div>
            <span class="card-badge">${pending > 0 ? 'Çekilmeyi bekliyor' : 'Bekleyen kazanç yok'}</span>
          </div>
          <div class="lottery-draw-stats">
            <div><span class="stat-label">Çekilecek kazanç</span><strong class="${pending > 0 ? 'text-win' : ''}">${fmt(pending)} ASTRA</strong></div>
            <div><span class="stat-label">Son çekiliş</span><strong>${last ? (last.userWon ? `🎉 Kazandın (+${fmt(last.wonAmount)} ASTRA)` : (last.amorti > 0 ? `Amorti +${fmt(last.amorti)} ASTRA` : 'Çıkmadı, biletlerin devretti')) : 'Henüz yok'}</strong></div>
          </div>
          <div style="margin-top: 12px;">
            <button id="btn-claim-winner-lottery" class="btn-clean btn-gold" ${pending > 0 ? '' : 'disabled'} style="width:auto;">
              ${pending > 0 ? '🏆 Kazancımı cüzdana çek' : 'Çekilecek kazanç yok'}
            </button>
          </div>
        </div>

        <div id="carnival-lottery-result"></div>
      </div>
    `;
  } else if (activeTab === 'pools') {
    const eData = eco || {
      burnRatePct: 13,
      ubiRatePct: 6,
      teamRatePct: 3,
      treasuryRatePct: 78,
      totalPoolsBalance: 40000000,
      lifetimeBurnedAda: 0,
      solvencyPct: 100,
      totalDeposited: 0,
      totalWithdrawn: 0,
      burnedResources: { wood: 0, iron: 0, wheat: 0 },
      lottery: { lotteryPool: 20000000, winnerMultiplier: 2.0, amortiShare: 400000, rolloverShare: 19600000 },
      pools: []
    };

    tabContentHtml = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        
        <!-- 1. ÜST MAKRO KASA & GÜVENCE KARTI -->
        <div class="clean-card" style="background: linear-gradient(135deg, rgba(26,18,8,0.95), rgba(45,28,10,0.95)); border-color: #eab308; box-shadow: 0 0 25px rgba(234,179,8,0.15);">
          <div class="card-title-row">
            <div class="card-title" style="color: #fef08a; font-size: 1.1rem; display:flex; align-items:center; gap:8px;">
              <span>👑</span>
              <span>Krallık Hazine Defteri & Döngüsel Tokenomics Havuzları</span>
            </div>
            <span class="card-badge" style="color: #4ade80; background: rgba(74,222,128,0.15); border: 1px solid #4ade80; font-weight:800;">
              🛡️ Kasa Ödeme Güvencesi: %${eData.solvencyPct}
            </span>
          </div>
          <div class="clean-desc" style="color: #cbd5e1; font-size: 0.85rem; line-height: 1.5; margin-top: 6px;">
            Karnaval harcamaları dahil, oyundan kazanılan ve harcanan tüm AdAstra'lar matematiksel bir anayasa ile yönetilir: Her harcamadan <strong>%${eData.burnRatePct} kalıcı yakım</strong>, <strong>%${eData.ubiRatePct} Evrensel Temel Gelir (UBI)</strong> ve <strong>%${eData.creatorRatePct} Geliştirici/Team payı</strong> ayrılır; kalan <strong>%${eData.treasuryRatePct} ${eData.pools.length} Krallık hazine kasasına</strong> (${eData.pools.map(p => p.name + ' %' + String(p.sharePct).replace('.', ',')).join(', ')}) aktarılarak oyunculara geri dağıtılır.
          </div>

          ${(() => {
            const lk = gameState.getLockedBalanceInfo();
            const ct = gameState.getContributionInfo();
            const mult = gameState.getAdaPriceMultiplier();
            const f = v => Math.floor(v).toLocaleString('tr-TR');
            return `
          <div style="background: #111827; padding: 12px 14px; border-radius: 8px; border: 1px solid #334155; margin-top: 12px;">
            <div style="display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.88rem; font-weight: 800;">
              <span style="color: #4ade80;">🔓 Serbest: ${f(lk.free)} ASTRA</span>
              <span style="color: #fbbf24;">🔒 Kilitli: ${f(lk.locked)} ASTRA</span>
              <span style="color: #38bdf8;">🏅 Katkı puanı (bu hafta): ${f(ct.week)}</span>
              <span style="color: #c084fc;">💱 Fiyat çarpanı: ×${mult.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}</span>
            </div>
            ${(() => {
              const fp = gameState.getFreePlayerPoolInfo();
              const m = ok => (ok ? '✅' : '❌');
              if (fp.deposited) return '<div style="font-size: 0.78rem; color: #94a3b8; margin-top: 8px;">🎁 Ücretsiz oyuncu payı: hesabına para yatırdığın için bu havuz senin için değil (kazandığın ödüller devam eder).</div>';
              return `<div style="margin-top: 8px; padding: 8px 10px; border-radius: 6px; background: #0b1220; border: 1px dashed #334155; font-size: 0.8rem; color: #cbd5e1; line-height: 1.5;">
                <div style="font-weight: 800; color: #86efac;">🎁 Haftalık ücretsiz oyuncu payı</div>
                ${m(fp.levelOk)} En az ${fp.minLevel}. seviye (sen: ${fp.level}) · ${m(fp.contributionOk)} Bu hafta en az ${fp.needContribution.toLocaleString('tr-TR')} katkı puanı (sen: ${fp.weekContribution.toLocaleString('tr-TR')}) · 📧 e-postan doğrulanmış olmalı<br>
                🔥 Sadakat serin: <strong>${fp.streakWeeks} hafta</strong> → bu haftaki çarpanın <strong>×${fp.streakMultiplier.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</strong> (en çok ×${fp.streakMax}; kaçırılan hafta seriyi yarıya indirir)<br>
                <span style="color: #94a3b8;">Pay, katkın arttıkça hızla büyür: emeğini tek hesapta toplayan, yan hesaplara bölenden çok daha fazla alır. Pay ${fp.locked ? 'kilitli gelir; oyunda harcadıkça çözülür' : 'her kazanç gibi gelir'}.</span>
              </div>`;
            })()}
            <div style="font-size: 0.78rem; color: #94a3b8; margin-top: 6px; line-height: 1.4;">
              Oyundan kazandığın ASTRA'nın %20'si serbest, %80'i kilitli başlar. Kilitli ASTRA'yı oyunda harcayabilirsin; harcadıkça, her gün oynadıkça ve zamanla açılır. İleride çekim yalnız serbest kısımdan yapılacak; ortak haftalık çekim hakkından payını katkı puanın belirleyecek.
            </div>
          </div>`;
          })()}

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-top: 14px;">
            <div style="background: #151a26; padding: 12px 14px; border-radius: 8px; border: 1px solid #583007;">
              <div style="font-size: 0.74rem; color: #94a3b8; font-weight: 700;">Toplam Kilitli Ödül Kasası</div>
              <div style="font-size: 1.25rem; font-weight: 900; color: #fde047; margin-top: 4px;">
                ${eData.totalPoolsBalance.toLocaleString('tr-TR')} <span style="font-size: 0.8rem; color: #c084fc;">ADA</span>
              </div>
            </div>
            <div style="background: #151a26; padding: 12px 14px; border-radius: 8px; border: 1px solid #583007;">
              <div style="font-size: 0.74rem; color: #94a3b8; font-weight: 700;">🔥 Toplam Yakılan ASTRA</div>
              <div style="font-size: 1.25rem; font-weight: 900; color: #f97316; margin-top: 4px;">
                ${eData.lifetimeBurnedAda.toLocaleString('tr-TR')} <span style="font-size: 0.8rem; color: #c084fc;">ADA</span>
              </div>
            </div>
            <div style="background: #151a26; padding: 12px 14px; border-radius: 8px; border: 1px solid #583007;">
              <div style="font-size: 0.74rem; color: #94a3b8; font-weight: 700;">Bugüne Kadar Giren (Inflow)</div>
              <div style="font-size: 1.25rem; font-weight: 900; color: #38bdf8; margin-top: 4px;">
                ${eData.totalDeposited.toLocaleString('tr-TR')} <span style="font-size: 0.8rem; color: #c084fc;">ADA</span>
              </div>
            </div>
            <div style="background: #151a26; padding: 12px 14px; border-radius: 8px; border: 1px solid #583007;">
              <div style="font-size: 0.74rem; color: #94a3b8; font-weight: 700;">Dağıtılan Ödüller (Outflow)</div>
              <div style="font-size: 1.25rem; font-weight: 900; color: #4ade80; margin-top: 4px;">
                ${eData.totalWithdrawn.toLocaleString('tr-TR')} <span style="font-size: 0.8rem; color: #c084fc;">ADA</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. KARNAVAL ÇARKINDA ANINDA YAKILAN HAMMADDELER -->
        <div class="clean-card" style="border-left: 4px solid #f97316; background: rgba(30,15,8,0.7);">
          <div class="card-title-row">
            <div class="card-title" style="color: #fb923c; font-size: 1rem; display:flex; align-items:center; gap:8px;">
              <span>🔥</span>
              <span>Karnaval Çarkında Anında Yakılan Hammaddeler</span>
            </div>
            <span class="card-badge" style="background:#ea580c; color:#fff; font-weight:800;">Dolaşımdan Kalıcı Silinir</span>
          </div>
          <div class="clean-desc" style="font-size:0.83rem; color:#cbd5e1; line-height:1.4;">
            🛡️ <strong>Kural Güvencesi:</strong> Şans çarkını çevirmek için kullanılan odun, demir ve buğdaylar <strong>kesinlikle AMM pazar havuzuna girmez</strong>. Harcandığı saniyede fırında yakılır ve dolaşımdan ebediyen silinir.
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px;">
            <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(249,115,22,0.3); border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 1.5rem;">🌲</div>
              <div style="font-size: 0.78rem; color: #94a3b8; font-weight: 700; margin-top: 2px;">Yakılan Odun</div>
              <div style="font-size: 1.2rem; font-weight: 900; color: #4ade80; margin-top: 4px;">
                ${(eData.burnedResources.wood || 0).toLocaleString('tr-TR')} <span style="font-size:0.75rem; color:#cbd5e1;">Adet</span>
              </div>
            </div>
            <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(249,115,22,0.3); border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 1.5rem;">⛏️</div>
              <div style="font-size: 0.78rem; color: #94a3b8; font-weight: 700; margin-top: 2px;">Yakılan Demir</div>
              <div style="font-size: 1.2rem; font-weight: 900; color: #38bdf8; margin-top: 4px;">
                ${(eData.burnedResources.iron || 0).toLocaleString('tr-TR')} <span style="font-size:0.75rem; color:#cbd5e1;">Adet</span>
              </div>
            </div>
            <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(249,115,22,0.3); border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 1.5rem;">🌾</div>
              <div style="font-size: 0.78rem; color: #94a3b8; font-weight: 700; margin-top: 2px;">Yakılan Buğday</div>
              <div style="font-size: 1.2rem; font-weight: 900; color: #facc15; margin-top: 4px;">
                ${(eData.burnedResources.wheat || 0).toLocaleString('tr-TR')} <span style="font-size:0.75rem; color:#cbd5e1;">Adet</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 2.5. AMM / DEX İŞLEMLERİNDE ALINAN %2 İLE YAKILAN HAMMADDELER -->
        <div class="clean-card" style="border-left: 4px solid #38bdf8; background: rgba(8,24,40,0.7); margin-top: 12px;">
          <div class="card-title-row">
            <div class="card-title" style="color: #38bdf8; font-size: 1rem; display:flex; align-items:center; gap:8px;">
              <span>🔥</span>
              <span>AMM / DEX Pazar İşlemlerinde Yakılan Hammaddeler (%2 Harç)</span>
            </div>
            <span class="card-badge" style="background:#0284c7; color:#fff; font-weight:800;">Dolaşımdan Kalıcı Silinir</span>
          </div>
          <div class="clean-desc" style="font-size:0.83rem; color:#cbd5e1; line-height:1.4;">
            🛡️ <strong>Kural Güvencesi:</strong> AMM DEX pazarında alım ve satım işlemlerinde kesilen <strong>%2.00 hammadde harcı</strong> pazar havuzuna girmez. İşlem anında kalıcı olarak fırında yakılır ve küresel toplam arzdan ebediyen silinir.
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px;">
            <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(56,189,248,0.3); border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 1.5rem;">🌲</div>
              <div style="font-size: 0.78rem; color: #94a3b8; font-weight: 700; margin-top: 2px;">Yakılan Odun</div>
              <div style="font-size: 1.2rem; font-weight: 900; color: #4ade80; margin-top: 4px;">
                ${(eData.ammBurnedResources?.wood || 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} <span style="font-size:0.75rem; color:#cbd5e1;">Adet</span>
              </div>
            </div>
            <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(56,189,248,0.3); border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 1.5rem;">⛏️</div>
              <div style="font-size: 0.78rem; color: #94a3b8; font-weight: 700; margin-top: 2px;">Yakılan Demir</div>
              <div style="font-size: 1.2rem; font-weight: 900; color: #38bdf8; margin-top: 4px;">
                ${(eData.ammBurnedResources?.iron || 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} <span style="font-size:0.75rem; color:#cbd5e1;">Adet</span>
              </div>
            </div>
            <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(56,189,248,0.3); border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 1.5rem;">🌾</div>
              <div style="font-size: 0.78rem; color: #94a3b8; font-weight: 700; margin-top: 2px;">Yakılan Buğday</div>
              <div style="font-size: 1.2rem; font-weight: 900; color: #facc15; margin-top: 4px;">
                ${(eData.ammBurnedResources?.wheat || 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} <span style="font-size:0.75rem; color:#cbd5e1;">Adet</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. HANGİ HAVUZA NE KADAR GİDİYOR? (GELİR DAĞILIM ŞEMASI) -->
        <div class="clean-card" style="border-color: #38bdf8; background: #0c1622;">
          <div class="card-title-row">
            <div class="card-title" style="color: #7dd3fc; font-size: 1rem; display:flex; align-items:center; gap:8px;">
              <span>📊</span>
              <span>Hangi Havuza Ne Kadar Gidiyor? (Gelir Dağılım Oranları)</span>
            </div>
            <span class="card-badge" style="background:#0284c7; color:#fff; font-weight:800;">100 ASTRA Harcama Dağılımı (%100)</span>
          </div>
          <div class="clean-desc" style="font-size:0.83rem; color:#cbd5e1; line-height:1.4;">
            Karnaval çarkı ve piyangosu dahil, oyunda harcanan her <strong>100 ASTRA</strong>'nın anlık akış oranları:
          </div>

          <!-- Dağılım Çubuğu (%100 Tam Kırılım) — oranlar ayarlardan (GAME_CONFIG) okunur -->
          ${(() => {
            const shortName = { dungeon: 'Zindan', ammBuyback: 'Pazar Geri Alım', worldBoss: 'World Boss', arena: 'Kolezyum', carnival: 'Karnaval', quest: 'Görev' };
            const slices = [
              { label: '🔥 Yakım', title: 'Kalıcı Yakım', pct: eData.burnRatePct, color: '#ef4444', text: '#fca5a5' },
              { label: '🤝 UBI', title: 'Evrensel Temel Gelir - UBI', pct: eData.ubiRatePct, color: '#a855f7', text: '#d8b4fe' },
              { label: '🛠️ Team', title: 'Team / Geliştirici Payı', pct: eData.creatorRatePct, color: '#64748b', text: '#cbd5e1' },
              ...eData.pools.map(p => ({ label: p.icon + ' ' + (shortName[p.id] || p.name), title: p.name, pct: p.sharePct, color: p.color, text: '#e2e8f0' }))
            ];
            const fmtPct = v => '%' + String(v).replace('.', ',');
            return `
          <div style="height: 20px; width: 100%; border-radius: 10px; overflow: hidden; display: flex; margin-top: 10px; border: 1.5px solid rgba(255,255,255,0.25); box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);">
            ${slices.map(s => `<div style="width: ${s.pct}%; background: ${s.color};" title="${s.title} (${fmtPct(s.pct)})"></div>`).join('')}
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 8px; margin-top: 12px; font-size: 0.8rem;">
            ${slices.map(s => `
            <div style="background: ${s.color}1f; border: 1px solid ${s.color}; border-radius: 6px; padding: 6px 8px; display:flex; align-items:center; gap:6px;">
              <span style="display:inline-block; width:10px; height:10px; background:${s.color}; border-radius:2px; flex-shrink:0;"></span>
              <span>${s.label}: <strong style="color:${s.text};">${fmtPct(s.pct)}</strong></span>
            </div>`).join('')}
          </div>`;
          })()}
        </div>

        <!-- 4. İLGİLİ HAVUZLARDA NE KADAR ÖDÜL VAR? (CANLI HAVUZ KARTLARI) -->
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div style="font-size: 1rem; font-weight: 800; color: #fde047; display: flex; align-items: center; gap: 6px;">
            <span>💰</span>
            <span>İlgili Havuzlarda Ne Kadar Ödül Var? (Canlı Bakiyeler)</span>
          </div>

          ${eData.pools.map(pool => `
            <div class="clean-card" style="border-color: ${pool.color}; background: #130f14; margin: 0; padding: 12px 16px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 2.2rem;">${pool.icon}</span>
                  <div>
                    <div style="font-weight: 800; font-size: 1.05rem; color: #fff; display:flex; align-items:center; gap:8px;">
                      <span>${pool.name}</span>
                      <span class="card-badge" style="background:${pool.color}; color:#000; font-weight:900; font-size:0.75rem;">
                        Gelir Payı: %${String(pool.sharePct).replace('.', ',')}
                      </span>
                    </div>
                    <div style="font-size: 0.78rem; color: #94a3b8; margin-top: 2px; max-width: 520px; line-height: 1.3;">
                      ${pool.description}
                    </div>
                  </div>
                </div>

                <div style="text-align: right;">
                  <div style="font-size: 0.72rem; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Hazinede Mevcut:</div>
                  <div style="font-size: 1.45rem; font-weight: 900; color: ${pool.color}; text-shadow: 0 0 14px ${pool.color}50; margin-top: 2px;">
                    ${pool.balance.toLocaleString('tr-TR')} <span style="font-size: 0.9rem; color: #c084fc;">ASTRA</span>
                  </div>
                </div>
              </div>

              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="font-size: 0.8rem; color: #cbd5e1;">
                  🎯 <strong>Nasıl Kazanılır:</strong> <span style="color: #fde047;">${pool.howToEarn}</span>
                </div>
                <button class="btn-clean btn-clean-outline btn-eco-pool-jump" data-action="${pool.actionType}" style="padding: 6px 14px; font-size: 0.8rem; width: auto; border-color: ${pool.color}; color: #fff;">
                  ${pool.actionText} ➔
                </button>
              </div>
            </div>
          `).join('')}

          <!-- 6. HAFTALIK BÜYÜK KRALLIK PİYANGOSU HAVUZU KARTI -->
          <div class="clean-card" style="border-color: #a855f7; background: #150d1e; margin: 0; padding: 12px 16px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 2.2rem;">🎟️</span>
                <div>
                  <div style="font-weight: 800; font-size: 1.05rem; color: #fff; display:flex; align-items:center; gap:8px;">
                    <span>Haftalık Büyük Krallık Piyangosu Kasası</span>
                    <span class="card-badge" style="background:#a855f7; color:#fff; font-weight:900; font-size:0.75rem;">
                      1.000.000 ASTRA Tohum Fon
                    </span>
                  </div>
                  <div style="font-size: 0.78rem; color: #94a3b8; margin-top: 2px; max-width: 520px; line-height: 1.3;">
                    Piyango havuzunun <strong>%18'i haftalık tek bir şanslıya</strong>, <strong>%2'si Amorti Güvence Kasası'na</strong>, <strong>%80'i ise sonraki haftaya devreder</strong> (Rollover).
                  </div>
                </div>
              </div>

              <div style="text-align: right;">
                <div style="font-size: 1.35rem; font-weight: 900; color: #c084fc; text-shadow: 0 0 12px rgba(192,132,252,0.4);">
                  ${eData.lottery.lotteryPool.toLocaleString('tr-TR')} <span style="font-size: 0.85rem; color: #fde047;">ASTRA</span>
                </div>
              </div>
            </div>

            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <div style="font-size: 0.8rem; color: #cbd5e1;">
                🛡️ <strong>Amorti Kasası (%2):</strong> <span style="color: #38bdf8;">${eData.lottery.amortiShare.toLocaleString('tr-TR')} ASTRA</span> • 🔄 <strong>Haftalık Devir (%80):</strong> <span style="color: #facc15;">${eData.lottery.rolloverShare.toLocaleString('tr-TR')} ASTRA</span>
              </div>
              <button class="btn-clean btn-clean-purple btn-eco-pool-jump" data-action="lottery" style="padding: 6px 14px; font-size: 0.8rem; width: auto;">
                🎟️ Piyango Biletlerine Git ➔
              </button>
            </div>
          </div>

        </div>

      </div>
    `;
  }

  return tabsNavHtml + tabContentHtml;
}

function openCarnivalModal(activeTab = 'wheel') {
  if (!featureGate('carnival')) return;
  window.carnivalActiveTab = activeTab;
  dom.modalTitle.innerHTML = `<span>🎪</span> <span>KRALLIK KARNAVALI, ŞANS ÇARKI & PİYANGO</span>`;
  dom.modalBody.innerHTML = renderCarnivalHtml(activeTab);
  displayModal();
  if (activeTab === 'wheel') {
    initCarnivalWheelCanvas();
    requestAnimationFrame(() => initCarnivalWheelCanvas());
    setTimeout(() => initCarnivalWheelCanvas(), 60);
  }
}

function openChangelogModal() {
  dom.modalTitle.innerHTML = `<span>📜</span> <span>ADASTRA REALM SÜRÜM GEÇMİŞİ & GÜNCELLEME LOGU</span>`;
  const logs = GAME_CONFIG.CHANGELOG || [];
  dom.modalBody.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div class="clean-card" style="border-left: 4px solid #38bdf8; background: #0c1929;">
        <div style="font-size: 1.05rem; font-weight: 800; color: #fff;">📜 Krallık Güncelleme Günlüğü (v1.00 — ${logs[logs.length - 1]?.version || 'v1.07'})</div>
        <div style="font-size: 0.85rem; color: #94a3b8; margin-top:2px;">
          En yeni sürüm en üstte. Krallığın ilk gününden bugüne kadar devreye alınan kurallar ve sürüm notları.
        </div>
      </div>
      ${[...logs].reverse().map(log => `
        <div class="clean-card" style="border-left: 4px solid #a855f7; padding: 14px 18px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px; flex-wrap:wrap; gap:6px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="card-badge" style="background:#7c3aed; color:#fff; font-weight:900; font-size:0.85rem; padding:3px 8px;">${log.version}</span>
              <span style="font-size:0.95rem; font-weight:800; color:#fde047;">${log.title}</span>
            </div>
            <span style="font-size:0.75rem; color:#94a3b8;">${log.date}</span>
          </div>
          <ul style="margin: 0; padding-left: 18px; font-size: 0.82rem; color: #cbd5e1; line-height: 1.6;">
            ${log.changes.map(c => `<li>${c}</li>`).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
  `;
  displayModal();
}

function openBarracksModal(opts = {}) {
  if (!featureGate('barracks')) return;
  if (!['army', 'armory'].includes(barracksActiveTab)) barracksActiveTab = 'army';
  // Yeniden çizimde kaydırma yeri korunur (uzun listelerde başa atlamasın)
  const sameModal = dom.modalBody.querySelector('.bk');
  const bodyTop = sameModal ? dom.modalBody.scrollTop : 0;
  const rosterTop = sameModal ? (dom.modalBody.querySelector('#bk-roster-list')?.scrollTop || 0) : 0;
  dom.modalTitle.innerHTML = `<span>⚔️</span> <span>Kışla</span>`;
  dom.modalBody.innerHTML = renderBarracksHtml();
  barracksUI.install(dom.modalBody);
  displayModal();
  if (sameModal) {
    dom.modalBody.scrollTop = bodyTop;
    const r = dom.modalBody.querySelector('#bk-roster-list');
    if (r) r.scrollTop = rosterTop;
  }
  if (opts.scrollTo) dom.modalBody.querySelector(opts.scrollTo)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const renameInput = document.getElementById('input-soldier-rename');
  if (renameInput) setTimeout(() => { renameInput.focus(); renameInput.select(); }, 50);
}

function openBattlefieldModal() {
  if (!featureGate('battlefield')) return;
  const boss = gameState.getWorldBossInfo();
  const state = gameState.state;
  const soldiers = state.soldierUnits || [];
  const hasSoldiers = soldiers.length > 0;
  const isStaked = boss.userStaked;
  const power = gameState.calculateUserWorldBossPower();
  const claimable = boss.claimableRewardAda || 0;
  const adaRate = boss.maxBossHp > 0 ? (boss.weeklyAdaPool / boss.maxBossHp) : 0;

  // Henüz kilitlenmemişse mevcut ordunun potansiyel hesaplaması
  let currentArmyAtk = 0;
  let currentArmyHp = 0;
  soldiers.forEach((_, i) => {
    const sStats = gameState.getSoldierFullStats(i);
    if (sStats) {
      currentArmyAtk += sStats.totalAtk;
      currentArmyHp += sStats.totalMaxHp;
    }
  });
  const diversity = gameState.calculateSquadSkillDiversity();
  const potentialBaseDamage = Math.floor((currentArmyAtk * 1.0) + (currentArmyHp * 0.25));
  const potentialDamage = Math.floor(potentialBaseDamage * diversity.diversityMultiplier);
  const potentialAda = Math.floor((potentialDamage * boss.weeklyAdaPool) / (boss.maxBossHp || 1));

  const displaySoldiersCount = isStaked ? (boss.userStakedSoldiersCount || 0) : soldiers.length;
  const displayAtk = isStaked ? power.atk : currentArmyAtk;
  const displayAtkContrib = isStaked ? power.atkContribution : Math.floor(currentArmyAtk * 1.0);
  const displayHpContrib = isStaked ? power.hpContribution : Math.floor(currentArmyHp * 0.25);
  const displayDamage = isStaked ? power.calculatedDamage : potentialDamage;
  const displayExpectedAda = isStaked ? power.estimatedAda : potentialAda;

  dom.modalTitle.innerHTML = `<span>🌋</span> <span>BÜYÜK SAVAŞ ALANI & WORLD BOSS ETKİNLİĞİ</span>`;

  dom.modalBody.innerHTML = `
    <div class="clean-card" style="border-color: #ef4444; background: #1c0a0a;">
      <div class="card-title-row">
        <div class="card-title">🌋 Haftalık Savaş Alanı & World Boss Etkinliği</div>
        <span class="card-badge" style="color: #fde047; border-color: #fde047;">Ödül Havuzu: 🟣 ${boss.weeklyAdaPool.toLocaleString('tr-TR')} ASTRA</span>
      </div>
      <div class="clean-desc" style="line-height: 1.5; color: #cbd5e1;">
        ⏰ <strong>Otomatik Savaş Mekaniği:</strong> Oyuncular manuel saldırmaz. Hafta boyunca kilitlenen orduların saldırı ve can puanları üzerinden toplam hasar gücü hesaplanır. <strong>Her Pazar TSİ 18:00'da</strong> savaşlar tek seferlik <strong>otomatik</strong> gerçekleşir ve hak edilen ASTRA ödülü bu ekrana düşer.
      </div>
      <div style="margin-top: 8px; background: rgba(0,0,0,0.35); padding: 8px 12px; border-radius: 6px; border: 1px dashed #ef4444; font-size: 0.8rem; color: #fca5a5;">
        📐 <strong>Hasar Formülü:</strong> Hasar = (Toplam ATK × 1.0) + (Toplam HP × 0.25) <span style="color:#fde047;">(ATK 1:1 rasyo • HP 1:0.25 rasyo)</span>
      </div>
    </div>

    <!-- 1. KULLANICININ KİLİTLİ ORDUSU & GÜÇ HESABI -->
    <div class="clean-card" style="background: #151a26; border-color: #ca8a04;">
      <div class="card-title-row">
        <div style="font-weight: 800; font-size: 0.95rem; color: #fde047;">
          🛡️ Senin Kilitlediğin Ordu & Hasar Potansiyeli
        </div>
        <span class="card-badge" style="color: ${isStaked ? '#4ade80' : '#f97316'}; border-color: ${isStaked ? '#4ade80' : '#f97316'};">
          ${isStaked ? '✅ SAVAŞ İÇİN KİLİTLENDİ' : '⚠️ ORDU KİLİTLENMEDİ'}
        </span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-top: 8px;">
        <div style="background: #10141e; padding: 10px; border-radius: 6px; border: 1px solid #4a250a; text-align: center;">
          <div style="font-size: 0.72rem; color: #94a3b8;">${isStaked ? 'Kilitli Asker' : 'Hazır Asker'}</div>
          <div style="font-size: 1.1rem; font-weight: 800; color: #38bdf8;">⚔️ ${displaySoldiersCount} Asker</div>
        </div>
        <div style="background: #10141e; padding: 10px; border-radius: 6px; border: 1px solid #4a250a; text-align: center;">
          <div style="font-size: 0.72rem; color: #94a3b8;">Saldırı Gücü (1:1)</div>
          <div style="font-size: 1.1rem; font-weight: 800; color: #4ade80;">💥 +${displayAtkContrib.toLocaleString('tr-TR')}</div>
        </div>
        <div style="background: #10141e; padding: 10px; border-radius: 6px; border: 1px solid #4a250a; text-align: center;">
          <div style="font-size: 0.72rem; color: #94a3b8;">Can Katkısı (1:0.25)</div>
          <div style="font-size: 1.1rem; font-weight: 800; color: #facc15;">❤️ +${displayHpContrib.toLocaleString('tr-TR')}</div>
        </div>
        <div style="background: #10141e; padding: 10px; border-radius: 6px; border: 1px solid #eab308; text-align: center;">
          <div style="font-size: 0.72rem; color: #fef08a; font-weight: 700;">HESAPLANAN HASAR</div>
          <div style="font-size: 1.25rem; font-weight: 900; color: #fde047;">🎯 ${displayDamage.toLocaleString('tr-TR')}</div>
        </div>
      </div>

      <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center; background: #0c0805; padding: 10px 14px; border-radius: 8px; flex-wrap: wrap; gap: 8px;">
        <div style="font-size: 0.85rem; color: #cbd5e1;">
          🔮 <strong>${isStaked ? 'Kilitli Ordu Pazar Günü Kazancı:' : 'Tahmini Pazar Günü Kazancı:'}</strong>
          <span style="color: #fde047; font-weight: 900; font-size: 1.05rem;">~${displayExpectedAda.toLocaleString('tr-TR')} ASTRA</span>
          <span style="color: #94a3b8; font-size: 0.75rem; margin-left: 4px;">(${displayDamage.toLocaleString('tr-TR')} Hasar × ${adaRate.toFixed(3)} ASTRA)</span>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${isStaked ? `
            <button id="btn-emergency-unstake-boss" class="btn-clean btn-clean-red" style="width: auto; padding: 8px 14px; font-size: 0.8rem;" title="Pazar gününden önce erken çekilme cezası (%18)">
              🔓 %18 Ceza ile Erken Çek (${Math.max(1, Math.round(power.estimatedAda * 0.18)).toLocaleString('tr-TR')} ASTRA)
            </button>
          ` : ''}
          <button id="btn-stake-army-boss" class="btn-clean ${isStaked ? 'btn-clean-outline' : 'btn-clean-gold'}" style="width: auto; padding: 8px 18px;" ${!hasSoldiers ? 'disabled' : ''}>
            ${isStaked ? '🔄 Kilitli Orduyu Güncelle' : '🛡️ Tüm Ordumu Kilitle (Pazar 18:00 İçin)'}
          </button>
        </div>
      </div>
    </div>

    <!-- 2. WORLD BOSS CANI & SAVAŞ ZAMANI -->
    <div class="clean-card" style="background: #1c0808; border-color: #ef4444; margin-top: 10px;">
      <div class="card-title-row">
        <div class="card-title">${boss.icon} ${boss.name}</div>
        <span class="card-badge" style="color: #ef4444;">Pazar 18:00 TSİ Otomatik Savaş</span>
      </div>

      <div style="margin: 10px 0;">
        <div style="display: flex; justify-content: space-between; font-size: 0.82rem; font-weight: 700; margin-bottom: 4px;">
          <span style="color: #fca5a5;">Boss Canı:</span>
          <span style="color: #fde047;">${boss.bossHp.toLocaleString('tr-TR')} / ${boss.maxBossHp.toLocaleString('tr-TR')} HP (%${Math.floor((boss.bossHp / boss.maxBossHp) * 100)})</span>
        </div>
        <div style="background: #2b0c0c; height: 14px; border-radius: 7px; overflow: hidden; border: 1px solid #7f1d1d;">
          <div style="width: ${(boss.bossHp / boss.maxBossHp) * 100}%; background: linear-gradient(90deg, #ef4444, #f59e0b); height: 100%; transition: width 0.3s ease;"></div>
        </div>
      </div>

      <div style="background: #0f0505; padding: 12px 14px; border-radius: 8px; font-size: 0.82rem; color: #cbd5e1; line-height: 1.6; margin-bottom: 10px; border: 1px solid rgba(239, 68, 68, 0.3);">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08);">
          <div>📊 <strong>Hasar Başına ASTRA Dağıtım Oranı:</strong> <span style="color:#fde047; font-weight:800;">1 Hasar = ${adaRate.toFixed(3)} ASTRA</span></div>
          <div>💥 <strong>Önceki Savaşta Verdiğin Toplam Hasar:</strong> <span style="color:#4ade80; font-weight:800;">${(boss.userDamage || 0).toLocaleString('tr-TR')} Hasar</span></div>
        </div>

        <!-- KULLANICININ İSTEDİĞİ CANLI KİLİTLİ SALDIRI VE HAFTALIK ASTRA KAZANÇ PANELİ -->
        ${isStaked ? `
          <div style="margin-top: 10px; background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%); border: 1.5px solid #22c55e; border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.15);">
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="card-badge" style="background: #22c55e; color: #000; font-weight: 900; font-size: 0.72rem; padding: 2px 8px; border: none;">KİLİTLİ ORDU AKTİF</span>
                <span style="font-size: 0.82rem; color: #94a3b8; font-weight: 700;">Toplam Saldırı & Hasar Gücü:</span>
              </div>
              <div style="font-size: 1.15rem; font-weight: 900; color: #ffffff; margin-top: 3px;">
                💥 <span style="color: #4ade80;">${displayDamage.toLocaleString('tr-TR')} Saldırı / Hasar</span>
                <span style="font-size: 0.78rem; color: #94a3b8; font-weight: 600;">(${displayAtk.toLocaleString('tr-TR')} ATK + ${displayHpContrib.toLocaleString('tr-TR')} HP)</span>
              </div>
              <div style="font-size: 0.75rem; color: #cbd5e1; margin-top: 2px;">
                📐 Dağıtım Çarpanı: 1 Saldırı = <strong style="color: #fde047;">${adaRate.toFixed(3)} ASTRA</strong>
              </div>
            </div>
            <div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(234, 179, 8, 0.4); border-radius: 8px; padding: 8px 16px; text-align: right; min-width: 220px;">
              <div style="font-size: 0.72rem; color: #fef08a; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">🏆 BU HAFTA WORLD BOSS'TA KAZANILACAK:</div>
              <div style="font-size: 1.45rem; font-weight: 900; color: #fde047; text-shadow: 0 0 12px rgba(253, 224, 71, 0.5); line-height: 1.2; margin: 2px 0;">
                ~${displayExpectedAda.toLocaleString('tr-TR')} <span style="font-size: 0.95rem; color: #c084fc;">ASTRA</span>
              </div>
              <div style="font-size: 0.72rem; color: #94a3b8; font-weight: 600;">
                Hesap: ${displayDamage.toLocaleString('tr-TR')} Saldırı × ${adaRate.toFixed(3)} ASTRA
              </div>
            </div>
          </div>
        ` : `
          <div style="margin-top: 10px; background: rgba(234, 179, 8, 0.08); border: 1.5px dashed rgba(234, 179, 8, 0.4); border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <div style="font-size: 0.82rem; color: #fde047; font-weight: 800; display: flex; align-items: center; gap: 6px;">
                <span>⚠️ Ordun Henüz World Boss İçin Kilitlenmedi</span>
              </div>
              <div style="font-size: 0.76rem; color: #cbd5e1; margin-top: 2px;">
                ${hasSoldiers ? `Mevcut ${soldiers.length} kişilik ordunu kilitlediğinde toplam <strong style="color:#4ade80;">${displayDamage.toLocaleString('tr-TR')} Saldırı Gücü</strong> devreye girer.` : 'Kışladan asker alıp ordunu kilitlediğinde saldırı gücünle orantılı ASTRA kazanırsın.'}
              </div>
            </div>
            ${hasSoldiers ? `
              <div style="text-align: right;">
                <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 700;">KİLİTLERSEN BU HAFTA TAHMİNİ KAZANÇ:</div>
                <div style="font-size: 1.2rem; font-weight: 900; color: #fde047;">
                  ~${displayExpectedAda.toLocaleString('tr-TR')} <span style="font-size: 0.85rem; color: #c084fc;">ASTRA</span>
                </div>
                <div style="font-size: 0.68rem; color: #94a3b8;">
                  (${displayDamage.toLocaleString('tr-TR')} Saldırı × ${adaRate.toFixed(3)} ASTRA)
                </div>
              </div>
            ` : ''}
          </div>
        `}
      </div>

      <!-- 3. ÖDÜL TOPLAMA (CLAIM) BÖLÜMÜ -->
      <div style="background: linear-gradient(135deg, rgba(34,197,94,0.1), rgba(234,179,8,0.15)); border: 1px solid #eab308; border-radius: 8px; padding: 14px; text-align: center; margin-top: 10px;">
        <div style="font-size: 0.85rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">Toplanmaya Hazır World Boss Ödülün</div>
        <div style="font-size: 1.8rem; font-weight: 900; color: #fde047; margin: 4px 0;">
          🟣 ${claimable.toLocaleString()} <span style="font-size: 1rem; color: #c084fc;">ASTRA</span>
        </div>
        <button id="btn-claim-world-boss-reward" class="btn-clean ${claimable > 0 || isStaked ? 'btn-clean-gold' : 'btn-clean-outline'}" style="font-size: 1.05rem; padding: 12px 24px; font-weight: 800; margin-top: 6px; box-shadow: ${claimable > 0 ? '0 0 20px rgba(234,179,8,0.4)' : 'none'};" ${claimable <= 0 && !isStaked ? 'disabled' : ''}>
          ${claimable > 0 ? `🎁 Hak Edilen ${claimable.toLocaleString()} ASTRA Ödülünü & Ordunu Topla (Claim)` : isStaked ? '⏳ Pazar 18:00 Savaşı Bekleniyor (Ordu Kilitli)' : '⏳ Kilitli Ordu veya Ödül Yok'}
        </button>
      </div>

      <!--
        v1'de burada oyuncunun görebildiği bir "[Test] Pazar Savaşını Şimdi
        Simüle Et" butonu vardı. Her tıklama hasarı ve toplanabilir ödülü
        artırıyordu, sınır yoktu: sınırsız ASTRA basımı (denetim bulgusu F-03).
        Savaş artık gerçek takvime bağlı; buton üretimden kaldırıldı ve
        yalnızca geliştirici panelinden (T) tetiklenebiliyor.
      -->
      <div style="margin-top: 10px; text-align: center; font-size: 0.78rem; color: #94a3b8;">
        ⏳ Sonraki otomatik savaş: <strong style="color:#fde047;">${(() => {
          const s = gameState.getWorldBossSchedule();
          const d = Math.floor(s.msUntilNext / 86400000);
          const h = Math.floor((s.msUntilNext % 86400000) / 3600000);
          const m = Math.floor((s.msUntilNext % 3600000) / 60000);
          return `${d}g ${h}s ${m}dk`;
        })()}</strong> (Pazar 18:00 TSİ)
      </div>
    </div>
  `;

  displayModal();
}

// Kışla Paneli açıkken (18 Kişilik Ordu sekmesi) can barlarını, kalan iyileşme süresini
// ve buğday ihtiyacını canlı tutmak için ~1.5 saniyede bir modal gövdesini yeniden çizer.
function refreshBarracksLiveUI(deltaSeconds) {
  if (!dom.rpgModal || !dom.rpgModal.classList.contains('active')) return;
  if (barracksActiveTab !== 'army') return;
  if (!dom.modalBody.querySelector('.bk')) return;

  barracksLiveRefreshAccumulator += deltaSeconds;
  if (barracksLiveRefreshAccumulator < 1.5) return;
  barracksLiveRefreshAccumulator = 0;

  barracksUI.liveUpdate(dom.modalBody);
}

// =========================================================================
// 4.6 PHASE 2: BÜYÜK KOLEZYUM - 18v18 GLADYATÖR ARENA SAVAŞI
// =========================================================================
function buildPlayerArenaSquad(state) {
  return state.soldierUnits.map((soldier, idx) => {
    // Kuşanılmış 5 yuvanın (Silah, Miğfer, Zırh, Pantolon, Ayakkabı) tüm bonuslarını ve set bonusunu içerir
    const fullStats = gameState.getSoldierFullStats(idx) || { totalAtk: soldier.baseAtk || 20, totalMaxHp: soldier.maxHp || 100 };
    // Kışla'da henüz iyileşmemiş askerler Kolezyum'a eksik canla girer (mevcut HP oranı taşınır)
    const woundedRatio = Math.min(1, Math.max(0, (soldier.hp != null ? soldier.hp : (soldier.maxHp || 100)) / (soldier.maxHp || 100)));
    return { icon: soldier.icon || '⚔️', hp: Math.max(1, Math.round(fullStats.totalMaxHp * woundedRatio)), atk: fullStats.totalAtk };
  });
}

function buildGladiatorSquad() {
  const roster = [];
  for (let i = 0; i < 18; i++) {
    roster.push({ icon: '⚔️', hp: 120, atk: 22 });
  }
  return roster;
}

function renderArenaUnitGrid(squad, deadCount) {
  return squad.map((unit, i) => `<div class="arena-unit ${i < deadCount ? 'dead' : ''}">${unit.icon}</div>`).join('');
}

let colosseumActiveTab = 'duel';
let selectedColosseumChampionIdx = 0;

function openColosseumModal() {
  if (!featureGate('colosseum')) return;
  const state = gameState.state;
  const soldiers = state.soldierUnits || [];
  const hasSoldiers = soldiers.length > 0;
  const leaderboard = gameState.getColosseumLeaderboard();
  const cStats = state.colosseumStats || { wins: 0, losses: 0, score: 0, rank: 11 };

  dom.modalTitle.innerHTML = `<span>🏟️</span> <span>BÜYÜK GLADYATÖR KOLEZYUMU: 1v1 PVP & HAFTALIK LİG</span>`;

  const tabsHtml = `
    <div class="phase2-tab-row">
      <button class="phase2-tab-btn colosseum-tab-btn ${colosseumActiveTab === 'duel' ? 'active' : ''}" data-tab="duel">⚔️ 1v1 Gladyatör Düellosu</button>
      <button class="phase2-tab-btn colosseum-tab-btn ${colosseumActiveTab === 'leaderboard' ? 'active' : ''}" data-tab="leaderboard">🏆 Haftalık Liderlik Tablosu</button>
      <button class="phase2-tab-btn colosseum-tab-btn ${colosseumActiveTab === 'pvp' ? 'active' : ''}" data-tab="pvp">🌐 Gerçek Rakipler</button>
    </div>
  `;

  let contentHtml = '';

  if (colosseumActiveTab === 'pvp') {
    // 🌐 GERÇEK RAKİPLER (sunucu): içerik renderPvpPanel() ile doldurulur
    contentHtml = `<div id="pvp-panel" class="clean-card" style="border-color:#38bdf8;background:#0b1220;min-height:120px;">⏳ Yükleniyor…</div>`;
  } else if (colosseumActiveTab === 'leaderboard' && online.active) {
    // Çevrimiçi oyunda gerçek sıralama sunucuda: bilgisayar sürümünün bot tablosu ve sabit ödülleri gösterilmez
    contentHtml = `
      <div class="clean-card" style="border-color: #f59e0b; background: #1c140c; text-align: center; padding: 22px;">
        <div style="font-size: 1.05rem; font-weight: 800; color: #fde047;">🏆 Haftalık sıralama gerçek oyuncularla</div>
        <div style="font-size: 0.86rem; color: #cbd5e1; margin: 8px auto 14px; max-width: 560px; line-height: 1.5;">Çevrimiçi oyunda sıralama ve haftalık ödüller sunucuda tutulur. Hafta sonunda ilk 10 oyuncu Kolezyum kasasından pay alır.</div>
        <button class="phase2-tab-btn colosseum-tab-btn" data-tab="pvp" style="display: inline-block; width: auto; padding: 9px 18px;">🌐 Gerçek Rakipler ve sıralamaya git</button>
      </div>`;
  } else if (colosseumActiveTab === 'leaderboard') {
    // 🏆 HAFTALIK SIRALAMA & ÖDÜLLER (yalnız bilgisayardaki tek oyunculu sürüm)
    contentHtml = `
      <div class="clean-card" style="border-color: #f59e0b; background: #1c140c;">
        <div class="card-title-row">
          <div class="card-title">🏆 Haftalık Kolezyum Şampiyonluk Ligi</div>
          <span class="card-badge" style="color: #4ade80;">Pazar 23:59 Sıfırlanır</span>
        </div>
        <div class="clean-desc">
          Kolezyum'da 1v1 maçları kazanarak sıralamada yüksel! Hafta sonunda ilk 10 gladyatöre devasa ödüller dağıtılır:
          <br><strong>🥇 1. Sıra:</strong> 5 Zindan Anahtarı + 15.000 ASTRA • <strong>🥈 2. Sıra:</strong> 3 Anahtar + 8.000 ASTRA • <strong>🥉 3-10. Sıra:</strong> 1 Anahtar + 2.500 ASTRA
        </div>
      </div>

      <div class="clean-card" style="background: #0f172a; border-color: #38bdf8;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 0.95rem;">
          <span style="color: #38bdf8;">🛡️ Senin Derecen: #${cStats.rank || 11} AlphAvax</span>
          <span style="color: #facc15;">⭐ ${cStats.score || 0} Puan (${cStats.wins || 0} Galibiyet / ${cStats.losses || 0} Mağlubiyet)</span>
        </div>
      </div>

      <div class="leaderboard-table-wrap" style="margin-top: 10px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
          <thead>
            <tr style="border-bottom: 2px solid #ca8a04; color: #fde047; text-align: left;">
              <th style="padding: 8px;">Sıra</th>
              <th style="padding: 8px;">Gladyatör / Şampiyon</th>
              <th style="padding: 8px;">Unvan</th>
              <th style="padding: 8px; text-align: center;">Galibiyet</th>
              <th style="padding: 8px; text-align: right;">Haftalık Ödül</th>
            </tr>
          </thead>
          <tbody>
            ${leaderboard.map(row => `
              <tr style="border-bottom: 1px solid #332014; background: ${row.rank === 1 ? 'rgba(234,179,8,0.1)' : row.rank <= 3 ? 'rgba(255,255,255,0.03)' : 'transparent'};">
                <td style="padding: 8px; font-weight: 800; color: ${row.rank === 1 ? '#facc15' : row.rank === 2 ? '#cbd5e1' : row.rank === 3 ? '#b45309' : '#94a3b8'};">
                  ${row.rank === 1 ? '🥇 #1' : row.rank === 2 ? '🥈 #2' : row.rank === 3 ? '🥉 #3' : `#${row.rank}`}
                </td>
                <td style="padding: 8px; font-weight: 700; color: #fff;">${row.icon} ${row.name}</td>
                <td style="padding: 8px; color: #94a3b8; font-size: 0.78rem;">${row.title}</td>
                <td style="padding: 8px; text-align: center; color: #4ade80; font-weight: 800;">${row.wins} G</td>
                <td style="padding: 8px; text-align: right; color: #fde047; font-weight: 700;">
                  🔑 ${row.rewardKeys} Anahtar + 🟣 ${row.rewardAda.toLocaleString()} ASTRA
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    // ⚔️ 1v1 GLADYATÖR DÜELLOSU
    const isArmyStaked = gameState.isArmyStakedInWorldBoss();
    const champ = soldiers[selectedColosseumChampionIdx] || soldiers[0];
    const stats = champ ? gameState.getSoldierFullStats(selectedColosseumChampionIdx) : null;
    const isWounded = champ && (champ.hp || champ.maxHp || 100) < (champ.maxHp || 100);
    const isBackRow = champ && champ.row === 'back';

    const combatPresets = gameState.getCombatPresets();
    const activePresetId = combatPresets?.activePresetId || 1;
    const curPresetObj = combatPresets?.presets?.[activePresetId] || { name: `Taktik ${activePresetId}` };

    const colosseumPresetHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(15,23,42,0.6); padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); margin-bottom:10px; flex-wrap:wrap; gap:6px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:0.75rem; font-weight:800; color:#cbd5e1;">🎯 Taktiksel Preset:</span>
          <div style="display:flex; gap:4px;">
            ${[1, 2, 3].map(pid => {
              const p = combatPresets.presets?.[pid] || { name: `Taktik ${pid}` };
              const isActive = pid === activePresetId;
              return `
                <button type="button" class="btn-clean btn-colosseum-preset ${isActive ? 'btn-clean-gold' : 'btn-clean-outline'}" data-preset="${pid}" style="padding:3px 8px; font-size:0.72rem; font-weight:800; width:auto; border-radius:6px;" title="${p.name}">
                  ${pid === 1 ? '🛡️' : pid === 2 ? '⚔️' : '🏹'} P${pid}
                </button>
              `;
            }).join('')}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:0.72rem; color:#fde047; font-weight:700;">${curPresetObj.name}</span>
          <button type="button" id="btn-save-colosseum-preset" class="btn-clean btn-clean-sm" style="padding:3px 8px; font-size:0.7rem; width:auto; background:rgba(34,197,94,0.18); border:1px solid #22c55e; color:#4ade80; font-weight:700;" title="Mevcut dizilimi P${activePresetId}'e kaydet">
            💾 P${activePresetId}'e Kaydet
          </button>
        </div>
      </div>
    `;

    contentHtml = `
      <div class="clean-card" style="border-color: #ef4444; background: #1c1012;">
        <div class="card-title-row">
          <div class="card-title">⚔️ 1v1 Kolezyum Gladyatör Eşleşmesi</div>
          <span class="card-badge" style="color: #fde047;">🔑 ${state.arenaKeys || 0} Anahtar</span>
        </div>
        <div class="clean-desc">
          En güçlü şampiyonunu kuşanmış 5 parça teçhizatıyla sahaya sür! 'Kolezyuma Çık' düğmesine bastığında sistem canlı eşleşme yapar ve 1v1 savaş başlar. Savaşta yaralanan şampiyonların canı depodaki buğday ile 18 saatlik tedavi sürecinde iyileşir.
        </div>
      </div>

      ${colosseumPresetHtml}

      ${isArmyStaked ? `
        <div class="clean-card" style="background: #1c0a0a; border: 1px solid #ef4444; padding: 20px; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 6px;">🔒</div>
          <div style="font-weight: 800; font-size: 1rem; color: #f87171;">Ordun World Boss Savaşına Kilitlendi!</div>
          <div style="font-size: 0.82rem; color: #cbd5e1; margin-top: 6px; max-width: 380px; margin-left: auto; margin-right: auto; line-height: 1.4;">
            Askerlerin Pazar 18:00 TSİ World Boss savaşı için kilit altındadır. Kolezyumda dövüşebilmek için Savaş Alanından (%18 ceza ile) ordunu erken çekmeli veya Pazar 18:00 sonrası ödülünle birlikte ordunu toplamalısın.
          </div>
          <button class="btn-clean btn-clean-gold" id="btn-goto-battlefield-colosseum" style="margin-top: 12px; width: auto; padding: 8px 18px;">
            🌋 Savaş Alanı & World Boss'a Git
          </button>
        </div>
      ` : hasSoldiers ? `
        <!-- Şampiyon Seçim Kartı -->
        <div class="clean-card" style="background: #151a26; border-color: #ca8a04;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap:wrap; gap:6px;">
            <div style="font-weight: 800; font-size: 0.95rem; color: #fde047; display:flex; align-items:center; gap:10px;"><img src="${soldierPortrait(soldiers[selectedColosseumChampionIdx] || soldiers[0], soldiers[selectedColosseumChampionIdx] ? selectedColosseumChampionIdx : 0)}" alt="" draggable="false" style="width:52px; height:52px; border-radius:10px; border:2px solid #ca8a04; image-rendering:pixelated; object-fit:cover;"> 🛡️ Arenaya çıkacak şampiyonun:</div>
            <div style="display:flex; align-items:center; gap:8px;">
              <select id="colosseum-champion-select" style="background: #24140b; color: #fff; border: 1.5px solid #ca8a04; padding: 5px 10px; border-radius: 6px; font-family: var(--font-game); font-size: 0.85rem;">
                ${soldiers.map((s, idx) => `
                  <option value="${idx}" ${idx === selectedColosseumChampionIdx ? 'selected' : ''}>
                    ${s.name} (Lv.${s.level} - HP: ${s.hp || s.maxHp || 100}/${s.maxHp || 100})
                  </option>
                `).join('')}
              </select>
              <button type="button" id="btn-toggle-colosseum-champ-row" class="btn-clean" style="padding: 4px 8px; font-size: 0.72rem; width: auto; font-weight: 700; background: ${isBackRow ? 'rgba(56,189,248,0.2)' : 'rgba(245,158,11,0.2)'}; border: 1px solid ${isBackRow ? '#38bdf8' : '#f59e0b'}; color: ${isBackRow ? '#38bdf8' : '#fde047'}; cursor: pointer;" title="Şampiyonun Mevzisini Değiştir">
                ${isBackRow ? '🏹 Arka Saf' : '🛡️ Ön Saf'}
              </button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px;">
            <div style="background: #10141e; padding: 8px 10px; border-radius: 6px; border: 1px solid #4a250a; text-align: center;">
              <div style="font-size: 0.75rem; color: #94a3b8;">Toplam Saldırı</div>
              <div style="font-size: 1.1rem; font-weight: 800; color: #4ade80;">⚔️ ${stats ? stats.totalAtk : 20} ATK</div>
            </div>
            <div style="background: #10141e; padding: 8px 10px; border-radius: 6px; border: 1px solid #4a250a; text-align: center;">
              <div style="font-size: 0.75rem; color: #94a3b8;">Can Durumu</div>
              <div style="font-size: 1.1rem; font-weight: 800; color: ${champ.hp <= 25 ? '#ef4444' : '#38bdf8'};">❤️ ${champ.hp || champ.maxHp || 100}/${champ.maxHp || 100}</div>
            </div>
            <div style="background: #10141e; padding: 8px 10px; border-radius: 6px; border: 1px solid #4a250a; text-align: center;">
              <div style="font-size: 0.75rem; color: #94a3b8;">Mevzi / Saf</div>
              <div style="font-size: 1.05rem; font-weight: 800; color: ${isBackRow ? '#38bdf8' : '#fde047'};">${isBackRow ? '🏹 Arka Saf' : '🛡️ Ön Saf'}</div>
            </div>
          </div>

          ${isWounded ? `
            <div style="background: #2a0a0a; border: 1px solid #ef4444; border-radius: 6px; padding: 8px 12px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.82rem; color: #fca5a5;">⚠️ Şampiyonun yaralı! Depodaki buğdayla 18 saatlik tedavi uygulayabilirsin.</span>
              <button class="btn-clean btn-clean-sm btn-heal-soldier" data-soldier="${selectedColosseumChampionIdx}" style="width: auto; padding: 5px 12px; background: #15803d; border-color: #22c55e;">
                🌾 Buğdayla İyileştir
              </button>
            </div>
          ` : ''}

          ${(() => {
            const ce = gameState.getColosseumEntryStatus();
            const injured = (champ.hp || 100) <= 15;
            const block = injured ? 'Şampiyon ağır yaralı, önce iyileştir' : ce.blockReason;
            return `
          <div class="arena-entry-costs">
            <span class="${ce.used >= ce.cap ? 'is-bad' : ''}">🏟️ Bugünkü maç: <strong>${ce.used} / ${ce.cap}</strong></span>
            <span class="${ce.keys < ce.keyCost ? 'is-bad' : ''}">🔑 Bedel: <strong>${ce.keyCost} anahtar</strong> (sende ${ce.keys})</span>
            <span class="${ce.stamina < ce.staminaCost ? 'is-bad' : ''}">⚡ Bedel: <strong>${ce.staminaCost} stamina</strong> (sende ${ce.stamina})</span>
          </div>
          <button id="btn-start-1v1-duel" class="btn-clean btn-clean-green" style="font-size: 1.05rem; padding: 13px; margin-top: 12px; font-weight: 800;" ${block ? 'disabled' : ''}>
            ${block ? `🔒 ${block}` : '⚔️ KOLEZYUMA ÇIK (1v1 EŞLEŞ)'}
          </button>`;
          })()}
        </div>

        <div id="colosseum-duel-log" class="clean-card" style="background: #0b0704; min-height: 80px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 0.88rem; text-align: center;">
          ⚔️ Arenaya çıkmaya hazır mısın? Rakip gladyatör seni bekliyor!
        </div>
      ` : `
        <div class="clean-card" style="text-align: center; color: #94a3b8; padding: 24px;">
          ⚠️ Kolezyum'da 1v1 savaşmak için önce Kışla'dan asker satın almalısın!
          <div style="margin-top: 12px;"><button class="btn-clean btn-goto-barracks" style="width:auto; padding:8px 16px; font-weight:800; background:#7c3aed; border-color:#a78bfa; color:#fff;">⚔️ Kışla'ya git</button></div>
        </div>
      `}
    `;
  }

  dom.modalBody.innerHTML = `${tabsHtml}${contentHtml}`;
  displayModal();

  const battlefieldColBtn = document.getElementById('btn-goto-battlefield-colosseum');
  if (battlefieldColBtn) {
    battlefieldColBtn.addEventListener('click', openBattlefieldModal);
  }

  // 🎯 Kolezyum Preset Seçimi (P1, P2, P3)
  document.querySelectorAll('.btn-colosseum-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const pid = parseInt(btn.dataset.preset, 10);
      const res = gameState.applyCombatPreset(pid);
      if (res.success) {
        showToast(res.message, 'info');
        openColosseumModal();
      }
    });
  });

  // 💾 Kolezyum Presete Kaydetme
  const colSaveBtn = document.getElementById('btn-save-colosseum-preset');
  if (colSaveBtn) {
    colSaveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const activeId = gameState.state.combatPresets?.activePresetId || 1;
      const res = gameState.saveCombatPreset(activeId);
      if (res.success) {
        showToast(res.message, 'success');
        openColosseumModal();
      }
    });
  }

  // 🛡️ Şampiyon Mevzi Değiştirme (Ön Saf / Arka Saf)
  const champRowBtn = document.getElementById('btn-toggle-colosseum-champ-row');
  if (champRowBtn) {
    champRowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const sol = (gameState.state.soldierUnits || [])[selectedColosseumChampionIdx];
      if (sol) {
        const nextRow = sol.row === 'back' ? 'front' : 'back';
        gameState.setSoldierRow(selectedColosseumChampionIdx, nextRow);
        openColosseumModal();
      }
    });
  }

  // Şampiyon Seçimi Değişince
  const champSelect = document.getElementById('colosseum-champion-select');
  if (champSelect) {
    champSelect.addEventListener('change', (e) => {
      selectedColosseumChampionIdx = parseInt(e.target.value, 10) || 0;
      openColosseumModal();
    });
  }

  if (colosseumActiveTab === 'pvp') renderPvpPanel();

  // 1v1 Kolezyuma Çık Butonu (Canlı Savaş Arenası Entegrasyonu)
  const duelBtn = document.getElementById('btn-start-1v1-duel');
  if (duelBtn) {
    duelBtn.addEventListener('click', async () => {
      const champ = (gameState.state.soldierUnits || [])[selectedColosseumChampionIdx];
      if (!champ) {
        showToast('Kolezyuma çıkacak bir şampiyon bulunamadı!', 'error');
        return;
      }
      if ((champ.hp || 0) <= 15) {
        showToast(`⚠️ ${champ.name} ağır yaralı (Can: ${champ.hp}/${champ.maxHp}). Kolezyuma çıkmadan önce buğdayla iyileştirilmelidir!`, 'error');
        return;
      }

      const res = await gameState.executeColosseum1v1Match(selectedColosseumChampionIdx);
      if (!res.success) {
        showToast(res.message, 'error');
        return;
      }

      const arena = getBattleArena();
      if (!arena) return;

      closeModal();
      openBattleArenaModal();

      const champStats = gameState.getSoldierFullStats(selectedColosseumChampionIdx) || { totalAtk: 65, totalMaxHp: 500 };
      const allyUnit = {
        uid: res.allyUid,
        name: res.championName || champ.name,
        icon: champ.icon || '🦁',
        avatar: champ.avatar || 'assets/soldier_avatar.jpg',
        sourceIndex: selectedColosseumChampionIdx,
        hp: res.championStartHp != null ? res.championStartHp : champStats.totalMaxHp,
        maxHp: res.championMaxHp || champStats.totalMaxHp,
        atk: champStats.totalAtk,
        skills: Array.isArray(champ.skills) && champ.skills.length ? champ.skills : ['shieldWall', 'armorBreaker'],
        row: champ.row || 'front'
      };

      const enemyUnit = {
        uid: res.enemyUid,
        name: res.opponentName,
        icon: res.opponentIcon || '🥷',
        avatar: 'assets/gladiator_rival.jpg',
        hp: res.opponentHp || 350,
        maxHp: res.opponentHp || 350,
        atk: res.opponentAtk || 50,
        skills: ['armorBreaker', 'cleave'],
        row: 'front'
      };

      const loot = [
        `🪙 +${res.rewardAda} ASTRA`,
        `⭐ ${res.ratingDelta >= 0 ? '+' : ''}${res.ratingDelta} ELO (Yeni Puan: ${res.newRating})`,
        res.rewardKeys > 0 ? '🔑 +1 Arena Anahtarı' : '🏆 Haftalık Lig Puanı (+3)'
      ];

      arena.startBattle({
        mode: 'colosseum',
        context: `Haftalık Kolezyum · <strong>${escHtml(res.opponentName)}</strong> ile 1v1 Düello`,
        rank: `ELO ${res.newRating} · ${res.tier ? res.tier.name : 'Lig Maçı'}`,
        allies: [allyUnit],
        enemies: [enemyUnit],
        loot,
        replay: res.replay,
        onComplete: () => {
          // Can, ödül ve ELO executeColosseum1v1Match içinde işlendi; burada yalnızca bildirim
          renderTopBar();
          if (res.isVictory) {
            sound.playLevelUp();
            showToast(`🏆 Zafer! +${res.rewardAda} ASTRA ve ${res.ratingDelta >= 0 ? '+' : ''}${res.ratingDelta} ELO kazanıldı!`, 'success');
          } else {
            sound.playBreakWarning();
            showToast('💀 Mağlubiyet! Şampiyonun yaralandı.', 'error');
          }
        }
      });
    });
  }
}

// =========================================================================
// 4.6b KOLEZYUM — GERÇEK RAKİPLER (sunucuda eşleşme; js/economy/pvp.js, server/arena.js)
// =========================================================================
let pvpMode = '1v1';
// Başka oyunculardan gelen isimler ekrana yazılmadan önce etkisizleştirilir (sunucu da temizler; ikinci koruma)
const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let pvpSelected = null;

function pvpUnitView(u, side) {
  return {
    uid: u.uid, name: escHtml(u.name), icon: escHtml(u.icon || (side === 'ally' ? '⚔️' : '🥷')),
    avatar: side === 'ally' ? 'assets/soldier_avatar.jpg' : 'assets/gladiator_rival.jpg',
    hp: u.maxHp, maxHp: u.maxHp, atk: u.atk,
    skills: Array.isArray(u.skills) && u.skills.length ? u.skills : ['shieldWall'],
    row: u.row || 'front'
  };
}

function playPvpReplay({ allies, enemies, sim, title, resultText, why }) {
  const arena = getBattleArena();
  if (!arena) return;
  closeModal();
  openBattleArenaModal();
  arena.startBattle({
    mode: 'colosseum',
    context: title,
    rank: 'Gerçek rakip · tekrar',
    allies: allies.map(u => pvpUnitView(u, 'ally')),
    enemies: enemies.map(u => pvpUnitView(u, 'enemy')),
    loot: why && why.length ? why.map(t => '💡 ' + t) : [],
    replay: sim,
    onComplete: () => {
      if (resultText) showToast(resultText, resultText.startsWith('🏆') ? 'success' : 'info');
    }
  });
}

async function renderPvpPanel() {
  const el = document.getElementById('pvp-panel');
  if (!el) return;
  if (!online.active) {
    el.innerHTML = `<div class="card-title">🌐 Gerçek Rakipler</div>
      <div class="clean-desc">Bu bölüm oyun sunucudan açıldığında çalışır: askerini kilitleyip "Maç ara"ya basarsın, sırada bekleyen ilk oyuncuyla maçın sunucuda oynanır. 1v1 zaferi 1, 3v3 zaferi 3 puan; haftalık ilk 10 ödül alır.</div>`;
    return;
  }
  if (!isLoggedIn()) {
    el.innerHTML = `<div class="card-title">🌐 Gerçek Rakipler</div>
      <div class="clean-desc">Gerçek oyunculara karşı maç yapmak için giriş yap ya da hesap aç.</div>
      <button id="pvp-login" class="btn-clean btn-gold" style="margin-top:8px;">🔐 Giriş Yap</button>`;
    el.querySelector('#pvp-login').addEventListener('click', async () => { if (await requireLogin()) renderPvpPanel(); });
    return;
  }
  let st;
  try { st = await pvp.status(); } catch (err) { el.innerHTML = `<div class="clean-desc" style="color:#fca5a5;">${err.message}</div>`; return; }
  const soldiers = gameState.state.soldierUnits || [];
  const size = pvpMode === '3v3' ? 3 : 1;
  if (!Array.isArray(pvpSelected) || pvpSelected.some(i => !soldiers[i])) pvpSelected = soldiers.length ? [Math.min(selectedColosseumChampionIdx || 0, soldiers.length - 1)] : [];
  const fmtN = v => Math.floor(Number(v) || 0).toLocaleString('tr-TR');
  const resIcon = { win: '🏆', loss: '💀', draw: '🤝' };
  const q = st.queue;
  const soldierList = soldiers.map((s, i) => {
    const f = gameState.getSoldierFullStats(i) || { totalAtk: 0, totalMaxHp: 0 };
    const on = pvpSelected.includes(i);
    return `<label style="display:flex;align-items:center;gap:6px;padding:4px 6px;border:1px solid ${on ? '#38bdf8' : '#334155'};border-radius:6px;cursor:pointer;font-size:0.8rem;">
      <input type="checkbox" class="pvp-pick" data-idx="${i}" ${on ? 'checked' : ''} ${q ? 'disabled' : ''}>
      ${s.icon || '⚔️'} ${s.name} · Sv ${s.level || 1} · ⚔️${fmtN(f.totalAtk)} ❤️${fmtN(f.totalMaxHp)}</label>`;
  }).join('');
  el.innerHTML = `
    <div class="card-title-row"><div class="card-title">🌐 Gerçek Rakipler</div><span class="card-badge" style="color:#38bdf8;">Sırada bekleyen: 1v1 ${st.waiting['1v1']} · 3v3 ${st.waiting['3v3']}</span></div>
    <div class="clean-desc">Askerini kilitle, "Maç ara"ya bas: sırada bekleyen ilk oyuncuyla maçın sunucuda oynanır (rakibin çevrimiçi olması gerekmez). 1v1 zaferi <strong>1 puan</strong>, 3v3 zaferi <strong>3 puan</strong>. Her Pazartesi 00:01'de ilk 10, Kolezyum kasasının %${Math.round(st.rules.weeklyPoolShare * 100)}'unu paylaşır. Maç askerinin canını azaltmaz. Giriş: anahtar + stamina (sıradan çıkarsan iade).</div>
    ${q ? `<div style="margin:10px 0;padding:10px;border:1px dashed #38bdf8;border-radius:8px;">⏳ <strong>${q.mode}</strong> için sıradasın · ${Math.max(1, Math.round((Date.now() - q.at) / 60000))} dakikadır bekliyorsun. Rakip gelince maç kendiliğinden oynanır, bildirim alırsın.
        <button id="pvp-leave" class="btn-clean btn-clean-outline" style="width:auto;margin-left:8px;padding:5px 10px;">↩️ Sıradan çık</button></div>`
      : `<div style="display:flex;gap:6px;margin:10px 0;">
        <button class="btn-clean ${pvpMode === '1v1' ? 'btn-gold' : 'btn-clean-outline'} pvp-mode" data-mode="1v1" style="width:auto;padding:6px 12px;">1v1 (1 asker)</button>
        <button class="btn-clean ${pvpMode === '3v3' ? 'btn-gold' : 'btn-clean-outline'} pvp-mode" data-mode="3v3" style="width:auto;padding:6px 12px;">3v3 (3 asker)</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px;">${soldierList || '<div class="clean-desc">Önce Kışla\'dan asker al.</div>'}</div>
      <button id="pvp-queue" class="btn-clean btn-gold" style="margin-top:10px;" ${pvpSelected.length === size ? '' : 'disabled'}>⚔️ Maç Ara (${pvpMode}) — ${pvpSelected.length}/${size} asker seçili</button>`}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:12px;">
      <div>
        <div style="font-weight:800;color:#fde047;margin-bottom:4px;">🏆 Bu haftanın ilk 10'u</div>
        ${st.top.length ? `<table style="width:100%;font-size:0.8rem;border-collapse:collapse;">${st.top.map((r, i) => `<tr style="${r.me ? 'color:#4ade80;font-weight:800;' : ''}"><td>${r.rank}.</td><td>${escHtml(r.name)}</td><td>${r.points} puan</td><td style="text-align:right;">~${fmtN(st.prizes[i])} ASTRA</td></tr>`).join('')}</table>` : '<div class="clean-desc">Bu hafta henüz maç yok. İlk puanı sen al!</div>'}
        ${st.mine ? `<div class="clean-desc" style="margin-top:4px;">Senin sıran: <strong>${st.mine.rank}.</strong> · ${st.mine.points} puan · ${st.mine.wins} galibiyet / ${st.mine.losses} mağlubiyet</div>` : ''}
      </div>
      <div>
        <div style="font-weight:800;color:#bfdbfe;margin-bottom:4px;">📜 Son maçların</div>
        ${st.matches.length ? st.matches.map(m => `<div style="border-bottom:1px solid #1e293b;padding:4px 0;font-size:0.8rem;">
          ${resIcon[m.result] || ''} <strong>${escHtml(m.mode)}</strong> · ${escHtml(m.opponent)} · ${m.points ? '+' + m.points + ' puan' : ''}
          <button class="btn-clean btn-clean-outline pvp-watch" data-id="${m.id}" style="width:auto;padding:2px 8px;font-size:0.75rem;margin-left:4px;">▶️ İzle</button>
          ${m.why ? `<div style="color:#fca5a5;margin-top:2px;">Neden kaybettin: ${escHtml(m.why.join(' '))}</div>` : ''}
        </div>`).join('') : '<div class="clean-desc">Henüz maçın yok.</div>'}
      </div>
    </div>`;

  el.querySelectorAll('.pvp-mode').forEach(b => b.addEventListener('click', () => {
    pvpMode = b.dataset.mode;
    const need = pvpMode === '3v3' ? 3 : 1;
    pvpSelected = pvpSelected.slice(0, need);
    renderPvpPanel();
  }));
  el.querySelectorAll('.pvp-pick').forEach(c => c.addEventListener('change', () => {
    const i = Number(c.dataset.idx);
    const need = pvpMode === '3v3' ? 3 : 1;
    if (c.checked) { pvpSelected = need === 1 ? [i] : [...pvpSelected.filter(x => x !== i), i].slice(-need); }
    else pvpSelected = pvpSelected.filter(x => x !== i);
    renderPvpPanel();
  }));
  el.querySelector('#pvp-leave')?.addEventListener('click', async () => {
    try { const r = await pvp.leave(); showToast(r.message, r.success ? 'success' : 'error'); } catch (err) { showToast(err.message, 'error'); }
    renderTopBar();
    renderPvpPanel();
  });
  el.querySelector('#pvp-queue')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    let r;
    try { r = await pvp.queue(pvpMode, pvpSelected); } catch (err) { showToast(err.message, 'error'); renderPvpPanel(); return; }
    renderTopBar();
    if (!r.success) { showToast(r.message, 'error'); renderPvpPanel(); return; }
    if (r.queued) { showToast(r.message, 'success'); renderPvpPanel(); return; }
    playPvpReplay({ allies: r.allies, enemies: r.enemies, sim: r.sim, title: `Gerçek rakip · <strong>${escHtml(r.opponentName)}</strong> (${escHtml(r.mode)})`, resultText: r.message, why: r.why });
  });
  el.querySelectorAll('.pvp-watch').forEach(b => b.addEventListener('click', async () => {
    try {
      const m = await pvp.match(b.dataset.id);
      const rec = st.matches.find(x => String(x.id) === String(b.dataset.id));
      playPvpReplay({ allies: m.a.units, enemies: m.b.units, sim: m.sim, title: `Tekrar · <strong>${escHtml(m.a.name)}</strong> vs <strong>${escHtml(m.b.name)}</strong> (${escHtml(m.mode)})`, resultText: '', why: rec && rec.why });
    } catch (err) { showToast(err.message, 'error'); }
  }));
}

// =========================================================================
// 4.7 PHASE 2: 18 PARÇALIK NFT KOLEKSİYONU & PANDORA KUTULARI
// =========================================================================
function renderCollectionHtml() {
  const state = gameState.state;

  const tabsHtml = `
    <div class="phase2-tab-row">
      <button class="phase2-tab-btn collection-tab-btn ${collectionActiveTab === 'koleksiyon' ? 'active' : ''}" data-tab="koleksiyon">👑 Koleksiyon (18 Eser)</button>
      <button class="phase2-tab-btn collection-tab-btn ${collectionActiveTab === 'kutular' ? 'active' : ''}" data-tab="kutular">📦 Pandora Kutuları</button>
    </div>
  `;

  let contentHtml = '';

  if (collectionActiveTab === 'koleksiyon') {
    const discoveredCount = state.collectionArtifacts.filter(a => a.discovered).length;
    const requiredCount = GAME_CONFIG.GENESIS_NFT.requiredArtifacts;
    const allDiscovered = discoveredCount >= requiredCount;
    const genesisMinted = state.genesisNftMinted;

    const artifactCards = state.collectionArtifacts.map(a => {
      const cfg = GAME_CONFIG.COLLECTION_ARTIFACTS.find(c => c.id === a.id);
      if (!a.discovered) {
        return `<div class="artifact-card locked" title="Henüz keşfedilmedi"><span>❓</span><span class="artifact-lock-icon">🔒</span></div>`;
      }
      return `<div class="artifact-card rarity-${cfg.rarity}" title="${cfg.name}: ${cfg.lore}"><span>${cfg.icon}</span></div>`;
    }).join('');

    contentHtml = `
      <div class="clean-card genesis-banner ${allDiscovered && !genesisMinted ? 'ready' : ''}">
        <div class="card-title-row">
          <div class="card-title">🏆 ${GAME_CONFIG.GENESIS_NFT.name}</div>
          <span class="card-badge">${discoveredCount}/${requiredCount} Eser</span>
        </div>
        <div class="clean-desc">Zindan bosslarını yenerek ve Pandora Kutuları açarak 18 Koleksiyon Eserinin tamamını topla; ardından efsanevi Genesis NFT'ni bas!</div>
        <button id="btn-mint-genesis" class="btn-clean btn-clean-purple" ${(!allDiscovered || genesisMinted) ? 'disabled' : ''}>
          ${genesisMinted ? '✅ Genesis NFT Zaten Basıldı' : `🏆 GENESIS NFT BAS (${GAME_CONFIG.GENESIS_NFT.adAstraCost} ASTRA)`}
        </button>
      </div>
      <div class="collection-grid">${artifactCards}</div>
    `;
  } else {
    const lockedBoxes = state.lockedBoxes || 0;
    const arenaKeys = state.arenaKeys || 0;
    const canOpen = lockedBoxes > 0 && arenaKeys > 0;

    let revealHtml = '';
    if (lastBoxResult) {
      revealHtml = `<div class="clean-card box-reveal-card"><div class="card-title">🎉 ${lastBoxResult.message}</div></div>`;
    }

    const boxCount = Math.min(lockedBoxes, 12);
    const boxesHtml = boxCount > 0
      ? Array.from({ length: boxCount }, () => `<div class="mystery-box-item">📦</div>`).join('')
      : `<div class="phase2-empty-state">Şu anda açılacak bir Pandora Kutun yok. Zindanlarda canavar öldürerek şansını dene!</div>`;

    contentHtml = `
      <div class="clean-card">
        <div class="card-title-row">
          <div class="card-title">📦 Pandora Kutuları</div>
          <span class="card-badge">🔑 ${arenaKeys} Anahtar</span>
        </div>
        <div class="clean-desc">Her kutuyu açmak 1 🔑 Anahtar gerektirir. Anahtarlar yalnızca Kolezyum derecesinden, Şans Çarkından veya AMM Pazarından temin edilebilir. Koleksiyonu tamamlayanlar fazla kutularını AMM pazarında ~10.000 ASTRA gibi yüksek bir fiyata satabilir!</div>
      </div>
      ${revealHtml}
      <div class="mystery-box-grid">${boxesHtml}</div>
      <button id="btn-open-mystery-box" class="btn-clean btn-clean-green" ${canOpen ? '' : 'disabled'}>
        📦 PANDORA KUTUSU AÇ (1 🔑 Anahtar Harca) — ${lockedBoxes} Kutu Mevcut
      </button>
    `;
  }

  return tabsHtml + contentHtml;
}

function openCollectionModal(initialTab) {
  if (initialTab) {
    collectionActiveTab = initialTab;
    lastBoxResult = null;
  }
  dom.modalTitle.innerHTML = `<span>👑</span> <span>18 PARÇALIK NFT KOLEKSİYONU & PANDORA KUTULARI</span>`;
  dom.modalBody.innerHTML = renderCollectionHtml();
  displayModal();
}


// =========================================================================
// 4.9 BİLDİRİM MERKEZİ (NOTIFICATION CENTER)
// =========================================================================
const realmNotifications = [
  { id: 1, icon: '🏰', text: 'AdAstra Krallığına hoş geldin! Krallığını büyütmek için sefere çık.', time: 'Şimdi', unread: true }
];

function addNotification(icon, text) {
  realmNotifications.unshift({
    id: Date.now(),
    icon: icon || '🔔',
    text,
    time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    unread: true
  });
  updateNotificationBadge();
}

function updateNotificationBadge() {
  const badge = document.getElementById('notif-badge');
  const botWarning = gameState.getBotResourceDeficitWarning();
  const unreadCount = realmNotifications.filter(n => n.unread).length + (botWarning ? 1 : 0);
  if (badge) {
    badge.innerText = unreadCount;
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
  }
}

function toggleNotificationPanel() {
  let panel = document.getElementById('notif-dropdown-panel');
  if (panel) {
    panel.remove();
    return;
  }

  realmNotifications.forEach(n => n.unread = false);
  updateNotificationBadge();

  panel = document.createElement('div');
  panel.id = 'notif-dropdown-panel';
  panel.className = 'notif-panel';

  const botWarning = gameState.getBotResourceDeficitWarning();
  const botWarningHtml = botWarning ? `
    <div class="notif-item unread" style="background: rgba(239,68,68,0.15); border-left: 3px solid #ef4444;">
      <span class="notif-item-icon">⚠️</span>
      <div class="notif-item-text">
        <div style="color: #fca5a5; font-weight: 700;">${botWarning.title}</div>
        <div style="font-size: 0.76rem; color: #cbd5e1; margin-top: 2px;">${botWarning.text}</div>
        <div class="notif-item-time" style="color: #ef4444;">Aktif Uyarı</div>
      </div>
    </div>
  ` : '';

  const itemsHtml = realmNotifications.slice(0, 10).map(n => `
    <div class="notif-item ${n.unread ? 'unread' : ''}">
      <span class="notif-item-icon">${n.icon}</span>
      <div class="notif-item-text">
        <div>${n.text}</div>
        <div class="notif-item-time">${n.time}</div>
      </div>
    </div>
  `).join('');

  panel.innerHTML = `
    <div class="notif-panel-header">
      <span>🔔 BİLDİRİM MERKEZİ</span>
      <span style="font-size:0.7rem; color:#94a3b8; cursor:pointer;" id="btn-clear-notifs">Temizle</span>
    </div>
    <div style="max-height: 340px; overflow-y: auto;">
      ${botWarningHtml}
      ${itemsHtml || '<div style="padding:16px; text-align:center; color:#94a3b8; font-size:0.8rem;">Yeni bildirim yok.</div>'}
    </div>
  `;

  document.body.appendChild(panel);

  const clearBtn = panel.querySelector('#btn-clear-notifs');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      realmNotifications.length = 0;
      updateNotificationBadge();
      panel.remove();
    });
  }

  setTimeout(() => {
    const closeListener = (e) => {
      if (!panel.contains(e.target) && !e.target.closest('#btn-notif-bell')) {
        panel.remove();
        document.removeEventListener('click', closeListener);
      }
    };
    document.addEventListener('click', closeListener);
  }, 50);
}

// =========================================================================
// 4.10 KRALLIK DASHBOARD (MASTER COMMAND CENTER)
// =========================================================================
function openDashboardModal() {
  const summary = gameState.getRealmSummary();
  const repairCosts = gameState.getAllRepairCost();
  const healCosts = gameState.getAllHealCost();

  dom.modalTitle.innerHTML = `<span>🏰</span> <span>KRALLIK MERKEZİ</span>`;

  const missingStamina = Math.max(0, summary.maxStamina - Math.floor(summary.stamina));
  const wheatPerStamina = GAME_CONFIG.WHEAT_PER_STAMINA || 3.15;
  const wheatNeededForFull = Math.ceil(missingStamina * wheatPerStamina);
  const userWheat = Math.floor(Number(gameState.state.inventory.wheat) || 0);
  const isStaminaFull = summary.stamina >= summary.maxStamina;
  const canRefillStamina = !isStaminaFull && userWheat > 0;

  const scrollHeal = Number(gameState.state.inventory.scroll_heal) || 0;
  const scrollStamina = Number(gameState.state.inventory.scroll_stamina) || 0;

  // 1-Click Top Actions Bar
  const quickActionsHtml = `
    <div class="clean-card" style="background: linear-gradient(135deg, rgba(20,14,8,0.95), rgba(35,22,12,0.95)); border-color: rgba(245,158,11,0.5);">
      <div class="card-title-row">
        <div class="card-title">⚡ Tek dokunuşla toplu işlemler</div>
        <span class="card-badge kbd-hint" style="color: #fde047;">Kısayol: TAB</span>
      </div>
      <div class="dashboard-1click-grid">
        <button class="btn-1click btn-1click-claim-restart-exp" title="Tamamlanan veya sürmekte olan tüm seferlerin biriken kaynaklarını anında topla ve boştakileri başlat">
          <span>⚡</span> <span>Tüm Seferleri Topla & Başlat</span>
        </button>
        <button class="btn-1click btn-1click-refill-stamina" ${!canRefillStamina ? 'disabled' : ''} title="Depodaki buğday ile tüm staminayı tek tıkla tamamen doldur">
          <span>⚡</span> <span>Tüm Staminayı Doldur (${isStaminaFull ? 'Dolu' : `${wheatNeededForFull} 🌾`})</span>
        </button>
        ${scrollStamina > 0 ? `
          <button class="btn-1click btn-use-scroll" data-scroll="scroll_stamina" ${isStaminaFull ? 'disabled' : ''} style="background: linear-gradient(135deg, rgba(88,28,135,0.4), rgba(59,7,100,0.6)); border-color: #a855f7; color: #f3e8ff;" title="100 Stamina Doldurma Parşömeni Kullanarak Enerjiye +100 Ekle">
            <span>📜</span> <span>Parşömenle +100 Stamina Doldur (${scrollStamina})</span>
          </button>
        ` : ''}
        <button class="btn-1click btn-1click-repair-tools" ${repairCosts.count === 0 ? 'disabled' : ''} title="Tüm aşınmış aletleri tamir et">
          <span>🔨</span> <span>Tüm Aletleri Onar (${repairCosts.count === 0 ? 'Tam Sağlam' : `${repairCosts.totalWood} 🌲 ${repairCosts.totalIron} ⛏️ ${repairCosts.totalAda} 🟣`})</span>
        </button>
        <button class="btn-1click btn-1click-heal-army" ${healCosts.count === 0 ? 'disabled' : ''} title="Tüm yaralı askerleri doyur ve iyileştir">
          <span>🌾</span> <span>Tüm Orduyu Doyur (${healCosts.count === 0 ? 'Tam Sağlıklı' : `${healCosts.totalWheat} 🌾 ${healCosts.totalAda.toFixed(1)} 🟣`})</span>
        </button>
        ${scrollHeal > 0 ? `
          <button class="btn-1click btn-use-scroll" data-scroll="scroll_heal" ${healCosts.count === 0 ? 'disabled' : ''} style="background: linear-gradient(135deg, rgba(88,28,135,0.4), rgba(59,7,100,0.6)); border-color: #a855f7; color: #f3e8ff;" title="Ordu İyileştirme Parşömeni Kullanarak Bir Askeri İyileştir">
            <span>📜</span> <span>Parşömenle Orduyu İyileştir (${scrollHeal})</span>
          </button>
        ` : ''}
      </div>
    </div>
  `;

  // 6 Widget Grid
  const widgetsHtml = `
    <div class="dashboard-grid">
      <!-- Widget 1: Genel Bakış -->
      <div class="dashboard-widget">
        <div class="dashboard-widget-title"><span>📊</span> <span>Genel Durum</span></div>
        <div class="dashboard-stat-row">
          <span>Karakter Seviyesi</span>
          <span class="dashboard-stat-value" style="color:#fde047;">Lv.${summary.level}</span>
        </div>
        <div class="dashboard-stat-row">
          <span>ASTRA Bakiyesi</span>
          <span class="dashboard-stat-value" style="color:#c084fc;">${summary.ada.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} 🟣</span>
        </div>
        <div class="dashboard-stat-row">
          <span>Stamina Enerjisi</span>
          <span class="dashboard-stat-value" style="color:#38bdf8;">${Math.floor(summary.stamina)} / ${summary.maxStamina} ⚡</span>
        </div>
        <div class="dashboard-mini-bar">
          <div class="dashboard-mini-bar-fill" style="width:${Math.min(100, (summary.stamina / summary.maxStamina) * 100)}%; background:linear-gradient(90deg,#0284c7,#38bdf8);"></div>
        </div>
      </div>

      <!-- Widget 2: Aktif Seferler -->
      <div class="dashboard-widget">
        <div class="dashboard-widget-title"><span>⚡</span> <span>Sefer Takipçisi (${summary.activeExps.length}/3)</span></div>
        ${summary.activeExps.map(e => `
          <div class="dashboard-stat-row">
            <span>${e.icon} ${e.name}</span>
            <span class="dashboard-stat-value" style="color:${e.isCompleted ? '#4ade80' : '#facc15'};">
              ${e.isCompleted ? '✅ HAZIR' : formatCountdown(e.remainingSeconds)}
            </span>
          </div>
          <div class="dashboard-mini-bar">
            <div class="dashboard-mini-bar-fill" style="width:${e.pct}%; background:${e.isCompleted ? '#22c55e' : '#f59e0b'};"></div>
          </div>
        `).join('') || '<div style="color:#94a3b8; font-size:0.8rem; padding:6px 0;">Şu an aktif sefer yok.</div>'}
      </div>

      <!-- Widget 3: Alet Sağlığı (72 Saat = 4320 Dakika) -->
      <div class="dashboard-widget">
        <div class="dashboard-widget-title"><span>🔨</span> <span>Alet Dayanıklılıkları (Ort. %${summary.avgToolHealth})</span></div>
        ${summary.toolSummary.map(t => `
          <div class="dashboard-stat-row">
            <span>${t.icon} ${t.name}</span>
            <span class="dashboard-stat-value" style="color:${t.pct < 20 ? '#ef4444' : '#34d399'};">${t.durability}/${t.maxDurability || 4320}</span>
          </div>
          <div class="dashboard-mini-bar">
            <div class="dashboard-mini-bar-fill" style="width:${t.pct}%; background:${t.pct < 20 ? '#ef4444' : '#10b981'};"></div>
          </div>
        `).join('')}
      </div>

      <!-- Widget 4: Ordu & Sağlık -->
      <div class="dashboard-widget">
        <div class="dashboard-widget-title"><span>🛡️</span> <span>Ordu (%${summary.avgHpPct} Can)</span></div>
        <div class="dashboard-stat-row">
          <span>Toplam Savaş Gücü</span>
          <span class="dashboard-stat-value" style="color:#fde047;">⚔️ ${summary.totalAtk} ATK • ❤️ ${summary.totalHp} HP</span>
        </div>
        <div class="dashboard-stat-row">
          <span>Yaralı Askerler</span>
          <span class="dashboard-stat-value" style="color:${summary.woundedCount > 0 ? '#ef4444' : '#4ade80'};">
            ${summary.woundedCount > 0 ? `⚠️ ${summary.woundedCount} Asker Yaralı` : '✅ Tüm Ordu Zinde'}
          </span>
        </div>
        <div class="dashboard-mini-bar">
          <div class="dashboard-mini-bar-fill" style="width:${summary.avgHpPct}%; background:${summary.avgHpPct < 50 ? '#ef4444' : '#10b981'};"></div>
        </div>
      </div>

      <!-- Widget 6: Silo & Depo Doluluk -->
      <div class="dashboard-widget">
        <div class="dashboard-widget-title"><span>📦</span> <span>Silo & Depo Kapasitesi (Seviye ${gameState.state.warehouseLevel})</span></div>
        <div class="dashboard-stat-row">
          <span>🌲 Odun (%${summary.woodPct})</span>
          <span class="dashboard-stat-value">${(Number(summary.inventory.wood) || 0).toFixed(0)} / ${summary.warehouseCapacity.wood}</span>
        </div>
        <div class="dashboard-mini-bar">
          <div class="dashboard-mini-bar-fill" style="width:${summary.woodPct}%; background:#10b981;"></div>
        </div>
        <div class="dashboard-stat-row" style="margin-top:6px;">
          <span>⛏️ Demir (%${summary.ironPct})</span>
          <span class="dashboard-stat-value">${(Number(summary.inventory.iron) || 0).toFixed(0)} / ${summary.warehouseCapacity.iron}</span>
        </div>
        <div class="dashboard-mini-bar">
          <div class="dashboard-mini-bar-fill" style="width:${summary.ironPct}%; background:#0284c7;"></div>
        </div>
        <div class="dashboard-stat-row" style="margin-top:6px;">
          <span>🌾 Buğday (%${summary.wheatPct})</span>
          <span class="dashboard-stat-value">${(Number(summary.inventory.wheat) || 0).toFixed(0)} / ${summary.warehouseCapacity.wheat}</span>
        </div>
        <div class="dashboard-mini-bar">
          <div class="dashboard-mini-bar-fill" style="width:${summary.wheatPct}%; background:#f59e0b;"></div>
        </div>
      </div>
    </div>
  `;

  dom.modalBody.innerHTML = quickActionsHtml + widgetsHtml;
  displayModal();
}

// =========================================================================
// 4.10B KRALLIK HAZİNESİ & ÖDÜL HAVUZLARI MERKEZİ (TREASURY VAULT DASHBOARD)
// =========================================================================
function openTreasuryVaultModal() {
  const summary = gameState.getTreasuryVaultSummary();

  dom.modalTitle.innerHTML = `<span>🏛️</span> <span>Sirius Konseyi & Hazine</span>`;

  const topOverviewHtml = `
    <div class="clean-card" style="background: linear-gradient(135deg, rgba(26,18,8,0.95), rgba(45,28,10,0.95)); border-color: #eab308; box-shadow: 0 0 25px rgba(234,179,8,0.15);">
      <div class="card-title-row">
        <div class="card-title" style="color: #fef08a; font-size: 1.1rem;">👑 Büyük Krallık Kasası & Tokenomics Rezervi</div>
        <span class="card-badge" style="color: #4ade80; background: rgba(74,222,128,0.15); border: 1px solid #4ade80;">10 Yıllık Sürdürülebilir Ekonomi</span>
      </div>
      <div class="clean-desc" style="color: #cbd5e1; font-size: 0.84rem; line-height: 1.5; margin-top: 4px;">
        AdAstra ekosistemindeki tüm harcamalar, pazar vergileri, arena girişleri ve NFT alımları bu ana hazinede toplanır ve topluluğa ödül olarak geri dağıtılır.
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 14px;">
        <div style="background: #151a26; padding: 12px 14px; border-radius: 8px; border: 1px solid #583007;">
          <div style="font-size: 0.76rem; color: #94a3b8; font-weight: 700;">Toplam Kilitli Ödül & Hazine</div>
          <div style="font-size: 1.3rem; font-weight: 900; color: #fde047; margin-top: 4px;">
            ${summary.totalVaultAda.toLocaleString('tr-TR')} <span style="font-size: 0.85rem; color: #c084fc;">ASTRA</span>
          </div>
        </div>
        <div style="background: #151a26; padding: 12px 14px; border-radius: 8px; border: 1px solid #583007;">
          <div style="font-size: 0.76rem; color: #94a3b8; font-weight: 700;">AMM Likidite Rezervi</div>
          <div style="font-size: 1.3rem; font-weight: 900; color: #38bdf8; margin-top: 4px;">
            ${summary.totalAmmLiquidityAda.toLocaleString('tr-TR')} <span style="font-size: 0.85rem; color: #c084fc;">ASTRA</span>
          </div>
        </div>
        <div style="background: #151a26; padding: 12px 14px; border-radius: 8px; border: 1px solid #583007;">
          <div style="font-size: 0.76rem; color: #94a3b8; font-weight: 700;">Kalıcı Yakılan (Deflasyon)</div>
          <div style="font-size: 1.3rem; font-weight: 900; color: #f97316; margin-top: 4px;">
            🔥 ${summary.burnedNftPool.toLocaleString('tr-TR')} <span style="font-size: 0.85rem; color: #c084fc;">ASTRA</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Her 100 ASTRA harcamanın dağılımı ve kasaların payları (ayarlardan)
  const A = GAME_CONFIG.TREASURY_ALLOCATION || {};
  const T = GAME_CONFIG.TOKEN_REWARD_POOL_RATE ?? 0.86;
  const shareOf = { world_boss: A.worldBoss, colosseum_arena: A.arena, dungeon_loot: A.dungeon, carnival_events: A.carnival, quest_pool: A.quest, amm_buyback: A.ammBuyback };
  const pctTxt = v => '%' + (Math.round(v * 1000) / 10).toLocaleString('tr-TR');
  const split = [
    ['Oyun kasaları', T, '#e7b94c'], ['Temel gelir (UBI)', GAME_CONFIG.UBI_POOL_RATE ?? 0.06, '#43d19a'],
    ['Yakım', GAME_CONFIG.TOKEN_BURN_RATE ?? 0.05, '#f06868'], ['Yapımcı payı', GAME_CONFIG.CREATOR_ROYALTY_RATE ?? 0.03, '#a894ff']
  ];
  const splitHtml = `
    <div class="clean-card" style="margin-top: 12px; padding: 12px 14px;">
      <div style="font-size: 0.86rem; font-weight: 800; color: #e2e8f0; margin-bottom: 8px;">Oyunda harcanan her 100 ASTRA nereye gider?</div>
      <div style="display: flex; height: 12px; border-radius: 99px; overflow: hidden; background: rgba(255,255,255,.06);">
        ${split.map(([, v, c]) => `<div style="width: ${v * 100}%; background: ${c};"></div>`).join('')}
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 8px; font-size: 0.78rem; color: #cbd5e1;">
        ${split.map(([l, v, c]) => `<span><span style="display:inline-block; width:9px; height:9px; border-radius:2px; background:${c}; margin-right:5px;"></span>${l} <strong>${Math.round(v * 100)}</strong></span>`).join('')}
      </div>
      <div style="font-size: 0.74rem; color: #94a3b8; margin-top: 6px;">Oyun kasalarına giden pay aşağıdaki kasalara bölünür; ödüller (zindan, boss, kolezyum, görev, çark) bu kasalardan ödenir, havadan basılmaz.</div>
    </div>`;

  const poolsGridHtml = `
    <div style="font-size: 0.95rem; font-weight: 800; color: #facc15; margin: 14px 0 8px;">Ödül kasaları</div>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px;">
      ${summary.pools.map(pool => {
        const sh = shareOf[pool.id];
        const shareTxt = pool.id === 'ubi_pool' ? `her harcamadan ${pctTxt(GAME_CONFIG.UBI_POOL_RATE ?? 0.06)} pay` : sh ? `her harcamadan ${pctTxt(T * sh)} pay` : '';
        return `
        <div class="clean-card" style="margin: 0; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; border-color: ${pool.color}55;">
          <div style="display: flex; gap: 10px; align-items: center;">
            <span style="font-size: 1.7rem; width: 36px; text-align: center;">${pool.icon}</span>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 800; font-size: 0.92rem; color: #fff; line-height: 1.25;">${pool.name}</div>
              <div style="font-size: 1.12rem; font-weight: 900; color: ${pool.color};">${pool.totalPoolAda.toLocaleString('tr-TR')} <span style="font-size: 0.74rem; color: #c084fc;">ADA</span></div>
            </div>
            <span style="font-size: 0.68rem; padding: 2px 7px; border-radius: 4px; background: rgba(255,255,255,0.07); color: #cbd5e1; font-weight: 700; align-self: flex-start;">${pool.statusBadge}</span>
          </div>
          <div style="font-size: 0.76rem; color: #94a3b8; line-height: 1.35;">${pool.description}${shareTxt ? ` <span style="color:#e7b94c;">Gelir: ${shareTxt}.</span>` : ''}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid rgba(255,255,255,.06); padding-top: 8px; margin-top: auto;">
            <span style="font-size: 0.78rem; color: #cbd5e1; flex: 1; min-width: 0;">👤 ${pool.userShareText}</span>
            <button class="btn-clean btn-treasury-action" data-action="${pool.actionType}" style="padding: 5px 10px; font-size: 0.76rem; width: auto; border: 1px solid ${pool.color}; background: transparent; color: #fff; white-space: nowrap; flex-shrink: 0;">${pool.actionText} →</button>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;

  // v2: Sirius Konseyi — üretim düzeni (kota termostatı, Otorite, ağırlık) ve ortak kasa stoğu
  const us = gameState.getUretimSummary ? gameState.getUretimSummary() : null;
  const konseyStock = (typeof globalPool !== 'undefined' && globalPool.getKonseyStock) ? globalPool.getKonseyStock() : {};
  const konseyHtml = us ? `
    <div class="clean-card" style="border-color:#a78bfa;">
      <div class="card-title-row">
        <div class="card-title" style="color:#c4b5fd;">🏛️ Sirius Konseyi — üretim düzeni ve ortak kasa</div>
        <span class="card-badge">Otorite sv.${us.otorite.level} · ${Math.round(us.otorite.hours)} sa × ${Math.round(us.otorite.days)} gün</span>
      </div>
      <div class="clean-desc">Kişi başı kota (termostat): her hafta kaynağın fiyatı açılışın üstündeyse +%10, altındaysa −%10 (0,05-1,0). Senin ağırlığın ×${us.weight.weight} (seviye ×${us.weight.levelFactor} · katkı kademesi ${us.weight.tier.name} ×${us.weight.tier.mult} · aktiflik ×${us.weight.activity}). Dünya ağırlık toplamı: ${(us.params.sumWeight || 1).toLocaleString('tr-TR')}. Çıkarılan her hammaddenin %5'i ortak kasada birikir.</div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:8px; font-size:0.82rem;">
        ${RES_KEYS().map(k => { const m = RES_META()[k] || {}; const r = us.rights[k]; return `<div class="stat-tile"><span class="stat-tile-label">${m.icon || ''} ${m.name || k}</span><strong>${fmtInt(r.used)} / ${fmtInt(r.weekly)}</strong><span class="stat-tile-sub">kota %${Math.round((r.qpp || 0) * 100)} · ortak kasa ${fmtInt(konseyStock[k] || 0)}</span></div>`; }).join('')}
      </div>
      ${(() => { const ot = globalPool.getOtoriteStatus(); const pj = globalPool.getProjectStatus(); const vi = gameState.getVillageInfo(); const inv = gameState.state.inventory || {}; const lbl = k => k === 'labor' ? '💪 Emek' : `${(RES_META()[k] || {}).icon || ''} ${(RES_META()[k] || {}).name || k}`; const row = (k, have, need) => `<div style="display:flex; justify-content:space-between; font-size:0.82rem;"><span>${lbl(k)}</span><span><strong>${fmtInt(have)}</strong> / ${fmtInt(need)}</span></div>`; const giveBtn = (target, k) => k === 'labor' ? `<button class="btn-clean btn-clean-outline btn-konsey-contribute" data-target="${target}" data-res="labor" style="width:auto; padding:5px 10px; font-size:0.78rem;" ${Math.floor(vi.labor) >= 1 ? '' : 'disabled'}>💪 Emek ver (hepsi: ${fmtInt(Math.floor(vi.labor))})</button>` : `<span style="display:inline-flex; align-items:center; gap:4px;"><input type="number" class="konsey-amt" data-target="${target}" data-res="${k}" min="1" max="${Math.floor(inv[k] || 0)}" value="${Math.floor((inv[k] || 0) / 2)}" style="width:84px; padding:4px 6px; border-radius:6px; border:1px solid rgba(255,255,255,.15); background:rgba(0,0,0,.35); color:#e2e8f0; font-size:0.78rem;" title="Verilecek miktar (elinde ${fmtInt(inv[k] || 0)})"><button class="btn-clean btn-clean-outline btn-konsey-contribute" data-target="${target}" data-res="${k}" style="width:auto; padding:5px 10px; font-size:0.78rem;" ${(inv[k] || 0) >= 1 ? '' : 'disabled'}>${lbl(k)} ver</button></span>`; return `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:10px; margin-top:10px;">
        <div style="background:rgba(255,255,255,.04); border-radius:8px; padding:10px;">
          <div style="font-weight:800; color:#e2e8f0;">⛏️ Madencilik Otoritesi — seviye ${ot.level}${ot.maxed ? ' (en üst)' : ` → ${ot.level + 1}`}</div>
          <div style="font-size:0.78rem; color:#94a3b8; margin:4px 0 6px;">Her seviye: kapasite ve herkesin hakkı +%${Math.round(ot.perLevelBonus * 100)}, çalışma ${ot.hours} sa × ${ot.days} gün → ${ot.nextHours} sa × ${ot.nextDays} gün. Karışım: taş %40, demir %20, odun %10; çelik payı %30 Konsey kasasından (${fmtInt(ot.steelAstra)} ASTRA).</div>
          ${ot.maxed ? '' : `<div style="height:8px; background:rgba(255,255,255,.08); border-radius:99px; overflow:hidden; margin-bottom:6px;"><div style="height:100%; width:${ot.pct}%; background:#a78bfa;"></div></div>
          ${Object.keys(ot.need).map(k => row(k, ot.progress[k] || 0, ot.need[k])).join('')}
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">${Object.keys(ot.need).map(k => giveBtn('otorite', k)).join('')}</div>`}
        </div>
        <div style="background:rgba(255,255,255,.04); border-radius:8px; padding:10px;">
          <div style="font-weight:800; color:#e2e8f0;">${pj.active ? `${pj.active.icon} Konsey projesi: ${pj.active.name}` : '✅ Bütün Konsey projeleri bitti'}</div>
          ${pj.active ? `<div style="font-size:0.78rem; color:#94a3b8; margin:4px 0 6px;">${pj.active.desc} Gereken: ${fmtInt(pj.active.units)} birim hammadde (Otorite karışımı) + ${fmtInt(pj.active.labor)} emek. Senin emek puanın: ${fmtInt(vi.labor)}.</div>
          <div style="height:8px; background:rgba(255,255,255,.08); border-radius:99px; overflow:hidden; margin-bottom:6px;"><div style="height:100%; width:${pj.pct}%; background:#38bdf8;"></div></div>
          ${Object.keys(pj.need).map(k => row(k, pj.progress[k] || 0, pj.need[k])).join('')}
          ${row('labor', pj.labor, pj.active.labor)}
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">${Object.keys(pj.need).map(k => giveBtn('project', k)).join('')}<button class="btn-clean btn-clean-outline btn-konsey-contribute" data-target="project" data-res="labor" style="width:auto; padding:5px 10px; font-size:0.78rem;" ${vi.labor >= 1 ? '' : 'disabled'}>💪 Emek ver (hepsi: ${fmtInt(vi.labor)})</button></div>` : ''}
          ${pj.done.length ? `<div style="font-size:0.78rem; color:#4ade80; margin-top:6px;">Biten: ${pj.done.map(d => d.icon + ' ' + d.name).join(', ')}</div>` : ''}
        </div>
      </div>`; })()}
    </div>` : '';

  // v2: Kapı durumu (R4/R4c) — vatandaş sınırı, sıra, askı, büyüme göstergesi (sunucudan; çevrimdışı denemede yok)
  const kp = online.kapi;
  const kapiHtml = kp ? `
    <div class="clean-card" style="border-color:#f59e0b;">
      <div class="card-title-row">
        <div class="card-title" style="color:#fcd34d;">🚪 Kapı durumu — vatandaş ${fmtInt(kp.citizens)} / ${fmtInt(kp.limit)}</div>
        <span class="card-badge">sırada ${fmtInt(kp.waiting)} · askıda ${fmtInt(kp.suspended)}</span>
      </div>
      <div class="clean-desc">Vadinin vatandaş sınırı ${fmtInt(kp.limit)}. Kayıt her zaman açık: yer yoksa hesap bekleme sırasına girer ve vadiyi gezer. ${kp.warnDays} gün girmeyene uyarı gider; ${kp.suspendDays} gün girmeyenin yeri sıradakine geçer (hesap silinmez, dönünce sıranın önüne alınır). Gösterge: son 3 ayda kişi başı aylık dağıtılan kazanç <strong>${(kp.indicator?.usdPerPlayerMonth || 0).toLocaleString('tr-TR')} $</strong> (${kp.indicator?.weeks || 0} hafta); bu dönemin eşiği ${kp.threshold} $. Eşik geçilince sınır ayda %10 büyür.</div>
    </div>` : '';
  dom.modalBody.innerHTML = kapiHtml + konseyHtml + topOverviewHtml + splitHtml + poolsGridHtml;

  document.querySelectorAll('.btn-treasury-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.action;
      if (act === 'boss') openBattlefieldModal();
      else if (act === 'colosseum') openColosseumModal();
      else if (act === 'dungeon') { closeModal(); window.dispatchEvent(new CustomEvent('enter-dungeon-view')); }
      else if (act === 'collection') openCollectionModal();
      else if (act === 'carnival') openCarnivalModal('wheel');
      else if (act === 'amm_buyback') { marketActiveTab = 'buyback_vault'; openTownZoneModal('market', '🏪 AMM Pazar Alanı'); }
      else if (act === 'ubi') openEconomyDashboardModal('overview');
      else if (act === 'parliament') showToast('🏛️ AdAstra Meclisi yakında: topluluk oylamaları hazırlanıyor.', 'info');
      else if (act === 'quests') { closeModal(); guideExpanded = true; renderGuideWidget(); }
    });
  });

  displayModal();
}

// =========================================================================
// 4.11 SMART ARMORY (AKILLI SİLAH DEPOSU & ENTITLE MATRİSİ)
// =========================================================================
function openSmartArmoryModal() {
  dom.modalTitle.innerHTML = `<span>⚔️</span> <span>AKILLI SİLAH DEPOSU & ENTITLE MATRİSİ</span>`;

  const state = gameState.state;
  const soldiers = state.soldierUnits || [];
  const playerEquip = state.equipment || {};

  const unassignedItems = [];
  ['weapon', 'helmet', 'armor', 'legs', 'boots'].forEach(slot => {
    if (playerEquip && playerEquip[slot]) {
      unassignedItems.push({ slot, source: 'kingdom', ...playerEquip[slot] });
    }
  });
  (state.armoryInventory || []).forEach((item, armIdx) => {
    if (item) {
      unassignedItems.push({ slot: item.slot, source: 'armory', armoryIndex: armIdx, ...item });
    }
  });

  const leftPanelHtml = `
    <div class="armory-inv-panel">
      <div style="font-weight:800; font-size:0.9rem; color:#fde047; margin-bottom:8px; display:flex; justify-content:space-between;">
        <span>📦 Boşta Kalan Dövülmüş Eşyalar (${unassignedItems.length})</span>
      </div>
      <div class="clean-desc" style="margin-bottom:10px;">Demirci'de dövüp henüz askerlere kuşandırmadığın hazır eşyalar:</div>
      ${unassignedItems.map(item => `
        <div class="armory-equip-item">
          <span style="font-size:1.2rem;">${item.slot === 'weapon' ? '🗡️' : (item.slot === 'helmet' ? '🪖' : (item.slot === 'armor' ? '🛡️' : (item.slot === 'legs' ? '👖' : '👢')))}</span>
          <div style="flex:1;">
            <div style="font-weight:700; color:#fff;">${item.name || item.slot}</div>
            <div style="font-size:0.75rem; color:#94a3b8;">
              ${item.atkBonus ? `+${item.atkBonus} ATK ` : ''}${item.hpBonus ? `+${item.hpBonus} HP` : ''} • Dayanıklılık: ${item.durability || 100}%
            </div>
          </div>
          <span class="rarity-tag ${(item.rarity || 'rare').toLowerCase()}">${item.rarity || 'RARE'}</span>
        </div>
      `).join('') || '<div style="padding:20px; text-align:center; color:#94a3b8; font-size:0.8rem;">Envanterde boş eşya yok. Demirci\'de yeni eşyalar dövebilirsin!</div>'}
    </div>
  `;

  const rightPanelHtml = `
    <div class="armory-soldiers-panel">
      <div style="font-weight:800; font-size:0.9rem; color:#4ade80; margin-bottom:8px;">
        <span>🛡️ Ordu Donatım Durumu</span>
      </div>
      ${soldiers.map((sol, idx) => {
        const stats = gameState.getSoldierFullStats(idx);
        const setBonus = gameState.getSoldierSetBonus(idx);
        const slots = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
        const filledSlots = slots.filter(s => sol.equipment && sol.equipment[s]).length;

        return `
          <div class="armory-soldier-mini ${selectedSoldierIndex === idx ? 'selected' : ''}" data-soldier-idx="${idx}">
            <span style="font-size:1.1rem;">${sol.icon || '⚔️'}</span>
            <div style="flex:1;">
              <div style="font-weight:700; color:#fff;">#${idx + 1} ${sol.name}</div>
              <div style="font-size:0.72rem; color:#94a3b8;">
                ⚔️ ${stats?.totalAtk || 20} ATK • ❤️ ${sol.hp || 100}/${stats?.totalMaxHp || 100} HP
                ${setBonus ? `<span style="color:#c084fc; font-weight:700;"> • ✨ ${setBonus.name}</span>` : ''}
              </div>
            </div>
            <div class="armory-slots-mini" title="${filledSlots}/5 Yuva Dolu">
              ${slots.map(s => `<div class="armory-slot-dot ${sol.equipment && sol.equipment[s] ? 'filled' : ''}"></div>`).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  dom.modalBody.innerHTML = `
    <div class="clean-card" style="margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <div>
          <div class="card-title">⚔️ Akıllı Silah Dağıtım & Donatım Hub'ı</div>
          <div class="clean-desc">Tüm dövülmüş eşyaları tek tıkla orduna dağıt veya tüm teçhizatları tek tıkla sök!</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn-clean btn-clean-green btn-smart-auto-equip" style="width:auto; padding:8px 14px; font-size:0.8rem;">
            ⚡ En İyi Eşyaları Otomatik Kuşan
          </button>
          <button class="btn-clean btn-clean-gold btn-smart-unequip-all" style="width:auto; padding:8px 14px; font-size:0.8rem;">
            🔄 Tüm Eşyaları Sök
          </button>
          <button class="btn-clean btn-clean-blue btn-smart-repair-all-equip" style="width:auto; padding:8px 14px; font-size:0.8rem;">
            🔨 Tümünü Onar
          </button>
          <button class="btn-clean btn-smart-scrap-low-tier" style="width:auto; padding:8px 14px; font-size:0.8rem; background:rgba(239,68,68,0.2); border:1px solid #ef4444; color:#fca5a5;">
            ♻️ Düşükleri Hurdaya Çevir
          </button>
        </div>
      </div>
    </div>
    <div class="armory-layout">
      ${leftPanelHtml}
      ${rightPanelHtml}
    </div>
  `;

  displayModal();
}

// =========================================================================
// ♻️ DEMİRCİ HURDA VE GERİ DÖNÜŞÜM RAPORU AÇILIR PENCERESİ (MODAL)
// =========================================================================
function openScrapReportModal(report) {
  dom.modalTitle.innerHTML = `<span>♻️</span> <span>DEMİRCİ HURDA & GERİ DÖNÜŞÜM RAPORU</span>`;

  const items = report.scrappedItems || [];

  dom.modalBody.innerHTML = `
    <div class="clean-card" style="border-color: #22c55e; background: linear-gradient(135deg, #091a12 0%, #06110b 100%); margin-bottom: 14px;">
      <div class="card-title-row" style="margin-bottom: 6px;">
        <div class="card-title" style="color: #4ade80; font-size: 1.15rem;">
          ✨ Geri Dönüşüm Başarıyla Tamamlandı!
        </div>
        <span class="card-badge" style="color: #4ade80; border-color: #22c55e; font-size: 0.85rem; padding: 4px 10px;">
          ♻️ ${report.scrappedCount} Eşya Parçalandı
        </span>
      </div>
      <div class="clean-desc" style="color: #cbd5e1; font-size: 0.84rem; line-height: 1.5;">
        Askerlerinin üzerindeki kuşanılmış teçhizatlar korunmuştur. Yalnızca cephanelikte boşta duran 
        <strong>Seviye 1</strong> fazlalık eşyalar Demirci ocağında eritilerek hammadde ve teçhizat parçalarına dönüştürüldü.
      </div>
    </div>

    <!-- 🎁 KAZANILAN KAYNAKLAR ÖZET KARTLARI -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
      <div style="background: rgba(168,85,247,0.12); border: 1.5px solid #a855f7; border-radius: 10px; padding: 14px; text-align: center; box-shadow: 0 0 15px rgba(168,85,247,0.15);">
        <div style="font-size: 1.8rem; margin-bottom: 4px;">💎</div>
        <div style="font-size: 0.8rem; color: #d8b4fe; font-weight: 700; text-transform: uppercase;">Kazanılan Teçhizat Parçası</div>
        <div style="font-size: 1.5rem; font-weight: 900; color: #c084fc; margin-top: 2px;">
          +${report.gainedFragments} ADET
        </div>
        <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 4px;">Demirci'de üst seviye eşyalar dövmek için kullanılır</div>
      </div>

      <div style="background: rgba(148,163,184,0.12); border: 1.5px solid #94a3b8; border-radius: 10px; padding: 14px; text-align: center; box-shadow: 0 0 15px rgba(148,163,184,0.12);">
        <div style="font-size: 1.8rem; margin-bottom: 4px;">⛏️</div>
        <div style="font-size: 0.8rem; color: #cbd5e1; font-weight: 700; text-transform: uppercase;">Geri Kazanılan Demir Cevheri</div>
        <div style="font-size: 1.5rem; font-weight: 900; color: #f1f5f9; margin-top: 2px;">
          +${report.gainedIron} ADET
        </div>
        <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 4px;">Ambarındaki demir stoğuna doğrudan eklendi</div>
      </div>
    </div>

    <!-- 📋 PARÇALANAN EŞYALARIN LİSTESİ -->
    <div class="clean-card" style="margin-bottom: 14px;">
      <div style="font-weight: 800; font-size: 0.88rem; color: #fde047; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span>📋 Eritilen Eşyaların Dökümü (${items.length} Kalem)</span>
        <span style="font-size: 0.75rem; color: #94a3b8; font-weight: normal;">(Her eşya: +2 💎 +10 ⛏️)</span>
      </div>
      <div style="max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px;">
        ${items.map(it => `
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(30,41,59,0.5); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.3rem;">${it.icon}</span>
              <div>
                <div style="font-weight: 700; font-size: 0.85rem; color: #fff;">${it.name}</div>
                <div style="font-size: 0.72rem; color: #94a3b8;">Seviye ${it.level} • Boşta Durumundaydı</div>
              </div>
            </div>
            <div style="text-align: right; font-size: 0.78rem; font-weight: 800;">
              <span style="color: #c084fc;">+${it.fragGained} 💎</span> • <span style="color: #cbd5e1;">+${it.ironGained} ⛏️</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- 🔘 İŞLEM BUTONLARI -->
    <div style="display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap;">
      <button class="btn-clean btn-clean-outline" id="btn-scrap-close" style="width: auto; padding: 10px 20px;">
        Kapat
      </button>
      <button class="btn-clean btn-clean-gold" id="btn-goto-forge-from-scrap" style="width: auto; padding: 10px 22px; font-weight: 800;">
        ⚒️ Demirciye Git & Yeni Eşya Döv
      </button>
    </div>
  `;

  displayModal();

  const closeBtn = document.getElementById('btn-scrap-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      openBarracksModal();
    });
  }

  const gotoForgeBtn = document.getElementById('btn-goto-forge-from-scrap');
  if (gotoForgeBtn) {
    gotoForgeBtn.addEventListener('click', () => {
      openTownZoneModal('mine', ZONE_TITLE('iron'));
    });
  }
}

// =========================================================================
// 4.12 SAVAŞ ÖNCESİ TAKTİK & FORMASYON HAZIRLIĞI (PRE-BATTLE FORMATION)
// =========================================================================
let preBattleSelectedSoldiers = [0];

function openPreBattleModal(monster) {
  window.currentPreBattleMonster = monster;
  dom.modalTitle.innerHTML = `<span>⚔️</span> <span>SAVAŞ ÖNCESİ TAKTİK FORMASYON HAZIRLIĞI</span>`;

  const state = gameState.state;
  const soldiers = state.soldierUnits || [];
  const totalSoldiers = soldiers.length;

  // Sadece var olan asker indekslerini seçili tut
  preBattleSelectedSoldiers = preBattleSelectedSoldiers.filter(idx => idx < totalSoldiers);
  if (preBattleSelectedSoldiers.length === 0 && totalSoldiers > 0) {
    preBattleSelectedSoldiers = Array.from({ length: totalSoldiers }, (_, i) => i);
  }

  const prediction = gameState.predictDungeonBattle(monster, preBattleSelectedSoldiers);
  const isBossForReward = !!(monster.isBoss || monster.level === 9 || monster.level === 18);
  const baseReward = gameState.getDungeonBaseReward(monster.level, isBossForReward);
  const selectedCount = preBattleSelectedSoldiers.length;
  const terms = gameState.getDungeonEntryTerms(monster.level, isBossForReward, selectedCount);
  const gateFee = gameState.getDungeonGateFee(monster.level, isBossForReward);
  const expectedAda = Math.min(baseReward.ada, terms.budgetLeft);
  const entryCardHtml = `
    <div class="prebattle-entry-card ${terms.nextNeedsFee ? 'is-out' : ''}">
      <div class="pe-row">
        <span>🎟️ Bugünkü ${terms.nextEntryNumber}. girişin</span>
        <strong>${terms.nextNeedsFee ? 'Harçlı / antrenman' : 'Ödüllü'}</strong>
      </div>
      ${renderDungeonEntryLadder(terms)}
      ${!terms.nextNeedsFee
          ? `<div class="pe-note ${terms.nextWeaponWear ? '' : 'pe-good'}">${terms.nextWeaponWear ? 'Savaşa giren her askerin silahı 1 aşınır.' : 'Günün ilk girişi: silahların aşınmaz.'} Stamina harcanır. Harçsız ödüllü giriş: ${terms.freeLeft} / ${terms.freeTotal} kaldı. Haklar her gece 00:00'da (TSİ) yenilenir.</div>`
          : `<label class="pe-fee">
               <input type="checkbox" id="chk-dungeon-gate-fee" ${window.dungeonPayGateFee ? 'checked' : ''} />
               <span><strong>Kapı harcı öde: ${gateFee.toLocaleString('tr-TR')} ASTRA</strong> — ödülüyle gir. ${(GAME_CONFIG.DUNGEON_GATE_POOL_SHARE ?? 1) >= 1 ? 'Harcın tamamı zindan kasasına gider.' : `Harçtan %${Math.round((GAME_CONFIG.DUNGEON_GATE_POOL_SHARE ?? 1) * 1000) / 10} doğrudan zindan kasasına gider, kalanı her harcama gibi dağıtılır.`}</span>
             </label>
             <div class="pe-note">Harç ödemezsen antrenman girişi olur: askerlerin ve hesabın deneyim kazanır, ASTRA ve ganimet düşmez. Stamina harcanır, silahlar aşınır.</div>`}
      ${expectedAda < baseReward.ada ? `<div class="pe-note pe-warn">Bugünkü zindan kasası bütçesi azaldı: bu zaferin ASTRA ödülü en fazla ${expectedAda.toLocaleString('tr-TR')} olur.</div>` : ''}
    </div>`;

  const staminaCost = terms.staminaCost;
  const staminaCheck = { canEnter: terms.staminaOk, shortfall: terms.staminaShortfall };
  const curStamina = Math.floor(state.stamina || 0);
  const maxStamina = gameState.getMaxStamina();
  const perSoldierCost = gameState.getDungeonStaminaCost(monster.level, 1);

  const staminaInfoCardHtml = `
    <div class="prebattle-stamina-card" style="margin-top:10px; padding:10px 12px; background:${staminaCheck.canEnter ? 'rgba(56,189,248,0.08)' : 'rgba(239,68,68,0.12)'}; border:1px solid ${staminaCheck.canEnter ? 'rgba(56,189,248,0.3)' : 'rgba(239,68,68,0.45)'}; border-radius:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:700; color:${staminaCheck.canEnter ? '#38bdf8' : '#f87171'}; font-size:0.85rem;">⚡ Savaş Stamina Bedeli:</span>
        <span style="font-weight:800; font-size:1rem; color:${staminaCheck.canEnter ? '#38bdf8' : '#ef4444'};">
          ${selectedCount > 0 ? `${staminaCost} ⚡` : '0 ⚡'}
        </span>
      </div>
      <div style="font-size:0.75rem; color:#94a3b8; margin-top:4px; display:flex; justify-content:space-between; align-items:center;">
        <span>${selectedCount > 0 ? `${selectedCount} Asker × ${perSoldierCost} ⚡ (Lv.${monster.level} Katı)` : 'Asker seçilmedi'}</span>
        <span>Mevcut: <strong>${curStamina}/${maxStamina} ⚡</strong></span>
      </div>
      ${!staminaCheck.canEnter && selectedCount > 0 ? `
        <div style="margin-top:8px; padding-top:6px; border-top:1px dashed rgba(239,68,68,0.3); display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.75rem; color:#f87171; font-weight:700;">⚠️ ${staminaCheck.shortfall} ⚡ Stamina eksik!</span>
          <button class="btn-clean btn-clean-gold" id="btn-prebattle-refill-stamina" style="padding:4px 10px; font-size:0.75rem; width:auto;">
            🍞 Buğdayla Doldur
          </button>
        </div>
      ` : ''}
    </div>
  `;

  const monsterAvatarSrc = monster.avatar || getMonsterAvatar(monster.level, monster.name);
  const enemyCardHtml = `
    <div class="prebattle-enemy-card">
      <div style="display:flex; align-items:center; gap:14px; margin-bottom:12px;">
        <div style="width:58px; height:58px; border-radius:50%; overflow:hidden; border:2.5px solid rgba(239,68,68,0.75); flex-shrink:0; box-shadow:0 0 16px rgba(239,68,68,0.45); display:flex; align-items:center; justify-content:center; background:#1a1224;">
          <img src="${monsterAvatarSrc}" alt="${monster.name}" style="width:100%; height:100%; object-fit:cover; display:block;" data-fb="next" />
          <span style="font-size:2rem; display:none;">${monster.icon || '💀'}</span>
        </div>
        <div>
          <div style="font-weight:800; font-size:1.1rem; color:#f87171;">${monster.name}</div>
          <div style="font-size:0.8rem; color:#94a3b8;">${monster.level}. Kat Zindan Muhafızı</div>
        </div>
      </div>
      <div class="dashboard-stat-row">
        <span>Can Puanı (HP)</span>
        <span class="dashboard-stat-value" style="color:#ef4444;">${monster.hp} HP</span>
      </div>
      <div class="dashboard-stat-row">
        <span>Saldırı Gücü (ATK)</span>
        <span class="dashboard-stat-value" style="color:#f59e0b;">${monster.atk} ATK</span>
      </div>
      <div class="dashboard-stat-row">
        <span>Ganimet Ödülü</span>
        <span class="dashboard-stat-value" style="color:#fde047;">+${expectedAda.toLocaleString('tr-TR')} ASTRA • +${baseReward.xp.toLocaleString('tr-TR')} XP • askerlere +${monster.rewardXp} XP</span>
      </div>

      <div class="prebattle-prediction ${prediction.difficulty.toLowerCase()}">
        <div>KAZANMA ŞANSI: %${prediction.winChance} (${prediction.difficulty.toUpperCase()})</div>
        <div style="font-size:0.75rem; font-weight:normal; margin-top:3px; opacity:0.85;">
          ${prediction.winChance >= 75 ? '🔥 Ordun ezici üstünlüğe sahip!' : (prediction.winChance >= 50 ? '⚖️ Dengeli bir savaş, yaralanmalar olabilir.' : '⚠️ Yüksek risk! Ordun yenilgiye uğrayabilir.')}
        </div>
      </div>

      ${staminaInfoCardHtml}
    </div>
  `;

  const isArmyStaked = gameState.isArmyStakedInWorldBoss();

  const activeWeaponsList = [];
  preBattleSelectedSoldiers.forEach(idx => {
    const sol = soldiers[idx];
    const w = sol?.equipment?.weapon || state.equipment?.weapon;
    if (w) {
      const maxD = w.maxDurability || 13;
      const curD = w.durability != null ? w.durability : maxD;
      activeWeaponsList.push(`${sol?.name || '#' + (idx + 1)}: ${w.icon} ${w.name} (${curD}/${maxD})`);
    }
  });
  const activeWeaponsPreviewHtml = activeWeaponsList.length > 0 ? `
    <div style="font-size:0.75rem; color:#fde047; padding:6px 10px; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-radius:8px; margin-bottom:8px;">
      🗡️ Kuşanılmış Silahlar: <strong>${activeWeaponsList.join(' • ')}</strong>
    </div>
  ` : `
    <div style="font-size:0.72rem; color:#94a3b8; padding:6px 10px; background:rgba(255,255,255,0.03); border-radius:8px; margin-bottom:8px;">
      ℹ️ Kuşanılmış silah yok (Temel ordu gücüyle savaşılacak).
    </div>
  `;

  const armySelectHtml = totalSoldiers === 0 ? `
    <div class="prebattle-army-panel" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:24px 16px;">
      <div style="font-size:2.2rem; margin-bottom:6px;">⚠️</div>
      <div style="font-weight:800; font-size:1rem; color:#f87171;">Ordunuzda Asker Bulunmuyor!</div>
      <div style="font-size:0.8rem; color:#cbd5e1; margin-top:6px; max-width:260px; line-height:1.4;">
        Zindan canavarlarıyla savaşmak için Kışla binasından yeni askerler eğitmelisiniz.
      </div>
      <button class="btn-clean btn-clean-gold" id="btn-goto-barracks-prebattle" style="margin-top:14px; width:auto; padding:8px 18px;">
        ⚔️ Kışlaya Git & Asker Eğit
      </button>
    </div>
  ` : isArmyStaked ? `
    <div class="prebattle-army-panel" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:24px 16px; border:1px solid #ef4444; background:#1c0a0a;">
      <div style="font-size:2.2rem; margin-bottom:6px;">🔒</div>
      <div style="font-weight:800; font-size:1rem; color:#f87171;">Ordun World Boss Savaşına Kilitlendi!</div>
      <div style="font-size:0.8rem; color:#cbd5e1; margin-top:6px; max-width:280px; line-height:1.4;">
        Askerlerin Pazar 18:00 TSİ World Boss savaşı için kilit altındadır ve başka hiçbir alanda kullanılamaz. Savaş Alanından (%18 ceza ile) erken çekebilir veya Pazar 18:00 sonrası ödülünle birlikte ordunu toplayabilirsin.
      </div>
      <button class="btn-clean btn-clean-gold" id="btn-goto-battlefield-prebattle" style="margin-top:14px; width:auto; padding:8px 18px;">
        🌋 Savaş Alanı & World Boss'a Git
      </button>
    </div>
  ` : (() => {
    const combatPresets = gameState.getCombatPresets();
    const activePresetId = combatPresets?.activePresetId || 1;
    const curPresetObj = combatPresets?.presets?.[activePresetId] || { name: `Taktik ${activePresetId}` };

    const presetSelectorHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(15,23,42,0.6); padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); margin-bottom:8px; flex-wrap:wrap; gap:6px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:0.75rem; font-weight:800; color:#cbd5e1;">🎯 Taktik:</span>
          <div style="display:flex; gap:4px;">
            ${[1, 2, 3].map(pid => {
              const p = combatPresets.presets?.[pid] || { name: `Taktik ${pid}` };
              const isActive = pid === activePresetId;
              return `
                <button type="button" class="btn-clean btn-prebattle-preset ${isActive ? 'btn-clean-gold' : 'btn-clean-outline'}" data-preset="${pid}" style="padding:3px 8px; font-size:0.72rem; font-weight:800; width:auto; border-radius:6px;" title="${p.name}">
                  ${pid === 1 ? '🛡️' : pid === 2 ? '⚔️' : '🏹'} P${pid}
                </button>
              `;
            }).join('')}
          </div>
        </div>
        <button type="button" id="btn-save-prebattle-preset" class="btn-clean btn-clean-sm" style="padding:3px 8px; font-size:0.7rem; width:auto; background:rgba(34,197,94,0.18); border:1px solid #22c55e; color:#4ade80; font-weight:700;" title="Mevcut ön/arka saf dizilimini P${activePresetId}'e kaydet">
          💾 P${activePresetId}'e Kaydet
        </button>
      </div>
    `;

    return `
      <div class="prebattle-army-panel">
        <div style="font-weight:800; font-size:0.9rem; color:#34d399; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
          <span>🛡️ Savaşa Girecek Askerler (${preBattleSelectedSoldiers.length}/${totalSoldiers})</span>
          <span style="font-size:0.75rem; color:#fde047; font-weight:700;">${curPresetObj.name}</span>
        </div>

        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
          <button type="button" id="btn-pb-auto" class="btn-clean" style="width:auto; padding:5px 10px; font-size:0.76rem; font-weight:800; background:#15803d; border-color:#4ade80; color:#fff;" title="En güçlülerden başlayarak kazanma şansı en az %80 olana kadar seçer (daha az asker = daha az stamina)">⚡ Kazanacak kadar seç</button>
          <button type="button" id="btn-pb-all" class="btn-clean" style="width:auto; padding:5px 10px; font-size:0.76rem; font-weight:700; background:transparent; border:1px solid #475569; color:#cbd5e1;">Tümünü seç</button>
        </div>
        ${presetSelectorHtml}
        ${activeWeaponsPreviewHtml}

        <div style="max-height:260px; overflow-y:auto; padding-right:4px;">
          ${soldiers.map((sol, idx) => {
            const stats = gameState.getSoldierFullStats(idx);
            const isChecked = preBattleSelectedSoldiers.includes(idx);
            const isBackRow = sol.row === 'back';
            const skillIcons = (sol.skills || ['shieldWall']).map(skId => (PLAYER_SKILLS[skId]?.icon || '⚡')).join(' ');
            return `
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; background:rgba(30,41,59,0.5); padding:6px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
                <label style="display:flex; align-items:center; gap:10px; flex:1; cursor:pointer; margin:0;">
                  <input type="checkbox" class="prebattle-sol-check" data-idx="${idx}" ${isChecked ? 'checked' : ''}>
                  <div style="width:34px; height:34px; border-radius:50%; overflow:hidden; border:1.5px solid rgba(232,185,78,0.75); flex-shrink:0; display:flex; align-items:center; justify-content:center; background:#1a1224; box-shadow:0 0 10px rgba(232,185,78,0.3);">
                    <img src="${sol.avatar || 'assets/soldier_avatar.jpg'}" alt="${sol.name}" style="width:100%; height:100%; object-fit:cover; display:block;" data-fb="next" />
                    <span style="font-size:0.95rem; display:none;">${sol.icon || '⚔️'}</span>
                  </div>
                  <div style="flex:1;">
                    <div style="font-weight:700; font-size:0.82rem; color:#fff;">#${idx+1} ${sol.name}</div>
                    <div style="font-size:0.7rem; color:#94a3b8;">${sol.hp || 100} HP • <span style="color:#fde047;">${stats?.totalAtk || 20} ATK</span> • <span title="Yetenekler">${skillIcons}</span></div>
                  </div>
                </label>
                <button type="button" class="btn-clean btn-toggle-prebattle-row" data-idx="${idx}" style="padding:4px 8px; font-size:0.72rem; width:auto; font-weight:700; background:${isBackRow ? 'rgba(56,189,248,0.2)' : 'rgba(245,158,11,0.2)'}; border:1px solid ${isBackRow ? '#38bdf8' : '#f59e0b'}; color:${isBackRow ? '#38bdf8' : '#fde047'}; cursor:pointer;" title="Mevziyi Değiştir (Ön Saf / Arka Saf)">
                  ${isBackRow ? '🏹 Arka Saf' : '🛡️ Ön Saf'}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  })()

  const isStaminaInsufficient = !staminaCheck.canEnter && selectedCount > 0;
  const isStartDisabled = totalSoldiers === 0 || isArmyStaked || selectedCount === 0 || isStaminaInsufficient;
  let startBtnText = '⚔️ SAVAŞA BAŞLA';
  if (isArmyStaked) startBtnText = '🔒 ORDU KİLİTLİ';
  else if (totalSoldiers === 0) startBtnText = '⚔️ ASKER YOK';
  else if (selectedCount === 0) startBtnText = '⚔️ ASKER SEÇİN';
  else if (isStaminaInsufficient) startBtnText = `⚡ YETERSİZ STAMİNA (${curStamina}/${staminaCost} ⚡)`;

  dom.modalBody.innerHTML = `
    ${entryCardHtml}
    <div class="prebattle-grid">
      ${enemyCardHtml}
      ${armySelectHtml}
    </div>
    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px; flex-wrap: wrap;">
      ${(state.inventory.scroll_heal || 0) > 0 ? `
        <button class="btn-clean btn-clean-purple btn-use-scroll" data-scroll="scroll_heal" style="width:auto; padding:10px 18px; font-weight:800;" title="Ordu İyileştirme Parşömeni Kullanarak Bir Askeri İyileştir (+10 HP)">
          📜 Parşömenle İyileştir (${state.inventory.scroll_heal} Adet)
        </button>
      ` : ''}
      <button class="btn-clean btn-clean-outline" id="btn-cancel-prebattle" style="width:auto; padding:10px 20px;">
        🏳️ Vazgeç
      </button>
      <button class="btn-clean btn-clean-green" id="btn-start-tactical-battle" style="width:auto; padding:10px 28px; font-weight:800; font-size:0.95rem;" ${isStartDisabled ? 'disabled' : ''}>
        ${startBtnText}
      </button>
    </div>
  `;

  const battlefieldPreBtn = document.getElementById('btn-goto-battlefield-prebattle');
  if (battlefieldPreBtn) {
    battlefieldPreBtn.addEventListener('click', openBattlefieldModal);
  }

  const barracksBtn = document.getElementById('btn-goto-barracks-prebattle');
  if (barracksBtn) {
    barracksBtn.addEventListener('click', () => {
      openTownZoneModal('barracks', '⚔️ KRALLIK KIŞLASI & ASKERİ KARARGAH');
    });
  }

  const prebattleRefillBtn = document.getElementById('btn-prebattle-refill-stamina');
  if (prebattleRefillBtn) {
    prebattleRefillBtn.addEventListener('click', () => {
      const refillNeeded = staminaCheck.shortfall || 20;
      const res = gameState.refillStaminaExact(refillNeeded);
      if (res.success) {
        showToast(res.message, 'success');
        renderTopBar();
        openPreBattleModal(monster);
      } else {
        showToast(res.message, 'error');
      }
    });
  }

  // ⚡ Kazanacak kadar seç: en güçlülerden başlayarak kazanma şansı %80'e ulaşana kadar (ulaşamazsa hepsi)
  document.getElementById('btn-pb-auto')?.addEventListener('click', () => {
    const order = soldiers.map((_, i) => { const st = gameState.getSoldierFullStats(i) || { totalAtk: 0, totalMaxHp: 0 }; return { i, w: st.totalAtk * 3 + st.totalMaxHp }; })
      .sort((a, b) => b.w - a.w).map(x => x.i);
    let pick = [];
    for (const i of order) {
      pick.push(i);
      if ((gameState.predictDungeonBattle(monster, pick).winChance || 0) >= 80) break;
    }
    preBattleSelectedSoldiers = pick;
    const chance = gameState.predictDungeonBattle(monster, pick).winChance || 0;
    showToast(chance >= 80 ? `⚡ ${pick.length} asker yeterli: kazanma şansı %${chance}` : `Bütün ordunla bile kazanma şansı %${chance}. Askerlerini güçlendirmen gerekebilir.`, chance >= 80 ? 'success' : 'info');
    openPreBattleModal(monster);
  });
  document.getElementById('btn-pb-all')?.addEventListener('click', () => {
    preBattleSelectedSoldiers = soldiers.map((_, i) => i);
    openPreBattleModal(monster);
  });

  document.querySelectorAll('.prebattle-sol-check').forEach(chk => {
    chk.addEventListener('change', () => {
      const idx = parseInt(chk.dataset.idx, 10);
      if (chk.checked) {
        if (!preBattleSelectedSoldiers.includes(idx)) preBattleSelectedSoldiers.push(idx);
      } else {
        preBattleSelectedSoldiers = preBattleSelectedSoldiers.filter(i => i !== idx);
      }
      openPreBattleModal(monster);
    });
  });

  // 🎯 Preset Seçimi (P1, P2, P3)
  document.querySelectorAll('.btn-prebattle-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const pid = parseInt(btn.dataset.preset, 10);
      const res = gameState.applyCombatPreset(pid);
      if (res.success) {
        showToast(res.message, 'info');
        openPreBattleModal(monster);
      }
    });
  });

  // 💾 Mevcut Dizilimi Presete Kaydetme
  const preSaveBtn = document.getElementById('btn-save-prebattle-preset');
  if (preSaveBtn) {
    preSaveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const activeId = gameState.state.combatPresets?.activePresetId || 1;
      const res = gameState.saveCombatPreset(activeId);
      if (res.success) {
        showToast(res.message, 'success');
        openPreBattleModal(monster);
      }
    });
  }

  // 🛡️ Tekil Asker Safı Değiştirme (Ön Saf / Arka Saf)
  document.querySelectorAll('.btn-toggle-prebattle-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const idx = parseInt(btn.dataset.idx, 10);
      const sol = (gameState.state.soldierUnits || [])[idx];
      if (sol) {
        const nextRow = sol.row === 'back' ? 'front' : 'back';
        gameState.setSoldierRow(idx, nextRow);
        openPreBattleModal(monster);
      }
    });
  });

  const cancelBtn = document.getElementById('btn-cancel-prebattle');
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  const startBtn = document.getElementById('btn-start-tactical-battle');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (gameState.isArmyStakedInWorldBoss()) {
        showToast('🔒 Ordun World Boss savaşına kilitlidir! Zindanda savaşamazsın.', 'error');
        return;
      }
      if (preBattleSelectedSoldiers.length === 0) {
        showToast('En az 1 asker seçmelisin!', 'error');
        return;
      }
      const isBossChk = !!(monster.isBoss || monster.level === 9 || monster.level === 18);
      const check = gameState.getDungeonEntryTerms(monster.level, isBossChk, preBattleSelectedSoldiers.length);
      if (!check.staminaOk) {
        showToast(`⚠️ Yetersiz Stamina! ${preBattleSelectedSoldiers.length} asker için ${check.staminaCost} ⚡ Stamina gerekiyor (Mevcut: ${Math.floor(gameState.state.stamina || 0)} ⚡).`, 'error');
        openPreBattleModal(monster);
        return;
      }
      const gateChk = document.getElementById('chk-dungeon-gate-fee');
      const payGateFee = !!(gateChk && gateChk.checked);
      if (payGateFee) {
        const isBossFee = !!(monster.isBoss || monster.level === 9 || monster.level === 18);
        const fee = gameState.getDungeonGateFee(monster.level, isBossFee);
        if ((gameState.state.adAstraBalance || 0) < fee) {
          showToast(`Kapı harcı için ${fee.toLocaleString('tr-TR')} ASTRA gerekiyor.`, 'error');
          return;
        }
      }
      executeMonsterBattle(monster, preBattleSelectedSoldiers, { payGateFee });
    });
  }

  const gateChkEl = document.getElementById('chk-dungeon-gate-fee');
  if (gateChkEl) gateChkEl.addEventListener('change', () => { window.dungeonPayGateFee = gateChkEl.checked; });

  displayModal();
}

async function executeMonsterBattle(monster, selectedIndices, { payGateFee = false } = {}) {
  const state = gameState.state;
  const soldiers = state.soldierUnits || [];

  const arena = getBattleArena();
  if (!arena) {
    showToast('Savaş arenası başlatılamadı!', 'error');
    return;
  }

  // ⚔️ Giriş + savaş + sonuç tek adımda (gameState.fightDungeon); arena yalnızca dönen kaydı canlandırır.
  // Savaş öncesi askerlerin canı canlandırma için saklanır (sonuç işlendikten sonra değişir).
  const hpBefore = selectedIndices.map(idx => (soldiers[idx] ? soldiers[idx].hp : null));
  const monsterHpBefore = gameState.getMonsterCurrentHp(monster.level, monster.hp);
  const fight = await gameState.fightDungeon(monster.level, selectedIndices, { payGateFee });
  if (!fight.success) {
    showToast(fight.message, 'error');
    openPreBattleModal(monster);
    return;
  }
  const { entry, sim, outcome } = fight;
  const staminaCost = entry.staminaCost;
  renderTopBar();

  // 1. Müttefik Asker Birimleri Oluşturma (Tek Tip Asker + Skill Loadout + Mevzi)
  const arenaAllies = selectedIndices
    .filter(idx => soldiers[idx])
    .map((idx, i) => {
      const stats = gameState.getSoldierFullStats(idx) || { totalAtk: 25, totalMaxHp: 100 };
      const sol = soldiers[idx];
      const hp0 = hpBefore[selectedIndices.indexOf(idx)];
      return {
        uid: 'a' + i,
        name: sol.name,
        icon: sol.icon || '⚔️',
        avatar: sol.avatar || 'assets/soldier_avatar.jpg',
        sourceIndex: idx,
        hp: hp0 != null ? hp0 : stats.totalMaxHp,
        maxHp: stats.totalMaxHp,
        atk: stats.totalAtk,
        row: sol.row || 'front',
        skills: Array.isArray(sol.skills) && sol.skills.length ? sol.skills : ['shieldWall', 'armorBreaker']
      };
    });

  if (arenaAllies.length === 0) {
    showToast('Savaşa katılacak geçerli bir asker bulunamadı!', 'error');
    return;
  }

  // Sonuç animasyondan ÖNCE işlendi ve kaydedildi; arena yalnızca oynatır (sayfa yenileme hilesi kapalı)
  let eCurHp = monsterHpBefore;
  const isBossMonster = !!(monster.isBoss || monster.level === 9 || monster.level === 18);

  // 2. Canavar Birimi ve Boss Fazları
  const arenaEnemy = {
    uid: 'e0',
    name: monster.name,
    icon: monster.icon || '💀',
    avatar: monster.avatar || getMonsterAvatar(monster.level, monster.name),
    level: monster.level,
    hp: eCurHp,
    maxHp: monster.hp,
    atk: monster.atk,
    boss: isBossMonster,
    row: 'front',
    skills: monster.abilities || (isBossMonster ? ['cleave', 'roar'] : ['cleave']),
    phases: DEFAULT_BOSS_PHASES[monster.level] ? DEFAULT_BOSS_PHASES[monster.level].map(p => ({
      at: p.atPct || 0.5,
      text: p.name || 'ÖFKE PATLAMASI',
      sub: p.text || 'Düşman gücünü topluyor!'
    })) : []
  };

  const previewBase = gameState.getDungeonBaseReward(monster.level, isBossMonster);
  const previewAda = Math.min(previewBase.ada, gameState.getDungeonDayStatus().budgetLeft);
  const lootPreview = entry.rewarded ? [
    `🟣 +${previewAda.toLocaleString('tr-TR')} ASTRA`,
    `✨ +${monster.rewardXp || (monster.level * 15)} Asker XP`,
    `🧩 Teçhizat Parçası (${gameState.getFragmentDropRate(state.level)}% Şans)`,
    `📦 Pandora Kutusu (${gameState.getBoxDropRate(state.level)}% Şans)`
  ] : [
    `🏋️ Antrenman girişi: ASTRA ve ganimet yok`,
    `✨ +${monster.rewardXp || (monster.level * 15)} Asker XP · +${previewBase.xp.toLocaleString('tr-TR')} hesap XP`
  ];

  closeModal(); // Eski modalı kapat
  openBattleArenaModal(); // Canlı Savaş Arenasını Aç

  arena.startBattle({
    mode: 'dungeon',
    context: `Kat ${monster.level} · Seviye ${monster.level} — <strong>${monster.name}</strong> ${isBossMonster ? '(Zindan Bossu)' : ''}`,
    rank: `${entry.rewarded ? (entry.fee > 0 ? 'Kapı harcıyla ödüllü' : 'Ödüllü giriş') : 'Antrenman'} · Stamina: -${staminaCost} ⚡`,
    replay: sim,
    allies: arenaAllies,
    enemies: [arenaEnemy],
    loot: lootPreview,
    onComplete: () => {
      // Durum savaş başında işlendi (settleDungeonBattle); burada yalnızca bildirimler gösterilir
      const weaponsWorn = outcome.weaponsWorn;
      if (outcome.victory) {
        sound.playLevelUp();
        const adaReward = outcome.adaReward;
        const lvlMsg = outcome.levelUps.length > 0 ? ` • 🎉 ${outcome.levelUps.join(', ')}` : '';
        const wearMsg = weaponsWorn.length > 0 ? ` • ⚔️ Silah Aşınması: ${weaponsWorn.join(', ')}` : '';
        const scrollNotice = outcome.scrollGained ? ` • 📜 ${outcome.scrollGained.name} DÜŞTÜ!` : '';
        addNotification('🏆', `${monster.name} yenildi! +${adaReward} ASTRA kazandın (⚡ -${staminaCost} Stamina).${scrollNotice} Savaşa katılan askerlerin +${monster.rewardXp} Asker XP kazandı.${lvlMsg}${wearMsg}`);

        if (weaponsWorn.length > 0) {
          showToast(`⚔️ Silahların dayanıklılığı -1 azaldı: ${weaponsWorn.join(', ')}`, 'info');
        }
        showToast(entry.rewarded
          ? `🏆 Zafer! ${monster.name} mağlup edildi! (+${adaReward.toLocaleString('tr-TR')} ASTRA)`
          : `🏋️ Antrenman zaferi: ${monster.name} yenildi (yalnızca deneyim)`, 'success');
      } else {
        sound.playBreakWarning();
        showToast(`💀 Bozgun! Ordun ${monster.name} karşısında geri çekildi. Kalan Can: ${outcome.remainingEnemyHp}/${monster.hp}`, 'error');
      }
      renderTopBar();
    }
  });
}

// =========================================================================
// 4.13 COMMAND PALETTE (Ctrl+K)
// =========================================================================
let cmdPaletteActiveIdx = 0;
let filteredCmdActions = [];

function openCommandPalette() {
  closeCommandPalette();

  const overlay = document.createElement('div');
  overlay.id = 'cmd-palette-overlay';
  overlay.className = 'cmd-palette-overlay';

  overlay.innerHTML = `
    <div class="cmd-palette-box">
      <input type="text" id="cmd-palette-input" class="cmd-palette-input" placeholder="🔍 Krallık eylemi veya bina ara... (ESC ile kapat)" autofocus>
      <div id="cmd-palette-results" class="cmd-palette-results"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = overlay.querySelector('#cmd-palette-input');
  input.focus();

  renderCommandPalette('');

  input.addEventListener('input', (e) => {
    cmdPaletteActiveIdx = 0;
    renderCommandPalette(e.target.value);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cmdPaletteActiveIdx = Math.min(filteredCmdActions.length - 1, cmdPaletteActiveIdx + 1);
      renderCommandPalette(input.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cmdPaletteActiveIdx = Math.max(0, cmdPaletteActiveIdx - 1);
      renderCommandPalette(input.value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCmdActions[cmdPaletteActiveIdx]) {
        executeCommand(filteredCmdActions[cmdPaletteActiveIdx].id);
      }
    } else if (e.key === 'Escape') {
      closeCommandPalette();
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeCommandPalette();
  });
}

function closeCommandPalette() {
  const overlay = document.getElementById('cmd-palette-overlay');
  if (overlay) overlay.remove();
}

function renderCommandPalette(query) {
  const resultsContainer = document.getElementById('cmd-palette-results');
  if (!resultsContainer) return;

  const actions = gameState.getCommandPaletteActions();
  const q = (query || '').toLowerCase().trim();

  filteredCmdActions = actions.filter(a =>
    a.label.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
  );

  resultsContainer.innerHTML = filteredCmdActions.map((a, i) => `
    <div class="cmd-palette-item ${i === cmdPaletteActiveIdx ? 'active' : ''}" data-cmd-id="${a.id}">
      <span class="cmd-palette-item-icon">${a.icon}</span>
      <span class="cmd-palette-item-label">${a.label}</span>
      <span class="cmd-palette-item-category">${a.category}</span>
      ${a.shortcut ? `<span class="cmd-palette-item-shortcut">${a.shortcut}</span>` : ''}
    </div>
  `).join('') || '<div style="padding:16px; text-align:center; color:#94a3b8; font-size:0.85rem;">Eşleşen eylem bulunamadı.</div>';

  resultsContainer.querySelectorAll('.cmd-palette-item').forEach(item => {
    item.addEventListener('click', () => {
      executeCommand(item.dataset.cmdId);
    });
  });
}

function executeCommand(actionId) {
  closeCommandPalette();
  switch (actionId) {
    case 'dashboard': openDashboardModal(); break;
    case 'treasury': openTreasuryVaultModal(); break;
    case 'forest': openTownZoneModal('forest', '🌲 Zümrüt Ormanı & Oduncu'); break;
    case 'mine': openTownZoneModal('mine', '⛏️ Maden Ocağı & Tamirhane'); break;
    case 'farm': openTownZoneModal('farm', '🌾 Güneş Tarlası & Değirmen'); break;
    case 'quarry': case 'coalmine': case 'herbgarden': openTownZoneModal(actionId, ZONE_TITLE(NODE_OF_ZONE_UI(actionId))); break;
    case 'village': case 'healer': case 'spaceport': openTownZoneModal(actionId, ZONE_LABELS[actionId]); break;
    case 'council': openTreasuryVaultModal(); break;
    case 'barracks': openBarracksModal(); break;
    case 'market': openTownZoneModal('market', '🏪 AMM Pazar Yeri'); break;
    case 'dungeon': enterDungeonScene(); break;
    case 'colosseum': openColosseumModal(); break;
    case 'inventory': openInventoryModal(); break;
    case 'economy': openEconomyDashboardModal('overview'); break;
    case 'quota': openDailyLimitsModal(); break;
    case 'claimAll':
      const cRes = gameState.claimAndRestartAllExpeditions();
      if (cRes.staminaWarning) {
        showToast(cRes.staminaWarning, 'warning');
      } else if (cRes.messages && cRes.messages.length > 0) {
        showToast(cRes.messages[0], 'warning');
      }
      if (cRes.claimed > 0 || cRes.restarted > 0) {
        showToast(`⚡ ${cRes.claimed} Sefer Toplandı, ${cRes.restarted} Yeni Sefer Başlatıldı!`, 'success');
      }
      renderTopBar();
      break;
    case 'repairAll':
      const rRes = gameState.repairAllTools();
      if (rRes.repaired > 0) {
        showToast(`🔨 ${rRes.repaired} alet tamir edildi!`, 'success');
      } else if (rRes.hasDamagedTools && rRes.missingAda) {
        showToast('⚠️ Hesapta yeteri kadar ASTRA yok!', 'error');
      } else {
        showToast(rRes.message || 'Tamir edilecek alet yok.', 'info');
      }
      renderTopBar();
      break;
    case 'healAll':
      const hRes = gameState.instantHealAllSoldiers();
      showToast(hRes.healed > 0 ? `❤️ ${hRes.healed} asker iyileştirildi!` : 'İyileştirilecek asker yok.', 'success');
      renderTopBar();
      break;
    case 'autoEquip':
      const eqRes = gameState.autoEquipBest();
      showToast(eqRes.message, eqRes.success ? 'success' : 'info');
      break;
  }
}

// Event Dinleyicileri
function initAppEvents() {
  // Global Klavye Kısayolları (TAB, Ctrl+K, S, I, F, B, M, D, C, E, K, Esc)
  window.addEventListener('keydown', (e) => {
    // Ctrl+K veya Cmd+K -> Command Palette
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
      return;
    }

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'Tab') {
      e.preventDefault();
      openDashboardModal();
      return;
    }

    const key = e.key.toUpperCase();
    if (key === 'ESCAPE') {
      closeCommandPalette();
      closeModal();
      closeDevModal();
      return;
    }
    if (key === '1' || key === 'S') {
      openTownZoneModal('forest', '🌲 Zümrüt Ormanı & Oduncu');
    } else if (key === '2' || key === 'I') {
      openTownZoneModal('mine', '⛏️ Maden Ocağı & Tamirhane');
    } else if (key === '3' || key === 'F') {
      openTownZoneModal('farm', '🌾 Güneş Tarlası & Değirmen');
    } else if (key === '4' || key === 'B') {
      openBarracksModal();
    } else if (key === '5' || key === 'M') {
      openTownZoneModal('market', '🏪 AMM Pazar Yeri');
    } else if (key === '6' || key === 'D') {
      enterDungeonScene();
    } else if (key === '7' || key === 'C') {
      openColosseumModal();
    } else if (key === 'E') {
      openInventoryModal();
    } else if (key === 'K') {
      openDailyLimitsModal();
    }
  });

  dom.btnCloseModal.addEventListener('click', closeModal);
  dom.rpgModal.addEventListener('click', (e) => {
    if (e.target === dom.rpgModal) closeModal();
  });

  // Add comprehensive event isolation to modal overlay and all modal containers
  const stopEvents = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend'];
  stopEvents.forEach(evt => {
    dom.rpgModal.addEventListener(evt, (e) => {
      if (e.target === dom.rpgModal || e.target.closest('.rpg-modal-window')) {
        e.stopPropagation();
      }
    }, { capture: false });
  });

  // Also prevent propagation on the modal header and body
  const modalHeader = document.querySelector('.rpg-modal-header');
  const modalBody = document.querySelector('.rpg-modal-body');
  const modalWindow = document.querySelector('.rpg-modal-window');

  if (modalHeader) {
    stopEvents.forEach(evt => {
      modalHeader.addEventListener(evt, (e) => e.stopPropagation(), { capture: false });
    });
  }
  if (modalBody) {
    stopEvents.forEach(evt => {
      modalBody.addEventListener(evt, (e) => e.stopPropagation(), { capture: false });
    });
  }
  if (modalWindow) {
    stopEvents.forEach(evt => {
      modalWindow.addEventListener(evt, (e) => e.stopPropagation(), { capture: false });
    });
  }

  // Profil Rozetine Tıklama -> Karakter Gelişimi & Envanter
  if (dom.profileBadgeBtn) dom.profileBadgeBtn.addEventListener('click', openInventoryModal);

  // Günlük Limitler Paneli Butonu
  if (dom.btnDailyLimits) dom.btnDailyLimits.addEventListener('click', openDailyLimitsModal);
  const sidebarQuotaBtn = document.getElementById('sidebar-quota-open');
  if (sidebarQuotaBtn) sidebarQuotaBtn.addEventListener('click', openDailyLimitsModal);

  // Test & Dev Cheat Paneli Butonu
  const btnTestMenu = document.getElementById('btn-open-test-menu');
  if (btnTestMenu) btnTestMenu.addEventListener('click', openDevModal);   // tek test menüsü (#dev-modal)

  // 10B Makro Tokenomics & Canlı Simülatör Butonu
  const btnEconomy = document.getElementById('btn-economy-dashboard');
  if (btnEconomy) btnEconomy.addEventListener('click', () => openEconomyDashboardModal('overview'));

  // ÜST ŞERİT MENÜ BUTONLARI (TOP NAV STRIP BUTTONS)
  const btnTopSweep = document.getElementById('btn-top-sweep-harvest');
  if (btnTopSweep) {
    btnTopSweep.addEventListener('click', () => {
      const res = gameState.claimAllHarvests();
      if (res.success) {
        showToast(res.message, 'success');
        sound.playHarvest();
        renderTopBar();
      } else {
        showToast(res.message, 'info');
      }
    });
  }

  // 🧙‍♂️ Akıllı Kral Danışmanı Aksiyon Butonu
  const btnAdvisorAct = document.getElementById('btn-advisor-action');
  if (btnAdvisorAct) {
    btnAdvisorAct.addEventListener('click', () => {
      const act = btnAdvisorAct.dataset.action;
      if (act === 'sweep_harvest') {
        const res = gameState.claimAllHarvests();
        showToast(res.message, res.success ? 'success' : 'info');
        if (res.success) sound.playHarvest();
        renderTopBar();
      } else if (act === 'open_barracks') {
        openBarracksModal();
      } else if (act === 'open_blacksmith') {
        mineActiveTab = 'blacksmith';
        openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      } else if (act === 'open_dashboard') {
        openDashboardModal();
      } else if (act === 'open_dungeon') {
        enterDungeonScene();
      } else {
        openDashboardModal();
      }
    });
  }

  const btnNavDash = document.getElementById('btn-nav-dashboard');
  if (btnNavDash) btnNavDash.addEventListener('click', openDashboardModal);

  const btnTopBotStatus = document.getElementById('btn-top-taverna-bot-status');
  if (btnTopBotStatus) {
    btnTopBotStatus.addEventListener('click', () => openTownZoneModal('tavern', '🍺 Taverna & Otonom Bot'));
  }

  const btnNavTreasury = document.getElementById('btn-nav-treasury');
  if (btnNavTreasury) btnNavTreasury.addEventListener('click', openTreasuryVaultModal);

  const btnNotifBell = document.getElementById('btn-notif-bell');
  if (btnNotifBell) btnNotifBell.addEventListener('click', toggleNotificationPanel);

  const topBtnInv = document.getElementById('top-btn-inventory');
  if (topBtnInv) topBtnInv.addEventListener('click', openInventoryModal);

  const topBtnBarracks = document.getElementById('top-btn-barracks');
  if (topBtnBarracks) topBtnBarracks.addEventListener('click', openBarracksModal);

  const topBtnMarket = document.getElementById('top-btn-market');
  if (topBtnMarket) topBtnMarket.addEventListener('click', () => openTownZoneModal('market', '🏪 AMM Pazar Alanı'));

  const topBtnTavern = document.getElementById('top-btn-tavern');
  if (topBtnTavern) topBtnTavern.addEventListener('click', () => openTownZoneModal('tavern', '🍺 Taverna & Han'));

  const topBtnColosseum = document.getElementById('top-btn-colosseum');
  if (topBtnColosseum) topBtnColosseum.addEventListener('click', openColosseumModal);

  const topBtnDungeon = document.getElementById('top-btn-dungeon');
  if (topBtnDungeon) {
    topBtnDungeon.addEventListener('click', () => {
      enterDungeonScene();
    });
  }

  // SAĞ ÜST KÖŞE HAMMADDE KUTUCUKLARI (RESOURCE PILLS TIKLAMA OLAYLARI)
  for (const k of RES_KEYS()) {
    const pill = document.getElementById(`res-pill-${k}`);
    if (pill) pill.addEventListener('click', () => openTownZoneModal(ZONE_OF_NODE(k), ZONE_TITLE(k)));
  }

  const pillFragments = document.getElementById('res-pill-fragments');
  if (pillFragments) pillFragments.addEventListener('click', () => openTownZoneModal('market', '🏪 AMM Pazar Alanı'));

  // Üst Bar: Güncelleme Günlüğü (Changelog v1.06) ve Krallık Karnavalı Butonları
  const pillChangelog = document.getElementById('btn-changelog-pill');
  if (pillChangelog) pillChangelog.addEventListener('click', openChangelogModal);

  const pillCarnival = document.getElementById('btn-carnival-pill');
  if (pillCarnival) pillCarnival.addEventListener('click', () => openCarnivalModal('wheel'));

  // Alt 3D Dock Butonları
  if (dom.btnDockWorkers) dom.btnDockWorkers.addEventListener('click', openInventoryModal);
  if (dom.btnDockInventory) dom.btnDockInventory.addEventListener('click', openInventoryModal);
  if (dom.btnDockBarracks) dom.btnDockBarracks.addEventListener('click', openBarracksModal);
  if (dom.btnDockMarket) dom.btnDockMarket.addEventListener('click', () => openTownZoneModal('market', '🏪 AMM Pazar Alanı'));

  // 📱 Telefon alt gezinme çubuğu
  const tabbar = document.getElementById('mobile-tabbar');
  if (tabbar) {
    tabbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      const sidebarEl = document.getElementById('realm-sidebar');
      const setSidebar = (open) => {
        if (!sidebarEl) return;
        sidebarEl.classList.toggle('open', open);
        document.getElementById('btn-sidebar-toggle')?.classList.toggle('open', open);
      };
      const tab = btn.dataset.tab;
      if (tab !== 'menu') setSidebar(false);
      if (tab === 'map') {
        if (isAnyModalOpen()) closeModal();
      } else if (tab === 'kingdom') {
        openDashboardModal();
      } else if (tab === 'bot') {
        openTownZoneModal('tavern', '🍺 Taverna & Otonom Bot');
      } else if (tab === 'market') {
        openTownZoneModal('market', '🏪 Pazar');
      } else if (tab === 'menu') {
        if (isAnyModalOpen()) closeModal();
        setSidebar(!(sidebarEl && sidebarEl.classList.contains('open')));
      }
      tabbar.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === btn));
    });
  }

  // Sağ Menü Açma/Kapama Çekmece Butonu
  const toggleBtn = document.getElementById('btn-sidebar-toggle');
  const sidebar = document.getElementById('realm-sidebar');
  const toggleArrow = document.getElementById('sidebar-toggle-arrow');

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
      const isOpen = sidebar.classList.contains('open');
      toggleBtn.classList.toggle('open', isOpen);
      if (toggleArrow) toggleArrow.innerText = isOpen ? '▶' : '◀';
    });

    toggleBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    toggleBtn.addEventListener('pointerup', (e) => e.stopPropagation());

    sidebar.addEventListener('pointerdown', (e) => e.stopPropagation());
    sidebar.addEventListener('pointerup', (e) => e.stopPropagation());
    sidebar.addEventListener('click', (e) => e.stopPropagation());
    sidebar.addEventListener('pointerenter', () => {
      const tooltip = document.getElementById('realm-hover-tooltip');
      if (tooltip) {
        tooltip.classList.remove('visible');
        tooltip.classList.add('hidden');
      }
    });
  }

  // Sağ Menü Paneli (Realm Sidebar) Butonları
  const sideCharCard = document.getElementById('sidebar-character-card');
  if (sideCharCard) sideCharCard.addEventListener('click', openInventoryModal);

  const sideBotPill = document.getElementById('sidebar-bot-pill');
  if (sideBotPill) sideBotPill.addEventListener('click', () => openTownZoneModal('tavern', '🍻 Gece Kuşu Tavernası'));

  const sideSweepBtn = document.getElementById('side-btn-sweep-harvest');
  if (sideSweepBtn) {
    sideSweepBtn.addEventListener('click', () => {
      const res = gameState.sweepCompletedExpeditions();
      if (res.success) {
        showToast(res.message, 'success');
        sound.playHarvest();
      } else {
        showToast(res.message, 'info');
      }
      renderTopBar();
    });
  }

  const sideBtnInv = document.getElementById('side-btn-inventory');
  if (sideBtnInv) sideBtnInv.addEventListener('click', openInventoryModal);

  const sideBtnBar = document.getElementById('side-btn-barracks');
  if (sideBtnBar) sideBtnBar.addEventListener('click', openBarracksModal);

  const sideBtnDun = document.getElementById('side-btn-dungeon');
  if (sideBtnDun) sideBtnDun.addEventListener('click', enterDungeonScene);

  const sideBtnCol = document.getElementById('side-btn-colosseum');
  if (sideBtnCol) sideBtnCol.addEventListener('click', openColosseumModal);

  const sideBtnCarnival = document.getElementById('side-btn-carnival');
  if (sideBtnCarnival) sideBtnCarnival.addEventListener('click', () => openCarnivalModal('wheel'));

  const sideBtnMarket = document.getElementById('side-btn-market');
  if (sideBtnMarket) sideBtnMarket.addEventListener('click', () => openTownZoneModal('market', '🏪 AMM Pazar Alanı'));

  const sideBtnTavern = document.getElementById('side-btn-tavern');
  if (sideBtnTavern) sideBtnTavern.addEventListener('click', () => openTownZoneModal('tavern', '🍻 Gece Kuşu Tavernası'));

  const sideBtnBoxes = document.getElementById('side-btn-boxes');
  if (sideBtnBoxes) sideBtnBoxes.addEventListener('click', () => openCollectionModal('kutular'));

  const sideBtnRepairAll = document.getElementById('side-btn-repair-all');
  if (sideBtnRepairAll) {
    sideBtnRepairAll.addEventListener('click', () => {
      const res = gameState.repairAllTools();
      if (res.success) {
        showToast(res.message, 'success');
        sound.playLevelUp();
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
    });
  }

  // Sefer kartlarına tıklayınca ilgili kaynağın modalını aç
  document.querySelectorAll('.sidebar-exp-card').forEach(card => {
    card.addEventListener('click', () => {
      const node = card.dataset.node;
      if (RES_KEYS().includes(node)) openTownZoneModal(ZONE_OF_NODE(node), ZONE_TITLE(node));
    });
  });

  if (dom.btnDockMap) {
    dom.btnDockMap.addEventListener('click', () => {
      if (phaserGame && phaserGame.scene) {
        // Eğer Zindan sahnesindeyse kasabaya dön
        const activeScenes = phaserGame.scene.getScenes(true);
        const isDungeon = activeScenes.some(s => s.scene.key === 'DungeonScene');

        if (isDungeon) {
          returnToTown();
        } else if (phaserGame.scene.scenes[0]) {
          const cam = phaserGame.scene.scenes[0].cameras.main;
          const minZoom = Math.max(cam.width / 2400, cam.height / 1350);
          phaserGame.scene.scenes[0].tweens.add({
            targets: cam,
            scrollX: (2400 - cam.width) / 2,
            scrollY: (1350 - cam.height) / 2,
            zoom: minZoom,
            duration: 400,
            ease: 'Sine.easeInOut'
          });
          showToast('🗺️ Harita merkeze odaklandı!', 'info');
        }
      }
    });
  }

  if (dom.btnDungeonReturnTown) {
    dom.btnDungeonReturnTown.addEventListener('click', returnToTown);
  }

  // Sabit HTML Kat Seçici Barı Tıklamaları (100% Senkron & Kesin Tıklama)
  document.querySelectorAll('.floor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const floor = parseInt(tab.dataset.floor, 10);
      document.querySelectorAll('.floor-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      updateDungeonLiveDropRatesUI(floor);
      window.dispatchEvent(new CustomEvent('switch-dungeon-floor', { detail: { floor } }));
    });
  });

  window.addEventListener('switch-dungeon-floor', (e) => {
    if (e.detail && typeof e.detail.floor === 'number') {
      updateDungeonLiveDropRatesUI(e.detail.floor);
    }
  });

  window.addEventListener('open-town-modal', (e) => {
    const { zoneId, zoneName } = e.detail;
    if (zoneId === 'dungeon') {
      enterDungeonScene();
      return;
    } else if (zoneId === 'barracks') {
      openBarracksModal();
    } else if (zoneId === 'battlefield') {
      openBattlefieldModal();
    } else if (zoneId === 'colosseum') {
      openColosseumModal();
    } else if (zoneId === 'warehouse' || zoneId === 'silo') {
      openWarehouseModal();
    } else if (zoneId === 'collection') {
      openCollectionModal();
    } else if (zoneId === 'council') {
      openTreasuryVaultModal();
    } else if (zoneId === 'blacksmith') {
      mineActiveTab = 'blacksmith';
      openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
    } else if (zoneId === 'mine') {
      mineActiveTab = 'mining';
      openTownZoneModal('mine', '⛏️ DAĞ MADEN OCAĞI & DEMİR');
    } else {
      openTownZoneModal(zoneId, zoneName);
    }
  });

  window.addEventListener('open-monster-battle', (e) => {
    const { monster } = e.detail;
    const currentLevel = gameState.state.dungeonProgress || 1;
    if (monster.level > currentLevel) {
      showToast(`🔒 Şu an Seviye ${currentLevel}'desiniz! [Seviye ${monster.level}] ${monster.name} bölümüne girmek için önce Seviye ${currentLevel} ve önceki bölümleri tamamlamalısınız.`, 'error');
      return;
    }
    openPreBattleModal(monster);
  });

  window.addEventListener('toast-notify', (e) => {
    const { message, type } = e.detail;
    showToast(message, type);
  });

  dom.modalBody.addEventListener('click', async (e) => {
    // ── v2 binaları: Köy Evleri, Şifahane, Uzay Limanı, Demirhane geri dönüşümü, Konsey katkısı ──
    if (e.target.closest('#btn-build-house')) {
      const r = gameState.buildHouse();
      showToast(r.message, r.success ? 'success' : 'error');
      if (r.success) sound.playLevelUp();
      openTownZoneModal('village', ZONE_LABELS.village);
      renderTopBar();
      return;
    }
    const herbBtn = e.target.closest('.btn-heal-herb');
    if (herbBtn) {
      const r = gameState.healSoldierWithHerb(parseInt(herbBtn.dataset.soldierIdx, 10));
      showToast(r.message, r.success ? 'success' : 'error');
      openTownZoneModal('healer', ZONE_LABELS.healer);
      renderTopBar();
      return;
    }
    if (e.target.closest('#btn-heal-herb-all')) {
      const r = gameState.healAllWithHerb();
      showToast(r.message, r.healed > 0 ? 'success' : 'info');
      openTownZoneModal('healer', ZONE_LABELS.healer);
      renderTopBar();
      return;
    }
    if (e.target.closest('#btn-healer-open-barracks')) { openBarracksModal(); return; }
    if (e.target.closest('#btn-build-rocket')) {
      const r = gameState.buildRocket();
      showToast(r.message, r.success ? 'success' : 'error');
      if (r.success) sound.playLevelUp();
      openTownZoneModal('spaceport', ZONE_LABELS.spaceport);
      renderTopBar();
      return;
    }
    // 🏷️ İlan pazarı: ilan ver / satın al / geri çek (sunucu)
    const sellBtn = e.target.closest('.btn-sell-equipment');
    if (sellBtn) {
      const d = sellBtn.dataset;
      const v = window.prompt('Fiyat (ASTRA)? Komisyon %2, ilan 7 gün sürer; satılmazsa eşya sana döner.', '1');
      if (v == null) return;
      const price = Number(String(v).replace(',', '.'));
      if (!(price > 0)) { showToast('Geçerli bir fiyat yaz.', 'error'); return; }
      pazar.sell({ source: d.source, slotKey: d.slot, armoryIndex: d.armoryIdx !== '' ? parseInt(d.armoryIdx, 10) : null, soldierIndex: d.soldierIdx !== '' ? parseInt(d.soldierIdx, 10) : null }, price)
        .then(r => { showToast(r.message, r.success ? 'success' : 'error'); openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE'); renderTopBar(); })
        .catch(err => showToast('İlan verilemedi: ' + err.message, 'error'));
      return;
    }
    const buyBtn = e.target.closest('.btn-ilan-buy');
    if (buyBtn) {
      if (!window.confirm(`${buyBtn.dataset.name} ${buyBtn.dataset.price} ASTRA'ya alınsın mı? Önce kilitli ASTRA'n kullanılır.`)) return;
      pazar.buy(Number(buyBtn.dataset.id)).then(r => { showToast(r.message, r.success ? 'success' : 'error'); loadIlanPazari(); renderTopBar(); }).catch(err => showToast('Satın alınamadı: ' + err.message, 'error'));
      return;
    }
    const cancelBtn = e.target.closest('.btn-ilan-cancel');
    if (cancelBtn) {
      pazar.cancel(Number(cancelBtn.dataset.id)).then(r => { showToast(r.message, r.success ? 'success' : 'error'); loadIlanPazari(); }).catch(err => showToast('Geri çekilemedi: ' + err.message, 'error'));
      return;
    }
    // 📦 Hazırlık Deposu: yarısını koy / hepsini geri al
    const putBtn = e.target.closest('.btn-depot-put');
    if (putBtn) {
      const k = putBtn.dataset.res;
      const half = Math.floor(((gameState.state.inventory || {})[k] || 0) / 2);
      const r = gameState.depositToPrepDepot({ [k]: half });
      showToast(r.message, r.success ? 'success' : 'error');
      openTownZoneModal('spaceport', ZONE_LABELS.spaceport); renderTopBar();
      return;
    }
    const takeBtn = e.target.closest('.btn-depot-take');
    if (takeBtn) {
      const k = takeBtn.dataset.res;
      const st = gameState.getPrepDepotStatus();
      const row = st.rows.find(x => x.key === k);
      if (!row || !(row.stored > 0)) return;
      if (!window.confirm(`${row.stored} ${row.name} depodan geri alınsın mı? %${Math.round(st.cancelFee * 100)} kesinti yakılır.`)) return;
      const r = gameState.withdrawFromPrepDepot(k, row.stored);
      showToast(r.message, r.success ? 'success' : 'error');
      openTownZoneModal('spaceport', ZONE_LABELS.spaceport); renderTopBar();
      return;
    }
    const recBtn = e.target.closest('.btn-recycle-equipment');
    if (recBtn) {
      const d = recBtn.dataset;
      if (!window.confirm(`Bu eşya geri dönüştürülsün mü? Geri gelen: ${d.value || ''}. Eşya yok olur.`)) return;
      const r = gameState.recycleEquipment({ source: d.source, slotKey: d.slot, armoryIndex: d.armoryIdx !== '' ? parseInt(d.armoryIdx, 10) : null, soldierIndex: d.soldierIdx !== '' ? parseInt(d.soldierIdx, 10) : null });
      showToast(r.message, r.success ? 'success' : 'error');
      openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      renderTopBar();
      return;
    }
    const kBtn = e.target.closest('.btn-konsey-contribute');
    if (kBtn) {
      const res = kBtn.dataset.res, target = kBtn.dataset.target;
      const inv = gameState.state.inventory || {};
      let r;
      if (res === 'labor') r = gameState.contributeToProject({}, Math.floor(gameState.getVillageInfo().labor));
      else {
        const box = kBtn.parentElement && kBtn.parentElement.querySelector('input.konsey-amt');
        const typed = box ? Math.floor(Number(box.value)) : NaN;
        const amt = Number.isFinite(typed) && typed > 0 ? Math.min(typed, Math.floor(inv[res] || 0)) : Math.floor((inv[res] || 0) / 2);
        if (!(amt > 0)) { showToast('Geçerli bir miktar yaz.', 'error'); return; }
        r = target === 'otorite' ? gameState.contributeToOtorite({ [res]: amt }) : gameState.contributeToProject({ [res]: amt }, 0);
      }
      showToast(r.message, r.success ? 'success' : 'error');
      openTreasuryVaultModal();
      renderTopBar();
      return;
    }
    // 1-Click: Tüm Seferleri Topla & Yeniden Başlat
    const exp1ClickBtn = e.target.closest('.btn-1click-claim-restart-exp');
    if (exp1ClickBtn) {
      const res = gameState.claimAndRestartAllExpeditions();
      if (res.staminaWarning) {
        showToast(res.staminaWarning, 'warning');
      } else if (res.messages && res.messages.length > 0) {
        showToast(res.messages[0], 'warning');
      }
      if (res.claimed > 0 || res.partialClaimed > 0 || res.restarted > 0) {
        const parts = [];
        if (res.claimed > 0) parts.push(`${res.claimed} Tam Sefer`);
        if (res.partialClaimed > 0) parts.push(`${res.partialClaimed} Süren Seferden Biriken`);
        const harvestText = res.totalHarvest > 0 ? ` (+${res.totalHarvest} Kaynak)` : '';
        showToast(`⚡ ${parts.join(' & ')} Toplandı${harvestText}, ${res.restarted} Sefer Başlatıldı!`, 'success');
        sound.playHarvest();
      }
      openDashboardModal();
      renderTopBar();
      return;
    }

    // 1-Click: Tüm Staminayı Doldur
    const refill1ClickBtn = e.target.closest('.btn-1click-refill-stamina');
    if (refill1ClickBtn) {
      const res = gameState.refillStaminaToMaxWithWheat();
      if (res.success) {
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'info');
      }
      openDashboardModal();
      renderTopBar();
      return;
    }

    // 1-Click: Tüm Aletleri Onar
    const repair1ClickBtn = e.target.closest('.btn-1click-repair-tools');
    if (repair1ClickBtn) {
      const res = gameState.repairAllTools();
      if (res.repaired > 0) {
        showToast(`🔨 ${res.repaired} alet tamir edildi: -${res.totalWood}🌲 -${res.totalIron}⛏️ -${res.totalAda}🟣`, 'success');
        sound.playRepair();
      } else if (res.hasDamagedTools && res.missingAda) {
        showToast('⚠️ Hesapta yeteri kadar ASTRA yok!', 'error');
      } else {
        showToast(res.message || 'Tamir edilecek alet yok.', 'info');
      }
      openDashboardModal();
      renderTopBar();
      return;
    }

    // 1-Click: Tüm Orduyu Doyur & İyileştir
    const heal1ClickBtn = e.target.closest('.btn-1click-heal-army');
    if (heal1ClickBtn) {
      const res = gameState.instantHealAllSoldiers();
      if (res.healed > 0) {
        showToast(`🌾 ${res.healed} asker doyuruldu ve tam cana ulaştı: -${res.totalWheat}🌾 -${res.totalAda}🟣`, 'success');
        sound.playLevelUp();
      } else {
        showToast('İyileştirilecek yaralı asker yok.', 'info');
      }
      openDashboardModal();
      renderTopBar();
      return;
    }

    // Smart Armory: Otomatik En İyileri Dağıt
    const autoEquipBtn = e.target.closest('.btn-smart-auto-equip');
    if (autoEquipBtn) {
      const res = gameState.autoEquipBest();
      showToast(res.message, res.success ? 'success' : 'info');
      openSmartArmoryModal();
      renderTopBar();
      return;
    }

    // Smart Armory: Tüm Eşyaları Sök
    const unequipAllBtn = e.target.closest('.btn-smart-unequip-all');
    if (unequipAllBtn) {
      const res = gameState.unequipAllSoldiers();
      showToast(res.message, res.success ? 'success' : 'info');
      openSmartArmoryModal();
      renderTopBar();
      return;
    }

    // Smart Armory: Asker Seçimi
    const armorySolMini = e.target.closest('.armory-soldier-mini');
    if (armorySolMini) {
      const idx = parseInt(armorySolMini.dataset.soldierIdx, 10);
      if (!isNaN(idx)) {
        selectedSoldierIndex = idx;
        openSmartArmoryModal();
      }
      return;
    }

    // Seviye Atlama
    if (e.target.closest('#btn-modal-levelup')) {
      const res = gameState.levelUp();
      if (res.success) {
        showToast(res.message, 'success');
        openInventoryModal();
      } else {
        showToast(res.message, 'error');
        const feedbackBox = dom.modalBody.querySelector('#levelup-feedback-box');
        if (feedbackBox) {
          feedbackBox.innerHTML = `
            <div style="background: rgba(239,68,68,0.25); border: 1.5px solid #ef4444; border-radius: 8px; padding: 10px 14px; color: #fca5a5; font-size: 0.86rem; font-weight: 800; margin-top: 6px; display: flex; align-items: center; gap: 8px; animation: shake 0.3s ease;">
              <span style="font-size: 1.3rem;">⚠️</span>
              <span>${res.message}</span>
            </div>
          `;
        }
      }
      renderTopBar();
      return;
    }

    // 🏛️ Evrensel Temel Gelir (UBI) Claim Butonu
    if (e.target.closest('#btn-claim-ubi')) {
      const res = gameState.claimWeeklyUbi();
      if (res.success) {
        showToast(res.message, 'success');
        sound.playLevelUp();
        openInventoryModal(); // Modalı anında yenile ve butonu devre dışı yap
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Sefer Başlatma
    const startBtn = e.target.closest('.btn-modal-start');
    if (startBtn) {
      const node = startBtn.dataset.node;
      const res = gameState.startExpedition(node);
      if (res.success) {
        showToast(res.message, 'success');
        closeModal();
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Sefer Toplama (Tam veya Kısmi Silo Doldurma Claim)
    const claimBtn = e.target.closest('.btn-modal-claim');
    if (claimBtn) {
      const node = claimBtn.dataset.node;
      const res = gameState.claimExpedition(node);
      if (res.success) {
        showToast(res.message, 'success');
        if (res.isPartialSiloFill) {
          openTownZoneModal(node, GAME_CONFIG.GLOBAL_RESOURCE_CAPS[node]?.name || node);
        } else {
          closeModal();
        }
      } else {
        showToast(res.message, (res.isWarehouseFull || res.isQuotaWait) ? 'warning' : 'error');
      }
      renderTopBar();
      return;
    }

    // Sefer Erken Toplama (Partial Claim)
    const partialClaimBtn = e.target.closest('.btn-modal-partial-claim');
    if (partialClaimBtn) {
      const node = partialClaimBtn.dataset.node;
      const res = gameState.claimPartialExpedition(node);
      if (res.success) {
        showToast(res.message, 'success');
        openTownZoneModal(node, GAME_CONFIG.GLOBAL_RESOURCE_CAPS[node]?.name || node);
      } else {
        showToast(res.message, (res.isWarehouseFull || res.isQuotaWait) ? 'warning' : 'error');
      }
      renderTopBar();
      return;
    }

    // Kışla Asker Seçimi
    const selectSoldierBtn = e.target.closest('.btn-select-soldier-card');
    if (selectSoldierBtn) {
      const idx = parseInt(selectSoldierBtn.dataset.soldierIdx, 10);
      if (!isNaN(idx)) {
        selectedSoldierIndex = idx;
        editingSoldierNameIndex = null;
        openBarracksModal();
      }
      return;
    }

    // ✏️ Asker İsmi Değiştirme Tetikleyici
    const triggerRenameBtn = e.target.closest('.btn-trigger-rename');
    if (triggerRenameBtn) {
      const sIdx = parseInt(triggerRenameBtn.dataset.soldierIdx, 10);
      if (!isNaN(sIdx)) {
        editingSoldierNameIndex = sIdx;
        openBarracksModal();
      }
      return;
    }

    // 💾 Asker İsmi Kaydetme
    const saveNameBtn = e.target.closest('.btn-save-soldier-name');
    if (saveNameBtn) {
      const sIdx = parseInt(saveNameBtn.dataset.soldierIdx, 10);
      const input = document.getElementById('input-soldier-rename');
      const newName = input ? input.value : '';
      const res = gameState.renameSoldierUnit(sIdx, newName);
      if (res.success) {
        showToast(res.message, 'success');
        editingSoldierNameIndex = null;
        openBarracksModal();
      } else {
        showToast(res.message, 'error');
      }
      return;
    }

    // ✕ Asker İsmi Değiştirme İptali
    const cancelNameBtn = e.target.closest('.btn-cancel-soldier-name');
    if (cancelNameBtn) {
      editingSoldierNameIndex = null;
      openBarracksModal();
      return;
    }

    // Askere Teçhizat Kuşanma
    const equipSoldierSlotBtn = e.target.closest('.btn-soldier-equip-slot');
    if (equipSoldierSlotBtn) {
      const sIdx = parseInt(equipSoldierSlotBtn.dataset.soldierIdx, 10);
      const slotKey = equipSoldierSlotBtn.dataset.slot;
      const res = gameState.equipSoldierSlot(sIdx, slotKey);
      if (res.success) {
        showToast(res.message, 'success');
        openBarracksModal();
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Askerden Teçhizat Çıkarma
    const unequipSoldierSlotBtn = e.target.closest('.btn-soldier-unequip-slot');
    if (unequipSoldierSlotBtn) {
      const sIdx = parseInt(unequipSoldierSlotBtn.dataset.soldierIdx, 10);
      const slotKey = unequipSoldierSlotBtn.dataset.slot;
      const res = gameState.unequipSoldierSlot(sIdx, slotKey);
      if (res.success) {
        showToast(res.message, 'success');
        openBarracksModal();
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // 🛡️ Asker Formasyon Mevzisi Değiştirme (Ön Saf / Arka Saf)
    const toggleSoldierRowBtn = e.target.closest('.btn-toggle-soldier-row');
    if (toggleSoldierRowBtn) {
      const sIdx = parseInt(toggleSoldierRowBtn.dataset.soldierIdx, 10);
      const soldier = (gameState.state.soldierUnits || [])[sIdx];
      if (soldier) {
        const nextRow = soldier.row === 'back' ? 'front' : 'back';
        const res = gameState.setSoldierRow(sIdx, nextRow);
        if (res.success) {
          showToast(`🛡️ ${soldier.name} mevzisi: ${nextRow === 'back' ? '🏹 Arka Saf' : '🛡️ Ön Saf'} olarak ayarlandı.`, 'info');
          openBarracksModal();
        }
      }
      return;
    }

    // 🎯 Kışla Preset Seçimi (P1, P2, P3)
    const barracksPresetBtn = e.target.closest('.btn-barracks-preset');
    if (barracksPresetBtn) {
      const pid = parseInt(barracksPresetBtn.dataset.preset, 10);
      const res = gameState.applyCombatPreset(pid);
      if (res.success) {
        showToast(res.message, 'info');
        openBarracksModal();
      }
      return;
    }

    // 💾 Kışla Presete Kaydetme
    const barracksSavePresetBtn = e.target.closest('#btn-save-barracks-preset');
    if (barracksSavePresetBtn) {
      const activeId = gameState.state.combatPresets?.activePresetId || 1;
      const res = gameState.saveCombatPreset(activeId);
      if (res.success) {
        showToast(res.message, 'success');
        openBarracksModal();
      }
      return;
    }

    // ⚡ Anında Doyur & İyileştir (Tek Asker)
    const instantHealBtn = e.target.closest('.btn-soldier-instant-heal');
    if (instantHealBtn) {
      const sIdx = parseInt(instantHealBtn.dataset.soldierIdx, 10);
      const res = gameState.instantHealSoldierUnit(sIdx);
      if (res.success) {
        showToast(res.message, 'success');
        openBarracksModal();
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // 👑 60+ Yaş Özel: TEK DOKUNUŞLA ORDUMU HAZIRLA (Hem Doyur Hem En İyileri Kuşan)
    if (e.target.closest('#btn-master-prep-army')) {
      const healRes = gameState.instantHealAllSoldiers();
      const equipRes = gameState.autoEquipBest();
      sound.playLevelUp();
      showToast(`👑 Ordun Savaşa Hazırlandı! (${healRes.healed} asker doyuruldu, ${equipRes.equipped || 0} eşya kuşandırıldı)`, 'success');
      openBarracksModal();
      renderTopBar();
      return;
    }

    // ⚡ Akıllı Kuşan (En İyileri Dağıt)
    const smartAutoEquipBtn = e.target.closest('.btn-smart-auto-equip');
    if (smartAutoEquipBtn) {
      const res = gameState.autoEquipBest();
      showToast(res.message, res.success ? 'success' : 'info');
      openBarracksModal();
      renderTopBar();
      return;
    }

    // 🔄 Tüm Eşyaları Sök
    const smartUnequipAllBtn = e.target.closest('.btn-smart-unequip-all');
    if (smartUnequipAllBtn) {
      const res = gameState.unequipAllSoldiers();
      showToast(res.message, res.success ? 'success' : 'info');
      if (barracksActiveTab === 'armory') openBarracksModal();
      else if (dom.modalTitle && dom.modalTitle.innerText.includes('Akıllı Silah')) openSmartArmoryModal();
      else openBarracksModal();
      renderTopBar();
      return;
    }

    // 🔨 Tüm Silah & Zırhları Tek Tıkla Onar
    const smartRepairAllBtn = e.target.closest('.btn-smart-repair-all-equip');
    if (smartRepairAllBtn) {
      const res = gameState.repairAllEquipmentInKingdom();
      showToast(res.message, res.success ? 'success' : 'info');
      if (res.success) sound.playRepair();
      if (barracksActiveTab === 'armory') openBarracksModal();
      else if (dom.modalTitle && dom.modalTitle.innerText.includes('Akıllı Silah')) openSmartArmoryModal();
      else openBarracksModal();
      renderTopBar();
      return;
    }

    // ♻️ Düşük Kalite / Fazlalıkları Hurdaya Çevir
    const smartScrapBtn = e.target.closest('.btn-smart-scrap-low-tier');
    if (smartScrapBtn) {
      const res = gameState.scrapAllLowTierEquipment(1);
      if (res.success) {
        if (typeof sound !== 'undefined' && sound && sound.playLevelUp) {
          sound.playLevelUp();
        }
        openScrapReportModal(res);
      } else {
        showToast(res.message, 'info');
      }
      renderTopBar();
      return;
    }

    // 🌾 Tüm Orduyu Doyur (Toplu İyileştir)
    const smartHealAllBtn = e.target.closest('.btn-smart-heal-all');
    if (smartHealAllBtn) {
      const res = gameState.instantHealAllSoldiers();
      if (res.healed > 0) {
        showToast(`⚡ ${res.healed} asker tam cana ulaştırıldı! (-${res.totalWheat} 🌾, -${res.totalAda} 🟣 ASTRA)`, 'success');
        sound.playRepair();
      } else {
        showToast('İyileştirilecek yaralı asker bulunmuyor veya kaynaklar yetersiz.', 'info');
      }
      openBarracksModal();
      renderTopBar();
      return;
    }

    // Alet Onarımı
    const repairBtn = e.target.closest('.btn-modal-repair');
    if (repairBtn) {
      const tool = repairBtn.dataset.tool;
      const res = gameState.repairTool(tool);
      if (res.success) {
        showToast(res.message, 'success');
        closeModal();
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Buğday ile Stamina Doldur (+25)
    if (e.target.closest('#btn-wheat-stamina-refill')) {
      const res = gameState.refillStaminaWithWheat();
      if (res.success) {
        showToast(res.message, 'success');
        openInventoryModal();
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Buğday ile Staminayı Tek Seferde Tam Doldur
    if (e.target.closest('#btn-wheat-stamina-refill-max')) {
      const res = gameState.refillStaminaToMaxWithWheat();
      if (res.success) {
        showToast(res.message, 'success');
        openInventoryModal();
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Parşömen Kullan (.btn-use-scroll)
    const useScrollBtn = e.target.closest('.btn-use-scroll');
    if (useScrollBtn) {
      const scrollKey = useScrollBtn.dataset.scroll;
      const targetId = useScrollBtn.dataset.targetId || null;
      const res = gameState.useScroll(scrollKey, targetId);
      if (res.success) {
        showToast(res.message, 'success');
        sound.playLevelUp();
        // Aktif açık pencereye göre ekranı anında tazele:
        if (dom.modalTitle && dom.modalTitle.innerText.includes('DASHBOARD')) {
          openDashboardModal();
        } else if (dom.modalTitle && (dom.modalTitle.innerText.includes('KIŞLA') || dom.modalTitle.innerText.includes('KARARGAH'))) {
          openBarracksModal();
        } else if (dom.modalTitle && RES_KEYS().some(k => dom.modalTitle.innerText.includes(ZONE_TITLE(k)))) {
          const zk = RES_KEYS().find(k => dom.modalTitle.innerText.includes(ZONE_TITLE(k)));
          openTownZoneModal(ZONE_OF_NODE(zk), ZONE_TITLE(zk));
        } else if (dom.modalTitle && dom.modalTitle.innerText.includes('SAVAŞ ÖNCESİ') && window.currentPreBattleMonster) {
          openPreBattleModal(window.currentPreBattleMonster);
        } else {
          openInventoryModal();
        }
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }


    // ⚔️ Kışla'ya git (ör. Kolezyum'da asker yokken)
    if (e.target.closest('.btn-goto-barracks')) {
      barracksActiveTab = 'army';
      openBarracksModal();
      return;
    }

    // ⚔️ Demirciden Kışla → Cephanelik'e geç
    if (e.target.closest('.btn-goto-armory')) {
      barracksActiveTab = 'armory';
      openBarracksModal();
      return;
    }

    // ⚡ Demirci: eksikleri pazardan al ve eşyayı döv
    const quickCraftBtn = e.target.closest('.btn-quick-craft');
    if (quickCraftBtn) {
      const slot = quickCraftBtn.dataset.slot;
      const plan = gameState.getQuickBuyPlan('craft:' + slot);
      if (!plan.ok) { showToast(plan.reason || 'Alım yapılamıyor.', 'error'); return; }
      const list = plan.items.map(i => `• ${i.qty.toLocaleString('tr-TR')} ${i.name} (~${Math.ceil(i.cost).toLocaleString('tr-TR')} ASTRA)`).join('\n');
      if (!confirm(`Eksikler pazardan alınıp eşya dövülsün mü?\n${list}\nAlım ~${Math.ceil(plan.total).toLocaleString('tr-TR')} ASTRA + dövme bedeli ~${Math.ceil(plan.extraAda).toLocaleString('tr-TR')} ASTRA`)) return;
      for (const it of plan.items) {
        const r = await gameState.marketBuy(it.res, it.qty);
        if (!r || !r.success) { showToast(`${it.name} alınamadı: ${(r && r.message) || ''}`, 'error'); renderTopBar(); openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE'); return; }
      }
      const res = await gameState.craftEquipment(slot);
      showToast(res && res.message ? res.message : 'Dövme yapılamadı.', res && res.success ? 'success' : 'error');
      renderTopBar();
      openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      return;
    }

    // ⚡ Hızlı al: seviye atlama / silo yükseltme için eksik hammaddeleri pazardan al
    const quickBuyBtn = e.target.closest('.btn-quick-buy');
    if (quickBuyBtn) {
      const kind = quickBuyBtn.dataset.kind;
      const plan = gameState.getQuickBuyPlan(kind);
      if (!plan.ok) { showToast(plan.reason || 'Alım yapılamıyor.', 'error'); return; }
      const list = plan.items.map(i => `• ${i.qty.toLocaleString('tr-TR')} ${i.name} (~${Math.ceil(i.cost).toLocaleString('tr-TR')} ASTRA)`).join('\n');
      if (!confirm(`Eksik hammaddeler pazardan alınsın mı?\n${list}\nToplam ~${Math.ceil(plan.total).toLocaleString('tr-TR')} ASTRA`)) return;
      let bought = 0;
      for (const it of plan.items) {
        const r = await gameState.marketBuy(it.res, it.qty);
        if (r && r.success) bought++;
        else { showToast(`${it.name} alınamadı: ${(r && r.message) || ''}`, 'error'); break; }
      }
      if (bought) { showToast(`⚡ ${bought} hammadde pazardan alındı. Şimdi ${kind === 'levelup' ? 'seviye atlayabilirsin' : 'siloyu yükseltebilirsin'}!`, 'success'); sound.playHarvest && sound.playHarvest(); }
      renderTopBar();
      if (kind === 'levelup') openInventoryModal(); else openWarehouseModal();
      return;
    }

    // Pazar: hızlı miktar düğmeleri (+100 / +1.000 / yarısı …)
    const ammQBtn = e.target.closest('.btn-amm-q');
    if (ammQBtn) {
      const resKey = ammQBtn.dataset.res;
      const side = ammQBtn.dataset.side;
      const input = dom.modalBody.querySelector(`.amm-${side}-qty[data-res="${resKey}"]`);
      if (!input) return;
      if (side === 'buy') { const cur = parseFloat(input.value) || 0; input.value = Math.max(1, Math.floor((cur <= 1 ? 0 : cur) + Number(ammQBtn.dataset.q))); }
      else {
        const have = resKey === 'boxes' ? (gameState.state.lockedBoxes || 0) : resKey === 'keys' ? (gameState.state.arenaKeys || 0) : (gameState.state.inventory[resKey] || 0);
        input.value = Math.max(1, Math.floor(have * Number(ammQBtn.dataset.frac)));
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // 🧺 Pazar: Depoyu doldur (silo dolana kadar al; ASTRA yetmezse alınabildiği kadar)
    const ammFillBtn = e.target.closest('.btn-amm-fill');
    if (ammFillBtn) {
      const resKey = ammFillBtn.dataset.res;
      const fq = gameState.getFillWarehouseQty(resKey);
      if (fq.qty <= 0) { showToast(fq.room > 0 ? 'ADA yetmiyor.' : 'Silo zaten dolu.', 'info'); return; }
      const name = (ammMarket.pools[resKey] && ammMarket.pools[resKey].name) || resKey;
      if (!confirm(`${fq.qty.toLocaleString('tr-TR')} ${name} alınsın mı? (~${Math.ceil(fq.cost).toLocaleString('tr-TR')} ASTRA, %2 harç dahil)${fq.limitedByAda ? `\nADA'n siloyu tamamen doldurmaya yetmiyor; alınabilecek en fazla miktar bu (boş yer: ${fq.room.toLocaleString('tr-TR')}).` : ''}`)) return;
      const res = await gameState.marketBuy(resKey, fq.qty);
      if (res && res.success) {
        showToast(`🧺 ${fq.qty.toLocaleString('tr-TR')} ${name} alındı (−${Number(res.cost || 0).toFixed(2)} ASTRA)`, 'success');
        openTownZoneModal('market', '🏪 AMM Pazar Alanı');
      } else showToast((res && res.message) || 'Alım yapılamadı.', 'error');
      renderTopBar();
      return;
    }

    // AMM Pazar: Silodaki bütün hammaddeyi tek tuşla sat (taban fiyat sınırına kadar)
    const ammSellAllBtn = e.target.closest('.btn-amm-sell-all');
    if (ammSellAllBtn) {
      const resKey = ammSellAllBtn.dataset.res;
      const have = Math.floor((gameState.state.inventory || {})[resKey] || 0);
      if (have <= 0) { showToast('Siloda satılacak hammadde yok.', 'info'); return; }
      const maxSell = ammMarket.getMaxSellBeforeFloor ? ammMarket.getMaxSellBeforeFloor(resKey) : Infinity;
      const qty = Math.min(have, Number.isFinite(maxSell) ? Math.floor(maxSell) : have);
      if (qty <= 0) { showToast('Pazar fiyatı en alt sınırda; hazine geri alımı fiyatı toparlayana kadar satış yapılamaz.', 'error'); return; }
      const est = ammMarket.getEstimatedAdAstraForSell ? ammMarket.getEstimatedAdAstraForSell(resKey, qty) : 0;
      const name = (ammMarket.pools[resKey] && ammMarket.pools[resKey].name) || resKey;
      const partNote = qty < have ? `\n\nPazar fiyatı en alt sınıra inmesin diye şimdilik ${qty.toLocaleString('tr-TR')} adedi satılabilir; kalan ${(have - qty).toLocaleString('tr-TR')} adet siloda kalır.` : '';
      if (!confirm(`${qty.toLocaleString('tr-TR')} ${name} satılsın mı?\nTahmini kazanç: ~${Math.floor(est).toLocaleString('tr-TR')} ASTRA (%2 harç sonrası).${partNote}`)) return;
      const res = await gameState.marketSell(resKey, qty);
      if (res && res.success) {
        showToast(`💰 ${qty.toLocaleString('tr-TR')} ${res.resourceName || name} satıldı: +${Number(res.adAstraReceived || 0).toFixed(2)} ASTRA${qty < have ? ` (${(have - qty).toLocaleString('tr-TR')} adet taban fiyat sınırı yüzünden siloda kaldı)` : ''}`, 'success');
        sound.playLevelUp();
        openTownZoneModal('market', '🏪 AMM Pazar Alanı');
      } else {
        showToast((res && res.message) || 'Satış yapılamadı.', 'error');
      }
      renderTopBar();
      return;
    }

    // AMM Pazar: İnteraktif Onaylı Kaynak Satışı
    const ammConfirmSellBtn = e.target.closest('.btn-amm-confirm-sell');
    if (ammConfirmSellBtn) {
      const resKey = ammConfirmSellBtn.dataset.res;
      const inputEl = dom.modalBody.querySelector(`.amm-sell-qty[data-res="${resKey}"]`);
      const qty = inputEl ? (parseFloat(inputEl.value) || 0) : 0;

      if (qty <= 0) {
        showToast('Lütfen satmak istediğin geçerli bir miktar gir!', 'error');
        return;
      }
      const res = gameState.marketSell(resKey, qty);
      if (res.success) {
        const burnInfo = res.resourceBurnFee > 0 ? ` (🔥 %2 Yakım: ${res.resourceBurnFee.toLocaleString('tr-TR')} ${res.resourceName} kalıcı silindi)` : '';
        showToast(`💰 ${qty.toLocaleString('tr-TR')} ${res.resourceName} satıldı: +${res.adAstraReceived.toFixed(2)} ASTRA cüzdana eklendi! (%2 Harç: ${res.fee.toFixed(2)} ASTRA Hazine Kasalarına & UBI'ye aktarıldı)${burnInfo}`, 'success');
        sound.playLevelUp();
        openTownZoneModal('market', '🏪 AMM Pazar Alanı');
      } else {
        showToast(res.message || 'Satış işlemi gerçekleştirilemedi!', 'error');
      }
      renderTopBar();
      return;
    }

    // AMM Pazar: İnteraktif Onaylı Kaynak Alışı
    const ammConfirmBuyBtn = e.target.closest('.btn-amm-confirm-buy');
    if (ammConfirmBuyBtn) {
      const resKey = ammConfirmBuyBtn.dataset.res;
      const inputEl = dom.modalBody.querySelector(`.amm-buy-qty[data-res="${resKey}"]`);
      const qty = inputEl ? (parseFloat(inputEl.value) || 0) : 0;

      if (qty <= 0) {
        showToast('Lütfen satın almak istediğin geçerli bir miktar gir!', 'error');
        return;
      }

      const res = gameState.marketBuy(resKey, qty);
      if (res.success) {
        const burnInfo = res.resourceBurnFee > 0 ? ` (🔥 %2 Yakım: ${res.resourceBurnFee.toLocaleString('tr-TR')} ${res.resourceName} kalıcı silindi)` : '';
        showToast(`🛒 ${res.cost.toFixed(2)} ASTRA ödendi: +${res.resourceReceived.toLocaleString('tr-TR')} ${res.resourceName} satın alındı! (%2 Harç: ${res.fee.toFixed(2)} ASTRA Hazine Kasalarına aktarıldı)${burnInfo}`, 'success');
        sound.playLevelUp();

        // 🤖 Bot duraklatılmışsa ve eksik kaynak tamamlandıysa anında devreye girdi
        if (res.botJustResumed) {
          showToast('🟢 Gerekli tüm kaynaklar sağlandı! 24s Otomasyon Botu kaldığı yerden devreye girdi ve seferleri başlattı!', 'success');
        }

        openTownZoneModal('market', '🏪 AMM Pazar Alanı');
      } else {
        showToast(res.message || 'Alış işlemi gerçekleştirilemedi!', 'error');
      }
      renderTopBar();
      return;
    }

    // P2P Koleksiyon Eseri İlanı Ver
    if (e.target.closest('#btn-create-p2p-listing')) {
      const selectEl = dom.modalBody.querySelector('#p2p-artifact-select');
      const inputEl = dom.modalBody.querySelector('#p2p-price-input');
      const artifactId = selectEl ? selectEl.value : '';
      const priceAda = inputEl ? (parseFloat(inputEl.value) || 0) : 0;

      if (!artifactId) {
        showToast('Lütfen satılacak bir eser seçin!', 'error');
        return;
      }
      const res = gameState.createP2PArtifactListing(artifactId, priceAda);
      if (res.success) {
        showToast(res.message, 'success');
        marketActiveTab = 'p2p_collection';
        openTownZoneModal('market', '🏪 AMM Pazar Alanı');
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // P2P İlanı Satın Al
    const p2pBuyBtn = e.target.closest('.btn-p2p-buy-listing');
    if (p2pBuyBtn) {
      const id = p2pBuyBtn.dataset.id;
      const res = gameState.buyP2PArtifactListing(id);
      if (res.success) {
        showToast(res.message, 'success');
        marketActiveTab = 'p2p_collection';
        openTownZoneModal('market', '🏪 AMM Pazar Alanı');
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // P2P İlanı İptal Et
    const p2pCancelBtn = e.target.closest('.btn-p2p-cancel-listing');
    if (p2pCancelBtn) {
      const id = p2pCancelBtn.dataset.id;
      const res = gameState.cancelP2PArtifactListing(id);
      showToast(res.message, res.success ? 'info' : 'error');
      marketActiveTab = 'p2p_collection';
      openTownZoneModal('market', '🏪 AMM Pazar Alanı');
      return;
    }

    // Demirci: 5 Parça Ekipman Dövme (Craft)
    const equipCraftBtn = e.target.closest('.btn-craft-equipment');
    if (equipCraftBtn) {
      const slotKey = equipCraftBtn.dataset.slot;
      const res = await gameState.craftEquipment(slotKey);
      if (res.success) {
        showToast(res.message, 'success');
        sound.playLevelUp();
        openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Demirci 60+ Yaş Sade Sekme Geçişi (.btn-bs-tab)
    const bsTabBtn = e.target.closest('.btn-bs-tab');
    if (bsTabBtn) {
      window.blacksmithActiveTab = bsTabBtn.dataset.bstab;
      openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      return;
    }

    // Cephanelik: Asker Seçimi (Demirci Hub Sütun 3)
    const selectSolBtn = e.target.closest('.btn-select-blacksmith-soldier');
    if (selectSolBtn) {
      window.blacksmithSelectedSoldierIndex = parseInt(selectSolBtn.dataset.soldierIdx, 10);
      openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      return;
    }

    // Cephanelik: Herhangi Bir Eşyayı Doğrudan Yükselt (Lv+1)
    const armoryUpBtn = e.target.closest('.btn-armory-direct-upgrade');
    if (armoryUpBtn) {
      const source = armoryUpBtn.dataset.source;
      const slotKey = armoryUpBtn.dataset.slot;
      const armoryIndex = armoryUpBtn.dataset.armoryIdx !== '' && armoryUpBtn.dataset.armoryIdx !== undefined ? parseInt(armoryUpBtn.dataset.armoryIdx, 10) : null;
      const soldierIndex = armoryUpBtn.dataset.soldierIdx !== '' && armoryUpBtn.dataset.soldierIdx !== undefined ? parseInt(armoryUpBtn.dataset.soldierIdx, 10) : null;
      const itemId = armoryUpBtn.dataset.itemId;

      const res = gameState.upgradeAnyEquipment({ source, slotKey, armoryIndex, soldierIndex, itemId });
      if (res.success) {
        showToast(res.message, 'success');
        sound.playLevelUp();
        openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Cephanelik: Eşyayı Doğrudan Seçili Askere Kuşandır
    const armoryEquipBtn = e.target.closest('.btn-armory-direct-equip');
    if (armoryEquipBtn) {
      const source = armoryEquipBtn.dataset.source;
      const slotKey = armoryEquipBtn.dataset.slot;
      const armoryIndex = armoryEquipBtn.dataset.armoryIdx !== '' && armoryEquipBtn.dataset.armoryIdx !== undefined ? parseInt(armoryEquipBtn.dataset.armoryIdx, 10) : null;
      const soldierIndex = parseInt(armoryEquipBtn.dataset.soldierIdx, 10);

      const res = gameState.equipSoldierFromDepot(soldierIndex, { source, slotKey, armoryIndex });
      if (res.success) {
        showToast(res.message, 'success');
        sound.playRepair();
        if (dom.modalTitle && dom.modalTitle.innerText.includes('KISLA')) {
          openBarracksModal();
        } else {
          openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
        }
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Cephanelik: Eşyayı Askerden Çıkar & Depoya Aktar
    const unequipSlotBtn = e.target.closest('.btn-unequip-soldier-slot');
    if (unequipSlotBtn) {
      const soldierIndex = parseInt(unequipSlotBtn.dataset.soldierIdx, 10);
      const slotKey = unequipSlotBtn.dataset.slot;
      const res = gameState.unequipSoldierToArmory(soldierIndex, slotKey);
      if (res.success) {
        showToast(res.message, 'success');
        sound.playRepair();
        if (dom.modalTitle && dom.modalTitle.innerText.includes('KISLA')) {
          openBarracksModal();
        } else {
          openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
        }
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Cephanelik: Tek Tıkla Tüm Krallık & Ordu Teçhizatını Onar
    if (e.target.closest('.btn-armory-repair-all')) {
      const res = gameState.repairAllEquipmentInKingdom();
      if (res.success) {
        showToast(res.message, 'success');
        sound.playPickaxe();
        openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Demirci: Kategori Filtresi (.btn-bs-cat-filter)
    const bsCatBtn = e.target.closest('.btn-bs-cat-filter');
    if (bsCatBtn) {
      window.blacksmithCategoryFilter = bsCatBtn.dataset.cat;
      openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      return;
    }

    // Demirci: Toplu Tüm Eşyaları Geliştir (.btn-armory-upgrade-all)
    if (e.target.closest('.btn-armory-upgrade-all')) {
      const res = gameState.upgradeAllEquipmentInKingdom();
      if (res.success) {
        showToast(res.message, 'success');
        sound.playLevelUp();
        openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      } else {
        showToast(res.message, 'warning');
      }
      renderTopBar();
      return;
    }

    // Demirci: Özelleştirilmiş Hızlı Geliştirme Kısayolu (.btn-custom-upgrade-shortcut)
    const customUpShortcut = e.target.closest('.btn-custom-upgrade-shortcut');
    if (customUpShortcut) {
      const slot = customUpShortcut.dataset.slot;
      const level = parseInt(customUpShortcut.dataset.level, 10);
      const res = gameState.upgradeEquipmentByTypeAndLevel(slot, level);
      if (res.success) {
        showToast(res.message, 'success');
        sound.playLevelUp();
        openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      } else {
        showToast(res.message, 'warning');
      }
      renderTopBar();
      return;
    }

    // Demirci: Özel Seçici ile Grubu Geliştir (.btn-trigger-custom-upgrade)
    if (e.target.closest('.btn-trigger-custom-upgrade')) {
      const slotSelect = dom.modalBody.querySelector('#custom-up-slot');
      const levelSelect = dom.modalBody.querySelector('#custom-up-level');
      const slot = slotSelect ? slotSelect.value : 'weapon';
      const level = levelSelect ? parseInt(levelSelect.value, 10) : 1;
      const res = gameState.upgradeEquipmentByTypeAndLevel(slot, level);
      if (res.success) {
        showToast(res.message, 'success');
        sound.playLevelUp();
        openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      } else {
        showToast(res.message, 'warning');
      }
      renderTopBar();
      return;
    }

    // Demirci: Ekipmanı Yeniden Dövme / Onarım (Reforge to 13/13)
    const equipReforgeBtn = e.target.closest('.btn-reforge-equipment');
    if (equipReforgeBtn) {
      const slotKey = equipReforgeBtn.dataset.slot;
      const res = gameState.repairEquipment(slotKey);
      if (res.success) {
        showToast(res.message, 'success');
        sound.playPickaxe();
        openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Demirci: Ekipman Seviye Yükseltme (Upgrade Lv+1)
    const equipUpgradeBtn = e.target.closest('.btn-upgrade-equipment');
    if (equipUpgradeBtn) {
      const slotKey = equipUpgradeBtn.dataset.slot;
      const res = gameState.upgradeEquipment(slotKey);
      if (res.success) {
        showToast(res.message, 'success');
        sound.playLevelUp();
        openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Kışla Tek Tip Asker Satın Alma
    if (e.target.closest('#btn-buy-soldier-unit')) {
      const res = gameState.buySoldierUnit();
      if (res.success) {
        showToast(res.message, 'success');
        openBarracksModal();
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Taverna Güçlendirme Satın Alma
    const buyBuffBtn = e.target.closest('.btn-modal-buybuff');
    if (buyBuffBtn) {
      const buffId = buyBuffBtn.dataset.buff;
      const res = gameState.buyTavernBuff(buffId);
      if (res.success) {
        showToast(res.message, 'success');
        openTownZoneModal('tavern', '🍺 Taverna & Han');
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Taverna: 24 Saatlik Otomasyon & Tamir Botu Başlat/Uzat (#btn-buy-taverna-bot)
    if (e.target.closest('#btn-start-bot-trial')) {
      const res = gameState.startBotTrial();
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) openTownZoneModal('tavern', '🍺 Taverna & Han');
      renderTopBar();
      return;
    }
    const botPkgBtn = e.target.closest('.btn-buy-bot-package');
    if (botPkgBtn) {
      const chkRenew = document.getElementById('chk-bot-auto-renew');
      if (chkRenew) {
        gameState.setBotAutoRenew24h(chkRenew.checked);
      }
      const siloOpt = document.querySelector('input[name="bot_silo_opt"]:checked');
      if (siloOpt) {
        gameState.setBotSiloOption(siloOpt.value === 'upgrade');
      }
      const res = gameState.buyTavernaAutomationBot(false, Number(botPkgBtn.dataset.hours) || 24);
      if (res.success) {
        showToast(res.message, 'success');
        if (typeof sound !== 'undefined' && sound.playLevelUp) sound.playLevelUp();
        openTownZoneModal('tavern', '🍺 Taverna & Han');
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Taverna: Canlı Boş Seferleri Başlat Konsol Butonu (#btn-trigger-bot-cycle)
    if (e.target.closest('#btn-trigger-bot-cycle')) {
      const res = gameState.runTavernaAutomationCycle();
      showToast('🚀 Otonom seferler ve tamir döngüsü hemen tetiklendi!', 'success');
      renderTopBar();
      openTownZoneModal('tavern', '🍺 Taverna & Han');
      return;
    }

    // Karnaval: Sekme Geçişi (.carnival-tab-btn)
    const carnTabBtn = e.target.closest('.carnival-tab-btn');
    if (carnTabBtn) {
      const tab = carnTabBtn.dataset.carnivalTab;
      openCarnivalModal(tab);
      return;
    }

    // Karnaval: 14 Ödüllü Şans Çarkını Çevir (.btn-spin-wheel)
    const spinWheelBtn = e.target.closest('.btn-spin-wheel');
    if (spinWheelBtn) {
      const payMethod = spinWheelBtn.dataset.pay;
      spinCarnivalWheelAnimated(payMethod);
      return;
    }

    // Karnaval: Piyango Bilet Satın Al (#btn-buy-lottery-action)
    if (e.target.closest('#btn-buy-lottery-action')) {
      const countInput = dom.modalBody.querySelector('#lottery-ticket-count');
      const count = countInput ? parseInt(countInput.value, 10) || 1 : 1;
      const res = gameState.buyLotteryTickets(count);
      if (res.success) {
        showToast(res.message, 'success');
        sound.playHarvest();
        openCarnivalModal('lottery');
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Karnaval: Talihli Biletlerini Yak & 2 Katı ASTRA Kasadan Çek (#btn-claim-winner-lottery)
    if (e.target.closest('#btn-claim-winner-lottery')) {
      const res = gameState.claimWinnerLotteryPayout();
      if (res.success) {
        showToast(res.message, 'success');
        sound.playLevelUp();
        openCarnivalModal('lottery');
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Karnaval Hazine & Havuzlar Sekmesinden İlgili Alanlara Hızlı Geçiş (.btn-eco-pool-jump)
    const ecoPoolJumpBtn = e.target.closest('.btn-eco-pool-jump');
    if (ecoPoolJumpBtn) {
      const act = ecoPoolJumpBtn.dataset.action;
      if (act === 'dungeon') {
        closeModal();
        enterDungeonScene();
      } else if (act === 'colosseum') {
        openColosseumModal();
      } else if (act === 'boss') {
        // Kışla'nın yeni arayüzünde (v1.32) ayrı "Dünya Bossu" sekmesi yok; eskiden burada olmayan bir
        // renderBarracksContent() çağrılıyordu (ReferenceError). Kışla açılır, yeterli.
        openTownZoneModal('barracks', '⚔️ KRALLIK KIŞLASI & ASKERİ KARARGAH');
      } else if (act === 'market') {
        openTownZoneModal('market', '🏪 AMM Pazar Alanı');
      } else if (act === 'carnival_wheel') {
        openCarnivalModal('wheel');
      } else if (act === 'lottery') {
        openCarnivalModal('lottery');
      } else if (act === 'quests') {
        closeModal();
        guideExpanded = true;
        renderGuideWidget();
      }
      return;
    }

    // Karnaval Moral Bonusu
    if (e.target.closest('#btn-carnival-cheer')) {
      const cheer = gameState.carnivalCheer();
      if (cheer.success) sound.playLevelUp();
      showToast(cheer.message, cheer.success ? 'success' : 'info');
      closeModal();
      renderTopBar();
      return;
    }

    // Zindan Mağarasına Gir
    if (e.target.closest('#btn-modal-enter-dungeon')) {
      enterDungeonScene();
      return;
    }

    // Ekonomi Paneli: Sekme Geçişi
    const economyTabBtn = e.target.closest('.economy-tab-btn');
    if (economyTabBtn) {
      openEconomyDashboardModal(economyTabBtn.dataset.tab);
      return;
    }

    // Ekonomi Simülatörü: Çalıştır Butonu
    if (e.target.closest('#btn-run-simulation')) {
      const pInput = dom.modalBody.querySelector('#sim-input-players');
      const dInput = dom.modalBody.querySelector('#sim-input-days');
      if (pInput) simPlayerCount = Math.max(10, parseInt(pInput.value, 10) || 500);
      if (dInput) simDays = parseInt(dInput.value, 10) || 30;
      simResults = globalPool.simulateMacroEconomy(simPlayerCount, simDays);
      sound.playLevelUp();
      showToast(`📊 ${simPlayerCount} aktif oyuncu ile ${simDays} günlük simülasyon hesaplandı!`, 'success');
      openEconomyDashboardModal('simulator');
      return;
    }


    // Kolezyum: Sekme Geçişi (1v1 Düello / Liderlik Tablosu)
    const colosseumTabBtn = e.target.closest('.colosseum-tab-btn');
    if (colosseumTabBtn) {
      colosseumActiveTab = colosseumTabBtn.dataset.tab;
      openColosseumModal();
      return;
    }

    // AMM Pazar: Sekme Geçişi (Hammadde / Parça Ticareti / Buyback)
    const marketTabBtn = e.target.closest('.market-tab-btn');
    if (marketTabBtn) {
      marketActiveTab = marketTabBtn.dataset.tab;
      openTownZoneModal('market', '🏪 AMM Pazar Alanı');
      return;
    }

    // 🛡️ AMM Hazine Otonom Buyback & Yakım Çalıştır
    if (e.target.closest('#btn-run-amm-buyback')) {
      const res = gameState.executeAmmTreasuryBuyback(0.10);
      if (res.success) {
        sound.playLevelUp();
        showToast(res.message, 'success');
        openTownZoneModal('market', '🏪 AMM Pazar Alanı');
      } else {
        showToast(res.message || 'Hazine müdahalesi gerekmiyor.', 'info');
      }
      renderTopBar();
      return;
    }

    // Demirci / Tamirhane: Sekme Geçişi
    const mineTabBtn = e.target.closest('.mine-tab-btn');
    if (mineTabBtn) {
      mineActiveTab = mineTabBtn.dataset.tab;
      openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      return;
    }

    // Kışla: Sekme Geçişi (Ordu Yönetimi / Akıllı Silah Deposu)
    const barracksTabBtn = e.target.closest('.barracks-tab-btn');
    if (barracksTabBtn) {
      barracksActiveTab = barracksTabBtn.dataset.tab;
      openBarracksModal();
      return;
    }

    // World Boss: Ordu Kilitleme (Stake)
    if (e.target.closest('#btn-stake-army-boss')) {
      const res = gameState.stakeArmyForWorldBoss();
      if (res.success) {
        showToast(res.message, 'success');
        openBattlefieldModal();
      } else {
        showToast(res.message, 'error');
      }
      return;
    }

    // World Boss: %18 Ceza ile Erken Çekilme (Emergency Unstake)
    if (e.target.closest('#btn-emergency-unstake-boss')) {
      const res = gameState.emergencyUnstakeWorldBossArmy();
      if (res.success) {
        showToast(res.message, 'success');
        openBattlefieldModal();
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // World Boss: Hak Edilen Ödülü Topla (Claim)
    if (e.target.closest('#btn-claim-world-boss-reward')) {
      const res = gameState.claimWorldBossReward();
      if (res.success) {
        showToast(res.message, 'success');
        openBattlefieldModal();
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // World Boss: Pazar 18:00 Savaşını Simüle Et — YALNIZCA geliştirici paneli (F-03)
    if (e.target.closest('#btn-dev-simulate-sunday-boss')) {
      const res = gameState.executeSundayAutoWorldBossBattle({ force: true });
      if (res.success) {
        showToast(res.message, 'success');
        openBattlefieldModal();
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Depo & Silo Yükseltme
    if (e.target.closest('#btn-modal-upgrade-warehouse')) {
      const res = gameState.upgradeWarehouse();
      if (res.success) {
        showToast(res.message, 'success');
        sound.playLevelUp();
        openWarehouseModal();
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Ekipman Onarımı (Asker Slotu & Krallık Tamirhanesi)
    const equipRepairBtn = e.target.closest('.btn-equip-repair');
    if (equipRepairBtn) {
      const slot = equipRepairBtn.dataset.slot;
      const sIdx = equipRepairBtn.dataset.soldierIdx !== '' && equipRepairBtn.dataset.soldierIdx !== undefined ? parseInt(equipRepairBtn.dataset.soldierIdx, 10) : null;
      const res = gameState.repairEquipment(slot, sIdx);
      if (res.success) {
        showToast(res.message, 'success');
        openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    const soldierRepairBtn = e.target.closest('.btn-soldier-repair-slot') || e.target.closest('.btn-repair-equipment');
    if (soldierRepairBtn) {
      const sIdx = parseInt(soldierRepairBtn.dataset.soldierIdx || soldierRepairBtn.dataset.soldierIndex, 10);
      const slot = soldierRepairBtn.dataset.slot;
      const res = gameState.repairEquipment(slot, sIdx);
      if (res.success) {
        showToast(res.message, 'success');
        openBarracksModal();
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Depo Yükseltme
    if (e.target.closest('#btn-modal-upgrade-warehouse')) {
      const res = gameState.upgradeWarehouse();
      if (res.success) {
        showToast(res.message, 'success');
        openInventoryModal();
      } else {
        showToast(res.message, 'error');
      }
      renderTopBar();
      return;
    }

    // Koleksiyon: Sekme Geçişi (Koleksiyon / Kilitli Kutular)
    const collectionTabBtn = e.target.closest('.collection-tab-btn');
    if (collectionTabBtn) {
      collectionActiveTab = collectionTabBtn.dataset.tab;
      lastBoxResult = null;
      openCollectionModal();
      return;
    }

    // Genesis NFT Basımı
    if (e.target.closest('#btn-mint-genesis')) {
      const res = gameState.mintGenesisNft();
      if (res.success) {
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'error');
      }
      openCollectionModal();
      renderTopBar();
      return;
    }

    // Pandora Kutusu Açma (1 Arena Anahtarı Karşılığında)
    if (e.target.closest('#btn-open-mystery-box')) {
      const st = gameState.state;
      if ((st.lockedBoxes || 0) <= 0) {
        showToast('Açılacak Pandora Kutun yok!', 'error');
        return;
      }
      if ((st.arenaKeys || 0) <= 0) {
        showToast('🔑 Pandora Kutusu açmak için en az 1 Anahtar gerekir! (Anahtarlar yalnızca Kolezyum derecesinden, Şans Çarkından veya AMM Pazarından temin edilebilir)', 'error');
        return;
      }
      const res = await gameState.unboxMysteryBox();
      if (res.success) {
        gameState.saveState();
        lastBoxResult = res;
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'error');
      }
      openCollectionModal();
      renderTopBar();
      return;
    }
  });

  // AMM Pazar İnteraktif Tahmini Fiyat Hesaplama Girdileri (Canlı Güncelleme)
  dom.modalBody.addEventListener('input', (e) => {
    // AMM Satın Al Adet Girdisi Değişimi
    const buyInput = e.target.closest('.amm-buy-qty');
    if (buyInput) {
      const resKey = buyInput.dataset.res;
      const qty = parseFloat(buyInput.value) || 0;
      const costEl = dom.modalBody.querySelector(`.amm-est-cost-text[data-res="${resKey}"]`);
      if (costEl) {
        if (qty <= 0) {
          costEl.innerText = '~0.00 ASTRA';
        } else {
          const cost = ammMarket.getEstimatedCostForBuy(resKey, qty);
          costEl.innerText = isFinite(cost) ? `~${cost.toFixed(2)} ASTRA` : 'Yetersiz Likidite';
        }
      }
      return;
    }

    // AMM Satış Adet Girdisi Değişimi
    const sellInput = e.target.closest('.amm-sell-qty');
    if (sellInput) {
      const resKey = sellInput.dataset.res;
      const qty = parseFloat(sellInput.value) || 0;
      const gainEl = dom.modalBody.querySelector(`.amm-est-gain-text[data-res="${resKey}"]`);
      if (gainEl) {
        if (qty <= 0) {
          gainEl.innerText = '~0.00 ASTRA';
        } else {
          const gain = ammMarket.getEstimatedAdAstraForSell(resKey, qty);
          gainEl.innerText = `~${gain.toFixed(2)} ASTRA`;
        }
      }
      return;
    }
  });

  // Modal İçi Seçim Değişiklikleri (Demirci Sıralaması & Taverna Bot Silo Tercihi)
  dom.modalBody.addEventListener('change', (e) => {
    // Demirci Çantam Sıralama Değişimi
    if (e.target && e.target.id === 'select-bs-sort') {
      window.blacksmithSortFilter = e.target.value;
      openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
      return;
    }

    // Taverna 24s Bot Silo Doluluk Seçeneği Değişimi
    if (e.target && e.target.name === 'bot_silo_opt') {
      const autoUpgrade = e.target.value === 'upgrade';
      gameState.setBotSiloOption(autoUpgrade);
      showToast(autoUpgrade ? '🤖 Bot: Silo dolunca otomatik yükseltme modu seçildi.' : '🤖 Bot: Silo dolunca Akıllı Satış modu (Döngü Kazancı + %5 Güvenlik Marjı) seçildi.', 'info');
      return;
    }

    // Taverna 24s Bot Otomatik Yenileme Seçeneği Değişimi
    if (e.target && e.target.id === 'chk-bot-auto-renew') {
      const isAutoRenew = !!e.target.checked;
      gameState.setBotAutoRenew24h(isAutoRenew);
      if (isAutoRenew) {
        showToast('🔄 24 saat bitince hesapta yeterli ASTRA varsa bot otomatik olarak tekrar satın alınıp devam edecek.', 'success');
      } else {
        showToast('⏸️ 24 saat bitince bot otomatik yenilemesi kapatıldı.', 'info');
      }
      return;
    }
  });

  if (dom.btnAudioToggle) {
    dom.btnAudioToggle.addEventListener('click', () => {
      sound.isMuted = !sound.isMuted;
      dom.btnAudioToggle.innerText = sound.isMuted ? '🔇' : '🔊';
      if (!sound.isMuted) sound.playLevelUp();
    });
  }
}

// =========================================================================
// 🧪 GELİŞTİRİCİ & HIZLI TEST PANELİ (DEV CHEAT ENGINE)
// =========================================================================
function syncDevLiveInputs() {
  const st = gameState.state;
  const inv = st.inventory || {};
  
  const elWood = document.getElementById('dev-live-wood');
  const elIron = document.getElementById('dev-live-iron');
  const elWheat = document.getElementById('dev-live-wheat');
  const elFrag = document.getElementById('dev-live-fragments');
  const elAda = document.getElementById('dev-live-adastra');
  const elStam = document.getElementById('dev-live-stamina');
  const elLvl = document.getElementById('dev-live-level');

  if (elWood) elWood.value = inv.wood || 0;
  if (elIron) elIron.value = inv.iron || 0;
  if (elWheat) elWheat.value = inv.wheat || 0;
  for (const k of ['stone', 'coal', 'herb']) { const el = document.getElementById('dev-live-' + k); if (el) el.value = inv[k] || 0; }
  if (elFrag) elFrag.value = inv.fragments || 0;
  if (elAda) elAda.value = Math.floor(st.adAstraBalance || 0);
  if (elStam) elStam.value = Math.floor(st.stamina || 0);
  if (elLvl) elLvl.value = st.level || 1;
}
window.updateDevLiveInputs = syncDevLiveInputs;

function openDevModal() {
  const modal = document.getElementById('dev-modal');
  if (modal) {
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    syncDevLiveInputs();
  }
}

function closeDevModal() {
  const modal = document.getElementById('dev-modal');
  if (modal) modal.classList.add('hidden');
  const isRpgOpen = dom.rpgModal && dom.rpgModal.classList.contains('active');
  if (!isRpgOpen) {
    document.body.classList.remove('modal-open');
  }
}

// Test paneli olayları yalnızca bir kez bağlanır. (Önceden iki kez bağlandığı için her test
// düğmesi iki kez çalışıyordu: +6 saat ileri sarma botun süresinden 12 saat düşüyordu.)
let devPanelEventsBound = false;
function initDevPanelEvents() {
  if (devPanelEventsBound) return;
  devPanelEventsBound = true;
  const btnToggle = document.getElementById('btn-dev-panel-toggle');
  const btnClose = document.getElementById('btn-close-dev-modal');
  const modal = document.getElementById('dev-modal');

  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      openDevModal();
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      closeDevModal();
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeDevModal();
    });
  }

  // Klavye Kısayolu: 'T' tuşuna basınca Test Panelini Aç/Kapat
  window.addEventListener('keydown', (e) => {
    if (DEV_TOOLS && (e.key === 't' || e.key === 'T')) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (modal) {
        if (modal.classList.contains('hidden')) openDevModal();
        else closeDevModal();
      }
    }
  });

  // 1. ÖZEL DEĞER AYARLAMA BUTONLARI (CUSTOM INJECTOR)
  const btnCustomAdd = document.getElementById('btn-dev-custom-add');
  const btnCustomSub = document.getElementById('btn-dev-custom-sub');
  const btnCustomSet = document.getElementById('btn-dev-custom-set');
  const btnCustomZero = document.getElementById('btn-dev-custom-zero');
  const selectTarget = document.getElementById('dev-select-target');
  const inputCustomVal = document.getElementById('dev-input-custom-val');

  function applyCustomAction(mode) {
    if (!selectTarget || !inputCustomVal) return;
    const target = selectTarget.value;
    const val = parseFloat(inputCustomVal.value) || 0;

    let msg = '';
    if (RES_KEYS().includes(target) || target === 'fragments') {
      const cur = gameState.state.inventory[target] || 0;
      if (mode === 'add') {
        gameState.addDevResource(target, val);
        msg = `🌲 ${target.toUpperCase()}: +${val.toLocaleString()} eklendi! (Yeni: ${gameState.state.inventory[target].toLocaleString()})`;
      } else if (mode === 'sub') {
        gameState.addDevResource(target, -val);
        msg = `🔻 ${target.toUpperCase()}: -${val.toLocaleString()} çıkarıldı! (Kalan: ${gameState.state.inventory[target].toLocaleString()})`;
      } else if (mode === 'set') {
        gameState.setDevResource(target, val);
        msg = `🎯 ${target.toUpperCase()}: Değer ${val.toLocaleString()} yapıldı!`;
      } else if (mode === 'zero') {
        gameState.setDevResource(target, 0);
        msg = `🗑️ ${target.toUpperCase()} sıfırlandı!`;
      }
    } else if (target === 'adAstra') {
      if (mode === 'add') {
        gameState.addDevAdAstra(val);
        msg = `🟣 ASTRA: +${val.toLocaleString()} eklendi!`;
      } else if (mode === 'sub') {
        gameState.addDevAdAstra(-val);
        msg = `🔻 ASTRA: -${val.toLocaleString()} çıkarıldı!`;
      } else if (mode === 'set') {
        gameState.setDevAdAstra(val);
        msg = `🎯 ASTRA: Değer ${val.toLocaleString()} yapıldı!`;
      } else if (mode === 'zero') {
        gameState.setDevAdAstra(0);
        msg = `🗑️ ASTRA sıfırlandı!`;
      }
    } else if (target === 'stamina') {
      const maxStam = gameState.getMaxStamina();
      if (mode === 'zero') gameState.state.stamina = 0;
      else if (mode === 'set') gameState.state.stamina = Math.min(maxStam, Math.max(0, val));
      else if (mode === 'add') gameState.state.stamina = Math.min(maxStam, Math.max(0, (gameState.state.stamina || 0) + val));
      else if (mode === 'sub') gameState.state.stamina = Math.min(maxStam, Math.max(0, (gameState.state.stamina || 0) - val));
      gameState.saveState();
      msg = `⚡ Stamina: ${Math.floor(gameState.state.stamina)}/${maxStam} yapıldı!`;
    } else if (target === 'level') {
      const targetLvl = mode === 'zero' ? 1 : Math.max(1, Math.min(81, val));
      gameState.setDevLevel(targetLvl);
      msg = `👑 Seviye ${targetLvl} olarak ayarlandı!`;
    } else if (target === 'arenaKeys') {
      if (mode === 'zero') gameState.state.arenaKeys = 0;
      else if (mode === 'set') gameState.state.arenaKeys = Math.max(0, val);
      else if (mode === 'add') gameState.state.arenaKeys = Math.max(0, (gameState.state.arenaKeys || 0) + val);
      else if (mode === 'sub') gameState.state.arenaKeys = Math.max(0, (gameState.state.arenaKeys || 0) - val);
      gameState.saveState();
      msg = `🗝️ Arena Anahtarı: ${gameState.state.arenaKeys} yapıldı!`;
    } else if (target === 'lockedBoxes') {
      if (mode === 'zero') gameState.state.lockedBoxes = 0;
      else if (mode === 'set') gameState.state.lockedBoxes = Math.max(0, val);
      else if (mode === 'add') gameState.state.lockedBoxes = Math.max(0, (gameState.state.lockedBoxes || 0) + val);
      else if (mode === 'sub') gameState.state.lockedBoxes = Math.max(0, (gameState.state.lockedBoxes || 0) - val);
      gameState.saveState();
      msg = `📦 Pandora Kutusu: ${gameState.state.lockedBoxes} yapıldı!`;
    } else if (target === 'dungeon') {
      const dLvl = mode === 'zero' ? 1 : Math.max(1, Math.min(18, val));
      gameState.setDungeonProgress(dLvl);
      msg = `💀 Zindan Kat Seviyesi ${dLvl} yapıldı!`;
    }

    showToast(msg, 'success');
    sound.playLevelUp();
    syncDevLiveInputs();
    renderTopBar();
  }

  if (btnCustomAdd) btnCustomAdd.addEventListener('click', () => applyCustomAction('add'));
  if (btnCustomSub) btnCustomSub.addEventListener('click', () => applyCustomAction('sub'));
  if (btnCustomSet) btnCustomSet.addEventListener('click', () => applyCustomAction('set'));
  if (btnCustomZero) btnCustomZero.addEventListener('click', () => applyCustomAction('zero'));

  // 2. CANLI TABLO İNTERAKTİF GİRDİLERİ
  const bindLiveInput = (id, setter) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        const val = parseFloat(el.value) || 0;
        setter(val);
        showToast('🎯 Değer güncellendi!', 'success');
        syncDevLiveInputs();
        renderTopBar();
      });
    }
  };

  bindLiveInput('dev-live-wood', v => gameState.setDevResource('wood', v));
  bindLiveInput('dev-live-iron', v => gameState.setDevResource('iron', v));
  bindLiveInput('dev-live-wheat', v => gameState.setDevResource('wheat', v));
  for (const k of ['stone', 'coal', 'herb']) bindLiveInput(`dev-live-${k}`, v => gameState.setDevResource(k, v));
  bindLiveInput('dev-live-fragments', v => gameState.setDevResource('fragments', v));
  bindLiveInput('dev-live-adastra', v => gameState.setDevAdAstra(v));
  bindLiveInput('dev-live-stamina', v => { gameState.state.stamina = Math.min(gameState.getMaxStamina(), Math.max(0, v)); gameState.saveState(); });
  bindLiveInput('dev-live-level', v => gameState.setDevLevel(Math.min(81, Math.max(1, v))));

  // 3. CANLI TABLO HIZLI BUTONLARI (QUICK BUTTONS)
  document.addEventListener('click', (e) => {
    // Quick delta (+/-)
    const quickBtn = e.target.closest('[data-dev-quick]');
    if (quickBtn) {
      const res = quickBtn.getAttribute('data-dev-quick');
      const delta = parseFloat(quickBtn.getAttribute('data-delta')) || 0;
      if (res === 'adAstra') gameState.addDevAdAstra(delta);
      else gameState.addDevResource(res, delta);
      showToast(`${delta > 0 ? '+' : ''}${delta.toLocaleString()} ${res} uygulandı!`, 'success');
      sound.playHarvest();
      syncDevLiveInputs();
      renderTopBar();
      return;
    }

    // Quick zero (sıfırla)
    const zeroBtn = e.target.closest('[data-dev-quick-zero]');
    if (zeroBtn) {
      const res = zeroBtn.getAttribute('data-dev-quick-zero');
      if (res === 'adAstra') gameState.setDevAdAstra(0);
      else gameState.setDevResource(res, 0);
      showToast(`🗑️ ${res} sıfırlandı!`, 'info');
      syncDevLiveInputs();
      renderTopBar();
      return;
    }

    // Exact set
    const setBtn = e.target.closest('[data-dev-set-exact]');
    if (setBtn) {
      const field = setBtn.getAttribute('data-dev-set-exact');
      const val = parseFloat(setBtn.getAttribute('data-val')) || 0;
      if (field === 'stamina') {
        const maxStam = gameState.getMaxStamina();
        gameState.state.stamina = Math.min(maxStam, Math.max(0, val));
        gameState.saveState();
        showToast(`⚡ Stamina: ${Math.min(val, maxStam)}/${maxStam} yapıldı!`, 'success');
      } else if (field === 'level') {
        gameState.setDevLevel(val);
        showToast(`👑 Seviye ${val} yapıldı!`, 'success');
      }
      sound.playLevelUp();
      syncDevLiveInputs();
      renderTopBar();
      return;
    }

    // Preset dev actions
    const btn = e.target.closest('[data-dev-action]');
    if (!btn) return;

    const action = btn.getAttribute('data-dev-action');
    const amount = parseInt(btn.getAttribute('data-amount'), 10) || 0;
    const hours = parseInt(btn.getAttribute('data-hours'), 10) || 0;
    const level = parseInt(btn.getAttribute('data-level'), 10) || 0;

    switch (action) {
      case 'add-wood':
        gameState.addDevResource('wood', amount);
        showToast(`🌲 +${amount.toLocaleString()} Odun eklendi!`, 'success');
        sound.playHarvest();
        break;

      case 'add-iron':
        gameState.addDevResource('iron', amount);
        showToast(`⛏️ +${amount.toLocaleString()} Demir eklendi!`, 'success');
        sound.playPickaxe();
        break;

      case 'add-wheat':
        gameState.addDevResource('wheat', amount);
        showToast(`🌾 +${amount.toLocaleString()} Buğday eklendi!`, 'success');
        sound.playHarvest();
        break;

      case 'add-stone': case 'add-coal': case 'add-herb': {
        const rk = action.slice(4); const mm = RES_META()[rk] || {};
        gameState.addDevResource(rk, amount);
        showToast(`${mm.icon || ''} +${amount.toLocaleString()} ${mm.name || rk} eklendi!`, 'success');
        sound.playHarvest();
        break;
      }

      case 'add-fragments':
        gameState.addDevResource('fragments', amount);
        showToast(`🧩 +${amount.toLocaleString()} Teçhizat Parçaları eklendi!`, 'success');
        sound.playLevelUp();
        break;

      case 'add-adastra':
        gameState.addDevAdAstra(amount);
        showToast(`🟣 +${amount.toLocaleString()} ASTRA bakiyene eklendi!`, 'success');
        sound.playLevelUp();
        break;

      case 'add-keys':
        gameState.addArenaKey(amount);
        showToast(`🗝️ +${amount} Arena Anahtarı eklendi!`, 'success');
        sound.playLevelUp();
        break;

      case 'add-boxes':
        gameState.state.lockedBoxes = (gameState.state.lockedBoxes || 0) + amount;
        gameState.saveState();
        showToast(`📦 +${amount} Pandora Kutusu eklendi!`, 'success');
        sound.playLevelUp();
        break;

      case 'fast-forward': {
        const report = gameState.fastForwardTime(hours);
        if (typeof syncDevLiveInputs === 'function') syncDevLiveInputs();
        renderTopBar();
        if (typeof refreshLiveUpgradeCostUI === 'function') refreshLiveUpgradeCostUI(0);
        const modalContainer = document.getElementById('clean-modal');
        if (modalContainer && !modalContainer.classList.contains('hidden')) {
          if (dom.modalTitle && dom.modalTitle.innerText.includes('TAVERNA')) {
            openTownZoneModal('tavern', '🍺 Taverna & Han');
          } else if (dom.modalTitle && dom.modalTitle.innerText.includes('DASHBOARD')) {
            openDashboardModal();
          }
        }

        // Test konsolundaki canlı sonuç paneline yazdır
        const resBox = document.getElementById('dev-time-result-container');
        if (resBox) {
          const statusMap = {
            ran: '<span style="color:#4ade80; font-weight:800;">🟢 Aktif Çalıştı</span>',
            paused: '<span style="color:#facc15; font-weight:800;">⏸️ Donduruldu</span>',
            expired: '<span style="color:#f87171; font-weight:800;">⏳ Süre Doldu</span>',
            inactive: '<span style="color:#94a3b8; font-weight:800;">⚪ Bot Yok / Pasif</span>'
          };
          resBox.style.display = 'block';
          resBox.innerHTML = `
            <div style="font-weight:800; color:#38bdf8; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(56,189,248,0.2); padding-bottom:6px;">
              <span>⏩ +${report.hours} Saat Zaman Atlama & Bot Simülasyon Raporu</span>
              <span style="font-size:0.75rem; color:#94a3b8;">${new Date().toLocaleTimeString()}</span>
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:6px; margin-bottom:8px;">
              <div style="background:rgba(255,255,255,0.04); padding:6px 8px; border-radius:6px; border-left:3px solid #38bdf8;">
                <div style="color:#94a3b8; font-size:0.72rem;">🤖 Bot Durumu:</div>
                <div style="font-size:0.85rem;">${statusMap[report.botExecutionStatus] || 'Bilinmiyor'}</div>
              </div>
              <div style="background:rgba(255,255,255,0.04); padding:6px 8px; border-radius:6px; border-left:3px solid #22c55e;">
                <div style="color:#94a3b8; font-size:0.72rem;">🔄 Tamamlanan Sefer:</div>
                <div style="font-weight:700; color:#fff; font-size:0.85rem;">${report.totalExpeditionsClaimed} Sefer</div>
              </div>
              <div style="background:rgba(255,255,255,0.04); padding:6px 8px; border-radius:6px; border-left:3px solid #facc15;">
                <div style="color:#94a3b8; font-size:0.72rem;">⏱️ Kalan Bot Süresi:</div>
                <div style="font-weight:700; color:#fde047; font-size:0.85rem;">${report.botRemainingText}</div>
              </div>
            </div>
            <div style="background:rgba(255,255,255,0.03); padding:8px; border-radius:6px; margin-bottom:6px;">
              <div style="color:#94a3b8; font-size:0.75rem; margin-bottom:4px;">🌾 Net Toplanan Mahsuller & Kasa Hareketi:</div>
              <div style="display:flex; gap:12px; flex-wrap:wrap; font-weight:700; font-size:0.85rem;">
                <span style="color:#4ade80;">🌲 +${report.woodGain.toLocaleString()} Odun</span>
                <span style="color:#38bdf8;">⛏️ +${report.ironGain.toLocaleString()} Demir</span>
                <span style="color:#facc15;">🌾 +${report.wheatGain.toLocaleString()} Buğday</span>
                <span style="color:#c084fc;">🪙 ${report.adaDiff >= 0 ? '+' : ''}${report.adaDiff.toFixed(1)} ASTRA</span>
                <span style="color:#60a5fa;">✨ +${(report.xpGain || 0).toLocaleString()} XP</span>
              </div>
            </div>
            ${report.warehouseUpgraded ? `<div style="color:#22c55e; font-weight:700; font-size:0.78rem; margin-bottom:4px;">🏰 Silo bu sürede otomatik olarak Seviye ${report.currentWarehouseLevel}'e yükseltildi!</div>` : ''}
            ${report.botExecutionStatus === 'paused' ? `<div style="color:#facc15; font-size:0.75rem;">⚠️ Eksik kaynaklar (<code>${report.missingText}</code>) nedeniyle bot donduruldu, bot süreniz harcanmadı.</div>` : ''}
          `;
        }

        if (report.botExecutionStatus === 'ran') {
          showToast(`⏩ +${hours}s İleri Sarıldı: Bot ${report.totalExpeditionsClaimed} sefer tamamladı! (+${report.woodGain}🌲, +${report.ironGain}⛏️, +${report.wheatGain}🌾, +${report.xpGain || 0}✨ XP)`, 'success');
        } else if (report.botExecutionStatus === 'paused') {
          showToast(`⏸️ +${hours}s İleri Sarıldı: Eksik kaynaklar nedeniyle bot dondurulmuş durumda kaldı.`, 'warning');
        } else {
          showToast(`⏩ Zaman ${hours} saat ileri sarıldı! (+${report.xpGain || 0}✨ XP)`, 'success');
        }

        sound.playLevelUp();
        break;
      }

      case 'complete-expeditions':
        gameState.completeAllExpeditionsNow();
        renderTopBar();
        showToast(`⚡ Tüm aktif işçi seferleri anında tamamlandı!`, 'success');
        sound.playLevelUp();
        break;

      case 'claim-expeditions': {
        const claims = gameState.claimAllCompletedExpeditions();
        if (claims && claims.length > 0) {
          const totalEarnedXp = claims.reduce((sum, c) => sum + (c.xpGained || 0), 0);
          showToast(`🎁 ${claims.length} adet tamamlanan sefer toplandı! (+${totalEarnedXp} XP)`, 'success');
        } else {
          showToast(`⚠️ Toplanacak tamamlanmış sefer bulunamadı.`, 'info');
        }
        renderTopBar();
        break;
      }

      case 'reset-daily-limits':
        globalPool.resetEpoch();
        showToast(`📊 Küresel günlük kaynak limitleri ve havuzlar yenilendi!`, 'success');
        sound.playLevelUp();
        break;

      case 'refill-stamina':
        gameState.refillDevStamina();
        showToast(`⚡ Stamina 100/100 tam dolduruldu!`, 'success');
        sound.playLevelUp();
        break;

      case 'level-up':
        gameState.levelUp();
        showToast(`🆙 Seviye ${gameState.state.level}'e yükseltildi!`, 'success');
        sound.playLevelUp();
        break;

      case 'set-level':
        gameState.setDevLevel(level);
        showToast(`👑 Seviye ${level} olarak ayarlandı! (Sefer süresi: ${gameState.getExpeditionDurationHours(level)} Saat)`, 'success');
        sound.playLevelUp();
        break;

      case 'heal-soldiers':
        gameState.healAllDevSoldiers();
        showToast(`❤️ Tüm 18 askerin canı %100 iyileştirildi!`, 'success');
        sound.playLevelUp();
        break;

      case 'repair-tools':
        gameState.repairAllDevTools();
        showToast(`🔨 Tüm aletler, silahlar ve zırhlar %100 tamir edildi (18 tamir hakkı yenilendi)!`, 'success');
        sound.playLevelUp();
        break;

      case 'unlock-artifacts':
        gameState.unlockAllDevArtifacts();
        showToast(`👑 Tüm 18 Koleksiyon Eseri keşfedildi! Genesis NFT basılabilir!`, 'success');
        sound.playLevelUp();
        break;

      case 'unlock-all-soldiers':
        for (let k = 0; k < 18; k++) {
          gameState.state.soldierUnits.push(gameState.createSoldierUnit(gameState.state.soldierUnits.length + 1));
        }
        gameState.state.soldierUnits.forEach(s => { s.hp = s.maxHp || 100; });
        gameState.saveState();
        showToast(`⚔️ Orduya +18 asker katıldı! (Toplam: ${gameState.state.soldierUnits.length})`, 'success');
        sound.playLevelUp();
        break;

      case 'set-dungeon':
        gameState.setDungeonProgress(level);
        showToast(`💀 Zindan ilerlemesi Seviye ${level} olarak ayarlandı!`, 'success');
        sound.playLevelUp();
        break;

      case 'vanilla-reset': {
        const confirmReset = window.confirm(
          '🏛️ 100 MİLYON ASTRA BAŞLANGIÇ DAĞITIMI VE VANILLA HESAP SIFIRLAMA\n\n' +
          'Bu işlem:\n' +
          '1. Kişisel hesabını başlangıç profiline (Lv.1, 100 Stamina, 250 ASTRA) döndürür.\n' +
          '2. Haftalık kaynak çıkarma limitlerini tam kapasiteye (%100) sıfırlar.\n' +
          '3. AMM DEX Pazar Havuzlarını tam 40M ASTRA ilk tohum rezervlerine (14M Buğday, 10M Odun, 10M Demir, 3M Parça, 2M Kutu, 1M Anahtar) sıfırlar.\n' +
          '4. Krallık Hazinesi Kasalarını tam 40M ASTRA ilk tohum rezervlerine (14M Zindan, 8M Arena, 8M World Boss, 6M Buyback, 4M Karnaval) sıfırlar.\n' +
          '5. Krallık Piyango Havuzunu tam 20M ASTRA tohumuna sıfırlar.\n\n' +
          'Toplam 100 Milyon ASTRA ilk dağıtım anındaki havuz oranlarına eksiksiz sıfırlanacaktır.\n\n' +
          'Devam etmek istiyor musun?'
        );
        if (!confirmReset) break;
        if (online.active) {
          // Çevrimiçi (deneme sunucusu): sunucu dünyayı ve bütün kayıtları ilk güne döndürür
          devVanillaReset().then(r => {
            if (r && r.ok) { showToast('🏛️ Sunucu ilk güne döndü: dünya, kasalar, pazar ve bütün hesaplar sıfırlandı. Sayfa yenileniyor...', 'success'); setTimeout(() => location.reload(), 900); }
            else showToast('Sıfırlama yapılamadı: ' + ((r && r.message) || 'sunucu kabul etmedi'), 'error');
          }).catch(err => showToast('Sıfırlama yapılamadı: ' + err.message, 'error'));
          break;
        }
        gameState.vanillaReset();
        showToast('🏛️ 100M ASTRA başlangıç havuzları ve profil başarıyla ilk anki oranlarına sıfırlandı! Sayfa yenileniyor...', 'success');
        sound.playLevelUp();
        renderTopBar();
        setTimeout(() => location.reload(), 900);
        break;
      }
    }

    syncDevLiveInputs();
    renderTopBar();
  });
}

let _liveUpgradeUiTimer = 0;
function refreshLiveUpgradeCostUI(deltaSeconds = 1) {
  _liveUpgradeUiTimer += deltaSeconds;
  if (_liveUpgradeUiTimer < 1.0 && deltaSeconds < 1.0) return;
  _liveUpgradeUiTimer = 0;

  // 0. Dashboard 1-Click Tüm Aletleri Onar Butonunu Canlı Güncelle
  const oneClickRepairBtn = document.querySelector('.btn-1click-repair-tools');
  if (oneClickRepairBtn) {
    const rCosts = gameState.getAllRepairCost();
    oneClickRepairBtn.disabled = rCosts.count === 0;
    const labelSpan = oneClickRepairBtn.querySelector('span:last-child');
    if (labelSpan) {
      labelSpan.innerText = `Tüm Aletleri Onar (${rCosts.count === 0 ? 'Tam Sağlam' : `${rCosts.totalWood} 🌲 ${rCosts.totalIron} ⛏️ ${rCosts.totalAda} 🟣`})`;
    }
  }

  if (!dom.modalContainer || !dom.modalContainer.classList.contains('active')) return;

  // 🏛️ Evrensel Temel Gelir (UBI) Kartı Açıksa Anlık Canlı Güncelle
  updateUbiCardLive();

  const state = gameState.state;
  const adAstra = state.adAstraBalance || 0;
  const inv = state.inventory || {};

  // 1. Silo Modalı Açıksa Canlı Güncelle
  const whBtn = document.getElementById('btn-modal-upgrade-warehouse');
  const whAdaVal = document.getElementById('val-warehouse-ada-req');
  const whAdaCur = document.getElementById('val-warehouse-ada-cur');
  if (whBtn && whAdaVal) {
    const cost = gameState.getWarehouseUpgradeCost();
    if (cost) {
      whAdaVal.innerText = cost.adAstra.toLocaleString('tr-TR');
      if (whAdaCur) whAdaCur.innerText = adAstra.toFixed(1);
      const adaBox = document.getElementById('live-warehouse-ada-cost');
      if (adaBox) {
        adaBox.style.color = adAstra >= cost.adAstra ? '#4ade80' : '#f87171';
      }
      if (!cost.is80PercentFull) {
        whBtn.disabled = true;
        whBtn.className = 'btn-clean';
        whBtn.style.background = '#3b1404';
        whBtn.style.color = '#f59e0b';
        whBtn.style.borderColor = '#78350f';
        whBtn.style.cursor = 'not-allowed';
        whBtn.innerText = '⚠️ TÜM KAYNAK DEPOLARI EN AZ %80 DOLU OLMALIDIR';
      } else if (!cost.canAffordCost) {
        whBtn.disabled = true;
        whBtn.className = 'btn-clean';
        whBtn.style.background = '#450a0a';
        whBtn.style.color = '#f87171';
        whBtn.style.borderColor = '#7f1d1d';
        whBtn.style.cursor = 'not-allowed';
        whBtn.innerText = '⚠️ YETERSİZ KAYNAK VEYA ASTRA BAKİYESİ';
      } else {
        whBtn.disabled = false;
        whBtn.className = 'btn-clean btn-clean-green';
        whBtn.removeAttribute('style');
        whBtn.style.marginTop = '12px';
        whBtn.style.width = '100%';
        whBtn.style.fontSize = '1.05rem';
        whBtn.style.padding = '13px';
        whBtn.style.fontWeight = '800';
        whBtn.innerText = `🔨 SİLOYU SEVİYE ${cost.nextLevel}'E YÜKSELT`;
      }
    }
  }

  // 2. Karakter Seviye Modalı Açıksa Canlı Güncelle
  const lvlBtn = document.getElementById('btn-modal-levelup');
  const lvlAdaVal = document.getElementById('val-levelup-ada-req');
  const lvlAdaCur = document.getElementById('val-levelup-ada-cur');
  if (lvlBtn && lvlAdaVal) {
    const req = gameState.getNextLevelRequirement();
    if (req) {
      lvlAdaVal.innerText = req.adAstra.toLocaleString('tr-TR');
      if (lvlAdaCur) lvlAdaCur.innerText = adAstra.toFixed(1);
      const lvlAdaBox = document.getElementById('live-levelup-ada-box');
      if (lvlAdaBox) {
        lvlAdaBox.style.color = adAstra >= req.adAstra ? '#4ade80' : '#f87171';
      }
      const hasXp = state.currentXp >= req.xp;
      const hasWood = (inv.wood || 0) >= req.wood;
      const hasIron = (inv.iron || 0) >= req.iron;
      const hasWheat = (inv.wheat || 0) >= req.wheat;
      const hasAda = adAstra >= req.adAstra;
      const canAfford = hasXp && hasWood && hasIron && hasWheat && hasAda;

      if (!req.isMaxLevel) {
        if (!canAfford) {
          lvlBtn.className = 'btn-clean';
          lvlBtn.style.background = '#1f2937';
          lvlBtn.style.border = '1.5px solid #ef4444';
          lvlBtn.style.color = '#fca5a5';
          lvlBtn.style.fontWeight = '800';
          let missingReason = '';
          if (!hasXp) missingReason = `Yetersiz Deneyim (${state.currentXp}/${req.xp} XP)`;
          else if (!hasAda) missingReason = `Yetersiz ASTRA (${adAstra.toFixed(0)}/${req.adAstra} ASTRA)`;
          else missingReason = 'Eksik Hammadde';
          lvlBtn.innerText = `🔒 SEVİYE ${state.level + 1}'E YÜKSELT — ${missingReason}`;
        } else {
          lvlBtn.className = 'btn-clean btn-clean-green';
          lvlBtn.style.background = '';
          lvlBtn.style.border = '';
          lvlBtn.style.color = '';
          lvlBtn.style.fontWeight = '900';
          lvlBtn.innerText = `✨ SEVİYE ${state.level + 1}'E YÜKSELT (TÜM KOŞULLAR HAZIR!)`;
        }
      }
    }
  }

  // 3. Taverna Bot Modalı Açıksa Canlı Fiyat Güncellemesi
  dom.modalContainer.querySelectorAll('[data-bot-pkg-price]').forEach(el => {
    const h = Number(el.dataset.botPkgPrice) || 24;
    el.textContent = `${gameState.getBotPackageCost(h).toLocaleString('tr-TR')} ASTRA`;
  });

  // 4. Alet Onarım Butonları Açıksa (Balta, Kazma, Orak) Canlı Güncelle
  const repairBtns = dom.modalContainer.querySelectorAll('.btn-modal-repair');
  repairBtns.forEach(btn => {
    const tool = btn.dataset.tool;
    if (tool) {
      const cost = gameState.calculateRepairCost(tool);
      if (cost) {
        if (cost.missingDurability <= 0) {
          btn.disabled = true;
          const toolNames = { axe: 'Balta', pickaxe: 'Kazma', sickle: 'Orak' };
          btn.innerText = `${toolNames[tool] || 'Alet'} Tamamen Sağlam`;
        } else {
          btn.disabled = false;
          const toolActions = { axe: 'Baltayı Onar', pickaxe: 'Kazmayı Onar', sickle: 'Orağı Onar' };
          btn.innerText = `${toolActions[tool] || 'Onar'} (${cost.woodCost}🌲 + ${cost.ironCost}⛏️ + ${cost.adAstraCost} 🪙)`;
        }
      }
    }
  });

  // 5. Demirci Teçhizat Dövme Butonları & Canlı AMM ASTRA Fiyatları
  const craftBtns = dom.modalContainer.querySelectorAll('.btn-craft-equipment');
  craftBtns.forEach(btn => {
    const slot = btn.dataset.slot;
    if (slot) {
      const cost = gameState.calculateEquipmentCraftCost(slot);
      if (cost) {
        const canAfford = (inv.iron || 0) >= cost.ironCost &&
                          (inv.wood || 0) >= cost.woodCost &&
                          (inv.fragments || 0) >= cost.fragCost &&
                          adAstra >= cost.adaCost;
        btn.disabled = !canAfford;
        const slotNames = { weapon: 'Silah', helmet: 'Miğfer', armor: 'Zırh', legs: 'Pantolon', boots: 'Çizme' };
        btn.innerText = canAfford ? `🔨 ${slotNames[slot] || 'Teçhizat'} Döv (1 Adet)` : '⚠️ Yetersiz Hammadde';

        // Ebeveyn kart içerisindeki ASTRA tutarını canlı güncelle
        const card = btn.closest('.clean-card');
        if (card) {
          const spans = card.querySelectorAll('span');
          spans.forEach(sp => {
            if (sp.innerText.includes('ASTRA') && sp.innerText.includes('🟣')) {
              sp.innerText = `🟣 ${cost.adaCost} ASTRA`;
            }
          });
        }
      }
    }
  });

  // 6. Çanta / Cephanelik Teçhizat Yükseltme ve Onarma Butonları
  const armoryUpgradeBtns = dom.modalContainer.querySelectorAll('.btn-armory-direct-upgrade');
  armoryUpgradeBtns.forEach(btn => {
    const slot = btn.dataset.slot;
    const sIdx = btn.dataset.soldierIdx;
    const upCost = gameState.calculateEquipmentUpgradeCost(slot, sIdx !== '' && sIdx !== undefined ? Number(sIdx) : null);
    if (upCost && !upCost.isMaxLevel) {
      const canAfford = (inv.iron || 0) >= upCost.ironCost &&
                        (inv.wood || 0) >= upCost.woodCost &&
                        (inv.fragments || 0) >= upCost.fragmentCost &&
                        adAstra >= upCost.adAstraCost;
      btn.disabled = !canAfford;
      btn.innerText = `✨ Seviye ${upCost.nextLevel}'ye Yükselt`;
    }
  });

  // 7. Teçhizat Onarım Butonları (Tekil ve Toplu)
  const eqRepairBtns = dom.modalContainer.querySelectorAll('.btn-armory-repair, .btn-equip-repair, .btn-barracks-repair-item');
  eqRepairBtns.forEach(btn => {
    const slot = btn.dataset.slot;
    const sIdx = btn.dataset.soldierIdx;
    const repCost = gameState.calculateEquipmentRepairCost(slot, sIdx !== '' && sIdx !== undefined ? Number(sIdx) : null);
    if (repCost && !repCost.isRepaired) {
      const canAfford = (inv.iron || 0) >= repCost.ironCost &&
                        (inv.wood || 0) >= repCost.woodCost &&
                        adAstra >= repCost.adaCost;
      btn.disabled = !canAfford;
      btn.innerText = `🔧 Onar (${repCost.adaCost} ASTRA)`;
    }
  });

  const repAllArmoryBtn = dom.modalContainer.querySelector('.btn-repair-all-armory');
  if (repAllArmoryBtn) {
    const allRepCost = gameState.getAllEquipmentRepairCostInKingdom();
    repAllArmoryBtn.disabled = allRepCost.count === 0 || !allRepCost.canAfford;
    repAllArmoryBtn.innerText = allRepCost.count === 0 
      ? '✨ Tüm Eşyalar Sağlam' 
      : `🔨 Tüm Hasarlı Eşyaları Onar (${allRepCost.totalWood}🌲 + ${allRepCost.totalIron}⛏️ + ${allRepCost.totalAda}🟣 ASTRA)`;
  }

  // 8. Kışla Asker Hızlı İyileştirme Butonları
  const healBtns = dom.modalContainer.querySelectorAll('.btn-heal-soldier-instant');
  healBtns.forEach(btn => {
    const sIdx = btn.dataset.soldierIdx;
    if (sIdx !== undefined && sIdx !== '') {
      const hInfo = gameState.getSoldierHealInfo(Number(sIdx));
      if (hInfo) {
        if (hInfo.isFull) {
          btn.disabled = true;
          btn.innerText = '💚 Tam Can';
        } else {
          const canAfford = (inv.wheat || 0) >= hInfo.wheatNeeded && adAstra >= hInfo.adaCost;
          btn.disabled = !canAfford;
          btn.innerText = `⚡ Anında İyileştir (${hInfo.wheatNeeded}🌾 + ${hInfo.adaCost}🟣 ASTRA)`;
        }
      }
    }
  });
}

// =========================================================================
// 🧭 OYUNCU REHBERİ: bildirimler, "Sen yokken olanlar" raporu ve yeni oyuncu görevleri
// =========================================================================
let lastGuideTick = -Infinity;
let guideExpanded = false;

function fmtNum(n, digits = 0) {
  return Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtDuration(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} gün ${h} saat`;
  if (h > 0) return `${h} saat ${m} dakika`;
  return `${m} dakika`;
}

function initPlayerGuide() {
  const el = document.getElementById('guide-widget');
  if (!el) return;
  el.addEventListener('click', (e) => {
    const claimBtn = e.target.closest('[data-claim-quest]');
    if (claimBtn) {
      const res = gameState.claimOnboardingReward(claimBtn.dataset.claimQuest);
      showToast(res.message, res.success ? 'success' : 'error');
      renderGuideWidget();
      renderTopBar();
      return;
    }
    if (e.target.closest('[data-guide-toggle]')) {
      guideExpanded = !guideExpanded;
      renderGuideWidget();
      return;
    }
    if (e.target.closest('[data-guide-dismiss]')) {
      gameState.state.guideDismissed = true;
      gameState.saveState();
      renderGuideWidget();
    }
  });
  gameState.checkOnboardingProgress();
  renderGuideWidget();
}

function renderGuideWidget() {
  const el = document.getElementById('guide-widget');
  if (!el) return;
  const st = gameState.getOnboardingStatus();
  if (!st.total || (gameState.state.guideDismissed && st.claimableCount === 0)) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const pct = Math.round((st.doneCount / st.total) * 100);
  const head = `
    <button class="guide-head" data-guide-toggle aria-expanded="${guideExpanded}">
      <span class="guide-icon">🧭</span>
      <span class="guide-head-text">
        <span class="guide-title">Krallık Rehberi</span>
        <span class="guide-sub">${st.claimableCount > 0 ? `${st.claimableCount} ödül hazır · +${fmtNum(st.claimableAda)} ASTRA` : (st.next ? st.next.title : 'Tüm görevler tamam')}</span>
      </span>
      <span class="guide-count">${st.doneCount}/${st.total}</span>
    </button>
    <div class="guide-progress"><span style="width:${pct}%"></span></div>`;
  const list = !guideExpanded ? '' : `
    <ul class="guide-list">
      ${st.quests.map(q => `
        <li class="guide-quest ${q.claimed ? 'is-claimed' : (q.done ? 'is-done' : '')}">
          <span class="q-icon">${q.claimed ? '✅' : q.icon}</span>
          <span class="q-text"><strong>${q.title}</strong><small>${q.desc}</small></span>
          ${q.done && !q.claimed
            ? `<button class="q-claim" data-claim-quest="${q.id}">+${fmtNum(q.rewardAda)} ASTRA al</button>`
            : `<span class="q-reward">${q.claimed ? 'Alındı' : '+' + fmtNum(q.rewardAda)}</span>`}
        </li>`).join('')}
    </ul>
    ${st.allClaimed ? '<button class="guide-dismiss" data-guide-dismiss>Rehberi gizle</button>' : ''}`;
  const html = head + list;
  if (el.dataset.lastHtml !== html) {
    el.innerHTML = html;
    el.dataset.lastHtml = html;
  }
  el.classList.toggle('has-reward', st.claimableCount > 0);
}

function openOfflineReportModal() {
  const r = gameState.state.offlineReport;
  if (!r) return;
  gameState.state.offlineReport = null;
  gameState.saveState();
  const b = r.before || {}, a = r.after || {};
  const row = (icon, label, before, after, digits = 0) => {
    const diff = (after || 0) - (before || 0);
    const cls = diff > 0.004 ? 'up' : (diff < -0.004 ? 'down' : '');
    return `<div class="report-row"><span>${icon} ${label}</span><span>${fmtNum(before, digits)} → <strong>${fmtNum(after, digits)}</strong></span><span class="delta ${cls}">${diff >= 0 ? '+' : ''}${fmtNum(diff, digits)}</span></div>`;
  };
  dom.modalTitle.innerHTML = `<span>🌙</span> <span>SEN YOKKEN OLANLAR</span>`;
  dom.modalBody.innerHTML = `
    <div class="clean-card report-card">
      <div class="report-hero">
        <div><span class="stat-label">Uzakta geçen süre</span><strong>${fmtDuration(r.seconds + (r.skippedSeconds || 0))}</strong></div>
        <div><span class="stat-label">Botun çalıştığı süre</span><strong>${fmtDuration(r.botWorkedSeconds)}</strong></div>
        <div><span class="stat-label">Toplanan sefer</span><strong>${fmtNum(r.expeditionsClaimed)}</strong></div>
        ${r.botRenewals ? `<div><span class="stat-label">Otomatik yenileme</span><strong>${r.botRenewals} kez</strong></div>` : ''}
      </div>
      <div class="report-table">
        ${RES_KEYS().map(k => { const m = RES_META()[k] || {}; return row(m.icon || '', m.name || k, b[k], a[k]); }).join('')}
        ${row('🟣', 'ASTRA', b.ada, a.ada, 2)}
        ${row('🏰', 'Silo seviyesi', b.warehouseLevel, a.warehouseLevel)}
      </div>
      ${r.village ? `<div class="notice-card">🏘️ Köy: ${fmtNum(r.village.eaten)} buğday yendi, ${fmtNum(r.village.grew, 1)} köylü doğdu${r.village.lost > 0 ? `, <span style="color:#f87171;">${fmtNum(r.village.lost, 1)} köylü açlıktan göç etti</span>` : ''}; şimdi ${fmtNum(r.village.villagers)} köylü.</div>` : ''}
      ${r.botStoppedReason ? `<div class="notice-card notice-warn">⏸️ Bot durdu: ${r.botStoppedReason}</div>` : ''}
      ${r.skippedSeconds > 0 ? `<div class="notice-card">ℹ️ Bot en fazla 7 günü telafi eder; daha eski ${fmtDuration(r.skippedSeconds)} hesaba katılmadı.</div>` : ''}
      <button class="btn-clean btn-gold" id="btn-close-offline-report" style="margin-top:14px;">Tamam, devam et</button>
    </div>`;
  displayModal();
  document.getElementById('btn-close-offline-report')?.addEventListener('click', closeModal);
}

function tickPlayerGuide(now) {
  // Oyun motorunun bıraktığı bildirimler kısa mesaj olarak gösterilir
  const notices = gameState.consumeNotices();
  notices.slice(-4).forEach(n => showToast(n.message, n.type || 'info'));

  if (now - lastGuideTick < 2000) return;
  lastGuideTick = now;
  try { gameState.processScheduledLottery(); } catch (e) { console.warn('Piyango takvimi:', e); }
  try { gameState.processEconomyTick(); } catch (e) { console.warn('Ekonomi döngüsü:', e); }
  gameState.checkOnboardingProgress();
  renderGuideWidget();
  if (gameState.state.offlineReport && !isAnyModalOpen()) openOfflineReportModal();
}

// v1.25 performans: döngü üç hıza ayrıldı. Eskiden üst çubuk, yan panel ve bot kontrolleri saniyede 60 kez
// baştan çalışıyordu (yan panel açıkken saniyede ~34 kare ve takılmalar).
//  • her kare: stamina ve sefer ilerlemesi
//  • saniyede 4 kez: ekrandaki yazılar ve sayaçlar
//  • saniyede 1 kez: bot, iyileşme, fiyat hesapları
let loopSlowAccMs = 0;
let loopSlowDeltaSec = 0;
let loopUiAccMs = 0;

function uiGameLoop(currentTime) {
  try {
    const deltaMs = Math.min(10000, Math.max(0, currentTime - lastTickTime));
    lastTickTime = currentTime;
    const deltaSeconds = (deltaMs / 1000) * speedMultiplier;

    gameState.regenerateStamina(deltaSeconds);
    gameState.updateExpeditions(deltaSeconds);

    loopSlowAccMs += deltaMs;
    loopSlowDeltaSec += deltaSeconds;
    loopUiAccMs += deltaMs;

    if (loopSlowAccMs >= 1000) {
    const slowDelta = loopSlowDeltaSec;
    loopSlowAccMs = 0;
    loopSlowDeltaSec = 0;
    const botPauseStatus = gameState.updateBotPauseState();
    if (botPauseStatus && botPauseStatus.justResumed) {
      showToast('🟢 Gerekli tüm kaynaklar tamamlandı! 24s Otomasyon Botu anında devreye girdi.', 'success');
      sound.playLevelUp();
    }
    if (botPauseStatus && botPauseStatus.justRenewed) {
      showToast('🔄 24 saat tamamlandı! Bot otomatik olarak yeniden satın alındı ve bir 24 saat daha devam ediyor.', 'success');
      if (typeof sound !== 'undefined' && sound.playLevelUp) sound.playLevelUp();
      renderTopBar();
      if (document.getElementById('clean-modal') && !document.getElementById('clean-modal').classList.contains('hidden')) {
        openTownZoneModal('tavern', '🍺 Taverna & Han');
      }
    }

    gameState.runTavernaAutomationCycle();
    gameState.processSoldierPassiveHealing(slowDelta);
    if (gameState.processVillage) gameState.processVillage(slowDelta);
    gameState.tickUpgradeCostBot(slowDelta);
    gameState.checkDailyAutonomousBuyback();
    globalPool.simulateGlobalActivity(slowDelta);
    refreshBarracksLiveUI(slowDelta);
    refreshLiveUpgradeCostUI(slowDelta);
    refreshQuotaTrackerUI();
    reportStorageEvents();
    }

    if (loopUiAccMs < 250) return;
    loopUiAccMs = 0;
    tickPlayerGuide(currentTime);

    // Canlı Açık Sefer Modalı Sayacı Güncelleme
    RES_KEYS().forEach(nodeId => {
      const timeEl = document.getElementById(`modal-exp-time-${nodeId}`);
      const pctEl = document.getElementById(`modal-exp-pct-${nodeId}`);
      const fillEl = document.getElementById(`modal-exp-fill-${nodeId}`);
      const accEl = document.getElementById(`modal-exp-accrued-${nodeId}`);
      const partBtn = document.getElementById(`btn-modal-partial-${nodeId}`);
      if (timeEl && fillEl) {
        const acc = gameState.getAccruedExpeditionHarvest(nodeId);
        timeEl.innerText = formatCountdown(acc.remainingSeconds);
        if (pctEl) pctEl.innerText = `%${acc.pct}`;
        fillEl.style.width = `${acc.pct}%`;
        if (accEl) {
          accEl.innerText = `+${acc.accruedAmount} ${GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId].name} (+${acc.accruedXp || 0} XP)`;
        }
        if (partBtn) {
          partBtn.disabled = acc.accruedAmount <= 0;
          partBtn.innerText = `⚡ ERKEN TOPLA (+${acc.accruedAmount} Al)`;
        }
      }
    });

    // Zindan Üst Barındaki Dinamik Sayıcılar
    const dkKeys = document.getElementById('dungeon-dock-keys');
    if (dkKeys) dkKeys.innerText = gameState.state.arenaKeys || 0;
    const dkBoxes = document.getElementById('dungeon-dock-boxes');
    if (dkBoxes) dkBoxes.innerText = gameState.state.lockedBoxes || 0;
    const dkFrags = document.getElementById('dungeon-dock-fragments');
    if (dkFrags) dkFrags.innerText = gameState.state.inventory.fragments || 0;

    renderTopBar();
  } catch (err) {
    console.error('uiGameLoop error:', err);
  } finally {
    requestAnimationFrame(uiGameLoop);
  }
}

function getStageSize() {
  const el = document.getElementById('phaser-game-container');
  const w = (el && el.clientWidth) || window.innerWidth;
  const h = (el && el.clientHeight) || (window.innerHeight - 92);
  return { w: Math.max(320, w), h: Math.max(300, h) };
}
window.getStageSize = getStageSize;

function initPhaser() {
  const { w: W, h: H } = getStageSize();

  const config = {
    type: Phaser.CANVAS,           // Force Canvas (WebGL can silently fail)
    parent: 'phaser-game-container',
    width: W,
    height: H,
    backgroundColor: '#1a0f08',
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false,
      transparent: false,
      clearBeforeRender: true,
      powerPreference: 'default'
    },
    scene: [GrandTownScene, DungeonScene]
  };

  // 2B piksel harita varsayılan (kullanıcı kararı 7 Ekim: 3B vadi rafa kalktı); 3B deneme ?harita=3d ile ya da localStorage 'harita'='3d' ile
  let use3D = false;
  try { use3D = /[?&]harita=3d/.test(location.search) || localStorage.getItem('harita') === '3d'; } catch (e) { /* depolama kapalı */ }
  if (use3D) {
    document.body.classList.add('map-3d');
    config.scene = [VadiBootScene, DungeonScene];   // zindan Phaser'da kalır; kasaba sahnesi hiç açılmaz
  }

  phaserGame = new Phaser.Game(config);
  if (use3D) {
    const host = document.getElementById('vadi3d-container');
    const gal = /[?&]galeri=(\w+)/.exec(location.search);   // geliştirici: model galerisi
    if (gal && host) { import('./vadi3d/galeri.js').then(m => gal[1] === 'binalar' ? m.startBinaGalerisi(host) : m.startGaleri(host, gal[1], Number((/[?&]sayfa=(\d+)/.exec(location.search) || [])[1] || 0))); return; }
    if (host) { try { window.__vadi3d = startVadi3D(host); } catch (e) { console.error('3B vadi açılamadı, 2B haritaya dönülüyor:', e); document.body.classList.remove('map-3d'); try { localStorage.removeItem('harita'); } catch (e2) { /* yoksay */ } location.reload(); } }
  }

  // Force canvas to fill area below top header strip & ticker
  phaserGame.events.once('ready', () => {
    console.log('[Phaser] Game ready! Resizing canvas...');
    if (phaserGame && phaserGame.scale) {
      const { w, h } = getStageSize();
      phaserGame.scale.resize(w, h);
    }
    if (window.__finishLoadingBar) window.__finishLoadingBar();
  });

  // Resize on window change
  window.addEventListener('resize', () => {
    if (!phaserGame || !phaserGame.scale) return;
    const { w, h } = getStageSize();
    phaserGame.scale.resize(w, h);
  });
}

// 📢 Canlı Duyuru ve Risk Bildirim Paneli Render Motoru
export function renderTopAnnouncementTicker() {
  const container = document.getElementById('ticker-marquee-inner');
  if (!container) return;

  const tickerConfig = GAME_CONFIG.ANNOUNCEMENT_TICKER || GAME_CONFIG.TICKER_CONFIG || {};
  if (tickerConfig.enabled === false) {
    const parentTicker = document.getElementById('top-announcement-ticker');
    if (parentTicker) parentTicker.style.display = 'none';
    return;
  }

  const announcements = GAME_CONFIG.ANNOUNCEMENTS || [];
  if (!announcements || announcements.length === 0) return;

  if (tickerConfig.speedSeconds) {
    container.style.animationDuration = `${tickerConfig.speedSeconds}s`;
  }

  const sep = tickerConfig.separator || '✦';

  const buildItemsHtml = () => {
    return announcements
      .filter(a => a.active !== false)
      .map(item => {
        const badgeStyle = item.badgeColor ? `style="border-color: ${item.badgeColor}; color: ${item.badgeColor}; background: ${item.badgeColor}26;"` : '';
        return `
          <span class="ticker-item">
            <span class="ticker-item-badge" ${badgeStyle}>${item.badge || 'DUYURU'}</span>
            <span class="ticker-item-text">${item.text}</span>
            <span class="ticker-item-sep">${sep}</span>
          </span>
        `;
      }).join('');
  };

  // Kesintisiz sonsuz kaydırma (seamless marquee) için 2 döngü duplicate eklenir
  const singleContent = buildItemsHtml();
  container.innerHTML = singleContent + singleContent;
}

window.addEventListener('DOMContentLoaded', async () => {
  // 🌐 Oyun bir Realm of AdAstra sunucusundan açıldıysa çevrimiçi mod: cüzdanla giriş, kayıt sunucuda.
  // Sunucu yoksa (bilgisayardaki deneme modu) oyun eskisi gibi tarayıcıda çalışır.
  let isOnline = false;
  try {
    isOnline = await startOnline({
      gameState, ammMarket, treasury, globalPool,
      toast: (m, t) => showToast(m, t),
      onApplied: () => {
        try { renderTopBar(); } catch (e) { /* ilk açılış */ }
        try { renderGateBanner(); } catch (e) { /* kapı şeridi */ }
        const wb = document.getElementById('btn-online-wallet');
        if (wb) wb.textContent = isLoggedIn() ? '🏦' : '🔐 Giriş';
      }
    });
  } catch (e) {
    console.warn('Çevrimiçi mod başlatılamadı:', e);
  }
  renderTopAnnouncementTicker();
  initPhaser();
  initAppEvents();
  initDevPanelEvents();
  if (isOnline) {
    // Cüzdan düğmesi (yatırma / çekim) bakiyenin yanında; bakiyeye tıklamak da açar
    const balEl = document.getElementById('adastra-balance');
    const host = balEl && balEl.parentElement;
    if (host) {
      const btn = document.createElement('button');
      btn.id = 'btn-online-wallet';
      btn.type = 'button';
      btn.textContent = isLoggedIn() ? '🏦' : '🔐 Giriş';
      btn.title = 'Hesabım: giriş, cüzdan ve çekim';
      btn.style.cssText = 'margin-left:6px;background:#1d4ed8;border:1px solid #60a5fa;color:#fff;border-radius:6px;padding:2px 6px;cursor:pointer;font-size:0.85rem;';
      btn.addEventListener('click', (e) => { e.stopPropagation(); openWalletPanel(); });
      host.appendChild(btn);
      host.style.cursor = 'pointer';
      host.addEventListener('click', () => openWalletPanel());
    }
  }
  const showDevTools = isOnline ? !!(online.health && online.health.testMode) : DEV_TOOLS;
  if (!showDevTools) {
    ['btn-dev-panel-toggle', 'btn-open-test-menu', 'dev-modal'].forEach(id => document.getElementById(id)?.remove());
  }
  initPlayerGuide();
  renderTopBar();

  // 🏛️ AMM DEX Anlık Fiyat Değişimlerini İzle ve Dinamik Maliyetleri Anında Yenile
  if (typeof ammMarket !== 'undefined' && ammMarket.subscribe) {
    ammMarket.subscribe(() => {
      if (typeof gameState !== 'undefined' && gameState._isFastForwarding) return;
      refreshLiveUpgradeCostUI(1.0);
      renderTopBar();
    });
  }

  lastTickTime = performance.now();
  requestAnimationFrame(uiGameLoop);
  runCinematicLoadingSequence();
});

