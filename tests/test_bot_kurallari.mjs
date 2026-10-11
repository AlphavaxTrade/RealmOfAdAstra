// Taverna botu: maliyet, satın alma ve süre biriktirme, önkoşullar, duraklatma ve süre dondurma, ileri sarma, çalışma sırası.
// 11 Ekim 2026'da yedi eski test dosyasından (fast_forward_bot_simulation, dev_fast_forward_bot_deep_audit, taverna_24h_bot_complete,
// taverna_bot_pause_freeze, bot_execution_order_and_stamina …) benzersiz denetimler korunarak baştan yazıldı.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');

const SAAT = 3600 * 1000;
const yeni = () => {
  depo.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  return new GameStateManager();
};
// Botu elle aktif yapar (satın alma kuralından bağımsız senaryolar için)
const botuAc = (gs, sureMs = 24 * SAAT) => {
  const s = gs.state;
  s.botActiveUntil = Date.now() + sureMs;
  s.tavernaBotActive = true;
  s.tavernaBotExpiresAt = s.botActiveUntil;
  s.botPaused = false;
};
const bol = (gs) => {
  const s = gs.state;
  s.warehouseLevel = 3;
  s.adAstraBalance = 50000;
  s.stamina = 100;
  for (const k of ['wood', 'iron', 'wheat']) s.inventory[k] = 500;
  for (const alet of ['axe', 'pickaxe', 'sickle']) s.tools[alet].durability = 5000;
};

// 1) Maliyet: 24 saatlik net kârın yarısı
{
  const gs = yeni();
  const h = gs.calculateTavernaBotProfitAndCost();
  assert.ok(h.grossRevenueAda > 0, 'brüt gelir pozitif');
  assert.ok(h.netProfitAda > 0, 'net kâr pozitif');
  assert.equal(h.botCostAda, Math.max(1, Math.round(h.netProfitAda * 0.5 * 1000) / 1000), 'bot bedeli net kârın %50\'si');
}
console.log('✅ bot bedeli = net kârın yarısı');

// 1b) Kişisel Üretim Hakkı: bedel oyuncunun günde gerçekten alabileceği miktara göre hesaplanır (karar 12 Ekim 2026);
// eskiden yalnız dünyanın kalan haftalık kapasitesine bakıldığı için payı küçük oyuncuya fazla bedel yazılıyordu
{
  const gs = yeni();
  const gercek = gs.getUretimHakki.bind(gs);
  const hakla = (hak) => { gs.getUretimHakki = (k) => ({ ...gercek(k), ...hak }); return gs.calculateTavernaBotProfitAndCost(); };

  const normal = gs.calculateTavernaBotProfitAndCost();
  const sinirsiz = hakla({ weekly: 1e9, canTake: 1e9, used: 0, extra: 0 });
  assert.ok(sinirsiz.botCostAda > normal.botCostAda, 'hak sınır koymazsa dünya kapasitesi sınırı kalır, bedel daha yüksek');

  const kucuk = hakla({ weekly: 700, canTake: 100, used: 0, extra: 0 });
  assert.ok(kucuk.botCostAda < normal.botCostAda, `küçük hak bedeli düşürür: ${kucuk.botCostAda} < ${normal.botCostAda}`);
  const dahaKucuk = hakla({ weekly: 70, canTake: 10, used: 0, extra: 0 });
  assert.ok(dahaKucuk.botCostAda <= kucuk.botCostAda, 'hak küçüldükçe bedel azalır');

  // Haftalık hak tükenmişse bedel en alt sınıra (1 ASTRA) iner; kalan hak yoksa kâr beklenmez
  const bitmis = hakla({ weekly: 700, canTake: 0, used: 700, extra: 0 });
  assert.equal(bitmis.botCostAda, 1, 'hak bitmiş: taban bedel');

  // Paket bedeli bu hesaptan türer
  gs.getUretimHakki = (k) => ({ ...gercek(k), weekly: 700, canTake: 100, used: 0, extra: 0 });
  assert.ok(gs.getBotPackageCost(24) <= Math.max(1, kucuk.botCostAda) + 1e-9);
}
console.log('✅ bot bedeli kişisel Üretim Hakkı\'na göre');

// 2) Satın alma: yetersiz bakiye reddedilir; başarılıda bakiye düşer, süre eklenir, bedel kasalara gider; süre ve ücretsiz bot birikir
{
  const gs = yeni();
  const s = gs.state;
  s.inventory = { ...s.inventory, wood: 500, iron: 500, wheat: 500 };
  s.adAstraBalance = 0.001;
  const red = gs.buyTavernaAutomationBot(false);
  assert.equal(red.success, false);
  assert.ok(/Yetersiz ASTRA/.test(red.message), 'net bakiye uyarısı');
  assert.equal(gs.isAutoCollectorActive(), false);

  s.adAstraBalance = 500000;
  const kasaOnce = treasury.getSummary().totalBalance;
  const al = gs.buyTavernaAutomationBot(false);
  assert.equal(al.success, true, al.message);
  assert.ok(al.costPaid > 0);
  assert.equal(s.adAstraBalance, 500000 - al.costPaid, 'bakiyeden tam bedel düşer');
  assert.ok(gs.isAutoCollectorActive() && s.tavernaBotActive);
  assert.ok(s.botActiveUntil > Date.now() + 23 * SAAT);
  assert.ok(treasury.getSummary().totalBalance > kasaOnce, 'bedel kasalara dağıtılır');

  const ilk = s.botActiveUntil;
  assert.equal(gs.buyTavernaAutomationBot(false).success, true);
  assert.ok(Math.abs(s.botActiveUntil - ilk - 24 * SAAT) < 1000, 'ikinci alım +24 saat ekler');
  const ikinci = s.botActiveUntil;
  const bedava = gs.buyTavernaAutomationBot(true);
  assert.equal(bedava.success, true);
  assert.equal(bedava.costPaid, 0, 'ücretsiz bot bedel tahsil etmez');
  assert.ok(Math.abs(s.botActiveUntil - ikinci - 24 * SAAT) < 1000, 'ücretsiz bot da +24 saat ekler');
}
console.log('✅ satın alma, bedel, süre biriktirme');

// 3) Önkoşullar: yapılandırma ve eksik listesi
{
  const gs = yeni();
  const k = GAME_CONFIG.TAVERNA_BOT.REQUIRED_PREREQUISITES;
  assert.equal(k.iron, 50);
  assert.equal(k.wood, 50);
  assert.equal(k.wheat, 50);
  assert.equal(k.adAstra, 0.5);
  gs.state.inventory = { ...gs.state.inventory, iron: 10, wood: 50, wheat: 50 };
  gs.state.adAstraBalance = 50;
  let r = gs.checkBotPrerequisites();
  assert.equal(r.isMet, false);
  assert.ok(r.missing.some((m) => m.key === 'iron'));
  gs.state.inventory.iron = 50;
  r = gs.checkBotPrerequisites();
  assert.equal(r.isMet, true);
  assert.equal(r.missing.length, 0);
}
console.log('✅ önkoşul kaynaklar');

// 4) Duraklatma ve süre dondurma: eksik kaynakta durur, süre donar, kaynak gelince aynı süreyle devam eder
{
  const gs = yeni();
  const s = gs.state;
  s.inventory = { ...s.inventory, iron: 100, wood: 100, wheat: 100 };
  s.adAstraBalance = 50000;
  assert.equal(gs.buyTavernaAutomationBot(false).success, true);
  s.botActiveUntil = Date.now() + SAAT;           // 1 saat kaldı
  s.tavernaBotExpiresAt = s.botActiveUntil;

  // Satılabilecek fazla da ASTRA da yok: bot durmalı
  s.inventory.wood = 20; s.inventory.iron = 10; s.inventory.wheat = 52;
  s.adAstraBalance = 0;
  const durum = gs.updateBotPauseState();
  assert.equal(durum.isPaused, true);
  assert.equal(gs.isBotPaused(), true);
  const donuk = s.botPausedRemainingMs;
  assert.ok(donuk > 3500 * 1000 && donuk <= SAAT, 'yaklaşık 1 saat dondurulmuş');
  assert.equal(gs.runTavernaAutomationCycle().active, false, 'duraklatılmış bot sefer başlatmaz');
  assert.equal(s.botPausedRemainingMs, donuk, 'donuk süre sabit');

  s.inventory.wood = 100; s.inventory.iron = 100; s.inventory.wheat = 100;
  s.adAstraBalance = 50000;
  const uyanis = gs.updateBotPauseState();
  assert.equal(uyanis.isPaused, false);
  assert.equal(uyanis.justResumed, true);
  assert.ok(gs.isAutoCollectorActive());
  assert.ok(Math.abs(gs.getAutoCollectorExpiry() - Date.now() - donuk) < 1000, 'dondurulan süre korunur');
}
console.log('✅ duraklatma ve süre dondurma');

// 5) İleri sarma: bot yokken toplanmaz; botluyken toplanır ve süre azalır; donmuşken süre azalmaz; süre bitince expired; oto-yenileme
{
  // bot kapalı: sefer biter ama toplanmaz
  const kapali = yeni();
  kapali.state.tavernaBotActive = false; kapali.state.botActiveUntil = 0; kapali.state.tavernaBotExpiresAt = 0; kapali.state.botPaused = false;
  kapali.state.activeExpeditions = { wood: { nodeId: 'wood', durationSeconds: 1080, elapsedSeconds: 0, isCompleted: false } };
  const odunOnce = kapali.state.inventory.wood;
  const r0 = kapali.fastForwardTime(2);
  assert.equal(r0.hasBot, false);
  assert.equal(r0.botExecutionStatus, 'inactive');
  assert.equal(kapali.state.activeExpeditions.wood.isCompleted, true, 'sefer ilerler');
  assert.equal(kapali.state.inventory.wood, odunOnce, 'bot yokken otomatik toplama olmaz');

  // bot açık: 1 saat → seferler toplanır, süre 1 saat azalır, aletler sağlam
  const acik = yeni();
  bol(acik);
  botuAc(acik);
  const t0 = Date.now();
  const r1 = acik.fastForwardTime(1);
  assert.equal(r1.botExecutionStatus, 'ran');
  assert.ok(r1.totalExpeditionsClaimed >= 2, `1 saatte en az 2 sefer: ${r1.totalExpeditionsClaimed}`);
  assert.ok(r1.woodGain > 0 || r1.ironGain > 0 || r1.wheatGain > 0);
  assert.equal(Math.round((acik.getAutoCollectorExpiry() - t0) / SAAT), 23, 'kalan süre ~23 saat');
  assert.equal(acik.getAllRepairCost().count, 0, 'aletler tam sağlam teslim edilir');

  // devam eden canlı döngü bozulmaz
  for (let i = 0; i < 5; i++) {
    acik.regenerateStamina(1);
    acik.updateExpeditions(1);
    assert.equal(acik.updateBotPauseState().isPaused, false);
    acik.runTavernaAutomationCycle();
  }

  // 6 saat daha: en az 15 sefer, süre ~17 saat
  const r6 = acik.fastForwardTime(6);
  assert.equal(r6.botExecutionStatus, 'ran');
  assert.ok(r6.totalExpeditionsClaimed >= 15, `6 saatte en az 15 sefer: ${r6.totalExpeditionsClaimed}`);
  const kalan = (acik.getAutoCollectorExpiry() - Date.now()) / SAAT;
  assert.ok(kalan <= 17.2 && kalan >= 16.8, `kalan ~17 saat: ${kalan}`);

  // 24 saati aşan sarma + oto-yenileme: bot kesintisiz sürer
  acik.setBotAutoRenew24h(true);
  const r18 = acik.fastForwardTime(18);
  assert.equal(r18.botExecutionStatus, 'ran');
  assert.equal(acik.hasPurchasedBot(), true, 'süre bitince kasadaki ASTRA ile yenilenir');
  assert.ok(acik.getAutoCollectorExpiry() > Date.now());

  // donmuş bot: ileri sarmada süre azalmaz
  const donmus = yeni();
  const donuk = 18 * SAAT;
  donmus.state.botPaused = true;
  donmus.state.botPausedRemainingMs = donuk;
  donmus.state.botActiveUntil = 0; donmus.state.tavernaBotExpiresAt = 0;
  donmus.state.inventory.iron = 10;
  const rd = donmus.fastForwardTime(6);
  assert.equal(rd.hasBot, true);
  assert.equal(rd.botExecutionStatus, 'paused');
  assert.equal(donmus.state.botPausedRemainingMs, donuk, 'donuk süre azalmaz');
  assert.ok(rd.botRemainingText.includes('Donduruldu'));

  // kalan süreden uzun sarma: süre biter
  const bitecek = yeni();
  bol(bitecek);
  botuAc(bitecek, 2 * SAAT);
  const re = bitecek.fastForwardTime(6);
  assert.equal(re.botExecutionStatus, 'expired');
  assert.equal(bitecek.hasPurchasedBot(), false);
}
console.log('✅ ileri sarma (bot yok / açık / donmuş / süre bitti / oto-yenileme)');

// 6) Çalışma sırası: önce biten hasat toplanır; stamina yalnız bir sonraki sefer kadar doldurulur; akıllı satış yer açar
{
  const gs = yeni();
  const s = gs.state;
  botuAc(gs);
  s.inventory.wheat = 10; s.inventory.iron = 100; s.inventory.wood = 100;
  s.adAstraBalance = 50000;
  s.activeExpeditions = { wheat: { nodeId: 'wheat', elapsedSeconds: 1080, durationSeconds: 1080, isCompleted: true, startedAt: Date.now() - 1080000 } };
  gs.runTavernaAutomationCycle();
  assert.ok(s.inventory.wheat > 50, `biten hasat toplanmalı: ${s.inventory.wheat}`);
  assert.equal(s.botPaused, false);
}
{
  const gs = yeni();
  const s = gs.state;
  botuAc(gs);
  s.stamina = 0;
  s.inventory.wheat = 150; s.inventory.iron = 100; s.inventory.wood = 100;
  s.adAstraBalance = 50000;
  s.activeExpeditions = {
    wood: { nodeId: 'wood', elapsedSeconds: 100, durationSeconds: 1080, isCompleted: false },
    iron: { nodeId: 'iron', elapsedSeconds: 100, durationSeconds: 1080, isCompleted: false }
  };
  s.tools.sickle = { durability: 4320, maxDurability: 4320 };
  gs.runTavernaAutomationCycle();
  assert.ok(s.activeExpeditions.wheat, 'boşta kalan buğday seferi başlatılmalı');
  assert.ok(s.inventory.wheat >= 50, `rezerv korunmalı: ${s.inventory.wheat}`);
  assert.ok(s.inventory.wheat < 150, 'yalnız sefer için gereken buğday harcanmalı');
  assert.equal(s.botPaused, false);
}
{
  const gs = yeni();
  const s = gs.state;
  botuAc(gs);
  s.adAstraBalance = 50000;
  s.inventory.wheat = 300; s.inventory.iron = 100;
  s.botSiloAutoUpgrade = false;
  const kapasite = gs.getWarehouseCapacity();
  s.inventory.wood = kapasite.wood - 1;
  s.activeExpeditions = {};
  gs.runTavernaAutomationCycle();
  assert.ok(s.inventory.wood < kapasite.wood, 'akıllı satış sefer öncesi yer açar');
}
console.log('✅ çalışma sırası, stamina ve akıllı satış');

console.log('\n6/6 bot kuralı bloğu geçti.');
