// Realm of AdAstra — v3 Karnaval ekranı parçaları (çark seçenekleri, havuzlar sekmesi).
// Saf HTML üreticileri: DOM'a ve oyun durumuna dokunmaz, her metni kaçırır. Düğme kimlikleri ve sınıfları eski ekranla AYNIDIR
// (js/app.js içindeki dinleyiciler `.btn-spin-wheel[data-pay]`, `#btn-spin-wheel-ticket`, `.btn-eco-pool-jump[data-action]` ile çalışır).
import { esc } from './hub.js';
import { istatSatiri } from './bilesenler.js';

const f0 = (v, d = 0) => Number(v || 0).toLocaleString('tr-TR', { maximumFractionDigits: d });
const pct = (v) => '%' + String(v).replace('.', ',');

// Çark: ana yol tek düğme (ASTRA); bilet ve hammadde seçenekleri aşağıda. resBtnsHtml: hammadde düğmelerinin hazır HTML'i (app.js üretir).
export function cevirSecenekleriHtml({ costAda, tickets, resSpinsLeft, resSpinsMax, resBtnsHtml }) {
  return `<div class="clean-card v3-cevir">
    <button class="btn-clean btn-spin-wheel v3-cevir-ana" data-pay="ada">🟣 ${esc(f0(costAda))} ASTRA ile çevir</button>
    <button id="btn-spin-wheel-ticket" class="btn-clean btn-spin-wheel" data-pay="ticket" ${tickets > 0 ? '' : 'disabled'}>🎟️ 1 bilet ile çevir (${esc(f0(tickets))} bilet)</button>
    <details class="v3-ayrinti"><summary>Hammaddeyle çevir (bugün kalan ${esc(resSpinsLeft)}/${esc(resSpinsMax)})</summary>
      <div><div class="v3-cevir-hammadde">${resBtnsHtml}</div>
      <small>Hammaddenin yarısı yakılır, yarısı satılıp Karnaval kasasına girer.</small></div>
    </details>
  </div>`;
}

function yakilanTablo(baslik, yakilan, basamak = 0) {
  const satir = (simge, ad, v) => istatSatiri(`${simge} ${ad}`, f0(v, basamak));
  return `<div class="v3-yakilan"><b>${esc(baslik)}</b>${satir('🌲', 'Odun', yakilan.wood)}${satir('⛏️', 'Demir', yakilan.iron)}${satir('🌾', 'Buğday', yakilan.wheat)}</div>`;
}

// Havuzlar sekmesi. g: { serbest, kilitli, katki, carpan }, ucretsizHtml: ücretsiz oyuncu payı açıklaması (hazır HTML).
export function havuzlarHtml({ eData, g, ucretsizHtml }) {
  const dilimler = [
    { ad: '🔥 Yakım', v: eData.burnRatePct, c: '#ef4444' },
    { ad: '🤝 Temel gelir', v: eData.ubiRatePct, c: '#a855f7' },
    { ad: '🛠️ Yapımcı', v: eData.creatorRatePct, c: '#64748b' },
    ...(eData.pools || []).map((p) => ({ ad: `${p.icon} ${p.name}`, v: p.sharePct, c: p.color }))
  ];
  const havuz = (p) => `<div class="v3-havuz" style="--v3-havuz-renk:${esc(p.color)}">
      <div class="v3-havuz-ust"><span class="v3-havuz-simge" aria-hidden="true">${esc(p.icon)}</span>
        <div class="v3-havuz-ad"><b>${esc(p.name)}</b><small>Gelir payı: ${esc(pct(p.sharePct))}</small></div>
        <span class="v3-havuz-bakiye">${esc(f0(p.balance))}<i>ASTRA</i></span></div>
      <div class="v3-havuz-alt">
        <details class="v3-ayrinti"><summary>Nasıl kazanılır?</summary><div>${esc(p.description || '')}<br><strong>${esc(p.howToEarn || '')}</strong></div></details>
        <button class="btn-clean btn-clean-outline btn-eco-pool-jump" data-action="${esc(p.actionType)}">${esc(p.actionText)} ➔</button>
      </div>
    </div>`;
  return `<div class="v3-karnaval-havuz">
    <div class="clean-card">
      <div class="card-title-row"><div class="card-title">🛡️ Kasa ödeme güvencesi</div><span class="card-badge">%${esc(eData.solvencyPct)}</span></div>
      ${istatSatiri('🔓 Serbest', `${f0(g.serbest)} ASTRA`, { ton: 'iyi' })}
      ${istatSatiri('🔒 Kilitli', `${f0(g.kilitli)} ASTRA`, { ton: 'uyari' })}
      ${istatSatiri('🏅 Katkı puanı (bu hafta)', f0(g.katki))}
      ${istatSatiri('💱 Fiyat çarpanı', `×${f0(g.carpan, 3)}`)}
      <details class="v3-ayrinti"><summary>Kilit ve ücretsiz oyuncu payı nedir?</summary><div>${ucretsizHtml}</div></details>
    </div>
    <div class="clean-card">
      <div class="card-title">📊 Oyunun parası</div>
      ${istatSatiri('Kasalarda duran', `${f0(eData.totalPoolsBalance)} ASTRA`)}
      ${istatSatiri('🔥 Yakılan (toplam)', `${f0(eData.lifetimeBurnedAda)} ASTRA`)}
      ${istatSatiri('Giren (toplam)', `${f0(eData.totalDeposited)} ASTRA`)}
      ${istatSatiri('Dağıtılan ödül', `${f0(eData.totalWithdrawn)} ASTRA`)}
    </div>
    <div class="clean-card">
      <div class="card-title">🧭 Harcanan her 100 ASTRA nereye gider?</div>
      <div class="v3-bolme" role="img" aria-label="Harcama dağılımı">${dilimler.map((d) => `<i style="width:${Number(d.v) || 0}%;background:${esc(d.c)}" title="${esc(d.ad)} ${esc(pct(d.v))}"></i>`).join('')}</div>
      <div class="v3-bolme-ad">${dilimler.map((d) => `<span><i style="background:${esc(d.c)}"></i>${esc(d.ad)} <b>${esc(pct(d.v))}</b></span>`).join('')}</div>
    </div>
    <details class="v3-katli-basit"><summary>🔥 Yakılan hammaddeler</summary>
      <div>
        ${yakilanTablo('Karnaval çarkında (pazara girmeden yakılır)', eData.burnedResources || {}, 0)}
        ${yakilanTablo('Pazar işlemlerinde (%2 harç)', eData.ammBurnedResources || {}, 1)}
      </div>
    </details>
    <div class="v3-havuz-liste">
      <div class="v3-baslik-kucuk">💰 Ödül kasaları (canlı bakiye)</div>
      ${(eData.pools || []).map(havuz).join('')}
      <div class="v3-havuz" style="--v3-havuz-renk:#a855f7">
        <div class="v3-havuz-ust"><span class="v3-havuz-simge" aria-hidden="true">🎟️</span>
          <div class="v3-havuz-ad"><b>Haftalık piyango kasası</b><small>Amorti ${esc(f0(eData.lottery.amortiShare))} · devir ${esc(f0(eData.lottery.rolloverShare))}</small></div>
          <span class="v3-havuz-bakiye">${esc(f0(eData.lottery.lotteryPool))}<i>ASTRA</i></span></div>
        <button class="btn-clean btn-clean-purple btn-eco-pool-jump" data-action="lottery">🎟️ Piyango biletlerine git ➔</button>
      </div>
    </div>
  </div>`;
}
