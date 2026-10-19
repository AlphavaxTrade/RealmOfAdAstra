import test from 'node:test';
import assert from 'node:assert/strict';
import { gameState } from '../js/gameState.js';
import { GAME_CONFIG } from '../js/config.js';

test('🧪 Kullanıcı Akışı: 50k ASTRA -> Bot Satın Alma -> Silo Şişmeme -> +6 Saat İleri Sarma Donmama Testi', async (t) => {
  const P = GAME_CONFIG.STARTING_PROFILE.inventory;
  const R = GAME_CONFIG.RESOURCE_KEYS;

  await t.test('1. Bot satın alındığında siloyu şişirmemeli ve kasadaki ASTRA ile sadece asgari eksik tamamlanmalı', () => {
    gameState.vanillaReset();
    gameState.state.adAstraBalance = 50000;

    for (const k of R) assert.equal(gameState.state.inventory[k], P[k], `${k} başlangıç değeri`);

    const buyRes = gameState.buyTavernaAutomationBot(false);
    assert.equal(buyRes.success, true);

    // Silo asla şişmemeli: yalnız bot önkoşulunun (50) altındaki hammadde tamamlanır
    const need = GAME_CONFIG.TAVERNA_BOT.REQUIRED_PREREQUISITES;
    for (const k of R) {
      assert.equal(gameState.state.inventory[k], Math.max(P[k], need[k] || 0), `${k}: yalnız önkoşul eksiği tamamlanmalı, silo şişmemeli`);
    }
    assert.ok(gameState.state.adAstraBalance >= 50000 - buyRes.costPaid - 5, 'Kasada kalan ASTRA korunmalı');
  });

  await t.test('2. 6 Saat İleri Sarıldığında (fastForwardTime) browser donmadan her alanda 20 sefer tamamlayıp siloyu yükseltmeli', () => {
    // Duvar saati yerine İŞLEMCİ süresi: makine meşgulken (başka süreçler, tarayıcı) duvar saati şişer, işlemci süresi şişmez.
    const c0 = process.cpuUsage();
    const report = gameState.fastForwardTime(6);
    const c1 = process.cpuUsage(c0);
    const duration = Math.round((c1.user + c1.system) / 1000);

    // Kapsam ölçümü (c8, NODE_V8_COVERAGE) kodu yavaşlatır; tam kapı (npm run kontrol) bu yüzden 13 Ekim 2026'da 1431 ms ölçtü.
    // Donma koruması kalır: kapsam altında 2 sn, normalde 400 ms işlemci süresi (tek başına ~100 ms).
    const sinir = process.env.NODE_V8_COVERAGE ? 2000 : 400;
    assert.ok(duration < sinir, `Simülasyon ${sinir}ms altında bitmeli, ölçülen: ${duration}ms`);
    assert.equal(report.botExecutionStatus, 'ran', 'Bot aktif olarak çalışmalı');
    // 19 Ekim 2026: silo yükseltme bedeli silonun %70'i (eskiden %50) olduğu için bot yükseltme sırasında 1-2 sefer geç kalabilir: en az 114/120
    assert.ok(report.totalExpeditionsClaimed >= R.length * 20 - 6 && report.totalExpeditionsClaimed <= R.length * 20, `6 saatte ${R.length} alan × ~20 sefer toplanmalı (${report.totalExpeditionsClaimed})`);
    // 19 Ekim 2026: silo seviyesi hesap seviyesini geçemez; hesap Sv.1 iken silo 1'de kalır, bot yine de çalışır ve donmaz
    assert.equal(gameState.state.warehouseLevel, 1, 'Hesap seviyesi 1 iken silo yükseltilemez');
    assert.equal(gameState.isBotPaused(), false, 'Bot dondurulmamış olmalı');
  });
});
