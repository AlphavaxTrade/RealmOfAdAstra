// Realm of AdAstra — Meydan Pazarı ekranı: al-sat (takas havuzu), teçhizat ve Anahtar ilanları ve hazine geri alım / yakım panosu.
import {
  ekranKaydet, kap, kart, katli, satir, sekmeler, dugme, uyari, not, bos, cubuk, simge, etiket, tam, astra, sayi, esc, yenile
} from './cekirdek.js';
import { resImg } from '../art.js';
import { onay } from '../v3/bilesenler.js';
import { terim } from '../v3/sozluk.js';

const ALINIR = ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb', 'fragments'];
const BOLUMLER = [{ id: 'alsat', ad: 'Al / Sat', simge: '💱' }, { id: 'ilan', ad: 'İlanlar', simge: '🏷️' }, { id: 'yakim', ad: 'Yakım', simge: '🔥' }];

function durum(s) {
  s.bolum = s.bolum || 'alsat';
  s.kaynak = s.kaynak || 'wheat';
  return s;
}

// Oyuncunun elindeki miktar
function eldeki(gs, key) {
  return Number(gs.state.inventory[key]) || 0;
}

const tahminSatin = (amm, key, qty) => {
  if (!(qty > 0)) return '~0,00 ASTRA';
  const c = amm.getEstimatedCostForBuy(key, qty);
  return isFinite(c) ? `~${sayi(c, 2)} ASTRA` : 'Yetersiz likidite';
};
const tahminSat = (amm, key, qty) => (qty > 0 ? `~${sayi(amm.getEstimatedAdAstraForSell(key, qty), 2)} ASTRA` : '~0,00 ASTRA');

function islemKarti(b, key) {
  const gs = b.gameState;
  const amm = b.ammMarket;
  const havuz = amm.pools[key];
  if (!havuz) return bos('🏪', 'Bu varlık şu an pazarda yok');
  const fiyat = amm.getPrice(key);
  const sahip = eldeki(gs, key);
  const hammaddeMi = b.GAME_CONFIG.RESOURCE_KEYS.includes(key);
  const silo = hammaddeMi ? gs.getWarehouseCapacity()[key] : null;
  const siloYuzde = silo ? Math.min(100, (sahip / silo) * 100) : 0;
  const doldurma = hammaddeMi ? gs.getFillWarehouseQty(key) : null;
  const hepsi = hammaddeMi ? Math.floor(sahip) : 0;

  const baslik = `<div class="ek-oge">${simge(resImg(key, havuz.icon))}
      <div class="ek-oge-govde"><b>${esc(havuz.name)}</b>
        <small>1 adet = ${fiyat >= 1000 ? sayi(fiyat, 1) : sayi(fiyat, 4)} ASTRA</small></div></div>
    ${silo
      ? `<div class="ek-cubuk-etiket"><span>Silo</span><b>${esc(tam(sahip))} / ${esc(tam(silo))}</b></div>${cubuk(siloYuzde, { ton: siloYuzde >= 95 ? 'dolu' : '' })}`
      : `<div class="ek-satir"><span>Elinde</span><b>${esc(tam(sahip))}</b></div>`}
    ${katli(`${terim('havuz', 'Havuz')} bilgisi`, `<p class="ek-kucuk">${esc(tam(havuz.resourceReserve))} ${esc(havuz.name)} · ${esc(astra(havuz.adAstraReserve))} ASTRA</p>`, { k: 'havuz' })}`;

  const alKutusu = `<div class="ek-kutu">
      <div class="ek-alt-baslik">🛒 Satın al</div>
      <input type="number" min="1" id="adet-al" class="ek-girdi" value="1" inputmode="numeric" data-e-girdi="alTahmin" data-kaynak="${esc(key)}" aria-label="Alınacak adet">
      <div class="ek-hizli">${[100, 1000, 10000].map((q) => dugme({ e: 'alHizli', metin: `+${tam(q)}`, veri: { q } })).join('')}</div>
      <div class="ek-satir"><span>Ödeyeceğin (harç dahil)</span><b data-tahmin="al">${esc(tahminSatin(amm, key, 1))}</b></div>
      ${dugme({ e: 'al', metin: 'Satın al', ton: 'iyi', veri: { kaynak: key }, genis: true })}
      ${doldurma ? dugme({
        e: 'doldur', metin: `Depoyu doldur (${tam(doldurma.qty)} adet · ~${tam(Math.ceil(doldurma.cost))} ASTRA${doldurma.limitedByAda ? ', ASTRA kadar' : ''})`,
        veri: { kaynak: key }, devreDisi: doldurma.qty <= 0, genis: true
      }) : ''}
    </div>`;
  const satKutusu = `<div class="ek-kutu">
      <div class="ek-alt-baslik">💰 Sat</div>
      <input type="number" min="1" id="adet-sat" class="ek-girdi" value="${Math.min(1, sahip > 0 ? sahip : 1)}" inputmode="numeric" data-e-girdi="satTahmin" data-kaynak="${esc(key)}" aria-label="Satılacak adet">
      <div class="ek-hizli">${[['%25', 0.25], ['Yarısı', 0.5], ['%75', 0.75]].map(([l, f]) => dugme({ e: 'satHizli', metin: l, veri: { oran: f } })).join('')}</div>
      <div class="ek-satir"><span>Eline geçecek (harç sonrası)</span><b data-tahmin="sat">${esc(tahminSat(amm, key, Math.min(1, sahip > 0 ? sahip : 1)))}</b></div>
      ${dugme({ e: 'sat', metin: 'Sat', veri: { kaynak: key }, genis: true })}
      ${hammaddeMi ? dugme({ e: 'hepsiniSat', metin: `Hepsini sat (${tam(hepsi)} adet)`, veri: { kaynak: key }, devreDisi: hepsi <= 0, genis: true }) : ''}
    </div>`;
  return kart({ icerik: `${baslik}<div class="ek-izgara is-genis">${alKutusu}${satKutusu}</div>` });
}

function alSatBolumu(b, s) {
  const secili = ALINIR.includes(s.kaynak) && b.ammMarket.pools[s.kaynak] ? s.kaynak : 'wheat';
  const cipler = ALINIR.filter((k) => b.ammMarket.pools[k]).map((k) => {
    const aktif = k === secili;
    return `<button type="button" class="ek-sekme${aktif ? ' is-aktif' : ''}" role="tab" aria-selected="${aktif}" data-e="kaynakSec" data-kaynak="${esc(k)}">${esc(b.ammMarket.pools[k].name)}</button>`;
  }).join('');
  return `<div class="ek-sekmeler" role="tablist">${cipler}</div>${islemKarti(b, secili)}`;
}

// Anahtar ilanı: toplu (adet + birim fiyat). Alıcı istediği adedi yazar, bedel = birim fiyat × adet.
function anahtarIlanSatiri(b, l, benim, simdi) {
  const it = l.item || {};
  const kalanSaat = Math.max(0, Math.round((l.expires - simdi) / 3600000));
  const kalan = kalanSaat >= 48 ? `${Math.floor(kalanSaat / 24)} gün` : `${kalanSaat} sa`;
  const adet = Number(it.qty) || 0;
  return `<div class="ek-oge">
      <div class="ek-oge-govde"><b>🔑 Anahtar · ${esc(tam(adet))} adet</b>
        <small>Tanesi ${esc(astra(l.price))} ASTRA · hepsi ${esc(astra(l.price * adet))} ASTRA</small>
        <small>${benim ? 'senin ilanın' : `satıcı ${esc(String(l.seller).slice(0, 10))}…`} · kalan ${esc(kalan)}</small></div>
      <div class="ek-dugmeler">
        ${benim
    ? dugme({ e: 'ilanCek', metin: '↩️ Geri çek', veri: { id: l.id } })
    : `<input type="number" min="1" max="${esc(adet)}" value="${esc(adet)}" class="ek-girdi ek-girdi-dar" data-anahtar-adet="${esc(l.id)}" inputmode="numeric" aria-label="Alınacak anahtar adedi">
          ${dugme({ e: 'ilanAnahtarAl', metin: '🛒 Satın al', ton: 'iyi', veri: { id: l.id, fiyat: l.price, kalan: adet } })}`}
      </div>
    </div>`;
}

function ilanSatiri(b, l, benim, simdi) {
  const it = l.item || {};
  if (it.kind === 'key') return anahtarIlanSatiri(b, l, benim, simdi);
  const kalanSaat = Math.max(0, Math.round((l.expires - simdi) / 3600000));
  const kalan = kalanSaat >= 48 ? `${Math.floor(kalanSaat / 24)} gün` : `${kalanSaat} sa`;
  return `<div class="ek-oge">
      <div class="ek-oge-govde"><b>${esc(it.icon || '🛡️')} ${esc(it.name || 'Eşya')} · sv.${esc(it.level || 1)}</b>
        <small>⚔️ ${esc(it.atkBonus || 0)} · ❤️ ${esc(it.hpBonus || 0)} · dayanıklılık ${esc(it.durability ?? '?')}/${esc(it.maxDurability ?? '?')}</small>
        <small>${benim ? 'senin ilanın' : `satıcı ${esc(String(l.seller).slice(0, 10))}…`} · kalan ${esc(kalan)}</small></div>
      <div class="ek-dugmeler"><b class="ek-vurgu">${esc(astra(l.price))} ASTRA</b>
        ${benim
          ? dugme({ e: 'ilanCek', metin: '↩️ Geri çek', veri: { id: l.id } })
          : dugme({ e: 'ilanAl', metin: '🛒 Satın al', ton: 'iyi', veri: { id: l.id, fiyat: l.price, ad: it.name || 'Eşya' } })}
      </div>
    </div>`;
}

function ilanBolumu(b, s) {
  if (!b.online || !b.online.active) {
    return kart({ baslik: '🏷️ İlan Pazarı', icerik: uyari('Oyuncular arası teçhizat satışı yalnız çevrimiçi sunucuda çalışır (bilgisayardaki deneme modunda kapalı).') });
  }
  const aciklama = not('Cephanelik\'teki bir eşyayı Demirhane > "Pazara koy" ile ilana verirsin; eşya ilanda bekler. Anahtarı da buradan (adet + birim fiyat) satarsın: Anahtar takas havuzunda yok, yalnız oyuncular arasında el değiştirir. Alıcı önce serbest ASTRA\'sından öder (yetmezse kalanı kilitliden); satıcıya gelen paranın en az %80\'i kilitli gelir. Komisyonun yarısı yakılır, yarısı kasalara gider. 7 günde satılmazsa eşya (ya da anahtar) sana döner.');
  const d = s.ilanVeri;
  if (!d) return kart({ baslik: '🏷️ İlan Pazarı: oyuncudan oyuncuya teçhizat', rozet: etiket('komisyon %2 · 7 gün · 10 ilan'), icerik: `${aciklama}<div class="v3-iskelet" aria-busy="true"><i></i><i></i><i></i></div>` });
  const anahtarim = Math.floor(Number(b.gameState.state.arenaKeys) || 0);
  const anahtarFormu = `<div class="ek-alt-baslik">🔑 Anahtar sat (elinde ${esc(tam(anahtarim))})</div>
      <div class="ek-alan-satiri">
        <input type="number" min="1" id="anahtar-adet" class="ek-girdi" value="${anahtarim > 0 ? 1 : 0}" inputmode="numeric" aria-label="Satılacak anahtar adedi" placeholder="adet">
        <input type="number" min="0.01" step="any" id="anahtar-fiyat" class="ek-girdi" value="10" inputmode="decimal" aria-label="Tanesi kaç ASTRA" placeholder="birim fiyat (ASTRA)">
        ${dugme({ e: 'ilanAnahtarSat', metin: '🏷️ İlana ver', ton: 'birincil', devreDisi: anahtarim <= 0 })}
      </div>`;
  const benim = (d.mine || []).map((l) => ilanSatiri(b, l, true, d.now)).join('');
  const digerleri = (d.listings || []).filter((l) => !l.mine).map((l) => ilanSatiri(b, l, false, d.now)).join('');
  return kart({
    baslik: '🏷️ İlan Pazarı: oyuncudan oyuncuya teçhizat ve anahtar',
    rozet: etiket('komisyon %2 · 7 gün · 10 ilan'),
    icerik: `${aciklama}
      ${anahtarFormu}
      <div class="ek-alt-baslik">Senin ilanların (${(d.mine || []).length}/${d.maxListings})</div>
      ${benim ? `<div class="ek-liste">${benim}</div>` : '<p class="ek-kucuk">İlanın yok. Demirhane\'de bir eşyanın yanındaki "Pazara koy" düğmesini kullan.</p>'}
      <div class="ek-alt-baslik">Satıştakiler (${(d.listings || []).filter((l) => !l.mine).length})</div>
      ${digerleri ? `<div class="ek-liste">${digerleri}</div>` : '<p class="ek-kucuk">Şu an satışta eşya yok.</p>'}`
  });
}

function yakimBolumu(b) {
  const amm = b.ammMarket;
  const C = b.GAME_CONFIG;
  const analiz = amm.getBuybackAnalysis();
  const son = amm.getLastBuybackReport();
  const kasaYuzde = Math.round((C.TREASURY_ALLOCATION?.ammBuyback || 0) * 100);
  const haftalik = Math.round((C.AMM_BUYBACK?.WEEKLY_RATE ?? 0.03) * 100);

  const varliklar = analiz.assets.map((a) => {
    const dusuyor = a.dropPct > 0;
    return `<div class="ek-oge">
      <div class="ek-oge-govde"><b>${esc(a.icon)} ${esc(a.name)}</b>
        <small>Açılış ${esc(sayi(a.genesisPrice, 3))} → şimdi ${esc(a.currentPrice >= 100 ? sayi(a.currentPrice, 1) : sayi(a.currentPrice, 3))} ASTRA</small>
        <small>${a.allocatedBudget > 0 ? `Ayrılan ${esc(astra(a.allocatedBudget))} ASTRA · 🔥 ~${esc(tam(a.estimatedUnitsToBurn))} adet yakılacak` : 'Bu döngü müdahale yok'}</small></div>
      <b class="${a.dropPct >= 50 ? 'ek-kotu' : (dusuyor ? 'ek-uyari-renk' : 'ek-iyi')}">${dusuyor ? `-%${esc(sayi(a.dropPct, 1))}` : '✅ sağlıklı'}</b>
    </div>`;
  }).join('');

  const sonRapor = son ? kart({
    baslik: '✅ Son geri alım raporu',
    rozet: `<span class="ek-kucuk">${esc(new Date(son.timestamp).toLocaleString('tr-TR'))}</span>`,
    icerik: `<p class="ek-not">Kasadan toplam <b>${esc(astra(son.totalSpent))} ASTRA</b> harcandı; malzemeler yakılıp toplam arzdan silindi.</p>`
      + `<div class="ek-liste">${son.items.map((i) => `<div class="ek-satir"><span>${esc(i.icon)} ${esc(i.name)}</span><b>-${esc(tam(i.unitsBurned))} adet (${esc(astra(i.budgetSpent))} ASTRA)</b></div>`).join('')}</div>`
  }) : '';

  return [
    kart({
      baslik: '🛡️ Hazine geri alım ve yakım',
      icerik: not(`Hazineye giren ASTRA'nın %${kasaYuzde}'i bu kasaya gider. Fiyatı açılışın en az %${Math.round((C.AMM_BUYBACK?.TRIGGER_DROP ?? 0.2) * 100)} altına inen varlıklar bu kasadan alınıp yakılır; böylece fiyat toparlanır.`)
        + satir('Kasadaki ASTRA', `${astra(analiz.availableTreasury)} ASTRA`)
        + satir(`Haftalık müdahale tavanı (%${haftalik})`, `${astra(analiz.maxCycleFund)} ASTRA`)
        + satir('Bu döngü kullanılacak fon', `${astra(analiz.totalFundToSpend)} ASTRA`, analiz.totalFundToSpend > 0 ? 'uyari' : 'iyi')
        + (b.online && b.online.active ? '' : dugme({ e: 'geriAlim', metin: '⚡ Geri alımı şimdi çalıştır', ton: 'birincil', devreDisi: analiz.totalFundToSpend <= 1, genis: true }))
    }),
    kart({ baslik: '📊 Varlık durumu', icerik: `<div class="ek-liste">${varliklar}</div>` }),
    sonRapor
  ].join('');
}

const ekran = {
  id: 'pazar',
  goruldu: (b, secenek) => (secenek.bolum === 'ilan' || secenek.bolum === 'yakim' ? secenek.bolum : null),
  kilit: 'market',
  ornekSecenekler: () => [{ bolum: 'alsat' }, { bolum: 'alsat', kaynak: 'fragments' }, { bolum: 'ilan' }, { bolum: 'yakim' }],
  baslik: () => ['🏪', 'Pazar'],

  govde(b, secenek) {
    const s = durum(secenek);
    const gs = b.gameState;
    const ust = kart({
      icerik: satir('ASTRA bakiyen', `${astra(gs.state.adAstraBalance)} ASTRA`) + not(`Al ve sat. Fiyatı ${terim('amm', 'takas havuzu')} belirler: çok alınan pahalanır, çok satılan ucuzlar. Her işlemde %2 hammadde ${terim('yakim', 'yakılır')}, %2 ASTRA ${terim('harc', 'harç')} oyun kasalarına gider.`)
    });
    const icerik = s.bolum === 'ilan' ? ilanBolumu(b, s) : (s.bolum === 'yakim' ? yakimBolumu(b) : alSatBolumu(b, s));
    return kap([ust, sekmeler(BOLUMLER, s.bolum, 'bolum'), icerik].join(''));
  },

  // İlanlar bölümü açıkken ilan listesi sunucudan alınır
  async sonra(b, secenek) {
    if (secenek.bolum !== 'ilan' || !b.online || !b.online.active || !b.pazar || secenek.ilanVeri || secenek.ilanYukleniyor) return;
    secenek.ilanYukleniyor = true;
    try {
      secenek.ilanVeri = await b.pazar.list();
    } catch (e) {
      b.bildir(`İlanlar alınamadı: ${e.message}`, 'error');
    } finally {
      secenek.ilanYukleniyor = false;
    }
    yenile();
  },

  girdiler: {
    alTahmin(b, el, secenek, kok) {
      const e = kok.querySelector('[data-tahmin="al"]');
      if (e) e.textContent = tahminSatin(b.ammMarket, el.dataset.kaynak, parseFloat(el.value) || 0);
    },
    satTahmin(b, el, secenek, kok) {
      const e = kok.querySelector('[data-tahmin="sat"]');
      if (e) e.textContent = tahminSat(b.ammMarket, el.dataset.kaynak, parseFloat(el.value) || 0);
    }
  },

  eylemler: {
    bolum(b, el, secenek) {
      durum(secenek).bolum = el.dataset.sekme;
      if (secenek.bolum === 'ilan') secenek.ilanVeri = null;   // her açılışta taze liste
    },
    kaynakSec(b, el, secenek) { durum(secenek).kaynak = el.dataset.kaynak; },

    alHizli(b, el) {
      const girdi = el.closest('.ek').querySelector('#adet-al');
      const mevcut = parseFloat(girdi.value) || 0;
      girdi.value = Math.max(1, Math.floor((mevcut <= 1 ? 0 : mevcut) + Number(el.dataset.q)));
      girdi.dispatchEvent(new Event('input', { bubbles: true }));
      return false;
    },
    satHizli(b, el, secenek) {
      const girdi = el.closest('.ek').querySelector('#adet-sat');
      const elde = eldeki(b.gameState, durum(secenek).kaynak);
      girdi.value = Math.max(1, Math.floor(elde * Number(el.dataset.oran)));
      girdi.dispatchEvent(new Event('input', { bubbles: true }));
      return false;
    },

    async al(b, el) {
      const girdi = el.closest('.ek').querySelector('#adet-al');
      const adet = parseFloat(girdi.value) || 0;
      if (adet <= 0) { b.bildir('Lütfen satın almak istediğin geçerli bir miktar gir!', 'error'); return false; }
      const r = await b.gameState.marketBuy(el.dataset.kaynak, adet);
      if (!r.success) { b.bildir(r.message || 'Alış işlemi gerçekleştirilemedi!', 'error'); return undefined; }
      const yakim = r.resourceBurnFee > 0 ? ` · 🔥 %2 yakım: ${tam(r.resourceBurnFee)} ${r.resourceName} silindi` : '';
      b.bildir(`🛒 ${sayi(r.cost, 2)} ASTRA ödendi: +${tam(r.resourceReceived)} ${r.resourceName} alındı.${yakim}`, 'success');
      if (r.botJustResumed) b.bildir('🟢 Gerekli kaynaklar tamamlandı! Otomasyon botu kaldığı yerden devam etti.', 'success');
      return undefined;
    },
    async sat(b, el) {
      const girdi = el.closest('.ek').querySelector('#adet-sat');
      const adet = parseFloat(girdi.value) || 0;
      if (adet <= 0) { b.bildir('Lütfen satmak istediğin geçerli bir miktar gir!', 'error'); return false; }
      const r = await b.gameState.marketSell(el.dataset.kaynak, adet);
      if (!r.success) { b.bildir(r.message || 'Satış işlemi gerçekleştirilemedi!', 'error'); return undefined; }
      const yakim = r.resourceBurnFee > 0 ? ` · 🔥 %2 yakım: ${tam(r.resourceBurnFee)} ${r.resourceName} silindi` : '';
      b.bildir(`💰 ${tam(adet)} ${r.resourceName} satıldı: +${sayi(r.adAstraReceived, 2)} ASTRA${yakim}`, 'success');
      return undefined;
    },
    async doldur(b, el) {
      const gs = b.gameState;
      const key = el.dataset.kaynak;
      const fq = gs.getFillWarehouseQty(key);
      if (fq.qty <= 0) { b.bildir(fq.room > 0 ? 'ASTRA yetmiyor.' : 'Silo zaten dolu.', 'info'); return false; }
      const ad = (b.ammMarket.pools[key] || {}).name || key;
      const tamam = await onay({
        baslik: `${tam(fq.qty)} ${ad} alınsın mı?`,
        metin: `~${tam(Math.ceil(fq.cost))} ASTRA (%2 harç dahil).${fq.limitedByAda ? ` ASTRA'n siloyu tamamen doldurmaya yetmiyor; alınabilecek en fazla miktar bu (boş yer: ${tam(fq.room)}).` : ''}`,
        tamam: 'Satın al'
      });
      if (!tamam) return false;
      const r = await gs.marketBuy(key, fq.qty);
      b.bildir(r.success ? `🧺 ${tam(fq.qty)} ${ad} alındı (−${sayi(r.cost, 2)} ASTRA)` : (r.message || 'Alım yapılamadı.'), r.success ? 'success' : 'error');
      return undefined;
    },
    async hepsiniSat(b, el) {
      const gs = b.gameState;
      const key = el.dataset.kaynak;
      const elde = Math.floor(Number(gs.state.inventory[key]) || 0);
      if (elde <= 0) { b.bildir('Siloda satılacak hammadde yok.', 'info'); return false; }
      const tavan = b.ammMarket.getMaxSellBeforeFloor(key);
      const adet = Math.min(elde, Number.isFinite(tavan) ? Math.floor(tavan) : elde);
      if (adet <= 0) { b.bildir('Pazar fiyatı en alt sınırda; hazine geri alımı fiyatı toparlayana kadar satış yapılamaz.', 'error'); return false; }
      const ad = (b.ammMarket.pools[key] || {}).name || key;
      const kalan = adet < elde ? ` Fiyat en alt sınıra inmesin diye şimdilik ${tam(adet)} adet satılabilir; kalan ${tam(elde - adet)} adet siloda kalır.` : '';
      const tamam = await onay({
        baslik: `${tam(adet)} ${ad} satılsın mı?`,
        metin: `Tahmini kazanç ~${astra(Math.floor(b.ammMarket.getEstimatedAdAstraForSell(key, adet)))} ASTRA (%2 harç sonrası).${kalan}`,
        tamam: 'Sat'
      });
      if (!tamam) return false;
      const r = await gs.marketSell(key, adet);
      b.bildir(r.success ? `💰 ${tam(adet)} ${r.resourceName || ad} satıldı: +${sayi(r.adAstraReceived, 2)} ASTRA` : (r.message || 'Satış yapılamadı.'), r.success ? 'success' : 'error');
      return undefined;
    },

    geriAlim(b) {
      const r = b.gameState.executeAmmTreasuryBuyback();
      b.bildir(r.success ? r.message : (r.message || 'Hazine müdahalesi gerekmiyor.'), r.success ? 'success' : 'info');
    },

    async ilanAl(b, el, secenek) {
      const tamam = await onay({
        baslik: `${el.dataset.ad} satın alınsın mı?`,
        metin: `${astra(Number(el.dataset.fiyat))} ASTRA. Önce serbest ASTRA'n kullanılır; yetmezse kalanı kilitliden düşer.`, tamam: 'Satın al'
      });
      if (!tamam) return false;
      try {
        const r = await b.pazar.buy(Number(el.dataset.id));
        b.bildir(r.message, r.success ? 'success' : 'error');
      } catch (err) { b.bildir(`Satın alınamadı: ${err.message}`, 'error'); }
      secenek.ilanVeri = null;
      return undefined;
    },
    async ilanAnahtarSat(b, el, secenek) {
      const kok = el.closest('.ek');
      const adet = Math.floor(Number(kok.querySelector('#anahtar-adet').value));
      const fiyat = Number(String(kok.querySelector('#anahtar-fiyat').value).replace(',', '.'));
      if (!(adet >= 1)) { b.bildir('Satılacak anahtar adedini yaz.', 'error'); return false; }
      if (!(fiyat > 0)) { b.bildir('Tanesi için geçerli bir fiyat yaz.', 'error'); return false; }
      const tamam = await onay({
        baslik: `${tam(adet)} anahtar ilana konsun mu?`,
        metin: `Tanesi ${astra(fiyat)} ASTRA, hepsi ${astra(fiyat * adet)} ASTRA. Satılınca %2 komisyon düşer. 7 günde satılmazsa anahtarlar sana döner; istediğin an geri çekebilirsin.`,
        tamam: 'İlana ver'
      });
      if (!tamam) return false;
      try {
        const r = await b.pazar.sellKey(adet, fiyat);
        b.bildir(r.message, r.success ? 'success' : 'error');
      } catch (err) { b.bildir(`İlan verilemedi: ${err.message}`, 'error'); }
      secenek.ilanVeri = null;
      return undefined;
    },
    async ilanAnahtarAl(b, el, secenek) {
      const girdi = el.closest('.ek').querySelector(`[data-anahtar-adet="${el.dataset.id}"]`);
      const adet = Math.floor(Number(girdi && girdi.value));
      const kalan = Number(el.dataset.kalan) || 0;
      if (!(adet >= 1) || adet > kalan) { b.bildir(`Alınacak adedi 1 ile ${tam(kalan)} arasında yaz.`, 'error'); return false; }
      const toplam = Number(el.dataset.fiyat) * adet;
      const tamam = await onay({
        baslik: `${tam(adet)} anahtar satın alınsın mı?`,
        metin: `${astra(toplam)} ASTRA (tanesi ${astra(Number(el.dataset.fiyat))}). Önce serbest ASTRA'n kullanılır; yetmezse kalanı kilitliden düşer.`, tamam: 'Satın al'
      });
      if (!tamam) return false;
      try {
        const r = await b.pazar.buy(Number(el.dataset.id), adet);
        b.bildir(r.message, r.success ? 'success' : 'error');
      } catch (err) { b.bildir(`Satın alınamadı: ${err.message}`, 'error'); }
      secenek.ilanVeri = null;
      return undefined;
    },
    async ilanCek(b, el, secenek) {
      try {
        const r = await b.pazar.cancel(Number(el.dataset.id));
        b.bildir(r.message, r.success ? 'success' : 'error');
      } catch (err) { b.bildir(`Geri çekilemedi: ${err.message}`, 'error'); }
      secenek.ilanVeri = null;
      return undefined;
    }
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
