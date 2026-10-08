// Realm of AdAstra — Test Laboratuvarı senaryoları. TEK doğruluk kaynağı: aynı tanım hem arayüzde (js/ui/v3/lab.js) hem başsız testte
// (tests/test_senaryo_laboratuvari.mjs, her senaryo taze bir oyun motorunda) çalışır; elle test = otomatik regresyon.
//
// Bir senaryo: { id, kategori, ad, ne (neyi sınadığı, bir cümle), kur(gs), calistir(gs) → sonuc, beklenen: [{ ad, tamam(once, sonra, sonuc) }] }
//   kur        : ön koşulu AÇIKÇA kurar (taze motora güvenmez; canlı kayıtta da çalışsın diye yalnız ilgili alanları ayarlar).
//   calistir   : sınanan eylemi yapar, eylemin döndürdüğü sonucu (varsa) geri verir.
//   beklenen   : oyunun TASARIM kuralları (neden böyle olması gerektiği ad'ında yazar); once/sonra = ozet() görüntüleri.
// Senaryolar rastgelelik içermez (zindan/çark gibi şansa bağlı eylemler burada yok; onlar sunucuda çözülür).
import { ammMarket } from '../ammMarket.js';

// Oyunun o anki durumunun karşılaştırmaya yarayan kısa görüntüsü
export function ozet(gs) {
  const st = gs.state;
  const sefer = Object.values(st.activeExpeditions || {});
  return {
    astra: st.adAstraBalance,
    env: { ...(st.inventory || {}) },
    seviye: st.level,
    stamina: Math.floor(st.stamina),
    maxStamina: gs.getMaxStamina(st.level),
    xp: st.currentXp || 0,
    xpGerekli: gs.getNextLevelRequirement().xp,
    asker: (st.soldierUnits || []).length,
    seferAcik: sefer.length,
    seferHazir: sefer.filter((e) => e.isCompleted).length,
    siloSeviye: st.warehouseLevel || 1,
    siloOdun: gs.getWarehouseCapacity().wood,
    baltaDayanikliligi: (st.tools.axe || {}).durability,
    odunFiyati: ammMarket.getPrice('wood'),
    bilet: st.lotteryTickets || 0,
    rehberTamam: Object.entries(st.onboarding || {}).filter(([, v]) => v && v.done).map(([k]) => k)
  };
}

const ALET_TAM = 4320;
// Ortak ön koşullar
const temiz = (gs) => { gs.state.activeExpeditions = {}; gs.repairAllDevTools(); gs.refillDevStamina(); };
const tumuDolu = (gs) => { const cap = gs.getWarehouseCapacity(); for (const k of Object.keys(cap)) gs.setDevResource(k, cap[k]); };
const hepsiBos = (gs) => { for (const k of Object.keys(gs.getWarehouseCapacity())) gs.setDevResource(k, 0); };
// İleri sarma tek çağrıda en çok ~24 saat ilerler (yüksek seviyede sefer 26 saati bulur), bu yüzden parça parça sarılır
// Her ileri sarma çağrısı birkaç saniye yuvarlama kaybeder; "süre dolunca" senaryoları bu yüzden süreye küçük bir pay (3 dk) ekler.
const PAYI = 0.05;
const ilerlet = (gs, saat) => { let kalan = saat; while (kalan > 1e-9) { const adim = Math.min(kalan, 12); gs.fastForwardTime(adim); kalan -= adim; } };
const seferTamamla = (gs, node) => { const r = gs.startExpedition(node); ilerlet(gs, gs.getExpeditionDurationHours() + PAYI); return r; };

export const KATEGORILER = [
  { id: 'zaman', ad: 'Zaman' },
  { id: 'sefer', ad: 'Sefer ve hasat' },
  { id: 'karakter', ad: 'Karakter' },
  { id: 'silo', ad: 'Silo' },
  { id: 'ordu', ad: 'Ordu' },
  { id: 'pazar', ad: 'Pazar' },
  { id: 'karnaval', ad: 'Karnaval' },
  { id: 'rehber', ad: 'Rehber' }
];

export const SENARYOLAR = [
  // ------------------------------------------------------------------ ZAMAN
  {
    id: 'zaman-sefer-hazir', kategori: 'zaman', ad: 'Süre dolunca sefer hazır olur',
    ne: 'Odun seferi başlar; süresi kadar zaman ilerleyince "hazır" olmalı, süre dolmadan değil.',
    kur: (gs) => { temiz(gs); },
    calistir: (gs) => {
      const baslangic = gs.startExpedition('wood');
      const sure = gs.getExpeditionDurationHours();
      const yarim = (() => { ilerlet(gs, sure / 2); return ozet(gs); })();
      ilerlet(gs, sure / 2 + PAYI);
      return { baslangic, yarim };
    },
    beklenen: [
      { ad: 'Sefer başladı', tamam: (o, s, r) => r.baslangic.success === true },
      { ad: 'Sürenin yarısında hâlâ hazır değil', tamam: (o, s, r) => r.yarim.seferAcik === 1 && r.yarim.seferHazir === 0 },
      { ad: 'Süre dolunca hazır', tamam: (o, s) => s.seferAcik === 1 && s.seferHazir === 1 }
    ]
  },
  {
    id: 'zaman-stamina-dolar', kategori: 'zaman', ad: 'Stamina zamanla kendiliğinden dolar',
    ne: 'Stamina sıfırken bir saat geçince artmalı, ama en çok üst sınıra kadar.',
    kur: (gs) => { temiz(gs); gs.state.stamina = 0; },
    calistir: (gs) => { ilerlet(gs, 1); },
    beklenen: [
      { ad: 'Stamina arttı', tamam: (o, s) => s.stamina > o.stamina },
      { ad: 'Üst sınırı aşmadı', tamam: (o, s) => s.stamina <= s.maxStamina }
    ]
  },
  // ------------------------------------------------------------------ SEFER VE HASAT
  {
    id: 'sefer-hasat-ambara-girer', kategori: 'sefer', ad: 'Hasat ambara girer, deneyim kazanılır',
    ne: 'Biten odun seferi toplanınca odun artmalı, sefer listeden kalkmalı, XP kazanılmalı.',
    kur: (gs) => { temiz(gs); gs.setDevResource('wood', 0); },
    calistir: (gs) => { seferTamamla(gs, 'wood'); return gs.claimExpedition('wood'); },
    beklenen: [
      { ad: 'Toplama başarılı', tamam: (o, s, r) => r.success === true },
      { ad: 'Odun arttı', tamam: (o, s) => s.env.wood > o.env.wood },
      { ad: 'Sefer listeden kalktı (silo hasadı almaya yetmediyse kalanıyla açık durur)', tamam: (o, s, r) => s.seferAcik === 0 || r.stillRemaining > 0 },
      { ad: 'Deneyim (XP) kazanıldı', tamam: (o, s, r) => s.xp > o.xp || s.seviye > o.seviye || r.xpGained > 0 }
    ]
  },
  {
    id: 'sefer-silo-siniri', kategori: 'sefer', ad: 'Hasat siloyu aşamaz',
    ne: 'Silo doluyken biten sefer toplanınca odun silo kapasitesini geçmemeli.',
    kur: (gs) => { temiz(gs); gs.setDevResource('wood', gs.getWarehouseCapacity().wood); },
    calistir: (gs) => { seferTamamla(gs, 'wood'); gs.claimExpedition('wood'); },
    beklenen: [
      { ad: 'Odun silo kapasitesini aşmadı', tamam: (o, s) => s.env.wood <= s.siloOdun }
    ]
  },
  {
    id: 'sefer-stamina-yok', kategori: 'sefer', ad: 'Stamina yoksa sefer başlamaz',
    ne: 'Stamina sıfırken sefer reddedilmeli ve nedeni "stamina yetersiz" olarak işaretlenmeli.',
    kur: (gs) => { temiz(gs); gs.state.stamina = 0; },
    calistir: (gs) => gs.startExpedition('iron'),
    beklenen: [
      { ad: 'Sefer reddedildi', tamam: (o, s, r) => r.success === false },
      { ad: 'Neden: stamina yetersiz', tamam: (o, s, r) => r.isInsufficientStamina === true },
      { ad: 'Aktif sefer oluşmadı', tamam: (o, s) => s.seferAcik === 0 }
    ]
  },
  {
    id: 'sefer-ikinci-sefer', kategori: 'sefer', ad: 'Aynı alanda ikinci sefer açılamaz',
    ne: 'Zaten çalışan bir alana yeni sefer gönderilememeli; ikinci reddedilince stamina harcanmamalı.',
    kur: (gs) => { temiz(gs); },
    calistir: (gs) => { gs.startExpedition('wood'); const arada = ozet(gs); const ikinci = gs.startExpedition('wood'); return { arada, ikinci }; },
    beklenen: [
      { ad: 'İkinci sefer reddedildi', tamam: (o, s, r) => r.ikinci.success === false },
      { ad: 'Tek aktif sefer var', tamam: (o, s) => s.seferAcik === 1 },
      { ad: 'Reddedilen sefer stamina harcamadı', tamam: (o, s, r) => s.stamina === r.arada.stamina }
    ]
  },
  {
    id: 'sefer-kirik-alet', kategori: 'sefer', ad: 'Kırık aletle sefer başlamaz',
    ne: 'Balta tamamen aşınmışsa odun seferi reddedilmeli ve mesaj "kırık" demeli.',
    kur: (gs) => { temiz(gs); gs.state.tools.axe.durability = 0; },
    calistir: (gs) => gs.startExpedition('wood'),
    beklenen: [
      { ad: 'Sefer reddedildi', tamam: (o, s, r) => r.success === false },
      { ad: 'Mesaj aletin kırık olduğunu söylüyor', tamam: (o, s, r) => /kırık/i.test(r.message) }
    ]
  },
  {
    id: 'sefer-alet-onarim', kategori: 'sefer', ad: 'Aleti onarmak dayanıklılığı yükseltir',
    ne: 'Biraz aşınmış balta, hammadde harcanarak tam dayanıklılığa dönmeli.',
    kur: (gs) => { temiz(gs); gs.state.tools.axe.durability = ALET_TAM - 60; tumuDolu(gs); },
    calistir: (gs) => gs.repairTool('axe'),
    beklenen: [
      { ad: 'Onarım başarılı', tamam: (o, s, r) => r.success === true },
      { ad: 'Dayanıklılık arttı', tamam: (o, s) => s.baltaDayanikliligi > o.baltaDayanikliligi },
      { ad: 'Onarım hammadde harcadı', tamam: (o, s) => s.env.wood < o.env.wood || s.env.iron < o.env.iron || s.env.stone < o.env.stone }
    ]
  },
  // ------------------------------------------------------------------ KARAKTER
  {
    id: 'karakter-seviye', kategori: 'karakter', ad: 'Seviye yükselince stamina üst sınırı artar',
    ne: 'Seviye 10 yapılınca seviye değişmeli ve en çok stamina büyümeli.',
    kur: (gs) => { temiz(gs); gs.setDevLevel(1); },
    calistir: (gs) => { gs.setDevLevel(10); },
    beklenen: [
      { ad: 'Seviye 10 oldu', tamam: (o, s) => s.seviye === 10 },
      { ad: 'Stamina üst sınırı büyüdü', tamam: (o, s) => s.maxStamina > o.maxStamina }
    ]
  },
  {
    id: 'karakter-xp-tanki', kategori: 'karakter', ad: 'Deneyim tankı taşmaz',
    ne: 'Çok büyük XP verilince tank, bir sonraki seviyenin gereğini aşmamalı (seviye atlama oyuncunun düğmesiyle olur).',
    kur: (gs) => { temiz(gs); gs.setDevLevel(1); gs.state.currentXp = 0; },
    calistir: (gs) => { gs.addXp(1e9); },
    beklenen: [
      { ad: 'XP tankı gerekenin üstüne çıkmadı', tamam: (o, s) => s.xp <= s.xpGerekli },
      { ad: 'Seviye kendiliğinden atlamadı', tamam: (o, s) => s.seviye === o.seviye }
    ]
  },
  // ------------------------------------------------------------------ SİLO
  {
    id: 'silo-yuzde-80', kategori: 'silo', ad: 'Silo, depolar %80 dolu değilse yükseltilemez',
    ne: 'Depolar boşken silo yükseltme reddedilmeli ve nedeni %80 kuralı olmalı.',
    kur: (gs) => { temiz(gs); hepsiBos(gs); gs.setDevAdAstra(1e6); },
    calistir: (gs) => gs.upgradeWarehouse(),
    beklenen: [
      { ad: 'Yükseltme reddedildi', tamam: (o, s, r) => r.success === false },
      { ad: 'Neden: %80 doluluk kuralı', tamam: (o, s, r) => /%80/.test(r.message) },
      { ad: 'Silo seviyesi değişmedi', tamam: (o, s) => s.siloSeviye === o.siloSeviye }
    ]
  },
  {
    id: 'silo-astra-ister', kategori: 'silo', ad: 'Silo yükseltme ASTRA da ister',
    ne: 'Depolar dolu ama ASTRA yoksa yükseltme reddedilmeli.',
    kur: (gs) => { temiz(gs); tumuDolu(gs); gs.setDevAdAstra(0); },
    calistir: (gs) => gs.upgradeWarehouse(),
    beklenen: [
      { ad: 'Yükseltme reddedildi', tamam: (o, s, r) => r.success === false },
      { ad: 'Neden: ASTRA yetersiz', tamam: (o, s, r) => /ASTRA/.test(r.message) },
      { ad: 'Silo seviyesi değişmedi', tamam: (o, s) => s.siloSeviye === o.siloSeviye }
    ]
  },
  {
    id: 'silo-yukselir', kategori: 'silo', ad: 'Koşullar tamamsa silo yükselir',
    ne: 'Depolar dolu ve ASTRA yeterliyse silo bir seviye çıkmalı, kapasite büyümeli, ASTRA ve hammadde harcanmalı.',
    kur: (gs) => { temiz(gs); gs.state.warehouseLevel = 1; tumuDolu(gs); gs.setDevAdAstra(1e6); },
    calistir: (gs) => gs.upgradeWarehouse(),
    beklenen: [
      { ad: 'Yükseltme başarılı', tamam: (o, s, r) => r.success === true },
      { ad: 'Silo seviyesi 1 arttı', tamam: (o, s) => s.siloSeviye === o.siloSeviye + 1 },
      { ad: 'Silo kapasitesi büyüdü', tamam: (o, s) => s.siloOdun > o.siloOdun },
      { ad: 'ASTRA harcandı', tamam: (o, s) => s.astra < o.astra }
    ]
  },
  // ------------------------------------------------------------------ ORDU
  {
    id: 'ordu-asker-al', kategori: 'ordu', ad: 'Asker almak ASTRA düşürür',
    ne: 'Yeterli ASTRA varken ilk asker alınmalı ve bedeli kadar ASTRA düşmeli.',
    kur: (gs) => { temiz(gs); gs.state.soldierUnits = []; gs.setDevAdAstra(1e6); },
    calistir: (gs) => ({ bedel: gs.getSoldierCost(1), sonuc: gs.buySoldierUnit() }),
    beklenen: [
      { ad: 'Asker alındı', tamam: (o, s, r) => r.sonuc.success === true },
      { ad: 'Asker sayısı 1 arttı', tamam: (o, s) => s.asker === o.asker + 1 },
      { ad: 'ASTRA tam bedel kadar düştü', tamam: (o, s, r) => Math.abs((o.astra - s.astra) - r.bedel) < 1e-6 }
    ]
  },
  {
    id: 'ordu-astra-yok', kategori: 'ordu', ad: 'ASTRA yoksa asker alınamaz',
    ne: 'Bakiye sıfırken asker alma reddedilmeli; ne asker eklenmeli ne ASTRA değişmeli.',
    kur: (gs) => { temiz(gs); gs.state.soldierUnits = []; gs.setDevAdAstra(0); },
    calistir: (gs) => gs.buySoldierUnit(),
    beklenen: [
      { ad: 'Reddedildi', tamam: (o, s, r) => r.success === false },
      { ad: 'Asker eklenmedi', tamam: (o, s) => s.asker === o.asker },
      { ad: 'ASTRA değişmedi', tamam: (o, s) => s.astra === o.astra }
    ]
  },
  // ------------------------------------------------------------------ PAZAR
  {
    id: 'pazar-al-sat-kayip', kategori: 'pazar', ad: 'Alıp hemen satmak kâr bırakmaz',
    ne: 'Pazardan odun alıp aynı miktarı geri satınca elde ASTRA kalmamalı kâr değil, harç kadar kayıp olmalı.',
    kur: (gs) => { temiz(gs); gs.setDevResource('wood', 0); gs.setDevAdAstra(1000); },
    calistir: (gs) => { const al = gs.marketBuy('wood', 100); const sat = gs.marketSell('wood', 100); return { al, sat }; },
    beklenen: [
      { ad: 'Alım başarılı', tamam: (o, s, r) => r.al.success === true },
      { ad: 'Satım başarılı', tamam: (o, s, r) => r.sat.success === true },
      { ad: 'Odun miktarı başa döndü', tamam: (o, s) => s.env.wood === o.env.wood },
      { ad: 'ASTRA başlangıçtan az (harç kaybı)', tamam: (o, s) => s.astra < o.astra }
    ]
  },
  {
    id: 'pazar-fiyat-yonu', kategori: 'pazar', ad: 'Çok alınan pahalanır, çok satılan ucuzlar',
    ne: 'Alımdan sonra odun fiyatı yükselmeli (havuzdan çıktı), satıştan sonra düşmeli.',
    kur: (gs) => { temiz(gs); gs.setDevResource('wood', 0); gs.setDevAdAstra(1000); },
    calistir: (gs) => { const bas = ammMarket.getPrice('wood'); gs.marketBuy('wood', 100); const alimSonrasi = ammMarket.getPrice('wood'); gs.marketSell('wood', 100); return { bas, alimSonrasi, satimSonrasi: ammMarket.getPrice('wood') }; },
    beklenen: [
      { ad: 'Alım fiyatı yükseltti', tamam: (o, s, r) => r.alimSonrasi > r.bas },
      { ad: 'Satım fiyatı düşürdü', tamam: (o, s, r) => r.satimSonrasi < r.alimSonrasi }
    ]
  },
  {
    id: 'pazar-silo-siniri', kategori: 'pazar', ad: 'Silo doluyken alım reddedilir',
    ne: 'Odun deposu doluyken pazardan odun alınamamalı.',
    kur: (gs) => { temiz(gs); gs.setDevResource('wood', gs.getWarehouseCapacity().wood); gs.setDevAdAstra(1000); },
    calistir: (gs) => gs.marketBuy('wood', 10),
    beklenen: [
      { ad: 'Alım reddedildi', tamam: (o, s, r) => r.success === false },
      { ad: 'Neden: silo kapasitesi', tamam: (o, s, r) => /Silo/i.test(r.message) },
      { ad: 'ASTRA değişmedi', tamam: (o, s) => s.astra === o.astra }
    ]
  },
  {
    id: 'pazar-astra-yok', kategori: 'pazar', ad: 'ASTRA yoksa alım reddedilir',
    ne: 'Bakiye sıfırken alım reddedilmeli.',
    kur: (gs) => { temiz(gs); gs.setDevResource('wood', 0); gs.setDevAdAstra(0); },
    calistir: (gs) => gs.marketBuy('wood', 10),
    beklenen: [
      { ad: 'Alım reddedildi', tamam: (o, s, r) => r.success === false },
      { ad: 'Odun artmadı', tamam: (o, s) => s.env.wood === o.env.wood }
    ]
  },
  {
    id: 'pazar-olmayan-sat', kategori: 'pazar', ad: 'Olmayan hammadde satılamaz',
    ne: 'Envanterde olandan fazlasını satmak reddedilmeli.',
    kur: (gs) => { temiz(gs); gs.setDevResource('wood', 0); },
    calistir: (gs) => gs.marketSell('wood', 5),
    beklenen: [
      { ad: 'Satım reddedildi', tamam: (o, s, r) => r.success === false },
      { ad: 'ASTRA değişmedi', tamam: (o, s) => s.astra === o.astra }
    ]
  },
  // ------------------------------------------------------------------ KARNAVAL
  {
    id: 'karnaval-bilet', kategori: 'karnaval', ad: 'Piyango bileti ASTRA karşılığı alınır',
    ne: '3 bilet alınca bilet sayısı 3 artmalı ve bedeli kadar ASTRA düşmeli.',
    kur: (gs) => { temiz(gs); gs.setDevAdAstra(5000); },
    calistir: (gs) => gs.buyLotteryTickets(3),
    beklenen: [
      { ad: 'Alım başarılı', tamam: (o, s, r) => r.success === true },
      { ad: 'Bilet sayısı 3 arttı', tamam: (o, s) => s.bilet === o.bilet + 3 },
      { ad: 'ASTRA düştü', tamam: (o, s) => s.astra < o.astra }
    ]
  },
  {
    id: 'karnaval-cark-astra-yok', kategori: 'karnaval', ad: 'ASTRA yoksa çark dönmez',
    ne: 'Bakiye sıfırken çark çevirme reddedilmeli; ASTRA eksiye düşmemeli.',
    kur: (gs) => { temiz(gs); gs.setDevAdAstra(0); },
    calistir: (gs) => gs.spinCarnivalWheel('ada'),
    beklenen: [
      { ad: 'Çark reddedildi', tamam: (o, s, r) => r.success === false },
      { ad: 'ASTRA eksiye düşmedi', tamam: (o, s) => s.astra >= 0 }
    ]
  },
  // ------------------------------------------------------------------ REHBER
  {
    id: 'rehber-ilk-sefer', kategori: 'rehber', ad: 'İlk sefer rehber görevini tamamlar',
    ne: 'Hiç sefer yapılmamış hesapta ilk sefer başlatılınca "İlk seferini başlat" görevi tamamlanmalı.',
    kur: (gs) => { temiz(gs); gs.state.onboarding = {}; Object.values(gs.state.tools).forEach((t) => { t.totalGathered = 0; }); },
    calistir: (gs) => { gs.startExpedition('wood'); return gs.checkOnboardingProgress().map((q) => q.id); },
    beklenen: [
      { ad: '"first_expedition" görevi yeni tamamlananlar arasında', tamam: (o, s, r) => r.includes('first_expedition') },
      { ad: 'Görev kaydında "tamam" işaretli, ödül henüz alınmamış', tamam: (o, s) => s.rehberTamam.includes('first_expedition') && !o.rehberTamam.includes('first_expedition') }
    ]
  }
];

// Bir senaryoyu çalıştırır; sonuç: { id, gecti, adimlar: [{ ad, tamam }], once, sonra, hata }
export function senaryoCalistir(gs, senaryo) {
  try {
    senaryo.kur(gs);
    const once = ozet(gs);
    const sonuc = senaryo.calistir(gs);
    const sonra = ozet(gs);
    const adimlar = senaryo.beklenen.map((b) => {
      let tamam = false;
      try { tamam = !!b.tamam(once, sonra, sonuc); } catch { tamam = false; }
      return { ad: b.ad, tamam };
    });
    return { id: senaryo.id, gecti: adimlar.every((a) => a.tamam), adimlar, once, sonra };
  } catch (e) {
    return { id: senaryo.id, gecti: false, adimlar: [], hata: String((e && e.message) || e) };
  }
}
