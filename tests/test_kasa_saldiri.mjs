// Oyun Kasası saldırı simülasyonu (T4, yerel doğrulama kampanyası) — 200 milyon ASTRA'lık kasaya karşı, sayılı sonuçlarla.
// Senaryo A: dağıtıcı anahtarı (sunucudaki oyun cüzdanı) çalındı. Senaryo B: sahip anahtarı çalındı.
// Sonuçlar konsola yazılır (rapor için) ve üst sınırlar test olarak korunur.
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { ethers } from 'ethers';
import { compile } from '../contracts/compile.mjs';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const ASTRA = v => ethers.parseUnits(String(v), 18);
const M = v => (Number(ethers.formatUnits(v, 18)) / 1e6).toFixed(2) + ' M';
const c = compile();
const chainProvider = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 6, defaultBalance: 1000 }, chain: { chainId: 43114 } });
const provider = new ethers.BrowserProvider(chainProvider, undefined, { cacheTimeout: -1 });
const [owner, dagitici, creator, attacker, ownerThief] = await Promise.all([0, 1, 2, 3, 4].map(i => provider.getSigner(i)));
const addr = async s => (await s.getAddress()).toLowerCase();
const kasaIface = new ethers.Interface(c.OyunKasasi.abi);
const errName = e => {
  if (e.revert && e.revert.name) return e.revert.name;
  const seen = new Set();
  const text = JSON.stringify(e, (k, v) => (typeof v === 'object' && v !== null ? (seen.has(v) ? undefined : (seen.add(v), v)) : typeof v === 'bigint' ? v.toString() : v));
  for (const hex of text.match(/0x[0-9a-fA-F]{8,}/g) || []) { try { const p = kasaIface.parseError(hex); if (p) return p.name; } catch { /* başka veri */ } }
  return 'BILINMEYEN';
};
const tx = async fn => { try { await (await fn()).wait(); return null; } catch (e) { return errName(e); } };
const DEAD = '0x000000000000000000000000000000000000dEaD';
const mine = async s => { await provider.send('evm_increaseTime', [s]); await provider.send('evm_mine', []); };

async function yeniKasa() {
  const dep = async (n, ...a) => { const k = await new ethers.ContractFactory(c[n].abi, c[n].bytecode, owner).deploy(...a); await k.waitForDeployment(); return k; };
  const token = await dep('MockToken');
  const kasa = await dep('OyunKasasi', await token.getAddress(), DEAD, { dagitici: await addr(dagitici), creator: await addr(creator), singleDrawBps: 200, dailyLimitBps: 500 });   // kullanıcı kararı (11 Ekim 2026): günlük sınır %5
  await (await token.mint(await addr(owner), ASTRA(200_000_000))).wait();
  await (await token.approve(await kasa.getAddress(), ethers.MaxUint256)).wait();
  await (await kasa.deposit(ASTRA(200_000_000))).wait();
  return { token, kasa };
}

// Saldırgan elindeki dağıtıcı anahtarıyla en çok parayı en hızlı nasıl çeker: her çağrıda min(tek ödeme tavanı, günlük kalan)
async function sombur(kasa, signer, hedef) {
  let calls = 0;
  for (; calls < 200; calls++) {
    const cap = await kasa.singleDrawCap(), rem = await kasa.dailyRemaining();
    const amt = cap < rem ? cap : rem;
    if (amt < ASTRA(1)) break;
    const err = await tx(() => kasa.connect(signer).payPlayer(hedef, amt, ethers.id('hirsiz' + calls)));
    if (err) return { calls, err };
  }
  return { calls };
}

// ── Senaryo A: dağıtıcı anahtarı çalındı ──
{
  const { token, kasa } = await yeniKasa();
  const T0 = 200_000_000n * 10n ** 18n;
  const hedef = await addr(attacker);
  const gun1 = await sombur(kasa, dagitici, hedef);
  const kaybolan1 = await token.balanceOf(hedef);
  console.log(`   A — saldırgan 1. gün (${gun1.calls} işlemde): ${M(kaybolan1)} aldı = %${(Number(kaybolan1 * 10000n / T0) / 100).toFixed(2)} (kasa 200 M)`);
  // Üst sınır: günlük pay d=%5, tek ödeme payı s=%2 → en çok d/(1+d−s) = 0,05/1,03 = %4,854 (sınırlar her çağrıda o anki bakiyeden hesaplanır)
  assert.ok(kaybolan1 <= T0 * 5n / 103n + ASTRA(1), 'İlk 24 saatte kasanın en fazla %4,85\'i gidebilir');
  assert.ok(kaybolan1 >= T0 * 45n / 1000n, 'Saldırgan sınırı gerçekten doldurdu (test anlamlı)');
  assert.equal(await tx(() => kasa.connect(dagitici).payPlayer(hedef, ASTRA(1), ethers.id('x'))), 'DailyLimitExceeded', 'Aynı gün ikinci tur reddedildi');
  // Sahip fark edip DURDURUR: saldırganın sonraki günleri 0
  await mine(24 * 3600 + 60);
  await (await kasa.connect(owner).setPaused(true)).wait();
  assert.equal(await tx(() => kasa.connect(dagitici).payPlayer(hedef, ASTRA(1), ethers.id('y'))), 'IsPaused');
  assert.equal(await token.balanceOf(hedef), kaybolan1, 'Durdurduktan sonra saldırgan hiçbir şey alamadı');
  ok(`Senaryo A (dağıtıcı anahtarı çalındı): saldırgan ilk 24 saatte en çok ${M(kaybolan1)} (≈%4,9) alabildi; sahip durdurunca sıfır — kendine para çekme yolu yok, hız sınırlı`);

  // Fark edilmezse günler içinde ne olur (paused kapalı kasa): kaç günde yarısı gider
  const { token: t2, kasa: k2 } = await yeniKasa();
  let toplam = 0n, gun = 0;
  while (toplam * 2n < T0 && gun < 30) {
    await mine(25 * 3600 + 60); gun++;   // kayan pencere: saatlik 25 kova (en çok 25 saat)
    await sombur(k2, dagitici, hedef);
    toplam = await t2.balanceOf(hedef);
  }
  console.log(`   A — fark edilmezse: kasanın yarısı ${gun}. günde gider (toplam ${M(toplam)}); 7. günde tahmini kayıp %${(100 * (1 - (1 - 0.05 / 1.03) ** 7)).toFixed(0)}`);
  assert.ok(gun >= 7, 'Fark edilmeyen saldırıda bile kasanın yarısı en az 7 günde gider');
  ok(`Senaryo A (fark edilmezse): kasanın yarısı ${gun}. günde — fark etme ve durdurma süresi (gün cinsinden) güvenlik payıdır`);
}

// ── Senaryo A2: pencere SINIRINDA çifte çekim denemesi (denetim K1, 13 Ekim 2026) ──
// Eski sabit pencere: 23s58dk'da sınırı doldur, 24s01dk'da yeniden doldur → fiilen ~%9,7. Kayan pencerede HERHANGİ bir 24 saatlik
// aralıkta toplam, günlük sınırı (kasanın %5'i) aşamaz. Saldırgan her fırsatta sınırı dolduruyor; olaylardan pencere toplamı ölçülür.
{
  const { token, kasa } = await yeniKasa();
  const T0 = 200_000_000n * 10n ** 18n;
  const hedef = await addr(attacker);
  for (const bekle of [0, 3600, 6 * 3600, 12 * 3600, 23 * 3600 + 3500, 130, 25 * 3600, 600, 24 * 3600 + 120]) {
    if (bekle) await mine(bekle);
    await sombur(kasa, dagitici, hedef);
  }
  const olaylar = await kasa.queryFilter(kasa.filters.PlayerPaid());
  const kayit = [];
  for (const o of olaylar) kayit.push({ t: (await provider.getBlock(o.blockNumber)).timestamp, a: o.args.amount });
  assert.ok(kayit.length >= 6, 'saldırgan birden çok pencerede ödeme yaptı: ' + kayit.length);
  let enKotu = 0n;
  for (const x of kayit) {
    const toplam = kayit.filter(y => y.t >= x.t && y.t < x.t + 24 * 3600).reduce((s, y) => s + y.a, 0n);
    if (toplam > enKotu) enKotu = toplam;
  }
  const yuzde = (Number(enKotu * 10000n / T0) / 100).toFixed(2);
  console.log('   A2 — herhangi bir 24 saatlik aralıkta en çok ' + M(enKotu) + ' (%' + yuzde + '); toplam ' + M(await token.balanceOf(hedef)) + ', ' + kayit.length + ' ödeme');
  assert.ok(enKotu <= T0 * 5n / 100n, 'Herhangi bir 24 saatte kasanın en çok %5 i: ' + M(enKotu));
  ok('Senaryo A2 (pencere sınırında çifte çekim): herhangi bir 24 saatlik aralıkta en çok ' + M(enKotu) + ' (%' + yuzde + ' ≤ %5)');
}

// ── Senaryo B: SAHİP anahtarı çalındı ──
{
  const { token, kasa } = await yeniKasa();
  const hirsiz = await addr(ownerThief);
  await (await kasa.connect(owner).proposeConfig({ dagitici: hirsiz, creator: hirsiz, singleDrawBps: 1000, dailyLimitBps: 3000 })).wait();   // saldırgan en gevşek ayarı ve kendini yazar
  // 24 saat dolmadan hiçbir şey alamaz
  assert.equal(await tx(() => kasa.connect(ownerThief).payPlayer(hirsiz, ASTRA(1), ethers.id('b1'))), 'NotDagitici');
  await mine(23 * 3600);
  assert.equal(await tx(() => kasa.connect(ownerThief).payCreator(ASTRA(1), ethers.id('b2'))), 'NotDagitici', '23 saatte hâlâ yetkisiz');
  // Gerçek sahip (başka bir anahtarla/cihazla) durdurur — burada aynı anahtar (çalınan sahip anahtarı) varsayımı: ilk fırsatta durdurma
  await (await kasa.connect(owner).setPaused(true)).wait();
  await mine(2 * 3600);                    // ayar artık geçerli (25 saat)
  assert.equal((await kasa.activeConfig()).dagitici.toLowerCase(), hirsiz, 'Saldırganın ayarı geçerli oldu');
  assert.equal(await tx(() => kasa.connect(ownerThief).payPlayer(hirsiz, ASTRA(1), ethers.id('b3'))), 'IsPaused');
  assert.equal(await token.balanceOf(hirsiz), 0n);
  // Durdurma yoksa: en gevşek ayarlar (tek %10, günlük %30) bile kasayı bir günde bitiremez
  await (await kasa.connect(owner).setPaused(false)).wait();
  await sombur(kasa, ownerThief, hirsiz);
  const alinan = await token.balanceOf(hirsiz);
  const T0 = 200_000_000n * 10n ** 18n;
  console.log(`   B — sahip anahtarı çalındı, durdurulmazsa en gevşek ayarlarla ilk gün: ${M(alinan)} (%${(Number(alinan * 10000n / T0) / 100).toFixed(1)}), 24 saat bekleme sonrası`);
  assert.ok(alinan <= T0 / 4n + ASTRA(1), 'Mutlak tavanlarla (tek %10, günlük %30) bile ilk gün kasanın dörtte birini (0,3/1,2) geçemez');
  ok('Senaryo B (sahip anahtarı çalındı): 24 saat bekleme dolmadan hiçbir şey alınamadı; bu sürede durdurma çalıştı (sıfır kayıp); durdurulmasa bile en gevşek ayarla ilk gün sınırlı');
}

console.log(`\n${passed} kasa saldırı simülasyonu geçti.`);
process.exit(0);
