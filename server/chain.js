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
// (bir de bekçili, 7 gün bekleyen "yeni kasaya geçiş": ödemelere değil, kasanın kendisini taşımaya yarar; chain.checkVault bekleyen öneriyi görünce ödemeleri durdurur)
const VAULT_ABI = [
  'function payPlayer(address to, uint256 amount, bytes32 ref)', 'function burn(uint256 amount, bytes32 ref)', 'function payCreator(uint256 amount, bytes32 ref)',
  'function singleDrawCap() view returns (uint256)', 'function dailyRemaining() view returns (uint256)', 'function paused() view returns (bool)',
  'function activeConfig() view returns (tuple(address dagitici, address creator, uint16 singleDrawBps, uint16 dailyLimitBps))',
  'function deadAddress() view returns (address)', 'function token() view returns (address)',
  'function successor() view returns (address)', 'function successorAt() view returns (uint64)'
];
const FEED_ABI = ['function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)', 'function decimals() view returns (uint8)'];
const PAIR_ABI = ['function getReserves() view returns (uint112,uint112,uint32)', 'function token0() view returns (address)'];

// Oyun Kasası güvenlik sınırları için kararlaştırılan en yüksek değerler (baz puan; 11 Ekim 2026 kararı: günlük %5, tek ödeme %2).
// Zincirdeki kasa bunlardan gevşekse checkVault bunu sorun olarak bildirir ve ödemeler başlamaz.
const VAULT_MAX_DAILY_BPS = 500;
const VAULT_MAX_SINGLE_BPS = 200;

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
      // Yeni kasaya geçiş önerisi var mı (eski sürüm kasalarda bu işlev yoktur: okunamazsa öneri yok sayılır)
      let successor = null;
      try { const s = await v.successor(); if (s !== ethers.ZeroAddress) successor = s.toLowerCase(); } catch { /* successor() olmayan eski kasa */ }
      return { address: vaultAddr, dagitici: cfgNow.dagitici.toLowerCase(), creator: cfgNow.creator.toLowerCase(), singleDrawBps: Number(cfgNow.singleDrawBps), dailyLimitBps: Number(cfgNow.dailyLimitBps),
        capWei, remainingWei, balanceWei, balance: toAda(balanceWei), paused, successor, dead: dead.toLowerCase(), token: tokenOf.toLowerCase(), at: Date.now() };
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
    // Karar (11 Ekim 2026): günlük %5, tek ödeme %2. Yanlış kurulmuş (gevşek) bir kasa sessizce kabul edilmesin (denetim K3).
    const maxGunluk = cfg.vaultMaxDailyBps ?? VAULT_MAX_DAILY_BPS, maxTek = cfg.vaultMaxSingleBps ?? VAULT_MAX_SINGLE_BPS;   // yalnız testler programla gevşetir; ortam değişkeni YOK
    if (v.dailyLimitBps > maxGunluk) problems.push(`kasanın günlük çekim sınırı %${v.dailyLimitBps / 100} (kararlaştırılan en çok %${maxGunluk / 100})`);
    if (v.singleDrawBps > maxTek) problems.push(`kasanın tek ödeme sınırı %${v.singleDrawBps / 100} (kararlaştırılan en çok %${maxTek / 100})`);
    // Sahip "yeni kasaya geçiş" önerdiyse (7 gün bekler): yanlış anahtar kullanımı olabilir; yönetici bakana kadar ödemeler başlamaz.
    if (v.successor) problems.push(`kasada yeni kasaya geçiş önerisi var (${v.successor}); bekçi ya da yönetici inceleyene kadar ödemeler durur`);
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
  //
  // 13 Ekim 2026 denetimi (W1): eskiden "sıra numarası kullanılmış + makbuz yok → failed → yeniden gönder" idi. Yük dengeli
  // (arkasında birkaç düğüm olan) bir RPC adresinde makbuz sorusu geride kalmış bir düğüme, sıra numarası sorusu ilerideki
  // düğüme gidebilir: işlem aslında işlenmiştir ama "işlenmedi" sanılır ve ÇİFT ÖDEME doğardı. Para kaybolmasın diye karar
  // artık "failed" için ŞUNLARIN HEPSİNİ ister; biri bile belirsizse 'waiting' (satır "sending"de kalır, yönetici panelinde
  // mutabakat yapılır — YANLIŞ "failed"in bedeli çift ödeme, YANLIŞ "waiting"in bedeli yalnız gecikme):
  //   1. TÜM RPC adreslerinden makbuz sorusu yanıt verdi ve hiçbirinde işlemin makbuzu ya da kaydı yok (biri bile hata verirse belirsiz)
  //   2. TÜM RPC adreslerinde bu cüzdanın sıra numarası (latest) bu işlemin numarasını GEÇMİŞ (başka işlem bu sırayı almış)
  //   3. imzalamanın üzerinden en az PAYOUT_FAIL_MIN_AGE_MS geçmiş (geride kalan düğümler yetişsin)
  //   4. beklenen ödeme olayı (Transfer / PlayerPaid / Burned / CreatorPaid / Paid) zincirde taranmış ve bulunmamış;
  //      bulunduysa başka bir işlemde de olsa 'failed' denmez: aynı işlem sayılır ('sent') ya da belirsiz kalır ('waiting')
  // `expect` verilmezse (yerel AVAX gönderimi gibi olay bırakmayan işlemler) 4. koşul atlanır, 1-3 yine geçerli olmalıdır.
  //   expect: { transfer: { from, to, amount } } | { vaultRef: { kind, ref } } | { paidRef }
  const PAYOUT_FAIL_MIN_AGE_MS = 10 * 60 * 1000;
  const MAX_SCAN_BLOCKS = 100000;          // en çok bu kadar blok geriye taranır (2000'lik parçalarla ~50 istek / RPC)
  const scanMemo = new Map();              // imzalı işlem özeti → son tarama sonucu (aynı satır her turda yeniden taranmasın)
  const evIface = new ethers.Interface([...ERC20_ABI.filter(x => x.startsWith('event')),
    'event PlayerPaid(address indexed to, uint256 amount, bytes32 indexed ref)', 'event Burned(uint256 amount, bytes32 indexed ref)',
    'event CreatorPaid(uint256 amount, bytes32 indexed ref)', 'event Paid(address indexed payer, bytes32 indexed ref, uint256 amount, uint256 fee)']);
  const refTopic = ref => ethers.zeroPadValue(typeof ref === 'string' && ref.startsWith('0x') ? ref : ethers.toBeHex(Number(ref) || 0), 32);
  const hepsi = fn => Promise.all(providers.map(p => Promise.resolve().then(() => fn(p)).then(v => ({ ok: true, v }), e => ({ ok: false, e }))));

  // Beklenen ödeme olayı bu penceredeki bloklarda var mı: 'ours' (bizim işlemimiz) | 'other' (aynı olay başka işlemde) | 'none' | 'error'
  async function scanExpectation(expect, hash, sinceMs) {
    const spec = [];
    const tokenA = String(cfg.tokenAddress || '');
    if (expect.transfer) {
      const t = expect.transfer;
      const value = ethers.parseUnits(Number(t.amount).toFixed(6), 18);
      spec.push({ address: tokenA, topics: [evIface.getEvent('Transfer').topicHash, ethers.zeroPadValue(t.from, 32), ethers.zeroPadValue(t.to, 32)], match: l => evIface.parseLog(l).args.value === value });
    } else if (expect.vaultRef && vaultAddr) {
      const { kind, ref } = expect.vaultRef;
      const ev = kind === 'withdraw' ? 'PlayerPaid' : kind === 'burn' ? 'Burned' : kind === 'creator' ? 'CreatorPaid' : null;
      if (!ev) return 'none';
      const topics = [evIface.getEvent(ev).topicHash];
      if (ev === 'PlayerPaid') topics.push(null);
      topics.push(refTopic(ref));
      spec.push({ address: vaultAddr, topics, match: () => true });
    } else if (expect.paidRef && cfg.paymentsContract) {
      spec.push({ address: String(cfg.paymentsContract), topics: [evIface.getEvent('Paid').topicHash, null, refTopic(expect.paidRef)], match: () => true });
    } else return 'none';
    const age = Math.max(0, Date.now() - (Number(sinceMs) || 0));
    const sonuc = await hepsi(async p => {
      const latest = await p.getBlockNumber();
      const geri = sinceMs ? Math.min(MAX_SCAN_BLOCKS, Math.ceil(age / 1000) + 2000) : MAX_SCAN_BLOCKS;   // blok süresi >= 1 sn varsayımıyla üst sınır
      const from = Math.max(0, latest - geri);
      let other = false;
      for (const sp of spec) {
        for (let b = from; b <= latest; b += 2000) {
          const logs = await p.getLogs({ address: sp.address, topics: sp.topics, fromBlock: b, toBlock: Math.min(latest, b + 1999) });
          for (const l of logs) {
            if (!sp.match(l)) continue;
            if (String(l.transactionHash).toLowerCase() === String(hash).toLowerCase()) return 'ours';
            // pencerenin dışındaki (imzalamadan önceki) eski eşdeğer olaylar sayılmaz
            const blk = sinceMs ? await p.getBlock(l.blockNumber).catch(() => null) : null;
            if (!sinceMs || (blk && blk.timestamp * 1000 >= sinceMs - 120000)) other = true;
          }
        }
      }
      return other ? 'other' : 'none';
    });
    if (sonuc.some(r => r.ok && r.v === 'ours')) return 'ours';
    if (sonuc.some(r => !r.ok)) return 'error';
    if (sonuc.some(r => r.v === 'other')) return 'other';
    return 'none';
  }

  async function checkPayout({ hash, raw, nonce, from = null, since = 0, expect = null, minAgeMs = PAYOUT_FAIL_MIN_AGE_MS, now = Date.now() }) {
    const sender = from || (wallet && wallet.address);
    // 1) Herhangi bir RPC'de makbuz varsa kesin
    const rcs = await hepsi(p => p.getTransactionReceipt(hash));
    const var_ = rcs.find(r => r.ok && r.v);
    if (var_) return var_.v.status === 1 ? 'sent' : 'failed';   // zincirde başarısız (geri alınmış) işlemde para hareket etmemiştir
    // 2) İşlem ağda biliniyor mu (bekleyen ya da yeni işlenmiş, makbuz henüz yayılmamış)
    const txs = await hepsi(p => p.getTransaction(hash));
    if (txs.some(r => r.ok && r.v)) return 'waiting';
    // 3) Bütün RPC adresleri yanıt vermeli: biri çökmüşse "yok" demek için yeterli kanıt yok
    if (rcs.some(r => !r.ok) || txs.some(r => !r.ok)) return 'waiting';
    // 4) Sıra numarası: hiçbir RPC'de kullanılmamışsa işlem henüz işlenmemiştir → aynı imzalı işlemi yeniden yay
    const sayilar = await hepsi(p => p.getTransactionCount(sender, 'latest'));
    if (sayilar.some(r => !r.ok)) return 'waiting';
    const enAz = Math.min(...sayilar.map(r => Number(r.v)));
    if (!Number.isInteger(nonce) || !(enAz > nonce)) {
      if (raw) await broadcast(raw).catch(() => {});                // düşmüş olabilir: aynı işlemi yeniden yay
      return 'waiting';
    }
    // 5) Yaş eşiği: geride kalan düğümlere yetişme süresi
    if (since && now - since < minAgeMs) return 'waiting';
    // 6) Ödeme olayı taraması: para gerçekten gitmişse "işlenmedi" denmez
    if (expect) {
      const anahtar = String(hash).toLowerCase();
      const memo = scanMemo.get(anahtar);
      let r = memo && now - memo.at < 5 * 60000 ? memo.r : null;
      if (!r) {
        r = await scanExpectation(expect, hash, since).catch(() => 'error');
        if (scanMemo.size > 500) scanMemo.clear();
        scanMemo.set(anahtar, { at: now, r });
      }
      if (r === 'ours') return 'sent';
      if (r !== 'none') return 'waiting';                           // 'other' ya da 'error': belirsiz, yönetici bakar
    }
    return 'failed';
  }

  function verifyLogin(message, signature) {
    return ethers.verifyMessage(message, signature).toLowerCase();
  }

  // Ödeme sözleşmesi (RealmPayments) işlemini doğrular: başarılı mı, kim ödedi, referans, miktar
  const payIface = new ethers.Interface(['event Paid(address indexed payer, bytes32 indexed ref, uint256 amount, uint256 fee)']);
  // wantRef verilirse işlemdeki o referanslı Paid olayı seçilir (aynı işlemde birden çok ödeme olabilir: hepsi ayrı ayrı kredilenir).
  // Dönen `amount`, oyun cüzdanına GERÇEKTEN ulaşan miktarla sınırlıdır: ücret kesen / yakan bir token'da sözleşmenin
  // bildirdiği miktardan az gelir; eksik gelen kredilenmez (fazla kredi = bedava ASTRA), gelen kısım kaybolmaz.
  // Reddedilen ödemeler `rejected: true` ile işaretlenir (geçici RPC hatasından ayırt edilsin diye).
  async function verifyPayment(txHash, wantRef = null) {
    const rc = await withProvider(p => p.getTransactionReceipt(txHash));
    if (!rc) return null;
    const reddet = msg => Object.assign(new Error(msg), { rejected: true });
    if (rc.status !== 1) throw reddet('İşlem zincirde başarısız');
    const contract = String(cfg.paymentsContract || '').toLowerCase();
    const tokenA = String(cfg.tokenAddress || '').toLowerCase();
    const treasury = String(cfg.treasuryAddress || gameWallet || '').toLowerCase();
    const erc = new ethers.Interface(ERC20_ABI);
    const paid = [];                          // sözleşmenin Paid olayları (sırayla)
    const received = new Map();               // ödeyen → hazineye giden toplam (wei); Sözleşme sahibinin anahtarı çalınıp hazine adresi değiştirilirse buraya hiçbir şey düşmez
    for (const l of rc.logs) {
      const addr = l.address.toLowerCase();
      if (addr === contract) {
        let ev = null;
        try { ev = payIface.parseLog(l); } catch { ev = null; }
        if (ev && ev.name === 'Paid') paid.push({ payer: ev.args.payer.toLowerCase(), ref: ev.args.ref, amount: ev.args.amount, fee: ev.args.fee });
      } else if (addr === tokenA) {
        let tr = null;
        try { tr = erc.parseLog(l); } catch { tr = null; }
        if (tr && tr.name === 'Transfer' && (!treasury || tr.args.to.toLowerCase() === treasury)) {
          const k = tr.args.from.toLowerCase();
          received.set(k, (received.get(k) || 0n) + tr.args.value);
        }
      }
    }
    if (!paid.length) throw reddet('Bu işlemde ödeme bulunamadı');
    // Ödeyen başına ulaşan toplam, o ödeyenin Paid olaylarına sırayla dağıtılır (bir aktarım iki ödemede sayılmaz)
    const havuz = new Map(received);
    const sonuc = paid.map(pd => {
      const kalan = havuz.get(pd.payer) || 0n;
      const kredi = kalan < pd.amount ? kalan : pd.amount;
      havuz.set(pd.payer, kalan - kredi);
      return { ...pd, kredi };
    });
    const secilen = wantRef ? sonuc.find(x => String(x.ref).toLowerCase() === String(wantRef).toLowerCase()) : sonuc[0];
    if (!secilen) throw reddet('Bu işlemde istenen referansla ödeme yok');
    if (secilen.kredi <= 0n) throw reddet('Ödeme oyun cüzdanına gitmemiş');
    return { contract, payer: secilen.payer, ref: secilen.ref, amount: toAda(secilen.kredi), declared: toAda(secilen.amount),
      fee: Number(ethers.formatEther(secilen.fee)), block: rc.blockNumber, multi: paid.length > 1 };
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
        'function paused() view returns (bool)', 'function treasury() view returns (address)', 'function feeReceiver() view returns (address)',
        'function pendingTreasury() view returns (address)', 'function pendingFeeReceiver() view returns (address)', 'function configEffectiveAt() view returns (uint64)'], p);
      const [owner, pendingOwner, paused, treasury, feeReceiver, pendingTreasury, pendingFeeReceiver, configEffectiveAt] =
        await Promise.all([c.owner(), c.pendingOwner(), c.paused(), c.treasury(), c.feeReceiver(), c.pendingTreasury(), c.pendingFeeReceiver(), c.configEffectiveAt()]);
      // Bekleyen adres değişikliği (24 saat gecikmeli, K5): yoksa configPending null
      const at = Number(configEffectiveAt) * 1000;
      return { owner: owner.toLowerCase(), pendingOwner: pendingOwner.toLowerCase(), paused, treasury: treasury.toLowerCase(), feeReceiver: feeReceiver.toLowerCase(),
        configPending: at ? { treasury: pendingTreasury.toLowerCase(), feeReceiver: pendingFeeReceiver.toLowerCase(), at } : null, at: Date.now() };
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
