// Realm of AdAstra — v3 Hazine ekranı parçaları: büyük kasa özeti ve ödül kasaları listesi.
// Saf HTML üreticileri (DOM'a ve oyun durumuna dokunmaz, her metni kaçırır). Düğme sınıfı `.btn-treasury-action[data-action]` eski ekranla aynıdır.
import { esc } from './hub.js';
import { istatSatiri } from './bilesenler.js';

const f0 = (v) => Number(v || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

// summary: gameState.getTreasuryVaultSummary() çıktısı
export function hazineOzetHtml(summary) {
  return `<div class="clean-card">
    <div class="card-title-row"><div class="card-title">👑 Büyük Krallık Kasası</div><span class="card-badge">10 yıllık düzen</span></div>
    ${istatSatiri('Kilitli ödül ve hazine', `${f0(summary.totalVaultAda)} ASTRA`)}
    ${istatSatiri('Pazar likidite rezervi', `${f0(summary.totalAmmLiquidityAda)} ASTRA`)}
    ${istatSatiri('🔥 Kalıcı yakılan', `${f0(summary.burnedNftPool)} ASTRA`, { ton: 'uyari' })}
    <details class="v3-ayrinti"><summary>Bu kasa ne işe yarar?</summary><div>Oyundaki harcamalar, pazar harçları, arena girişleri ve NFT alımları bu ana hazinede toplanır; ödül olarak topluluğa geri dağıtılır.</div></details>
  </div>`;
}

// pools: gameState.getTreasuryVaultSummary().pools + her birine `gelirMetni` (örn. "her harcamadan %11 pay") eklenmiş
export function hazineKasalarHtml(pools) {
  return `<div class="v3-havuz-liste">
    <div class="v3-baslik-kucuk">💰 Ödül kasaları</div>
    ${pools.map((p) => `<div class="v3-havuz" style="--v3-havuz-renk:${esc(p.color)}">
      <div class="v3-havuz-ust"><span class="v3-havuz-simge" aria-hidden="true">${esc(p.icon)}</span>
        <div class="v3-havuz-ad"><b>${esc(p.name)}</b><small>${esc(p.statusBadge || '')}</small></div>
        <span class="v3-havuz-bakiye">${esc(f0(p.totalPoolAda))}<i>ASTRA</i></span></div>
      <div class="v3-havuz-kisisel">👤 ${esc(p.userShareText || '')}</div>
      <div class="v3-havuz-alt">
        <details class="v3-ayrinti"><summary>Bu kasa ne işe yarar?</summary><div>${esc(p.description || '')}${p.gelirMetni ? ` <strong>Gelir: ${esc(p.gelirMetni)}.</strong>` : ''}</div></details>
        <button class="btn-clean btn-treasury-action" data-action="${esc(p.actionType)}">${esc(p.actionText)} ➔</button>
      </div>
    </div>`).join('')}
  </div>`;
}
