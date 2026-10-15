// Genesis NFT sözleşmesi (contracts/GenesisNFT.sol, makro plan Aşama 2): sahte zincirde (ganache).
//   1) Kurulum: sezon tavanı sabit, basım anahtarı zorunlu; ERC-165/721/Metadata arayüzleri
//   2) Basım: yalnız minter; numara 1..tavan; aynı numara ikinci kez basılamaz; sahiplik ve sayaçlar
//   3) Devir: sahip, onaylı ve operatör devredebilir; yabancı devredemez; onay devirle silinir
//   4) Güvenli devir: alıcı sözleşme doğru cevap vermezse geri çevrilir
//   5) Yönetim: minter değişimi, adres (tokenURI) sabitleme, iki adımlı sahiplik devri
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { ethers } from 'ethers';
import { compile } from '../contracts/compile.mjs';

let gecen = 0;
const ok = n => { gecen++; console.log(`✅ ${n}`); };

const keys = Array.from({ length: 5 }, () => ethers.Wallet.createRandom().privateKey);
const PORT = 23545 + Math.floor(Math.random() * 1000);
const node = ganache.server({ logging: { quiet: true }, wallet: { accounts: keys.map(k => ({ secretKey: k, balance: '0x' + (10n ** 21n).toString(16) })) }, chain: { chainId: 43113 } });
await node.listen(PORT);
try {
  const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${PORT}`, 43113, { staticNetwork: true, cacheTimeout: -1 });
  const [sahip, sunucu, ayse, bora, yabanci] = keys.map(k => new ethers.Wallet(k, provider));
  const c = compile();
  const fabrika = new ethers.ContractFactory(c.GenesisNFT.abi, c.GenesisNFT.bytecode, sahip);

  // 1) Kurulum
  await assert.rejects(fabrika.deploy(0, sunucu.address, 'ipfs://x/'), /BadSeasonCap|revert|execution/, 'tavan 0 olamaz');
  await assert.rejects(fabrika.deploy(10001, sunucu.address, 'ipfs://x/'), /BadSeasonCap|revert|execution/, 'tavan en çok 10.000');
  await assert.rejects(fabrika.deploy(100, ethers.ZeroAddress, 'ipfs://x/'), /ZeroAddress|revert|execution/, 'basım anahtarı zorunlu');
  const nft = await (await fabrika.deploy(100, sunucu.address, 'https://roa.alphavaxtrade.com/genesis/')).waitForDeployment();
  assert.equal(await nft.name(), 'RoA Genesis');
  assert.equal(await nft.symbol(), 'ROAG');
  assert.equal(await nft.SEASON_CAP(), 100n);
  assert.equal(await nft.owner(), sahip.address);
  assert.equal(await nft.minter(), sunucu.address);
  for (const id of ['0x01ffc9a7', '0x80ac58cd', '0x5b5e139f']) assert.equal(await nft.supportsInterface(id), true, id);
  assert.equal(await nft.supportsInterface('0xffffffff'), false);
  ok('Kurulum: sezon tavanı 100 sabit, basım anahtarı zorunlu, ERC-165/721/Metadata');

  // 2) Basım
  const s = nft.connect(sunucu);
  await assert.rejects(nft.connect(yabanci).mint(ayse.address, 1), /NotMinter|revert/, 'yalnız sunucu basar');
  await assert.rejects(nft.mint(ayse.address, 1), /NotMinter|revert/, 'sahip bile basamaz (yalnız minter)');
  await assert.rejects(s.mint(ayse.address, 0), /BadTokenId|revert/, 'numara 0 olamaz');
  await assert.rejects(s.mint(ayse.address, 101), /BadTokenId|revert/, 'tavan üstü numara olamaz');
  await assert.rejects(s.mint(ethers.ZeroAddress, 1), /ZeroAddress|revert/);
  await (await s.mint(ayse.address, 1)).wait();
  await (await s.mint(ayse.address, 100)).wait();
  await assert.rejects(s.mint(bora.address, 1), /AlreadyMinted|revert/, 'aynı numara ikinci kez basılamaz');
  assert.equal(await nft.ownerOf(1), ayse.address);
  assert.equal(await nft.balanceOf(ayse.address), 2n);
  assert.equal(await nft.totalSupply(), 2n);
  assert.equal(await nft.tokenURI(100), 'https://roa.alphavaxtrade.com/genesis/100');
  await assert.rejects(nft.ownerOf(2), /NonexistentToken|revert/);
  await assert.rejects(nft.tokenURI(2), /NonexistentToken|revert/);
  ok('Basım: yalnız sunucu; numara 1..100; aynı numara ikinci kez yok; sahiplik, sayaç ve adres doğru');

  // 3) Devir
  await assert.rejects(nft.connect(yabanci).transferFrom(ayse.address, yabanci.address, 1), /NotAuthorized|revert/, 'yabancı devredemez');
  await assert.rejects(nft.connect(ayse).transferFrom(bora.address, ayse.address, 1), /WrongFrom|revert/);
  await assert.rejects(nft.connect(ayse).transferFrom(ayse.address, ethers.ZeroAddress, 1), /ZeroAddress|revert/);
  await (await nft.connect(ayse).approve(bora.address, 1)).wait();
  assert.equal(await nft.getApproved(1), bora.address);
  await (await nft.connect(bora).transferFrom(ayse.address, bora.address, 1)).wait();
  assert.equal(await nft.ownerOf(1), bora.address, 'onaylı devretti');
  assert.equal(await nft.getApproved(1), ethers.ZeroAddress, 'onay devirle silindi');
  await (await nft.connect(ayse).setApprovalForAll(yabanci.address, true)).wait();
  await (await nft.connect(yabanci).transferFrom(ayse.address, bora.address, 100)).wait();
  assert.equal(await nft.balanceOf(bora.address), 2n, 'operatör devretti');
  assert.equal(await nft.balanceOf(ayse.address), 0n);
  await assert.rejects(nft.connect(ayse).approve(ayse.address, 1), /NotAuthorized|revert/, 'sahibi olmayan onay veremez');
  ok('Devir: sahip, onaylı ve operatör devreder; yabancı devredemez; onay devirle silinir');

  // 4) Güvenli devir
  const af = new ethers.ContractFactory(c.GenesisAlici.abi, c.GenesisAlici.bytecode, sahip);
  const iyi = await (await af.deploy(true)).waitForDeployment();
  const kotu = await (await af.deploy(false)).waitForDeployment();
  const token = await (await new ethers.ContractFactory(c.MockToken.abi, c.MockToken.bytecode, sahip).deploy()).waitForDeployment();
  const sg = nft.connect(bora).getFunction('safeTransferFrom(address,address,uint256)');
  await assert.rejects(sg(bora.address, await kotu.getAddress(), 1), /UnsafeRecipient|revert/, 'yanlış cevap veren sözleşmeye gitmez');
  await assert.rejects(sg(bora.address, await token.getAddress(), 1), /UnsafeRecipient|revert/, 'alıcı olmayan sözleşmeye gitmez');
  await (await sg(bora.address, await iyi.getAddress(), 1)).wait();
  assert.equal(await nft.ownerOf(1), await iyi.getAddress());
  assert.equal(await iyi.sonToken(), 1n);
  await (await sg(bora.address, ayse.address, 100)).wait();
  assert.equal(await nft.ownerOf(100), ayse.address, 'kişi cüzdanına güvenli devir');
  ok('Güvenli devir: alıcı sözleşme doğru cevap vermezse geri çevrilir; kişi cüzdanına gider');

  // 5) Yönetim
  await assert.rejects(nft.connect(yabanci).setMinter(yabanci.address), /NotOwner|revert/);
  await assert.rejects(nft.setMinter(ethers.ZeroAddress), /ZeroAddress|revert/);
  await (await nft.setMinter(bora.address)).wait();
  await assert.rejects(s.mint(ayse.address, 5), /NotMinter|revert/, 'eski basım anahtarı artık basamaz');
  await (await nft.connect(bora).mint(ayse.address, 5)).wait();
  await (await nft.setBaseURI('ipfs://genesis/')).wait();
  assert.equal(await nft.tokenURI(5), 'ipfs://genesis/5');
  await (await nft.freezeBaseURI()).wait();
  await assert.rejects(nft.setBaseURI('https://kotu/'), /Frozen|revert/, 'sabitlenen adres değişmez');
  await assert.rejects(nft.connect(yabanci).transferOwnership(yabanci.address), /NotOwner|revert/);
  await (await nft.transferOwnership(ayse.address)).wait();
  assert.equal(await nft.owner(), sahip.address, 'kabul edilene dek eski sahip');
  await assert.rejects(nft.connect(bora).acceptOwnership(), /NotPendingOwner|revert/);
  await (await nft.connect(ayse).acceptOwnership()).wait();
  assert.equal(await nft.owner(), ayse.address);
  await assert.rejects(nft.setMinter(sahip.address), /NotOwner|revert/, 'eski sahip yetkisiz');
  assert.equal(await nft.SEASON_CAP(), 100n, 'tavan değişmez');
  ok('Yönetim: basım anahtarı değişimi, adres sabitleme (geri alınamaz), iki adımlı sahiplik devri');
} finally {
  await node.close();
}
console.log(`\n${gecen} Genesis NFT sözleşme kontrolü geçti.`);
process.exit(0);
