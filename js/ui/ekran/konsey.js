// Realm of AdAstra — Sirius Konseyi ekranı: üretim düzeni (kota termostatı, ağırlık), Madencilik Otoritesi,
// Konsey projeleri ve ortak kasa. Hammadde ve emek katkıları buradan yapılır.
import { ekranKaydet, kap, kart, katli, cubuk, dugme, not, izgara, etiket, simge, tam, sayi, esc } from './cekirdek.js';
import { kaynakSimgesi, kaynakAdi } from './bilesik.js';
import { onay } from '../v3/bilesenler.js';

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

// Sade anlatım (19 Ekim 2026): Konsey ne işe yarar, yatırım yapmak sana ne kazandırır. Rakamlar aşağıdaki "ayrıntı" bölümlerinde.
function girisKarti(b, us) {
  const kademe = us && us.weight && us.weight.tier ? us.weight.tier : null;
  const kademeMetni = kademe && kademe.id !== 'none'
    ? `Şu an katkı kademen <b>${esc(kademe.name)}</b>: haftalık hammadde çıkarma hakkın %${esc(Math.round((kademe.mult - 1) * 100))} büyük.`
    : 'Henüz hiç katkın yok. İlk katkıyla birlikte kademe kazanmaya başlarsın.';
  return kart({
    baslik: '🏛️ Konsey ne işe yarar?',
    vurgu: 'vurgu',
    icerik: not('<b>Sirius Konseyi, bütün oyuncuların birlikte kurduğu ortak şantiyedir.</b> Herkes biraz hammadde (ya da ASTRA) verir, büyük binalar birlikte yapılır. Bir bina bitince <b>herkes</b> bedava fayda kazanır: sen vermiş de olsan, başkası vermiş de olsan.')
      + not('<b>Sana faydası:</b>')
      + not('⛏️ <b>Madencilik Otoritesi</b> büyüdükçe herkesin haftalık hammadde çıkarma hakkı %5 artar ve çalışma süresi uzar. Yani daha çok hammadde çıkarırsın.')
      + not('🏗️ <b>Projeler</b> (köprü, ambar, şifa bahçesi, rıhtım, duvar) sefer süresini kısaltır, silonu büyütür, şifalı ot üretimini artırır.')
      + not('🎖️ <b>Sen katkı yaptıkça</b> katkı kademen yükselir (Bronz → Gümüş → Altın → Platin → Elmas) ve haftalık çıkarma hakkın büyür. Çok veren daha çok kazanır.')
      + not(kademeMetni)
      + not('<b>Nasıl katkı yaparım?</b> Elindeki hammaddeyi verebilirsin ya da aşağıdaki "⚡ Hızlı katkı"ya ASTRA yazarsın, gerisini oyun halleder. Büyük işler tek kişiyle bitmez; herkes biraz verir.')
  });
}

function uretimKarti(b, us, ortakKasa) {
  const kaynaklar = b.GAME_CONFIG.RESOURCE_KEYS.map((k) => {
    const hak = us.rights[k];
    return `<div class="ek-hucre"><small>${simge(kaynakSimgesi(b, k), true)} ${esc(kaynakAdi(b, k))}</small>
      <b>${esc(tam(hak.used))} / ${esc(tam(hak.weekly))}</b>
      <small>kota %${esc(Math.round((hak.qpp || 0) * 100))} · ortak kasa ${esc(tam(ortakKasa[k] || 0))}</small></div>`;
  });
  return kart({
    baslik: '📊 Bu haftaki çıkarma hakkın',
    rozet: etiket(`Otorite sv.${us.otorite.level}`),
    icerik: not('Her hammaddeden bu hafta ne kadar çıkarabileceğin (kullandığın / toplam hakkın). Hakkın seviyene, katkı kademene ve ne kadar aktif olduğuna göre büyür.')
      + katli('Nasıl hesaplanıyor? (ayrıntı)', not(`Kişi başı kota (termostat): her hafta kaynağın fiyatı açılışın üstündeyse +%10, altındaysa −%10 (0,05-1,0). Senin ağırlığın ×${esc(us.weight.weight)} (seviye ×${esc(us.weight.levelFactor)} · katkı kademesi ${esc(us.weight.tier.name)} ×${esc(us.weight.tier.mult)} · aktiflik ×${esc(us.weight.activity)}). Dünya ağırlık toplamı: ${esc(sayi(us.params.sumWeight || 1))}. Çıkarılan her hammaddenin %5'i ortak kasada birikir.`), { k: 'konsey-uretim-detay' })
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
    not(ot.maxed ? 'Madencilik Otoritesi en üst seviyede. Herkes tam fayda alıyor.' : `Bu bina bitince <b>herkesin</b> haftalık hammadde hakkı %${Math.round(ot.perLevelBonus * 100)} büyür ve çalışma süresi uzar. Şu an <b>%${Math.round(ot.pct)}</b> tamamlandı.`),
    katli('Neler gerekiyor? (ayrıntı)', not(`Her seviye: kapasite ve herkesin hakkı +%${Math.round(ot.perLevelBonus * 100)}, çalışma ${ot.hours} sa × ${ot.days} gün → ${ot.nextHours} sa × ${ot.nextDays} gün. Karışım: ${karisimYazisi(b, ot.mix)} (kömür çeliğin payıdır). Ortak kasa payı (çıkarılan her hammaddenin %5'i) buraya ve etkin projeye kendiliğinden eklenir.`)
      + (ot.maxed ? '' : gerekenler.map((k) => katkiSatiri(b, k, ot.progress[k] || 0, ot.need[k])).join('')), { k: 'konsey-otorite-detay' }),
    ot.maxed ? '' : cubuk(ot.pct, { renk: '#a78bfa' }),
    ...(ot.maxed ? [] : [katli('Hammadde ver (elindekinden)', gerekenler.map((k) => hammaddeKatkisi(b, 'otorite', k)).join(''), { k: 'konsey-otorite-ver' })])
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
      not(`<b>Bitince herkese faydası:</b> ${esc(pj.active.desc)} Şu an <b>%${Math.round(pj.pct)}</b> tamamlandı.`),
      cubuk(pj.pct, { renk: '#63b0ff' }),
      katli('Neler gerekiyor? (ayrıntı)', not(`Gereken: ${tam(pj.active.units)} birim hammadde (${karisimYazisi(b, pj.mix)}) + ${tam(pj.active.labor)} emek. Senin emek puanın: ${tam(emek)}.`)
        + gerekenler.map((k) => katkiSatiri(b, k, pj.progress[k] || 0, pj.need[k])).join('') + katkiSatiri(b, 'labor', pj.labor, pj.active.labor), { k: 'konsey-proje-detay' }),
      katli('Hammadde ve emek ver', gerekenler.map((k) => hammaddeKatkisi(b, 'project', k)).join('') + emekKatkisi('project', emek), { k: 'konsey-proje-ver' }),
      pj.done.length ? not(`<span class="ek-iyi">Biten: ${pj.done.map((d) => esc(`${d.icon} ${d.name}`)).join(', ')}</span>`) : ''
    ].join('')
  });
}

// ⚡ Hızlı katkı: ASTRA bütçesini yaz, eksik hammaddeler pazardan alınıp Otorite'ye ya da etkin projeye yatırılsın
function hizliKatkiKarti(b) {
  const gs = b.gameState;
  const bakiye = Math.floor(Number(gs.state.adAstraBalance) || 0);
  const ot = gs.konseyHizliPlan('otorite', Math.max(1, bakiye));
  const pj = gs.konseyHizliPlan('proje', Math.max(1, bakiye));
  return kart({
    baslik: '⚡ Hızlı katkı: ASTRA harca, hemen yatır',
    icerik: [
      not('En kolay yol: kaç ASTRA harcamak istediğini yaz, bir düğmeye bas. Oyun gereken hammaddeyi pazardan senin yerine alır ve hemen Konsey\'e yatırır. Katkı kademene de puan yazılır.'),
      `<div class="ek-alan-satiri"><input type="number" class="ek-girdi ek-girdi-dar" min="1" max="${bakiye}" value="${Math.max(1, Math.min(1000, bakiye))}" inputmode="numeric" id="hizli-butce" aria-label="ASTRA bütçesi (bakiyen ${bakiye})"><small>ASTRA (bakiyen ${esc(tam(bakiye))})</small></div>`,
      dugme({ e: 'hizliKatki', metin: '⛏️ Otorite\'ye yatır', veri: { hedef: 'otorite' }, devreDisi: !ot.ok || bakiye < 1, genis: true }),
      dugme({ e: 'hizliKatki', metin: '🏗️ Etkin projeye yatır', veri: { hedef: 'proje' }, devreDisi: !pj.ok || bakiye < 1, genis: true })
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
    return kap([girisKarti(b, us), hizliKatkiKarti(b), otoriteKarti(b), projeKarti(b), uretimKarti(b, us, ortakKasa), dugme({ e: 'hazine', metin: '🏦 Oyun kasaları (Hazine)', ton: 'hayalet', genis: true })].join(''));
  },

  eylemler: {
    // Haritadaki Konsey binası ve menü aynı ekranı açar (19 Ekim 2026); ASTRA kasaları ayrı ekranda (Hazine)
    hazine() { return { git: 'hazine' }; },
    async hizliKatki(b, el) {
      const gs = b.gameState;
      const hedef = el.dataset.hedef;
      const girdi = document.getElementById('hizli-butce');
      const butce = Math.floor(Number(girdi && girdi.value));
      if (!(butce > 0)) { b.bildir('Geçerli bir ASTRA tutarı yaz.', 'error'); return false; }
      const plan = gs.konseyHizliPlan(hedef, butce);
      if (!plan.ok) { b.bildir(plan.reason || 'Alım yapılamıyor.', 'error'); return false; }
      const liste = plan.items.map((i) => `• ${tam(i.qty)} ${i.name} (~${tam(Math.ceil(i.cost))} ASTRA)`).join('\n');
      const tamam = await onay({ baslik: `${hedef === 'otorite' ? 'Otorite' : 'Proje'} için pazardan alınıp yatırılsın mı?`, metin: `${liste}\nİlk tur ~${tam(Math.ceil(plan.total))} ASTRA (bütçe ${tam(butce)} ASTRA; kalanla ek turlar yapılır)`, tamam: 'Al ve yatır' });
      if (!tamam) return false;
      const r = await gs.konseyHizliKatki(hedef, butce);
      b.bildir(r.message, r.success ? 'success' : 'error');
      return undefined;
    },
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
