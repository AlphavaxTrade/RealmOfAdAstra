// Realm of AdAstra — Canlı savaş arenası: zindan ve Kolezyum savaşlarının kayıttan canlandırılması.
// Sonuç savaş BAŞLARKEN js/combat.js'te hesaplanıp işlenir; arena yalnızca dönen kaydı (replay) olay olay oynatır.
// Saf kısımlar (resim seçimi, olay kuyruğu, olayın birime etkisi) DOM'a dokunmaz ve tests/test_arena.mjs'te denetlenir.

// Savaş kaydı innerHTML ile yazılır; adlar başka oyunculardan gelebilir (kaynakta cleanName ile temizlenir, burası ek katman)
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Saf kısım ────────────────────────────────────────────────────────────
// Canavar resmi: önce kat numarası, sonra adındaki ipuçları
const CANAVAR_KATLARI = [
  [[1], 'assets/monster_swamp_slime.jpg'],
  [[2], 'assets/monster_cave_goblin.jpg'],
  [[3, 8], 'assets/monster_shadow_wolf.jpg'],
  [[4, 5, 6, 10, 11], 'assets/monster_skeleton.jpg'],
  [[7, 9, 12], 'assets/monster_stone_goliath.jpg'],
  [[13, 14, 15, 16], 'assets/monster_fire_demon.jpg'],
  [[17, 18], 'assets/monster_dragon_ignis.jpg']
];
const CANAVAR_ADLARI = [
  [['balçık', 'balcik', 'slime'], 'assets/monster_swamp_slime.jpg'],
  [['goblin'], 'assets/monster_cave_goblin.jpg'],
  [['kurt', 'tazı', 'tazi', 'hayalet'], 'assets/monster_shadow_wolf.jpg'],
  [['iskelet', 'kemik', 'mumya'], 'assets/monster_skeleton.jpg'],
  [['golyat', 'firavun', 'taş', 'tas', 'tarikatçı'], 'assets/monster_stone_goliath.jpg'],
  [['ateş', 'ates', 'lav', 'iblis', 'berserker'], 'assets/monster_fire_demon.jpg'],
  [['ignis', 'ejderha', 'gölge lordu', 'golge lordu'], 'assets/monster_dragon_ignis.jpg']
];

export function canavarResmi(seviye, ad) {
  const kat = CANAVAR_KATLARI.find(([katlar]) => katlar.includes(seviye));
  if (kat) return kat[1];
  const n = String(ad || '').toLowerCase();
  const isim = CANAVAR_ADLARI.find(([ipuclari]) => ipuclari.some((i) => n.includes(i)));
  return isim ? isim[1] : 'assets/monster_swamp_slime.jpg';
}

const GLADYATOR_IPUCLARI = ['Gladyatör', 'Kael', 'Şampiyon', 'Malok'];

export function birimResmi(u) {
  if (u.avatar) return u.avatar;
  if (u.side === 'ally') return 'assets/ui/soldier_1.webp';
  if (GLADYATOR_IPUCLARI.some((i) => String(u.name || '').includes(i))) return 'assets/gladiator_rival.jpg';
  return canavarResmi(u.level, u.name);
}

// Savaş kaydındaki turlu olaylar + tura bağlı olmayan başlangıç olayları (örn. kat etkisi) tek sıraya dizilir
export function olayKuyrugu(replay) {
  const kuyruk = [];
  if (!replay || !Array.isArray(replay.rounds)) return kuyruk;
  replay.rounds.forEach((r) => (r.events || []).forEach((ev) => kuyruk.push({ round: r.round, ev })));
  const sayilan = new Set(kuyruk.map((x) => x.ev));
  const basta = (replay.log || []).filter((ev) => !sayilan.has(ev)).map((ev) => ({ round: 0, ev }));
  return [...basta, ...kuyruk];
}

// Olayın birimlerin canına/ölümüne etkisi (arayüzden bağımsız). units: arena birimleri, uid ile eşleşir.
export function olayiUygula(units, ev) {
  const bul = (uid) => (uid ? units.find((u) => u.uid === uid) : null);
  const hedef = bul(ev.targetUid);
  if (!hedef) return;
  if (ev.type === 'damage' || ev.type === 'dot') {
    hedef.hp = Math.max(0, ev.targetHp);
    if (ev.died || hedef.hp <= 0) hedef.dead = true;
  } else if (ev.type === 'heal') {
    hedef.hp = Math.max(0, ev.targetHp);
  }
}

// Savaş sonunda kaydın son can değerleri birimlere yazılır (atlanan olaylar sonucu bozmasın)
export function sonCanlariEsitle(units, replay) {
  if (!replay) return;
  for (const f of [...(replay.allies || []), ...(replay.enemies || [])]) {
    const u = units.find((x) => x.uid === f.uid);
    if (u) { u.hp = Math.max(0, Math.round(f.hp)); u.dead = u.hp <= 0; }
  }
}

export function olayBeklemesi(ev) {
  if (ev.type === 'phase') return 1400;
  if (ev.type === 'ability') return 700;
  return 480;
}

// Arena sahnesine verilen ham birim listesi → çizilecek birimler
export function birimleriKur(muttefikler, dusmanlar, mod) {
  const hazirla = (u, i, taraf) => {
    const hp = Math.max(1, Math.round(u.hp != null ? u.hp : (u.maxHp || 100)));
    const maxHp = Math.max(1, Math.round(u.maxHp != null ? u.maxHp : hp));
    const ortak = {
      ...u, side: taraf, id: (taraf === 'ally' ? 'a' : 'e') + i, hp, maxHp, row: u.row === 'back' ? 'back' : 'front',
      skills: Array.isArray(u.skills) && u.skills.length ? u.skills : null, shieldPts: 0, dead: false
    };
    if (taraf === 'ally') {
      return { ...ortak, sourceIndex: u.sourceIndex != null ? u.sourceIndex : i, avatar: u.avatar || 'assets/soldier_avatar.jpg',
        atk: Math.max(1, Math.round(u.atk || 25)), skills: ortak.skills || ['shieldWall'] };
    }
    const boss = !!(u.boss || u.isBoss);
    return { ...ortak, avatar: u.avatar || (mod === 'colosseum' ? 'assets/gladiator_rival.jpg' : canavarResmi(u.level, u.name)),
      atk: Math.max(1, Math.round(u.atk || 20)), boss, phases: u.phases || [], skills: ortak.skills || (boss ? ['cleave', 'roar'] : ['cleave']) };
  };
  return [
    ...(muttefikler || []).map((u, i) => hazirla(u, i, 'ally')),
    ...(dusmanlar || []).map((u, i) => hazirla(u, i, 'enemy'))
  ];
}

// ── Arayüz ───────────────────────────────────────────────────────────────
export class SavasArenasi {
  constructor(konteyner) {
    this.kok = (konteyner && konteyner.classList && konteyner.classList.contains('aa-arena'))
      ? konteyner
      : (konteyner ? konteyner.querySelector('.aa-arena') : null);
    if (!this.kok) throw new Error('SavasArenasi: .aa-arena kök elemanı bulunamadı.');

    this.birimler = [];
    this.tur = 0;
    this.calisiyor = false;
    this.bitti = false;
    this.zamanlayici = null;
    this.hiz = 1;
    this.ayar = {};
    this.tamamlaninca = null;
    this.replay = null;
    this.kuyruk = [];
    this.sira = 0;
    this._baglan();
  }

  $(sel) { return this.kok.querySelector(sel); }

  _baglan() {
    const k = this.kok;
    const tikla = (sel, fn) => { const e = k.querySelector(sel); if (e) e.addEventListener('click', fn); };
    tikla('#aa-playBtn', () => (this.calisiyor ? this.stop() : this.start()));
    tikla('#aa-skipBtn', () => this.skipToEnd());
    tikla('#aa-resetBtn', () => this.reset());
    tikla('#aa-resultBtn', () => this.reset());
    tikla('#aa-closeBtn', () => this._kapat());
    tikla('#aa-resultCloseBtn', () => this._kapat());
    k.querySelectorAll('.speed-btn').forEach((b) => b.addEventListener('click', () => {
      k.querySelectorAll('.speed-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      this.hiz = parseFloat(b.dataset.speed) || 1;
    }));
  }

  // Dışarıya açık: gerçek savaşı yükler ve otomatik başlatır
  // config: { mode, context, rank, allies, enemies, loot, replay, onComplete }
  startBattle(config) {
    this.ayar = config || {};
    this.mod = this.ayar.mode || 'dungeon';
    this.tamamlaninca = this.ayar.onComplete || null;
    this.replay = this.ayar.replay || null;
    this.kuyruk = olayKuyrugu(this.replay);

    this.kok.setAttribute('data-mode', this.mod);
    const rozetZindan = this.$('#aa-modeBadgeDungeon');
    const rozetKolezyum = this.$('#aa-modeBadgeColosseum');
    if (rozetZindan) rozetZindan.hidden = this.mod !== 'dungeon';
    if (rozetKolezyum) rozetKolezyum.hidden = this.mod !== 'colosseum';
    const baglam = this.$('#aa-contextText');
    if (baglam) baglam.innerHTML = this.ayar.context || '';
    const rutbe = this.$('#aa-rankPill');
    if (rutbe) rutbe.textContent = this.ayar.rank || '';

    this.reset();
    this.start();
  }

  start() {
    if (this.calisiyor) return;
    this.calisiyor = true;
    this._yaz('#aa-stateVal', 'Savaşta');
    this._yaz('#aa-playBtn', '⏸ Duraklat');
    this._adim();
  }

  stop() {
    this.calisiyor = false;
    clearTimeout(this.zamanlayici);
    this._yaz('#aa-playBtn', '▶ Devam Et');
    const durum = this.$('#aa-stateVal');
    if (durum && durum.textContent === 'Savaşta') durum.textContent = 'Duraklatıldı';
  }

  reset() {
    this.stop();
    this.bitti = false;
    this.sira = 0;
    this.tur = 0;
    this._yaz('#aa-roundVal', '0');
    this._yaz('#aa-stateVal', 'Hazır');
    this._yaz('#aa-playBtn', '▶ Savaşı Başlat');
    const banner = this.$('#aa-resultBanner');
    if (banner) banner.classList.remove('show');
    this.birimler = birimleriKur(this.ayar.allies, this.ayar.enemies, this.mod);
    this._ciz();
    const gunluk = this.$('#aa-logWrap');
    if (gunluk) {
      gunluk.innerHTML = '';
      this._gunluk('⚔️ Savaş alanına girildi… <b>Savaşı Başlat</b> ile izle veya <b>Anında Bitir</b>.', 'system');
    }
  }

  skipToEnd() {
    this.stop();
    if (!this.replay) return;
    while (this.sira < this.kuyruk.length) {
      const oge = this.kuyruk[this.sira++];
      this.tur = oge.round;
      this._olay(oge.ev, false);
    }
    this._yaz('#aa-roundVal', String(this.tur));
    this._sonlandir();
  }

  destroy() { this.stop(); }

  // ── oynatma ──
  _adim() {
    if (!this.calisiyor || this.bitti) return;
    if (this.sira >= this.kuyruk.length) { this._sonlandir(); return; }
    const oge = this.kuyruk[this.sira++];
    if (oge.round !== this.tur) {
      this.tur = oge.round;
      this._yaz('#aa-roundVal', String(this.tur));
    }
    this._olay(oge.ev, true);
    this.zamanlayici = setTimeout(() => this._adim(), olayBeklemesi(oge.ev) / this.hiz);
  }

  _sonlandir() {
    sonCanlariEsitle(this.birimler, this.replay);
    this._ciz();
    this._sonuc(!!(this.replay && this.replay.victory));
  }

  _birim(uid) { return uid ? this.birimler.find((u) => u.uid === uid) : null; }

  _olay(ev, canlandir) {
    const aktor = this._birim(ev.actorUid);
    const hedef = this._birim(ev.targetUid);
    olayiUygula(this.birimler, ev);
    switch (ev.type) {
      case 'damage': {
        if (aktor && canlandir) this._hamle(aktor);
        if (hedef && canlandir) {
          this._birimGuncelle(hedef);
          this._vurus(hedef.id);
          this._sayi(hedef.id, `${ev.isCrit ? '💥 ' : ''}-${ev.amount}`, ev.isCrit ? 'dmg crit' : 'dmg');
        }
        const nasil = ev.label && ev.label !== 'Saldırı' ? ` <span class="muted">(${esc(ev.label)})</span>` : '';
        const kalkan = ev.absorbed > 0 ? ` <span class="muted">· kalkan ${esc(ev.absorbed)} emdi</span>` : '';
        this._gunluk(`${ev.isCrit ? '💥 <b>KRİTİK!</b> ' : '⚔️ '}<b>${esc(ev.actor)}</b> → ${esc(ev.target)} <b class="num">-${esc(ev.amount)}</b>${nasil}${kalkan}`, 'dmg');
        if (hedef && hedef.dead) this._gunluk(`💀 <b>${esc(ev.target)}</b> yere serildi!`, 'dmg');
        break;
      }
      case 'heal':
        if (hedef && canlandir) { this._birimGuncelle(hedef); this._sayi(hedef.id, `+${ev.amount}`, 'heal'); }
        this._gunluk(`✨ <b>${esc(ev.actor)}</b> → ${esc(ev.target)} <b class="num">+${esc(ev.amount)}</b> iyileştirdi.`, 'heal skill');
        break;
      case 'ability':
        if (aktor && canlandir) {
          this._hamle(aktor);
          this._patlama(aktor.id);
          this._baslik(`${ev.icon || '✨'} ${ev.ability || ''}`);
          if (/Kalkan|Son Nefes/.test(ev.ability || '')) {
            const halka = this.kok.querySelector('#aa-shield-' + aktor.id);
            if (halka) halka.classList.add('show');
          }
        }
        // ev.text düz yazıdır (js/combat.js) ve oyuncu adı içerebilir: kaçışlı yazılır
        this._gunluk(ev.text ? `${esc(ev.icon || '✨')} ${esc(ev.text)}` : `${esc(ev.icon || '✨')} <b>${esc(ev.actor)}</b> ${esc(ev.ability)}`, 'skill');
        break;
      case 'phase': {
        if (canlandir) {
          const m = /FAZ \d+:\s*([^—]+)—\s*(.*)/.exec(ev.text || '');
          this._faz(m ? m[1].trim() : (ev.text || 'YENİ FAZ'), m ? m[2].trim() : '');
        }
        this._gunluk(`⚡ <b class="num">${esc(ev.text)}</b>`, 'system');
        break;
      }
      case 'rage':
      case 'modifier':
        this._gunluk(esc(ev.text), 'system');
        break;
      case 'stunned':
        this._gunluk(`😵 <b>${esc(ev.actor)}</b> sersemlemiş, hamle yapamadı.`, 'system');
        break;
      case 'dot':
        if (hedef && canlandir) { this._birimGuncelle(hedef); this._sayi(hedef.id, `-${ev.amount}`, 'dmg'); }
        this._gunluk(`🔥 ${esc(ev.target)} <b class="num">-${esc(ev.amount)}</b> (${ev.dotType === 'poison' ? 'zehir' : 'yanma'})`, 'dmg');
        break;
      default:
        break;
    }
  }

  // ── sonuç kartı ──
  // Ana oyunun geri çağrısı önce çalışır (bildirimler; can ve ödül zaten işlenmiştir). Yapılandırılmış sonuç dönerse kartta
  // gerçekten kazanılanlar gösterilir: { baslik?, altBaslik?, satirlar: string[], not?, eylemler: [{etiket, birincil?, tikla}] }
  _sonuc(zafer) {
    if (this.bitti) return;
    this.bitti = true;
    this.stop();
    this._yaz('#aa-stateVal', zafer ? 'Zafer' : 'Yenilgi');

    let sonuc = null;
    if (typeof this.tamamlaninca === 'function') {
      const geriCagri = this.tamamlaninca;
      this.tamamlaninca = null;   // mükerrer çağrıyı önle
      try {
        sonuc = geriCagri({ win: zafer, mode: this.mod, round: this.tur, units: [...this.birimler] }) || null;
      } catch (err) {
        console.error('Savaş sonucu işlenirken hata:', err);
      }
    }

    const baslik = this.$('#aa-resultTitle');
    if (baslik) {
      baslik.textContent = (sonuc && sonuc.baslik) || (zafer ? (this.mod === 'dungeon' ? '🏆 ZAFER!' : '🏆 ARENA ŞAMPİYONU!') : '💀 YENİLGİ');
      baslik.className = 'title ' + (zafer ? 'win' : 'lose');
    }
    this._yaz('#aa-resultSub', (sonuc && sonuc.altBaslik) || `${this.tur} turda ${zafer ? 'kazanıldı' : 'kaybedildi'}`);

    const ganimet = this.$('#aa-resultLoot');
    if (ganimet) {
      ganimet.innerHTML = '';
      const liste = sonuc && Array.isArray(sonuc.satirlar) ? sonuc.satirlar : (zafer ? (this.ayar.loot || []) : []);
      liste.forEach((l) => { const s = document.createElement('span'); s.textContent = l; ganimet.appendChild(s); });
    }
    this._gunluk(zafer ? '🎉 <b>Savaş kazanıldı!</b>' : '☠️ Ordu geri çekildi. Yeniden denemek için askerlerini iyileştir.', 'system');
    this._yaz('#aa-resultNote', (sonuc && sonuc.not) || '');

    const eylemler = this.$('#aa-resultActions');
    if (eylemler) {
      eylemler.innerHTML = '';
      ((sonuc && sonuc.eylemler) || []).forEach((e) => {
        const d = document.createElement('button');
        d.type = 'button';
        d.className = 'ctrl-btn' + (e.birincil ? ' primary' : '');
        d.textContent = e.etiket;
        d.addEventListener('click', () => { this._kapat(); if (typeof e.tikla === 'function') e.tikla(); });
        eylemler.appendChild(d);
      });
    }
    const banner = this.$('#aa-resultBanner');
    if (banner) banner.classList.add('show');
  }

  _kapat() {
    this.stop();
    const katman = this.kok.closest('.battle-arena-modal-overlay') || document.getElementById('battle-arena-modal');
    if (katman) {
      katman.classList.remove('active');
      document.body.classList.remove('modal-open');
    }
  }

  // ── çizim ──
  _yaz(sel, metin) {
    const e = this.$(sel);
    if (e) e.textContent = metin;
  }

  _gunluk(html, sinif) {
    const kap = this.$('#aa-logWrap');
    if (!kap) return;
    const satir = document.createElement('div');
    satir.className = 'log-line' + (sinif ? ' ' + sinif : '');
    satir.innerHTML = html;
    kap.prepend(satir);
    while (kap.children.length > 50) kap.removeChild(kap.lastChild);
  }

  _ciz() {
    const muttefik = this.$('#aa-allyFlank');
    const dusman = this.$('#aa-enemyFlank');
    if (!muttefik || !dusman) return;
    muttefik.innerHTML = '';
    dusman.innerHTML = '';
    const grupla = (taraf) => ({
      back: this.birimler.filter((u) => u.side === taraf && u.row === 'back'),
      front: this.birimler.filter((u) => u.side === taraf && u.row !== 'back')
    });
    const yaz = (kap, g) => {
      const arka = document.createElement('div');
      arka.className = 'row-group row-back';
      g.back.forEach((u) => arka.appendChild(this._birimEl(u)));
      const on = document.createElement('div');
      on.className = 'row-group row-front';
      g.front.forEach((u) => on.appendChild(this._birimEl(u)));
      if (g.back.length) kap.appendChild(arka);
      kap.appendChild(on);
    };
    yaz(muttefik, grupla('ally'));
    yaz(dusman, grupla('enemy'));
    this._sira();
  }

  _canSinifi(oran) { return oran > 0.5 ? '' : (oran > 0.22 ? 'mid' : 'low'); }

  _birimEl(u) {
    const el = document.createElement('div');
    el.className = 'unit ' + u.side + (u.boss ? ' unit--boss' : '') + (u.dead ? ' dead' : '');
    el.id = 'aa-unit-' + u.id;
    const oran = Math.max(0, u.hp / u.maxHp);
    const yedek = u.icon || (u.side === 'ally' ? '⚔️' : '💀');
    el.innerHTML = `
      <div class="shield-ring ${u.shieldPts > 0 ? 'show' : ''}" id="aa-shield-${u.id}"></div>
      <div class="icon-badge">
        <img src="${esc(birimResmi(u))}" class="unit-avatar-img" alt="${esc(u.name)}" data-fb="next" />
        <span class="avatar-fallback" hidden>${esc(yedek)}</span>
      </div>
      <div class="hp-track"><div class="hp-fill ${this._canSinifi(oran)}" style="width:${Math.round(oran * 100)}%"></div></div>
      <div class="unit-name" title="${esc(u.name)}">${esc(u.name)}</div>
      <div class="unit-hp-text">${esc(u.hp)}/${esc(u.maxHp)}</div>`;
    return el;
  }

  _birimGuncelle(u) {
    const el = this.kok.querySelector('#aa-unit-' + u.id);
    if (!el) return;
    el.classList.toggle('dead', u.dead);
    const oran = Math.max(0, u.hp / u.maxHp);
    const dolgu = el.querySelector('.hp-fill');
    if (dolgu) {
      dolgu.style.width = Math.round(oran * 100) + '%';
      dolgu.className = 'hp-fill ' + this._canSinifi(oran);
    }
    const yazi = el.querySelector('.unit-hp-text');
    if (yazi) yazi.textContent = `${Math.max(0, Math.round(u.hp))}/${u.maxHp}`;
    this._sira();
  }

  // "Sıradakiler" şeridi: en güçlü 10 canlı birim
  _sira() {
    const yol = this.$('#aa-queueTrack');
    if (!yol) return;
    yol.innerHTML = '';
    const canli = this.birimler.filter((u) => !u.dead).sort((a, b) => (b.atk + (b.boss ? 40 : 0)) - (a.atk + (a.boss ? 40 : 0)));
    canli.slice(0, 10).forEach((u, i) => {
      const c = document.createElement('div');
      c.className = 'queue-chip' + (i === 0 ? ' next' : '') + (u.side === 'ally' ? ' chip-ally' : ' chip-enemy');
      c.innerHTML = `<img src="${esc(birimResmi(u))}" class="queue-avatar-img" alt="${esc(u.name)}" data-fb="text:${esc(u.icon || (u.side === 'ally' ? '⚔️' : '💀'))}" />`;
      const ad = u.name;
      c.title = ad + ` (Atk: ${u.atk}, HP: ${u.hp}/${u.maxHp})`;
      yol.appendChild(c);
    });
  }

  // ── görsel efektler ──
  _hamle(u) {
    const el = this.kok.querySelector('#aa-unit-' + u.id);
    if (!el) return;
    el.classList.add('acting');
    setTimeout(() => el.classList.remove('acting'), 450);
  }

  _vurus(id) {
    const el = this.kok.querySelector('#aa-unit-' + id);
    if (!el) return;
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
  }

  _efektKonumu(id) {
    const katman = this.$('#aa-fxLayer');
    const el = this.kok.querySelector('#aa-unit-' + id);
    if (!katman || !el) return null;
    const r = el.getBoundingClientRect();
    const k = katman.getBoundingClientRect();
    return { katman, x: r.left - k.left + r.width / 2, y: r.top - k.top, h: r.height };
  }

  _sayi(id, metin, sinif) {
    const p = this._efektKonumu(id);
    if (!p) return;
    const e = document.createElement('div');
    e.className = 'dmg-num ' + (sinif || '');
    e.textContent = metin;
    e.style.left = (p.x - 14 + (Math.random() * 16 - 8)) + 'px';
    e.style.top = (p.y - 6) + 'px';
    p.katman.appendChild(e);
    setTimeout(() => e.remove(), 1000);
  }

  _patlama(id) {
    const p = this._efektKonumu(id);
    if (!p) return;
    const e = document.createElement('div');
    e.className = 'skill-burst';
    e.style.left = p.x + 'px';
    e.style.top = (p.y + p.h / 2) + 'px';
    p.katman.appendChild(e);
    setTimeout(() => e.remove(), 650);
  }

  _baslik(metin) {
    const katman = this.$('#aa-fxLayer');
    if (!katman) return;
    const e = document.createElement('div');
    e.className = 'skill-caption';
    e.textContent = metin;
    katman.appendChild(e);
    setTimeout(() => e.remove(), 1600);
  }

  _faz(baslik, alt) {
    const afis = this.$('#aa-phaseBanner');
    const yazi = this.$('#aa-phaseTxt');
    if (!afis || !yazi) return;
    yazi.innerHTML = esc(baslik) + (alt ? `<span class="sub">${esc(alt)}</span>` : '');
    afis.classList.remove('show');
    void afis.offsetWidth;
    afis.classList.add('show');
  }
}
