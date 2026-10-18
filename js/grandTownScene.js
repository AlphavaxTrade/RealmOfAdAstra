// Realm of AdAstra — 2B yedek harita (Phaser): ?harita=2d ile açılır, 3B vadi yüklenemezse otomatik devreye girer.
// Bölge verisi ve canlı durum kuralları js/ui/harita-ortak.js'tedir (3B harita ile ORTAK); burada yalnız 2B kamera
// (oranı bozmadan doldurma, sürükle, tekerlek/iki parmak yakınlaştırma) ve etiketlerin ekrana yerleşimi vardır.
import Phaser from 'phaser';
import { TOWN_ZONES, bolgeDurumlari, bolgeyiAc, etiketKatmaniKur, modalAcik, kartUstSiniri } from './ui/harita-ortak.js';

export { TOWN_ZONES };

const RESIM_W = 2048;
const RESIM_H = 1143;
const EN_AZ_YAKIN = 1;
const EN_COK_YAKIN = 2.2;
const DURUM_ARALIGI_MS = 500;

export class GrandTownScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GrandTownScene' });
    this.hoverZone = null;
    this.durumSayaci = 0;
  }

  preload() {
    // Harita resmi 560 KB'tır (webp; eski jpg 949 KB'tı, denetim QA-17). Eskiden "?v=Date.now()" her açılışta yeniden indiriyordu:
    // sabit sürüm eki tarayıcı önbelleğinin (sunucuda 1 gün) çalışmasını sağlar. Resim değişince bu sürüm yazısı değiştirilir.
    this.load.image('grand_town_map', 'assets/adastra_vadisi.webp?v=20261018');
    this.load.on('progress', (deger) => { if (window.__updateLoadingBar) window.__updateLoadingBar(30 + deger * 60); });
    this.load.on('loaderror', (dosya) => console.error('[Phaser] Yüklenemedi:', dosya.key, dosya.src));
  }

  create() {
    if (window.__finishLoadingBar) window.__finishLoadingBar();

    this.harita = this.textures.exists('grand_town_map')
      ? this.add.image(0, 0, 'grand_town_map').setOrigin(0, 0)
      : this.add.rectangle(0, 0, RESIM_W, RESIM_H, 0x1a2a14).setOrigin(0, 0);
    this.harita.setDepth(0);

    this._yerlesim(true);
    this._katmanKur();
    this._girisBagla();

    this._boyutDegisti = () => this._yerlesim(false);
    this.scale.on('resize', this._boyutDegisti);

    window.realmMap = { flyTo: (zoneId, opts = {}) => this.flyTo(zoneId, opts), zones: TOWN_ZONES, mode: '2d' };

    this.events.once('shutdown', () => {
      this.scale.off('resize', this._boyutDegisti);
      const katman = document.getElementById('map-overlay');
      if (katman) katman.classList.add('is-hidden');
      if (window.realmMap) window.realmMap.flyTo = () => {};
    });

    this._durumlariYenile();
  }

  // ── Yerleşim: oranı bozmadan doldur, dünya sınırları, kamera ──
  _yerlesim(ilk) {
    const ebeveyn = this.game.canvas && this.game.canvas.parentElement;
    const w = (ebeveyn && ebeveyn.clientWidth) || window.innerWidth;
    const h = (ebeveyn && ebeveyn.clientHeight) || window.innerHeight;
    try {
      if (this.scale.width !== w || this.scale.height !== h) this.scale.resize(w, h);
    } catch (e) { /* yoksay */ }

    const kam = this.cameras.main;
    const oncekiMerkez = (!ilk && this.olcek)
      ? { x: kam.worldView.centerX / this.olcek, y: kam.worldView.centerY / this.olcek }
      : { x: 1000, y: 600 };   // ilk açılış: kale meydanı
    const oncekiYakin = ilk ? 1 : kam.zoom;

    this.olcek = Math.max(w / RESIM_W, h / RESIM_H);
    this.dunyaW = RESIM_W * this.olcek;
    this.dunyaH = RESIM_H * this.olcek;
    this.harita.setScale(this.olcek);
    kam.setSize(w, h);
    kam.setBounds(0, 0, this.dunyaW, this.dunyaH);
    kam.setZoom(Phaser.Math.Clamp(oncekiYakin, EN_AZ_YAKIN, EN_COK_YAKIN));
    kam.centerOn(oncekiMerkez.x * this.olcek, oncekiMerkez.y * this.olcek);
  }

  _bolgeDunya(z) {
    return { x: z.px * this.dunyaW, y: z.py * this.dunyaH, r: Math.min(z.pr * this.dunyaW, 170 * this.olcek) };
  }

  _bolgeEkranda(sx, sy) {
    const nokta = this.cameras.main.getWorldPoint(sx, sy);
    let enIyi = null;
    let enYakin = Infinity;
    for (const z of TOWN_ZONES) {
      const c = this._bolgeDunya(z);
      const d = Math.hypot(nokta.x - c.x, nokta.y - c.y);
      if (d <= c.r && d < enYakin) { enIyi = z; enYakin = d; }
    }
    return enIyi;
  }

  // ── Giriş: sürükle, tıkla, yakınlaştır ──
  _girisBagla() {
    this.input.addPointer(1);
    const kam = this.cameras.main;
    let basili = null;
    let cimdik = null;

    this.input.on('pointerdown', (p) => {
      if (modalAcik()) return;
      basili = { x: p.x, y: p.y, sx: kam.scrollX, sy: kam.scrollY, surukleniyor: false };
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (p1 && p2 && p1.isDown && p2.isDown) cimdik = { d: Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y), z: kam.zoom };
    });

    this.input.on('pointermove', (p) => {
      if (modalAcik()) { this._hover(null); return; }
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (cimdik && p1 && p2 && p1.isDown && p2.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        this._yakinlastir((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, cimdik.z * (d / Math.max(1, cimdik.d)));
        if (basili) basili.surukleniyor = true;
        return;
      }
      if (basili && p.isDown) {
        const dx = p.x - basili.x;
        const dy = p.y - basili.y;
        if (!basili.surukleniyor && Math.hypot(dx, dy) > 6) basili.surukleniyor = true;
        if (basili.surukleniyor) {
          kam.scrollX = basili.sx - dx / kam.zoom;
          kam.scrollY = basili.sy - dy / kam.zoom;
          this._hover(null);
          if (this.game.canvas) this.game.canvas.style.cursor = 'grabbing';
          return;
        }
      }
      this._hover(this._bolgeEkranda(p.x, p.y));
    });

    this.input.on('pointerup', (p) => {
      const onceki = basili;
      basili = null;
      if (!this.input.pointer2 || !this.input.pointer2.isDown) cimdik = null;
      if (this.game.canvas) this.game.canvas.style.cursor = this.hoverZone ? 'pointer' : 'grab';
      if (!onceki || onceki.surukleniyor || modalAcik()) return;
      const z = this._bolgeEkranda(p.x, p.y);
      if (z) this._ac(z);
    });

    this.input.on('wheel', (p, _nesneler, _dx, dy) => {
      if (modalAcik()) return;
      this._yakinlastir(p.x, p.y, kam.zoom * (dy > 0 ? 0.9 : 1.1));
    });
    this.input.on('gameout', () => this._hover(null));
    if (this.game.canvas) this.game.canvas.style.cursor = 'grab';
  }

  _yakinlastir(sx, sy, hedef) {
    const kam = this.cameras.main;
    const once = kam.getWorldPoint(sx, sy);
    kam.setZoom(Phaser.Math.Clamp(hedef, EN_AZ_YAKIN, EN_COK_YAKIN));
    const sonra = kam.getWorldPoint(sx, sy);
    kam.scrollX += once.x - sonra.x;
    kam.scrollY += once.y - sonra.y;
  }

  _hover(zone) {
    if (this.hoverZone === zone) return;
    if (this.hoverZone) this.katman.labels.get(this.hoverZone.id)?.classList.remove('is-hover');
    this.hoverZone = zone;
    if (zone) this.katman.labels.get(zone.id)?.classList.add('is-hover');
    this.kartBoyu = null;
    if (this.katman.kartiDoldur(zone)) this._kartiKonumla();
    if (this.game.canvas) this.game.canvas.style.cursor = zone ? 'pointer' : 'grab';
  }

  _ac(z) {
    bolgeyiAc(z);   // zindan: 'enter-dungeon-view' olayı zindan ekranını açar ve bu sahneyi durdurur
  }

  // Konuma uç, sonra aç
  flyTo(zoneId, { open = false } = {}) {
    const z = TOWN_ZONES.find((x) => x.id === zoneId);
    if (!z) return;
    const c = this._bolgeDunya(z);
    const kam = this.cameras.main;
    kam.pan(c.x, c.y, 550, 'Sine.easeInOut', true);
    kam.zoomTo(Math.max(kam.zoom, 1.35), 550, 'Sine.easeInOut', true);
    this._hover(z);
    if (open) this.time.delayedCall(600, () => { this._hover(null); this._ac(z); });
  }

  // ── Etiketler ve bilgi kartı ──
  _katmanKur() {
    const kap = document.getElementById('phaser-game-container');
    if (!kap) { this.katman = { labels: new Map(), card: null, kartiDoldur: () => false, durumGuncelle() {} }; return; }
    this.katman = etiketKatmaniKur(kap, {
      onHover: (z) => this._hover(z),
      onLeave: (z) => { if (this.hoverZone === z) this._hover(null); },
      onOpen: (z) => this._ac(z)
    });
  }

  _etiketleriKonumla() {
    const kam = this.cameras.main;
    const gorus = kam.worldView;
    const dar = kam.width < 720;
    for (const z of TOWN_ZONES) {
      const el = this.katman.labels.get(z.id);
      if (!el) continue;
      const c = this._bolgeDunya(z);
      const sx = (c.x - gorus.x) * kam.zoom;
      const sy = (c.y - c.r * 0.55 - gorus.y) * kam.zoom;
      const gorunur = sx > -80 && sx < kam.width + 80 && sy > -40 && sy < kam.height + 60;
      el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
      el.classList.toggle('is-offscreen', !gorunur);
      el.classList.toggle('is-compact', dar);
    }
  }

  _kartiKonumla() {
    const kart = this.katman.card;
    if (!kart || !this.hoverZone) return;
    const kam = this.cameras.main;
    const gorus = kam.worldView;
    const c = this._bolgeDunya(this.hoverZone);
    const ax = (c.x - gorus.x) * kam.zoom;
    const ust = (c.y - c.r * 0.55 - gorus.y) * kam.zoom;
    const alt = (c.y + c.r * 0.45 - gorus.y) * kam.zoom;
    if (!this.kartBoyu) this.kartBoyu = { w: kart.offsetWidth || 270, h: kart.offsetHeight || 120 };
    const { w, h } = this.kartBoyu;
    const bosluk = 14;
    const ustSinir = kartUstSiniri();
    const asagida = ust - h - bosluk < ustSinir;
    const y = asagida ? Math.min(alt + bosluk, kam.height - h - 8) : ust - h - bosluk;
    const sol = Math.max(8, Math.min(kam.width - w - 8, ax - w / 2));
    kart.classList.toggle('is-below', asagida);
    kart.style.setProperty('--arrow-x', `${Math.max(18, Math.min(w - 18, ax - sol)).toFixed(0)}px`);
    kart.style.transform = `translate(${sol.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  _durumlariYenile() {
    this.katman.durumGuncelle(bolgeDurumlari());
    this.kartBoyu = null;   // durum metni değişince kart boyu yeniden ölçülür
  }

  update(zaman, fark) {
    if (this.hoverZone && modalAcik()) this._hover(null);
    this._kartiKonumla();
    this._etiketleriKonumla();
    this.durumSayaci += fark;
    if (this.durumSayaci >= DURUM_ARALIGI_MS) {
      this.durumSayaci = 0;
      this._durumlariYenile();
    }
  }
}
