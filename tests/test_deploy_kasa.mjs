// OyunKasasi dağıtım betiği (contracts/deploy-kasa.mjs) — 13 Ekim 2026 denetimi: "OyunKasasi için dağıtım betiği yok".
// Betik gerçek bir süreç olarak çalıştırılır, sahte zincirde (ganache) denenir; hiçbir gerçek ağa/anahtara dokunulmaz.
//   • kararlaştırılan sınırlardan (günlük %5, tek ödeme %2) gevşek değer reddedilir
//   • DRY_RUN=1 hiçbir işlem göndermez
//   • gerçek gönderim: yükleme + bekçi ataması + iki adımlı sahiplik devri; zincirdeki ayarlar doğrulanır
//   • sunucunun checkVault denetimi (K3) betiğin kurduğu kasayı kabul eder
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ganache from 'ganache';
import { ethers } from 'ethers';
import { compile } from '../contracts/compile.mjs';
import { createChain } from '../server/chain.js';
import { loadConfig } from '../server/config.js';
import { kasaAyarlariniDogrula, KARAR_GUNLUK_BPS, KARAR_TEK_BPS } from '../contracts/deploy-kasa.mjs';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const adres = () => ethers.Wallet.createRandom().address;
const ASTRA = v => ethers.parseUnits(String(v), 18);

// ── 1) Saf doğrulama ──
{
  const [tokenA, dagitici, creator, owner, guardian] = [adres(), adres(), adres(), adres(), adres()];
  const taban = { TOKEN_ADDRESS: tokenA, DISPATCHER_ADDRESS: dagitici, CREATOR_ADDRESS: creator, OWNER_ADDRESS: owner };
  const iyi = kasaAyarlariniDogrula(taban);
  assert.deepEqual(iyi.hatalar, []);
  assert.equal(iyi.ayar.dailyLimitBps, 500, 'varsayılan günlük %5');
  assert.equal(iyi.ayar.singleDrawBps, 200, 'varsayılan tek ödeme %2');
  assert.equal(KARAR_GUNLUK_BPS, 500); assert.equal(KARAR_TEK_BPS, 200);
  assert.match(iyi.ayar.dead, /dEaD$/, 'varsayılan yakım adresi');
  const hata = (ek, desen) => { const r = kasaAyarlariniDogrula({ ...taban, ...ek }); assert.ok(r.hatalar.some(h => desen.test(h)), JSON.stringify(ek) + ' → ' + JSON.stringify(r.hatalar)); };
  hata({ DAILY_LIMIT_BPS: '501' }, /DAILY_LIMIT_BPS.*GEVŞEK/);
  hata({ SINGLE_DRAW_BPS: '201' }, /SINGLE_DRAW_BPS.*GEVŞEK/);
  hata({ DAILY_LIMIT_BPS: '3000' }, /GEVŞEK/);                  // sözleşmenin kendi tavanı bile kararlaştırılandan gevşek
  hata({ DAILY_LIMIT_BPS: '0' }, /tam sayı/);
  hata({ DAILY_LIMIT_BPS: '4.5' }, /tam sayı/);
  hata({ DAILY_LIMIT_BPS: 'abc' }, /tam sayı/);
  hata({ DAILY_LIMIT_BPS: '100', SINGLE_DRAW_BPS: '200' }, /günlük sınırdan \(100\) büyük olamaz/);
  hata({ OWNER_ADDRESS: dagitici }, /OWNER_ADDRESS.*dağıtıcıyla/);
  hata({ GUARDIAN_ADDRESS: dagitici }, /GUARDIAN_ADDRESS.*dağıtıcıyla/);
  hata({ GUARDIAN_ADDRESS: owner }, /GUARDIAN_ADDRESS.*sahiple/);
  hata({ TOKEN_ADDRESS: 'adres-degil' }, /TOKEN_ADDRESS.*geçerli/);
  hata({ DISPATCHER_ADDRESS: '' }, /DISPATCHER_ADDRESS gerekli/);
  hata({ CREATOR_ADDRESS: '0x' + '0'.repeat(40) }, /sıfır adres/);
  assert.deepEqual(kasaAyarlariniDogrula({ ...taban, DAILY_LIMIT_BPS: '300', SINGLE_DRAW_BPS: '100', GUARDIAN_ADDRESS: guardian }).hatalar, [], 'daha SIKI değerler kabul');
  ok('Doğrulama: kararlaştırılan (500/200) sınırlardan gevşek değer, rol çakışması, kötü adres reddedilir; sıkı değer kabul');
}

// ── Sahte zincirler: Fuji kimliği (43113) ve gerçek ağ kimliği (43114) ──
const anahtar = () => ethers.Wallet.createRandom().privateKey;
const K = { deployer: anahtar(), owner: anahtar(), dagitici: anahtar(), creator: anahtar(), guardian: anahtar(), oyuncu: anahtar() };
const hesaplar = Object.values(K).map(k => ({ secretKey: k, balance: '0x' + (10n ** 21n).toString(16) }));
const portlar = [24000 + Math.floor(Math.random() * 1000), 25000 + Math.floor(Math.random() * 1000)];
const dugumler = [43113, 43114].map((chainId) => ganache.server({ logging: { quiet: true }, wallet: { accounts: hesaplar }, chain: { chainId } }));
await dugumler[0].listen(portlar[0]);
await dugumler[1].listen(portlar[1]);
const cikis = fs.mkdtempSync(path.join(os.tmpdir(), 'kasa-dagitim-'));
try {
  const rpc = i => `http://127.0.0.1:${portlar[i]}`;
  const provider = new ethers.JsonRpcProvider(rpc(0), 43113, { staticNetwork: true, cacheTimeout: -1 });
  const c = compile();
  const sig = k => new ethers.NonceManager(new ethers.Wallet(k, provider));
  const deployer = sig(K.deployer);
  const tokenK = await new ethers.ContractFactory(c.MockToken.abi, c.MockToken.bytecode, deployer).deploy();
  await tokenK.waitForDeployment();
  const tokenAddr = await tokenK.getAddress();
  const A = k => new ethers.Wallet(k).address;
  const ortakEnv = (i, ek = {}) => ({ ...process.env, DEPLOY_RPC: rpc(i), TOKEN_ADDRESS: tokenAddr, DISPATCHER_ADDRESS: A(K.dagitici), CREATOR_ADDRESS: A(K.creator),
    OWNER_ADDRESS: A(K.owner), DEPLOY_OUT_DIR: cikis, DRY_RUN: '', CONFIRM_MAINNET: '', GUARDIAN_ADDRESS: '', DEPLOYER_PRIVATE_KEY: '', DEAD_ADDRESS: '',
    DAILY_LIMIT_BPS: '', SINGLE_DRAW_BPS: '', DEPLOY_MOCK_TOKEN: '', ...ek });
  // Asenkron süreç: ganache bu süreçte çalışıyor; spawnSync olay döngüsünü bloklayıp düğümü kilitlerdi
  const calistir = (env) => new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(kok, 'contracts/deploy-kasa.mjs')], { env, cwd: kok, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => { stdout += d; }); p.stderr.on('data', d => { stderr += d; });
    const zaman = setTimeout(() => p.kill(), 180000);
    p.on('close', status => { clearTimeout(zaman); resolve({ status, stdout, stderr }); });
  });
  const durum = async (p = provider) => ({ blok: await p.getBlockNumber(), nonce: await p.getTransactionCount(A(K.deployer)) });

  // ── 2) DRY_RUN: hiçbir işlem gönderilmez (anahtarla da, anahtarsız da) ──
  {
    const once = await durum();
    const r = await calistir(ortakEnv(0, { DRY_RUN: '1' }));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /DRY_RUN/); assert.match(r.stdout, /OyunKasasi yüklenir/); assert.match(r.stdout, /transferOwnership\(/);
    assert.match(r.stdout, /acceptOwnership/); assert.match(r.stdout, /setGuardian/);
    const r2 = await calistir(ortakEnv(0, { DRY_RUN: '1', DEPLOYER_PRIVATE_KEY: K.deployer, GUARDIAN_ADDRESS: A(K.guardian) }));
    assert.equal(r2.status, 0, r2.stdout + r2.stderr);
    assert.match(r2.stdout, /Gaz tahmini/);
    assert.match(r2.stdout, /setGuardian\(.*sahiplik devrinden ÖNCE/);
    const sonra = await durum();
    assert.deepEqual(sonra, once, 'DRY_RUN zincire hiçbir işlem göndermedi (blok ve nonce aynı)');
    assert.deepEqual(fs.readdirSync(cikis), [], 'DRY_RUN sonuç dosyası yazmadı');
    ok('DRY_RUN: doğrular, yapılacakları ve gaz tahminini yazdırır; zincire işlem GÖNDERMEZ, dosya yazmaz');
  }

  // ── 3) Reddedilenler: gevşek değer, anahtarsız gerçek gönderim, gerçek ağda onaysız/sahipsiz ──
  {
    const once = await durum();
    const gevsek = await calistir(ortakEnv(0, { DEPLOYER_PRIVATE_KEY: K.deployer, DAILY_LIMIT_BPS: '1000' }));
    assert.equal(gevsek.status, 1); assert.match(gevsek.stderr, /GEVŞEK/);
    const gevsek2 = await calistir(ortakEnv(0, { DEPLOYER_PRIVATE_KEY: K.deployer, SINGLE_DRAW_BPS: '500' }));
    assert.equal(gevsek2.status, 1); assert.match(gevsek2.stderr, /GEVŞEK/);
    const anahtarsiz = await calistir(ortakEnv(0));
    assert.equal(anahtarsiz.status, 1); assert.match(anahtarsiz.stderr, /DEPLOYER_PRIVATE_KEY/);
    const onaysiz = await calistir(ortakEnv(1, { DEPLOYER_PRIVATE_KEY: K.deployer }));          // ağ kimliği 43114 (gerçek ağ gibi)
    assert.equal(onaysiz.status, 1); assert.match(onaysiz.stderr, /CONFIRM_MAINNET=1/);
    const sahipsiz = await calistir(ortakEnv(1, { DEPLOYER_PRIVATE_KEY: K.deployer, CONFIRM_MAINNET: '1', OWNER_ADDRESS: '' }));
    assert.equal(sahipsiz.status, 1); assert.match(sahipsiz.stderr, /OWNER_ADDRESS/);
    const ayniAnahtar = await calistir(ortakEnv(1, { DEPLOYER_PRIVATE_KEY: K.dagitici, CONFIRM_MAINNET: '1' }));
    assert.equal(ayniAnahtar.status, 1); assert.match(ayniAnahtar.stderr, /dağıtıcıyla/);
    assert.deepEqual(await durum(), once, 'reddedilen hiçbir çalıştırma işlem göndermedi');
    assert.equal(await new ethers.JsonRpcProvider(rpc(1), 43114, { staticNetwork: true }).getTransactionCount(A(K.deployer)), 0, 'gerçek ağ kimlikli düğüme de işlem gitmedi');
    // Gerçek ağ kimliğinde DRY_RUN onay istemez ama yine hiçbir şey göndermez
    const kuru = await calistir(ortakEnv(1, { DRY_RUN: '1' }));
    assert.equal(kuru.status, 0, kuru.stdout + kuru.stderr);
    assert.match(kuru.stdout, /AVALANCHE \(GERÇEK\)/); assert.match(kuru.stdout, /CONFIRM_MAINNET=1 yok/);
    ok('Gevşek sınır, anahtarsız gönderim, onaysız/sahipsiz gerçek ağ, sıcak-anahtar sahibi reddedilir; hiçbirinde işlem gitmez');
  }

  // ── 4) Gerçek gönderim (sahte Fuji): yükleme + bekçi + iki adımlı devir ──
  {
    const r = await calistir(ortakEnv(0, { DEPLOYER_PRIVATE_KEY: K.deployer, GUARDIAN_ADDRESS: A(K.guardian) }));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const kasaAdresi = /KASA_ADRESI=(0x[0-9a-fA-F]{40})/.exec(r.stdout)[1];
    assert.match(r.stdout, /Sahiplik devri başlatıldı/); assert.match(r.stdout, /Bekçi atandı/); assert.match(r.stdout, /acceptOwnership/);
    const kasa = new ethers.Contract(kasaAdresi, c.OyunKasasi.abi, provider);
    assert.equal((await kasa.token()).toLowerCase(), tokenAddr.toLowerCase());
    assert.equal(await kasa.deadAddress(), '0x000000000000000000000000000000000000dEaD');
    const cur = await kasa.current();
    assert.equal(cur.dagitici, A(K.dagitici)); assert.equal(cur.creator, A(K.creator));
    assert.equal(Number(cur.singleDrawBps), 200); assert.equal(Number(cur.dailyLimitBps), 500);
    assert.equal(await kasa.owner(), A(K.deployer), 'devir kabul edilene kadar yükleyici sahip');
    assert.equal(await kasa.pendingOwner(), A(K.owner), 'iki adımlı devir başlatıldı');
    assert.equal(await kasa.guardian(), A(K.guardian));
    assert.equal(await kasa.paused(), false);
    const dosya = JSON.parse(fs.readFileSync(path.join(cikis, 'fuji.json'), 'utf8'));
    assert.equal(dosya.kasa.address, kasaAdresi); assert.equal(dosya.kasa.pendingOwner, A(K.owner).toLowerCase());
    // Sahip kabul eder → sahip olur; bekçi durdurabilir; dağıtıcı sınırlar içinde öder
    await (await kasa.connect(sig(K.owner)).acceptOwnership()).wait();
    assert.equal(await kasa.owner(), A(K.owner));
    await (await tokenK.connect(sig(K.oyuncu)).mint(A(K.oyuncu), ASTRA(100000))).wait();
    await (await tokenK.connect(sig(K.oyuncu)).approve(kasaAdresi, ethers.MaxUint256)).wait();
    await (await kasa.connect(sig(K.oyuncu)).deposit(ASTRA(100000))).wait();
    const disp = kasa.connect(sig(K.dagitici));
    await (await disp.payPlayer(A(K.oyuncu), ASTRA(2000), ethers.id('a'))).wait();          // tam %2: geçer
    await assert.rejects(disp.payPlayer(A(K.oyuncu), ASTRA(2000), ethers.id('b')), /DrawTooLarge|revert|execution/);  // %2'nin üstü (bakiye düştü)
    await (await kasa.connect(sig(K.guardian)).pause()).wait();
    assert.equal(await kasa.paused(), true, 'bekçi durdurabilir');
    ok('Gerçek gönderim: kasa yüklendi, ayarlar doğrulandı, bekçi atandı, sahiplik iki adımlı devredildi; sahip kabulünden sonra sınırlar çalışıyor');

    // ── 5) Sunucunun kasa denetimi (K3) betiğin kurduğu kasayı kabul eder; gevşek bir kasayı reddeder ──
    const cfg = { ...loadConfig({}), rpcUrls: [rpc(0)], chainId: 43113, tokenAddress: tokenAddr, deadAddress: '0x000000000000000000000000000000000000dEaD',
      vaultContract: kasaAdresi.toLowerCase(), gameWalletKey: K.dagitici };
    const k = await createChain(cfg).checkVault(A(K.creator));
    assert.deepEqual(k.problems, [], 'sunucu kasayı kabul etti: ' + k.problems.join('; '));
    assert.equal(k.ok, true);
    const gevsekKasa = await (await new ethers.ContractFactory(c.OyunKasasi.abi, c.OyunKasasi.bytecode, sig(K.deployer)).deploy(tokenAddr, '0x000000000000000000000000000000000000dEaD',
      { dagitici: A(K.dagitici), creator: A(K.creator), singleDrawBps: 1000, dailyLimitBps: 3000 })).waitForDeployment();
    const k2 = await createChain({ ...cfg, vaultContract: (await gevsekKasa.getAddress()).toLowerCase() }).checkVault(A(K.creator));
    assert.equal(k2.ok, false, 'elle kurulan gevşek kasa sunucuda reddedilir');
    ok('Sunucu checkVault: betiğin kurduğu kasa (%5 / %2) kabul; gevşek (%30 / %10) kasa sorun sayılır');
  }

  // ── 6) Bekçisiz kurulum: devir başlar, bekçi sonradan sahipçe atanır (yazdırılan adım) ──
  {
    const r = await calistir(ortakEnv(0, { DEPLOYER_PRIVATE_KEY: K.deployer }));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /BEKÇİ ataması: sahip/, 'bekçi atama adımı yazdırılır');
    const kasaAdresi = /KASA_ADRESI=(0x[0-9a-fA-F]{40})/.exec(r.stdout)[1];
    const kasa = new ethers.Contract(kasaAdresi, c.OyunKasasi.abi, provider);
    assert.equal(await kasa.guardian(), ethers.ZeroAddress);
    await (await kasa.connect(sig(K.owner)).acceptOwnership()).wait();
    await (await kasa.connect(sig(K.owner)).setGuardian(A(K.guardian))).wait();
    assert.equal(await kasa.guardian(), A(K.guardian));
    ok('Bekçisiz kurulum: bekçi atama adımı yazdırılır; sahip kabulden sonra atayabilir');
  }
} finally {
  await dugumler[0].close(); await dugumler[1].close();
  fs.rmSync(cikis, { recursive: true, force: true });
}
console.log(`\n${passed} kasa dağıtım kontrolü geçti.`);
process.exit(0);
