// Realm of Astra sunucusu — Avalanche zinciri: fiyat okuma, yatırma tarama, ADASTRA gönderme
// ============================================================================
// Oyun cüzdanının gizli anahtarı yalnız ortam değişkeninden (GAME_WALLET_PRIVATE_KEY) okunur; koda,
// kayıtlara ve günlüklere asla yazılmaz. Anahtar yoksa sunucu yalnız okur (fiyat, yatırma) ve ödemeleri
// yönetici onayına bırakır.
// ============================================================================
import { ethers } from 'ethers';

const TOKEN_MANAGER_ABI = [
  'function getTokenParameters(uint256) view returns (tuple(uint128 curveScaler,uint16 a,uint8 b,bool lpDeployed,uint8 lpPercentage,uint8 salePercentage,uint8 creatorFeeBasisPoints,address creatorAddress,address pairAddress,address tokenContractAddress))'
];
const ERC20_ABI = [
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];
const FEED_ABI = ['function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)', 'function decimals() view returns (uint8)'];
const PAIR_ABI = ['function getReserves() view returns (uint112,uint112,uint32)', 'function token0() view returns (address)'];

const toAda = v => Number(ethers.formatUnits(v, 18));

export function createChain(cfg) {
  const providers = cfg.rpcUrls.map(u => new ethers.JsonRpcProvider(u.trim(), cfg.chainId, { staticNetwork: true }));
  let pi = 0;
  // Sırayla yedek adreslere geçen okuma: bir düğüm yanıt vermezse sonrakini dener
  async function withProvider(fn) {
    let lastErr;
    for (let i = 0; i < providers.length; i++) {
      const p = providers[(pi + i) % providers.length];
      try { const r = await fn(p); pi = (pi + i) % providers.length; return r; } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }
  const wallet = cfg.gameWalletKey ? new ethers.Wallet(cfg.gameWalletKey) : null;
  const gameWallet = (wallet ? wallet.address : cfg.gameWalletAddress || '').toLowerCase() || null;

  async function readMarket() {
    return withProvider(async p => {
      const tm = new ethers.Contract(cfg.tokenManager, TOKEN_MANAGER_ABI, p);
      const token = new ethers.Contract(cfg.tokenAddress, ERC20_ABI, p);
      const feed = new ethers.Contract(cfg.avaxUsdFeed, FEED_ABI, p);
      const [prm, supplyW, deadW, round, feedDec, walletW] = await Promise.all([
        tm.getTokenParameters(cfg.tokenId), token.totalSupply(), token.balanceOf(cfg.deadAddress),
        feed.latestRoundData(), feed.decimals(), gameWallet ? token.balanceOf(gameWallet) : Promise.resolve(0n)
      ]);
      const avaxUsd = Number(round[1]) / 10 ** Number(feedDec);
      const supply = toAda(supplyW), dead = toAda(deadW);
      let priceAvax, poolTokenReserve = 0, poolAvaxReserve = 0;
      const graduated = !!prm.lpDeployed;
      if (graduated) {
        const pair = new ethers.Contract(prm.pairAddress, PAIR_ABI, p);
        const [[r0, r1], t0] = await Promise.all([pair.getReserves(), pair.token0()]);
        const tokenIs0 = t0.toLowerCase() === cfg.tokenAddress.toLowerCase();
        poolTokenReserve = toAda(tokenIs0 ? r0 : r1);
        poolAvaxReserve = toAda(tokenIs0 ? r1 : r0);
        priceAvax = poolTokenReserve > 0 ? poolAvaxReserve / poolTokenReserve : 0;
      } else {
        // Arena eğrisi: anlık fiyat = a·S²/c wei (S tam token), bkz. hafıza notu reference_adastra_token
        const a = Number(prm.a), c = Number(prm.curveScaler);
        priceAvax = a * supply * supply / c / 1e18;
      }
      const priceUsd = priceAvax * avaxUsd;
      return {
        at: Date.now(), graduated, supply, dead, curveSupply: supply, poolTokenReserve, poolAvaxReserve,
        priceAvax, avaxUsd, priceUsd, mcapUsd: priceUsd * Math.max(0, supply - dead),
        walletAda: toAda(walletW), pairAddress: prm.pairAddress
      };
    });
  }

  async function latestBlock() { return withProvider(p => p.getBlockNumber()); }

  // Oyun cüzdanına gelen ADASTRA transferleri (public RPC'ler blok aralığını sınırlar: parça parça)
  async function scanDeposits(fromBlock, toBlock, step = 2000) {
    if (!gameWallet) return [];
    const iface = new ethers.Interface(ERC20_ABI);
    const topic = iface.getEvent('Transfer').topicHash;
    const toTopic = ethers.zeroPadValue(gameWallet, 32);
    const out = [];
    for (let b = fromBlock; b <= toBlock; b += step) {
      const e = Math.min(toBlock, b + step - 1);
      const logs = await withProvider(p => p.getLogs({ address: cfg.tokenAddress, topics: [topic, null, toTopic], fromBlock: b, toBlock: e }));
      for (const l of logs) {
        const ev = iface.parseLog(l);
        out.push({ txHash: l.transactionHash, logIndex: l.index, from: ev.args.from.toLowerCase(), amount: toAda(ev.args.value), block: l.blockNumber });
      }
    }
    return out;
  }

  let sendQueue = Promise.resolve();
  // ADASTRA gönderimi (sırayla; aynı anda iki işlem nonce çakışması yaratmasın)
  function sendAda(to, amountAda) {
    if (!wallet) return Promise.reject(new Error('Oyun cüzdanı anahtarı tanımlı değil (GAME_WALLET_PRIVATE_KEY)'));
    const job = sendQueue.then(() => withProvider(async p => {
      const token = new ethers.Contract(cfg.tokenAddress, ERC20_ABI, wallet.connect(p));
      const value = ethers.parseUnits(Number(amountAda).toFixed(6), 18);
      const tx = await token.transfer(to, value);
      const rc = await tx.wait(1, 120000);
      if (!rc || rc.status !== 1) throw new Error('İşlem zincirde başarısız: ' + tx.hash);
      return tx.hash;
    }));
    sendQueue = job.catch(() => {});
    return job;
  }

  function verifyLogin(message, signature) {
    return ethers.verifyMessage(message, signature).toLowerCase();
  }

  return { readMarket, latestBlock, scanDeposits, sendAda, verifyLogin, gameWallet, canSend: !!wallet };
}
