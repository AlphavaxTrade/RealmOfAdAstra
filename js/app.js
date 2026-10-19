// Realm of AdAstra — oyunun kabuğu: açılış, oyun döngüsü, ekranlara verilen bağlam ve harita sahnesi.
// 11 Ekim 2026'da baştan yazıldı. Ekranların kendisi js/ui/ekran/*, üst çubuk ve gezinme js/ui/v3/*, küçük arayüz parçaları js/ui/*.js içindedir.
import Phaser from 'phaser';
import { GAME_CONFIG } from './config.js';
import { gameState } from './gameState.js';
import { globalPool } from './globalPool.js';
import { ammMarket } from './ammMarket.js';
import { GrandTownScene } from './grandTownScene.js';
// 3B vadi (three.js, yalnız ?harita=3d ile) gerektiğinde yüklenir: 2B haritada her açılışta ~155 KB (sıkıştırılmış) three indirilmez
import { SavasArenasi, canavarResmi } from './ui/arena.js';
import { consumeStorageEvents, CORRUPT_SUFFIX } from './storage.js';
import { treasury } from './treasury.js';
import { resImg } from './ui/art.js';
import { startOnline, openWalletPanel, online, pvp, pazar, sponsor, geriBildirim, isLoggedIn, requireLogin, devVanillaReset } from './net/online.js';
import { ac as ekranAc, baglamKur as ekranBaglamKur, canliTik as ekranCanliTik } from './ui/ekran/index.js';
import { kurPencere } from './ui/pencere.js';
import { kurToast } from './ui/toast.js';
import { kurYukleme } from './ui/yukleme.js';
import { kurZindan } from './ui/zindan/ekran.js';
import { hudVerisi } from './ui/hud-verisi.js';
import { kurBildirimler } from './ui/v3/bildirim.js';
import { surumBildirimi, surumuGoruldu } from './ui/v3/surum-bildirim.js';
import { kurKapiSeridi } from './ui/kapi-seridi.js';
import { kurYol } from './ui/yol.js';

// 🧪 Test menüsü yalnızca geliştirme sunucusunda (npm run dev) açılır; yayına çıkan sürümde oyuncular göremez.
const DEV_TOOLS = !!(import.meta.env && import.meta.env.DEV);

// Konsoldan oyun nesnelerine erişim yalnız geliştirme ve deneme sürümünde (üretimde elle hile yolu açılmasın)
if (DEV_TOOLS) { window.gameState = gameState; window.globalPool = globalPool; }

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Panel, bildirim kutusu, zindan ekranı
// ---------------------------------------------------------------------------
const pencere = kurPencere({ kok: $('rpg-modal'), baslik: $('modal-title'), govde: $('modal-body'), kapatDugme: $('btn-close-modal') });
const bildir = kurToast($('toast-container'));
const closeModal = () => pencere.kapat();
// Panel ya da savaş arenası açıksa harita dokunuşları durur
const isAnyModalOpen = () => pencere.acikMi() || document.body.classList.contains('modal-open');

let phaserGame = null;
const zindan = kurZindan({ gs: gameState, phaser: () => phaserGame, panelKapat: closeModal, bildir, ekranAc });

const bildirimler = kurBildirimler({
  botUyarisi: () => gameState.getBotResourceDeficitWarning(),
  degisti: () => { if (window.__v3) window.__v3.guncelle(); },   // zil sayısı hudVeri().bildirim'den gelir
  ilk: { simge: '🏰', metin: 'AdAstra Krallığına hoş geldin! Krallığını büyütmek için sefere çık.' },
  git: (ekran) => ekranAc(ekran),                                  // bildirimdeki "Oku" gibi düğmeler
  eylemKapandi: (eylem) => { if (eylem.ekran === 'surum') surumuGoruldu(GAME_CONFIG.CHANGELOG); }
});

// ---------------------------------------------------------------------------
// Canlı savaş arenası (zindan ve Kolezyum savaşlarının yeniden oynatımı)
// ---------------------------------------------------------------------------
let arena = null;
function arenaBaslat(savas) {
  const kok = $('battle-arena-modal');
  if (!kok) return false;
  if (!arena) arena = new SavasArenasi(kok);
  closeModal();
  kok.classList.add('active');
  document.body.classList.add('modal-open');
  arena.startBattle(savas);
  return true;
}

// ---------------------------------------------------------------------------
// Bölgeler ve kaynak alanları
// ---------------------------------------------------------------------------
const RES_KEYS = () => GAME_CONFIG.RESOURCE_KEYS;
const RES_META = () => GAME_CONFIG.RESOURCE_META || {};
const bolgeOf = (kaynak) => (RES_META()[kaynak] || {}).zone || kaynak;
const kaynakOfBolge = (bolge) => RES_KEYS().find((k) => bolgeOf(k) === bolge) || null;

// Harita bölge kimliği → ekran kimliği (kaynak bölgeleri ayrıca 'bolge' ekranıyla açılır)
const BOLGE_EKRANI = { barracks: 'kisla', village: 'koy', healer: 'sifahane', spaceport: 'uzay', tavern: 'taverna', blacksmith: 'demirhane', market: 'pazar', battlefield: 'savasalani', colosseum: 'kolezyum', council: 'konsey', carnival: 'karnaval' };

function bolgeAc(bolge) {
  if (!zindan.kapiAcikMi(bolge)) return;
  if (BOLGE_EKRANI[bolge]) { ekranAc(BOLGE_EKRANI[bolge]); return; }
  const kaynak = kaynakOfBolge(bolge);
  if (kaynak) { ekranAc('bolge', { kaynak }); return; }
  bildir('Bu bölge şu an açılamıyor.', 'info');
}

// ---------------------------------------------------------------------------
// Öğretici (Krallık Yolu): ekranların "görüldü" bildirimi ve görev paneli
// ---------------------------------------------------------------------------
const gorulenler = new Set();   // oturumda bir kez bildirilir; asıl kayıt oyun durumundadır
function goruldu(anahtar) {
  if (gorulenler.has(anahtar)) return;
  // Çevrimiçi modda giriş yapmamış (misafir) ya da bekleme sırasındaki hesap sunucuya işlem gönderemez: ekranı gezmek
  // giriş penceresini açmasın ya da hata bildirimi üretmesin; giriş yapınca ekran yeniden çizildiğinde bildirilir
  if (online.active && (!isLoggedIn() || (online.gate && online.gate.status && !['citizen', 'new'].includes(online.gate.status)))) return;
  gorulenler.add(anahtar);
  gameState.ogreticiGordu(anahtar);
}

let yol = null;   // çevrimiçi durum yüklendikten sonra kurulur (açılışta)

// ---------------------------------------------------------------------------
// Kralın danışmanı, üst çubuk verisi
// ---------------------------------------------------------------------------
let danisman = null;

function danismanEylemi(eylem) {
  if (eylem === 'sweep_harvest') {
    const sonuc = gameState.claimAllHarvests();
    bildir(sonuc.message, sonuc.success ? 'success' : 'info');
    renderTopBar();
  } else if (eylem === 'open_barracks') {
    ekranAc('kisla');
  } else if (eylem === 'open_blacksmith') {
    bolgeAc('blacksmith');
  } else if (eylem === 'open_dungeon') {
    zindan.gir();
  } else {
    ekranAc('merkez');   // 'open_dashboard' ve bilinmeyen eylemler
  }
}

const hudVeri = () => hudVerisi({
  gs: gameState,
  kaynaklar: RES_KEYS(),
  okunmamis: bildirimler.sayi() + (gameState.getBotResourceDeficitWarning() ? 1 : 0),
  danisman: danisman || gameState.getRoyalAdvisorAdvice(),
  darEkran: window.innerWidth <= 520
});

function renderTopBar() {
  danisman = gameState.getRoyalAdvisorAdvice();   // hudVeri() aynı öneriyi tekrar hesaplamadan kullanır
  if (window.__v3) window.__v3.guncelle();
}

// ---------------------------------------------------------------------------
// Ekranların oyunla konuştuğu bağlam
// ---------------------------------------------------------------------------
ekranBaglamKur({
  gameState, GAME_CONFIG, globalPool, ammMarket, treasury,
  get online() { return online; },
  get pazar() { return pazar; },
  get sponsor() { return sponsor; },
  get pvp() { return pvp; },
  get geriBildirim() { return geriBildirim; },
  girisli: () => isLoggedIn(),
  girisIste: () => requireLogin(),
  bildir,
  hudYenile: () => renderTopBar(),
  panelKok: () => pencere.govde,
  panelAcik: () => pencere.acikMi(),
  panelKapat: closeModal,
  panelYaz: (baslik, html) => pencere.yaz(baslik, html),
  kilit: (anahtar) => gameState.getFeatureLock(anahtar),
  canavarResmi,
  bildirimEkle: (simge, metin) => bildirimler.ekle(simge, metin),
  goruldu,
  arenaBaslat,
  // Yeni ekrana taşınmamış bölümler için köprü
  eskiAc: (id) => {
    const eski = {
      zindan: () => zindan.gir(),
      rehber: () => yol.panelAc()
    };
    if (!eski[id]) return false;
    eski[id]();
    return true;
  }
});

// ---------------------------------------------------------------------------
// Kayıt kurtarma ve yazma hatalarını oyuncuya bildir (her hata türü oturumda bir kez)
// ---------------------------------------------------------------------------
const bildirilenKayitSorunlari = new Set();
function kayitOlaylariniBildir() {
  for (const olay of consumeStorageEvents()) {
    const kimlik = olay.type + olay.key;
    if (bildirilenKayitSorunlari.has(kimlik)) continue;
    bildirilenKayitSorunlari.add(kimlik);
    if (olay.type === 'recovered') {
      bildir(`💾 Kayıt dosyası okunamadı; oyun son sağlam yedekten açıldı. Bozuk kopya "${olay.key}${CORRUPT_SUFFIX}" adıyla saklandı.`, 'warning');
    } else if (olay.type === 'lost') {
      bildir(`⚠️ Kayıt dosyası okunamadı ve yedek bulunamadı; oyun yeni profille açıldı. Bozuk kopya "${olay.key}${CORRUPT_SUFFIX}" adıyla saklandı.`, 'error');
    } else if (olay.type === 'write-failed') {
      bildir('⚠️ İlerleme kaydedilemedi: tarayıcının depolama alanı dolu olabilir.', 'error');
    }
  }
}

// ---------------------------------------------------------------------------
// Pencere olayları: harita sahneleri arayüzle bu olaylar üzerinden konuşur
// ---------------------------------------------------------------------------
function olaylariBagla() {
  zindan.bagla();

  window.addEventListener('open-town-modal', (e) => {
    const { zoneId } = e.detail;
    if (zoneId === 'dungeon') zindan.gir();
    else if (zoneId === 'warehouse' || zoneId === 'silo') ekranAc('silo');
    else if (zoneId === 'collection') ekranAc('koleksiyon');
    else bolgeAc(zoneId);
  });

  window.addEventListener('toast-notify', (e) => { if (e.detail && typeof e.detail.message === 'string') bildir(e.detail.message, e.detail.type); });
}

// ---------------------------------------------------------------------------
// Oyun döngüsü: her karede stamina ve sefer ilerlemesi; saniyede 4 kez ekran sayaçları; saniyede 1 kez bot, iyileşme, fiyatlar
// ---------------------------------------------------------------------------
let sonKareZamani = performance.now();
let yavasBirikimMs = 0;
let yavasBirikimSn = 0;
let arayuzBirikimMs = 0;
let sonRehberTiki = -Infinity;

function cevrimdisiRaporuAc() {
  const rapor = gameState.state.offlineReport;
  if (!rapor) return;
  gameState.state.offlineReport = null;
  gameState.saveState();
  ekranAc('cevrimdisi', { rapor });
}

function rehberTiki(simdi) {
  // Oyun motorunun bıraktığı bildirimler kısa mesaj olarak gösterilir
  // Hem kısa mesaj (toast) hem zil panelinde KALICI kayıt: kolezyum maç sonucu gibi sunucu bildirimleri 3,5 sn sonra kaybolup
  // oyuncunun elinde hiçbir iz bırakmasın (denetim 2. tur notu). Toast yığını için yalnız son 4 gösterilir, hepsi zile yazılır.
  const bildirimSimgesi = { success: '✨', error: '⚠️', warning: '⚠️' };
  const gelenler = gameState.consumeNotices();
  gelenler.slice(-4).forEach((n) => bildir(n.message, n.type || 'info'));
  gelenler.forEach((n) => bildirimler.ekle(bildirimSimgesi[n.type] || '🔔', n.message));

  if (simdi - sonRehberTiki < 2000) return;
  sonRehberTiki = simdi;
  try { gameState.processScheduledLottery(); } catch (e) { console.warn('Piyango takvimi:', e); }
  try { gameState.processEconomyTick(); } catch (e) { console.warn('Ekonomi döngüsü:', e); }
  gameState.checkOnboardingProgress();
  if (yol) yol.kutuCiz();
  if (gameState.state.offlineReport && !isAnyModalOpen()) cevrimdisiRaporuAc();
}

function oyunDongusu(simdi) {
  try {
    const gecenMs = Math.min(10000, Math.max(0, simdi - sonKareZamani));
    sonKareZamani = simdi;
    const gecenSn = gecenMs / 1000;

    gameState.regenerateStamina(gecenSn);
    gameState.updateExpeditions(gecenSn);

    yavasBirikimMs += gecenMs;
    yavasBirikimSn += gecenSn;
    arayuzBirikimMs += gecenMs;

    if (yavasBirikimMs >= 1000) {
      const yavasSn = yavasBirikimSn;
      yavasBirikimMs = 0;
      yavasBirikimSn = 0;
      const bot = gameState.updateBotPauseState();
      if (bot && bot.justResumed) bildir('🟢 Gerekli tüm kaynaklar tamamlandı! 24s Otomasyon Botu anında devreye girdi.', 'success');
      if (bot && bot.justRenewed) {
        bildir('🔄 24 saat tamamlandı! Bot otomatik olarak yeniden satın alındı ve bir 24 saat daha devam ediyor.', 'success');
        renderTopBar();
      }
      gameState.runTavernaAutomationCycle();
      gameState.processSoldierPassiveHealing(yavasSn);
      gameState.processVillage(yavasSn);
      gameState.checkWeeklyAutonomousBuyback();
      ekranCanliTik();
      kapiSeridi.ciz();
      kayitOlaylariniBildir();
    }

    if (arayuzBirikimMs < 250) return;
    arayuzBirikimMs = 0;
    rehberTiki(simdi);
    renderTopBar();
  } catch (hata) {
    console.error('oyunDongusu hatası:', hata);
  } finally {
    requestAnimationFrame(oyunDongusu);
  }
}

// ---------------------------------------------------------------------------
// Harita sahnesi (Phaser; 3B vadi isteğe bağlı)
// ---------------------------------------------------------------------------
function sahneBoyutu() {
  const kap = $('phaser-game-container');
  return {
    w: Math.max(320, (kap && kap.clientWidth) || window.innerWidth),
    h: Math.max(300, (kap && kap.clientHeight) || (window.innerHeight - 92))
  };
}
window.getStageSize = sahneBoyutu;

async function haritayiBaslat() {
  const { w, h } = sahneBoyutu();
  const ayar = {
    type: Phaser.CANVAS,           // WebGL sessizce başarısız olabildiği için tuval zorlanır
    parent: 'phaser-game-container',
    width: w,
    height: h,
    backgroundColor: '#1a0f08',
    render: { antialias: true, pixelArt: false, roundPixels: false, transparent: false, clearBeforeRender: true, powerPreference: 'default' },
    scene: [GrandTownScene]
  };

  // 2B piksel harita varsayılan (kullanıcı kararı 7 Ekim: 3B vadi rafa kalktı); 3B deneme ?harita=3d ile ya da localStorage 'harita'='3d' ile
  let uc3d = false;
  try { uc3d = /[?&]harita=3d/.test(location.search) || localStorage.getItem('harita') === '3d'; } catch { /* depolama kapalı */ }
  let vadi = null;
  if (uc3d) {
    vadi = await import('./vadi3d/vadi.js');
    document.body.classList.add('map-3d');
    ayar.scene = [vadi.VadiBootScene];   // kasaba sahnesi hiç açılmaz
  }

  phaserGame = new Phaser.Game(ayar);
  if (uc3d) {
    const kap = $('vadi3d-container');
    const galeri = /[?&]galeri=(\w+)/.exec(location.search);   // geliştirici: model galerisi
    if (galeri && kap) {
      const sayfa = Number((/[?&]sayfa=(\d+)/.exec(location.search) || [])[1] || 0);
      import('./vadi3d/galeri.js').then((m) => (galeri[1] === 'binalar' ? m.startBinaGalerisi(kap) : m.startGaleri(kap, galeri[1], sayfa)));
      return;
    }
    if (kap) {
      try {
        window.__vadi3d = vadi.startVadi3D(kap);
      } catch (hata) {
        // Yeniden yüklemek ?harita=3d adresiyle aynı hatayı sonsuza dek tekrarlardı: 2B harita yeniden yüklemeden kurulur
        console.error('3B vadi açılamadı, 2B haritaya dönülüyor:', hata);
        document.body.classList.remove('map-3d');
        try { localStorage.removeItem('harita'); } catch { /* yoksay */ }
        try { phaserGame.destroy(true); } catch { /* sahne yoktu */ }
        phaserGame = new Phaser.Game({ ...ayar, scene: [GrandTownScene] });
      }
    }
  }

  phaserGame.events.once('ready', () => {
    if (phaserGame && phaserGame.scale) {
      const boyut = sahneBoyutu();
      phaserGame.scale.resize(boyut.w, boyut.h);
    }
    if (window.__finishLoadingBar) window.__finishLoadingBar();
  });

  window.addEventListener('resize', () => {
    if (!phaserGame || !phaserGame.scale) return;
    const boyut = sahneBoyutu();
    phaserGame.scale.resize(boyut.w, boyut.h);
  });
}

// ---------------------------------------------------------------------------
// Kapı kuralı şeridi (bekleme sırası, askı, izin soruları)
// ---------------------------------------------------------------------------
const kapiSeridi = kurKapiSeridi({
  el: $('gate-banner'),
  kaynaklar: () => ({
    kapi: online.gate,
    katilim: gameState.state && gameState.state.katilim,
    hazirAday: (gameState.state && gameState.state.candidateReady) || {},
    gorevIdleri: (GAME_CONFIG.KAPI && GAME_CONFIG.KAPI.READY_TASK_IDS) || []
  }),
  eylemler: {
    gorev: (kimlik) => gameState.misafirGorevTamamla(kimlik),
    izinCevapla: (evet) => gameState.cevaplaIzinSorusu(evet),
    izinBitir: () => gameState.bitirIzin()
  }
});

// ---------------------------------------------------------------------------
// Açılış
// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  // 🌐 Oyun bir Realm of AdAstra sunucusundan açıldıysa çevrimiçi mod: hesapla giriş, kayıt sunucuda.
  // Sunucu yoksa (bilgisayardaki deneme modu) oyun eskisi gibi tarayıcıda çalışır.
  let cevrimici = false;
  try {
    cevrimici = await startOnline({
      gameState, ammMarket, treasury, globalPool,
      toast: bildir,
      onApplied: () => {
        try { renderTopBar(); } catch { /* ilk açılış */ }
        try { kapiSeridi.ciz(); } catch { /* şerit henüz yok */ }
      }
    });
  } catch (hata) {
    console.warn('Çevrimiçi mod başlatılamadı:', hata);
  }
  haritayiBaslat();
  olaylariBagla();
  // Test laboratuvarı yalnız geliştirme sunucusunda (npm run dev) ve deneme sunucusunda (TEST_MODE) açılır
  const testSurumu = cevrimici ? !!(online.health && online.health.testMode) : DEV_TOOLS;
  if (testSurumu) { window.gameState = gameState; window.globalPool = globalPool; }   // tarayıcı denetim betikleri için
  if (!cevrimici && online.sunucuBeklendi) {
    bildir('⚠️ Sunucuya ulaşılamadı: şu an tek kişilik yerel moddasın. İlerlemen yalnız bu tarayıcıda kalır, sunucudaki hesabına yazılmaz. Sayfayı yenilemeyi dene.', 'error');
  }

  yol = kurYol({
    gs: gameState, bildir,
    panelYaz: (baslik, html) => pencere.yaz(baslik, html),
    panelKok: () => pencere.govde,
    panelKapat: closeModal,
    git: (anahtar) => {
      if (anahtar === 'bolge') bolgeAc(bolgeOf('wood'));
      else if (window.__v3) window.__v3.git(anahtar);
    },
    hudYenile: renderTopBar,
    kutu: $('guide-widget')
  });
  renderTopBar();

  // Yeni sürüm geldiyse zil panelinde haber ver ("Oku" düğmesi Sürüm geçmişini açar)
  const yeniSurum = surumBildirimi(GAME_CONFIG.CHANGELOG, { yeniOyuncu: (gameState.state.level || 1) <= 1 });
  if (yeniSurum) {
    bildirimler.ekle(yeniSurum.simge, yeniSurum.metin, yeniSurum.eylem);
    bildir(`🆕 ${yeniSurum.metin} Zil panelinden okuyabilirsin.`, 'info');
  }

  const { kurV3Kabuk } = await import('./ui/v3/kabuk.js');
  kurV3Kabuk({
    gameState, testSurumu,
    isAnyModalOpen, closeModal,
    openPanel: (baslik, html) => pencere.yaz(baslik, html),
    ekranAc,
    zindanGir: zindan.gir,
    openKaynak: (kaynak) => ekranAc('bolge', { kaynak }),
    openOgretici: () => yol.panelAc(),
    openWallet: () => {
      if (!online.active) { bildir('🔐 Hesap ve cüzdan, sunucuya bağlı (çevrimiçi) sürümde açılır. Şu an tek kişilik yerel moddasın: kaydın bu tarayıcıda.', 'info'); return; }
      openWalletPanel();
    },
    toggleNotif: () => bildirimler.degistir(),
    duyurular: () => GAME_CONFIG.ANNOUNCEMENTS || [],
    hesapAnahtari: () => (online.active && online.playerId) || 'yerel',
    cevrimici: () => !!online.active,
    senkronYasi: () => (online.active && online.lastSync ? Date.now() - online.lastSync : 0),
    bildir,
    hudYenile: renderTopBar,
    hudVeri,
    turBitti: () => goruldu('tur'),
    danismanEylemi,
    kaynakSimge: (k) => resImg(k, k === 'fragments' ? '🧩' : ((RES_META()[k] || {}).icon || '')),
    // Test laboratuvarının "ilk güne döndür" düğmesi (onayı laboratuvar kendi penceresinde alır)
    vanillaSifirla: async () => {
      if (online.active) {
        try {
          const sonuc = await devVanillaReset();
          if (sonuc && sonuc.ok) { bildir('🏛️ Sunucu ilk güne döndü; sayfa yenileniyor…', 'success'); setTimeout(() => location.reload(), 1200); }
          else bildir('Sıfırlama yapılamadı: ' + ((sonuc && sonuc.message) || 'sunucu kabul etmedi'), 'error');
        } catch (hata) { bildir('Sıfırlama yapılamadı: ' + hata.message, 'error'); }
        return;
      }
      gameState.vanillaReset();
      bildir('🏛️ Oyun ilk güne döndü; sayfa yenileniyor…', 'success');
      renderTopBar();
      setTimeout(() => location.reload(), 900);
    }
  });
  renderTopBar();
  kapiSeridi.ciz();

  // 🏛️ Havuz fiyatı değişince maliyetler anında yenilenir
  ammMarket.subscribe(() => {
    if (gameState._isFastForwarding) return;
    renderTopBar();
  });

  sonKareZamani = performance.now();
  requestAnimationFrame(oyunDongusu);
  kurYukleme({ perde: $('loading-screen'), dolgu: $('loading-bar-fill'), yuzde: $('loading-percentage'), soz: $('loading-quote') });
});
