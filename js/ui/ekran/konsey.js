// Realm of AdAstra — Sirius Konseyi ekranı: üretim düzeni (kota termostatı, ağırlık), Madencilik Otoritesi,
// Konsey projeleri ve ortak kasa. Hammadde ve emek katkıları buradan yapılır.
import { ekranKaydet, kap, kart, cubuk, dugme, not, izgara, etiket, simge, tam, sayi, esc } from './cekirdek.js';
import { kaynakSimgesi, kaynakAdi } from './bilesik.js';

const emekAdi = '💪 Emek';

function katkiSatiri(b, anahtar, mevcut, gereken) {
  const etiketMetni = anahtar === 'labor' ? emekAdi : kaynakAdi(b, anahtar);
  return `<div class="ek-satir"><span>${esc(etiketMetni)}</span><b>${esc(tam(mevcut))} / ${esc(tam(gereken))}</b></div>`;
}

// Hammadde katkısı: miktar kutusu + "ver" düğmesi
function hammaddeKatkisi(b, hedef, key) {
  const elde = Math.floor(Number(b.gameState.state.inventory[key]) || 0);
  return `<div class="ek-alan-satiri">
    <input type="number" class="ek-girdi ek-girdi-dar" min="1" max="${elde}" value="${Math.floor(elde / 2)}" inputmode="numeric"
      id="katki-${esc(hedef)}-${esc(key)}" aria-label="${esc(kaynakAdi(b, key))} miktarı (elinde ${elde})">
    ${dugme({ e: 'katki', metin: `${esc(kaynakAdi(b, key))} ver`, veri: { hedef, kaynak: key }, devreDisi: elde < 1 })}
  </div>`;
}

function emekKatkisi(hedef, emek) {
  const tamEmek = Math.floor(emek);
  return dugme({ e: 'katki', metin: `${emekAdi} ver (hepsi: ${tam(tamEmek)})`, veri: { hedef, kaynak: 'labor' }, devreDisi: tamEmek < 1 });
}

function uretimKarti(b, us, ortakKasa) {
  const kaynaklar = b.GAME_CONFIG.RESOURCE_KEYS.map((k) => {
    const hak = us.rights[k];
    return `<div class="ek-hucre"><small>${simge(kaynakSimgesi(b, k), true)} ${esc(kaynakAdi(b, k))}</small>
      <b>${esc(tam(hak.used))} / ${esc(tam(hak.weekly))}</b>
      <small>kota %${esc(Math.round((hak.qpp || 0) * 100))} · ortak kasa ${esc(tam(ortakKasa[k] || 0))}</small></div>`;
  });
  return kart({
    baslik: '🏛️ Üretim düzeni ve ortak kasa',
    rozet: etiket(`Otorite sv.${us.otorite.level} · ${Math.round(us.otorite.hours)} sa × ${Math.round(us.otorite.days)} gün`),
    icerik: not(`Kişi başı kota (termostat): her hafta kaynağın fiyatı açılışın üstündeyse +%10, altındaysa −%10 (0,05-1,0). Senin ağırlığın ×${esc(us.weight.weight)} (seviye ×${esc(us.weight.levelFactor)} · katkı kademesi ${esc(us.weight.tier.name)} ×${esc(us.weight.tier.mult)} · aktiflik ×${esc(us.weight.activity)}). Dünya ağırlık toplamı: ${esc(sayi(us.params.sumWeight || 1))}. Çıkarılan her hammaddenin %5'i ortak kasada birikir.`)
      + izgara(kaynaklar, { genis: true })
  });
}

// "taş %30, kömür %20, …" biçiminde karışım yazısı (yapılandırmadan)
function karisimYazisi(b, mix) {
  return Object.entries(mix || {})
    .sort((a, c) => c[1] - a[1])
    .map(([k, pay]) => `${kaynakAdi(b, k).toLocaleLowerCase('tr')} %${Math.round(pay * 100)}`)
    .join(', ');
}

function otoriteKarti(b) {
  const ot = b.globalPool.getOtoriteStatus();
  const gerekenler = Object.keys(ot.need);
  const icerik = [
    not(`Her seviye: kapasite ve herkesin hakkı +%${Math.round(ot.perLevelBonus * 100)}, çalışma ${ot.hours} sa × ${ot.days} gün → ${ot.nextHours} sa × ${ot.nextDays} gün. Karışım: ${karisimYazisi(b, ot.mix)} (kömür çeliğin payıdır). Ortak kasa payı (çıkarılan her hammaddenin %5'i) buraya ve etkin projeye kendiliğinden eklenir.`),
    ot.maxed ? '' : cubuk(ot.pct, { renk: '#a78bfa' }),
    ...(ot.maxed ? [] : gerekenler.map((k) => katkiSatiri(b, k, ot.progress[k] || 0, ot.need[k]))),
    ...(ot.maxed ? [] : gerekenler.map((k) => hammaddeKatkisi(b, 'otorite', k)))
  ].join('');
  return kart({
    baslik: `⛏️ Madencilik Otoritesi: seviye ${ot.level}${ot.maxed ? ' (en üst)' : ` → ${ot.level + 1}`}`,
    icerik
  });
}

function projeKarti(b) {
  const pj = b.globalPool.getProjectStatus();
  const emek = b.gameState.getVillageInfo().labor;
  if (!pj.active) {
    return kart({
      baslik: '✅ Bütün Konsey projeleri bitti',
      icerik: pj.done.length ? not(`Biten: ${pj.done.map((d) => esc(`${d.icon} ${d.name}`)).join(', ')}`) : ''
    });
  }
  const gerekenler = Object.keys(pj.need);
  return kart({
    baslik: `${esc(pj.active.icon)} Konsey projesi: ${esc(pj.active.name)}`,
    icerik: [
      not(`${esc(pj.active.desc)} Gereken: ${tam(pj.active.units)} birim hammadde (${karisimYazisi(b, pj.mix)}) + ${tam(pj.active.labor)} emek. Senin emek puanın: ${tam(emek)}.`),
      cubuk(pj.pct, { renk: '#63b0ff' }),
      ...gerekenler.map((k) => katkiSatiri(b, k, pj.progress[k] || 0, pj.need[k])),
      katkiSatiri(b, 'labor', pj.labor, pj.active.labor),
      ...gerekenler.map((k) => hammaddeKatkisi(b, 'project', k)),
      emekKatkisi('project', emek),
      pj.done.length ? not(`<span class="ek-iyi">Biten: ${pj.done.map((d) => esc(`${d.icon} ${d.name}`)).join(', ')}</span>`) : ''
    ].join('')
  });
}

const ekran = {
  id: 'konsey',
  canliYenile: false,   // miktar kutuları yazılırken yeniden çizim olmasın; eylemlerden sonra çizilir
  baslik: () => ['🏛️', 'Sirius Konseyi'],

  govde(b) {
    const gs = b.gameState;
    const us = gs.getUretimSummary ? gs.getUretimSummary() : null;
    if (!us) return kap(kart({ icerik: not('Konsey bilgisi şu an alınamıyor.') }));
    const ortakKasa = b.globalPool.getKonseyStock ? b.globalPool.getKonseyStock() : {};
    return kap([uretimKarti(b, us, ortakKasa), otoriteKarti(b), projeKarti(b), dugme({ e: 'hazine', metin: '🏦 Oyun kasaları (Hazine)', ton: 'hayalet', genis: true })].join(''));
  },

  eylemler: {
    // Haritadaki Konsey binası ve menü aynı ekranı açar (19 Ekim 2026); ASTRA kasaları ayrı ekranda (Hazine)
    hazine() { return { git: 'hazine' }; },
    katki(b, el) {
      const gs = b.gameState;
      const { hedef, kaynak } = el.dataset;
      let r;
      if (kaynak === 'labor') {
        r = gs.contributeToProject({}, Math.floor(gs.getVillageInfo().labor));
      } else {
        const girdi = document.getElementById(`katki-${hedef}-${kaynak}`);
        const elde = Math.floor(gs.state.inventory[kaynak] || 0);
        const yazilan = girdi ? Math.floor(Number(girdi.value)) : NaN;
        const miktar = Number.isFinite(yazilan) && yazilan > 0 ? Math.min(yazilan, elde) : Math.floor(elde / 2);
        if (!(miktar > 0)) { b.bildir('Geçerli bir miktar yaz.', 'error'); return false; }
        r = hedef === 'otorite' ? gs.contributeToOtorite({ [kaynak]: miktar }) : gs.contributeToProject({ [kaynak]: miktar }, 0);
      }
      b.bildir(r.message, r.success ? 'success' : 'error');
      return undefined;
    }
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
