// Realm of AdAstra — Test Laboratuvarı senaryoları. TEK doğruluk kaynağı: aynı tanım hem arayüzde (js/ui/v3/lab.js) hem başsız testte
// (tests/test_senaryo_laboratuvari.mjs, her senaryo taze bir oyun motorunda) çalışır; elle test = otomatik regresyon.
//
// Bir senaryo: { id, kategori, ad, ne (neyi sınadığı, bir cümle), kur(gs), calistir(gs) → sonuc, beklenen: [{ ad, tamam(once, sonra, sonuc) }] }
//   kur        : ön koşulu AÇIKÇA kurar (taze motora güvenmez; canlı kayıtta da çalışsın diye yalnız ilgili alanları ayarlar).
//   calistir   : sınanan eylemi yapar, eylemin döndürdüğü sonucu (varsa) geri verir.
//   beklenen   : oyunun TASARIM kuralları (neden böyle olması gerektiği ad'ında yazar); once/sonra = ozet() görüntüleri.
// Senaryolar rastgelelik içermez (zindan/çark gibi şansa bağlı eylemler burada yok; onlar sunucuda çözülür).
import { ammMarket } from '../ammMarket.js';
import { treasury } from '../treasury.js';
import { GAME_CONFIG } from '../config.js';

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
    arenaAnahtar: st.arenaKeys || 0,
    arenaMac: (gs.getDailyCounters().arenaMatches) || 0,
    zindanGiris: gs.getDungeonDayStatus().entriesToday,
    zindanKasasi: treasury.getPool('dungeon'),
    askerCan: (st.soldierUnits && st.soldierUnits[0]) ? st.soldierUnits[0].hp : null,
    rehberTamam: Object.entries(st.onboarding || {}).filter(([, v]) => v && v.done).map(([k]) => k)
  };
}

const ALET_TAM = 4320;
// Günlük sayaçlar (zindan girişi, arena maçı) sıfırlanır; senaryo "bugün ilk giriş" gibi durumlara güvenebilsin
const gunlukSifirla = (gs) => { const c = gs.getDailyCounters(); c.dungeonRuns = 0; c.dungeonEntries = 0; c.dungeonPaidEntries = 0; c.arenaMatches = 0; c.dungeonBudget = null; c.dungeonPaid = 0; };
const askerler = (gs, n) => { gs.setDevAdAstra(1e7); gs.state.soldierUnits = []; for (let i = 0; i < n; i++) gs.buySoldierUnit(); gs.healAllDevSoldiers(); };
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
  { id: 'zindan', ad: 'Zindan' },
  { id: 'kolezyum', ad: 'Kolezyum' },
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
  {
    id: 'ordu-koylu-siniri', kategori: 'ordu', ad: 'Asker sayısı köylü sayısıyla sınırlı',
    ne: 'Her asker bir köylü ister: sınıra kadar asker alınır, sınırda yeni asker reddedilir ve nedeni "köylü" olur.',
    kur: (gs) => { temiz(gs); gs.setDevAdAstra(1e8); gs.state.soldierUnits = []; gs.state.dungeonMode = 1; gs.state.dungeonProgress = 18; },   // zindan asker hakkı 13: bu senaryo köylü sınırını sınar
    calistir: (gs) => { let n = 0; while (n < 60 && gs.buySoldierUnit().success) n += 1; return { alinan: n, sinir: gs.getVillageInfo().soldierCap, sonraki: gs.buySoldierUnit() }; },
    beklenen: [
      { ad: 'Alınan asker sayısı köyün asker sınırına eşit', tamam: (o, s, r) => r.alinan === r.sinir && s.asker === r.sinir },
      { ad: 'Sınırda yeni asker reddedildi', tamam: (o, s, r) => r.sonraki.success === false },
      { ad: 'Neden: köylü gerekir', tamam: (o, s, r) => /köylü/i.test(r.sonraki.message) }
    ]
  },
  {
    id: 'ordu-doyur', kategori: 'ordu', ad: 'Yaralı askeri şifalı otla iyileştirmek canı doldurur',
    ne: 'Yaralı asker şifalı otla iyileştirilince can tamamen dolmalı; şifalı ot ve ASTRA harcanmalı, buğday dokunulmamalı.',
    kur: (gs) => { temiz(gs); askerler(gs, 1); gs.state.soldierUnits[0].hp = 10; gs.state.soldierUnits[0].maxHp = 100; gs.setDevResource('herb', gs.getWarehouseCapacity().herb); gs.setDevAdAstra(1000); },
    calistir: (gs) => gs.healSoldierWithHerb(0),
    beklenen: [
      { ad: 'İyileştirme başarılı', tamam: (o, s, r) => r.success === true },
      { ad: 'Can tamamen doldu', tamam: (o, s) => s.askerCan === 100 },
      { ad: 'Şifalı ot harcandı', tamam: (o, s) => s.env.herb < o.env.herb },
      { ad: 'Buğday harcanmadı', tamam: (o, s) => s.env.wheat === o.env.wheat },
      { ad: 'ASTRA harcandı', tamam: (o, s) => s.astra < o.astra }
    ]
  },
  // ------------------------------------------------------------------ ZİNDAN (savaşın sonucu şansa bağlı; burada giriş kuralları ve ödül tablosu sınanır)
  {
    id: 'zindan-kat-kilidi', kategori: 'zindan', ad: 'Önceki katı bitirmeden üst kata girilemez',
    ne: 'Zindan ilerlemesi 1 iken 3. kata savaş açılamaz; giriş sayılmaz, stamina harcanmaz.',
    kur: (gs) => { temiz(gs); gunlukSifirla(gs); askerler(gs, 1); gs.setDungeonProgress(1); },
    calistir: (gs) => gs.fightDungeon(3, [0]),
    beklenen: [
      { ad: 'Savaş reddedildi', tamam: (o, s, r) => r.success === false },
      { ad: 'Mesaj seviye kilidini söylüyor', tamam: (o, s, r) => /Seviye/.test(r.message) },
      { ad: 'Giriş sayılmadı', tamam: (o, s) => s.zindanGiris === o.zindanGiris },
      { ad: 'Stamina harcanmadı', tamam: (o, s) => s.stamina === o.stamina }
    ]
  },
  {
    id: 'zindan-asker-secilmedi', kategori: 'zindan', ad: 'Asker seçmeden savaşa girilmez',
    ne: 'Boş asker listesiyle zindan savaşı reddedilmeli.',
    kur: (gs) => { temiz(gs); gunlukSifirla(gs); askerler(gs, 1); gs.setDungeonProgress(1); },
    calistir: (gs) => gs.fightDungeon(1, []),
    beklenen: [
      { ad: 'Savaş reddedildi', tamam: (o, s, r) => r.success === false },
      { ad: 'Giriş sayılmadı', tamam: (o, s) => s.zindanGiris === o.zindanGiris }
    ]
  },
  {
    id: 'zindan-stamina-yok', kategori: 'zindan', ad: 'Stamina yoksa zindana girilmez',
    ne: 'Stamina sıfırken savaş reddedilmeli ve ödüllü giriş hakkı yanmamalı.',
    kur: (gs) => { temiz(gs); gunlukSifirla(gs); askerler(gs, 1); gs.setDungeonProgress(1); gs.state.stamina = 0; },
    calistir: (gs) => gs.fightDungeon(1, [0]),
    beklenen: [
      { ad: 'Savaş reddedildi', tamam: (o, s, r) => r.success === false },
      { ad: 'Mesaj stamina yetersizliğini söylüyor', tamam: (o, s, r) => /stamina/i.test(r.message) },
      { ad: 'Giriş hakkı yanmadı', tamam: (o, s) => s.zindanGiris === o.zindanGiris }
    ]
  },
  {
    id: 'zindan-ilk-giris', kategori: 'zindan', ad: 'Günün ilk girişi ödüllüdür ve silahı aşındırmaz',
    ne: 'Taze günde ilk zindan girişi ödüllü sayılır, silah aşınmaz, staminanın bedeli ödenir; sıradaki girişte silah aşınır.',
    kur: (gs) => { temiz(gs); gunlukSifirla(gs); askerler(gs, 1); gs.setDungeonProgress(1); },
    calistir: (gs) => { const once = gs.getDungeonDayStatus(); const maliyet = gs.getDungeonStaminaCost(1, 1); const r = gs.fightDungeon(1, [0]); return { once, maliyet, r, sonra: gs.getDungeonDayStatus() }; },
    beklenen: [
      { ad: 'Savaş yapıldı', tamam: (o, s, r) => r.r.success === true },
      { ad: 'İlk giriş: silah aşınmaz', tamam: (o, s, r) => r.once.nextIsFirstEntry === true && r.once.nextWeaponWear === false && r.r.entry.weaponWear === false },
      { ad: 'Ödüllü giriş sayıldı (günlük hak 1 azaldı)', tamam: (o, s, r) => r.r.entry.rewarded === true && r.sonra.freeLeft === r.once.freeLeft - 1 },
      { ad: 'Stamina bedeli kadar harcandı', tamam: (o, s, r) => o.stamina - s.stamina >= r.maliyet },
      { ad: 'Sıradaki giriş artık silahı aşındırır', tamam: (o, s, r) => r.sonra.nextWeaponWear === true }
    ]
  },
  {
    id: 'zindan-harc-ve-antrenman', kategori: 'zindan', ad: 'Günlük ödüllü haklar bitince kapı harcı istenir',
    ne: 'Ödüllü haklar dolunca kapı harcı (ödülün %20\'si) istenir; harç ödenmezse giriş yapılamaz (antrenman girişi yoktur, ASTRA harcanmaz); ödenirse giriş ödüllüdür ve harç zindan kasasına gider.',
    kur: (gs) => { temiz(gs); gunlukSifirla(gs); askerler(gs, 1); gs.setDungeonProgress(1); gs.setDevAdAstra(1000); const c = gs.getDailyCounters(); c.dungeonRuns = GAME_CONFIG.DUNGEON.DAILY_RUNS; c.dungeonEntries = GAME_CONFIG.DUNGEON.DAILY_RUNS; },
    calistir: (gs) => {
      const terimler = gs.getDungeonEntryTerms(1);
      const beklenenHarc = Math.max(0.01, Math.round(gs.getDungeonBaseReward(1).ada * GAME_CONFIG.DUNGEON.GATE_FEE_RATE * 1000) / 1000);
      const once = ozet(gs);
      const antrenman = gs.fightDungeon(1, [0], { payGateFee: false });
      const arada = ozet(gs);
      gs.refillDevStamina();
      const odemeli = gs.fightDungeon(1, [0], { payGateFee: true });
      return { terimler, beklenenHarc, once, antrenman, arada, odemeli };
    },
    beklenen: [
      { ad: 'Ödüllü haklar bitti: harç isteniyor', tamam: (o, s, r) => r.terimler.nextNeedsFee === true },
      { ad: 'Harç = ödülün %20\'si (en az 0,01)', tamam: (o, s, r) => Math.abs(r.terimler.fee - r.beklenenHarc) < 1e-9 && r.terimler.fee > 0 },
      { ad: 'Harçsız giriş reddedildi (antrenman girişi yok)', tamam: (o, s, r) => r.antrenman.success === false },
      { ad: 'Reddedilen giriş ASTRA harcamadı', tamam: (o, s, r) => r.arada.astra === r.once.astra },
      { ad: 'Harçlı giriş ödüllü', tamam: (o, s, r) => r.odemeli.success === true && r.odemeli.entry.rewarded === true },
      { ad: 'Harç tam tutarıyla ASTRA\'dan düştü', tamam: (o, s, r) => Math.abs((r.arada.astra - s.astra) - r.beklenenHarc) < 1e-6 },
      { ad: 'Harcın doğrudan payı (DUNGEON_GATE_POOL_SHARE) zindan kasasına gitti, kalanı ortak dağılıma', tamam: (o, s, r) => s.zindanKasasi - r.arada.zindanKasasi >= r.beklenenHarc * (GAME_CONFIG.DUNGEON_GATE_POOL_SHARE ?? 1) - 1e-6 }
    ]
  },
  {
    id: 'zindan-odul-tablosu', kategori: 'zindan', ad: 'Ödül kata göre artar, büyük boss katları çarpanlıdır',
    ne: 'Ödül kat sayısıyla doğru orantılı; 9. ve 18. kat (büyük boss) ek çarpanla ödüllendirilir.',
    kur: (gs) => { temiz(gs); },
    calistir: (gs) => ({ r1: gs.getDungeonBaseReward(1).ada, r2: gs.getDungeonBaseReward(2).ada, r8: gs.getDungeonBaseReward(8).ada, r9: gs.getDungeonBaseReward(9).ada, r18: gs.getDungeonBaseReward(18).ada }),
    beklenen: [
      { ad: '2. kat ödülü 1. katın iki katı', tamam: (o, s, r) => Math.abs(r.r2 - 2 * r.r1) < 1e-9 },
      { ad: '9. kat (büyük boss) normal orantının çarpan katı', tamam: (o, s, r) => Math.abs(r.r9 - 9 * r.r1 * GAME_CONFIG.DUNGEON.MAJOR_BOSS_REWARD_MULT) < 1e-6 },
      { ad: '18. kat da büyük boss çarpanını alır', tamam: (o, s, r) => Math.abs(r.r18 - 18 * r.r1 * GAME_CONFIG.DUNGEON.MAJOR_BOSS_REWARD_MULT) < 1e-6 },
      { ad: 'Normal katlarda çarpan yok (8. kat = 8 × 1. kat)', tamam: (o, s, r) => Math.abs(r.r8 - 8 * r.r1) < 1e-9 }
    ]
  },
  // ------------------------------------------------------------------ KOLEZYUM (maçın sonucu şansa bağlı; giriş bedeli ve sınırlar sınanır)
  {
    id: 'kolezyum-astra-yok', kategori: 'kolezyum', ad: 'Giriş ücreti için ASTRA yoksa maça çıkılmaz',
    ne: 'ASTRA yokken maç reddedilmeli; stamina ve günlük hak harcanmamalı.',
    kur: (gs) => { temiz(gs); gunlukSifirla(gs); askerler(gs, 1); gs.state.adAstraBalance = 0; },
    calistir: (gs) => gs.executeColosseum1v1Match(0),
    beklenen: [
      { ad: 'Maç reddedildi', tamam: (o, s, r) => r.success === false },
      { ad: 'Mesaj giriş ücreti istiyor', tamam: (o, s, r) => /giriş ücreti/i.test(r.message) },
      { ad: 'Stamina ve günlük hak harcanmadı', tamam: (o, s) => s.stamina === o.stamina && s.arenaMac === o.arenaMac }
    ]
  },
  {
    id: 'kolezyum-yarali', kategori: 'kolezyum', ad: 'Ağır yaralı asker arenaya çıkamaz',
    ne: 'Canı çok düşük askerle maç reddedilmeli; ASTRA harcanmamalı.',
    kur: (gs) => { temiz(gs); gunlukSifirla(gs); askerler(gs, 1); gs.state.soldierUnits[0].hp = 5; },
    calistir: (gs) => gs.executeColosseum1v1Match(0),
    beklenen: [
      { ad: 'Maç reddedildi', tamam: (o, s, r) => r.success === false },
      { ad: 'Mesaj yaralı olduğunu söylüyor', tamam: (o, s, r) => /yaralı/i.test(r.message) },
      { ad: 'ASTRA harcanmadı', tamam: (o, s) => s.astra === o.astra }
    ]
  },
  {
    id: 'kolezyum-gunluk-sinir', kategori: 'kolezyum', ad: 'Günlük maç hakkı dolunca maç yapılmaz',
    ne: 'Günlük sınır dolunca maç reddedilmeli.',
    kur: (gs) => { temiz(gs); gunlukSifirla(gs); askerler(gs, 1); gs.getDailyCounters().arenaMatches = GAME_CONFIG.COLOSSEUM.DAILY_MATCH_CAP; },
    calistir: (gs) => ({ sonuc: gs.executeColosseum1v1Match(0), durum: gs.getColosseumEntryStatus() }),
    beklenen: [
      { ad: 'Maç reddedildi', tamam: (o, s, r) => r.sonuc.success === false },
      { ad: 'Mesaj günlük hakkın dolduğunu söylüyor', tamam: (o, s, r) => /Günlük/i.test(r.sonuc.message) },
      { ad: 'Giriş durumu da engel nedenini gösteriyor', tamam: (o, s, r) => /Günlük/i.test(r.durum.blockReason) },
      { ad: 'ASTRA harcanmadı', tamam: (o, s) => s.astra === o.astra }
    ]
  },
  {
    id: 'kolezyum-mac-bedeli', kategori: 'kolezyum', ad: 'Maç ASTRA ücreti, stamina ve günlük hak harcar',
    ne: 'Koşullar tamamsa maç yapılır; sonucu şansa bağlı olsa da bedeli kesindir: giriş ücreti (ASTRA), 12 stamina, 1 günlük hak. Zaferde ödül ASTRA eklenir.',
    kur: (gs) => { temiz(gs); gunlukSifirla(gs); askerler(gs, 1); },
    calistir: (gs) => ({ once: gs.getColosseumEntryStatus(), ucret: gs.getColosseumEntryFee(), sonuc: gs.executeColosseum1v1Match(0) }),
    beklenen: [
      { ad: 'Koşullar tamamken giriş engeli yok', tamam: (o, s, r) => r.once.blockReason === '' },
      { ad: 'Maç yapıldı', tamam: (o, s, r) => r.sonuc.success === true },
      { ad: 'Giriş ücreti kadar ASTRA düştü (zaferde ödül eklenir)', tamam: (o, s, r) => Math.abs((o.astra - s.astra) - (r.ucret - (r.sonuc.rewardAda || 0))) < 1e-6 },
      { ad: 'Stamina bedeli kadar düştü', tamam: (o, s) => o.stamina - s.stamina >= GAME_CONFIG.COLOSSEUM.ENTRY_STAMINA_COST },
      { ad: 'Günlük hak 1 arttı', tamam: (o, s) => s.arenaMac === o.arenaMac + 1 }
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
