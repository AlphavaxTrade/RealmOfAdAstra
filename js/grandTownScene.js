// Realm of AdAstra — 2B harita (Phaser): ana harita + kapılardan geçilen alt haritalar (şehir, madenler, kışla bölgesi).
// Sahne verisi js/ui/sahneler.js'te, bölge bilgisi ve canlı durum kuralları js/ui/harita-ortak.js'te (3B vadi ile ORTAK);
// burada yalnız 2B kamera (oranı bozmadan doldurma, sürükle, tekerlek/iki parmak yakınlaştırma), etiketlerin ekrana yerleşimi
// ve sahne değiştirme (bulut perdesi js/ui/gecis.js) vardır. Tek Phaser sahnesi çalışır; alt haritaya geçince resim ve bölgeler değişir.
import Phaser from 'phaser';
import { bolgeDurumlari, bolgeyiAc, etiketKatmaniKur, modalAcik, kartUstSiniri } from './ui/harita-ortak.js';
import { SAHNELER, ANA_SAHNE, sahneBolgeleri, bolgeSahnesi, kapiDurumlari } from './ui/sahneler.js';
import { gecisYap } from './ui/gecis.js';

const YEDEK_W = 2048;
const YEDEK_H = 1143;
const EN_AZ_YAKIN = 1;
const EN_COK_YAKIN = 2.2;
const DURUM_ARALIGI_MS = 500;
const RESIM_ZAMAN_ASIMI_MS = 20000;

// Hangi sahnede olunduğu: Phaser sahnesi yeniden başlatılsa da (zindandan dönüş) kaldığı yerden açılır
let aktifSahne = ANA_SAHNE;
const sahneAnahtari = (id) => `sahne_${id}`;

export class GrandTownScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GrandTownScene' });
    this.hoverZone = null;
    this.durumSayaci = 0;
    this.durumlar = {};
    this._geciste = false;
  }

  preload() {
    // Sahne resimleri webp'tir; sabit sürüm eki tarayıcı önbelleğinin (sunucuda 1 gün) çalışmasını sağlar (js/ui/sahneler.js'teki ?v=).
    // Yalnız açılacak sahnenin resmi yüklenir; diğerleri kapıdan geçilirken (perde kapalıyken) yüklenir.
    this.load.image(sahneAnahtari(aktifSahne), SAHNELER[aktifSahne].resim);
    this.load.on('progress', (deger) => { if (window.__updateLoadingBar) window.__updateLoadingBar(30 + deger * 60); });
    this.load.on('loaderror', (dosya) => console.error('[Phaser] Yüklenemedi:', dosya.key, dosya.src));
  }

  create() {
    if (window.__finishLoadingBar) window.__finishLoadingBar();

    this.sahneId = aktifSahne;
    this.bolgeler = sahneBolgeleri(this.sahneId);
    this._haritaKur(this.sahneId);

    this._yerlesim(true);
    this._katmanKur();
    this._sahneArayuzuKur();
    this._girisBagla();

    this._boyutDegisti = () => this._yerlesim(false);
    this.scale.on('resize', this._boyutDegisti);

    const sahne = this;
    window.realmMap = {
      flyTo: (zoneId, opts = {}) => this.flyTo(zoneId, opts),
      sahneyeGec: (id) => this.sahneyeGec(id),
      anaHaritayaDon: () => this.anaHaritayaDon(),
      get zones() { return sahne.bolgeler; },
      get sahne() { return aktifSahne; },
      // Ölçüm bilgisi (tarayıcı denemeleri için): resim boyutu, ölçek, kamera yakınlığı
      bilgi: () => ({ sahne: aktifSahne, resimW: sahne.resimW, resimH: sahne.resimH, olcek: sahne.olcek, haritaOlcek: sahne.harita.scaleX, zoom: sahne.cameras.main.zoom, kamW: sahne.cameras.main.width, kamH: sahne.cameras.main.height }),
      mode: '2d'
    };

    this.events.once('shutdown', () => {
      this.scale.off('resize', this._boyutDegisti);
      const katman = document.getElementById('map-overlay');
      if (katman) katman.classList.add('is-hidden');
      const bar = document.getElementById('sahne-bar');
      if (bar) bar.hidden = true;
      if (window.realmMap) { window.realmMap.flyTo = () => {}; window.realmMap.anaHaritayaDon = () => false; window.realmMap.sahneyeGec = () => false; }
    });

    this._durumlariYenile();
  }

  // Arka plan resmi: sahnenin dokusu yoksa düz renkli yedek
  _haritaKur(id) {
    if (this.harita) this.harita.destroy();
    const anahtar = sahneAnahtari(id);
    this.harita = this.textures.exists(anahtar)
      ? this.add.image(0, 0, anahtar).setOrigin(0, 0)
      : this.add.rectangle(0, 0, YEDEK_W, YEDEK_H, 0x1a2a14).setOrigin(0, 0);
    this.harita.setDepth(0);
    this.resimW = this.harita.width || YEDEK_W;
    this.resimH = this.harita.height || YEDEK_H;
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
    const merkez = SAHNELER[this.sahneId].merkez;
    const oncekiMerkez = (!ilk && this.olcek)
      ? { x: kam.worldView.centerX / this.olcek, y: kam.worldView.centerY / this.olcek }
      : { x: merkez.x * this.resimW, y: merkez.y * this.resimH };   // ilk açılış: sahnenin merkez noktası
    const oncekiYakin = ilk ? 1 : kam.zoom;

    this.olcek = Math.max(w / this.resimW, h / this.resimH);
    this.dunyaW = this.resimW * this.olcek;
    this.dunyaH = this.resimH * this.olcek;
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
    for (const z of this.bolgeler) {
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

  // Bir yere tıklanınca: kapıysa sahne değişir, zindansa perdeyle zindan ekranı, değilse bölge penceresi
  _ac(z) {
    if (this._geciste) return;
    if (z.gec) {
      const d = this.durumlar[z.id];
      if (d && d.locked) {
        // Kapının içindeki her yer kilitli: ilkinin kilit nedeni (kısa mesaj) gösterilir
        const ilk = SAHNELER[z.gec].yerler.find((y) => y.id);
        if (ilk) window.dispatchEvent(new CustomEvent('feature-locked', { detail: { zoneId: ilk.id } }));
        return;
      }
      this.sahneyeGec(z.gec);
      return;
    }
    bolgeyiAc(z);   // zindan: 'enter-dungeon-view' olayı zindan ekranını açar ve bu sahneyi durdurur (dönünce zindan haritası açılır)
  }

  // ── Sahne değiştirme ──
  // Dönüş: geçildiyse true. Perde kapalıyken yeni sahnenin resmi yüklenir; yüklenemezse eski sahnede kalınır ve oyuncuya söylenir.
  async sahneyeGec(id) {
    if (this._geciste || !SAHNELER[id] || id === this.sahneId) return false;
    this._geciste = true;
    this._hover(null);
    try {
      await gecisYap(async () => {
        await this._resimYukle(id);
        this._sahneUygula(id);
      });
      return true;
    } catch (hata) {
      console.error('[Harita] Sahne açılamadı:', id, hata);
      window.dispatchEvent(new CustomEvent('toast-notify', { detail: { message: 'Bölge yüklenemedi, bağlantını kontrol edip tekrar dene.', type: 'error' } }));
      return false;
    } finally {
      this._geciste = false;
    }
  }

  anaHaritayaDon() {
    if (this.sahneId === ANA_SAHNE) return false;
    this.sahneyeGec(ANA_SAHNE);
    return true;
  }

  _resimYukle(id) {
    const anahtar = sahneAnahtari(id);
    if (this.textures.exists(anahtar)) return Promise.resolve();
    return new Promise((coz, red) => {
      let zamanAsimi = null;
      const temizle = () => { clearTimeout(zamanAsimi); this.load.off('loaderror', hata); this.load.off('complete', bitti); };
      const hata = (dosya) => { if (dosya.key === anahtar) { temizle(); red(new Error(`Resim yüklenemedi: ${dosya.src}`)); } };
      const bitti = () => { temizle(); if (this.textures.exists(anahtar)) coz(); else red(new Error('Resim dokusu oluşmadı')); };
      zamanAsimi = setTimeout(() => { temizle(); red(new Error('Resim yükleme zaman aşımı')); }, RESIM_ZAMAN_ASIMI_MS);
      this.load.on('loaderror', hata);
      this.load.once('complete', bitti);
      this.load.image(anahtar, SAHNELER[id].resim);
      this.load.start();
    });
  }

  _sahneUygula(id) {
    aktifSahne = id;
    this.sahneId = id;
    this.bolgeler = sahneBolgeleri(id);
    this.hoverZone = null;
    this._haritaKur(id);
    this._yerlesim(true);
    this._katmanKur();
    this._sahneArayuzuKur();
    this._durumlariYenile();
  }

  // Alt haritada: "‹ Ana harita" düğmesi ve sahne adı
  _sahneArayuzuKur() {
    const kap = document.getElementById('phaser-game-container');
    if (!kap) return;
    let bar = document.getElementById('sahne-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'sahne-bar';
      bar.className = 'sahne-bar';
      bar.innerHTML = '<button type="button" class="sahne-geri" aria-label="Ana haritaya dön"><span aria-hidden="true">‹</span> Ana harita</button><span class="sahne-baslik"></span>';
      bar.querySelector('.sahne-geri').addEventListener('click', (e) => { e.stopPropagation(); window.realmMap?.anaHaritayaDon?.(); });
      kap.appendChild(bar);
    }
    bar.querySelector('.sahne-baslik').textContent = SAHNELER[this.sahneId].ad;
    bar.hidden = this.sahneId === ANA_SAHNE;
    kap.dataset.sahne = this.sahneId;
  }

  // Konuma uç, sonra aç. Bölge başka sahnedeyse önce o sahneye geçilir.
  flyTo(zoneId, opts = {}) {
    const hedef = bolgeSahnesi(zoneId, this.sahneId);
    if (hedef && hedef !== this.sahneId) {
      this.sahneyeGec(hedef).then((tamam) => { if (tamam) this._uc(zoneId, opts); });
      return;
    }
    this._uc(zoneId, opts);
  }

  _uc(zoneId, { open = false } = {}) {
    const z = this.bolgeler.find((x) => x.id === zoneId);
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
      bolgeler: this.bolgeler,
      onHover: (z) => this._hover(z),
      onLeave: (z) => { if (this.hoverZone === z) this._hover(null); },
      onOpen: (z) => this._ac(z)
    });
    const katman = document.getElementById('map-overlay');
    if (katman) { katman.classList.add('has-sahne'); katman.dataset.sahne = this.sahneId; }
  }

  _etiketleriKonumla() {
    const kam = this.cameras.main;
    const gorus = kam.worldView;
    const dar = kam.width < 720;
    for (const z of this.bolgeler) {
      const el = this.katman.labels.get(z.id);
      if (!el) continue;
      const c = this._bolgeDunya(z);
      const sx = (c.x - gorus.x) * kam.zoom;
      const sy = (c.y - c.r * 0.55 - gorus.y) * kam.zoom;
      const gorunur = sx > -80 && sx < kam.width + 80 && sy > -40 && sy < kam.height + 60;
      // Yarım kenara taşan etiket ekranın içine alınır (yazısı kesilmesin); tamamen dışarıdakiler gizli kalır
      const yari = (el.offsetWidth || 120) / 2 + 6;
      const sxIc = Math.max(yari, Math.min(kam.width - yari, sx));
      el.style.transform = `translate(${sxIc.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
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
    const d = bolgeDurumlari();
    this.durumlar = { ...d, ...kapiDurumlari(d) };
    this.katman.durumGuncelle(this.durumlar);
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
