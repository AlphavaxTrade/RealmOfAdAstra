// AdAstra: Genesis Realm - Pixiland v2.7.0 Modern Controller
import Phaser from 'phaser';
import { GAME_CONFIG } from './config.js';
import { gameState } from './gameState.js';
import { globalPool } from './globalPool.js';
import { ammMarket } from './ammMarket.js';
import { sound } from './audio.js';
import { GrandTownScene } from './grandTownScene.js';
import { DungeonScene } from './dungeonScene.js';
// 3B vadi (three.js, yalnız ?harita=3d ile) gerektiğinde yüklenir: 2B haritada her açılışta ~155 KB (sıkıştırılmış) three indirilmez
import { DEFAULT_BOSS_PHASES, PLAYER_SKILLS } from './combat.js';
import { AdAstraBattleArena, getMonsterAvatar } from './battleArena.js';
import { renderQuotaTracker, renderDungeonEntryLadder, formatDuration, fmtInt } from './ui/limits.js';
import { consumeStorageEvents, CORRUPT_SUFFIX } from './storage.js';
import { treasury } from './treasury.js';
import { createBarracksUI } from './ui/barracks.js';
import { yolHtml, yolOzeti } from './ui/v3/ogretici.js';
import { sadeBaslik } from './ui/v3/panel.js';
import { resImg } from './ui/art.js';
import { startOnline, openWalletPanel, online, pvp, pazar, sponsor, isLoggedIn, requireLogin, devVanillaReset } from './net/online.js';
import { ac as ekranAc, baglamKur as ekranBaglamKur, canliTik as ekranCanliTik } from './ui/ekran/index.js';

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
let selectedSoldierIndex = 0;
let editingSoldierNameIndex = null;
let barracksLiveRefreshAccumulator = 0;

// DOM Referansları
const dom = {
  btnDungeonReturnTown: document.getElementById('btn-dungeon-return-town'),
  dungeonHudFragVal: document.getElementById('dungeon-hud-frag-val'),
  dungeonHudBoxVal: document.getElementById('dungeon-hud-box-val'),
  dungeonBadgeFrag: document.getElementById('dungeon-badge-frag'),
  dungeonBadgeBox: document.getElementById('dungeon-badge-box'),
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

// Panel yeni bir ekranla (başka başlık) ya da kapalıyken açılıyorsa kaydırma en üste döner; aynı ekran yenileniyorsa konum korunur
let sonPanelBasligi = '';
function displayModal() {
  if (dom.rpgModal) {
    const baslik = dom.modalTitle ? dom.modalTitle.textContent : '';
    const yeniEkran = !dom.rpgModal.classList.contains('active') || baslik !== sonPanelBasligi;
    sonPanelBasligi = baslik;
    dom.rpgModal.classList.add('active');
    document.body.classList.add('modal-open');
    if (yeniEkran && dom.modalBody) dom.modalBody.scrollTop = 0;
    ogreticiPanelGordu(baslik);
  }
}

// Krallık Yolu: açılan panelin/sekmenin adı bir öğretici görevine denk geliyorsa oyuncunun "gördüğü" bildirilir
// (yalnız izinli anahtarlar; aynı oturumda bir kez). Gerçek eylem görevleri bu kancaya bağlı değildir.
const ogreticiGorulenOturum = new Set();
function ogreticiGor(anahtar) {
  if (ogreticiGorulenOturum.has(anahtar)) return;
  ogreticiGorulenOturum.add(anahtar);
  if (typeof gameState.ogreticiGordu === 'function') gameState.ogreticiGordu(anahtar);
}
const OGRETICI_BASLIK_ESLEMESI = [
  ['krallık merkezi', 'merkez'], ['zümrüt ormanı', 'bolge'], ['güneş tarlası', 'bolge'], ['taş ocağı', 'bolge'],
  ['kömür ocağı', 'bolge'], ['demir madeni', 'bolge'], ['şifalı ot bahçesi', 'bolge'], ['kotalarım', 'kota'],
  ['köy evleri', 'koy'], ['konsey ve hazine', 'hazine'], ['ekonomi panosu', 'ekonomi'], ['karakterim', 'profil'],
  ['savaşa hazırlık', 'zindanOnizleme']
];
const OGRETICI_SEKME_ESLEMESI = [
  ['.ek-sekme.is-aktif[data-sekme="lig"]', 'lig'], ['.ek-sekme.is-aktif[data-sekme="havuzlar"]', 'havuzlar']
];
function ogreticiPanelGordu(baslik) {
  try {
    const t = sadeBaslik(baslik).toLocaleLowerCase('tr');
    for (const [parca, anahtar] of OGRETICI_BASLIK_ESLEMESI) if (t.includes(parca)) { ogreticiGor(anahtar); break; }
    if (dom.modalBody) for (const [sec, anahtar] of OGRETICI_SEKME_ESLEMESI) if (dom.modalBody.querySelector(sec)) ogreticiGor(anahtar);
  } catch (err) {
    console.warn('Öğretici kancası çalışmadı:', err);
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

// Yeni yazılan ekranlar (js/ui/ekran/*) oyunla bu bağlam üzerinden konuşur; başka bir şeye dokunmazlar
ekranBaglamKur({
  gameState, GAME_CONFIG, globalPool, ammMarket, treasury,
  get online() { return online; },
  get pazar() { return pazar; },
  get sponsor() { return sponsor; },
  girisli: () => isLoggedIn(),
  bildir: (mesaj, tur) => showToast(mesaj, tur),
  hudYenile: () => renderTopBar(),
  panelKok: () => dom.modalBody,
  panelAcik: () => !!(dom.rpgModal && dom.rpgModal.classList.contains('active')),
  panelKapat: () => closeModal(),
  panelYaz: ([simge, ad], html) => {
    dom.modalTitle.innerHTML = `<span>${simge}</span> <span>${ad}</span>`;
    dom.modalBody.innerHTML = html;
    displayModal();
  },
  kilit: (anahtar) => gameState.getFeatureLock(anahtar),
  get pvp() { return pvp; },
  girisIste: () => requireLogin(),
  // Canlı savaş arenasını açar ve savaşı başlatır (Kolezyum, gerçek rakipler); arena yoksa false
  arenaBaslat: (savas) => {
    const arena = getBattleArena();
    if (!arena) return false;
    closeModal();
    openBattleArenaModal();
    arena.startBattle(savas);
    return true;
  },
  // Yeni ekrana taşınmamış bölümler için geçici köprü
  eskiAc: (id) => {
    const eski = {
      kisla: () => openBarracksModal(),
      zindan: () => enterDungeonScene(),
      rehber: () => openKrallikYoluModal(),
      ekonomi: () => openEconomyDashboardModal('overview')
    };
    if (!eski[id]) return false;
    eski[id]();
    return true;
  }
});

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
// Sırada beklerken onaylanacak 3 basit adım (misafir modu; oyun aksiyonu değil) — E-planı Faz 1
const HAZIR_ADAY_ETIKET = { rehber: '📖 Nasıl oynanır rehberini okudum', kurallar: '📜 Vadi kurallarını okudum', hazirim: '✅ Hazırım, yerim açılsın' };

function renderGateBanner() {
  const el = document.getElementById('gate-banner');
  if (!el) return;
  const g = online.gate;
  const k = gameState.state && gameState.state.katilim;
  const parcalar = [];

  // 🏖️ İzin sorusu: katılımı düşük kalan vatandaşa sorulur, gate durumundan bağımsız (yalnız vatandaşta olur)
  if (k && k.izinSorusu && Date.now() < Number(k.izinSorusu.sonTarih)) {
    const saat = Math.max(0, Math.round((Number(k.izinSorusu.sonTarih) - Date.now()) / 3600000));
    parcalar.push(`<div class="gate-banner-row">🏖️ <strong>Katılımın düşük; izin hakkını kullanmak ister misin?</strong> ${saat} saat içinde cevap ver, yoksa yerin bekleyen bir vatandaşa geçer (izinde yer kaybı yok; cevapsız kalırsan dönüşte sıranın önüne alınırsın). <button id="btn-izin-evet" class="btn-clean">✅ Evet, izin kullan</button> <button id="btn-izin-hayir" class="btn-clean">Hayır</button></div>`);
  }

  // 🏖️ İzindeyken şeritte bilgi (yer korunuyor; ekonomiden pay alınmıyor) + erken bitirme
  if (k && k.izinModu && Date.now() < Number(k.izinModu.bitis)) {
    const gun = Math.max(0, Math.ceil((Number(k.izinModu.bitis) - Date.now()) / 86400000));
    parcalar.push(`<div class="gate-banner-row">🏖️ <strong>İzindesin</strong> — ${gun} gün kaldı. Yerin korunuyor; bu sürede Üretim Hakkı, temel gelir ve ücretsiz oyuncu payı almazsın. <button id="btn-izin-bitir-serit" class="btn-clean">İzni şimdi bitir</button></div>`);
  }

  if (!g || g.status === 'citizen' || g.status === 'new') {
    if (!parcalar.length) { el.hidden = true; el.innerHTML = ''; return; }
  } else if (g.status === 'waiting') {
    const hazir = (gameState.state && gameState.state.candidateReady) || {};
    const idler = GAME_CONFIG.KAPI.READY_TASK_IDS || [];
    const gorevler = idler.map(id => `<button class="btn-clean" data-misafir-gorev="${id}" ${hazir[id] ? 'disabled' : ''}>${hazir[id] ? '✅' : '☐'} ${HAZIR_ADAY_ETIKET[id] || id}</button>`).join(' ');
    const davetTxt = g.davet ? ' 📨 <strong>Yerin açıldı! Herhangi bir hareket yaparsan (bir görevi onaylaman da yeter) vatandaş olursun.</strong>' : ' Aşağıdaki adımları onaylarsan yer açılınca önce sana gelir.';
    parcalar.push(`<div class="gate-banner-row"><span class="gate-banner-icon">🚪</span><span>⏳ <strong>Bekleme sırasındasın: ${g.position || '?'}. sıra.</strong> Vadide şu an ${g.citizens}/${g.limit} vatandaş var. Gezebilir, her yere bakabilirsin; işlem yapmak için yerinin açılmasını bekle.${davetTxt}</span></div><div class="gate-banner-row">${gorevler}</div>`);
  } else {
    parcalar.push(`<div class="gate-banner-row"><span class="gate-banner-icon">🚪</span><span>⏸️ <strong>Yerin askıda.</strong> Katılımın düşük kaldığı için yerin bekleyen bir vatandaşa verildi. Hesabın ve her şeyin duruyor; giriş yaptığında yeniden sıraya girersin.</span></div>`);
  }
  el.innerHTML = parcalar.join('');
  el.hidden = false;
}
document.getElementById('gate-banner')?.addEventListener('click', e => {
  const gorev = e.target.closest('[data-misafir-gorev]');
  if (gorev && !gorev.disabled) { gameState.misafirGorevTamamla(gorev.dataset.misafirGorev); renderGateBanner(); return; }
  if (e.target.closest('#btn-izin-evet')) { gameState.cevaplaIzinSorusu(true); renderGateBanner(); return; }
  if (e.target.closest('#btn-izin-hayir')) { gameState.cevaplaIzinSorusu(false); renderGateBanner(); return; }
  if (e.target.closest('#btn-izin-bitir-serit')) { gameState.bitirIzin(); renderGateBanner(); }
});

// Kralın danışmanı önerisinin düğmesi: eski kart ve v3 "şimdi" kartı aynı eylemi çalıştırır
function danismanEylemi(act) {
  if (act === 'sweep_harvest') {
    const res = gameState.claimAllHarvests();
    showToast(res.message, res.success ? 'success' : 'info');
    if (res.success) sound.playHarvest();
    renderTopBar();
  } else if (act === 'open_barracks') {
    openBarracksModal();
  } else if (act === 'open_blacksmith') {
    openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
  } else if (act === 'open_dungeon') {
    enterDungeonScene();
  } else {
    openDashboardModal();   // 'open_dashboard' ve bilinmeyen eylemler
  }
}

// Üst çubuk bot rozeti: eski çubuk ve v3 üst çubuğu AYNI fonksiyondan okur
function botHudDurumu() {
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
  return { botState, botText, botTip };
}

// v3 üst çubuğunun ihtiyaç duyduğu değerler: eski çubuğun DOM'undan DEĞİL, doğrudan oyun durumundan üretilir.
// (renderTopBar eski çubuğu aynı kaynaklardan doldurur; biçim kuralları burada ve orada aynı tutulur.)
function hudVerisi() {
  const state = gameState.state;
  const maxStamina = gameState.getMaxStamina(state.level);
  const staminaInt = Math.floor(state.stamina);
  const fullBalance = state.adAstraBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const compactBalance = window.innerWidth <= 520 && state.adAstraBalance >= 100000;
  const siloCap = gameState.getWarehouseCapacity();
  const fmtRes = (v) => Math.floor(Number(v) || 0).toLocaleString('tr-TR');
  const kaynaklar = {};
  for (const key of RES_KEYS()) {
    const cur = Number(state.inventory[key]) || 0;
    const cap = siloCap[key] || 0;
    const pct = cap > 0 ? Math.max(0, Math.min(100, (cur / cap) * 100)) : 0;
    kaynaklar[key] = { deger: fmtRes(cur), yuzde: pct, dolu: cap > 0 && pct >= 99.5, ipucu: cap > 0 ? `${fmtRes(cur)} / ${fmtRes(cap)} (silo %${Math.round(pct)})` : '' };
  }
  kaynaklar.fragments = { deger: fmtRes(state.inventory.fragments), yuzde: 0, dolu: false, ipucu: '' };
  const bot = botHudDurumu();
  const unread = realmNotifications.filter(n => n.unread).length + (gameState.getBotResourceDeficitWarning() ? 1 : 0);
  const danisman = lastAdvisor || gameState.getRoyalAdvisorAdvice();
  return {
    seviye: `Lv.${state.level}`,
    staminaYuzde: Math.max(0, Math.min(100, (staminaInt / Math.max(1, maxStamina)) * 100)),
    staminaMetin: `${staminaInt}/${maxStamina}`,
    bakiye: compactBalance ? state.adAstraBalance.toLocaleString('tr-TR', { notation: 'compact', maximumFractionDigits: 2 }) : fullBalance,
    kaynaklar,
    bot: { durum: bot.botState, metin: bot.botText },
    bildirim: unread,
    danisman: { simge: danisman.icon || '🧙‍♂️', baslik: danisman.title || 'Kralın Danışmanı', metin: String(danisman.advice || '').replace(/<[^>]*>/g, ''), eylem: danisman.action || '', eylemEtiketi: danisman.actionLabel || '✨ İncele' }
  };
}
let lastAdvisor = null;

function renderTopBar() {
  updateRoyalAdvisorUI();
  renderRealmSidebar();

  // Zindandayken canlı ganimet rozetlerini güncel tut
  if (document.body.classList.contains('in-dungeon')) {
    updateDungeonLiveDropRatesUI();
  }

  if (window.__v3) window.__v3.guncelle();   // v3 üst çubuğu değerlerini hudVerisi()'nden okur
}window.renderHUD = renderTopBar;

// Akıllı Kral Danışmanı DOM Güncellemesi
function updateRoyalAdvisorUI() {
  lastAdvisor = gameState.getRoyalAdvisorAdvice();   // hudVerisi() aynı öneriyi tekrar hesaplamadan kullanır
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

function renderRealmSidebar() {
  // 1. Aktif seferler ve tamamlanma sayacı
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

  // 2. Kota özeti: kişisel Üretim Hakkı (açık kısım bugüne kadar açılan hak, dolu kısım şu an alınabilir)
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

  // 3. Tüm aletleri onar düğmesi: canlı maliyet
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

    // Kat çubuğu açılır (v3 üst/alt çubukları zindanda CSS ile gizlenir)
    document.body.classList.add('in-dungeon');
    const floorBar = document.getElementById('dungeon-floor-bar');
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

  // Kat çubuğu kapanır, v3 çubukları geri gelir
  document.body.classList.remove('in-dungeon');
  const floorBar = document.getElementById('dungeon-floor-bar');
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


const openEconomyDashboardModal = () => ekranAc('ekonomi');
const openColosseumModal = () => ekranAc('kolezyum');

const openWarehouseModal = () => ekranAc('silo');

const openInventoryModal = () => ekranAc('karakter');


// ═══════════════════════════════════════════════════════════════════════════
// v2 (7 Ekim 2026): 6 hammadde alanı tek şablondan (config.RESOURCE_META: ad, simge, renk, alet, alan)
// ═══════════════════════════════════════════════════════════════════════════
const RES_KEYS = () => GAME_CONFIG.RESOURCE_KEYS || ['wood', 'iron', 'wheat'];
const RES_META = () => GAME_CONFIG.RESOURCE_META || {};
const ZONE_OF_NODE = key => ((RES_META()[key] || {}).zone) || key;
const NODE_OF_ZONE_UI = zoneId => RES_KEYS().find(k => ZONE_OF_NODE(k) === zoneId) || null;
const ZONE_NAMES = { wheat: 'Güneş Tarlası & Değirmen', stone: 'Taş Ocağı', wood: 'Zümrüt Ormanı & Oduncu', coal: 'Kömür Ocağı', iron: 'Demir Madeni & Tamirhane', herb: 'Şifalı Ot Bahçesi' };
const ZONE_LABELS = { village: '🏘️ Köy Evleri', council: '🏛️ Sirius Konseyi', healer: '🌿 Şifahane', spaceport: '🚀 Uzay Limanı' };
const ZONE_TITLE = key => { const m = RES_META()[key] || {}; const cap = (GAME_CONFIG.GLOBAL_RESOURCE_CAPS || {})[key] || {}; return `${m.icon || cap.icon || ''} ${ZONE_NAMES[key] || cap.name || key}`; };

// =========================================================================
// 4. BÖLGE MODALLERİ (ORMAN, MADEN, ÇİFTLİK, BALIKÇI, KIŞLA, TAVERNA, AMM PAZAR, KOLEZYUM)
// =========================================================================
const YENI_EKRAN_BOLGE = { village: 'koy', healer: 'sifahane', spaceport: 'uzay', tavern: 'taverna', blacksmith: 'demirhane', market: 'pazar' };

function openTownZoneModal(zoneId, zoneName) {
  if (!featureGate(zoneId)) return;
  if (YENI_EKRAN_BOLGE[zoneId]) { ekranAc(YENI_EKRAN_BOLGE[zoneId]); return; }
  const kaynakBolgesi = NODE_OF_ZONE_UI(zoneId);
  if (kaynakBolgesi) { ekranAc('bolge', { kaynak: kaynakBolgesi }); return; }
  if (zoneId === 'barracks') {
    openBarracksModal();
    return;
  }
  if (zoneId === 'battlefield') {
    ekranAc('savasalani');
    return;
  }
  if (zoneId === 'colosseum') {
    openColosseumModal();
    return;
  }
  if (zoneId === 'council') {
    ekranAc('konsey');
    return;
  }

  if (zoneId === 'carnival') {
    ekranAc('karnaval');
    return;
  }
  showToast(`${zoneName || 'Bu bölge'} şu an açılamıyor.`, 'info');
}

// =========================================================================
// 4.5 PHASE 2: ASKERİ KIŞLA (18 KİŞİLİK ORDU & AKILLI SİLAH DEPOSU)
// =========================================================================
// Kışla (Ordu + Cephanelik): yeni arayüz js/ui/barracks.js içinde (4 Ekim 2026)
function renderBarracksHtml() {
  return barracksUI.render();
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
  if (window.__v3) window.__v3.guncelle();   // zil sayısı hudVerisi().bildirim'den gelir
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

const openDashboardModal = () => ekranAc('merkez');

const openTreasuryVaultModal = () => ekranAc('hazine');

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
  dom.modalTitle.innerHTML = '<span>⚔️</span> <span>Savaşa hazırlık</span>';

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
  const entryLadderHtml = renderDungeonEntryLadder(terms);
  const entryNoteHtml = !terms.nextNeedsFee
    ? `<div class="pe-note ${terms.nextWeaponWear ? '' : 'pe-good'}">${terms.nextWeaponWear ? 'Savaşa giren her askerin silahı 1 aşınır.' : 'Günün ilk girişi: silahların aşınmaz.'} Stamina harcanır. Harçsız ödüllü giriş: ${terms.freeLeft} / ${terms.freeTotal} kaldı. Haklar her gece 00:00'da (TSİ) yenilenir.</div>`
    : `<div class="pe-note">Harç ödemezsen antrenman girişi olur: askerlerin ve hesabın deneyim kazanır, ASTRA ve ganimet düşmez. Stamina harcanır, silahlar aşınır.</div>`;
  const entryFeeHtml = terms.nextNeedsFee ? `<label class="pe-fee">
               <input type="checkbox" id="chk-dungeon-gate-fee" ${window.dungeonPayGateFee ? 'checked' : ''} />
               <span><strong>Kapı harcı öde: ${gateFee.toLocaleString('tr-TR')} ASTRA</strong> — ödülüyle gir. ${(GAME_CONFIG.DUNGEON_GATE_POOL_SHARE ?? 1) >= 1 ? 'Harcın tamamı zindan kasasına gider.' : `Harçtan %${Math.round((GAME_CONFIG.DUNGEON_GATE_POOL_SHARE ?? 1) * 1000) / 10} doğrudan zindan kasasına gider, kalanı her harcama gibi dağıtılır.`}</span>
             </label>` : '';
  const entryWarnHtml = expectedAda < baseReward.ada ? `<div class="pe-note pe-warn">Bugünkü zindan kasası bütçesi azaldı: bu zaferin ASTRA ödülü en fazla ${expectedAda.toLocaleString('tr-TR')} olur.</div>` : '';
  const entryCardHtml = `
    <div class="prebattle-entry-card ${terms.nextNeedsFee ? 'is-out' : ''}">
      <div class="pe-row">
        <span>🎟️ Bugünkü ${terms.nextEntryNumber}. girişin</span>
        <strong>${terms.nextNeedsFee ? 'Harçlı / antrenman' : 'Ödüllü'}</strong>
      </div>
      ${entryFeeHtml}
      ${entryWarnHtml}
      <details class="v3-ayrinti"><summary>Giriş kuralları</summary><div>${entryLadderHtml}${entryNoteHtml}</div></details>
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
        <div>Kazanma şansı: %${prediction.winChance} (${prediction.difficulty})</div>
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
        Askerlerin Pazar 18:00 TSİ World Boss savaşı için kilit altındadır ve başka hiçbir alanda kullanılamaz. Savaş Alanından (%${Math.round(gameState.getWorldBossEarlyUnstakeRate() * 100)} ceza ile) erken çekebilir veya Pazar 18:00 sonrası ödülünle birlikte ordunu toplayabilirsin.
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
        <details class="v3-ayrinti"><summary>Taktik ve silahlar</summary><div>${presetSelectorHtml}${activeWeaponsPreviewHtml}</div></details>
        

        <div class="prebattle-sol-list">
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
  startBtnText = startBtnText.replace('SAVAŞA BAŞLA', 'Savaşa başla').replace('ORDU KİLİTLİ', 'Ordu kilitli').replace('ASKER YOK', 'Asker yok').replace('ASKER SEÇİN', 'Asker seçin').replace('YETERSİZ STAMİNA', 'Yetersiz stamina');

  dom.modalBody.innerHTML = `
    ${entryCardHtml}
    <div class="prebattle-grid">
      ${enemyCardHtml}
      ${armySelectHtml}
    </div>
    <div class="v3-prebattle-aksiyon" style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px; flex-wrap: wrap;">
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
    battlefieldPreBtn.addEventListener('click', () => ekranAc('savasalani'));
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
        const budgetNote = outcome.budgetFull ? ` ⏳ ${GAME_CONFIG.TREASURY_WEEKLY_BUDGET.FULL_MESSAGE}` : '';
        addNotification('🏆', `${monster.name} yenildi! +${adaReward} ASTRA kazandın (⚡ -${staminaCost} Stamina).${budgetNote}${scrollNotice} Savaşa katılan askerlerin +${monster.rewardXp} Asker XP kazandı.${lvlMsg}${wearMsg}`);

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

      // Sonuç ekranı: gerçekten kazanılanlar ve sonraki adım
      const satirlar = [];
      const eylemler = [];
      if (outcome.victory) {
        satirlar.push(entry.rewarded ? `🟣 +${(outcome.adaReward || 0).toLocaleString('tr-TR')} ASTRA` : '🏋️ Antrenman girişi: ASTRA yok');
        satirlar.push(`✨ +${monster.rewardXp} Asker XP`);
        if (outcome.xpGained) satirlar.push(`🧙 +${outcome.xpGained.toLocaleString('tr-TR')} hesap XP`);
        if (outcome.fragmentsGained) satirlar.push(`🧩 +${outcome.fragmentsGained} Teçhizat Parçası`);
        if (outcome.boxGained) satirlar.push(`📦 +${outcome.boxGained} Pandora Kutusu`);
        if (outcome.scrollGained) satirlar.push(`📜 ${outcome.scrollGained.name}`);
        outcome.levelUps.forEach(t => satirlar.push(`🎉 ${t}`));
        if (outcome.weaponsWorn.length) satirlar.push(`⚔️ Silah aşındı: ${outcome.weaponsWorn.join(', ')}`);
        satirlar.push(`⚡ -${staminaCost} Stamina`);
        eylemler.push({ etiket: '⚔️ Kışlaya git', tikla: () => openBarracksModal() });
        const not = outcome.budgetFull ? GAME_CONFIG.TREASURY_WEEKLY_BUDGET.FULL_MESSAGE
          : (outcome.budgetCapped ? 'Bu haftaki ödeme payı sınırı yüzünden ödül azaldı; Pazartesi yenilenir.' : '');
        return { altBaslik: `${monster.name} yenildi`, satirlar, not, eylemler };
      }
      satirlar.push(`💀 ${monster.name}: ${outcome.remainingEnemyHp}/${monster.hp} can kaldı`);
      satirlar.push(`⚡ -${staminaCost} Stamina`);
      eylemler.push({ etiket: '🌾 Askerleri iyileştir', birincil: true, tikla: () => openBarracksModal() });
      eylemler.push({ etiket: '↻ Tekrar dene', tikla: () => openPreBattleModal(monster) });
      return { baslik: '💀 BOZGUN', altBaslik: `${monster.name} karşısında geri çekildin`, satirlar, not: 'Düşmanın kalan canı kaydedildi. Askerlerini iyileştirip yeniden girince kaldığın yerden devam edersin.', eylemler };
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

  // Seferler paneli (v3 "Seferler" düğmesi açar): kota başlığı, toplu hasat, toplu onarım, sefer kartları
  const sidebarQuotaBtn = document.getElementById('sidebar-quota-open');
  if (sidebarQuotaBtn) sidebarQuotaBtn.addEventListener('click', openDailyLimitsModal);

  const sidebar = document.getElementById('realm-sidebar');
  if (sidebar) {
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
      ekranAc('savasalani');
    } else if (zoneId === 'colosseum') {
      openColosseumModal();
    } else if (zoneId === 'warehouse' || zoneId === 'silo') {
      openWarehouseModal();
    } else if (zoneId === 'collection') {
      ekranAc('koleksiyon');
    } else if (zoneId === 'council') {
      openTreasuryVaultModal();
    } else if (zoneId === 'blacksmith') {
      openTownZoneModal('blacksmith', '⚒️ KRALLIK DEMİRCİSİ & TAMİRHANE');
    } else if (zoneId === 'mine') {
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

    // Zindan Mağarasına Gir
    if (e.target.closest('#btn-modal-enter-dungeon')) {
      enterDungeonScene();
      return;
    }

    // Demirci / Tamirhane: Sekme Geçişi
    const mineTabBtn = e.target.closest('.mine-tab-btn');
    if (mineTabBtn) {
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

  });

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
  const btnClose = document.getElementById('btn-close-dev-modal');
  const modal = document.getElementById('dev-modal');

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

  // Klavye Kısayolu: 'T' tuşuna basınca Test Panelini Aç/Kapat (panel yalnız deneme sürümünde sayfada bulunur)
  window.addEventListener('keydown', (e) => {
    if (modal && (e.key === 't' || e.key === 'T')) {
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

      case 'reset-council': {
        const r = gameState.devResetCouncilProjects();
        showToast((r && r.message) || 'Konsey projeleri sıfırlandı.', r && r.success ? 'success' : 'error');
        sound.playPickaxe();
        break;
      }

      case 'finish-council': {
        const r = gameState.devFinishCouncilProjects(amount || 1);
        showToast((r && r.message) || 'Konsey projeleri güncellendi.', r && r.finished > 0 ? 'success' : 'error');
        sound.playLevelUp();
        break;
      }

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
          '5. Krallık Piyango Havuzunu tam 12M ASTRA tohumuna sıfırlar.\n\n' +
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

  if (!dom.modalContainer || !dom.modalContainer.classList.contains('active')) return;

  const adAstra = gameState.state.adAstraBalance || 0;
  const inv = gameState.state.inventory || {};

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

// "Bana göster" düğmesi: hub anahtarına göre ilgili ekranı açar (kilitliyse nedeni zaten görev satırında yazılıdır)
const OGRETICI_KILIT_ESLEMESI = { pazar: 'market', demirhane: 'blacksmith', kisla: 'barracks', zindan: 'dungeon', kolezyum: 'colosseum', karnaval: 'carnival', savasalani: 'battlefield' };
function ogreticiKilit(q) {
  const zone = OGRETICI_KILIT_ESLEMESI[q.show];
  const kilit = zone && gameState.getFeatureLock ? gameState.getFeatureLock(zone) : null;
  return kilit ? kilit.reason : null;
}
function ogreticiGoster(anahtar) {
  closeModal();
  if (anahtar === 'bolge') { openTownZoneModal(ZONE_OF_NODE('wood'), ZONE_TITLE('wood')); return; }
  if (window.__v3 && typeof window.__v3.git === 'function') window.__v3.git(anahtar);
}

function openKrallikYoluModal() {
  gameState.checkOnboardingProgress();
  dom.modalTitle.innerHTML = '<span>🧭</span> <span>Krallık Yolu</span>';
  dom.modalBody.innerHTML = yolHtml(gameState.getOnboardingSections(), ogreticiKilit);
  displayModal();
}

function initPlayerGuide() {
  const el = document.getElementById('guide-widget');
  // Panel içindeki düğmeler (görev ödülü, bölüm ödülü, "Bana göster"); eski panel kodu tıklamaları durdurduğu için yakalama aşaması
  dom.modalBody.addEventListener('click', (e) => {
    if (!e.target.closest('.v3-yol')) return;
    const gorevBtn = e.target.closest('[data-claim-quest]');
    const bolumBtn = e.target.closest('[data-claim-section]');
    const gosterBtn = e.target.closest('[data-ogretici-goster]');
    if (gorevBtn) {
      const res = gameState.claimOnboardingReward(gorevBtn.dataset.claimQuest);
      showToast(res.message, res.success ? 'success' : 'error');
    } else if (bolumBtn) {
      const res = gameState.claimOnboardingSection(bolumBtn.dataset.claimSection);
      showToast(res.message, res.success ? 'success' : 'error');
    } else if (gosterBtn) {
      ogreticiGoster(gosterBtn.dataset.ogreticiGoster);
      return;
    } else return;
    openKrallikYoluModal();
    renderGuideWidget();
    renderTopBar();
  }, true);
  if (el) {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-guide-dismiss]')) {
        gameState.state.guideDismissed = true;
        gameState.saveState();
        renderGuideWidget();
        return;
      }
      openKrallikYoluModal();
    });
  }
  gameState.checkOnboardingProgress();
  renderGuideWidget();
}

function renderGuideWidget() {
  const el = document.getElementById('guide-widget');
  if (!el) return;
  const ozet = yolOzeti(gameState.getOnboardingSections());
  const bitti = ozet.toplam > 0 && !ozet.siradaki && ozet.hazir === 0;
  if (!ozet.toplam || (gameState.state.guideDismissed && ozet.hazir === 0) || bitti) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const pct = Math.round((ozet.biten / ozet.toplam) * 100);
  const alt = ozet.hazir > 0 ? `${ozet.hazir} ödül hazır` : (ozet.siradaki ? ozet.siradaki.title : 'Tüm görevler tamam');
  const html = `
    <button class="guide-head" data-guide-open aria-label="Krallık Yolu'nu aç">
      <span class="guide-icon">🧭</span>
      <span class="guide-head-text">
        <span class="guide-title">Krallık Yolu</span>
        <span class="guide-sub">${alt}</span>
      </span>
      <span class="guide-count">${ozet.biten}/${ozet.toplam}</span>
    </button>
    <div class="guide-progress"><span style="width:${pct}%"></span></div>`;
  if (el.dataset.lastHtml !== html) {
    el.innerHTML = html;
    el.dataset.lastHtml = html;
  }
  el.classList.toggle('has-reward', ozet.hazir > 0);
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
    gameState.checkWeeklyAutonomousBuyback();
    refreshBarracksLiveUI(slowDelta);
    refreshLiveUpgradeCostUI(slowDelta);
    refreshQuotaTrackerUI();
    ekranCanliTik();
    reportStorageEvents();
    }

    if (loopUiAccMs < 250) return;
    loopUiAccMs = 0;
    tickPlayerGuide(currentTime);

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

async function initPhaser() {
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
  let vadiModulu = null;
  if (use3D) {
    vadiModulu = await import('./vadi3d/vadi.js');
    document.body.classList.add('map-3d');
    config.scene = [vadiModulu.VadiBootScene, DungeonScene];   // zindan Phaser'da kalır; kasaba sahnesi hiç açılmaz
  }

  phaserGame = new Phaser.Game(config);
  if (use3D) {
    const host = document.getElementById('vadi3d-container');
    const gal = /[?&]galeri=(\w+)/.exec(location.search);   // geliştirici: model galerisi
    if (gal && host) { import('./vadi3d/galeri.js').then(m => gal[1] === 'binalar' ? m.startBinaGalerisi(host) : m.startGaleri(host, gal[1], Number((/[?&]sayfa=(\d+)/.exec(location.search) || [])[1] || 0))); return; }
    if (host) { try { window.__vadi3d = vadiModulu.startVadi3D(host); } catch (e) { console.error('3B vadi açılamadı, 2B haritaya dönülüyor:', e); document.body.classList.remove('map-3d'); try { localStorage.removeItem('harita'); } catch (e2) { /* yoksay */ } location.reload(); } }
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
      }
    });
  } catch (e) {
    console.warn('Çevrimiçi mod başlatılamadı:', e);
  }
  initPhaser();
  initAppEvents();
  initDevPanelEvents();
  const showDevTools = isOnline ? !!(online.health && online.health.testMode) : DEV_TOOLS;
  if (!showDevTools) {
    ['dev-modal'].forEach(id => document.getElementById(id)?.remove());
  }
  initPlayerGuide();
  renderTopBar();
  const { kurV3Kabuk } = await import('./ui/v3/kabuk.js');
  kurV3Kabuk({
    gameState,
    isAnyModalOpen, closeModal,
    openPanel: ([simge, ad], html) => {
      dom.modalTitle.innerHTML = `<span>${simge}</span> <span>${ad}</span>`;
      dom.modalBody.innerHTML = html;
      displayModal();
    },
    openDashboard: openDashboardModal, openWarehouse: openWarehouseModal, openInventory: openInventoryModal,
    openZone: openTownZoneModal, openTreasury: openTreasuryVaultModal, openKonsey: () => ekranAc('konsey'), openBarracks: openBarracksModal,
    enterDungeon: enterDungeonScene, openColosseum: openColosseumModal, openCarnival: () => ekranAc('karnaval'),
    openCollection: () => ekranAc('koleksiyon'), openEconomy: openEconomyDashboardModal, openLimits: openDailyLimitsModal,
    openChangelog: openChangelogModal, openPalette: openCommandPalette, openDev: openDevModal,
    openWallet: () => {
      if (!online.active) { showToast('🔐 Hesap ve cüzdan, sunucuya bağlı (çevrimiçi) sürümde açılır. Şu an tek kişilik yerel moddasın: kaydın bu tarayıcıda.', 'info'); return; }
      openWalletPanel();
    }, toggleNotif: toggleNotificationPanel,
    duyurular: () => GAME_CONFIG.ANNOUNCEMENTS || [],
    hesapAnahtari: () => (online.active && online.playerId) || 'yerel',
    cevrimici: () => !!online.active,
    senkronYasi: () => (online.active && online.lastSync ? Date.now() - online.lastSync : 0),
    bildir: (m, t) => showToast(m, t),
    hudYenile: () => renderTopBar(),
    hudVeri: hudVerisi,
    openKaynak: (k) => openTownZoneModal(ZONE_OF_NODE(k), ZONE_TITLE(k)),
    openOgretici: openKrallikYoluModal,
    turBitti: () => ogreticiGor('tur'),
    danismanEylemi,
    kaynakSimge: (k) => resImg(k, k === 'fragments' ? '🧩' : ((RES_META()[k] || {}).icon || '')),
    // Test laboratuvarının "ilk güne döndür" düğmesi (onayı laboratuvar kendi penceresinde alır)
    vanillaSifirla: async () => {
      if (online.active) {
        try {
          const r = await devVanillaReset();
          if (r && r.ok) { showToast('🏛️ Sunucu ilk güne döndü; sayfa yenileniyor…', 'success'); setTimeout(() => location.reload(), 1200); }
          else showToast('Sıfırlama yapılamadı: ' + ((r && r.message) || 'sunucu kabul etmedi'), 'error');
        } catch (err) { showToast('Sıfırlama yapılamadı: ' + err.message, 'error'); }
        return;
      }
      gameState.vanillaReset();
      showToast('🏛️ Oyun ilk güne döndü; sayfa yenileniyor…', 'success');
      renderTopBar();
      setTimeout(() => location.reload(), 900);
    }
  });
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

