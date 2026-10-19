// Ekonomi planı (19 Ekim 2026): kişisel haftalık limit + global haftalık havuz; taban pay herkese eşit, fazlası limiti ve katkı kademesi yüksek olanlara;
// havuz fiyat bandına ve bot ASTRA girişine göre ayarlanır; fiyat tavana giderse acil açılış.
import assert from 'node:assert/strict';

globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] ?? null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};
const { havuzDagit, oyuncuPayi, fiyatCarpani, botCarpani, yeniHavuzCarpani } = await import('../js/economy/uretimDagitimi.js');
const { GAME_CONFIG: C } = await import('../js/config.js');
const { GameStateManager } = await import('../js/gameState.js');
const { globalPool } = await import('../js/globalPool.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { treasury } = await import('../js/treasury.js');

let n = 0;
const ok = (ad) => { n++; console.log(`✅ ${ad}`); };
const U = C.URETIM_HAKKI;
const yakin = (a, b, e = 1e-3) => Math.abs(a - b) <= e * Math.max(1, Math.abs(b));

// 1) Havuz herkesin limitini karşılıyorsa herkes limitini alır
{
  const o = [{ L: 100, S: 1 }, { L: 50, S: 1.2 }];
  const d = havuzDagit(o, 1000, 0.6);
  assert.equal(d.A, null);
  assert.equal(d.total, 150);
  assert.equal(oyuncuPayi(100, 1, d), 100);
  ok('havuz yetiyorsa herkes kişisel limitini alır');
}

// 2) Kıt havuz: toplam havuzu aşmaz; taban pay herkese eşit; kimse limitini aşmaz; küçük limitli limitini alır
{
  const o = [{ L: 10, S: 1 }, { L: 100, S: 1 }, { L: 200, S: 1 }, { L: 400, S: 1 }];   // toplam limit 710
  const G = 300;
  const d = havuzDagit(o, G, 0.6);
  assert.ok(d.total <= G + 1e-6 && d.total >= G - 1, `dağıtılan ${d.total} ≈ havuz ${G}`);
  assert.ok(d.A > 0 && isFinite(d.A));
  const paylar = o.map((x) => oyuncuPayi(x.L, x.S, d));
  paylar.forEach((p, i) => assert.ok(p <= o[i].L + 1e-9, 'kimse limitini aşmaz'));
  // taban: Σ min(L, A) ≈ %60 x G
  const taban = o.reduce((t, x) => t + Math.min(x.L, d.A), 0);
  assert.ok(yakin(taban, 0.6 * G, 0.01), `taban ${taban} ≈ ${0.6 * G}`);
  // sıralama: limiti büyük olan daha çok alır
  assert.ok(paylar[0] <= paylar[1] && paylar[1] <= paylar[2] && paylar[2] <= paylar[3]);
  assert.equal(Math.round(paylar[0]), 10, 'limiti tabandan küçük olan limitinin hepsini alır');
  ok('kıt havuz: taban pay eşit, üst pay limite göre, kimse limitini aşmaz, toplam havuzu aşmaz');
}

// 3) Aynı limitte katkı kademesi (harcama) yüksek olan fazladan daha çok alır
{
  const o = [{ L: 400, S: 1.0 }, { L: 400, S: 1.5 }, { L: 400, S: 1.0 }, { L: 400, S: 1.5 }];
  const d = havuzDagit(o, 1000, 0.6);
  const dusuk = oyuncuPayi(400, 1.0, d), yuksek = oyuncuPayi(400, 1.5, d);
  assert.ok(yuksek > dusuk, `çok harcayan (${yuksek}) az harcayandan (${dusuk}) fazla alır`);
  assert.ok(d.total <= 1000 + 1e-6);
  ok('aynı limitte daha çok katkı yapan, tabanın üstünden daha çok alır');
}

// 4) Oyuncu çoğalınca kişi başı pay küçülür (havuz sayıya bağlı değildir)
{
  const kisi = (N) => Array.from({ length: N }, () => ({ L: 400, S: 1 }));
  const p100 = oyuncuPayi(400, 1, havuzDagit(kisi(100), 12000, 0.6));
  const p400 = oyuncuPayi(400, 1, havuzDagit(kisi(400), 12000, 0.6));
  assert.ok(p400 < p100 / 3, `4 kat oyuncu → kişi başı pay ~4 kat küçülür (${p100.toFixed(1)} → ${p400.toFixed(1)})`);
  ok('havuz sabit: oyuncu sayısı artınca kişi başı pay küçülür');
}

// 5) Fiyat tepkisi: bant içi sabit, düşükte arz kısılır, yüksekte açılır; sınırlar
{
  const B = U.AYAR;
  assert.equal(fiyatCarpani(1.0, B), 1);
  assert.equal(fiyatCarpani(B.BAND_ALT, B), 1);
  assert.equal(fiyatCarpani(B.BAND_UST, B), 1);
  assert.ok(fiyatCarpani(0.5, B) < 1 && fiyatCarpani(0.5, B) >= B.HAFTALIK_KISMA);
  assert.ok(fiyatCarpani(2.5, B) > 1 && fiyatCarpani(2.5, B) <= B.HAFTALIK_ARTIS);
  assert.equal(fiyatCarpani(0.01, B), B.HAFTALIK_KISMA, 'en çok %25 kısılır');
  assert.equal(fiyatCarpani(50, B), B.HAFTALIK_ARTIS, 'en çok %25 açılır');
  assert.equal(fiyatCarpani(NaN, B), 1);
  assert.equal(yeniHavuzCarpani(U.QPP_MAX, 5, 1, U), U.QPP_MAX, 'üst sınır');
  assert.equal(yeniHavuzCarpani(U.QPP_MIN, 0.1, 1, U), U.QPP_MIN, 'alt sınır');
  ok('fiyat bandı: düşükte arz kısılır, yüksekte açılır, haftada en çok ±%25, sınırlı');
}

// 6) Bot ASTRA girişi: normalin üstü havuzu önceden büyütür, altı küçültür; veri yoksa etkisiz
{
  assert.equal(botCarpani([], U.AYAR), 1);
  assert.equal(botCarpani([100], U.AYAR), 1);
  assert.equal(botCarpani([0, 0, 0], U.AYAR), 1, 'referans yoksa etkisiz');
  assert.equal(botCarpani([100, 100, 100, 100], U.AYAR), 1, 'düzenli giriş etkisiz');
  assert.ok(botCarpani([100, 100, 100, 200], U.AYAR) > 1);
  assert.ok(botCarpani([100, 100, 100, 30], U.AYAR) < 1);
  assert.equal(botCarpani([100, 100, 100, 1e9], U.AYAR), U.AYAR.BOT_ENCOK);
  assert.equal(botCarpani([100, 100, 100, 0], U.AYAR), 1 - U.AYAR.BOT_DUYARLILIK > U.AYAR.BOT_ENAZ ? 1 - U.AYAR.BOT_DUYARLILIK : U.AYAR.BOT_ENAZ);
  assert.ok(yeniHavuzCarpani(0.4, 1, 1.2, U) > 0.4, 'bot girişi artınca havuz büyür');
  ok('bot ASTRA girişi havuzu önceden ayarlar (sınırlı, veri yoksa etkisiz)');
}

// 7) Dünya kapasitesi ve oyuncu hakkı: dağıtım yazılınca kapasite dağıtılan toplam olur, oyuncunun haftalık hakkı pay formülünden gelir
{
  localStorage.clear(); ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
  const gs = new GameStateManager();
  const k = 'wood';
  const params = globalPool.uretimParams();
  const limit = Math.floor(globalPool.weeklyRightPerWeight(k, params) * gs.getUretimWeight().weight);
  assert.equal(gs.getUretimHakki(k).limit, limit, 'kişisel limit L');
  assert.equal(gs.getUretimHakki(k).weekly, limit, 'dağıtım yokken pay = limit');
  globalPool.setUretimPay({ [k]: { A: limit / 2, phi: 0, total: 777 } }, 1);
  assert.equal(globalPool.state.resources[k].baseCap, 777, 'kapasite = dağıtılan toplam');
  assert.equal(gs.getUretimHakki(k).weekly, Math.floor(limit / 2), 'phi 0: yalnız taban pay (A)');
  globalPool.setUretimPay({ [k]: { A: limit / 2, phi: 1, total: 777 } }, 1);
  assert.equal(gs.getUretimHakki(k).weekly, limit, 'phi 1, S >= 1: limitin tamamı');
  ok('dağıtım yazılınca dünya kapasitesi ve oyuncunun haftalık hakkı pay formülünden gelir');
}

// 8) Acil durum: fiyat açılışın 3 katını aşarsa havuz +%25, günde en çok bir kez, üst sınırı aşmaz
{
  localStorage.clear(); ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
  globalPool.recordPriceRatios({ wood: 3.4, iron: 1.0 });
  const once = globalPool.uretimParams().qpp.wood;
  const t0 = globalPool.getTrustedTime();
  const a = globalPool.uretimAcilDurum(t0);
  assert.ok(a.wood && !a.iron, 'yalnız pahalı kaynak');
  assert.equal(globalPool.uretimParams().qpp.wood, Math.round(once * U.ACIL_ARTIS * 1000) / 1000);
  assert.deepEqual(globalPool.uretimAcilDurum(t0 + 3600e3), {}, '24 saat dolmadan tekrar yok');
  assert.ok(globalPool.uretimAcilDurum(t0 + 25 * 3600e3).wood, 'ertesi gün tekrar');
  for (let i = 0; i < 20; i++) globalPool.uretimAcilDurum(t0 + (30 + i * 25) * 3600e3);
  assert.ok(globalPool.uretimParams().qpp.wood <= U.QPP_MAX, 'üst sınırı aşmaz');
  ok('acil durum: fiyat 3 katını aşınca havuz +%25 (günde bir, sınırlı)');
}

// 9) Ev etkisi: her ev ağırlığı büyütür (en çok EV_KATSAYI_MAX)
{
  localStorage.clear(); ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
  const gs = new GameStateManager();
  const w1 = gs.getUretimWeight();
  gs._village().houses = 5;
  const w5 = gs.getUretimWeight();
  assert.ok(w5.weight > w1.weight, 'daha çok ev → daha büyük ağırlık');
  assert.ok(Math.abs(w5.houseFactor - (1 + U.EV_KATSAYISI * 4)) < 1e-6);
  gs._village().houses = 50;
  assert.equal(gs.getUretimWeight().houseFactor, U.EV_KATSAYI_MAX, 'en çok +%30');
  ok('ev sayısı kişisel limiti büyütür (ev başına +%3, en çok +%30)');
}

console.log(`\n${n} üretim dağıtımı kontrolü geçti.`);
