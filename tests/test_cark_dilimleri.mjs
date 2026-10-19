// Şans çarkı: her dilim için sonuç, bedel ve kasa muhasebesi; çarpanlı çevirme; Şans Sayacı; tablo kayma koruması.
// Değişmezler: kasa asla eksiye düşmez; ASTRA ile çevirmede kasaya bedelin %85'i girer; eşya ödülü ya eşyayı verir ya da
// ödülün ASTRA karşılığını kasadan öder (yoktan para yok); stamina ödülü buğdayı pazardan alıp YAKAR; parça biriktirme,
// piyango bileti ve bot ödülü çalışır; ödeme oranı sınırın içinde kalır (kasa uzun vadede büyür).
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
const { ammMarket } = await import('../js/ammMarket.js');

const K = GAME_CONFIG.CARNIVAL;
const dilimler = K.WHEEL_REWARDS;
const toplam = dilimler.reduce((s, r) => s + r.weight, 0);
const once = dilimler.map((_, i) => dilimler.slice(0, i).reduce((s, r) => s + r.weight, 0));
const gercekRastgele = Math.random;
const PAY = K.WHEEL_CARNIVAL_SHARE;

// Dilim dağılımı: 19 dilim (18 gerçek + Şans Sayacı), toplam ağırlık 10.000, nadir ödüllerin üst sınırı, yasak ödül türleri
{
  assert.equal(dilimler.length, 18, 'çarkta 18 dilim (17 + Şans Sayacı; anahtar dilimi kalktı)');
  assert.equal(toplam, 10000, 'toplam ağırlık 10.000');
  assert.equal(new Set(dilimler.map((r) => r.id)).size, dilimler.length, 'dilim kimlikleri benzersiz');
  assert.equal(dilimler.filter((r) => r.pity).length, 1, 'tek Şans Sayacı dilimi');
  assert.equal(dilimler.find((r) => r.pity).weight, 0, 'Şans Sayacı dilimini zar seçemez, yalnız sayaç doldurur');
  assert.equal(PAY, 0.8, 'kasa payı %80 (19 Ekim 2026: kalan %20 ortak dağılıma gider; çevirme başına kasa kârı >= 0,07 korunur)');
  assert.deepEqual(K.WHEEL_MULTIPLIERS, [1, 2, 10], 'çarpanlar x1, x2, x10');
  const oran = (f) => dilimler.filter(f).reduce((s, r) => s + r.weight, 0) / toplam;
  assert.ok(oran((r) => r.type === 'bot_free') < 0.01, '24 saatlik bot oranı %1 altında');
  assert.ok(oran((r) => r.key === 'fragments') < 0.01, 'teçhizat parçası toplamı %1 altında');
  assert.equal(oran((r) => r.type === 'key'), 0, 'çarkta anahtar yok (yalnız Kolezyum haftalık ilk üçünden)');
  assert.ok(!dilimler.some((r) => (r.key && r.key.startsWith('scroll_')) || r.type === 'scroll'), 'çarkta parşömen yok (zindana taşındı)');
  const izinli = new Set(['ada', 'resource', 'amm_raw', 'key', 'stamina_buy', 'lottery_ticket', 'ticket_shard', 'bot_free']);
  for (const r of dilimler) assert.ok(izinli.has(r.type), `${r.id}: tür çarkta izinli (şifa, sefer tamamlama, zindan girişi, coin kuponu gibi ekonomiyi bozan ödül yok)`);
}

// Tablo kayma koruması: Şans Sayacı hariç beklenen kasa ödemesi sınırın içinde (kasa uzun vadede büyür, oyuncu da kaybediyor hissine girmez)
{
  const kasaMaliyeti = (r) => (r.type === 'ada' ? r.amount : (r.type === 'amm_raw' || r.type === 'stamina_buy') ? r.adaVal : (r.key === 'fragments' || r.type === 'key') ? r.valAda : 0);
  const bedava = dilimler.reduce((s, r) => s + (r.type === 'ticket_shard' ? r.weight / toplam / 3 : (r.type === 'lottery_ticket' ? r.weight / toplam : 0)), 0);
  const odeme = dilimler.reduce((s, r) => s + (r.weight / toplam) * kasaMaliyeti(r), 0) / (1 - bedava);
  assert.ok(odeme >= 0.66 && odeme <= 0.78, `kasa ödemesi çevirme başına ${odeme.toFixed(3)} ASTRA, 0,66-0,78 aralığında olmalı`);
  assert.ok(PAY - odeme >= 0.07, `kasa çevirme başına en az 0,07 ASTRA kazanmalı (Şans Sayacı maliyeti payı bırakılarak): ${(PAY - odeme).toFixed(3)}`);
  console.log(`✅ tablo kayma koruması: kasa ödemesi ${odeme.toFixed(3)}, kasa kazancı ${(PAY - odeme).toFixed(3)} ASTRA/çevirme`);
}

function yeniOyuncu(kasa) {
  depo.clear();
  const gs = new GameStateManager();
  const s = gs.state;
  s.level = 10; s.adAstraBalance = 100000; s.stamina = 500;
  for (const k of GAME_CONFIG.RESOURCE_KEYS) s.inventory[k] = 2000;
  s.inventory.fragments = 5;
  s.wheelTicketShards = 2;
  s.wheelPity = 0;
  treasury.state.pools.carnival = kasa;
  treasury.save();
  return gs;
}
const kasaBakiye = () => treasury.state.pools.carnival;
const sabitle = i => { Math.random = () => (once[i] + dilimler[i].weight / 2) / toplam; };
const sira = (id) => dilimler.findIndex((d) => d.id === id);

try {
  // 1) Bol kasa: ağırlığı olan her dilim ASTRA ile çevrilir
  let denenen = 0;
  for (let i = 0; i < dilimler.length; i++) {
    const d = dilimler[i];
    if (!(d.weight > 0)) continue;
    denenen += 1;
    const gs = yeniOyuncu(1e6);
    const s = gs.state;
    const bedel = gs.getWheelCostAda();
    const kasaOnce = kasaBakiye();
    const bakiyeOnce = s.adAstraBalance;
    const parcaOnce = s.inventory.fragments;
    const anahtarOnce = s.arenaKeys || 0;
    if (d.type === 'stamina_buy') { s.stamina = 10; s.inventory.wheat = 100; }   // silo sınırının altında
    const bugdayOnce = s.inventory.wheat;
    const stamOnce = s.stamina;
    sabitle(i);
    const r = gs.spinCarnivalWheel('ada');
    assert.equal(r.success, true, `${d.id}: çevirme başarılı olmalı`);
    assert.equal(r.reward.id, d.id, `${d.id}: seçilen dilim`);
    assert.equal(r.multiplier, 1, `${d.id}: çarpansız çevirme`);
    assert.ok(kasaBakiye() >= 0, `${d.id}: kasa eksiye düşmedi`);

    // Kasaya bedelin %85'i doğrudan girer; kalan %15 her harcama gibi dağıtılır ve kasaya da küçük bir pay düşer
    const kasaFark = kasaBakiye() - kasaOnce;
    const odenenKasa = bedel * PAY - kasaFark;
    const pay = bedel * (1 - PAY) + 1e-6;
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
    } else if (d.type === 'stamina_buy') {
      assert.ok(r.buybackInfo && r.gain.yedek === false, 'stamina için buğday pazardan alınmalı');
      assert.equal(r.buybackInfo.resourceKey, 'wheat', 'stamina buğdayla karşılanır');
      assert.ok(r.gain.stamina > 0 && Math.abs(s.stamina - (stamOnce + r.gain.stamina)) < 1, 'stamina arttı');
      assert.equal(s.inventory.wheat, bugdayOnce, 'oyuncunun kendi buğdayı harcanmadı (bedeli kasa ödedi)');
      assert.ok(Math.abs(odenenKasa - r.buybackInfo.adaSpent) <= pay, 'buğday maliyeti kasadan ödendi');
      assert.ok(r.buybackInfo.adaSpent >= d.adaVal * 0.9 && r.buybackInfo.adaSpent <= d.adaVal * 1.2, 'kasa yaklaşık 1 ASTRA ödedi (pazar fiyatı)');
    } else if (d.type === 'key') {
      assert.equal(s.arenaKeys || 0, anahtarOnce + d.amount, 'anahtar verildi');
      assert.ok(r.buybackInfo, 'anahtar pazardan alınmalı');
    } else if (d.type === 'ticket_shard') {
      assert.equal(s.wheelTicketShards, 0, 'parça 2 → 3 → 0');
      assert.equal(s.lotteryTickets, 1, '3 parça 1 bilete döner');
      assert.equal(r.gain.parcaBirikti, true);
    } else if (d.type === 'lottery_ticket') {
      assert.equal(s.lotteryTickets, 1, 'piyango bileti eklendi');
      assert.equal(s.lotteryTicketsPaid, 0, 'bedava bilet ödenmiş sayılmaz');
      assert.equal(r.gain.yeniBilet, 1);
    } else if (d.type === 'bot_free') {
      assert.equal(r.success, true);
    }
  }
  console.log(`✅ ${denenen} dilimin her biri: sonuç, bedel ve kasa muhasebesi doğru`);

  // 2) Kasa dar: eşya ödülleri pazardan alınamaz, ödülün ASTRA karşılığı kasadan (olanı kadar) ödenir; kasa eksiye düşmez
  const esyalar = dilimler.map((d, i) => [d, i]).filter(([d]) => d.type === 'amm_raw' || d.key === 'fragments' || d.type === 'key' || d.type === 'stamina_buy');
  for (const [d, i] of esyalar) {
    const gs = yeniOyuncu(GAME_CONFIG.CARNIVAL.WHEEL_MIN_CARNIVAL_BALANCE + 1);
    if (d.type === 'stamina_buy') gs.state.stamina = 10;
    sabitle(i);
    const r = gs.spinCarnivalWheel('ada');
    assert.equal(r.success, true);
    assert.ok(kasaBakiye() >= 0, `${d.id}: dar kasada eksiye düşmedi`);
    if (r.gain.yedek) assert.ok(/yerine/.test(r.rewardSummaryText), `${d.id}: yedek ödeme açıklaması`);
  }
  console.log(`✅ dar kasada ${esyalar.length} eşya ödülü yoktan para üretmiyor`);

  // 2b) Stamina deposu doluysa ödül boşa gitmez: aynı değer nakit ödenir, buğday alınıp yakılmaz
  {
    const gs = yeniOyuncu(1e6);
    gs.state.stamina = gs.getMaxStamina();
    sabitle(sira('stamina_1'));
    const bakiyeOnce = gs.state.adAstraBalance;
    const r = gs.spinCarnivalWheel('ada');
    assert.equal(r.success, true);
    assert.equal(r.buybackInfo, null, 'dolu depoda buğday alınmaz');
    assert.ok(Math.abs(r.gain.astra - 1) < 1e-9, '1 ASTRA nakit ödenir');
    assert.ok(Math.abs(gs.state.adAstraBalance - (bakiyeOnce - gs.getWheelCostAda() + 1)) < 1e-6);
    assert.equal(gs.state.stamina, gs.getMaxStamina(), 'stamina tavanı aşılmaz');
    console.log('✅ dolu stamina deposunda ödül nakde dönüyor');
  }

  // 2c) Stamina deposu KISMEN boşsa (ödülün yarısından fazlası sığıyor): sığan kadarı stamina olur, sığmayan kısmın değeri ASTRA ödenir
  {
    const gs = yeniOyuncu(1e6);
    const fiyat = ammMarket.getPrice('wheat');
    // 19 Ekim 2026: buğday 0,45 ASTRA (x50); 1 ASTRA'lık ödül ~2 stamina eder, kısmi sığma ölçülemez: ödülü büyütüp ölç, sonra geri koy
    const dilim = GAME_CONFIG.CARNIVAL.WHEEL_REWARDS[sira('stamina_1')];
    const eskiDeger = dilim.adaVal;
    dilim.adaVal = 60;
    const esdeger = 60 / fiyat / (GAME_CONFIG.WHEAT_PER_STAMINA || 1);
    const bos = Math.floor(esdeger * 0.6);   // ödülün %60'ı sığar
    gs.state.stamina = gs.getMaxStamina() - bos;
    sabitle(sira('stamina_1'));
    const bakiyeOnce = gs.state.adAstraBalance;
    const r = gs.spinCarnivalWheel('ada');
    assert.equal(r.success, true);
    assert.ok(r.buybackInfo && r.gain.stamina === bos, 'sığan kadarı stamina olur');
    assert.equal(gs.state.stamina, gs.getMaxStamina(), 'stamina tavanı aşılmaz');
    const beklenen = 60 * (1 - bos / esdeger);
    assert.ok(Math.abs(r.gain.astra - beklenen) < 0.02, `sığmayan %40'ın değeri ödendi (${r.gain.astra} ≈ ${beklenen})`);
    assert.ok(Math.abs(gs.state.adAstraBalance - (bakiyeOnce - gs.getWheelCostAda() + r.gain.astra)) < 1e-6, 'bakiye ödenen kadar arttı');
    assert.match(r.rewardSummaryText, /sığmayan kısmın değeri/);
    dilim.adaVal = eskiDeger;
    console.log('✅ kısmen boş stamina deposunda sığmayan kısım ASTRA olarak ödeniyor');
  }

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
    sabitle(sira('ada_50'));
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

  // 5) Çarpanlı çevirme: bedel ve ödeme aynı oranda büyür; yalnız ASTRA ile; geçersiz çarpan reddedilir
  {
    for (const c of [2, 10]) {
      const gs = yeniOyuncu(1e6);
      const bedel = gs.getWheelCostAda() * c;
      const bakiyeOnce = gs.state.adAstraBalance;
      const kasaOnce = kasaBakiye();
      sabitle(sira('ada_200'));
      const r = gs.spinCarnivalWheel('ada', c);
      assert.equal(r.success, true, `x${c} çevirme`);
      assert.equal(r.multiplier, c);
      assert.ok(Math.abs(r.gain.astra - gs.adaPrice(2 * c)) < 1e-9, `x${c}: nakit ödeme ${c} katı`);
      assert.ok(Math.abs(gs.state.adAstraBalance - (bakiyeOnce - bedel + gs.adaPrice(2 * c))) < 1e-6, `x${c}: bedel ${c} katı`);
      assert.ok(kasaBakiye() - kasaOnce >= bedel * PAY - gs.adaPrice(2 * c) - bedel * (1 - PAY) - 1e-6, `x${c}: kasa payı bedelle orantılı`);
    }
    // parça ve bilet ödülleri de çarpanla büyür
    let gs = yeniOyuncu(1e6);
    gs.state.wheelTicketShards = 0;
    sabitle(sira('wheel_ticket_shard'));
    let r = gs.spinCarnivalWheel('ada', 10);
    assert.equal(gs.state.wheelTicketShards, 1, 'x10: 10 parça → 3 bilet + 1 artık parça');
    assert.equal(gs.state.lotteryTickets, 3);
    assert.equal(r.gain.yeniBilet, 3);
    gs = yeniOyuncu(1e6);
    sabitle(sira('lottery_ticket'));
    r = gs.spinCarnivalWheel('ada', 2);
    assert.equal(gs.state.lotteryTickets, 2, 'x2: 2 piyango bileti');
    // eşya ödülü çarpanla büyür ve yine pazardan alınır
    gs = yeniOyuncu(1e6);
    sabitle(sira('raw_100_stone'));
    r = gs.spinCarnivalWheel('ada', 10);
    assert.ok(r.buybackInfo && r.buybackInfo.adaSpent >= 9 && r.buybackInfo.adaSpent <= 13, 'x10: 10 ASTRA değerinde taş pazardan alındı');
    // kurallar
    gs = yeniOyuncu(1e6);
    sabitle(sira('ada_50'));
    assert.equal(gs.spinCarnivalWheel('ada', 3).success, false, 'x3 tanımsız');
    assert.equal(gs.spinCarnivalWheel('wood', 2).success, false, 'çarpan yalnız ASTRA ile');
    gs.state.lotteryTickets = 1;
    assert.equal(gs.spinCarnivalWheel('ticket', 10).success, false, 'çarpan biletle olmaz');
    // x10 için kasa asgarisi de 10 katı
    gs = yeniOyuncu(GAME_CONFIG.CARNIVAL.WHEEL_MIN_CARNIVAL_BALANCE * 2);
    const bakiyeOnce = gs.state.adAstraBalance;
    const kapali = gs.spinCarnivalWheel('ada', 10);
    assert.equal(kapali.success, false);
    assert.equal(kapali.wheelClosed, true, 'x10 için kasa yetmiyor');
    assert.equal(gs.state.adAstraBalance, bakiyeOnce);
    assert.equal(gs.spinCarnivalWheel('ada', 1).success, true, 'aynı kasada x1 açık');
    console.log('✅ çarpanlı çevirme: bedel ve ödemeler orantılı, kurallar ve kasa asgarisi çalışıyor');
  }

  // 6) Şans Sayacı: art arda 8 boş çevirmeden sonra garantili nakit; bedel geri gelince sayaç sıfırlanır
  {
    const gs = yeniOyuncu(1e6);
    const sinir = K.WHEEL_PITY.STREAK;
    sabitle(sira('ada_50'));
    for (let i = 0; i < sinir; i++) {
      const r = gs.spinCarnivalWheel('ada');
      assert.equal(r.pity.triggered, false);
      assert.equal(gs.state.wheelPity, i + 1, `${i + 1}. boş çevirme sayaca eklendi`);
    }
    assert.deepEqual(gs.getWheelPityInfo(), { streak: sinir, limit: sinir });
    const bakiyeOnce = gs.state.adAstraBalance;
    const garanti = gs.spinCarnivalWheel('ada');   // zar 0,5 ASTRA derdi; sayaç dolu olduğu için garanti ödül
    assert.equal(garanti.reward.id, 'sans_sayaci');
    assert.equal(garanti.pity.triggered, true);
    assert.ok(Math.abs(garanti.gain.astra - gs.adaPrice(3)) < 1e-9, 'garanti 3 ASTRA nakit');
    assert.ok(Math.abs(gs.state.adAstraBalance - (bakiyeOnce - gs.getWheelCostAda() + gs.adaPrice(3))) < 1e-6);
    assert.equal(gs.state.wheelPity, 0, 'sayaç sıfırlandı');

    // 1 ASTRA değerinde ödül ve piyango bileti sayacı sıfırlar; bilet parçası ve 0,5 ASTRA sıfırlamaz
    for (const [id, sifirlar] of [['raw_100_stone', true], ['stamina_1', true], ['lottery_ticket', true], ['ada_200', true], ['wheel_ticket_shard', false], ['ada_50', false]]) {
      const g = yeniOyuncu(1e6);
      g.state.stamina = 10;
      g.state.wheelPity = 5;
      sabitle(sira(id));
      g.spinCarnivalWheel('ada');
      assert.equal(g.state.wheelPity, sifirlar ? 0 : 6, `${id}: sayaç ${sifirlar ? 'sıfırlanır' : 'artar'}`);
    }

    // çarpanlı çevirmede garanti ödül de çarpanla büyür; sayaç çevirme başına işler
    const g = yeniOyuncu(1e6);
    g.state.wheelPity = sinir;
    sabitle(sira('ada_50'));
    const x = g.spinCarnivalWheel('ada', 10);
    assert.equal(x.reward.id, 'sans_sayaci');
    assert.ok(Math.abs(x.gain.astra - g.adaPrice(30)) < 1e-9, 'x10: garanti 30 ASTRA');
    console.log('✅ Şans Sayacı: 8 boş çevirmede garanti ödül, doğru sıfırlama, çarpanla orantılı');
  }
} finally {
  Math.random = gercekRastgele;
}
