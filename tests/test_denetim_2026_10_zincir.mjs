// 13 Ekim 2026 denetimi, zincir / para yolu gerileme testleri (hepsi sahte sağlayıcı ve :memory: kayıt; gerçek ağa çıkılmaz):
//   W1    checkPayout: yük dengeli RPC'de gecikmiş makbuz "işlenmedi" sanılıp ÇİFT ÖDEME doğurmasın
//   —     verifyPayment: aynı işlemdeki ikinci Paid kredilenir; ücretli/yakımlı token'da yalnız GERÇEKTEN ulaşan kadar kredi
//   —     log maskesi: ?apikey= / yol içi RPC anahtarı
//   —     sistem hesabı 0 ASTRA ile açılır; 1 ASTRA altı ödeme kaybolmaz (devredilir)
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { createChain } from '../server/chain.js';
import { maskele, createLogger } from '../server/log.js';
import { openDb } from '../server/db.js';
import { createEngine, SYSTEM } from '../server/engine.js';
import { createPayments } from '../server/payments.js';
import { olusturOdemeler } from '../server/world/odemeler.js';
import { loadConfig } from '../server/config.js';

let toplam = 0;
const ok = (ad) => { toplam++; console.log(`✅ ${ad}`); };

const TOKEN = '0x' + 'aa'.repeat(20);
const OYUN = '0x' + 'bb'.repeat(20);                 // hazine / oyun cüzdanı
const OYUNCU = '0x' + 'cc'.repeat(20);
const SOZLESME = '0x' + 'dd'.repeat(20);              // RealmPayments
const KASA = '0x' + 'ee'.repeat(20);                  // OyunKasasi
const GONDERICI_ANAHTAR = '0x' + '11'.repeat(32);
const GONDERICI = new ethers.Wallet(GONDERICI_ANAHTAR).address;
const H = '0x' + '77'.repeat(32);                     // bizim imzalı işlemimiz
const SIMDI = 2_000_000_000_000;                      // sahte "şimdi" (ms)
const DK = 60000;
// NOT: motor süreç başına TEK kez kurulur (oyun kodu modül düzeyinde tekil; ikinci createEngine kaydetme zincirini bozar)
const db = openDb(':memory:');
let T = Date.UTC(2026, 9, 5, 12);
const E = await createEngine(db, { testMode: true, clock: () => T });

// ── Sahte sağlayıcı: her çağrı dışarıdan ayarlanır ──
function sahteSaglayici(ayar = {}) {
  const s = { yayin: 0 };
  s.getTransactionReceipt = async h => { if (ayar.makbuzHata) throw new Error('makbuz sorusu düştü'); return ayar.makbuz ? ayar.makbuz(h) : null; };
  s.getTransaction = async h => (ayar.islem ? ayar.islem(h) : null);
  s.getTransactionCount = async () => { if (ayar.sayiHata) throw new Error('sayı sorusu düştü'); return ayar.sayi ?? 0; };
  s.getBlockNumber = async () => ayar.blok ?? 1_000_000;
  s.getLogs = async f => (ayar.loglar ? ayar.loglar(f) : []);
  s.getBlock = async n => ({ number: n, timestamp: ayar.blokZamani ?? Math.floor(SIMDI / 1000) - 5 * 60 });
  s.broadcastTransaction = async () => { s.yayin++; return {}; };
  return s;
}
const zincir = (saglayicilar, ek = {}) => createChain({ rpcUrls: saglayicilar.map((_, i) => 'rpc://' + i), chainId: 43114, tokenAddress: TOKEN, gameWalletAddress: OYUN,
  gameWalletKey: GONDERICI_ANAHTAR, paymentsContract: SOZLESME, treasuryAddress: OYUN, ...ek }, { providerFactory: u => saglayicilar[Number(u.slice(6))] });
const ERC20 = new ethers.Interface(['event Transfer(address indexed from, address indexed to, uint256 value)']);
const PAY = new ethers.Interface(['event Paid(address indexed payer, bytes32 indexed ref, uint256 amount, uint256 fee)']);
const VAULT = new ethers.Interface(['event PlayerPaid(address indexed to, uint256 amount, bytes32 indexed ref)']);
const wei = v => ethers.parseUnits(String(v), 18);
const transferLog = (from, to, miktar, tx, blok = 999_000) => { const { topics, data } = ERC20.encodeEventLog('Transfer', [from, to, wei(miktar)]); return { address: TOKEN, topics, data, index: 0, blockNumber: blok, transactionHash: tx }; };
const beklenen = { transfer: { from: GONDERICI, to: OYUNCU, amount: 25 } };
const bak = (c, ek = {}) => c.checkPayout({ hash: H, raw: '0xraw', nonce: 5, since: SIMDI - 30 * DK, now: SIMDI, expect: beklenen, ...ek });

// ── W1: checkPayout ──
{
  // Yük dengeli adres: makbuz sorusu geride kalan düğüme (null), sıra numarası ilerideki düğüme (6) gitti. ESKİ KOD burada
  // 'failed' derdi → satır yeniden kuyruğa girer → ikinci ödeme. Yeni kod: yaş eşiği dolmadıysa bekler.
  const gecikmis = sahteSaglayici({ sayi: 6 });
  assert.equal(await bak(zincir([gecikmis]), { since: SIMDI - 2 * DK }), 'waiting', 'yeni imzalanmış (2 dk): geride kalan düğüme zaman tanınır');
  // Yaş eşiği doldu ama aynı işlem zincirde Transfer olayıyla görünüyor (makbuz yayılmamış): ödenmiş sayılır, yeniden gönderilmez
  const olayli = sahteSaglayici({ sayi: 6, loglar: () => [transferLog(GONDERICI, OYUNCU, 25, H)] });
  assert.equal(await bak(zincir([olayli])), 'sent', 'olay bizim işlemimizden: ödendi (eski kod "failed" → çift ödeme)');
  // Aynı olay BAŞKA işlemden (aynı tutar, aynı alıcı): belirsiz, "sending"de kalır (çift ödeme riski, yönetici bakar)
  const baskaIslem = sahteSaglayici({ sayi: 6, loglar: () => [transferLog(GONDERICI, OYUNCU, 25, '0x' + '99'.repeat(32))] });
  assert.equal(await bak(zincir([baskaIslem])), 'waiting', 'aynı alıcıya aynı tutar başka işlemde: otomatik yeniden gönderme yok');
  // İmzalamadan ÖNCEKİ eski bir eşdeğer olay engellemez
  const eski = sahteSaglayici({ sayi: 6, blokZamani: Math.floor(SIMDI / 1000) - 3 * 86400, loglar: () => [transferLog(GONDERICI, OYUNCU, 25, '0x' + '98'.repeat(32), 100)] });
  assert.equal(await bak(zincir([eski])), 'failed', 'imzalamadan günler önceki olay sayılmaz');
  // Gerçekten işlenmemiş: sıra numarası başkasına gitmiş, olay yok, makbuz yok, hiçbir RPC işlemi bilmiyor
  assert.equal(await bak(zincir([sahteSaglayici({ sayi: 6 }), sahteSaglayici({ sayi: 7 })])), 'failed', 'tüm RPC\'ler hemfikir, yaş doldu, olay yok → yeniden gönderilebilir');
  // Zincirde başarısız (geri alınmış) işlem: para hareket etmedi
  assert.equal(await bak(zincir([sahteSaglayici({ makbuz: () => ({ status: 0 }) })])), 'failed');
  assert.equal(await bak(zincir([sahteSaglayici({ makbuz: () => ({ status: 1 }) })])), 'sent');
  ok('W1: gecikmiş makbuz çift ödeme doğurmaz (yaş eşiği, olay taraması); gerçekten işlenmeyen yine yeniden gönderilir');
}
{
  // Birden çok RPC: biri makbuzu görüyorsa kesin; biri çöktüyse ya da geride kaldıysa belirsiz
  const gorur = sahteSaglayici({ sayi: 6, makbuz: () => ({ status: 1 }) });
  const gormez = sahteSaglayici({ sayi: 6 });
  assert.equal(await bak(zincir([gormez, gorur])), 'sent', 'herhangi bir RPC makbuzu görüyorsa gönderilmiş');
  const coken = sahteSaglayici({ makbuzHata: true });
  assert.equal(await bak(zincir([sahteSaglayici({ sayi: 6 }), coken])), 'waiting', 'bir RPC çöktü: "yok" demek için kanıt yetmez');
  const sayiHata = sahteSaglayici({ sayiHata: true });
  assert.equal(await bak(zincir([sahteSaglayici({ sayi: 6 }), sayiHata])), 'waiting');
  const ileri = sahteSaglayici({ sayi: 6 }), geride = sahteSaglayici({ sayi: 5 });   // sıra numarası bir düğümde henüz kullanılmamış
  assert.equal(await bak(zincir([ileri, geride])), 'waiting', 'RPC\'lerden biri sırayı hâlâ kullanılmamış görüyor');
  assert.ok(ileri.yayin + geride.yayin >= 1, 'aynı imzalı işlem yeniden yayıldı (zararsız)');
  const bilinen = sahteSaglayici({ sayi: 6, islem: () => ({ hash: H, blockNumber: null }) });
  assert.equal(await bak(zincir([bilinen])), 'waiting', 'işlem ağda biliniyor (bekleyen): bekle');
  // Hiçbir RPC sırayı kullanmamış: bekleyen işlem, yeniden yayınlanır
  const hic = sahteSaglayici({ sayi: 5 });
  assert.equal(await bak(zincir([hic])), 'waiting');
  assert.ok(hic.yayin >= 1);
  ok('W1: birden çok RPC: biri makbuzu görürse sent; biri çökmüş/geride/bilmiyorsa waiting (yeniden gönderme yok)');
}
{
  // Kasa modu: olay satır numarasıyla (ref) bulunur; AVAX gibi olay bırakmayan işlemlerde olay koşulu atlanır
  const refTopic = ethers.zeroPadValue(ethers.toBeHex(42), 32);
  const { topics, data } = VAULT.encodeEventLog('PlayerPaid', [OYUNCU, wei(25), refTopic]);
  let sorulan = null;
  const kasadan = sahteSaglayici({ sayi: 6, loglar: f => { sorulan = f; return [{ address: KASA, topics, data, index: 0, blockNumber: 999_500, transactionHash: '0x' + '55'.repeat(32) }]; } });
  const c = zincir([kasadan], { vaultContract: KASA });
  const r = await c.checkPayout({ hash: H, raw: '0xraw', nonce: 5, since: SIMDI - 30 * DK, now: SIMDI, expect: { vaultRef: { kind: 'withdraw', ref: 42 } } });
  assert.equal(r, 'waiting', 'kasa olayı (ref=42) başka işlemde görünüyor: aynı ödeme zincirde var, yeniden gönderilmez');
  assert.equal(sorulan.address, KASA.toLowerCase() === sorulan.address.toLowerCase() ? sorulan.address : KASA);
  assert.equal(sorulan.topics[2], refTopic, 'olay satır numarasıyla (indexed ref) aranır');
  const bos = zincir([sahteSaglayici({ sayi: 6 })], { vaultContract: KASA });
  assert.equal(await bos.checkPayout({ hash: H, raw: '0xraw', nonce: 5, since: SIMDI - 30 * DK, now: SIMDI, expect: { vaultRef: { kind: 'withdraw', ref: 42 } } }), 'failed');
  assert.equal(await bos.checkPayout({ hash: H, raw: '0xraw', nonce: 5, since: SIMDI - 30 * DK, now: SIMDI }), 'failed', 'olay beklentisi yoksa (AVAX gönderimi) 1-3. koşullar yeter');
  assert.equal(await bos.checkPayout({ hash: H, raw: '0xraw', nonce: 5, since: SIMDI - 1 * DK, now: SIMDI }), 'waiting', 'yaş eşiği her durumda uygulanır');
  ok('W1: kasa ödemesi olay satır numarasıyla (ref) aranır; olay bırakmayan işlemde de yaş eşiği uygulanır');
}

// ── verifyPayment: aynı işlemde iki Paid; ücretli/yakımlı token ──
function makbuz(olaylar) {
  const logs = [];
  for (const o of olaylar) {
    if (o.paid) { const { topics, data } = PAY.encodeEventLog('Paid', [o.paid.payer, o.paid.ref, wei(o.paid.amount), 0n]); logs.push({ address: SOZLESME, topics, data, index: logs.length }); }
    if (o.transfer) logs.push({ ...transferLog(o.transfer.from, o.transfer.to, o.transfer.amount, '0x' + '12'.repeat(32)), index: logs.length });
  }
  return { status: 1, blockNumber: 500, logs };
}
const R1 = '0x' + '01'.repeat(32), R2 = '0x' + '02'.repeat(32);
const dogrulayici = rc => zincir([{ getTransactionReceipt: async () => rc }]);
{
  // Normal tek ödeme
  const tek = await dogrulayici(makbuz([{ paid: { payer: OYUNCU, ref: R1, amount: 100 } }, { transfer: { from: OYUNCU, to: OYUN, amount: 100 } }])).verifyPayment('0xtx');
  assert.equal(tek.amount, 100); assert.equal(tek.multi, false);
  // Ücretli token (%10 kesinti, kesinti yakılıyor): hazineye 90 ulaştı. ESKİ KOD "ödeme oyun cüzdanına gitmemiş" derdi (para alınmış, kredi yok);
  // saf sözleşme miktarına güvenen kod 100 kredilerdi (bedava 10). Doğrusu: ulaşan 90.
  const ucretli = await dogrulayici(makbuz([{ paid: { payer: OYUNCU, ref: R1, amount: 100 } }, { transfer: { from: OYUNCU, to: OYUN, amount: 90 } }, { transfer: { from: OYUNCU, to: '0x' + '00'.repeat(20), amount: 10 } }])).verifyPayment('0xtx');
  assert.equal(ucretli.amount, 90, 'yalnız ulaşan kredilenir'); assert.equal(ucretli.declared, 100);
  // Sözleşmeye "100" yazıp hazineye 1 gönderen kötü token: yalnız 1
  const sahte = await dogrulayici(makbuz([{ paid: { payer: OYUNCU, ref: R1, amount: 100 } }, { transfer: { from: OYUNCU, to: OYUN, amount: 1 } }])).verifyPayment('0xtx');
  assert.equal(sahte.amount, 1);
  // Hazine adresi değiştirilmiş (başka alıcıya gitmiş): reddedilir
  await assert.rejects(dogrulayici(makbuz([{ paid: { payer: OYUNCU, ref: R1, amount: 100 } }, { transfer: { from: OYUNCU, to: '0x' + '66'.repeat(20), amount: 100 } }])).verifyPayment('0xtx'), e => e.rejected && /oyun cüzdanına gitmemiş/.test(e.message));
  // Aynı işlemde İKİ ödeme: her biri ayrı ayrı doğrulanır; tek aktarım iki ödemede sayılmaz
  const ikili = makbuz([{ paid: { payer: OYUNCU, ref: R1, amount: 50 } }, { paid: { payer: OYUNCU, ref: R2, amount: 70 } },
    { transfer: { from: OYUNCU, to: OYUN, amount: 50 } }, { transfer: { from: OYUNCU, to: OYUN, amount: 70 } }]);
  const c2 = dogrulayici(ikili);
  const p1 = await c2.verifyPayment('0xtx', R1), p2 = await c2.verifyPayment('0xtx', R2);
  assert.deepEqual([p1.amount, p1.ref, p1.multi], [50, R1, true]);
  assert.deepEqual([p2.amount, p2.ref, p2.multi], [70, R2, true], 'ikinci Paid olayı da kredilenir (eski kod yalnız ilkini görürdü)');
  const yarim = makbuz([{ paid: { payer: OYUNCU, ref: R1, amount: 50 } }, { paid: { payer: OYUNCU, ref: R2, amount: 70 } }, { transfer: { from: OYUNCU, to: OYUN, amount: 50 } }]);
  await assert.rejects(dogrulayici(yarim).verifyPayment('0xtx', R2), e => e.rejected, 'ikinci ödemenin aktarımı yoksa kredi yok (bir aktarım iki kez sayılmaz)');
  assert.equal((await dogrulayici(yarim).verifyPayment('0xtx', R1)).amount, 50);
  await assert.rejects(c2.verifyPayment('0xtx', '0x' + '03'.repeat(32)), e => e.rejected);
  assert.equal(await dogrulayici(null).verifyPayment('0xtx'), null, 'makbuz yok: null (geçici)');
  ok('verifyPayment: aynı işlemdeki her Paid ayrı kredilenir; ücretli/yakımlı token\'da yalnız GERÇEKTEN ulaşan kadar');
}
{
  // payments.js: aynı işlemdeki iki ödeme iki teklifi kredilendirir; ücretli tokenda ulaşan kadar; geçici hata kurtarmayı atlatmaz
  const cfg = { ...loadConfig({}), dbFile: ':memory:', paymentsContract: SOZLESME, tokenAddress: TOKEN, treasuryAddress: OYUN, chainId: 43114 };
  const oyuncu = 'acc:1';
  db.q.playerAdd.run(oyuncu, 1, 1);
  E.withPlayer(oyuncu, () => null);
  const teklifEkle = (ref, miktar) => db.raw.prepare("INSERT INTO pay_quotes (ref, player, name, args, amount, created, expires) VALUES (?, ?, 'buySoldierUnit', '[]', ?, ?, ?)").run(ref, oyuncu, miktar, Date.now(), Date.now() + 900000);
  const rc = makbuz([{ paid: { payer: OYUNCU, ref: R1, amount: 50 } }, { paid: { payer: OYUNCU, ref: R2, amount: 70 } },
    { transfer: { from: OYUNCU, to: OYUN, amount: 50 } }, { transfer: { from: OYUNCU, to: OYUN, amount: 70 } }]);
  const gercek = dogrulayici(rc);
  const cuzdan = OYUNCU;
  const accounts = { activeWallet: () => cuzdan, isVerified: () => true };
  const sahteChain = { ...gercek, scanPaid: async () => [], latestBlock: async () => 10 };
  const pay = createPayments({ db, engine: E, accounts, chain: { verifyPayment: gercek.verifyPayment, scanPaid: sahteChain.scanPaid, latestBlock: sahteChain.latestBlock }, cfg, log: { error() {}, warn() {} } });
  teklifEkle(R1, 50); teklifEkle(R2, 70);
  const once = E.readPlayer(oyuncu).adAstraBalance;
  const tx = '0x' + '31'.repeat(32);
  const a = await pay.confirm(oyuncu, R1, tx);
  const b = await pay.confirm(oyuncu, R2, tx);
  assert.ok(a.ok && b.ok, JSON.stringify([a, b]));
  assert.ok(Math.abs(E.readPlayer(oyuncu).adAstraBalance - once - 120) < 1e-6 || (a.paid === 50 && b.paid === 70), `iki ödeme de bakiyeye yazıldı: ${a.paid} + ${b.paid}`);
  assert.deepEqual([a.paid, b.paid], [50, 70]);
  const tekrar = await pay.confirm(oyuncu, R2, tx);
  assert.equal(tekrar.ok, false, 'aynı ödeme ikinci kez kredilenmez');
  const sat = db.raw.prepare('SELECT ref, status, tx_hash FROM pay_quotes ORDER BY ref').all();
  assert.deepEqual(sat.map(x => x.status), ['paid', 'paid']);
  assert.equal(new Set(sat.map(x => x.tx_hash)).size, 2, 'tx_hash UNIQUE kısıtı: her ödeme kendi anahtarıyla');
  ok('payments.confirm: aynı işlemdeki iki ödeme iki teklifi de kredilendirir, hiçbiri iki kez sayılmaz');
}
{
  // Kurtarma taraması: geçici RPC hatası ödemeyi sonsuza dek atlatmaz; ücretli tokenda ulaşan kadar kredilenir
  const cfg = { ...loadConfig({}), dbFile: ':memory:', paymentsContract: SOZLESME, tokenAddress: TOKEN, treasuryAddress: OYUN, chainId: 43114 };
  const oyuncu = 'acc:2';
  db.q.playerAdd.run(oyuncu, 1, 1); E.withPlayer(oyuncu, () => null);
  const R3 = '0x' + '04'.repeat(32);
  db.raw.prepare("INSERT INTO pay_quotes (ref, player, name, args, amount, created, expires) VALUES (?, ?, 'buySoldierUnit', '[]', 100, ?, ?)").run(R3, oyuncu, Date.now(), Date.now() + 900000);
  const tx = '0x' + '41'.repeat(32);
  let gecici = true;
  const chain = {
    latestBlock: async () => 100,
    scanPaid: async () => [{ txHash: tx, payer: OYUNCU, ref: R3, amount: 100, block: 50 }],
    verifyPayment: async (h, ref) => {
      if (gecici) throw new Error('RPC zaman aşımı');
      return dogrulayici(makbuz([{ paid: { payer: OYUNCU, ref: R3, amount: 100 } }, { transfer: { from: OYUNCU, to: OYUN, amount: 90 } }])).verifyPayment(h, ref);
    }
  };
  db.kvSet('chain:payBlock', 40);
  const pay = createPayments({ db, engine: E, accounts: { activeWallet: () => OYUNCU }, chain, cfg, log: { error() {}, warn() {} } });
  const once = E.readPlayer(oyuncu).adAstraBalance;
  assert.equal(await pay.scanPaid(), 0);
  assert.equal(Number(db.kvGet('chain:payBlock')), 40, 'geçici hata: aynı blok aralığı bir sonraki turda yeniden taranır (eski kod aralığı atlar, ödeme kaybolurdu)');
  gecici = false;
  assert.equal(await pay.scanPaid(), 1);
  assert.ok(Math.abs(E.readPlayer(oyuncu).adAstraBalance - once - 90) < 1e-6, 'ulaşan 90 kredilendi (bildirilen 100 değil)');
  assert.equal(db.raw.prepare('SELECT status FROM pay_quotes WHERE ref = ?').get(R3).status, 'credited');
  ok('payments.scanPaid: geçici RPC hatası ödemeyi atlatmaz; ücretli tokenda ulaşan miktar kredilenir');
}

// ── Log maskesi ──
{
  const hepsi = [];
  const l = createLogger({ cikti: s => hepsi.push(s), zaman: () => 't' });
  const anahtar = 'AbCdEf0123456789AbCdEf0123456789';
  l.error('RPC düştü', { url: `https://avax-mainnet.g.alchemy.com/v2/${anahtar}`, ek: 'https://rpc.ornek.com/ext/bc/C/rpc?apikey=SIR3T&x=1', hata: new Error(`server response 429 (url=https://api.ornek.com/rpc?key=KOD99&token=T0K3N)`) });
  const satir = hepsi.at(-1);
  for (const sir of [anahtar, 'SIR3T', 'KOD99', 'T0K3N']) assert.ok(!satir.includes(sir), 'sızdı: ' + sir + ' → ' + satir);
  assert.ok(satir.includes('avax-mainnet.g.alchemy.com') && satir.includes('apikey=[GİZLİ]'), 'sunucu adı ve parametre adı kalır');
  assert.equal(maskele('https://api.avax.network/ext/bc/C/rpc'), 'https://api.avax.network/ext/bc/C/rpc', 'anahtarsız adres aynen');
  assert.equal(maskele('https://snowtrace.io/tx/0x' + 'ab12'.repeat(16)), 'https://snowtrace.io/tx/0x' + 'ab12'.repeat(16), 'işlem özeti bağlantıda da kalır');
  assert.match(maskele('wss://n.quiknode.pro/0123456789abcdef0123456789abcdef01234567/ext/bc/C/rpc/'), /\/\[GİZLİ\]\/ext\/bc/);
  assert.match(maskele('http://x/?verify=' + 'ab'.repeat(24)), /verify=\[GİZLİ\]/, 'e-posta bağlantı belirteci');
  ok('log maskesi: ?apikey= / ?key= / ?token= ve yol içi uzun RPC anahtarı maskelenir; sunucu adı ve tx özeti kalır');
}

// ── Sistem hesabı ve devredilen ödeme ──
{
  E.withPlayer(SYSTEM, gs => gs.checkWeeklyAutonomousBuyback());
  const s1 = E.readPlayer(SYSTEM);
  assert.equal(Number(s1.adAstraBalance) || 0, 0, 'sistem hesabı 0 ASTRA ile açıldı (eski kod 2,5 ile açardı)');
  assert.equal(Number(s1.lockedAda) || 0, 0);
  // Oyun mantığı bozulmuyor: haftalık geri alım sistem hesabının bakiyesinden bağımsız çalışır (hazine kasası + havuz)
  E.treasury.state.pools.ammBuyback = 1_000_000;
  const havuzOnce = E.treasury.state.pools.ammBuyback;
  const sonuclar = [];
  for (let hafta = 1; hafta <= 3; hafta++) {
    T += 8 * 86400000;
    E.withPlayer(SYSTEM, gs => { sonuclar.push(gs.checkWeeklyAutonomousBuyback()); });
  }
  assert.ok(sonuclar.every(r => r.executed === true), 'her hafta geri alım turu çalıştı: ' + JSON.stringify(sonuclar.map(r => r.reason || r.executed)));
  const s2 = E.readPlayer(SYSTEM);
  assert.ok((Number(s2.adAstraBalance) || 0) >= 0 && (Number(s2.adAstraBalance) || 0) < 1e-9, 'sistem hesabı hâlâ 0, negatife de düşmedi');
  assert.ok(E.treasury.state.pools.ammBuyback <= havuzOnce, 'geri alım kasadan harcar (para üretmez)');
  ok('Sistem hesabı 0 ASTRA ile açılır; haftalık otonom geri alım bundan etkilenmeden çalışır');
}
{
  // 1 ASTRA altı ödeme: eskiden sessizce düşüyordu (çekim bakiyeden düşülmüş, zincire hiçbir şey gitmemişti)
  const w = olusturOdemeler({ db, E, chain: null, cfg: { ...loadConfig({}), dbFile: ':memory:', payoutMode: 'auto' }, clock: () => 1000, econ: () => ({}) });
  const sat = () => db.raw.prepare('SELECT kind, address, amount FROM payouts ORDER BY id').all().map(r => ({ ...r }));
  w.queuePayout(7, 'withdraw', OYUNCU, 0.4);
  assert.deepEqual(sat(), [], '1 altı: satır yok');
  w.queuePayout(8, 'withdraw', OYUNCU, 0.4);
  assert.deepEqual(sat(), [], '0,8 toplam: hâlâ satır yok');
  w.queuePayout(9, 'withdraw', OYUNCU, 0.4);
  assert.deepEqual(sat(), [{ kind: 'withdraw', address: OYUNCU, amount: 1.2 }], 'devredilen tutar toplanıp bir kez ödenir (eski kod 1,2\'nin tamamını kaybederdi)');
  w.queuePayout(10, 'withdraw', '0x' + 'ee'.repeat(20), 0.5);
  w.queuePayout(10, 'burn', OYUNCU, 0.9);
  assert.equal(sat().length, 1, 'başka adres / başka tür ayrı devir tutar');
  ok('queuePayout: 1 ASTRA altı tutar devredilir, toplam 1\'e ulaşınca ödenir (para kaybolmaz)');
}

console.log(`\n${toplam} zincir/para yolu gerileme testi geçti`);
process.exit(0);
