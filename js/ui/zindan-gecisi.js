// Realm of AdAstra — zindana giriş / kasabaya dönüş ve zindan kat çubuğundaki canlı ganimet şansı rozetleri.
// Şans hesabı saf (ganimetSanslari); sahne geçişi ve rozet yazımı kurZindanGecisi içinde.

const BOSS_KATLARI = [3, 6];
const BOSS_CARPANI = 2;

/**
 * Bir katta parça ve Pandora kutusu düşme şansı. Boss katlarında şans iki katıdır.
 * @param {{getFragmentDropRate: Function, getBoxDropRate: Function, formatDropChance: Function}} gs
 */
export function ganimetSanslari(gs, seviye, kat) {
  const boss = BOSS_KATLARI.includes(kat);
  const carpan = boss ? BOSS_CARPANI : 1;
  const parcaTaban = gs.getFragmentDropRate(seviye);
  const kutuTaban = gs.getBoxDropRate(seviye);
  const parca = parcaTaban * carpan;
  const kutu = kutuTaban * carpan;
  return {
    boss,
    parca: { taban: parcaTaban, etkin: parca, metin: gs.formatDropChance(parca) },
    kutu: { taban: kutuTaban, etkin: kutu, metin: gs.formatDropChance(kutu) }
  };
}

const yuzde = (oran, basamak) => `%${(oran * 100).toFixed(basamak)}`;

/**
 * @param {object} o
 * @param {object} o.gs
 * @param {() => ({scene: any}|null)} o.phaser        Phaser oyunu (henüz açılmadıysa null)
 * @param {() => void} o.panelKapat
 * @param {(m: string, t?: string) => void} o.bildir
 */
export function kurZindanGecisi({ gs, phaser, panelKapat, bildir }) {
  const $ = (id) => document.getElementById(id);
  let aktifKat = 1;

  function oranlariYaz(kat) {
    if (typeof kat === 'number' && kat >= 1 && kat <= 6) {
      aktifKat = kat;
    } else {
      const sekme = document.querySelector('.floor-tab.active');
      if (sekme && sekme.dataset.floor) aktifKat = parseInt(sekme.dataset.floor, 10) || 1;
    }
    const parcaEl = $('dungeon-hud-frag-val');
    const kutuEl = $('dungeon-hud-box-val');
    if (!parcaEl || !kutuEl) return;

    const seviye = gs.state.level || 1;
    const s = ganimetSanslari(gs, seviye, aktifKat);
    parcaEl.textContent = s.boss ? `${s.parca.metin} 🔥 2x` : s.parca.metin;
    kutuEl.textContent = s.boss ? `${s.kutu.metin} 🔥 2x` : s.kutu.metin;

    const parcaRozet = $('dungeon-badge-frag');
    const kutuRozet = $('dungeon-badge-box');
    if (parcaRozet) {
      parcaRozet.classList.toggle('boss-active', s.boss);
      parcaRozet.title = s.boss
        ? `Boss katı şansı (+%100 artış): ${yuzde(s.parca.taban, 3)} ➜ ${yuzde(s.parca.etkin, 3)}`
        : `Zindan parça düşürme şansı: ${s.parca.metin} (Lv.${seviye})`;
    }
    if (kutuRozet) {
      kutuRozet.classList.toggle('boss-active', s.boss);
      kutuRozet.title = s.boss
        ? `Boss katı şansı (+%100 artış): ${yuzde(s.kutu.taban, 5)} ➜ ${yuzde(s.kutu.etkin, 5)}`
        : `Zindan Pandora kutusu düşürme şansı: ${s.kutu.metin} (Lv.${seviye})`;
    }
  }

  // Zindan kapısı: kilitliyse nedeni söylenir ve açılmaz
  function kapiAcikMi(bolge) {
    const kilit = gs.getFeatureLock(bolge);
    if (!kilit) return true;
    bildir(`🔒 ${kilit.name} henüz kapalı: ${kilit.reason}`, 'info');
    return false;
  }

  function gir() {
    if (!kapiAcikMi('dungeon')) return;
    panelKapat();
    const oyun = phaser();
    if (!(oyun && oyun.scene)) return;
    if (oyun.scene.isActive('GrandTownScene')) oyun.scene.stop('GrandTownScene');
    if (window.__vadi3d) window.__vadi3d.hide();   // 3B vadi gizlenir, zindan (Phaser) görünür
    oyun.scene.start('DungeonScene');

    // Kat çubuğu açılır (v3 üst/alt çubukları zindanda CSS ile gizlenir)
    document.body.classList.add('in-dungeon');
    const katCubugu = $('dungeon-floor-bar');
    if (katCubugu) katCubugu.classList.remove('hidden');
    oranlariYaz(aktifKat);
  }

  function don() {
    const oyun = phaser();
    if (!(oyun && oyun.scene)) return;
    if (oyun.scene.isActive('DungeonScene')) oyun.scene.stop('DungeonScene');
    if (window.__vadi3d) window.__vadi3d.show();
    else oyun.scene.start('GrandTownScene');

    document.body.classList.remove('in-dungeon');
    const katCubugu = $('dungeon-floor-bar');
    if (katCubugu) katCubugu.classList.add('hidden');
    bildir('🏰 Kasaba meydanına dönüldü!', 'info');
  }

  /** Kat çubuğundaki düğmeleri ve sahnenin kat değişimi olayını bağlar. */
  function baglaKatCubugu() {
    const donDugme = $('btn-dungeon-return-town');
    if (donDugme) donDugme.addEventListener('click', don);
    document.querySelectorAll('.floor-tab').forEach((sekme) => {
      sekme.addEventListener('click', () => {
        const kat = parseInt(sekme.dataset.floor, 10);
        document.querySelectorAll('.floor-tab').forEach((t) => t.classList.remove('active'));
        sekme.classList.add('active');
        oranlariYaz(kat);
        window.dispatchEvent(new CustomEvent('switch-dungeon-floor', { detail: { floor: kat } }));
      });
    });
    window.addEventListener('switch-dungeon-floor', (e) => {
      if (e.detail && typeof e.detail.floor === 'number') oranlariYaz(e.detail.floor);
    });
    window.addEventListener('enter-dungeon-view', gir);
    window.addEventListener('feature-locked', (e) => kapiAcikMi(e.detail && e.detail.zoneId));
  }

  return { gir, don, oranlariYaz, kapiAcikMi, baglaKatCubugu };
}
