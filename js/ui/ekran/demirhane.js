// Realm of AdAstra — Demirhane ekranı: yeni eşya dövme ve eşyalarım (cephanelik): geliştirme, onarım, kuşanma, geri dönüşüm, pazara koyma.
import {
  ekranKaydet, kap, kart, katli, sekmeler, dugme, dugmeler, not, bos, izgara, simge, etiket, tam, astra, esc
} from './cekirdek.js';
import { equipImg } from '../art.js';
import { maliyetSatiri, planBedeli, hizliOnar } from './bilesik.js';
import { onay } from '../v3/bilesenler.js';

const YUVALAR = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
const YUVA_ADLARI = { weapon: 'Silah', helmet: 'Miğfer', armor: 'Gövde zırhı', legs: 'Pantolon', boots: 'Ayakkabı' };
const YUVA_KISA = { weapon: '🗡️ Silah', helmet: '🪖 Miğfer', armor: '🛡️ Zırh', legs: '👖 Pantolon', boots: '👢 Bot' };
const SIRALAR = [
  ['level_desc', 'En yüksek seviyeden başla'],
  ['level_asc', 'En düşük seviyeden başla'],
  ['durability_asc', 'Hasarlılar önce']
];
const EN_FAZLA_SEVIYE = 5;

// Seçili durum (sekme, süzgeç, sıralama...) ekran yeniden çizilirken aynı kalır
function durum(secenek) {
  secenek.sekme = secenek.sekme || 'dov';
  secenek.kategori = secenek.kategori || 'all';
  secenek.sirala = secenek.sirala || 'level_desc';
  secenek.grupYuva = secenek.grupYuva || 'weapon';
  secenek.grupSeviye = secenek.grupSeviye || 1;
  return secenek;
}

const ref = (g) => ({ source: g.source, slotKey: g.slotKey, armoryIndex: g.armoryIndex ?? null, soldierIndex: g.soldierIndex ?? null });

function dovmeKarti(b, yuva) {
  const gs = b.gameState;
  const tarif = b.GAME_CONFIG.EQUIPMENT_RECIPES[yuva];
  const bedel = gs.calculateEquipmentCraftCost(yuva);
  const env = gs.state.inventory;
  const kap_ = gs.getWarehouseCapacity();
  const yeter = (env.iron || 0) >= bedel.ironCost && (env.wood || 0) >= bedel.woodCost && (env.coal || 0) >= (bedel.coalCost || 0)
    && (env.fragments || 0) >= bedel.fragCost && gs.state.adAstraBalance >= bedel.adaCost;
  const siloUyari = (k, gerek) => (kap_[k] != null && gerek > kap_[k] ? ' <span class="ek-uyari-renk" title="Silon bu kadar alamıyor">⚠ silo</span>' : '');

  let dugme_;
  if (yeter) {
    dugme_ = dugme({ e: 'dov', metin: `🔨 ${YUVA_ADLARI[yuva]} döv`, ton: 'iyi', veri: { yuva }, genis: true });
  } else {
    const plan = gs.getQuickBuyPlan('craft:' + yuva);
    if (plan.ok) {
      dugme_ = dugme({ e: 'hizliDov', metin: `⚡ Eksikleri al ve döv · ${astra(plan.total)} ASTRA`, ton: 'iyi', veri: { yuva }, genis: true });
    } else {
      const neden = plan.capBlocked ? 'Silon bu tarif için yetersiz: önce siloyu yükselt.' : (plan.reason || 'Eksik hammadde var.');
      dugme_ = dugme({ e: 'hizliDov', metin: `⚠️ ${esc(neden)}`, devreDisi: true, genis: true });
    }
  }
  const ozellik = [tarif.baseAtk > 0 ? `⚔️ +${tam(tarif.baseAtk)} saldırı` : '', tarif.baseHp > 0 ? `❤️ +${tam(tarif.baseHp)} can` : ''].filter(Boolean).join(' · ');
  return kart({
    vurgu: yeter ? 'iyi' : '',
    icerik: `<div class="ek-oge">${simge(equipImg(yuva, tarif.icon))}
        <div class="ek-oge-govde"><b>${YUVA_ADLARI[yuva]}</b><small>${esc(ozellik)} · dayanıklılık 13/13</small></div></div>
      ${maliyetSatiri('⛏️ Demir', env.iron || 0, bedel.ironCost).replace('</b>', `${siloUyari('iron', bedel.ironCost)}</b>`)}
      ${maliyetSatiri('🌲 Odun', env.wood || 0, bedel.woodCost).replace('</b>', `${siloUyari('wood', bedel.woodCost)}</b>`)}
      ${bedel.coalCost > 0 ? maliyetSatiri('⚫ Kömür', env.coal || 0, bedel.coalCost).replace('</b>', `${siloUyari('coal', bedel.coalCost)}</b>`) : ''}
      ${maliyetSatiri('🧩 Parça', env.fragments || 0, bedel.fragCost)}
      ${maliyetSatiri('🟣 ASTRA', gs.state.adAstraBalance || 0, bedel.adaCost, { astraMi: true })}
      ${dugme_}`
  });
}

function esyaKarti(b, g, sira) {
  const gs = b.gameState;
  const esya = g.item;
  const enYuksek = (esya.level || 1) >= (b.GAME_CONFIG.EQUIPMENT_MAX_LEVEL || 10);
  const enFazla = esya.maxDurability || 13;
  const guncel = esya.durability != null ? esya.durability : enFazla;
  const hasarli = guncel < enFazla;
  const giyili = g.source === 'soldier';
  const gelistirmeBedeli = !enYuksek ? gs.calculateEquipmentUpgradeCost(esya) : null;
  const onarimBedeli = hasarli ? gs.calculateEquipmentRepairCost(esya) : null;
  const geriDonusum = gs.getRecycleValue ? gs.getRecycleValue(esya) : null;
  const veri = { sira };
  // Onarım için kaynak (odun, demir, kömür, parça, ASTRA) yetmiyorsa "eksikleri al ve onar"
  let hizliOnarma = '';
  if (onarimBedeli) {
    const env = gs.state.inventory;
    const yeterOnarim = (env.iron || 0) >= onarimBedeli.ironCost && (env.wood || 0) >= onarimBedeli.woodCost && (env.coal || 0) >= (onarimBedeli.coalCost || 0)
      && (env.fragments || 0) >= onarimBedeli.fragCost && gs.state.adAstraBalance >= onarimBedeli.adaCost;
    if (!yeterOnarim) {
      const plan = gs.getQuickBuyPlan('repair:' + sira);
      if (plan.items.length) hizliOnarma = dugme({ e: 'hizliOnar', metin: `⚡ Eksikleri al ve onar · ~${planBedeli(plan)}`, ton: 'iyi', veri, devreDisi: !plan.ok, genis: true });
    }
  }
  // Geliştirme için kaynak yetmiyorsa dövmedeki gibi "eksikleri al ve geliştir" (pazardan alım planı yapılabiliyorsa)
  let hizliGelistirme = '';
  if (gelistirmeBedeli) {
    const env = gs.state.inventory;
    const yeter = (env.iron || 0) >= gelistirmeBedeli.ironCost && (env.wood || 0) >= gelistirmeBedeli.woodCost && (env.coal || 0) >= (gelistirmeBedeli.coalCost || 0)
      && (env.stone || 0) >= (gelistirmeBedeli.stoneCost || 0) && (env.fragments || 0) >= gelistirmeBedeli.fragCost && gs.state.adAstraBalance >= gelistirmeBedeli.adaCost;
    if (!yeter) {
      const plan = gs.getQuickBuyPlan('upgrade:' + sira);
      if (plan.ok) hizliGelistirme = dugme({ e: 'hizliGelistir', metin: `⚡ Eksikleri al ve geliştir · ${astra(plan.total)} ASTRA`, ton: 'iyi', veri, genis: true });
    }
  }

  const ozellik = [esya.atkBonus > 0 ? `⚔️ +${tam(esya.atkBonus)} saldırı` : '', esya.hpBonus > 0 ? `❤️ +${tam(esya.hpBonus)} can` : ''].filter(Boolean).join(' · ');
  const ikinci = [];
  if (b.online && b.online.active) ikinci.push(dugme({ e: 'sat', metin: '🏷️ Pazara koy', veri }));
  if (geriDonusum) {
    ikinci.push(dugme({ e: 'geriDonustur', metin: `♻️ Geri dönüştür (${tam(geriDonusum.wood)}🌲 ${tam(geriDonusum.iron)}⛏️${geriDonusum.coal ? ` ${tam(geriDonusum.coal)}⚫` : ''})`, veri }));
  }
  if (giyili) ikinci.push(dugme({ e: 'cikar', metin: '↩️ Askerden çıkar', veri }));

  return kart({
    vurgu: giyili ? 'iyi' : '',
    icerik: `<div class="ek-oge">${simge(esc(esya.icon || '⚔️'))}
        <div class="ek-oge-govde"><b>${esc(esya.name)} <span class="ek-etiket">Seviye ${tam(esya.level || 1)}</span></b>
          <small>${esc(ozellik)}</small>
          <small class="${guncel <= 4 ? 'ek-kotu' : ''}">🛡️ Dayanıklılık ${tam(guncel)}/${tam(enFazla)} · 📍 ${esc(g.locationLabel)}</small>
        </div></div>
      ${gelistirmeBedeli ? `<p class="ek-kucuk">✨ Seviye ${tam((esya.level || 1) + 1)} bedeli: ${tam(gelistirmeBedeli.ironCost)}⛏️ · ${tam(gelistirmeBedeli.woodCost)}🌲 · ${tam(gelistirmeBedeli.coalCost || 0)}⚫ · ${tam(gelistirmeBedeli.stoneCost || 0)}🪨 · ${tam(gelistirmeBedeli.fragCost)}🧩 · ${astra(gelistirmeBedeli.adaCost)}🟣</p>` : ''}
      ${onarimBedeli ? `<p class="ek-kucuk">🔧 Onarım bedeli: ${tam(onarimBedeli.ironCost)}⛏️ · ${tam(onarimBedeli.woodCost)}🌲 · ${tam(onarimBedeli.coalCost || 0)}⚫ · ${tam(onarimBedeli.fragCost || 0)}🧩 · ${astra(onarimBedeli.adaCost)}🟣</p>` : ''}
      ${hizliOnarma}
      ${hizliGelistirme}
      ${dugmeler(
        !enYuksek ? dugme({ e: 'gelistir', metin: '⬆️ Geliştir', ton: 'birincil', veri }) : etiket('🏆 en yüksek seviye', 'vurgu'),
        hasarli ? dugme({ e: 'onar', metin: '🔧 Onar', veri }) : '',
        giyili ? '' : dugme({ e: 'giydir', metin: '🛡️ Askerime giydir', ton: 'iyi' })
      )}
      ${ikinci.length ? katli('Diğer', `<div class="ek-dugmeler">${ikinci.join('')}</div>`, { k: `diger-${sira}` }) : ''}`
  });
}

function satisFormu(b, secenek, liste) {
  const g = liste[secenek.satis];
  if (!g) return '';
  return kart({
    vurgu: 'vurgu',
    baslik: `🏷️ ${esc(g.item.name)} pazara konsun`,
    icerik: not('Komisyon %2; ilan 7 gün sürer, satılmazsa eşya sana döner.')
      + `<label class="ek-alan"><span>Fiyat (ASTRA)</span><input type="number" id="fiyat-giris" class="ek-girdi" min="0.001" step="any" value="1" inputmode="decimal"></label>`
      + dugmeler(dugme({ e: 'satOnayla', metin: 'İlana ver', ton: 'birincil' }), dugme({ e: 'satVazgec', metin: 'Vazgeç', ton: 'hayalet' }))
  });
}

function dovSekmesi(b) {
  return `${kart({ icerik: not('Bir parça seç ve döv; eksik hammaddeyi tek tuşla pazardan alabilirsin. Askerine Kışla\'dan takarsın.') + dugme({ e: 'kisla', metin: '⚔️ Kışla → Cephanelik', ton: 'hayalet' }) })}
    ${izgara(YUVALAR.map((y) => dovmeKarti(b, y)), { genis: true })}`;
}

// Hasarlı eşyaların toplam onarım bedeli (odun, demir, kömür, parça, ASTRA) ve eksik varsa tek tuşluk "eksikleri al ve hepsini onar"
function onarimOzeti(gs, hasarlilar) {
  if (!hasarlilar.length) return '';
  const t = gs.getRepairAllCost();
  const env = gs.state.inventory;
  const yeter = (env.iron || 0) >= t.demir && (env.wood || 0) >= t.odun && (env.coal || 0) >= t.komur && (env.fragments || 0) >= t.parca && gs.state.adAstraBalance >= t.ada;
  const plan = !yeter ? gs.getQuickBuyPlan('repairall') : null;
  return `<p class="ek-kucuk">🔧 Hepsini onarmanın bedeli: ${tam(t.demir)}⛏️ · ${tam(t.odun)}🌲 · ${tam(t.komur)}⚫ · ${tam(t.parca)}🧩 · ${astra(t.ada)}🟣</p>`
    + (plan && plan.items.length ? dugme({ e: 'hizliOnarHepsi', metin: `⚡ Eksikleri al ve hepsini onar · ~${planBedeli(plan)}`, ton: 'iyi', devreDisi: !plan.ok, genis: true }) : '');
}

function esyalarSekmesi(b, secenek) {
  const gs = b.gameState;
  const tumu = gs.getAllArmoryEquipmentList();
  const hasarlilar = tumu.filter((e) => (e.item.durability ?? 13) < (e.item.maxDurability || 13));
  const sayac = Object.fromEntries(['all', ...YUVALAR].map((k) => [k, k === 'all' ? tumu.length : tumu.filter((e) => e.item.slot === k).length]));

  let liste = tumu.map((g, i) => ({ g, i })).filter(({ g }) => secenek.kategori === 'all' || g.item.slot === secenek.kategori);
  if (secenek.sirala === 'level_desc') liste.sort((a, c) => (c.g.item.level || 1) - (a.g.item.level || 1));
  else if (secenek.sirala === 'level_asc') liste.sort((a, c) => (a.g.item.level || 1) - (c.g.item.level || 1));
  else if (secenek.sirala === 'durability_asc') liste.sort((a, c) => (a.g.item.durability ?? 13) - (c.g.item.durability ?? 13));

  const suzgec = sekmeler(
    [{ id: 'all', ad: `Tümü (${sayac.all})`, simge: '🎒' }, ...YUVALAR.map((y) => ({ id: y, ad: `${YUVA_ADLARI[y]} (${sayac[y]})` }))],
    secenek.kategori, 'kategori'
  );
  const siralama = `<label class="ek-alan"><span>Sıralama</span><select class="ek-girdi" data-e-degis="sirala">${SIRALAR.map(([d, a]) => `<option value="${d}"${d === secenek.sirala ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select></label>`;

  const hizliGruplar = [['weapon', 1], ['weapon', 2], ['helmet', 1], ['armor', 1]].map(([y, s]) => {
    const n = tumu.filter((e) => e.item.slot === y && (e.item.level || 1) === s).length;
    return n > 0 ? dugme({ e: 'grup', metin: `⚡ Seviye ${s} ${YUVA_ADLARI[y]} (${n})`, veri: { yuva: y, seviye: s } }) : '';
  }).join('');
  // "Eksikleri al ve geliştir": eksik kaynak varsa tüm küme için tek tuş (eşyalar sırayla yükseltilir, eksik her seferinde alınır)
  const topluDugme = (yuva, seviye, genis) => {
    const plan = tumu.length ? gs.getQuickBuyPlan(`upgradeset:${yuva}:${seviye}`) : null;
    if (!plan || !plan.items.length) return '';
    return dugme({ e: 'hizliToplu', metin: `⚡ Eksikleri al ve geliştir · ${planBedeli(plan)}`, ton: 'iyi', devreDisi: !plan.ok, veri: { yuva, seviye }, genis });
  };
  const ozelGrup = `<div class="ek-alan-satiri">
      <select class="ek-girdi" data-e-degis="grupYuva">${YUVALAR.map((y) => `<option value="${y}"${y === secenek.grupYuva ? ' selected' : ''}>${YUVA_KISA[y]}</option>`).join('')}</select>
      <select class="ek-girdi" data-e-degis="grupSeviye">${Array.from({ length: EN_FAZLA_SEVIYE }, (_, i) => i + 1).map((s) => `<option value="${s}"${s === secenek.grupSeviye ? ' selected' : ''}>Seviye ${s}</option>`).join('')}</select>
      ${dugme({ e: 'ozelGrup', metin: '⚡ Bu grubu geliştir', ton: 'birincil', devreDisi: tumu.length === 0 })}
    </div>${topluDugme(secenek.grupYuva, secenek.grupSeviye, true)}`;

  const kartlar = liste.length === 0
    ? bos('🎒', 'Bu kategoride eşyan yok', '"Yeni eşya dök" sekmesinden ordun için yeni eşya üretebilirsin.')
    : `<div class="ek-liste">${liste.map(({ g, i }) => esyaKarti(b, g, i)).join('')}</div>`;

  return [
    secenek.satis != null ? satisFormu(b, secenek, tumu) : '',
    suzgec,
    kart({
      icerik: siralama + onarimOzeti(gs, hasarlilar) + dugmeler(
        dugme({ e: 'onarHepsi', metin: `🔨 Kırılan her şeyi onar (${hasarlilar.length})`, devreDisi: hasarlilar.length === 0 }),
        dugme({ e: 'giydir', metin: '⚡ En iyileri askerlerime giydir', ton: 'iyi', devreDisi: tumu.length === 0 })
      )
    }),
    katli('Toplu işlemler', dugmeler(
      dugme({ e: 'hepsiniGelistir', metin: '⚡ Hepsini toplu geliştir', devreDisi: tumu.length === 0 }),
      dugme({ e: 'cantayaTopla', metin: '🔄 Tümünü çantaya topla' })
    ) + topluDugme('all', '-', true), { k: 'toplu' }),
    katli('Tür ve seviyeye göre geliştir', `${hizliGruplar ? `<div class="ek-dugmeler">${hizliGruplar}</div>` : ''}${ozelGrup}`, { k: 'grup' }),
    kartlar
  ].join('');
}

const sonuc = (b, r, basarili = 'success', basarisiz = 'error') => b.bildir(r.message, r.success ? basarili : basarisiz);

const ekran = {
  id: 'demirhane',
  ornekSecenekler: () => [{ sekme: 'dov' }, { sekme: 'esyalar' }, { sekme: 'esyalar', kategori: 'weapon', sirala: 'durability_asc' }],
  kilit: 'blacksmith',
  canliYenile: true,
  baslik: () => ['⚒️', 'Demirhane'],

  govde(b, secenek) {
    const s = durum(secenek);
    const n = b.gameState.getAllArmoryEquipmentList().length;
    return kap([
      sekmeler([{ id: 'dov', ad: 'Yeni eşya dök', simge: '🔥' }, { id: 'esyalar', ad: `Eşyalarım (${n})`, simge: '🎒' }], s.sekme, 'sekme'),
      s.sekme === 'dov' ? dovSekmesi(b) : esyalarSekmesi(b, s)
    ].join(''));
  },

  eylemler: {
    sekme(b, el, secenek) { durum(secenek).sekme = el.dataset.sekme; },
    kategori(b, el, secenek) { durum(secenek).kategori = el.dataset.sekme; },
    kisla() { return { git: 'kisla' }; },

    async dov(b, el) {
      sonuc(b, await b.gameState.craftEquipment(el.dataset.yuva));
    },
    async hizliDov(b, el) {
      const gs = b.gameState;
      const yuva = el.dataset.yuva;
      const plan = gs.getQuickBuyPlan('craft:' + yuva);
      if (!plan.ok) { b.bildir(plan.reason || 'Alım yapılamıyor.', 'error'); return; }
      const liste = plan.items.map((i) => `• ${tam(i.qty)} ${i.name} (${astra(i.cost)} ASTRA)`).join('\n');
      const tamam = await onay({
        baslik: 'Eksikler alınıp eşya dövülsün mü?',
        metin: `${liste}\nAlım ${astra(plan.total)} ASTRA + dövme bedeli ${astra(plan.extraAda)} ASTRA`,
        tamam: 'Al ve döv'
      });
      if (!tamam) return;
      for (const it of plan.items) {
        const r = await gs.marketBuy(it.res, it.qty);
        if (!r || !r.success) { b.bildir(`${it.name} alınamadı: ${(r && r.message) || ''}`, 'error'); return; }
      }
      sonuc(b, await gs.craftEquipment(yuva));
    },

    async hizliGelistir(b, el) {
      const gs = b.gameState;
      const sira = Number(el.dataset.sira);
      const g = gs.getAllArmoryEquipmentList()[sira];
      if (!g) return false;
      const plan = gs.getQuickBuyPlan('upgrade:' + sira);
      if (!plan.ok) { b.bildir(plan.reason || 'Alım yapılamıyor.', 'error'); return false; }
      const liste = plan.items.map((i) => `• ${tam(i.qty)} ${i.name} (${astra(i.cost)} ASTRA)`).join('\n');
      const tamam = await onay({
        baslik: 'Eksikler alınıp eşya geliştirilsin mi?',
        metin: `${liste}\nAlım ${astra(plan.total)} ASTRA + geliştirme bedeli ${astra(plan.extraAda)} ASTRA`,
        tamam: 'Al ve geliştir'
      });
      if (!tamam) return false;
      const konum = ref(g);   // konumla: alımlar sırasında liste sırası değişse de aynı eşya geliştirilir
      for (const it of plan.items) {
        const r = await gs.marketBuy(it.res, it.qty);
        if (!r || !r.success) { b.bildir(`${it.name} alınamadı: ${(r && r.message) || ''}`, 'error'); return false; }
      }
      sonuc(b, await gs.upgradeAnyEquipment(konum));
      return undefined;
    },

    // Toplu "eksikleri al ve geliştir": eşyalar tek tek, sırayla; her birinin eksiği alınır (silo hepsini birden tutmak zorunda kalmaz), sonra yükseltilir.
    async hizliToplu(b, el) {
      const gs = b.gameState;
      const yuva = el.dataset.yuva === 'all' ? null : el.dataset.yuva;
      const seviye = el.dataset.seviye === '-' ? null : Number(el.dataset.seviye);
      const kume = `${el.dataset.yuva}:${el.dataset.seviye}`;
      const plan = gs.getQuickBuyPlan('upgradeset:' + kume);
      if (!plan.ok) { b.bildir(plan.reason || 'Alım yapılamıyor.', 'error'); return false; }
      const liste = plan.items.map((i) => `• ${tam(i.qty)} ${i.name} (${astra(i.cost)} ASTRA)`).join('\n');
      const tamam = await onay({
        baslik: 'Eksikler alınıp eşyalar geliştirilsin mi?',
        metin: `${liste}\nAlım ${astra(plan.total)} ASTRA + geliştirme bedeli ${astra(plan.extraAda)} ASTRA`,
        tamam: 'Al ve geliştir'
      });
      if (!tamam) return false;
      const konumlar = gs.getUpgradeSetItems(yuva, seviye).map(ref);   // konumla: alımlar sırasında liste sırası değişse de aynı eşyalar geliştirilir
      const ayni = (a, c) => a.source === c.source && a.slotKey === c.slotKey && a.armoryIndex === c.armoryIndex && a.soldierIndex === c.soldierIndex;
      let yukseltilen = 0;
      for (const konum of konumlar) {
        const sira = gs.getAllArmoryEquipmentList().findIndex((g) => ayni(ref(g), konum));
        const adim = gs.getQuickBuyPlan('upgrade:' + sira);
        if (adim.items.length) {
          if (!adim.ok) { b.bildir(`${yukseltilen} eşya geliştirildi; devamı yapılamadı: ${adim.reason}`, 'warning'); return false; }
          for (const it of adim.items) {
            const r = await gs.marketBuy(it.res, it.qty);
            if (!r || !r.success) { b.bildir(`${yukseltilen} eşya geliştirildi; ${it.name} alınamadı: ${(r && r.message) || ''}`, 'error'); return false; }
          }
        }
        const r = await gs.upgradeAnyEquipment(konum);
        if (!r || !r.success) { b.bildir(`${yukseltilen} eşya geliştirildi; devamı yapılamadı: ${(r && r.message) || ''}`, 'error'); return false; }
        yukseltilen++;
      }
      b.bildir(`✨ ${yukseltilen} adet teçhizat eksikleri alınarak bir sonraki seviyeye yükseltildi!`, 'success');
      return undefined;
    },

    onarHepsi(b) { sonuc(b, b.gameState.repairAllEquipmentInKingdom()); },
    async hizliOnar(b, el) {
      const g = b.gameState.getAllArmoryEquipmentList()[Number(el.dataset.sira)];
      if (!g) return false;
      await hizliOnar(b, ref(g));
      return undefined;
    },
    async hizliOnarHepsi(b) { await hizliOnar(b); },
    giydir(b) { sonuc(b, b.gameState.autoEquipBest(), 'success', 'info'); },
    hepsiniGelistir(b) { sonuc(b, b.gameState.upgradeAllEquipmentInKingdom(), 'success', 'warning'); },
    cantayaTopla(b) { sonuc(b, b.gameState.unequipAllSoldiers(), 'success', 'info'); },
    grup(b, el) { sonuc(b, b.gameState.upgradeEquipmentByTypeAndLevel(el.dataset.yuva, parseInt(el.dataset.seviye, 10)), 'success', 'warning'); },
    ozelGrup(b, el, secenek) { sonuc(b, b.gameState.upgradeEquipmentByTypeAndLevel(secenek.grupYuva, secenek.grupSeviye), 'success', 'warning'); },

    gelistir(b, el) {
      const g = b.gameState.getAllArmoryEquipmentList()[Number(el.dataset.sira)];
      if (!g) return false;
      sonuc(b, b.gameState.upgradeAnyEquipment(ref(g)));
      return undefined;
    },
    onar(b, el) {
      const g = b.gameState.getAllArmoryEquipmentList()[Number(el.dataset.sira)];
      if (!g) return false;
      sonuc(b, b.gameState.repairEquipment(ref(g)));   // konumla: çevrimiçi modda sunucu eşya nesnesi kabul etmez
      return undefined;
    },
    cikar(b, el) {
      const g = b.gameState.getAllArmoryEquipmentList()[Number(el.dataset.sira)];
      if (!g || g.source !== 'soldier') return false;
      sonuc(b, b.gameState.unequipSoldierToArmory(g.soldierIndex, g.slotKey));
      return undefined;
    },
    async geriDonustur(b, el) {
      const g = b.gameState.getAllArmoryEquipmentList()[Number(el.dataset.sira)];
      if (!g) return false;
      const deger = b.gameState.getRecycleValue(g.item);
      const tamam = await onay({
        baslik: 'Eşya geri dönüştürülsün mü?',
        metin: `Geri gelen: ${deger ? `${tam(deger.wood)} odun, ${tam(deger.iron)} demir${deger.coal ? `, ${tam(deger.coal)} kömür` : ''}` : '—'}. Eşya yok olur.`,
        tamam: 'Geri dönüştür', tehlikeli: true
      });
      if (!tamam) return false;
      sonuc(b, b.gameState.recycleEquipment(ref(g)));
      return undefined;
    },
    sat(b, el, secenek) { secenek.satis = Number(el.dataset.sira); },
    satVazgec(b, el, secenek) { secenek.satis = null; },
    async satOnayla(b, el, secenek) {
      const g = b.gameState.getAllArmoryEquipmentList()[secenek.satis];
      const girdi = document.getElementById('fiyat-giris');
      const fiyat = Number(String(girdi ? girdi.value : '').replace(',', '.'));
      if (!g) { secenek.satis = null; return; }
      if (!(fiyat > 0)) { b.bildir('Geçerli bir fiyat yaz.', 'error'); return false; }
      try {
        const r = await b.pazar.sell(ref(g), fiyat);
        b.bildir(r.message, r.success ? 'success' : 'error');
        if (r.success) secenek.satis = null;
      } catch (err) {
        b.bildir(`İlan verilemedi: ${err.message}`, 'error');
      }
      return undefined;
    }
  },

  degisimler: {
    sirala(b, el, secenek) { durum(secenek).sirala = el.value; },
    grupYuva(b, el, secenek) { durum(secenek).grupYuva = el.value; },
    grupSeviye(b, el, secenek) { durum(secenek).grupSeviye = parseInt(el.value, 10) || 1; }
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
