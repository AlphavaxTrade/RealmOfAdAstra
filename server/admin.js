const $ = id => document.getElementById(id);
const fmt = v => Math.floor(Number(v) || 0).toLocaleString('tr-TR');
let token = sessionStorage.getItem('adm') || '';
async function api(method, path, body) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const card = (k, v, cls = '') => `<div class="card"><div class="k">${esc(k)}</div><div class="v ${cls}">${v}</div></div>`;
async function load() {
  const s = await api('GET', '/api/admin/status');
  $('login').hidden = true; $('app').hidden = false;
  const m = s.market || {};
  const pools = Object.entries(s.treasury || {}).map(([k, v]) => `${esc(k)}: ${fmt(v)}`).join('<br>');
  $('cards').innerHTML = [
    card('Durum', s.paused ? '⏸️ DURDURULDU' : '✅ Çalışıyor', s.paused ? 'bad' : 'ok'),
    card('Ödeme modu', s.payoutMode === 'auto' ? (s.canSend ? 'Otomatik' : 'Otomatik (anahtar yok!)') : 'Yönetici onayı', s.payoutMode === 'auto' && !s.canSend ? 'bad' : ''),
    card('Oyun cüzdanı', s.gameWallet ? `<a href="https://snowtrace.io/address/${esc(s.gameWallet)}" target="_blank" rel="noopener">${esc(s.gameWallet.slice(0, 8))}…</a>` : '—'),
    card('Cüzdandaki ADA', m.walletAda != null ? fmt(m.walletAda) : '—'),
    hotCard(s),
    partnerCard(s),
    contractCard(s),
    card('ADASTRA fiyatı (1M)', m.priceUsd ? '$' + (m.priceUsd * 1e6).toFixed(3) : '—'),
    card('Piyasa değeri', m.mcapUsd ? '$' + fmt(m.mcapUsd) : '—'),
    card('Fren', s.brake && s.brake.on ? '🔴 AÇIK' : '🟢 kapalı', s.brake && s.brake.on ? 'bad' : 'ok'),
    card('Fiyat çarpanı', '×' + (s.priceMultiplier || 1)),
    card('Bu haftaki çekim sınırı', fmt(s.weeklyCap) + ' ADA'),
    card('Oyuncular', `${fmt(s.players.total)} (bu hafta ${fmt(s.players.activeWeek)}, yatıran ${fmt(s.players.depositors)})`),
    card('Bekleyen çekim talepleri', fmt(s.players.pendingWithdraw) + ' ADA'),
    card('Sonraki hafta', s.nextWeekAt ? new Date(s.nextWeekAt).toLocaleString('tr-TR') : '—'),
    `<div class="card"><div class="k">Hazine kasaları</div><div style="font-size:0.8rem;margin-top:4px;">${pools}</div></div>`
  ].join('');
  $('weekly').textContent = s.lastWeekly ? JSON.stringify(s.lastWeekly, null, 2) : 'Henüz yok';
  const st = { pending: '⏳ sırada', sending: '⚠️ gönderiliyordu (kontrol et)', sent: '✅ gönderildi' };
  $('payouts').innerHTML = '<tr><th>#</th><th>Hafta</th><th>Tür</th><th>Adres</th><th>ADA</th><th>Durum</th><th>İşlem</th><th>Hata</th></tr>' +
    s.payouts.map(p => `<tr><td>${p.id}</td><td>${p.epoch}</td><td>${esc(p.kind)}</td><td>${esc(p.address.slice(0, 10))}…</td><td>${fmt(p.amount)}</td><td>${st[p.status] || esc(p.status)}</td><td>${p.tx_hash ? `<a href="https://snowtrace.io/tx/${esc(p.tx_hash)}" target="_blank" rel="noopener">görüntüle</a>` : ''}</td><td class="bad">${esc(p.error || '')}</td></tr>`).join('');
  $('events').innerHTML = '<tr><th>Zaman</th><th>Tür</th><th>Adres</th><th>Bilgi</th></tr>' +
    s.events.map(e => `<tr><td>${new Date(e.at).toLocaleString('tr-TR')}</td><td>${esc(e.type)}</td><td>${esc((e.address || '').slice(0, 10))}</td><td>${esc((e.data || '').slice(0, 160))}</td></tr>`).join('');
}
function partnerCard(s) {
  const p = s.partnerIncome;
  if (!p || !p.enabled) return card('🤝 Trade sitesi geliri', 'kapalı (PARTNER_INCOME_FROM)');
  return `<div class="card"><div class="k">🤝 Trade sitesi geliri (7 gün / toplam)</div><div class="v ok">${fmt(p.weekAda)} / ${fmt(p.totalAda)}</div><div class="k">${p.count} ödeme · adres ${esc(String(p.to).slice(0, 8))}…</div></div>`;
}
function hotCard(s) {
  const h = s.hotWallet || {}, n = s.hotNeed || {};
  if (!s.reserveWallet) return card('🧊 Yedek cüzdan', 'TANIMLI DEĞİL (RESERVE_WALLET)', 'bad');
  const low = h.low ? '<br><span class="bad">⚠️ Az: yedek cüzdandan ' + fmt(Math.ceil((n.need || 0) - (h.walletAda || 0))) + ' ADA gönder</span>' : '';
  return `<div class="card"><div class="k">🧊 Oyun cüzdanı / haftalık ihtiyaç</div><div class="v ${h.low ? 'bad' : 'ok'}">${fmt(h.walletAda)} / ${fmt(n.need)}</div><div class="k">Fazlası yedek cüzdana gider: ${esc(s.reserveWallet.slice(0, 8))}…${h.swept ? ' · son aktarım ' + fmt(h.swept) + ' ADA' : ''}${low}</div></div>`;
}
function contractCard(s) {
  const c = (s.hotWallet || {}).contract;
  if (!s.paymentsContract) return card('Ödeme sözleşmesi', 'yok');
  if (!c) return card('Sözleşme sahibi', 'henüz okunmadı (denetle)');
  const pend = c.pendingOwner && !/^0x0{40}$/.test(c.pendingOwner) ? '<br><span class="warn">Devir bekliyor: ' + esc(c.pendingOwner.slice(0, 8)) + '… → "sahipliği kabul et"</span>' : '';
  return `<div class="card"><div class="k">Sözleşme sahibi</div><div class="v ${c.ownerOk ? 'ok' : 'bad'}">${c.ownerOk ? '✅ donanım cüzdanı' : (c.ownerIsHot ? '⛔ SICAK CÜZDAN' : '⚠️ beklenen değil')}</div><div class="k">${esc(c.owner.slice(0, 10))}… ${c.paused ? '· <span class="bad">ödemeler durdurulmuş</span>' : ''}${pend}</div></div>`;
}
// ── Tarayıcı cüzdanıyla (Ledger) sözleşme işlemleri: sunucu imza atmaz ──
async function ledgerTx(to, data, label) {
  const msg = $('ledgerMsg');
  if (!window.ethereum) { alert('Tarayıcıda cüzdan bulunamadı (MetaMask / Core + Ledger).'); return; }
  try {
    const s = await api('GET', '/api/admin/status');
    const want = '0x' + Number(s.chainId).toString(16);
    const [from] = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if ((await window.ethereum.request({ method: 'eth_chainId' })).toLowerCase() !== want) {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: want }] });
    }
    msg.textContent = '⏳ ' + label + ': Ledger ekranında onayla…';
    const hash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from, to, data }] });
    msg.innerHTML = '✅ ' + esc(label) + ' gönderildi: <a href="https://snowtrace.io/tx/' + esc(hash) + '" target="_blank" rel="noopener">görüntüle</a>';
  } catch (e) { msg.textContent = '❌ ' + (e.message || e); }
}
const pad = hex => String(hex).replace(/^0x/, '').toLowerCase().padStart(64, '0');
$('ownAccept').onclick = async () => { const s = await api('GET', '/api/admin/status'); if (confirm('Ödeme sözleşmesinin sahipliğini bu cüzdanla kabul et?')) ledgerTx(s.paymentsContract, '0x79ba5097', 'Sahiplik kabulü'); };
$('cPause').onclick = async () => { const s = await api('GET', '/api/admin/status'); if (confirm('Sözleşmedeki bütün cüzdan ödemeleri DURDURULSUN mu? (acil durum)')) ledgerTx(s.paymentsContract, '0x16c38b3c' + pad('1'), 'Ödemeleri durdurma'); };
$('cResume').onclick = async () => { const s = await api('GET', '/api/admin/status'); if (confirm('Sözleşmedeki cüzdan ödemeleri açılsın mı?')) ledgerTx(s.paymentsContract, '0x16c38b3c' + pad('0'), 'Ödemeleri açma'); };
$('topUp').onclick = async () => {
  const s = await api('GET', '/api/admin/status');
  const amt = Number($('topAmt').value);
  if (!(amt > 0) || !s.gameWallet) return alert('Geçerli bir miktar yaz (oyun cüzdanı tanımlı olmalı).');
  if (!confirm(fmt(amt) + ' ADA yedek cüzdandan oyun cüzdanına (' + s.gameWallet + ') gönderilsin mi?')) return;
  const wei = (BigInt(Math.floor(amt)) * 10n ** 18n).toString(16);
  ledgerTx(s.tokenAddress, '0xa9059cbb' + pad(s.gameWallet) + pad(wei), 'Oyun cüzdanına ADA');
};
$('hotCheck').onclick = () => act(async () => { const r = await api('POST', '/api/admin/hotwallet/check'); alert('Sonuç: ' + JSON.stringify(r && { walletAda: r.walletAda, need: r.need, swept: r.swept, low: r.low })); });
async function act(fn) { try { await fn(); await load(); } catch (e) { alert(e.message); } }
$('enter').onclick = async () => { token = $('tok').value.trim(); try { await load(); sessionStorage.setItem('adm', token); } catch (e) { $('lerr').textContent = e.message; } };
$('refresh').onclick = () => act(async () => {});
$('pause').onclick = () => confirm('Çekim talepleri ve zincir ödemeleri durdurulsun mu?') && act(() => api('POST', '/api/admin/pause', { paused: true }));
$('resume').onclick = () => act(() => api('POST', '/api/admin/pause', { paused: false }));
$('pay').onclick = () => confirm('Bekleyen ödemeler şimdi zincire gönderilsin mi?') && act(async () => { const r = await api('POST', '/api/admin/payouts/run'); alert('Sonuç: ' + JSON.stringify(r)); });
$('logout').onclick = () => { sessionStorage.removeItem('adm'); location.reload(); };
if (token) load().catch(() => { token = ''; });
