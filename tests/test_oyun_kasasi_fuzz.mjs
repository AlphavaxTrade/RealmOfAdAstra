// Oyun Kasası sözleşmesi — DERİN testler (T1, yerel doğrulama kampanyası): uç durumlar, kötü niyetli token taklitleri ve
// tohumlu rastgele işlem dizisi. Her işlemden sonra sözleşmenin zincirdeki durumu, bağımsız yazılmış bir modelle
// karşılaştırılır (hata adı dahil). Gerçek ağa dokunmaz: yalnız ganache. Ölçek: KASA_FUZZ_OPS (varsayılan 250).
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { ethers } from 'ethers';
import { compile } from '../contracts/compile.mjs';

const OPS = Number(process.env.KASA_FUZZ_OPS) || 250;
let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const c = compile();
const chainProvider = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 8, defaultBalance: 1000 }, chain: { chainId: 43114 } });
const provider = new ethers.BrowserProvider(chainProvider, undefined, { cacheTimeout: -1 });
const S = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map(i => provider.getSigner(i)));
const [owner, dagitici, creator, player, stranger, attacker, extra1, extra2] = S;
const addr = async s => (await s.getAddress()).toLowerCase();
const DEAD = '0x000000000000000000000000000000000000dead';
const ZERO = ethers.ZeroAddress;
const ASTRA = v => ethers.parseUnits(String(v), 18);

const deploy = async (name, signer, ...args) => {
  const k = await new ethers.ContractFactory(c[name].abi, c[name].bytecode, signer).deploy(...args);
  await k.waitForDeployment();
  return k;
};
const kasaIface = new ethers.Interface(c.OyunKasasi.abi);
function errName(e) {
  if (e.revert && e.revert.name) return e.revert.name;
  const seen = new Set();
  const text = JSON.stringify(e, (k, v) => (typeof v === 'object' && v !== null ? (seen.has(v) ? undefined : (seen.add(v), v)) : typeof v === 'bigint' ? v.toString() : v));
  for (const hex of text.match(/0x[0-9a-fA-F]{8,}/g) || []) {
    try { const p = kasaIface.parseError(hex); if (p) return p.name; } catch { /* başka veri */ }
  }
  return 'BILINMEYEN:' + String(e.shortMessage || e.message).slice(0, 120);
}
async function tx(fn) {
  try { const t = await fn(); return { r: await t.wait() }; } catch (e) { return { err: errName(e) }; }
}
const cfgOf = async (d, cr, single = 200, daily = 1000) => ({ dagitici: await addr(d), creator: await addr(cr), singleDrawBps: single, dailyLimitBps: daily });

// ═══ 1) Uç durumlar ═══
{
  const token = await deploy('MockToken', owner);
  const kasa = await deploy('OyunKasasi', owner, await token.getAddress(), DEAD, await cfgOf(dagitici, creator));
  const kAddr = await kasa.getAddress();
  const gas = {};

  // bakiye 0 iken ödeme: tavan 0 → DrawTooLarge
  assert.equal((await tx(() => kasa.connect(dagitici).payPlayer(player, 1n, ethers.id('0')))).err, 'DrawTooLarge');
  ok('Bakiye 0 iken ödeme reddediliyor (tek ödeme tavanı 0)');

  // 200 milyon ölçeğinde: tavan hesabı taşmadan doğru
  await (await token.mint(await addr(player), ASTRA(300_000_000))).wait();
  await (await token.connect(player).approve(kAddr, ethers.MaxUint256)).wait();
  const dep = await (await kasa.connect(player).deposit(ASTRA(200_000_000))).wait();
  gas.deposit = dep.gasUsed;
  assert.equal(await kasa.singleDrawCap(), ASTRA(4_000_000), '200 M × %2 = 4 M');
  assert.equal(await kasa.dailyRemaining(), ASTRA(20_000_000), '200 M × %10 = 20 M');
  const e1 = await addr(extra1);
  assert.equal((await tx(() => kasa.connect(dagitici).payPlayer(e1, ASTRA(4_000_000) + 1n, ethers.id('1')))).err, 'DrawTooLarge');
  const r1 = await tx(() => kasa.connect(dagitici).payPlayer(e1, ASTRA(4_000_000), ethers.id('2')));
  assert.ok(r1.r); gas.payPlayer = r1.r.gasUsed;
  assert.equal(await token.balanceOf(e1), ASTRA(4_000_000));
  gas.burn = (await (await kasa.connect(dagitici).burn(ASTRA(100), ethers.id('3'))).wait()).gasUsed;
  gas.payCreator = (await (await kasa.connect(dagitici).payCreator(ASTRA(100), ethers.id('4'))).wait()).gasUsed;
  ok(`200 M ölçeğinde tavanlar tam (4 M tek ödeme, 20 M günlük), ödeme çalışıyor — gaz: yatırma ${gas.deposit}, oyuncu ${gas.payPlayer}, yakım ${gas.burn}, yapımcı ${gas.payCreator}`);

  // deposit() kullanılmadan doğrudan token gönderimi: bakiyeye ve tavan hesabına girer
  const before = await token.balanceOf(kAddr);
  await (await token.connect(player).transfer(kAddr, ASTRA(1_000_000))).wait();
  assert.equal((await token.balanceOf(kAddr)) - before, ASTRA(1_000_000));
  assert.equal(await kasa.singleDrawCap(), (await token.balanceOf(kAddr)) * 200n / 10000n, 'Doğrudan gelen token da tavan hesabında');
  ok('deposit() kullanılmadan doğrudan gönderilen token da kasaya girer ve geri alınamaz (çıkış yok)');

  // durmuşken sahiplik devri çalışır; yeni sahip devam ettirir
  await (await kasa.setPaused(true)).wait();
  await (await kasa.transferOwnership(await addr(stranger))).wait();
  await (await kasa.connect(stranger).acceptOwnership()).wait();
  assert.equal((await tx(() => kasa.connect(owner).setPaused(false))).err, 'NotOwner');
  await (await kasa.connect(stranger).setPaused(false)).wait();
  assert.equal(await kasa.paused(), false);
  ok('Durmuşken sahiplik devredilebiliyor; eski sahip yetkisini kaybediyor, yeni sahip devam ettirebiliyor');
}

// ═══ 2) Kötü niyetli / uyumsuz token taklitleri ═══
{
  // transfer() false döndürür → TokenTransferFailed, durum DEĞİŞMEZ
  const ft = await deploy('FalseToken', owner);
  const k = await deploy('OyunKasasi', owner, await ft.getAddress(), DEAD, await cfgOf(dagitici, creator));
  await (await ft.mint(await addr(player), ASTRA(1000))).wait();
  await (await ft.connect(player).approve(await k.getAddress(), ethers.MaxUint256)).wait();
  await (await k.connect(player).deposit(ASTRA(1000))).wait();
  const remBefore = await k.dailyRemaining();
  assert.equal((await tx(() => k.connect(dagitici).payPlayer(player, ASTRA(1), ethers.id('x')))).err, 'TokenTransferFailed');
  assert.equal(await k.dailyRemaining(), remBefore, 'Başarısız gönderim günlük sayaçta iz bırakmadı');
  assert.equal(await ft.balanceOf(await k.getAddress()), ASTRA(1000));
  ok('transfer() false döndüren token: ödeme reddedilir, kasa ve sayaç değişmez');

  // geri değer vermeyen (USDT tarzı) token başarılı sayılır
  const nt = await deploy('NoReturnToken', owner);
  const k2 = await deploy('OyunKasasi', owner, await nt.getAddress(), DEAD, await cfgOf(dagitici, creator));
  await (await nt.mint(await addr(player), ASTRA(1000))).wait();
  await (await nt.connect(player).approve(await k2.getAddress(), ethers.MaxUint256)).wait();
  await (await k2.connect(player).deposit(ASTRA(1000))).wait();
  await (await k2.connect(dagitici).payPlayer(await addr(extra1), ASTRA(10), ethers.id('y'))).wait();
  assert.equal(await nt.balanceOf(await addr(extra1)), ASTRA(10));
  ok('Geri değer vermeyen (USDT tarzı) token ile ödeme başarılı');

  // yeniden giriş: token, transfer sırasında kasaya geri girmeye çalışır → kilit reddeder, asıl ödeme yine de tamam
  const rt = await deploy('ReentrantToken', owner);
  const k3 = await deploy('OyunKasasi', owner, await rt.getAddress(), DEAD, await cfgOf(dagitici, creator));
  await (await rt.mint(await addr(player), ASTRA(1000))).wait();
  await (await rt.connect(player).approve(await k3.getAddress(), ethers.MaxUint256)).wait();
  await (await k3.connect(player).deposit(ASTRA(1000))).wait();
  await (await rt.setVault(await k3.getAddress())).wait();
  const balBefore = await rt.balanceOf(await k3.getAddress());
  await (await k3.connect(dagitici).payPlayer(await addr(extra1), ASTRA(10), ethers.id('z'))).wait();
  assert.equal(await rt.reentryAttempted(), true, 'Token gerçekten geri girmeyi denedi');
  assert.equal(await rt.reentryOk(), false, 'Yeniden giriş reddedildi');
  assert.equal(await rt.reentryRet(), ethers.id('Reentrancy()').slice(0, 10), 'Reddetme nedeni Reentrancy()');
  assert.equal(balBefore - (await rt.balanceOf(await k3.getAddress())), ASTRA(10), 'Kasa yalnız bir kez ödedi');
  ok('Yeniden giriş denemesi (transfer sırasında deposit) kilitle reddediliyor; kasa yalnız bir kez ödüyor');
}

// ═══ 3) Tohumlu rastgele işlem dizisi + bağımsız model ═══
{
  const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const R = rng(20261008);
  const pick = a => a[Math.floor(R() * a.length)];
  const rnd = n => { let x = 0n; for (let i = 0; i < n.toString(2).length / 30 + 2; i++) x = (x << 30n) | BigInt(Math.floor(R() * 2 ** 30)); return x % n; };
  const between = (lo, hi) => lo + rnd(hi - lo + 1n);

  const token = await deploy('MockToken', owner);
  const initial = await cfgOf(dagitici, creator);
  const kasa = await deploy('OyunKasasi', owner, await token.getAddress(), DEAD, initial);
  const kAddr = (await kasa.getAddress()).toLowerCase();
  const A = Object.fromEntries(await Promise.all(Object.entries({ owner, dagitici, creator, player, stranger, attacker, extra1, extra2 }).map(async ([k, s]) => [k, await addr(s)])));
  const signerOf = Object.fromEntries(Object.entries({ owner, dagitici, creator, player, stranger, attacker, extra1, extra2 }).map(([k, s]) => [A[k], s]));
  const tracked = [...Object.values(A), DEAD, kAddr];
  const B = new Map(tracked.map(a => [a, 0n]));       // modelin beklediği token bakiyeleri
  let supply = 0n;
  const mint = async (a, v) => { await (await token.mint(a, v)).wait(); B.set(a, (B.get(a) || 0n) + v); supply += v; };
  for (const a of [A.player, A.stranger, A.extra1]) { await mint(a, ASTRA(5_000_000)); await (await token.connect(signerOf[a]).approve(kAddr, ethers.MaxUint256)).wait(); }

  const M = { bal: 0n, ws: 0n, spent: 0n, paused: false, cfg: { ...initial }, pend: null, effAt: 0n, owner: A.owner, pendingOwner: ZERO };
  const stat = { ok: {}, rej: {} };
  const count = (map, k) => { map[k] = (map[k] || 0) + 1; };

  // İlk para
  assert.ok((await tx(() => kasa.connect(player).deposit(ASTRA(1_000_000)))).r);
  M.bal += ASTRA(1_000_000); B.set(A.player, B.get(A.player) - ASTRA(1_000_000)); B.set(kAddr, M.bal);

  // Zaman sınırlarına (24 saatlik pencere sonu, ayar öneri zamanı) yakın işlem yapmamak için: sınıra 20 sn kala 45 sn atla
  async function stable() {
    for (;;) {
      await provider.send('evm_mine', []);
      const T = BigInt((await provider.getBlock('latest')).timestamp);
      const near = x => x !== 0n && T - x < 20n && x - T < 20n;
      if (near(M.ws + 86400n) || near(M.effAt)) { await provider.send('evm_increaseTime', [45]); continue; }
      return T;
    }
  }
  const active = T => (M.effAt !== 0n && T >= M.effAt ? M.pend : M.cfg);
  const settle = T => { if (M.effAt !== 0n && T >= M.effAt) { M.cfg = M.pend; M.effAt = 0n; } };

  async function payoutOp(kind, T) {
    const act = active(T);
    const callerKey = R() < 0.7 ? 'aktif-dagitici' : pick(['stranger', 'owner', 'attacker', 'creator']);
    const callerAddr = callerKey === 'aktif-dagitici' ? act.dagitici : A[callerKey];
    let to = kind === 'payPlayer' ? pick([A.player, A.extra1, A.extra2, A.stranger, A.creator, A.owner, ZERO]) : kind === 'burn' ? DEAD : act.creator;
    if (kind === 'payPlayer' && to === ZERO && R() < 0.6) to = A.player;
    let ws = M.ws, spent = M.spent, reset = false;
    if (T >= ws + 86400n) { ws = T; spent = 0n; reset = true; }
    const singleCap = M.bal * BigInt(act.singleDrawBps) / 10000n;
    const dailyCap = M.bal * BigInt(act.dailyLimitBps) / 10000n;
    const remaining = dailyCap > spent ? dailyCap - spent : 0n;
    const mn = singleCap < remaining ? singleCap : remaining;
    const choices = [0n, 1n, singleCap, singleCap + 1n, remaining, remaining + 1n, mn, mn, mn, 10n ** 30n];
    if (singleCap > 1n) choices.push(between(1n, singleCap), between(1n, singleCap));
    const amount = pick(choices);

    let want = null;
    if (M.paused) want = 'IsPaused';
    else if (callerAddr !== act.dagitici) want = 'NotDagitici';
    else if (kind === 'payPlayer' && to === ZERO) want = 'ZeroAddress';
    else if (amount === 0n) want = 'ZeroAmount';
    else if (amount > singleCap) want = 'DrawTooLarge';
    else if (amount > remaining) want = 'DailyLimitExceeded';

    const ref = ethers.id('r' + stat.n);
    const c2 = kasa.connect(signerOf[callerAddr]);
    const res = await tx(() => (kind === 'payPlayer' ? c2.payPlayer(to, amount, ref) : kind === 'burn' ? c2.burn(amount, ref) : c2.payCreator(amount, ref)));
    if (want) {
      assert.equal(res.err, want, `${kind} beklenen red ${want}, gelen ${res.err || 'BAŞARILI'} (çağıran ${callerKey}, miktar ${amount}, tavan ${singleCap}/${remaining})`);
      count(stat.rej, want);
    } else {
      assert.ok(res.r, `${kind} başarılı olmalıydı, hata: ${res.err} (miktar ${amount}, tavan ${singleCap}/${remaining})`);
      settle(T);
      const ts = BigInt((await provider.getBlock(res.r.blockNumber)).timestamp);
      if (reset) { M.ws = ts; M.spent = amount; } else M.spent += amount;
      M.bal -= amount; B.set(kAddr, M.bal); B.set(to, (B.get(to) || 0n) + amount);
      count(stat.ok, kind);
    }
  }

  async function step(i) {
    stat.n = i;
    if (M.paused && R() < 0.12) {
      assert.ok((await tx(() => kasa.connect(signerOf[M.owner]).setPaused(false))).r); M.paused = false; return;
    }
    if (M.paused && R() < 0.5) { const T0 = await stable(); return payoutOp(pick(['payPlayer', 'burn', 'payCreator']), T0); }
    const x = R();
    if (x < 0.46) { const T = await stable(); return payoutOp(pick(['payPlayer', 'payPlayer', 'burn', 'payCreator']), T); }
    if (x < 0.58) {
      const who = pick([A.player, A.stranger, A.extra1]);
      const amt = between(1n, ASTRA(400_000));
      if (B.get(who) < amt) await mint(who, ASTRA(2_000_000));
      const r = await tx(() => kasa.connect(signerOf[who]).deposit(amt));
      assert.ok(r.r, 'yatırma: ' + r.err);
      M.bal += amt; B.set(who, B.get(who) - amt); B.set(kAddr, M.bal); return count(stat.ok, 'deposit');
    }
    if (x < 0.62) {
      const amt = between(1n, ASTRA(50_000));
      if (B.get(A.player) < amt) await mint(A.player, ASTRA(2_000_000));
      await (await token.connect(player).transfer(kAddr, amt)).wait();
      M.bal += amt; B.set(A.player, B.get(A.player) - amt); B.set(kAddr, M.bal); return count(stat.ok, 'dogrudan');
    }
    if (x < 0.72) { const j = pick([0, 600, 5400, 43500, 90000, 200000]); await provider.send('evm_increaseTime', [j]); return count(stat.ok, 'zaman'); }
    if (x < 0.80) {
      const T = await stable();
      const bad = R() < 0.35;
      let cfg = { dagitici: pick([A.dagitici, A.dagitici, A.attacker, A.extra1, A.owner]), creator: pick([A.creator, A.creator, A.extra2]), singleDrawBps: Number(between(1n, 1000n)), dailyLimitBps: Number(between(1n, 3000n)) };
      if (bad) { const k = pick(['d0', 'c0', 's0', 's1', 'y0', 'y1']); if (k === 'd0') cfg.dagitici = ZERO; if (k === 'c0') cfg.creator = ZERO; if (k === 's0') cfg.singleDrawBps = 0; if (k === 's1') cfg.singleDrawBps = 1001; if (k === 'y0') cfg.dailyLimitBps = 0; if (k === 'y1') cfg.dailyLimitBps = 3001; }
      const callerKey = R() < 0.8 ? 'owner' : pick(['stranger', 'attacker', 'dagitici']);
      const caller = callerKey === 'owner' ? M.owner : A[callerKey];
      const wantErr = caller !== M.owner ? 'NotOwner' : (cfg.dagitici === ZERO || cfg.creator === ZERO) ? 'ZeroAddress' : (cfg.singleDrawBps === 0 || cfg.singleDrawBps > 1000 || cfg.dailyLimitBps === 0 || cfg.dailyLimitBps > 3000) ? 'LimitTooHigh' : null;
      const res = await tx(() => kasa.connect(signerOf[caller]).proposeConfig(cfg));
      if (wantErr) { assert.equal(res.err, wantErr, 'öneri: beklenen ' + wantErr + ' gelen ' + (res.err || 'BAŞARILI')); return count(stat.rej, wantErr); }
      assert.ok(res.r, 'öneri başarılı olmalıydı: ' + res.err);
      settle(T);
      M.pend = cfg; M.effAt = await kasa.effectiveAt();
      const ts = BigInt((await provider.getBlock(res.r.blockNumber)).timestamp);
      assert.ok(M.effAt >= ts + 86400n && M.effAt <= ts + 86400n + 5n, 'Öneri tam 24 saat sonraya yazıldı');
      return count(stat.ok, 'propose');
    }
    if (x < 0.84) {
      const T = await stable();
      const caller = R() < 0.7 ? M.owner : A.stranger;
      const wantErr = caller !== M.owner ? 'NotOwner' : (M.effAt === 0n || T >= M.effAt) ? 'NothingPending' : null;
      const res = await tx(() => kasa.connect(signerOf[caller]).cancelConfig());
      if (wantErr) { assert.equal(res.err, wantErr, 'geri çekme: beklenen ' + wantErr + ' gelen ' + (res.err || 'BAŞARILI')); return count(stat.rej, wantErr); }
      assert.ok(res.r); M.effAt = 0n; return count(stat.ok, 'cancel');
    }
    if (x < 0.88) {
      const T = await stable();
      const wantErr = M.effAt === 0n ? 'NothingPending' : T < M.effAt ? 'NotYet' : null;
      const res = await tx(() => kasa.connect(signerOf[pick([A.stranger, A.attacker])]).finalizeConfig());
      if (wantErr) { assert.equal(res.err, wantErr, 'finalize: beklenen ' + wantErr + ' gelen ' + (res.err || 'BAŞARILI')); return count(stat.rej, wantErr); }
      assert.ok(res.r); M.cfg = M.pend; M.effAt = 0n; return count(stat.ok, 'finalize');
    }
    if (x < 0.93) {
      const v = R() < 0.5;
      if (R() < 0.8) { assert.ok((await tx(() => kasa.connect(signerOf[M.owner]).setPaused(v))).r); M.paused = v; return count(stat.ok, 'pause'); }
      assert.equal((await tx(() => kasa.connect(stranger).setPaused(v))).err, 'NotOwner'); return count(stat.rej, 'NotOwner');
    }
    if (x < 0.97) {
      if (M.pendingOwner === ZERO) {
        const np = pick([A.stranger, A.extra2, A.attacker]);
        assert.ok((await tx(() => kasa.connect(signerOf[M.owner]).transferOwnership(np))).r); M.pendingOwner = np; return count(stat.ok, 'devir-onerisi');
      }
      if (R() < 0.5) { assert.equal((await tx(() => kasa.connect(signerOf[A.player]).acceptOwnership())).err, 'NotOwner'); return count(stat.rej, 'NotOwner'); }
      assert.ok((await tx(() => kasa.connect(signerOf[M.pendingOwner]).acceptOwnership())).r); M.owner = M.pendingOwner; M.pendingOwner = ZERO; return count(stat.ok, 'devir');
    }
    // ödeme işlemi (durmuşken özellikle)
    const T = await stable(); return payoutOp('payPlayer', T);
  }

  async function checkState(full) {
    assert.equal(await token.balanceOf(kAddr), M.bal, 'kasa bakiyesi model ile aynı');
    assert.equal(await kasa.paused(), M.paused);
    assert.equal((await kasa.owner()).toLowerCase(), M.owner);
    assert.equal(await kasa.effectiveAt(), M.effAt, 'bekleyen ayar zamanı');
    const cur = await kasa.current();
    assert.deepEqual([cur.dagitici.toLowerCase(), cur.creator.toLowerCase(), Number(cur.singleDrawBps), Number(cur.dailyLimitBps)], [M.cfg.dagitici, M.cfg.creator, M.cfg.singleDrawBps, M.cfg.dailyLimitBps], 'kayıtlı ayar model ile aynı');
    if (full) {
      let sum = 0n;
      for (const a of tracked) { const v = await token.balanceOf(a); assert.equal(v, B.get(a) || 0n, 'bakiye ' + a); sum += v; }
      assert.equal(sum, supply, 'Toplam token korunuyor: izlenmeyen bir adrese sızıntı yok');
    }
  }

  for (let i = 1; i <= OPS; i++) { await step(i); await checkState(i % 25 === 0); }
  await checkState(true);
  console.log('   işlem özeti — başarılı:', JSON.stringify(stat.ok), ' reddedilen:', JSON.stringify(stat.rej));
  for (const k of ['payPlayer', 'burn', 'payCreator', 'deposit']) assert.ok((stat.ok[k] || 0) >= 5, `${k} yeterince başarılı denenmedi (${stat.ok[k] || 0})`);
  for (const k of ['IsPaused', 'NotDagitici', 'DrawTooLarge', 'DailyLimitExceeded', 'ZeroAmount']) assert.ok((stat.rej[k] || 0) >= 1, `${k} reddi hiç denenmedi`);
  ok(`${OPS} rastgele işlem: her adımda sözleşme durumu, hata adları ve token toplamı bağımsız modelle birebir aynı (kasadan çıkan her token yalnız izinli alıcıya gitti)`);
}

console.log(`\n${passed} derin sözleşme kontrolü geçti.`);
process.exit(0);
