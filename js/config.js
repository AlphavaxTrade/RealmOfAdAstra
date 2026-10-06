// Realm of AdAstra - Karakter Seviyesi, Kışla Ordusu, Taverna Güçlendirmeleri & AMM Konfigürasyonu
export const GAME_CONFIG = {
  GAME_TITLE: 'Realm of AdAstra',
  GAME_VERSION: '1.35.0',
  // Not: Duyuru şeridi ayarları (ANNOUNCEMENT_TICKER / ANNOUNCEMENTS) dosyanın sonunda TEK yerde tanımlıdır.
  // v1.25 öncesinde üç ayrı kopya vardı ve yalnızca sonuncusu geçerli oluyordu.

  // Stamina — v2.5: Seferler ve Zindan savaşları için genişletilmiş stamina havuzu.
  // Her seviye atlandığında Max Stamina +50 artar (Lv 1: 100, Lv 2: 150, Lv 3: 200, Lv 10: 550, Lv 81: 4.100).
  // Böylece 3 paralel sefer gönderilse dahi geriye zindan katları ve boss savaşları için bol miktarda stamina kalır.
  MAX_STAMINA: 100,
  STAMINA_MAX_PER_LEVEL: 50,          // max = en büyüğü(100 + 50·(L-1), 3,5 × sefer bedeli)
  // Kullanıcı kararı (5 Ekim 2026): seferin stamina bedeli sefer SÜRESİYLE ve üretimle orantılı. Her seviye, 1.000 hammadde
  // başına yakılan buğdayı yalnız STAMINA_EFFICIENCY_PER_LEVEL (%1) azaltır (eskiden 2. seviyede %65, 81'de %94 düşüyordu;
  // orta-üst seviyede stamina için buğday neredeyse hiç yakılmıyordu → buğday enflasyonu).
  // bedel(L) = 20 × (süre(L) / süre(1)) × üretim çarpanı(L) × (1 − 0,01)^(L−1)
  STAMINA_COST_PER_EXPEDITION: 20,    // 1. seviye (18 dk) sefer bedeli
  STAMINA_EFFICIENCY_PER_LEVEL: 0.01,
  STAMINA_MAX_HEADROOM: 3.5,          // en yüksek stamina ≥ 3,5 sefer bedeli (3 alanı aynı anda başlatabilmek için)
  STAMINA_NATURAL_REGEN_INTERVAL: 150,
  // Stamina artık AdAstra ile doldurulamaz, yalnızca buğday ile doldurulabilir:
  WHEAT_PER_STAMINA: 3.15,            // 1 Stamina doldurmak için gereken buğday miktarı (Fix 3.15)

  // Ekonomi kararı (30 Eylül 2026, token modeli: scripts/model/token_economy_model.mjs):
  // %5 Yakım, %3 Yapımcı/Geliştirici Telifi, %6 Evrensel Temel Gelir (UBI) Seviye Havuzu, %86 Hazine.
  // Yakım %13'ten %5'e indi: yatırımcının harcaması daha az erir; yakımın ağırlığı ileride
  // çekim ücretine ve fiyat savunmasına kayar (sunucu aşaması).
  TOKEN_BURN_RATE: 0.05,
  CREATOR_ROYALTY_RATE: 0.03,
  CREATOR_WALLET_ADDRESS: '0x58DBCF66bdd7BfA9da98aDba1965b3794321087C',
  UBI_POOL_RATE: 0.06,
  TOKEN_REWARD_POOL_RATE: 0.86,

  // 🔒 KİLİTLİ BAKİYE — kazanılan ADA'nın çoğu kilitli başlar; oyunda harcanabilir ama çekilemez.
  // Harcadıkça, oynadıkça ve zamanla açılır. Çekim (sunucu aşaması) yalnız serbest kısımdan yapılır.
  LOCKED_BALANCE: {
    FREE_SHARE: 0.20,               // kazancın serbest kısmı (kalanı kilitli)
    UNLOCK_ON_SPEND: 0.20,          // harcamada önce kilitli kısım kullanılır, üstüne harcananın %20'si kadar kilit açılır
    WEEKLY_UNLOCK_BASE: 0.01,       // herkese: kilitli bakiyenin haftada %1'i
    WEEKLY_UNLOCK_ACTIVE: 0.014     // oyuna girilen günler için ek (her gün giren için haftada toplam %1,4)
  },

  // 🏅 KATKI PUANI — ileride ortak haftalık çekim havuzundan pay bu puana göre dağıtılır (sunucu aşaması)
  CONTRIBUTION: {
    ADA_SPEND_WEIGHT: 1.0,          // oyunda harcanan (yakılan/kasaya giden) her ADA
    RESOURCE_BURN_WEIGHT: 0.5,      // harcanan/yakılan hammaddenin pazar değeri (ADA)
    RESOURCE_SALE_WEIGHT: 0.5       // pazara net hammadde satışı (aynı hammaddeyi alıp satmak puan getirmez)
  },

  // 💱 ADA FİYAT ÇARPANI — oyundaki sabit ADA fiyatları ve ödülleri bu çarpanla ölçeklenir.
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
    INITIAL_SEED_POOL: 2400000,          // (v1.25'te kullanılmıyor: UBI yalnızca harcamaların %6'sından beslenir)
    MIN_LEVEL: 3,                        // v1.25: Haftalık temel gelir 3. seviyeden itibaren
    // Tarayıcı sürümünde dünya tek oyuncudur; sunucuya geçince hak sahiplerinin gerçek ağırlık toplamı kullanılır
    LOCAL_OTHER_PLAYERS_WEIGHT: 0
  },

  // =========================================================================
  // 📈 MATEMATİKSEL EKONOMİ VE FİX ÜRETİM MODELİ
  // Seviye arttıkça dakika başına üretim hızı ARTMAZ, sabittir.
  // Seviye arttıkça sadece sefer süresi uzar (Lv 1: 18 dk -> Lv 81: 72 saat).
  // =========================================================================
  BASE_PRODUCTION: {
    wood: 18,  // 18 Odun / dakika (1.080 Odun / saat) - Fix
    iron: 12,  // 12 Demir / dakika (720 Demir / saat) - Fix
    wheat: 30  // 30 Buğday / dakika (1.800 Buğday / saat) - Fix (Haftalık 490k kota ve ordu tüketimiyle uyumlu)
  },
  TAVERNA_BOT: {
    REQUIRED_PREREQUISITES: {
      iron: 50,
      wood: 50,
      wheat: 50,
      adAstra: 50
    },
    // v1.25: Bot kasadaki ADA'nın tamamını silo yükseltmeye gömmez; en az bu kadarını ve
    // (oto-yenileme açıksa) bir sonraki günün bot ücretini her zaman kasada bırakır.
    MIN_ADA_RESERVE: 500,
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

  // 🧭 v1.25: Yeni oyuncu rehberi — ödüller Zindan Ganimet Kasası'ndan (hazine) çekilir, basılmaz.
  ONBOARDING_QUESTS: [
    { id: 'first_expedition',   icon: '🚀', title: 'İlk seferini başlat',        desc: 'Ormana, madene ya da tarlaya bir işçi gönder.',              rewardAda: 100 },
    { id: 'first_harvest',      icon: '🌾', title: 'İlk hasadını topla',         desc: 'Biten bir seferin ürününü ambarına al.',                     rewardAda: 150 },
    { id: 'three_expeditions',  icon: '⚙️', title: 'Üç alanı birden çalıştır',   desc: 'Odun, demir ve buğday seferleri aynı anda sürsün.',           rewardAda: 200 },
    { id: 'bot_trial',          icon: '🤖', title: 'Otomasyon botunu dene',      desc: 'Tavernadan 1 saatlik ücretsiz bot denemesini başlat.',        rewardAda: 100 },
    { id: 'first_level_up',     icon: '⭐', title: 'Seviye 2\'ye ulaş',          desc: 'Deneyim barını doldur ve ilk seviyeni atla.',                 rewardAda: 300 },
    { id: 'first_silo_upgrade', icon: '🏰', title: 'Siloyu büyüt',               desc: 'Ambarını ilk kez yükselt; daha fazla ürün sakla.',            rewardAda: 400 }
  ],
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

  // Kaynak Alanları (Haftalık Limitler & Fix Üretim Hızları)
  GLOBAL_RESOURCE_CAPS: {
    wood: {
      id: 'wood',
      name: 'Zümrüt Meşe Odunu',
      icon: '🌲',
      color: '#4ade80',
      totalCap: 180000, // Haftalık Çıkarım Limiti
      ratePerMinute: 18,
      baseYieldPerHour: 1080,
      requiredTool: 'axe'
    },
    iron: {
      id: 'iron',
      name: 'Derin Demir Cevheri',
      icon: '⛏️',
      color: '#94a3b8',
      totalCap: 130000, // Haftalık Çıkarım Limiti
      ratePerMinute: 12,
      baseYieldPerHour: 720,
      requiredTool: 'pickaxe'
    },
    wheat: {
      id: 'wheat',
      name: 'Güneş Buğdayı',
      icon: '🌾',
      color: '#facc15',
      totalCap: 490000, // Haftalık Çıkarım Limiti
      ratePerMinute: 30,
      baseYieldPerHour: 1800,
      requiredTool: 'sickle'
    }
  },
  
  // Aletler & Tamir Maliyetleri (72 saat = 4320 dakika dayanıklılık; dakika başına 1 durability kaybı)
  // Onarım Kuralı: Dk başı Odun ve Demir üretiminin %25'i / 3 alet + 1 ADA
  // Balta, Kazma ve Orak için dk başı: 1.5 Odun, 1.0 Demir, 0 Buğday, 1.0 ADA
  TOOLS: {
    axe: {
      id: 'axe',
      name: 'Acemi Baltası',
      icon: '🪓',
      maxDurability: 4320, // 72 saat = 4320 dakika
      durabilityLossPerMinute: 1,
      producedResource: 'wood',
      repairCostPerMinute: { wood: 1.5, iron: 1.0, wheat: 0, adAstra: 1.0 }
    },
    pickaxe: {
      id: 'pickaxe',
      name: 'Bronz Kazma',
      icon: '⛏️',
      maxDurability: 4320,
      durabilityLossPerMinute: 1,
      producedResource: 'iron',
      repairCostPerMinute: { wood: 1.5, iron: 1.0, wheat: 0, adAstra: 1.0 }
    },
    sickle: {
      id: 'sickle',
      name: 'Demir Orak',
      icon: '🌾',
      maxDurability: 4320,
      durabilityLossPerMinute: 1,
      producedResource: 'wheat',
      repairCostPerMinute: { wood: 1.5, iron: 1.0, wheat: 0, adAstra: 1.0 }
    }
  },

  // Teçhizat en fazla 10. seviyeye yükseltilir (maliyet: EQUIPMENT_RECIPES ve gameState)
  EQUIPMENT_MAX_LEVEL: 10,

  // ═══════════════════════════════════════════════════════════════════════
  // AMM FİYAT KORİDORU — v2: ARTIK GERÇEKTEN UYGULANIYOR (F-04)
  // ═══════════════════════════════════════════════════════════════════════
  // YASA 3: "Kıt olan pahalıdır." Haftalık küresel kota 180.000 odunsa odun
  // ucuz olamaz. Fiyatlar kota kıtlığına göre yeniden türetildi:
  //   odun  180.000/hafta × 2,50 =   450.000 ADA
  //   demir 130.000/hafta × 4,00 =   520.000 ADA
  //   buğday 490.000/hafta × 0,90 = 441.000 ADA
  //   ────────────────────────────────────────────
  //   Tüm evrenin haftalık emek geliri = 1.411.000 ADA (v1'de 6.264 ADA idi)
  AMM_CORRIDORS: {
    wood:      { minPriceAda: 1.20, maxPriceAda: 6.00,  defaultPriceAda: 2.50 },
    iron:      { minPriceAda: 2.00, maxPriceAda: 9.00,  defaultPriceAda: 4.00 },
    wheat:     { minPriceAda: 0.45, maxPriceAda: 2.20,  defaultPriceAda: 0.90 },
    fragments: { minPriceAda: 20.0, maxPriceAda: 120.0, defaultPriceAda: 45.0 },
    boxes:     { minPriceAda: 5000, maxPriceAda: 35000, defaultPriceAda: 10000 },
    keys:      { minPriceAda: 500,  maxPriceAda: 3500,  defaultPriceAda: 1000 },
    scroll_heal:    { minPriceAda: 15.0, maxPriceAda: 90.0,  defaultPriceAda: 30.0 },
    scroll_stamina: { minPriceAda: 30.0, maxPriceAda: 180.0, defaultPriceAda: 60.0 }
  },

  // Swap ücreti: %2.00 piyasa komisyonu (Hazine Ödül Kasaları, Kalıcı Yakım & UBI'ye aktarılır)
  AMM_FEE_RATE: 0.02,
  // v1.25: Hammadde pazar derinliği = haftalık dünya kotasının bu katı (80× → kotanın tamamı satılsa bile %90 düşüş ~3,4 yıl)
  AMM_RAW_DEPTH_WEEKS: 80,
  // Hammadde Yakım Ücreti: Alınan ve satılan tüm hammaddelerden (odun, demir, buğday vb.) %2.00 kesilir ve anında yakılır
  AMM_RESOURCE_FEE_RATE: 0.02,

  // Karakter seviyesi tavanı (seviye atlama bedeli: gameState.getNextLevelRequirement)
  MAX_PLAYER_LEVEL: 81,

  // =========================================================================
  // SOLDIER & MILITARY SYSTEM (TEK TİP ADASTRA ŞAMPİYONU)
  // =========================================================================
  // Tek bir asker türü: AdAstra Şampiyonu. Level 1'de fix 100 HP ve fix 25 ATK.
  SOLDIER_COST_BASE: 5000,            // Taban maliyet: 5.000 ADA (1. asker)
  SOLDIER_COST_EXPONENT: 2.0364522367650437, // Kademeli artış üssü (1. asker: 5.000 ADA, 18. asker: 1.800.000 ADA)
  SOLDIER_18_TARGET_COST: 1800000,    // 18. asker maliyeti: 1.8 Milyon ADA
  MAX_SOLDIERS: Infinity,             // Sınırsız ordu ve asker alımı
  SOLDIER_MAX_HP: 100,                // Fix Level 1 HP
  SOLDIER_BASE_ATK: 25,               // Fix Level 1 ATK
  SOLDIER_HP_PER_LEVEL: 25,           // Her seviye atlayışta +25 HP
  SOLDIER_ATK_PER_LEVEL: 6,           // Her seviye atlayışta +6 ATK

  // 24 Saatlik Otomatik Asker Doyurma (Pasif İyileşme) Kuralı:
  // 24 saat (1440 dk / 86400 sn) içinde asker kendi kendini otomatik iyileştirirken:
  // Her 1 HP için: 0.30 Buğday + 0.10 ADA tüketilir. Yetersiz bakiye veya buğdayda iyileşme durdurulur.
  SOLDIER_PASSIVE_HEAL: {
    FULL_HEAL_SECONDS: 86400,     // 0 HP'den %100 cana kadar tam iyileşme süresi (24 saat)
    wheatPerHp: 0.30,             // 24 saatte 1 HP başına 0.30 Buğday
    adaPerHp: 0.10                // 24 saatte 1 HP başına 0.10 ADA
  },

  // Hızlı Asker Doyurma (Instant / Fast Heal) Kuralı:
  // 24 saatlik otomatik formülün 10 katı (Deflasyonist Zaman Satın Alma & Hazine Besleme):
  // Her 1 HP için: 3.0 Buğday (0.30 * 10) + 1.0 ADA (0.10 * 10)
  SOLDIER_FAST_HEAL: {
    wheatPerHp: 3.0,             // 24 saatlik formülün 10 katı (3 Buğday / HP)
    adAstraPerHp: 1.0            // 24 saatlik formülün 10 katı (1 ADA / HP)
  },

  // =========================================================================
  // SİLO / DEPO KAPASİTE & YÜKSELTMELERİ (İSTİFÇİLİK ÖNLEME MODELİ)
  // gameState.getWarehouseCapacity bu değerleri okur.
  // Maksimum Seviye: 18
  // Başlangıç (Lv 1): 1080 Odun, 720 Demir, 1800 Buğday
  // Ara seviyeler: başlangıçtan maksimuma eşit oranlı (üssel) büyüme
  // Maksimum (Lv 18): Haftalık havuz tavanının %50'si (90k Odun, 65k Demir, 245k Buğday)
  // Yükseltme Şartı: Tüm depolar %80 dolu olmak zorunda
  // Yükseltme Maliyeti: Mevcut kapasitenin yarısı (%50) + Anlık DEX Pazar ADA karşılığı
  // =========================================================================
  WAREHOUSE: {
    baseLevels: 18,
    initialCapacities: {
      wood: 1080,
      iron: 720,
      wheat: 1800,
      fragments: 100
    },
    maxCapacities: {
      wood: 90000,
      iron: 65000,
      wheat: 245000,
      fragments: 2500
    },
    fragmentsPerLevel: 140,     // Parça kapasitesi ara seviyelerde doğrusal artar (Lv 18'de maxCapacities)
    fillRequirementRatio: 0.80, // %80 Doluluk Şartı
    costRatio: 0.50             // %50 Kapasite Maliyeti
  },

  // Kışla Asker Tipleri (Barracks Troops)
  TROOP_TYPES: {
    infantry: {
      id: 'infantry',
      name: 'Kraliyet Muhafızı',
      icon: '🛡️',
      costAdAstra: 30,
      hp: 120,
      atk: 25,
      desc: 'Yüksek can havuzuyla düşman darbelerini karşılar.'
    },
    archer: {
      id: 'archer',
      name: 'Zümrüt Okçusu',
      icon: '🏹',
      costAdAstra: 50,
      hp: 80,
      atk: 45,
      desc: 'Uzaktan yüksek kritik hasar vurur.'
    },
    knight: {
      id: 'knight',
      name: 'Paladin Şampiyonu',
      icon: '⚔️',
      costAdAstra: 100,
      hp: 250,
      atk: 80,
      desc: 'Ağır zırhlı ve yüksek saldırı gücüne sahip efsanevi savaşçı.'
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TAVERNA — v2 fiyatlaması (F-17)
  // ═══════════════════════════════════════════════════════════════════════
  // v1'de 45.000 ADA'lık iksir verimi HİÇ artırmıyordu; 40 ADA'lık eski
  // `speed_wood` buff'ı ise hem süreyi hem verimi 1,5× yapıyordu. Yani pahalı
  // ürün ucuzdan 1.125 kat daha kötüydü. Eski buff'lar kaldırıldı, iksirler
  // artık HEM süreyi HEM verimi çarpıyor ve yeni gelir düzeyine göre fiyatlandı.
  TAVERN_BUFFS: {
    auto_collector: {
      id: 'auto_collector',
      name: 'Günlük Otomatik Toplama & Tamir Botu (24 Saat)',
      icon: '🤖',
      durationSeconds: 24 * 3600,
      costAdAstra: 1800,
      desc: 'Seferler bittiğinde kaynakları otomatik toplar, aletleri depodaki hammaddeyle otomatik tamir eder ve seferi kesintisiz sürdürür.'
    },
    auto_collector_weekly: {
      id: 'auto_collector_weekly',
      name: 'Haftalık Otomatik Toplama & Tamir Botu (7 Gün)',
      icon: '🤖',
      durationSeconds: 7 * 24 * 3600,
      costAdAstra: 10700,
      desc: '7 gün boyunca tüm seferleri otomatik toplar, depodaki hammaddeyle aletleri otomatik onarır ve seferleri sürdürür (%15 İndirimli).'
    },
    auto_collector_monthly: {
      id: 'auto_collector_monthly',
      name: 'Aylık Otomatik Toplama & Tamir Botu (30 Gün)',
      icon: '🤖',
      durationSeconds: 30 * 24 * 3600,
      costAdAstra: 37800,
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
      cost: { fragments: 18, iron: 60, wood: 40, adAstra: 50 },
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
      cost: { fragments: 12, iron: 40, wood: 20, adAstra: 35 },
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
      cost: { fragments: 20, iron: 80, wood: 30, adAstra: 60 },
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
      cost: { fragments: 14, iron: 50, wood: 25, adAstra: 40 },
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
      cost: { fragments: 10, iron: 30, wood: 35, adAstra: 30 },
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
  GENESIS_NFT: {
    id: 'genesis_champion',
    name: 'AdAstra Genesis Şampiyonu',
    icon: '🏆',
    requiredArtifacts: 18,
    adAstraCost: 500
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

  // ⏳ HENÜZ OYUNA BAĞLI DEĞİL (tasarım taslağı, bkz. docs/GELISTIRME_ONERILERI.md §12)
  // Haftalık rotasyonlu kat etkileri — aynı zindan her hafta farklı oynanır
  DUNGEON_MODIFIERS: [
    { id: 'lava', name: 'Kaynayan Zemin', desc: 'Her tur tüm birimler 18 yanma hasarı alır.', kind: 'dot', magnitude: 18 },
    { id: 'gloom', name: 'Kadim Karanlık', desc: 'Tüm iyileştirmeler %50 azalır.', kind: 'healCut', magnitude: 0.5 },
    { id: 'gale', name: 'Fırtına Rüzgârı', desc: 'Arka saf koruması zayıflar: sızma şansı iki katına çıkar.', kind: 'coverCut', magnitude: 0.7 },
    { id: 'ironstorm', name: 'Demir Fırtınası', desc: 'Tüm birimlerin zırhı %25 azalır.', kind: 'armorCut', magnitude: 0.25 },
    { id: 'blessing', name: 'Yıldız Kutsaması', desc: 'Tüm müttefikler +%12 saldırı gücü kazanır.', kind: 'allyBuff', magnitude: 0.12 }
  ],

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
    // Harç, o katın temel ADA ödülünün bu oranı kadardır ve %100'ü zindan kasasına gider.
    GATE_FEE_RATE: 0.20,
    // Zindan kasası bir günde en fazla bakiyesinin bu oranı kadar ADA öder → kasa matematiksel olarak boşalamaz.
    DAILY_BUDGET_RATE: 0.01,
    // Zafer ödülü (gameState.getDungeonBaseReward): seviye × taban; Lv.9 ve Lv.18 bosslarında × çarpan.
    // Canavar bilgileri (can, saldırı, asker XP'si) js/bestiary.js'te.
    REWARD_ADA_PER_LEVEL: 90,
    REWARD_XP_PER_LEVEL: 200,
    MAJOR_BOSS_REWARD_MULT: 3
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
    // Ligler (gameState.getColosseumTier), yüksekten düşüğe. rewardMult: maç ödülü çarpanı.
    // weeklyAda / weeklyKeys: ⏳ haftalık lig ödülü — HENÜZ DAĞITILMIYOR (tasarım taslağı).
    LEAGUES: [
      { id: 'champion', name: '👑 Efsanevi Şampiyon', color: '#f59e0b', rewardMult: 2.0, minRating: 1800, weeklyAda: 25000, weeklyKeys: 8 },
      { id: 'diamond',  name: '💎 Elmas Gladyatör',   color: '#38bdf8', rewardMult: 1.6, minRating: 1500, weeklyAda: 9000,  weeklyKeys: 5 },
      { id: 'gold',     name: '🥇 Altın Gladyatör',   color: '#eab308', rewardMult: 1.3, minRating: 1300, weeklyAda: 3500,  weeklyKeys: 3 },
      { id: 'silver',   name: '🥈 Gümüş Gladyatör',   color: '#94a3b8', rewardMult: 1.1, minRating: 1150, weeklyAda: 1200,  weeklyKeys: 2 },
      { id: 'bronze',   name: '🥉 Bronz Gladyatör',   color: '#b45309', rewardMult: 1.0, minRating: 0,    weeklyAda: 400,   weeklyKeys: 1 }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 🌋 WORLD BOSS — gerçek zamanlayıcı, fazlar, gerçek stake kilidi (F-03/F-21)
  // ═══════════════════════════════════════════════════════════════════════
  WORLD_BOSS: {
    BATTLE_DAY_UTC: 0,          // 0 = Pazar
    BATTLE_HOUR_UTC: 15,        // 15:00 UTC = 18:00 TSİ
    BASE_HP: 1000000,
    WEEKLY_DISTRIBUTION_RATE: 0.10, // Kasa ne kadar olursa olsun haftalık World Boss etkinliğinde kasanın sadece %10'u o haftaki etkinlikte dağıtılır
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
  TREASURY_ALLOCATION: { dungeon: 0.30, arena: 0.15, worldBoss: 0.15, ammBuyback: 0.15, quest: 0.21, carnival: 0.04 },
  TREASURY_POOL_NAMES: {
    dungeon: 'Zindan Ganimet Kasası',
    ammBuyback: 'AMM DEX & Likidite Rezervi',
    worldBoss: 'World Boss Ödül Havuzu',
    arena: 'Kolezyum Şampiyonluk Havuzu',
    carnival: 'Sirk & Karnaval Ödül Havuzu',
    quest: 'Görev & Ücretsiz Oyuncu Kasası'
  },
  TREASURY_TARGET_RESERVE: { dungeon: 10000000, ammBuyback: 7200000, worldBoss: 6000000, arena: 4000000, carnival: 4000000, quest: 8000000 },
  // Ücretsiz oyuncu havuzu (sunucu aşaması): görev kasasından ayda piyasa değerinin %1'i, kişi başı en fazla 100$
  // Ücretsiz oyuncu payı (sahte hesaplara karşı, 4 Ekim 2026 — ayrıntı js/economy/faucet.js): en az MIN_LEVEL seviye ve o hafta
  // en az MIN_WEEKLY_CONTRIBUTION katkı puanı (× fiyat çarpanı); pay = katkı^WEIGHT_EXP × sadakat serisi (haftada +STREAK_STEP,
  // en çok STREAK_MAX; kaçırılan hafta seriyi yarıya indirir); kişi başı tavan da ağırlıkla ölçeklenir (tam tavan için
  // FULL_CONTRIBUTION katkı + en yüksek seri); pay tamamen kilitli gelir.
  FREE_PLAYER_POOL: { MONTHLY_MCAP_SHARE: 0.01, MAX_USD_PER_PLAYER: 100, MIN_LEVEL: 3, MIN_WEEKLY_CONTRIBUTION: 100, FULL_CONTRIBUTION: 1000, WEIGHT_EXP: 1.5, STREAK_STEP: 0.1, STREAK_MAX: 2.0, LOCKED: true },
  TREASURY_MIN_PAYOUT_RATIO: 0.15,   // havuz boşalsa bile ödül tamamen sıfırlanmaz
  TREASURY_SINGLE_DRAW_CAP: 0.02,    // tek ödül havuzun en fazla %2'sini çekebilir

  // ═══════════════════════════════════════════════════════════════════════
  // ⏳ HENÜZ OYUNA BAĞLI DEĞİL — gelecek sistemlerin tasarım taslakları
  // (eşya eklentileri, sezon, prestij; bkz. docs/GELISTIRME_ONERILERI.md §12-13)
  // ═══════════════════════════════════════════════════════════════════════
  // 🎲 EKİPMAN EKLENTİLERİ (AFFIX) — aynı kılıç iki oyuncuda aynı olmaz
  EQUIPMENT_AFFIXES: [
    { id: 'sharp',    name: 'Keskin',     icon: '🗡️', stat: 'atk',       tiers: [4, 9, 16],       weight: 22 },
    { id: 'sturdy',   name: 'Sağlam',     icon: '🛡️', stat: 'armor',     tiers: [6, 13, 24],      weight: 22 },
    { id: 'vital',    name: 'Dirençli',   icon: '❤️', stat: 'hp',        tiers: [18, 40, 75],     weight: 20 },
    { id: 'swift',    name: 'Çevik',      icon: '💨', stat: 'speed',     tiers: [2, 4, 7],        weight: 14 },
    { id: 'deadly',   name: 'Ölümcül',    icon: '🎯', stat: 'crit',      tiers: [0.03, 0.06, 0.10], weight: 12 },
    { id: 'piercing', name: 'Delici',     icon: '🔺', stat: 'pen',       tiers: [8, 18, 32],      weight: 7 },
    { id: 'vampiric', name: 'Kan Emici',  icon: '🩸', stat: 'lifesteal', tiers: [0.04, 0.08, 0.14], weight: 3 }
  ],
  AFFIX_RARITY: [
    { id: 'common',    name: 'Yaygın',   color: '#94a3b8', affixCount: 1, tier: 0, weight: 55 },
    { id: 'rare',      name: 'Nadir',    color: '#38bdf8', affixCount: 2, tier: 0, weight: 27 },
    { id: 'epic',      name: 'Epik',     color: '#c084fc', affixCount: 2, tier: 1, weight: 13 },
    { id: 'legendary', name: 'Efsanevi', color: '#fbbf24', affixCount: 3, tier: 2, weight: 5 }
  ],


  // 60 günlük sezon: ücretsiz şerit herkese, premium şerit ADA ile.
  // F2P/P2E dengesinin en temiz kaldıracı — para EKSTRA alır, ZORUNLU değil.
  SEASON: {
    DURATION_DAYS: 60,
    PREMIUM_COST_ADA: 12000,
    TIERS: 30,
    POINTS_PER_TIER: 150,
    FREE_TRACK:    { adaPerTier: 60,  keysEvery: 5, fragmentsEvery: 3, boxEvery: 10 },
    PREMIUM_TRACK: { adaPerTier: 190, keysEvery: 3, fragmentsEvery: 2, boxEvery: 5 }
  },

  // Prestij: Lv.81'e ulaşan oyuncuya yeni ufuk
  PRESTIGE: {
    REQUIRED_LEVEL: 81,
    PRODUCTION_BONUS_PER_STAR: 0.05,
    MAX_STARS: 10,
    COST_ADA: 50000
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 🎪 KRALLIK KARNAVALI: ŞANS ÇARKI & HAFTALIK PİYANGO
  // ═══════════════════════════════════════════════════════════════════════
  CARNIVAL: {
    WHEEL_COST_ADA: 100, // 100 ADA veya dengi hammadde veya 1 Piyango Bileti
    // Karnaval kasasında en az bu kadar ADA yoksa çark geçici olarak kapanır (ödüller asla yoktan ödenmez)
    WHEEL_MIN_CARNIVAL_BALANCE: 20000,
    // Kullanıcı kararı (4 Ekim 2026): ADA ile çevrilen çarkın bedelinin %80'i DOĞRUDAN Karnaval kasasına girer (ödüller bu
    // kasadan ödenir; eskiden yalnız %3,4'ü giriyordu ve kasa her çevirmede ~50 ADA eriyordu). Kalan %20 her harcama gibi
    // dağıtılır (yakım, yapımcı payı, temel gelir, hazine kasaları).
    WHEEL_CARNIVAL_SHARE: 0.80,
    // Hammadde oyunda bedava toplandığı için hammaddeyle çevirme günde en çok bu kadar (kasa bu yoldan erimesin)
    WHEEL_RESOURCE_DAILY_LIMIT: 3,
    // 15 ödül (4 Ekim 2026 çalışması). Oyuncuya ortalama dönüş ~%81 (bot dahil ~%91; 3 bilet parçası = 1 bedava çevirme
    // hesaba katılarak). Çevirmelerin ~%31'inde en az bedel geri alınır, ~%10'unda kârla çıkılır; en büyük ödül 50×.
    // Kurallar korunur: bot < %1, teçhizat parçası < %1, anahtar < %0,1, coin analiz kuponu < %1, parşömen yok.
    WHEEL_REWARDS: [
      { id: 'ada_5000',      name: '💎 5.000 $ADASTRA BÜYÜK İKRAMİYE',  icon: '💎', type: 'ada',      amount: 5000,                   valAda: 5000, weight: 6 },
      { id: 'frag_10',       name: '10 Teçhizat Parçası',             icon: '🧩', type: 'resource', key: 'fragments', amount: 10,   valAda: 450,  weight: 20 },
      { id: 'raw_1000_wood', name: '1.000 ADA Değerinde Odun',        icon: '🌲', type: 'amm_raw',  key: 'wood',      adaVal: 1000, valAda: 1000, weight: 30 },
      { id: 'raw_1000_iron', name: '1.000 ADA Değerinde Demir',       icon: '⛏️', type: 'amm_raw',  key: 'iron',      adaVal: 1000, valAda: 1000, weight: 30 },
      { id: 'raw_1000_wheat',name: '1.000 ADA Değerinde Buğday',      icon: '🌾', type: 'amm_raw',  key: 'wheat',     adaVal: 1000, valAda: 1000, weight: 30 },
      { id: 'raw_100_wood',  name: 'Bedelin Geri: 100 ADA Değerinde Odun',   icon: '🌲', type: 'amm_raw', key: 'wood',  adaVal: 100, valAda: 100, weight: 700 },
      { id: 'raw_100_iron',  name: 'Bedelin Geri: 100 ADA Değerinde Demir',  icon: '⛏️', type: 'amm_raw', key: 'iron',  adaVal: 100, valAda: 100, weight: 700 },
      { id: 'raw_100_wheat', name: 'Bedelin Geri: 100 ADA Değerinde Buğday', icon: '🌾', type: 'amm_raw', key: 'wheat', adaVal: 100, valAda: 100, weight: 700 },
      { id: 'free_bot_24h',  name: '🏆 24 Saatlik Otomasyon Botu (Nadir İkramiye)', icon: '🤖', type: 'bot_free', hours: 24,       valAda: 46000, weight: 2 },
      { id: 'ada_200',       name: '200 $ADASTRA Nakit Ödül (2×)',    icon: '🟣', type: 'ada',      amount: 200,                    valAda: 200,  weight: 800 },
      { id: 'ada_1000',      name: '👑 1.000 $ADASTRA İKRAMİYE (10×)',icon: '👑', type: 'ada',      amount: 1000,                   valAda: 1000, weight: 50 },
      { id: 'ada_50',        name: '50 $ADASTRA Teselli Ödülü',       icon: '🟣', type: 'ada',      amount: 50,                     valAda: 50,   weight: 2900 },
      { id: 'box_key',       name: '1 Pandora Kutusu Anahtarı',       icon: '🔑', type: 'key',      amount: 1,                      valAda: 1000, weight: 8 },
      { id: 'wheel_ticket_shard', name: 'Amorti Çark Bileti (3 Adet = 1 Çevirme)', icon: '🎟️', type: 'ticket_shard', amount: 1,  valAda: 33.3, weight: 3974 },
      // v1.25: Kupon kodu kaydedilir; trade sitesi (AlphavaxTrade) bu kodları henüz tanımadığı için ekranda
      // "site bağlantısı kurulunca kullanılabilir" diye açıkça belirtilir (eskiden geçerli bir kodmuş gibi gösteriliyordu).
      { id: 'coin_analysis_code', name: 'AlphAvax Vercel App Özel Coin Analiz Bileti', icon: '🎫', type: 'analysis_code', amount: 1, valAda: 0, weight: 50 }
    ],
    // Haftalık Piyango Sistemi
    LOTTERY: {
      TICKET_COST_ADA: 100,
      SEED_POOL_ADA: 20000000,     // 20.000.000 ADA AlphaVax Tohum Kasa
      // Balina koruması: bir hesap bir haftada en fazla bu kadar bilet satın alabilir.
      // Kazanmayan biletler yanmaz; sayı sınırı olmadan, kazanana kadar sonraki haftalara devreder.
      MAX_TICKETS_PER_ACCOUNT: 100,  // haftalık alım sınırı (10.000 ADA)
      WINNER_MULTIPLIER: 2.0,        // Kazanan, biletlerine ödediğinin 2 katını alır
      AMORTI_SHARE: 0.02             // Bilet bedelinin %2'si amorti kasasına
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
        'Tek tip elit asker: "AdAstra Şampiyonu" (Lv.1: 100 HP, 25 ATK); 18 saatlik otomatik pasif doyurma (1 HP = 0.30 Buğday + 0.10 ADA) ve 100 katı anında hızlı doyurma (1 HP = 30 Buğday + 10 ADA).',
        'Zindanda Persistent Canavar Canı (kaybedilen savaşta canavarın canı yenilenmez).',
        'Krallık Demircisi "Çantam" kategorik filtreleri, seviye sıralaması ve toplu yükseltme/onarım.',
        'Yeni Teçhizat Craft & Upgrade matematiği (ATK 18 dk, HP 21 dk üretim + AMM ADA + Parça; 13 Dayanıklılık).',
        '24 Saatlik Kâr Ortaklı Taverna Otomasyon Botu (Saf kârın %50\'si) & Silo yönetimi.',
        'Krallık Karnavalı: 14 Ödüllü Şans Çarkı (RTP %78, Kasa Kârı %22) & 1M ADA Tohumlu Haftalık Piyango.',
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
        'Ordu hızlı doyurma (Instant Heal) maliyeti, zindan havuzunu korumak ve deflasyonist yapıyı beslemek amacıyla 10x altın orana (1 HP = 3.0 Buğday + 1.0 ADA) uyarlandı.',
        '100x aşırı çarpan kaldırılarak tek asker tam canı 300 Buğday + 100 ADA, 18 kişilik tüm ordu ise 5.400 Buğday + 1.800 ADA seviyesine kalibre edildi.',
        'Hızlı doyurmada harcanan tüm $ADASTRA anında Hazine Muhasebesine (%22 Kalıcı Yakım + %78 Hazine Havuzları) işlenerek deflasyonist token yakımı ve havuz sponsorluğu sağlandı.',
        '18 saatlik düşük maliyetli pasif doyurma (1 HP = 0.30 Buğday + 0.10 ADA) aynen korunarak sabırlı emek veren oyuncuların zindan kârlılığı teminat altına alındı.'
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
        'Pandora Kutusu (10.000 ADA) ve Anahtar (1.000 ADA) AMM DEX havuzları yüksek değerleme ve sanal derinlik modeliyle optimize edildi.',
        'Pandora Kutularını açmak için Anahtar zorunluluğu getirildi. Anahtarların Zindan düşüşü kapatıldı; yalnızca Kolezyum sıralaması ve Şans Çarkından düşebilir hale getirildi.',
        'Koleksiyonu tamamlayan gezginler, düşürdükleri Pandora Kutularını AMM havuzunda ~10.000 $ADASTRA gibi devasa bir bedelle satabilme imkanına kavuştu.',
        'Piyango 2x Kazanç Sistemi: Kazanan kişi havuzun %18\'i yerine satın aldığı bilet tutarının tam 2 katını (2x) nakit kazanır, biletleri yakılır ve devasa 20M+ havuz devrederek büyümeye devam eder.',
        'Balina İstiflemesini Önleme Kotası: Her hesabın haftalık satın alabileceği maksimum bilet sayısı 100 bilet (10.000 ADA) ile sınırlandırıldı.'
      ]
    },
    {
      version: 'v1.14',
      title: 'Karnaval & AMM Hazine Rezervi Kalibrasyonu, Amorti 3x ve Talihli Payı',
      date: 'Eylül 2026',
      changes: [
        'Karnaval Çarkı hammadde yakım sayacı bağımsızlaştırılarak sadece çarkta yakılan kaynaklar için özel sayaç bağlandı.',
        'Hazine kasalarındaki yanıltıcı "doluluk oranı" kaldırılarak her kasada net ADA miktarı gösterildi.',
        'Karnaval çarkında kazanılan tüm ödüller havadan basılmak yerine Karnaval hazine bütçesiyle AMM pazarından buyback yapılıp teslim edilecek şekilde uyarlandı.',
        'Çark amorti bilet gereksinimi 10 adetten 3 adede düşürüldü (3 bilet parçası = 1 çevirme).',
        'AMM DEX işlemlerinde alınan %2 komisyon ile toplam kaç adet demir, odun ve buğday yakıldığını gösteren canlı sayaç kartı eklendi.',
        'Piyangodaki "Bu haftaki talihli payı" silindi; yerine talihlinin biletlerini yakıp değerinin tam 2 katı ADA\'yı kasadan çektiği "Talihli Bilet Yak & 2 Katı ADA Kasadan Çek" bölümü eklendi.'
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
        'Hazine Güvenlik Tavanı: Kasada kaç milyon ADA olursa olsun, bir döngüde en fazla %10 bütçe harcanabilir; kalan %90 rezervde kalıp arkadaki kale görevini sürdürür.',
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
        'Silo Doluluk Tercihi Tam Entegrasyonu: "Siloyu Yükselt" seçiliyken ambarlar otomatik üst seviyeye taşınır, "Kaynakları Sat" modundayken %50 rezerve korunarak fazlalık AMM DEX pazarında satılıp ADA biriktirilir.',
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
        'Çark sonuç ekranına ve toast bildirimlerine "🏛️ KARNAVAL HAZİNESİ AMM BUYBACK DEKONTU" eklendi; satın alınan miktar, kasadan ödenen ADA ve anlık fiyat artışı (P_eski ➔ P_yeni ADA, +%X.XX 📈) canlı olarak raporlanır.',
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
        'Daha önce yalnızca ADA eksikliğinde kaynak satan tek yönlü sistem; hem ADA eksildiğinde kaynak satan hem de hammadde azaldığında piyasadan kaynak satın alan tam otonom çift yönlü dengeleyiciye dönüştürüldü.',
        'Silo Seviye 3, 4 ve üzeri yükseltmelerde tüm ambarlar sıfırlandığında botun duraklatılması (paused) engellendi; yükseltme tamamlandığı an kasadaki ADA ile ambarlara güvenlik rezervi otomatik temin edildi.',
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
        'Bot Satın Alımında Ani Silo Seviye 2 Koruması: Bot satın alındığı sıfırıncı saniyede henüz sefer toplanmamışken kullanıcının kalan ~3.884 ADA parasını anında siloya gömen kontrolsüz yükseltme kökünden engellendi. Silonun yükseltilmesi yalnızca botun sefer tamamlayıp depoyu doldurması kuralına bağlandı.',
        'AMM Market Fiyat Şişirme Engeli: Botun kasadaki ADA ile AMM\'den zorla odun/demir/buğday satın alıp piyasa fiyatlarını artıran ve kullanıcının ADA\'sını tüketen alım çağrıları kaldırıldı. Bot bir hammadde üreticisidir; alet tamiri veya silo için ADA lazımsa depodaki hammaddeyi AMM\'de SATARAK ADA temin eder ve pazar fiyatlarının düşmesini sağlar.',
        'Taverna Bot Satın Alma Radyo Seçeneği Senkronizasyonu: Satın alma anında kullanıcının seçtiği "Siloyu Yükselt" veya "Akıllı Satış" tercihi anında state\'e kaydedilir.',
        '38 birim testin tamamı (tüm zindan, dövüş, ekonomi ve bot testleri) sıfır hata ile %100 doğrulandı.'
      ]
    },
    {
      version: 'v1.24.1',
      title: '🛡️ 24s Bot AMM Oto-Alım Kaldırılması & Başlangıç Demir Rezervi Senkronizasyonu',
      date: 'Eylül 2026',
      changes: [
        'Bot Satın Alımında AMM Marketinden Kaynak Alımı Tamamen Yasaklandı: Bot satın alındığında siloyu doldurmak için kullanıcının kasasındaki ADA ile AMM pazarından zorla kaynak satın alıp fiyatları fırlatan autoBuyBotResourceDeficit fonksiyonu kalıcı olarak devre dışı bırakıldı.',
        'Başlangıç Profili Demir Stoğu (40 -> 50): Yeni başlayan oyuncunun 50x bot çalışma önkoşulunu (50 Demir, 50 Odun, 50 Buğday, 50 ADA) eksiksiz karşılaması için başlangıç demiri 50 yapıldı.',
        'Bot Üretici Kimliği Güvencesi: Bot yalnızca seferlerden hammadde toplar. Alet tamiri için ADA gerektiğinde silodaki fazla hammaddeyi AMM\'de satarak hem ADA üretir hem de pazar fiyatlarını düşürür.'
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
        'Piyango: her bilet 100 ADA, haftalık bilet sınırı var. Her hafta tek kazanan çıkar ve biletlerine ödediğinin 2 katını alır; biletleri ödülü çekerken yanar. Kazanamayanın biletleri yanmaz, sonraki haftaya devreder. Kasa biterse amorti kasası kalan tüm biletlere eşit dağıtılır.',
        'Çarkta 1 piyango bileti = 1 çevirme; yakılan biletin bedeli piyango ödül hesabından da düşer.',
        'Haftalık temel gelir (UBI): oyunda harcanan her ADA\'nın %6\'sı haftalık kasada birikir, Pazartesi 00:01 (TSİ) açılır ve 3. seviyeden itibaren seviyeye göre paylaşılır; çekilmeyen pay sonraki haftaya devreder.',
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
        'Arayüz: bildirimler sağ alta alındı, mobilde bakiye kısaltıldı (1,97 Mn), dar ekranda üst menü taşmıyor, İngilizce etiketler Türkçeleştirildi, kışlada "Infinity" yazısı düzeltildi.',
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
        'Kilitli bakiye: oyundan kazandığın ADA\'nın %20\'si serbest, %80\'i kilitli başlar. Kilitli ADA\'yı oyunda harcayabilirsin; harcadıkça, her gün oynadıkça ve zamanla açılır. Hazine panelinde ve bakiyenin üzerine gelince serbest/kilitli miktarı görünür.',
        'Katkı puanı: oyunda harcadığın her ADA, yaktığın ve pazara sattığın hammadde puan kazandırır. İleride haftalık çekim hakkından payını bu puan belirleyecek.',
        'ADA fiyat çarpanı: asker, iyileşme, bilet, çark ve Genesis NFT fiyatları ile zindan ve görev ödülleri tek bir çarpana bağlandı. ADASTRA\'nın değeri değişince çarpan haftada en fazla %5 değişerek oyunun dolar maliyetini dengeler (şimdilik ×1).'
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
        'Karnaval Çarkı hammaddeyle çevrilince ödenen hammaddenin yarısı yakılır, yarısı pazarda satılır ve gelen ADA Karnaval kasasına girer (ödüller bu kasadan ödenir).',
        'Tarayıcı koruması açıldı: oyun sayfasında yalnız oyunun kendi kodu çalışabilir.'
      ]
    },
    {
      version: 'v1.31',
      title: '🎡 Yeni Şans Çarkı & Adil Ücretsiz Oyuncu Payı',
      date: '4 Ekim 2026',
      changes: [
        `Şans Çarkı yenilendi: oyuncuya ortalama dönüş %63'ten ~%81'e çıktı (bot hariç). Çevirmelerin ~%31'inde en az bedelini geri alırsın, ~%10'unda kârla çıkarsın. Yeni 💎 5.000 ADA Büyük İkramiye (50×).`,
        `Çark artık kendi kendini besliyor: ADA ile çevirmenin %80'i doğrudan Karnaval kasasına girer, kasa erimez ve çark kapanmaz.`,
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
        `Seviye atlama ve silo yükseltmede "Hızlı al": eksik hammaddeleri ADA'n yetiyorsa tek tuşla pazardan alır.`,
        `Hesabım: kilitli ADA'nın nasıl açılacağını, yarın ve 7 günde ne kadarının açılacağını gösteren panel; pencere dışına tıklayınca kapanır.`
      ]
    },
    {
      version: 'v1.33',
      title: '💸 Şeffaf ADA Oranları',
      date: '6 Ekim 2026',
      changes: [
        `Oyundaki bütün ADA oranları (yakım, yapımcı payı, temel gelir, ödül kasaları, çark, zindan harcı, piyango, pazar komisyonu, çekim ücreti) artık herkesin görebileceği bir akıllı sözleşmede. Bir oran değişirse 24 saat önceden görünür.`,
        `Askerlerin kendi kendine iyileşmesinde harcanan ADA artık her harcama gibi kasalara dağıtılıyor (önceden hiçbir kasaya yazılmıyordu).`,
        `Kullanılan teçhizat parçası, anahtar, kutu ve parşömenler yakım kaydına giriyor.`
      ]
    },
    {
      version: 'v1.34',
      title: '🎟️ Promo Kodları',
      date: '6 Ekim 2026',
      changes: [
        `Promo kodu: kayıtta ya da oyunda Hesabım → Promo kodu'na yaz. Ödül ADA (kilitli, oyunda harcadıkça açılır) ya da hammadde, anahtar, kutu, parşömen olabilir; bedeli görev kasasından ödenir.`,
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
    adAstraBalance: 250,
    inventory: {
      wood: 60,
      iron: 50,
      wheat: 80,
      fragments: 0
    },
    tools: {
      axe: { durability: 4320, totalGathered: 0 },
      pickaxe: { durability: 4320, totalGathered: 0 },
      sickle: { durability: 4320, totalGathered: 0 }
    },
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
  // 📢 CANLI KAYAN DUYURU & RİSK UYARI PANOSU (TOP MARQUEE TICKER)
  // ═══════════════════════════════════════════════════════════════════════
  ANNOUNCEMENTS: [
    {
      id: 'audit_risk_warning',
      badge: '🚨 KRİTİK GÜVENLİK & RİSK UYARISI',
      badgeColor: '#ef4444',
      text: 'bu oyun tamamen antigravity ide gemini 3.8 flash botu ile yazılmıştır. hiçbir audit yapılmamıştır ve yazılım/kodlama bilmeyen tek bir kullanıcı tarafından geliştirilmektedir, bu sebepten bir çok güvenik açığı bulunabilir. bu güvenlik açıkları tamamen tespit edilip oyun audit edilene kadar lütfen oyuna ana web3 cüzdanınızla bağlanmayın. sadece bu oyunda kullancağınız yeni bir web3 cüzdan açın, yapacağınız yatırımlarda olası bir hacklenme veya güvenlik zaafında yatırımlarınızın gidebileceğini unutmayın. şuan bu oyun tamamen deneysel bir süreçtir lütfen riskinizi gözeterek yatırım yapın. eğer sürece ve şu anki duruma güvenmiyorsanız lütfen oyunu oynamayın, yatırıp yapmayın veya tamamen free to play olarak oynayın. anlayısınız ve ilginiz için teşekkür ederim',
      active: true,
      priority: 1
    },
    {
      id: 'v125_economy_update',
      badge: '👑 REALM OF ASTRA v1.25',
      badgeColor: '#f59e0b',
      text: 'v1.25 yayında: canlı krallık haritası, yenilenen arayüz, güvenli piyango ve çark, çevrimdışıyken de çalışan bot, seviye başına %1,5 üretim bonusu ve yeni oyuncu rehberi.',
      active: true,
      priority: 2
    }
  ],
  ANNOUNCEMENT_TICKER: {
    enabled: true,
    speedSeconds: 55,
    pauseOnHover: true,
    showPulseDot: true,
    separator: '✦'
  },
  TICKER_CONFIG: {
    enabled: true,
    speedSeconds: 55,
    pauseOnHover: true,
    showPulseDot: true,
    separator: '✦'
  }
};
