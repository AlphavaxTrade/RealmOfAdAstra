// Realm of AdAstra — Zindan sahnesi (Phaser): 6 kat, her katta 3 canavar odası ve bir sonraki kata geçit.
// Yerleşim ve kurallar js/ui/zindan-plan.js içindedir (saf, testli); bu dosya yalnızca çizer ve tıklamaları olaya çevirir.
// Dışarıyla konuşma (pencere olayları): 'switch-dungeon-floor' {floor}, 'monster-defeated' {level},
// 'open-monster-battle' {monster}, 'toast-notify' {message, type}. 'monster-defeated' zafer sonrası levhaları tazeler.
import Phaser from 'phaser';
import { gameState } from './gameState.js';
import {
  KATLAR, KAT_SAYISI, katCanavarlari, yerlestir, odaDurumu, kilitMesaji, odaEtiketi, odaIpucu
} from './ui/zindan-plan.js';

const UST_CUBUK_YUKSEKLIGI = 92;

function gorunumBoyutu() {
  return {
    w: window.innerWidth,
    h: (window.getStageSize ? window.getStageSize().h : Math.max(300, window.innerHeight - UST_CUBUK_YUKSEKLIGI))
  };
}

// Fare/parmak ipucu kutusu (index.html #realm-hover-tooltip)
const ipucu = {
  kutu: () => document.getElementById('realm-hover-tooltip'),
  goster(baslik, renk, alt, x, y) {
    const kutu = this.kutu();
    const b = document.getElementById('realm-tooltip-title');
    const a = document.getElementById('realm-tooltip-sub');
    if (!kutu || !b || !a) return;
    b.textContent = baslik;
    b.style.color = renk;
    a.textContent = alt;
    kutu.classList.remove('hidden');
    kutu.classList.add('visible');
    this.tasi(x, y);
  },
  tasi(x, y) {
    const kutu = this.kutu();
    if (!kutu || !kutu.classList.contains('visible')) return;
    kutu.style.left = `${Math.min(window.innerWidth - 130, Math.max(130, x))}px`;
    kutu.style.top = `${y - 45}px`;
  },
  gizle() {
    const kutu = this.kutu();
    if (!kutu) return;
    kutu.classList.remove('visible');
    kutu.classList.add('hidden');
  }
};

const bildir = (message, type) => window.dispatchEvent(new CustomEvent('toast-notify', { detail: { message, type } }));
const panelAcik = () => {
  const m = document.getElementById('rpg-modal');
  return !!(m && m.classList.contains('active'));
};

export class DungeonScene extends Phaser.Scene {
  constructor() {
    super({ key: 'DungeonScene' });
    this.sayfa = 1;
  }

  preload() {
    KATLAR.forEach((k) => this.load.image(k.doku, k.dosya));
  }

  create() {
    const katCubugu = document.getElementById('dungeon-floor-bar');
    if (katCubugu) katCubugu.classList.remove('hidden');

    this._kameraKilitle();
    this._sayfayiCiz();

    this._boyutDegisti = () => { this._kameraKilitle(); this._sayfayiCiz(); };
    this.scale.on('resize', this._boyutDegisti);

    // Kat çubuğundan ya da geçitten kat değişimi
    this._katDegisti = (e) => {
      const hedef = e.detail.floor;
      if (hedef >= 1 && hedef <= KAT_SAYISI && this.sayfa !== hedef) {
        this.sayfa = hedef;
        this._sayfayiCiz();
      }
    };
    window.addEventListener('switch-dungeon-floor', this._katDegisti);

    // Zafer sonrası ilerleme kural tarafından zaten işlenmiştir; levhalar yeni duruma göre yeniden çizilir
    this._canavarYenildi = () => this._sayfayiCiz();
    window.addEventListener('monster-defeated', this._canavarYenildi);

    this.events.once('shutdown', () => {
      if (katCubugu) katCubugu.classList.add('hidden');
      this.scale.off('resize', this._boyutDegisti);
      window.removeEventListener('switch-dungeon-floor', this._katDegisti);
      window.removeEventListener('monster-defeated', this._canavarYenildi);
      ipucu.gizle();
    });
  }

  // Kamera tek geniş ekrana kilitlidir (büyütme/kaydırma yok). NOT: burada scale.resize() ÇAĞRILMAZ: resize olayını
  // yeniden fırlatır, bu metod o olayın işleyicisi olduğundan sonsuz döngü ve kara ekran doğurur.
  _kameraKilitle() {
    this.cameras.main.setSize(window.innerWidth, window.innerHeight);
    this.cameras.main.setScroll(0, 0);
    this.cameras.main.setZoom(1);
  }

  _sayfayiCiz() {
    this.tweens.killAll();
    (this._bolgeler || []).forEach((z) => {
      try { z.disableInteractive(); z.removeAllListeners(); z.destroy(); } catch (_) { /* bölge zaten yok edilmiş: sahne kapanırken beklenen durum */ }
    });
    this._bolgeler = [];
    this.children.removeAll(true);
    this._katiKur(this.sayfa);

    document.querySelectorAll('.floor-tab').forEach((t) => {
      t.classList.toggle('active', parseInt(t.dataset.floor, 10) === this.sayfa);
    });
    window.dispatchEvent(new CustomEvent('switch-dungeon-floor', { detail: { floor: this.sayfa } }));
  }

  _katiKur(kat) {
    const plan = KATLAR[kat - 1];
    if (!plan) return;
    const { w, h } = gorunumBoyutu();

    const harita = this.add.image(0, 0, plan.doku).setOrigin(0, 0);
    harita.setDisplaySize(w, h);

    katCanavarlari(kat).forEach((canavar, sira) => {
      this._odaKur({ ...canavar, id: `monster_lv${canavar.level}` }, sira, yerlestir(plan.odalar[sira], w, h));
    });
    plan.gecitler.forEach((g) => this._gecitKur(yerlestir(g, w, h), kat + 1));
  }

  // ── bir canavar odası: levha, etiket ve tıklama alanı ──
  _odaKur(canavar, sira, yer) {
    const ilerleme = gameState.state.dungeonProgress || 1;
    const durum = odaDurumu(canavar.level, ilerleme);
    const vurgu = durum.kilitli ? 0x64748b : (durum.yenildi ? 0x4ade80 : 0xfde047);
    this.add.rectangle(yer.x, yer.y, yer.bw, yer.bh, 0x0b0f17, 0.97).setStrokeStyle(2, vurgu, 0.95).setDepth(5);
    const boy = Math.max(11, Math.min(17, Math.round(yer.bw * 0.075)));
    const yaziAilesi = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const etiket = this.add.text(yer.x, yer.y, odaEtiketi(canavar, durum), {
      fontFamily: yaziAilesi, fontSize: `${boy}px`, color: durum.kilitli ? '#cbd5e1' : '#f8fafc', align: 'center',
      fontStyle: '700', lineSpacing: 2, wordWrap: { width: Math.max(40, yer.bw - 14) }
    }).setOrigin(0.5).setDepth(6);
    // Küçük levhada metin taşarsa yazı küçülür (adı iki satıra düşen canavarlar)
    let fs = boy;
    while (etiket.height > yer.bh - 6 && fs > 8) { fs -= 1; etiket.setFontSize(`${fs}px`); }

    const alan = this._alan(yer);
    alan.on('pointerover', (p) => {
      const g = odaDurumu(canavar.level, gameState.state.dungeonProgress || 1);
      const bilgi = odaIpucu(canavar, sira, g, gameState.state.dungeonProgress || 1);
      ipucu.goster(bilgi.baslik, bilgi.renk, bilgi.alt, p.x, p.y + this._tuvalUstu());
    });
    alan.on('pointermove', (p) => ipucu.tasi(p.x, p.y + this._tuvalUstu()));
    alan.on('pointerout', () => { ipucu.gizle(); this._imlec('default'); });
    alan.on('pointerup', () => {
      ipucu.gizle();
      if (panelAcik()) return;
      const simdiki = gameState.state.dungeonProgress || 1;
      if (canavar.level > simdiki) { bildir(kilitMesaji(simdiki, canavar), 'error'); return; }
      window.dispatchEvent(new CustomEvent('open-monster-battle', { detail: { monster: canavar } }));
    });
  }

  // ── sonraki kata geçit ──
  _gecitKur(yer, hedefKat) {
    if (hedefKat > KAT_SAYISI) return;
    this.add.rectangle(yer.x, yer.y, yer.bw, yer.bh, 0x1a1030, 0.97).setStrokeStyle(2, 0xc084fc, 0.95).setDepth(5);
    const boy = Math.max(10, Math.min(15, Math.round(yer.bw * 0.11)));
    this.add.text(yer.x, yer.y, `🌀 ${hedefKat}. Kat`, {
      fontFamily: getComputedStyle(document.body).fontFamily || 'sans-serif', fontSize: `${boy}px`, color: '#e9d5ff',
      fontStyle: '700', align: 'center', wordWrap: { width: Math.max(30, yer.bw - 8) }
    }).setOrigin(0.5).setDepth(6);

    const alan = this._alan(yer);
    alan.on('pointerover', (p) => ipucu.goster(`🌀 ${hedefKat}. KAT GEÇİDİ`, '#c084fc', 'Tıkla ve sonraki kata ışınlan', p.x, p.y + this._tuvalUstu()));
    alan.on('pointermove', (p) => ipucu.tasi(p.x, p.y + this._tuvalUstu()));
    alan.on('pointerout', () => { ipucu.gizle(); this._imlec('default'); });
    alan.on('pointerup', () => {
      ipucu.gizle();
      this._imlec('default');
      if (panelAcik()) return;
      window.dispatchEvent(new CustomEvent('switch-dungeon-floor', { detail: { floor: hedefKat } }));
      bildir(`🌀 ${hedefKat}. Kata ışınlanıldı!`, 'success');
    });
  }

  // Şeffaf tıklama alanı: levhanın üstüne tam oturur
  _alan(yer) {
    const alan = this.add.rectangle(yer.x, yer.y, yer.bw, yer.bh, 0x000000, 0.001).setInteractive({ cursor: 'pointer', useHandCursor: true });
    alan.on('pointerover', () => this._imlec('pointer'));
    this._bolgeler.push(alan);
    return alan;
  }

  _imlec(tur) {
    if (this.input) this.input.setDefaultCursor(tur);
    if (this.game && this.game.canvas) this.game.canvas.style.cursor = tur;
  }

  _tuvalUstu() {
    return (this.game && this.game.canvas) ? this.game.canvas.getBoundingClientRect().top : UST_CUBUK_YUKSEKLIGI;
  }
}
