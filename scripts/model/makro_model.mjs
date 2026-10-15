// Realm of AdAstra — MAKRO EKONOMİ MODELİ (ekosistem: trade uygulaması + oyun + stake + Genesis; haftalık, 3 yıl)
// ============================================================================
// Soru (kullanıcı, 15 Ekim 2026): oyundan çıkıp satılan ASTRA hiçbir zaman trade uygulamasının yarattığı alımı geçmesin, trade
// kullanıldıkça fiyat yükselsin; oyun piyasa değeri artınca daha çok, azalınca daha az ödesin; 200 M tohum uzun vadede erimesin;
// Genesis yolu uzun ve pahalı olsun, karşılığı ayrıcalıkla ödensin; stake sitesi ek alım ve arz çekilmesi getirsin.
// Tasarım: docs/v2/MAKRO_EKONOMI_PLANI.md. Bu dosya o tasarımın sayılarını sınar; oyuna bağlı değildir (öneri aracı).
// Kullanım: node scripts/model/makro_model.mjs senaryo=t750 [weeks=156 oyuncuAlim=1 out=dosya.json]
//           node scripts/model/makro_model.mjs hepsi   (bütün senaryolar, özet tablo + docs/v2/model_makro_<senaryo>.json)
// Oyun sabitleri js/config.js ve server/economy.js'ten okunur (EK-09 deseni). "VARSAYIM" yazan her sayı ölçülmemiş bir girdidir.
// Çıkış Kapısı (ekosistemCikisTavani) ve Ödeme Kadranı (odemeKadrani) oyunun kendi kurallarıdır: server/economy.js (Aşama 1, 15 Ekim 2026).
// ============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { GAME_CONFIG as C } from '../../js/config.js';
import { WEEKLY_RULES as WR, nextMultiplier, priceFactorK, brakeState, ekosistemCikisTavani, odemeKadrani } from '../../server/economy.js';
import { zincirOlustur } from './zincir.mjs';

const GUN = 86400000;
const HAFTA_AY = WR.weeksPerMonth;   // 4,33

// ── Senaryolar (trade geliri VARSAYIM: gerçek rakam trade sitesinin defterinden gelecek) ──
export const SENARYOLAR = {
  t0:    { ad: 'Trade geliri yok', tradeUsdAy: 0 },
  t250:  { ad: 'Trade 250 $/ay', tradeUsdAy: 250 },
  t750:  { ad: 'Trade 750 $/ay (yalnız abonelik, ücretli üye %50)', tradeUsdAy: 750 },
  t2000: { ad: 'Trade 2.000 $/ay', tradeUsdAy: 2000 },
  t5000: { ad: 'Trade 5.000 $/ay (kontenjan büyümüş)', tradeUsdAy: 5000 },
  sok:   { ad: 'Trade 750 $/ay + 20. haftada %30 spekülatör satışı', tradeUsdAy: 750, sokHafta: 20, sokDusus: 0.30 },
  durur: { ad: 'Trade 750 $/ay, 78. haftada durur', tradeUsdAy: 750, tradeBitisHafta: 78 },
  alimsiz: { ad: 'Trade 750 $/ay, oyuncular hiç ASTRA almaz', tradeUsdAy: 750, oyuncuAlim: 0, stakeAcik: 0, genesisAcik: 0 },
  tohum: { ad: 'Kıyas: yalnız 200 M tohum (trade yok, oyuncu alımı yok)', tradeUsdAy: 0, oyuncuAlim: 0, stakeAcik: 0, genesisAcik: 0 }
};

// Haftalık fiyat serisinden kadran (sunucu günlük fiyatla aynı hesabı yapar: son 7 gün ÷ son 91 gün)
function kadranHaftalik(fiyatlar, onceki, kasaSagligi) {
  const ort = n => { const s = fiyatlar.slice(-n); return s.length ? s.reduce((t, v) => t + v, 0) / s.length : 0; };
  return odemeKadrani({ kisaOrt: ort(Math.round(WR.kadranShortDays / 7)), uzunOrt: ort(Math.round(WR.kadranLongDays / 7)), veriGun: fiyatlar.length * 7, onceki, kasaSagligi });
}

// ── Modelin girdileri (VARSAYIM'lar burada) ──
export function varsayilanlar() {
  return {
    weeks: 156, avaxUsd: 10.4, S0: 2157553980, dead0: 165e6,    // 11 Ekim 2026 ölçümü (megalodon docs/ekonomi/MODEL.md; eğride 12,99 AVAX)
    oyuncuAlim: 1, stakeAcik: 1, genesisAcik: 1,
    // Oyuncu tipleri (VARSAYIM, 30 Eylül token modeli): pay ağırlığı = oyun içi gelirden aldığı pay (aktiflik ve ordu büyüklüğü)
    tipler: {
      ucretsiz: { n: 70, agirlik: 1, alimIlkUsd: 0, alimAyUsd: 0, stakeIlkUsd: 0, stakeAyUsd: 0, stakeOran: 0, tradeAyUsd: 0 },
      orta:     { n: 25, agirlik: 1.5, alimIlkUsd: 20, alimAyUsd: 2, stakeIlkUsd: 10, stakeAyUsd: 1, stakeOran: 0.5, tradeAyUsd: 10 },
      buyuk:    { n: 5, agirlik: 3, alimIlkUsd: 200, alimAyUsd: 20, stakeIlkUsd: 100, stakeAyUsd: 10, stakeOran: 1, tradeAyUsd: 40 }
    },
    harcamaPayi: 0.6,          // VARSAYIM: oyun içi gelirin oyunda yeniden harcanan payı (R4c)
    satisEgilimi: 0.25,        // VARSAYIM: serbest bakiyenin haftada çekilmek istenen payı; çekilen HEPSİ satılır (en kötü durum)
    kullanim: 0.9,             // VARSAYIM: haftalık ödeme bütçesinin oyuncularca gerçekten kullanılan payı
    pazarOran: 0.0055,         // VARSAYIM: pazar havuzlarındaki ASTRA'nın haftada oyunculara net akan payı (R4c 0,55 M/hafta açılışı)
    fatihBaslaHafta: 26, fatihOran: 0.01,   // VARSAYIM: ilk fatihler ~6. ayda; Fatih kasası o zamandan haftada %1 öder
    // Trade gelirinin bölüşümü (kullanıcı kararı 7 Ekim 2026); stake açılınca ödül havuzunun yarısı stake ödülüne (plan C7, karar bekliyor)
    trade: { yakim: 0.20, tut: 0.30, havuz: 0.10, oyun: 0.40, stakePayi: 0.05, krediGeriDonus: 0.5 },
    // Genesis (plan C6)
    genesis: { muhurUsd: 250, muhurYakim: 0.5, birim: 55, birimAstra: 2000, uyandirmaHafta: 8, sezonTavan: 100,
      takvim: { buyuk: { adet: 5, ilk: 34, son: 38 }, orta: { adet: 10, ilk: 52, son: 78 }, ucretsiz: { adet: 0, ilk: 90, son: 130 } },
      uyduAyUsd: 10, uyduOdeyecekti: 0.5, gozlemeviYilIndirimUsd: 300, gozlemeviAlacakti: 0.2 },
    // Stake sitesi (plan C7): açılış haftası VARSAYIM
    stake: { baslaHafta: 26, odulCozulmeHafta: 26, indirimHer200Usd: 0.01, indirimTavan: 0.25 }
  };
}

export function calistir(senaryoAdi = 't750', ek = {}) {
  const S = SENARYOLAR[senaryoAdi];
  if (!S) throw new Error('Bilinmeyen senaryo: ' + senaryoAdi);
  const P = { ...varsayilanlar(), ...S, ...ek };
  const Z = zincirOlustur({ avaxUsd: P.avaxUsd, S0: P.S0, dead0: P.dead0 });
  const fiyatAcilis = Z.price();

  // ── Oyun kasaları (js/config.js) ──
  const RATES = C.TREASURY_WEEKLY_BUDGET.RATES;
  const ODEYEN = Object.keys(RATES);                              // dungeon, arena, worldBoss, quest, carnival
  const V = { ...C.TREASURY_SEED };
  const giris = Object.fromEntries(ODEYEN.map(id => [id, []]));   // haftalık kasa girişleri (bütçenin giriş payı için)
  let girisBuHafta = Object.fromEntries(ODEYEN.map(id => [id, 0]));
  let pazar = Object.values(C.AMM_SEED_ASTRA).reduce((s, v) => s + v, 0);   // pazar havuzlarındaki ASTRA (100 M)
  const piyango = 200e6 - pazar - Object.values(C.TREASURY_SEED).reduce((s, v) => s + v, 0);   // 12 M (kendi kendini besler, modelde bekler)
  const A = C.TREASURY_ALLOCATION;
  const B = { yakim: C.TOKEN_BURN_RATE, yapimci: C.CREATOR_ROYALTY_RATE, ubi: C.UBI_POOL_RATE };
  const LK = C.LOCKED_BALANCE;

  // ── Oyuncu tipleri ──
  const TIP = Object.entries(P.tipler).map(([ad, t]) => ({ ad, ...t, serbest: 0, kilitli: 0, stake: 0, genesis: 0, uyandiran: [], dagitilanAy: 0, cekilenUsdAy: 0, gelirBuHafta: 0 }));
  const agirlikTop = TIP.reduce((s, t) => s + t.n * t.agirlik, 0);

  // ── Sayaçlar ──
  const Y = { tradeYakim: 0, oyunYakim: 0, ucretYakim: 0, savunmaYakim: 0, genesisYakim: 0 };
  let ubiKazan = 0, yapimciBirikim = 0, tradeKredi = 0, tradeTut = 0, stakeOdulHavuz = 0, kadran = 1, carpan = 1, fren = {};
  const cozulme = [];   // stake ödülü: [{ hafta, miktar }] — çözülünce satılır (en kötü durum)
  let cozulmusStakeOdulu = 0;
  const seri = { tb: [], tbTaze: [], na: [], fiyat: [], fiyatTarih: [] };
  const aylik = [];
  const ihlal = { cikisTrade: 0, kullaniciKurali: 0, kasaEksi: 0, genesisTavan: 0, fiyatDususu: 0, tradeYokCikis: 0 };
  let enYuksekOran = 0, toplamCikis = 0, toplamTradeTaze = 0, genesisToplam = 0, kapiAy = null, kayipUsdToplam = 0, dagitimAy = 0, oyunaGelenAy = 0;
  const genesisHaftalari = [];
  let oncekiFiyat = Z.price();

  // Harcamanın bölüşümü (oyunda her harcama gibi): %5 yakım, %3 yapımcı, %6 temel gelir, %86 kasalar
  function harcamaBol(x) {
    if (!(x > 0)) return;
    const yak = x * B.yakim; Z.burnTokens(yak); Y.oyunYakim += yak;
    yapimciBirikim += x * B.yapimci;
    ubiKazan += x * B.ubi;
    const kasa = x * (1 - B.yakim - B.yapimci - B.ubi);
    for (const [id, pay] of Object.entries(A)) {
      const v = kasa * pay;
      if (id === 'ammBuyback') { pazar += v; continue; }          // geri alım: pazardan hammadde alıp yakar, ASTRA pazar havuzuna geçer
      V[id] = (V[id] || 0) + v;
      if (ODEYEN.includes(id)) girisBuHafta[id] += v;
    }
  }
  // Oyuncu tipinin bakiyesinden harcama (önce kilitliden; harcananın %20'si kadar kilit açılır)
  function tipHarca(t, miktar) {
    const kil = Math.min(t.kilitli, miktar); t.kilitli -= kil;
    const ser = Math.min(t.serbest, miktar - kil); t.serbest -= ser;
    const yapilan = kil + ser;
    const ac = Math.min(t.kilitli, yapilan * LK.UNLOCK_ON_SPEND); t.kilitli -= ac; t.serbest += ac;
    return yapilan;
  }

  for (let w = 1; w <= P.weeks; w++) {
    const fiyatBas = Z.price();
    let piyasaAlimToken = 0, piyasaSatisDisToken = 0;

    // Genesis ayrıcalıklarının ve stake indiriminin trade gelirinden götürdüğü (dolar, haftalık)
    const g = P.genesis;
    const genesisSahip = TIP.reduce((s, t) => s + t.genesis, 0);
    const genesisKayip = genesisSahip * (g.uyduAyUsd * g.uyduOdeyecekti + g.gozlemeviYilIndirimUsd / 12 * g.gozlemeviAlacakti) / HAFTA_AY;
    let indirimKayip = 0;
    if (P.stakeAcik && w >= P.stake.baslaHafta) {
      for (const t of TIP) {
        if (!(t.stake > 0) || !(t.tradeAyUsd > 0)) continue;
        const kisiEpUsd = t.stake / Math.max(1, t.n * t.stakeOran) * fiyatBas;
        const oran = Math.min(P.stake.indirimTavan, Math.floor(kisiEpUsd / 200) * P.stake.indirimHer200Usd);
        indirimKayip += t.n * t.stakeOran * t.tradeAyUsd * oran / HAFTA_AY;
      }
    }

    // 1) Trade: müşteriler dolar fiyatlı paketleri ASTRA ile öder (piyasadan taze alım); ödül havuzu kredisi geri döner (alım değil)
    const tradeAcik = !(P.tradeBitisHafta && w > P.tradeBitisHafta);
    const tradeUsd = tradeAcik ? Math.max(0, P.tradeUsdAy / HAFTA_AY - genesisKayip - indirimKayip) : 0;
    kayipUsdToplam += genesisKayip + indirimKayip;
    const taze = tradeUsd > 0 ? Z.buyUsd(tradeUsd, w) : 0;
    piyasaAlimToken += taze;
    // Trade ödül havuzu kredisiyle yapılan ödeme yeni alım değildir: bölüşüme girer ama Çıkış Kapısı'nın trade ölçüsüne (TB) SAYILMAZ.
    // İlk taslakta sayılıyordu: trade durduktan sonra da kredi döndükçe oyundan çıkış sürdü (kullanıcı kuralı 41 haftada bozuldu).
    const kredi = tradeKredi * P.trade.krediGeriDonus; tradeKredi -= kredi;
    const odenen = taze + kredi;                                  // trade uygulamasına ödenen toplam ASTRA
    const tb = taze;                                              // Çıkış Kapısı ölçüsü: yalnız taze ödeme
    const ty = odenen * P.trade.yakim; Z.burnTokens(ty); Y.tradeYakim += ty;
    tradeTut += odenen * P.trade.tut;                             // sahibin acil durum kasası (satılmaz)
    const stakeCanli = P.stakeAcik && w >= P.stake.baslaHafta;
    const stakePay = stakeCanli ? P.trade.stakePayi : 0;
    tradeKredi += odenen * (P.trade.havuz - stakePay);
    stakeOdulHavuz += odenen * stakePay;
    const oyunaGelen = odenen * P.trade.oyun;
    harcamaBol(oyunaGelen);                                       // oyuna gelen %40 (ortak gelir) her harcama gibi bölünür

    // 2) Oyuncuların oyun için ASTRA alması (hemen oyunda harcanır)
    if (P.oyuncuAlim) {
      for (const t of TIP) {
        const usd = t.n * ((w === 1 ? t.alimIlkUsd : 0) + t.alimAyUsd / HAFTA_AY);
        if (!(usd > 0)) continue;
        const al = Z.buyUsd(usd, w); piyasaAlimToken += al; harcamaBol(al);
      }
    }

    // 3) Stake sitesi: taze alım, dolaşımdan çekilir
    if (stakeCanli) {
      for (const t of TIP) {
        const usd = t.n * t.stakeOran * ((w === P.stake.baslaHafta ? t.stakeIlkUsd : 0) + t.stakeAyUsd / HAFTA_AY);
        if (!(usd > 0)) continue;
        const al = Z.buyUsd(usd, w); piyasaAlimToken += al; t.stake += al;
      }
      // Stake ödülü: havuz haftalık EP'ye göre dağılır, stake'e eklenir, ödül kısmı 26 haftada çözülür
      const epTop = TIP.reduce((s, t) => s + t.stake * (1 + 0.15 * (t.genesis > 0 ? t.genesis / Math.max(1, t.n * t.stakeOran) : 0)), 0);
      if (epTop > 0 && stakeOdulHavuz > 0) {
        const odul = stakeOdulHavuz; stakeOdulHavuz = 0;
        for (const t of TIP) { const pay = odul * t.stake / epTop; t.stake += pay; }
        cozulme.push({ hafta: w + P.stake.odulCozulmeHafta, miktar: odul });
      }
    }

    // 4) Genesis yolu: mühürden önceki 8 hafta uyandırma (oyunda harcama), mühür haftası dolar sabit bedel (taze alım; yarısı yakılır)
    if (P.genesisAcik) {
      for (const t of TIP) {
        const tk = g.takvim[t.ad]; if (!tk || !(tk.adet > 0)) continue;
        for (let i = 0; i < tk.adet; i++) {
          const muhurHaftasi = tk.adet === 1 ? tk.ilk : Math.round(tk.ilk + (tk.son - tk.ilk) * i / (tk.adet - 1));
          if (w > muhurHaftasi - g.uyandirmaHafta && w <= muhurHaftasi) {
            let gereken = g.birim * g.birimAstra * carpan / g.uyandirmaHafta;
            const yapilan = tipHarca(t, gereken); harcamaBol(yapilan); gereken -= yapilan;
            if (gereken > 0) {                                     // bakiye yetmezse eksik piyasadan alınır
              const usd = gereken * Z.price() / (1 - 0.01);
              const al = Z.buyUsd(usd, w); piyasaAlimToken += al; harcamaBol(al);
            }
          }
          if (w === muhurHaftasi) {
            if (genesisToplam >= g.sezonTavan) continue;            // sezon tavanı doldu: mühür basılmaz
            const al = Z.buyUsd(g.muhurUsd, w); piyasaAlimToken += al;
            const yak = al * g.muhurYakim; Z.burnTokens(yak); Y.genesisYakim += yak;
            harcamaBol(al - yak);
            t.genesis += 1; genesisToplam += 1; genesisHaftalari.push(w);
          }
        }
      }
      if (genesisToplam > g.sezonTavan) ihlal.genesisTavan++;
    }

    // 5) Oyun içi dağıtım: KARAR 7 haftalık bütçe × Ödeme Kadranı; Fatih; pazar; temel gelir
    let dagitim = 0, gorevOdeme = 0;
    for (const id of ODEYEN) {
      const gecmis = giris[id];
      const ortGiris = gecmis.length ? gecmis.reduce((s, v) => s + v, 0) / gecmis.length : 0;
      const saglik = Math.max(C.TREASURY_WEEKLY_BUDGET.HEALTH_MIN, Math.min(1, V[id] / (C.TREASURY_TARGET_RESERVE[id] || 1)));
      const butce = V[id] * RATES[id] * saglik * kadran + ortGiris * C.TREASURY_WEEKLY_BUDGET.INFLOW_SHARE;
      const ode = Math.max(0, Math.min(V[id], butce * P.kullanim));
      V[id] -= ode; dagitim += ode;
      if (id === 'quest') gorevOdeme = ode;
    }
    for (const id of ODEYEN) { giris[id] = [...giris[id], girisBuHafta[id]].slice(-C.TREASURY_WEEKLY_BUDGET.INFLOW_WEEKS); girisBuHafta[id] = 0; }
    if (w >= P.fatihBaslaHafta) { const f = V.fatih * P.fatihOran; V.fatih -= f; dagitim += f; }
    const pazarNet = pazar * P.pazarOran; pazar -= pazarNet; dagitim += pazarNet;
    dagitim += ubiKazan; ubiKazan = 0;
    for (const t of TIP) {
      const pay = dagitim * t.n * t.agirlik / agirlikTop;
      t.kilitli += pay * (1 - LK.FREE_SHARE); t.serbest += pay * LK.FREE_SHARE;
      t.dagitilanAy += pay * Z.price(); t.gelirBuHafta = pay;
    }
    // 6) Oyun içi harcama (gelirin payı) ve haftalık kilit açılması
    const k = priceFactorK(fren);
    for (const t of TIP) {
      const h = tipHarca(t, t.gelirBuHafta * P.harcamaPayi); harcamaBol(h);
      const ac = t.kilitli * (LK.WEEKLY_UNLOCK_BASE * k + LK.WEEKLY_UNLOCK_ACTIVE); t.kilitli -= ac; t.serbest += ac;
    }

    // 7) Spekülatör şoku (yalnız şok senaryosunda): fiyatı sokDusus kadar düşürecek satış
    if (P.sokHafta && w === P.sokHafta) {
      const q = Z.M.grad ? Z.M.T * (1 / Math.sqrt(1 - P.sokDusus) - 1) : Z.M.S * (1 - Math.sqrt(1 - P.sokDusus));
      Z.sellAda(q); piyasaSatisDisToken += q;
    }

    // 8) Ölçüler ve Çıkış Kapısı (hafta sonu hesaplaşması; altın kural 1)
    seri.tb.push(tb);
    seri.na.push(Math.max(0, piyasaAlimToken - piyasaSatisDisToken));   // kendi çıkışımız hariç (geri eklenmiş) net piyasa alımı
    let E = ekosistemCikisTavani({ tb: seri.tb, na: seri.na, fiyatEtkisiTavani: Z.wdCap(WR.maxPriceDrop), k, gonderimTavani: 100e6 });
    const Etavan = E;
    let satilan = 0;
    // önce yapımcı payı, sonra çözülen stake ödülü (ikisi de zarfın içinde; en kötü durum: satılır)
    const yap = Math.min(yapimciBirikim, E); yapimciBirikim -= yap; E -= yap; satilan += yap;
    while (cozulme.length && cozulme[0].hafta <= w) cozulmusStakeOdulu += cozulme.shift().miktar;
    const stakeSat = Math.min(cozulmusStakeOdulu, E);
    if (stakeSat > 0) {
      cozulmusStakeOdulu -= stakeSat; E -= stakeSat; satilan += stakeSat;
      const stTop = TIP.reduce((s, t) => s + t.stake, 0);
      for (const t of TIP) if (stTop > 0) t.stake -= stakeSat * t.stake / stTop;
    }
    // oyuncu çekimleri: istek = serbest × eğilim; zarfa sığan kısım orantılı; ücret %3 (frende %6), yarısı yakım yarısı temel gelir
    const istekTop = TIP.reduce((s, t) => s + t.serbest * P.satisEgilimi, 0);
    const verilen = Math.min(istekTop, E);
    const ucretOrani = fren.on ? WR.feeBrake : WR.fee;
    if (verilen > 0) {
      for (const t of TIP) {
        const v = verilen * (t.serbest * P.satisEgilimi) / istekTop;
        t.serbest -= v;
        const net = v * (1 - ucretOrani);
        t.cekilenUsdAy += net * Z.price();
      }
      const ucret = verilen * ucretOrani;
      const uy = ucret * (1 - WR.feeUbiShare); Z.burnTokens(uy); Y.ucretYakim += uy; ubiKazan += ucret * WR.feeUbiShare;
      satilan += verilen - ucret;
    }
    const cikisToplam = yap + stakeSat + verilen;   // ekosistemden cüzdanlara çıkan (ücret dahil brüt)
    Z.sellAda(satilan);
    toplamCikis += cikisToplam; toplamTradeTaze += taze;

    // değişmezler
    if (cikisToplam > WR.exitTradeShare * tb + 1e-6) ihlal.cikisTrade++;
    if (taze > 0) enYuksekOran = Math.max(enYuksekOran, cikisToplam / taze);
    if (cikisToplam > taze + 1e-6) ihlal.kullaniciKurali++;
    if (taze <= 0 && cikisToplam > 1e-9) ihlal.tradeYokCikis++;
    for (const v of Object.values(V)) if (v < -1e-6) ihlal.kasaEksi++;
    if (pazar < -1e-6) ihlal.kasaEksi++;
    const fiyatSon = Z.price();
    const sokHaftasi = P.sokHafta && w === P.sokHafta;
    if (!sokHaftasi && fiyatSon < oncekiFiyat * (1 - 1e-9)) ihlal.fiyatDususu++;
    oncekiFiyat = fiyatSon;

    // 9) Fren (fiyata dayalı: plan B4) ve savunma yakımı; fiyat çarpanı; Ödeme Kadranı (gelecek hafta için)
    seri.fiyat.push(fiyatSon); seri.fiyatTarih.push({ at: w * 7 * GUN, mcapUsd: fiyatSon * 1e12 });
    fren = brakeState(seri.fiyatTarih.slice(-5), fren, w * 7 * GUN);
    if (fren.on) {
      for (const id of Object.keys(V)) { const b = V[id] * WR.defenseBurnWeekly; V[id] -= b; Z.burnTokens(b); Y.savunmaYakim += b; }
    }
    const odeyenToplam = ODEYEN.reduce((s, id) => s + V[id], 0);
    // Fiyat çarpanının kasa ömrü düzeltmesi sunucudaki gibi (server/world/haftalik.js): ödeme yapan kasalar ÷ aylık ücretsiz havuz.
    // Ücretsiz havuz haftada görev kasasının en çok WEEKLY_POOL_CAP'i (%1,5) kadardır; görev kasasının bütün haftalık bütçesi değil.
    const faucetHafta = Math.min(gorevOdeme, V.quest * C.FREE_PLAYER_POOL.WEEKLY_POOL_CAP);
    const kasaOmruAy = faucetHafta > 0 ? odeyenToplam / (faucetHafta * HAFTA_AY) : 999;
    const kasaSagligi = odeyenToplam / ODEYEN.reduce((s, id) => s + (C.TREASURY_TARGET_RESERVE[id] || 0), 0);
    carpan = nextMultiplier({ current: carpan, priceUsd: fiyatSon, launchPriceUsd: fiyatAcilis, runwayMonths: kasaOmruAy });
    kadran = kadranHaftalik(seri.fiyat, kadran, kasaSagligi);
    dagitimAy += dagitim; oyunaGelenAy += oyunaGelen;

    // 10) Ay sonu kaydı (4 haftada bir)
    if (w % 4 === 0) {
      const ay = w / 4;
      const oyuncuStok = TIP.reduce((s, t) => s + t.serbest + t.kilitli, 0);
      const kasaStok = Object.values(V).reduce((s, v) => s + v, 0);
      const oyunStok = oyuncuStok + kasaStok + pazar + piyango + ubiKazan + yapimciBirikim;
      const stakeStok = TIP.reduce((s, t) => s + t.stake, 0);
      const cekilebilirKisiUsd = Etavan * fiyatSon * HAFTA_AY / 100;
      const dagitilanKisiUsd = TIP.reduce((s, t) => s + t.dagitilanAy, 0) / 100;
      if (kapiAy == null && dagitilanKisiUsd >= 50 && cekilebilirKisiUsd >= 16.7) kapiAy = ay;
      aylik.push({
        ay, fiyat1M: +(fiyatSon * 1e6).toFixed(4), piyasaDegeriUsd: Math.round(fiyatSon * Z.circ()), rezervAvax: +Z.rezervAvax().toFixed(1), mezun: Z.M.grad,
        tbHafta: Math.round(tb), cikisTavani: Math.round(Etavan), cikis: Math.round(cikisToplam), kadran, carpan, fren: !!fren.on,
        kasaSagligi: +kasaSagligi.toFixed(3), kasaOmruAy: +kasaOmruAy.toFixed(1), odeyenKasalar: Math.round(odeyenToplam), oyunStok: Math.round(oyunStok), oyuncuStok: Math.round(oyuncuStok),
        dagitimKisiHaftaAstra: Math.round(dagitimAy / 4 / 100), oyunaGelenHaftaAstra: Math.round(oyunaGelenAy / 4),
        // Oyun içi fiyat endeksi (bulgu 1): oyundaki ASTRA (oyuncu + kasalar + pazar) ÷ 200 M tasarım stoku
        oyunIciEndeks: +(oyunStok / 200e6).toFixed(2),
        stakeOrani: +(stakeStok / Z.circ()).toFixed(4), yakilan: Math.round(Object.values(Y).reduce((s, v) => s + v, 0)), genesis: genesisToplam,
        kisiBasi: Object.fromEntries(TIP.map(t => [t.ad, { dagitilanUsd: +(t.dagitilanAy / t.n).toFixed(3), cekilenUsd: +(t.cekilenUsdAy / t.n).toFixed(3) }])),
        cekilebilirKisiUsd: +cekilebilirKisiUsd.toFixed(3), tradeKayipUsdAy: +((genesisKayip + indirimKayip) * HAFTA_AY).toFixed(2)
      });
      for (const t of TIP) { t.dagitilanAy = 0; t.cekilenUsdAy = 0; }
      dagitimAy = 0; oyunaGelenAy = 0;
    }
  }

  const son = aylik[aylik.length - 1];
  const ay = n => aylik.find(r => r.ay === n) || son;
  return {
    senaryo: senaryoAdi, ad: S.ad, girdiler: P,
    ozet: {
      fiyat1M: { acilis: +(fiyatAcilis * 1e6).toFixed(4), ay12: ay(12).fiyat1M, ay24: ay(24).fiyat1M, ay36: son.fiyat1M },
      piyasaDegeriUsd: { ay12: ay(12).piyasaDegeriUsd, ay36: son.piyasaDegeriUsd },
      mezuniyetHaftasi: Z.M.gradWeek,
      toplamCikis: Math.round(toplamCikis), toplamTradeTaze: Math.round(toplamTradeTaze),
      cikisTradeOrani: toplamTradeTaze > 0 ? +(toplamCikis / toplamTradeTaze).toFixed(3) : 0,
      enYuksekHaftalikOran: +enYuksekOran.toFixed(3),
      yakilan: Object.fromEntries(Object.entries(Y).map(([k2, v]) => [k2, Math.round(v)])),
      yakilanArzPayi: +(Object.values(Y).reduce((s, v) => s + v, 0) / (Z.M.S || 1)).toFixed(4),
      sahibinKasasi: Math.round(tradeTut),
      oyunStok: { acilis: 200e6, ay12: ay(12).oyunStok, ay36: son.oyunStok },
      oyunIciEndeks: { ay1: ay(1).oyunIciEndeks, ay12: ay(12).oyunIciEndeks, ay36: son.oyunIciEndeks },
      dagitimKisiHaftaAstra: { ay1: ay(1).dagitimKisiHaftaAstra, ay12: ay(12).dagitimKisiHaftaAstra, ay36: son.dagitimKisiHaftaAstra },
      fiyatCarpani36: son.carpan,
      kasaSagligi36: son.kasaSagligi, kasaSagligiEnDusuk: Math.min(...aylik.map(r => r.kasaSagligi)),
      tradeKayipUsdToplam: Math.round(kayipUsdToplam),
      kadranAraligi: [Math.min(...aylik.map(r => r.kadran)), Math.max(...aylik.map(r => r.kadran))],
      genesis: { adet: genesisToplam, ilkHafta: genesisHaftalari[0] ?? null, sonHafta: genesisHaftalari[genesisHaftalari.length - 1] ?? null },
      stakeOrani36: son.stakeOrani,
      kisiBasiAy12: ay(12).kisiBasi, kisiBasiAy36: son.kisiBasi,
      kapiAcilirAy: kapiAy,
      ihlal
    },
    aylik
  };
}

// ── Komut satırı ──
const buDosya = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(buDosya).href) {
  const argv = process.argv.slice(2);
  const A2 = Object.fromEntries(argv.filter(x => x.includes('=')).map(x => x.split('=')));
  const ek = {};
  for (const key of ['weeks', 'oyuncuAlim', 'stakeAcik', 'genesisAcik', 'satisEgilimi', 'harcamaPayi', 'avaxUsd']) if (A2[key] != null) ek[key] = Number(A2[key]);
  const fmt = v => (v == null ? '-' : Math.round(v).toLocaleString('tr-TR'));
  const kok = path.resolve(path.dirname(buDosya), '..', '..');
  const liste = argv.includes('hepsi') ? Object.keys(SENARYOLAR) : [A2.senaryo || 't750'];
  console.log('senaryo | 1M ASTRA $ (açılış / 12. ay / 36. ay) | piyasa değeri 36. ay $ | mezuniyet hf | çıkış ÷ trade alımı | yakılan arz payı | oyun stoku 36. ay | kasa sağlığı 36. ay (en düşük) | kadran | Genesis | stake payı | kişi başı $/ay 36. ay (ücretsiz dağıtılan/çekilen) | kapı açılır | ihlal');
  for (const ad of liste) {
    const r = calistir(ad, ek);
    const o = r.ozet;
    const ihl = Object.entries(o.ihlal).filter(([, v]) => v > 0).map(([k2, v]) => `${k2}:${v}`).join(' ') || 'yok';
    const u = o.kisiBasiAy36.ucretsiz;
    console.log(`${ad} | ${o.fiyat1M.acilis} / ${o.fiyat1M.ay12} / ${o.fiyat1M.ay36} | ${fmt(o.piyasaDegeriUsd.ay36)} | ${o.mezuniyetHaftasi ?? 'yok'} | ${o.cikisTradeOrani} (hafta en çok ${o.enYuksekHaftalikOran}) | %${(o.yakilanArzPayi * 100).toFixed(1)} | ${fmt(o.oyunStok.ay36)} | ${o.kasaSagligi36} (${o.kasaSagligiEnDusuk}) | ${o.kadranAraligi.join('-')} | ${o.genesis.adet} (${o.genesis.ilkHafta ?? '-'}-${o.genesis.sonHafta ?? '-'}. hf) | %${(o.stakeOrani36 * 100).toFixed(2)} | ${u.dagitilanUsd} / ${u.cekilenUsd} | ${o.kapiAcilirAy ?? 'hiç'} | ${ihl}`);
    const hedef = A2.out || (argv.includes('hepsi') || argv.includes('yaz') ? path.join(kok, 'docs', 'v2', `model_makro_${ad}.json`) : null);
    if (hedef) fs.writeFileSync(hedef, JSON.stringify(r, null, 1) + '\n');
  }
}
