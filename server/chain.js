// Realm of AdAstra sunucusu — Avalanche zinciri: fiyat okuma, yatırma tarama, ADASTRA gönderme
// ============================================================================
// Oyun cüzdanının gizli anahtarı yalnız ortam değişkeninden (GAME_WALLET_PRIVATE_KEY) okunur; koda,
// kayıtlara ve günlüklere asla yazılmaz. Anahtar yoksa sunucu yalnız okur (fiyat, yatırma) ve ödemeleri
// yönetici onayına bırakır.
// ============================================================================
import { ethers } from 'ethers';
import { RATE_COUNT } from '../js/economy/rates.js';

const TOKEN_MANAGER_ABI = [
  'function getTokenParameters(uint256) view returns (tuple(uint128 curveScaler,uint16 a,uint8 b,bool lpDeployed,uint8 lpPercentage,uint8 salePercentage,uint8 creatorFeeBasisPoints,address creatorAddress,address pairAddress,address tokenContractAddress))'
];
const ERC20_ABI = [
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];
// Oyun Kasası (contracts/OyunKasasi.sol): tek yönlü kilit; çıkış yalnız bu üç fonksiyonla ve dağıtıcı anahtarıyla
const VAULT_ABI = [
  'function payPlayer(address to, uint256 amount, bytes32 ref)', 'function burn(uint256 amount, bytes32 ref)', 'function payCreator(uint256 amount, bytes32 ref)',
  'function singleDrawCap() view returns (uint256)', 'function dailyRemaining() view returns (uint256)', 'function paused() view returns (bool)',
  'function activeConfig() view returns (tuple(address dagitici, address creator, uint16 singleDrawBps, uint16 dailyLimitBps))',
  'function deadAddress() view returns (address)', 'function token() view returns (address)'
];
const FEED_ABI = ['function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)', 'function decimals() view returns (uint8)'];
const PAIR_ABI = ['function getReserves() view returns (uint112,uint112,uint32)', 'function token0() view returns (address)'];

const toAda = v => Number(ethers.formatUnits(v, 18));

// providerFactory: testlerde sahte sağlayıcı vermek için (varsayılan: gerçek JSON-RPC)
export function createChain(cfg, { providerFactory } = {}) {
  // Önbellek kapalı (cacheTimeout -1): işlemden hemen sonra okunan bakiye eski çıkmasın
  const yap = providerFactory || (u => new ethers.JsonRpcProvider(u, cfg.chainId, { staticNetwork: true, cacheTimeout: -1 }));
  const providers = cfg.rpcUrls.map(u => yap(u.trim()));
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
  // Kasa modu (VAULT_CONTRACT): oyunun ASTRA'sı düz cüzdanda değil Oyun Kasası sözleşmesinde durur; ödemeler sözleşmeden çıkar.
  const vaultAddr = /^0x[0-9a-fA-F]{40}$/.test(String(cfg.vaultContract || '')) ? String(cfg.vaultContract).toLowerCase() : '';
  const holder = vaultAddr || gameWallet;     // piyasa okumasında "oyunun elindeki ASTRA" kimde

  async function readMarket() {
    return withProvider(async p => {
      const tm = new ethers.Contract(cfg.tokenManager, TOKEN_MANAGER_ABI, p);
      const token = new ethers.Contract(cfg.tokenAddress, ERC20_ABI, p);
      const feed = new ethers.Contract(cfg.avaxUsdFeed, FEED_ABI, p);
      const [prm, supplyW, deadW, round, feedDec, walletW] = await Promise.all([
        tm.getTokenParameters(cfg.tokenId), token.totalSupply(), token.balanceOf(cfg.deadAddress),
        feed.latestRoundData(), feed.decimals(), holder ? token.balanceOf(holder) : Promise.resolve(0n)
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
        // Ödeme sözleşmesi üzerinden gelen aktarım yatırma DEĞİLDİR (o, ödeme olarak ayrıca işlenir): çift yazmayı önle
        const tx = await withProvider(p => p.getTransaction(l.transactionHash)).catch(() => null);
        if (!tx || String(tx.to || '').toLowerCase() !== String(cfg.tokenAddress).toLowerCase()) continue;
        out.push({ txHash: l.transactionHash, logIndex: l.index, from: ev.args.from.toLowerCase(), amount: toAda(ev.args.value), block: l.blockNumber });
      }
    }
    return out;
  }

  // Belirli cüzdanlardan belirli bir adrese gelen ADASTRA transferleri (ortak gelir: trade sitesi)
  async function scanTransfers(fromAddrs, toAddr, fromBlock, toBlock, step = 2000) {
    if (!toAddr || !fromAddrs || !fromAddrs.length) return [];
    const iface = new ethers.Interface(ERC20_ABI);
    const topic = iface.getEvent('Transfer').topicHash;
    const fromTopics = fromAddrs.map(a => ethers.zeroPadValue(a, 32));
    const toTopic = ethers.zeroPadValue(toAddr, 32);
    const out = [];
    for (let b = fromBlock; b <= toBlock; b += step) {
      const e = Math.min(toBlock, b + step - 1);
      const logs = await withProvider(p => p.getLogs({ address: cfg.tokenAddress, topics: [topic, fromTopics, toTopic], fromBlock: b, toBlock: e }));
      for (const l of logs) {
        const ev = iface.parseLog(l);
        out.push({ txHash: l.transactionHash, logIndex: l.index, from: ev.args.from.toLowerCase(), amount: toAda(ev.args.value), block: l.blockNumber });
      }
    }
    return out;
  }

  const erc20 = new ethers.Interface(ERC20_ABI);
  const vaultIface = new ethers.Interface(VAULT_ABI);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ADASTRA gönderimi — ÇİFT ÖDEME OLMAYACAK şekilde:
  //  1. İşlem önce imzalanır; kimliği (hash), ham hali ve sıra numarası (nonce) onSigned ile KAYDA yazılır.
  //  2. Sonra zincire gönderilir. Aynı imzalı işlemi tekrar göndermek zararsızdır (zincir bir kez işler);
  //     bağlantı hatasında yedek bağlantıdan AYNI işlem yeniden gönderilir, asla yeni işlem yazılmaz.
  //  3. Onay beklenir; gelmezse kayıt "gönderiliyor" kalır ve checkPayout() ile zincirden sonuçlandırılır.
  function sendAda(to, amountAda, onSigned = () => {}) {
    if (!wallet) return Promise.reject(new Error('Oyun cüzdanı anahtarı tanımlı değil (GAME_WALLET_PRIVATE_KEY)'));
    const value = ethers.parseUnits(Number(amountAda).toFixed(6), 18);
    return sendTx(wallet, { to: cfg.tokenAddress, data: erc20.encodeFunctionData('transfer', [to, value]) }, onSigned);
  }

  // Herhangi bir cüzdandan (oyun cüzdanı ya da oyuncu kasası) aynı güvenli akışla işlem: imzala → kaydet → yay → bekle.
  // Aynı cüzdanın işlemleri sırayla gider (sıra numarası çakışmasın).
  const queues = new Map();
  function sendTx(signer, fields, onSigned = () => {}) {
    const key = signer.address.toLowerCase();
    const prev = queues.get(key) || Promise.resolve();
    const job = prev.then(async () => {
      const req = await withProvider(p => signer.connect(p).populateTransaction({ ...fields, chainId: cfg.chainId }));
      const raw = await signer.signTransaction(req);
      const hash = ethers.keccak256(raw);
      onSigned({ hash, raw, nonce: Number(req.nonce) });
      await broadcast(raw);
      for (let i = 0; i < 40; i++) {                         // ~2 dakika onay bekle
        const rc = await withProvider(p => p.getTransactionReceipt(hash)).catch(() => null);
        if (rc) {
          if (rc.status !== 1) { const e = new Error('İşlem zincirde başarısız: ' + hash); e.txHash = hash; e.reverted = true; throw e; }
          return hash;
        }
        await sleep(3000);
      }
      const e = new Error('Onay zaman aşımı: ' + hash); e.txHash = hash; throw e;
    });
    queues.set(key, job.catch(() => {}));
    return job;
  }

  // Aynı imzalı işlemi bağlantılara gönder; "zaten biliniyor" yanıtları sorun değil
  async function broadcast(raw) {
    let lastErr = null;
    for (const p of providers) {
      try { await p.broadcastTransaction(raw); return; }
      catch (e) { lastErr = e; if (/already known|nonce too low|known transaction/i.test(String(e.message))) return; }
    }
    if (lastErr) throw lastErr;
  }

  // Oyun Kasası: canlı durum (bakiye, tek ödeme tavanı, günlük kalan, durdurma, dağıtıcı/yapımcı) — bakiyeler wei olarak da verilir
  async function readVault() {
    if (!vaultAddr) return null;
    return withProvider(async p => {
      const v = new ethers.Contract(vaultAddr, VAULT_ABI, p);
      const token = new ethers.Contract(cfg.tokenAddress, ERC20_ABI, p);
      const [cfgNow, capWei, remainingWei, paused, dead, tokenOf, balanceWei] = await Promise.all([v.activeConfig(), v.singleDrawCap(), v.dailyRemaining(), v.paused(), v.deadAddress(), v.token(), token.balanceOf(vaultAddr)]);
      return { address: vaultAddr, dagitici: cfgNow.dagitici.toLowerCase(), creator: cfgNow.creator.toLowerCase(), singleDrawBps: Number(cfgNow.singleDrawBps), dailyLimitBps: Number(cfgNow.dailyLimitBps),
        capWei, remainingWei, balanceWei, balance: toAda(balanceWei), paused, dead: dead.toLowerCase(), token: tokenOf.toLowerCase(), at: Date.now() };
    });
  }

  // Kasa bu sunucuya uygun mu: aynı token, aynı ölü adres, dağıtıcı = oyun cüzdanı, yapımcı = oyunun yapımcı cüzdanı
  async function checkVault(creatorWallet) {
    const v = await readVault();
    const problems = [];
    if (v.token !== String(cfg.tokenAddress).toLowerCase()) problems.push('kasanın token adresi oyundaki ASTRA adresiyle aynı değil');
    if (v.dead !== String(cfg.deadAddress).toLowerCase()) problems.push('kasanın yakım adresi oyundakiyle aynı değil');
    if (!gameWallet || v.dagitici !== gameWallet) problems.push('kasadaki dağıtıcı anahtar oyun cüzdanı değil');
    if (creatorWallet && v.creator !== String(creatorWallet).toLowerCase()) problems.push('kasadaki yapımcı adresi oyunun yapımcı cüzdanı değil');
    return { ok: problems.length === 0, problems, vault: v };
  }

  // Kasadan ödeme: çekim → payPlayer, yakım → burn, yapımcı → payCreator. Aynı güvenli akış (imzala → kaydet → yay → bekle);
  // ref = ödeme satırı numarası (zincirdeki olaylardan eşleştirilsin).
  function sendVault(kind, to, amountAda, refId, onSigned = () => {}) {
    if (!wallet) return Promise.reject(new Error('Oyun cüzdanı anahtarı tanımlı değil (GAME_WALLET_PRIVATE_KEY)'));
    if (!vaultAddr) return Promise.reject(new Error('Kasa sözleşmesi tanımlı değil (VAULT_CONTRACT)'));
    const value = ethers.parseUnits(Number(amountAda).toFixed(6), 18);
    const ref = ethers.zeroPadValue(ethers.toBeHex(Number(refId) || 0), 32);
    const data = kind === 'withdraw' ? vaultIface.encodeFunctionData('payPlayer', [to, value, ref])
      : kind === 'burn' ? vaultIface.encodeFunctionData('burn', [value, ref])
        : kind === 'creator' ? vaultIface.encodeFunctionData('payCreator', [value, ref]) : null;
    if (!data) return Promise.reject(new Error('Kasa modunda bu ödeme türü yok: ' + kind));
    return sendTx(wallet, { to: vaultAddr, data }, onSigned);
  }

  // "Gönderiliyor" kalmış bir ödemenin zincirdeki durumu: 'sent' | 'failed' (tekrar gönderilebilir) | 'waiting'
  async function checkPayout({ hash, raw, nonce, from = null }) {
    const rc = await withProvider(p => p.getTransactionReceipt(hash)).catch(() => null);
    if (rc) return rc.status === 1 ? 'sent' : 'failed';
    const used = await withProvider(p => p.getTransactionCount(from || wallet.address, 'latest'));
    if (Number.isInteger(nonce) && used > nonce) {
      // Sıra numarası kullanılmış: son bir kez daha bak (yarış durumunda yeni işlenmiş olabilir)
      const rc2 = await withProvider(p => p.getTransactionReceipt(hash)).catch(() => null);
      if (rc2) return rc2.status === 1 ? 'sent' : 'failed';
      return 'failed';
    }
    if (raw) await broadcast(raw).catch(() => {});                    // düşmüş olabilir: aynı işlemi yeniden yay
    return 'waiting';
  }

  function verifyLogin(message, signature) {
    return ethers.verifyMessage(message, signature).toLowerCase();
  }

  // Ödeme sözleşmesi (RealmPayments) işlemini doğrular: başarılı mı, kim ödedi, referans, miktar
  const payIface = new ethers.Interface(['event Paid(address indexed payer, bytes32 indexed ref, uint256 amount, uint256 fee)']);
  async function verifyPayment(txHash) {
    const rc = await withProvider(p => p.getTransactionReceipt(txHash));
    if (!rc) return null;
    if (rc.status !== 1) throw new Error('İşlem zincirde başarısız');
    const contract = String(cfg.paymentsContract || '').toLowerCase();
    for (const l of rc.logs) {
      if (l.address.toLowerCase() !== contract) continue;
      let ev = null;
      try { ev = payIface.parseLog(l); } catch { ev = null; }
      if (ev && ev.name === 'Paid') {
        const payer = ev.args.payer.toLowerCase();
        // Ek güvence: aynı işlemde ADASTRA gerçekten BİZİM oyun cüzdanımıza, ödenen miktarda aktarılmış mı?
        // (Sözleşme sahibinin anahtarı çalınıp hazine adresi değiştirilirse sunucu boşuna bakiye yazmasın.)
        const treasury = String(cfg.treasuryAddress || gameWallet || '').toLowerCase();
        const erc = new ethers.Interface(ERC20_ABI);
        const moved = rc.logs.some(t => {
          if (t.address.toLowerCase() !== String(cfg.tokenAddress).toLowerCase()) return false;
          let tr = null;
          try { tr = erc.parseLog(t); } catch { tr = null; }
          return tr && tr.name === 'Transfer' && tr.args.from.toLowerCase() === payer && (!treasury || tr.args.to.toLowerCase() === treasury) && tr.args.value >= ev.args.amount;
        });
        if (!moved) throw new Error('Ödeme oyun cüzdanına gitmemiş');
        return { contract, payer, ref: ev.args.ref, amount: toAda(ev.args.amount), fee: Number(ethers.formatEther(ev.args.fee)), block: rc.blockNumber };
      }
    }
    throw new Error('Bu işlemde ödeme bulunamadı');
  }

  // Bir adresin ADASTRA ve AVAX bakiyesi
  async function balances(address) {
    return withProvider(async p => {
      const token = new ethers.Contract(cfg.tokenAddress, ERC20_ABI, p);
      const [a, v] = await Promise.all([token.balanceOf(address), p.getBalance(address)]);
      return { ada: toAda(a), avax: Number(ethers.formatEther(v)), at: Date.now() };
    });
  }
  async function gasPrice() {
    return withProvider(async p => (await p.getFeeData()).gasPrice);
  }

  // Ödeme sözleşmesindeki Paid olayları (kurtarma taraması)
  async function scanPaid(fromBlock, toBlock, step = 2000) {
    const contract = String(cfg.paymentsContract || '');
    if (!contract) return [];
    const topic = payIface.getEvent('Paid').topicHash;
    const out = [];
    for (let b = fromBlock; b <= toBlock; b += step) {
      const e = Math.min(toBlock, b + step - 1);
      const logs = await withProvider(p => p.getLogs({ address: contract, topics: [topic], fromBlock: b, toBlock: e }));
      for (const l of logs) {
        const ev = payIface.parseLog(l);
        out.push({ txHash: l.transactionHash, payer: ev.args.payer.toLowerCase(), ref: ev.args.ref, amount: toAda(ev.args.amount), block: l.blockNumber });
      }
    }
    return out;
  }

  // Ödeme sözleşmesinin yönetim bilgisi (sahibi donanım cüzdanında mı?)
  async function readPaymentsAdmin() {
    if (!cfg.paymentsContract) return null;
    return withProvider(async p => {
      const c = new ethers.Contract(cfg.paymentsContract, ['function owner() view returns (address)', 'function pendingOwner() view returns (address)',
        'function paused() view returns (bool)', 'function treasury() view returns (address)', 'function feeReceiver() view returns (address)'], p);
      const [owner, pendingOwner, paused, treasury, feeReceiver] = await Promise.all([c.owner(), c.pendingOwner(), c.paused(), c.treasury(), c.feeReceiver()]);
      return { owner: owner.toLowerCase(), pendingOwner: pendingOwner.toLowerCase(), paused, treasury: treasury.toLowerCase(), feeReceiver: feeReceiver.toLowerCase(), at: Date.now() };
    });
  }

  // RealmRates: geçerli oranlar, bekleyen öneri ve sahibi
  const RATES_ABI = [`function active() view returns (uint16[${RATE_COUNT}])`, `function pending() view returns (uint16[${RATE_COUNT}] rates, uint64 at)`,
    'function owner() view returns (address)', 'function pendingOwner() view returns (address)'];
  async function readRates(address = cfg.ratesContract) {
    if (!address) return null;
    return withProvider(async p => {
      const r = new ethers.Contract(address, RATES_ABI, p);
      const [active, [next, at], owner, pendingOwner] = await Promise.all([r.active(), r.pending(), r.owner(), r.pendingOwner()]);
      return { active: active.map(Number), pending: Number(at) ? next.map(Number) : null, pendingAt: Number(at) * 1000 || 0,
        owner: owner.toLowerCase(), pendingOwner: pendingOwner.toLowerCase(), at: Date.now() };
    });
  }

  return { vaultEnabled: !!vaultAddr, vaultAddress: vaultAddr, readVault, checkVault, sendVault, readRates, scanTransfers, readPaymentsAdmin, scanPaid, sendTx, balances, gasPrice, verifyPayment, readMarket, latestBlock, scanDeposits, sendAda, checkPayout, verifyLogin, gameWallet, canSend: !!wallet };
}
