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
import { PLAYER_SKILLS } from './combat.js';
import { AdAstraBattleArena, getMonsterAvatar } from './battleArena.js';
import { renderQuotaTracker, formatDuration, fmtInt } from './ui/limits.js';
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
  return isRpg || document.body.classList.contains('modal-open');
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
  document.body.classList.remove('modal-open');
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
  canavarResmi: (seviye, ad) => getMonsterAvatar(seviye, ad),
  bildirimEkle: (simge, metin) => addNotification(simge, metin),
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
    ekranAc('savashazirlik', { canavar: monster });
  });

  window.addEventListener('toast-notify', (e) => {
    const { message, type } = e.detail;
    showToast(message, type);
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
    }

    gameState.runTavernaAutomationCycle();
    gameState.processSoldierPassiveHealing(slowDelta);
    if (gameState.processVillage) gameState.processVillage(slowDelta);
    gameState.tickUpgradeCostBot(slowDelta);
    gameState.checkWeeklyAutonomousBuyback();
    refreshBarracksLiveUI(slowDelta);
    refreshQuotaTrackerUI();
    ekranCanliTik();
    reportStorageEvents();
    }

    if (loopUiAccMs < 250) return;
    loopUiAccMs = 0;
    tickPlayerGuide(currentTime);

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
  // Test laboratuvarı yalnız geliştirme sunucusunda (npm run dev) ve deneme sunucusunda (TEST_MODE) açılır
  const testSurumu = isOnline ? !!(online.health && online.health.testMode) : DEV_TOOLS;
  initPlayerGuide();
  renderTopBar();
  const { kurV3Kabuk } = await import('./ui/v3/kabuk.js');
  kurV3Kabuk({
    gameState, testSurumu,
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
    openChangelog: openChangelogModal, openPalette: openCommandPalette,
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
      renderTopBar();
    });
  }

  lastTickTime = performance.now();
  requestAnimationFrame(uiGameLoop);
  runCinematicLoadingSequence();
});

