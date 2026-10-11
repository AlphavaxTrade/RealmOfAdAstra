// Realm of AdAstra — sınır ve kota arayüz bileşenleri
// Kota paneli, piyango sekmesi, zindan giriş kartı ve yan panel aynı bileşenleri kullanır.
// Fonksiyonlar yalnızca HTML metni üretir; oyun durumunu değiştirmez.

const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export const fmtInt = (n) => Math.floor(Number(n) || 0).toLocaleString('tr-TR');

// 3 g 4 sa · 5 sa 12 dk · 8 dk
export function formatDuration(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d} g ${h} sa`;
  if (h > 0) return `${h} sa ${m} dk`;
  return `${m} dk`;
}

function toneFor(ratio) {
  if (ratio >= 1) return 'is-full';
  if (ratio >= 0.8) return 'is-high';
  return '';
}

// Kullanılan / sınır göstergesi: "Bu hafta aldığın 40 / 100"
export function renderLimitMeter({ icon = '', label, used, max, note = '', unit = '' }) {
  const ratio = max > 0 ? Math.min(1, used / max) : 0;
  const left = Math.max(0, max - used);
  return `
    <div class="limit-meter ${toneFor(ratio)}">
      <div class="limit-meter-head">
        <span class="limit-meter-label">${icon ? `<span class="limit-meter-icon" aria-hidden="true">${icon}</span>` : ''}${label}</span>
        <span class="limit-meter-value"><strong>${fmtInt(used)}</strong> / ${fmtInt(max)}${unit}</span>
      </div>
      <div class="limit-meter-track" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${used}" aria-label="${label}">
        <div class="limit-meter-fill" style="width:${(ratio * 100).toFixed(1)}%"></div>
      </div>
      <div class="limit-meter-foot">
        <span>${left > 0 ? `Kalan: ${fmtInt(left)}${unit}` : 'Sınır doldu'}</span>
        ${note ? `<span class="limit-meter-note">${note}</span>` : ''}
      </div>
    </div>`;
}

// 7 günlük açılım şeridi: açılmış günler dolu, bugün vurgulu, gelecek günler kilitli
export function renderDayStrip(dayIndex) {
  return `
    <div class="day-strip" aria-label="Haftalık kotanın açılan günleri">
      ${DAY_NAMES.map((name, i) => `
        <span class="day-strip-cell ${i < dayIndex ? 'is-open' : i === dayIndex ? 'is-today' : 'is-locked'}" title="${name}: ${i <= dayIndex ? 'açıldı' : 'henüz açılmadı'}">
          ${name}
        </span>`).join('')}
    </div>`;
}

// Haftalık kotanın bir kaynağı: toplam, bugüne kadar açılan, çıkarılan, bugün alınabilir
export function renderResourceQuotaCard(key, info, meta) {
  const base = info.baseCap || 0;
  const released = info.releasedCap || 0;
  const harvested = info.harvestedThisWeek || 0;
  const available = info.availableToday || 0;
  const pct = (n) => (base > 0 ? Math.min(100, (n / base) * 100) : 0).toFixed(1);
  const burned = Math.max(0, base - (info.currentCap ?? base));
  return `
    <div class="quota-res-card" style="--res-color:${meta.color}">
      <div class="quota-res-head">
        <span class="quota-res-name"><span aria-hidden="true">${meta.icon}</span> ${meta.name}</span>
        <span class="quota-res-avail">Şu an alınabilir: <strong>${fmtInt(available)}</strong></span>
      </div>
      <div class="quota-stack" role="img" aria-label="${meta.name}: haftalık ${fmtInt(base)}, açılan ${fmtInt(released)}, çıkarılan ${fmtInt(harvested)}">
        <div class="quota-stack-released" style="width:${pct(released)}%"></div>
        <div class="quota-stack-harvested" style="width:${pct(harvested)}%"></div>
      </div>
      <div class="quota-res-legend">
        <span><i class="lg lg-harvested"></i>Çıkarılan ${fmtInt(harvested)}</span>
        <span><i class="lg lg-released"></i>Açılan ${fmtInt(released)}</span>
        <span><i class="lg lg-locked"></i>Haftalık ${fmtInt(base)}</span>
        ${burned > 0 ? `<span>🔥 Yakılan ${fmtInt(burned)}</span>` : ''}
      </div>
    </div>`;
}

// Zindan günlük giriş basamakları: 1 aşınmasız · 2–5 ödüllü · 6+ harçlı (her girişte stamina harcanır)
export function renderDungeonEntryLadder(st) {
  const freeTotal = st.freeTotal || 5;
  const used = st.entriesToday || 0;
  const steps = [];
  for (let n = 1; n <= freeTotal; n++) {
    steps.push({ n, label: 'Ödüllü', sub: n === 1 ? 'Aşınma yok' : 'Silah −1' });
  }
  steps.push({ n: freeTotal + 1, label: 'Harç', sub: 'veya antrenman', plus: true });
  return `
    <ol class="entry-ladder" aria-label="Bugünkü zindan girişleri">
      ${steps.map(s => {
        const done = s.plus ? false : used >= s.n;
        const current = s.plus ? used >= freeTotal : used + 1 === s.n;
        return `
        <li class="entry-step ${done ? 'is-done' : ''} ${current ? 'is-current' : ''} ${s.n === 1 ? 'is-free' : ''} ${s.plus ? 'is-fee' : ''}">
          <span class="entry-step-n">${s.n}${s.plus ? '+' : ''}</span>
          <span class="entry-step-label">${s.label}</span>
          <span class="entry-step-sub">${s.sub}</span>
        </li>`;
      }).join('')}
    </ol>`;
}

// "Kota ve Sınırlar" panelinin tamamı
// Uzun açıklamalar "Nasıl hesaplanır?" bölümlerinde katlı, başlıklar kısa
export function renderQuotaTracker({ gameState, globalPool, config }) {
  const ayrinti = (metin, baslik = 'Nasıl hesaplanır?') => `<details class="v3-ayrinti"><summary>${baslik}</summary><div>${metin}</div></details>`;
  const caps = config.GLOBAL_RESOURCE_CAPS;
  const order = config.RESOURCE_KEYS || ['wood', 'iron', 'wheat'];
  const W = gameState.getUretimWeight ? gameState.getUretimWeight() : { weight: 1, levelFactor: 1, tier: { name: 'Yok', mult: 1 }, activity: 1 };
  const UP = globalPool.uretimParams ? globalPool.uretimParams() : { qpp: {}, otoriteLevel: 0 };
  const OT = globalPool.otoriteWork ? globalPool.otoriteWork(UP.otoriteLevel) : { hours: 20, days: 6 };
  const infos = Object.fromEntries(order.map(k => [k, globalPool.getResourceInfo(k)]));
  const first = infos[order[0]] || {};
  const dayIndex = first.dayIndex || 0;
  const now = Date.now();
  const nextRelease = first.nextReleaseAt;
  const weekEnd = globalPool.state.epochEndTime;
  const lot = gameState.getLotteryStatus();
  const dun = gameState.getDungeonDayStatus();
  const counters = gameState.getDailyCounters();
  const arenaCap = config.COLOSSEUM?.DAILY_MATCH_CAP || 10;
  const ubiMin = config.UBI_CONFIG?.MIN_LEVEL || 3;
  const ubiClaimed = (gameState.state.lastClaimedUbiEpoch || 0) >= (globalPool.state.epochId || 1);
  const trtMidnight = (() => {
    const t = new Date(now + 3 * 3600 * 1000);
    t.setUTCHours(24, 0, 0, 0);
    return t.getTime() - 3 * 3600 * 1000;
  })();

  return `
    <div class="quota-tracker">
      <div class="quota-timers">
        <div class="stat-tile"><span class="stat-tile-label">Kotanın yeni parçası</span><strong>${nextRelease && dayIndex < 6 ? formatDuration(nextRelease - now) : 'Hafta sonu'}</strong><span class="stat-tile-sub">Her gün haftalık kotanın 1/7'si açılır</span></div>
        <div class="stat-tile"><span class="stat-tile-label">Günlük haklar yenilenir</span><strong>${formatDuration(trtMidnight - now)}</strong><span class="stat-tile-sub">Gece 00:00 (TSİ)</span></div>
        <div class="stat-tile"><span class="stat-tile-label">Yeni hafta</span><strong>${formatDuration(weekEnd - now)}</strong><span class="stat-tile-sub">Pazartesi 00:01 (TSİ)</span></div>
      </div>

      <section class="clean-card quota-section">
        <div class="card-title-row">
          <div class="card-title">🎫 Üretim Hakkın (bu hafta)</div>
          <span class="card-badge">ağırlık ×${W.weight} · kademe ${W.tier.name}</span>
        </div>
        ${ayrinti(`Haftalık payın = taban üretim × Otorite çalışma süresi (${Math.round(OT.hours)} sa × ${Math.round(OT.days)} gün) × kişi başı kota × ağırlığın (seviye ×${W.levelFactor} · katkı kademesi ${W.tier.name} ×${W.tier.mult} · aktiflik ×${W.activity}). Her gün 1/7'si açılır; dolunca mahsul seferde bekler. Başkalarının kullanmadığı hak, hakkını aşanlara (en çok 3 katına kadar) akar. Çıkarılanın %5'i Sirius Konseyi ortak kasasına gider.`)}
        <div class="quota-res-grid">
          ${order.map(k => { const hk = gameState.getUretimHakki(k); const m = caps[k]; const pc = (n, b) => (b > 0 ? Math.min(100, (n / b) * 100) : 0).toFixed(1); return `
          <div class="quota-res-card" style="--res-color:${m.color}">
            <div class="quota-res-head"><span class="quota-res-name"><span aria-hidden="true">${m.icon}</span> ${m.name}</span><span class="quota-res-avail">Alınabilir: <strong>${fmtInt(hk.canTake)}</strong></span></div>
            <div class="quota-stack" role="img" aria-label="${m.name}: haftalık hak ${fmtInt(hk.weekly)}, açılan ${fmtInt(hk.released)}, kullanılan ${fmtInt(hk.used)}"><div class="quota-stack-released" style="width:${pc(hk.released, hk.weekly)}%"></div><div class="quota-stack-harvested" style="width:${pc(hk.used, hk.weekly)}%"></div></div>
            <div class="quota-res-legend"><span><i class="lg lg-harvested"></i>Kullanılan ${fmtInt(hk.used)}</span><span><i class="lg lg-released"></i>Açılan ${fmtInt(hk.released)}</span><span><i class="lg lg-locked"></i>Haftalık ${fmtInt(hk.weekly)}</span>${hk.extra > 0 ? `<span>➕ Başkalarından ${fmtInt(hk.extra)}</span>` : ''}</div>
          </div>`; }).join('')}
        </div>
      </section>

      <section class="clean-card quota-section">
        <div class="card-title-row">
          <div class="card-title">🌍 Sirius kapasitesi (herkes)</div>
          <span class="card-badge">${dayIndex + 1}. gün / 7</span>
        </div>
        ${ayrinti(`Bütün oyuncuların bu hafta çıkarabileceği toplam hammadde. Kota her gün bir parça açılır; açılıp çıkarılmayan kısım hafta içinde birikir. Seferin topladığı miktar, o an alınabilir olanla sınırlıdır. Şu an kota %${Math.round((UP.qpp[order[0]] || 0) * 100)}, Otorite seviye ${UP.otoriteLevel}.`, 'Bu ne demek?')}
        ${renderDayStrip(dayIndex)}
        <div class="quota-res-list">
          ${order.map(k => renderResourceQuotaCard(k, infos[k], caps[k])).join('')}
        </div>
      </section>

      <section class="clean-card quota-section">
        <div class="card-title-row">
          <div class="card-title">📅 Günlük sınırların (bugün)</div>
        </div>
        <div class="limit-list">
          ${renderLimitMeter({ icon: '💀', label: 'Zindan: harçsız ödüllü giriş', used: dun.freeUsed, max: dun.freeTotal, note: dun.nextNeedsFee ? 'Sonraki girişler harçlı' : (dun.nextWeaponWear ? 'Silahlar her girişte 1 aşınır' : 'Sıradaki girişte silahlar aşınmaz') })}
          ${renderLimitMeter({ icon: '🏟️', label: 'Kolezyum maçı', used: counters.arenaMatches || 0, max: arenaCap })}
          ${renderLimitMeter({ icon: '🏦', label: 'Zindan kasasının bugünkü ödeme bütçesi', used: Math.max(0, (dun.budget || 0) - (dun.budgetLeft || 0)), max: dun.budget || 0, unit: ' ASTRA', note: 'Kasa günde en fazla bakiyesinin %1\'ini öder' })}
        </div>
        ${renderDungeonEntryLadder(dun)}
      </section>

      <section class="clean-card quota-section">
        <div class="card-title-row">
          <div class="card-title">🗓️ Haftalık sınırların</div>
        </div>
        <div class="limit-list">
          ${renderLimitMeter({ icon: '🎟️', label: 'Piyango: bu hafta aldığın bilet', used: lot.boughtThisWeek, max: lot.maxPerWeek })}
        </div>
        <div class="quota-ubi">
          <span>🎫 Piyango: elindeki bilet (devredenler dahil, sınırsız)</span>
          <strong>${fmtInt(lot.myTickets)} bilet</strong>
        </div>
        <div class="quota-ubi ${ubiClaimed ? 'is-done' : ''}">
          <span>🏛️ Haftalık temel gelir (UBI)</span>
          <strong>${(gameState.state.level || 1) < ubiMin ? `${ubiMin}. seviyede açılır` : ubiClaimed ? 'Bu hafta alındı' : 'Bu hafta alınabilir'}</strong>
        </div>
      </section>
    </div>`;
}
