// Realm of AdAstra — çevrimiçi mod (oyun sunucudan açıldığında)
// ============================================================================
// Oyun bir Realm of AdAstra sunucusundan açılırsa (/api/health yanıt verirse) çevrimiçi moda geçer:
//  • Oyuncu cüzdanıyla (Core / MetaMask) imza atarak girer; şifre yoktur.
//  • Kayıt sunucudadır. Normal işlemler ekranda hemen görünür ve arkadan sunucuya gider; sunucunun
//    yanıtı her zaman son sözdür (tarayıcıdaki kopya sunucununkiyle değiştirilir).
//  • Şanslı işlemlerin (savaş, çark, kutu, teçhizat yapımı) sonucunu yalnız sunucu belirler; tarayıcı bekler.
//  • Pazar, hazine ve haftalık kota bütün oyuncular için ortaktır ve sunucudan gelir.
// Sunucu yoksa (bilgisayardaki deneme modu) hiçbir şey değişmez: oyun eskisi gibi tarayıcıda çalışır.
// ============================================================================
import { ACTIONS, DEV_ACTIONS, MISAFIR_ACTIONS } from '../../server/actions.js';
import { GAME_CONFIG } from '../config.js';
import { applyRates } from '../economy/rates.js';
import { etiketHtml, odemeOzeti, adresDenetle, sabitAdresler, izinIstenecek, yuklemeHatasiMetni } from './online-yardim.js';
import { basariBildirimiGeriAl } from '../ui/toast.js';

const SESSION_KEY = 'adastra_session_v1';
// Zamanla ilerleyen işler: tarayıcıda yalnız görüntü için çalışır, sunucuya gönderilmez (sunucu kendisi işler)
const LOCAL_ONLY = ['runTavernaAutomationCycle', 'updateExpeditions', 'regenerateStamina', 'processSoldierPassiveHealing',
  'updateBotPauseState', 'checkWeeklyAutonomousBuyback', 'processEconomyTick', 'processScheduledLottery',
  'processOfflineProgress', 'simulateTimePassage', 'checkOnboardingProgress', 'checkAndProcessBotAutoRenew'];
// Yalnız tarayıcıya ait arayüz tercihleri: sunucu kaydı bunları ezmez
const CLIENT_KEYS = ['guideDismissed'];

// yuklemeHatasi: oturum açık ama hesabın durumu sunucudan alınamadı (denetim QA-09). Bu sürede işlemler engellenir,
// oturum DÜŞÜRÜLMEZ ve oyuncuya "yeniden dene" kartı gösterilir; boş misafir oyuna sessizce düşülmez.
// agKopuk: son istek ağ hatasıyla bitti (sunucuya hiç gitmedi); başarılı ilk yanıtla kalkar.
export const online = { active: false, address: null, pending: 0, lastSync: 0, yuklemeHatasi: null, agKopuk: false, hizBeklemeMs: [700, 1500, 3000] };
let ctx = null;            // { gameState, ammMarket, treasury, globalPool, toast, onApplied }
let token = null;

const short = a => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
const fmt = v => Math.floor(Number(v) || 0).toLocaleString('tr-TR');

// Oyun sunucusunun adresi. Oyun dosyaları başka bir yerden (ör. realmofadastra.vercel.app) sunulunca derlemede
// VITE_API_URL ile verilir (https://sunucu-adresi); boşsa oyun, açıldığı adresteki sunucuyu kullanır.
const API_BASE = String((import.meta.env && import.meta.env.VITE_API_URL) || '').replace(/\/+$/, '');

// Hiçbir ağ isteği sonsuza dek asılı kalmaz: yanıt gelmezse istek iptal edilir (asılı bir istek işlem kuyruğunu tıkar,
// eşitlemeyi durdurur, açılışta oyunu hiç başlatmazdı)
const ZAMAN_ASIMI_MS = 20000;
const AG_YOK_MESAJI = 'İnternet bağlantın yok ya da sunucuya ulaşılamıyor; işlem kaydedilmedi. Bağlantın gelince tekrar dene.';
async function fetchZamanAsimli(url, secenek, ms = ZAMAN_ASIMI_MS) {
  const kontrol = new AbortController();
  const zamanlayici = setTimeout(() => kontrol.abort(), ms);
  try {
    const yanit = await fetch(url, { ...secenek, signal: kontrol.signal });
    online.agKopuk = false;
    return yanit;
  } catch (err) {
    online.agKopuk = true;
    if (err && err.name === 'AbortError') {
      const e = new Error('Sunucuya ulaşılamadı (zaman aşımı). Bağlantını kontrol edip tekrar dene.');
      e.status = 0;
      e.ag = true;
      throw e;
    }
    // Ağ yok / sunucu kapalı: tarayıcının İngilizce "Failed to fetch" metni oyuncuya gösterilmesin (denetim QA-08)
    const e = new Error(AG_YOK_MESAJI);
    e.status = 0;
    e.ag = true;
    throw e;
  } finally {
    clearTimeout(zamanlayici);
  }
}

// 429 (hız sınırı) isteği sunucu işlemeden ÖNCE reddeder: güvenle yeniden denenebilir. Hızlı üst üste basışlar (ya da bir ekranın
// art arda eylemleri) kaybolmasın diye kısa beklemelerle 3 kez denenir; yine olmazsa oyuncuya anlaşılır mesaj gider (denetim 2. tur).
const HIZ_MESAJI = 'Çok hızlı işlem yaptın; bu işlem kaydedilmedi. Biraz yavaşlayıp tekrar dene.';
async function apiYavasla(method, path, body) {
  for (let i = 0; ; i++) {
    try { return await api(method, path, body); } catch (err) {
      const bekleme = online.hizBeklemeMs;
      if (err.status !== 429 || i >= bekleme.length) throw err;
      await new Promise((coz) => setTimeout(coz, bekleme[i]));
    }
  }
}

async function api(method, path, body) {
  const res = await fetchZamanAsimli(API_BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Sunucu yanıtı: ${res.status}`);
    err.status = res.status;
    err.need2fa = !!(data && data.need2fa);
    throw err;
  }
  return data;
}

export async function detectServer() {
  try {
    const r = await fetchZamanAsimli(API_BASE + '/api/health', { cache: 'no-store' }, 6000);
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.ok ? j : null;
  } catch {
    return null;
  }
}

// ── Yerel bildirim yankısı (denetim QA-15) ───────────────────────────────
// Normal bir işlem önce yerelde uygulanır (örn. ogreticiGordu → "Görev tamamlandı" bildirimi) ve oyun döngüsü bildirimi hemen
// gösterir; sunucu aynı işlemi çalıştırıp AYNI bildirimi yanıtında geri yollar (sunucu bildirimi bir kez teslim eder). Yanıt gecikince
// ikinci bir bildirim çıkıyordu. Yerelde üretilen bildirimlerin metni kısa süre hatırlanır; sunucu yanıtındaki aynı metin atılır.
// Yalnız sunucuda doğan bildirimler (kabul, çevrimdışı olaylar) etkilenmez.
const yerelBildirimler = new Map();   // metin → üretildiği an
const YANKI_OMRU_MS = 60000;
const yerelBildirimOnce = (gs) => new Set((gs.state && Array.isArray(gs.state.pendingNotices) && gs.state.pendingNotices) || []);
function yerelBildirimKaydet(gs, onceki) {
  const liste = gs.state && gs.state.pendingNotices;
  const yeni = [];
  if (!Array.isArray(liste)) return yeni;
  const simdi = Date.now();
  for (const n of liste) if (n && n.message && !onceki.has(n)) { yerelBildirimler.set(n.message, simdi); yeni.push(n.message); }
  return yeni;
}
// Sunucu işlemi kabul etmediyse (ağ koptu, sunucu çöktü, kural reddi) yerelde üretilen "Görev tamamlandı +5 ASTRA" gibi başarı
// bildirimi yanlıştır: henüz gösterilmediyse kuyruktan düşülür, gösterildiyse ekrandan kaldırılır (denetim QA-08 kalanı).
// Yalnız o işlemin ürettiği metinler gider; başka işlemlerin gerçek bildirimlerine dokunulmaz. Hata bildirimi ayrıca gösterilir.
function yerelBasariyiGeriAl(mesajlar) {
  if (!mesajlar || !mesajlar.length) return;
  const gs = ctx && ctx.gameState;
  if (gs && gs.state && Array.isArray(gs.state.pendingNotices)) {
    gs.state.pendingNotices = gs.state.pendingNotices.filter((n) => !(n && mesajlar.includes(n.message)));
  }
  for (const m of mesajlar) yerelBildirimler.delete(m);
  try { basariBildirimiGeriAl(mesajlar); } catch { /* arayüz yok */ }
}
// Yerel motor da bildirir: görev tespiti (checkOnboardingProgress), bot yenileme, ekonomi tiki... tarayıcıda her 2 sn çalışır, sunucuda
// bir sonraki istekte AYNI olayı yeniden bulur. Yerel kopya gösterildikten sonra sunucunun kopyası (ya da tersi) ikinci bildirim
// çıkarıyordu (denetim 2. tur: çark/Taverna sonrası "Görev tamamlandı" iki kez). Gösterim anında yakalanır: aynı metin, kaynak
// değişince 60 sn içinde bir kez sayılır. Kaynak: sunucu yanıtındaki nesneler WeakSet'te işaretlidir, yerel motorunkiler değildir.
const sunucuBildirimleri = new WeakSet();   // /api/state ve /api/action yanıtındaki bildirim nesneleri
const sunucuGosterilen = new Map();         // metin → an (sunucudan gelip gösterilen)
function bildirimleriSuz(liste) {
  if (!Array.isArray(liste) || !liste.length) return liste;
  const simdi = Date.now();
  for (const [m, an] of sunucuGosterilen) if (simdi - an > YANKI_OMRU_MS) sunucuGosterilen.delete(m);
  for (const [m, an] of yerelBildirimler) if (simdi - an > YANKI_OMRU_MS) yerelBildirimler.delete(m);
  return liste.filter((n) => {
    if (!n || !n.message) return true;
    if (sunucuBildirimleri.has(n)) {
      // sunucu kopyası: aynı metin yerelde az önce gösterildiyse bu bir yankıdır (apply zaten yerel kopyaları eler; bu geç gelenler içindir)
      if (yerelBildirimler.has(n.message)) { yerelBildirimler.delete(n.message); return false; }
      sunucuGosterilen.set(n.message, simdi);
      return true;
    }
    // yerel kopya: sunucu aynı metni az önce gösterdiyse tekrar gösterme; yoksa sunucu yankısını eleyebilmek için hatırla
    if (sunucuGosterilen.delete(n.message)) return false;
    yerelBildirimler.set(n.message, simdi);
    return true;
  });
}
function yankiBildirimleriniAt(oyuncu) {
  if (!oyuncu || !Array.isArray(oyuncu.pendingNotices) || !yerelBildirimler.size) return;
  const simdi = Date.now();
  for (const [metin, an] of yerelBildirimler) if (simdi - an > YANKI_OMRU_MS) yerelBildirimler.delete(metin);
  // Yerel kopya henüz gösterilmediyse (yanıt oyun döngüsünden önce geldi) sunucunun kopyası kalır ve yereli ezer: tek bildirim
  const gosterilmeyen = new Set(((ctx.gameState.state && ctx.gameState.state.pendingNotices) || []).map((n) => n && n.message));
  oyuncu.pendingNotices = oyuncu.pendingNotices.filter((n) => {
    if (!n || !yerelBildirimler.has(n.message)) return true;
    yerelBildirimler.delete(n.message);   // bir yerel bildirim bir yankıyı siler
    return gosterilmeyen.has(n.message);
  });
}

// ── Sunucu görüntüsünü oyuna uygula ─────────────────────────────────────
function apply(payload) {
  if (!payload || !payload.player) return;
  const { gameState, ammMarket, treasury, globalPool } = ctx;
  const keep = {};
  for (const k of CLIENT_KEYS) if (gameState.state && gameState.state[k] !== undefined) keep[k] = gameState.state[k];
  yankiBildirimleriniAt(payload.player);
  if (Array.isArray(payload.player.pendingNotices)) for (const n of payload.player.pendingNotices) if (n && typeof n === 'object') sunucuBildirimleri.add(n);
  gameState.state = { ...payload.player, ...keep };
  gameState._lastFrameAt = Date.now();          // tarayıcı kendi "çevrimdışı telafi"sini yapmasın (sunucu yaptı)
  const w = payload.world;
  if (w) {
    if (w.amm) ammMarket.pools = w.amm;
    if (w.ammFees) ammMarket.feeStats = w.ammFees;
    if (w.treasury) treasury.state = w.treasury;
    if (w.globalPool) globalPool.state = w.globalPool;
    if (w.serverTime) { globalPool.serverTimeOffset = w.serverTime - Date.now(); globalPool.trustedTimeReady = true; }
    online.economy = w.economy || null;
    online.kapi = w.kapi || null;          // Kapı: sınır, vatandaş / sıra sayıları, gösterge
    online.partnerIncome = w.partnerIncome || null;   // E-planı Faz 2: trade sitesinden gelen gerçek dış gelir (herkese açık)
    if (Array.isArray(w.rates)) applyRates(GAME_CONFIG, null, w.rates);   // oranlar sunucudan (RealmRates sözleşmesi)
    if (w.universeStage != null) GAME_CONFIG.UNIVERSE_STAGE = Number(w.universeStage) || 0;   // Universe aşaması (yönetici)
  }
  online.gate = payload.gate || null;    // bu hesabın kapı durumu: citizen / waiting / suspended
  online.lastSync = Date.now();
  try { gameState.notifyListeners(); } catch { /* arayüz */ }
  try { ctx.onApplied && ctx.onApplied(); } catch { /* arayüz */ }
}

async function sync() {
  if (!online.active || !token || online.pending > 0) return;
  const gonderilen = online.gonderilenIslem || 0;
  try {
    const yanit = await api('GET', '/api/state');
    // Yanıt beklenirken oyuncu işlem yaptıysa bu görüntü eskidir: yerel durumu ezmesin (işlem geri alınmış görünür, oyuncu tekrar basardı)
    if (online.pending > 0 || (online.gonderilenIslem || 0) !== gonderilen) return;
    apply(yanit);
    if (online.yuklemeHatasi) hesapYuklendi();
  } catch (err) { if (err.status === 401) return relogin(); }
}

// ── Hesap yüklenemedi kartı (denetim QA-09) ──────────────────────────────
// Oturum açıkken /api/state alınamazsa oyun boş bir misafir hesabı gibi açılıp "hesabım kayboldu" izlenimi vermesin:
// oturum korunur, işlemler engellenir, oyuncu "Yeniden dene" ile ya da 20 saniyelik otomatik eşitlemeyle toparlanır.
const HESAP_YUKLENMEDI = { success: false, message: '⚠️ Hesabın henüz yüklenemedi; işlem yapılmadı. "Yeniden dene" ile hesabını yükle.' };

// sayfayiYenile: sunucuya hiç ulaşılamadıysa (health yok) durum kartın içinden yüklenemez; "Yeniden dene" sayfayı yeniler.
function hesapYuklenemediKarti(hata, { sayfayiYenile = false } = {}) {
  online.yuklemeHatasi = hata || online.yuklemeHatasi || {};
  const metin = yuklemeHatasiMetni(online.yuklemeHatasi);
  const el = overlay(`
    <div style="font-size:2rem;" aria-hidden="true">🏰</div>
    <div id="hy-baslik" data-ol-baslik style="font-weight:900;color:#fde047;font-size:1.15rem;margin:4px 0;">Hesabın yüklenemedi</div>
    <div style="font-size:0.88rem;color:#cbd5e1;line-height:1.55;">${esc(metin)}</div>
    <div style="font-size:0.82rem;color:#94a3b8;line-height:1.5;margin-top:8px;">Oturumun açık kaldı ve hesabında hiçbir şey kaybolmadı; yalnızca bilgilerini şu an getiremedik.</div>
    <div id="hy-durum" role="status" style="min-height:1.2em;margin-top:8px;font-size:0.85rem;color:#fca5a5;"></div>
    <button id="hy-tekrar" style="${btnCss('#7c3aed', '#c084fc')}">🔄 Yeniden dene</button>
    <button id="hy-gez" style="${linkCss}">Şimdilik gezmeye devam et</button>`, { vazgec: () => closeOverlay() });
  el.querySelector('#hy-gez').onclick = () => closeOverlay();
  el.querySelector('#hy-tekrar').onclick = async () => {
    const dugme = el.querySelector('#hy-tekrar');
    if (sayfayiYenile) { location.reload(); return; }
    dugme.disabled = true;
    try {
      apply(await api('GET', '/api/state'));
      hesapYuklendi();
    } catch (err) {
      if (err.status === 401) { closeOverlay(); online.yuklemeHatasi = null; return relogin(); }
      online.yuklemeHatasi = err;
      dugme.disabled = false;
      el.querySelector('#hy-durum').textContent = yuklemeHatasiMetni(err);
    }
  };
}

function hesapYuklendi() {
  online.yuklemeHatasi = null;
  if (document.getElementById('hy-tekrar')) closeOverlay();
  try { ctx.toast('✅ Hesabın yüklendi.', 'success'); } catch { /* arayüz yok */ }
}

// ── İşlemleri sunucuya gönder ───────────────────────────────────────────
let queue = Promise.resolve();
function cleanArgs(args, spec) {
  const out = Array.from(args).slice(0, spec.types.length).map(v => (v === undefined ? null : v));
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

function send(name, args, { wait = false, geriAl = null } = {}) {
  online.pending++;
  online.gonderilenIslem = (online.gonderilenIslem || 0) + 1;
  const job = queue.then(() => apiYavasla('POST', '/api/action', { name, args })).then(res => {
    online.pending--;
    if (wait || online.pending === 0) apply(res);
    if (!wait && res.result && res.result.success === false) yerelBasariyiGeriAl(geriAl);
    if (!wait && res.result && res.result.success === false && res.result.message) ctx.toast('Sunucu: ' + res.result.message, 'error');
    return res.result;
  }, err => {
    online.pending--;
    if (!wait) yerelBasariyiGeriAl(geriAl);
    if (err.status === 401) relogin();
    // Sonucu bekleyen (rastgele) eylemlerde mesajı çağıran gösterir: iki kez bildirim çıkmasın. Ağ hatasında "sunucu kabul etmedi"
    // demek yanlış olur (sunucuya hiç ulaşılmadı).
    else if (!wait) ctx.toast(err.ag ? err.message : (err.status === 429 ? HIZ_MESAJI : 'Sunucu işlemi kabul etmedi: ' + err.message), 'error');
    sync();
    return { success: false, message: err.message };
  });
  queue = job.catch(() => {});
  return job;
}

const GUEST_FAIL = { success: false, message: '🔐 Bu işlem için önce giriş yap ya da hesap aç.' };

// Bir işlem yerelde uygulanıp sunucuya gönderilmeden önce: hesap yüklenmediyse ya da bağlantı yoksa işlem HİÇ uygulanmaz.
// Eskiden işlem önce yerelde uygulanıyordu; sunucuya gitmeyince oyuncu "Görev tamamlandı +5 ASTRA" gibi yerel (sahte) bir
// ödül bildirimi görüyor, durum sonraki eşitlemeye dek yanlış kalıyordu (denetim QA-08 kalanı).
// null = devam et; aksi halde işlemin sonucu olarak dönecek hata.
function islemEngeli() {
  if (online.yuklemeHatasi) { hesapYuklenemediKarti(); return HESAP_YUKLENMEDI; }
  const kopuk = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (kopuk || online.agKopuk) {
    if (!kopuk) sync();   // sunucu geri geldiyse bir sonraki dokunuş çalışsın: bağlantıyı hemen yokla
    return { success: false, message: AG_YOK_MESAJI };
  }
  return null;
}

function installProxies() {
  const gs = ctx.gameState;
  let depth = 0;
  if (typeof gs.consumeNotices === 'function' && !gs.consumeNotices.__suzulu) {
    const asil = gs.consumeNotices;
    gs.consumeNotices = function (...a) { return bildirimleriSuz(asil.apply(gs, a)); };
    gs.consumeNotices.__suzulu = true;
  }
  for (const name of LOCAL_ONLY) {
    const orig = gs[name];
    if (typeof orig !== 'function') continue;
    gs[name] = function (...a) { depth++; try { return orig.apply(gs, a); } finally { depth--; } };
  }
  for (const [name, spec] of Object.entries(ACTIONS)) {
    const orig = gs[name];
    if (typeof orig !== 'function') continue;
    if (spec.random) {
      // Sonucu sunucu belirler: tarayıcı hesaplamaz, bekler (çağıran "await" kullanır)
      gs[name] = function (...a) {
        if (depth > 0) return orig.apply(gs, a);
        if (!token) { requireLogin(); return Promise.resolve(GUEST_FAIL); }
        const engel = islemEngeli();
        if (engel) return Promise.resolve(engel);
        const args = cleanArgs(a, spec);
        return send(name, args, { wait: true }).then(r => {
          if (r && r.success === false && INSUFFICIENT_RE.test(r.message || '') && online.health?.payments?.enabled) { startPayment(name, args); return PAY_STARTED; }
          return r;
        });
      };
    } else {
      gs[name] = function (...a) {
        if (depth > 0) return orig.apply(gs, a);
        if (!token) { requireLogin(); return GUEST_FAIL; }
        const engel = islemEngeli();
        if (engel) return engel;
        const onceki = yerelBildirimOnce(gs);
        depth++;
        let r;
        try { r = orig.apply(gs, a); } finally { depth--; }
        const yerelMesajlar = yerelBildirimKaydet(gs, onceki);
        // Ekranın kendi başarı bildirimi de (r.message) sunucu reddederse geri alınır: "kaydedildi" deyip sonra "kabul etmedi" dememeli
        if (r && r.success !== false && typeof r.message === 'string' && r.message) yerelMesajlar.push(r.message);
        if (!(r && r.success === false)) send(name, cleanArgs(a, spec), { geriAl: yerelMesajlar });
        else if (INSUFFICIENT_RE.test(r.message || '') && online.health?.payments?.enabled) { startPayment(name, cleanArgs(a, spec)); return PAY_STARTED; }
        return r;
      };
    }
  }
  // 🧪 Deneme sunucusu: test menüsü işlemleri de sunucuya gider
  if (online.health && online.health.testMode) {
    for (const name of DEV_ACTIONS) {
      const orig = gs[name];
      if (typeof orig !== 'function') continue;
      gs[name] = function (...a) {
        if (depth > 0) return orig.apply(gs, a);
        if (!token) { requireLogin(); return GUEST_FAIL; }
        depth++;
        let r;
        try { r = orig.apply(gs, a); } finally { depth--; }
        send(name, a.map(v => (v === undefined ? null : v)));
        return r;
      };
    }
  }
  // 🚪 Sırada bekleyen (misafir modu) adayın tek yapabildiği şey: hazır aday onayı. Vatandaşlık gerektirmez,
  // DEV_ACTIONS'ın tersine her zaman çalışır (test modu şartı yok).
  for (const name of Object.keys(MISAFIR_ACTIONS)) {
    const orig = gs[name];
    if (typeof orig !== 'function') continue;
    gs[name] = function (...a) {
      if (depth > 0) return orig.apply(gs, a);
      if (!token) { requireLogin(); return GUEST_FAIL; }
      depth++;
      let r;
      try { r = orig.apply(gs, a); } finally { depth--; }
      send(name, a.map(v => (v === undefined ? null : v)), { wait: true });
      return r;
    };
  }
  // Tarayıcıdaki kayıt yalnız önbellek: sunucuya gitmeyen değişiklikler bir sonraki eşitlemede düzelir
}

// ── Giriş ───────────────────────────────────────────────────────────────
// Erişilebilir pencere (denetim QA-04): role="dialog" + aria-modal + aria-labelledby (başlıkta data-ol-baslik), açılışta odak
// pencerenin ilk uygun öğesine, Tab pencere içinde döner, Esc "vazgeç" gibi çalışır, kapanınca odak açan öğeye döner.
//   dismissable: pencerenin dışına tıklayınca da kapanır (yalnız bilgi panelleri; giriş/ödeme akışlarında kapalı: yazılanlar kaybolmasın)
//   vazgec: Esc'e basılınca çalışacak işlev (akışın "Vazgeç" düğmesiyle aynı; sözünü bekleyen akışlar böylece çözülür)
//   odak: açılışta odaklanacak öğenin seçicisi (varsayılan: ilk alan/düğme)
const ODAK_SECICI = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const gorunurMu = n => !!(n.offsetWidth || n.offsetHeight || (n.getClientRects && n.getClientRects().length));
const odaklanabilirler = kok => Array.from(kok.querySelectorAll(ODAK_SECICI)).filter(gorunurMu);
let acanOge = null;   // pencere açılmadan önce odakta olan öğe: kapanınca odak ona döner

function overlay(html, { dismissable = false, vazgec = null, odak = null } = {}) {
  let el = document.getElementById('online-overlay');
  const yeni = !el;
  const onceki = el && el.contains(document.activeElement) ? document.activeElement.id : '';
  if (yeni) {
    const o = document.activeElement;
    if (o && o !== document.body && o !== document.documentElement) acanOge = o;
    el = document.createElement('div');
    el.id = 'online-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(5,8,16,0.92);padding:16px;';
    document.body.appendChild(el);
  }
  el.onclick = dismissable ? (e => { if (e.target === el) closeOverlay(); }) : null;
  el.dataset.dismissable = dismissable ? '1' : '';
  el._vazgec = typeof vazgec === 'function' ? vazgec : null;
  el.innerHTML = `<div id="online-pencere" role="dialog" aria-modal="true" tabindex="-1" style="max-width:420px;width:100%;max-height:92vh;overflow-y:auto;box-sizing:border-box;background:#111827;border:1px solid #a855f7;border-radius:14px;padding:22px;color:#e2e8f0;font-family:inherit;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.6);">${html}</div>`;
  const kutu = el.firstElementChild;
  const baslik = kutu.querySelector('[data-ol-baslik]');
  if (baslik) { baslik.id = baslik.id || 'online-baslik'; kutu.setAttribute('aria-labelledby', baslik.id); }
  else kutu.setAttribute('aria-label', 'Hesap penceresi');
  // Odak: aynı pencere yeniden çizildiyse (yazarken, kip değişirken) odaktaki alana geri dön; değilse ilk uygun öğeye
  let hedef = onceki ? kutu.querySelector('#' + onceki) : null;
  if (!hedef && odak) hedef = kutu.querySelector(odak);
  if (!hedef) hedef = odaklanabilirler(kutu)[0] || kutu;
  if (hedef && gorunurMu(hedef) && !hedef.disabled) { try { hedef.focus({ preventScroll: true }); } catch { /* odak verilemedi */ } }
  return el;
}
function closeOverlay() {
  const el = document.getElementById('online-overlay');
  if (!el) return;
  el.remove();
  const geri = acanOge;
  acanOge = null;
  if (geri && geri.isConnected && typeof geri.focus === 'function') { try { geri.focus({ preventScroll: true }); } catch { /* odak verilemedi */ } }
}
// Pencere açıkken klavye yalnız pencereye aittir: Esc vazgeçer, Tab pencerede döner, diğer tuşlar oyunun kısayollarına (T, Ctrl+K, Tab →
// Krallık merkezi...) ulaşmaz. Yakalama aşamasında ve oyunun kendi dinleyicilerinden ÖNCE çalışır; yazı alanındaki tuşlara dokunulmaz.
if (typeof document !== 'undefined') {
  window.addEventListener('keydown', e => {
    const el = document.getElementById('online-overlay');
    if (!el) return;
    const t = e.target;
    const yaziAlani = !!t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable);
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (el.dataset.dismissable === '1') closeOverlay();
      else if (el._vazgec) el._vazgec();
      return;
    }
    if (e.key === 'Tab') {
      e.stopImmediatePropagation();
      const liste = odaklanabilirler(el);
      if (!liste.length) { e.preventDefault(); return; }
      const ilk = liste[0], son = liste[liste.length - 1];
      const icerde = el.contains(document.activeElement);
      if (!icerde) { e.preventDefault(); (e.shiftKey ? son : ilk).focus(); }
      else if (e.shiftKey && document.activeElement === ilk) { e.preventDefault(); son.focus(); }
      else if (!e.shiftKey && document.activeElement === son) { e.preventDefault(); ilk.focus(); }
      return;
    }
    if (!yaziAlani || e.ctrlKey || e.metaKey) e.stopImmediatePropagation();
  }, true);
}

const toHex = s => '0x' + Array.from(new TextEncoder().encode(s)).map(b => b.toString(16).padStart(2, '0')).join('');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inputCss = 'width:100%;padding:10px;border-radius:8px;border:1px solid #475569;background:#0b1220;color:#fff;margin-top:8px;font-size:0.95rem;box-sizing:border-box;';
const btnCss = (bg, border) => `width:100%;padding:11px;border-radius:10px;border:1px solid ${border};background:${bg};color:#fff;font-weight:900;font-size:1rem;cursor:pointer;margin-top:10px;`;
// Metin bağlantısı görünümlü düğme: dokunma alanı en az 44 px (denetim QA-04; eskiden 15 px yüksekti)
const linkCss = 'background:none;border:none;color:#94a3b8;cursor:pointer;font-size:0.85rem;text-decoration:underline;margin:6px 4px 0;min-height:44px;padding:0 10px;';
const boxCss = 'text-align:left;background:#0b1220;border:1px solid #334155;border-radius:10px;padding:10px;margin-top:10px;';

function saveSession(t, playerId) {
  token = t;
  online.playerId = playerId;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ token: t, playerId })); } catch { /* özel pencere */ }
}
const tokenFromLink = (url, kind) => { const m = new RegExp('[?&]' + kind + '=([a-f0-9]+)').exec(String(url || '')); return m && m[1]; };

// E-posta doğrulama bağlantısı: hesabın şifresi burada yeniden belirlenir. Başkası bu e-postayla önceden hesap açıp kendi
// şifresini koymuş olsa bile (ön-hesap ele geçirme), bağlantıyı e-postanın gerçek sahibi açar ve yazdığı şifre geçerli olur.
// Döner: sunucunun doğrulama yanıtı; oyuncu vazgeçerse null.
function dogrulamaSifresiSor(verifyToken) {
  return new Promise(resolve => {
    const iptal = () => { closeOverlay(); resolve(null); };
    const el = overlay(`
      <div style="font-size:2rem;" aria-hidden="true">🔐</div>
      <div data-ol-baslik style="font-weight:900;color:#fde047;font-size:1.1rem;">Hesabını Koru</div>
      <div style="font-size:0.85rem;color:#cbd5e1;line-height:1.5;margin-top:6px;">E-postanı doğruluyorsun. Hesabının şifresini şimdi yaz: kayıtta yazdığınla aynısı olabilir, yenisi de olabilir. Bu şifre geçerli olur; bu e-postayla önceden başka biri hesap açtıysa onun şifresi iptal edilir.</div>
      ${etiketHtml('vf-pass', 'Şifre (en az 8 karakter)')}
      <input id="vf-pass" type="password" autocomplete="new-password" placeholder="Şifre (en az 8 karakter)" style="${inputCss}">
      ${etiketHtml('vf-pass2', 'Şifre (tekrar)')}
      <input id="vf-pass2" type="password" autocomplete="new-password" placeholder="Şifre (tekrar)" style="${inputCss}">
      <button id="vf-go" style="${btnCss('#7c3aed', '#c084fc')}">✅ Doğrula ve gir</button>
      <div id="vf-msg" role="alert" style="margin-top:8px;font-size:0.85rem;color:#fca5a5;"></div>
      <button id="vf-iptal" style="${linkCss}">Vazgeç</button>`, { vazgec: iptal });
    const msg = t => { el.querySelector('#vf-msg').textContent = t; };
    el.querySelector('#vf-iptal').onclick = iptal;
    const go = async () => {
      const p1 = el.querySelector('#vf-pass').value, p2 = el.querySelector('#vf-pass2').value;
      if (p1.length < 8) return msg('⚠️ Şifre en az 8 karakter olmalı.');
      if (p1 !== p2) return msg('⚠️ Şifreler aynı değil. İkisini de yeniden yaz.');
      const btn = el.querySelector('#vf-go');
      btn.disabled = true;
      try {
        const r = await api('POST', '/api/account/verify', { token: verifyToken, password: p1 });
        closeOverlay();
        resolve(r);
      } catch (err) { msg(err.message); btn.disabled = false; }
    };
    el.querySelector('#vf-go').onclick = go;
    el.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }));
  });
}

// 🛡️ Kale Kapısı: cüzdan değiştirirken 48 saat beklemenin oyunlaştırılmış açıklaması (kullanıcı isteği)
export const KALE_KAPISI = `🛡️ <strong>Kale Kapısı Kuralı.</strong> Hazinene giden yolu değiştirmek istedin! Krallığın muhafızları önce sana bir haberci (e-posta) yollayacak ve hazine kapısı <strong>48 saat</strong> mühürlü kalacak. Neden mi? Bir hain senin kılığına girip hazineni kaçırmaya kalkarsa, bu 48 saat içinde haberciyi görür ve kapıyı ona kapatırsın. Bu bekleme seni korumak için: gerçek kral sensin ve kimse hazinene senden önce dokunamaz. 👑`;

// 💰 Sandık Tavsiyesi: Oyun Kasası'nda az para tutmanın oyunlaştırılmış açıklaması (kullanıcı isteği)
export const SANDIK_TAVSIYESI = `💰 <strong>Sandık Tavsiyesi.</strong> Oyun Kasan, krallığının günlük işleri (iyileşme, bot, onarım) için taşıdığın küçük bir kese. Muhafızlarımız onu gece gündüz bekler ama en sağlam kale senin kendi cüzdanındır. Kesende yalnızca birkaç günlük harcamalık altın tut, biriken servetini kendi cüzdanına taşı. Unutma: bir kralın en güvendiği kasa, anahtarı kendi cebinde olandır. 🗝️`;

// 🛡️ Muhafız Mührü: iki adımlı doğrulamanın oyunlaştırılmış açıklaması
export const MUHAFIZ_MUHRU = `🛡️ <strong>Muhafız Mührü.</strong> Şifren kale kapısının anahtarı; ama anahtarlar kopyalanabilir. Muhafız Mührü'nü takarsan kapıda bir muhafız daha durur: içeri girmek, cüzdan değiştirmek ya da hazineden altın çıkarmak için telefonundaki doğrulama uygulamasının o anki <strong>6 haneli kodu</strong> da gerekir. Kod her 30 saniyede değişir; şifreni çalan biri bile telefonun olmadan kapıdan geçemez. 📱`;

// İki adımlı doğrulama kodu sor (iptal → null)
// Kod gönderilince pencere KAPANMAZ: sonuç gelene dek "Doğrulanıyor…" durumunda açık kalır (yedek kod özeti yavaş: saniyeler sürebilir,
// eskiden pencere kaybolup ekranda hiçbir şey kalmıyordu). Çağıran sonucu alınca pencereyi kapatır ya da kodu yeniden sorar
// (denetim 2. tur B). Vazgeç / Esc hemen kapatır ve null döner.
function askCode(title = 'Muhafız Mührü', errMsg = '') {
  return new Promise(resolve => {
    let gonderildi = false;
    const done = v => {
      if (gonderildi) return;
      if (v == null) { closeOverlay(); resolve(null); return; }
      gonderildi = true;
      inp.disabled = true;
      goBtn.disabled = true;
      goBtn.textContent = '⏳ Doğrulanıyor…';
      goBtn.setAttribute('aria-busy', 'true');
      resolve(v);
    };
    const el = overlay(`
      <div style="font-size:2rem;" aria-hidden="true">🛡️</div>
      <div data-ol-baslik style="font-weight:900;color:#fde047;font-size:1.1rem;margin:4px 0;">${esc(title)}</div>
      <div style="font-size:0.85rem;color:#cbd5e1;line-height:1.5;">Telefonundaki doğrulama uygulamasındaki <strong>6 haneli kodu</strong> yaz. Telefonun yanında değilse yedek kodlarından birini de yazabilirsin.</div>
      ${etiketHtml('ac-code', '6 haneli kod ya da yedek kod')}
      <input id="ac-code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="123456" style="${inputCss};text-align:center;font-size:1.3rem;letter-spacing:4px;">
      <button id="ac-go" style="${btnCss('#7c3aed', '#c084fc')}">Onayla</button>
      ${errMsg ? `<div role="alert" style="margin-top:8px;font-size:0.85rem;color:#fca5a5;">${esc(errMsg)}</div>` : ''}
      <button id="ac-cancel" style="${linkCss}">Vazgeç</button>`, { vazgec: () => done(null) });
    const inp = el.querySelector('#ac-code');
    const goBtn = el.querySelector('#ac-go');
    goBtn.onclick = () => done(inp.value.trim());
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(inp.value.trim()); });
    el.querySelector('#ac-cancel').onclick = () => done(null);
  });
}

// Mühür açıksa sunucu kod ister (403 + need2fa): kodu sorup aynı isteği tekrarlar. İptal → hata
async function withCode(call, title) {
  let code, errMsg = '';
  try {
    for (let i = 0; i < 6; i++) {
      try { return await call(code); }
      catch (err) {
        if (!err.need2fa) throw err;
        if (code !== undefined) errMsg = err.message;
        code = await askCode(title, errMsg);
        if (code == null) throw new Error('İşlem iptal edildi.');
      }
    }
    throw new Error('Çok fazla deneme.');
  } finally {
    // Kod gönderildiyse pencere "Doğrulanıyor…" durumunda açık kalmıştır: sonuç ne olursa olsun kapanır
    if (document.getElementById('ac-go')) closeOverlay();
  }
}

// 🔒 Kilitli ASTRA paneli: nasıl açılır, yarın ve bu hafta ne kadarı açılacak
function lockPanelHtml() {
  const gs = ctx && ctx.gameState;
  if (!gs || !gs.getLockedUnlockForecast) return '';
  const f = gs.getLockedUnlockForecast();
  const f0 = v => Math.floor(Number(v) || 0).toLocaleString('tr-TR');
  const pct = v => String(Math.round(v * 10) / 10).replace('.', ',');
  if (!(f.locked > 0)) return `<div style="${boxCss};font-size:0.8rem;color:#cbd5e1;">🔓 Kilitli ASTRA'n yok. Oyundan kazandığın her ASTRA'nın %${f.freeSharePct}'si serbest, kalanı kilitli gelir.</div>`;
  return `<div style="${boxCss};font-size:0.8rem;color:#cbd5e1;line-height:1.55;">
    <div style="font-weight:800;color:#fbbf24;margin-bottom:6px;">🔒 Kilitli ${f0(f.locked)} ASTRA nasıl açılır?</div>
    <div style="display:grid;grid-template-columns:1fr auto;gap:4px 10px;">
      <span>📅 Yarın (oyuna girersen)</span><strong style="color:#4ade80;">+${f0(f.tomorrowActive)} ASTRA</strong>
      <span style="color:#94a3b8;">Yarın (hiç girmezsen)</span><span style="color:#94a3b8;">+${f0(f.tomorrowIdle)} ASTRA</span>
      <span>🗓️ 7 gün (her gün girersen)</span><strong style="color:#4ade80;">+${f0(f.weekActive)} ASTRA</strong>
      <span style="color:#94a3b8;">7 gün (hiç girmezsen)</span><span style="color:#94a3b8;">+${f0(f.weekIdle)} ASTRA</span>
      <span>⚒️ Oyunda 1.000 ASTRA harcarsan</span><strong style="color:#4ade80;">+${f0(f.per1000Free)} ASTRA serbest kalır</strong>
    </div>
    <div style="margin-top:8px;color:#94a3b8;">
      Kilit üç yolla açılır:<br>
      • <strong style="color:#e2e8f0;">Harcayarak (en hızlısı):</strong> oyunda harcadığında önce kilitli ASTRA kullanılır, üstüne harcadığının %${f.spendBonusPct}'si kadar daha kilit açılır.<br>
      • <strong style="color:#e2e8f0;">Her gün girerek:</strong> oyuna girdiğin her gün kilitlinin küçük bir kısmı açılır (her gün girene haftada toplam %${pct(f.weeklyActivePct)}).${f.loggedToday ? ' Bugünkü payını aldın ✅' : ''}<br>
      • <strong style="color:#e2e8f0;">Zamanla:</strong> girmesen de haftada %${pct(f.weeklyBasePct)} kendiliğinden açılır.<br>
      Oyundan kazandığın her ASTRA'nın %${f.freeSharePct}'si serbest, kalanı kilitli gelir. Kilitli ASTRA'yı oyunda harcayabilirsin; çekim yalnız serbest kısımdan yapılır.
    </div>
  </div>`;
}

function twoFactorSection(acc) {
  return `<div style="${boxCss}">
    <div style="font-weight:800;color:#86efac;margin-bottom:4px;">🛡️ Muhafız Mührü (iki adımlı doğrulama) · ${acc.twoFactor ? '<span style="color:#4ade80;">AÇIK ✓</span>' : '<span style="color:#fbbf24;">kapalı</span>'}</div>
    <div style="font-size:0.78rem;color:#94a3b8;line-height:1.5;">${MUHAFIZ_MUHRU}</div>
    ${acc.twoFactor
      ? `<div style="font-size:0.78rem;color:#cbd5e1;margin-top:6px;">Kalan yedek kod: <strong>${acc.backupLeft}</strong>${acc.backupLeft <= 3 ? ' <span style="color:#fbbf24;">(azaldı: aşağıdan yeni kodlar al)</span>' : ''}${acc.backupLegacy ? ' <span style="color:#fbbf24;">(eski biçimde: yenilemen önerilir)</span>' : ''}</div>
         <button id="tf-renew" style="margin-top:8px;margin-right:6px;padding:6px 12px;border-radius:8px;border:1px solid #60a5fa;background:#1e3a8a;color:#dbeafe;font-weight:800;cursor:pointer;">🔄 Yedek kodları yenile</button>
         <button id="tf-off" style="margin-top:8px;padding:6px 12px;border-radius:8px;border:1px solid #f87171;background:#3f1d1d;color:#fecaca;font-weight:800;cursor:pointer;">Mührü kaldır</button>`
      : `<button id="tf-on" style="margin-top:8px;padding:7px 12px;border-radius:8px;border:1px solid #4ade80;background:#14532d;color:#fff;font-weight:800;cursor:pointer;">🛡️ Mührü tak (önerilir)</button>`}
  </div>`;
}

// Mührü takma: kare kod → uygulamadaki kod → yedek kodlar
async function enable2faFlow() {
  let s;
  try { s = await api('POST', '/api/account/2fa/setup'); } catch (err) { ctx.toast(err.message, 'error'); return; }
  const draw = (errMsg = '') => {
    const el = overlay(`
      <div data-ol-baslik style="font-weight:900;color:#fde047;font-size:1.1rem;">🛡️ Muhafız Mührü'nü tak</div>
      <div style="font-size:0.82rem;color:#cbd5e1;line-height:1.5;text-align:left;margin-top:6px;">
        <strong>1.</strong> Telefonuna bir doğrulama uygulaması kur (Google Authenticator, Microsoft Authenticator ya da Authy; hepsi ücretsiz).<br>
        <strong>2.</strong> Uygulamada "+" → "QR kodu tara" ile aşağıdaki kareyi tara. (Telefondaysan "Uygulamada aç"a dokun.)<br>
        <strong>3.</strong> Uygulamanın gösterdiği 6 haneli kodu aşağıya yaz.
      </div>
      <img src="${s.qr}" alt="Doğrulama uygulaması için QR kodu" style="width:190px;height:190px;background:#fff;border-radius:10px;padding:6px;margin:10px auto 4px;display:block;">
      <a href="${esc(s.uri)}" class="ol-baglanti" style="color:#93c5fd;font-size:0.82rem;">📱 Uygulamada aç</a>
      <div style="font-size:0.72rem;color:#94a3b8;margin-top:6px;">Elle girmek için gizli anahtar:<br><span style="font-family:monospace;color:#fde68a;word-break:break-all;">${esc(s.secret)}</span></div>
      ${etiketHtml('tf-pass', 'Hesap parolan (doğrulama için)')}
      <input id="tf-pass" type="password" autocomplete="current-password" placeholder="Hesap parolan (doğrulama için)" style="${inputCss}">
      ${etiketHtml('tf-code', '6 haneli kod')}
      <input id="tf-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 haneli kod" style="${inputCss};text-align:center;font-size:1.2rem;letter-spacing:4px;">
      <button id="tf-go" style="${btnCss('#15803d', '#4ade80')}">Mührü tak</button>
      ${errMsg ? `<div role="alert" style="margin-top:8px;font-size:0.85rem;color:#fca5a5;">${esc(errMsg)}</div>` : ''}
      <button id="tf-cancel" style="${linkCss}">Vazgeç</button>`, { vazgec: () => openWalletPanel(), odak: '#tf-pass' });
    el.querySelector('#tf-cancel').onclick = () => openWalletPanel();
    el.querySelector('#tf-go').onclick = async () => {
      try {
        const r = await api('POST', '/api/account/2fa/enable', { code: el.querySelector('#tf-code').value.trim(), password: el.querySelector('#tf-pass').value });
        // Esc bu ekranda pencereyi KAPATMAZ: yedek kodlar bir daha gösterilmez, yanlışlıkla kapanırsa kaybolur
        const el2 = overlay(`
          <div style="font-size:2rem;" aria-hidden="true">📜</div>
          <div data-ol-baslik style="font-weight:900;color:#fde047;font-size:1.1rem;">Mühür takıldı! Yedek kodların</div>
          <div style="font-size:0.82rem;color:#cbd5e1;line-height:1.5;text-align:left;margin-top:6px;">Telefonunu kaybedersen bu kodlarla girersin. Her kod <strong>bir kez</strong> kullanılır. Bir kâğıda yaz ya da güvenli bir yere kaydet: <strong>bu kodları bir daha gösteremeyiz.</strong></div>
          <div style="font-family:monospace;font-size:1rem;color:#fde68a;background:#0b1220;border:1px solid #334155;border-radius:10px;padding:10px;margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:4px;">${r.backupCodes.map(c => `<span>${esc(c)}</span>`).join('')}</div>
          <button id="tf-copy" style="${btnCss('#334155', '#64748b')}">📋 Kodları kopyala</button>
          <button id="tf-done" style="${btnCss('#7c3aed', '#c084fc')}">Yazdım, tamam</button>`,
        { vazgec: () => ctx.toast('Yedek kodlarını kaydettikten sonra "Yazdım, tamam" düğmesine bas; bu kodlar bir daha gösterilmez.', 'info') });
        el2.querySelector('#tf-copy').onclick = () => { navigator.clipboard?.writeText(r.backupCodes.join('\n')); ctx.toast('Yedek kodlar kopyalandı', 'success'); };
        el2.querySelector('#tf-done').onclick = () => { ctx.toast('🛡️ Muhafız Mührü takıldı!', 'success'); openWalletPanel(); };
      } catch (err) { draw(err.message); }
    };
  };
  draw();
}

// Yedek kodları yenileme: parola + geçerli doğrulama kodu; eski 10 kod geçersiz olur, yeniler bir kez gösterilir
function renewBackupFlow() {
  const draw = (errMsg = '') => {
    const el = overlay(`
      <div data-ol-baslik style="font-weight:900;color:#fde047;font-size:1.1rem;">🔄 Yedek kodları yenile</div>
      <div style="font-size:0.82rem;color:#cbd5e1;line-height:1.5;text-align:left;margin-top:6px;">Eski yedek kodların hepsi geçersiz olur; 10 yeni kod verilir ve <strong>bir kez</strong> gösterilir.</div>
      ${etiketHtml('rb-pass', 'Hesap parolan')}
      <input id="rb-pass" type="password" autocomplete="current-password" placeholder="Hesap parolan" style="${inputCss}">
      ${etiketHtml('rb-code', 'Doğrulama uygulamasındaki 6 haneli kod')}
      <input id="rb-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 haneli kod" style="${inputCss};text-align:center;font-size:1.2rem;letter-spacing:4px;">
      <button id="rb-go" style="${btnCss('#1d4ed8', '#60a5fa')}">Yeni kodları ver</button>
      ${errMsg ? `<div role="alert" style="margin-top:8px;font-size:0.85rem;color:#fca5a5;">${esc(errMsg)}</div>` : ''}
      <button id="rb-cancel" style="${linkCss}">Vazgeç</button>`, { vazgec: () => openWalletPanel(), odak: '#rb-pass' });
    el.querySelector('#rb-cancel').onclick = () => openWalletPanel();
    el.querySelector('#rb-go').onclick = async () => {
      const go = el.querySelector('#rb-go');
      go.disabled = true; go.textContent = '⏳ Hazırlanıyor…';
      try {
        const r = await api('POST', '/api/account/2fa/backup-codes', { code: el.querySelector('#rb-code').value.trim(), password: el.querySelector('#rb-pass').value });
        // Esc bu ekranda pencereyi KAPATMAZ: yeni kodlar bir daha gösterilmez
        const el2 = overlay(`
          <div style="font-size:2rem;" aria-hidden="true">📜</div>
          <div data-ol-baslik style="font-weight:900;color:#fde047;font-size:1.1rem;">Yeni yedek kodların</div>
          <div style="font-size:0.82rem;color:#cbd5e1;line-height:1.5;text-align:left;margin-top:6px;">Eski kodların hepsi iptal edildi. Her kod <strong>bir kez</strong> kullanılır. Bir kâğıda yaz ya da güvenli bir yere kaydet: <strong>bu kodlar bir daha gösterilmez.</strong></div>
          <div style="font-family:monospace;font-size:1rem;color:#fde68a;background:#0b1220;border:1px solid #334155;border-radius:10px;padding:10px;margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:4px;">${r.backupCodes.map(c => `<span>${esc(c)}</span>`).join('')}</div>
          <button id="rb-copy" style="${btnCss('#334155', '#64748b')}">📋 Kodları kopyala</button>
          <button id="rb-done" style="${btnCss('#7c3aed', '#c084fc')}">Yazdım, tamam</button>`,
        { vazgec: () => ctx.toast('Yeni kodlarını kaydettikten sonra "Yazdım, tamam" düğmesine bas; bu kodlar bir daha gösterilmez.', 'info') });
        el2.querySelector('#rb-copy').onclick = () => { navigator.clipboard?.writeText(r.backupCodes.join('\n')); ctx.toast('Yedek kodlar kopyalandı', 'success'); };
        el2.querySelector('#rb-done').onclick = () => { ctx.toast('🛡️ Yedek kodların yenilendi', 'success'); openWalletPanel(); };
      } catch (err) { draw(err.message); }
    };
  };
  draw();
}

function kasaSection(k) {
  if (!k || !k.enabled) return `<div style="${boxCss}"><div style="font-weight:800;color:#fde68a;">🏦 Oyun Kasası</div><div style="font-size:0.8rem;color:#94a3b8;">Oyun Kasası henüz açılmadı.</div></div>`;
  const days = k.daysLeft == null ? null : k.daysLeft;
  const left = k.usagePerDay > 0
    ? `Günde yaklaşık <strong>${fmt(k.usagePerDay)} ASTRA</strong> harcanıyor → kasan <strong>${days < 1 ? 'bir günden az' : '~' + Math.floor(days) + ' gün'}</strong> yeter.`
    : 'Henüz kasadan harcama olmadı.';
  return `<div style="${boxCss}">
    <div style="font-weight:800;color:#fde68a;margin-bottom:4px;">🏦 Oyun Kasası</div>
    <div style="font-size:0.8rem;color:#cbd5e1;line-height:1.45;">Sen yokken çalışan işler (pasif iyileşme, bot ücreti, botun pazar işleri, alet onarımı) önce oyunda kazandığın bakiyeden, yetmezse bu kasadan ödenir. Kasadaki para senin: istediğin an kesintisiz çekebilirsin.</div>
    ${k.simulated ? `<div style="margin-top:6px;color:#fbbf24;font-size:0.8rem;">🧪 Deneme sunucusu: kasa taklit, zincire bağlı değil. Buraya gerçek ASTRA gönderme!</div>` : ''}
    <div style="margin-top:6px;font-size:0.78rem;color:#94a3b8;">Kasa adresin (ADASTRA ve işlem ücretleri için biraz AVAX gönder):</div>
    <div style="font-family:monospace;font-size:0.78rem;word-break:break-all;color:#fde68a;">${esc(k.address)}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
      <button id="ks-copy" style="padding:5px 10px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#fff;cursor:pointer;font-size:0.78rem;">📋 Adresi kopyala</button>
      <button id="ks-refresh" style="padding:5px 10px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#fff;cursor:pointer;font-size:0.78rem;">🔄 Yatırmamı kontrol et</button>
      ${k.simulated ? '<button id="ks-test" style="padding:5px 10px;border-radius:6px;border:1px solid #64748b;background:#334155;color:#fff;cursor:pointer;font-size:0.78rem;">🧪 Kasaya 10.000 ASTRA + 0,1 AVAX ekle</button>' : ''}
    </div>
    <div style="display:flex;gap:8px;justify-content:space-between;margin:10px 0 4px;font-size:0.82rem;font-weight:800;">
      <span style="color:#fde047;">🪙 ASTRA<br>${fmt(k.available)}</span>
      <span style="color:#e2e8f0;">🔺 AVAX<br>${Number(k.avax || 0).toFixed(4)}</span>
      <span style="color:#94a3b8;">⏳ Aktarılacak<br>${fmt(k.pending)}</span>
    </div>
    ${k.avaxLow ? `<div style="color:#fca5a5;font-size:0.8rem;">⚠️ Kasada işlem ücreti için AVAX kalmadı (en az ${k.minAvax}). Kasa şu an kullanılmıyor; biraz AVAX gönder.</div>` : ''}
    <div style="font-size:0.8rem;color:#cbd5e1;margin-top:4px;">📅 ${left}</div>
    ${k.cap ? `<div style="font-size:0.78rem;color:#cbd5e1;margin-top:4px;">🛡️ Kasa üst sınırı: <strong>${fmt(k.cap)} ASTRA</strong> (yaklaşık ${k.capDays} günlük harcaman). Fazlası güvenliğin için kendiliğinden bağlı cüzdanına geri gönderilir.${k.overCap && !k.hasWallet ? ' <span style="color:#fbbf24;">Kasan sınırın üstünde ama bağlı cüzdanın yok: geri gönderim için cüzdan bağla.</span>' : ''}</div>` : ''}
    <div style="font-size:0.78rem;color:#94a3b8;margin-top:4px;">Kazandığın bakiye ve kasan bitince: pasif iyileşme durur · bot ücreti yenilenemez, bot durur · botun pazar alımları durur · aletler onarılamaz.</div>
    ${etiketHtml('ks-amount', 'Kasadan çekilecek miktar', { gizli: true })}${etiketHtml('ks-asset', 'Çekilecek varlık', { gizli: true })}
    <div style="display:flex;gap:6px;margin-top:8px;">
      <input id="ks-amount" type="number" min="0" placeholder="Miktar" style="flex:1;padding:7px;border-radius:6px;border:1px solid #475569;background:#111827;color:#fff;">
      <select id="ks-asset" style="padding:7px;border-radius:6px;border:1px solid #475569;background:#111827;color:#fff;"><option value="ADA">ASTRA</option><option>AVAX</option></select>
      <button id="ks-withdraw" style="padding:7px 10px;border-radius:6px;border:1px solid #60a5fa;background:#1d4ed8;color:#fff;font-weight:800;cursor:pointer;">Kasadan çek</button>
    </div>
    ${(k.ops || []).length ? `<div style="margin-top:6px;font-size:0.75rem;color:#94a3b8;">${k.ops.slice(0, 5).map(o => `${{ settle: '↗️ oyuna aktarım', withdraw_ada: '🏧 ASTRA çekimi', withdraw_avax: '🏧 AVAX çekimi', return_ada: '↩️ fazlanın iadesi' }[o.kind] || esc(o.kind)} ${o.kind === 'withdraw_avax' ? Number(o.amount).toFixed(4) : fmt(o.amount)} · ${{ pending: '⏳', sending: '📤', sent: '✅', failed: '❌' }[o.status] || ''}`).join('<br>')}</div>` : ''}
    <div style="font-size:0.78rem;color:#94a3b8;line-height:1.5;margin-top:8px;">${SANDIK_TAVSIYESI}</div>
  </div>`;
}

// Giriş / Kayıt / Şifremi unuttum. Döner: giriş yapıldı mı
function loginFlow(startMode = 'login') {
  return new Promise(resolve => {
    let mode = startMode, email = '', msg = '', isErr = true, extra = '';
    let promoVal = '';   // kayıtta yazılan promo kodu (sayfa yeniden çizilince kaybolmasın)
    const titles = { login: 'Krallığa Dön', register: 'Krallığa Katıl', forgot: 'Şifremi Unuttum', resend: 'Onay Bağlantısı' };
    const intro = {
      login: 'E-posta ve şifrenle giriş yap.',
      register: 'E-posta ve şifrenle hesabını aç. Cüzdanın kaybolsa bile krallığın ve hazinen hesabınla birlikte kalır.',
      forgot: 'E-postanı yaz; şifreni yenilemen için bir bağlantı gönderelim.',
      resend: 'Kayıt olduğun e-postayı yaz; onay bağlantısını yeniden gönderelim.'
    };
    const go_ = { login: '🗝️ Giriş Yap', register: '🏰 Hesap Aç', forgot: '📧 Bağlantı Gönder', resend: '📧 Yeniden Gönder' };
    const draw = (busy = false) => {
      const el = overlay(`
        <div style="font-size:2.2rem;" aria-hidden="true">👑</div>
        <div data-ol-baslik style="font-size:1.25rem;font-weight:900;color:#fde047;margin:6px 0 2px;">${titles[mode]}</div>
        <div style="font-size:0.85rem;color:#cbd5e1;line-height:1.5;">${intro[mode]}</div>
        ${etiketHtml('ol-email', 'E-posta')}
        <input id="ol-email" type="email" autocomplete="email" placeholder="E-posta" value="${esc(email)}" style="${inputCss}">
        ${mode !== 'forgot' && mode !== 'resend' ? `${etiketHtml('ol-pass', 'Şifre' + (mode === 'register' ? ' (en az 8 karakter)' : ''))}
        <input id="ol-pass" type="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" placeholder="Şifre${mode === 'register' ? ' (en az 8 karakter)' : ''}" style="${inputCss}">` : ''}
        ${mode === 'register' ? `${etiketHtml('ol-pass2', 'Şifre (tekrar)')}
        <input id="ol-pass2" type="password" autocomplete="new-password" placeholder="Şifre (tekrar)" style="${inputCss}">
        ${etiketHtml('ol-promo', 'Promo kodu (isteğe bağlı)')}
        <input id="ol-promo" type="text" autocomplete="off" maxlength="32" placeholder="Promo kodu (isteğe bağlı)" value="${esc(promoVal)}" style="${inputCss};text-transform:uppercase;">` : ''}
        <button id="ol-go" ${busy ? 'disabled' : ''} style="${btnCss('#7c3aed', '#c084fc')}">${busy ? '⏳ Bekle…' : go_[mode]}</button>
        ${msg ? `<div role="${isErr ? 'alert' : 'status'}" style="margin-top:10px;font-size:0.85rem;color:${isErr ? '#fca5a5' : '#86efac'};">${esc(msg)}</div>` : ''}
        ${extra}
        <div>
          ${mode !== 'login' ? `<button class="ol-mode" data-m="login" style="${linkCss}">Giriş yap</button>` : ''}
          ${mode !== 'register' ? `<button class="ol-mode" data-m="register" style="${linkCss}">Hesap aç</button>` : ''}
          ${mode !== 'forgot' ? `<button class="ol-mode" data-m="forgot" style="${linkCss}">Şifremi unuttum</button>` : ''}
          ${mode === 'login' || mode === 'register' ? `<button class="ol-mode" data-m="resend" style="${linkCss}">Onay e-postası gelmedi</button>` : ''}
        </div>
        <button id="ol-later" style="${linkCss}">Şimdilik gezmeye devam et</button>`,
      { vazgec: () => { closeOverlay(); resolve(false); }, odak: msg && isErr && mode === 'login' ? '#ol-pass' : null });
      el.querySelectorAll('.ol-mode').forEach(b => b.addEventListener('click', () => { email = el.querySelector('#ol-email').value; mode = b.dataset.m; msg = ''; extra = ''; draw(); }));
      el.querySelector('#ol-later').addEventListener('click', () => { closeOverlay(); resolve(false); });
      el.querySelector('#ol-go').addEventListener('click', go);
      el.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }));
      el.querySelector('#ol-dev-reset')?.addEventListener('click', () => { location.href = el.querySelector('#ol-dev-reset').dataset.href; });
      el.querySelector('#ol-dev-verify')?.addEventListener('click', async () => {
        try {
          const r = await dogrulamaSifresiSor(el.querySelector('#ol-dev-verify').dataset.t);
          if (!r) return draw();                         // vazgeçildi: giriş penceresi geri gelir
          if (r.token) { saveSession(r.token, r.playerId); ctx.toast('🧪 Deneme modu: e-posta onayı verildi.', 'success'); closeOverlay(); resolve(true); }
        } catch (err) { msg = err.message; isErr = true; extra = ''; draw(); }
      });
    };
    async function go() {
      const el = document.getElementById('online-overlay');
      email = el.querySelector('#ol-email').value.trim();
      const sifre = el.querySelector('#ol-pass') ? el.querySelector('#ol-pass').value : '';
      if (mode === 'register') {
        promoVal = (el.querySelector('#ol-promo')?.value || '').trim();
        // Şifre iki kez: yanlış yazılan şifreyle hesap açılmasın
        if (sifre !== (el.querySelector('#ol-pass2')?.value || '')) { msg = '⚠️ Şifreler aynı değil. İkisini de yeniden yaz.'; isErr = true; extra = ''; return draw(); }
      }
      draw(true);
      try {
        // Deneme sunucusunda gerçek e-posta yok: bağlantı düğme olarak gösterilir
        const devBtns = r => {
          const v = tokenFromLink(r.devLink, 'verify');
          if (v) return `<button id="ol-dev-verify" data-t="${esc(v)}" style="${btnCss('#334155', '#64748b')}">🧪 Deneme modu: e-postadaki onaya tıkla</button>`;
          return r.devLink ? `<button id="ol-dev-reset" data-href="${esc(r.devLink)}" style="${btnCss('#334155', '#64748b')}">🧪 Deneme modu: e-postadaki bağlantıyı aç</button>` : '';
        };
        if (mode === 'forgot' || mode === 'resend') {
          const r = await api('POST', mode === 'forgot' ? '/api/account/forgot' : '/api/account/resend', { email });
          msg = r.message; isErr = false; extra = devBtns(r);
          return draw();
        }
        if (mode === 'register') {
          // Kayıtta oturum açılmaz: oyuncu e-postasındaki bağlantıyla girer (e-postanın kayıtlı olup olmadığı belli olmaz)
          const r = await api('POST', '/api/account/register', { email, password: sifre, ...(promoVal ? { promo: promoVal } : {}) });
          msg = r.message; isErr = false; extra = devBtns(r);
          return draw();
        }
        let r = await api('POST', '/api/account/login', { email, password: sifre });
        if (r.need2fa) {
          let errMsg = '';
          for (;;) {
            const code = await askCode('Muhafız Mührü — giriş', errMsg);
            if (code == null) { msg = 'Giriş iptal edildi.'; isErr = true; return draw(); }
            try { r = await api('POST', '/api/account/login2fa', { ticket: r.ticket, code }); break; }
            catch (err) { if (/süresi doldu/i.test(err.message)) { msg = err.message; isErr = true; return draw(); } errMsg = err.message; }
          }
          if (r.backupLeft != null) ctx.toast(`🛡️ Yedek kodla girdin. Kalan yedek kod: ${r.backupLeft}`, 'info');
        }
        saveSession(r.token, r.playerId);
        closeOverlay();
        resolve(true);
      } catch (err) {
        msg = err.message || 'Bir şeyler ters gitti'; isErr = true;
        draw();
      }
    }
    draw();
  });
}

// Giriş yapılmamışsa giriş penceresini açar; giriş yapılınca kayıt sunucudan yüklenir. Döner: giriş yapıldı mı
let loginPromise = null;
export function requireLogin(startMode = 'login') {
  if (token) return Promise.resolve(true);
  if (loginPromise) return loginPromise;
  loginPromise = loginFlow(startMode).then(async okd => {
    if (okd) {
      try { apply(await api('GET', '/api/state')); ctx.toast('✅ Hoş geldin! Krallığın yüklendi.', 'success'); }
      catch (err) { ctx.toast(err.message, 'error'); }
    }
    return !!okd;
  }).finally(() => { loginPromise = null; });
  return loginPromise;
}
export const isLoggedIn = () => !!token;

async function relogin() {
  token = null;
  try { localStorage.removeItem(SESSION_KEY); } catch { /* yok */ }
  await requireLogin();
}

export async function logout() {
  try { await api('POST', '/api/account/logout'); } catch { /* zaten kapalı */ }
  try { localStorage.removeItem(SESSION_KEY); } catch { /* yok */ }
  location.reload();
}

// Bağlı cüzdan: Core/MetaMask ile imza → e-posta onayı (değişiklikte 48 saat)
async function linkWalletFlow() {
  if (!window.ethereum) { ctx.toast('Bu tarayıcıda cüzdan bulunamadı. Core ya da MetaMask eklentisini kur.', 'error'); return; }
  try {
    const accs = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const address = String(accs && accs[0] || '').toLowerCase();
    if (!address) throw new Error('Cüzdan adresi alınamadı');
    const { message } = await api('POST', '/api/account/wallet/nonce', { address });
    const signature = await window.ethereum.request({ method: 'personal_sign', params: [toHex(message), address] });
    const r = await withCode(code => api('POST', '/api/account/wallet/link', { signature, code }), 'Muhafız Mührü — cüzdan bağlama');
    const t = tokenFromLink(r.devLink, 'wallet');
    overlay(`
      <div style="font-size:2rem;" aria-hidden="true">${r.change ? '🛡️' : '📧'}</div>
      <div data-ol-baslik style="font-weight:900;color:#fde047;font-size:1.1rem;margin:4px 0;">${r.change ? 'Haberci yola çıktı!' : 'Son bir adım!'}</div>
      <div style="font-size:0.85rem;color:#cbd5e1;line-height:1.55;text-align:left;">
        E-postana bir onay bağlantısı gönderdik. ${r.change ? 'Onayladıktan sonra yeni cüzdanın <strong>48 saat</strong> içinde etkinleşecek; o zamana kadar ödemelerin eski cüzdanına gider.' : 'Onayladığın anda cüzdanın bağlanacak.'}
        ${r.change ? `<div style="${boxCss}">${KALE_KAPISI}</div>` : ''}
      </div>
      ${t ? `<button id="lw-dev" style="${btnCss('#334155', '#64748b')}">🧪 Deneme modu: e-postadaki onayı şimdi ver</button>` : ''}
      <button id="lw-ok" style="${btnCss('#7c3aed', '#c084fc')}">Tamam</button>`, { vazgec: () => openWalletPanel() });
    document.getElementById('lw-ok').onclick = () => openWalletPanel();
    if (t) document.getElementById('lw-dev').onclick = async () => { await confirmWalletLink(t); openWalletPanel(); };
  } catch (err) {
    ctx.toast(err && err.code === 4001 ? 'İmza reddedildi.' : err.message, 'error');
  }
}

async function confirmWalletLink(t) {
  try {
    const r = await api('POST', '/api/account/wallet/confirm', { token: t });
    if (r.immediate) ctx.toast('✅ Cüzdanın hesabına bağlandı!', 'success');
    else ctx.toast(`🛡️ Onaylandı. Yeni cüzdanın ${new Date(r.activeAt).toLocaleString('tr-TR')} tarihinde etkinleşecek.`, 'success');
  } catch (err) { ctx.toast(err.message, 'error'); }
}

// ── Hesap ve cüzdan ekranı ─────────────────────────────────────────────
// E-planı Faz 2, Kanal B (8 Ekim): oyun içinde ASTRA almanın nasıl olacağı bilgi kutusu. Arena TokenManager'ın
// buyAndCreateLpIfPossible fonksiyonunu doğrudan kodlamadım — parametrelerin (amount) tam anlamı ve msg.value
// ilişkisi doğrulanamadı (Snowtrace'de ABI var ama kaynak metni erişilemedi); gerçek parayla yanlış kodlanmış bir
// zincir çağrısı denemektense oyuncuyu doğrulanmış sözleşme adresi + Snowtrace bağlantısıyla bilgilendirmek daha
// güvenli. Aldığı ASTRA'yı kasasına/cüzdanına gönderince zaten var olan tarama (scanDeposits/kasa) otomatik işler.
function astraAlPanelHtml(tokenAddress) {
  return `<div style="${boxCss};font-size:0.8rem;color:#cbd5e1;line-height:1.55;">
    <div style="font-weight:800;color:#86efac;margin-bottom:6px;">💎 ASTRA nereden alınır?</div>
    <div>Avalanche ağında (C-Chain) bir cüzdanın (Core/MetaMask) ve içinde biraz AVAX olmalı. Arena üzerinden (token adı <strong>AdAstra</strong>, Token ID <strong>106334</strong>) ya da bu sözleşme adresini destekleyen bir yerden AVAX ile ASTRA alabilirsin.</div>
    <div style="font-family:monospace;font-size:0.76rem;word-break:break-all;color:#86efac;margin-top:6px;">${esc(tokenAddress)}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
      <button id="aa-copy" style="padding:5px 10px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#fff;cursor:pointer;font-size:0.78rem;">📋 Sözleşme adresini kopyala</button>
      <a href="https://snowtrace.io/token/${esc(tokenAddress)}" target="_blank" rel="noopener" class="ol-baglanti" style="padding:5px 10px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#93c5fd;text-decoration:none;font-size:0.78rem;">🔍 Snowtrace'de gör</a>
    </div>
    <div style="margin-top:6px;color:#94a3b8;">Aldığın ASTRA'yı Oyun Kasası adresine ya da hesabına bağlı cüzdanına gönder; oyun otomatik işler.</div>
  </div>`;
}

let lockOpen = false, astraAlOpen = false;
export async function openWalletPanel() {
  if (!online.active) return;
  if (!token && !(await requireLogin())) return;
  const el = overlay('<div data-ol-baslik style="padding:20px;">⏳ Yükleniyor…</div>', { dismissable: true });
  let w, k;
  try { [w, k] = await Promise.all([api('GET', '/api/wallet'), api('GET', '/api/kasa').catch(() => null)]); } catch (err) { el.innerHTML = ''; ctx.toast(err.message, 'error'); closeOverlay(); return; }
  const acc = w.account || {};
  const wd = w.withdraw;
  const snow = h => `https://snowtrace.io/tx/${h}`;
  const statusTr = { pending: '⏳ sırada', sending: '📤 gönderiliyor', sent: '✅ gönderildi' };
  const next = wd.nextSettlementAt ? new Date(wd.nextSettlementAt).toLocaleString('tr-TR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : 'Pazartesi 00:01';
  const pendingLine = acc.pendingWallet
    ? (acc.pendingConfirmed
      ? `<div style="margin-top:6px;color:#fbbf24;">🛡️ Yeni cüzdan <strong>${short(acc.pendingWallet)}</strong> ${new Date(acc.pendingActiveAt).toLocaleString('tr-TR')} tarihinde etkinleşecek.</div>`
      : `<div style="margin-top:6px;color:#fbbf24;">📧 <strong>${short(acc.pendingWallet)}</strong> için e-posta onayı bekleniyor.</div>`)
      + `<button id="wp-wcancel" style="margin-top:6px;padding:5px 10px;border-radius:6px;border:1px solid #f87171;background:#3f1d1d;color:#fecaca;cursor:pointer;font-size:0.78rem;">✋ Bu ben değilim — değişikliği iptal et</button>`
    : '';
  overlay(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <div data-ol-baslik style="font-weight:900;color:#fde047;font-size:1.1rem;">🏦 Hesabım</div>
      <button id="wp-close" aria-label="Pencereyi kapat" style="background:none;border:none;color:#94a3b8;font-size:1.3rem;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:0.8rem;color:#94a3b8;text-align:left;display:flex;flex-wrap:wrap;align-items:center;column-gap:10px;">
      <span>📧 <strong style="color:#e2e8f0;">${esc(acc.email)}</strong>
      ${acc.verified ? '<span style="color:#4ade80;">✓ doğrulandı</span>' : '<span style="color:#fbbf24;">doğrulanmadı</span>'}</span>
      ${acc.verified ? '' : '<a href="#" id="wp-resend" class="ol-baglanti" style="color:#93c5fd;">bağlantıyı yeniden gönder</a>'}
      <a href="#" id="wp-logout" class="ol-baglanti" style="color:#f87171;">çıkış</a></div>
    <div style="display:flex;gap:8px;justify-content:space-between;margin:12px 0 4px;font-size:0.85rem;font-weight:800;">
      <span style="color:#4ade80;">🔓 Serbest<br>${fmt(wd.free)}</span>
      <button type="button" id="wp-lock-toggle" title="Kilitli ASTRA nasıl açılır? Tıkla" style="background:none;border:0;color:#fbbf24;font:inherit;font-weight:800;cursor:pointer;padding:0;text-decoration:underline dotted;text-underline-offset:3px;">🔒 Kilitli ⓘ<br>${fmt(wd.locked)}</button>
      <span style="color:#38bdf8;">🏦 Çekimde<br>${fmt(wd.pending)}</span>
    </div>
    <div style="text-align:center;margin:-2px 0 6px;"><button type="button" id="aa-toggle" style="background:none;border:0;color:#86efac;font-size:0.78rem;cursor:pointer;padding:0;text-decoration:underline dotted;text-underline-offset:3px;">💎 ASTRA nereden alınır? ⓘ</button></div>
    <div id="aa-panel" style="display:${astraAlOpen ? 'block' : 'none'};">${astraAlPanelHtml(w.tokenAddress)}</div>
    <div id="wp-lock-panel" style="display:${lockOpen ? 'block' : 'none'};">${lockPanelHtml()}</div>
    <div style="${boxCss}">
      <div style="font-weight:800;color:#c4b5fd;margin-bottom:4px;">🦊 Bağlı Cüzdan</div>
      <div style="font-size:0.8rem;color:#cbd5e1;line-height:1.45;">${acc.wallet ? `Ödemelerin ve çekimlerin <strong style="font-family:monospace;">${short(acc.wallet)}</strong> cüzdanına gider.` : 'Henüz cüzdan bağlamadın. Çekim ve cüzdandan ödeme için Core ya da MetaMask cüzdanını bağla.'}</div>
      ${pendingLine}
      <button id="wp-link" style="margin-top:8px;padding:7px 12px;border-radius:8px;border:1px solid #a78bfa;background:#4c1d95;color:#fff;font-weight:800;cursor:pointer;">${acc.wallet ? '🔁 Cüzdanı değiştir' : '🔗 Cüzdan bağla'}</button>
      ${acc.wallet ? `<div style="font-size:0.78rem;color:#94a3b8;line-height:1.5;margin-top:8px;">${KALE_KAPISI}</div>` : ''}
    </div>
    ${twoFactorSection(acc)}
    ${kasaSection(k)}
    <div style="${boxCss}">
      <div style="font-weight:800;color:#bfdbfe;margin-bottom:4px;">🏧 Kazanç Çekimi</div>
      <div style="font-size:0.8rem;color:#cbd5e1;line-height:1.45;">Oyunda kazandığın ASTRA'nın serbest kısmı çekilir. Talepler <strong>${next}</strong> haftalık ortak havuzdan karşılanır. Bu haftaki tahmini hakkın (katkı puanına göre): <strong>${fmt(wd.estimatedRight)} ASTRA</strong>. Ücret %${(wd.feeRate * 100).toFixed(0)}${wd.brake ? ' (fiyat freni açık)' : ''}; hakkını aşan kısım için %${(wd.rentRate * 100).toFixed(1).replace('.', ',')} hak kirası. Sığmayan kısım bakiyene döner.</div>
      ${wd.paused ? '<div style="margin-top:6px;color:#fca5a5;font-size:0.82rem;">Çekimler şu an bakımda.</div>' : `
      ${etiketHtml('wp-amount', 'Çekmek istediğin miktar (ASTRA)', { gizli: true })}
      <div style="display:flex;gap:6px;margin-top:8px;">
        <input id="wp-amount" type="number" min="${wd.minWithdraw}" placeholder="En az ${fmt(wd.minWithdraw)} ASTRA" style="flex:1;padding:8px;border-radius:6px;border:1px solid #475569;background:#111827;color:#fff;">
        <button id="wp-withdraw" style="padding:8px 12px;border-radius:6px;border:1px solid #60a5fa;background:#1d4ed8;color:#fff;font-weight:800;cursor:pointer;">Talep ver</button>
      </div>`}
      ${wd.pending > 0 ? '<button id="wp-cancel" style="margin-top:6px;padding:5px 10px;border-radius:6px;border:1px solid #f87171;background:#3f1d1d;color:#fecaca;cursor:pointer;font-size:0.78rem;">↩️ Bekleyen talebi geri al</button>' : ''}
    </div>
    <div style="text-align:left;margin-top:10px;padding:10px;border:1px solid #334155;border-radius:10px;background:#0f172a;">
      <div style="font-weight:800;color:#fde047;margin-bottom:6px;">🎟️ Promo kodu</div>
      ${etiketHtml('wp-promo', 'Promo kodu', { gizli: true })}
      <div style="display:flex;gap:6px;"><input id="wp-promo" type="text" autocomplete="off" maxlength="32" placeholder="Kodu yaz" style="flex:1;min-width:0;padding:8px;border-radius:6px;border:1px solid #475569;background:#111827;color:#fff;text-transform:uppercase;">
        <button id="wp-promo-go" style="padding:8px 12px;border-radius:6px;border:1px solid #fbbf24;background:#92400e;color:#fff;font-weight:800;cursor:pointer;">Kullan</button></div>
      <div style="font-size:0.72rem;color:#94a3b8;margin-top:4px;">Her kod bir hesapta bir kez kullanılır. ASTRA ödülü kilitli gelir, oyunda harcadıkça açılır.</div>
    </div>
    ${wd.payouts && wd.payouts.length ? `<div style="text-align:left;margin-top:10px;font-size:0.78rem;color:#cbd5e1;max-height:140px;overflow:auto;">
      <div style="font-weight:800;margin-bottom:4px;">Son gönderimler</div>
      ${wd.payouts.map(p => `<div>${fmt(p.amount)} ASTRA · ${statusTr[p.status] || esc(p.status)}${p.tx_hash ? ` · <a href="${snow(esc(p.tx_hash))}" target="_blank" rel="noopener" class="ol-baglanti" style="color:#93c5fd;">işlem</a>` : ''}</div>`).join('')}
    </div>` : ''}`, { dismissable: true });
  const $ = id => document.getElementById(id);
  $('wp-close').onclick = closeOverlay;
  $('wp-lock-toggle').onclick = () => { lockOpen = !lockOpen; $('wp-lock-panel').style.display = lockOpen ? 'block' : 'none'; };
  $('aa-toggle').onclick = () => { astraAlOpen = !astraAlOpen; $('aa-panel').style.display = astraAlOpen ? 'block' : 'none'; };
  if ($('aa-copy')) $('aa-copy').onclick = () => { navigator.clipboard?.writeText(w.tokenAddress); ctx.toast('Sözleşme adresi kopyalandı', 'success'); };
  $('wp-logout').onclick = e => { e.preventDefault(); logout(); };
  if ($('wp-resend')) $('wp-resend').onclick = async e => {
    e.preventDefault();
    try {
      const r = await api('POST', '/api/account/resend', { email: acc.email });
      const t = tokenFromLink(r.devLink, 'verify');
      if (t) { const v = await dogrulamaSifresiSor(t); if (v) ctx.toast('🧪 Deneme modu: e-postan doğrulandı.', 'success'); openWalletPanel(); }
      else ctx.toast('📧 Doğrulama bağlantısı yeniden gönderildi.', 'success');
    } catch (err) { ctx.toast(err.message, 'error'); }
  };
  $('wp-link').onclick = () => linkWalletFlow();
  $('wp-promo-go').onclick = async () => {
    const code = $('wp-promo').value.trim();
    if (!code) return ctx.toast('Önce kodu yaz.', 'info');
    $('wp-promo-go').disabled = true;
    try {
      const r = await api('POST', '/api/promo/redeem', { code });
      apply(await api('GET', '/api/state'));
      ctx.toast(r.message, 'success');
      openWalletPanel();
    } catch (err) { ctx.toast(err.message, 'error'); $('wp-promo-go').disabled = false; }
  };
  if ($('tf-on')) $('tf-on').onclick = () => enable2faFlow();
  if ($('tf-renew')) $('tf-renew').onclick = () => renewBackupFlow();
  if ($('tf-off')) $('tf-off').onclick = async () => {
    if (!confirm('Muhafız Mührü kaldırılsın mı? Hesabın yalnız şifreyle korunur.')) return;
    try { await withCode(code => api('POST', '/api/account/2fa/disable', { code }), 'Mührü kaldır'); ctx.toast('Muhafız Mührü kaldırıldı.', 'info'); }
    catch (err) { ctx.toast(err.message, 'error'); }
    openWalletPanel();
  };
  if ($('ks-copy')) $('ks-copy').onclick = () => { navigator.clipboard?.writeText(k.address); ctx.toast('Kasa adresi kopyalandı', 'success'); };
  if ($('ks-refresh')) $('ks-refresh').onclick = async () => { try { await api('POST', '/api/kasa/refresh'); ctx.toast('🔄 Kasa bakiyesi güncellendi', 'success'); openWalletPanel(); } catch (err) { ctx.toast(err.message, 'error'); } };
  if ($('ks-test')) $('ks-test').onclick = async () => { try { await api('POST', '/api/kasa/test-deposit', { ada: 10000, avax: 0.1 }); ctx.toast('🧪 Kasaya deneme parası eklendi', 'success'); openWalletPanel(); } catch (err) { ctx.toast(err.message, 'error'); } };
  if ($('ks-withdraw')) $('ks-withdraw').onclick = async () => {
    const asset = $('ks-asset').value, amount = Number($('ks-amount').value);
    try { const r = await withCode(code => api('POST', '/api/kasa/withdraw', { asset, amount, code }), 'Muhafız Mührü — kasadan çekim'); ctx.toast(r.message, 'success'); setTimeout(openWalletPanel, 800); }
    catch (err) { ctx.toast(err.message, 'error'); openWalletPanel(); }
  };
  if ($('wp-wcancel')) $('wp-wcancel').onclick = async () => {
    try { await api('POST', '/api/account/wallet/cancel'); ctx.toast('✋ Cüzdan değişikliği iptal edildi. Şifreni değiştirmeyi unutma!', 'success'); openWalletPanel(); }
    catch (err) { ctx.toast(err.message, 'error'); }
  };
  if ($('wp-withdraw')) $('wp-withdraw').onclick = async () => {
    try {
      const amount = Number($('wp-amount').value);
      const r = await withCode(code => api('POST', '/api/withdraw', { amount, code }), 'Muhafız Mührü — çekim');
      ctx.toast(r.message, r.success ? 'success' : 'error');
      await sync();
      openWalletPanel();
    } catch (err) { ctx.toast(err.message, 'error'); openWalletPanel(); }
  };
  if ($('wp-cancel')) $('wp-cancel').onclick = async () => {
    try { const r = await api('POST', '/api/withdraw/cancel'); ctx.toast(r.message, r.success ? 'success' : 'error'); await sync(); openWalletPanel(); }
    catch (err) { ctx.toast(err.message, 'error'); }
  };
}

// E-postadaki bağlantılar (?verify= / ?reset= / ?wallet=) oyunda açılınca
async function handleEmailLinks() {
  const p = new URLSearchParams(location.search);
  const clean = () => { try { history.replaceState(null, '', location.pathname); } catch { /* yok */ } };
  if (p.get('verify')) {
    clean();
    try {
      const r = await dogrulamaSifresiSor(p.get('verify'));
      if (!r) return;                                  // oyuncu vazgeçti; bağlantı harcanmadı, e-postadan yeniden açılabilir
      if (r.token) {
        // Açık bir oturum varsa ve bağlantı başka bir hesabınsa sessizce geçilmez (bağlantıyı başkasından alan oyuncu
        // kendi hesabını bırakıp yabancı bir hesapta oynamasın)
        if (token && online.playerId && r.playerId && r.playerId !== online.playerId
          && !window.confirm('Bu bağlantı, şu an açık olan hesabından FARKLI bir hesabın e-postasını doğruluyor. O hesaba geçilsin mi?')) {
          ctx.toast('Hesap değiştirilmedi.', 'info');
          return;
        }
        saveSession(r.token, r.playerId);
        apply(await api('GET', '/api/state'));
        ctx.toast('✅ E-postan doğrulandı. Krallığa hoş geldin! 👑', 'success');
      } else {
        ctx.toast('✅ E-postan doğrulandı. Şimdi giriş yap.', 'success');
        requireLogin('login');
      }
    } catch (err) { ctx.toast(err.message, 'error'); }
  } else if (p.get('wallet')) {
    clean();
    await confirmWalletLink(p.get('wallet'));
  } else if (p.get('reset')) {
    clean();
    const t = p.get('reset');
    const el = overlay(`
      <div style="font-size:2rem;" aria-hidden="true">🗝️</div>
      <div data-ol-baslik style="font-weight:900;color:#fde047;font-size:1.1rem;">Yeni Şifre</div>
      ${etiketHtml('rs-pass', 'Yeni şifre (en az 8 karakter)')}
      <input id="rs-pass" type="password" autocomplete="new-password" placeholder="Yeni şifre (en az 8 karakter)" style="${inputCss}">
      ${etiketHtml('rs-pass2', 'Yeni şifre (tekrar)')}
      <input id="rs-pass2" type="password" autocomplete="new-password" placeholder="Yeni şifre (tekrar)" style="${inputCss}">
      <button id="rs-go" style="${btnCss('#7c3aed', '#c084fc')}">Şifreyi Kaydet</button>
      <div id="rs-msg" role="alert" style="margin-top:8px;font-size:0.85rem;color:#fca5a5;"></div>
      <button id="rs-iptal" style="${linkCss}">Vazgeç</button>`, { vazgec: () => closeOverlay() });
    el.querySelector('#rs-iptal').onclick = () => closeOverlay();
    el.querySelector('#rs-go').onclick = async () => {
      if (el.querySelector('#rs-pass').value !== el.querySelector('#rs-pass2').value) { el.querySelector('#rs-msg').textContent = '⚠️ Şifreler aynı değil. İkisini de yeniden yaz.'; return; }
      try {
        const r = await api('POST', '/api/account/reset', { token: t, password: el.querySelector('#rs-pass').value });
        closeOverlay();
        ctx.toast(r.twoFactor ? '✅ Şifren yenilendi. Girişte Muhafız Mührü kodun da istenecek.' : '✅ Şifren yenilendi. Şimdi giriş yap.', 'success');
        requireLogin('login');
      } catch (err) { el.querySelector('#rs-msg').textContent = err.message; }
    };
  }
}

// ── 💳 Cüzdandan ödeme (kazanılmış bakiye yetmeyince) ─────────────────
const INSUFFICIENT_RE = /Yetersiz\s*(\$?ADASTRA|AdAstra|ASTRA|ADA)\b/i;
const PAY_STARTED = { success: false, message: '💳 Bakiyen bu işleme yetmedi — cüzdandan ödeme penceresi açıldı.' };
const pad32 = h => String(h).toLowerCase().replace(/^0x/, '').padStart(64, '0');
// Derlemede sabitlenmiş ödeme sözleşmesi / token adresi (VITE_PAYMENTS_CONTRACT, VITE_TOKEN_ADDRESS); gerçek ağ derlemesinde zorunlu (vite.config.js)
const ODEME_SABIT = sabitAdresler(import.meta.env);
const toHexQ = n => '0x' + BigInt(n).toString(16);
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
let paying = false;

async function waitReceipt(hash, maxMs = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const rc = await window.ethereum.request({ method: 'eth_getTransactionReceipt', params: [hash] }).catch(() => null);
    if (rc) { if (rc.status !== '0x1') throw new Error('İşlem zincirde başarısız oldu.'); return rc; }
    await sleepMs(2000);
  }
  throw new Error('İşlemin onayı gecikti. Biraz sonra Hesabım ekranından kontrol et.');
}

async function ensureChain(chainId) {
  const want = '0x' + Number(chainId).toString(16);
  const cur = await window.ethereum.request({ method: 'eth_chainId' });
  if (String(cur).toLowerCase() === want) return;
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: want }] });
  } catch (e) {
    if (e && e.code === 4902 && Number(chainId) === 43114) {
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: want, chainName: 'Avalanche C-Chain', nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 }, rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'], blockExplorerUrls: ['https://snowtrace.io'] }] });
    } else throw e;
  }
}

async function payOnChain(q, setStep) {
  if (!window.ethereum) throw new Error('Bu tarayıcıda cüzdan bulunamadı. Core ya da MetaMask eklentisini kur.');
  // H1: cüzdana HİÇBİR şey sorulmadan önce, sunucunun verdiği adresler derlemeye sabitlenmiş adreslerle karşılaştırılır.
  // Uyuşmazlıkta ödeme ve izin istenmez (sunucu ele geçirilse bile cüzdan sahte bir sözleşmeye izin vermez).
  const adresSorunu = adresDenetle(q, ODEME_SABIT);
  if (adresSorunu) throw new Error(adresSorunu);
  const accs = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const from = String(accs && accs[0] || '').toLowerCase();
  if (from !== String(q.wallet).toLowerCase()) throw new Error(`Cüzdanında hesabına bağlı adresi seç: ${short(q.wallet)}`);
  setStep('Avalanche ağına geçiliyor…');
  await ensureChain(q.chainId);
  const amountWei = BigInt(q.amountAda) * 10n ** 18n;
  const allowanceHex = await window.ethereum.request({ method: 'eth_call', params: [{ to: q.token, data: '0xdd62ed3e' + pad32(from) + pad32(q.contract) }, 'latest'] });
  // Karar (H1): izin yalnız BU ödemenin tutarı kadar istenir, sınırsız (2^256-1) değil. Alternatif: bir kez sınırsız izin
  // (sonraki ödemelerde onay sormaz, daha kolay) ama sözleşme/sunucu ele geçirilirse cüzdandaki bütün ASTRA çekilebilirdi;
  // tutar kadar izin her ödemede bir onay daha demek, kayıp tavanı ise o ödemenin tutarıdır. Mevcut izin yetiyorsa yeniden sorulmaz.
  const izin = izinIstenecek(allowanceHex || '0x0', amountWei);
  if (izin !== null) {
    setStep('Cüzdanında bu ödeme tutarı kadar "izin ver" onayını ver…');
    const ah = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from, to: q.token, data: '0x095ea7b3' + pad32(q.contract) + pad32(izin.toString(16)) }] });
    setStep('İzin onaylanıyor…');
    await waitReceipt(ah);
  }
  const gasPrice = BigInt(await window.ethereum.request({ method: 'eth_gasPrice' }));
  const maxFee = gasPrice * 3n / 2n;
  const value = maxFee * BigInt(q.feeGas);                       // komisyon: ağ ücreti kadar (en yüksek fiyatla)
  setStep('Cüzdanında ödemeyi onayla…');
  const hash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from, to: q.contract, value: toHexQ(value), maxFeePerGas: toHexQ(maxFee), data: '0x8e6bee97' + pad32(amountWei.toString(16)) + pad32(q.ref) }] });
  setStep('Ödeme zincirde onaylanıyor…');
  await waitReceipt(hash);
  return hash;
}

async function confirmPayment(ref, txHash) {
  for (let i = 0; i < 10; i++) {
    try { return await api('POST', '/api/pay/confirm', { ref, txHash }); }
    catch (err) { if (err.status !== 409) throw err; await sleepMs(3000); }
  }
  throw new Error('Ödeme zincirde görünmedi. Birkaç dakika sonra tekrar dene.');
}

async function startPayment(name, args) {
  if (paying) return;
  paying = true;
  try {
    let q;
    try { q = await api('POST', '/api/pay/quote', { name, args }); } catch (err) { ctx.toast(err.message, 'error'); return; }
    if (!q.needPayment) { if (q.message) ctx.toast(q.message, 'info'); return; }
    // H1: sunucunun verdiği adresler derlemeye sabitlenmişle uyuşmuyorsa ödeme hiç sunulmaz, açık uyarı gösterilir
    const adresSorunu = q.simulated ? null : adresDenetle(q, ODEME_SABIT);
    await new Promise(resolve => {
      let kapandi = false;   // oyuncu pencereyi kapattıysa süren zincir adımları pencereyi yeniden açmasın
      const vazgec = () => { kapandi = true; closeOverlay(); resolve(); };
      const draw = (step = '', errMsg = '') => {
        if (kapandi) return;
        const noWallet = !q.wallet && !q.simulated;
        const ozet = odemeOzeti(q, ctx.gameState && ctx.gameState.state ? ctx.gameState.state.adAstraBalance : undefined);
        const el = overlay(`
          <div style="font-size:2rem;" aria-hidden="true">💳</div>
          <div data-ol-baslik style="font-weight:900;color:#fde047;font-size:1.1rem;margin:4px 0;">Cüzdandan Öde</div>
          <div style="font-size:0.86rem;color:#cbd5e1;line-height:1.55;text-align:left;">
            Bu işlem <strong>${ozet.maliyet} ASTRA</strong> tutuyor; oyunda kazandığın bakiye <strong>${ozet.bakiye} ASTRA</strong>
            (eksik: <strong>${ozet.eksik} ASTRA</strong>).
            Cüzdanından <strong style="color:#fde047;">${ozet.odenecek} ASTRA</strong> ödenecek: eksik kısım ve fiyat oynarsa işlem yarıda kalmasın diye küçük bir pay.
            <div style="margin-top:6px;color:#94a3b8;font-size:0.8rem;">Avalanche ağ ücreti ve aynı tutarda küçük bir oyun komisyonu (AVAX) alınır. Ödediğin ASTRA'dan işlemden artan kısım oyun bakiyende kalır.</div>
          </div>
          ${adresSorunu ? `<div role="alert" style="${boxCss};color:#fecaca;border-color:#b91c1c;background:#3f1d1d;">${esc(adresSorunu)}</div>` : ''}
          ${!adresSorunu && noWallet ? `<div style="${boxCss};color:#fbbf24;">Cüzdandan ödeme için önce hesabına bir cüzdan bağla.</div><button id="py-acc" style="${btnCss('#4c1d95', '#a78bfa')}">🔗 Hesabım → Cüzdan bağla</button>` : ''}
          ${!adresSorunu && q.simulated ? `<button id="py-sim" style="${btnCss('#334155', '#64748b')}">🧪 Deneme modu: ödemeyi taklit et</button>` : ''}
          ${!adresSorunu && !noWallet && !q.simulated ? `<button id="py-go" ${step ? 'disabled' : ''} style="${btnCss('#7c3aed', '#c084fc')}">${step ? '⏳ İşlem sürüyor…' : '🦊 Cüzdanla Öde'}</button>` : ''}
          ${step ? `<div role="status" style="margin-top:8px;font-size:0.82rem;color:#cbd5e1;">${esc(step)}</div>` : ''}
          ${errMsg ? `<div role="alert" style="margin-top:8px;font-size:0.85rem;color:#fca5a5;">${esc(errMsg)}</div>` : ''}
          <button id="py-cancel" style="${linkCss}">Vazgeç</button>`, { vazgec });
        el.querySelector('#py-cancel').onclick = vazgec;
        el.querySelector('#py-acc')?.addEventListener('click', () => { kapandi = true; resolve(); openWalletPanel(); });
        const finish = async txHash => {
          const r = await confirmPayment(q.ref, txHash);
          apply(r);
          if (!kapandi) closeOverlay();
          kapandi = true;
          const res = r.result || {};
          ctx.toast(res.success === false ? `Ödemen alındı (${fmt(r.paid)} ASTRA bakiyende) ama işlem yapılamadı: ${res.message}` : `✅ Ödeme alındı. ${res.message || ''}`, res.success === false ? 'info' : 'success');
          resolve();
        };
        el.querySelector('#py-sim')?.addEventListener('click', async () => { try { await finish('test'); } catch (err) { draw('', err.message); } });
        el.querySelector('#py-go')?.addEventListener('click', async () => {
          try { const h = await payOnChain(q, s => draw(s)); draw('Oyun sunucusu ödemeyi doğruluyor…'); await finish(h); }
          catch (err) { draw('', err && err.code === 4001 ? 'Cüzdanda reddedildi.' : err.message); }
        });
      };
      draw();
    });
  } finally {
    paying = false;
  }
}

// ── Kolezyum: gerçek rakipler ───────────────────────────────────────────
export const pvp = {
  status: () => api('GET', '/api/pvp/status'),
  match: id => api('GET', '/api/pvp/match?id=' + encodeURIComponent(id)),
  async queue(mode, indices) {
    const r = await api('POST', '/api/pvp/queue', { mode, indices });
    apply(r);
    return r.result;
  },
  async leave() {
    const r = await api('POST', '/api/pvp/leave');
    apply(r);
    return r.result;
  }
};

// ── İlan pazarı (teçhizat; yalnız sunucuda, server/pazar.js) ────────────
// 🧪 Deneme sunucusunda vanilla sıfırlama: sunucu dünyayı ve bütün kayıtları ilk güne döndürür, sayfa yenilenir
export async function devVanillaReset() {
  if (!token) { requireLogin(); return GUEST_FAIL; }
  const r = await api('POST', '/api/dev/vanilla-reset');
  try { ctx.gameState.vanillaReset(); } catch { /* yerel kopya zaten sunucudan gelecek */ }
  return r;
}

export const sponsor = {
  tablo: () => api('GET', '/api/sponsor/tablo'),
  benim: () => api('GET', '/api/sponsor/benim'),
  async ol(hedef, miktar) { const r = await api('POST', '/api/sponsor/ol', { hedef, miktar }); await sync(); return r; },
  feragat: id => api('POST', '/api/sponsor/feragat', { id }),
  kapat: id => api('POST', '/api/sponsor/kapat', { id })
};

export const pazar = {
  list: () => api('GET', '/api/pazar'),
  async sell(ref, price) { const r = await api('POST', '/api/pazar/sell', { ref, price }); apply(r); return r.result; },
  async cancel(id) { const r = await api('POST', '/api/pazar/cancel', { id }); apply(r); return r.result; },
  async buy(id) { const r = await api('POST', '/api/pazar/buy', { id }); apply(r); return r.result; }
};

// ── Başlat ──────────────────────────────────────────────────────────────
// Sunucu varsa girişi yapar, kaydı yükler ve true döner; yoksa false (deneme modu).
function kayitliOturum() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return saved && saved.token ? saved : null;
  } catch { return null; /* özel pencere */ }
}

export async function startOnline(context) {
  const saved = kayitliOturum();
  const health = await detectServer();
  if (!health) {
    // Sunucu adresi derlemede verilmişse (üretim) ya da bu tarayıcıda açık bir oturum varsa yanıt vermemesi bir arızadır:
    // oyun sessizce boş yerel moda düşmesin (oyuncu "hesabım kayboldu" sanmasın), kart gösterilsin (denetim QA-09)
    online.sunucuBeklendi = !!API_BASE || !!saved;
    if (saved) hesapYuklenemediKarti({ ag: true, status: 0 }, { sayfayiYenile: true });
    return false;
  }
  ctx = context;
  online.active = true;
  online.health = health;
  if (saved) { token = saved.token; online.playerId = saved.playerId; }
  let payload = null;
  let yuklemeHatasi = null;
  if (token) {
    try { payload = await api('GET', '/api/state'); }
    catch (err) {
      if (err && err.status === 401) {
        // Oturum gerçekten geçersiz (süresi doldu / başka yerden çıkış yapıldı): sessizce misafir olmak yerine bilgi ver
        token = null;
        try { localStorage.removeItem(SESSION_KEY); } catch { /* yok */ }
        online.oturumSonaErdi = true;
      } else yuklemeHatasi = err || {};   // 500, ağ, zaman aşımı: oturum KORUNUR
    }
  }
  // Giriş yapılmamışsa giriş istenmez: herkes gezebilir, işlem yapmak isteyince sorulur
  if (token && payload) apply(payload);
  installProxies();
  if (yuklemeHatasi) hesapYuklenemediKarti(yuklemeHatasi);
  else if (online.oturumSonaErdi) setTimeout(() => { try { ctx.toast('🔐 Oturumunun süresi dolmuş; hesabına yeniden giriş yap.', 'info'); } catch { /* arayüz yok */ } }, 1500);
  handleEmailLinks();
  setInterval(sync, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  window.addEventListener('online', () => sync());   // bağlantı geri gelince hemen eşitle
  return true;
}
