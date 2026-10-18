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
    card('Telegram bildirimi', s.telegramAcik ? '✅ bağlı' : '⚠️ kapalı', s.telegramAcik ? 'ok' : 'warn'),
    card('Durum', s.paused ? '⏸️ DURDURULDU' : '✅ Çalışıyor', s.paused ? 'bad' : 'ok'),
    card('Ödeme modu', s.payoutMode === 'auto' ? (s.canSend ? 'Otomatik' : 'Otomatik (anahtar yok!)') : 'Yönetici onayı', s.payoutMode === 'auto' && !s.canSend ? 'bad' : ''),
    card('Oyun cüzdanı', s.gameWallet ? `<a href="https://snowtrace.io/address/${esc(s.gameWallet)}" target="_blank" rel="noopener">${esc(s.gameWallet.slice(0, 8))}…</a>` : '—'),
    card('Cüzdandaki ASTRA', m.walletAda != null ? fmt(m.walletAda) : '—'),
    hotCard(s),
    partnerCard(s),
    contractCard(s),
    card('ADASTRA fiyatı (1M)', m.priceUsd ? '$' + (m.priceUsd * 1e6).toFixed(3) : '—'),
    card('Piyasa değeri', m.mcapUsd ? '$' + fmt(m.mcapUsd) : '—'),
    card('Fren', s.brake && s.brake.on ? '🔴 AÇIK' : '🟢 kapalı', s.brake && s.brake.on ? 'bad' : 'ok'),
    card('Bedel çarpanı', '×' + (s.bedelCarpani || s.priceMultiplier || 1) + `<br><span style="font-size:0.75rem;">fiyat ×${s.priceMultiplier || 1} · oyun içi endeks ×${s.oyunEndeksi || 1}</span>`),
    card('Bu haftaki çekim sınırı', fmt(s.weeklyCap) + ' ASTRA'),
    card('Akış dengesi (haftalık)', s.akis ? `trade alımı ${fmt(s.akis.tradeAlimi)} · net piyasa alımı ${fmt(s.akis.netAlim)}<br><span style="font-size:0.75rem;">çıkış ≤ ikisinin de yarısı; taban yok</span>` : '—'),
    card('Ödeme kadranı', '×' + (s.kadran || 1)),
    card('Oyuncular', `${fmt(s.players.total)} (bu hafta ${fmt(s.players.activeWeek)}, yatıran ${fmt(s.players.depositors)})`),
    card('Bekleyen çekim talepleri', fmt(s.players.pendingWithdraw) + ' ASTRA'),
    card('Sonraki hafta', s.nextWeekAt ? new Date(s.nextWeekAt).toLocaleString('tr-TR') : '—'),
    `<div class="card"><div class="k">Hazine kasaları</div><div style="font-size:0.8rem;margin-top:4px;">${pools}</div></div>`
  ].join('');
  ratesView(s.rates);
  kapiView(s.kapi);
  uncertainView(s.payoutsBelirsiz || []);
  uncertainKasaView(s.kasaOpsBelirsiz || []);
  tfaPendingView(s.muhurSifirlamaBekleyen || []);
  gbYukle().catch(() => {});   // geri bildirim listesi; hata olursa panelin geri kalanı çalışmaya devam eder
  dengeYukle().catch(() => {});   // denge raporu; veri yoksa ya da hata olursa panelin geri kalanı çalışmaya devam eder
  $('uniStage').value = String(s.universeStage ?? 0);
  $('uniNow').textContent = 'Şu an: aşama ' + (s.universeStage ?? 0);
  $('weekly').textContent = s.lastWeekly ? JSON.stringify(s.lastWeekly, null, 2) : 'Henüz yok';
  const st = { pending: '⏳ sırada', sending: '⚠️ gönderiliyordu (kontrol et)', sent: '✅ gönderildi' };
  $('payouts').innerHTML = '<tr><th>#</th><th>Hafta</th><th>Tür</th><th>Adres</th><th>ASTRA</th><th>Durum</th><th>İşlem</th><th>Hata</th></tr>' +
    s.payouts.map(p => `<tr><td>${p.id}</td><td>${p.epoch}</td><td>${esc(p.kind)}</td><td>${esc(p.address.slice(0, 10))}…</td><td>${fmt(p.amount)}</td><td>${st[p.status] || esc(p.status)}</td><td>${p.tx_hash ? `<a href="https://snowtrace.io/tx/${esc(p.tx_hash)}" target="_blank" rel="noopener">görüntüle</a>` : ''}</td><td class="bad">${esc(p.error || '')}</td></tr>`).join('');
  $('events').innerHTML = '<tr><th>Zaman</th><th>Tür</th><th>Adres</th><th>Bilgi</th></tr>' +
    s.events.map(e => `<tr><td>${new Date(e.at).toLocaleString('tr-TR')}</td><td>${esc(e.type)}</td><td>${esc((e.address || '').slice(0, 10))}</td><td>${esc((e.data || '').slice(0, 160))}</td></tr>`).join('');
}
// ── Kapı kuralı ─────────────────────────────────────────────────────────
function kapiView(k) {
  if (!k) { $('kapiInfo').textContent = 'Kapı kapalı'; return; }
  const ind = k.indicator || {};
  $('kapiInfo').innerHTML = `Vatandaş <b>${fmt(k.citizens)} / ${fmt(k.limit)}</b> (aktif ${fmt(k.active || 0)}) · sırada ${fmt(k.waiting)} · askıda ${fmt(k.suspended)} · dönem ${k.tier + 1} (eşik ${k.threshold} $) · gösterge: kişi başı aylık ${esc(String(ind.usdPerPlayerMonth || 0))} $ (${ind.weeks || 0} hafta)${k.lastGrowthAt ? ' · son büyüme ' + new Date(k.lastGrowthAt).toLocaleDateString('tr-TR') : ''}. Büyüme ${k.growthLocked ? '🔒 kilitli (Faz 2 bekliyor)' : '🔓 açık'}. Davet süresi ${k.inviteHours} saat, yıllık izin hakkı ${k.izinYillikGun} gün.`;
  if (!$('kapiLimit').value) $('kapiLimit').value = k.limit;
  const ik = k.ipKota || {};
  $('ipInfo').textContent = 'Şu an: günde ' + (ik.dailyAdmit ?? '?') + ' (ayar dosyası varsayılanı ' + (ik.varsayilan ?? '?') + ', 0 = sınırsız) · muaf adres ' + (ik.muafAdet ?? 0);
  $('kapiTier').value = String(k.tier);
  $('kapiGrowthLocked').checked = !!k.growthLocked;
  const btn = (pid, st, label) => `<button data-pid="${esc(pid)}" data-st="${st}">${label}</button>`;
  $('kapiQueue').innerHTML = '<tr><th>#</th><th>E-posta</th><th>Sırada beri</th><th>Dönen</th><th></th></tr>' +
    ((k.queue || []).map(w => `<tr><td>${w.position}</td><td>${esc(w.email || w.playerId)}</td><td>${new Date(w.since).toLocaleString('tr-TR')}</td><td>${w.returning ? '✅' : ''}</td><td>${btn(w.playerId, 'citizen', '👑 İçeri al')} ${btn(w.playerId, 'suspended', '⏸️ Askıya al')}</td></tr>`).join('') || '<tr><td colspan="5">Sıra boş</td></tr>');
  $('kapiSusp').innerHTML = '<tr><th>E-posta</th><th>Askıya alınma</th><th>Son giriş</th><th></th></tr>' +
    ((k.suspendedList || []).map(p => `<tr><td>${esc(p.email || p.playerId)}</td><td>${new Date(p.since).toLocaleString('tr-TR')}</td><td>${new Date(p.lastSeen).toLocaleString('tr-TR')}</td><td>${btn(p.playerId, 'citizen', '👑 İçeri al')} ${btn(p.playerId, 'waiting', '⏳ Sıraya koy')}</td></tr>`).join('') || '<tr><td colspan="4">Askıda kimse yok</td></tr>');
}
// ── Adres kotası ve muafiyet ──────────────────────────────────────────────
$('ipDailySave').onclick = () => act(async () => { const v = $('ipDaily').value; if (v === '') throw new Error('Günlük sınırı yaz (0 = sınırsız)'); const r = await api('POST', '/api/admin/kapi/ip', { dailyAdmit: Number(v) }); $('ipDaily').value = ''; $('kapiMsg').textContent = 'Adres kotası: günde ' + r.dailyAdmit + ' (0 = sınırsız), muaf adres ' + r.muafAdet; });
const ipMuaf = muaf => act(async () => {
  const t = $('ipTarget').value.trim();
  if (!t) throw new Error('IP adresi ya da oyuncu kimliği yaz');
  const r = await api('POST', '/api/admin/kapi/ip', t.startsWith('acc:') ? { playerId: t, muaf } : { ip: t, muaf });
  $('ipTarget').value = ''; $('kapiMsg').textContent = (muaf ? 'Muaf tutuluyor' : 'Muafiyet kaldırıldı') + ' — muaf adres: ' + r.muafAdet + (r.davetGonderilen ? ', davet giden: ' + r.davetGonderilen : '');
});
$('ipExempt').onclick = () => ipMuaf(true);
$('ipUnexempt').onclick = () => ipMuaf(false);
// ── Belirsiz ödemeler ─────────────────────────────────────────────────────
function uncertainView(rows) {
  $('uncertain').innerHTML = '<tr><th>#</th><th>Tür</th><th>Adres</th><th>ASTRA</th><th>İşlem</th><th>Not</th><th></th></tr>' +
    (rows.map(p => `<tr><td>${p.id}</td><td>${esc(p.kind)}</td><td>${esc(String(p.address).slice(0, 12))}…</td><td>${fmt(p.amount)}</td><td>${p.tx_hash ? `<a href="https://snowtrace.io/tx/${esc(p.tx_hash)}" target="_blank" rel="noopener">${esc(p.tx_hash.slice(0, 12))}…</a>` : '<span class="bad">kayıt yok</span>'}</td><td class="bad">${esc(p.error || '')}</td><td><button data-rid="${p.id}" data-d="sent" class="go">✅ Gönderildi</button> <button data-rid="${p.id}" data-d="pending" class="danger">↩️ Yeniden sıraya</button></td></tr>`).join('') || '<tr><td colspan="7">Belirsiz ödeme yok</td></tr>');
}
function tfaPendingView(rows) {
  $('tfaPending').innerHTML = '<tr><th>Hesap</th><th>Mühür kalkma anı</th><th>Gerekçe</th><th></th></tr>' +
    (rows.map(r => '<tr><td>' + esc(r.email || r.playerId) + '</td><td>' + new Date(r.applyAt).toLocaleString('tr-TR') + '</td><td>' + esc(String(r.gerekce || '').slice(0, 120)) + '</td><td><button data-tfa="' + esc(r.playerId) + '">İptal et</button></td></tr>').join('') ||
      '<tr><td colspan="4" class="k">Bekleyen sıfırlama yok.</td></tr>');
}
$('tfaReset').onclick = () => act(async () => {
  const hedef = $('tfaTarget').value.trim(), gerekce = $('tfaReason').value.trim();
  if (!hedef) throw new Error('E-posta ya da oyuncu kimliği yaz');
  if (gerekce.length < 10) throw new Error('Gerekçe en az 10 karakter olmalı (kimliği nasıl doğruladın?)');
  if (!confirm(hedef + ' için Muhafız Mührü 48 saat sonra kaldırılacak; oyuncunun e-postasına iptal bağlantısı gider. Kimliğini doğruladığından emin misin?')) return;
  const r = await api('POST', '/api/admin/hesap/muhur-sifirla', hedef.startsWith('acc:') ? { playerId: hedef, gerekce } : { email: hedef, gerekce });
  $('tfaTarget').value = ''; $('tfaReason').value = '';
  $('tfaMsg').textContent = 'Başlatıldı: ' + r.email + ' — mühür ' + new Date(r.applyAt).toLocaleString('tr-TR') + ' tarihinde kalkacak.';
});
$('tfaPending').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-tfa]');
  if (!b) return;
  act(async () => { await api('POST', '/api/admin/hesap/muhur-sifirla/iptal', { playerId: b.dataset.tfa }); $('tfaMsg').textContent = 'Sıfırlama iptal edildi.'; });
});
function uncertainKasaView(rows) {
  $('uncertainKasa').innerHTML = '<tr><th>#</th><th>Tür</th><th>Oyuncu</th><th>Tutar</th><th>İşlem</th><th>Not</th><th></th></tr>' +
    (rows.map(p => `<tr><td>${p.id}</td><td>${esc(p.kind)}</td><td>${esc(String(p.player).slice(0, 14))}</td><td>${fmt(p.amount)}</td><td>${p.tx_hash ? `<a href="https://snowtrace.io/tx/${esc(p.tx_hash)}" target="_blank" rel="noopener">${esc(String(p.tx_hash).slice(0, 12))}…</a>` : '—'}</td><td>${esc(String(p.error || ''))}</td><td><button data-kid="${p.id}" data-d="sent">✅ Gitti</button> <button data-kid="${p.id}" data-d="failed">↩️ Gitmedi</button></td></tr>`).join('') ||
      '<tr><td colspan="7" class="k">Belirsiz kasa işlemi yok.</td></tr>');
}
$('uncertainKasa').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-kid]');
  if (!b) return;
  const id = Number(b.dataset.kid), durum = b.dataset.d;
  const gerekce = prompt('Kasa işlemi #' + id + ' için gerekçe (zincirde ne gördün? en az 10 karakter):');
  if (gerekce == null) return;
  if (durum === 'failed' && !confirm('#' + id + ' "gitmedi" sayılacak; aktarımsa borç yeniden aktarılır. Orijinal işlemin zincirde hiç görünmediğinden emin misin? (çift işlem riski)')) return;
  act(async () => { const r = await api('POST', '/api/admin/kasa/ops/resolve', { id, durum, gerekce }); alert('Çözüldü: #' + r.id + ' → ' + r.durum); });
});
$('uncertain').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-rid]');
  if (!b) return;
  const id = Number(b.dataset.rid), durum = b.dataset.d;
  const gerekce = prompt('#' + id + ' için gerekçe (zincirde ne gördün? en az 10 karakter):');
  if (gerekce == null) return;
  let txHash;
  if (durum === 'sent') { const h = prompt('İşlem numarası (satırda kayıtlıysa boş bırakabilirsin):', ''); if (h == null) return; txHash = h.trim() || undefined; }
  else if (!confirm('#' + id + ' yeniden gönderilecek. Orijinal işlemin zincirde hiç görünmediğinden ve beklemediğinden emin misin? (çift ödeme riski)')) return;
  act(async () => { const r = await api('POST', '/api/admin/payouts/resolve', { id, durum, txHash, gerekce }); alert('Çözüldü: #' + r.id + ' → ' + r.durum); });
});
$('kapiSave').onclick = () => act(async () => { const r = await api('POST', '/api/admin/kapi', { limit: Number($('kapiLimit').value) || null, tier: Number($('kapiTier').value), growthLocked: $('kapiGrowthLocked').checked }); $('kapiLimit').value = ''; $('kapiMsg').textContent = `Kaydedildi: sınır ${r.limit}, dönem ${r.tier + 1}, büyüme ${r.growthLocked ? 'kilitli' : 'açık'}`; });
$('uniSave').onclick = () => confirm('Universe aşaması ' + $('uniStage').value + ' yapılsın mı? (oyuncuların gördüğü kilitler değişir)') && act(() => api('POST', '/api/admin/universe-stage', { stage: Number($('uniStage').value) }));
$('kapiRun').onclick = () => act(async () => { const r = await api('POST', '/api/admin/kapi/run'); $('kapiMsg').textContent = `İşletildi: ${r.admitted} içeri alındı, davet süresi geçen ${(r.davetBitenler?.gecen || []).length}, katılım düşüklüğünden askıya alınan ${(r.katilimAskiya?.askiyaAlindi || []).length}${r.grown ? ', sınır ' + r.grown.from + ' → ' + r.grown.to : ''}`; });
for (const id of ['kapiQueue', 'kapiSusp']) $(id).addEventListener('click', ev => {
  const b = ev.target.closest('button[data-pid]');
  if (!b) return;
  if (!confirm(`${b.textContent} — ${b.dataset.pid}?`)) return;
  act(() => api('POST', '/api/admin/kapi/player', { playerId: b.dataset.pid, status: b.dataset.st }));
});
// ── ASTRA oranları ────────────────────────────────────────────────────────
let lastRates = null;
const pctTr = bps => '%' + (bps / 100).toLocaleString('tr-TR');
function ratesView(r) {
  lastRates = r;
  if (!r) { $('ratesInfo').textContent = 'Oran bilgisi yok.'; return; }
  const src = r.contract ? `Sözleşme: <a href="https://${r.chainId === 43113 ? 'testnet.' : ''}snowtrace.io/address/${esc(r.contract)}" target="_blank" rel="noopener">${esc(r.contract.slice(0, 10))}…</a>${r.owner ? ' · sahibi ' + esc(r.owner.slice(0, 10)) + '…' : ''}${r.readAt ? ' · son okuma ' + new Date(r.readAt).toLocaleString('tr-TR') : ''}`
    : 'Oran sözleşmesi tanımlı değil (RATES_CONTRACT): oyunun kendi ayarları geçerli.';
  const pend = r.pending ? `<br><span class="warn">⏳ Bekleyen değişiklik: ${new Date(r.pendingAt).toLocaleString('tr-TR')} tarihinde geçerli olacak.</span>` : '';
  $('ratesInfo').innerHTML = src + pend + (r.error ? `<br><span class="bad">Okuma hatası: ${esc(r.error)}</span>` : '');
  const pf = r.pendingFlows || [];
  $('ratesFlows').innerHTML = '<tr><th>Alan</th><th>Nereye gidiyor</th>' + (r.pending ? '<th>Bekleyen değişiklikten sonra</th>' : '') + '</tr>' +
    r.flows.map((f, i) => `<tr><td><b>${esc(f.area)}</b>${f.note ? `<div class="k">${esc(f.note)}</div>` : ''}</td><td>${esc(f.where)}</td>${r.pending ? `<td>${esc((pf[i] || {}).where || '')}</td>` : ''}</tr>`).join('');
  const src2 = r.pending || r.active;
  $('ratesForm').innerHTML = r.keys.map((k, i) => `<label class="card" style="padding:6px;"><div class="k">${esc(k.label)}</div><input data-rate="${i}" type="number" min="0" max="100" step="0.01" value="${src2[i] / 100}"></label>`).join('');
}
function readRateForm() {
  const arr = [...document.querySelectorAll('[data-rate]')].map(el => Math.round(Number(el.value) * 100));
  const spend = arr[0] + arr[1] + arr[2] + arr[3], pools = arr.slice(4, 10).reduce((a, b) => a + b, 0);
  if (arr.some(v => !Number.isFinite(v) || v < 0 || v > 10000)) throw new Error('Her oran %0 ile %100 arasında olmalı.');
  if (spend !== 10000) throw new Error('Harcama bölüşümü toplamı %100 olmalı (şu an ' + pctTr(spend) + ').');
  if (pools !== 10000) throw new Error('Kasa payları toplamı %100 olmalı (şu an ' + pctTr(pools) + ').');
  lastRates.keys.forEach((k, i) => { if (k.max != null && arr[i] > k.max) throw new Error(k.label + ' en fazla ' + pctTr(k.max) + ' olabilir.'); });
  return arr;
}
$('rPropose').onclick = () => {
  try {
    if (!lastRates || !lastRates.contract) return alert('Oran sözleşmesi tanımlı değil.');
    const arr = readRateForm();
    if (arr.length !== 21) return alert('Oran listesi 21 değer olmalı (şu an ' + arr.length + ').');
    const diff = lastRates.keys.map((k, i) => arr[i] !== lastRates.active[i] ? `${k.label}: ${pctTr(lastRates.active[i])} → ${pctTr(arr[i])}` : null).filter(Boolean);
    if (!diff.length) return alert('Değişen oran yok.');
    if (!confirm('Şu oranlar değişecek (24 saat sonra geçerli):\n\n' + diff.join('\n'))) return;
    ledgerTx(lastRates.contract, '0x2522e644' + arr.map(v => pad(v.toString(16))).join(''), 'Oran önerisi', 'ratesMsg');
  } catch (e) { alert(e.message); }
};
$('rCancel').onclick = () => lastRates && lastRates.contract && confirm('Bekleyen oran değişikliği geri çekilsin mi?') && ledgerTx(lastRates.contract, '0xea8a1af0', 'Öneriyi geri çekme', 'ratesMsg');
$('rAccept').onclick = () => lastRates && lastRates.contract && confirm('Oran sözleşmesinin sahipliğini bu cüzdanla kabul et?') && ledgerTx(lastRates.contract, '0x79ba5097', 'Sahiplik kabulü', 'ratesMsg');
$('rSync').onclick = () => act(async () => { const r = await api('POST', '/api/admin/rates/sync'); if (r && r.skipped) alert(r.skipped); });

function partnerCard(s) {
  const p = s.partnerIncome;
  if (!p || !p.enabled) return card('🤝 Trade sitesi geliri', 'kapalı (PARTNER_INCOME_FROM)');
  return `<div class="card"><div class="k">🤝 Trade sitesi geliri (7 gün / toplam)</div><div class="v ok">${fmt(p.weekAda)} / ${fmt(p.totalAda)}</div><div class="k">${p.count} ödeme · adres ${esc(String(p.to).slice(0, 8))}…</div></div>`;
}
function hotCard(s) {
  const h = s.hotWallet || {}, n = s.hotNeed || {};
  if (!s.reserveWallet) return card('🧊 Yedek cüzdan', 'TANIMLI DEĞİL (RESERVE_WALLET)', 'bad');
  const low = h.low ? '<br><span class="bad">⚠️ Az: yedek cüzdandan ' + fmt(Math.ceil((n.need || 0) - (h.walletAda || 0))) + ' ASTRA gönder</span>' : '';
  return `<div class="card"><div class="k">🧊 Oyun cüzdanı / haftalık ihtiyaç</div><div class="v ${h.low ? 'bad' : 'ok'}">${fmt(h.walletAda)} / ${fmt(n.need)}</div><div class="k">Fazlası yedek cüzdana gider: ${esc(s.reserveWallet.slice(0, 8))}…${h.swept ? ' · son aktarım ' + fmt(h.swept) + ' ASTRA' : ''}${low}</div></div>`;
}
function contractCard(s) {
  const c = (s.hotWallet || {}).contract;
  if (!s.paymentsContract) return card('Ödeme sözleşmesi', 'yok');
  if (!c) return card('Sözleşme sahibi', 'henüz okunmadı (denetle)');
  const pend = c.pendingOwner && !/^0x0{40}$/.test(c.pendingOwner) ? '<br><span class="warn">Devir bekliyor: ' + esc(c.pendingOwner.slice(0, 8)) + '… → "sahipliği kabul et"</span>' : '';
  // Hazine / komisyon adresi değişikliği sözleşmede 24 saat gecikmeli: bekleyen öneri burada görünür ve iptal edilebilir
  const cfgPend = c.configPending ? '<br><span class="bad">⚠️ Adres değişikliği bekliyor: hazine ' + esc(String(c.configPending.treasury).slice(0, 10)) + '… · komisyon ' + esc(String(c.configPending.feeReceiver).slice(0, 10)) + '… · ' + new Date(c.configPending.at).toLocaleString('tr-TR') + ' sonrası uygulanır. Sen önermediysen "bekleyen adres değişikliğini iptal et".</span>' : '';
  return `<div class="card"><div class="k">Sözleşme sahibi</div><div class="v ${c.ownerOk ? 'ok' : 'bad'}">${c.ownerOk ? '✅ donanım cüzdanı' : (c.ownerIsHot ? '⛔ SICAK CÜZDAN' : '⚠️ beklenen değil')}</div><div class="k">${esc(c.owner.slice(0, 10))}… ${c.paused ? '· <span class="bad">ödemeler durdurulmuş</span>' : ''}${pend}${cfgPend}</div></div>`;
}
// ── Tarayıcı cüzdanıyla (Ledger) sözleşme işlemleri: sunucu imza atmaz ──
async function ledgerTx(to, data, label, msgId = 'ledgerMsg') {
  const msg = $(msgId);
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
$('cCancelCfg').onclick = async () => { const s = await api('GET', '/api/admin/status'); if (confirm('Ödeme sözleşmesindeki BEKLEYEN hazine/komisyon adresi değişikliği iptal edilsin mi?')) ledgerTx(s.paymentsContract, '0xaeddb7d8', 'Adres değişikliğini iptal'); };
$('cResume').onclick = async () => { const s = await api('GET', '/api/admin/status'); if (confirm('Sözleşmedeki cüzdan ödemeleri açılsın mı?')) ledgerTx(s.paymentsContract, '0x16c38b3c' + pad('0'), 'Ödemeleri açma'); };
$('topUp').onclick = async () => {
  const s = await api('GET', '/api/admin/status');
  const amt = Number($('topAmt').value);
  if (!(amt > 0) || !s.gameWallet) return alert('Geçerli bir miktar yaz (oyun cüzdanı tanımlı olmalı).');
  if (!confirm(fmt(amt) + ' ASTRA yedek cüzdandan oyun cüzdanına (' + s.gameWallet + ') gönderilsin mi?')) return;
  const wei = (BigInt(Math.floor(amt)) * 10n ** 18n).toString(16);
  ledgerTx(s.tokenAddress, '0xa9059cbb' + pad(s.gameWallet) + pad(wei), 'Oyun cüzdanına ASTRA');
};
$('hotCheck').onclick = () => act(async () => { const r = await api('POST', '/api/admin/hotwallet/check'); alert('Sonuç: ' + JSON.stringify(r && { walletAda: r.walletAda, need: r.need, swept: r.swept, low: r.low })); });
// ── Geri bildirimler ("Sorun bildir" biletleri, RB-1001…) ─────────────────────
// Oyuncunun yazdığı her şey veridir: metin yalnız textContent / esc ile, görüntü yalnız data:image/(jpeg|png|webp) ise <img>'e verilir.
const GB_DURUM = { yeni: ['Yeni', 'gb-yeni'], inceleniyor: ['İnceleniyor', 'gb-incele'], cozuldu: ['Çözüldü', 'gb-coz'] };
const GB_KONU = { hata: '🐞 Hata', oneri: '💡 Öneri', soru: '❓ Soru', odeme: '💳 Ödeme' };
const gbTarih = t => new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
let gbAcik = null;   // açık biletin numarası (liste yenilenince satır işaretli kalır)
async function gbYukle() {
  const q = new URLSearchParams({ durum: $('gbDurum').value, ara: $('gbAra').value.trim() });
  const r = await api('GET', '/api/admin/feedback?' + q.toString());
  const s = r.sayi || {};
  $('gbSayi').textContent = `Yeni ${s.yeni || 0} · İnceleniyor ${s.inceleniyor || 0} · Çözüldü ${s.cozuldu || 0} · toplam ${r.toplam || 0}`;
  $('gbBaslik').textContent = '📮 Geri bildirimler' + (s.yeni ? ` (${s.yeni} yeni)` : '');
  $('gbListe').innerHTML = '<tr><th>Bilet</th><th>Durum</th><th>Konu</th><th>Oyuncu</th><th>Mesaj</th><th>📷</th><th>Zaman</th></tr>' +
    (r.rows || []).map(x => `<tr class="gb-satir${x.no === gbAcik ? ' acik' : ''}" data-no="${x.no}"><td class="gb-bilet">${esc(x.bilet)}</td><td class="${(GB_DURUM[x.durum] || [])[1] || ''}">${esc((GB_DURUM[x.durum] || [x.durum])[0])}</td><td>${esc(GB_KONU[x.konu] || x.konu)}</td><td>${esc(x.oyuncu)}</td><td>${esc(x.kisa)}${x.cevap ? ' 💬' : ''}</td><td>${x.ekSayisi || ''}</td><td>${esc(gbTarih(x.at))}</td></tr>`).join('');
}
const gbEl = (tag, metin, sinif) => { const e = document.createElement(tag); if (metin != null) e.textContent = metin; if (sinif) e.className = sinif; return e; };
async function gbAc(no) {
  gbAcik = no;
  const { bilet: b } = await api('GET', '/api/admin/feedback/detail?no=' + encodeURIComponent(no));
  const kutu = $('gbAyrinti');
  kutu.replaceChildren();
  const ust = gbEl('div'); ust.append(gbEl('b', b.bilet, 'gb-bilet'), gbEl('span', ` · ${GB_KONU[b.konu] || b.konu} · oyuncu ${b.oyuncu} · ${gbTarih(b.at)}`, 'k'));
  const metin = gbEl('div', b.mesaj, 'gb-metin');
  const bg = b.baglam || {}, oz = b.oyuncuOzeti || {};
  const baglam = gbEl('div', `Sayfa: ${bg.sayfa || '-'} · Sürüm: ${bg.surum || '-'} · Ekran: ${bg.ekran || '-'}\nCihaz: ${bg.cihaz || '-'}\nOyuncu özeti: ${JSON.stringify(oz)}`, 'gb-baglam');
  const resimler = gbEl('div', null, 'gb-resimler');
  for (const v of b.ekler || []) {
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) continue;
    const im = document.createElement('img'); im.src = v; im.alt = 'Ekran görüntüsü';
    im.onclick = () => im.classList.toggle('buyuk');
    resimler.append(im);
  }
  const durum = document.createElement('select'); durum.id = 'gbYeniDurum';
  for (const [k, [ad]] of Object.entries(GB_DURUM)) { const o = document.createElement('option'); o.value = k; o.textContent = ad; if (k === b.durum) o.selected = true; durum.append(o); }
  const cevap = document.createElement('textarea'); cevap.id = 'gbCevap'; cevap.rows = 3; cevap.maxLength = 2000; cevap.placeholder = 'Oyuncuya cevap (oyunda biletinin altında görünür)'; cevap.value = b.cevap || '';
  const kaydet = gbEl('button', '💾 Durumu / cevabı kaydet', 'go');
  const mesaj = gbEl('span', '', 'k');
  kaydet.onclick = async () => {
    try { await api('POST', '/api/admin/feedback/update', { no: b.no, durum: durum.value, cevap: cevap.value }); mesaj.textContent = 'Kaydedildi.'; await gbYukle(); }
    catch (e) { mesaj.textContent = e.message; }
  };
  const alt = gbEl('div', null, 'gb-sec'); alt.append(gbEl('span', 'Durum:', 'k'), durum, kaydet, mesaj);
  kutu.append(ust, metin, resimler, baglam, gbEl('div', 'Cevabın', 'k'), cevap, alt);
  kutu.hidden = false;
  await gbYukle();
}
$('gbListe').addEventListener('click', ev => { const tr = ev.target.closest('tr[data-no]'); if (tr) gbAc(Number(tr.dataset.no)).catch(e => alert(e.message)); });
$('tgDene').onclick = async () => { $('tgDurum').textContent = 'Gönderiliyor…'; try { await api('POST', '/api/admin/telegram/dene'); $('tgDurum').textContent = 'Gönderildi: Telegram uygulamana bak.'; } catch (e) { $('tgDurum').textContent = e.message; } };
$('gbYenile').onclick = () => gbYukle().catch(e => alert(e.message));
$('gbDurum').onchange = () => gbYukle().catch(e => alert(e.message));
$('gbAra').addEventListener('keydown', ev => { if (ev.key === 'Enter') gbYukle().catch(e => alert(e.message)); });
// ── Denge İzleme ──────────────────────────────────────────────────────────
// Sunucu raporu (server/denge-rapor.js): uyarılar, özet, zindan/işlem tabloları ve oyuncu dağılımları. Metinler textContent ile, sayılar dgSayi ile yazılır.
const DG_TUR = { dovme: 'Dövme', yukselt: 'Yükseltme', onar: 'Tamir', hurda: 'Hurda', asker_al: 'Asker alımı', iyilestir: 'İyileştirme', seviye: 'Seviye atlama', mod_katki: 'Mod katkısı', mod_gecis: 'Mod geçişi' };
const DG_HAM = { wood: 'odun', iron: 'demir', coal: 'kömür', stone: 'taş', wheat: 'buğday', herb: 'şifalı ot', fragments: 'parça' };
const dgSayi = v => (v == null ? '—' : Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 2 }));
const dgYuzde = v => (v == null ? '—' : '%' + Math.round(v * 100));
function dgTablo(el, baslik, satirlar) {
  el.replaceChildren();
  const tr0 = document.createElement('tr');
  for (const b of baslik) { const th = document.createElement('th'); th.textContent = b; tr0.append(th); }
  el.append(tr0);
  for (const s of satirlar) {
    const tr = document.createElement('tr');
    for (const h of s) { const td = document.createElement('td'); if (h && typeof h === 'object') { td.textContent = h.t; if (h.c) td.className = h.c; } else td.textContent = h; tr.append(td); }
    el.append(tr);
  }
  if (!satirlar.length) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = baslik.length; td.className = 'k'; td.textContent = 'Henüz veri yok'; tr.append(td); el.append(tr); }
}
function dgKart(kutu, etiketMetni, deger, sinif) {
  const d = document.createElement('div'), k = document.createElement('div'), v = document.createElement('div');
  k.className = 'k'; k.textContent = etiketMetni; v.className = 'v ' + (sinif || ''); v.textContent = deger;
  d.append(k, v); kutu.append(d);
}
async function dengeYukle(ekMesaj = '') {
  const r = await api('GET', '/api/admin/denge?pencere=' + encodeURIComponent($('dgPencere').value));
  $('dgDurum').textContent = (ekMesaj ? ekMesaj + ' · ' : '') + `${r.baslangic} → ${r.bitis} (${r.gunSayisi} gün)`;   // ekMesaj: işlemin sonucu rapor yenilenince silinmesin
  const uy = $('dgUyarilar'); uy.replaceChildren();
  for (const u of r.uyarilar || []) {
    const d = document.createElement('div'); d.className = 'dg-uyari ' + u.seviye;
    const b = document.createElement('b'); b.textContent = ({ kritik: '⛔', uyari: '⚠️', bilgi: 'ℹ️' })[u.seviye] + ' ' + u.konu;
    const m = document.createElement('span'); m.textContent = u.ileti;
    const o = document.createElement('small'); o.textContent = '→ ' + u.oneri;
    d.append(b, m, o); uy.append(d);
  }
  if (!(r.uyarilar || []).length) { const d = document.createElement('div'); d.className = 'k'; d.textContent = '✅ Otomatik uyarı yok (yeterli veri yoksa kurallar çalışmaz: en az 20 savaş, 5 oyuncu).'; uy.append(d); }
  const t = r.tempo || {}, e = r.ekonomi, oz = $('dgOzet'); oz.replaceChildren();
  dgKart(oz, 'Oyuncu / aktif (7 gün)', `${dgSayi(t.oyuncu)} / ${dgSayi(t.aktif7)}`);
  dgKart(oz, 'Ortalama hesap seviyesi', dgSayi(t.ortSeviye));
  dgKart(oz, 'Ortalama asker / seviye', `${dgSayi(t.ortAsker)} / ${dgSayi(t.ortAskerSeviye)}`);
  dgKart(oz, 'Zindan savaşı', dgSayi((r.zindan || []).reduce((a, z) => a + z.giris, 0)));
  dgKart(oz, 'Zindandan kazanılan ASTRA', dgSayi(e.zindanKazanc));
  dgKart(oz, 'İşlemlere harcanan ASTRA', dgSayi(e.harcanan));
  dgKart(oz, 'Kazanç / harcama', e.kazancHarcamaOrani == null ? '—' : dgYuzde(e.kazancHarcamaOrani), e.kazancHarcamaOrani > 0.9 ? 'dg-kotu' : (e.kazancHarcamaOrani != null && e.kazancHarcamaOrani < 0.1 ? 'dg-orta' : 'dg-iyi'));
  dgKart(oz, 'Tahmini ASTRA yakımı', dgSayi(e.tahminiYakim));
  dgKart(oz, 'Yakılan hammadde (toplam)', dgSayi(e.yakilanHammaddeToplam));
  dgKart(oz, 'Asker hakkı dolu oyuncu', t.oyuncu ? `${dgSayi(t.hakDolu)} / ${dgSayi(t.oyuncu)}` : '—');
  dgTablo($('dgZindan'), ['Mod', 'Sv.', 'Canavar', 'Savaş', 'Kazanma', 'Ort. asker', 'Asker sv.', 'Takım sv.', 'Tur', 'Ödül (ASTRA)', 'İlk temizleme (medyan gün)', 'Hedef gün', 'Oran'],
    (r.zindan || []).map(z => [z.modAd, z.seviye, z.ad, dgSayi(z.giris), { t: dgYuzde(z.oran), c: z.oran != null && z.giris >= 20 ? (z.oran >= 0.92 ? 'dg-orta' : (z.oran <= 0.25 ? 'dg-kotu' : 'dg-iyi')) : '' },
      dgSayi(z.ortAsker), dgSayi(z.ortAskerSeviye), dgSayi(z.ortTakimSeviye), dgSayi(z.ortTur), dgSayi(z.toplamOdulAstra),
      z.ilkOyuncu ? `${dgSayi(z.ilkMedyanGun)} (${z.ilkOyuncu} oyuncu)` : '—', dgSayi(z.hedefGun), { t: z.ilkHedefOrani == null ? '—' : '×' + dgSayi(z.ilkHedefOrani), c: z.ilkHedefOrani != null && z.ilkOyuncu >= 5 ? (z.ilkHedefOrani < 0.7 ? 'dg-kotu' : (z.ilkHedefOrani > 3 ? 'dg-orta' : 'dg-iyi')) : '' }]));
  dgTablo($('dgIslem'), ['İşlem', 'Adet', 'Önceki dönem', 'Harcanan ASTRA', 'Ret', 'Yakılan hammadde'],
    (r.islemler || []).map(x => [DG_TUR[x.tur] || x.tur, dgSayi(x.adet), dgSayi(x.oncekiAdet), dgSayi(x.astra), dgSayi(x.red), Object.entries(x.hammadde || {}).map(([k, v]) => `${dgSayi(v)} ${DG_HAM[k] || k}`).join(', ') || '—']));
  const dag = [];
  const dagSatir = (ad, nesne) => { if (nesne && Object.keys(nesne).length) dag.push([ad, Object.entries(nesne).map(([k, v]) => `${k}: ${dgSayi(v)}`).join('  ·  ')]); };
  dagSatir('Hesap seviyesi', t.seviye); dagSatir('Asker sayısı', t.asker); dagSatir('Kuşanılan eşya seviyesi (sayı)', t.takimEsyaSeviye);
  dagSatir('Zindan ilerlemesi (mod|canavar: oyuncu)', t.zindan); dagSatir('Mod', t.mod); dagSatir('Oyuncuların hammaddesi (toplam)', t.hammadde);
  dgTablo($('dgDagilim'), ['Dağılım', 'Değerler'], dag);
}
$('dgYenile').onclick = () => dengeYukle().catch(e => { $('dgDurum').textContent = e.message; });
$('dgPencere').onchange = () => dengeYukle().catch(e => { $('dgDurum').textContent = e.message; });
$('dgGoruntu').onclick = async () => { try { const r = await api('POST', '/api/admin/denge/goruntu'); await dengeYukle(`Görüntü alındı (${r.oyuncu} oyuncu)`); } catch (e) { $('dgDurum').textContent = e.message; } };
async function act(fn) { try { await fn(); await load(); } catch (e) { alert(e.message); } }
$('enter').onclick = async () => { token = $('tok').value.trim(); try { await load(); sessionStorage.setItem('adm', token); } catch (e) { $('lerr').textContent = e.message; } };
$('refresh').onclick = () => act(async () => {});
$('pause').onclick = () => confirm('Çekim talepleri ve zincir ödemeleri durdurulsun mu?') && act(() => api('POST', '/api/admin/pause', { paused: true }));
$('resume').onclick = () => act(() => api('POST', '/api/admin/pause', { paused: false }));
$('pay').onclick = () => confirm('Bekleyen ödemeler şimdi zincire gönderilsin mi?') && act(async () => { const r = await api('POST', '/api/admin/payouts/run'); alert('Sonuç: ' + JSON.stringify(r)); });
$('logout').onclick = () => { sessionStorage.removeItem('adm'); location.reload(); };
if (token) load().catch(() => { token = ''; });
