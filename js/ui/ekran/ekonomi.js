// Realm of AdAstra — Ekonomi panosu: oyunun parası nerede, ne kadar dönüyor. Yalnız gerçek değerler gösterilir
// (hazine defteri, dünya kotası, pazar havuzları); tahmin ya da sabit sayı yok.
import {
  ekranKaydet, kap, kart, katli, satir, sekmeler, cubuk, cubukSatiri, not, izgara, hucre, etiket, simge, tam, astra, sayi, esc
} from './cekirdek.js';
import { kaynakSimgesi, kaynakAdi } from './bilesik.js';

const SEKMELER = [{ id: 'genel', ad: 'Genel', simge: '🌐' }, { id: 'kaynak', ad: 'Hammadde dengesi', simge: '⚖️' }, { id: 'fiyat', ad: 'Fiyatlar', simge: '💱' }];

function fiyatMetni(v) {
  return v >= 100 ? sayi(v, 1) : (v >= 1 ? sayi(v, 2) : sayi(v, 4));
}

function genel(b) {
  const gp = b.globalPool;
  const gs = gp.state;
  const t = b.treasury.getSummary();
  const m = gp.getEconomicHealthMetrics();
  const durumTon = { healthy: 'iyi', warning: 'uyari', critical: 'kotu' }[m.healthStatus] || '';
  const harcanan = gs.totalSpent || 0;
  const pay = (v) => (harcanan > 0 ? ` (%${sayi((v / harcanan) * 100, 1)})` : '');
  return [
    kart({
      baslik: '🩺 Ekonomi durumu',
      vurgu: durumTon,
      icerik: `<p class="ek-not"><b>${esc(m.statusText)}</b></p>`
        + satir('Ödeme gücü (kasalardan çıkan / giren)', `%${sayi(m.payoutRatio * 100, 1)}`, m.payoutRatio > 1 ? 'kotu' : 'iyi')
        + satir('Ortalama kasa sağlığı', `%${sayi(m.treasuryHealth * 100, 0)}`, m.treasuryHealth < 0.4 ? 'kotu' : (m.treasuryHealth < 0.7 ? 'uyari' : 'iyi'))
        + katli('Bu ne demek? (ayrıntı)', not('Ödeme gücü 100%\'ün altında kaldıkça kasalar dolu kalır; üstüne çıkarsa ödüller kasaları eritiyor demektir ve ödüller küçülür.'), { k: 'eko-anlam' })
    }),
    katli('🔥 ASTRA akışı (harcanan, yakılan, kasalar)',
      satir('Oyunda harcanan toplam', `${astra(harcanan)} ASTRA`)
        + satir('Kalıcı yakılan', `${astra(gs.totalBurned || 0)} ASTRA${pay(gs.totalBurned || 0)}`, 'uyari')
        + satir('Yapımcı payı (telif)', `${astra(gs.creatorRoyaltyTotal || 0)} ASTRA${pay(gs.creatorRoyaltyTotal || 0)}`)
        + satir('Temel gelir kasasına giren (bu hafta)', `${astra(gs.ubiWeekAccrued || 0)} ASTRA`)
        + satir('Kasalara giren (ömür boyu)', `${astra(t.lifetimeDeposited)} ASTRA`)
        + satir('Kasalardan çıkan (ömür boyu)', `${astra(t.lifetimeWithdrawn)} ASTRA`), { k: 'eko-akis' }),
    katli('💎 Kasalar', izgara(t.pools.map((p) => hucre(p.name, `${astra(p.balance)} ASTRA`, p.health < 0.25 ? 'kotu' : '')), { genis: true }), { k: 'eko-kasalar' }),
    // Teçhizat parçası da yakılır (dövme, geliştirme, onarım) ama hammadde sayılmadığı için ayrı kayıtta (totalBurnedItems) tutulur; burada onunla birlikte gösterilir (20 Ekim 2026).
    // Pandora kutusu, anahtar ve iyileştirme parşömeni yalnız yakılmışsa görünür.
    katli('Yakılan hammaddeler ve parçalar (kalıcı)', izgara([
      ...b.GAME_CONFIG.RESOURCE_KEYS.map((k) => hucre(kaynakAdi(b, k), tam((gs.totalBurnedResources || {})[k] || 0))),
      hucre('Teçhizat parçası', tam((gs.totalBurnedItems || {}).fragments || 0)),
      ...[['boxes', 'Pandora kutusu'], ['keys', 'Anahtar'], ['scroll_heal', 'İyileştirme parşömeni']]
        .filter(([k]) => ((gs.totalBurnedItems || {})[k] || 0) > 0)
        .map(([k, ad]) => hucre(ad, tam((gs.totalBurnedItems || {})[k])))
    ], {}), { k: 'yakim' })
  ].join('');
}

function kaynakDengesi(b) {
  const gp = b.globalPool;
  const gs = gp.state;
  const gecen = Math.max(1, Date.now() - (gs.epochStartTime || Date.now()));
  const uzunluk = Math.max(1, (gs.epochEndTime || Date.now()) - (gs.epochStartTime || Date.now()));
  const beklenen = Math.min(1, gecen / uzunluk);
  const kartlar = b.GAME_CONFIG.RESOURCE_KEYS.map((k) => {
    const r = gs.resources[k];
    if (!r) return '';
    const bilgi = gp.getResourceInfo(k);
    const kullanilan = r.totalCap > 0 ? 1 - (r.remaining / r.totalCap) : 0;
    const sigma = beklenen > 0 ? kullanilan / beklenen : 1;
    const yakilan = Math.max(0, (r.baseCap ?? r.totalCap) - r.totalCap);
    const durum = r.remaining <= 0 ? ['tükendi', 'kotu'] : (sigma > 1.25 ? ['hızlı tükeniyor', 'uyari'] : (sigma < 0.5 ? ['bol', 'iyi'] : ['dengede', 'iyi']));
    return kart({
      icerik: `<div class="ek-oge">${simge(kaynakSimgesi(b, k))}
          <div class="ek-oge-govde"><b>${esc(kaynakAdi(b, k))}</b><small>bugün alınabilir ${esc(tam(bilgi.availableToday))}</small></div>
          ${etiket(durum[0], durum[1])}</div>`
        + cubukSatiri('Bu hafta kullanılan', `%${sayi(kullanilan * 100, 0)}`, kullanilan * 100, { ton: kullanilan > 0.9 ? 'dolu' : '' })
        + katli('Ayrıntı', satir('Haftalık kota', tam(bilgi.baseCap))
          + satir('Kullanılan', `${tam(r.harvested || 0)} / ${tam(r.totalCap)}`)
          + satir('Haftalık beklenen ilerleme', `%${sayi(beklenen * 100, 0)}`)
          + satir('Bu hafta yakılan (kotadan düşen)', `${tam(yakilan)}`), { k: 'eko-kaynak-' + k })
    });
  });
  return not('Her hammaddenin haftalık dünya kotası var. "Dengede", kotanın beklenen hızda kullanıldığını gösterir.')
    + izgara(kartlar, { genis: true });
}

function fiyatlar(b) {
  const amm = b.ammMarket;
  const satirlar = Object.keys(amm.pools).map((k) => {
    const h = amm.pools[k];
    const fiyat = amm.getPrice(k);
    const koridor = amm.getCorridor(k);
    const acilis = koridor ? koridor.defaultPriceAda : fiyat;
    const fark = acilis > 0 ? ((fiyat - acilis) / acilis) * 100 : 0;
    let konum = '';
    if (koridor && koridor.maxPriceAda > koridor.minPriceAda) {
      const p = Math.max(0, Math.min(100, ((fiyat - koridor.minPriceAda) / (koridor.maxPriceAda - koridor.minPriceAda)) * 100));
      konum = cubuk(p, { renk: '#63b0ff' }) + `<div class="ek-cubuk-etiket"><span>taban ${esc(fiyatMetni(koridor.minPriceAda))}</span><span>tavan ${esc(fiyatMetni(koridor.maxPriceAda))}</span></div>`;
    }
    return `<div class="ek-hucre"><small>${esc(h.icon)} ${esc(h.name)}</small>
      <b>${esc(fiyatMetni(fiyat))} ASTRA</b>
      <small class="${fark < 0 ? 'ek-kotu' : 'ek-iyi'}">açılışa göre ${fark >= 0 ? '+' : ''}${esc(sayi(Math.abs(fark) < 0.05 ? 0 : fark, 1))}%</small>${konum}</div>`;
  });
  return not('Çok alınan pahalanır, çok satılan ucuzlar. Fiyat taban ve tavan arasında kalır.')
    + katli('Havuzlar (ayrıntı)', not(`Fiyatı takas havuzları belirler. Havuzlardaki toplam ASTRA: <b>${esc(tam(amm.getTotalAdAstraLiquidity()))}</b>.`), { k: 'eko-havuz' })
    + izgara(satirlar, { genis: true });
}

const ekran = {
  id: 'ekonomi',
  goruldu: 'ekonomi',
  canliYenile: true,
  ornekSecenekler: () => [{ sekme: 'genel' }, { sekme: 'kaynak' }, { sekme: 'fiyat' }],
  baslik: () => ['📈', 'Ekonomi panosu'],

  govde(b, secenek) {
    secenek.sekme = secenek.sekme || 'genel';
    const icerik = secenek.sekme === 'kaynak' ? kaynakDengesi(b) : (secenek.sekme === 'fiyat' ? fiyatlar(b) : genel(b));
    return kap(sekmeler(SEKMELER, secenek.sekme, 'sekme') + icerik);
  },

  eylemler: {
    sekme(b, el, secenek) {
      secenek.sekme = el.dataset.sekme;
    }
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
