// Temel gelir (UBI) tek talep tavanı: hiç kimse haftanın açılış kasasının %5'inden fazlasını alamaz.
// (Yerel doğrulama kampanyasında bulundu: config'te MAX_SINGLE_CLAIM_SHARE vardı ama gerçek talep yolu onu hiç kullanmıyordu —
// tek hak sahibi olduğunda kasanın tamamını alabiliyordu.) Artan kısım dağıtılmaz, kasada kalır ve sonraki haftaya devreder.
import assert from 'node:assert/strict';
import { shareOf } from '../js/economy/ubi.js';
import { gameState } from '../js/gameState.js';
import { globalPool } from '../js/globalPool.js';
import { GAME_CONFIG } from '../js/config.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

// 1) Saf fonksiyon: tavan yoksa eskisi gibi; tavan varsa en çok pot × oran
{
  const pot = 100000;
  assert.equal(shareOf({ pot, playerLevel: 10, totalWeight: 3.25 }), pot, 'tavan verilmezse tek hak sahibi kasanın hepsini alır (eski davranış)');
  assert.equal(shareOf({ pot, playerLevel: 10, totalWeight: 3.25, rules: { minLevel: 3, weight: l => 1 + Math.sqrt(l - 1) * 0.75, maxSingleShare: 0.05 } }), 5000, 'tek hak sahibi en çok %5');
  // kalabalıkta pay zaten %5'in altındaysa tavan devreye girmez
  const kalabalik = shareOf({ pot, playerLevel: 10, totalWeight: 325, rules: { minLevel: 3, weight: l => 1 + Math.sqrt(l - 1) * 0.75, maxSingleShare: 0.05 } });
  assert.equal(kalabalik, 1000, '100 benzer kişi: pay %1, tavan etkisiz');
  ok('shareOf: tavansız eski davranış, tavanlı en çok %5, kalabalıkta etkisiz');
}

// 2) Gerçek talep yolu: tek hak sahibi 10.000'lik kasadan en çok 500 alır, kalan kasada durur
{
  assert.equal(GAME_CONFIG.UBI_CONFIG.MAX_SINGLE_CLAIM_SHARE, 0.05);
  gameState.vanillaReset();
  globalPool.state.ubiClaimPotAtOpen = 10000;
  globalPool.state.ubiClaimPot = 10000;
  globalPool.state.ubiWeekAccrued = 0;
  gameState.state.lastClaimedUbiEpoch = 0;
  gameState.state.level = 5;
  const r = gameState.claimWeeklyUbi();
  assert.equal(r.success, true);
  assert.ok(r.amount <= 500 + 1e-9, `tek talep %5'i aşmamalı: ${r.amount}`);
  assert.ok(r.amount > 0);
  assert.ok(Math.abs(globalPool.state.ubiClaimPot - (10000 - r.amount)) < 1e-6, 'artan kısım kasada kalır (sonraki haftaya devreder)');
  ok(`Talep yolu: tek hak sahibi ${r.amount} ASTRA aldı (tavan 500), kalan ${globalPool.state.ubiClaimPot} kasada`);
}

console.log(`\n${passed} UBI tavan kontrolü geçti.`);
process.exit(0);
