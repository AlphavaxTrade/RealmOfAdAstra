// RealmPayments ödeme sözleşmesini ve RealmRates oran sözleşmesini zincire yükler.
// ============================================================================
// Önce Fuji deneme ağında (bedava) denenir, sonra gerçek ağa yüklenir. Kullanım (ayarlar ortam değişkeninden):
//
//   DEPLOY_RPC=https://api.avax-test.network/ext/bc/C/rpc      (Fuji)  |  https://api.avax.network/ext/bc/C/rpc (gerçek ağ)
//   DEPLOYER_PRIVATE_KEY=0x...          yükleme ücretini ödeyecek GEÇİCİ cüzdan (yalnız yükleme için; içinde az AVAX olsun)
//   OWNER_ADDRESS=0x...                 sözleşmenin KALICI sahibi: donanım cüzdanı (Ledger) adresi. Yükleme biter bitmez
//                                       sahiplik bu adrese devredilir; Ledger ile "kabul et" denince devir tamamlanır
//                                       (yönetici panelindeki "Sözleşme sahipliğini kabul et" düğmesi). Gerçek ağda ZORUNLU.
//   TREASURY=0x...                      ADASTRA'nın gideceği oyun cüzdanı (sunucudaki GAME_WALLET adresi)
//   FEE_RECEIVER=0x...                  AVAX komisyonunun gideceği cüzdan (önerilen: donanım cüzdanı / yedek cüzdan)
//   TOKEN_ADDRESS=0x...                 ADASTRA (gerçek ağda 0xCA29d740502F4bA1Fa8e9DcAfBD85137b4CebEb0)
//   FEE_GAS=100000                      komisyon = gaz fiyatı × bu (sunucudaki PAY_FEE_GAS ile aynı olmalı)
//   DEPLOY_MOCK_TOKEN=1                 yalnız Fuji: deneme için sahte ADASTRA da yükler (TOKEN_ADDRESS gerekmez)
//   CONFIRM_MAINNET=1                   gerçek ağa yüklemek için ZORUNLU açık onay
//   ONLY_RATES=1                        yalnız RealmRates (oran sözleşmesi) yüklenir; TREASURY / FEE_RECEIVER / TOKEN gerekmez
//                                       Başlangıç oranları oyunun bugünkü ayarlarıdır (js/economy/rates.js ratesFromConfig).
//
//   node contracts/deploy.mjs
// Sonuç contracts/deployments/<ağ>.json dosyasına yazılır; sözleşme adreslerini sunucuda PAYMENTS_CONTRACT ve RATES_CONTRACT yap.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { compile } from './compile.mjs';
import { GAME_CONFIG } from '../js/config.js';
import { ratesFromConfig, validateRates } from '../js/economy/rates.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const need = k => { if (!env[k]) { console.error(`❌ ${k} gerekli`); process.exit(1); } return env[k].trim(); };
const isAddr = a => /^0x[0-9a-fA-F]{40}$/.test(a);

const provider = new ethers.JsonRpcProvider(need('DEPLOY_RPC'));
const { chainId } = await provider.getNetwork();
const MAINNET = 43114n, FUJI = 43113n;
if (chainId !== MAINNET && chainId !== FUJI) { console.error(`❌ Beklenmeyen ağ: ${chainId} (Avalanche 43114 ya da Fuji 43113 olmalı)`); process.exit(1); }
const mainnet = chainId === MAINNET;
if (mainnet && env.CONFIRM_MAINNET !== '1') { console.error('❌ Gerçek ağa yüklemek için CONFIRM_MAINNET=1 yazmalısın.'); process.exit(1); }
if (mainnet && env.DEPLOY_MOCK_TOKEN === '1') { console.error('❌ Sahte token gerçek ağa yüklenmez.'); process.exit(1); }

const wallet = new ethers.Wallet(need('DEPLOYER_PRIVATE_KEY'), provider);
const ownerAddress = (env.OWNER_ADDRESS || '').trim();
const c = compile();

// Oran sözleşmesi: yükle, oranları doğrula, sahipliği devret
async function deployRates() {
  const initial = ratesFromConfig(GAME_CONFIG);
  const bad = validateRates(initial);
  if (bad) { console.error('❌ Başlangıç oranları geçersiz: ' + bad); process.exit(1); }
  const f = new ethers.ContractFactory(c.RealmRates.abi, c.RealmRates.bytecode, wallet);
  const r = await f.deploy(initial);
  console.log(`⏳ RealmRates yükleniyor… işlem: ${r.deploymentTransaction().hash}`);
  await r.waitForDeployment();
  const address = await r.getAddress();
  const onChain = (await r.active()).map(Number);
  console.log(onChain.join(',') === initial.join(',') ? '✅ Oranlar doğrulandı' : '❌ Oranlar beklenenle uyuşmuyor!');
  let pendingOwner = null;
  if (ownerAddress && ownerAddress.toLowerCase() !== wallet.address.toLowerCase()) {
    await (await r.transferOwnership(ownerAddress)).wait();
    pendingOwner = (await r.pendingOwner()).toLowerCase();
    console.log(`👑 Oran sözleşmesinin sahipliği devri başlatıldı → ${ownerAddress} (o cüzdanla "acceptOwnership" yapılınca tamamlanır).`);
  }
  return { address, initial, pendingOwner, tx: r.deploymentTransaction().hash };
}

if (env.ONLY_RATES === '1') {
  const network = mainnet ? 'avalanche' : 'fuji';
  const rates = await deployRates();
  const file = path.join(here, 'deployments', `${network}.json`);
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { network, chainId: Number(chainId) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...prev, rates: { ...rates, at: new Date().toISOString() } }, null, 2));
  console.log(`\n✅ RealmRates: ${rates.address}\nSunucu ayarı:  RATES_CONTRACT=${rates.address}`);
  process.exit(0);
}

const treasury = need('TREASURY'), feeReceiver = need('FEE_RECEIVER');
if (mainnet && !ownerAddress) { console.error('❌ Gerçek ağda OWNER_ADDRESS (donanım cüzdanı adresi) zorunlu: sözleşme sahibi sıcak bir anahtarda kalmamalı.'); process.exit(1); }
if (ownerAddress && !isAddr(ownerAddress)) { console.error('❌ OWNER_ADDRESS geçerli bir adres değil'); process.exit(1); }
if (ownerAddress && ownerAddress.toLowerCase() === treasury.toLowerCase()) { console.error('❌ OWNER_ADDRESS oyun cüzdanıyla (TREASURY) aynı olamaz: oyun cüzdanının anahtarı sunucuda durur.'); process.exit(1); }
const feeGas = BigInt(env.FEE_GAS || 100000);
for (const [k, v] of [['TREASURY', treasury], ['FEE_RECEIVER', feeReceiver]]) if (!isAddr(v)) { console.error(`❌ ${k} geçerli bir adres değil`); process.exit(1); }

const bal = await provider.getBalance(wallet.address);
console.log(`Ağ: ${mainnet ? 'AVALANCHE (GERÇEK)' : 'Fuji (deneme)'} · yükleyen: ${wallet.address} · bakiye: ${ethers.formatEther(bal)} AVAX`);

let token = env.TOKEN_ADDRESS ? env.TOKEN_ADDRESS.trim() : '';
if (env.DEPLOY_MOCK_TOKEN === '1') {
  const f = new ethers.ContractFactory(c.MockToken.abi, c.MockToken.bytecode, wallet);
  const t = await f.deploy();
  await t.waitForDeployment();
  token = await t.getAddress();
  console.log(`🧪 Sahte ADASTRA yüklendi: ${token} (dilediğin adrese mint(adres, miktar) ile basabilirsin)`);
}
if (!isAddr(token)) { console.error('❌ TOKEN_ADDRESS geçerli değil'); process.exit(1); }

const factory = new ethers.ContractFactory(c.RealmPayments.abi, c.RealmPayments.bytecode, wallet);
const pay = await factory.deploy(token, treasury, feeReceiver, feeGas);
console.log(`⏳ Yükleniyor… işlem: ${pay.deploymentTransaction().hash}`);
await pay.waitForDeployment();
const address = await pay.getAddress();

// Doğrulama: zincirdeki ayarlar istenenle aynı mı
const [t2, tr2, fr2, fg2, own] = await Promise.all([pay.token(), pay.treasury(), pay.feeReceiver(), pay.feeGas(), pay.owner()]);
const okk = t2.toLowerCase() === token.toLowerCase() && tr2.toLowerCase() === treasury.toLowerCase() && fr2.toLowerCase() === feeReceiver.toLowerCase() && fg2 === feeGas;
console.log(okk ? '✅ Ayarlar doğrulandı' : '❌ Ayarlar beklenenle uyuşmuyor!');

// Sahipliği donanım cüzdanına devret (iki adımlı: Ledger "kabul et" diyene kadar eski sahip yetkili kalır)
let pendingOwner = null;
if (ownerAddress && ownerAddress.toLowerCase() !== wallet.address.toLowerCase()) {
  const t = await pay.transferOwnership(ownerAddress);
  await t.wait();
  pendingOwner = (await pay.pendingOwner()).toLowerCase();
  console.log(pendingOwner === ownerAddress.toLowerCase()
    ? `👑 Sahiplik devri başlatıldı → ${ownerAddress}. Şimdi Ledger ile "acceptOwnership" (yönetici paneli: "Sözleşme sahipliğini kabul et") yap.`
    : '❌ Sahiplik devri doğrulanamadı!');
}

const rates = await deployRates();

const out = { network: mainnet ? 'avalanche' : 'fuji', chainId: Number(chainId), address, token, treasury, feeReceiver, feeGas: Number(feeGas), owner: own, pendingOwner, at: new Date().toISOString(), tx: pay.deploymentTransaction().hash, rates };
fs.mkdirSync(path.join(here, 'deployments'), { recursive: true });
fs.writeFileSync(path.join(here, 'deployments', `${out.network}.json`), JSON.stringify(out, null, 2));
console.log(`\n✅ RealmPayments: ${address}\n✅ RealmRates: ${rates.address}\nSunucu ayarı:  PAYMENTS_CONTRACT=${address}   RATES_CONTRACT=${rates.address}   PAY_FEE_GAS=${feeGas}${ownerAddress ? '   CONTRACT_OWNER=' + ownerAddress : ''}${mainnet ? '' : '   CHAIN_ID=43113   TOKEN_ADDRESS=' + token}`);
