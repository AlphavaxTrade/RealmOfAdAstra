// Realm of AdAstra — Zindan ekranı (düz HTML, Phaser'sız). İki basamak:
//   KAT görünümü: seçili katın resmi ve 3 oda (dokununca oda açılır);
//   ODA görünümü: tek bir odanın büyük resmi, canavar bilgisi, ordunun kazanma şansı ve "Savaşa hazırlan".
// Kurallar ve sayılar js/gameState/zindan.js'ten gelir; bu dosya yalnız gösterir ve tıklamayı yönlendirir.
// Dış olaylar: 'enter-dungeon-view' (haritadan giriş), 'feature-locked', 'monster-defeated' {level} (zafer sonrası tazeler).
import { esc, tam, astra } from '../ekran/cekirdek.js';
import {
  KATLAR, KAT_SAYISI, ODA_SAYISI, katCanavarlari, katDurumu, baslangicKati, kilitMesaji,
  sansTonu, sansYorumu, yetenekBilgisi, ganimetSanslari, bossKatiMi
} from './plan.js';
import { kutukHtml, HIKAYE } from './kutuk.js';
import { sonSavas } from './son-savas.js';

const SERIT_YENILEME_MS = 1000;
const bossSeviyesi = (m) => !!(m.isBoss || m.level === 9 || m.level === 18);

export function kurZindan({ gs, phaser, panelKapat, bildir, ekranAc }) {
  const kok = document.getElementById('zindan-ekrani');
  const durum = { kat: 1, oda: null, kutuk: false, kutlama: null };
  let sonIlerleme = 1;
  let aralik = null;

  const ilerleme = () => gs.state.dungeonProgress || 1;
  const acikMi = () => !!kok && !kok.hidden;

  // ── Kapı kuralı: kilitliyse nedeni söylenir ve açılmaz ──
  function kapiAcikMi(bolge) {
    const kilit = gs.getFeatureLock(bolge);
    if (!kilit) return true;
    bildir(`🔒 ${kilit.name} henüz kapalı: ${kilit.reason}`, 'info');
    return false;
  }

  // ── Küçük parçalar ──
  function durumYazisi(oz) {
    if (oz.durum === 'kilitli') return '🔒 Kilitli';
    if (oz.durum === 'yenildi') return '✅ Yenildi · tekrar';
    return '⚔️ Savaşa hazır';
  }

  function sansCipi(oz) {
    if (oz.durum === 'kilitli') return '';
    const ton = sansTonu(oz.sans);
    return `<span class="zd-cip is-${ton}" title="Ordunun kazanma şansı">${oz.sans == null ? '—' : `%${oz.sans}`}</span>`;
  }

  function odaOzetleri(kat) {
    return katCanavarlari(kat).map((m) => gs.getZindanOdaOzeti(m.level));
  }

  // ── Üst çubuk: geri, kat sekmeleri, ganimet şansı ──
  function ustHtml() {
    const il = ilerleme();
    const sekmeler = KATLAR.map((k) => {
      const d = katDurumu(k.kat, il);
      const isaret = d.tamam ? '🏅' : (d.acik ? `${d.temizlenen}/${ODA_SAYISI}` : '🔒');
      return `<button type="button" class="zd-kat${k.kat === durum.kat ? ' is-aktif' : ''}${bossKatiMi(k.kat) ? ' is-boss' : ''}${d.acik ? '' : ' is-kilitli'}"
        data-e="kat" data-kat="${k.kat}" aria-current="${k.kat === durum.kat ? 'true' : 'false'}" aria-label="${k.kat}. Kat: ${esc(k.ad)}">
        <span class="zd-kat-simge" aria-hidden="true">${k.simge}</span><span class="zd-kat-ad">${k.kat}. Kat</span><span class="zd-kat-isaret">${isaret}</span></button>`;
    }).join('');
    const geriYazi = durum.oda == null ? '<span aria-hidden="true">🏰</span><span class="zd-geri-ad">Kasaba</span>' : '<span aria-hidden="true">‹</span><span class="zd-geri-ad">Odalar</span>';
    return `<header class="zd-ust">
      <button type="button" class="zd-dugme zd-geri" data-e="geri" aria-label="${durum.oda == null ? 'Kasabaya dön' : 'Odalara dön'}">${geriYazi}</button>
      <nav class="zd-katlar" aria-label="Zindan katları">${sekmeler}</nav>
      <div class="zd-sanslar" title="Hesap seviyene ve kata göre düşme şansı (boss katında 2 katı)">${sanslarHtml()}</div>
    </header>`;
  }

  // Parça ve Pandora kutusu düşme şansı (seviye değişince saniyelik yenilemede güncellenir)
  function sanslarHtml() {
    const s = ganimetSanslari(gs, gs.state.level || 1, durum.kat);
    const boss = s.boss ? ' is-boss' : '';
    const alev = s.boss ? ' 🔥' : '';
    return `<span class="zd-sans${boss}"><span aria-hidden="true">🧩</span> ${esc(s.parca.metin)}${alev}</span>
      <span class="zd-sans${boss}"><span aria-hidden="true">📦</span> ${esc(s.kutu.metin)}${alev}</span>`;
  }

  // ── Ordu şeridi: kaç asker, kaç yaralı, stamina, ödüllü giriş; son savaşı tekrarla, kütük ──
  function seritHtml() {
    const o = gs.getZindanOrduDurumu();
    const parcalar = [];
    if (o.kilitli) parcalar.push('<span class="zd-bilgi is-kotu">🔒 Ordun World Boss\'a kilitli</span>');
    else if (!o.asker) parcalar.push('<span class="zd-bilgi is-kotu">⚠️ Ordunda asker yok</span>');
    else {
      parcalar.push(`<span class="zd-bilgi">👥 ${tam(o.asker)} asker</span>`);
      parcalar.push(`<span class="zd-bilgi${o.yarali ? ' is-uyari' : ''}">🩹 ${tam(o.yarali)} yaralı</span>`);
    }
    parcalar.push(`<span class="zd-bilgi${o.stamina < 20 ? ' is-uyari' : ''}">⚡ ${tam(o.stamina)}/${tam(o.enFazlaStamina)}</span>`);
    parcalar.push(`<span class="zd-bilgi${o.harcGerekli ? ' is-uyari' : ''}">🎟️ ${o.harcGerekli ? 'Harç gerekli' : `${o.odulluKalan}/${o.odulluToplam}<span class="zd-etiket"> ödüllü giriş</span>`}</span>`);

    const son = gs.state.lastBattle && gs.state.lastBattle.monsterLevel;
    const tekrar = son && son <= ilerleme()
      ? `<button type="button" class="zd-dugme zd-kucuk" data-e="tekrar" title="Aynı canavara aynı askerlerle yeniden hazırlan">↻ Son savaş (Sv.${son})</button>` : '';
    const asker = !o.asker ? '<button type="button" class="zd-dugme zd-kucuk" data-e="kisla">⚔️ Kışlaya git</button>' : '';
    return `<div class="zd-serit" role="status" aria-label="Ordu durumu">
      <div class="zd-serit-bilgi">${parcalar.join('')}</div>
      <div class="zd-serit-dugme">${asker}${tekrar}<button type="button" class="zd-dugme zd-kucuk" data-e="kutuk">📖 Kütük</button></div>
    </div>`;
  }

  // ── KAT görünümü ──
  function katHtml() {
    const kat = KATLAR[durum.kat - 1];
    const ozetler = odaOzetleri(durum.kat);
    const il = ilerleme();
    const plakalar = ozetler.map((oz, i) => {
      const m = oz.canavar;
      const boss = bossSeviyesi(m);
      const aria = `Oda ${i + 1}, Seviye ${m.level}, ${m.name}. ${durumYazisi(oz)}${oz.sans != null && oz.durum !== 'kilitli' ? `, kazanma şansı yüzde ${oz.sans}` : ''}`;
      return `<button type="button" class="zd-bolge is-${oz.durum}${boss ? ' is-boss' : ''}" data-e="oda" data-oda="${i}" style="--i:${i}" aria-label="${esc(aria)}">
        <span class="zd-no" aria-hidden="true">${i + 1}</span>
        <span class="zd-plaka" aria-hidden="true">
          <span class="zd-plaka-ust">${boss ? '👑 ' : ''}Seviye ${m.level}</span>
          <span class="zd-plaka-ad">${esc(m.name)}</span>
          <span class="zd-plaka-alt">${durumYazisi(oz)} ${sansCipi(oz)}</span>
        </span></button>`;
    }).join('');

    const liste = ozetler.map((oz, i) => {
      const m = oz.canavar;
      const boss = bossSeviyesi(m);
      const can = oz.yaralanmis && oz.durum !== 'kilitli' ? ` · ❤️ ${tam(oz.kalanCan)}/${tam(m.hp)}` : '';
      return `<li><button type="button" class="zd-kart is-${oz.durum}" data-e="oda" data-oda="${i}">
        <span class="zd-kart-simge" aria-hidden="true">${esc(m.icon || '💀')}</span>
        <span class="zd-kart-govde"><b>${boss ? '👑 ' : ''}Seviye ${m.level} · ${esc(m.name)}</b><small>Oda ${i + 1} · ${durumYazisi(oz)}${can}</small></span>
        ${sansCipi(oz)}<span class="zd-kart-ok" aria-hidden="true">›</span></button></li>`;
    }).join('');

    const g = kat.gecit;
    const gecit = g && durum.kat < KAT_SAYISI
      ? `<button type="button" class="zd-gecit" data-e="gecit" style="--s:${g.sol}%;--u:${g.ust}%;--e:${g.en}%;--b:${g.boy}%"
          aria-label="${durum.kat + 1}. kata geç"><span class="zd-gecit-yazi">🌀 ${durum.kat + 1}. Kat</span></button>` : '';
    const gecitSatiri = durum.kat < KAT_SAYISI
      ? `<li class="zd-gecit-satir"><button type="button" class="zd-kart is-gecit" data-e="gecit">
          <span class="zd-kart-simge" aria-hidden="true">🌀</span>
          <span class="zd-kart-govde"><b>${durum.kat + 1}. Kata geç</b><small>${esc(KATLAR[durum.kat].ad)}</small></span><span class="zd-kart-ok" aria-hidden="true">›</span></button></li>` : '';

    const d = katDurumu(durum.kat, il);
    return `<div class="zd-kat-gorunum">
      <div class="zd-baslik"><h2>${kat.simge} ${kat.kat}. Kat · ${esc(kat.ad)}</h2>
        <p>${esc(kat.alt)}${d.tamam ? ` · 🏅 ${esc(kat.rozet)}` : ` · ${d.temizlenen}/${ODA_SAYISI} oda temizlendi`}</p></div>
      <div class="zd-sahne">
        <div class="zd-resim" role="img" aria-label="${esc(kat.ad)} haritası" style="background-image:url('${esc(kat.resim)}')"></div>
        ${plakalar}${gecit}
      </div>
      <ul class="zd-liste">${liste}${gecitSatiri}</ul>
    </div>`;
  }

  // ── ODA görünümü ──
  function odaHtml() {
    const kat = KATLAR[durum.kat - 1];
    const ozetler = odaOzetleri(durum.kat);
    const sira = Math.max(0, Math.min(ODA_SAYISI - 1, durum.oda));
    const oz = ozetler[sira];
    const m = oz.canavar;
    const boss = bossSeviyesi(m);
    const kilitli = oz.durum === 'kilitli';
    const il = ilerleme();
    const taban = gs.getDungeonBaseReward(m.level, boss);
    const butce = gs.getDungeonDayStatus().budgetLeft;
    const sanslar = ganimetSanslari(gs, gs.state.level || 1, durum.kat);
    const canYuzde = Math.max(0, Math.min(100, Math.round((oz.kalanCan / m.hp) * 100)));

    const yet = (m.abilities && m.abilities.length ? m.abilities : (boss ? ['cleave', 'terrify'] : [])).map((a) => {
      const y = yetenekBilgisi(a);
      return `<li><span aria-hidden="true">${y.simge}</span><div><b>${esc(y.ad)}</b><small>${esc(y.metin)}${y.ipucu ? ` <i>İpucu: ${esc(y.ipucu)}</i>` : ''}</small></div></li>`;
    }).join('');

    let sansBlok;
    if (kilitli) {
      sansBlok = `<div class="zd-sans-blok is-yok"><b>🔒</b><div><strong>Henüz kilitli</strong><small>Önce Seviye ${il} ve öncesini yenmelisin.</small></div></div>`;
    } else {
      const ton = sansTonu(oz.sans);
      const enAz = oz.sans == null ? '' : (oz.enAz ? ` En az <b>${oz.enAz}</b> asker yeter (%80).` : ' Tüm ordunla bile şans düşük: askerlerini güçlendir.');
      sansBlok = `<div class="zd-sans-blok is-${ton}"><b>${oz.sans == null ? '—' : `%${oz.sans}`}</b>
        <div><strong>Ordunun kazanma şansı</strong><small>${esc(sansYorumu(oz.sans))}.${enAz}</small></div></div>`;
    }

    const durumRozeti = `<span class="zd-rozet is-${oz.durum}">${durumYazisi(oz)}</span>`;
    const enBas = oz.sans == null ? 'is-pasif' : '';

    const savasDugme = kilitli
      ? '<button type="button" class="zd-dugme zd-ana" disabled>🔒 Kilitli</button>'
      : `<button type="button" class="zd-dugme zd-ana ${enBas}" data-e="savas" data-oda="${sira}">⚔️ Savaşa hazırlan</button>`;
    const onceki = sira > 0 ? `<button type="button" class="zd-dugme" data-e="komsu" data-yon="-1" aria-label="Önceki oda">‹ Oda ${sira}</button>` : '<span></span>';
    const sonraki = sira < ODA_SAYISI - 1 ? `<button type="button" class="zd-dugme" data-e="komsu" data-yon="1" aria-label="Sonraki oda">Oda ${sira + 2} ›</button>` : '<span></span>';

    return `<div class="zd-oda" style="--k:${sira}">
      <div class="zd-oda-resim" role="img" aria-label="${esc(kat.ad)}, oda ${sira + 1}" style="background-image:url('${esc(kat.resim)}')">
        <span class="zd-oda-etiket">${boss ? '👑 ' : ''}Oda ${sira + 1} / ${ODA_SAYISI}</span>
      </div>
      <article class="zd-oda-kart is-${oz.durum}">
        <header class="zd-oda-ust">
          <span class="zd-oda-simge" aria-hidden="true">${esc(m.icon || '💀')}</span>
          <div><h2>${esc(m.name)}</h2><p>Seviye ${m.level}${boss ? ' · ' + esc(m.bossLabel || 'BOSS') : ''} · ${esc(kat.ad)}</p></div>
          ${durumRozeti}
        </header>
        ${kilitli ? '' : `<p class="zd-hikaye">${esc(HIKAYE[m.level] || '')}</p>`}
        ${kilitli ? '' : `<div class="zd-istat">
          <div><small>❤️ Can${oz.yaralanmis ? ' (yaralı)' : ''}</small><b>${tam(oz.kalanCan)} / ${tam(m.hp)}</b>
            <span class="zd-cubuk" aria-hidden="true"><i style="width:${canYuzde}%"></i></span></div>
          <div><small>⚔️ Saldırı</small><b>${tam(m.atk)}</b></div>
        </div>`}
        ${sansBlok}
        ${kilitli || !yet ? '' : `<ul class="zd-yet" aria-label="Yetenekler">${yet}</ul>`}
        ${kilitli ? '' : `<ul class="zd-ganimet" aria-label="Ganimet">
          <li>🟣 <b>+${astra(Math.min(taban.ada, butce))} ASTRA</b></li>
          <li>✨ +${tam(taban.xp)} hesap XP · +${tam(m.rewardXp || 0)} asker XP</li>
          <li>🧩 Parça ${esc(sanslar.parca.metin)} · 📦 Kutu ${esc(sanslar.kutu.metin)}</li>
        </ul>`}
        <div class="zd-eylem">${onceki}${savasDugme}${sonraki}</div>
      </article>
    </div>`;
  }

  // ── Katmanlar: kütük penceresi ve kat tamamlama ──
  function kutukPenceresi() {
    const k = kutukHtml(ilerleme());
    return `<div class="zd-katman" data-e="kutuk-kapat-arka">
      <div class="zd-pano" role="dialog" aria-modal="true" aria-label="Canavar Kütüğü">
        <header><h2>📖 Canavar Kütüğü <small>${k.gorulen}/${k.toplam} tanıdık</small></h2>
          <button type="button" class="zd-dugme zd-kucuk" data-e="kutuk-kapat" aria-label="Kütüğü kapat">✕</button></header>
        <div class="zd-pano-govde">${k.html}</div>
      </div></div>`;
  }

  function kutlamaBandi() {
    if (!durum.kutlama) return '';
    const k = KATLAR[durum.kutlama - 1];
    return `<div class="zd-kutlama" role="status"><div><b>🎉 ${k.kat}. Kat tamamlandı!</b><span>🏅 ${esc(k.rozet)} rozetini kazandın</span></div>
      <button type="button" class="zd-dugme zd-kucuk" data-e="kutlama-kapat">Tamam</button></div>`;
  }

  // ── Çizim: odak ve kaydırma korunur ──
  function ciz() {
    if (!kok) return;
    sonIlerleme = ilerleme();
    const odak = document.activeElement && kok.contains(document.activeElement) ? document.activeElement : null;
    const anahtar = odak ? { e: odak.dataset.e, oda: odak.dataset.oda, kat: odak.dataset.kat } : null;
    kok.dataset.gorunum = durum.oda == null ? 'kat' : 'oda';
    kok.dataset.tema = `kat${durum.kat}`;
    const govde = durum.oda == null ? katHtml() : odaHtml();
    kok.innerHTML = `${ustHtml()}${seritHtml()}<main class="zd-orta" id="zd-orta">${govde}</main>${kutlamaBandi()}${durum.kutuk ? kutukPenceresi() : ''}`;
    const aktifSekme = kok.querySelector('.zd-kat.is-aktif');
    const katlar = kok.querySelector('.zd-katlar');
    if (aktifSekme && katlar) katlar.scrollLeft = Math.max(0, aktifSekme.offsetLeft - (katlar.clientWidth - aktifSekme.offsetWidth) / 2);
    if (anahtar && anahtar.e) {
      const sel = `[data-e="${anahtar.e}"]${anahtar.oda != null ? `[data-oda="${anahtar.oda}"]` : ''}${anahtar.kat != null ? `[data-kat="${anahtar.kat}"]` : ''}`;
      const yeni = kok.querySelector(sel);
      if (yeni) yeni.focus({ preventScroll: true });
    }
  }

  function seritiYenile() {
    if (!acikMi()) return;
    const eski = kok.querySelector('.zd-serit');
    if (eski) {
      const tmp = document.createElement('div');
      tmp.innerHTML = seritHtml();
      const yeni = tmp.firstElementChild;
      if (yeni && yeni.innerHTML !== eski.innerHTML) eski.innerHTML = yeni.innerHTML;
    }
    const sans = kok.querySelector('.zd-sanslar');
    if (sans) {
      const metin = sanslarHtml();
      if (sans.innerHTML !== metin) sans.innerHTML = metin;
    }
  }

  function basaDon() {
    const orta = kok.querySelector('#zd-orta');
    if (orta) orta.scrollTop = 0;
  }

  // ── Giriş / çıkış ──
  function gir() {
    if (!kapiAcikMi('dungeon')) return;
    panelKapat();
    const oyun = phaser();
    if (oyun && oyun.scene && oyun.scene.isActive('GrandTownScene')) oyun.scene.stop('GrandTownScene');
    if (window.__vadi3d) window.__vadi3d.hide();   // 3B vadi gizlenir, zindan ekranı görünür
    document.body.classList.add('in-dungeon');
    durum.kat = baslangicKati(ilerleme());
    durum.oda = null;
    durum.kutuk = false;
    kok.hidden = false;
    ciz();
    basaDon();
    clearInterval(aralik);
    aralik = setInterval(seritiYenile, SERIT_YENILEME_MS);
  }

  function don() {
    clearInterval(aralik);
    aralik = null;
    kok.hidden = true;
    kok.innerHTML = '';
    document.body.classList.remove('in-dungeon');
    const oyun = phaser();
    if (window.__vadi3d) window.__vadi3d.show();
    else if (oyun && oyun.scene) oyun.scene.start('GrandTownScene');
    bildir('🏰 Kasaba meydanına dönüldü!', 'info');
  }

  // ── Tıklamalar ──
  function savasaHazirlan(seviye) {
    if (seviye > ilerleme()) {
      const m = katCanavarlari(durum.kat).find((x) => x.level === seviye);
      bildir(kilitMesaji(ilerleme(), m), 'error');
      return;
    }
    const m = katCanavarlari(durum.kat).find((x) => x.level === seviye);
    ekranAc('savashazirlik', { canavar: m });
  }

  const eylemler = {
    geri() {
      if (durum.kutuk) { durum.kutuk = false; ciz(); return; }
      if (durum.oda != null) { durum.oda = null; ciz(); basaDon(); return; }
      don();
    },
    kat(el) {
      const kat = parseInt(el.dataset.kat, 10);
      if (!(kat >= 1 && kat <= KAT_SAYISI)) return;
      durum.kat = kat;
      durum.oda = null;
      ciz();
      basaDon();
    },
    oda(el) {
      durum.oda = parseInt(el.dataset.oda, 10);
      ciz();
      basaDon();
    },
    komsu(el) {
      const yeni = (durum.oda || 0) + parseInt(el.dataset.yon, 10);
      if (yeni < 0 || yeni >= ODA_SAYISI) return;
      durum.oda = yeni;
      ciz();
      basaDon();
    },
    savas(el) {
      const sira = parseInt(el.dataset.oda, 10);
      const m = katCanavarlari(durum.kat)[sira];
      if (m) savasaHazirlan(m.level);
    },
    gecit() {
      if (durum.kat >= KAT_SAYISI) return;
      durum.kat += 1;
      durum.oda = null;
      ciz();
      basaDon();
      bildir(`🌀 ${durum.kat}. Kata ışınlanıldı!`, 'success');
    },
    tekrar() {
      const seviye = gs.state.lastBattle && gs.state.lastBattle.monsterLevel;
      if (!seviye || seviye > ilerleme()) return;
      const m = katCanavarlari(Math.ceil(seviye / ODA_SAYISI)).find((x) => x.level === seviye);
      if (!m) return;
      const secili = sonSavas.level === seviye ? [...sonSavas.secili] : [];
      ekranAc('savashazirlik', secili.length ? { canavar: m, secili, secimYapildi: true } : { canavar: m });
    },
    kisla() { ekranAc('kisla'); },
    kutuk() { durum.kutuk = true; ciz(); },
    'kutuk-kapat'() { durum.kutuk = false; ciz(); },
    'kutlama-kapat'() { durum.kutlama = null; ciz(); }
  };

  function tiklandi(e) {
    const el = e.target.closest('[data-e]');
    if (!el || !kok.contains(el)) return;
    const ad = el.dataset.e;
    if (ad === 'kutuk-kapat-arka') {
      if (e.target === el) { durum.kutuk = false; ciz(); }
      return;
    }
    const f = eylemler[ad];
    if (f) f(el);
  }

  function tusaBasildi(e) {
    if (e.key !== 'Escape' || !acikMi()) return;
    // Başka bir pencere ya da savaş arenası açıksa onu kapatmak o pencerenin işidir
    if (document.body.classList.contains('modal-open')) return;
    const pencere = document.getElementById('rpg-modal');
    if (pencere && pencere.classList.contains('active')) return;
    if (durum.kutuk) { durum.kutuk = false; ciz(); } else if (durum.oda != null) { durum.oda = null; ciz(); basaDon(); }
  }

  // Zafer sonrası: ekran tazelenir; bir kat ilk kez tamamlandıysa kutlama bandı gösterilir
  function canavarYenildi(e) {
    const seviye = e.detail && e.detail.level;
    if (seviye && seviye % ODA_SAYISI === 0 && sonIlerleme <= seviye && ilerleme() > seviye) {
      durum.kutlama = seviye / ODA_SAYISI;
    }
    if (acikMi()) ciz();
  }

  /** Pencere olaylarını ve tıklama dinleyicilerini bir kez bağlar. */
  function bagla() {
    if (!kok) return;
    kok.addEventListener('click', tiklandi);
    document.addEventListener('keydown', tusaBasildi);
    window.addEventListener('enter-dungeon-view', gir);
    window.addEventListener('feature-locked', (e) => kapiAcikMi(e.detail && e.detail.zoneId));
    window.addEventListener('monster-defeated', canavarYenildi);
  }

  return { gir, don, ciz, kapiAcikMi, bagla, durum };
}
