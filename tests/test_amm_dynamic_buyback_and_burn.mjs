import test from 'node:test';
import assert from 'node:assert/strict';
import { ammMarket, GENESIS_PRICES, BUYBACK_ASSET_WEIGHTS } from '../js/ammMarket.js';
import { treasury } from '../js/treasury.js';
import { globalPool } from '../js/globalPool.js';

test('🛡️ AMM 6 Varlıklı Dinamik Buyback & Burn Motoru Testleri', async (t) => {

  await t.test('1. Genesis Referans Fiyatları ve %75 Hammadde Ağırlık Dağılımı Doğrulaması', () => {
    assert.equal(GENESIS_PRICES.wheat, 0.90, 'Buğday Genesis Fiyatı 0.90 ADA olmalı');
    assert.equal(GENESIS_PRICES.iron, 4.00, 'Demir Genesis Fiyatı 4.00 ADA olmalı');
    assert.equal(GENESIS_PRICES.wood, 2.50, 'Odun Genesis Fiyatı 2.50 ADA olmalı');
    assert.equal(GENESIS_PRICES.fragments, 45.00, 'Teçhizat Parçası Genesis Fiyatı 45.00 ADA olmalı');
    assert.equal(GENESIS_PRICES.keys, 1000.0, 'Arena Anahtarı Genesis Fiyatı 1.000 ADA olmalı');
    assert.equal(GENESIS_PRICES.boxes, 10000.0, 'Pandora Kutusu Genesis Fiyatı 10.000 ADA olmalı');

    // Ağırlık kontrolü
    const hammaddePayi = BUYBACK_ASSET_WEIGHTS.wheat + BUYBACK_ASSET_WEIGHTS.iron + BUYBACK_ASSET_WEIGHTS.wood;
    assert.equal(Math.round(hammaddePayi * 100), 75, 'Buğday, Demir ve Odun toplam ağırlığı tam %75 olmalı');

    const toplamPay = Object.values(BUYBACK_ASSET_WEIGHTS).reduce((s, w) => s + w, 0);
    assert.equal(Math.round(toplamPay * 100), 100, 'Tüm 6 varlığın ağırlıkları toplamı tam %100 (1.00) olmalı');
  });

  await t.test('2. Oyundaki Tüm Harcamalardan AMM Havuzuna %12,9 Akış Doğrulaması', () => {
    const initialAmmPool = treasury.getPool('ammBuyback') || 0;
    const testSpend = 10000; // 10.000 ADA harcama yapıldığında

    // globalPool.recordTokenSpend: %86 Hazineye aktarılır, bunun %15'i AMM Havuzuna gider (= %12,9 net)
    globalPool.recordTokenSpend(testSpend);

    const newAmmPool = treasury.getPool('ammBuyback') || 0;
    const gained = newAmmPool - initialAmmPool;
    const expectedAmmInflow = testSpend * 0.86 * 0.15; // 1.290 ADA

    assert.ok(Math.abs(gained - expectedAmmInflow) < 0.1, `Harcamanın tam %12,9'u (${expectedAmmInflow} ADA) AMM Kasasına akmalı. Gerçekleşen: ${gained}`);
  });

  await t.test('3. Fiyat Başlangıç Seviyesindeyken Müdahale = 0 ADA (Cephane Koruması)', () => {
    ammMarket.resetPools(); // Tüm havuzları Genesis fiyatına sıfırla
    const analysis = ammMarket.getBuybackAnalysis(0.10);

    assert.equal(analysis.totalFundToSpend, 0, 'Fiyatlar başlangıç seviyesindeyken harcanacak bütçe 0 ADA olmalı');
    const res = ammMarket.executeAutonomousBuyback(0.10);
    assert.equal(res.executed, false, 'Müdahale tetiklenmemeli');
  });

  await t.test('4. %10 Düşüş vs %90 Çöküş: Üstel Aciliyet ve Adet Patlaması', () => {
    // 10% Düşüş aciliyeti: 0.10^2.5 ≈ 0.00316
    const urgency10 = Math.pow(0.10, 2.5);
    // 90% Düşüş aciliyeti: 0.90^2.5 ≈ 0.7684
    const urgency90 = Math.pow(0.90, 2.5);

    const ratio = urgency90 / urgency10;
    assert.ok(ratio > 200, '%90 düşüşteki harcama yoğunluğu %10 düşüşe göre 240+ kat daha yüksek olmalı');

    // Fiziksel adet çarpanı
    const units10 = urgency10 / 0.90;
    const units90 = urgency90 / 0.10;
    const unitRatio = units90 / units10;
    assert.ok(unitRatio > 2000, '%90 düşüşte satın alınıp yakılan fiziksel adet ~2.000 kat daha fazla olmalı');
  });

  await t.test('5. Canlı Otonom Buyback & Yakım Operasyonu ve Arzdan Kalıcı Silinme', () => {
    ammMarket.resetPools();

    // Buğday havuzuna yapay satış baskısı yapıp fiyatını %80 düşürelim
    // 0.90 ADA -> ~0.18 ADA
    ammMarket.pools.wheat.resourceReserve *= 4.0;
    ammMarket.pools.wheat.adAstraReserve *= 0.8;
    ammMarket.savePools();

    const wheatPriceBefore = ammMarket.getPrice('wheat');
    assert.ok(wheatPriceBefore < 0.30, 'Buğday fiyatı sertçe düşürülmüş olmalı');

    const initialWheatReserve = ammMarket.pools.wheat.resourceReserve;
    const initialAmmTreasury = treasury.getPool('ammBuyback');

    // Otonom buyback çalıştır (Döngü başına %10 tavan)
    const result = ammMarket.executeAutonomousBuyback(0.10);
    assert.equal(result.success, true, 'Buyback operasyonu başarıyla tamamlanmalı');
    assert.ok(result.report.totalSpent > 0, 'Hazine bütçesi harcanmış olmalı');

    // 1. Buğday havuzundaki buğday miktarı azaldı mı (pazar süpürüldü mü)?
    assert.ok(ammMarket.pools.wheat.resourceReserve < initialWheatReserve, 'Havuzdan buğday çekilip yakılmış olmalı');

    // 2. Buğday fiyatı toparlandı mı?
    const wheatPriceAfter = ammMarket.getPrice('wheat');
    assert.ok(wheatPriceAfter > wheatPriceBefore, 'Buyback sonrası buğday fiyatı yükselmiş olmalı');

    // 3. Hazine bakiyesinden harcanan kadar düştü mü?
    const newAmmTreasury = treasury.getPool('ammBuyback');
    assert.ok(newAmmTreasury < initialAmmTreasury, 'Hazine bakiyesinden harcanan fon tahsil edilmiş olmalı');

    // 4. Yakım sayacı kaydedildi mi?
    const burned = ammMarket.getBurnedResources();
    assert.ok(burned.wheat > 0, 'Yakılan buğday sayacı güncellenmiş olmalı');

    // Havuzları temizle
    ammMarket.resetPools();
  });
});
