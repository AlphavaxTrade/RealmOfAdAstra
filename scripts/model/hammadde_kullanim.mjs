// Hammadde kullanım planı — haftalık arz/talep ölçümü (13 Ekim 2026). Oyun motorunun gerçek işlevlerini çağırır
// (ayrı bir model yok), bu yüzden kurallar değişince sayılar kendiliğinden güncellenir.
//   node scripts/model/hammadde_kullanim.mjs [--eski] [--json]
//     --eski : 13 Ekim 2026 öncesi kurallarla (üç alanlı seviye bedeli, onarım /3, yükseltmede kömür/taş yok, Konsey karışımı
//              taş-demir-odun) aynı ölçümü verir: karşılaştırma için.
//
// 14 Ekim 2026 ikinci tur: Sv.10+ taş / kömür / şifalı ot talebi seviye bedelinin siloya sığdırılması yüzünden bandın altındadır;
// bu KABUL edildi (docs/v2/HAMMADDE_KULLANIM_PLANI.md bölüm 8): termostat kotayı kısar, fiyat açılışta kalır. İzleme: bu çıktıdaki
// "denge kotası" satırı ve haftalık özetteki kotaTabani listesi (server/world/haftalik.js).
//
// Referans oyuncu: altı alanı kesintisiz çalıştıran (bot) bir hesap. Bir haftanın talebi:
//   seviye atlama · alet onarımı · stamina (buğday) · köylü iaşesi · teçhizat (1 dövme + 1 yükseltme + 2 onarım) ·
//   ev yapımı (2 haftada bir) · silo yükseltmesi (3 haftada bir) · asker iyileştirme (şifalı ot) ·
//   Konsey (ortak kasa payı %5 + gönüllü katkı: haftalık hakkın %15'i).
// Arz iki türlüdür: tam üretim (alet kesintisiz çalışırsa) ve Üretim Hakkı (gerçekte çıkarılabilecek). Hedef bant:
// talep / tam üretim ≈ 0,45–0,95 her hammadde için (altısı da). Çok düşük: hammadde pazarda birikir, fiyat tabana iner,
// termostat kotayı kısar, bölge anlamsızlaşır. Çok yüksek: sürekli kıtlık, oyuncu pazardan alamaz.
const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../../js/gameState.js');
const { GAME_CONFIG } = await import('../../js/config.js');
const { ammMarket } = await import('../../js/ammMarket.js');

const K = GAME_CONFIG.RESOURCE_KEYS;
const HAFTA = 10080;
const JSON_CIKTI = process.argv.includes('--json');
const ESKI = process.argv.includes('--eski');
const sifir = () => Object.fromEntries(K.map((k) => [k, 0]));
const topla = (hedef, kaynak, carpan = 1) => { for (const [k, v] of Object.entries(kaynak || {})) if (k in hedef) hedef[k] += (Number(v) || 0) * carpan; };

export function haftalikOlcum(seviye) {
  depo.clear();
  const gs = new GameStateManager();
  gs.state.level = seviye;
  const sure = gs.getExpeditionDurationMinutes(seviye);
  const stamina = gs.getExpeditionStaminaCost(seviye);
  const uretim = sifir();
  const hak = sifir();
  const fiyat = {};
  for (const k of K) {
    uretim[k] = gs.getResourceRatePerMinute(k, seviye) * HAFTA;
    hak[k] = gs.getUretimHakki(k).weekly;
    fiyat[k] = ammMarket.getPrice(k);
  }

  const kalemler = {};
  const kalem = (ad, fn) => { const t = sifir(); fn(t); kalemler[ad] = t; };

  // 1) Seviye atlama: haftada kaç seviye × bedel
  kalem('seviye atlama', (t) => {
    const r = gs.getNextLevelRequirement();
    if (ESKI) {
      // Eski kural: döngü = 3 alan; bedel = o sürede kazanılan odun/demir/buğdayın yarısı
      const seferXp = Math.max(5, Math.floor(35 * (r.durMin / 60)));
      const dongu = Math.max(1, Math.ceil(r.xp / (3 * seferXp)));
      const b = GAME_CONFIG.BASE_PRODUCTION;
      const haftadaSeviye = HAFTA / Math.max(1, dongu * r.durMin);
      topla(t, { wood: dongu * r.durMin * b.wood / 2, iron: dongu * r.durMin * b.iron / 2, wheat: dongu * r.durMin * b.wheat / 2 }, haftadaSeviye);
      return;
    }
    const haftadaSeviye = HAFTA / Math.max(1, r.cycles * r.durMin);
    topla(t, r.costs || { wood: r.wood, iron: r.iron, wheat: r.wheat }, haftadaSeviye);
  });

  // 2) Alet onarımı: altı alet kesintisiz aşınır (dakikada 1); bedel calculateRepairCost ile aynı kural
  kalem('alet onarımı', (t) => {
    const aletSayisi = ESKI ? 3 : Math.max(1, K.length);   // eski kural: üçe bölünüyordu (altı alette toplam yük %50)
    t.wood += HAFTA * K.length * (gs.getResourceRatePerMinute('wood', seviye) * 0.25 / aletSayisi);
    t.iron += HAFTA * K.length * (gs.getResourceRatePerMinute('iron', seviye) * 0.25 / aletSayisi);
  });

  // 3) Stamina: haftada sefer sayısı × sefer bedeli × buğday/stamina
  kalem('stamina (buğday)', (t) => {
    const sefer = (K.length * HAFTA) / sure;
    t.wheat += sefer * stamina * (GAME_CONFIG.WHEAT_PER_STAMINA || 1);
  });

  // 4) Köylü iaşesi: seviye kadar ev (en çok 20), ev başı 10 köylü, günde 2 buğday
  kalem('köylü iaşesi', (t) => {
    const ev = Math.min(20, Math.max(1, seviye));
    t.wheat += ev * 10 * (GAME_CONFIG.KOY.WHEAT_PER_VILLAGER_DAY ?? 2) * 7;
  });

  // 5) Teçhizat: haftada 1 dövme (silah), 1 yükseltme (3. seviye zırh), 2 onarım (yarı hasarlı)
  kalem('teçhizat', (t) => {
    const dovme = gs.calculateEquipmentCraftCost('weapon');
    topla(t, { wood: dovme.woodCost, iron: dovme.ironCost, coal: dovme.coalCost });
    const parca = { slot: 'armor', level: 3, baseAtk: 0, baseHp: 120, durability: 13, maxDurability: 13, name: 'Referans zırh' };
    const yuk = gs.calculateEquipmentUpgradeCost(parca);
    topla(t, { wood: yuk.woodCost, iron: yuk.ironCost, coal: ESKI ? 0 : (yuk.coalCost || 0), stone: ESKI ? 0 : (yuk.stoneCost || 0) });
    const hasarli = { ...parca, durability: 6 };
    const onar = gs.calculateEquipmentRepairCost(hasarli);
    topla(t, { wood: onar.woodCost, iron: onar.ironCost, coal: ESKI ? 0 : (onar.coalCost || 0) }, 2);
  });

  // 6) Ev yapımı: iki haftada bir (seviyeye kadar)
  kalem('ev yapımı', (t) => {
    const n = Math.min(20, Math.max(2, seviye));
    topla(t, gs.getHouseCost(n), 0.5);
  });

  // 7) Silo yükseltmesi: üç haftada bir; bedel = mevcut kapasitenin yarısı (altı hammadde). Silo seviyesi ≈ 1 + seviye/3.
  //    En üst (ulaşılabilir) silodan sonra yükseltme yoktur: Universe öncesi tavan 12 (13 Ekim 2026 denetimi EK-09: model
  //    eskiden Sv.33'ten sonra 13-17. silo yükseltmesi sayıyordu, oysa kapalıydı).
  kalem('silo yükseltme', (t) => {
    const siloSeviyesi = Math.min(17, 1 + Math.floor(seviye / 3));
    if (siloSeviyesi >= gs.getWarehouseMaxLevel()) return;
    const kap = gs.getWarehouseCapacity(siloSeviyesi);
    for (const k of K) t[k] += Math.floor((kap[k] || 0) / 2) / 3;
  });

  // 8) Asker iyileştirme: günde 600 can kaybı; hemen iyileştirilen pay %60 (şifalı otla, 1 ot = SIFAHANE.HP_PER_HERB can), kalanı kendiliğinden (yine şifalı otla, can başına SOLDIER_PASSIVE_HEAL.herbPerHp ot)
  kalem('asker iyileştirme', (t) => {
    const haftalikCan = 600 * 7;
    t.herb += (haftalikCan * 0.6) / (GAME_CONFIG.SIFAHANE.HP_PER_HERB ?? 5);
    t.herb += haftalikCan * 0.4 * (GAME_CONFIG.SOLDIER_PASSIVE_HEAL.herbPerHp ?? 0.1);
  });

  // 9) Konsey: ortak kasa payı (çıkarılanın %5'i) + gönüllü katkı (haftalık hakkın %15'i)
  kalem('Konsey', (t) => {
    const pay = GAME_CONFIG.OTORITE.COMMON_CHEST_RATE ?? 0.05;
    for (const k of K) if (!ESKI || ['stone', 'iron', 'wood'].includes(k)) t[k] += hak[k] * (pay + 0.15);
  });

  const toplam = sifir();
  for (const t of Object.values(kalemler)) topla(toplam, t);
  const oranUretim = Object.fromEntries(K.map((k) => [k, toplam[k] / Math.max(1, uretim[k])]));
  const oranHak = Object.fromEntries(K.map((k) => [k, toplam[k] / Math.max(1, hak[k])]));
  // Hak üzerinden bakış (denetim EK-09): talep / hak > 1 ise başlangıç kotası yetmez, termostat kotayı haftada en çok %10
  // artırarak talebe yetişir. Denge için gereken hafta sayısı = ln(talep/hak) / ln(1,10); talep / tam üretim > 1 ise denge hiç kurulmaz.
  const haftaDenge = Object.fromEntries(K.map((k) => [k, oranHak[k] <= 1 ? 0 : Math.log(oranHak[k]) / Math.log(1.10)]));
  // Her kalemin ham (silo tavanına kırpılmamış) seviye bedeli: bandın altında kalan hammaddenin nedeni burada aranır
  const r = gs.getNextLevelRequirement();
  const siloKirpilan = Object.keys(r.uncappedCosts || {});
  return { seviye, uretim, hak, fiyat, kalemler, toplam, oranUretim, oranHak, haftaDenge, siloKirpilan };
}

export const SEVIYELER = [5, 10, 20, 40];

if (process.argv[1] && process.argv[1].endsWith('hammadde_kullanim.mjs')) {
  const sonuclar = SEVIYELER.map(haftalikOlcum);
  if (JSON_CIKTI) {
    console.log(JSON.stringify(sonuclar, null, 1));
  } else {
    const f = (n) => Math.round(n).toString().padStart(8);
    const p = (n) => n.toFixed(2).padStart(6);
    for (const s of sonuclar) {
      console.log(`\n══ Seviye ${s.seviye} — haftalık talep (birim) ve oranlar ══`);
      console.log('kalem'.padEnd(20) + K.map((k) => k.padStart(8)).join(''));
      for (const [ad, t] of Object.entries(s.kalemler)) console.log(ad.padEnd(20) + K.map((k) => f(t[k])).join(''));
      console.log('TOPLAM TALEP'.padEnd(20) + K.map((k) => f(s.toplam[k])).join(''));
      console.log('tam üretim'.padEnd(20) + K.map((k) => f(s.uretim[k])).join(''));
      console.log('üretim hakkı'.padEnd(20) + K.map((k) => f(s.hak[k])).join(''));
      console.log('talep / üretim'.padEnd(20) + K.map((k) => p(s.oranUretim[k]).padStart(8)).join(''));
      console.log('talep / hak'.padEnd(20) + K.map((k) => p(s.oranHak[k]).padStart(8)).join(''));
      console.log('denge (hafta)'.padEnd(20) + K.map((k) => s.haftaDenge[k].toFixed(0).padStart(8)).join(''));
      // Denge kotası = başlangıç kotası × talep/hak: termostatın yerleşeceği kişi başı kota. QPP_MIN'e (0,05) yaklaşırsa kısacak
      // yer kalmaz, fiyat çökmeye başlar (izleme eşiği: taban kotanın 2,5 katı; test_hammadde_kullanim_plani.mjs bölüm 8).
      const qs = GAME_CONFIG.URETIM_HAKKI.QPP_START;
      console.log('denge kotası'.padEnd(20) + K.map((k) => Math.min(GAME_CONFIG.URETIM_HAKKI.QPP_MAX, Math.max(GAME_CONFIG.URETIM_HAKKI.QPP_MIN, s.oranHak[k] * qs)).toFixed(2).padStart(8)).join(''));
      if (s.siloKirpilan.length) console.log('seviye bedeli siloya sığdırılan: ' + s.siloKirpilan.join(', '));
    }
  }
}
