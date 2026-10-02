// Realm of Astra — çevrimiçi mod (oyun sunucudan açıldığında)
// ============================================================================
// Oyun bir Realm of Astra sunucusundan açılırsa (/api/health yanıt verirse) çevrimiçi moda geçer:
//  • Oyuncu cüzdanıyla (Core / MetaMask) imza atarak girer; şifre yoktur.
//  • Kayıt sunucudadır. Normal işlemler ekranda hemen görünür ve arkadan sunucuya gider; sunucunun
//    yanıtı her zaman son sözdür (tarayıcıdaki kopya sunucununkiyle değiştirilir).
//  • Şanslı işlemlerin (savaş, çark, kutu, teçhizat yapımı) sonucunu yalnız sunucu belirler; tarayıcı bekler.
//  • Pazar, hazine ve haftalık kota bütün oyuncular için ortaktır ve sunucudan gelir.
// Sunucu yoksa (bilgisayardaki deneme modu) hiçbir şey değişmez: oyun eskisi gibi tarayıcıda çalışır.
// ============================================================================
import { ACTIONS, DEV_ACTIONS } from '../../server/actions.js';

const SESSION_KEY = 'adastra_session_v1';
// Zamanla ilerleyen işler: tarayıcıda yalnız görüntü için çalışır, sunucuya gönderilmez (sunucu kendisi işler)
const LOCAL_ONLY = ['runTavernaAutomationCycle', 'updateExpeditions', 'regenerateStamina', 'processSoldierPassiveHealing',
  'tickUpgradeCostBot', 'updateBotPauseState', 'checkDailyAutonomousBuyback', 'processEconomyTick', 'processScheduledLottery',
  'processOfflineProgress', 'simulateTimePassage', 'checkOnboardingProgress', 'checkAndProcessBotAutoRenew'];
// Yalnız tarayıcıya ait arayüz tercihleri: sunucu kaydı bunları ezmez
const CLIENT_KEYS = ['guideDismissed'];

export const online = { active: false, address: null, pending: 0, lastSync: 0 };
let ctx = null;            // { gameState, ammMarket, treasury, globalPool, toast, onApplied }
let token = null;

const short = a => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
const fmt = v => Math.floor(Number(v) || 0).toLocaleString('tr-TR');

async function api(method, path, body) {
  const res = await fetch(path, {
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
    throw err;
  }
  return data;
}

export async function detectServer() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.ok ? j : null;
  } catch {
    return null;
  }
}

// ── Sunucu görüntüsünü oyuna uygula ─────────────────────────────────────
function apply(payload) {
  if (!payload || !payload.player) return;
  const { gameState, ammMarket, treasury, globalPool } = ctx;
  const keep = {};
  for (const k of CLIENT_KEYS) if (gameState.state && gameState.state[k] !== undefined) keep[k] = gameState.state[k];
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
  }
  online.lastSync = Date.now();
  try { gameState.notifyListeners(); } catch { /* arayüz */ }
  try { ctx.onApplied && ctx.onApplied(); } catch { /* arayüz */ }
}

async function sync() {
  if (!online.active || !token || online.pending > 0) return;
  try { apply(await api('GET', '/api/state')); }
  catch (err) { if (err.status === 401) return relogin(); }
}

// ── İşlemleri sunucuya gönder ───────────────────────────────────────────
let queue = Promise.resolve();
function cleanArgs(args, spec) {
  const out = Array.from(args).slice(0, spec.types.length).map(v => (v === undefined ? null : v));
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

function send(name, args, { wait = false } = {}) {
  online.pending++;
  const job = queue.then(() => api('POST', '/api/action', { name, args })).then(res => {
    online.pending--;
    if (wait || online.pending === 0) apply(res);
    if (!wait && res.result && res.result.success === false && res.result.message) ctx.toast('Sunucu: ' + res.result.message, 'error');
    return res.result;
  }, err => {
    online.pending--;
    if (err.status === 401) relogin();
    else ctx.toast('Sunucu işlemi kabul etmedi: ' + err.message, 'error');
    sync();
    return { success: false, message: err.message };
  });
  queue = job.catch(() => {});
  return job;
}

const GUEST_FAIL = { success: false, message: '🔐 Bu işlem için önce giriş yap ya da hesap aç.' };

function installProxies() {
  const gs = ctx.gameState;
  let depth = 0;
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
        depth++;
        let r;
        try { r = orig.apply(gs, a); } finally { depth--; }
        if (!(r && r.success === false)) send(name, cleanArgs(a, spec));
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
  // Tarayıcıdaki kayıt yalnız önbellek: sunucuya gitmeyen değişiklikler bir sonraki eşitlemede düzelir
}

// ── Giriş ───────────────────────────────────────────────────────────────
function overlay(html) {
  let el = document.getElementById('online-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'online-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(5,8,16,0.92);padding:16px;';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div style="max-width:420px;width:100%;background:#111827;border:1px solid #a855f7;border-radius:14px;padding:22px;color:#e2e8f0;font-family:inherit;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.6);">${html}</div>`;
  return el;
}
const closeOverlay = () => document.getElementById('online-overlay')?.remove();

const toHex = s => '0x' + Array.from(new TextEncoder().encode(s)).map(b => b.toString(16).padStart(2, '0')).join('');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inputCss = 'width:100%;padding:10px;border-radius:8px;border:1px solid #475569;background:#0b1220;color:#fff;margin-top:8px;font-size:0.95rem;box-sizing:border-box;';
const btnCss = (bg, border) => `width:100%;padding:11px;border-radius:10px;border:1px solid ${border};background:${bg};color:#fff;font-weight:900;font-size:1rem;cursor:pointer;margin-top:10px;`;
const linkCss = 'background:none;border:none;color:#94a3b8;cursor:pointer;font-size:0.85rem;text-decoration:underline;margin:10px 6px 0;';
const boxCss = 'text-align:left;background:#0b1220;border:1px solid #334155;border-radius:10px;padding:10px;margin-top:10px;';
const isTest = () => !!(online.health && online.health.testMode);

function saveSession(t, playerId) {
  token = t;
  online.playerId = playerId;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ token: t, playerId })); } catch { /* özel pencere */ }
}
const tokenFromLink = (url, kind) => { const m = new RegExp('[?&]' + kind + '=([a-f0-9]+)').exec(String(url || '')); return m && m[1]; };

// 🛡️ Kale Kapısı: cüzdan değiştirirken 48 saat beklemenin oyunlaştırılmış açıklaması (kullanıcı isteği)
export const KALE_KAPISI = `🛡️ <strong>Kale Kapısı Kuralı.</strong> Hazinene giden yolu değiştirmek istedin! Krallığın muhafızları önce sana bir haberci (e-posta) yollayacak ve hazine kapısı <strong>48 saat</strong> mühürlü kalacak. Neden mi? Bir hain senin kılığına girip hazineni kaçırmaya kalkarsa, bu 48 saat içinde haberciyi görür ve kapıyı ona kapatırsın. Bu bekleme seni korumak için: gerçek kral sensin ve kimse hazinene senden önce dokunamaz. 👑`;

// Giriş / Kayıt / Şifremi unuttum. Döner: giriş yapıldı mı
function loginFlow(startMode = 'login') {
  return new Promise(resolve => {
    let mode = startMode, email = '', msg = '', isErr = true, extra = '';
    const titles = { login: 'Krallığa Dön', register: 'Krallığa Katıl', forgot: 'Şifremi Unuttum' };
    const intro = {
      login: 'E-posta ve şifrenle giriş yap.',
      register: 'E-posta ve şifrenle hesabını aç. Cüzdanın kaybolsa bile krallığın ve hazinen hesabınla birlikte kalır.',
      forgot: 'E-postanı yaz; şifreni yenilemen için bir bağlantı gönderelim.'
    };
    const go_ = { login: '🗝️ Giriş Yap', register: '🏰 Hesap Aç', forgot: '📧 Bağlantı Gönder' };
    const draw = (busy = false) => {
      const el = overlay(`
        <div style="font-size:2.2rem;">👑</div>
        <div style="font-size:1.25rem;font-weight:900;color:#fde047;margin:6px 0 2px;">${titles[mode]}</div>
        <div style="font-size:0.85rem;color:#cbd5e1;line-height:1.5;">${intro[mode]}</div>
        <input id="ol-email" type="email" autocomplete="email" placeholder="E-posta" value="${esc(email)}" style="${inputCss}">
        ${mode !== 'forgot' ? `<input id="ol-pass" type="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" placeholder="Şifre${mode === 'register' ? ' (en az 8 karakter)' : ''}" style="${inputCss}">` : ''}
        <button id="ol-go" ${busy ? 'disabled' : ''} style="${btnCss('#7c3aed', '#c084fc')}">${busy ? '⏳ Bekle…' : go_[mode]}</button>
        ${msg ? `<div style="margin-top:10px;font-size:0.85rem;color:${isErr ? '#fca5a5' : '#86efac'};">${esc(msg)}</div>` : ''}
        ${extra}
        <div>
          ${mode !== 'login' ? `<button class="ol-mode" data-m="login" style="${linkCss}">Giriş yap</button>` : ''}
          ${mode !== 'register' ? `<button class="ol-mode" data-m="register" style="${linkCss}">Hesap aç</button>` : ''}
          ${mode !== 'forgot' ? `<button class="ol-mode" data-m="forgot" style="${linkCss}">Şifremi unuttum</button>` : ''}
        </div>
        <button id="ol-later" style="${linkCss}">Şimdilik gezmeye devam et</button>`);
      el.querySelectorAll('.ol-mode').forEach(b => b.addEventListener('click', () => { email = el.querySelector('#ol-email').value; mode = b.dataset.m; msg = ''; extra = ''; draw(); }));
      el.querySelector('#ol-later').addEventListener('click', () => { closeOverlay(); resolve(false); });
      el.querySelector('#ol-go').addEventListener('click', go);
      el.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }));
      el.querySelector('#ol-dev-reset')?.addEventListener('click', () => { location.href = el.querySelector('#ol-dev-reset').dataset.href; });
    };
    async function go() {
      const el = document.getElementById('online-overlay');
      email = el.querySelector('#ol-email').value.trim();
      const password = el.querySelector('#ol-pass') ? el.querySelector('#ol-pass').value : '';
      draw(true);
      try {
        if (mode === 'forgot') {
          const r = await api('POST', '/api/account/forgot', { email });
          msg = r.message; isErr = false;
          extra = r.devLink ? `<button id="ol-dev-reset" data-href="${esc(r.devLink)}" style="${btnCss('#334155', '#64748b')}">🧪 Deneme modu: sıfırlama bağlantısını aç</button>` : '';
          return draw();
        }
        const r = await api('POST', mode === 'register' ? '/api/account/register' : '/api/account/login', { email, password });
        saveSession(r.token, r.playerId);
        if (mode === 'register') {
          // Deneme sunucusunda gerçek e-posta yok: doğrulama kendiliğinden yapılır
          const t = tokenFromLink(r.devLink, 'verify');
          if (t) { await api('POST', '/api/account/verify', { token: t }).catch(() => {}); ctx.toast('🧪 Deneme modu: e-postan kendiliğinden doğrulandı.', 'success'); }
          else ctx.toast('📧 E-postana bir doğrulama bağlantısı gönderdik. Çekim ve cüzdan bağlama için e-postanı doğrula.', 'success');
        }
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
    const r = await api('POST', '/api/account/wallet/link', { signature });
    const t = tokenFromLink(r.devLink, 'wallet');
    overlay(`
      <div style="font-size:2rem;">${r.change ? '🛡️' : '📧'}</div>
      <div style="font-weight:900;color:#fde047;font-size:1.1rem;margin:4px 0;">${r.change ? 'Haberci yola çıktı!' : 'Son bir adım!'}</div>
      <div style="font-size:0.85rem;color:#cbd5e1;line-height:1.55;text-align:left;">
        E-postana bir onay bağlantısı gönderdik. ${r.change ? 'Onayladıktan sonra yeni cüzdanın <strong>48 saat</strong> içinde etkinleşecek; o zamana kadar ödemelerin eski cüzdanına gider.' : 'Onayladığın anda cüzdanın bağlanacak.'}
        ${r.change ? `<div style="${boxCss}">${KALE_KAPISI}</div>` : ''}
      </div>
      ${t ? `<button id="lw-dev" style="${btnCss('#334155', '#64748b')}">🧪 Deneme modu: e-postadaki onayı şimdi ver</button>` : ''}
      <button id="lw-ok" style="${btnCss('#7c3aed', '#c084fc')}">Tamam</button>`);
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
export async function openWalletPanel() {
  if (!online.active) return;
  if (!token && !(await requireLogin())) return;
  const el = overlay('<div style="padding:20px;">⏳ Yükleniyor…</div>');
  let w;
  try { w = await api('GET', '/api/wallet'); } catch (err) { el.innerHTML = ''; ctx.toast(err.message, 'error'); closeOverlay(); return; }
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
      <div style="font-weight:900;color:#fde047;font-size:1.1rem;">🏦 Hesabım</div>
      <button id="wp-close" style="background:none;border:none;color:#94a3b8;font-size:1.3rem;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:0.8rem;color:#94a3b8;text-align:left;">📧 <strong style="color:#e2e8f0;">${esc(acc.email)}</strong>
      ${acc.verified ? '<span style="color:#4ade80;">✓ doğrulandı</span>' : '<span style="color:#fbbf24;">doğrulanmadı</span> · <a href="#" id="wp-resend" style="color:#93c5fd;">bağlantıyı yeniden gönder</a>'}
      · <a href="#" id="wp-logout" style="color:#f87171;">çıkış</a></div>
    <div style="display:flex;gap:8px;justify-content:space-between;margin:12px 0 4px;font-size:0.85rem;font-weight:800;">
      <span style="color:#4ade80;">🔓 Serbest<br>${fmt(wd.free)}</span>
      <span style="color:#fbbf24;">🔒 Kilitli<br>${fmt(wd.locked)}</span>
      <span style="color:#38bdf8;">🏦 Çekimde<br>${fmt(wd.pending)}</span>
    </div>
    <div style="${boxCss}">
      <div style="font-weight:800;color:#c4b5fd;margin-bottom:4px;">🦊 Bağlı Cüzdan</div>
      <div style="font-size:0.8rem;color:#cbd5e1;line-height:1.45;">${acc.wallet ? `Ödemelerin ve çekimlerin <strong style="font-family:monospace;">${short(acc.wallet)}</strong> cüzdanına gider.` : 'Henüz cüzdan bağlamadın. Çekim ve cüzdandan ödeme için Core ya da MetaMask cüzdanını bağla.'}</div>
      ${pendingLine}
      <button id="wp-link" style="margin-top:8px;padding:7px 12px;border-radius:8px;border:1px solid #a78bfa;background:#4c1d95;color:#fff;font-weight:800;cursor:pointer;">${acc.wallet ? '🔁 Cüzdanı değiştir' : '🔗 Cüzdan bağla'}</button>
      ${acc.wallet ? `<div style="font-size:0.78rem;color:#94a3b8;line-height:1.5;margin-top:8px;">${KALE_KAPISI}</div>` : ''}
    </div>
    <div style="${boxCss}">
      <div style="font-weight:800;color:#bfdbfe;margin-bottom:4px;">🏧 Kazanç Çekimi</div>
      <div style="font-size:0.8rem;color:#cbd5e1;line-height:1.45;">Oyunda kazandığın ADA'nın serbest kısmı çekilir. Talepler <strong>${next}</strong> haftalık ortak havuzdan karşılanır. Bu haftaki tahmini hakkın (katkı puanına göre): <strong>${fmt(wd.estimatedRight)} ADA</strong>. Ücret %${(wd.feeRate * 100).toFixed(0)}${wd.brake ? ' (fiyat freni açık)' : ''}; hakkını aşan kısım için %${(wd.rentRate * 100).toFixed(1).replace('.', ',')} hak kirası. Sığmayan kısım bakiyene döner.</div>
      ${wd.paused ? '<div style="margin-top:6px;color:#fca5a5;font-size:0.82rem;">Çekimler şu an bakımda.</div>' : `
      <div style="display:flex;gap:6px;margin-top:8px;">
        <input id="wp-amount" type="number" min="${wd.minWithdraw}" placeholder="En az ${fmt(wd.minWithdraw)} ADA" style="flex:1;padding:8px;border-radius:6px;border:1px solid #475569;background:#111827;color:#fff;">
        <button id="wp-withdraw" style="padding:8px 12px;border-radius:6px;border:1px solid #60a5fa;background:#1d4ed8;color:#fff;font-weight:800;cursor:pointer;">Talep ver</button>
      </div>`}
      ${wd.pending > 0 ? '<button id="wp-cancel" style="margin-top:6px;padding:5px 10px;border-radius:6px;border:1px solid #f87171;background:#3f1d1d;color:#fecaca;cursor:pointer;font-size:0.78rem;">↩️ Bekleyen talebi geri al</button>' : ''}
    </div>
    ${wd.payouts && wd.payouts.length ? `<div style="text-align:left;margin-top:10px;font-size:0.78rem;color:#cbd5e1;max-height:140px;overflow:auto;">
      <div style="font-weight:800;margin-bottom:4px;">Son gönderimler</div>
      ${wd.payouts.map(p => `<div>${fmt(p.amount)} ADA · ${statusTr[p.status] || esc(p.status)}${p.tx_hash ? ` · <a href="${snow(esc(p.tx_hash))}" target="_blank" rel="noopener" style="color:#93c5fd;">işlem</a>` : ''}</div>`).join('')}
    </div>` : ''}`);
  const $ = id => document.getElementById(id);
  $('wp-close').onclick = closeOverlay;
  $('wp-logout').onclick = e => { e.preventDefault(); logout(); };
  if ($('wp-resend')) $('wp-resend').onclick = async e => {
    e.preventDefault();
    try {
      const r = await api('POST', '/api/account/resend');
      const t = tokenFromLink(r.devLink, 'verify');
      if (t) { await api('POST', '/api/account/verify', { token: t }); ctx.toast('🧪 Deneme modu: e-postan doğrulandı.', 'success'); openWalletPanel(); }
      else ctx.toast('📧 Doğrulama bağlantısı yeniden gönderildi.', 'success');
    } catch (err) { ctx.toast(err.message, 'error'); }
  };
  $('wp-link').onclick = () => linkWalletFlow();
  if ($('wp-wcancel')) $('wp-wcancel').onclick = async () => {
    try { await api('POST', '/api/account/wallet/cancel'); ctx.toast('✋ Cüzdan değişikliği iptal edildi. Şifreni değiştirmeyi unutma!', 'success'); openWalletPanel(); }
    catch (err) { ctx.toast(err.message, 'error'); }
  };
  if ($('wp-withdraw')) $('wp-withdraw').onclick = async () => {
    try {
      const r = await api('POST', '/api/withdraw', { amount: Number($('wp-amount').value) });
      ctx.toast(r.message, r.success ? 'success' : 'error');
      await sync();
      if (r.success) openWalletPanel();
    } catch (err) { ctx.toast(err.message, 'error'); }
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
    try { await api('POST', '/api/account/verify', { token: p.get('verify') }); ctx.toast('✅ E-postan doğrulandı. Krallığa hoş geldin!', 'success'); }
    catch (err) { ctx.toast(err.message, 'error'); }
  } else if (p.get('wallet')) {
    clean();
    await confirmWalletLink(p.get('wallet'));
  } else if (p.get('reset')) {
    clean();
    const t = p.get('reset');
    const el = overlay(`
      <div style="font-size:2rem;">🗝️</div>
      <div style="font-weight:900;color:#fde047;font-size:1.1rem;">Yeni Şifre</div>
      <input id="rs-pass" type="password" autocomplete="new-password" placeholder="Yeni şifre (en az 8 karakter)" style="${inputCss}">
      <button id="rs-go" style="${btnCss('#7c3aed', '#c084fc')}">Şifreyi Kaydet</button>
      <div id="rs-msg" style="margin-top:8px;font-size:0.85rem;color:#fca5a5;"></div>`);
    el.querySelector('#rs-go').onclick = async () => {
      try {
        await api('POST', '/api/account/reset', { token: t, password: el.querySelector('#rs-pass').value });
        closeOverlay();
        ctx.toast('✅ Şifren yenilendi. Şimdi giriş yap.', 'success');
        requireLogin('login');
      } catch (err) { el.querySelector('#rs-msg').textContent = err.message; }
    };
  }
}

// ── 💳 Cüzdandan ödeme (kazanılmış bakiye yetmeyince) ─────────────────
const INSUFFICIENT_RE = /Yetersiz\s*(\$?ADASTRA|AdAstra|ADA)\b/i;
const PAY_STARTED = { success: false, message: '💳 Bakiyen bu işleme yetmedi — cüzdandan ödeme penceresi açıldı.' };
const pad32 = h => String(h).toLowerCase().replace(/^0x/, '').padStart(64, '0');
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
  const accs = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const from = String(accs && accs[0] || '').toLowerCase();
  if (from !== String(q.wallet).toLowerCase()) throw new Error(`Cüzdanında hesabına bağlı adresi seç: ${short(q.wallet)}`);
  setStep('Avalanche ağına geçiliyor…');
  await ensureChain(q.chainId);
  const amountWei = BigInt(q.amountAda) * 10n ** 18n;
  const allowanceHex = await window.ethereum.request({ method: 'eth_call', params: [{ to: q.token, data: '0xdd62ed3e' + pad32(from) + pad32(q.contract) }, 'latest'] });
  if (BigInt(allowanceHex || '0x0') < amountWei) {
    setStep('İlk seferlik izin: cüzdanında "izin ver" onayını ver…');
    const ah = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from, to: q.token, data: '0x095ea7b3' + pad32(q.contract) + 'f'.repeat(64) }] });
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
    await new Promise(resolve => {
      const draw = (step = '', errMsg = '') => {
        const noWallet = !q.wallet && !q.simulated;
        const el = overlay(`
          <div style="font-size:2rem;">💳</div>
          <div style="font-weight:900;color:#fde047;font-size:1.1rem;margin:4px 0;">Cüzdandan Öde</div>
          <div style="font-size:0.86rem;color:#cbd5e1;line-height:1.55;text-align:left;">
            Bu işlem <strong>${fmt(q.cost)} ADA</strong> tutuyor; oyunda kazandığın bakiye <strong>${fmt(q.balance)} ADA</strong>.
            Kalan <strong style="color:#fde047;">${fmt(q.amountAda)} ADA</strong> cüzdanından ödenecek.
            <div style="margin-top:6px;color:#94a3b8;font-size:0.8rem;">Avalanche ağ ücreti ve aynı tutarda küçük bir oyun komisyonu (AVAX) alınır. Ödediğin ADA'dan işlemden artan kısım oyun bakiyende kalır.</div>
          </div>
          ${noWallet ? `<div style="${boxCss};color:#fbbf24;">Cüzdandan ödeme için önce hesabına bir cüzdan bağla.</div><button id="py-acc" style="${btnCss('#4c1d95', '#a78bfa')}">🔗 Hesabım → Cüzdan bağla</button>` : ''}
          ${q.simulated ? `<button id="py-sim" style="${btnCss('#334155', '#64748b')}">🧪 Deneme modu: ödemeyi taklit et</button>` : ''}
          ${!noWallet && !q.simulated ? `<button id="py-go" ${step ? 'disabled' : ''} style="${btnCss('#7c3aed', '#c084fc')}">${step ? '⏳ ' + esc(step) : '🦊 Cüzdanla Öde'}</button>` : ''}
          ${errMsg ? `<div style="margin-top:8px;font-size:0.85rem;color:#fca5a5;">${esc(errMsg)}</div>` : ''}
          <button id="py-cancel" style="${linkCss}">Vazgeç</button>`);
        el.querySelector('#py-cancel').onclick = () => { closeOverlay(); resolve(); };
        el.querySelector('#py-acc')?.addEventListener('click', () => { resolve(); openWalletPanel(); });
        const finish = async txHash => {
          const r = await confirmPayment(q.ref, txHash);
          apply(r);
          closeOverlay();
          const res = r.result || {};
          ctx.toast(res.success === false ? `Ödemen alındı (${fmt(r.paid)} ADA bakiyende) ama işlem yapılamadı: ${res.message}` : `✅ Ödeme alındı. ${res.message || ''}`, res.success === false ? 'info' : 'success');
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

// ── Başlat ──────────────────────────────────────────────────────────────
// Sunucu varsa girişi yapar, kaydı yükler ve true döner; yoksa false (deneme modu).
export async function startOnline(context) {
  const health = await detectServer();
  if (!health) return false;
  ctx = context;
  online.active = true;
  online.health = health;
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (saved && saved.token) { token = saved.token; online.playerId = saved.playerId; }
  } catch { /* özel pencere */ }
  let payload = null;
  if (token) {
    try { payload = await api('GET', '/api/state'); } catch { token = null; }
  }
  // Giriş yapılmamışsa giriş istenmez: herkes gezebilir, işlem yapmak isteyince sorulur
  if (token && payload) apply(payload);
  installProxies();
  handleEmailLinks();
  setInterval(sync, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  return true;
}
