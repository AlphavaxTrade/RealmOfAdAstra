// Oyun Kasası (OyunKasasi.sol) dağıtım betiği (13 Ekim 2026 denetimi: "OyunKasasi için dağıtım betiği yok").
// ============================================================================
// Önce Fuji deneme ağında (bedava) ve DRY_RUN=1 ile denenir, sonra gerçek ağa yüklenir. Ayarlar ortam değişkeninden:
//
//   DEPLOY_RPC=https://api.avax-test.network/ext/bc/C/rpc   (Fuji)  |  https://api.avax.network/ext/bc/C/rpc (gerçek ağ)
//   DEPLOYER_PRIVATE_KEY=0x...     yükleme ücretini ödeyecek GEÇİCİ cüzdan (yalnız yükleme için; içinde az AVAX olsun).
//                                   DRY_RUN=1 iken gerekmez.
//   TOKEN_ADDRESS=0x...            ADASTRA (gerçek ağda 0xCA29d740502F4bA1Fa8e9DcAfBD85137b4CebEb0)
//   DEAD_ADDRESS=0x...             yakım adresi (varsayılan 0x000000000000000000000000000000000000dEaD)
//   DISPATCHER_ADDRESS=0x...       DAĞITICI: sunucunun oyun cüzdanı (GAME_WALLET_PRIVATE_KEY'in adresi); yalnız "şuna öde" diyebilir
//   CREATOR_ADDRESS=0x...          yapımcı payının gideceği SABİT cüzdan (oyunun yapımcı cüzdanıyla aynı olmalı)
//   OWNER_ADDRESS=0x...            KALICI SAHİP: donanım cüzdanı (Ledger). Yükleme bitince iki adımlı devir başlatılır.
//                                   Gerçek ağda ZORUNLU; dağıtıcı adresiyle aynı olamaz.
//   GUARDIAN_ADDRESS=0x...         isteğe bağlı BEKÇİ: ayrı soğuk cüzdan / çoklu imza. Verilirse sahiplik devrinden ÖNCE atanır.
//                                   Bir kez atanınca YALNIZ bekçinin kendisi değiştirebilir (sahip bile değiştiremez): adresi iki kez kontrol et.
//   DAILY_LIMIT_BPS=500            günlük toplam ödeme sınırı (kasanın %5'i); kararlaştırılan 500'den GEVŞEK değer REDDEDİLİR
//   SINGLE_DRAW_BPS=200            tek ödeme sınırı (kasanın %2'si); kararlaştırılan 200'den GEVŞEK değer REDDEDİLİR
//   CONFIRM_MAINNET=1              gerçek ağa yüklemek için ZORUNLU açık onay (DRY_RUN=1 iken gerekmez)
//   DRY_RUN=1                      hiçbir işlem GÖNDERMEZ: doğrular, yapılacakları ve gaz tahminini yazdırır
//   DEPLOY_OUT_DIR=klasör          sonuç dosyasının klasörü (varsayılan contracts/deployments; testler başka yere yazar)
//
//   node contracts/deploy-kasa.mjs
// Sonuç contracts/deployments/<ağ>.json içine "kasa" olarak yazılır; sunucuda VAULT_CONTRACT=<adres> yap.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { compile } from './compile.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAINNET = 43114n, FUJI = 43113n;
// Kararlaştırılan en yüksek sınırlar (11 Ekim 2026: günlük %5, tek ödeme %2). server/chain.js VAULT_MAX_* ile aynı.
// Sözleşmenin kendi tavanı daha gevşektir (%30 / %10); betik KARARLAŞTIRILANDAN gevşek kurulumu kabul etmez.
export const KARAR_GUNLUK_BPS = 500;
export const KARAR_TEK_BPS = 200;
const DEAD_VARSAYILAN = '0x000000000000000000000000000000000000dEaD';
const isAddr = a => /^0x[0-9a-fA-F]{40}$/.test(String(a || ''));
const ayniAdres = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

// Ortam değişkenlerini doğrular (saf işlev: ağa bağlanmaz). { hatalar, uyarilar, ayar }
export function kasaAyarlariniDogrula(env) {
  const hatalar = [], uyarilar = [];
  const al = k => String(env[k] ?? '').trim();
  const adres = (k, { zorunlu = false, varsayilan = '' } = {}) => {
    const v = al(k) || varsayilan;
    if (!v) { if (zorunlu) hatalar.push(`${k} gerekli`); return ''; }
    if (!isAddr(v)) { hatalar.push(`${k} geçerli bir adres değil`); return ''; }
    if (/^0x0{40}$/.test(v)) { hatalar.push(`${k} sıfır adres olamaz`); return ''; }
    return v;
  };
  const sayi = (k, varsayilan, tavan, ad) => {
    const ham = al(k);
    const v = ham === '' ? varsayilan : Number(ham);
    if (!Number.isInteger(v) || v < 1) { hatalar.push(`${k} 1 ile ${tavan} arasında bir tam sayı olmalı (baz puan; verilen: "${ham}")`); return varsayilan; }
    if (v > tavan) hatalar.push(`${k}=${v} kararlaştırılan sınırdan GEVŞEK (${ad}: en çok ${tavan} baz puan = %${tavan / 100}); bu betik gevşek kasa kurmaz`);
    return v;
  };
  const token = adres('TOKEN_ADDRESS', { zorunlu: true });
  const dead = adres('DEAD_ADDRESS', { varsayilan: DEAD_VARSAYILAN });
  const dagitici = adres('DISPATCHER_ADDRESS', { zorunlu: true });
  const creator = adres('CREATOR_ADDRESS', { zorunlu: true });
  const owner = adres('OWNER_ADDRESS');
  const guardian = adres('GUARDIAN_ADDRESS');
  const dailyLimitBps = sayi('DAILY_LIMIT_BPS', KARAR_GUNLUK_BPS, KARAR_GUNLUK_BPS, 'günlük toplam');
  const singleDrawBps = sayi('SINGLE_DRAW_BPS', KARAR_TEK_BPS, KARAR_TEK_BPS, 'tek ödeme');
  if (singleDrawBps > dailyLimitBps) hatalar.push(`SINGLE_DRAW_BPS (${singleDrawBps}) günlük sınırdan (${dailyLimitBps}) büyük olamaz`);
  // Rol ayrımı: dağıtıcı sunucudaki SICAK anahtardır; sahip ve bekçi ondan ayrı, soğuk adresler olmalı
  if (ayniAdres(owner, dagitici)) hatalar.push('OWNER_ADDRESS dağıtıcıyla (DISPATCHER_ADDRESS) aynı olamaz: sunucudaki sıcak anahtar sahip olmamalı');
  if (ayniAdres(guardian, dagitici)) hatalar.push('GUARDIAN_ADDRESS dağıtıcıyla aynı olamaz: bekçi sunucudan ayrı, soğuk bir cüzdan olmalı');
  if (ayniAdres(guardian, owner)) hatalar.push('GUARDIAN_ADDRESS sahiple aynı olamaz: bekçinin amacı sahip anahtarı çalınsa bile durdurabilmektir');
  if (!owner) uyarilar.push('OWNER_ADDRESS yok: sahiplik yükleyici cüzdanda KALIR (gerçek ağda zorunlu)');
  if (!guardian) uyarilar.push('GUARDIAN_ADDRESS yok: bekçi atanmayacak (sahip sonradan setGuardian ile atar; ilk atamayı yalnız sahip yapabilir)');
  return { hatalar, uyarilar, ayar: { token, dead, dagitici, creator, owner, guardian, dailyLimitBps, singleDrawBps } };
}

// Hata: process.exit() kullanılmaz (Windows'ta açık bağlantılarla çağrılınca süreç çöker); atılır, en üstte yakalanıp çıkış kodu 1 verilir
class Cikis extends Error {}
const cik = mesaj => { throw new Cikis(mesaj); };

async function main(env) {
  const dryRun = String(env.DRY_RUN || '').trim() === '1';
  const { hatalar, uyarilar, ayar } = kasaAyarlariniDogrula(env);
  if (!String(env.DEPLOY_RPC || '').trim()) hatalar.push('DEPLOY_RPC gerekli');
  if (!dryRun && !String(env.DEPLOYER_PRIVATE_KEY || '').trim()) hatalar.push('DEPLOYER_PRIVATE_KEY gerekli (yalnız DRY_RUN=1 iken gerekmez)');
  if (hatalar.length) throw new Cikis(hatalar.join('\n❌ '));

  // cacheTimeout: -1 → ethers aynı isteği 250 ms önbellekler; art arda iki işlemde sıra numarası eski okunup işlem reddedilirdi
  const provider = new ethers.JsonRpcProvider(env.DEPLOY_RPC.trim(), undefined, { cacheTimeout: -1 });
  const { chainId } = await provider.getNetwork();
  if (chainId !== MAINNET && chainId !== FUJI) cik(`Beklenmeyen ağ: ${chainId} (Avalanche 43114 ya da Fuji 43113 olmalı)`);
  const mainnet = chainId === MAINNET;
  const ag = mainnet ? 'avalanche' : 'fuji';
  if (mainnet && !dryRun && env.CONFIRM_MAINNET !== '1') cik('Gerçek ağa yüklemek için CONFIRM_MAINNET=1 yazmalısın.');
  if (mainnet && !ayar.owner) cik('Gerçek ağda OWNER_ADDRESS (donanım cüzdanı adresi) zorunlu: kasa sahibi sıcak bir anahtarda kalmamalı.');

  let wallet = null;
  if (String(env.DEPLOYER_PRIVATE_KEY || '').trim()) {
    try { wallet = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY.trim(), provider); } catch { cik('DEPLOYER_PRIVATE_KEY geçerli bir anahtar değil'); }
  }
  if (wallet && ayniAdres(wallet.address, ayar.dagitici)) {
    const m = 'Yükleyici cüzdan dağıtıcıyla (DISPATCHER_ADDRESS) aynı: sahiplik devri kabul edilene kadar sunucudaki sıcak anahtar kasanın sahibi olurdu.';
    if (mainnet) cik(m);
    uyarilar.push(m);
  }
  if (wallet && mainnet && ayniAdres(wallet.address, ayar.owner)) cik('OWNER_ADDRESS yükleyici cüzdanla aynı olamaz (yükleyici geçici anahtardır).');
  if (wallet && ayniAdres(wallet.address, ayar.guardian)) cik('GUARDIAN_ADDRESS yükleyici cüzdanla aynı olamaz.');

  const c = compile();
  const cfgObj = { dagitici: ayar.dagitici, creator: ayar.creator, singleDrawBps: ayar.singleDrawBps, dailyLimitBps: ayar.dailyLimitBps };
  const factory = new ethers.ContractFactory(c.OyunKasasi.abi, c.OyunKasasi.bytecode, wallet || undefined);
  const iface = new ethers.Interface(c.OyunKasasi.abi);

  // ── Plan: hangi işlemler hangi sırayla gönderilecek ──
  const adimlar = [`OyunKasasi yüklenir (token ${ayar.token}, yakım ${ayar.dead})`,
    `Başlangıç ayarı: dağıtıcı ${ayar.dagitici}, yapımcı ${ayar.creator}, günlük %${ayar.dailyLimitBps / 100}, tek ödeme %${ayar.singleDrawBps / 100}`];
  if (ayar.guardian) adimlar.push(`setGuardian(${ayar.guardian}) — sahiplik devrinden ÖNCE (ilk atamayı yalnız sahip yapar)`);
  if (ayar.owner && !ayniAdres(ayar.owner, wallet && wallet.address)) adimlar.push(`transferOwnership(${ayar.owner}) — iki adımlı; OWNER cüzdanı acceptOwnership diyene kadar devir tamamlanmaz`);
  console.log(`Ağ: ${mainnet ? 'AVALANCHE (GERÇEK)' : 'Fuji (deneme)'} · ${dryRun ? 'DRY_RUN (hiçbir işlem gönderilmez)' : 'GERÇEK GÖNDERİM'}${wallet ? ' · yükleyen: ' + wallet.address : ''}`);
  console.log('Yapılacaklar:'); adimlar.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
  for (const u of uyarilar) console.log('⚠️  ' + u);

  if (dryRun) {
    if (mainnet && env.CONFIRM_MAINNET !== '1') console.log('ℹ️  CONFIRM_MAINNET=1 yok: gerçek gönderimde reddedilir.');
    try {
      const tx = await factory.getDeployTransaction(ayar.token, ayar.dead, cfgObj);
      if (wallet) {
        const gas = await provider.estimateGas({ from: wallet.address, data: tx.data });
        const bal = await provider.getBalance(wallet.address);
        console.log(`Gaz tahmini (yükleme): ${gas} · yükleyen bakiyesi: ${ethers.formatEther(bal)} AVAX`);
      } else console.log('(DEPLOYER_PRIVATE_KEY yok: gaz ve bakiye tahmini atlandı)');
    } catch (e) { console.log('(gaz tahmini yapılamadı: ' + String(e.shortMessage || e.message).slice(0, 120) + ')'); }
    console.log('\n✅ DRY_RUN bitti: zincire hiçbir işlem gönderilmedi.');
    printNext(iface, ayar, null, mainnet);
    return;
  }

  const bal = await provider.getBalance(wallet.address);
  console.log(`Yükleyen bakiyesi: ${ethers.formatEther(bal)} AVAX`);
  const kasa = await factory.deploy(ayar.token, ayar.dead, cfgObj);
  console.log(`⏳ Yükleniyor… işlem: ${kasa.deploymentTransaction().hash}`);
  await kasa.waitForDeployment();
  const address = await kasa.getAddress();

  // Doğrulama: zincirdeki ayarlar istenenle aynı mı (aynı değilse bu kasa KULLANILMAMALI)
  const [tok, dead, cur, own, paused] = await Promise.all([kasa.token(), kasa.deadAddress(), kasa.current(), kasa.owner(), kasa.paused()]);
  const dogru = ayniAdres(tok, ayar.token) && ayniAdres(dead, ayar.dead) && ayniAdres(cur.dagitici, ayar.dagitici) && ayniAdres(cur.creator, ayar.creator)
    && Number(cur.singleDrawBps) === ayar.singleDrawBps && Number(cur.dailyLimitBps) === ayar.dailyLimitBps && ayniAdres(own, wallet.address) && !paused;
  if (!dogru) cik(`Kasa yüklendi (${address}) ama zincirdeki ayarlar beklenenle uyuşmuyor: BU KASAYI KULLANMA.`);
  console.log(`✅ Kasa yüklendi ve ayarlar doğrulandı: ${address}`);

  if (ayar.guardian) {
    await (await kasa.setGuardian(ayar.guardian)).wait();
    if (!ayniAdres(await kasa.guardian(), ayar.guardian)) cik('Bekçi ataması doğrulanamadı!');
    console.log(`🛡️  Bekçi atandı: ${ayar.guardian} (artık yalnız bekçinin kendisi değiştirebilir)`);
  }
  let pendingOwner = null;
  if (ayar.owner && !ayniAdres(ayar.owner, wallet.address)) {
    await (await kasa.transferOwnership(ayar.owner)).wait();
    pendingOwner = (await kasa.pendingOwner()).toLowerCase();
    if (pendingOwner !== ayar.owner.toLowerCase()) cik('Sahiplik devri doğrulanamadı!');
    console.log(`👑 Sahiplik devri başlatıldı → ${ayar.owner}`);
  }

  const out = { address, token: ayar.token, dead: ayar.dead, dagitici: ayar.dagitici, creator: ayar.creator, owner: own.toLowerCase(), pendingOwner,
    guardian: ayar.guardian ? ayar.guardian.toLowerCase() : null, dailyLimitBps: ayar.dailyLimitBps, singleDrawBps: ayar.singleDrawBps,
    at: new Date().toISOString(), tx: kasa.deploymentTransaction().hash };
  const dosya = path.join(String(env.DEPLOY_OUT_DIR || '').trim() || path.join(here, 'deployments'), `${ag}.json`);
  const prev = fs.existsSync(dosya) ? JSON.parse(fs.readFileSync(dosya, 'utf8')) : { network: ag, chainId: Number(chainId) };
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  fs.writeFileSync(dosya, JSON.stringify({ ...prev, kasa: out }, null, 2));
  printNext(iface, ayar, address, mainnet);
  console.log(`KASA_ADRESI=${address}`);
}

// Kurulumdan sonra yapılacaklar (bu betiğin yapamayacağı ya da yapmaması gereken adımlar)
function printNext(iface, ayar, address, mainnet) {
  const ad = address || '<kasa adresi>';
  console.log('\nSIRADAKİ ADIMLAR');
  let n = 1;
  if (ayar.owner) console.log(`  ${n++}. SAHİP cüzdanı (${ayar.owner}, Ledger) kasada acceptOwnership() çağırır → veri ${iface.encodeFunctionData('acceptOwnership')} (hedef: ${ad}). Kabul edilene kadar devir bitmez ve yükleyici cüzdan sahip kalır.`);
  if (!ayar.guardian) console.log(`  ${n++}. BEKÇİ ataması: sahip, soğuk bir bekçi adresiyle setGuardian(adres) çağırır (imza: ${iface.getFunction('setGuardian').format('sighash')}; seçici ${iface.getFunction('setGuardian').selector}). Bir kez atanınca yalnız bekçinin kendisi değiştirebilir; adresi iki kez kontrol et.`);
  else console.log(`  ${n++}. Bekçi (${ayar.guardian}) atanmış durumda: pause() ve cancelConfig() yalnız ondan/sahipten çalışır; bir kez deneme (Fuji) ile doğrula.`);
  console.log(`  ${n++}. Sunucuda: VAULT_CONTRACT=${ad}   GAME_WALLET_PRIVATE_KEY = dağıtıcı (${ayar.dagitici}) anahtarı   TEST_MODE=0. Sunucu açılışta checkVault ile token/yakım/dağıtıcı/yapımcı ve %${KARAR_GUNLUK_BPS / 100} / %${KARAR_TEK_BPS / 100} sınırlarını denetler; uyuşmazlıkta ödemeler başlamaz.`);
  console.log(`  ${n++}. Kasayı doldurma: ASTRA tek yönlüdür (kasadan geri çekilemez). Önce Fuji'de küçük miktarla deposit(amount) dene; sınırlar kasanın BAKİYESİNE göre hesaplanır.`);
  if (mainnet) console.log(`  ${n++}. Gerçek ağ: bağımsız sözleşme denetimi yapılmadan büyük miktar yatırma (denetim raporu kapı 3).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.env); } catch (e) {
    console.error('❌ ' + (e instanceof Cikis ? e.message : `Beklenmeyen hata: ${e.shortMessage || e.message}`));
    process.exitCode = 1;
  }
}
