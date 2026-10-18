// Realm of AdAstra - Karakter Seviyesi, Kışla Ordusu, Taverna Güçlendirmeleri & AMM Konfigürasyonu

// Hedef rezerv yardımcısı (E-planı S5, 8 Ekim 2026): bir kasa haftada r oranında (bakiyesinin r'si) ödeme yaparsa,
// 52 hafta boyunca ödenen toplam pay = tohum × (1 − (1−r)^52). docs/v2/KARARLAR_KESIN.md "hedef rezerv = 12 aylık
// ödeme" kararını bu şekilde sayıya bağlar. Eskiden hedef = tohumun KENDİSİYDİ; bu, taze bir kasada sağlık (bakiye/
// hedef) tam 1,0 oluyordu ve İLK harcamadan sonra bile hemen 1'in altına düşüp ödülleri küçültmeye başlıyordu
// (treasury.js withdraw: health<1 → granted *= health). Şimdi hedef tohumdan küçük: taze kasada sağlık > 1 (gerçek
// başlangıç payı), küçülme yalnız kasa GERÇEKTEN bu yıllık payın altına inince başlar.
const annualPayout = (seed, weeklyRate) => Math.round(seed * (1 - Math.pow(1 - weeklyRate, 52)));

export const GAME_CONFIG = {
  GAME_VERSION: '2.0.0-dev',

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
    QPP_START: 0.40, QPP_MIN: 0.05, QPP_MAX: 1.0, TERMO_STEP: 0.10, TERMO_TARGET: 1.0, ADMIN_MULT: 1,
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
  // çalışma günü 20→24 saat, hafta 6→7 gün; 1. seviye 2 M birim (×1,4). Karışım ALTI hammaddenin hepsini içerir (13 Ekim 2026
  // hammadde kullanım planı): taş %30, kömür %20 (eski "çelik payı" artık kömürle ödenir: çelik demirden ve kömürden olur),
  // demir %15, odun %15, buğday %15 (işçi iaşesi), şifalı ot %5. Toplam %100 hammadde; ASTRA ile ödenen pay yoktur.
  // Ortak kasa: çıkarılan her hammaddenin %5'i Konsey stoğuna girer ve Otorite ile etkin projeye KENDİLİĞİNDEN aktarılır.
  OTORITE: {
    MAX_LEVEL: 20, BASE_UNITS: 2000000, LEVEL_MULT: 1.4, PER_LEVEL_BONUS: 0.05,
    HOURS_BASE: 20, HOURS_PER_LEVEL: 0.2, DAYS_BASE: 6, DAYS_PER_LEVEL: 0.05,
    MIX: { stone: 0.30, coal: 0.20, iron: 0.15, wood: 0.15, wheat: 0.15, herb: 0.05 },
    COMMON_CHEST_RATE: 0.05
  },
  // Konsey projeleri (sırayla, biri açık): 6 M birim hammadde + 50.000 emek; bitince kalıcı bonus. Her projenin kendi
  // karışımı vardır (konusuna göre; toplam %100): Şifa Bahçesi şifalı otu, Büyük Ambar buğdayı, Köprü ve Duvar taşı çok ister.
  KONSEY_PROJELERI: [
    { id: 'bridge',   name: 'Nehir Köprüsü',   icon: '🌉', units: 6000000, labor: 50000, bonus: { expeditionTime: -0.02 }, desc: 'Sefer süreleri %2 kısalır.',
      mix: { stone: 0.35, wood: 0.30, iron: 0.15, wheat: 0.15, coal: 0.05 } },
    { id: 'granary',  name: 'Büyük Ambar',     icon: '🏚️', units: 6000000, labor: 50000, bonus: { warehouse: 0.05 },     desc: 'Herkesin silosu %5 büyür.',
      mix: { wheat: 0.30, wood: 0.30, stone: 0.25, iron: 0.15 } },
    { id: 'herbgdn',  name: 'Şifa Bahçesi',    icon: '🌿', units: 6000000, labor: 50000, bonus: { herb: 0.05 },          desc: 'Şifalı ot üretimi %5 artar.',
      mix: { wheat: 0.30, stone: 0.22, wood: 0.21, coal: 0.15, herb: 0.12 } },
    { id: 'pier',     name: 'Liman Rıhtımı',   icon: '⚓', units: 6000000, labor: 50000, bonus: { prepDepotCap: 2 },     desc: 'Hazırlık Deposu kişi tavanı 2 katına çıkar.',
      mix: { iron: 0.25, coal: 0.25, wood: 0.25, stone: 0.25 } },
    { id: 'wall',     name: 'Savunma Duvarı',  icon: '🧱', units: 6000000, labor: 50000, bonus: { bossPenaltyPoints: -0.06 }, desc: "Dünya Bossu savaşından erken çekilme cezası %18 yerine %12 olur.",
      mix: { stone: 0.45, iron: 0.25, coal: 0.20, wood: 0.10 } }
  ],
  // Köy Evleri (R5): köylüler doğar; emek puanı, üretim bonusu, asker kaynağı; kolonist adayı
  KOY: {
    HOUSE_BASE_COST: { wood: 400, stone: 200, iron: 50 }, HOUSE_COST_MULT: 1.2, MAX_HOUSES: 20,
    VILLAGERS_PER_HOUSE: 10, GROWTH_PER_DAY: 0.02, WHEAT_PER_VILLAGER_DAY: 2, STARVE_DAYS: 3, STARVE_LOSS_PER_DAY: 0.05,
    LABOR_PER_VILLAGER_DAY: 1, PROD_BONUS_PER_10: 0.01, PROD_BONUS_MAX: 0.20, VILLAGER_PER_SOLDIER: 1,
    START_HOUSES: 1, START_VILLAGERS: 10
  },
  // Şifahane (R5): şifalı ot iyileşmeyi hızlandırır
  SIFAHANE: { HP_PER_HERB: 5, ADA_SHARE_WITH_HERB: 0.5 },
  // Demirhane geri dönüşümü (R4b): alet/teçhizat → hammaddelerin %70'i geri, ASTRA geri gelmez
  RECYCLE_RETURN_RATE: 0.70,
  // Uzay Limanı hazırlık modu (R6): roket görevi, Hazırlık Deposu, hazırlık ilerlemesi
  UZAY_LIMANI: {
    ROCKET_MIN_LEVEL: 3,
    ROCKET_PARTS: { iron: 2000, coal: 1000, stone: 500, wood: 300, adAstra: 1 },
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
  WHEAT_PER_STAMINA: 1.0,             // 1 Stamina = 1 Buğday (v2: üretim ×0,3 ölçeğinde 6 seferin staminası buğday üretiminin ~%40 kadarı)

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
  BASE_PRODUCTION: {
    wheat: 9,
    stone: 6,
    wood: 5.4,
    coal: 4.5,
    iron: 3.6,
    herb: 1.2
  },
  TAVERNA_BOT: {
    REQUIRED_PREREQUISITES: {
      iron: 50,
      wood: 50,
      wheat: 50,
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
    { id: 'first_herb_heal', section: 'koy', icon: '🌿', title: 'Şifahane\'de otla iyileştir', desc: 'Yaralı bir askeri şifalı otla iyileştir (buğday harcamadan).', rewardAda: 10.5, show: 'sifahane' },
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
    { id: 'heal_soldier', section: 'zindan', icon: '🩹', title: 'Yaralı askeri iyileştir', desc: 'Savaştan sonra askerlerini buğdayla ya da otla iyileştir ve yeniden gir.', rewardAda: 5, show: 'kisla' },
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
  GLOBAL_RESOURCE_CAPS: {
    wheat: { id: 'wheat', name: 'Güneş Buğdayı',     icon: '🌾', color: '#facc15', totalCap: 25920, ratePerMinute: 9,   baseYieldPerHour: 540, requiredTool: 'sickle' },
    stone: { id: 'stone', name: 'Vadi Taşı',          icon: '🪨', color: '#a8a29e', totalCap: 17280, ratePerMinute: 6,   baseYieldPerHour: 360, requiredTool: 'chisel' },
    wood:  { id: 'wood',  name: 'Zümrüt Meşe Odunu',  icon: '🌲', color: '#4ade80', totalCap: 15552, ratePerMinute: 5.4, baseYieldPerHour: 324, requiredTool: 'axe' },
    coal:  { id: 'coal',  name: 'Kara Kömür',         icon: '⚫', color: '#64748b', totalCap: 12960, ratePerMinute: 4.5, baseYieldPerHour: 270, requiredTool: 'coalpick' },
    iron:  { id: 'iron',  name: 'Derin Demir Cevheri', icon: '⛏️', color: '#94a3b8', totalCap: 10368, ratePerMinute: 3.6, baseYieldPerHour: 216, requiredTool: 'pickaxe' },
    herb:  { id: 'herb',  name: 'Şifalı Ot',          icon: '🌿', color: '#86efac', totalCap: 3456,  ratePerMinute: 1.2, baseYieldPerHour: 72,  requiredTool: 'herbknife' }
  },

  // Aletler (v2: 6 alet, ilk sürümde yalnız Acemi kademe; 72 saat = 4320 dakika dayanıklılık, dakikada 1 aşınma)
  // Onarım kuralı: dakikalık odun ve demir üretiminin %25'i alet sayısına bölünür + bu malzemenin pazar değerinin
  // TOOL_REPAIR_ADA_SHARE (%30) kadarı ASTRA (gameState.calculateRepairCost). repairCostPerMinute yalnız bilgi.
  TOOLS: {
    sickle:    { id: 'sickle',    name: 'Demir Orak',       icon: '🌾', maxDurability: 4320, durabilityLossPerMinute: 1, producedResource: 'wheat', repairCostPerMinute: { wood: 0.45, iron: 0.3, wheat: 0, adAstra: 0.01 } },
    chisel:    { id: 'chisel',    name: 'Taş Keskisi',      icon: '🪨', maxDurability: 4320, durabilityLossPerMinute: 1, producedResource: 'stone', repairCostPerMinute: { wood: 0.45, iron: 0.3, wheat: 0, adAstra: 0.01 } },
    axe:       { id: 'axe',       name: 'Acemi Baltası',    icon: '🪓', maxDurability: 4320, durabilityLossPerMinute: 1, producedResource: 'wood',  repairCostPerMinute: { wood: 0.45, iron: 0.3, wheat: 0, adAstra: 0.01 } },
    coalpick:  { id: 'coalpick',  name: 'Kömür Kazması',    icon: '⚫', maxDurability: 4320, durabilityLossPerMinute: 1, producedResource: 'coal',  repairCostPerMinute: { wood: 0.45, iron: 0.3, wheat: 0, adAstra: 0.01 } },
    pickaxe:   { id: 'pickaxe',   name: 'Bronz Kazma',      icon: '⛏️', maxDurability: 4320, durabilityLossPerMinute: 1, producedResource: 'iron',  repairCostPerMinute: { wood: 0.45, iron: 0.3, wheat: 0, adAstra: 0.01 } },
    herbknife: { id: 'herbknife', name: 'Ot Bıçağı',        icon: '🌿', maxDurability: 4320, durabilityLossPerMinute: 1, producedResource: 'herb',  repairCostPerMinute: { wood: 0.45, iron: 0.3, wheat: 0, adAstra: 0.01 } }
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
    wheat:     { minPriceAda: 0.0045, maxPriceAda: 0.0225, defaultPriceAda: 0.009 },
    stone:     { minPriceAda: 0.006,  maxPriceAda: 0.03,   defaultPriceAda: 0.012 },
    wood:      { minPriceAda: 0.0125, maxPriceAda: 0.0625, defaultPriceAda: 0.025 },
    coal:      { minPriceAda: 0.009,  maxPriceAda: 0.045,  defaultPriceAda: 0.018 },
    iron:      { minPriceAda: 0.02,   maxPriceAda: 0.10,   defaultPriceAda: 0.04 },
    herb:      { minPriceAda: 0.04,   maxPriceAda: 0.20,   defaultPriceAda: 0.08 },
    fragments: { minPriceAda: 0.225,  maxPriceAda: 1.125,  defaultPriceAda: 0.45 },
    boxes:     { minPriceAda: 50,     maxPriceAda: 250,    defaultPriceAda: 100 },
    keys:      { minPriceAda: 5,      maxPriceAda: 25,     defaultPriceAda: 10 },
    scroll_heal:    { minPriceAda: 0.15, maxPriceAda: 0.75, defaultPriceAda: 0.30 },
    scroll_stamina: { minPriceAda: 0.30, maxPriceAda: 1.50, defaultPriceAda: 0.60 }
  },
  // v2 (R3/R4b): pazar havuzlarının ASTRA tohumu — 200 M'den 100 M: 6 hammadde 90 M (değer ağırlıklı), tüketilenler 10 M
  AMM_SEED_ASTRA: { raw: 90000000, fragments: 4000000, keys: 2000000, boxes: 2000000, scroll_heal: 1000000, scroll_stamina: 1000000 },
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

  // =========================================================================
  // SOLDIER & MILITARY SYSTEM (TEK TİP ADASTRA ŞAMPİYONU)
  // =========================================================================
  // Tek bir asker türü: AdAstra Şampiyonu. Level 1'de fix 100 HP ve fix 25 ATK.
  SOLDIER_COST_BASE: 50,              // Taban maliyet: 50 ASTRA (1. asker; v2 ölçekli)
  SOLDIER_COST_EXPONENT: 2.0364522367650437, // Kademeli artış üssü (1. asker: 50, 18. asker: 18.000)
  SOLDIER_18_TARGET_COST: 18000,      // 18. asker maliyeti (v2 ölçekli)
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

  // 24 Saatlik Otomatik Asker Doyurma (Pasif İyileşme) Kuralı:
  // 24 saat (1440 dk / 86400 sn) içinde asker kendi kendini otomatik iyileştirirken:
  // Her 1 HP için: 0.30 Buğday + 0.10 ASTRA tüketilir. Yetersiz bakiye veya buğdayda iyileşme durdurulur.
  SOLDIER_PASSIVE_HEAL: {
    FULL_HEAL_SECONDS: 86400,     // 0 HP'den %100 cana kadar tam iyileşme süresi (24 saat)
    wheatPerHp: 0.30,             // 24 saatte 1 HP başına 0.30 Buğday
    adaPerHp: 0.001               // 24 saatte 1 HP başına 0.001 ASTRA (v2 ölçekli)
  },

  // Hızlı Asker Doyurma (Instant / Fast Heal) Kuralı:
  // 24 saatlik otomatik formülün 10 katı (Deflasyonist Zaman Satın Alma & Hazine Besleme):
  // Her 1 HP için: 3.0 Buğday (0.30 * 10) + 1.0 ASTRA (0.10 * 10)
  SOLDIER_FAST_HEAL: {
    wheatPerHp: 3.0,             // 24 saatlik formülün 10 katı (3 Buğday / HP)
    adAstraPerHp: 0.01           // 24 saatlik formülün 10 katı (v2 ölçekli)
  },

  // =========================================================================
  // SİLO / DEPO KAPASİTE & YÜKSELTMELERİ (İSTİFÇİLİK ÖNLEME MODELİ)
  // gameState.getWarehouseCapacity bu değerleri okur.
  // Maksimum Seviye: 18
  // Başlangıç (Lv 1): 1080 Odun, 720 Demir, 1800 Buğday
  // Ara seviyeler: başlangıçtan maksimuma eşit oranlı (üssel) büyüme
  // Maksimum (Lv 18): Haftalık havuz tavanının %50'si (90k Odun, 65k Demir, 245k Buğday)
  // Yükseltme Şartı: Tüm depolar %80 dolu olmak zorunda
  // Yükseltme Maliyeti: Mevcut kapasitenin yarısı (%50) + Anlık DEX Pazar ASTRA karşılığı
  // =========================================================================
  WAREHOUSE: {
    baseLevels: 18,
    // v2: 13. seviyeden itibaren Universe alüminyumu ister; Universe açılana kadar bu tavan
    universeGateLevel: 12,
    initialCapacities: {   // 1 saatlik üretim
      wheat: 540,
      stone: 360,
      wood: 324,
      coal: 270,
      iron: 216,
      herb: 72,
      fragments: 100
    },
    maxCapacities: {       // ×0,3 ölçekli eski tavanlar + yeni kaynaklar
      wheat: 73500,
      stone: 30000,
      wood: 27000,
      coal: 22500,
      iron: 19500,
      herb: 6000,
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
      cost: { fragments: 18, iron: 60, wood: 40, coal: 20, adAstra: 0.5 },
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
      cost: { fragments: 12, iron: 40, wood: 20, coal: 10, adAstra: 0.35 },
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
      cost: { fragments: 20, iron: 80, wood: 30, coal: 25, adAstra: 0.6 },
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
      cost: { fragments: 14, iron: 50, wood: 25, coal: 12, adAstra: 0.4 },
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
      cost: { fragments: 10, iron: 30, wood: 35, coal: 8, adAstra: 0.3 },
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
      BIRIM_HAMMADDE: { stone: 500, iron: 250, coal: 250, herb: 50 }, // yakılır; en büyük (8 birim) silo 12'ye sığar
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
    //  • 1. giriş: silahlar aşınmaz.
    //  • 2.–5. giriş: harçsız ödüllü giriş; silahlar aşınır.
    //  • 6. girişten itibaren: kapı harcı ödenirse ödüllü, ödenmezse yalnız deneyim veren antrenman.
    DAILY_RUNS: 5,                    // harçsız ödüllü giriş sayısı
    FIRST_ENTRY_NO_WEAR: true,        // günün ilk girişinde silahlar aşınmaz
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

  // ═══════════════════════════════════════════════════════════════════════
  // 🏟️ KOLEZYUM — anahtar tüketilir, ELO eşleşmesi, beş lig (F-02 / F-20)
  // ═══════════════════════════════════════════════════════════════════════
  COLOSSEUM: {
    ENTRY_KEY_COST: 1,
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
  DUNGEON_GATE_POOL_SHARE: 1,
  // v2 (R3): hazine payının 8 kasaya bölünüşü (toplam %100; RealmRates sözleşmesindeki 8 kasa payıyla aynı):
  // zindan 27, kolezyum 14, boss 12, geri alım 15, görev 18, karnaval 4, Fatih 5, Konsey 5
  TREASURY_ALLOCATION: { dungeon: 0.27, arena: 0.14, worldBoss: 0.12, ammBuyback: 0.15, quest: 0.18, carnival: 0.04, fatih: 0.05, konsey: 0.05 },
  TREASURY_POOL_NAMES: {
    dungeon: 'Zindan Ganimet Kasası',
    ammBuyback: 'Pazar Geri Alım Kasası',
    worldBoss: 'Dünya Bossu Ödül Havuzu',
    arena: 'Kolezyum Şampiyonluk Havuzu',
    carnival: 'Karnaval Ödül Havuzu',
    quest: 'Görev & Ücretsiz Oyuncu Kasası',
    fatih: 'Fatih Kasası (18. boss)',
    konsey: 'Sirius Konseyi Kasası',
    universe: 'Universe Tohum Rezervi (kilitli)'
  },
  // v2 (R3): tohumlar 200 M ASTRA'dan (pazar 100 M ayrı: AMM_SEED_ASTRA)
  TREASURY_SEED: { dungeon: 10000000, arena: 4000000, worldBoss: 6000000, ammBuyback: 7000000, quest: 8000000, carnival: 3000000, fatih: 20000000, konsey: 10000000, universe: 20000000 },
  // Hedef rezerv = ~12 aylık ödeme (annualPayout, yukarıda); sağlık = bakiye / hedef. Haftalık oranla sürekli ödeme
  // yapan 5 kasa (dungeon/arena/worldBoss/ammBuyback/quest) formülle hesaplanır; sürekli haftalık oranı olmayan
  // (karnaval: çevirme başına kendini finanse eder; fatih: yalnız 18. boss ilk zaferinde; konsey/universe: kilitli/
  // proje bazlı) kasalarda hedef = tohum (değişmedi).
  TREASURY_TARGET_RESERVE: {
    dungeon: annualPayout(10000000, 0.025), ammBuyback: annualPayout(7000000, 0.03), worldBoss: annualPayout(6000000, 0.03),
    arena: annualPayout(4000000, 0.02), quest: annualPayout(8000000, 0.015),
    carnival: 3000000, fatih: 20000000, konsey: 10000000, universe: 20000000
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
  // universe (Universe açılışına kadar kilitli), konsey (proje kasası, kilitli), fatih (tek bir olaya bağlı), ammBuyback (alıp yakar,
  // vatandaşa ödenmez) sayılmaz: eskiden toplam 88 M sayılıyor, aylık ücretsiz havuza göre ~170 ay çıkıp çarpan sürekli ×0,8'e iniyordu.
  TREASURY_RUNWAY_POOLS: ['dungeon', 'arena', 'worldBoss', 'quest', 'carnival'],
  // Sponsorluk (docs/v2/SPONSORLUK_TASARIMI.md): B, A'ya ASTRA bağışlar; A bunu çekemez, yalnız oyunda harcar; A her haftalık net çekiminin
  // SHARE oranını (tüm sponsorlara toplam, anapara oranında bölünür) sponsorlara öder; sözleşme DAYS gün ya da toplam getiri anaparanın RETURN_CAP katına ulaşana dek.
  SPONSORLUK: { MIN_AMOUNT: 1000, SHARE: 0.30, DAYS: 365, RETURN_CAP: 2, MAX_PER_TARGET: 5, MAX_PER_SPONSOR: 20 },
  TREASURY_LOCKED_POOLS: ['universe'],
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
    // Kullanıcı kararı (4 Ekim 2026): ASTRA ile çevrilen çarkın bedelinin %80'i DOĞRUDAN Karnaval kasasına girer (ödüller bu
    // kasadan ödenir; eskiden yalnız %3,4'ü giriyordu ve kasa her çevirmede ~50 ASTRA eriyordu). Kalan %20 her harcama gibi
    // dağıtılır (yakım, yapımcı payı, temel gelir, hazine kasaları).
    WHEEL_CARNIVAL_SHARE: 0.80,
    // Hammadde oyunda bedava toplandığı için hammaddeyle çevirme günde en çok bu kadar (kasa bu yoldan erimesin)
    WHEEL_RESOURCE_DAILY_LIMIT: 3,
    // 15 ödül (4 Ekim 2026 çalışması). Oyuncuya ortalama dönüş ~%81 (bot dahil ~%91; 3 bilet parçası = 1 bedava çevirme
    // hesaba katılarak). Çevirmelerin ~%31'inde en az bedel geri alınır, ~%10'unda kârla çıkılır; en büyük ödül 50×.
    // Kurallar korunur: bot < %1, teçhizat parçası < %1, anahtar < %0,1, coin analiz kuponu < %1, parşömen yok.
    WHEEL_REWARDS: [
      { id: 'ada_5000',      name: '💎 50 ASTRA BÜYÜK İKRAMİYE',       icon: '💎', type: 'ada',      amount: 50,                     valAda: 50,   weight: 6 },
      { id: 'frag_10',       name: '10 Teçhizat Parçası',             icon: '🧩', type: 'resource', key: 'fragments', amount: 10,   valAda: 4.5,  weight: 20 },
      // Hammadde ödülleri (pazardan alınır, yani hammaddeye talep yaratır): sık gelen "bedelin geri" dilimleri (1 ASTRA) YENİ üç
      // hammaddenindir (taş, kömür, şifalı ot: 13 Ekim 2026 hammadde kullanım planı); nadir 10 ASTRA'lık büyük dilimler odun,
      // demir ve buğdaydır. Dilim sayısı (15), ağırlıklar ve ASTRA değerleri aynı: dönüş oranı değişmez.
      { id: 'raw_1000_wood', name: '10 ASTRA Değerinde Odun',         icon: '🌲', type: 'amm_raw',  key: 'wood',      adaVal: 10,   valAda: 10,   weight: 30 },
      { id: 'raw_1000_iron', name: '10 ASTRA Değerinde Demir',        icon: '⛏️', type: 'amm_raw',  key: 'iron',      adaVal: 10,   valAda: 10,   weight: 30 },
      { id: 'raw_1000_wheat',name: '10 ASTRA Değerinde Buğday',       icon: '🌾', type: 'amm_raw',  key: 'wheat',     adaVal: 10,   valAda: 10,   weight: 30 },
      { id: 'raw_100_stone', name: 'Bedelin Geri: 1 ASTRA Değerinde Taş',       icon: '🪨', type: 'amm_raw', key: 'stone', adaVal: 1, valAda: 1, weight: 700 },
      { id: 'raw_100_coal',  name: 'Bedelin Geri: 1 ASTRA Değerinde Kömür',     icon: '⚫', type: 'amm_raw', key: 'coal',  adaVal: 1, valAda: 1, weight: 700 },
      { id: 'raw_100_herb',  name: 'Bedelin Geri: 1 ASTRA Değerinde Şifalı Ot', icon: '🌿', type: 'amm_raw', key: 'herb',  adaVal: 1, valAda: 1, weight: 700 },
      { id: 'free_bot_24h',  name: '🏆 24 Saatlik Otomasyon Botu (Nadir İkramiye)', icon: '🤖', type: 'bot_free', hours: 24,       valAda: 460,  weight: 2 },
      { id: 'ada_200',       name: '2 ASTRA Nakit Ödül (2×)',         icon: '🟣', type: 'ada',      amount: 2,                      valAda: 2,    weight: 800 },
      { id: 'ada_1000',      name: '👑 10 ASTRA İKRAMİYE (10×)',       icon: '👑', type: 'ada',      amount: 10,                     valAda: 10,   weight: 50 },
      { id: 'ada_50',        name: '0,5 ASTRA Teselli Ödülü',         icon: '🟣', type: 'ada',      amount: 0.5,                    valAda: 0.5,  weight: 2900 },
      { id: 'box_key',       name: '1 Pandora Kutusu Anahtarı',       icon: '🔑', type: 'key',      amount: 1,                      valAda: 10,   weight: 8 },
      { id: 'wheel_ticket_shard', name: 'Amorti Çark Bileti (3 Adet = 1 Çevirme)', icon: '🎟️', type: 'ticket_shard', amount: 1,  valAda: 0.333, weight: 3974 },
      // v1.25: Kupon kodu kaydedilir; trade sitesi (AlphavaxTrade) bu kodları henüz tanımadığı için ekranda
      // "site bağlantısı kurulunca kullanılabilir" diye açıkça belirtilir (eskiden geçerli bir kodmuş gibi gösteriliyordu).
      { id: 'coin_analysis_code', name: 'AlphAvax Vercel App Özel Coin Analiz Bileti', icon: '🎫', type: 'analysis_code', amount: 1, valAda: 0, weight: 50 }
    ],
    // Haftalık Piyango Sistemi
    LOTTERY: {
      TICKET_COST_ADA: 1,          // v2 ölçekli
      SEED_POOL_ADA: 12000000,     // v2 (R3): 12 M ASTRA tohum (eskiden 20 M; model 2 yılda hiç erimedi)
      // Balina koruması: bir hesap bir haftada en fazla bu kadar bilet satın alabilir.
      // Kazanmayan biletler yanmaz; sayı sınırı olmadan, kazanana kadar sonraki haftalara devreder.
      MAX_TICKETS_PER_ACCOUNT: 100,  // haftalık alım sınırı (10.000 ASTRA)
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
        'Zindan: her girişte stamina harcanır. Günün 1. girişinde silahlar aşınmaz. 2.–5. giriş harçsız ödüllüdür ve savaşa giren her askerin silahı 1 aşınır. 6. girişten itibaren kapı harcı ödenir, ödenmezse antrenman girişi olur.',
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
      wheat: 80,
      stone: 40,
      wood: 60,
      coal: 20,
      iron: 50,
      herb: 10,
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
