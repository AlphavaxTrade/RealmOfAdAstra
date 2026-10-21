// Realm of AdAstra — Harita ortak parçaları: bölge konumları, canlı durum levhalarının kuralları ve etiket/kart katmanı.
// 3B vadi (js/vadi3d/vadi.js) ve 2B yedek harita (js/grandTownScene.js) AYNI veriyi ve kuralları kullanır; bölge durumu
// hesabı saf işlevdedir (tests/test_harita_ortak.mjs). Konumlar: px/py resim üzerindeki oran, pr tıklama yarıçapı (genişliğe oran).
import { gameState } from '../gameState.js';
import { ammMarket } from '../ammMarket.js';
import { GAME_CONFIG } from '../config.js';

// Konumlar — AdAstra Vadisi (v2, 7 Ekim 2026), harita resmi 2048×1143

export const TOWN_ZONES = [
  { id: 'dungeon',     icon: '💀', name: 'Zindan Mağarası',   sub: '18 seviyeli zindana in',                        px: 0.075, py: 0.540, pr: 0.065, color: '#a855f7' },
  { id: 'coalmine',    icon: '⚫', name: 'Kömür Ocağı',       sub: 'Kömür seferleri',                               px: 0.085, py: 0.215, pr: 0.055, color: '#64748b' },
  { id: 'mine',        icon: '⛏️', name: 'Demir Madeni',      sub: 'Demir seferleri',                               px: 0.165, py: 0.200, pr: 0.050, color: '#38bdf8' },
  { id: 'quarry',      icon: '🪨', name: 'Taş Ocağı',         sub: 'Taş seferleri',                                 px: 0.280, py: 0.165, pr: 0.055, color: '#a8a29e' },
  { id: 'forest',      icon: '🌲', name: 'Zümrüt Ormanı',     sub: 'Odun seferleri',                                px: 0.620, py: 0.160, pr: 0.090, color: '#4ade80' },
  { id: 'spaceport',   icon: '🚀', name: 'Roket Rampası',      sub: 'UOA roketi, Hazırlık Deposu, Gözlem Kulesi',  px: 0.870, py: 0.165, pr: 0.085, color: '#38bdf8' },
  { id: 'healer',      icon: '🌿', name: 'Şifahane',          sub: 'Şifalı otla asker iyileştirme',                 px: 0.285, py: 0.500, pr: 0.040, color: '#86efac' },
  { id: 'carnival',    icon: '🎪', name: 'Karnaval',          sub: 'Şans çarkı ve haftalık piyango',                px: 0.385, py: 0.420, pr: 0.050, color: '#ec4899' },
  { id: 'council',     icon: '🏛️', name: 'Sirius Konseyi',    sub: 'Kasalar, Otorite, projeler, ortak kasa',        px: 0.460, py: 0.305, pr: 0.045, color: '#a78bfa' },
  { id: 'blacksmith',  icon: '⚒️', name: 'Demirhane',         sub: 'Dövme, onarım, geri dönüşüm',                   px: 0.565, py: 0.350, pr: 0.045, color: '#fb923c' },
  { id: 'market',      icon: '🏪', name: 'Meydan Pazarı',     sub: 'Havuz pazarı: al ve sat',                       px: 0.500, py: 0.505, pr: 0.065, color: '#f43f5e' },
  { id: 'village',     icon: '🏘️', name: 'Köy Evleri',        sub: 'Köylüler, emek ve nüfus',                       px: 0.365, py: 0.600, pr: 0.055, color: '#fbbf24' },
  { id: 'tavern',      icon: '🍺', name: 'Taverna',           sub: 'Otomasyon botu ve rehber',                      px: 0.610, py: 0.630, pr: 0.040, color: '#eab308' },
  { id: 'colosseum',   icon: '🏟️', name: 'Kolezyum',          sub: 'Gladyatör düelloları',                          px: 0.690, py: 0.450, pr: 0.100, color: '#ef4444' },
  { id: 'farm',        icon: '🌾', name: 'Güneş Tarlası',     sub: 'Buğday seferleri',                              px: 0.925, py: 0.850, pr: 0.070, color: '#facc15' },
  { id: 'herbgarden',  icon: '🌿', name: 'Şifalı Ot Bahçesi', sub: 'Şifalı ot seferleri',                           px: 0.780, py: 0.710, pr: 0.045, color: '#86efac' },
  { id: 'warehouse',   icon: '📦', name: 'Silo',              sub: 'Ambar, envanter ve yükseltme',                  px: 0.870, py: 0.530, pr: 0.075, color: '#fbbf24' },   // iki tahıl kulesi + kırmızı ambar, sağda kolezyum ile tarla arasında (7 Ekim: yeni harita, ahırdan ayrı)
  { id: 'barracks',    icon: '⚔️', name: 'Kışla',             sub: 'Ordu, asker ve teçhizat',                       px: 0.620, py: 0.860, pr: 0.085, color: '#60a5fa' },   // alt ortadaki ahır + at eğitim alanı
  { id: 'battlefield', icon: '🚩', name: 'Savaş Alanı',       sub: 'Dünya Bossu cephesi',                           px: 0.200, py: 0.850, pr: 0.130, color: '#f87171' }
];

/** Üst çubuğun (HUD) altı: bölge kartı bunun üstüne taşmasın (kart HUD'un altında kalıp kırpılmasın) */
export function kartUstSiniri() {
  const h = document.getElementById('v3-hud');
  const alt = h ? h.getBoundingClientRect().bottom : 0;
  return Math.max(8, Math.ceil(alt) + 8);
}

// Hammadde bölgesi → hammadde anahtarı (config'ten, 6 bölge)
export function kaynakBolgeleri(config = GAME_CONFIG) {
  const anahtarlar = config.RESOURCE_KEYS || [];
  return Object.fromEntries(anahtarlar.map((k) => [((config.RESOURCE_META || {})[k] || {}).zone || k, k]));
}

// 12:05 ya da 1s 05d biçiminde kalan süre
export function sureYazisi(sn) {
  const s = Math.max(0, Math.ceil(sn));
  const sa = Math.floor(s / 3600);
  const dk = Math.floor((s % 3600) / 60);
  const sy = s % 60;
  if (sa > 0) return `${sa}s ${String(dk).padStart(2, '0')}d`;
  return `${String(dk).padStart(2, '0')}:${String(sy).padStart(2, '0')}`;
}

export function modalAcik() {
  const panel = document.getElementById('rpg-modal');
  const arena = document.getElementById('battle-arena-modal');
  return !!((panel && panel.classList.contains('active')) || (arena && arena.classList.contains('active')) || document.body.classList.contains('modal-open'));
}

// Her bölgenin levhasında yazan canlı durum: { [bölgeId]: { text, tone, locked } }. Saf: yalnız verilen oyun nesnelerini okur.
export function bolgeDurumlari(gs = gameState, pazar = ammMarket, config = GAME_CONFIG) {
  const st = gs.state;
  const sonuc = {};
  const yaz = (id, text, tone = '') => { sonuc[id] = { text, tone, locked: false }; };

  for (const [bolge, kaynak] of Object.entries(kaynakBolgeleri(config))) {
    const sefer = st.activeExpeditions && st.activeExpeditions[kaynak];
    if (!sefer) yaz(bolge, 'Boşta · sefer gönder', 'idle');
    else if (sefer.isCompleted) yaz(bolge, '✅ Hazır · topla', 'ready');
    else yaz(bolge, `⏳ ${sureYazisi(sefer.durationSeconds - sefer.elapsedSeconds)} · %${Math.min(100, Math.floor((sefer.elapsedSeconds / sefer.durationSeconds) * 100))}`, 'busy');
  }

  if (gs.isBotPaused()) yaz('tavern', '⏸️ Bot duraklatıldı', 'warn');
  else if (gs.hasPurchasedBot()) yaz('tavern', `🤖 Bot aktif · ${sureYazisi(gs.getAutoCollectorRemainingSeconds())}`, 'ready');
  else yaz('tavern', st.botTrialUsed ? 'Bot kapalı' : '🎁 Ücretsiz bot denemesi', st.botTrialUsed ? '' : 'gift');

  // Silo: en dolu hammaddenin doluluğu
  const kapasite = gs.getWarehouseCapacity();
  const envanter = st.inventory || {};
  const doluluk = Math.max(0, ...(config.RESOURCE_KEYS || []).map((r) => (Number(envanter[r]) || 0) / Math.max(1, kapasite[r] || 1)));
  yaz('warehouse', `Sv.${st.warehouseLevel || 1} · %${Math.round(doluluk * 100)} dolu`, doluluk >= 0.95 ? 'warn' : '');

  const askerler = st.soldierUnits || [];
  const yarali = askerler.filter((s) => s && s.hp < s.maxHp).length;
  yaz('barracks', askerler.length ? `${askerler.length} asker${yarali ? ` · ${yarali} yaralı` : ''}` : 'İlk askerini al', yarali ? 'warn' : '');

  const anahtarlar = config.RESOURCE_KEYS || [];
  const fiyatlar = ['wood', 'iron'].filter((k) => anahtarlar.includes(k)).map((k) => `${((config.RESOURCE_META || {})[k] || {}).icon || ''} ${pazar.getPrice(k).toFixed(2)}`);
  yaz('market', `${fiyatlar.join(' · ')} ASTRA`);

  if ((st.lotteryPendingPayout || 0) > 0) yaz('carnival', '🎟️ Piyango kazancın hazır!', 'gift');
  else yaz('carnival', `Çark · ${st.lotteryTickets || 0} bilet`);

  const sayac = typeof gs.getDailyCounters === 'function' ? gs.getDailyCounters() : { arenaMatches: 0 };
  const macSiniri = (config.COLOSSEUM && config.COLOSSEUM.DAILY_MATCH_CAP) || 10;
  yaz('colosseum', `Bugün ${Math.max(0, macSiniri - (sayac.arenaMatches || 0))} maç hakkı`);

  yaz('blacksmith', 'Dövme · onarım');
  yaz('dungeon', `Kat ${Math.ceil((st.dungeonProgress || 1) / 3)} · Sv.${st.dungeonProgress || 1}`);
  yaz('battlefield', st.worldBoss && st.worldBoss.userStaked ? '🔒 Ordun savaşta' : 'Dünya Bossu', st.worldBoss && st.worldBoss.claimableRewardAda > 0 ? 'gift' : '');

  const koy = gs.getVillageInfo ? gs.getVillageInfo() : null;
  if (koy) yaz('village', `${koy.villagers} köylü · ${koy.houses} ev`, koy.starving ? 'warn' : '');
  const roket = gs.getRocketStatus ? gs.getRocketStatus() : null;
  if (roket) yaz('spaceport', roket.ready ? '🚀 Roket hazır' : 'Roket görevi', roket.ready ? 'ready' : '');

  // Henüz açılmamış bölümler: kilit ve nasıl açılacağı
  for (const z of TOWN_ZONES) {
    const kilit = gs.getFeatureLock(z.id);
    if (!sonuc[z.id]) yaz(z.id, '');
    if (kilit) sonuc[z.id] = { text: `🔒 ${kilit.reason.replace(/ açılır[.]?$/, '')}`, tone: 'locked', locked: true };
  }
  return sonuc;
}

// Bölgeye tıklanınca olacak iş: kilitliyse bildirim, zindansa zindan görünümü, değilse bölge penceresi
export function bolgeyiAc(z, gs = gameState) {
  if (!gs.isFeatureUnlocked(z.id)) {
    window.dispatchEvent(new CustomEvent('feature-locked', { detail: { zoneId: z.id } }));
    return 'kilitli';
  }
  if (z.id === 'dungeon') {
    window.dispatchEvent(new CustomEvent('enter-dungeon-view'));
    return 'zindan';
  }
  window.dispatchEvent(new CustomEvent('open-town-modal', { detail: { zoneId: z.id, zoneName: `${z.icon} ${z.name.toLocaleUpperCase('tr-TR')}` } }));
  return 'pencere';
}

// ── Etiket ve bilgi kartı katmanı (iki harita da aynı DOM'u ve CSS'i kullanır) ──
// Döndürür: { labels: Map, card, hover, durumGuncelle(durumlar), kartiDoldur(zone | null) }
export function etiketKatmaniKur(kap, { onHover, onLeave, onOpen, bolgeler = TOWN_ZONES }) {
  let katman = kap.querySelector('#map-overlay');
  if (!katman) {
    katman = document.createElement('div');
    katman.id = 'map-overlay';
    katman.className = 'map-overlay';
    kap.appendChild(katman);
  }
  katman.classList.remove('is-hidden');
  katman.innerHTML = '';
  const etiketler = new Map();
  for (const z of bolgeler) {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = z.gec ? 'map-label is-kapi' : 'map-label';
    d.dataset.zone = z.id;
    d.style.setProperty('--zc', z.color);
    d.innerHTML = `<span class="ml-icon" aria-hidden="true">${z.icon}</span><span class="ml-body"><span class="ml-name">${z.name}</span><span class="ml-status" data-status></span></span>`;
    d.setAttribute('aria-label', `${z.name} — ${z.sub}`);
    d.addEventListener('mouseenter', () => onHover(z));
    d.addEventListener('mouseleave', () => onLeave(z));
    d.addEventListener('click', (ev) => { ev.stopPropagation(); if (!modalAcik()) onOpen(z); });
    katman.appendChild(d);
    etiketler.set(z.id, d);
  }

  const kart = document.createElement('div');
  kart.className = 'map-card';
  kart.id = 'map-hover-card';
  kart.setAttribute('role', 'tooltip');
  kart.innerHTML = `<div class="mc-head"><span class="mc-icon" aria-hidden="true"></span><span class="mc-titles"><span class="mc-name"></span><span class="mc-sub"></span></span></div>
    <div class="mc-status"><span class="mc-dot"></span><span class="mc-status-text"></span></div>
    <div class="mc-hint"><span class="mc-hint-text">Açmak için tıkla</span><span class="mc-hint-arrow" aria-hidden="true">→</span></div>`;
  katman.appendChild(kart);

  let durumlar = {};
  let hoverBolge = null;
  const api = {
    labels: etiketler,
    card: kart,
    get hover() { return hoverBolge; },
    // Etiketlerin durum satırlarını yazar; açık kartın durumu da eşitlenir
    durumGuncelle(yeni) {
      durumlar = yeni;
      for (const [id, d] of etiketler) {
        const bilgi = yeni[id] || { text: '', tone: '', locked: false };
        const s = d.querySelector('[data-status]');
        if (s && s.textContent !== bilgi.text) s.textContent = bilgi.text;
        d.dataset.tone = bilgi.tone;
        d.classList.toggle('is-locked', !!bilgi.locked);
      }
      if (hoverBolge) api.kartiDoldur(hoverBolge);
    },
    // zone null ise kart kapanır
    kartiDoldur(zone) {
      hoverBolge = zone;
      if (!zone) { kart.classList.remove('is-visible'); return false; }
      const bilgi = durumlar[zone.id] || { text: '', tone: '', locked: false };
      const kilitli = !!bilgi.locked || !gameState.isFeatureUnlocked(zone.id);
      kart.style.setProperty('--zc', zone.color);
      kart.querySelector('.mc-icon').textContent = zone.icon;
      kart.querySelector('.mc-name').textContent = zone.name;
      kart.querySelector('.mc-sub').textContent = zone.sub;
      kart.classList.toggle('is-locked', kilitli);
      kart.querySelector('.mc-hint-text').textContent = kilitli ? 'Henüz kilitli' : (zone.gec ? 'Gitmek için tıkla' : (zone.id === 'dungeon' ? 'Zindana inmek için tıkla' : 'Açmak için tıkla'));
      kart.querySelector('.mc-status-text').textContent = bilgi.text;
      kart.querySelector('.mc-status').hidden = !bilgi.text;
      kart.dataset.tone = bilgi.tone;
      kart.classList.add('is-visible');
      return true;
    }
  };
  return api;
}
