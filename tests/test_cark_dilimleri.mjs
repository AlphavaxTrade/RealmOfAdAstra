// Şans çarkı: her dilim için sonuç, bedel ve kasa muhasebesi. Rastgelelik dilimin ortasına sabitlenir.
// Değişmezler: kasa asla eksiye düşmez; ASTRA ile çevirmede kasaya bedelin %80'i girer; eşya ödülü ya eşyayı verir ya da
// ödülün ASTRA karşılığını kasadan öder (yoktan para yok); parça biriktirme, kod saklama ve bot ödülü çalışır.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: k => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: k => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { treasury } = await import('../js/treasury.js');

const dilimler = GAME_CONFIG.CARNIVAL.WHEEL_REWARDS;
const toplam = dilimler.reduce((s, r) => s + r.weight, 0);
const once = dilimler.map((_, i) => dilimler.slice(0, i).reduce((s, r) => s + r.weight, 0));
const gercekRastgele = Math.random;

// Dilim dağılımı (eski test_wheel_reward_rates.mjs'in denetimleri): 15 dilim, toplam ağırlık 10.000, nadir ödüllerin üst sınırı
{
  assert.equal(dilimler.length, 15, 'çarkta tam 15 dilim');
  assert.equal(toplam, 10000, 'toplam ağırlık 10.000');
  const oran = (f) => dilimler.filter(f).reduce((s, r) => s + r.weight, 0) / toplam;
  assert.ok(oran((r) => r.type === 'bot_free' || r.id === 'free_bot_24h') < 0.01, '24 saatlik bot oranı %1 altında');
  assert.ok(oran((r) => r.key === 'fragments' || r.id.startsWith('frag_')) < 0.01, 'teçhizat parçası toplamı %1 altında');
  assert.ok(!dilimler.some((r) => (r.key && r.key.startsWith('scroll_')) || (r.id && r.id.startsWith('scroll_'))), 'çarkta parşömen yok (zindana taşındı)');
  assert.ok(oran((r) => r.type === 'key' || r.id === 'box_key') < 0.001, 'anahtar oranı %0,1 altında');
  assert.ok(oran((r) => r.type === 'analysis_code' || r.id === 'coin_analysis_code') < 0.01, 'analiz kodu oranı %1 altında');
}

function yeniOyuncu(kasa) {
  depo.clear();
  const gs = new GameStateManager();
  const s = gs.state;
  s.level = 10; s.adAstraBalance = 100000; s.stamina = 500;
  for (const k of GAME_CONFIG.RESOURCE_KEYS) s.inventory[k] = 2000;
  s.inventory.fragments = 5;
  s.wheelTicketShards = 2;
  treasury.state.pools.carnival = kasa;
  treasury.save();
  return gs;
}
const kasaBakiye = () => treasury.state.pools.carnival;
const sabitle = i => { Math.random = () => (once[i] + dilimler[i].weight / 2) / toplam; };

try {
  // 1) Bol kasa: her dilim ASTRA ile çevrilir
  for (let i = 0; i < dilimler.length; i++) {
    const d = dilimler[i];
    const gs = yeniOyuncu(1e6);
    const s = gs.state;
    const bedel = gs.getWheelCostAda();
    const kasaOnce = kasaBakiye();
    const bakiyeOnce = s.adAstraBalance;
    const parcaOnce = s.inventory.fragments;
    const anahtarOnce = s.arenaKeys || 0;
    const kodOnce = (s.redeemCodes || []).length;
    sabitle(i);
    const r = gs.spinCarnivalWheel('ada');
    assert.equal(r.success, true, `${d.id}: çevirme başarılı olmalı`);
    assert.equal(r.reward.id, d.id, `${d.id}: seçilen dilim`);
    assert.ok(kasaBakiye() >= 0, `${d.id}: kasa eksiye düşmedi`);

    // Kasaya bedelin %80'i doğrudan girer; kalan %20 her harcama gibi dağıtılır ve kasaya da küçük bir pay düşer
    const kasaFark = kasaBakiye() - kasaOnce;
    const odenenKasa = bedel * 0.8 - kasaFark;
    const pay = bedel * 0.2 + 1e-6;
    assert.ok(odenenKasa >= -pay, `${d.id}: kasadan ödenen eksi olamaz (${odenenKasa})`);

    if (d.type === 'ada') {
      const beklenen = gs.adaPrice(d.amount);
      assert.ok(Math.abs(r.gain.astra - beklenen) < 1e-9, `${d.id}: ASTRA ödülü ${beklenen}`);
      assert.ok(Math.abs(s.adAstraBalance - (bakiyeOnce - bedel + beklenen)) < 1e-6, `${d.id}: bakiye bedel ve ödülle uyumlu`);
      assert.ok(Math.abs(odenenKasa - beklenen) <= pay, `${d.id}: ödül kasadan ödendi`);
    } else if (d.key === 'fragments') {
      assert.ok(r.buybackInfo && r.gain.yedek === false, 'parça pazardan alınıp verilmeli');
      assert.equal(s.inventory.fragments, parcaOnce + d.amount);
      assert.ok(Math.abs(odenenKasa - r.buybackInfo.adaSpent) <= pay, 'parça maliyeti kasadan ödendi');
    } else if (d.type === 'amm_raw') {
      assert.ok(r.buybackInfo, `${d.id}: hammadde pazardan alınmalı`);
      assert.equal(r.buybackInfo.poolIcon, GAME_CONFIG.RESOURCE_META[d.key].icon, `${d.id}: simge kaynak tablosundan gelir`);
      assert.ok(Math.abs(odenenKasa - r.buybackInfo.adaSpent) <= pay, 'hammadde maliyeti kasadan ödendi');
    } else if (d.type === 'key') {
      assert.equal(s.arenaKeys || 0, anahtarOnce + d.amount, 'anahtar verildi');
      assert.ok(r.buybackInfo, 'anahtar pazardan alınmalı');
    } else if (d.type === 'ticket_shard') {
      assert.equal(s.wheelTicketShards, 0, 'parça 2 → 3 → 0');
      assert.equal(s.lotteryTickets, 1, '3 parça 1 bilete döner');
      assert.equal(r.gain.parcaBirikti, true);
    } else if (d.type === 'analysis_code') {
      assert.equal(s.redeemCodes.length, kodOnce + 1);
      assert.match(r.gain.kod, /^ALPHAVAX-COIN-[0-9A-Z]+$/);
      assert.equal(s.redeemCodes.at(-1).status, 'pending_integration', 'kod dürüstçe "bağlantı bekliyor" işaretli');
    } else if (d.type === 'bot_free') {
      assert.equal(r.success, true);
    }
  }
  console.log(`✅ ${dilimler.length} dilimin her biri: sonuç, bedel ve kasa muhasebesi doğru`);

  // 2) Kasa dar: eşya ödülleri pazardan alınamaz, ödülün ASTRA karşılığı kasadan (olanı kadar) ödenir; kasa eksiye düşmez
  const esyalar = dilimler.map((d, i) => [d, i]).filter(([d]) => d.type === 'amm_raw' || d.key === 'fragments' || d.type === 'key');
  for (const [d, i] of esyalar) {
    const gs = yeniOyuncu(GAME_CONFIG.CARNIVAL.WHEEL_MIN_CARNIVAL_BALANCE + 1);
    sabitle(i);
    const r = gs.spinCarnivalWheel('ada');
    assert.equal(r.success, true);
    assert.ok(kasaBakiye() >= 0, `${d.id}: dar kasada eksiye düşmedi`);
    if (r.gain.yedek) assert.ok(/yerine/.test(r.rewardSummaryText), `${d.id}: yedek ödeme açıklaması`);
  }
  console.log(`✅ dar kasada ${esyalar.length} eşya ödülü yoktan para üretmiyor`);

  // 3) Kasa asgarinin altında: çark kapalı, hiçbir şey harcanmaz
  {
    const gs = yeniOyuncu(10);
    const once0 = gs.state.adAstraBalance;
    const r = gs.spinCarnivalWheel('ada');
    assert.equal(r.success, false);
    assert.equal(r.wheelClosed, true);
    assert.equal(gs.state.adAstraBalance, once0, 'kapalı çarkta bakiye değişmez');
    console.log('✅ kasa asgarinin altındayken çark kapalı, bedel alınmıyor');
  }

  // 4) Bedel yolları: hammadde günlük sınırı, yetersiz bakiye, geçersiz yöntem
  {
    const gs = yeniOyuncu(1e6);
    sabitle(dilimler.findIndex(d => d.id === 'ada_50'));
    const limit = GAME_CONFIG.CARNIVAL.WHEEL_RESOURCE_DAILY_LIMIT;
    for (let i = 0; i < limit; i++) assert.equal(gs.spinCarnivalWheel('wood').success, true, `hammadde ${i + 1}. çevirme`);
    const fazla = gs.spinCarnivalWheel('wood');
    assert.equal(fazla.success, false, 'günlük hammadde sınırı');
    assert.equal(gs.getWheelResourceSpinsLeft(), 0);
    gs.state.adAstraBalance = 0;
    assert.equal(gs.spinCarnivalWheel('ada').success, false, 'bakiyesiz çevrilmez');
    assert.equal(gs.spinCarnivalWheel('ticket').success, false, 'biletsiz çevrilmez');
    assert.equal(gs.spinCarnivalWheel('altin').success, false, 'geçersiz yöntem');
    console.log('✅ hammadde günlük sınırı, yetersiz bakiye, biletsiz ve geçersiz yöntem reddediliyor');
  }
} finally {
  Math.random = gercekRastgele;
}
