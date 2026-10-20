// Realm of AdAstra - Karakter Seviyesi, Kışla Ordusu, Taverna Güçlendirmeleri & AMM Konfigürasyonu

// Hedef rezerv yardımcısı (E-planı S5, 8 Ekim 2026): bir kasa haftada r oranında (bakiyesinin r'si) ödeme yaparsa,
// 52 hafta boyunca ödenen toplam pay = tohum × (1 − (1−r)^52). docs/v2/KARARLAR_KESIN.md "hedef rezerv = 12 aylık
// ödeme" kararını bu şekilde sayıya bağlar. Eskiden hedef = tohumun KENDİSİYDİ; bu, taze bir kasada sağlık (bakiye/
// hedef) tam 1,0 oluyordu ve İLK harcamadan sonra bile hemen 1'in altına düşüp ödülleri küçültmeye başlıyordu
// (treasury.js withdraw: health<1 → granted *= health). Şimdi hedef tohumdan küçük: taze kasada sağlık > 1 (gerçek
// başlangıç payı), küçülme yalnız kasa GERÇEKTEN bu yıllık payın altına inince başlar.
const annualPayout = (seed, weeklyRate) => Math.round(seed * (1 - Math.pow(1 - weeklyRate, 52)));

// Hammadde TALEBİ ve ARZI (19 Ekim 2026, kullanıcı kararı): oyunun temel mantığı "oyunun istediği hammadde çok fazla, oyuncunun çıkarabildiği çok az".
//  • TALEP (HAMMADDE_ADEDI_CARPANI = 50): geliştirme bedelleri (seviye atlama, silo, ev, teçhizat yükseltme, Konsey, roket, zindan modu, Genesis) ve en üst
//    silo kapasiteleri eski değerlerin 50 katıdır. Pazar fiyatları (ASTRA/birim) ve havuzlar AYNI kalır; bu yüzden ASTRA atıp hesabını hemen fullemek isteyen
//    balinalar hammaddeyi pazardan toplu alınca fiyat gerçekten tırmanır (bir hesabı tam geliştirmek ~6 dolar; iki balina fiyatı tavana taşır, üçüncüsü hammadde bulamaz).
//  • ARZ (URETIM_CARPANI = 5): oyuncunun çıkarabildiği hammadde (saatlik üretim, haftalık Üretim Hakkı) ve onunla orantılı tekrar eden giderler (stamina için buğday,
//    onarım, köylü yemi, ot ile iyileştirme, bot önkoşulu, başlangıç envanteri, 1. silo) eski değerin 5 katıdır. Haftalık hak seviyeye, katkı kademesine (ekosisteme
//    harcanan ASTRA), aktifliğe ve Konsey Otoritesi'ne bağlıdır (globalPool.weeklyRightPerWeight). Ücretsiz oyuncu pazarda sattığı hammaddenin ASTRA değeriyle gelir elde
//    eder, balinalar fiyatı tırmandırdıkça bu gelir artar; haftalık sınır yüzünden bu para uzun sürede erir.
//  • TALEP_ORANI = TALEP / ARZ = 10: geliştirme bedelleri düşük seviyelerde ARZ ölçeğinde başlar (yeni oyuncu takılmasın), seviyeyle birlikte TALEP ölçeğine tırmanır
//    (hesap seviyesi 4→20, ev sayısı 2→12, teçhizat seviyesi 1→10; gameState/ortak.js talepCarpani).
// Gelişim bedellerinin ASTRA payı ve katkı puanı hammadde değerinin ARZ çarpanına bölünmüşünden hesaplanır (ammMarket.calculateResourcesCostAdAstra).
export const HAMMADDE_ADEDI_CARPANI = 50;
export const URETIM_CARPANI = 5;
const q = (n) => Math.round(n * HAMMADDE_ADEDI_CARPANI * 1e6) / 1e6;   // talep ölçeği
const qU = (n) => Math.round(n * URETIM_CARPANI * 1e6) / 1e6;          // arz ölçeği

export const GAME_CONFIG = {
  GAME_VERSION: '2.0.0-dev',
  HAMMADDE: { TALEP: HAMMADDE_ADEDI_CARPANI, ARZ: URETIM_CARPANI, ORAN: HAMMADDE_ADEDI_CARPANI / URETIM_CARPANI, SEVIYE_RAMPA_BASLA: 4, SEVIYE_RAMPA_BITIS: 20, EV_RAMPA_SAYISI: 10 },

  // ═══════════════════════════════════════════════════════════════════════
  // v2 (7 Ekim 2026) — docs/v2/KARARLAR_KESIN.md: 6 hammadde, ASTRA fiyat ölçeği, Üretim Hakkı, kasalar, kapı
  // ═══════════════════════════════════════════════════════════════════════
  // ASTRA bedelleri bu dosyada ölçekli yazılır: eski listenin %1'i, üretim hızları ×0,3 (R4: 200 M'lik ekonomi için
  // eski liste 300 kat büyüktü; bkz. docs/v2/R4_DENGE.md).
  // Altı hammadde (R2). Sıra ekran sırasıdır. zone: haritadaki yer (R1).
  RESOURCE_KEYS: ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb'],
  RESOURCE_META: {
    wheat: { name: 'Buğday',    icon: '🌾', color: '#facc15', tool: 'sickle',    zone: 'farm',       cls: 'A' },
    stone: { name: 'Taş',       icon: '🪨', color: '#a8a29e', tool: 'chisel',    zone: 'quarry',     cls: 'A' },
    wood:  { name: 'Odun',      icon: '🌲', color: '#4ade80', tool: 'axe',       zone: 'forest',     cls: 'B' },
    coal:  { name: 'Kömür',     icon: '⚫', color: '#64748b', tool: 'coalpick',  zone: 'coalmine',   cls: 'B' },
    iron:  { name: 'Demir',     icon: '⛏️', color: '#38bdf8', tool: 'pickaxe',   zone: 'mine',       cls: 'B' },
    herb:  { name: 'Şifalı Ot', icon: '🌿', color: '#86efac', tool: 'herbknife', zone: 'herbgarden', cls: 'C' }
  },
  // Alet onarımının ASTRA payı: istenen odun+demirin pazar değerinin bu oranı (R3 kararı: %100 → %30)
  TOOL_REPAIR_ADA_SHARE: 0.30,
  // Üretim Hakkı (R4): kişi başı haftalık kota = tek alanın kesintisiz haftalık üretiminin bu katı (termostat başlangıcı),
  // sınırlar, haftalık adım, ağırlık çarpanları ve adalet tavanı. Sunucu dünyası hesaplar; tarayıcı tek oyuncu sayar.
  URETIM_HAKKI: {
    QPP_START: 0.40, QPP_MIN: 0.08, QPP_MAX: 1.2, TERMO_STEP: 0.10, TERMO_TARGET: 1.0, ADMIN_MULT: 1,
    // 19 Ekim 2026 EKONOMİ PLANI (kullanıcı kararı): kişisel haftalık limit + global haftalık havuz.
    //  • KISISEL_QPP: kişisel limit birimi (sabit): L = hız x çalışma dakikası x KISISEL_QPP x Otorite x ağırlık (ağırlık: seviye x ev x katkı kademesi x aktiflik).
    //  • Global havuz G = hız x dakika x qpp(kaynak) x Otorite x REFERANS_AGIRLIK; qpp artık HAVUZ çarpanıdır (fiyat ve bot ASTRA girişiyle haftalık ayarlanır,
    //    QPP_MIN-QPP_MAX = başlangıcın 0,2-3 katı). Havuz oyuncu sayısından bağımsızdır: oyuncu çoğalınca kişi başı pay küçülür, fiyat yükselir, havuz büyür.
    //  • Havuzun TABAN_PAYI'ı herkese eşit azami pay olarak bölünür; kalan, tabanın üstünde limiti olanlara (limit - taban) x katkı kademesi çarpanıyla orantılı gider.
    //  • Ev etkisi: her ev ağırlığı EV_KATSAYISI artırır (en çok EV_KATSAYI_MAX).
    //  • Fiyat bandı AYAR.BAND_ALT-BAND_UST (açılışa oranla): altında arz kısılır, üstünde açılır (haftada en çok KISMA/ARTIS); ACIL_ESIK katını 24 saat aşarsa ek ACIL_ARTIS.
    //  • Bot (trade) ASTRA girişi normalin üstündeyse havuz BOT_DUYARLILIK kadar önceden büyür (BOT_ENAZ-BOT_ENCOK).
    KISISEL_QPP: 0.40, REFERANS_AGIRLIK: 120, TABAN_PAYI: 0.60, EV_KATSAYISI: 0.03, EV_KATSAYI_MAX: 1.3, ACIL_ESIK: 3, ACIL_ARTIS: 1.25,
    AYAR: { BAND_ALT: 0.8, BAND_UST: 1.5, HAFTALIK_KISMA: 0.75, HAFTALIK_ARTIS: 1.25, BOT_DUYARLILIK: 0.25, BOT_ENAZ: 0.85, BOT_ENCOK: 1.3 },
    LEVEL_WEIGHT_PER_LEVEL: 0.025, LEVEL_WEIGHT_MAX: 2.0, ACTIVITY_MIN: 0.25, FAIRNESS_CAP: 3,
    // Katkı kademeleri: haftalık katkı puanı eşiği (fiyat çarpanıyla ölçekli) → Üretim Hakkı çarpanı
    TIERS: [
      { id: 'none',     name: 'Yok',    min: 0,    mult: 1.00 },
      { id: 'bronze',   name: 'Bronz',  min: 50,   mult: 1.05 },
      { id: 'silver',   name: 'Gümüş',  min: 200,  mult: 1.10 },
      { id: 'gold',     name: 'Altın',  min: 500,  mult: 1.20 },
      { id: 'platinum', name: 'Platin', min: 1500, mult: 1.35 },
      { id: 'diamond',  name: 'Elmas',  min: 5000, mult: 1.50 }
    ]
  },
  // Madencilik Otoritesi (Sirius Konseyi'nde ortak inşaat; R2/R4): seviye başına kapasite ve herkesin hakkı +%5,
  // çalışma günü 20→24 saat, hafta 6→7 gün; 1. seviye 8 M birim (×1,4; 19 Ekim 2026'dan önce 2 M). Karışım ALTI hammaddenin hepsini içerir (13 Ekim 2026
  // hammadde kullanım planı): taş %30, kömür %20 (eski "çelik payı" artık kömürle ödenir: çelik demirden ve kömürden olur),
  // demir %15, odun %15, buğday %15 (işçi iaşesi), şifalı ot %5. Toplam %100 hammadde; ASTRA ile ödenen pay yoktur.
  // Ortak kasa: çıkarılan her hammaddenin %5'i Konsey stoğuna girer ve Otorite ile etkin projeye KENDİLİĞİNDEN aktarılır.
  OTORITE: {
    MAX_LEVEL: 20, BASE_UNITS: q(8000000), LEVEL_MULT: 1.4, PER_LEVEL_BONUS: 0.05,
    HOURS_BASE: 20, HOURS_PER_LEVEL: 0.2, DAYS_BASE: 6, DAYS_PER_LEVEL: 0.05,
    MIX: { stone: 0.30, coal: 0.20, iron: 0.15, wood: 0.15, wheat: 0.15, herb: 0.05 },
    COMMON_CHEST_RATE: 0.05
  },
  // Konsey projeleri (sırayla, biri açık): 24 M birim hammadde (19 Ekim 2026: ×4, eskiden 6 M; Otorite 1. seviye de 2 M → 8 M) + 50.000 emek; bitince kalıcı bonus. Her projenin kendi
  // karışımı vardır (konusuna göre; toplam %100): Şifa Bahçesi şifalı otu, Büyük Ambar buğdayı, Köprü ve Duvar taşı çok ister.
  KONSEY_PROJELERI: [
    { id: 'bridge',   name: 'Nehir Köprüsü',   icon: '🌉', units: q(24000000), labor: 50000, bonus: { expeditionTime: -0.02 }, desc: 'Sefer süreleri %2 kısalır.',
      mix: { stone: 0.35, wood: 0.30, iron: 0.15, wheat: 0.15, coal: 0.05 } },
    { id: 'granary',  name: 'Büyük Ambar',     icon: '🏚️', units: q(24000000), labor: 50000, bonus: { warehouse: 0.05 },     desc: 'Herkesin silosu %5 büyür.',
      mix: { wheat: 0.30, wood: 0.30, stone: 0.25, iron: 0.15 } },
    { id: 'herbgdn',  name: 'Şifa Bahçesi',    icon: '🌿', units: q(24000000), labor: 50000, bonus: { herb: 0.05 },          desc: 'Şifalı ot üretimi %5 artar.',
      mix: { wheat: 0.30, stone: 0.22, wood: 0.21, coal: 0.15, herb: 0.12 } },
    { id: 'pier',     name: 'Liman Rıhtımı',   icon: '⚓', units: q(24000000), labor: 50000, bonus: { prepDepotCap: 2 },     desc: 'Hazırlık Deposu kişi tavanı 2 katına çıkar.',
      mix: { iron: 0.25, coal: 0.25, wood: 0.25, stone: 0.25 } },
    { id: 'wall',     name: 'Savunma Duvarı',  icon: '🧱', units: q(24000000), labor: 50000, bonus: { bossPenaltyPoints: -0.06 }, desc: "Dünya Bossu savaşından erken çekilme cezası %18 yerine %12 olur.",
      mix: { stone: 0.45, iron: 0.25, coal: 0.20, wood: 0.10 } }
  ],
  // Köy Evleri (R5): köylüler doğar; emek puanı, üretim bonusu, asker kaynağı; kolonist adayı
  KOY: {
    HOUSE_BASE_COST: { wood: qU(400), stone: qU(200), iron: qU(50) }, HOUSE_COST_MULT: 1.5, MAX_HOUSES: 20,
    VILLAGERS_PER_HOUSE: 10, GROWTH_PER_DAY: 0.02, WHEAT_PER_VILLAGER_DAY: qU(10), STARVE_DAYS: 3, STARVE_LOSS_PER_DAY: 0.05,
    LABOR_PER_VILLAGER_DAY: 1, PROD_BONUS_PER_10: 0.01, PROD_BONUS_MAX: 0.20, VILLAGER_PER_SOLDIER: 1,
    START_HOUSES: 1, START_VILLAGERS: 10
  },
  // Şifahane: HEMEN iyileştirmenin TEK yolu şifalı ottur (buğdayla anında iyileştirme 18 Ekim 2026'da kalktı; buğdayın başka çok
  // kullanımı var, şifalı otun tekrarlanan tek harcaması burasıdır). 1 ot HP_PER_HERB can iyileştirir ve yakılır; ASTRA payı
  // can başına ADA_PER_HP (× oyun içi fiyat çarpanı), harcama gibi dağıtılır. 5'ten 2'ye inmesi aynı can için 2,5 kat ot yakar:
  // scripts/model/hammadde_kullanim.mjs'te şifalı ot talebi / tam üretim Sv.5'te 0,58 → 0,64, Sv.10'da 0,48 → 0,54 (hedef bant
  // 0,45–0,95). Kendiliğinden (24 saat) iyileşme de şifalı otladır ama beş kat ucuzdur (SOLDIER_PASSIVE_HEAL).
  // PARSOMEN_CAN: Ordu İyileştirme Parşömeninin ekrandaki (savaş ölçeği) can iyileştirmesi = 2 şifalı otun karşılığı, ASTRA harcamadan.
  // Pazar fiyatı (0,30) bu iyileştirmeyi ota göre pahalı yapar; amaç hemen iyileştirmenin ana yolunun şifalı ot (yakım) kalması.
  SIFAHANE: { HP_PER_HERB: 2 / URETIM_CARPANI,   // 19 Ekim 2026: ot da x5 üretilir; 1 can için 5 kat ot ister (1 ot = 0,4 can)
    ADA_PER_HP: 0.01, PARSOMEN_CAN: 4 },
  // Demirhane geri dönüşümü (R4b): alet/teçhizat → hammaddelerin %70'i geri, ASTRA geri gelmez
  RECYCLE_RETURN_RATE: 0.70,
  // Uzay Limanı hazırlık modu (R6): roket görevi, Hazırlık Deposu, hazırlık ilerlemesi
  UZAY_LIMANI: {
    // ROKET PLANI (19 Ekim 2026, kullanıcı kararı): roket ROA'dan UOA'ya geçiş RAMPASIDIR; roketini yapmayan UOA'ya geçemez. Roket "inanılmaz maliyetli" olmalı:
    // 1 yıl aktif oynayan ancak biriktirebilir (bir hesabın yıllık çıkarma hakkı ~ demir 2,7 M, taş 4,5 M, odun 4 M, kömür 3,4 M; seviye atlamalar da bunu yer).
    // Bedel silo kapasitesini çok aştığı için KADEMELİ katkıyla yatırılır (Konsey gibi). Hesap seviyesi en az 10 (1 yıllık F2P ~Sv.12-15).
    ROCKET_MIN_LEVEL: 10,
    ROCKET_PARTS: { iron: 1200000, coal: 1500000, stone: 2000000, wood: 1800000, adAstra: 250000 },   // ~yıllık çıkarma limitinin %35-40'ı (seviye atlamalar da çıkarmayı yer)
    // Roket seviyeleri (19 Ekim 2026): roket Realm'dan UOA'ya (ikinci oyun) geçiş rampasıdır. Seviye 1 = ilk roket (ROCKET_PARTS). Sonraki her seviye
    // ROCKET_PARTS'ın parts katı hammadde + adAstra ASTRA ister (çok pahalı; hammaddeyi silo tutabildiği ölçüde pazardan alınır). Seviye yükseldikçe gidiş süresi
    // kısalır (travelHours), taşıma kapasitesi (cargo: toplam hammadde birimi) ve mürettebat (crew: köylü + asker toplamı) artar. Gidiş-dönüş mümkündür; fırlatma
    // UOA açılana kadar kilitlidir (UNIVERSE_STAGE). UOA tohumu (harcamanın %4'ü) UOA açıldığında oradaki ilk kasaları ve hammadde pazarını doldurur.
    // Her seviye parts x ROCKET_PARTS hammadde + o seviyenin ASTRA bedeli (250 B → 50 M ASTRA, 0,04 → 8,3 dolar) ister; hammadde bedeli seviye 5'te 40 katıdır (pazarın tavana kadar
    // verebildiği demirin %20'si): üst seviyeler uzun vadeli hedeftir. cargo = Hazırlık Deposu'na konabilecek toplam hammadde adedi; crew = köylü + asker.
    ROCKET_LEVELS: [
      { level: 1, parts: 1,    adAstra: 250000,    travelHours: 72, cargo: 500000,    crew: 10 },
      { level: 2, parts: 2.5,  adAstra: 1000000,   travelHours: 48, cargo: 2000000,   crew: 30 },
      { level: 3, parts: 6,    adAstra: 4000000,   travelHours: 36, cargo: 8000000,   crew: 80 },
      { level: 4, parts: 15,   adAstra: 15000000,  travelHours: 24, cargo: 30000000,  crew: 200 },
      { level: 5, parts: 40,   adAstra: 50000000,  travelHours: 12, cargo: 100000000, crew: 500 }
    ],
    PREP_DEPOT_WEEKS_CAP: 4, PREP_DEPOT_TOTAL_ASTRA: 10000000, PREP_DEPOT_CANCEL_FEE: 0.10,
    PROGRESS_WEIGHTS: { rocket: 0.2, depot: 0.2, villagers: 0.2, soldiers: 0.2, genesis: 0.2 }, PROGRESS_VILLAGERS_REF: 100, PROGRESS_SOLDIERS_REF: 10
  },
  // Kapı kuralı (E-planı Faz 1, 8 Ekim 2026 — "ilk döngü" 100 vatandaş kararı): vatandaş sınırı, kademeli dolar
  // eşikleri, bekleme sırası, hazır aday, davet. Eski last_seen tabanlı "14 gün uyarı / 30 gün askı" kuralı
  // (ACTIVE_DAYS_PER_WEEK, INACTIVE_WARN_DAYS, INACTIVE_SUSPEND_DAYS) kullanıcı tarafından yetersiz bulundu
  // ("1 hafta girmeyip 1 gün sefer yapınca hafif kalıyor") ve KATILIM_PUANI (aşağıda) ile değiştirildi.
  KAPI: {
    START_LIMIT: 100, GROWTH_STEP: 0.10, USD_TIERS: [50, 100, 300], AVG_MONTHS: 3,
    // Büyüme Faz 2'ye kadar kilitli: gerçek "dağıtılan ≥ 50$ VE çekilebilen ≥ 15$" göstergesi kurulana dek
    // otomatik büyüme açılmaz (yalnız yönetici elle sınır değiştirebilir). growth() bu bayrağa bakar.
    GROWTH_LOCKED: true,
    REGISTRATION_FEE_ADA: 1,
    IP_DAILY_ADMIT: 3,   // aynı internet adresinden 24 saatte en çok bu kadar yeni vatandaş (fazlası bekleme sırasına düşer); 0 = sınırsız. server/kapi.js
    READY_TASK_IDS: ['rehber', 'kurallar', 'hazirim'],   // sırada bekleyen adayın onaylayacağı 3 basit adım (misafir modu, oyun aksiyonu değil)
    INVITE_HOURS: 72, INVITE_PENALTY_POSITIONS: 3   // yer açılınca davet süresi; cevapsızlıkta kaç sıra geri
  },
  // Katılım puanı (E-planı Faz 1, 8 Ekim — kullanıcı tasarımı): "aktif vatandaş" artık tek bir eşik değil, oyunun
  // KATEGORILER listesindeki her bir alana o hafta dokunulup dokunulmadığına bakan bir puan. Aynı kategoriyi
  // tekrarlamak ek puan getirmez (çeşitlilik önemli, bir eylemi botlamak işe yaramaz). Eşik seviyeyle büyür:
  // eşik = min(ESIK_TAVAN, ESIK_TABAN + taban(seviye / ESIK_SEVIYE_ARALIGI)). Kategori → işlem eşlemesi
  // server/aktiflik.js'te (ACTIONS beyaz listesine bağlı, tek kaynak). Sayılar ilk öneridir; oynanışla ayarlanır.
  KATILIM_PUANI: {
    KATEGORILER: ['sefer', 'bakim', 'kisla', 'zindan', 'kolezyum', 'boss', 'pazar', 'konsey', 'karnaval', 'rehber'],
    ESIK_TABAN: 2, ESIK_TAVAN: 6, ESIK_SEVIYE_ARALIGI: 10,
    UYARI_HAFTA: 2,            // eşiğin altında bu kadar hafta birikince (üst üste olması şart değil) → ilk uyarı
    IZIN_SORUSU_HAFTA: 3,      // bu kadar hafta birikince → "izin ister misin?" sorusu
    IZIN_CEVAP_SAAT: 72,       // izin sorusuna cevap süresi
    IZIN_YILLIK_GUN: 30,       // yıllık toplam izin hakkı (gün, bölünebilir)
    SON_UYARI_SAAT: 72         // izin hakkı tükendikten sonraki son uyarı süresi
  },
  // İlan pazarı (teçhizat; server/pazar.js): komisyon %2 (yarısı yakım, yarısı kasalar), 7 gün, en çok 10 açık ilan,
  // alıcı önce serbest ASTRA'sından öder (yetmezse kalanı kilitliden), satıcıya gelen paranın en az %80'i kilitli gelir
  ILAN_PAZARI: { FEE: 0.02, FEE_BURN_SHARE: 0.5, DAYS: 7, MAX_LISTINGS: 10, SELLER_LOCKED_SHARE: 0.8, MIN_PRICE: 0.01, MAX_PRICE: 1e9 },
  // Universe'e geçiş aşamaları (R3): 0 Realm, 1 Hazırlık, 2 Ön sipariş, 3 Universe (yalnız yönetici)
  UNIVERSE_STAGE: 0,

  // Stamina — v2.5: Seferler ve Zindan savaşları için genişletilmiş stamina havuzu.
  // Her seviye atlandığında Max Stamina +50 artar (Lv 1: 100, Lv 2: 150, Lv 3: 200, Lv 10: 550, Lv 81: 4.100).
  // Böylece 3 paralel sefer gönderilse dahi geriye zindan katları ve boss savaşları için bol miktarda stamina kalır.
  MAX_STAMINA: 100,
  STAMINA_MAX_PER_LEVEL: 50,          // max = en büyüğü(100 + 50·(L-1), 3,5 × sefer bedeli)
  // Kullanıcı kararı (5 Ekim 2026): seferin stamina bedeli sefer SÜRESİYLE ve üretimle orantılı. Her seviye, 1.000 hammadde
  // başına yakılan buğdayı yalnız STAMINA_EFFICIENCY_PER_LEVEL (%1) azaltır (eskiden 2. seviyede %65, 81'de %94 düşüyordu;
  // orta-üst seviyede stamina için buğday neredeyse hiç yakılmıyordu → buğday enflasyonu).
  // bedel(L) = 20 × (süre(L) / süre(1)) × üretim çarpanı(L) × (1 − 0,01)^(L−1)
  STAMINA_COST_PER_EXPEDITION: 12,    // 1. seviye (18 dk) sefer bedeli (v2: 6 alan aynı anda; 6×12 = 72 ≤ 100 başlangıç staminası)
  STAMINA_EFFICIENCY_PER_LEVEL: 0.01,
  STAMINA_MAX_HEADROOM: 6.5,          // en yüksek stamina ≥ 6,5 sefer bedeli (v2: 6 alanı aynı anda başlatabilmek için)
  STAMINA_NATURAL_REGEN_INTERVAL: 150,
  // Stamina artık AdAstra ile doldurulamaz, yalnızca buğday ile doldurulabilir:
  WHEAT_PER_STAMINA: qU(1),             // 1 Stamina = 1 Buğday (v2: üretim ×0,3 ölçeğinde 6 seferin staminası buğday üretiminin ~%40 kadarı)

  // Ekonomi kararı (30 Eylül 2026, token modeli: scripts/model/arsiv/token_economy_model.mjs — arşiv, S11):
  // %5 Yakım, %3 Yapımcı/Geliştirici Telifi, %6 Evrensel Temel Gelir (UBI) Seviye Havuzu, %86 Hazine.
  // Yakım %13'ten %5'e indi: yatırımcının harcaması daha az erir; yakımın ağırlığı ileride
  // çekim ücretine ve fiyat savunmasına kayar (sunucu aşaması).
  TOKEN_BURN_RATE: 0.05,
  CREATOR_ROYALTY_RATE: 0.03,
  CREATOR_WALLET_ADDRESS: '0x58DBCF66bdd7BfA9da98aDba1965b3794321087C',
  UBI_POOL_RATE: 0.06,
  TOKEN_REWARD_POOL_RATE: 0.86,

  // 🔒 KİLİTLİ BAKİYE — kazanılan ASTRA'nın çoğu kilitli başlar; oyunda harcanabilir ama çekilemez.
  // Harcadıkça, oynadıkça ve zamanla açılır. Çekim (sunucu aşaması) yalnız serbest kısımdan yapılır.
  LOCKED_BALANCE: {
    FREE_SHARE: 0.20,               // kazancın serbest kısmı (kalanı kilitli)
    UNLOCK_ON_SPEND: 0.20,          // harcamada önce kilitli kısım kullanılır, üstüne harcananın %20'si kadar kilit açılır
    WEEKLY_UNLOCK_BASE: 0.01,       // herkese: kilitli bakiyenin haftada %1'i
    WEEKLY_UNLOCK_ACTIVE: 0.014     // oyuna girilen günler için ek (her gün giren için haftada toplam %1,4)
  },

  // 🏅 KATKI PUANI — ileride ortak haftalık çekim havuzundan pay bu puana göre dağıtılır (sunucu aşaması)
  CONTRIBUTION: {
    ADA_SPEND_WEIGHT: 1.0,          // oyunda harcanan (yakılan/kasaya giden) her ASTRA
    RESOURCE_BURN_WEIGHT: 0.5,      // harcanan/yakılan hammaddenin pazar değeri (ASTRA)
    RESOURCE_SALE_WEIGHT: 0.5       // pazara net hammadde satışı (aynı hammaddeyi alıp satmak puan getirmez)
  },

  // 💱 ASTRA FİYAT ÇARPANI — oyundaki sabit ASTRA fiyatları ve ödülleri bu çarpanla ölçeklenir.
  // ADASTRA'nın dolar değeri düşünce çarpan artar (oyuna girişin dolar maliyeti korunur), değerlenince
  // yavaş yavaş azalır. Şimdilik hedef elle girilir; sunucu aşamasında Arena fiyatından hesaplanır.
  ADA_PRICE_MULTIPLIER: {
    DEFAULT: 1,
    MAX_WEEKLY_STEP: 0.05,          // çarpan haftada en fazla %5 değişir
    MIN: 0.05,
    MAX: 20
  },

  // 🏛️ EVRENSEL TEMEL GELİR (UBI) & SEVİYE STAKE HAVUZU PARAMETRELERİ
  // Oran: UBI_POOL_RATE (yukarıda). Dağıtım kuralları: js/economy/ubi.js
  UBI_CONFIG: {
    MAX_SINGLE_CLAIM_SHARE: 0.05,        // 🛡️ TEK ÇEKİM TAVANI: Tek bir kullanıcı haftalık havuzun %5'inden fazlasını çekemez!
    MIN_LEVEL: 3,                        // v1.25: Haftalık temel gelir 3. seviyeden itibaren
    // Tarayıcı sürümünde dünya tek oyuncudur; sunucuya geçince hak sahiplerinin gerçek ağırlık toplamı kullanılır
    LOCAL_OTHER_PLAYERS_WEIGHT: 0
  },

  // =========================================================================
  // 📈 MATEMATİKSEL EKONOMİ VE FİX ÜRETİM MODELİ
  // Seviye arttıkça dakika başına üretim hızı ARTMAZ, sabittir.
  // Seviye arttıkça sadece sefer süresi uzar (Lv 1: 18 dk -> Lv 81: 72 saat).
  // =========================================================================
  // v2: dakikalık üretim ×0,3 (R4 fiyat ölçeğinin miktar payı). Buğday 9, taş 6, odun 5,4, kömür 4,5, demir 3,6, şifalı ot 1,2.
  BASE_PRODUCTION: {   // x URETIM_CARPANI (19 Ekim 2026; eski değerler: buğday 9, taş 6, odun 5,4, kömür 4,5, demir 3,6, ot 1,2)
    wheat: qU(9),
    stone: qU(6),
    wood: qU(5.4),
    coal: qU(4.5),
    iron: qU(3.6),
    herb: qU(1.2)
  },
  TAVERNA_BOT: {
    REQUIRED_PREREQUISITES: {
      iron: qU(50),
      wood: qU(50),
      wheat: qU(50),
      adAstra: 0.5
    },
    // v1.25: Bot kasadaki ASTRA'nın tamamını silo yükseltmeye gömmez; en az bu kadarını ve
    // (oto-yenileme açıksa) bir sonraki günün bot ücretini her zaman kasada bırakır. (v2: ölçekli)
    MIN_ADA_RESERVE: 5,
    // Satın alınabilir süreler (saat). Ücret = 24 saatlik tahmini net kârın %50'si × (süre / 24)
    PACKAGE_HOURS: [6, 24],
    // Yeni oyunculara bir kerelik ücretsiz deneme (saat)
    TRIAL_HOURS: 1,
    // Oyun kapalıyken bot en fazla bu kadar saati telafi eder (oto-yenileme ile günler boyunca)
    MAX_OFFLINE_CATCHUP_HOURS: 168
  },

  // 📈 v1.25: Seviye başına kalıcı üretim bonusu. Eskiden dakikalık üretim hiçbir seviyede artmıyordu;
  // botla oynayan biri için en kârlı seviye 1'di. Artık her seviye dakikalık üretimi %1,5 artırır
  // (Lv.10: +%13,5 · Lv.30: +%43,5 · Lv.81: +%120). Seviye atlama maliyetleri taban üretimden hesaplanır.
  LEVEL_PRODUCTION_BONUS_PER_LEVEL: 0.01,   // 5 Ekim 2026: %1,5 → %1 (81. seviyede +%120 yerine +%80; hammadde enflasyonu)

  // 🧭 Krallık Yolu (11 Ekim 2026): yeni oyuncu öğreticisi. 46 görev, 10 bölüm; her görev oyunun durumundan otomatik algılanır
  // (js/gameState/ogretici.js OGRETICI_KOSULLARI). Ödüller Görev & Ücretsiz Oyuncu Kasası'ndan çekilir, basılmaz.
  // Üst sınır: görevler + bölüm ödülleri + final ödülü toplamı hesap başına en çok 1.000 ASTRA (tests/test_ogretici.mjs).
  // show: v3 hub anahtarı ("Bana göster" düğmesi o ekrana götürür). Eski 10 görevin kimlikleri korunur.
  ONBOARDING_QUESTS: [
    // ── Başlangıç: krallığını tanı ──
    { id: 'first_expedition', section: 'baslangic', icon: '🚀', title: 'İlk seferini başlat', desc: 'Ormana, madene ya da tarlaya bir işçi gönder.', rewardAda: 5, show: 'merkez' },
    { id: 'first_harvest', section: 'baslangic', icon: '🌾', title: 'İlk hasadını topla', desc: 'Biten bir seferin ürününü ambarına al.', rewardAda: 7.5, show: 'merkez' },
    { id: 'first_level_up', section: 'baslangic', icon: '⭐', title: 'Seviye 2 yap', desc: 'Deneyim barını doldur ve ilk seviyeni atla.', rewardAda: 5, show: 'profil' },
    { id: 'panel_merkez', section: 'baslangic', icon: '🏰', title: 'Krallık merkezini aç', desc: 'Krallık sekmesinden Krallık merkezine gir; toplu işlemler ve genel durum orada.', rewardAda: 2, show: 'merkez' },
    { id: 'bolge_ac', section: 'baslangic', icon: '🌲', title: 'Bir kaynak bölgesini aç', desc: 'Üst çubuktaki kaynak düğmesinden bir bölgeye gir; orada sefer ve alet onarımı var.', rewardAda: 2, show: 'bolge' },
    // ── Üretim: altı hammadde ──
    { id: 'three_expeditions', section: 'uretim', icon: '⚙️', title: 'Üç alanı birden çalıştır', desc: 'Herhangi üç alanda (orman, maden, tarla, taş ocağı…) seferler aynı anda sürsün.', rewardAda: 10, show: 'merkez' },
    { id: 'alti_hammadde', section: 'uretim', icon: '🧺', title: 'Altı hammaddeyi de topla', desc: 'Buğday, taş, odun, kömür, demir ve şifalı otun her birinden en az bir sefer topla.', rewardAda: 25, show: 'merkez' },
    { id: 'tool_repair', section: 'uretim', icon: '🔨', title: 'Bir aleti onar', desc: 'Bölge panelinden aşınmış bir aleti tamir et; alet bozulursa sefer durur.', rewardAda: 10, show: 'bolge' },
    { id: 'kota_gor', section: 'uretim', icon: '📊', title: 'Üretim hakkını gör', desc: 'Ben sekmesinden Kotalarım\'ı aç: günlük ve haftalık çıkarma payın orada.', rewardAda: 2, show: 'kotalar' },
    { id: 'bot_trial', section: 'uretim', icon: '🤖', title: 'Otomasyon botunu dene', desc: 'Tavernadan 1 saatlik ücretsiz bot denemesini başlat.', rewardAda: 10, show: 'taverna' },
    { id: 'first_silo_upgrade', section: 'uretim', icon: '🏰', title: 'Siloyu büyüt', desc: 'Ambarını ilk kez yükselt; daha fazla ürün sakla.', rewardAda: 20, show: 'silo' },
    // ── Köy: nüfus ve emek ──
    { id: 'first_house', section: 'koy', icon: '🏘️', title: 'İkinci evi yap', desc: 'Köy Evleri\'nde yeni bir ev kur; köylü sayın artar.', rewardAda: 15, show: 'koy' },
    { id: 'kasaba_20', section: 'koy', icon: '👨‍🌾', title: '20 köylüye ulaş', desc: 'Köylüler buğdayla beslenir ve zamanla çoğalır; evlerin kapasitesini doldur.', rewardAda: 15, show: 'koy' },
    { id: 'first_herb_heal', section: 'koy', icon: '🌿', title: 'Şifahane\'de otla iyileştir', desc: 'Yaralı bir askeri şifalı otla hemen iyileştir (otun yetmezse "Eksik otu al" düğmesi pazardan alır).', rewardAda: 10.5, show: 'sifahane' },
    { id: 'koy_gor', section: 'koy', icon: '🏡', title: 'Köy evleri panelini incele', desc: 'Kapasite, emek puanı ve üretim bonusunu orada görürsün.', rewardAda: 2, show: 'koy' },
    // ── Pazar: alım, satım ve yakım ──
    { id: 'market_buy', section: 'pazar', icon: '🛒', title: 'Pazardan bir şey al', desc: 'Pazar → Al / Sat bölümünden bir hammadde satın al; fiyatı havuzdaki arz belirler.', rewardAda: 8, show: 'pazar' },
    { id: 'market_sell', section: 'pazar', icon: '💱', title: 'Bir hammadde sat', desc: 'Fazla hammaddeni sat; çok satılan ucuzlar, fiyatın nasıl oynadığını gör.', rewardAda: 8, show: 'pazar' },
    { id: 'ilan_gor', section: 'pazar', icon: '🏷️', title: 'İlanlar bölümüne bak', desc: 'Pazar → İlanlar: oyuncular arası teçhizat alım-satımı.', rewardAda: 2, show: 'pazar' },
    { id: 'yakim_gor', section: 'pazar', icon: '🔥', title: 'Yakım bölümünü incele', desc: 'Pazar → Yakım: her işlemde ne kadarının yakıldığını öğren.', rewardAda: 2, show: 'pazar' },
    // ── Ordu: Kışla ve taktik ──
    { id: 'first_soldier', section: 'ordu', icon: '🛡️', title: 'İlk askerini al', desc: 'Kışladan bir şampiyon askeri satın al.', rewardAda: 15, show: 'kisla' },
    { id: 'soldier_rename', section: 'ordu', icon: '✏️', title: 'Askerini adlandır', desc: 'Askerinin yanındaki kalem düğmesiyle ona bir isim ver.', rewardAda: 3, show: 'kisla' },
    { id: 'equip', section: 'ordu', icon: '🗡️', title: 'Askerine teçhizat tak', desc: 'Kışla → Cephanelik: dövdüğün bir eşyayı askerinin yuvasına tak.', rewardAda: 10, show: 'kisla' },
    { id: 'four_soldiers', section: 'ordu', icon: '👥', title: 'Dört askere ulaş', desc: 'Ordunu büyüt; zindan ve kolezyum için daha çok asker gerekir.', rewardAda: 25, show: 'kisla' },
    { id: 'row_change', section: 'ordu', icon: '🔄', title: 'Ön ve arka saf düzenini değiştir', desc: 'Bir askerin saf yerini değiştir: ön saf darbeyi alır, arka saf korunur.', rewardAda: 5, show: 'kisla' },
    { id: 'preset_save', section: 'ordu', icon: '💾', title: 'Bir taktik kaydet', desc: 'Dizilişini Taktik 1-3\'ten birine kaydet; savaşlarda tek dokunuşla yüklersin.', rewardAda: 8, show: 'kisla' },
    // ── Demirhane: dövme ve geri dönüşüm ──
    { id: 'craft', section: 'demirhane', icon: '⚒️', title: 'İlk eşyanı dök', desc: 'Demirhane → Yeni eşya dök: bir silah ya da zırh parçası üret.', rewardAda: 15, show: 'demirhane' },
    { id: 'upgrade_gear', section: 'demirhane', icon: '⬆️', title: 'Bir eşyayı yükselt', desc: 'Eşyalarım\'dan bir eşyayı bir seviye geliştir.', rewardAda: 15, show: 'demirhane' },
    { id: 'gear_repair', section: 'demirhane', icon: '🛠️', title: 'Bir eşyayı onar', desc: 'Savaşta aşınan eşyanın dayanıklılığını tamir et.', rewardAda: 8, show: 'demirhane' },
    { id: 'first_recycle', section: 'demirhane', icon: '♻️', title: 'Bir eşyayı geri dönüştür', desc: 'Demirhane\'de kullanmadığın bir eşyayı hammaddeye çevir.', rewardAda: 8, show: 'demirhane' },
    // ── Zindan: ilk zaferler ──
    { id: 'dungeon_preview', section: 'zindan', icon: '🔎', title: 'Savaş öncesi ekranı oku', desc: 'Zindanda bir canavara dokun: kazanma şansı, giriş kuralları ve taktik burada.', rewardAda: 2, show: 'zindan' },
    { id: 'dungeon_win', section: 'zindan', icon: '🏆', title: 'Zindanda ilk zaferin', desc: 'Birinci katın ilk canavarını yen.', rewardAda: 20, show: 'zindan' },
    { id: 'fragment_drop', section: 'zindan', icon: '🧩', title: 'Teçhizat parçası düşür', desc: 'Zindan zaferlerinden teçhizat parçası ve Pandora kutusu şansı vardır.', rewardAda: 15, show: 'zindan' },
    { id: 'heal_soldier', section: 'zindan', icon: '🩹', title: 'Yaralı askeri iyileştir', desc: 'Savaştan sonra askerlerini şifalı otla iyileştir (ya da 24 saat bekle) ve yeniden gir.', rewardAda: 5, show: 'kisla' },
    { id: 'dungeon_boss3', section: 'zindan', icon: '🗿', title: 'Ara boss\'u yen', desc: 'Üçüncü katın sonundaki Kadim Taş Golyat\'ı devir.', rewardAda: 40, show: 'zindan' },
    // ── Kolezyum ve Karnaval ──
    { id: 'colosseum_first', section: 'kolezyum', icon: '🏟️', title: 'İlk kolezyum düellon', desc: 'Şampiyonunu seçip Kolezyuma çık; sonuç ELO puanını değiştirir.', rewardAda: 15, show: 'kolezyum' },
    { id: 'league_gor', section: 'kolezyum', icon: '🏆', title: 'Haftalık ligi gör', desc: 'Kolezyum → Lig: ilk 10\'a ödül veriliyor.', rewardAda: 2, show: 'kolezyum' },
    { id: 'wheel_spin', section: 'kolezyum', icon: '🎡', title: 'Şans çarkını çevir', desc: 'Karnaval → Çark: 15 ödülden biri düşer.', rewardAda: 8, show: 'karnaval' },
    { id: 'lottery_buy', section: 'kolezyum', icon: '🎟️', title: 'Piyango bileti al', desc: 'Her hafta tek kazanan çıkar ve biletlerine ödediğinin 2 katını alır.', rewardAda: 8, show: 'karnaval' },
    { id: 'pools_gor', section: 'kolezyum', icon: '🏛️', title: 'Havuzlar bölümüne bak', desc: 'Karnaval → Havuzlar: oyun kasalarının paylarını ve ücretsiz oyuncu payını göster.', rewardAda: 2, show: 'karnaval' },
    // ── Konsey ve hazine: ekonominin kalbi ──
    { id: 'first_konsey', section: 'konsey', icon: '🏛️', title: 'Konsey\'e katkı ver', desc: 'Sirius Konseyi\'nde Otorite inşaatına ya da projeye hammadde ver.', rewardAda: 15, show: 'konsey' },
    { id: 'treasury_gor', section: 'konsey', icon: '👑', title: 'Kasaları gez', desc: 'Ben → Hazine ve gelir panosu: ödüllerin hangi kasadan ödendiğini gör.', rewardAda: 2, show: 'hazine' },
    { id: 'economy_gor', section: 'konsey', icon: '📈', title: 'Ekonomi panosunu aç', desc: 'Oyun parasının nereye gittiğini ve ne kadar yakıldığını gösterir.', rewardAda: 2, show: 'ekonomi' },
    { id: 'boss_join', section: 'konsey', icon: '🌋', title: 'Dünya bossuna katıl', desc: 'Savaş alanında ordunu bu haftaki ortak boss savaşına yaz.', rewardAda: 15, show: 'savasalani' },
    { id: 'level_5', section: 'konsey', icon: '⭐', title: 'Hesap seviyen 5 olsun', desc: 'Sefer, zindan ve görevlerden deneyim kazan; her seviye üretim bonusu verir.', rewardAda: 20, show: 'profil' },
    // ── Hesap: ASTRA'n ve ilerlemen ──
    { id: 'profil_gor', section: 'hesap', icon: '🧙', title: 'Karakterini incele', desc: 'Ben → Karakterim: seviye atlayınca ne kazanacağını gösterir.', rewardAda: 2, show: 'profil' },
    { id: 'level_10', section: 'hesap', icon: '🌟', title: 'Hesap seviyen 10 olsun', desc: 'Daha yüksek seviye daha çok asker hakkı, bonus ve zindan şansı demek.', rewardAda: 40, show: 'profil' },
    { id: 'tur_bitir', section: 'hesap', icon: '🎓', title: 'Oyun turunu bitir', desc: 'Ben → Oyun turu: ana ekranların kısa tanıtımı.', rewardAda: 8, show: 'tur' }
  ],
  ONBOARDING_SECTIONS: [
    { id: 'baslangic', icon: '🗺️', title: 'Başlangıç: krallığını tanı', bonusAda: 20 },
    { id: 'uretim', icon: '⚙️', title: 'Üretim: altı hammadde', bonusAda: 30 },
    { id: 'koy', icon: '🏘️', title: 'Köy: nüfus ve emek', bonusAda: 30 },
    { id: 'pazar', icon: '🏪', title: 'Pazar: alım, satım ve yakım', bonusAda: 35 },
    { id: 'ordu', icon: '⚔️', title: 'Ordu: Kışla ve taktik', bonusAda: 35 },
    { id: 'demirhane', icon: '⚒️', title: 'Demirhane: dövme ve geri dönüşüm', bonusAda: 40 },
    { id: 'zindan', icon: '💀', title: 'Zindan: ilk zaferler', bonusAda: 50 },
    { id: 'kolezyum', icon: '🏟️', title: 'Kolezyum ve Karnaval', bonusAda: 50 },
    { id: 'konsey', icon: '🏛️', title: 'Konsey ve hazine: ekonominin kalbi', bonusAda: 55 },
    { id: 'hesap', icon: '🔐', title: 'Hesap ve ilerleme: ASTRA ve seviyen', bonusAda: 55 }
  ],
  ONBOARDING_FINAL: { id: 'krallik_yolu', icon: '👑', title: 'Krallık Yolu Fatihi', bonusAda: 100 },
  // 🏰 ZİNDAN ORDU YORULMASI & STAMİNA MALİYETİ MATRİSİ
  // Her kat için asker başına harcanan stamina: Taban (5) + Canavar Seviyesi (Level)
  DUNGEON_STAMINA_COST_PER_SOLDIER: {
    BASE_PER_SOLDIER: 5,
    1: 6,   // Kat 1 (Bataklık Balçığı): 6 Stamina / asker
    2: 7,   // Kat 2 (Mağara Goblini): 7 Stamina / asker
    3: 8,   // Kat 3 (Gölge Kurdu): 8 Stamina / asker
    4: 9,   // Kat 4 (Kemik Mahzeni İskeletleri): 9 Stamina / asker
    5: 10,  // Kat 5 (Lanetli Kemik Büyücüsü): 10 Stamina / asker
    6: 11,  // Kat 6 (Kemik Taht Muhafızı): 11 Stamina / asker
    7: 12,  // Kat 7 (Karanlık Tarikatçı): 12 Stamina / asker
    8: 13,  // Kat 8 (Cehennem Tazısı): 13 Stamina / asker
    9: 14,  // Kat 9 (Kadim Taş Golyat - ARA BOSS): 14 Stamina / asker
    10: 15, // Kat 10 (Sargılı Mumyalar): 15 Stamina / asker
    11: 16, // Kat 11 (Gölge Hayaletler): 16 Stamina / asker
    12: 17, // Kat 12 (Lanetli Firavun): 17 Stamina / asker
    13: 18, // Kat 13 (Ateş İblisleri): 18 Stamina / asker
    14: 19, // Kat 14 (Lav Elementalleri): 19 Stamina / asker
    15: 20, // Kat 15 (Obsidyen Berserker): 20 Stamina / asker
    16: 21, // Kat 16 (Kıyamet Şövalyesi): 21 Stamina / asker
    17: 22, // Kat 17 (Kadim Gölge Lordu): 22 Stamina / asker
    18: 23  // Kat 18 (Kıyamet Ejderhası IGNIS - BÜYÜK BOSS): 23 Stamina / asker
  },

  // Sefer Süreleri (Level 1: 18 Dakika, Level 81: 72 Saat)
  EXPEDITION_MIN_LEVEL: 1,
  EXPEDITION_MAX_LEVEL: 81,
  EXPEDITION_MIN_DURATION_MINUTES: 18,     // Seviye 1: 18 Dakika (0.3 Saat)
  EXPEDITION_MAX_DURATION_MINUTES: 4320,   // Seviye 81: 72 Saat (4320 Dakika)

  // Kaynak Alanları (v2: 6 alan). totalCap = tarayıcı (tek oyunculu) modda kişi başı haftalık Üretim Hakkı
  // (taban × 168 saat × QPP_START 0,4); sunucuda dünya kapasitesi aktif oyuncu sayısıyla hesaplanır (server/world.js).
  // v2: totalCap = taban × 60 × 20 saat × 6 gün × 0,40 (kişi başı kota) × ağırlık toplamı 1 — globalPool.computeWeekCapacity ile aynı
  GLOBAL_RESOURCE_CAPS: {   // adetler x URETIM_CARPANI (19 Ekim 2026)
    wheat: { id: 'wheat', name: 'Güneş Buğdayı',     icon: '🌾', color: '#facc15', totalCap: qU(25920), ratePerMinute: qU(9),   baseYieldPerHour: qU(540), requiredTool: 'sickle' },
    stone: { id: 'stone', name: 'Vadi Taşı',          icon: '🪨', color: '#a8a29e', totalCap: qU(17280), ratePerMinute: qU(6),   baseYieldPerHour: qU(360), requiredTool: 'chisel' },
    wood:  { id: 'wood',  name: 'Zümrüt Meşe Odunu',  icon: '🌲', color: '#4ade80', totalCap: qU(15552), ratePerMinute: qU(5.4), baseYieldPerHour: qU(324), requiredTool: 'axe' },
    coal:  { id: 'coal',  name: 'Kara Kömür',         icon: '⚫', color: '#64748b', totalCap: qU(12960), ratePerMinute: qU(4.5), baseYieldPerHour: qU(270), requiredTool: 'coalpick' },
    iron:  { id: 'iron',  name: 'Derin Demir Cevheri', icon: '⛏️', color: '#94a3b8', totalCap: qU(10368), ratePerMinute: qU(3.6), baseYieldPerHour: qU(216), requiredTool: 'pickaxe' },
    herb:  { id: 'herb',  name: 'Şifalı Ot',          icon: '🌿', color: '#86efac', totalCap: qU(3456),  ratePerMinute: qU(1.2), baseYieldPerHour: qU(72),  requiredTool: 'herbknife' }
  },

  // Aletler (v2: 6 alet, ilk sürümde yalnız Acemi kademe; 72 saat = 4320 dakika dayanıklılık, dakikada 1 aşınma)
  // Onarım kuralı: dakikalık odun ve demir üretiminin %25'i alet sayısına bölünür + bu malzemenin pazar değerinin
  // TOOL_REPAIR_ADA_SHARE (%30) kadarı ASTRA (gameState.calculateRepairCost). repairCostPerMinute yalnız bilgi.
  TOOLS: {
    sickle:    { id: 'sickle',    name: 'Demir Orak',       icon: '🌾', maxDurability: 4320, durabilityLossPerMinute: 1, producedResource: 'wheat', repairCostPerMinute: { wood: qU(0.45), iron: qU(0.3), wheat: 0, adAstra: 0.01 } },
    chisel:    { id: 'chisel',    name: 'Taş Keskisi',      icon: '🪨', maxDurability: 4320, durabilityLossPerMinute: 1, producedResource: 'stone', repairCostPerMinute: { wood: qU(0.45), iron: qU(0.3), wheat: 0, adAstra: 0.01 } },
    axe:       { id: 'axe',       name: 'Acemi Baltası',    icon: '🪓', maxDurability: 4320, durabilityLossPerMinute: 1, producedResource: 'wood',  repairCostPerMinute: { wood: qU(0.45), iron: qU(0.3), wheat: 0, adAstra: 0.01 } },
    coalpick:  { id: 'coalpick',  name: 'Kömür Kazması',    icon: '⚫', maxDurability: 4320, durabilityLossPerMinute: 1, producedResource: 'coal',  repairCostPerMinute: { wood: qU(0.45), iron: qU(0.3), wheat: 0, adAstra: 0.01 } },
    pickaxe:   { id: 'pickaxe',   name: 'Bronz Kazma',      icon: '⛏️', maxDurability: 4320, durabilityLossPerMinute: 1, producedResource: 'iron',  repairCostPerMinute: { wood: qU(0.45), iron: qU(0.3), wheat: 0, adAstra: 0.01 } },
    herbknife: { id: 'herbknife', name: 'Ot Bıçağı',        icon: '🌿', maxDurability: 4320, durabilityLossPerMinute: 1, producedResource: 'herb',  repairCostPerMinute: { wood: qU(0.45), iron: qU(0.3), wheat: 0, adAstra: 0.01 } }
  },

  // Teçhizat en fazla 10. seviyeye yükseltilir (maliyet: EQUIPMENT_RECIPES ve gameState)
  EQUIPMENT_MAX_LEVEL: 10,
  // v2 dövme bedeli: eşyanın gücü dakikalık taban üretimle çarpılır (1 ATK = 2 dk, 1 CAN = 0,8 dk; odun ve demir tam, kömür üçte bir).
  // En pahalı temel eşya 50 dakikalık üretimdir: 1. seviye silo (1 saatlik üretim) ilk takımı dövmeye yeter.
  // (7 Ekim 2026'dan önce 18 / 21 dakikaydı: ilk kılıç 1.620 demir istiyor, 216 demirlik siloya sığmıyordu.)
  EQUIPMENT_CRAFT_MINUTES: { PER_ATK: 2, PER_HP: 0.8 },

  // ═══════════════════════════════════════════════════════════════════════
  // AMM FİYAT KORİDORU — v2: ARTIK GERÇEKTEN UYGULANIYOR (F-04)
  // ═══════════════════════════════════════════════════════════════════════
  // YASA 3: "Kıt olan pahalıdır." Haftalık küresel kota 180.000 odunsa odun
  // ucuz olamaz. Fiyatlar kota kıtlığına göre yeniden türetildi:
  //   odun  180.000/hafta × 2,50 =   450.000 ASTRA
  //   demir 130.000/hafta × 4,00 =   520.000 ASTRA
  //   buğday 490.000/hafta × 0,90 = 441.000 ASTRA
  //   ────────────────────────────────────────────
  //   Tüm evrenin haftalık emek geliri = 1.411.000 ASTRA (v1'de 6.264 ASTRA idi)
  // v2 (R4b): açılış fiyatları ölçekli (×0,01); koridor taban 0,5×, tavan 2,5× açılış (ASTRA/birim; ekranda 1.000 birim başına)
  AMM_CORRIDORS: {
    // 19 Ekim 2026: hammaddelerde tavan 2,5x'ten 5x'e çıktı (balinalar fiyatı gerçekten tırmandırsın); açılış fiyatları aynı
    wheat:     { minPriceAda: 0.0045, maxPriceAda: 0.045, defaultPriceAda: 0.009 },
    stone:     { minPriceAda: 0.006,  maxPriceAda: 0.06,  defaultPriceAda: 0.012 },
    wood:      { minPriceAda: 0.0125, maxPriceAda: 0.125, defaultPriceAda: 0.025 },
    coal:      { minPriceAda: 0.009,  maxPriceAda: 0.09,  defaultPriceAda: 0.018 },
    iron:      { minPriceAda: 0.02,   maxPriceAda: 0.2,   defaultPriceAda: 0.04 },
    herb:      { minPriceAda: 0.04,   maxPriceAda: 0.4,   defaultPriceAda: 0.08 },
    fragments: { minPriceAda: 0.225,  maxPriceAda: 4.5,    defaultPriceAda: 0.45 },   // tavan 10 kat: küçük havuzda kullanım fiyatı gerçekten yükseltir (18 Ekim 2026)
    scroll_heal:    { minPriceAda: 0.15, maxPriceAda: 0.75, defaultPriceAda: 0.30 },
    scroll_stamina: { minPriceAda: 0.30, maxPriceAda: 1.50, defaultPriceAda: 0.60 }
  },
  // v2 (R3/R4b): pazar havuzlarının ASTRA tohumu — 200 M'den 100 M: 6 hammadde 90 M (değer ağırlıklı), tüketilenler 10 M
  AMM_SEED_ASTRA: { raw: 90000000, fragments: 180000, scroll_heal: 1000000, scroll_stamina: 1000000 },   // Pandora kutusu ve Anahtar havuzları 18 Ekim 2026'da kaldırıldı
  // Tek işlemde havuzdaki malın en çok bu oranı alınıp satılabilir (bugün %50 idi)
  AMM_SINGLE_TRADE_SHARE: 0.05,
  // Geri alım (R4): fiyat açılışın (1 − TRIGGER_DROP) altına inince kasanın haftada WEEKLY_RATE'i ile al-yak
  AMM_BUYBACK: { TRIGGER_DROP: 0.20, WEEKLY_RATE: 0.03 },

  // Swap ücreti: %2.00 piyasa komisyonu (Hazine Ödül Kasaları, Kalıcı Yakım & UBI'ye aktarılır)
  AMM_FEE_RATE: 0.02,
  // (eski derinlik kuralı; v2'de havuz AMM_SEED_ASTRA'dan türetilir, bu değer yalnız yedek)
  AMM_RAW_DEPTH_WEEKS: 80,
  // Hammadde Yakım Ücreti: Alınan ve satılan tüm hammaddelerden (odun, demir, buğday vb.) %2.00 kesilir ve anında yakılır
  AMM_RESOURCE_FEE_RATE: 0.02,

  // Karakter seviyesi tavanı (seviye atlama bedeli: gameState.getNextLevelRequirement)
  MAX_PLAYER_LEVEL: 81,

  // Seviye atlama bedelinin siloya sığma kuralı (13 Ekim 2026 denetimi EK-01, "başlangıç silosuna sığmayan maliyet olmaz"
  // ilkesinin genişletilmesi): bedel, her hammaddede ULAŞILABİLİR en büyük silonun (Universe öncesi 12. seviye)
  // kapasitesinin bu oranını aşamaz. Eskiden bedel "XP'yi toplarken kazanılanın yarısı" idi ve seviye uzadıkça
  // büyüyordu; Sv.11→12'de silo-12'yi aştı (taş 6.672 > 6.298), Sv.12-81 hiç açılamıyordu.
  // 0,8 = silo yükseltmenin "%80 dolu olmalı" şartıyla aynı oran: bedeli tutan oyuncu siloyu da doldurmuş olur ve
  // geri kalan %20'ye sefer toplayabilir. Alternatif (seçilmedi): %100 — silo tam dolu beklemek toplama kaybettirir.
  LEVEL_UP_SILO_SHARE: 0.8,

  // GELİŞİM BEDELLERİ ×5 (19 Ekim 2026, kullanıcı kararı: "oyuna 1 M ASTRA attım, silo, ev, asker, teçhizat hepsini bir günde bitirdim, çok ucuz").
  // Yalnız TEK SEFERLİK gelişim bedelleri büyür; tekrar eden harcamalar (stamina, alet ve eşya onarımı, iyileştirme, haftalık talep) haftalık
  // Üretim Hakkı ile dengelidir (docs/v2/HAMMADDE_KULLANIM_PLANI.md), 5 katı oyunu oynanmaz yapardı. Hiçbir bedel TOPLAM x5'i geçirmek için
  // ilk basamakları şişirmez: yeni oyuncu ilk siloya sığan ilk takımı yine dövebilir (başlangıç silosu ilkesi); yük üst basamaklara biner.
  //   • Teçhizat yükseltmesi: seviye başına artış 1,18 → EQUIPMENT_UPGRADE_GROWTH (1→10 toplam ~x4,8; ilk basamak aynı). Onarım eski 1,18 ölçeğinde kalır.
  //   • Köy evi: HOUSE_COST_MULT 1,2 → 1,5 (11 evin toplamı ~x4,4); tek bedel en büyük silonun %80'ini geçemez (siloya sığma ilkesi).
  //   • Hesap seviyesi bedeli: LEVEL_UP_COST_RAMP: FROM_LEVEL'e kadar eski, TO_LEVEL'den sonra MULT katı, arası doğrusal; tavan en üst silo (18. seviye) x %80.
  //   • Silo yükseltmesi: kapasitenin %50'si → %70'i (siloya sığma kuralı yüzünden x5 olamaz: bedel kapasiteyi aşamaz).
  //   • Asker ASTRA bedeli x5 (SOLDIER_COST_BASE, SOLDIER_18_TARGET_COST); teçhizat parçası bedeli (dövme ve yükseltme) PARCA_CARPANI = x2
  //     (parça arzı düşme şansına ve küçük pazar havuzuna bağlı: x5 pazar fiyatını patlatırdı).
  EQUIPMENT_UPGRADE_GROWTH: 1.55,   // ilk yükseltme basamağı 1,18 (eski), sonrası her basamak x1,55 (1→10 toplam ~x4,8)
  // TEÇHİZAT YÜKSELTME ASTRA BEDELİ (20 Ekim 2026, kullanıcı kararı: "geliştirmede demir, odun, kömür çok az, parça çok; teçhizat geliştirmek öyle kolay olmasın"):
  // Ham madde ADETLERİ silo kapasitesine zaten dayalı (ilk basamaklarda bedel kapasitenin 1-2 katı; daha çoğu hiçbir silo almaz), o yüzden zorluk ASTRA tarafından
  // artar: ASTRA bedeli = hammaddenin pazar değeri x ASTRA_CARPANI(hedef seviye). Hedef sv 2: x3 ... sv 10: x33 (BASE x GROWTH^(sv-2)); bir eşyayı 1→10 yükseltmek
  // ~320.000 ASTRA (eskiden ~12.700). İlk üç basamak hâlâ ucuz (yeni oyuncu), yük üst basamaklara biner. Harcanan ASTRA her harcama gibi dağılır (yakım, kasalar).
  EQUIPMENT_UPGRADE_ASTRA: { BASE: 3, GROWTH: 1.35 },
  // HESAP SEVİYESİ HER ŞEYİN ANAHTARI (19 Ekim 2026, kullanıcı kararı: "silonun en yüksek seviyesi hesabın seviyesini geçemesin, oyundaki en pahalı şey hesap
  // yükseltme bedeli olsun, her şey hesap seviyesine bağlı olsun"):
  //   • Silo seviyesi hesap seviyesini geçemez; bu yüzden hesap seviyesi bedeli, O SEVİYEDEKİ silonun kapasitesinin payıdır (siloya sığar, silo ile birlikte büyür).
  //     Pay 1. seviyede 0,45 (eski ilk basamakla aynı), her seviye +0,05, en çok 0,9: silo yükseltmesi (0,7) ve ev/teçhizattan hep daha pahalı.
  //   • En üst silo (49) ile hesap en üst seviyesi (81) arasında hammadde bedeli düz kalır; ASTRA payı her seviye x1,05 büyür (hem hammadde hem ASTRA en pahalı).
  //   • n. ev için hesap seviyesi en az EV_SEVIYE_ADIMI x (n-1) (2, 4, 6 ...); teçhizat seviyesi en çok min(10, TABAN + seviye x SEVIYE_BASI).
  HESAP_BAGI: {
    SEVIYE_BEDELI_PAYI: { BASLANGIC: 0.45, ARTIS: 0.05, SON: 0.9 },
    SEVIYE_ASTRA_ASIM: 1.05,
    EV_SEVIYE_ADIMI: 2,
    TECHIZAT_TABAN: 2,
    TECHIZAT_SEVIYE_BASI: 0.5
  },
  GELISIM_PARCA_CARPANI: 2,

  // =========================================================================
  // SOLDIER & MILITARY SYSTEM (TEK TİP ADASTRA ŞAMPİYONU)
  // =========================================================================
  // Tek bir asker türü: AdAstra Şampiyonu. Level 1'de fix 100 HP ve fix 25 ATK.
  // 19 Ekim 2026 (kullanıcı kararı: "gelişim bedelleri çok düşük", x5): asker bedeli 5 katına çıktı (taban 50 → 250, 18. asker 18.000 → 90.000)
  SOLDIER_COST_BASE: 250,             // Taban maliyet: 250 ASTRA (1. asker; v2 ölçekli, x5)
  SOLDIER_COST_EXPONENT: 2.0364522367650437, // Kademeli artış üssü (1. asker: 50, 18. asker: 18.000)
  SOLDIER_18_TARGET_COST: 90000,      // 18. asker maliyeti (v2 ölçekli, x5)
  MAX_SOLDIERS: Infinity,             // Sınırsız ordu ve asker alımı
  // Ordu sınırları (30 Eylül 2026 kararı 5, docs/v2/R5_NUFUS_ORDU.md): "zindan ilerlemesi + hesap seviyesi birlikte".
  //  • ASKER_SEVIYESI_HESAP_SEVIYESINI_GECEMEZ: asker, hesap seviyesinden yüksek seviyeye çıkamaz (kazanılan XP birikir, hesap
  //    seviyesi artınca asker seviye atlar). Açık.
  //  • ASKER_HAKKI_ZINDAN_KATINA_BAGLI: yeni asker alımı <= geçilen zindan katı + 1 (Normal mod 2-7; js/economy/ordu-hakki.js). Açık
  //    (18 Ekim 2026): 15 Ekim'de kapalıydı, çünkü eski canavar tablosuyla (sv.1 asker, hak 1-3) ilk canavar bile yenilmiyordu. Canavar
  //    tablosu (js/bestiary.js) bu kurala göre yeniden kuruldu: scripts/model/zindan_{denge,tempo,ayarla}.mjs. Sınır teçhizat
  //    döngüsünü (dövme, geliştirme, aşınma, tamir) zorunlu kılar. Var olan asker hiçbir zaman silinmez.
  ORDU_SINIRI: { ASKER_SEVIYESI_HESAP_SEVIYESINI_GECEMEZ: true, ASKER_HAKKI_ZINDAN_KATINA_BAGLI: true },
  SOLDIER_MAX_HP: 100,                // Fix Level 1 HP
  SOLDIER_BASE_ATK: 25,               // Fix Level 1 ATK
  SOLDIER_HP_PER_LEVEL: 25,           // Her seviye atlayışta +25 HP
  SOLDIER_ATK_PER_LEVEL: 6,           // Her seviye atlayışta +6 ATK

  // 24 Saatlik Kendiliğinden (Pasif) İyileşme Kuralı (18 Ekim 2026'dan beri şifalı otla, buğdayla değil):
  // 24 saat (86400 sn) içinde asker kendi kendini iyileştirirken EKRANDA GÖRÜNEN her can için herbPerHp şifalı ot (yakılır) + adaPerHp
  // ASTRA harcanır. Hemen iyileştirme (SIFAHANE) 1 can için 1/HP_PER_HERB = 0,5 ot + 0,01 ASTRA: bekleyen beş kat az öder.
  // Ot ya da ASTRA biterse iyileşme eldekinin yettiği kadar sürer, sonra durur.
  SOLDIER_PASSIVE_HEAL: {
    FULL_HEAL_SECONDS: 86400,     // 0 HP'den %100 cana kadar tam iyileşme süresi (24 saat)
    herbPerHp: qU(0.1),           // ekrandaki 1 can için 0,1 şifalı ot x URETIM_CARPANI = 0,5 ot (hemen iyileştirmenin beşte biri)
    adaPerHp: 0.002               // ekrandaki 1 can için 0,002 ASTRA (hemen iyileştirmenin beşte biri)
  },

  // =========================================================================
  // SİLO / DEPO KAPASİTE & YÜKSELTMELERİ (İSTİFÇİLİK ÖNLEME MODELİ)
  // gameState.getWarehouseCapacity bu değerleri okur.
  // Maksimum Seviye: 49 (19 Ekim 2026; ilk 18 seviye eski eğri, 19-49 her seviye postAnchorGrowth kadar büyür)
  // Başlangıç (Lv 1): 1080 Odun, 720 Demir, 1800 Buğday
  // Ara seviyeler: başlangıçtan maksimuma eşit oranlı (üssel) büyüme
  // Maksimum (Lv 18): Haftalık havuz tavanının %50'si (90k Odun, 65k Demir, 245k Buğday)
  // Yükseltme Şartı: Tüm depolar %70 dolu olmak zorunda (upgradeFillShare; 19 Ekim 2026, eskiden %80)
  // Yükseltme Maliyeti: Silonun %70'ini dolduran kısmın TAMAMI kadar hammadde (upgradeCostShare) + o hammaddelerin ANLIK pazar ASTRA fiyatı toplamı
  // =========================================================================
  WAREHOUSE: {
    baseLevels: 18,           // kapasite eğrisinin DAYANAK seviyesi (initial → max üssel); 18. seviyeden sonrası postAnchorGrowth ile büyür
    maxLevel: 49,             // 19 Ekim 2026 (kullanıcı kararı): silo en çok 49. seviyeye kadar yükseltilir
    postAnchorGrowth: 1.08,   // 19-49. seviyeler: her seviye kapasite x1,08 (49. seviye = 18. seviyenin ~10,3 katı)
    upgradeFillShare: 0.7,    // yükseltme şartı: tüm depolar en az %70 dolu (eskiden %80)
    // v2: 13. seviyeden itibaren Universe alüminyumu ister; Universe açılana kadar bu tavan
    // 19 Ekim 2026 (kullanıcı kararı: "silo 12 çok az"): Universe beklemeden 18. seviyeye kadar açıldı. 12. seviye buğdayda 12.976, taşta 6.298 alıyordu;
    // 18. seviye 73.500 / 30.000 (tasarımdaki en üst seviye: haftalık havuz tavanının %50'si). 13+ yükseltme bedeli ve %80 doluluk şartı aynı kalır.
    universeGateLevel: 49,
    // 19 Ekim 2026: silo yükseltme bedeli = silonun %70'ini dolduran miktarın tamamı (eskiden kapasitenin %50'si) + o hammaddelerin anlık pazar ASTRA'sı.
    upgradeCostShare: 0.7,
    // Seviye atlama bedelinin tavanı hâlâ ESKİ sınır olan 12. silonun kapasitesine göre hesaplanır (Universe aşaması 3'e kadar): silo büyüyünce
    // seviye bedelleri de 5 kata kadar büyümesin, seviye atlama yavaşlamasın. Aşama 3'te tavan en üst siloya geçer (eski davranış).
    levelUpCostGateLevel: 18,
    initialCapacities: {   // 1 saatlik üretim (x URETIM_CARPANI; parça ayrı bir eşya, ölçeklenmez). En üst silo x HAMMADDE_ADEDI_CARPANI: kapasite eğrisi ikisi arasında üsteldir
      wheat: qU(540),
      stone: qU(360),
      wood: qU(324),
      coal: qU(270),
      iron: qU(216),
      herb: qU(72),
      fragments: 100
    },
    maxCapacities: {       // x HAMMADDE_ADEDI_CARPANI (eski 18. seviye: buğday 73.500, taş 30.000, odun 27.000, kömür 22.500, demir 19.500, ot 6.000)
      wheat: q(73500),
      stone: q(30000),
      wood: q(27000),
      coal: q(22500),
      iron: q(19500),
      herb: q(6000),
      fragments: 2500
    },
    fragmentsPerLevel: 140      // Parça kapasitesi ara seviyelerde doğrusal artar (Lv 18'de maxCapacities)
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TAVERNA — v2 fiyatlaması (F-17)
  // ═══════════════════════════════════════════════════════════════════════
  // v1'de 45.000 ASTRA'lık iksir verimi HİÇ artırmıyordu; 40 ASTRA'lık eski
  // `speed_wood` buff'ı ise hem süreyi hem verimi 1,5× yapıyordu. Yani pahalı
  // ürün ucuzdan 1.125 kat daha kötüydü. Eski buff'lar kaldırıldı, iksirler
  // artık HEM süreyi HEM verimi çarpıyor ve yeni gelir düzeyine göre fiyatlandı.
  TAVERN_BUFFS: {
    auto_collector: {
      id: 'auto_collector',
      name: 'Günlük Otomatik Toplama & Tamir Botu (24 Saat)',
      icon: '🤖',
      durationSeconds: 24 * 3600,
      costAdAstra: 18,
      desc: 'Seferler bittiğinde kaynakları otomatik toplar, aletleri depodaki hammaddeyle otomatik tamir eder ve seferi kesintisiz sürdürür.'
    },
    auto_collector_weekly: {
      id: 'auto_collector_weekly',
      name: 'Haftalık Otomatik Toplama & Tamir Botu (7 Gün)',
      icon: '🤖',
      durationSeconds: 7 * 24 * 3600,
      costAdAstra: 107,
      desc: '7 gün boyunca tüm seferleri otomatik toplar, depodaki hammaddeyle aletleri otomatik onarır ve seferleri sürdürür (%15 İndirimli).'
    },
    auto_collector_monthly: {
      id: 'auto_collector_monthly',
      name: 'Aylık Otomatik Toplama & Tamir Botu (30 Gün)',
      icon: '🤖',
      durationSeconds: 30 * 24 * 3600,
      costAdAstra: 378,
      desc: '30 gün boyunca kesintisiz tam otomasyon! Kaynakları toplar, aletleri otomatik tamir eder ve seferleri yönetir (%30 İndirimli).'
    }
  },
  
  // =========================================================================
  // GAMEFI & RPG EKONOMİSİ (PHASE 1): ZİNDAN GANİMET ORANLARI
  // =========================================================================
  // Level-scaled drop rates (Lv 1 to Lv 81)
  FRAGMENT_DROP_MIN: 0.0018,       // 0.18% at Lv 1 (Hesap Lv.1'de %0.18)
  FRAGMENT_DROP_MAX: 0.18,         // 18.0% at Lv 81 (Hesap Lv.81'de %18 - 100 kat artış)
  BOX_DROP_MIN: 0.000018,          // 0.0018% at Lv 1 (Hesap Lv.1'de %0.0018)
  BOX_DROP_MAX: 0.0018,            // 0.18% at Lv 81 (Hesap Lv.81'de %0.18 - 100 kat artış)
  // Koleksiyon Eseri (artifact) keşif olasılığı = ARTIFACT_BASE_RATE * seviye (yalnızca boss canavarlarda)
  ARTIFACT_BASE_RATE: 0.0009,
  // Kat 3 ve Kat 6 Bosslarında %100 çarpan etkisi (2.0x - 2 katı düşürme oranı)
  BOSS_DROP_MULTIPLIER: 2.0,

  // 5 Adet Dövülebilir & Geliştirilebilir Ekipman (1 Silah, 1 Miğfer, 1 Zırh, 1 Pantolon, 1 Ayakkabı)
  // Tüm eşyalar 13/13 Durability ile başlar, seviye yükseltilebilir ve bittiğinde tekrar dövülebilir!
  EQUIPMENT_RECIPES: {
    weapon: {
      id: 'weapon',
      slot: 'weapon',
      name: 'Efsanevi Savaş Kılıcı',
      icon: '🗡️',
      baseAtk: 25,
      baseHp: 0,
      maxDurability: 13,
      cost: { fragments: 18, iron: qU(60), wood: qU(40), coal: qU(20), adAstra: 0.5 },
      desc: 'Yüksek hasar veren, demir ve huş odunuyla dövülmüş efsanevi savaş kılıcı (+25 Saldırı, 13/13 Dayanıklılık).'
    },
    helmet: {
      id: 'helmet',
      slot: 'helmet',
      name: 'Kraliyet Miğferi',
      icon: '🪖',
      baseAtk: 10,
      baseHp: 30,
      maxDurability: 13,
      cost: { fragments: 12, iron: qU(40), wood: qU(20), coal: qU(10), adAstra: 0.35 },
      desc: 'Kritik darbeleri savuşturan dövme çelik miğfer (+10 Saldırı, +30 Can, 13/13 Dayanıklılık).'
    },
    armor: {
      id: 'armor',
      slot: 'armor',
      name: 'Ağır Çelik Gövde Zırhı',
      icon: '🛡️',
      baseAtk: 0,
      baseHp: 60,
      maxDurability: 13,
      cost: { fragments: 20, iron: qU(80), wood: qU(30), coal: qU(25), adAstra: 0.6 },
      desc: 'Zindan darbelerini emen kalın demir plaka gövde zırhı (+60 Can, 13/13 Dayanıklılık).'
    },
    legs: {
      id: 'legs',
      slot: 'legs',
      name: 'Muhafız Zırhlı Pantolonu',
      icon: '👖',
      baseAtk: 5,
      baseHp: 40,
      maxDurability: 13,
      cost: { fragments: 14, iron: qU(50), wood: qU(25), coal: qU(12), adAstra: 0.4 },
      desc: 'Hareket kabiliyeti sağlayan zırh plakalı pantolon (+5 Saldırı, +40 Can, 13/13 Dayanıklılık).'
    },
    boots: {
      id: 'boots',
      slot: 'boots',
      name: 'Seferci Savaş Çizmeleri',
      icon: '👢',
      baseAtk: 8,
      baseHp: 20,
      maxDurability: 13,
      cost: { fragments: 10, iron: qU(30), wood: qU(35), coal: qU(8), adAstra: 0.3 },
      desc: 'Hızlı manevra ve zırh desteği veren çelik burunlu çizmeler (+8 Saldırı, +20 Can, 13/13 Dayanıklılık).'
    }
  },

  // Asker Ekipman Küme (Set) Bonusları: Kuşanılan yuva sayısına göre ATK/HP çarpanı verir
  EQUIPMENT_SET_BONUSES: {
    2: { name: '⚔️ İkili Küme Bonusu', desc: '2 parça kuşanıldığında +%5 Saldırı & +%5 Can', atkMultiplier: 1.05, hpMultiplier: 1.05 },
    4: { name: '🛡️ Dörtlü Küme Bonusu', desc: '4 parça kuşanıldığında +%12 Saldırı & +%12 Can', atkMultiplier: 1.12, hpMultiplier: 1.12 },
    5: { name: '👑 Tam Takım Şampiyon Bonusu', desc: 'Tam 5 parça kuşanıldığında +%25 Saldırı & +%25 Can', atkMultiplier: 1.25, hpMultiplier: 1.25 }
  },

  // 18 Eşsiz Koleksiyon Eseri (6 Kat x 3 Seviyelik Zindanın Her Katından Bir Ganimet)
  COLLECTION_ARTIFACTS: [
    { id: 'artifact_01', name: 'Balçık Özü Kristali', icon: '🟢', dropLevel: 1, rarity: 'common', lore: 'Bataklık Balçığının çekirdeğinde donmuş, hafif nabız atan yeşil bir öz.' },
    { id: 'artifact_02', name: 'Goblin Reis Diş Kolyesi', icon: '🦷', dropLevel: 2, rarity: 'common', lore: 'Mağara Goblini reisinin ganimet kolyesinden kalma ürkütücü bir diş.' },
    { id: 'artifact_03', name: 'Gölge Kurdu Pençesi', icon: '🐾', dropLevel: 3, rarity: 'common', lore: 'Karanlıkta parıldayan, Gölge Kurdundan kopan keskin bir pençe.' },
    { id: 'artifact_04', name: 'Mahzen Anahtarı Kemiği', icon: '🦴', dropLevel: 4, rarity: 'common', lore: 'Kemik Mahzeni iskeletlerinin koruduğu unutulmuş bir lahit anahtarı.' },
    { id: 'artifact_05', name: "Büyücünün Kırık Asası", icon: '🪄', dropLevel: 5, rarity: 'common', lore: 'Lanetli Kemik Büyücüsünden kalan, hâlâ hafif titreşen kırık bir asa parçası.' },
    { id: 'artifact_06', name: 'Taht Muhafızı Mührü', icon: '🔱', dropLevel: 6, rarity: 'rare', lore: 'Kemik Taht Muhafızının zırhına kazınmış kadim bir mühür.' },
    { id: 'artifact_07', name: 'Tarikat Ritüel Maskesi', icon: '🎭', dropLevel: 7, rarity: 'rare', lore: 'Karanlık Tarikatçının ayinlerde taktığı, kehribar gözlü bir maske.' },
    { id: 'artifact_08', name: 'Cehennem Tazısı Zinciri', icon: '⛓️', dropLevel: 8, rarity: 'rare', lore: 'Hâlâ sıcak, Cehennem Tazısının boynundan kopan kor zincir halkası.' },
    { id: 'artifact_09', name: 'Golyat Kalp Taşı', icon: '🗿', dropLevel: 9, rarity: 'epic', lore: 'Kadim Taş Golyatın göğsünde nabız gibi atan devasa bir çekirdek taş.' },
    { id: 'artifact_10', name: 'Firavun Sargı Bezi Parçası', icon: '🧻', dropLevel: 10, rarity: 'rare', lore: 'Sargılı Mumyaların binlerce yıllık lanetli sargı bezinden bir parça.' },
    { id: 'artifact_11', name: 'Hayalet Feneri Alevi', icon: '🕯️', dropLevel: 11, rarity: 'rare', lore: 'Gölge Hayaletlerin peşinden sürüklediği, hiç sönmeyen mavi alev.' },
    { id: 'artifact_12', name: 'Lanetli Firavun Tacı', icon: '👑', dropLevel: 12, rarity: 'epic', lore: 'Lanetli Firavunun başından düşen, hâlâ kadim bir güçle titreyen altın taç.' },
    { id: 'artifact_13', name: 'İblis Boynuzu Külü', icon: '🔥', dropLevel: 13, rarity: 'epic', lore: 'Ateş İblislerinin boynuzlarından arta kalan, sıcaklığını hiç kaybetmeyen kül.' },
    { id: 'artifact_14', name: 'Erimiş Obsidyen Damlası', icon: '🌋', dropLevel: 14, rarity: 'epic', lore: 'Lav Elementallerinin özünden damlayan, katılaşmış obsidyen bir damla.' },
    { id: 'artifact_15', name: 'Berserker Kırık Baltası', icon: '🪓', dropLevel: 15, rarity: 'epic', lore: 'Obsidyen Berserkerin son darbesinde ikiye kırılan savaş baltasının ağzı.' },
    { id: 'artifact_16', name: 'Kıyamet Şövalyesi Kalkanı', icon: '🛡️', dropLevel: 16, rarity: 'epic', lore: 'Kıyamet Şövalyesinin asla kırılmayan kalkanından kopan bir parça.' },
    { id: 'artifact_17', name: "Gölge Lordu'nun Gözü", icon: '👁️', dropLevel: 17, rarity: 'legendary', lore: 'Kadim Gölge Lordunun düşmüşken bile karanlıkta parıldayan tek gözü.' },
    { id: 'artifact_18', name: 'Ejderha Kristali IGNIS', icon: '💎', dropLevel: 18, rarity: 'legendary', lore: 'Kıyamet Ejderhası IGNIS yenildiğinde küllerinden doğan efsanevi kristal.' }
  ],

  // Genesis NFT: Tüm 18 Koleksiyon Eserini Toplayınca Basılabilen Efsanevi Mühür
  // Kullanıcı kuralı (7 Ekim 2026): 18 eseri tamamlayan RoA Genesis NFT basar; Universe'de GEZEGEN SATIN ALMA HAKKI yalnız
  // Genesis sahiplerindedir (hak NFT ile taşınır; ilan pazarında el değiştirebilir). Hazırlık ilerlemesinin bir parçasıdır.
  GENESIS_NFT: {
    id: 'genesis_champion',
    name: 'RoA Genesis NFT',
    icon: '🏆',
    requiredArtifacts: 18,
    adAstraCost: 5,          // eski sabit bedel (yalnız eski kayıtlar ve ölçüm için; mühür bedeli artık GENESIS_YOLU.MUHUR)
    grants: ['universe_planet_purchase']
  },

  // Genesis Yolu (makro plan C6, kullanıcı onayı 15 Ekim 2026; docs/v2/MAKRO_EKONOMI_PLANI.md): uzun ve pahalı yol, karşılığı ayrıcalık.
  // Kullanıcı kuralı: Genesis basan, ekosisteme en az KATKI_YIL yıllık beklenen ayrıcalık maliyetini önden ödemiş olmalı
  // (net katkı = oyunda harcadığı ASTRA'nın harcandığı andaki dolar değeri + yakılan hammaddenin dolar değeri − oyundan çektiği).
  // Ayrıcalıkların beklenen yıllık maliyeti = 12 × (Uydu aylık × ödeyecek olma payı + Gözlemevi yıllık × indirim ÷ 12 × alacak olma payı)
  // = 12 × (10 × 0,5 + 600 × 0,5 ÷ 12 × 0,2) = 120 $ → 3 yıl = 360 $ (mühür bedeli dahil).
  GENESIS_YOLU: {
    SART: { HESAP_SEVIYESI: 30, HESAP_YASI_GUN: 180, KRALLIK_YOLU: true, FATIH: true, KATKI_KADEMESI: 'gold', KATKI_HAFTA: 4 },
    UYANDIRMA: {
      BIRIM: { common: 1, rare: 2, epic: 4, legendary: 8 },          // 18 eser: 5×1 + 5×2 + 6×4 + 2×8 = 55 birim
      BIRIM_ASTRA: 2000,                                              // × bedel çarpanı
      BIRIM_HAMMADDE: { stone: qU(2500), iron: qU(1250), coal: qU(1250), herb: qU(250) }, // yakılır (eski 500/250/250/50 x 25); en büyük (8 birim) silo 12'ye sığar
      SURE_SAAT: 72                                                   // aynı anda tek eser; 18 eser en az 54 gün
    },
    MUHUR: { USD: 250, YAKIM_PAYI: 0.5 },     // mühür anındaki ASTRA fiyatından; yarısı yakılır, yarısı her harcama gibi kasalara
    SEZON_TAVAN: 100,                         // Sezon 1'de en çok 100 numaralı Genesis
    ACIK_MUHUR_TRADE_PAYI: 0.10,              // açık mühür = trade aylık geliri × 0,10 ÷ sahip başı aylık ayrıcalık maliyeti (sunucu haftalık hesaplar)
    AYRICALIK: { UYDU_AY_USD: 10, UYDU_ODEYECEKTI: 0.5, GOZLEMEVI_YIL_USD: 600, GOZLEMEVI_INDIRIM: 0.5, GOZLEMEVI_ALACAKTI: 0.2 },   // VARSAYIM payları
    KATKI_YIL: 3,
    YEDEK_ASTRA_USD: 1.9e-7                   // fiyat bilinmezken (tek oyunculu mod, zincirsiz deneme sunucusu): 11 Ekim 2026 ölçümü
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ⚔️  SAVAŞ MOTORU v2 — SINIFLAR, ELEMENTLER, MEVZİ
  // ═══════════════════════════════════════════════════════════════════════
  // v1'de her asker `class: 'warrior'`, `baseAtk: 20` idi; savaş iki HP
  // yığınının toplamıydı ve "tüm askerleri gönder" baskın stratejiydi (F-19).
  // v2'de dört sınıfın dört ayrı rolü, gerçek bir tur sırası ve mevzi var.
  COMBAT: {
    ARMOR_CONSTANT: 120,        // zırh azaltması: 1 - zırh/(zırh+120), asla %100 olmaz
    BASE_CRIT_DAMAGE: 1.75,
    MAX_ROUNDS: 30,
    // Alan hasarı en fazla 4 hedef vurur. Sınırsız bırakılırsa "yarma" saldırısı
    // ordu büyüklüğüyle doğrusal ölçeklenir ve 18 kişilik kadro cezalandırılır.
    MAX_AOE_TARGETS: 4,
    FRONTLINE_COVER: 0.85,      // Ön saf ayaktayken %85 ön safa, %15 arka safa sızma koruması
    RAGE_AFTER_ROUND: 12,       // 12. turdan sonra düşman her tur güçlenir
    RAGE_PER_ROUND: 0.18
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 💀 ZİNDAN KOŞUSU — sonsuz farm yerine günlük hak + azalan getiri (F-01)
  // ═══════════════════════════════════════════════════════════════════════
  DUNGEON: {
    // v1.27 günlük giriş kuralları (Türkiye saatiyle gece yarısı yenilenir):
    //  • Her girişte stamina harcanır.
    //  • 1. giriş: eşyalar aşınmaz.
    //  • 2.–5. giriş: harçsız ödüllü giriş; her askerin rastgele bir eşyası aşınır.
    //  • 6. girişten itibaren: yalnız kapı harcı ödenerek girilir (ödüllü); harç ödenmezse giriş yoktur (antrenman girişi 18 Ekim 2026'da kaldırıldı).
    DAILY_RUNS: 5,                    // harçsız ödüllü giriş sayısı
    // Ödeme payı (günlük tavan ya da kasa bütçesi) dolduktan sonra harçlı giriş sürer ama ASTRA KAZANILMAZ (deneyim ve ganimet sürer): harç iki
    // katıdır ve günde en çok ZERO_REWARD_MAX_PER_DAY ek giriş yapılır (19 Ekim 2026). Harç kasalara girer, silahlar aşınır, stamina ve ot harcanır.
    ZERO_REWARD_FEE_MULT: 2,
    ZERO_REWARD_MAX_PER_DAY: 15,
    FIRST_ENTRY_NO_WEAR: true,        // günün ilk girişinde eşyalar aşınmaz
    // Eşya aşınma algoritması (18 Ekim 2026): savaşa giren HER askerin takılı eşyalarından, savaş başına ortalama
    //   E = TABAN + KAT_BASINA × (kat − 1) + MOD_BASINA × (zindan modu) + (büyük boss ise BOSS_EKI)   (en çok EN_FAZLA)
    // eşya 1'er dayanıklılık kaybeder (E'nin kesirli kısmı zarla: 2,4 = hep 2, %40 ihtimalle 3). Eşyalar rastgele seçilir, aynı
    // eşya aynı savaşta iki kez aşınmaz, sağlam parça varken kırık parça seçilmez. Kat = ceil(canavar seviyesi / 3).
    // Normal 1,0–2,0 · Zor 1,6–2,6 · Uzman 2,2–3,2 · Cehennem 2,8–3,8 (boss +0,5). Ölçüm: tek parçanın 1 dayanıklılık noktası, parça
    // Sv.5'te ~1,5, Sv.10'da ~5 ASTRA değerindedir; ödül çarpanı da modla birlikte ×1,5 / ×2,25 / ×3,5 artar, bu yüzden artış ölçülüdür.
    ASINMA: { TABAN: 1, KAT_BASINA: 0.2, MOD_BASINA: 0.6, BOSS_EKI: 0.5, EN_FAZLA: 5 },
    // Harç, o katın temel ASTRA ödülünün bu oranı kadardır ve %100'ü zindan kasasına gider.
    GATE_FEE_RATE: 0.20,
    // Zindan kasası bir günde en fazla bakiyesinin bu oranı kadar ASTRA öder → kasa matematiksel olarak boşalamaz.
    // v2 (R3): haftada %2,5 → günde ~%0,36
    DAILY_BUDGET_RATE: 0.0036,
    // Zafer ödülü (gameState.getDungeonBaseReward): seviye × taban; Lv.9 ve Lv.18 bosslarında × çarpan.
    // Canavar bilgileri (can, saldırı, asker XP'si) js/bestiary.js'te. (v2 ölçekli)
    REWARD_ADA_PER_LEVEL: 0.9,
    REWARD_XP_PER_LEVEL: 200,
    MAJOR_BOSS_REWARD_MULT: 3,
    // 13 Ekim 2026 denetimi EK-05: günlük KİŞİ tavanı. Eskiden temiz kat tekrarı tam ödüllüydü ve günde 40 giriş yapılabiliyordu
    // (10 askerlik cerrahi sömürücü 7 günde +3.314 ASTRA zindandan, +5.700 toplam; ordusunu 3-4 haftada geri alıyordu). Tavan,
    // orduya harcananla orantılıdır: günlük en çok  harcanan × RETURN_SHARE ÷ PAYBACK_DAYS  ASTRA.
    //   RETURN_SHARE 0,70 = 30 Eylül kararı ("normal ödüller harcamanın %70'i, kalan %30 Fatih Ödülü");
    //   PAYBACK_DAYS 93  = 30 Eylül kararı (ordu bedelinin yol boyu geri dönüşü ~90-100 gün).
    // Taban: DAILY_RUNS ödüllü girişin, ulaşılmış en değerli katta değeri (acemi oyuncunun harçsız girişleri hep tam ödenir).
    // Alternatif (seçilmedi): her tekrarda sabit azalan ödül (REPEAT_MULTIPLIER) — 18. kata gelmiş tam orduyu da aynı oranda
    // cezalandırıyordu; harca bağlı tavan yatırımı ödüllendirip yalnız ucuz-ordu sömürüsünü kesiyor.
    RETURN_SHARE: 0.70,
    PAYBACK_DAYS: 93
  },

  // ═════════════════════════════════════════════════════════════════
  // 🗺️ ZİNDAN MODLARI (kullanıcı kararı 18 Ekim 2026; Diablo'daki zorluk modları gibi)
  // ═════════════════════════════════════════════════════════════════
  // Normal modda 6 katın hepsi ve son boss (Sv.18) bitince oyuncu bir üst moda geçer: zindan baştan başlar (ilerleme 1), canavarlar çok daha
  // güçlüdür (js/bestiary.js MOD_CANAVARLARI, scripts/model/zindan_mod.mjs'ten), ASTRA ödülü ve eşya/parça düşme şansı çarpanla artar, asker
  // hakkı 6 kat büyür (js/economy/ordu-hakki.js: Zor 8-13, Uzman 14-19, Cehennem 20-25). Hak ve geçilen modlar KALICIDIR.
  //   odulCarpani : zindan ASTRA ödülü (kasa bütçesi ve günlük kişi tavanı değişmeden uygulanır: çarpan yalnız tavana kadar etkilidir)
  //   dusmeCarpani: parça, kutu, eser ve parşömen düşme şansı (üst sınırlar korunur)
  //   XP ÇARPANI YOK: hesap seviyesi (ve asker seviye sınırı) oyunun tempo eğrisine bağlıdır (HEDEF_GUN); XP artarsa takvim bozulur.
  //   gecis       : bir üst moda geçiş bedeli. hammadde KATKI ile ödenir (günlerce biriktirilir; silo sınırına takılmaz, yakılır),
  //                 ASTRA son adımda (fiyat çarpanıyla ölçeklenir, oyunun harcama bölüşümüne girer). Tek mod geçişi ~5-19 günlük üretimdir.
  // Sayılar ilk tahmindir: canlıda Denge İzleme ekranına göre ayarlanır.
  ZINDAN_MODLARI: [
    { id: 'normal', ad: 'Normal', simge: '🟢', odulCarpani: 1, dusmeCarpani: 1, gecis: null },
    { id: 'zor', ad: 'Zor', simge: '🟠', odulCarpani: 1.5, dusmeCarpani: 1.25, gecis: { hammadde: { wood: q(40000), iron: q(28000), coal: q(30000), stone: q(40000) }, astra: 1200 } },
    { id: 'uzman', ad: 'Uzman', simge: '🔴', odulCarpani: 2.25, dusmeCarpani: 1.5, gecis: { hammadde: { wood: q(80000), iron: q(56000), coal: q(60000), stone: q(80000), wheat: q(60000) }, astra: 5000 } },
    { id: 'cehennem', ad: 'Cehennem', simge: '⚫', odulCarpani: 3.5, dusmeCarpani: 2, gecis: { hammadde: { wood: q(150000), iron: q(105000), coal: q(110000), stone: q(150000), wheat: q(120000), herb: q(15000) }, astra: 15000 } }
  ],

  // Denge İzleme (yönetici paneli, server/denge-rapor.js) için: modelin (scripts/model/zindan_{tempo,ayarla,mod}.mjs) her canavar için hedefi =
  // "en hızlı oyuncunun o canavarı en erken yenebileceği HESAP GÜNÜ" (alt sınır). Gerçek ilk temizleme günü bunun 1,5-3 katı beklenir;
  // medyan hedefin ALTINA düşerse model yanlış demektir. Mod → { canavar seviyesi: gün }.
  ZINDAN_HEDEF_GUN: {
    0: { 1: 0, 2: 1, 3: 2.5, 4: 5, 5: 7, 6: 10, 7: 14, 8: 20, 9: 30, 10: 42, 11: 52, 12: 62, 13: 75, 14: 86, 15: 98, 16: 108, 17: 114, 18: 120 },
    1: { 1: 140, 2: 141.3, 3: 143.3, 4: 146.7, 5: 149.3, 6: 153.3, 7: 158.7, 8: 166.7, 9: 180, 10: 196, 11: 209.3, 12: 222.7, 13: 240, 14: 254.7, 15: 270.7, 16: 284, 17: 292, 18: 300 },
    2: { 1: 320, 2: 321.5, 3: 323.8, 4: 327.5, 5: 330.5, 6: 335, 7: 341, 8: 350, 9: 365, 10: 383, 11: 398, 12: 413, 13: 432.5, 14: 449, 15: 467, 16: 482, 17: 491, 18: 500 },
    3: { 1: 530, 2: 532.3, 3: 535.6, 4: 541.3, 5: 545.8, 6: 552.5, 7: 561.5, 8: 575, 9: 597.5, 10: 624.5, 11: 647, 12: 669.5, 13: 698.8, 14: 723.5, 15: 750.5, 16: 773, 17: 786.5, 18: 800 }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 🏟️ KOLEZYUM — giriş ücreti ASTRA, ELO eşleşmesi, beş lig (F-02 / F-20)
  // ═══════════════════════════════════════════════════════════════════════
  COLOSSEUM: {
    // Giriş ücreti ASTRA (18 Ekim 2026): anahtar artık giriş için değil, yalnız kilitli Pandora kutusunu açmak için kullanılır; haftalık
    // sıralamada 1. olan ayrıca 1 anahtar kazanır (server/arena.js settleWeek). Eskiden her maç 1 anahtar (pazarda ~10 ASTRA) harcatıyor ve
    // her zaferde %25 anahtar veriyordu. Ücretin ENTRY_ARENA_SHARE'i doğrudan arena kasasına girer (ödüller buradan çıkar), kalanı her harcama
    // gibi dağıtılır (yakım, yapımcı payı, temel gelir, öteki kasalar). Ücret oyun içi fiyat çarpanıyla ölçeklenir.
    // Haftalık Anahtar ödülü (18 Ekim 2026): sıralamada ilk 3'e birer Anahtar (sırayla 1., 2., 3.). Anahtar yalnız buradan çıkar; çarktan ve
    // pazar havuzundan kalktı. Oyuncular birbirine yalnız İlan Pazarı'nda, adet + birim fiyatla satar (server/pazar.js). Anahtar havadan basılır:
    // karşılığı bir kasa harcaması yok; değeri oyuncuların ilan fiyatıdır.
    HAFTALIK_ANAHTAR: [1, 1, 1],
    ENTRY_FEE_ASTRA: 10,
    ENTRY_ARENA_SHARE: 0.6,   // 19 Ekim 2026: %70'ten %60'a (kalan %40 ortak dağılıma gider: bkz. TREASURY_OVERFLOW açıklaması)
    ENTRY_STAMINA_COST: 12,
    DAILY_MATCH_CAP: 10,
    STARTING_RATING: 1000,
    K_FACTOR: 32,
    // Hazır rakibe karşı zafer ödülü: taban WIN_REWARD_ASTRA (lig çarpanıyla), kasanın WIN_REWARD_POOL_SHARE'ini aşmaz.
    // Karar 12 Ekim 2026: eski 2.500 ASTRA ×0,01 ölçeği uygulanmadan kalmıştı (kasa tohumunda maç başı ~800 ASTRA; bir oyuncu
    // günde 10 maçla haftalık ödeme bütçesinin büyük kısmını tek başına çekebiliyordu); diğer ödüller 10-50 ASTRA düzeyinde.
    WIN_REWARD_ASTRA: 25,
    WIN_REWARD_POOL_SHARE: 0.0002,
    // 13 Ekim 2026 denetimi EK-06: günlük kişi tavanı = 5 galibiyet × taban ödül (125 ASTRA; haftada 875 ≈ 100 vatandaşta arena
    // bütçesinin kişi başı eşit payı 800). Eskiden rakip puanı 0-150 çıkıyordu: oyuncu 1000'de kaldığı için puan hiç yükselmiyor,
    // lig çarpanları (1,1-2,0) hiç devreye girmiyordu. Rakip puanı artık oyuncunun puanı ±100.
    RATING_SPREAD: 100,
    DAILY_REWARD_CAP_ASTRA: 125,
    // Ligler (gameState.getColosseumTier), yüksekten düşüğe. rewardMult: maç ödülü çarpanı.
    // Lig yalnız maç ödülünü çarpar. Eskiden her ligin `weeklyAda` / `weeklyKeys` alanı vardı ("haftalık lig ödülü") ama hiçbir
    // kod onları okumuyordu; 14 Ekim 2026 ikinci tur denetiminde KALDIRILDI: haftalık ödül kararı (30 Eylül 2026) "haftalık
    // sıralama, ilk 10'a ödül (arena kasası)" idi ve server/arena.js settleWeek bunu dağıtıyor; lige göre ayrıca haftalık maaş
    // kimse yokken bile (1.000 puanla Bronz) hesap başına ASTRA + anahtar demek olurdu (sahte hesap başına bedava gelir).
    LEAGUES: [
      { id: 'champion', name: '👑 Efsanevi Şampiyon', color: '#f59e0b', rewardMult: 2.0, minRating: 1800 },
      { id: 'diamond',  name: '💎 Elmas Gladyatör',   color: '#38bdf8', rewardMult: 1.6, minRating: 1500 },
      { id: 'gold',     name: '🥇 Altın Gladyatör',   color: '#eab308', rewardMult: 1.3, minRating: 1300 },
      { id: 'silver',   name: '🥈 Gümüş Gladyatör',   color: '#94a3b8', rewardMult: 1.1, minRating: 1150 },
      { id: 'bronze',   name: '🥉 Bronz Gladyatör',   color: '#b45309', rewardMult: 1.0, minRating: 0 }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 🌋 WORLD BOSS — gerçek zamanlayıcı, fazlar, gerçek stake kilidi (F-03/F-21)
  // ═══════════════════════════════════════════════════════════════════════
  WORLD_BOSS: {
    BATTLE_DAY_UTC: 0,          // 0 = Pazar
    BATTLE_HOUR_UTC: 15,        // 15:00 UTC = 18:00 TSİ
    BASE_HP: 1000000,
    EARLY_UNSTAKE_PENALTY: 0.18, // erken çekilme cezası (tahmini kazancın oranı); Savunma Duvarı projesi bitince 6 puan düşer (js/gameState/dunyaBossu.js)
    WEEKLY_DISTRIBUTION_RATE: 0.03, // v2 (R3): haftalık etkinlikte kasanın %3'ü dağıtılır (eskiden %10, en hızlı boşalan kasaydı)
    // Skill Çeşitliliği Katkısı: ilk rolden sonraki her farklı rol (Tank, AoE, Şifa, Kırıcı, Kontrol) için hasar bonusu
    SKILL_DIVERSITY_BONUS_PER_ROLE: 0.06,
    MAX_SKILL_DIVERSITY_BONUS: 0.50
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 🏦 HAZİNE DEFTERİ — YASA 1: ödül basılmaz, transfer edilir (F-05)
  // ═══════════════════════════════════════════════════════════════════════
  // %5 Yakım, %6 UBI, %3 Team Payı; kalan %86'lık hazine girişinin 6 kasaya dağılımı (hazine payının yüzdesi):
  // Zindan %30, Kolezyum %15, World Boss %15, Pazar geri alımı %15, Görev & ücretsiz oyuncu %21, Karnaval %4
  // Zindan kapı harcının doğrudan zindan kasasına giden kısmı (kalanı her harcama gibi dağıtılır). Oranlar: RealmRates sözleşmesi
  // 19 Ekim 2026: %100'den %60'a. Kalan %40 her harcama gibi dağıtılır: oyunun her yeri birbirini besler (akış modeli: scripts/ekonomi/akis-modeli.mjs).
  DUNGEON_GATE_POOL_SHARE: 0.6,
  // v2 (R3): hazine payının 8 kasaya bölünüşü (toplam %100; RealmRates sözleşmesindeki 8 kasa payıyla aynı):
  // zindan 27, kolezyum 14, boss 12, geri alım 15, görev 18, karnaval 4, Fatih 5, Konsey 5
  // 19 Ekim 2026 (kullanıcı onayı, akış modeli): ağırlıklar kasaların haftalık ÖDEME KAPASİTESİNE göre yeniden ayarlandı (eskiden
  // zindan 27 / kolezyum 14 / boss 12 / geri alım 15 / görev 18 / karnaval 4: boss ve geri alım kronik aç, zindan ve kolezyum şişiyordu).
  // Şimdi zindan 21, kolezyum 9, boss 17, geri alım 21, görev 13, karnaval 9, Fatih 5, Konsey 5. RealmRates sözleşmesi kurulurken aynı
  // başlangıç oranları verilmeli (js/economy/rates.js DEFAULT_RATES); sözleşme kuruluysa oranlar oradan okunur.
  // 19 Ekim 2026 (UOA tohumu): Sirius Konseyi kasası KALDIRILDI (hiçbir ödeme çıkarmıyordu); payı "UOA tohumu"na verildi: harcamanın %4'ü
  // (hazine payının 465/10000'i × %86 = %4,0) ikinci oyun UOA için biriktirilir. Kalan 7 kasa payı bu yüzden %0,3 büyüdü (toplam 10000 baz puan):
  // zindan 21,05 / kolezyum 9,05 / boss 17,05 / geri alım 21,10 / görev 13,05 / karnaval 9,05 / Fatih 5,00 / UOA tohumu 4,65.
  TREASURY_ALLOCATION: { dungeon: 0.2105, arena: 0.0905, worldBoss: 0.1705, ammBuyback: 0.2110, quest: 0.1305, carnival: 0.0905, fatih: 0.05, uoaTohum: 0.0465 },
  // Doğrudan paylı harcamalarda (zindan kapı harcı, çark, kolezyum) UOA tohumu payı: harcamanın bu oranı ÖNCE kesilir; böylece "tüm harcamaların %4'ü"
  // UOA tohumuna gider (ortak dağılımdan geçen kısım zaten TREASURY_ALLOCATION.uoaTohum ile %4 verir). treasury.depositDirect kullanır.
  UOA_TOHUM_ORANI: 0.04,
  // Taşma kuralı (19 Ekim 2026, js/treasury.js): bir kasa başlangıç bakiyesinin HEALTH_MAX katını geçecekse, fazla giriş açığı en büyük
  // kasalara (açıkla orantılı) akar. Toplam ASTRA değişmez; amaç hiçbir kasanın şişip diğerlerinin aç kalmaması.
  TREASURY_OVERFLOW: { HEALTH_MAX: 1.25, POOLS: ['dungeon', 'arena', 'worldBoss', 'ammBuyback', 'quest', 'carnival'] },
  TREASURY_POOL_NAMES: {
    dungeon: 'Zindan Ganimet Kasası',
    ammBuyback: 'Pazar Geri Alım Kasası',
    worldBoss: 'Dünya Bossu Ödül Havuzu',
    arena: 'Kolezyum Şampiyonluk Havuzu',
    carnival: 'Karnaval Ödül Havuzu',
    quest: 'Görev & Ücretsiz Oyuncu Kasası',
    fatih: 'Fatih Kasası (18. boss)',
    uoaTohum: 'UOA Tohumu (kilitli)'
  },
  // v2 (R3): tohumlar 200 M ASTRA'dan (pazar ayrı: AMM_SEED_ASTRA). 18 Ekim 2026: parça havuzu 4 M'den 180 bin ASTRA'ya küçüldü (çıkan 3,82 M) ve
  // Pandora kutusu ile Anahtar havuzları (2 M + 2 M) kaldırıldı; çıkan toplam 7,82 M ASTRA yarı yarıya geri alım ve karnaval kasalarına eklendi
  // (ammBuyback 7 M → 10,91 M, carnival 3 M → 6,91 M); toplam 200 M değişmez.
  // 19 Ekim 2026: Konsey kasası (10 M) yedi kasaya EŞİT (1.428.571'er, kalan zindana) ve Universe rezervi (20 M) altı ödeme kasasına ödeme kapasitesiyle
  // orantılı dağıtıldı (zindan 4,604 / kolezyum 1,939 / boss 3,780 / geri alım 4,760 / görev 2,908 / karnaval 2,009 M); UOA tohumu 0'dan başlar ve
  // harcamanın %4'üyle dolar. Toplam kasa tohumu 103,82 M aynı (200 M toplam değişmez). Canlı dünya geçiş 014 ile aynı dağıtımı yapar.
  TREASURY_SEED: { dungeon: 18699241, arena: 10034238, worldBoss: 13875237, ammBuyback: 17098571, quest: 12336571, carnival: 10347571, fatih: 21428571, uoaTohum: 0 },
  // Hedef rezerv = ~12 aylık ödeme (annualPayout, yukarıda); sağlık = bakiye / hedef. Haftalık oranla sürekli ödeme
  // yapan 5 kasa (dungeon/arena/worldBoss/ammBuyback/quest) formülle hesaplanır; sürekli haftalık oranı olmayan
  // (karnaval: çevirme başına kendini finanse eder; fatih: yalnız 18. boss ilk zaferinde; konsey/universe: kilitli/
  // proje bazlı) kasalarda hedef = tohum (değişmedi).
  TREASURY_TARGET_RESERVE: {
    dungeon: annualPayout(18699241, 0.025), ammBuyback: annualPayout(17098571, 0.03), worldBoss: annualPayout(13875237, 0.03),
    arena: annualPayout(10034238, 0.02), quest: annualPayout(12336571, 0.015),
    carnival: 10347571, fatih: 21428571, uoaTohum: 0
  },
  // Haftalık ödeme oranları (R3): kasaların 12 ay dayanması için %2-3. Her alanın gerçek kullanım yeri:
  //  • dungeon: bilgi amaçlı (gerçek tavan DUNGEON.DAILY_BUDGET_RATE × 7, aynı sayı: 0,0036×7≈0,025)
  //  • arena: js/economy/pvp.js PVP_RULES.weeklyPoolShare BURADAN okur (E-planı S1/S4 düzeltmesi)
  //  • worldBoss: bilgi amaçlı (gerçek tavan WORLD_BOSS.WEEKLY_DISTRIBUTION_RATE, aynı sayı)
  //  • quest: ücretsiz oyuncu havuzunun gerçek tavanı FREE_PLAYER_POOL.WEEKLY_POOL_CAP'tir (aynı sayı, 0,015);
  //    karnavalın (çark/piyango) burada satırı yok çünkü haftalık toplu ödeme değil, çevirme başına kendi
  //    kendini finanse eder (R3 §Çark) — buraya tahmini bir sayı eklemek yanıltıcı olurdu.
  TREASURY_WEEKLY_PAYOUT: { dungeon: 0.025, arena: 0.02, worldBoss: 0.03, quest: 0.015 },
  // Kilitli kasalar: hiçbir ödül çekemez (universe yalnız Universe açılışında, fatih yalnız 18. boss)
  // KARAR 7 (E-planı, 8 Ekim 2026): girişe bağlı haftalık ödeme bütçesi. Oyuncu hareketiyle yapılan ödemeler bir hafta içinde
  // en çok şu kadar olabilir: kasa × oran × sağlık çarpanı (bakiye/hedef rezerv, en az HEALTH_MIN, en çok 1) + son INFLOW_WEEKS
  // haftanın ortalama haftalık girişinin INFLOW_SHARE'i. Hesaplaşma anındaki ödemeler (ücretsiz havuz, PvP sıralaması) kendi
  // kurallarıyla sınırlıdır ve bu bütçeye girmez. Bütçe yalnız sunucuda açılır (treasury.openWeekBudgets); tarayıcı tek oyunculuda yok.
  // PERSON_CAP_MULT (13 Ekim 2026 denetimi EK-05): kişi başı haftalık pay tavanı = bütçe × PERSON_CAP_MULT ÷ aktif vatandaş.
  // Bütçe "ilk gelen alır" idi: hızlı oyuncu haftanın payını ilk günlerde çekip geç gelenleri 0'da bırakabiliyordu. 3 = eşit payın
  // 3 katına kadar; dürüst yoğun oyuncuyu sıkmaz, tek kişinin bütçeyi süpürmesini keser. Zindan ve kolezyum ödülleri bunu uygular.
  // PERSON_CAP_MIN_ACTIVE (14 Ekim 2026 ikinci tur): paydadaki aktif sayısının tabanı. Sunucu ilk açılışta (aktif sayısı henüz
  // yok) ve az oyuncuyla payda 0-3 çıkıyordu: tavan ya hiç uygulanmıyordu (Infinity) ya da 3 × bütçe ÷ 1 ile bütçenin kendisini
  // aşıyordu (hiç tavan yok). Taban 10: tek kişi bütçenin en çok 3/10'unu (%30) alabilir, bütçeyi bitirmek için en az 4 kişi gerekir;
  // artmayan kısım kasada kalır (kayıp yok). Aktif sayı 10'u geçince formül eskisi gibidir (bütçe × 3 ÷ aktif).
  TREASURY_WEEKLY_BUDGET: { RATES: { dungeon: 0.025, arena: 0.02, worldBoss: 0.03, quest: 0.025, carnival: 0.02 }, INFLOW_SHARE: 0.9, INFLOW_WEEKS: 4, HEALTH_MIN: 0.15, PERSON_CAP_MULT: 3, PERSON_CAP_MIN_ACTIVE: 10, FULL_MESSAGE: 'Bu haftaki ödeme payı doldu; Pazartesi yenilenir.' },
  // Kasa ömrü (fiyat çarpanı kasa-ömrü düzeltmesi, server/world/haftalik.js): yalnız OYUNCUYA ödeme yapan kasalar sayılır.
  // uoaTohum (UOA açılışına kadar kilitli), fatih (tek bir olaya bağlı), ammBuyback (alıp yakar,
  // vatandaşa ödenmez) sayılmaz: eskiden toplam 88 M sayılıyor, aylık ücretsiz havuza göre ~170 ay çıkıp çarpan sürekli ×0,8'e iniyordu.
  TREASURY_RUNWAY_POOLS: ['dungeon', 'arena', 'worldBoss', 'quest', 'carnival'],
  // Sponsorluk (docs/v2/SPONSORLUK_TASARIMI.md): B, A'ya ASTRA bağışlar; A bunu çekemez, yalnız oyunda harcar; A her haftalık net çekiminin
  // SHARE oranını (tüm sponsorlara toplam, anapara oranında bölünür) sponsorlara öder; sözleşme DAYS gün ya da toplam getiri anaparanın RETURN_CAP katına ulaşana dek.
  SPONSORLUK: { MIN_AMOUNT: 1000, SHARE: 0.30, DAYS: 365, RETURN_CAP: 2, MAX_PER_TARGET: 5, MAX_PER_SPONSOR: 20 },
  TREASURY_LOCKED_POOLS: ['uoaTohum'],   // UOA açılana kadar hiçbir ödeme çıkmaz
  // Ücretsiz oyuncu havuzu (sunucu aşaması): görev kasasından ayda piyasa değerinin %1'i, kişi başı en fazla 100$
  // Ücretsiz oyuncu payı (sahte hesaplara karşı, 4 Ekim 2026 — ayrıntı js/economy/faucet.js): en az MIN_LEVEL seviye ve o hafta
  // en az MIN_WEEKLY_CONTRIBUTION katkı puanı (× fiyat çarpanı); pay = katkı^WEIGHT_EXP × sadakat serisi (haftada +STREAK_STEP,
  // en çok STREAK_MAX; kaçırılan hafta seriyi yarıya indirir); kişi başı tavan da ağırlıkla ölçeklenir (tam tavan için
  // FULL_CONTRIBUTION katkı + en yüksek seri); pay tamamen kilitli gelir.
  // v2: katkı eşikleri ölçekli (×0,01); haftada kasanın en çok %1,5'i (R3)
  // 13 Ekim 2026 denetimi EK-03: WEIGHT_CAP_CONTRIBUTION = ağırlığa girecek katkının tavanı (FULL_CONTRIBUTION'ın 10 katı).
  // Gerekçe: katkı^1,5 sınırsızdı; tek hesap c=500 ile havuzun %28,8'ini alıyordu (dürüst kişi başı 1.975 → 1.423). Tavan 100
  // ile aynı senaryoda %3,5 (dürüst kişi başı 1.930); üs 1,5 KORUNDU çünkü düşürmek yan hesabı kolaylaştırıyordu (40 hesap × c10:
  // üs 1,5 → %4,4, üs 1,25 → %6,4, üs 1 → %9,3). Alternatif (seçilmedi): tavan = FULL_CONTRIBUTION (10) — herkes eşit ağırlık
  // alır, yan hesap için katkı eşiği 10'a iner (40 hesap × c10 → %33,9). Ölçüm: tests/test_denetim_2026_10_ekonomi.mjs.
  FREE_PLAYER_POOL: { MAX_USD_PER_PLAYER: 100, MIN_LEVEL: 3, MIN_WEEKLY_CONTRIBUTION: 1, FULL_CONTRIBUTION: 10, WEIGHT_CAP_CONTRIBUTION: 100, WEIGHT_EXP: 1.5, STREAK_STEP: 0.1, STREAK_MAX: 2.0, LOCKED: true, WEEKLY_POOL_CAP: 0.015 },
  TREASURY_MIN_PAYOUT_RATIO: 0.15,   // havuz boşalsa bile ödül tamamen sıfırlanmaz
  TREASURY_SINGLE_DRAW_CAP: 0.02,    // tek ödül havuzun en fazla %2'sini çekebilir

  // ═══════════════════════════════════════════════════════════════════════
  // 🎪 KRALLIK KARNAVALI: ŞANS ÇARKI & HAFTALIK PİYANGO
  // ═══════════════════════════════════════════════════════════════════════
  CARNIVAL: {
    WHEEL_COST_ADA: 1, // 1 ASTRA veya dengi hammadde veya 1 Piyango Bileti (v2 ölçekli)
    // Karnaval kasasında en az bu kadar ASTRA yoksa çark geçici olarak kapanır (ödüller asla yoktan ödenmez)
    WHEEL_MIN_CARNIVAL_BALANCE: 200,
    // Kullanıcı kararı (18 Ekim 2026): ASTRA ile çevrilen çarkın bedelinin %85'i DOĞRUDAN Karnaval kasasına girer (ödüller bu
    // kasadan ödenir; kasa uzun vadede büyür ve oyunun ömrünü uzatır). Kalan %15 her harcama gibi dağıtılır (yakım, yapımcı
    // payı, temel gelir, hazine kasaları). 4 Ekim'de %80'di; eskiden yalnız %3,4'ü giriyordu.
    // 19 Ekim 2026: %85'ten %80'e. Çark ödemesi haftalık orana değil ÇEVİRME BAŞINA ödenir (ödül tablosunun beklenen değeri ~0,72 ASTRA / çevirme);
    // doğrudan pay bunun üstünde en az 0,07 pay bırakmalı yoksa kasa her çevirmede erir (tests/test_cark_dilimleri.mjs bunu denetler: %60 denendi, çevirme başına -0,116 çıktı).
    // Kalan %20 yakım, yapımcı payı, temel gelir ve bütün kasalara dağılır (akış modeli: scripts/ekonomi/akis-modeli.mjs).
    WHEEL_CARNIVAL_SHARE: 0.8,
    // Hammadde oyunda bedava toplandığı için hammaddeyle çevirme günde en çok bu kadar (kasa bu yoldan erimesin)
    WHEEL_RESOURCE_DAILY_LIMIT: 3,
    // Çarpanlı çevirme (zaman kazanmak isteyenler için): bedel ve ödeme aynı oranda artar; yalnız ASTRA ile çevrilir.
    // Beklenen dönüş çarpandan bağımsızdır: x10, 10 kez x1 çevirmekle aynı şansı verir (anahtar ve bot dahil).
    WHEEL_MULTIPLIERS: [1, 2, 10],
    // Şans Sayacı (kötü talih koruması): art arda STREAK çevirmede bedelini (>= 1 ASTRA değeri ya da piyango bileti) geri almayan
    // oyuncunun sonraki çevirmesi, dilimlerdeki 'pity' dilimi (garanti nakit) olur. Sayaç çarpandan bağımsız çevirme başına işler;
    // garanti ödülün tutarı çarpanla büyür. Maliyeti ödeme oranının içindedir (tests/test_cark_dilimleri.mjs bu sınırı korur).
    WHEEL_PITY: { STREAK: 8 },
    // 19 dilim (18 Ekim 2026 yeniden kurulumu; ağırlıklar toplamı 10.000, 'pity' dilimi 0: yalnız sayaç doldurur). Ortalama ASTRA
    // dönüşü ~%73-75 (bilet parçası/bilet bedava çevirme olarak hesaba katılır), kasa çevirme başına ~+0,10 ASTRA kazanır.
    // Ödülün hiçbiri havadan çıkmaz: hammadde, parça, anahtar ve stamina için kasa pazardan gerçek fiyatla alır (stamina dilimi
    // buğdayı pazardan alıp yakar, yani oyuncunun buğdayla doldurması gibi; pazarda alınamazsa ASTRA karşılığı ödenir).
    // Şifa, sefer tamamlama, zindan girişi gibi oyunun harcama kalemlerini (şifalı ot, buğday, zaman) ucuzlatan ödüller bilerek yok.
    // Kurallar korunur: bot < %1, teçhizat parçası < %1, anahtar < %0,1, parşömen yok.
    WHEEL_REWARDS: [
      { id: 'ada_5000',      name: '💎 50 ASTRA BÜYÜK İKRAMİYE',       icon: '💎', type: 'ada',      amount: 50,                     valAda: 50,   weight: 3 },
      { id: 'lottery_ticket', name: '🎟️ Piyango Bileti (1 çark hakkı)', icon: '🎟️', type: 'lottery_ticket', amount: 1,              valAda: 0,    weight: 403 },
      { id: 'raw_100_stone', name: 'Bedelin Geri: 1 ASTRA Değerinde Taş',       icon: '🪨', type: 'amm_raw', key: 'stone', adaVal: 1, valAda: 1, weight: 515 },
      { id: 'ada_200',       name: '2 ASTRA Nakit Ödül (2×)',         icon: '🟣', type: 'ada',      amount: 2,                      valAda: 2,    weight: 230 },
      { id: 'stamina_1',     name: '⚡ 1 ASTRA Değerinde Stamina',     icon: '⚡', type: 'stamina_buy', adaVal: 1,                   valAda: 1,    weight: 1052 },
      // Hammadde ödülleri (pazardan alınır, yani hammaddeye talep yaratır): sık gelen "bedelin geri" dilimleri (1 ASTRA) taş, kömür
      // ve şifalı otun; nadir 10 ASTRA'lık büyük dilimler odun, demir ve buğdayın.
      { id: 'raw_1000_wood', name: '10 ASTRA Değerinde Odun',         icon: '🌲', type: 'amm_raw',  key: 'wood',      adaVal: 10,   valAda: 10,   weight: 16 },
      { id: 'ada_50',        name: '0,5 ASTRA Teselli Ödülü',         icon: '🟣', type: 'ada',      amount: 0.5,                    valAda: 0.5,  weight: 1254 },
      { id: 'frag_10',       name: '10 Teçhizat Parçası',             icon: '🧩', type: 'resource', key: 'fragments', amount: 10,   valAda: 4.5,  weight: 27 },
      { id: 'raw_100_coal',  name: 'Bedelin Geri: 1 ASTRA Değerinde Kömür',     icon: '⚫', type: 'amm_raw', key: 'coal',  adaVal: 1, valAda: 1, weight: 515 },
      { id: 'ada_1000',      name: '👑 10 ASTRA İKRAMİYE (10×)',       icon: '👑', type: 'ada',      amount: 10,                     valAda: 10,   weight: 76 },
      { id: 'wheel_ticket_shard', name: 'Amorti Çark Bileti (3 Adet = 1 Çevirme)', icon: '🎟️', type: 'ticket_shard', amount: 1,  valAda: 0.333, weight: 5311 },
      { id: 'raw_1000_iron', name: '10 ASTRA Değerinde Demir',        icon: '⛏️', type: 'amm_raw',  key: 'iron',      adaVal: 10,   valAda: 10,   weight: 16 },
      { id: 'ada_500',       name: '5 ASTRA Nakit Ödül (5×)',         icon: '🟣', type: 'ada',      amount: 5,                      valAda: 5,    weight: 41 },
      { id: 'raw_100_herb',  name: 'Bedelin Geri: 1 ASTRA Değerinde Şifalı Ot', icon: '🌿', type: 'amm_raw', key: 'herb',  adaVal: 1, valAda: 1, weight: 515 },
      { id: 'ada_2500',      name: '25 ASTRA Nakit Ödül (25×)',       icon: '🟣', type: 'ada',      amount: 25,                     valAda: 25,   weight: 8 },
      { id: 'raw_1000_wheat',name: '10 ASTRA Değerinde Buğday',       icon: '🌾', type: 'amm_raw',  key: 'wheat',     adaVal: 10,   valAda: 10,   weight: 16 },
      { id: 'free_bot_24h',  name: '🏆 24 Saatlik Otomasyon Botu (Nadir İkramiye)', icon: '🤖', type: 'bot_free', hours: 24,       valAda: 460,  weight: 2 },
      // Şans Sayacı ödülü: ağırlığı 0, yalnız sayaç dolunca verilir
      { id: 'sans_sayaci',   name: '🍀 Şans Sayacı: 3 ASTRA Garanti', icon: '🍀', type: 'ada',      amount: 3,                      valAda: 3,    weight: 0, pity: true }
    ],
    // Haftalık Piyango Sistemi
    LOTTERY: {
      TICKET_COST_ADA: 1,          // v2 ölçekli
      SEED_POOL_ADA: 4000000,      // 19 Ekim 2026: 4 M ASTRA (R3'te 12 M, eskiden 20 M). Günlük 100 bilet sınırıyla bile 20 yılda bitmiyordu; fazlası zindan, Kolezyum ve dünya bossu kasalarına verildi (geçiş 011)
      // Balina koruması: bir hesap bir günde (Türkiye saatiyle gece yarısı yenilenir) en fazla bu kadar bilet satın alabilir.
      // Kazanmayan biletler yanmaz; sayı sınırı olmadan, kazanana kadar sonraki haftalara devreder. (19 Ekim 2026: haftalık 100'dü, günlük 100 oldu.)
      MAX_TICKETS_PER_DAY: 100,      // günlük alım sınırı
      WINNER_MULTIPLIER: 2.0,        // Kazanan, biletlerine ödediğinin 2 katını alır
      AMORTI_SHARE: 0.02,            // Bilet bedelinin %2'si amorti kasasına
      // Devreden bilet yaşlanması (EK-08, ayrıntı js/economy/lottery.js): kazanamayan her çekilişte ödenen değerin %5'i düşer,
      // en çok bilet fiyatının yarısına kadar (1× geri ödeme tabanı). Alternatif (seçilmedi): elde tutulabilecek bilet tavanı
      // — alımı durdurup piyangoyu öldürüyordu.
      CARRY_AGING_RATE: 0.05,
      CARRY_VALUE_FLOOR: 0.5
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 📜 GÜNCELLEME LOGU (CHANGELOG) — v1.00'dan İtibaren Sürüm Tarihçesi
  // ═══════════════════════════════════════════════════════════════════════
  CHANGELOG: [
    {
      version: 'v1.00',
      title: 'Genesis Lansmanı',
      date: 'Ağustos 2026',
      changes: ['Oyunun ilk Alpha sürümü yayınlandı.', 'Temel 3 kaynak seferi (Odun, Demir, Buğday) aktif edildi.', 'Başlangıç Kışla ve Pazar alanı açıldı.']
    },
    {
      version: 'v1.01',
      title: 'Zindan & Pandora Keşfi',
      date: 'Ağustos 2026',
      changes: ['18 Katlı Zindan ve Kat Canavarları sistemi eklendi.', 'Pandora Kutuları ve 18 Koleksiyon Eseri oyuna dahil edildi.', 'Kolezyum ve Şampiyonluk derecesi entegre edildi.']
    },
    {
      version: 'v1.02',
      title: '10 Yıllık Ekonomik Model',
      date: 'Eylül 2026',
      changes: ['4320 Dakikalık (72 saat) alet dayanıklılık sistemi getirildi.', 'Haftalık 490k buğday, 180k odun, 130k demir kotaları bağlandı.', 'Seviye bazlı sefer süresi artışı (18 dk -> 72 saat) tanımlandı.']
    },
    {
      version: 'v1.03',
      title: 'Haftalık Sıfırlama & Vanilla Reset',
      date: 'Eylül 2026',
      changes: ['Haftalık kaynak limitlerinin Pazar/Pazartesi 00:01 TSİ sıfırlanması sağlandı.', 'Vanilla Sıfırlama ile cephanelik ve haftalık limitler sıfırlanabilir hale getirildi.']
    },
    {
      version: 'v1.04',
      title: 'Canlı Düşme Oranları & HUD',
      date: 'Eylül 2026',
      changes: ['Zindan içi ve Seviye Atlama ekranında canlı Pandora ve Parça düşme oranları göstergesi eklendi.', 'Kat 3 ve Kat 6 Boss çarpanları HUD paneline yansıtıldı.']
    },
    {
      version: 'v1.05',
      title: 'Sistem Denetimi & Hazine Güvenliği',
      date: 'Eylül 2026',
      changes: ['Maksimum Seviye 81 tavanı korundu.', 'WHEAT_PER_STAMINA = 3.15 eşitliği sağlandı.', 'Zindan savaş aralığı sızıntıları temizlendi, Hazine Defteri zindan ödüllerine bağlandı.']
    },
    {
      version: 'v1.06',
      title: 'Büyük Krallık Reformu & Karnaval',
      date: 'Eylül 2026',
      changes: [
        'Tek tip elit asker: "AdAstra Şampiyonu" (Lv.1: 100 HP, 25 ATK); 18 saatlik otomatik pasif doyurma (1 HP = 0.30 Buğday + 0.10 ASTRA) ve 100 katı anında hızlı doyurma (1 HP = 30 Buğday + 10 ASTRA).',
        'Zindanda Persistent Canavar Canı (kaybedilen savaşta canavarın canı yenilenmez).',
        'Krallık Demircisi "Çantam" kategorik filtreleri, seviye sıralaması ve toplu yükseltme/onarım.',
        'Yeni Teçhizat Craft & Upgrade matematiği (ATK 18 dk, HP 21 dk üretim + AMM ASTRA + Parça; 13 Dayanıklılık).',
        '24 Saatlik Kâr Ortaklı Taverna Otomasyon Botu (Saf kârın %50\'si) & Silo yönetimi.',
        'Krallık Karnavalı: 14 Ödüllü Şans Çarkı (RTP %78, Kasa Kârı %22) & 1M ASTRA Tohumlu Haftalık Piyango.',
        'AMM Swap ücreti %1.00 yapıldı; 3 yeni Parşömen likidite havuzu açıldı.',
        '1-Click "Tüm Seferleri Topla" butonu artık bitmemiş seferlerdeki biriken kaynakları da anında topluyor.'
      ]
    },
    {
      version: 'v1.07',
      title: 'Akıllı Silo Botu, Evrensel Parşömenler & Akıcı Şans Çarkı',
      date: 'Eylül 2026',
      changes: [
        '24s Otomasyon Botu Akıllı Silo Satışı: Piyasaya satış baskısı yapmamak için silodaki malların yarısı yerine, tam bir sonraki döngüde üretilecek miktar + %5 güvenlik marjı kadar minimal satış mekanizması getirildi.',
        'Evrensel Parşömen Entegrasyonu: Krallık Dashboard (1-Click), Envanter, Kışla Toplu Doyurma & Bireysel Asker Paneli, Zindan Savaş Öncesi Ekranı ve Orman/Maden/Tarla Sefer pencerelerine parşömen varsa anında kullanım ("Parşömen Kullan") seçenekleri eklendi.',
        'Stamina Parşömeni Dengesi: Parşömen staminayı sınırsız fullemek yerine doğrudan +100 Stamina Doldurma mekaniğine uyarlandı ve tüm arayüzlerde güncellendi.',
        'GPU Donanım Hızlandırmalı Şans Çarkı: Çark çevrilirken yaşanan kasma ve takılmalar giderildi; saniyede 60 kez CPU canvas çizimi yerine GPU kompozitör dönüşü ve fiziksel ibre salınımıyla 60/120 FPS pürüzsüz akıcılık sağlandı.',
        'Karnaval Çarkı İlk Açılış & Merkez Arması: Çark ekranı ilk açıldığında oluşan siyah ekran sorunu anında senkron çizimle çözüldü; çarkın merkezine sabit şık altın "🎪 AdAstra" arması eklendi.'
      ]
    },
    {
      version: 'v1.08',
      title: 'Karnaval Şans Çarkı Ödül Oranları Kalibrasyonu',
      date: 'Eylül 2026',
      changes: [
        'Karnaval Şans Çarkı ödül dağılımı ve ağırlıkları istenen matematiksel sınırlara göre 10.000 taban ağırlıkla yeniden kalibre edildi.',
        '24 Saatlik Otomasyon Botu çıkma oranı %0.60 seviyesine (%1\'in altına) çekildi.',
        'Teçhizat Parçaları (1x ve 10x Parça) toplam çıkma oranı %0.80 seviyesine (%1\'in altına) ayarlandı.',
        '100 Stamina Doldurma Parşömeni çıkma oranı %0.70 seviyesine (%1\'in altına) çekildi.',
        'Pandora Kutusu Anahtarı çıkma oranı %0.08 seviyesine (%0.1\'in altına) çekilerek nadir hazine statüsü pekiştirildi.',
        'AlphAvax Vercel App Özel Coin Analiz Kodu çıkma oranı %0.50 seviyesine (%1\'in altına) kalibre edildi.'
      ]
    },
    {
      version: 'v1.09',
      title: 'Şans Çarkı Arayüz Yüzdeleri Düzeltmesi & Dinamik Hesaplama',
      date: 'Eylül 2026',
      changes: [
        'Karnaval Çarkı 18 Dilim Ödül Tablosundaki eski 1.000 tabanlı bölme hatası düzeltildi; tüm şans oranları 10.000 toplam havuz ağırlığı üzerinden dinamik ve kurallara (%1 altı, %0.1 altı) tam uyumlu olarak ekrana yansıtıldı.',
        'Kutucuklardaki şans yüzdeleri (örn. Anahtar için %0.08, Bot için %0.60, Teçhizat Parçası için %0.60) net 2 basamaklı hassasiyetle gösterildi.',
        'Çark RTP ve Kasa Garantisi metrikleri dinamik ağırlıklı formüle bağlanarak ekranda anlık doğru değer gösterimi sağlandı.'
      ]
    },
    {
      version: 'v1.10',
      title: 'Canlı Amorti Bilet Parçaları & Bilet Rozeti Anlık Senkronizasyonu',
      date: 'Eylül 2026',
      changes: [
        'Karnaval Çarkı amorti bilet parçası (wheel_ticket_shard) kazanıldığında sayfanın veya modalın kapatılıp açılması gerekliliği ortadan kaldırıldı.',
        'Kazanım anında "🎟️ Amorti Bilet Parçaları: X/3" rozeti canlı animasyon ve altın rengi vurgu ile anında güncellenir.',
        '3 Parça tamamlanıp 1 Piyango/Çark Biletine dönüştüğünde, hem amorti sayacı hem de "🎟️ 1 Bilet İle Çevir" butonu anında canlı olarak senkronize edilir.',
        'Kazanılan AlphAvax Vercel App analiz kodları modal açıkken anlık olarak listeye eklenir.'
      ]
    },
    {
      version: 'v1.11',
      title: 'Ordu Hızlı Doyurma Deflasyonist Denge & Hazine Yakımı Reformu',
      date: 'Eylül 2026',
      changes: [
        'Ordu hızlı doyurma (Instant Heal) maliyeti, zindan havuzunu korumak ve deflasyonist yapıyı beslemek amacıyla 10x altın orana (1 HP = 3.0 Buğday + 1.0 ASTRA) uyarlandı.',
        '100x aşırı çarpan kaldırılarak tek asker tam canı 300 Buğday + 100 ASTRA, 18 kişilik tüm ordu ise 5.400 Buğday + 1.800 ASTRA seviyesine kalibre edildi.',
        'Hızlı doyurmada harcanan tüm $ADASTRA anında Hazine Muhasebesine (%22 Kalıcı Yakım + %78 Hazine Havuzları) işlenerek deflasyonist token yakımı ve havuz sponsorluğu sağlandı.',
        '18 saatlik düşük maliyetli pasif doyurma (1 HP = 0.30 Buğday + 0.10 ASTRA) aynen korunarak sabırlı emek veren oyuncuların zindan kârlılığı teminat altına alındı.'
      ]
    },
    {
      version: 'v1.12',
      title: '100M $ADASTRA Likidite & Hazine Reformu, Zindan Parşömenleri & Alet Tamir Dengelemesi',
      date: 'Eylül 2026',
      changes: [
        'Alet Onarım Parşömeni (scroll_repair) oyundan tamamen kaldırılarak Demirci hammadde tamir ekonomisi güvenceye alındı.',
        'Şans Çarkından tüm parşömenler çıkarıldı; ordu iyileştirme ve stamina parşömenleri yalnızca Zindan canavar & boss zaferlerinden düşen nadir ganimet haline getirildi.',
        'Şans Çarkı ödül dağılımı 15 dilimle 10.000 taban ağırlığa ve kural yüzdelerine tam uyumlu olarak yeniden dengelendi.',
        '100 Milyon $ADASTRA tohum fonu: 40M AMM DEX Havuzları, 40M Hazine Kasaları, 20M Krallık Piyangosu olarak dağıtıldı.',
        'AMM çift taraflı derinlik mimarisiyle, haftalık kotalar hiç yakılmadan ful satılsa dahi havuzların aylar sonra bile %50-60 seviyesinde güvende kalması matematiksel olarak garanti edildi.'
      ]
    },
    {
      version: 'v1.13',
      title: 'Pandora Kutusu & Anahtar AMM Havuzları ve Piyango 2x Kazanç Reformu',
      date: 'Eylül 2026',
      changes: [
        'Pandora Kutusu (10.000 ASTRA) ve Anahtar (1.000 ASTRA) AMM DEX havuzları yüksek değerleme ve sanal derinlik modeliyle optimize edildi.',
        'Pandora Kutularını açmak için Anahtar zorunluluğu getirildi. Anahtarların Zindan düşüşü kapatıldı; yalnızca Kolezyum sıralaması ve Şans Çarkından düşebilir hale getirildi.',
        'Koleksiyonu tamamlayan gezginler, düşürdükleri Pandora Kutularını AMM havuzunda ~10.000 $ADASTRA gibi devasa bir bedelle satabilme imkanına kavuştu.',
        'Piyango 2x Kazanç Sistemi: Kazanan kişi havuzun %18\'i yerine satın aldığı bilet tutarının tam 2 katını (2x) nakit kazanır, biletleri yakılır ve devasa 20M+ havuz devrederek büyümeye devam eder.',
        'Balina İstiflemesini Önleme Kotası: Her hesabın haftalık satın alabileceği maksimum bilet sayısı 100 bilet (10.000 ASTRA) ile sınırlandırıldı.'
      ]
    },
    {
      version: 'v1.14',
      title: 'Karnaval & AMM Hazine Rezervi Kalibrasyonu, Amorti 3x ve Talihli Payı',
      date: 'Eylül 2026',
      changes: [
        'Karnaval Çarkı hammadde yakım sayacı bağımsızlaştırılarak sadece çarkta yakılan kaynaklar için özel sayaç bağlandı.',
        'Hazine kasalarındaki yanıltıcı "doluluk oranı" kaldırılarak her kasada net ASTRA miktarı gösterildi.',
        'Karnaval çarkında kazanılan tüm ödüller havadan basılmak yerine Karnaval hazine bütçesiyle AMM pazarından buyback yapılıp teslim edilecek şekilde uyarlandı.',
        'Çark amorti bilet gereksinimi 10 adetten 3 adede düşürüldü (3 bilet parçası = 1 çevirme).',
        'AMM DEX işlemlerinde alınan %2 komisyon ile toplam kaç adet demir, odun ve buğday yakıldığını gösteren canlı sayaç kartı eklendi.',
        'Piyangodaki "Bu haftaki talihli payı" silindi; yerine talihlinin biletlerini yakıp değerinin tam 2 katı ASTRA\'yı kasadan çektiği "Talihli Bilet Yak & 2 Katı ASTRA Kasadan Çek" bölümü eklendi.'
      ]
    },
    {
      version: 'v1.15',
      title: 'Savaş Formasyonu Sadeleştirmesi & Zindan Zafer Kontrolü Reformu',
      date: 'Eylül 2026',
      changes: [
        'Savaşlardaki Ön Saf / Arka Saf mevzi mekanizması tamamen kaldırıldı; tüm askerlerin tek hat serbest savaşa katıldığı modern savaş motoru aktif edildi.',
        'selectTarget algoritmasından mevzi koruma barajı kaldırılarak taunt ve piercing harici tüm canlı düşmanların doğrudan hedeflenebilmesi sağlandı.',
        'Kışla ve zindan savaş öncesi arayüzlerinden mevzi değiştirme butonları ve etiketleri temizlendi.',
        'Zindan savaşını kazanıp canavar 0 HP\'ye düşmesine rağmen "BOZGUN" verme hatası düzeltildi (simResult.winner, simResult.victory ve eCurHp <= 0 üçlü zafer kontrolü teminat altına alındı).',
        'Karakter seviye atlama butonunun XP dolmasına rağmen kilitli kalması ve toast z-index sorunu çözüldü.'
      ]
    },
    {
      version: 'v1.16',
      title: '6 Varlıklı Dinamik Genesis Buyback & Kalıcı Yakım Motoru (%18 Evrensel Harcama Girişi)',
      date: 'Eylül 2026',
      changes: [
        'AMM DEX havuzundaki satış baskısını kırmak ve taban fiyat koruması sağlamak amacıyla 6 Varlıklı (Buğday, Demir, Odun, Parça, Anahtar, Kutu) Dinamik Buyback & Kalıcı Yakım Motoru geliştirildi.',
        'Hazineye yalnızca DEX alım-satım fee\'leri değil, oyundaki TÜM $ADASTRA harcamalarının net %18\'i doğrudan AMM Buyback Kasasına bağlandı.',
        'Fiyat düşüşleri haftalık dalgalanmaya değil, değişmez Genesis Lansman Fiyatlarına ($P_{genesis}$) sabitlendi.',
        'Kuvvet Yasası Harcama Matematiği (U = Δ^2.5): Fiyat %10 düştüğünde binde 3 sembolik fon ayrılırken, %90 çöküşte bütçenin %76.8\'i devreye girer ve ucuza gelen fiyattan tam 2.195 kat daha fazla FİZİKSEL ADET satın alınıp anında yakılır (Burn).',
        'Hazine Dağıtım Ağırlığı: Bütçenin %75 aslan payı temel hammadde üçlüsüne (%30 Buğday, %25 Demir, %20 Odun), %25 payı ise gelişim & prestij varlıklarına (%10 Parça, %8 Anahtar, %7 Kutu) tahsis edildi.',
        'Hazine Güvenlik Tavanı: Kasada kaç milyon ASTRA olursa olsun, bir döngüde en fazla %10 bütçe harcanabilir; kalan %90 rezervde kalıp arkadaki kale görevini sürdürür.',
        'Pazar yerine "🛡️ Otonom Buyback & Yakım" sekmesi eklendi; 6 varlığın canlı fiyat analizi, aciliyet yoğunluğu ve tek tıkla operasyon yürütme kontrolü sağlandı.'
      ]
    },
    {
      version: 'v1.17',
      title: '⏩ Zaman Atlama & Otonom Taverna Botu Simülasyon Motoru',
      date: 'Eylül 2026',
      changes: [
        'Geliştirici & Hızlı Test Konsolundan saat ileri sarıldığında (+1s, +6s, +18s, +24s) otonom Taverna Botunun zaman dilimini ardışık döngülerle otonom simüle etmesi sağlandı.',
        'Simülasyon sürecinde odun, demir ve buğday seferleri peş peşe tamamlanır, depolar doldurulur, aşınan aletler otomatik onarılır ve stamina sadece gereken oranda buğdaydan karşılanır.',
        'Silo Doluluk Tercihi Tam Entegrasyonu: "Siloyu Yükselt" seçiliyken ambarlar otomatik üst seviyeye taşınır, "Kaynakları Sat" modundayken %50 rezerve korunarak fazlalık AMM DEX pazarında satılıp ASTRA biriktirilir.',
        '50x Önkoşul & Dondurma (Freeze) Uyumu: Zaman ilerletilirken kaynaklar tükenirse bot süresi dondurulur, saniyeler boşa harcanmaz.',
        'Kalan bot süresi geçen zaman kadar senkronize geriye düşürülür; süre bittiğinde seferler durur.',
        'Test menüsünde zaman sarıldıktan sonra tamamlanan sefer sayısını, kazanılan net hammaddeleri, kasa değişimini ve kalan bot süresini gösteren canlı "Simülasyon Sonuç Raporu" arayüzü eklendi.'
      ]
    },
    {
      version: 'v1.18',
      title: '🏛️ Karnaval Çarkı Fiziki AMM DEX Buyback & Fiyat Artış Motoru',
      date: 'Eylül 2026',
      changes: [
        'Karnaval Çarkında Odun, Buğday, Demir, Teçhizat Parçası veya Anahtar çıktığında ödüllerin havadan basılması kesin olarak engellendi.',
        'Tüm bu ödüller doğrudan Karnaval Hazine Kasası (pools.carnival) bütçesiyle AMM DEX pazarından fiziki executeBuyAmount işlemiyle piyasadan satın alınır (Buyback).',
        'Piyasa alımı AMM likidite havuzundaki arzı fiziki olarak eksiltir ve marketteki fiyatı anında yukarı doğru artırır.',
        'Çark sonuç ekranına ve toast bildirimlerine "🏛️ KARNAVAL HAZİNESİ AMM BUYBACK DEKONTU" eklendi; satın alınan miktar, kasadan ödenen ASTRA ve anlık fiyat artışı (P_eski ➔ P_yeni ASTRA, +%X.XX 📈) canlı olarak raporlanır.',
        'Pazar yerinde fiyatlar 4 ondalık basamak hassasiyetle anlık canlı güncellenir.'
      ]
    },
    {
      version: 'v1.19',
      title: '🧹 Kod Tabanı Arındırma, Eski Kalıntıların Temizlenmesi & Mimari Refactor',
      date: 'Eylül 2026',
      changes: [
        'Eski ve güncelliğini yitirmiş tek seferlik debug betikleri (check_browser_runtime, check_time, debug_background_tab, debug_user_loop, inspect_live_game) projeden ve GitHub deposundan tamamen temizlendi.',
        'Savaş motoru konfigürasyonundaki eski ön saf kalıntısı (FRONTLINE_COVER) ve testlerdeki row/mevzi kalıntıları safsız açık muharebe modeline göre arındırıldı.',
        'Hazine defteri ve piyango arayüzlerindeki eski tekil pay modelleri güncel 2x bilet yakım doktrinine göre optimize edildi.',
        'Eski hız iksiri kalıntı kodları temizlenerek GameStateManager ve yardımcı modüller yalınlaştırıldı.',
        'Tüm canlı birim ve entegrasyon testleri (36 dosya) package.json test scriptine bağlanarak %100 kapsama sağlandı.'
      ]
    },
    {
      version: 'v1.20',
      title: '🤖 Çift Yönlü Bot Oto-Tedarik (Auto-Buy Resource Deficit) & Kesintisiz Silo Yükseltme Güvencesi',
      date: 'Eylül 2026',
      changes: [
        'Bot çalışırken Silo Seviye atladığında veya sefer/tamirat harcamalarıyla Odun, Demir veya Buğday stokları 50 altına indiğinde; kasadaki $ADASTRA bakiyesiyle AMM pazarından eksik hammaddeyi anında satın alan çift yönlü oto-tedarik motoru (autoBuyBotResourceDeficit) entegre edildi.',
        'Daha önce yalnızca ASTRA eksikliğinde kaynak satan tek yönlü sistem; hem ASTRA eksildiğinde kaynak satan hem de hammadde azaldığında piyasadan kaynak satın alan tam otonom çift yönlü dengeleyiciye dönüştürüldü.',
        'Silo Seviye 3, 4 ve üzeri yükseltmelerde tüm ambarlar sıfırlandığında botun duraklatılması (paused) engellendi; yükseltme tamamlandığı an kasadaki ASTRA ile ambarlara güvenlik rezervi otomatik temin edildi.',
        'Geliştirici konsolundan saat ileri sarıldığında veya çevrimdışı ilerlemede ambar sıfırlanmasından ötürü botun dondurulması sorunu kökten çözüldü.'
      ]
    },
    {
      version: 'v1.21',
      title: '🤖 Hesap Seviyesi & Sefer Süresi Odaklı Dinamik Tamirat Rezervi (+%50 Marj) & Kesintisiz Seviye Atlama',
      date: 'Eylül 2026',
      changes: [
        'Hesap seviyesi (Lv 2, 3, 4...) arttıkça uzayan sefer süreleri ve buna bağlı katlanarak artan alet tamir maliyetleri dinamik hesaplama motoruna bağlandı.',
        'Silo yükseltmelerinde sabit 50 birim alım yerine; kişinin o anki hesap seviyesinde 3 paralel seferin alet tamir bedeli olarak kaç Odun ve Demir gerekiyorsa, o miktarın en az %50 DAHA FAZLASI (+%50 güvenlik tamponu) kadar malzeme AMM DEX pazarından satın alınarak ambarlara yüklendi.',
        '3 paralel seferin ihtiyaç duyduğu stamina miktarı ve bunu karşılayacak buğday bedeli de en az %50 güvenlik marjıyla oto-tedarik paketine dahil edildi.',
        'Böylece hesap seviyesi kaç olursa olsun, silo yükseltildiğinde botun hammadde yetersizliğinden durma problemi kökünden çözüldü.',
        'Yeni seviye bazlı dinamik tamirat rezervi bağımsız birim testleriyle (test_bot_dual_auto_buy_resource_deficit.mjs) %100 başarıyla doğrulandı.'
      ]
    },
    {
      version: 'v1.22',
      title: '🛡️ Zindan & Kolezyum Ön Saf / Arka Saf Mevzi Sistemi & 3 Farklı Taktiksel Savaş Preseti',
      date: 'Eylül 2026',
      changes: [
        'Zindan ve Kolezyum savaşlarındaki Ön Saf / Arka Saf (Frontline / Backline) mevzi mekanizması taktiksel derinliği artırmak üzere tam kapasite geri getirildi.',
        'Ön saf ayaktayken arka safı koruyan siper mekanizması devrede: düşman normal saldırılarının %85\'i ön safa yönelir, ön saf çöktüğünde arka saf açığa çıkar; delici saldırılar doğrudan arka safı hedefler.',
        '3 Farklı Taktiksel Savaş Preseti (Preset 1, Preset 2, Preset 3): Oyuncular hangi savaşçıların önde hangi savaşçıların arkada duracağını bir kere belirleyip kaydedebilir.',
        'Hazır Taktik Kolaylığı: İster Zindan ister Kolezyum öncesi tek tıkla Preset 1, 2 veya 3 seçilerek savaşlara zahmetsizce girilebilir.',
        'Kışla, Zindan savaş hazırlık ve Kolezyum arayüzlerine dinamik ön/arka saf değiştiriciler ve preset yönetim butonları entegre edildi.'
      ]
    },
    {
      version: 'v1.23',
      title: '🏰 Silo Otomatik Yükseltme Hız Freni & Vanilla Reset Sonrası Kontrolsüz Yükselme Koruması',
      date: 'Eylül 2026',
      changes: [
        'Bot çalışırken idle 60 FPS oyun döngüsünde silonun kontrolsüz biçimde saliseler içinde Seviye 9 veya 12\'ye fırlamasına neden olan tetikleme açığı giderildi.',
        'Silo yükseltme ve kaynak satışı kontrolleri yalnızca o döngüde tamamlanan bir sefer hasadı toplanmışsa (hasClaimedAny) çalışacak şekilde sınırlandı.',
        'Hem tryAutoUpgradeWarehouseWithAdaFinancing hem de handleBotSiloSpace motorlarına 10 saniyelik güvenlik bekleme süresi (cooldown) entegre edilerek ardışık karelerde ardı ardına yükseltme döngüsü engellendi.',
        'Zaman ileri sarma (fast forward) simülasyonlarında ise _isFastForwarding bayrağıyla saat bazlı sefer tamamlanmalarında doğal yükseltmelerin sağlıklı işlemesi korundu.'
      ]
    },
    {
      version: 'v1.24',
      title: '👑 Realm of Astra Yeniden Doğuşu & 24s Bot Alımında Ani Silo Yükselmesi ve AMM Fiyat Şişme Koruması',
      date: 'Eylül 2026',
      changes: [
        'Projenin resmi adı "Realm of Astra" olarak tescillendi ve arayüz başlıkları yenilendi.',
        'Bot Satın Alımında Ani Silo Seviye 2 Koruması: Bot satın alındığı sıfırıncı saniyede henüz sefer toplanmamışken kullanıcının kalan ~3.884 ASTRA parasını anında siloya gömen kontrolsüz yükseltme kökünden engellendi. Silonun yükseltilmesi yalnızca botun sefer tamamlayıp depoyu doldurması kuralına bağlandı.',
        'AMM Market Fiyat Şişirme Engeli: Botun kasadaki ASTRA ile AMM\'den zorla odun/demir/buğday satın alıp piyasa fiyatlarını artıran ve kullanıcının ASTRA\'sını tüketen alım çağrıları kaldırıldı. Bot bir hammadde üreticisidir; alet tamiri veya silo için ASTRA lazımsa depodaki hammaddeyi AMM\'de SATARAK ASTRA temin eder ve pazar fiyatlarının düşmesini sağlar.',
        'Taverna Bot Satın Alma Radyo Seçeneği Senkronizasyonu: Satın alma anında kullanıcının seçtiği "Siloyu Yükselt" veya "Akıllı Satış" tercihi anında state\'e kaydedilir.',
        '38 birim testin tamamı (tüm zindan, dövüş, ekonomi ve bot testleri) sıfır hata ile %100 doğrulandı.'
      ]
    },
    {
      version: 'v1.24.1',
      title: '🛡️ 24s Bot AMM Oto-Alım Kaldırılması & Başlangıç Demir Rezervi Senkronizasyonu',
      date: 'Eylül 2026',
      changes: [
        'Bot Satın Alımında AMM Marketinden Kaynak Alımı Tamamen Yasaklandı: Bot satın alındığında siloyu doldurmak için kullanıcının kasasındaki ASTRA ile AMM pazarından zorla kaynak satın alıp fiyatları fırlatan autoBuyBotResourceDeficit fonksiyonu kalıcı olarak devre dışı bırakıldı.',
        'Başlangıç Profili Demir Stoğu (40 -> 50): Yeni başlayan oyuncunun 50x bot çalışma önkoşulunu (50 Demir, 50 Odun, 50 Buğday, 50 ASTRA) eksiksiz karşılaması için başlangıç demiri 50 yapıldı.',
        'Bot Üretici Kimliği Güvencesi: Bot yalnızca seferlerden hammadde toplar. Alet tamiri için ASTRA gerektiğinde silodaki fazla hammaddeyi AMM\'de satarak hem ASTRA üretir hem de pazar fiyatlarını düşürür.'
      ]
    },
    {
      version: 'v1.25',
      title: '🛡️ Ekonomi Güvenliği, Yeni Oyuncu Rehberi & Yenilenen Arayüz',
      date: '29 Eylül 2026',
      changes: [
        'Para açıkları kapatıldı: piyango artık yalnızca gerçekten kazananlara ödeme yapar ve çekiliş her Pazartesi 00:01 (TSİ) kendiliğinden yapılır; çark kasası yetmediğinde kapanır; kolezyum ödülü arena kasasından çekilir.',
        'Bot: oyun 24 saatten uzun kapalı kalsa da bot kendi süresi boyunca çalışmış sayılır; parası yetmeden alım yapmaz; al-sat kısır döngüsü giderildi; hasat beklerken pazardan gereksiz alım yapmaz; siloyu büyütürken ve alet tamirinde kasada güvenlik payı bırakır.',
        'Yeni: 6 ve 24 saatlik bot paketleri, 1 saatlik ücretsiz bot denemesi, oyuna dönünce "Sen yokken olanlar" raporu ve ödüllü Krallık Rehberi görevleri.',
        'Pazar: taban fiyat koruması ve gerçek %2 hammadde yakımı; sayfa yenilenince haftalık kota artık yeniden dolmuyor.',
        'Arayüz baştan yenilendi: sade üst bar, silo doluluk çizgileri, tek renk sistemi, okunaklı yazı tipleri, telefonda alt gezinme çubuğu ve tam ekran pencereler.',
        'Test menüsü yalnızca geliştirme sürümünde görünür; oyunculara açık değildir.',
        'Çalışmayan üç düğme onarıldı: kışladan asker alma, demircide ekipman onarımı ve karnaval moral bonusu.'
      ]
    },
    {
      version: 'v1.26',
      title: '⚖️ Yeni Ekonomi Kuralları, Adım Adım Açılan Menüler & Hız',
      date: '30 Eylül 2026',
      changes: [
        'Piyango: her bilet 100 ASTRA, haftalık bilet sınırı var. Her hafta tek kazanan çıkar ve biletlerine ödediğinin 2 katını alır; biletleri ödülü çekerken yanar. Kazanamayanın biletleri yanmaz, sonraki haftaya devreder. Kasa biterse amorti kasası kalan tüm biletlere eşit dağıtılır.',
        'Çarkta 1 piyango bileti = 1 çevirme; yakılan biletin bedeli piyango ödül hesabından da düşer.',
        'Haftalık temel gelir (UBI): oyunda harcanan her ASTRA\'nın %6\'sı haftalık kasada birikir, Pazartesi 00:01 (TSİ) açılır ve 3. seviyeden itibaren seviyeye göre paylaşılır; çekilmeyen pay sonraki haftaya devreder.',
        'Haftalık kota her gün bir parça açılır (Pazartesi sabahı tek seferde bitmez). Pazar derinliği haftalık kotanın 80 katına çıkarıldı: fiyatın %90 düşmesi yıllar alır.',
        'Zindan: günde 5 ödüllü giriş; sonrasında isteğe bağlı kapı harcıyla ödüllü giriş (harcın tamamı zindan kasasına). Zindan kasası günde bakiyesinin en fazla %1\'ini öder, bu yüzden boşalamaz. Zindanda da asıl savaş motoru kullanılır.',
        'İlk oturumda menüler adım adım açılır: pazar ilk hasattan, kışla ve demirci üç alan birden çalışınca, karnaval 2. seviyede, zindan ilk askerle, kolezyum ilk zindan zaferiyle.',
        'Karakter panelinde "Bir sonraki seviyede ne kazanırsın?" tablosu: üretim bonusu, buğday tasarrufu, stamina, sefer süresi, ganimet şansı ve UBI payı.',
        'Hız: ekran yazıları saniyede 4, bot ve hesaplar saniyede 1 kez güncellenir; yan panel açıkken yaşanan yavaşlama giderildi.',
        'Resimler küçültüldü (23,8 MB → 4,2 MB). Ganimet ve parşömen resimleri yayın paketine eklendi (önceden yalnız geliştirme modunda görünüyordu).'
      ]
    },
    {
      version: 'v1.27',
      title: '📊 Kota Paneli & Yeni Zindan Giriş Kuralları',
      date: '29 Eylül 2026',
      changes: [
        'Piyango: bir hesap haftada en fazla 100 bilet alabilir. Kazanmayan biletler yanmaz, sayı sınırı olmadan kazanana kadar sonraki haftalara devreder.',
        'Piyango ekranı gerçek kurallarla yenilendi: haftalık alımın, elindeki bilet, kazanırsan alacağın tutar, şansın ve sonraki çekilişe kalan süre.',
        'Zindan: her girişte stamina harcanır. Günün 1. girişinde eşyalar aşınmaz. 2.–5. giriş harçsız ödüllüdür ve savaşa giren her askerin takılı eşyalarından rastgele biri 1 aşınır. 6. girişten itibaren kapı harcı ödenir, ödenmezse antrenman girişi olur.',
        'Yeni "Kota ve Sınırlar" paneli (üst bar 📊, yan panel veya K tuşu): dünya kotasının gün gün açılışı, şu an çıkarılabilecek miktar, zindan / kolezyum / piyango sınırların ve geri sayımlar.',
        'Kolezyum: günlük maç hakkı, anahtar ve stamina bedeli maçtan önce gösterilir; eksik olan kırmızıyla işaretlenir.',
        'Arayüz: bildirimler sağ alta alındı, mobilde bakiye kısaltıldı (1,97 Mn), dar ekranda üst menü taşmıyor, İngilizce etiketler Türkçeleştirildi, kışlada yanlış sayı yazısı düzeltildi.',
        'Windows: OYUNU-BASLAT.bat oyunu arka planda sürekli açık tutar; pencere kapansa ve bilgisayar yeniden açılsa da http://localhost:5180 çalışır. OYUNU-DURDUR.bat kapatır.'
      ]
    },
    {
      version: 'v1.28',
      title: '🛡️ Kayıt Güvenliği, Tutarlı Savaş Sonuçları & Güvenilir Saat',
      date: '30 Eylül 2026',
      changes: [
        'Kayıt güvenliği: kayıt dosyası bozulursa oyun artık sıfırlanmaz; son sağlam yedekten açılır ve bozuk kopya ayrıca saklanır. Tarayıcının depolama alanı dolarsa oyun durmaz, uyarı verir.',
        'Zindan: savaşın sonucu (can kaybı, silah aşınması, ödül) savaş başlarken kaydedilir; animasyon sırasında sayfayı yenilemek yenilginin bedelini ortadan kaldırmaz.',
        'Kolezyum: savaş ekranı artık gerçek maçı oynatır. Önceden ekranda görünen zafer/yenilgi verilen ödül ve ELO ile çelişebiliyor, şampiyonun canı yanlış yazılabiliyordu.',
        'Günlük zindan ve kolezyum hakları ile günlük hazine geri alımı bilgisayar saatine değil, sunucu saatiyle düzeltilmiş saate bağlandı; bilgisayar saatini ileri almak hakları yenilemez.',
        'Oyun motoru (Phaser) artık oyunla birlikte paketlenir; dış bir siteye (CDN) erişilemediğinde oyunun hiç açılmaması sorunu giderildi.',
        'Test menüsü düğmeleri iki kez çalışıyordu (+6 saat ileri sarma 12 saat sarıyordu); düzeltildi.'
      ]
    },
    {
      version: 'v1.29',
      title: '🔒 Yeni Ekonomi 1. Aşama: Kilitli Bakiye, Katkı Puanı, Görev Kasası & Fiyat Çarpanı',
      date: '30 Eylül 2026',
      changes: [
        'Harcama dağılımı yenilendi: her harcamanın %5\'i yakılır (önceden %13), %6\'sı haftalık temel gelire, %3\'ü yapımcı payına, %86\'sı hazine kasalarına gider. Daha az yakım, oyuncuya geri dönen payı artırır.',
        'Yeni Görev & Ücretsiz Oyuncu Kasası: hazine girişinin %21\'i buraya ayrılır. Görev ödülleri artık buradan ödenir; ileride ücretsiz oyunculara aylık pay da buradan dağıtılacak. Kasa payları: Zindan %30, Kolezyum %15, Dünya Bossu %15, Pazar Geri Alım %15, Görev %21, Karnaval %4.',
        'Kilitli bakiye: oyundan kazandığın ASTRA\'nın %20\'si serbest, %80\'i kilitli başlar. Kilitli ASTRA\'yı oyunda harcayabilirsin; harcadıkça, her gün oynadıkça ve zamanla açılır. Hazine panelinde ve bakiyenin üzerine gelince serbest/kilitli miktarı görünür.',
        'Katkı puanı: oyunda harcadığın her ASTRA, yaktığın ve pazara sattığın hammadde puan kazandırır. İleride haftalık çekim hakkından payını bu puan belirleyecek.',
        'ASTRA fiyat çarpanı: asker, iyileşme, bilet, çark ve Genesis NFT fiyatları ile zindan ve görev ödülleri tek bir çarpana bağlandı. ADASTRA\'nın değeri değişince çarpan haftada en fazla %5 değişerek oyunun dolar maliyetini dengeler (şimdilik ×1).'
      ]
    },
    {
      version: 'v1.30',
      title: '🛡️ Muhafız Mührü & Krallık Güvenliği',
      date: '4 Ekim 2026',
      changes: [
        'Muhafız Mührü (isteğe bağlı iki adımlı doğrulama): telefonundaki doğrulama uygulamasının 6 haneli kodu girişte, cüzdan bağlarken, çekimde ve kasadan çekimde istenir. Telefon kaybına karşı 10 yedek kod verilir. Hesabım → Muhafız Mührü.',
        'Kayıt artık e-postandaki onay bağlantısıyla tamamlanır; bağlantıya tıklayınca doğrudan oyuna girersin. Kayıt ekranı bir e-postanın kayıtlı olup olmadığını kimseye göstermez.',
        'Şifren değişince ya da Muhafız Mührü takılıp kaldırılınca e-postana bildirim gelir.',
        'Oyun Kasası üst sınırı: kasanda yaklaşık 30 günlük harcamandan fazlası birikirse fazlası güvenliğin için kendi cüzdanına kendiliğinden geri gönderilir.',
        'Karnaval Çarkı hammaddeyle çevrilince ödenen hammaddenin yarısı yakılır, yarısı pazarda satılır ve gelen ASTRA Karnaval kasasına girer (ödüller bu kasadan ödenir).',
        'Tarayıcı koruması açıldı: oyun sayfasında yalnız oyunun kendi kodu çalışabilir.'
      ]
    },
    {
      version: 'v1.31',
      title: '🎡 Yeni Şans Çarkı & Adil Ücretsiz Oyuncu Payı',
      date: '4 Ekim 2026',
      changes: [
        `Şans Çarkı yenilendi: oyuncuya ortalama dönüş %63'ten ~%81'e çıktı (bot hariç). Çevirmelerin ~%31'inde en az bedelini geri alırsın, ~%10'unda kârla çıkarsın. Yeni 💎 5.000 ASTRA Büyük İkramiye (50×).`,
        `Çark artık kendi kendini besliyor: ASTRA ile çevirmenin %80'i doğrudan Karnaval kasasına girer, kasa erimez ve çark kapanmaz.`,
        `Piyango biletiyle çevirince biletin piyango kasasındaki payı Karnaval kasasına geçer.`,
        `Hammaddeyle çevirme günde 3 hak (hammadde oyunda bedava toplandığı için kasa korunur).`,
        `Haftalık ücretsiz oyuncu payı adil hale geldi: en az 3. seviye ve haftada yeterli katkı puanı gerekir; pay katkın arttıkça hızla büyür ve her hafta üst üste katılınca sadakat serisiyle 2 katına kadar çıkar. Emeğini tek hesapta toplayan, yan hesaplara bölenden çok daha fazla kazanır. Pay kilitli gelir; oyunda harcadıkça çözülür. Şartlarını Hazine panelinde görebilirsin.`
      ]
    },
    {
      version: 'v1.32',
      title: '🌾 Dengeli Buğday Ekonomisi & Kolay Yönetim',
      date: '5 Ekim 2026',
      changes: [
        `Seferin stamina bedeli artık sefer süresiyle orantılı: her seviye, 1.000 hammadde başına yakılan buğdayı yalnız %1 azaltır (eskiden 2. seviyede bir anda %65 düşüyordu). Buğday her seviyede değerli kalır.`,
        `Stamina sınırı, 3 alanı aynı anda başlatabileceğin kadar büyür.`,
        `Seviye başına üretim bonusu %1,5'ten %1'e indi (81. seviyede +%80).`,
        `Kışla yenilendi: aranabilir asker listesi, eşya yuvaları en üstte, yuvaya tıklayınca bütün uygun eşyalar karşılaştırmalı listelenir; cephanelikte süzme, sıralama ve akıllı öneriler.`,
        `Pazar: "Hepsini sat" ve "Depoyu doldur" düğmeleri.`,
        `Seviye atlama ve silo yükseltmede "Hızlı al": eksik hammaddeleri ASTRA'n yetiyorsa tek tuşla pazardan alır.`,
        `Hesabım: kilitli ASTRA'nın nasıl açılacağını, yarın ve 7 günde ne kadarının açılacağını gösteren panel; pencere dışına tıklayınca kapanır.`
      ]
    },
    {
      version: 'v1.33',
      title: '💸 Şeffaf ASTRA Oranları',
      date: '6 Ekim 2026',
      changes: [
        `Oyundaki bütün ASTRA oranları (yakım, yapımcı payı, temel gelir, ödül kasaları, çark, zindan harcı, piyango, pazar komisyonu, çekim ücreti) artık herkesin görebileceği bir akıllı sözleşmede. Bir oran değişirse 24 saat önceden görünür.`,
        `Askerlerin kendi kendine iyileşmesinde harcanan ASTRA artık her harcama gibi kasalara dağıtılıyor (önceden hiçbir kasaya yazılmıyordu).`,
        `Kullanılan teçhizat parçası, anahtar, kutu ve parşömenler yakım kaydına giriyor.`
      ]
    },
    {
      version: 'v1.34',
      title: '🎟️ Promo Kodları',
      date: '6 Ekim 2026',
      changes: [
        `Promo kodu: kayıtta ya da oyunda Hesabım → Promo kodu'na yaz. Ödül ASTRA (kilitli, oyunda harcadıkça açılır) ya da hammadde, anahtar, kutu, parşömen olabilir; bedeli görev kasasından ödenir.`,
        `Hesap açarken ve yeni şifre belirlerken şifre iki kez sorulur; yanlış yazılan şifreyle hesap açılmaz.`,
        `Oyun artık realmofadastra.vercel.app adresinde.`
      ]
    },
    {
      version: 'v1.35',
      title: '👑 Yeni Ad: Realm of AdAstra',
      date: '6 Ekim 2026',
      changes: [`Oyunun adı her yerde "Realm of AdAstra" oldu: oyun ekranı, e-postalar, cüzdan bağlama mesajı ve yönetici paneli.`]
    },
    {
      version: 'v1.36',
      title: '🌄 AdAstra Vadisi: Yeni Oyun Çekirdeği',
      date: '7 Ekim 2026',
      changes: [
        `Oyun altı hammaddeye (odun, demir, kömür, taş, buğday, şifalı ot) ve 200 milyon ASTRA ölçeğine geçti. Üretim Hakkı ve AdAstra Vadisi haritası eklendi.`,
        `Köy Evleri: köylüler beslenir ve çoğalır, her askerin bir köylüsü olur, ev yapabilirsin. Şifahane: şifalı otla iyileştirme (1 ot = 5 can). Demirhane'de eşya geri dönüşümü (harcananın %70'i geri gelir).`,
        `Roket görevi (seviye 3 ve parçalar) ve Genesis gezegen hakkı.`,
        `Sirius Konseyi: Otorite inşaatı ve ortak projeler (köprü seferleri -%2, ambar silo +%5, şifa bahçesi ot +%5). Konseye verdiğin hammadde yakılır ve sana katkı puanı yazar.`
      ]
    },
    {
      version: 'v1.37',
      title: '🚪 Vatandaşlık Kapısı, İlan Pazarı ve Hazırlık Deposu',
      date: '7 Ekim 2026',
      changes: [
        `Vatandaşlık kapısı: sınırlı sayıda vatandaş alınır. Sırada bekleyenler oyunu gezebilir ama işlem yapamaz; yer açılınca sıradakine davet gider. Uzun süre oynamayan vatandaş önce uyarılır (14 gün), sonra askıya alınır (30 gün).`,
        `İlan pazarı: teçhizatını 7 günlüğüne satışa koyabilir (en çok 10 ilan), başkasının ilanını alabilirsin. %2 komisyon alınır, yarısı yakılır.`,
        `Yük İskelesi Hazırlık Deposu: Universe'e hazırlık yüzdesi depo doluluğundan hesaplanır. Geri alırken %10 kesinti yakılır.`,
        `Krallık Yolu rehber görevleri yeni binaları kapsıyor; "Sen yokken olanlar" raporu eklendi.`
      ]
    },
    {
      version: 'v1.38',
      title: '🛡️ Hesap Güvenliği',
      date: '8 Ekim 2026',
      changes: [
        `Parolalar çok daha güçlü bir yöntemle saklanıyor, oturum anahtarları özet olarak tutuluyor. Yönetici işlemleri ve yetkisiz denemeler kayıt altına alındı.`,
        `Piyango çekilişi ve PvP tohumu sunucuda güvenli rastgelelikle yapılıyor. Bildirim kutusu ve savaş kaydındaki adlar kötü niyetli yazıya karşı korundu.`,
        `Veritabanı yedekleri otomatik alınıyor ve bütünlükleri doğrulanıyor. 30 dakikalık yük testinde hata çıkmadı.`
      ]
    },
    {
      version: 'v1.39',
      title: '🏛️ Ekonomi Kararları',
      date: '8-9 Ekim 2026',
      changes: [
        `İlk dönemde 100 vatandaş. Sırada bekleyen "hazır adaylar" (3 basit onay adımını tamamlayanlar) önce davet alır; davet 72 saat geçerlidir ve oyundaki ilk gerçek hareketle kabul edilir.`,
        `Savunma Duvarı projesi artık gerçek etki taşır: tamamlanınca Dünya Bossu savaşından erken çekilme cezası %18'den %12'ye düşer.`,
        `Konsey'de herkese açık "gelir motoru" panosu, Hesabım'da "ASTRA nereden alınır" bilgi kutusu, hazinede "dağıtılan ve çekilebilen" göstergesi.`,
        `Çekim ücretinin yarısı yakılır, yarısı temel gelire gider. Temel gelir tek talepte en çok %5 olur. Zindan ödülü artık yuvarlanmaz (1 ASTRA'nın altındaki ödül sıfıra inmiyordu).`,
        `Haftalık ödeme bütçeleri: zindan, Kolezyum, boss, görev ve karnaval kendi bütçesinden öder. Bütçe dolunca "Bu haftaki ödeme payı doldu" mesajı gösterilir.`,
        `Sponsorluk: bir oyuncu başkasını sponsor edebilir. Sponsorlu oyuncu parayı çekemez, yalnız oyunda harcar; çektiği net tutarın %30'u sponsora gider. Trade sitesinden gelen gelir de diğer harcamalar gibi dağıtılır.`
      ]
    },
    {
      version: 'v1.40',
      title: '📱 Yeni Arayüz (v3)',
      date: '9 Ekim 2026',
      changes: [
        `Tek satırlık üst çubuk, 5 sekmeli alt çubuk, tek panel sistemi ve "Şimdi" kartı. Ayarlar, bağlantı bandı ve sade zindan başlığı.`,
        `Yeni oyuncu turu: gerçek dokunuşları bekleyen adım adım yönlendirme. Ben menüsünden tekrar izleyebilirsin.`,
        `Pazar üç bölüme ayrıldı ve tek kaynak kartı kullanıyor. Yoğun paneller katlanıyor, terimler sözlüğü eklendi.`,
        `Kışla sadeleşti: iki ana düğme önde, diğer işlemler katlı, dokunma hedefleri 44 px. Kotalar (önce kişisel), Karnaval (daha küçük çark, katlı ödül tablosu), Hazine ve Demirhane de sadeleşti.`
      ]
    },
    {
      version: 'v1.41',
      title: '✨ Ekranlar Yenilendi ve Krallık Yolu',
      date: '11 Ekim 2026',
      changes: [
        `Demirhane, Kolezyum, Hazine, Kotalar ve Karnaval yenilendi; zindan savaş öncesi penceresi sadeleşti. Silo ve Krallık merkezi altı hammaddenin hepsini gösteriyor. Savaş alanı kendi ekranını açıyor.`,
        `Zindan sahnesindeki levhalarda Türkçe etiketler (seviye, canavar, kilitli, yenildi, savaşa gir).`,
        `Krallık Yolu: 47 görev, 10 bölüm, bölüm bonusları ve final unvanı. Hesap başına en çok 994 ASTRA, görev kasasından ve yalnız doğrulanmış e-posta hesabına verilir.`,
        `Ctrl+K ile "Ara ve git" paleti ve kısayollar, bildirim merkezi, kapı şeridi. Pazar ve Hazine'deki uydurma veriler (sahte satıcılar, uydurma "yakılan" sayıları) kaldırıldı; artık gerçek defterden okunuyor.`
      ]
    },
    {
      version: 'v1.42',
      title: '🔧 Oyun Motoru Baştan Yazıldı',
      date: '11 Ekim 2026',
      changes: [
        `Savaş motoru, ekonomi çekirdeği, oyuncu durumu, ordu, Dünya Bossu, Kolezyum, Karnaval, piyango ve promo kodu baştan yazıldı. Kurallar aynı kaldı: binlerce rastgele işlem eski kodla birebir karşılaştırıldı.`,
        `Bu sırada bulunan hatalar düzeltildi: dayanıklılığı 100 ve altı aletler her yüklemede bedava yenileniyordu. Kısmi toplamada alet aşınması atlanıyor ve XP şişiyordu. Haftalık ödeme payı dolunca görev ödülü kayboluyordu. Yükseltilmiş eşyanın geri dönüşümü ödenmemiş kömür veriyordu.`,
        `Saniyelik pasif iyileşmede can artmadan bedel kesiliyordu; düzeldi. İlan pazarında sahte konumla yoktan hammadde alınabiliyordu; kapandı. Bekleme sırasındaki hesaplar ödeme teklifi, promo kodu ve Kolezyum sırasına giremiyor.`,
        `Telefonda ağ zaman aşımı, çift dokunma, bozuk kayıt ve engellenmiş depolama gibi durumlar daha sağlam karşılanıyor.`
      ]
    },
    {
      version: 'v1.43',
      title: '🧰 Adalet Düzeltmeleri',
      date: '12 Ekim 2026',
      changes: [
        `İlan pazarında alıcı önce serbest bakiyesinden öder; kilitli ödeme satıcıda kilitli kalır (kilit aklama kapandı).`,
        `Kolezyum zafer ödülü maç başı 25 ASTRA tabana ayarlandı (eskiden kasa tohumunda ~800'e çıkabiliyordu). Bot ücreti kişisel Üretim Hakkı'na göre hesaplanır.`,
        `Ön hesap ele geçirme kapandı: e-posta doğrulama bağlantısı artık şifreyi yeniden belirletir.`
      ]
    },
    {
      version: 'v1.44',
      title: '💀 Yeni Zindan Ekranı ve Hammadde Dengesi',
      date: '13 Ekim 2026',
      changes: [
        `Zindan ekranı baştan yazıldı: kat ve oda görünümü, yeni resimler, Kütük (canavar resimleriyle), ordu şeridi ve "Aynı savaşı tekrarla".`,
        `Seviye atlama bedeli altı hammaddenin hepsini kapsıyor (kömür, taş ve şifalı ot artık gerçekten harcanıyor). Teçhizat yükseltme kömür ve taş, onarım kömür ister. Konseyin ortak stoğu kendiliğinden yapıya aktarılır, çelik payı kömürdür.`,
        `Fatih Ödülü: 18. katı ilk kez geçince, ordun için harcadığının zindanda geri dönmeyen kısmı ödül olarak gelir.`,
        `Çarkta sık gelen "bedelin geri" dilimleri yeni hammaddelere dağıtıldı. Dünya Bossu haftalık havuzu kasanın %3'ü olarak gösterilir. Yazı boyutu ayarı artık metni gerçekten büyütüyor. Eski risk duyurusu kaldırıldı.`
      ]
    },
    {
      version: 'v1.45',
      title: '🔒 Denetim Turu',
      date: '13-14 Ekim 2026',
      changes: [
        `Seviye bedeli silo kapasitesini aşmıyor. Zindanda günlük ve haftalık kişi ödeme tavanı, Kolezyum puanı ve ödül tavanı eklendi; hammadde dengesi izleniyor.`,
        `Sahte hesaplara karşı: e-posta benzersizliği (etiketli ve gmail noktalı adresler aynı sayılır) ve IP kotası (aynı ağdan 24 saatte 3 hesap; fazlası sırada bekler).`,
        `Giriş, doğrulama ve ödeme pencereleri ekran okuyuculara uygun; dar ekranda üst çubuk menüsü, açılış perdesi, ağ hatası mesajları, güvenli alan ve 429 yeniden deneme.`,
        `İki adımlı doğrulama: yedek kodlar daha güvenli saklanıyor ve Hesabım'dan yenilenebiliyor. Muhafız Mührü sıfırlama (telefon ve yedek kod kaybı için 48 saat bekleme, e-postadan iptal bağlantısı). Kalıcı bildirimler.`
      ]
    },
    {
      version: 'v1.46',
      title: '📖 Oyun Rehberi ve Yayın',
      date: '14-15 Ekim 2026',
      changes: [
        `Oyun artık roa.alphavaxtrade.com adresinde, deneme modunda yayında (sahte ASTRA, gerçek para yok).`,
        `Resimli ve örnekli oyuncu rehberi: 29 bölüm; sonradan "Teknik başvuru" bölümleriyle 47 bölüme çıktı (tüm limitler, seviye ve silo bedelleri, kota, çekim ve kasa formülleri; sayılar doğrudan oyun motorundan üretilir). Üst çubukta rehber düğmesi, Ben menüsünde ve Ctrl+K paletinde giriş var.`,
        `Rehberde çark, piyango, Kolezyum ligi, geri alım ve cephanelik bölümleri; sefer süresi ilk seviyede 18 dakika, silo dolunca ürün seferde bekler (kaybolmaz) gibi açıklamalar düzeltildi.`
      ]
    },
    {
      version: 'v1.47',
      title: '⚖️ Akış Dengesi ve Genesis Yolu',
      date: '15 Ekim 2026',
      changes: [
        `Asker seviyesi artık hesap seviyeni geçemez; fazla deneyim birikir ve hesabın seviyesi atlayınca kullanılır.`,
        `Oyundan çıkış (çekim) trade alımının yarısını geçemez. Oyuna tasarımın üstünde ASTRA girerse sabit ASTRA bedelleri de büyür (oyun içi fiyat endeksi).`,
        `Genesis yolu: seviye 30, 180 günlük hesap, Krallık Yolu, Fatih, son 4 haftanın her birinde Altın katkı, 18 eserin uyandırılması ve 250 $ değerinde mühür (yarısı yakılır) gerekir. Genesis NFT sözleşmesi (Sezon 1) hazırlandı.`
      ]
    },
    {
      version: 'v1.48',
      title: '📮 Sorun Bildir',
      date: '18 Ekim 2026',
      changes: [
        `Oyunda bir sorunla karşılaşırsan Daha menüsündeki "Sorun bildir" ile bize yazabilir, birden fazla ekran görüntüsü ekleyebilirsin. Her bildirime bir bilet numarası (RB-1001 gibi) verilir; durumunu ve cevabımızı aynı ekrandan görürsün.`
      ]
    },
    {
      version: 'v1.49',
      title: '⚔️ Ordu ve Zindan Dengesi',
      date: '18 Ekim 2026',
      changes: [
        `Asker hakkı artık zindanda geçtiğin kata bağlı: 1. katta 2 asker, her yeni katta 1 fazlası, 6. katta 7 asker. Sahip olduğun askerler hiçbir zaman silinmez.`,
        `Bu yüzden teçhizat önemli oldu: dövmek, geliştirmek, giymek ve bakımını yapmak (hammadde ve ASTRA harcar) zindanı geçmenin yolu. Askerin seviyesi hâlâ hesap seviyeni geçemez.`,
        `Zindandaki 18 canavar ve iki büyük patron baştan dengelendi: en hızlı oyuncu Normal modu yaklaşık 120 günde bitirir, patronlar tam takım ve doğru asker sayısıyla yenilebilir.`,
        `Kışla ekranında asker hakkın ve sıradaki hakkı nasıl açacağın görünür.`
      ]
    },
    {
      version: 'v1.50',
      title: '🔥 Zindan Modları',
      date: '18 Ekim 2026',
      changes: [
        `Normal modda 6 katı ve son canavarı (Kıyamet Ejderhası) bitirince zindan Zor, sonra Uzman, sonra Cehennem moduyla baştan açılabilir. Savaş sekmesindeki "Zindan modu" ekranından geçersin.`,
        `Geçiş için büyük miktarda hammadde (silo sınırına takılmamak için günlere yayarak verirsin, yakılır) ve ASTRA verilir. Zindan 1. kattan başlar, canavarlar çok daha güçlüdür.`,
        `Karşılığında zindandan kazandığın ASTRA ×1,5 / ×2,25 / ×3,5 olur; parça, kutu, eser ve parşömen düşme şansı da artar. Deneyim (XP) ödülü değişmez.`,
        `Her mod asker hakkını 6 artırır: Zor 8-13, Uzman 14-19, Cehennem 20-25. Bir savaşa en çok 25 asker götürebilirsin. Askerlerin ve teçhizatın modlar arasında korunur.`
      ]
    },
    {
      version: 'v1.51',
      title: '❤️ Savaş Canı Düzeltmesi',
      date: '18 Ekim 2026',
      changes: [
        `Zindan savaşına girerken askerin canı, teçhizatın verdiği can eklenmeden başlıyordu (çubuk 313 gösterirken savaş 100 ile başlıyordu). Düzeldi: tam sağlıklı asker teçhizatıyla birlikte tam canla savaşa girer, yaralı asker aynı oranda başlar. Kolezyum'da da aynı düzeltme yapıldı.`,
        `Askerler bu yüzden daha dayanıklı oldu; zindanın bütün modlarındaki canavarlar buna göre yeniden dengelendi (canavarlar daha çok can ve saldırıya sahip). Normal modu en hızlı oyuncunun ~120 günde bitirmesi hedefi aynı.`
      ]
    },
    {
      version: 'v1.52',
      title: '🗺️ Krallık Haritası Yenilendi',
      date: '18 Ekim 2026',
      changes: [
        `Krallık haritası baştan boyandı: bütün bölgeler (madenler, orman, kale, kolezyum, karnaval, silolar, kışla, uzay limanı...) aynı yerlerinde duruyor, ama harita artık gün batımı ışığında, daha sıcak renklerle ve daha zengin dokularla görünüyor.`,
        `Haritadaki dokunma noktaları ve bölge isimleri değişmedi; her şey önceki gibi çalışır.`,
        `Açılış (yükleme) ekranı da yenilendi: yeni harita görseli ve gökyüzünde Realm of AdAstra yazılı roketli logo.`
      ]
    },
    {
      version: 'v1.53',
      title: '🎡 Şans Çarkı Yenilendi',
      date: '18 Ekim 2026',
      changes: [
        `Çarka çarpan geldi: zaman kazanmak istersen 1 ASTRA yerine ×2 (2 ASTRA) ya da ×10 (10 ASTRA) ile çevirebilirsin. Ödemeler de aynı oranda büyür; ×10, on kez ×1 çevirmekle aynı şansı verir. Çarpan yalnız ASTRA ile çevirmede geçerli.`,
        `Ödül tablosu baştan kuruldu: nakit, hammadde, teçhizat parçası, çok nadir anahtar ve bot yanında artık 1 ASTRA değerinde stamina ve piyango bileti (1 bedava çark hakkı) de çıkıyor. Coin Analiz Bileti dilimi kaldırıldı.`,
        `Çarkın hiçbir ödülü havadan çıkmaz: hammadde, parça, anahtar ve stamina için Karnaval kasası pazardan gerçek fiyatla satın alır (stamina için buğday alıp yakar), pazarda yoksa ödülün ASTRA karşılığı ödenir.`,
        `Yeni Şans Sayacı: art arda 8 çevirmede bedelini geri alamazsan sonraki çevirme garantili 3 ASTRA nakittir. Sayaç çark ekranında görünür.`,
        `Çevirme bedelinin Karnaval kasasına giren payı %80'den %85'e çıktı (kasa uzun vadede büyüsün, oyunun ömrü uzasın). Ortalama dönüş yaklaşık %72 (Şans Sayacı hariç); oran tablosu ve rehber güncellendi.`
      ]
    },
    {
      version: 'v1.54',
      title: '🏟️ Kolezyum Girişi ve Anahtar',
      date: '18 Ekim 2026',
      changes: [
        `Kolezyuma artık anahtarla değil ASTRA ödeyerek girilir: maç başına 10 ASTRA (+ stamina). Ücretin %70'i arena kasasına girer (ödüller oradan çıkar), kalanı yakım ve öteki kasalara dağılır. Gerçek rakip sırasında ücret maç bulunana kadar emanette bekler; sıradan çıkarsan tamamen iade edilir.`,
        `Anahtar artık yalnız kilitli Pandora kutusunu açar, oyundaki en değerli ikinci şeydir. Her zaferde %25 anahtar düşmesi kaldırıldı; Kolezyum haftalık sıralamasında 1. olan 1 anahtar kazanır (arena kasası pazardan gerçek fiyatla satın alıp verir). Anahtar ayrıca çarktan çok nadir çıkar ya da pazardan alınır.`,
        `"Arena Anahtarı" adı her yerde "Anahtar" oldu.`
      ]
    },
    {
      version: 'v1.55',
      title: '⚒️ Demirhane ve Telefon Ekranı',
      date: '18 Ekim 2026',
      changes: [
        `Demirhane'de eşya geliştirirken de dövmedeki gibi "Eksikleri al ve geliştir" düğmesi var: geliştirmek için demir, odun, kömür, taş ya da teçhizat parçası yetmiyorsa eksikler pazardan tek onayla alınır ve eşya hemen geliştirilir. Tahmini ASTRA bedeli düğmenin üstünde yazar.`,
        `Telefonda haritanın altındaki iki şerit (Kralın Danışmanı ve Krallık Yolu) inceltildi, harita daha çok görünüyor. Danışman kartına ✕ eklendi: kapattığın öneri bu oturumda geri gelmez, öneri değişince kart yeniden görünür.`,
        `Karakter menüsünde seviye atlama bedelini gösteren satırlarda hammadde resimleri devasa görünüyordu; artık satırla aynı boyutta küçük simge olarak çıkıyor.`
      ]
    },
    {
      version: 'v1.56',
      title: '🩹 Zindanda Hızlı İyileştirme ve Eşya Aşınması',
      date: '18 Ekim 2026',
      changes: [
        `Zindan ekranındaki ordu şeridinde yaralı asker varsa "🩹 Hızlı iyileştir" düğmesi çıkıyor: Kışla'ya ya da Şifahane'ye gitmeden bütün yaralıları anında iyileştirir. Buğday eksikse pazardan alınır, bedel onay penceresinde yazar.`,
        `Zindan savaşında aşınma artık yalnız silaha binmiyor: savaşa giren her askerin takılı eşyalarından (silah, miğfer, zırh, pantolon, çizme) rastgele biri 1 dayanıklılık kaybeder. Sağlam parça varken kırık parça seçilmez.`,
        `Demirhane > Eşyalarım > Toplu işlemler: eksik malzeme varsa "⚡ Eksikleri al ve geliştir" düğmesi çıkıyor. Eksikler pazardan sırayla alınıp bütün eşyalar (ya da seçtiğin tür ve seviye) tek onayla geliştiriliyor.`
      ]
    },
    {
      version: 'v1.57',
      title: '🌿 Şifalı Ot ile İyileştirme',
      date: '18 Ekim 2026',
      changes: [
        `Hemen iyileştirmenin tek yolu artık şifalı ot. Buğdayla anında iyileştirme kalktı (buğdayın zaten çok kullanımı var; şifalı otun sürekli harcandığı tek yer burası). 1 şifalı ot 2 can iyileştirir (eskiden 5), kullanılan ot yakılır; ASTRA payı can başına 0,01 ASTRA, yarı indirim yok. Böylece şifalı otun fiyatı sürekli yukarı basınç görür. Beklemek istemeyenler için askerler 24 saatte kendiliğinden (az buğdayla) iyileşmeye devam eder.`,
        `"Hızlı iyileştir" düğmeleri şifalı ota bağlandı: Zindan ekranı, Kışla (asker sayfası, "Hepsini iyileştir", "Orduyu hazırla"), Şifahane, Krallık merkezi ve Kolezyum. Elindeki şifalı ot yetmezse eksik ot pazardan alınıp iyileştirme aynı tıkta yapılır; bedel onay penceresinde yazar. Şifahane ekranına "iyileştirmenin üç yolu" açıklaması eklendi.`,
        `Can sayıları tutarlı: askerinin canı Kışla, Savaşa hazırlan ve Kolezyum ekranlarında artık teçhizat ve set bonusu dahil aynı sayıyla görünüyor (eskiden Kışla "125/125", Savaşa hazırlan "125 HP" derken en yüksek can 935 yazıyordu).`
      ]
    },
    {
      version: 'v1.58',
      title: '🛡️ Zindanda Derinleştikçe Artan Aşınma',
      date: '18 Ekim 2026',
      changes: [
        `Zindan savaşlarında aşınan eşya sayısı artık kata, zindan moduna ve büyük bosslara göre artıyor. Savaşa giren her askerin takılı eşyalarından rastgele seçilen birkaç tanesi birer dayanıklılık kaybeder; aynı eşya bir savaşta iki kez aşınmaz. Ortalama aşınan eşya: Normal 1,0 (1. kat) - 2,0 (6. kat), Zor 1,6 - 2,6, Uzman 2,2 - 3,2, Cehennem 2,8 - 3,8; büyük bosslarda +0,5. Savaşa hazırlan ekranı o canavar için sayıyı gösterir.`
      ]
    },
    {
      version: 'v1.59',
      title: '🆕 Yeni Sürüm Bildirimi ve Çark Stamina Düzeltmesi',
      date: '18 Ekim 2026',
      changes: [
        `Her yeni sürüm geldiğinde zil panelinde "🆕 Yeni sürüm geldi" bildirimi çıkıyor ve yanındaki "Oku" düğmesi doğrudan Sürüm geçmişini açıyor. Sürüm geçmişini açınca ya da bildirimi temizleyince o sürüm okundu sayılır, bir daha çıkmaz. Yeni hesaplara çıkmaz.`,
        `Çarktan stamina ödülü düştüğünde stamina deposu kısmen boşsa sığmayan kısmın değeri artık kaybolmuyor: depo dolana kadar stamina verilir, kalanın değeri ASTRA olarak ödenir (depo tamamen doluysa zaten tamamı ASTRA ödeniyordu).`
      ]
    },
    {
      version: 'v1.60',
      title: '🌿 Şifalı Ot Bedeli Ekrandaki Cana Göre',
      date: '18 Ekim 2026',
      changes: [
        `Şifalı otla iyileştirmenin bedeli artık ekranda gördüğün can sayısına göre hesaplanıyor (teçhizat ve set bonusu dahil): 1 ot 2 can iyileştirir, can başına 0,01 ASTRA. Eskiden bedel gizli "taban can" üzerinden hesaplanıyordu, bu yüzden 580/966 canlı askerin iyileştirmesi "31 ot + 0 ASTRA" yazıyordu; şimdi 193 ot ve doğru ASTRA yazar. Güçlü teçhizatlı asker daha çok can taşıdığı için iyileştirmesi daha çok şifalı ot yakar.`,
        `"Hızlı iyileştir" artık silo küçükken de çalışır: bir askerin tam bedeli siloya sığmıyorsa eksik ot parça parça alınıp tur tur iyileştirilir. Kısa ASTRA bedelleri artık "0" yerine küsuratıyla (ör. 3,86) gösteriliyor.`,
        `Kapsamlı tarama düzeltmeleri: Kotalarım ekranı zindan kasasının günlük ödeme payını "%1" yazıyordu, gerçek oran %0,36 (artık ayardan okunuyor); 1 ASTRA'nın altındaki tutarlar (hazine, karnaval, savaş alanı, seviye atlama gibi ekranlarda) "0" görünüyordu, artık küsuratıyla yazılıyor; Ekonomi panosundaki "-0%" yazımı "0%" oldu; Kolezyum ve Danışman metinlerinde kalan "buğdayla iyileştir" ifadeleri şifalı ota çevrildi; Kolezyum'da "ağır yaralı" uyarısı artık ekrandaki can sayısını gösteriyor; Ordu İyileştirme Parşömeni artık "+10 HP" yerine canın yaklaşık %7-10'unu yenilediğini ve ekrandaki can sayısıyla sonucu yazıyor.`
      ]
    },
    {
      version: 'v1.61',
      title: '📜 Parşömen Küçüldü, Şifalı Ot Öne Çıktı',
      date: '18 Ekim 2026',
      changes: [
        `Ordu İyileştirme Parşömeni artık bir askere ekrandaki canla 4 can veriyor (2 şifalı otun karşılığı). Eskiden aynı parşömen, 8 kat ucuza gelen bir iyileştirme yolu açıyordu ve şifalı otun yakılma amacını zayıflatıyordu; şimdi büyük iyileştirmelerde şifalı ot daha ucuz, parşömen ise ot ve ASTRA harcamadan tek dokunuşluk küçük bir destek. Elindeki parşömenler silinmez.`
      ]
    },
    {
      version: 'v1.62',
      title: '🌿 Kendiliğinden İyileşme Şifalı Otla, Antrenman Girişi Kalktı',
      date: '18 Ekim 2026',
      changes: [
        `Kendiliğinden iyileşme de artık şifalı otla: askerler yine 24 saatte tam cana kavuşur, ama bu sırada ekrandaki her can için 0,1 şifalı ot ve 0,002 ASTRA harcanır (hemen iyileştirmenin tam beşte biri; buğday artık harcanmaz). Ot ya da ASTRA biterse iyileşme eldekinin yettiği kadar sürüp durur. Kışla'da askerin sayfasında ve Şifahane'de "Kendiliğinden" ile "Hemen" seçeneklerinin ne harcayacağı yan yana ve canlı yazılıyor.`,
        `Düzeltme: "Eksik otu al ve iyileştir" düğmesindeki tutar Kışla'da 5,51 ASTRA, Şifahane'de 6 ASTRA görünüyordu (aynı sayı, farklı yuvarlama). Artık Kışla, Şifahane ve Zindan aynı yazıyla aynı tutarı gösteriyor.`,
        `Antrenman girişi kaldırıldı: günlük harçsız girişlerin bitince zindana girmenin tek yolu kapı harcı. Harç ödenmezse giriş yok (stamina düşmez, giriş sayılmaz); harçlı giriş her zaman ödüllüdür. Kasanın günlük ödeme bütçesi dolduysa yeni giriş ertesi güne kalır. Savaşa hazırlık ekranındaki kapı harcı kutusu kalktı: harç, savaşa başlarken düğmede yazan tutarla ödenir.`
      ]
    },
    {
      version: 'v1.63',
      title: '🧩 Onarım Artık Teçhizat Parçası İstiyor',
      date: '18 Ekim 2026',
      changes: [
        `Eşya onarımı artık teçhizat parçası da ister: eşyaya o güne kadar harcanan parçanın %10'u × hasar oranı (en az 1). Parça bedeli seviyeyle kabaca ikiye katlanır: seviye 5 eşya tam hasarda yaklaşık 3, seviye 9 yaklaşık 51 parça. Hem tek eşya hem "Kırılan her şeyi onar" parça yakar; Demirhane'de hasarlı eşyaların toplam bedeli (parça dahil) yazıyor.`,
        `Yeni: "⚡ Eksikleri al ve onar" (Demirhane'de her eşyada ve toplu olarak, Kışla'da askerin üzerindeki eşyada ve Cephanelik'te). Eksik odun, demir, kömür ve parça pazardan alınır, eşyalar tek tek onarılır; alım ve onarım bedeli onay ekranında yazar.`,
        `Parça havuzu küçüldü ve parça fiyatı artık kullanımla yükselecek: havuz 4 milyon ASTRA'dan 180 bin ASTRA'ya indi (fiyat aynı kaldı, 0,45 civarı), fiyat tavanı 1,125'ten 4,5 ASTRA'ya çıktı. Çıkan ASTRA kaybolmadı: yarısı Karnaval ödül havuzuna, yarısı pazar geri alım kasasına girdi. Parça yakıldıkça havuzdaki mal azaldığı için fiyat zamanla yükselir; zindandan düşen parça da ona göre değer kazanır.`
      ]
    },
    {
      version: 'v1.64',
      title: '🔑 Anahtar Yalnız Oyuncular Arasında, Pandora Kutusu Satılmaz',
      date: '19 Ekim 2026',
      changes: [
        `Pandora kutusu ve Anahtar takas havuzundan kalktı: kutu artık hiçbir yerde alınıp satılmaz (yalnız zindandan düşer); anahtar yalnız oyuncudan oyuncuya satılır. Pazar > İlanlar sekmesinde "Anahtar sat" formu var: kaç anahtar ve TANESİ kaç ASTRA yazarsın, ilan 7 gün açık kalır. Alıcı ilandan istediği kadar anahtar alabilir (örneğin 8 anahtarlık ilandan 3'ünü); kalan adetle ilan açık kalır. Komisyon ve kilitli pay kuralları teçhizat ilanlarıyla aynı. İstediğin an ilanı geri çekebilirsin, satılmayan anahtarlar sana döner.`,
        `Anahtar kaynağı değişti: Kolezyum haftalık sıralamasında artık ilk 3 oyuncunun her biri 1 anahtar kazanır (eskiden yalnız 1.). Anahtar havadan çıkıyor, arena kasasından ASTRA ödenmiyor; değeri oyuncuların ilan fiyatı belirler. Şans Çarkından da anahtar çıkmıyor (çarkta 17 dilim + Şans Sayacı kaldı, 0,5 ASTRA teselli ödülü bu payı aldı; toplam şans aynı).`,
        `Kaldırılan iki havuzdaki ASTRA kaybolmadı: yarısı Karnaval ödül havuzuna, yarısı pazar geri alım kasasına girdi. Eldeki kutu ve anahtarlar korunur; mevcut kutuyu elindeki anahtarla yine açarsın.`
      ]
    },
    {
      version: 'v1.65',
      title: '⚡ Her Yerde "Eksikleri Al"; Silo Parçayı Gösteriyor',
      date: '19 Ekim 2026',
      changes: [
        `Malzemen yetmediğinde artık şu yerlerde de tek dokunuşla "⚡ Eksikleri al ve ...": Köy evleri (ev yap), Uzay Limanı (roketi yap), hammadde bölgelerinde alet tamiri (odun + demir) ve Zindan modunda geçiş için gereken hammaddenin katkısı. Eksik malzeme pazardan alınır, bedel (alım + işin kendi ASTRA'sı) onay ekranında yazar. Geçiş katkısında silo hepsini birden tutamıyorsa al-yak-tekrar şeklinde tur tur ilerler.`,
        `Silo ekranında artık Teçhizat parçası satırı da var (doluluk / kapasite). Parçanın silo sınırı vardı ama ekranda görünmüyordu; pazardan çok parça almaya çalışınca "Silo kapasitesi aşılamaz" uyarısı neden geldiğini göstermiyordu. Parça kapasitesi silo seviyesiyle büyür.`
      ]
    },
    {
      version: 'v1.66',
      title: '🏷️ İlan Pazarında Kutu ve Eser Satışı, Süzgeç ve En Ucuzdan Sıralama',
      date: '19 Ekim 2026',
      changes: [
        `Pandora kutusu ve koleksiyon eserleri de artık İlan Pazarı'nda satılabilir (Pazar > İlanlar). Anahtarla aynı toplu satış: kaç tane ve TANESİ kaç ASTRA yazarsın, alıcı istediği kadarını alır. Satış formunda anahtar, kutu ve elindeki her eser seçilebilir. Komisyon (%2) ve kilitli pay kuralları aynı. Kural: uyandırdığın (ya da uyandırmakta olduğun) eserin son kopyası satılamaz; Genesis yolun bozulmasın. Alıcıda eser keşfedilmiş sayılır; son kopyasını satan, eseri koleksiyonundan çıkarır (satılmazsa ya da ilan geri çekilirse geri döner).`,
        `İlanlar listesine süzgeç eklendi: tür düğmeleri (Anahtar, Pandora kutusu, Eser, Silah, Miğfer, Zırh, Pantolon, Bot; yanlarında kaç ilan olduğu yazar), ad araması (örn. "kılıç", "balçık") ve sıralama. Varsayılan sıra EN UCUZDAN PAHALIYA: en ucuz ilan en üstte durur ve "en ucuz" etiketi taşır, tek dokunuşla alırsın. İstersen en pahalıdan, en yeni ya da en eski sırasına geçebilirsin. Çok ilan olunca ilk 100'ü gösterilir; aramayı daraltabilirsin.`,
        `Hata düzeltildi: oyun kaydı yüklenirken koleksiyon eserlerinin kopya sayısı ve "uyandı" bilgisi siliniyordu (yalnız "keşfedildi" bilgisi korunuyordu). Artık ikisi de kayıtta kalıyor; Genesis yolunda uyandırdığın eserler sayfayı yenileyince kaybolmaz.`
      ]
    },
    {
      version: 'v1.67',
      title: '🎟️ Piyango Kazancında Tüm Biletler Yanar, Savaş Alanında Toplam Can Görünür',
      date: '19 Ekim 2026',
      changes: [
        `Piyango kazancını çektiğin an elindeki BÜTÜN biletler yanar (eskiden yalnız kazanan biletler sayılıyordu, çekimden sonra elinde kalan bilet yanmıyordu). Ödül, elindeki biletlere ödediğinin 2 katı olduğu için biletlerle ödül birlikte kapanır. Kazancın çekilmeyi beklerken yeni bilet alınamaz ("önce kazancını çek"), böylece yeni biletin parası çekimde boşa gitmez.`,
        `Savaş Alanı ekranında "Can katkısı" sayısı toplam can sanılıyordu: 4 asker 4.240 canlıyken ekranda 1.060 yazıyordu, çünkü can hasara dörtte biriyle (1:0,25) katılır. Ekran artık önce toplam saldırı ve toplam canı (teçhizat ve set bonusu dahil, Kışla'daki sayılarla aynı) gösterir; altında hasarın nasıl hesaplandığı yazar: saldırı + can × 0,25, yetenek çeşitliliği çarpanıyla. Hasar hesabı değişmedi, yalnız gösterim.`
      ]
    },
    {
      version: 'v1.68',
      title: '📈 Pazarda Eşya Başına Fiyat Grafiği',
      date: '19 Ekim 2026',
      changes: [
        `Pazar > Al / Sat ekranında seçtiğin eşyanın (buğday, odun, taş, kömür, demir, şifalı ot, teçhizat parçası) altında artık coin grafiği gibi bir fiyat grafiği var. 24 saat, 7 gün ve 30 gün arasında geçebilirsin; grafikle birlikte açılış, en yüksek, en düşük, şimdiki fiyat ve yüzde değişim yazar. Yeşil yükselişi, kırmızı düşüşü gösterir. Grafiğin üzerinde fareyle gezinince (telefonda parmağını sürükleyince, klavyede sağ-sol ok tuşlarıyla) o andaki fiyat, zaman ve açılışa göre değişim bir balonda görünür.`,
        `Fiyatlar artık kaydediliyor: her eşyanın fiyatı en az 5 dakikada bir (büyük sıçramalar hemen) not edilir; 2 günden eski kayıtlar saatliğe sıkıştırılır, 30 günden eskiler silinir. Grafik bugünden başlar: geçmiş ilk güncellemeden önce tutulmadığı için ilk saatlerde çizgi kısa görünür, zamanla dolar. Çevrimiçi oyunda herkes aynı ortak pazarın geçmişini görür.`
      ]
    },
    {
      version: 'v1.69',
      title: '🎟️ Piyango Bileti Günlük 100, İlan Süzgeci Taşmıyor',
      date: '19 Ekim 2026',
      changes: [
        `Piyango bilet alım sınırı artık GÜNLÜK: bir hesap günde en fazla 100 bilet alabilir (eskiden haftada 100'dü). Gün, Türkiye saatiyle gece yarısı yenilenir. Kazanmayan biletler yine yanmaz, kazanana kadar sonraki haftalara devreder. Kalan hakkını Karnaval > Piyango ekranında ve Kotalar'ın günlük bölümünde görebilirsin.`,
        `Pazar > İlanlar'daki tür düğmeleri (Anahtar, Pandora kutusu, Eser, Silah, Miğfer, Zırh, Pantolon, Bot) artık ekrandan taşmaz: sığmayanlar alt satıra geçer. Eskiden satır yana kayıyordu ama fareyle kaydırılamadığı için sağdaki düğmelere ulaşılamıyordu. Al / Sat ekranındaki eşya seçme düğmeleri de aynı şekilde düzeltildi.`
      ]
    },
    {
      version: 'v1.70',
      title: '🎁 Tüm Ödülleri Topla, Bot Ücreti Dökümü ve Zindan Mesajı',
      date: '19 Ekim 2026',
      changes: [
        `Taverna > Bot > "Ücret nasıl hesaplanıyor?" tablosu düzeltildi: rakamlar toplamı tutmuyordu (üretim 930, stamina −47, alet −138 yazıp net kâr 236 görünüyordu). Eksik satır, günlük Üretim Hakkı sınırıydı: o gün alabileceğin miktar üretimin tamamından azsa bot kârı o kadarla sınırlanır ve bu kesinti tabloda yoktu. Artık "Günlük Üretim Hakkı sınırı" satırı ayrıca görünür, tablo toplamı tutar. Bot ücreti hesabı değişmedi: net kârın yarısı.`,
        `Zindan'da "Zindan kasasının bugünkü ödeme bütçesi doldu" uyarısı tüm oyuncular için sanılıyordu. Bu sınır yalnız senin hesabının o günkü zindan ödeme payıdır (kasanın günlük payı ile günlük kişisel tavanından küçüğü); başka oyuncuların girişini etkilemez. Mesaj bunu açıkça söyleyecek şekilde yenilendi ("Bugünkü zindan ödeme payını doldurdun…"). Her gece 00:00'da (TSİ) yenilenir.`,
        `Krallık Yolu: hazır ödüllerin hepsini tek tek almak yerine haritadaki Krallık Yolu kartında ve panelin üstünde "Tümünü topla" düğmesi var. Hazır görev ödülleri, tamamlanan bölümlerin ödülleri ve açıldıysa final unvanı tek dokunuşta alınır. Haftalık ödeme payı dolarsa o noktada durur; alınmayan ödüller kaybolmaz, yeni haftada tekrar basınca alınır.`,
      ]
    },
{
      version: 'v1.71',
      title: '⚔️ Zindanda Savaş İki Kez Oynanıyordu',
      date: '19 Ekim 2026',
      changes: [
        `Zindan savaşında düşman yenilince canı sıfır olup kartı soluklaşıyor, sonra can yeniden doluyor ve aynı düşmanı bir kez daha yeniyor gibi görünüyordu. İkinci bir canavar yoktu: çevrimiçi oyunda savaş kaydı arenada baştan sona İKİ KEZ oynatılıyordu (hasar, ölüm ve yetenek satırları iki kez görünüyordu). Düzeltildi: savaş artık tek sefer oynuyor. Sonuç, ödül ve kalan can hesabı zaten tek savaşa göre yapılıyordu, onlar değişmedi.`
      ]
    },
    {
      version: 'v1.72',
      title: '🎲 Sahte Piyango Bildirimleri Kaldırıldı',
      date: '19 Ekim 2026',
      changes: [
        `Karnaval bildirimlerinde "Haftalık çekiliş yapıldı, bu hafta sana çıkmadı" ile "Piyango sana çıktı!" mesajları arka arkaya, birbiriyle çelişerek geliyordu. Sebep: oyun, tarayıcıda sunucudan bağımsız ikinci bir sahte çekiliş yapıp sahte kazanç bildirimi üretiyordu. Artık çekilişi yalnız sunucu yapıyor; gelen bildirim gerçek çekilişin sonucudur. Gerçek biletlerin, ödülün ve kasanın hesabı hiç değişmedi.`
      ]
    },
    {
      version: 'v1.73',
      title: '🏦 Piyango Kasası Küçüldü, Fazlası Üç Kasaya Dağıtıldı',
      date: '19 Ekim 2026',
      changes: [
        `Piyango kasası 4 milyon ASTRA'ya indirildi. Günlük 100 bilet sınırıyla bile kasa 20 yılda bitmiyordu ve en büyük tek kazanç yaklaşık 1 milyonu geçmiyordu; fazlası boşta duruyordu. Artan ASTRA üçe eşit bölünüp Zindan, Kolezyum ve Dünya Boss kasalarına eklendi. Bu üç kasanın haftalık ödeme payı kasayla birlikte büyür, yani oyunculara bu alanlardan daha çok ödül çıkabilir. Piyango kuralları (1 ASTRA bilet, kazanana 2 katı, günlük 100 bilet) değişmedi.`
      ]
    },
    {
      version: 'v1.74',
      title: '🏦 Zindan Ödeme Payı Uyarıları Tutarlı',
      date: '19 Ekim 2026',
      changes: [
        `Zindan savaşa hazırlık ekranında ödeme payı dolduğunda iki uyarı birbiriyle çelişiyordu: biri "bugün yeni giriş yapılamaz", diğeri "bu zaferden ASTRA gelmez; deneyim ve ganimet sürer" diyordu. İkincisi yalnız günlük harçsız girişlerin sürdüğü zaman doğrudur. Harçlı giriş ödeme payı yüzünden engelliyken artık yalnızca engel uyarısı gösteriliyor.`
      ]
    },
    {
      version: 'v1.75',
      title: '🔁 Kasalar Birbirini Besliyor, Ödeme Payı Dolunca da Zindana Girilir',
      date: '19 Ekim 2026',
      changes: [
        `Zindan: günlük ödeme payın (tavanın) dolduktan sonra da kapı harcıyla girebilirsin. Bu girişlerde ASTRA kazanılmaz; deneyim ve ganimet sürer, silahlar aşınır, stamina harcanır. Harç iki kat olur ve oyun kasalarına girer. Günde en fazla 15 ek giriş yapılır.`,
        `Kasalar artık birbirini besliyor: zindan kapı harcının, çark bedelinin ve Kolezyum ücretinin yalnız %60 / %80 / %60'ı kendi kasasına gider (eskiden %100 / %85 / %70). Kalanı yakıma, yapımcı payına, temel gelire ve bütün kasalara dağılır. Böylece oyunun her yeri hem kendini hem diğer yerleri besler ve yakım artar.`,
        `Kasa payları ödeme kapasitesine göre yeniden ayarlandı: Zindan %21, Kolezyum %9, Dünya Boss %17, Pazar Geri Alım %21, Görev %13, Karnaval %9 (Fatih ve Konsey %5'er). Dünya Boss ve Geri Alım kasaları eskiden aç kalıyordu, zindan ve çark kasaları şişiyordu.`,
        `Taşma kuralı: bir kasa başlangıç bakiyesinin 1,25 katını geçerse, ona gelecek fazla ASTRA en aç kasalara akar. Toplam ASTRA değişmez.`
      ]
    },
    {
      version: 'v1.76',
      title: '🏦 Kasa Bakiyeleri Artık Yeniden Başlatmada Korunuyor',
      date: '19 Ekim 2026',
      changes: [
        `Sunucu yeniden başlatılınca (her yeni sürüm yüklemesinde) bütün oyun kasalarının bakiyesi başlangıç değerine dönüyordu: o ana kadar kasalardan ödenen ve kasalara giren küçük farklar siliniyordu. Düzeltildi: kasa bakiyeleri artık diskten okunuyor ve korunuyor.`,
        `Piyango kasasının 4 milyona indirilmesinde bu hata yüzünden fazlanın yarısı kasalara yazılamamıştı. Eksik kalan 8.000.090 ASTRA, Zindan, Kolezyum ve Dünya Boss kasalarına eşit şekilde eklendi (her birine yaklaşık 2,67 milyon daha; toplamda her birine 5,33 milyon).`
      ]
    },
    {
      version: 'v1.77',
      title: '📱 Telefon Düzeltmeleri, XP Çubuğu, Seviye Bildirimi ve Büyük Silo',
      date: '19 Ekim 2026',
      changes: [
        `Sol üstteki seviye göstergesinin altında artık iki ince çubuk var: üstteki altın rengi çubuk deneyim (XP) çubuğudur (dolunca yeşil olur), alttaki mavi çubuk staminadır. Eskiden orada yalnızca stamina çubuğu vardı ve deneyim dolsa bile bir şey göstermiyordu. Üstüne basınca (ya da basılı tutunca) deneyim ve stamina rakamları görünür.`,
        `Telefonda zindan ekranında parça ve Pandora kutusu düşme şansı artık görünüyor (masaüstündeki gibi); başlığın ikinci satırında duruyor.`,
        `Telefonda Şifahane ve benzer listelerde asker satırı bozuktu: uzun düğme yazısı metni dar bir sütuna sıkıştırıyordu. Artık metin tam genişlikte, düğme altında.`,
        `Silo artık 18. seviyeye kadar yükseltilebiliyor (eskiden Universe açılana kadar 12. seviyede kilitliydi). 12. seviye buğdayda 12.976, taşta 6.298 alıyordu; 18. seviye 73.500 ve 30.000 alıyor. Yükseltme bedeli (kapasitenin yarısı + pazar karşılığı ASTRA) ve "%80 dolu olmalı" şartı aynı. Hesap seviyesi atlamak için gereken hammadde bedelleri bundan etkilenmez: silo büyüdü diye seviye atlamak pahalanmaz.`,
        `Karnaval'da bilet alım sınırı dolunca "Bu haftalık alım sınırın doldu" yazıyordu; sınır günlük (100 bilet) ve gece yarısı yenilendiği için metin düzeltildi: "Bugünkü bilet alım sınırın doldu. Gece yarısı (00:00 TSİ) yenilenir."`,
        `Zindanda zaferden sonra deneyim (XP) çubuğun dolduysa ve hesabını yükseltebiliyorsan bildirim geliyor: zafer kartında "🆙 Hesabı yükselt" düğmesiyle Karakterim ekranına gidersin; zindan haritasında da XP dolu kaldıkça ince bir uyarı şeridi duruyor. Hesabı yükseltince askerlerinin biriken XP'si de seviyeye dönüyor (asker seviyesi hesap seviyesini geçemediği için bekleyen XP).`,
        `Zindan savaşa hazırlık ekranında artık "Bugünkü ASTRA kazancın" çubuğu var (ör. 96,8 / 121,5): günlük ödeme tavanından ne kadarını kullandığını ve ne kadar kaldığını gösterir. Tavan, ulaştığın en değerli katın ödülünün 5 katı ya da orduya harcadığının günlük payıdır (hangisi büyükse); yeni bir boss katını açınca tavan yükselir, bu yüzden dolmuş görünen tavan açılınca ödül yeniden gelir.`
      ]
    },
    {
      version: 'v1.78',
      title: '🏛️ Konsey Binası Tek Ekran, Kasa Bakiyesi Onarımı',
      date: '19 Ekim 2026',
      changes: [
        `Haritada Sirius Konseyi binasına tıklayınca "Hazine" ekranı açılıyor, menüden tıklayınca "Sirius Konseyi" ekranı açılıyordu. Artık ikisi de Sirius Konseyi'ni açar; Konsey ekranının altındaki "Oyun kasaları (Hazine)" düğmesi ASTRA kasalarını gösteren Hazine ekranına götürür.`,
        `Piyango kasasının küçültülmesinde (v1.73) kasalara yazılamayan ASTRA'nın geri eklenmesi tamamlandı: Zindan, Kolezyum ve Dünya Boss kasalarına toplam 8.000.090 ASTRA eklendi (bir önceki onarım, bu arada bilet satıldığı için eşleşmemişti).`
      ]
    },
    {
      version: 'v1.79',
      title: '💰 Gelişim Bedelleri 5 Kat, Silo 49. Seviyeye, Bakiye Yazısı',
      date: '19 Ekim 2026',
      changes: [
        `Tek seferlik gelişim bedelleri yaklaşık 5 kat pahalandı: teçhizat yükseltmesi (1→10 toplamı ~x4,8), köy evleri (~x5), hesap seviye atlama (4. seviyeden başlayıp 10. seviyede x5), asker ASTRA bedeli (1. asker 250, 18. asker 90.000) ve teçhizat parçası bedeli (4. basamaktan itibaren x2). Yeni oyuncunun ilk adımları (ilk takım, ilk yükseltme, ilk ev, 4. seviyeye kadar seviye atlama) eskisi gibi kaldı. Tekrar eden harcamalar (stamina, onarım, iyileştirme) değişmedi.`,
        `Silo artık 49. seviyeye kadar yükseltilir (18. seviyeden sonra her seviye kapasite x1,08; 49. seviye buğdayda yaklaşık 799 bin). Yeni kural: yükseltmek için tüm depolar en az %70 dolu olmalı ve bedel, silonun %70'ini dolduran miktarın tamamı kadar hammadde ile o hammaddelerin anlık pazar fiyatı toplamı kadar ASTRA'dır.`,
        `Bakiye yazısı düzeltildi: dar ekranda 964 bin ASTRA "964,64 B" diye yazılıyordu ve milyar sanılıyordu. Artık kısaltmalar açık: "Bin", "Mn" (milyon), "Mr" (milyar).`
      ]
    },
    {
      version: 'v1.80',
      title: '🚀 UOA Tohumu: Harcamanın Yüzde 4 Payı İkinci Oyun İçin Birikiyor',
      date: '19 Ekim 2026',
      changes: [
        `Oyunda harcanan her ASTRA'nın %4'ü artık "UOA tohumu" kasasında birikiyor (ikinci oyun UOA açıldığında oradaki ilk kasaları ve hammadde pazarı havuzlarını oluşturacak). Kasa kilitli: UOA açılana kadar hiçbir ödeme çıkmaz. Hazine ekranında 🚀 UOA Tohumu olarak görünür.`,
        `Sirius Konseyi kasası (10 milyon) ve Universe Tohum Rezervi (20 milyon) kaldırıldı; hiçbirinden ödeme çıkmıyordu. Konsey kasası yedi kasaya eşit bölündü (zindan, kolezyum, dünya boss, geri alım, görev, karnaval, Fatih); Universe rezervi altı ödeme kasasına ödeme kapasitesiyle orantılı dağıtıldı. Toplam ASTRA aynı kaldı. Konsey projeleri ve Otorite aynen çalışıyor (onlar hammadde ister, kasa ASTRA'sı değil).`
      ]
    },
    {
      version: 'v1.81',
      title: '📦 Oyun Çok Hammadde İster, Sen Az Çıkarırsın',
      date: '19 Ekim 2026',
      changes: [
        `Oyunun yeni temel mantığı: oyunun istediği hammadde çok fazla, oyuncunun çıkarabildiği çok az. Geliştirme bedelleri (seviye atlama, silo, köy evi, teçhizat yükseltme, Konsey, roket, zindan modu) ve en üst silo kapasiteleri eskisinin 50 katına tırmanıyor; çıkarabildiğin hammadde (sefer üretimi, haftalık hak, başlangıç envanteri, 1. silo) yalnız 5 kat. İlk seviyeler ve ilk evler/yükseltmeler eskisi gibi kolay; zorluk seviyeyle birlikte artıyor (hesap seviyesi 4'ten 20'ye, ev 2'den 12'ye, teçhizat 1'den 10'a).`,
        `Pazar fiyatları (ASTRA/birim) ve havuzlar AYNI. Neden: ASTRA atıp hesabını hemen fullemek isteyenler hammaddeyi pazardan toplu alınca fiyat gerçekten yukarı çıksın; bu parayı seferle hammadde çıkarıp satan oyuncular kazansın. Fiyat tavanı açılışın 5 katına çıktı (eskiden 2,5), taban yarısı. İki büyük harcayıcı bir hesabı tamamen geliştirecek kadar hammadde alırsa tüm fiyatlar tavana dayanır; üçüncüsü pazarda neredeyse hiçbir şey bulamaz. Tek bir hesabı tamamen geliştirmek yaklaşık 6 dolarlık ASTRA (eskiden yaklaşık 9 sent).`,
        `Haftalık hammadde çıkarma hakkın hesap seviyene, katkı kademene (oyunda harcadığın ASTRA), aktifliğine ve Konsey Otoritesi'ne bağlı; ne kadar çok katkı yaparsan o kadar çok çıkarırsın. Tekrar eden giderler (stamina için buğday, alet onarımı, köylü yemi, ot ile iyileştirme, bot önkoşulu) çıkardığınla orantılı kaldı.`,
        `Gelişim bedellerinin ASTRA payı ve katkı puanları eski ölçekte kaldı (hammadde pazar değeri ÷ 5). Sirius Konseyi'nde Otorite 1. seviye 400 milyon, her proje 1,2 milyar birim ister: Konsey tek kişinin pazardan alıp bitireceği bir yer değil, herkesin ortak inşaatı.`,
        `Karnaval çarkındaki "1 ASTRA değerinde stamina" ödülü artık yaklaşık 22 stamina veriyor (stamina için gereken buğday 5 kat; ödül ASTRA değeri üzerinden hesaplanır).`
      ]
    },
    {
      version: 'v1.82',
      title: '⚡ Konsey Hızlı Katkı, Roket Seviyeleri',
      date: '19 Ekim 2026',
      changes: [
        `Sirius Konseyi ekranında "Hızlı katkı" kartı: yazdığın ASTRA kadar bütçe, hedefin kalan ihtiyacına göre bölünür; hammaddeler pazardan alınır ve hemen Madencilik Otoritesi'ne ya da etkin projeye yatırılır. Siloda yer yoksa önce ne yapman gerektiğini söyler; pazar fiyatı yükselirse aldığın miktar azalır. Alım katkı puanı kazandırır.`,
        `Uzay Limanı'nda roket artık 5 seviyeli: roket Realm'dan UOA'ya (ikinci oyun) geçiş rampasıdır. Seviye yükseldikçe gidiş süresi kısalır (72 → 12 saat), taşıma kapasitesi (500 bin → 100 milyon birim) ve mürettebat (köylü + asker: 10 → 500 kişi) artar; bedel çok pahalı (seviye 5: 40 kat hammadde + 500 bin ASTRA). Gidiş-dönüş yapılabilir; fırlatma UOA açılana kadar kilitli. Harcadığın ASTRA'nın %4'ü UOA tohumunda birikmeye devam ediyor.`,
        `Test menüsündeki "ilk güne sıfırla" denetlendi: dünya (kasalar, UOA tohumu, pazar havuzları, piyango, Konsey, Otorite, sayaçlar) ve oyuncu (seviye, envanter, silo, roket) taze kurulmuş oyunla birebir aynıya dönüyor; bunu bir test kanıtlıyor.`
      ]
    },
    {
      version: 'v1.83',
      title: '📜 Önce Parşömen, Bot Ücreti Düzeltmesi',
      date: '19 Ekim 2026',
      changes: [
        `Zindan ekranı, Kışla ve Şifahane'de elinde İyileştirme Parşömeni varken ve yaralı asker varken "📜 Önce parşömen (adet) · sonra ot" düğmesi çıkıyor: önce parşömenler kullanılır (ot ve ASTRA harcamaz), geriye kalan yara şifalı otla kapatılır, eksik ot gerekirse pazardan alınır. Parşömen boşa gitmesin diye, eksik can parşömenin yarısından azsa o askerde parşömen kullanılmaz.`,
        `Sirius Konseyi ekranı sadeleştirildi: en üstte "Konsey ne işe yarar?" kartı (ortak şantiye; bitince herkese fayda, sen katkı yaptıkça katkı kademen ve haftalık çıkarma hakkın büyür). Rakam dolu ayrıntılar "ayrıntı" bölümlerine katlandı; Otorite ve proje kartları önce "bitince ne kazandırır" ve yüzde olarak gösteriyor.`,
        `Taverna botunun ücret hesabı düzeltildi: Üretim Hakkın üretimin yalnız bir kısmına yetiyorsa bot o kadarını toplar; stamina ve alet onarımı da artık o orantıda hesaplanıyor. Eskiden bu iki bedel TAM üretim üzerinden düşüldüğü için hakkı sınırlı oyuncularda net kâr 0 çıkıyor, tablo "Net kâr +0 ASTRA, bot ücreti 1 ASTRA" gösteriyordu.`
      ]
    },
    {
      version: 'v1.84',
      title: '🏛️ Hesap Seviyesi Her Şeyin Anahtarı, Global Çıkarma Havuzu',
      date: '19 Ekim 2026',
      changes: [
        `Hesap seviyesi artık oyundaki EN PAHALI şey. Seviye atlama bedeli, o seviyedeki silonun kapasitesinin payıdır (1. seviyede %45, her seviye +%5, en çok %90) ve ASTRA bedeli de buna göre büyür. Silo 49. seviyeden sonra hammadde bedeli düz kalır, ASTRA bedeli her seviye %5 artar. Bir hesabı sonuna kadar geliştirmek yaklaşık 20 dolar: bunun yarısından fazlası hesap seviyeleri.`,
        `Silo seviyesi hesap seviyesini geçemez: hesabın 5. seviyeyse silo en çok 5. seviyeye çıkar. Teçhizat seviyesi de hesap seviyesine bağlı (en çok 2 + seviye/2, 10'u geçmez) ve n. ev için hesap seviyesi en az 2 x (n-1) olmalı. Yetmediğinde düğmeler neden yazarak kilitli kalır; bot da bu durumda siloyu yükseltmek için boşuna satış yapmaz.`,
        `Haftalık çıkarma hakkı artık iki katmanlı: herkesin KİŞİSEL limiti vardır (hesap seviyesi, köy evleri, katkı kademesi, aktiflik ve Konsey Otoritesi ile büyür; her ev +%3, en çok +%30) ve oyunun ortak GLOBAL havuzu vardır. Havuz oyuncu sayısına bağlı değildir: havuzun %60'ı herkese eşit taban pay olarak bölünür, kalan %40'ı limiti ve katkı kademesi yüksek olanlara gider; kimse kişisel limitini aşamaz. Oyuncu çoğaldıkça kişi başı pay küçülür.`,
        `Global havuz fiyata göre kendini dengeler: hammadde fiyatı açılışın 0,8 katının altına düşerse havuz küçülür (arz azalır, talep artar, fiyat yükselir); 1,5 katının üstüne çıkarsa havuz büyür (haftada en çok %25). Fiyat açılışın 3 katını aşarsa oyun oynanmaz olmasın diye havuz haftayı beklemeden %25 açılır. Oyuna bot projesinden gelen ASTRA normalin üstündeyse havuz önceden büyür, altındaysa küçülür.`,
        `Konsey ve Çıkarma Hakkı ekranlarındaki anlatım yeni sisteme göre yenilendi.`
      ]
    },
    {
      version: 'v1.85',
      title: '🚀 Roket Rampası: UOA\'ya Geçiş Roketi',
      date: '19 Ekim 2026',
      changes: [
        `"Uzay Limanı" artık "Roket Rampası". Roket, ROA'dan UOA'ya (Sirius gezegeni) geçiş rampasıdır: roketini yapmayan UOA'ya geçemez, UOA hesabı aktif olmaz. Roketini yapanlar UOA açıldığında roketlerine basıp UOA ekranına geçecek. Hesabın UOA'ya geçip geçemeyeceğini UOA oyunu "UOA pasaportu" ile sorar (roket seviyesi, taşıma, mürettebat dahil).`,
        `Roket çok pahalı: bir yıl aktif oynayanın ancak biriktirebileceği ölçekte (ilk roket: demir 1,2 M, kömür 1,5 M, taş 2 M, odun 1,8 M + 250 bin ASTRA; hesap seviyesi en az 10). Bu kadar hammadde siloya sığmadığı için roket KADEMELİ inşa edilir: hammadde ve ASTRA parça parça yatırılır, hepsi dolunca roket (ya da bir üst seviye) tamamlanır. Hammadde yatırırken katkı puanı da kazanırsın. "Hızlı katkı" ASTRA bütçesiyle pazardan hammadde alıp hemen yatırır.`,
        `Konsey'de yeni "🎖️ Katkı puanın" kartı: bu haftaki, geçen haftaki ve toplam puanını, kademeni ve hafta dönümünde hangi kademeye geçeceğini gösterir. Katkı kademesi geçen haftanın puanına bakar; o yüzden katkı yaptığın an çıkarma hakkın değişmez, hafta dönümünde işler. "Hızlı katkı" sonrası mesaj artık kazandığın puanı, hedefin doluluğunu (küçük yüzdeler %0 diye yuvarlanmaz) ve kademenin ne zaman işleyeceğini söyler. Taverna'daki "Günlük Üretim Hakkı sınırı" satırı için bir açıklama ve hakkı büyütme yolları eklendi.`,
        `Köylüler artık günde 50 buğday yer (eskiden ekranda "2" yazıyordu ama gerçekte 10 kesiliyordu; yazı ve hesap tutarsızdı). Köy ekranındaki açıklama gerçek rakamı gösterir. 10 köylü günde 500, 40 köylü günde 2.000 buğday yakar: buğday için gerçek bir tüketim kalemi.`,
        `"Üretim hakkın" kartı sadeleşti: "Şimdi çıkarabilirsin", "Bu haftaki hakkın" ve "çıkardığın" olarak üç sayı; çubuk haftalık hakkının ne kadarını çıkardığını gösterir. "Tüm seferleri topla" hakkın dolduğu için bir seferi toplayamazsa artık nedenini ve yeni hakkın ne zaman açılacağını söyler; hakkı dolan hazır sefer "⏳ hak bekliyor" görünür.`,
        `Asker ekranında "Ön saf / Arka saf" seçimi netleşti: iki düğme yan yana, askerin şu anki yeri işaretli, diğerine basınca geçer; hangisinin ne işe yaradığı yazıyor.`,
        `Haftalık temel gelir (UBI) kartı açıklandı: biriken para o hafta alınamaz, gelecek Pazartesi 00:01'de kasa olarak açılır. Kartta "Bu hafta birikiyor", "Pazartesi tahmini payın", "Şu an açık kasa" ve "Şu an alabileceğin" ayrı gösterilir.`,
        `Konsey'deki "🎖️ Katkı puanın" kartı artık "Son katkıların" listesini gösterir: her katkıda kaç ASTRA verdiğin, hangi hammaddeler, kaç puan yazıldığı ve hedefi yüzde kaç ilerlettiği. Hızlı katkı tek kayıt olur.`,
        `Bot artık Üretim Hakkın bitince çalışmaz: altı kaynaktan hiçbirinden çıkarabileceğin hak kalmadıysa bot "⏸️ Üretim Hakkı bekleniyor" durumuna geçer, satın aldığın süre azalmaz; yeni hak açılınca (her gün 00:00 TSİ'de günün parçası, hafta başında yeni hak) bot kaldığı yerden devam eder. Hakkı biten kaynakta sefer başlatılmaz, böylece stamina ve alet boşuna harcanmaz. Bot ücreti tablosunda hak bittiğinde ücretin neden en düşük 1 ASTRA göründüğü yazılır.`,
        `Roketin 5 seviyesi var: seviye yükseldikçe gidiş süresi kısalır (72 → 12 saat), Hazırlık Deposu'na konabilecek yük (taşıma kapasitesi) ve mürettebat (köylü + asker) artar. Üst seviyelerin bedeli hızla büyür (seviye 5'te hammadde 40 katı, ASTRA 50 milyon). Hazırlık Deposu'ndaki yük artık roketle taşınır: roketi olmayan yük koyamaz, toplam yük roketin taşıma kapasitesini aşamaz. Mürettebatı (kaç köylü ve asker gideceğini) roket ekranında seçersin.`
      ]
    },
    {
      version: 'v1.86',
      title: '🧹 Daha sade menüler: Kışla, Krallık merkezi, Köy ve Konsey, Arena',
      date: '20 Ekim 2026',
      changes: [
        `Kışla artık tek akışta: üstte ordu özeti ve iki düğme ("Orduyu hazırla", "Yeni asker"), telefonda askerler yatay şeritte. Bir askere dokununca altında o askerin sayfası açılır; bir eşya yuvasına dokununca takılı eşyayı <b>geliştirebilir</b> (eksik malzeme pazardan alınır), çıkarabilir ya da depodan başkasını takabilirsin. Depoda uygun eşya yoksa aynı yuvadan yeni eşya dövebilirsin; Demirhane'ye gitmeye gerek kalmaz. Yaralı askerin yanında "yaralı" rozeti görünür.`,
        `Demirhane'de dövme ve eşya kartları kısaldı: bedel tek satır (eksik kalem kırmızı), tek ana düğme ("Geliştir" ya da "Eksikleri al ve geliştir"), ayrıntılı bedeller katlı.`,
        `Krallık merkezi "✅ Şimdi yapılacaklar" ile açılır: hazır sefer, yaralı asker, onarım bekleyen alet, düşük stamina ve dolan silo için her satırda tek dokunuşluk eylem. Toplu işlemler ve silo bu ekrandan da yapılır.`,
        `Menü sadeleşti. Krallık: Krallık merkezi, Taverna, Demirhane, Köy ve Konsey, Roket Rampası (8. seviyeden). Savaş: Kışla, Zindan, Arena. Pazar: Meydan pazarı, Karnaval, Sandıklar. "Şifahane", "Silo" ve "Savaş alanı" ayrı girişlerden kalktı (işleri Kışla ve Krallık merkezinde; Ctrl+K ile hâlâ bulunur). "Köy ve Konsey" ile "Arena" tek girişte iki sekmedir. "Ben" menüsünde 6 temel öğe var; Hazine, Ekonomi panosu, Kotalarım, Sürüm geçmişi ve diğerleri "Gelişmiş" katında.`,
        `Yoğun ekranlar sadeleşti: Konsey (üstte kısa açıklama, ayrıntılar katlı), Karakterim (seviye atlama + tek düğme; bedeller, haftalık gelir ayrıntısı, hammadde ve aletler katlı), Kotalarım (önce hakkın, yenilenme süreleri katlı), Hazine (kasa özeti + üç katlı bölüm), Roket Rampası, Koleksiyon, Silo, Pazar (Satın al / Sat iki sekme, fiyat grafiği katlı) ve Sürüm geçmişi (yalnız en yeni sürüm açık, her sürümde ilk 3 madde görünür).`,
        `⚖️ Teçhizat yükseltmesi artık kolay değil: demir, odun, kömür ve taş adetleri silonun alabileceği kadarıyla sınırlı olduğu için zorluk ASTRA bedelinden geldi. Yükseltme ASTRA bedeli = hammaddenin pazar değeri × seviye çarpanı (2. seviyeye ×3, 10. seviyeye ×33). Bir eşyayı 1'den 10'a çıkarmak yaklaşık 320.000 ASTRA (eskiden ~12.700). İlk üç basamak yine ucuz; yük üst seviyelere biner. Parça bedelleri ve onarım bedeli değişmedi.`
      ]
    },
    {
      version: 'v1.87',
      title: '🧹 Daha sade ekranlar: Karnaval, Ekonomi, Taverna, Kotalarım, Zindan, Arena',
      date: '20 Ekim 2026',
      changes: [
        `Karnaval: çarkın üstünde tek cümle ve çevirme düğmeleri; kurallar, Şans Sayacı, ödül tablosu ve günlük hediye katlı bölümlere taşındı. Piyango'da kurallar ve günlük bilet sınırı, Kasalar'da ayrıntılar katlı.`,
        `Ekonomi panosu: ilk bakışta yalnız "Ekonomi durumu" kartı; ASTRA akışı, kasalar, hammadde ayrıntıları ve havuzlar katlı.`,
        `Taverna: botun durumu ve paket düğmeleri üstte; sefer durumu ve bot ayarları katlı. Üretim Hakkı bekleme uyarısı kısaldı.`,
        `Kotalarım: önce "şimdi ne kadar çıkarabilirsin" çubukları; haftalık hak ve hesap ayrıntıları katlı.`,
        `Arena: Düello'da giriş bedeli tek satıra indi (ayrıntı katlı), mevzi seçimi katlı; günlük ASTRA ödül tavanı dolduysa bunu açıkça söyler. Savaş alanı: önce ordun ve ödülün, hasar formülü katlı.`,
        `Zindan: canavarın hikâyesi ve yetenekleri odada katlı; "Zindan modu" düğmesi ilk boss geçilene kadar gizli.`,
        `Karnaval'da çevirme düğmeleri artık çarkın üstünde; sonuç düğmelerle çarkın arasında görünür. Zindan'da telefonda harita resmi yerine oda listesi var, en üstte tek "Sıradaki: Oda N" düğmesi (kat temizse "Kata geç") bulunur; Son savaş, Zindan modu ve Kütük "Daha fazla" altında.`,
        `Yeni oyuncu denemesinde bulunan boşluklar kapandı: Zindan kilidi artık Kışla da kilitliyse yolu tarif ediyor (üç alanda sefer → Kışla → ilk asker). Kazanma şansın düşükse Zindan ve Savaşa hazırlık ekranı sebebini söylüyor (askerin eksik mi, eşyan mı) ve tek dokunuşla Kışla'ya götürüyor.`,
        `⚔️ Zindanda canı sıfırlanan asker artık "düşer": tam iyileşene kadar zindan savaşına katılamaz (savaşa hazırlıkta 💀 ile işaretlenir, "Kazanacak kadar seç" ve "Tümünü seç" onu atlar). Eskiden 1 canla ertesi savaşa girip kendini toparlıyordu.`,
        `Askerin ya da hesabın seviye atlaması artık canı yenilemez: yalnız azami can büyür, kayıtlı can aynı kalır.`,
        `⚡ "Hızlı al" ile seviye atlama / silo yükseltme için alınan şifalı ot, yaralı askerlerin kendiliğinden iyileşmesi yüzünden arada eriyip 1 adet eksik kalıyordu (ikinci kez Hızlı al gerekiyordu). Yaralı asker varken bu iki işte ot için 1 adetlik pay eklendi; diğer Hızlı al seçeneklerinde alım ile iş aynı anda yapıldığından sorun yoktu.`,
        `💰 Silo yükseltirken ve hesap yükseltirken harcanan bütün hammaddelerin anlık pazar değerinin TAMAMI kadar ASTRA da alınır (eskiden bu değerin beşte biriydi). Örnek: Seviye 1→2 yaklaşık 16 yerine 79 ASTRA, Seviye 9→10 yaklaşık 737 yerine 3.687 ASTRA.`,
        `Menüler seviyeye göre açılıyor: Taverna, Kotalarım ve Sandıklar 3. seviyede, Hazine 4. seviyede, Ekonomi panosu 5. seviyede görünür (Ctrl+K ve bağlantılarla her zaman açılır). Karnaval'ın Kasalar sekmesi 5. seviyeden sonra görünür.`
      ]
    }
  ],

  // Başlangıç Profili
  STARTING_PROFILE: {
    name: 'AlphAvax Gezgini',
    level: 1,
    currentXp: 0,
    stamina: 100,
    adAstraBalance: 2.5,
    inventory: {
      wheat: qU(80),
      stone: qU(40),
      wood: qU(60),
      coal: qU(20),
      iron: qU(50),
      herb: qU(10),
      fragments: 0
    },
    tools: {
      sickle: { durability: 4320, totalGathered: 0 },
      chisel: { durability: 4320, totalGathered: 0 },
      axe: { durability: 4320, totalGathered: 0 },
      coalpick: { durability: 4320, totalGathered: 0 },
      pickaxe: { durability: 4320, totalGathered: 0 },
      herbknife: { durability: 4320, totalGathered: 0 }
    },
    // v2 (R5): köy — 1 ev, 10 köylü ile başlar
    village: { houses: 1, villagers: 10, labor: 0, lastGrowthAt: 0, starvingSince: 0 },
    army: {
      infantry: 2,
      archer: 1,
      knight: 0
    },
    equipment: {
      weapon: null,
      helmet: null,
      armor: null,
      legs: null,
      boots: null
    },
    warehouseLevel: 1,
    lockedBoxes: 0,
    arenaKeys: 0,
    activeBuffs: {},
    activeExpeditions: {}
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 📢 DUYURULAR (Ben → Duyurular ve üstteki tek satır uyarı). Boşken şerit görünmez, panel "Şu an duyuru yok" der.
  // Eski risk uyarısı ve v1.25 sürüm notu 13 Ekim 2026'da kullanıcı isteğiyle kaldırıldı. Yeni duyuru: { id, badge, text, active }.
  // ═══════════════════════════════════════════════════════════════════════
  ANNOUNCEMENTS: []
};
