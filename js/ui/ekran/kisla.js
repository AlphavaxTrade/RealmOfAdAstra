// Realm of AdAstra — Kışla: ordu listesi, askerin sayfası (yuvalar, iyileştirme, yetenekler) ve cephanelik.
// 11 Ekim 2026'da js/ui/barracks.js'ten ekran mimarisiyle baştan yazıldı; kurallar js/ui/kisla-kurallari.js'te (saf, testli).
// Oyun kuralları değişmez: yalnız mevcut oyun işlemleri çağrılır (equipSoldierFromDepot, unequipSoldierToArmory, …).
import { ekranKaydet, kap, kart, katli, sekmeler, dugme, dugmeler, uyari, bos, not, izgara, hucre, etiket, cubuk, tam, esc } from './cekirdek.js';
import { onay } from '../v3/bilesenler.js';
import { equipImg, soldierPortrait } from '../art.js';
import { PLAYER_SKILLS } from '../../combat.js';
import * as K from '../kisla-kurallari.js';

const SEKMELER = [{ id: 'ordu', ad: 'Ordu', simge: '🛡️' }, { id: 'cephanelik', ad: 'Cephanelik', simge: '🗃️' }];
const SUZGECLER = [['hepsi', 'Tümü'], ['yarali', 'Yaralı'], ['eksik', 'Eksik eşya'], ['on', 'Ön saf'], ['arka', 'Arka saf']];
const SIRALAR = [['sira', 'Numara'], ['guc', 'En güçlü'], ['can', 'En yaralı'], ['eksik', 'En eksik']];
const C_SIRALAR = [['guc', 'En güçlü'], ['seviye', 'Seviye'], ['yipranmis', 'Onarım bekleyen']];
const C_NEREDE = [['bosta', 'Boşta'], ['askerde', 'Askerlerde'], ['hepsi', 'Hepsi']];
const SECICI_SINIRI = 60;
const CEPHANELIK_ADIM = 48;

// Panel kapanıp açılınca sekme ve seçili asker hatırlanır (eski Kışla da böyleydi)
const kalici = { sekme: 'ordu', secili: 0 };

function durum(s) {
  if (s.sekme == null) s.sekme = kalici.sekme;
  if (s.secili == null) s.secili = kalici.secili;
  if (s.q == null) s.q = '';
  if (s.filtre == null) s.filtre = 'hepsi';
  if (s.sirala == null) s.sirala = 'sira';
  if (s.secici === undefined) s.secici = null;
  if (s.adDuzenle === undefined) s.adDuzenle = null;
  if (s.cYuva == null) s.cYuva = 'hepsi';
  if (s.cNerede == null) s.cNerede = 'bosta';
  if (s.cSirala == null) s.cSirala = 'guc';
  if (s.cLimit == null) s.cLimit = CEPHANELIK_ADIM;
  if (s.tasi === undefined) s.tasi = null;
  return s;
}

const sayi = (v) => tam(v);
const askerler = (b) => b.gameState.state.soldierUnits || [];
const simgeYuva = (yuva, esya) => K.YUVA_SIMGE[yuva] && equipImg(yuva, (esya && esya.icon) || K.YUVA_SIMGE[yuva]);

function istatMetni(esya) {
  const a = Number(esya.atkBonus) || 0;
  const h = Number(esya.hpBonus) || 0;
  return [a ? `+${sayi(a)} saldırı` : '', h ? `+${sayi(h)} can` : ''].filter(Boolean).join(' · ') || 'bonus yok';
}

// Eşyanın mevcut eşyaya göre farkı: renkli etiketler
function farkEtiketleri(esya, mevcut) {
  const f = K.fark(esya, mevcut);
  const parca = (d, birim) => (d === 0 ? '' : etiket(`${d > 0 ? '+' : '−'}${sayi(Math.abs(d))} ${birim}`, d > 0 ? 'iyi' : 'kotu'));
  return (parca(f.saldiri, 'saldırı') + parca(f.can, 'can')) || etiket('aynı güç');
}

const bildirSonuc = (b, r) => {
  if (r && r.message) b.bildir(r.message, r.success ? 'success' : 'error');
  return r;
};

// ── Ordu sekmesi ─────────────────────────────────────────────────────────
function orduSatirlari(b, s) {
  const liste = K.askerListesi(b.gameState, { q: s.q, filtre: s.filtre, sirala: s.sirala });
  if (!liste.length) return bos('🔎', 'Bu süzgece uyan asker yok.');
  return liste.map(({ s: a, i, heal, stats, filled }) => `
    <button type="button" class="ek-ordu-satir${i === s.secili ? ' is-secili' : ''}" data-e="sec" data-idx="${i}" aria-pressed="${i === s.secili}">
      <span class="ek-ordu-no">${i + 1}</span>
      <img class="ek-ordu-yuz" src="${esc(soldierPortrait(a, i))}" alt="" loading="lazy" draggable="false">
      <span class="ek-ordu-ana">
        <span class="ek-ordu-ad">${esc(a.name)}${a.row === 'back' ? ` ${etiket('arka')}` : ''}${heal.isPaused ? ` ${etiket('iyileşme durdu', 'kotu')}` : ''}</span>
        ${cubuk(heal.hpPct, { ton: K.canTonu(heal.hpPct) === 'kotu' ? 'kotu' : '' })}
      </span>
      <span class="ek-ordu-yan"><small>${filled}/${K.YUVALAR.length} yuva</small><b>${sayi(stats.totalAtk)} ⚔</b></span>
    </button>`).join('');
}

function yuvaKutusu(b, s, a, idx, yuva) {
  const esya = (a.equipment || {})[yuva];
  const acik = s.secici === yuva;
  const aday = K.adaylar(b.gameState.state, yuva).length;
  if (!esya) {
    return `<div class="ek-yuva is-bos${acik ? ' is-acik' : ''}">
      <button type="button" class="ek-yuva-sec" data-e="secici" data-yuva="${yuva}">
        <span class="ek-yuva-simge">${simgeYuva(yuva)}</span>
        <span class="ek-yuva-ad">${K.YUVA_AD[yuva]}</span>
        <small>${aday ? `${aday} uygun eşya · seç` : 'depoda yok'}</small>
      </button></div>`;
  }
  const d = K.dayaniklilik(esya);
  const onarim = d.cur < d.max ? b.gameState.calculateEquipmentRepairCost(yuva, idx) : null;
  return `<div class="ek-yuva${acik ? ' is-acik' : ''}">
    <button type="button" class="ek-yuva-sec" data-e="secici" data-yuva="${yuva}" aria-label="${K.YUVA_AD[yuva]} değiştir">
      <span class="ek-yuva-simge">${simgeYuva(yuva, esya)}</span>
      <span class="ek-yuva-ad">${esc(esya.name)} ${etiket(`Sv.${esya.level || 1}`)}</span>
      <small>${esc(istatMetni(esya))}</small>
      ${cubuk(d.pct, { ton: d.ton === 'kotu' ? 'kotu' : '' })}
      <small class="ek-ton-${d.ton}">${d.cur}/${d.max} dayanıklılık</small>
    </button>
    <div class="ek-yuva-eylem">
      ${onarim ? dugme({ e: 'onar', metin: 'Onar', veri: { yuva }, ipucu: `${sayi(onarim.ironCost)} demir + ${sayi(onarim.woodCost)} odun + ${sayi(onarim.coalCost || 0)} kömür` }) : ''}
      ${dugme({ e: 'cikar', metin: 'Çıkar', ton: 'hayalet', veri: { yuva } })}
    </div></div>`;
}

function seciciPaneli(b, s, a) {
  if (!s.secici) return '';
  const yuva = s.secici;
  const mevcut = (a.equipment || {})[yuva];
  const liste = K.adaylar(b.gameState.state, yuva);
  const ust = `<div class="ek-secici-ust"><b>${K.YUVA_SIMGE[yuva]} ${K.YUVA_AD[yuva]} seç</b>
    <small>${liste.length} eşya depoda${mevcut ? ` · takılı: Sv.${mevcut.level || 1}, ${esc(istatMetni(mevcut))}` : ''}</small>
    ${dugme({ e: 'seciciKapat', metin: 'Kapat', ton: 'hayalet' })}</div>`;
  if (!liste.length) return `<div class="ek-secici" id="kisla-secici">${ust}${bos('📭', 'Depoda bu yuvaya uyan eşya yok', "Demirhane'de dövebilirsin.")}</div>`;
  const oge = liste.slice(0, SECICI_SINIRI).map((c) => {
    const d = K.dayaniklilik(c.item);
    return `<div class="ek-secici-oge">
      <span class="ek-yuva-simge">${simgeYuva(yuva, c.item)}</span>
      <span class="ek-secici-ana"><b>${esc(c.item.name)} · Sv.${c.item.level || 1}</b>
        <small>${esc(istatMetni(c.item))} · <span class="ek-ton-${d.ton}">${d.cur}/${d.max}</span></small>
        <span class="ek-etiketler">${farkEtiketleri(c.item, mevcut)}</span></span>
      ${dugme({ e: 'tak', metin: mevcut ? 'Değiştir' : 'Tak', ton: 'birincil', veri: { kaynak: c.source, yuva, depo: c.armoryIndex ?? '' } })}
    </div>`;
  }).join('');
  return `<div class="ek-secici" id="kisla-secici">${ust}<div class="ek-secici-liste">${oge}</div>
    ${liste.length > SECICI_SINIRI ? not(`En güçlü ${SECICI_SINIRI} eşya gösteriliyor.`) : ''}</div>`;
}

function askerSayfasi(b, s, idx) {
  const gs = b.gameState;
  const a = askerler(b)[idx];
  const stats = gs.getSoldierFullStats(idx) || { totalAtk: 0, totalMaxHp: 0 };
  const heal = gs.getSoldierHealInfo(idx);
  const ot = gs.getHerbHealInfo ? gs.getHerbHealInfo(idx) : null;
  const set = gs.getSoldierSetBonus(idx);
  const parsomen = Number((gs.state.inventory || {}).scroll_heal) || 0;
  const duzenleniyor = s.adDuzenle === idx;
  const yetenekler = a.skills || ['shieldWall'];

  const kimlik = duzenleniyor
    ? `<div class="ek-ad-duzen">
        <input type="text" id="input-soldier-rename" class="ek-girdi" maxlength="24" value="${esc(a.name)}" aria-label="Asker adı">
        ${dugme({ e: 'adKaydet', metin: 'Kaydet', ton: 'birincil' })}${dugme({ e: 'adVazgec', metin: 'Vazgeç', ton: 'hayalet' })}
      </div>`
    : `<h3 class="ek-sayfa-ad">${esc(a.name)} ${dugme({ e: 'adDuzenle', metin: '✏️', ton: 'hayalet', ipucu: 'Adını değiştir' })}</h3>`;

  const can = heal ? `<div class="ek-can">
      <div class="ek-cubuk-etiket"><span>Can</span><b class="ek-ton-${K.canTonu(heal.hpPct)}">${sayi(heal.hp)} / ${sayi(heal.maxHp)}</b></div>
      ${cubuk(heal.hpPct, { ton: K.canTonu(heal.hpPct) === 'kotu' ? 'kotu' : '' })}
      <small class="ek-kucuk">${heal.isFull ? 'Tam can'
    : heal.isPaused ? 'İyileşme durdu: buğday ya da ASTRA yetersiz'
      : `Kendiliğinden dolacak: ${Math.floor(heal.secondsRemaining / 3600)} sa ${Math.floor((heal.secondsRemaining % 3600) / 60)} dk`}</small>
      ${heal.isFull ? '' : dugmeler(
    dugme({ e: 'doyur', metin: `Hemen doyur · ${sayi(heal.wheatNeeded)} buğday + ${sayi(heal.adaCost)} ASTRA` }),
    ot ? dugme({ e: 'otla', metin: `🌿 Otla iyileştir · ${sayi(ot.herbsNeeded)} ot + ${sayi(ot.herbAdaCost)} ASTRA${ot.herbsInStock < ot.herbsNeeded ? ` (elinde ${sayi(ot.herbsInStock)})` : ''}`, devreDisi: ot.herbsInStock < ot.herbsNeeded, ipucu: 'Şifahane kuralı: 1 şifalı ot = 5 can, ASTRA bedeli yarı, buğday harcanmaz' }) : '',
    parsomen > 0 ? dugme({ e: 'parsomen', metin: `Parşömen (${sayi(parsomen)})` }) : ''
  )}
    </div>` : '';

  const yetenekListesi = yetenekler.map((id) => {
    const y = PLAYER_SKILLS[id] || { name: id, icon: '⚡', role: '', desc: '' };
    return `<div class="ek-yetenek"><b>${esc(y.icon)} ${esc(y.name)}</b> ${y.role ? etiket(y.role) : ''}
      <small class="ek-kucuk">${esc(y.desc)}${y.cooldown ? ` · bekleme ${y.cooldown} tur` : ''}</small></div>`;
  }).join('');

  return `<section class="ek-kart ek-sayfa" id="kisla-sayfa" aria-label="Asker ayrıntısı">
    <div class="ek-sayfa-ust">
      <img class="ek-sayfa-yuz" src="${esc(soldierPortrait(a, idx))}" alt="" draggable="false">
      <div class="ek-sayfa-kimlik">${kimlik}
        <small class="ek-kucuk">Asker ${idx + 1} · Sv.${a.level || 1}${set ? ` · ✨ ${esc(set.name)}` : ''}</small></div>
    </div>
    ${izgara([hucre('Saldırı', sayi(stats.totalAtk)), hucre('En yüksek can', sayi(stats.totalMaxHp))])}
    ${dugmeler(dugme({ e: 'saf', metin: `${a.row === 'back' ? '🏹 Arka saf' : '🛡️ Ön saf'} ⇄`, ipucu: 'Savaşta duracağı yer' }))}
    ${can}
    <div class="ek-yuvalar">${K.YUVALAR.map((y) => yuvaKutusu(b, s, a, idx, y)).join('')}</div>
    ${seciciPaneli(b, s, a)}
    ${katli(`Yetenekler (${yetenekler.length})`, yetenekListesi + not("Yeni yetenekler seviye 10, 25, 45 ve 65'te açılır."), { k: 'kisla-yetenek' })}
  </section>`;
}

function orduSekmesi(b, s) {
  const gs = b.gameState;
  const liste = askerler(b);
  const enCok = b.GAME_CONFIG.MAX_SOLDIERS ?? Infinity;
  const bedel = gs.getSoldierCost(liste.length + 1);
  const alinabilir = (enCok === Infinity || liste.length < enCok) && gs.state.adAstraBalance >= bedel;

  if (!liste.length) {
    return kart({
      baslik: 'Ordun henüz boş',
      icerik: not("İlk askerini al; silah ve zırhları ona buradan takacaksın.")
        + dugmeler(dugme({ e: 'yeniAsker', metin: `Yeni asker al · ${sayi(bedel)} ASTRA`, ton: 'birincil', devreDisi: !alinabilir }))
    });
  }

  if (!liste[s.secili]) { s.secili = 0; kalici.secili = 0; }
  if (s.seciciKimin !== s.secili) { s.secici = null; s.seciciKimin = s.secili; }

  let saldiri = 0;
  let can = 0;
  let dolu = 0;
  liste.forEach((a, i) => {
    const x = gs.getSoldierFullStats(i);
    if (x) { saldiri += x.totalAtk; can += x.totalMaxHp; }
    dolu += K.YUVALAR.filter((y) => (a.equipment || {})[y]).length;
  });
  const n = K.sayilar(gs);
  const taktik = gs.getCombatPresets ? gs.getCombatPresets() : null;
  const aktifTaktik = (taktik && taktik.activePresetId) || 1;
  const durduruldu = gs.isArmyPassiveHealBlocked ? gs.isArmyPassiveHealBlocked() : false;
  const aramaAcik = !!s.q || s.filtre !== 'hepsi' || s.sirala !== 'sira' || liste.length > 10;

  const ozet = kart({
    baslik: '🛡️ Ordu',
    icerik: izgara([hucre('Asker', sayi(liste.length)), hucre('Saldırı', sayi(saldiri)), hucre('Can', sayi(can)), hucre('Dolu yuva', `${dolu}/${liste.length * K.YUVALAR.length}`)])
      + dugmeler(
        dugme({ e: 'hazirla', metin: 'Orduyu hazırla', ton: 'birincil', ipucu: 'Yaralıları doyurur, boş yuvalara en iyi eşyaları takar' }),
        dugme({ e: 'yeniAsker', metin: `Yeni asker · ${sayi(bedel)} ASTRA`, devreDisi: !alinabilir })
      )
      + katli('Diğer işlemler',
        dugmeler(dugme({ e: 'doldur', metin: 'Boş yuvaları doldur' }), dugme({ e: 'hepsiniDoyur', metin: 'Hepsini doyur' }), dugme({ e: 'soyHepsi', metin: 'Hepsini soy', ton: 'hayalet', ipucu: 'Bütün askerlerin eşyaları depoya döner' })),
        { k: 'kisla-diger' })
  });

  const taktikKarti = taktik
    ? katli(`Diziliş: ${esc((taktik.presets && taktik.presets[aktifTaktik] && taktik.presets[aktifTaktik].name) || `Taktik ${aktifTaktik}`)}`,
      dugmeler(...[1, 2, 3].map((no) => {
        const p = (taktik.presets && taktik.presets[no]) || { name: `Taktik ${no}` };
        return dugme({ e: 'taktik', metin: esc(p.name), ton: no === aktifTaktik ? 'iyi' : '', veri: { no }, ipucu: 'Bu dizilişi yükle' });
      }), dugme({ e: 'taktikKaydet', metin: 'Şu anki dizilişi kaydet', ton: 'hayalet' })),
      { k: 'kisla-taktik' })
    : '';

  const cipler = SUZGECLER.map(([id, ad]) =>
    `<button type="button" class="ek-cip${s.filtre === id ? ' is-secili' : ''}" data-e="filtre" data-filtre="${id}">${ad} <span>${n[id]}</span></button>`).join('');
  const arama = `<div class="ek-arac">
      <input type="search" id="kisla-ara" class="ek-girdi" data-e-girdi="ara" placeholder="Asker ara (ad ya da numara)" value="${esc(s.q)}" aria-label="Asker ara">
      <div class="ek-cipler">${cipler}</div>
      <label class="ek-etiketli">Sırala
        <select id="kisla-sirala" class="ek-girdi" data-e-degis="sirala" aria-label="Sırala">${SIRALAR.map(([v, ad]) => `<option value="${v}"${s.sirala === v ? ' selected' : ''}>${ad}</option>`).join('')}</select>
      </label></div>`;
  const aramaBolumu = katli(`Ara, süz, sırala${n.yarali ? ` · ${n.yarali} yaralı` : ''}`, arama, { k: 'kisla-arama', acik: aramaAcik });

  return [
    durduruldu ? uyari('Buğday ya da ASTRA yetmediği için askerlerin kendiliğinden iyileşmesi durdu. Ambara buğday ekle ve hesabında ASTRA bulundur.', 'uyari') : '',
    ozet, taktikKarti,
    `<div class="ek-kisla-bolme">
      <section class="ek-kart ek-ordu" aria-label="Asker listesi">${aramaBolumu}<div class="ek-ordu-liste" id="kisla-liste">${orduSatirlari(b, s)}</div></section>
      ${askerSayfasi(b, s, s.secili)}
    </div>`
  ].join('');
}

// ── Cephanelik sekmesi ───────────────────────────────────────────────────
function esyaVeri(e) {
  return { kaynak: e.source, yuva: e.slotKey, depo: e.armoryIndex ?? '', asker: e.soldierIndex ?? '' };
}

function cephanelikSekmesi(b, s) {
  const gs = b.gameState;
  const esyalar = K.tumEsyalar(gs.state);
  const liste = K.cephanelikListesi(esyalar, { yuva: s.cYuva, nerede: s.cNerede, sirala: s.cSirala });
  const gosterilen = liste.slice(0, s.cLimit);
  const bosta = esyalar.filter((e) => e.source !== 'soldier').length;
  const oner = K.oneriler(esyalar, askerler(b));
  const sayim = (yuva) => K.cephanelikListesi(esyalar, { yuva, nerede: s.cNerede }).length;

  const kartlar = gosterilen.map((e) => {
    const it = e.item;
    const d = K.dayaniklilik(it);
    const anahtar = K.esyaAnahtari(e);
    const oneri = oner.get(anahtar) || null;
    const sahibi = e.source === 'soldier' ? `${e.soldierIndex + 1}. ${esc((askerler(b)[e.soldierIndex] || {}).name || '')} üzerinde` : 'Boşta';
    const yuk = gs.calculateEquipmentUpgradeCost ? gs.calculateEquipmentUpgradeCost(it) : null;
    const tasiniyor = s.tasi === anahtar;
    const hedefler = askerler(b).map((a, i) => {
      if (e.source === 'soldier' && e.soldierIndex === i) return '';
      const f = K.fark(it, (a.equipment || {})[e.slotKey]);
      const not2 = !(a.equipment || {})[e.slotKey] ? 'boş yuva'
        : ([f.saldiri ? `${f.saldiri > 0 ? '+' : '−'}${Math.abs(f.saldiri)} saldırı` : '', f.can ? `${f.can > 0 ? '+' : '−'}${Math.abs(f.can)} can` : ''].filter(Boolean).join(', ') || 'aynı');
      return `<option value="${i}">${i + 1}. ${esc(a.name)} — ${not2}</option>`;
    }).join('');
    const eylemler = tasiniyor
      ? `<div class="ek-tasi"><select id="kisla-tasi-hedef" class="ek-girdi" aria-label="Asker seç">${hedefler}</select>
          ${dugme({ e: 'tasiGit', metin: 'Tak', ton: 'birincil', veri: esyaVeri(e) })}${dugme({ e: 'tasiIptal', metin: 'Vazgeç', ton: 'hayalet' })}</div>`
      : dugmeler(
        oneri ? dugme({ e: 'ver', metin: `${oneri.idx + 1}. askere tak`, ton: 'birincil', veri: { ...esyaVeri(e), hedef: oneri.idx } }) : '',
        dugme({ e: 'tasi', metin: e.source === 'soldier' ? 'Başka askere' : 'Askere tak…', veri: { anahtar } }),
        e.source === 'soldier' ? dugme({ e: 'cCikar', metin: 'Çıkar', ton: 'hayalet', veri: esyaVeri(e) }) : '',
        yuk && !yuk.isMaxLevel ? dugme({ e: 'yukselt', metin: 'Yükselt', ton: 'hayalet', veri: esyaVeri(e), ipucu: `Sv.${yuk.nextLevel}: ${sayi(yuk.ironCost)} demir, ${sayi(yuk.woodCost)} odun, ${sayi(yuk.coalCost || 0)} kömür, ${sayi(yuk.stoneCost || 0)} taş, ${sayi(yuk.fragmentCost)} parça, ${sayi(yuk.adAstraCost)} ASTRA` }) : ''
      );
    return `<article class="ek-esya${e.source === 'soldier' ? ' is-takili' : ''}">
      <div class="ek-esya-ust"><span class="ek-yuva-simge">${simgeYuva(e.slotKey, it)}</span>
        <span class="ek-secici-ana"><b>${esc(it.name)}</b><small>${K.YUVA_AD[e.slotKey]} · Sv.${it.level || 1} · ${esc(istatMetni(it))}</small></span></div>
      ${cubuk(d.pct, { ton: d.ton === 'kotu' ? 'kotu' : '' })}
      <small class="ek-kucuk"><span class="ek-ton-${d.ton}">${d.cur}/${d.max} dayanıklılık</span> · ${sahibi}${oneri ? ` · öneri: ${oneri.idx + 1}. asker, ${esc(askerler(b)[oneri.idx].name)}` : ''}</small>
      ${eylemler}</article>`;
  }).join('');

  const yuvaCipleri = [['hepsi', 'Tümü', sayim('hepsi')], ...K.YUVALAR.map((y) => [y, `${K.YUVA_SIMGE[y]} ${K.YUVA_AD[y]}`, sayim(y)])]
    .map(([id, ad, adet]) => `<button type="button" class="ek-cip${s.cYuva === id ? ' is-secili' : ''}" data-e="cYuva" data-yuva="${id}">${ad} <span>${adet}</span></button>`).join('');
  const nerede = C_NEREDE.map(([id, ad]) => `<button type="button" class="ek-cip${s.cNerede === id ? ' is-secili' : ''}" data-e="cNerede" data-nerede="${id}">${ad}</button>`).join('');

  return [
    kart({
      baslik: '🗃️ Cephanelik',
      icerik: izgara([hucre('Eşya', sayi(esyalar.length)), hucre('Boşta', sayi(bosta)), hucre('Askerlerde', sayi(esyalar.length - bosta))])
        + dugmeler(
          dugme({ e: 'doldur', metin: 'Boş yuvaları doldur', ton: 'birincil' }),
          dugme({ e: 'onarHepsi', metin: 'Hepsini onar' }),
          dugme({ e: 'erit', metin: 'Seviye 1 fazlalıkları erit', ipucu: 'Boştaki seviye 1 fazlalıklar parçaya çevrilir' }),
          dugme({ e: 'soyHepsi', metin: 'Hepsini soy', ton: 'hayalet' })
        )
    }),
    `<div class="ek-arac"><div class="ek-cipler">${yuvaCipleri}</div>
      <div class="ek-cipler">${nerede}</div>
      <label class="ek-etiketli">Sırala
        <select id="kisla-csirala" class="ek-girdi" data-e-degis="cSirala" aria-label="Sırala">${C_SIRALAR.map(([v, ad]) => `<option value="${v}"${s.cSirala === v ? ' selected' : ''}>${ad}</option>`).join('')}</select>
      </label></div>`,
    liste.length
      ? `<div class="ek-esyalar">${kartlar}</div>`
      : bos('📭', esyalar.length ? 'Bu süzgece uyan eşya yok.' : 'Henüz eşyan yok.', esyalar.length ? '' : "Demirhane'de silah ve zırh dövebilirsin."),
    liste.length > gosterilen.length ? dugmeler(dugme({ e: 'daha', metin: `Daha fazla göster (${gosterilen.length}/${liste.length})` })) : ''
  ].join('');
}

// Eşyayı (boşta ya da başka askerde) hedef askere tak
async function ver(b, ref, hedef) {
  const gs = b.gameState;
  let kaynak = ref.kaynak;
  let depo = ref.depo;
  if (kaynak === 'soldier') {
    const r = await gs.unequipSoldierToArmory(ref.asker, ref.yuva);
    if (!r || !r.success) { bildirSonuc(b, r); return; }
    kaynak = 'armory';
    depo = (gs.state.armoryInventory || []).length - 1;   // çıkarılan eşya deponun sonuna eklenir
  }
  bildirSonuc(b, await gs.equipSoldierFromDepot(hedef, { source: kaynak, slotKey: ref.yuva, armoryIndex: depo }));
}

const sayiOrNull = (v) => (v === '' || v == null ? null : Number(v));
const esyaRef = (el) => ({ kaynak: el.dataset.kaynak, yuva: el.dataset.yuva, depo: sayiOrNull(el.dataset.depo), asker: sayiOrNull(el.dataset.asker) });

const ekran = {
  id: 'kisla',
  kilit: 'barracks',
  canliYenile: true,
  ornekSecenekler: () => [{ sekme: 'ordu' }, { sekme: 'ordu', secici: 'weapon' }, { sekme: 'cephanelik' }],
  baslik: () => ['⚔️', 'Kışla'],

  govde(b, secenek) {
    const s = durum(secenek);
    const gs = b.gameState.state;
    const bosta = (gs.armoryInventory || []).filter(Boolean).length + K.YUVALAR.filter((y) => (gs.equipment || {})[y]).length;
    const sekmeAdlari = SEKMELER.map((t) => ({ ...t, ad: t.id === 'ordu' ? `Ordu · ${askerler(b).length}` : `Cephanelik · ${bosta} boşta` }));
    return kap(sekmeler(sekmeAdlari, s.sekme, 'sekme') + (s.sekme === 'cephanelik' ? cephanelikSekmesi(b, s) : orduSekmesi(b, s)));
  },

  // Ad düzenlenirken kutuya odaklanır; Enter kaydeder, Esc vazgeçer (panelin Esc ile kapanmasını engeller)
  sonra(b, secenek, kok) {
    const s = durum(secenek);
    if (s.kaydir) {
      s.kaydir = false;
      const hedef = kok.querySelector(s.kaydirHedef || '#kisla-sayfa');
      if (hedef && hedef.scrollIntoView) hedef.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      s.kaydirHedef = null;
    }
    const girdi = kok.querySelector('#input-soldier-rename');
    if (!girdi || girdi.dataset.hazir) return;
    girdi.dataset.hazir = '1';
    if (document.activeElement !== girdi) { girdi.focus(); girdi.select(); }
    girdi.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); kok.querySelector('[data-e="adKaydet"]')?.click(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); kok.querySelector('[data-e="adVazgec"]')?.click(); }
    }, true);
  },

  degisimler: {
    sirala(b, el, s) { durum(s).sirala = el.value; },
    cSirala(b, el, s) { durum(s).cSirala = el.value; }
  },

  girdiler: {
    // Arama kutusu yazıldıkça yalnız liste yenilenir (odak ve kaydırma bozulmaz)
    ara(b, el, s, kok) {
      durum(s).q = el.value;
      const kutu = kok.querySelector('#kisla-liste');
      if (kutu) kutu.innerHTML = orduSatirlari(b, s);
    }
  },

  eylemler: {
    sekme(b, el, s) { durum(s).sekme = el.dataset.sekme; kalici.sekme = s.sekme; s.tasi = null; },
    sec(b, el, s) {
      durum(s).secili = Number(el.dataset.idx);
      kalici.secili = s.secili;
      s.adDuzenle = null;
      s.secici = null;
      if (typeof window !== 'undefined' && window.innerWidth < 760) s.kaydir = true;   // dar ekranda liste üstte, sayfa altta: seçilince sayfaya inilir
    },
    filtre(b, el, s) { durum(s).filtre = el.dataset.filtre; },
    secici(b, el, s) {
      durum(s).secici = s.secici === el.dataset.yuva ? null : el.dataset.yuva;
      s.seciciKimin = s.secili;
      if (s.secici) { s.kaydir = true; s.kaydirHedef = '#kisla-secici'; }
    },
    seciciKapat(b, el, s) { durum(s).secici = null; },

    async tak(b, el, s) {
      const r = bildirSonuc(b, await b.gameState.equipSoldierFromDepot(durum(s).secili, { source: el.dataset.kaynak, slotKey: el.dataset.yuva, armoryIndex: sayiOrNull(el.dataset.depo) }));
      if (r && r.success) s.secici = null;
    },
    async cikar(b, el, s) { bildirSonuc(b, await b.gameState.unequipSoldierToArmory(durum(s).secili, el.dataset.yuva)); },
    async onar(b, el, s) { bildirSonuc(b, await b.gameState.repairEquipment(el.dataset.yuva, durum(s).secili)); },
    async doyur(b, el, s) { bildirSonuc(b, await b.gameState.instantHealSoldierUnit(durum(s).secili)); },
    async otla(b, el, s) { bildirSonuc(b, await b.gameState.healSoldierWithHerb(durum(s).secili)); },
    async parsomen(b, el, s) {
      const a = askerler(b)[durum(s).secili];
      bildirSonuc(b, await b.gameState.useScroll('scroll_heal', a && a.id != null ? a.id : s.secili));
    },
    async saf(b, el, s) {
      const a = askerler(b)[durum(s).secili];
      bildirSonuc(b, await b.gameState.setSoldierRow(s.secili, a && a.row === 'back' ? 'front' : 'back'));
    },

    adDuzenle(b, el, s) { durum(s).adDuzenle = s.secili; },
    adVazgec(b, el, s) { durum(s).adDuzenle = null; },
    async adKaydet(b, el, s) {
      const girdi = document.getElementById('input-soldier-rename');
      const r = bildirSonuc(b, await b.gameState.renameSoldierUnit(durum(s).secili, girdi ? girdi.value : ''));
      if (r && r.success) s.adDuzenle = null;
    },

    async hazirla(b) {
      const gs = b.gameState;
      const h = await gs.instantHealAllSoldiers();
      const e = await gs.autoEquipBest();
      b.bildir([h && h.message, e && e.message].filter(Boolean).join(' · ') || 'Ordu hazır.', (h && h.success) || (e && e.success) ? 'success' : 'info');
    },
    async doldur(b) { bildirSonuc(b, await b.gameState.autoEquipBest()); },
    async hepsiniDoyur(b) { bildirSonuc(b, await b.gameState.instantHealAllSoldiers()); },
    async yeniAsker(b) { bildirSonuc(b, await b.gameState.buySoldierUnit()); },
    async soyHepsi(b) {
      const tamam = await onay({ baslik: 'Hepsi soyulsun mu?', metin: 'Bütün askerlerin eşyaları depoya döner.', tamam: 'Soy', tehlikeli: true });
      if (!tamam) return false;
      bildirSonuc(b, await b.gameState.unequipAllSoldiers());
      return undefined;
    },
    async onarHepsi(b) { bildirSonuc(b, await b.gameState.repairAllEquipmentInKingdom()); },
    async erit(b) {
      const r = await b.gameState.scrapAllLowTierEquipment(1);
      if (r && r.success) return { git: 'hurda', secenek: { rapor: r } };
      b.bildir((r && r.message) || 'Eritilecek eşya yok.', 'info');
      return undefined;
    },

    async taktik(b, el) { bildirSonuc(b, await b.gameState.applyCombatPreset(Number(el.dataset.no))); },
    async taktikKaydet(b) {
      const st = b.gameState.state;
      bildirSonuc(b, await b.gameState.saveCombatPreset((st.combatPresets && st.combatPresets.activePresetId) || 1));
    },

    cYuva(b, el, s) { durum(s).cYuva = el.dataset.yuva; s.cLimit = CEPHANELIK_ADIM; },
    cNerede(b, el, s) { durum(s).cNerede = el.dataset.nerede; s.cLimit = CEPHANELIK_ADIM; },
    daha(b, el, s) { durum(s).cLimit += CEPHANELIK_ADIM; },
    tasi(b, el, s) { durum(s).tasi = el.dataset.anahtar; },
    tasiIptal(b, el, s) { durum(s).tasi = null; },
    async tasiGit(b, el, s) {
      const secim = document.getElementById('kisla-tasi-hedef');
      durum(s).tasi = null;
      if (!secim || secim.value === '') return;
      await ver(b, esyaRef(el), Number(secim.value));
    },
    async ver(b, el) { await ver(b, esyaRef(el), Number(el.dataset.hedef)); },
    async cCikar(b, el) {
      const r = esyaRef(el);
      bildirSonuc(b, await b.gameState.unequipSoldierToArmory(r.asker, r.yuva));
    },
    async yukselt(b, el) {
      const r = esyaRef(el);
      bildirSonuc(b, await b.gameState.upgradeAnyEquipment({ source: r.kaynak, slotKey: r.yuva, armoryIndex: r.depo, soldierIndex: r.asker }));
    }
  }
};

export default ekranKaydet(ekran);
