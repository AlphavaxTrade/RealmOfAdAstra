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
import { ACTIONS } from '../../server/actions.js';

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
  if (!online.active || online.pending > 0) return;
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
        return send(name, cleanArgs(a, spec), { wait: true });
      };
    } else {
      gs[name] = function (...a) {
        if (depth > 0) return orig.apply(gs, a);
        depth++;
        let r;
        try { r = orig.apply(gs, a); } finally { depth--; }
        if (!(r && r.success === false)) send(name, cleanArgs(a, spec));
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

function loginFlow() {
  return new Promise(resolve => {
    const draw = (msg = '', busy = false) => {
      const hasWallet = typeof window !== 'undefined' && window.ethereum;
      const el = overlay(`
        <div style="font-size:2.2rem;">👑</div>
        <div style="font-size:1.25rem;font-weight:900;color:#fde047;margin:6px 0 4px;">Realm of Astra</div>
        <div style="font-size:0.88rem;color:#cbd5e1;line-height:1.5;margin-bottom:16px;">Oyuna cüzdanınla gir. Şifre yok: cüzdanın yalnızca bir giriş mesajı imzalar, hiçbir işlem ya da ücret onaylamaz.</div>
        ${hasWallet
          ? `<button id="online-login-btn" ${busy ? 'disabled' : ''} style="width:100%;padding:12px;border-radius:10px;border:1px solid #c084fc;background:#7c3aed;color:#fff;font-weight:900;font-size:1rem;cursor:pointer;">${busy ? '⏳ Cüzdan onayı bekleniyor…' : '🦊 Cüzdanla Giriş Yap'}</button>`
          : `<div style="font-size:0.9rem;color:#fca5a5;">Bu tarayıcıda cüzdan bulunamadı. <strong>Core</strong> ya da <strong>MetaMask</strong> eklentisini kurup sayfayı yenile.</div>`}
        ${msg ? `<div style="margin-top:12px;font-size:0.85rem;color:#fca5a5;">${msg}</div>` : ''}`);
      el.querySelector('#online-login-btn')?.addEventListener('click', go);
    };
    async function go() {
      draw('', true);
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const address = String(accounts && accounts[0] || '').toLowerCase();
        if (!address) throw new Error('Cüzdan adresi alınamadı');
        const { message } = await api('POST', '/api/auth/nonce', { address });
        const signature = await window.ethereum.request({ method: 'personal_sign', params: [toHex(message), address] });
        const v = await api('POST', '/api/auth/verify', { address, signature });
        token = v.token;
        online.address = v.address;
        try { localStorage.setItem(SESSION_KEY, JSON.stringify({ token, address: v.address })); } catch { /* özel pencere */ }
        closeOverlay();
        resolve();
      } catch (err) {
        draw(err && err.code === 4001 ? 'İmza reddedildi. Girmek için imzayı onaylaman gerekiyor.' : (err.message || 'Giriş yapılamadı'));
      }
    }
    draw();
  });
}

async function relogin() {
  token = null;
  try { localStorage.removeItem(SESSION_KEY); } catch { /* yok */ }
  await loginFlow();
  await sync();
}

export function logout() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* yok */ }
  location.reload();
}

// ── Cüzdan ekranı: yatırma ve çekim ────────────────────────────────────
export async function openWalletPanel() {
  if (!online.active) return;
  const el = overlay('<div style="padding:20px;">⏳ Yükleniyor…</div>');
  let w;
  try { w = await api('GET', '/api/wallet'); } catch (err) { el.innerHTML = ''; ctx.toast(err.message, 'error'); closeOverlay(); return; }
  const wd = w.withdraw;
  const snow = h => `https://snowtrace.io/tx/${h}`;
  const statusTr = { pending: '⏳ sırada', sending: '📤 gönderiliyor', sent: '✅ gönderildi' };
  const next = wd.nextSettlementAt ? new Date(wd.nextSettlementAt).toLocaleString('tr-TR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : 'Pazartesi 00:01';
  overlay(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div style="font-weight:900;color:#fde047;font-size:1.1rem;">🏦 Cüzdanım</div>
      <button id="wp-close" style="background:none;border:none;color:#94a3b8;font-size:1.3rem;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:0.8rem;color:#94a3b8;text-align:left;">Giriş: <strong style="color:#e2e8f0;">${short(online.address)}</strong> · <a href="#" id="wp-logout" style="color:#f87171;">çıkış</a></div>
    <div style="display:flex;gap:8px;justify-content:space-between;margin:12px 0;font-size:0.85rem;font-weight:800;">
      <span style="color:#4ade80;">🔓 Serbest<br>${fmt(wd.free)}</span>
      <span style="color:#fbbf24;">🔒 Kilitli<br>${fmt(wd.locked)}</span>
      <span style="color:#38bdf8;">🏦 Çekimde<br>${fmt(wd.pending)}</span>
    </div>
    <div style="text-align:left;background:#0b1220;border:1px solid #334155;border-radius:10px;padding:10px;margin-bottom:10px;">
      <div style="font-weight:800;color:#a7f3d0;margin-bottom:4px;">💰 Yatırma</div>
      <div style="font-size:0.8rem;color:#cbd5e1;line-height:1.45;">Kendi cüzdanından (<strong>${short(online.address)}</strong>) aşağıdaki oyun cüzdanına ADASTRA gönder. Birkaç dakika içinde <strong>serbest bakiyene</strong> eklenir. Başka bir cüzdandan gönderilen ADA sana yazılmaz.</div>
      <div style="margin-top:6px;font-family:monospace;font-size:0.78rem;word-break:break-all;color:#fde68a;">${w.gameWallet || 'Oyun cüzdanı henüz tanımlı değil'}</div>
      ${w.gameWallet ? '<button id="wp-copy" style="margin-top:6px;padding:5px 10px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#fff;cursor:pointer;font-size:0.78rem;">📋 Adresi kopyala</button>' : ''}
    </div>
    <div style="text-align:left;background:#0b1220;border:1px solid #334155;border-radius:10px;padding:10px;">
      <div style="font-weight:800;color:#bfdbfe;margin-bottom:4px;">🏧 Çekim</div>
      <div style="font-size:0.8rem;color:#cbd5e1;line-height:1.45;">Yalnız serbest bakiyeden çekilir. Talepler <strong>${next}</strong> haftalık ortak havuzdan karşılanır. Bu haftaki tahmini hakkın (katkı puanına göre): <strong>${fmt(wd.estimatedRight)} ADA</strong>. Ücret %${(wd.feeRate * 100).toFixed(0)}${wd.brake ? ' (fiyat freni açık)' : ''}; hakkını aşan kısım için %${(wd.rentRate * 100).toFixed(1).replace('.', ',')} hak kirası. Sığmayan kısım bakiyene döner.</div>
      ${wd.paused ? '<div style="margin-top:6px;color:#fca5a5;font-size:0.82rem;">Çekimler şu an bakımda.</div>' : `
      <div style="display:flex;gap:6px;margin-top:8px;">
        <input id="wp-amount" type="number" min="${wd.minWithdraw}" placeholder="En az ${fmt(wd.minWithdraw)} ADA" style="flex:1;padding:8px;border-radius:6px;border:1px solid #475569;background:#111827;color:#fff;">
        <button id="wp-withdraw" style="padding:8px 12px;border-radius:6px;border:1px solid #60a5fa;background:#1d4ed8;color:#fff;font-weight:800;cursor:pointer;">Talep ver</button>
      </div>`}
      ${wd.pending > 0 ? '<button id="wp-cancel" style="margin-top:6px;padding:5px 10px;border-radius:6px;border:1px solid #f87171;background:#3f1d1d;color:#fecaca;cursor:pointer;font-size:0.78rem;">↩️ Bekleyen talebi geri al</button>' : ''}
    </div>
    ${wd.payouts && wd.payouts.length ? `<div style="text-align:left;margin-top:10px;font-size:0.78rem;color:#cbd5e1;max-height:140px;overflow:auto;">
      <div style="font-weight:800;margin-bottom:4px;">Son gönderimler</div>
      ${wd.payouts.map(p => `<div>${fmt(p.amount)} ADA · ${statusTr[p.status] || p.status}${p.tx_hash ? ` · <a href="${snow(p.tx_hash)}" target="_blank" rel="noopener" style="color:#93c5fd;">işlem</a>` : ''}</div>`).join('')}
    </div>` : ''}`);
  const $ = id => document.getElementById(id);
  $('wp-close').onclick = closeOverlay;
  $('wp-logout').onclick = e => { e.preventDefault(); logout(); };
  if ($('wp-copy')) $('wp-copy').onclick = () => { navigator.clipboard?.writeText(w.gameWallet); ctx.toast('Oyun cüzdanı adresi kopyalandı', 'success'); };
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
    if (saved && saved.token) { token = saved.token; online.address = saved.address; }
  } catch { /* özel pencere */ }
  let payload = null;
  if (token) {
    try { payload = await api('GET', '/api/state'); } catch { token = null; }
  }
  if (!token) {
    await loginFlow();
    payload = await api('GET', '/api/state');
  }
  apply(payload);
  installProxies();
  setInterval(sync, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  return true;
}
