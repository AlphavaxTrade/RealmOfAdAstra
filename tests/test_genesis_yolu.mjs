// Genesis Yolu (makro plan C6, kullanıcı onayı ve kuralı 15 Ekim 2026; js/gameState/genesis.js):
//   1) Ayrıcalık maliyeti ve "3 yıllık maliyet önden" eşiği (120 $/yıl → 360 $)
//   2) Katkı defteri: harcama ve hammadde yakımı o anki dolar fiyatıyla eklenir, çekim düşülür
//   3) Uyandırma: keşfedilmemiş eser uyanmaz; bedel (ASTRA × çarpan + yakılan hammadde); aynı anda tek eser; 72 saatte tamamlanır
//   4) Mühür: şartlardan biri eksikse basılmaz; hepsi tamamsa dolar sabit bedel alınır, yarısı yakılır, numara verilir
//   5) Açık mühür sayısı dolunca yeni Genesis basılmaz
//   6) Sunucu: haftalık hesaplaşma açık mühür sayısını trade gelirinden hesaplar
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = { getItem: k => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => { depo.set(k, String(v)); }, removeItem: k => { depo.delete(k); } };
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG: C, URETIM_CARPANI: U } = await import('../js/config.js');
const { globalPool } = await import('../js/globalPool.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { treasury } = await import('../js/treasury.js');
const { genesisAyricalikMaliyeti } = await import('../js/economy/genesis.js');

let toplam = 0;
const ok = ad => { toplam++; console.log(`✅ ${ad}`); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const GUN = 86400000;
const G = C.GENESIS_YOLU;
const yeni = (dunya = {}) => {
  depo.clear(); ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
  const gs = new GameStateManager();
  gs._simNow = Date.UTC(2027, 0, 1);
  gs._dunya = { astraUsd: 1e-6, genesisAcik: 5, hesapAcilis: gs._simNow - 200 * GUN, ...dunya };
  return gs;
};

// 1) Maliyet
{
  const m = genesisAyricalikMaliyeti(G);
  assert.ok(near(m.aylik, 10) && near(m.yillik, 120) && near(m.gerekli, 360), JSON.stringify(m));
  ok('Ayrıcalık maliyeti: ayda 10 $ (Uydu 5 + Gözlemevi 5), yılda 120 $, önden gereken 3 yıl = 360 $');
}

// 2) Katkı defteri
{
  const gs = yeni();
  gs._onAdaSpent(1000);
  assert.ok(near(gs.state.genesisKatki.harcananUsd, 1000 * 1e-6), 'harcama: 1.000 ASTRA × 1e-6 $');
  const fiyat = ammMarket.getPrice('stone');
  gs.burnResource('stone', 1000);
  assert.ok(near(gs.state.genesisKatki.yakilanUsd, 1000 * fiyat / U * 1e-6), 'hammadde yakımı: pazar değeri (eski ölçekte, adet x50 olduğu için ÷50) × dolar fiyatı');
  gs.genesisCekimYaz(500, 2e-6);
  assert.ok(near(gs.state.genesisKatki.cekilenUsd, 500 * 2e-6), 'çekim: çekim anındaki fiyatla düşülür');
  const y = gs.getGenesisYolu();
  assert.ok(near(y.defter.net, 1000 * 1e-6 + 1000 * fiyat / U * 1e-6 - 500 * 2e-6));
  ok('Katkı defteri: harcama + hammadde yakımı (o anki dolar) − çekim');
}

// 3) Uyandırma
{
  const gs = yeni();
  const s = gs.state;
  s.adAstraBalance = 1e7;
  s.warehouseLevel = 12;                                            // Universe öncesi en büyük silo: en pahalı (8 birim) uyandırma sığmalı
  const kap = gs.getWarehouseCapacity(12);
  for (const k of Object.keys(G.UYANDIRMA.BIRIM_HAMMADDE)) {
    assert.ok(kap[k] >= 8 * G.UYANDIRMA.BIRIM_HAMMADDE[k], `${k}: 8 birimlik uyandırma silo 12'ye sığar (${kap[k]})`);
    s.inventory[k] = kap[k];
  }
  const ilk = C.COLLECTION_ARTIFACTS.find(c => c.rarity === 'legendary');
  assert.equal(gs.uyandirEser(ilk.id).success, false, 'keşfedilmemiş eser uyanmaz');
  const kayit = s.collectionArtifacts.find(a => a.id === ilk.id); kayit.discovered = true;
  const b = gs.getUyandirmaBedeli(ilk.id);
  assert.equal(b.birim, 8, 'efsanevi eser 8 birim');
  assert.equal(b.astra, gs.adaPrice(8 * G.UYANDIRMA.BIRIM_ASTRA), 'ASTRA bedeli bedel çarpanıyla');
  const bakiye0 = s.adAstraBalance, tas0 = s.inventory.stone, yakilan0 = globalPool.state.totalBurned || 0;
  const r = gs.uyandirEser(ilk.id);
  assert.equal(r.success, true, r.message);
  assert.ok(near(bakiye0 - s.adAstraBalance, b.astra, 1e-6), 'ASTRA düştü');
  assert.equal(tas0 - s.inventory.stone, 8 * G.UYANDIRMA.BIRIM_HAMMADDE.stone, 'taş düştü');
  assert.equal(s.burnedResources.stone, 8 * G.UYANDIRMA.BIRIM_HAMMADDE.stone, 'taş yakıldı');
  assert.ok((globalPool.state.totalBurned || 0) > yakilan0, 'ASTRA harcamasının yakım payı');
  const ikinci = C.COLLECTION_ARTIFACTS.find(c => c.rarity === 'common');
  s.collectionArtifacts.find(a => a.id === ikinci.id).discovered = true;
  assert.match(gs.uyandirEser(ikinci.id).message, /aynı anda tek eser/);
  gs._simNow += G.UYANDIRMA.SURE_SAAT * 3600000 - 1000;
  assert.ok(!gs.getGenesisYolu().sartlar.find(x => x.id === 'eser').deger.startsWith('1/'), 'süre dolmadan uyanmaz');
  gs._simNow += 2000;
  gs.getGenesisYolu();
  assert.equal(kayit.uyandi, true, '72 saat sonra uyandı');
  assert.equal(gs.uyandirEser(ikinci.id).success, true, 'sıradaki eser başlayabilir');
  assert.equal(gs.uyandirEser(ilk.id).success, false, 'uyanmış eser yeniden uyanmaz');
  ok('Uyandırma: keşif şartı, bedel (ASTRA × çarpan + yakılan hammadde), aynı anda tek eser, 72 saatte tamamlanır');
}

// 4) Mühür
const hazirla = (gs, { katkiUsd = 120 } = {}) => {
  const s = gs.state;
  s.level = 30;
  s.onboardingSections = { [C.ONBOARDING_FINAL.id]: { claimed: true } };
  s.fatih = { harcanan: 0, kazanilan: 0, alindi: true, odul: 0, at: 0 };
  const c = gs._contribution();
  const esik = C.URETIM_HAKKI.TIERS.find(t => t.id === 'gold').min * gs.getAdaPriceMultiplier();
  c.gecmis = [esik, esik + 1, esik * 2, esik];
  for (const a of s.collectionArtifacts) { a.discovered = true; a.uyandi = true; }
  s.genesisKatki = { harcananUsd: katkiUsd, yakilanUsd: 0, cekilenUsd: 0 };
  s.adAstraBalance = gs.genesisMuhurBedeli() * 2;
};
{
  const gs = yeni();
  const y0 = gs.getGenesisYolu();
  assert.deepEqual(y0.sartlar.map(x => x.id), ['seviye', 'yas', 'krallik', 'fatih', 'katki', 'eser', 'defter', 'yer']);
  assert.equal(gs.mintGenesisNft().success, false, 'yeni hesap basamaz');

  hazirla(gs, { katkiUsd: 109 });                                   // 109 + 250 mühür = 359 < 360
  let r = gs.mintGenesisNft();
  assert.equal(r.success, false);
  assert.match(r.message, /net katkı/, 'katkı 3 yıllık maliyetin altında: basılmaz');
  gs.state.genesisKatki.harcananUsd = 110;                          // 110 + 250 = 360
  const sart = (id, deger, geri) => { const eski = deger(); assert.equal(gs.mintGenesisNft().success, false, `${id} eksikken basılmaz`); geri(eski); };
  sart('seviye', () => { const v = gs.state.level; gs.state.level = 29; return v; }, v => { gs.state.level = v; });
  sart('yas', () => { const v = gs._dunya.hesapAcilis; gs._dunya.hesapAcilis = gs._simNow - 100 * GUN; return v; }, v => { gs._dunya.hesapAcilis = v; });
  sart('fatih', () => { gs.state.fatih.alindi = false; return true; }, () => { gs.state.fatih.alindi = true; });
  sart('katki', () => { const c = gs._contribution(); const v = c.gecmis.slice(); c.gecmis[2] = 1; return v; }, v => { gs._contribution().gecmis = v; });

  const bedel = gs.genesisMuhurBedeli();
  assert.ok(near(bedel, 250 / 1e-6, 1e-3), `mühür bedeli 250 $ ÷ fiyat: ${bedel}`);
  const yakim0 = globalPool.state.totalBurned || 0, bakiye0 = gs.state.adAstraBalance;
  r = gs.mintGenesisNft();
  assert.equal(r.success, true, r.message);
  assert.equal(r.no, 1, 'ilk Genesis #1');
  assert.ok(near(bakiye0 - gs.state.adAstraBalance, bedel, 1e-3), 'mühür bedeli düştü');
  const yakilan = (globalPool.state.totalBurned || 0) - yakim0;
  assert.ok(near(yakilan, bedel * 0.5 + bedel * 0.5 * C.TOKEN_BURN_RATE, 1), `yarısı + kalanın %5'i yakıldı: ${yakilan}`);
  assert.equal(globalPool.state.genesisBasilan, 1);
  assert.equal(gs.state.genesisZincir, 'bekliyor', 'zincirdeki NFT sonra basılır');
  assert.ok(gs.state.grants.includes('universe_planet_purchase'), 'gezegen hakkı');
  assert.ok(near(gs.state.genesisKatki.harcananUsd, 110 + 250, 1e-6), 'mühür de katkı defterine yazıldı');
  assert.equal(gs.mintGenesisNft().success, false, 'ikinci kez basılmaz');
  ok('Mühür: eksik şartla basılmaz (katkı, seviye, hesap yaşı, Fatih, 4 hafta Altın); tamamsa 250 $ bedel, yarısı yakılır, #1 numara');
}

// 5) Açık mühür sayısı
{
  const gs = yeni({ genesisAcik: 1 });
  globalPool.state.genesisBasilan = 1;                               // bir Genesis zaten basılmış
  hazirla(gs);
  const r = gs.mintGenesisNft();
  assert.equal(r.success, false);
  assert.match(r.message, /Açık mühür yeri/, 'açık mühür dolu: basılmaz');
  gs._dunya.genesisAcik = 2;
  assert.equal(gs.mintGenesisNft().success, true, 'yer açılınca basılır');
  assert.equal(gs.state.genesisNo, 2);
  gs._dunya = {};                                                    // dünya bilgisi yok (tek oyunculu mod): sezon tavanı ve yedek fiyat
  const d = gs._genesisDunya();
  assert.equal(d.acik, G.SEZON_TAVAN);
  assert.equal(d.astraUsd, G.YEDEK_ASTRA_USD);
  ok('Açık mühür sayısı dolunca basılmaz; dünya bilgisi yoksa sezon tavanı ve yedek fiyat');
}

// 6) Sunucu: açık mühür sayısı trade gelirinden
{
  const { openDb } = await import('../server/db.js');
  const { createEngine } = await import('../server/engine.js');
  const { createWorld } = await import('../server/world.js');
  const { loadConfig } = await import('../server/config.js');
  const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true, weeklySendCapAda: 1e12 };
  const db = openDb(':memory:');
  const E = await createEngine(db, { testMode: true });
  let T = Date.UTC(2026, 9, 12, 12);
  const price = 1e-6;
  const chain = { gameWallet: '0x' + '11'.repeat(20), canSend: true, async readMarket() { return { at: T, graduated: false, supply: 1e9, dead: 0, curveSupply: 1e9, priceAvax: price / 10, avaxUsd: 10, priceUsd: price, mcapUsd: price * 1e9, walletAda: 1e12 }; }, async latestBlock() { return 1; } };
  const world = createWorld({ db, engine: E, chain, cfg, clock: () => T, log: { warn() {}, error() {} } });
  await world.snapshotMarket();
  // Son 4 haftada trade alımı: her hafta 2 M ASTRA'nın %40'ı (800 bin) oyuna → aylık trade ≈ 8 M × 30/28 ASTRA × 1e-6 $ ≈ 8,57 $
  for (let h = 0; h < 4; h++) db.raw.prepare('INSERT INTO partner_income (tx_hash, log_index, sender, amount, block, at) VALUES (?, ?, ?, ?, ?, ?)').run('0xg' + h, 0, '0xbb', 0.8e6, 1, T - h * 7 * GUN - 1000);
  // Trade 8,57 $/ay → açık mühür = floor(8,57 × 0,10 ÷ 10) = 0
  let s = world.settleWeek(E.globalPool.state.epochId, world.econ().market);
  assert.equal(s.genesisAcik, 0, `trade geliri küçükken açık mühür yok: ${s.genesisAcik}`);
  // Trade 100 kat (857 $/ay) → floor(857 × 0,10 ÷ 10) = 8
  for (let h = 0; h < 4; h++) db.raw.prepare('INSERT INTO partner_income (tx_hash, log_index, sender, amount, block, at) VALUES (?, ?, ?, ?, ?, ?)').run('0xh' + h, 0, '0xbb', 79.2e6, 1, T - h * 7 * GUN - 2000);
  s = world.settleWeek(E.globalPool.state.epochId + 1, world.econ().market);
  assert.equal(s.genesisAcik, 8, `açık mühür = trade aylık geliri × %10 ÷ 10 $: ${s.genesisAcik}`);
  assert.equal(world.econ().genesisAcik, 8, 'saklandı');
  db.close();
  ok('Sunucu: açık mühür sayısı = trade aylık geliri × %10 ÷ sahip başı 10 $ (sezon tavanına kadar)');
}

console.log(`\n${toplam} Genesis Yolu kontrolü geçti.`);
process.exit(0);
