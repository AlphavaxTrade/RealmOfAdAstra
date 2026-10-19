// Ekonomi karar-kod kayma testi (E-planı Faz 0, Bölüm 4.3, 8 Ekim 2026): docs/v2/KARARLAR_KESIN.md'deki (ve onun
// kaynağı R2-R4 belgelerindeki) kesin sayılar burada tekrar yazılır ve js/config.js'teki gerçek sabitlerle
// karşılaştırılır. Amaç: bu oturumda S1-S10'da elle bulduğumuz "karar bir, kod başka" sapmalarının bir daha
// fark edilmeden sürünmesi. Bir sayı kasıtlı değişirse HEM burası HEM KARARLAR_KESIN.md güncellenir (tek commit).
import assert from 'node:assert/strict';
import { GAME_CONFIG as G } from '../js/config.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const sum = obj => Object.values(obj).reduce((a, b) => a + Number(b), 0);
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// 1) Harcama bölüşümü (KARARLAR_KESIN.md §E): %5 yakım, %3 yapımcı, %6 UBI, %86 hazine — toplam 1
{
  assert.equal(G.TOKEN_BURN_RATE, 0.05, 'yakım %5');
  assert.equal(G.CREATOR_ROYALTY_RATE, 0.03, 'yapımcı %3');
  assert.equal(G.UBI_POOL_RATE, 0.06, 'UBI %6');
  assert.equal(G.TOKEN_REWARD_POOL_RATE, 0.86, 'hazine %86');
  assert.ok(near(G.TOKEN_BURN_RATE + G.CREATOR_ROYALTY_RATE + G.UBI_POOL_RATE + G.TOKEN_REWARD_POOL_RATE, 1), 'dörtü toplam 1');
  ok('harcama bölüşümü: %5 / %3 / %6 / %86');
}

// 2) Hazine payının 8 kasaya bölünüşü (§E): zindan 27, kolezyum 14, boss 12, geri alım 15, görev 18, karnaval 4, Fatih 5, Konsey 5
{
  const A = G.TREASURY_ALLOCATION;
  assert.deepEqual({ dungeon: A.dungeon, arena: A.arena, worldBoss: A.worldBoss, ammBuyback: A.ammBuyback, quest: A.quest, carnival: A.carnival, fatih: A.fatih, uoaTohum: A.uoaTohum },
    { dungeon: 0.2105, arena: 0.0905, worldBoss: 0.1705, ammBuyback: 0.2110, quest: 0.1305, carnival: 0.0905, fatih: 0.05, uoaTohum: 0.0465 }, '8 kasa payı 21,05/9,05/17,05/21,10/13,05/9,05/5/4,65 (19 Ekim 2026: ödeme kapasitesine göre; UOA tohumu harcamanın yüzde 4 payı)');
  assert.ok(near(sum(A), 1), 'hazine payları toplam 1');
  ok('hazine 8 kasaya bölünüşü: 21,05/9,05/17,05/21,10/13,05/9,05/5/4,65');
}

// 3) 200 M ASTRA tohum dağılımı (§E): kasalar 95,82 M (Universe rezervi 20 M dahil) + pazar havuzları 92,18 M + piyango 12 M
//    (parça havuzu 4 M → 180 bin ASTRA küçüldü, Pandora kutusu ve Anahtar havuzları (2 M + 2 M) kalktı; çıkan 7,82 M geri alım ve karnaval kasalarına eklendi; toplam 200 M)
{
  assert.equal(sum(G.TREASURY_SEED), 103820000, 'hazine kasaları tohumu (Universe rezervi dahil) 103,82 M (19 Ekim 2026: piyangodan gelen 8 M zindan, Kolezyum ve dünya bossu kasalarına eşit bölündü)');
  assert.equal(G.TREASURY_SEED.uoaTohum, 0, 'UOA tohumu 0 ile açılır, harcamanın yüzde 4 payıyla dolar');
  assert.equal(G.TREASURY_SEED.universe, undefined, 'Universe rezervi kaldırıldı (dağıtıldı)');
  assert.equal(G.TREASURY_SEED.konsey, undefined, 'Konsey kasası kaldırıldı (dağıtıldı)');
  assert.equal(sum(G.AMM_SEED_ASTRA), 92180000, 'pazar havuzları tohumu 92,18 M');
  assert.equal(G.CARNIVAL.LOTTERY.SEED_POOL_ADA, 4000000, 'piyango tohumu 4 M (19 Ekim 2026; R3: 12 M, eskiden 20 M)');
  assert.equal(sum(G.TREASURY_SEED) + sum(G.AMM_SEED_ASTRA) + G.CARNIVAL.LOTTERY.SEED_POOL_ADA, 200000000, 'toplam tohum 200 M');
  ok('200 M ASTRA tohum dağılımı: kasalar 103,82 M + pazar 92,18 M + piyango 4 M');
}

// 4) Kilitli bakiye (§6, 30 Eylül kararı): %20 serbest, harcamada %20 ek açılır, haftada taban %1 (+%1,4 aktif gün)
{
  const L = G.LOCKED_BALANCE;
  assert.equal(L.FREE_SHARE, 0.20); assert.equal(L.UNLOCK_ON_SPEND, 0.20);
  assert.equal(L.WEEKLY_UNLOCK_BASE, 0.01); assert.equal(L.WEEKLY_UNLOCK_ACTIVE, 0.014);
  ok('kilitli bakiye: %20 serbest, harcamada +%20, haftada %1 (+%1,4 aktif gün)');
}

// 5) Çekim (server/economy.js WEEKLY_RULES ile aynı olmalı sayılar; burada config tarafı): fiyatı en çok %2 düşürecek miktar,
//    ücret %3 (%70 UBI / %30 yakım), fren eşikleri %75/%85, kasa haftada %1 savunma yakımı — bunlar server/economy.js'te
//    sabit (GAME_CONFIG'te kopyası yok); o yüzden burada server/economy.js'i okuyup sayıyla doğrula.
{
  const { WEEKLY_RULES } = await import('../server/economy.js');
  assert.equal(WEEKLY_RULES.maxPriceDrop, 0.02, 'haftalık çekim: fiyatı en çok %2 düşürecek miktar');
  assert.equal(WEEKLY_RULES.fee, 0.03); assert.equal(WEEKLY_RULES.feeBrake, 0.06);
  assert.equal(WEEKLY_RULES.feeUbiShare, 0.50, 'çekim ücretinin %50\'si UBI\'ye, %50\'si yakılır (KARAR 4)');
  assert.equal(WEEKLY_RULES.brakeOnRatio, 0.75); assert.equal(WEEKLY_RULES.brakeOffRatio, 0.85);
  assert.equal(WEEKLY_RULES.defenseBurnWeekly, 0.01, 'fren açıkken kasalar haftada %1 yakılır');
  assert.equal(WEEKLY_RULES.faucetMaxPoolShare, 0.015, 'ücretsiz oyuncu payı kasanın haftada en çok %1,5\'i (E-planı S3)');
  ok('çekim/fren/ücretsiz havuz kuralları (server/economy.js): %2 tavan, %3 ücret, %75/%85 fren, %1,5 ücretsiz havuz tavanı');
}

// 6) Dünya Bossu (§D Savunma Duvarı kararı + R3): erken çekilme cezası taban %18, haftalık dağıtım %3
{
  assert.equal(G.WORLD_BOSS.EARLY_UNSTAKE_PENALTY, 0.18, 'erken çekilme cezası taban %18 (Savunma Duvarı ile %12\'ye iner)');
  assert.equal(G.WORLD_BOSS.WEEKLY_DISTRIBUTION_RATE, 0.03, 'haftalık dağıtım %3 (R3: eskiden %10, en hızlı boşalan kasaydı)');
  ok('Dünya Bossu: taban ceza %18, haftalık dağıtım %3');
}

// 7) Pazar geri alımı (R4): fiyat < açılışın %80'inin altına inince kasanın haftada %3'ü ile al-yak
{
  assert.equal(G.AMM_BUYBACK.TRIGGER_DROP, 0.20, 'eşik: açılışın %80\'inin altı (düşüş %20)');
  assert.equal(G.AMM_BUYBACK.WEEKLY_RATE, 0.03, 'haftada kasanın %3\'ü (E-planı S2: eskiden günde %15 koşuyordu)');
  assert.equal(G.AMM_SINGLE_TRADE_SHARE, 0.05, 'tek işlem havuzun en çok %5\'i');
  assert.equal(G.AMM_FEE_RATE, 0.02, 'pazar komisyonu %2');
  ok('pazar geri alımı: eşik %20 düşüş, haftada %3; tek işlem %5, komisyon %2');
}

// 8) Hazine tek ödül tavanı ve taban ödeme oranı (§3c): tek ödül ≤ kasanın %2'si, kasa boşalsa bile ödül en az %15
{
  assert.equal(G.TREASURY_SINGLE_DRAW_CAP, 0.02, 'tek ödül kasanın en çok %2\'si');
  assert.equal(G.TREASURY_MIN_PAYOUT_RATIO, 0.15, 'ödül tabanı %15 (hiç sıfırlanmaz)');
  ok('hazine çekimi: tek ödül %2 tavanı, taban ödeme %15');
}

// 9) Kapı kuralı (E-planı Faz 1, 8 Ekim 2026 — §J'nin yerini aldı): ilk döngü 100 vatandaş, eşikler 50/100/300 $,
//    büyüme Faz 2'ye kadar kilitli, kayıt harcı 1 ASTRA, hazır aday 3 adım, davet 72 saat / 3 sıra ceza
{
  assert.equal(G.KAPI.START_LIMIT, 100, 'ilk döngü: açılış sınırı 100 (Faz 1, kullanıcı kararı)');
  assert.deepEqual(G.KAPI.USD_TIERS, [50, 100, 300], 'dolar eşikleri kademeli 50→100→300 (KARAR 1)');
  assert.equal(G.KAPI.GROWTH_STEP, 0.10, 'büyüme adımı ayda %10');
  assert.equal(G.KAPI.GROWTH_LOCKED, true, 'büyüme Faz 2 göstergesi (dağıtılan+çekilebilen) kurulana dek kilitli');
  assert.equal(G.KAPI.REGISTRATION_FEE_ADA, 1, 'kayıt harcı 1 ASTRA');
  assert.equal(G.KAPI.READY_TASK_IDS.length, 3, 'hazır aday: 3 onay adımı');
  assert.equal(G.KAPI.INVITE_HOURS, 72); assert.equal(G.KAPI.INVITE_PENALTY_POSITIONS, 3);
  ok('kapı kuralı: ilk döngü sınır 100, eşikler 50/100/300 $, büyüme kilitli, hazır aday 3 adım, davet 72 sa / 3 sıra ceza');
}

// 9b) Katılım puanı (E-planı Faz 1, 8 Ekim 2026 — eski "haftada ≥3 gün giriş" kuralının yerini aldı; kullanıcı
//     "1 hafta girmeyip 1 gün sefer yapınca hafif kalıyor" dedi): 10 kategori, seviyeyle büyüyen eşik, yıllık izin
{
  const KP = G.KATILIM_PUANI;
  assert.equal(KP.KATEGORILER.length, 10, '10 kategori (oyunun bütün ana eylemleri)');
  assert.equal(KP.ESIK_TABAN, 2); assert.equal(KP.ESIK_TAVAN, 6); assert.equal(KP.ESIK_SEVIYE_ARALIGI, 10);
  assert.equal(KP.UYARI_HAFTA, 2); assert.equal(KP.IZIN_SORUSU_HAFTA, 3);
  assert.equal(KP.IZIN_YILLIK_GUN, 30, 'yıllık toplam izin hakkı 30 gün');
  ok('katılım puanı: 10 kategori, eşik 2→6 (seviyeyle), 2 hafta uyarı / 3 hafta izin sorusu, yıllık 30 gün izin');
}

// 10) Üretim Hakkı (R2/R4): kişi başı kota başlangıcı %40 (0,05-1,0 arası, ±%10/hafta), adalet tavanı 3×, seviye ağırlığı ×2 tavanlı
{
  const U = G.URETIM_HAKKI;
  assert.equal(U.QPP_START, 0.40); assert.equal(U.QPP_MIN, 0.08); assert.equal(U.QPP_MAX, 1.2); assert.equal(U.TERMO_STEP, 0.10);   // 19 Ekim 2026: qpp = global havuz çarpanı (başlangıcın 0,2-3 katı)
  assert.equal(U.FAIRNESS_CAP, 3, 'adalet tavanı: en yüksek ağırlık en düşüğün 3 katını geçmez (E-planı S8)');
  assert.equal(U.LEVEL_WEIGHT_MAX, 2.0, 'seviye ağırlığı en çok ×2');
  ok('Üretim Hakkı: kota %40 başlar (%5-100 arası, ±%10/hafta), adalet tavanı 3×, seviye ağırlığı ×2 tavanlı');
}

// 11) İlan pazarı (R4b): komisyon %2 (yarısı yakım yarısı kasa), 7 gün süre, en çok 10 ilan, satıcıya %80 kilitli
{
  const I = G.ILAN_PAZARI;
  assert.equal(I.FEE, 0.02); assert.equal(I.FEE_BURN_SHARE, 0.5); assert.equal(I.DAYS, 7);
  assert.equal(I.MAX_LISTINGS, 10); assert.equal(I.SELLER_LOCKED_SHARE, 0.8);
  ok('ilan pazarı: komisyon %2 (yarı yakım yarı kasa), 7 gün, en çok 10 ilan, satıcıya %80 kilitli');
}

// 12) Hazırlık Deposu (R3/R4b): dünya toplamı 10 M ASTRA değeri, kişi başı 4 haftalık, iptalde %10 kesinti
{
  const P = G.UZAY_LIMANI;
  assert.equal(P.PREP_DEPOT_TOTAL_ASTRA, 10000000); assert.equal(P.PREP_DEPOT_WEEKS_CAP, 4); assert.equal(P.PREP_DEPOT_CANCEL_FEE, 0.10);
  ok('Hazırlık Deposu: dünya toplamı 10 M ASTRA, kişi başı 4 haftalık, iptalde %10 kesinti');
}

// 13) Alet onarımı ve geri dönüşüm (R3 kararı 1 / R4b): onarımın ASTRA payı %30 (eskiden %100), geri dönüşümde hammaddenin %70'i döner
{
  assert.equal(G.TOOL_REPAIR_ADA_SHARE, 0.30, 'alet onarımının ASTRA payı %100 → %30 (ücretsiz oyuncu ilerlesin diye)');
  assert.equal(G.RECYCLE_RETURN_RATE, 0.70, 'geri dönüşümde hammaddenin %70\'i geri gelir, %30\'u yanar');
  ok('alet onarımı ASTRA payı %30; geri dönüşüm %70 hammadde iadesi');
}

console.log(`\n${passed}/14 ekonomi karar-kod kayma kontrolü geçti`);
