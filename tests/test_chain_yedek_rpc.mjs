// server/chain.js: RPC yedeğe geçiş, yatırma taraması (parçalı, ödeme sözleşmesi üzerinden gelenler elenir), ortak gelir taraması
// Gerçek ağa çıkılmaz: sahte sağlayıcılar `providerFactory` ile verilir (kurumsal A3.6).
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { createChain } from '../server/chain.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

const TOKEN = '0x' + 'aa'.repeat(20);
const OYUN = '0x' + 'bb'.repeat(20);
const OYUNCU = '0x' + 'cc'.repeat(20);
const ERC20 = new ethers.Interface(['event Transfer(address indexed from, address indexed to, uint256 value)']);

// Sahte günlük kaydı: OYUNCU → OYUN'a `miktar` ADASTRA
function sahteLog(miktar, blok, indeks, tx) {
  const { topics, data } = ERC20.encodeEventLog('Transfer', [OYUNCU, OYUN, ethers.parseUnits(String(miktar), 18)]);
  return { topics, data, index: indeks, blockNumber: blok, transactionHash: tx };
}
const cfgOf = ek => ({ rpcUrls: ['rpc://bir', 'rpc://iki', 'rpc://uc'], chainId: 43114, tokenAddress: TOKEN, gameWalletAddress: OYUN, gameWalletKey: '', ...ek });
function fabrika(sahteler) { const bag = new Map(Object.entries(sahteler)); return u => bag.get(u); }

// 1) Bir düğüm yanıt vermezse sıradakine geçer; çalışan düğümde kalır (sonraki çağrılar çöken düğümü beklemez)
{
  const cagri = { bir: 0, iki: 0, uc: 0 };
  const sahte = {
    'rpc://bir': { getBlockNumber: async () => { cagri.bir++; throw new Error('bir çöktü'); } },
    'rpc://iki': { getBlockNumber: async () => { cagri.iki++; return 1234; } },
    'rpc://uc': { getBlockNumber: async () => { cagri.uc++; return 9999; } }
  };
  const c = createChain(cfgOf({}), { providerFactory: fabrika(sahte) });
  assert.equal(await c.latestBlock(), 1234, 'ilk düğüm çöktü: ikincisinden okunur');
  assert.equal(await c.latestBlock(), 1234);
  assert.deepEqual(cagri, { bir: 1, iki: 2, uc: 0 }, 'çalışan düğümde kalır, çöken düğüm tekrar denenmez');
  ok('RPC yedeğe geçiş: çöken düğüm atlanır, çalışan düğüme yapışır');
}

// 2) Hepsi çökerse son hata açıkça fırlatılır
{
  const hep = u => ({ getBlockNumber: async () => { throw new Error('hata ' + u); } });
  const c = createChain(cfgOf({}), { providerFactory: hep });
  await assert.rejects(() => c.latestBlock(), /hata rpc:\/\/uc/, 'son düğümün hatası döner');
  ok('bütün düğümler çökerse hata yutulmaz');
}

// 3) Yatırma taraması: blok aralığı parçalanır, yalnız doğrudan token sözleşmesine yapılanlar sayılır
{
  const aralik = [];
  const sahte = {
    getLogs: async f => {
      aralik.push([f.fromBlock, f.toBlock]);
      if (f.fromBlock === 0) return [sahteLog(500, 10, 0, '0xdogrudan'), sahteLog(700, 11, 1, '0xsozlesmeUzerinden')];
      return [];
    },
    getTransaction: async h => (h === '0xdogrudan' ? { to: TOKEN } : { to: '0x' + 'dd'.repeat(20) })   // ikincisi ödeme sözleşmesi vb.
  };
  const c = createChain(cfgOf({}), { providerFactory: () => sahte });
  const out = await c.scanDeposits(0, 4500, 2000);
  assert.deepEqual(aralik, [[0, 1999], [2000, 3999], [4000, 4500]], 'public RPC sınırı için 2000 blokluk parçalar');
  assert.equal(out.length, 1, 'sözleşme üzerinden gelen aktarım yatırma sayılmaz (çift yazma önlemi)');
  assert.deepEqual([out[0].txHash, out[0].amount, out[0].block, out[0].from], ['0xdogrudan', 500, 10, OYUNCU]);
  ok('yatırma taraması: parçalı, çift yazmayı önler, tutarı doğru çözer');
}

// 4) Oyun cüzdanı yoksa tarama boş; ortak gelir taraması boş girdide zincire gitmez
{
  let cagri = 0;
  const sahte = { getLogs: async () => { cagri++; return []; }, getTransaction: async () => null };
  const c = createChain(cfgOf({ gameWalletAddress: '' }), { providerFactory: () => sahte });
  assert.deepEqual(await c.scanDeposits(0, 100), []);
  assert.deepEqual(await c.scanTransfers([], OYUN, 0, 100), []);
  assert.deepEqual(await c.scanTransfers([OYUNCU], '', 0, 100), []);
  assert.equal(cagri, 0, 'boş girdilerde zincire hiç gidilmez');
  ok('cüzdan/adres yoksa tarama zincire gitmeden boş döner');
}

// 5) Ortak gelir taraması: belirli cüzdanlardan gelenleri tutarıyla döndürür
{
  const sahte = { getLogs: async () => [sahteLog(25, 42, 3, '0xortak')], getTransaction: async () => null };
  const c = createChain(cfgOf({}), { providerFactory: () => sahte });
  const out = await c.scanTransfers([OYUNCU], OYUN, 0, 100, 2000);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].txHash, out[0].amount, out[0].block, out[0].logIndex], ['0xortak', 25, 42, 3]);
  ok('ortak gelir taraması: tutar, blok ve sıra numarası doğru');
}

console.log(`\n${passed}/5 zincir testi geçti`);
