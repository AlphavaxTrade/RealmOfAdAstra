import test from 'node:test';
import assert from 'node:assert/strict';
import { gameState } from '../js/gameState.js';
import { globalPool } from '../js/globalPool.js';
import { GAME_CONFIG } from '../js/config.js';
import { shareOf, openWeek } from '../js/economy/ubi.js';

test('Evrensel Temel Gelir (UBI) & %3 Yapımcı Telifi & %5 Yakım Testi', async (t) => {
  gameState.vanillaReset();

  await t.test('[1/6] Tokenomics Oranları Doğrulaması: %5 Yakım, %3 Yapımcı, %6 UBI, %86 Hazine', () => {
    assert.equal(GAME_CONFIG.TOKEN_BURN_RATE, 0.05, 'Yakım oranı %5 olmalı');
    assert.equal(GAME_CONFIG.CREATOR_ROYALTY_RATE, 0.03, 'Yapımcı telif oranı %3 olmalı');
    assert.equal(GAME_CONFIG.UBI_POOL_RATE, 0.06, 'UBI havuz oranı %6 olmalı');
    assert.equal(GAME_CONFIG.TOKEN_REWARD_POOL_RATE, 0.86, 'Hazine ödül oranı %86 olmalı');
    assert.equal(
      GAME_CONFIG.CREATOR_WALLET_ADDRESS,
      '0x58DBCF66bdd7BfA9da98aDba1965b3794321087C',
      'Yapımcı cüzdan adresi doğru tanımlanmış olmalı'
    );
  });

  await t.test('[2/6] recordTokenSpend Harcamasının 4 Kanala Kusursuz Dağıtımı', () => {
    const spendAmount = 10000;
    const initialBurned = globalPool.state.totalBurned || 0;
    const initialCreator = globalPool.state.creatorRoyaltyTotal || 0;
    const initialUbi = globalPool.state.ubiPool || 0;

    const res = globalPool.recordTokenSpend(spendAmount);

    assert.equal(res.burned, 500, '%5 yani 500 ASTRA yakılmalı');
    assert.equal(res.creatorRoyalty, 300, '%3 yani 300 ASTRA yapımcı cüzdanına tahsis edilmeli');
    assert.equal(res.ubiShare, 600, '%6 yani 600 ASTRA UBI havuzuna eklenmeli');
    assert.equal(res.treasuryShare, 8600, '%86 yani 8.600 ASTRA hazineye gitmeli');

    assert.equal(globalPool.state.totalBurned, initialBurned + 500);
    assert.equal(globalPool.state.creatorRoyaltyTotal, initialCreator + 300);
    assert.equal(globalPool.state.ubiPool, initialUbi + 600);
  });

  // v1.25 UBI modeli (kullanıcı kararı, 29 Eylül 2026): tohum dağıtılmaz. Oyunda harcanan her ASTRA'nın %6'sı
  // o haftanın kasasında birikir; Pazartesi 00:01 (TSİ) açılır; en az 3. seviye olanlar seviye ağırlığıyla paylaşır;
  // çekilmeyen pay sonraki haftaya devreder.
  await t.test('[3/6] Haftalık birikim ve Pazartesi açılışı: birikim + çekilmeyen pay = yeni kasa', () => {
    assert.equal(openWeek({ accruedLastWeek: 6000, unclaimedCarry: 1500 }), 7500);
    const before = globalPool.state.ubiWeekAccrued || 0;
    globalPool.recordTokenSpend(5000);
    assert.equal(Math.round((globalPool.state.ubiWeekAccrued - before) * 100) / 100, 300, '5.000 ASTRA harcamanın %6\'sı (300) bu haftanın kasasına birikmeli');
    const accrued = globalPool.state.ubiWeekAccrued;
    const carry = globalPool.state.ubiClaimPot || 0;
    globalPool.createNewEpoch(globalPool.state);
    assert.equal(Math.round(globalPool.state.ubiClaimPotAtOpen), Math.round(accrued + carry), 'Yeni haftanın kasası geçen haftanın birikimi + çekilmeyen pay olmalı');
    assert.equal(globalPool.state.ubiWeekAccrued, 0, 'Yeni hafta birikimi sıfırdan başlamalı');
  });

  await t.test('[4/6] En az 3. seviye şartı ve seviyeye göre adil pay', () => {
    const pot = 100000;
    const totalWeight = 50;
    assert.equal(shareOf({ pot, playerLevel: 1, totalWeight }), 0, 'Seviye 1 UBI alamaz');
    assert.equal(shareOf({ pot, playerLevel: 2, totalWeight }), 0, 'Seviye 2 UBI alamaz');
    const lv3 = shareOf({ pot, playerLevel: 3, totalWeight });
    const lv10 = shareOf({ pot, playerLevel: 10, totalWeight });
    const lv81 = shareOf({ pot, playerLevel: 81, totalWeight });
    assert.ok(lv3 > 0, 'Seviye 3 pay almalı');
    assert.ok(lv10 > lv3 && lv81 > lv10, 'Yüksek seviye daha fazla pay almalı');
    assert.ok(lv81 <= pot, 'Pay kasayı aşamaz');
  });

  await t.test('[5/6] Haftalık çekim, 3. seviye şartı ve çift çekim koruması', () => {
    globalPool.state.ubiClaimPotAtOpen = 10000;
    globalPool.state.ubiClaimPot = 10000;
    gameState.state.lastClaimedUbiEpoch = 0;
    gameState.state.level = 2;
    const low = gameState.claimWeeklyUbi();
    assert.equal(low.success, false, 'Seviye 2 UBI çekememeli');

    gameState.state.level = 5;
    const initialAda = gameState.state.adAstraBalance || 0;
    const claimRes = gameState.claimWeeklyUbi();
    assert.equal(claimRes.success, true, 'İlk claim başarılı olmalı');
    assert(claimRes.amount > 0, 'Dağıtılan ASTRA pozitif olmalı');
    assert.equal(gameState.state.adAstraBalance, initialAda + claimRes.amount, 'ADA bakiyesi artmalı');
    assert.equal(gameState.state.lastClaimedUbiEpoch, globalPool.state.epochId, 'Epoch ID kaydedilmeli');
    assert.ok(globalPool.state.ubiClaimPot <= 10000 - claimRes.amount + 1e-6, 'Çekilen pay kasadan düşmeli');

    const secondClaim = gameState.claimWeeklyUbi();
    assert.equal(secondClaim.success, false, 'Aynı hafta mükerrer claim yapılamaz');
    assert(secondClaim.message.includes('zaten talep ettiniz'), 'Kullanıcıya bilgilendirme mesajı verilmeli');
  });

  await t.test('[6/6] Vanilla Reset: UBI kasası sıfırdan başlar (tohum dağıtılmaz)', () => {
    globalPool.state.ubiPool = 9999999;
    gameState.state.lastClaimedUbiEpoch = 42;
    gameState.vanillaReset();
    assert.equal(gameState.state.lastClaimedUbiEpoch, 0, 'Claim epoch sıfırlanmalı');
    assert.equal(globalPool.state.ubiWeekAccrued || 0, 0, 'Haftalık birikim sıfırlanmalı');
    assert.equal(globalPool.state.ubiClaimPot || 0, 0, 'Dağıtım kasası sıfırdan başlamalı');
  });
});
