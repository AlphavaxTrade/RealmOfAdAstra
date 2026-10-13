// Oyun Kasası — GERÇEK zincir kipinin hata ve sonuçlandırma yolları (sahte zincir nesnesiyle, ağ yok).
// Denetim 2026-10 (W1/W2) sonrası eklenen davranışlar: bozuk kayıt kuyruğu düşürmez, yayın sonrası kopma "onay bekleniyor"
// kalır (çift gönderim yok), zincir sonucu 'sent'/'failed'/'waiting' işlenir, aktarım borcu doğru yönde geri döner.
// Taklit kasa (deneme sunucusu) bu yollara hiç girmediği için burada kasa gerçek kipte, zincir yerine sahte bir nesneyle çalışır.
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { openDb } from '../server/db.js';
import { createKasa } from '../server/kasa.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

let sayac = 0;                                            // her yayın benzersiz işlem özeti alır
const HASH = n => '0x' + n.toString(16).padStart(64, '0');
const cfg = { testMode: false, kasaMasterKey: 'ab'.repeat(32), paymentsContract: '0x' + 'aa'.repeat(20), tokenAddress: '0x' + 'bb'.repeat(20),
  payFeeGas: 100000, kasaMinAvax: 0.003, kasaMinSettle: 50, kasaCapDays: 0, kasaCapFloorAda: 20000 };
let now = 1_800_000_000_000;
const sessiz = { warn() {}, error() {}, log() {} };

const db = openDb(':memory:');
const cuzdan = {};                                        // oyuncu → bağlı cüzdan
const accounts = { activeWallet: id => cuzdan[id] || null };

// Sahte zincir: sendTx kipleri sırayla tüketilir; checkPayout sonucu hash'e göre verilir
const gonderimler = [], kontroller = [], bakiyeOkumalari = [];
let kipler = [], bakiyeHatasi = false;
const sonuc = {};                                         // hash → 'sent' | 'failed' | 'waiting' | 'hata'
const chain = {
  async gasPrice() { return 25n * 10n ** 9n; },
  async balances(adres) { bakiyeOkumalari.push(adres); if (bakiyeHatasi) throw new Error('rpc yok'); return { ada: 1234, avax: 0.5, at: now }; },
  async sendTx(signer, fields, imzalandi) {
    gonderimler.push({ from: signer.address.toLowerCase(), fields });
    const kip = kipler.shift() || 'tamam';
    if (kip === 'imza-oncesi') throw new Error('nonce okunamadı');
    if (imzalandi) imzalandi({ hash: HASH(++sayac), raw: '0x01', nonce: sayac });
    if (kip === 'yayin-koptu') throw new Error('bağlantı koptu');
    if (kip === 'geri-alindi') throw Object.assign(new Error('execution reverted'), { reverted: true });
  },
  async checkPayout(a) {
    kontroller.push(a);
    const s = sonuc[a.hash];
    if (s === 'hata') throw new Error('rpc yok');
    return s || 'waiting';
  }
};
const kasa = createKasa({ db, chain, accounts, cfg, clock: () => now, log: sessiz });
assert.ok(kasa.enabled && !kasa.simulated, 'gerçek kip');

const oyuncu = (id, { seenAgo = 0, wallet = null } = {}) => {
  db.q.playerAdd.run(id, now, now - seenAgo);
  db.raw.prepare('UPDATE players SET last_seen = ? WHERE address = ?').run(now - seenAgo, id);
  if (wallet) cuzdan[id] = wallet;
  const row = kasa.ensure(id);
  db.raw.prepare('UPDATE kasa SET ada = 1000, avax = 0.5, approved = 1 WHERE player = ?').run(id);
  return row;
};
const islemEkle = (player, kind, amount) => Number(db.raw.prepare('INSERT INTO kasa_ops (player, kind, amount, created) VALUES (?, ?, ?, ?)').run(player, kind, amount, now).lastInsertRowid);
const islem = id => db.raw.prepare('SELECT * FROM kasa_ops WHERE id = ?').get(id);
const kasaSatiri = id => db.raw.prepare('SELECT * FROM kasa WHERE player = ?').get(id);
const sifirla = () => { gonderimler.length = 0; kontroller.length = 0; bakiyeOkumalari.length = 0; kipler = []; bakiyeHatasi = false; for (const k of Object.keys(sonuc)) delete sonuc[k]; };
const W = '0x' + '77'.repeat(20);

// ── 1) Çözülemeyen tek kasa kaydı kuyruğun kalanını düşürmez ──
{
  sifirla();
  oyuncu('acc:1', { wallet: W }); oyuncu('acc:2', { wallet: W });
  db.raw.prepare("UPDATE kasa SET key_enc = 'bozuk.kayit' WHERE player = 'acc:1'").run();
  db.raw.prepare('UPDATE kasa SET pending = 0, approved = 1 WHERE player = ?').run('acc:1');
  const bozukCekim = islemEkle('acc:1', 'withdraw_ada', 10);
  const bozukAktarim = islemEkle('acc:1', 'settle', 80);          // aktarımda tutar bekleyenden düşülmüştü: hata olursa geri dönmeli
  const sagCekim = islemEkle('acc:2', 'withdraw_ada', 25);
  await kasa.processOps();
  assert.equal(islem(bozukCekim).status, 'failed');
  assert.equal(islem(bozukAktarim).status, 'failed');
  assert.ok(islem(bozukCekim).error && !islem(bozukCekim).tx_hash, 'hata kaydedildi, işlem hiç imzalanmadı');
  assert.equal(kasaSatiri('acc:1').pending, 80, 'başarısız aktarımın borcu kasanın bekleyenine geri döndü');
  assert.equal(islem(sagCekim).status, 'sent', 'sağlam kayıt aynı turda işlendi');
  assert.equal(gonderimler.length, 1, 'bozuk kayıt için hiçbir şey yayınlanmadı');
  assert.equal(gonderimler[0].from, kasaSatiri('acc:2').address, 'gönderen sağlam kasanın cüzdanı');
  assert.ok(Math.abs(kasaSatiri('acc:2').ada - 1234) < 1e-9, 'işlemden sonra bakiye zincirden tazelendi');
  ok('Çözülemeyen kasa kaydı yalnız kendi işlemini düşürür; kuyruğun kalanı gider, aktarım borcu geri döner');
}

// ── 2) Yayın sonrası kopma: işlem "gönderiliyor" kalır, borç geri EKLENMEZ (çift gönderim/çift sayım yok); zincir kararı sonra gelir ──
let belirsizCekim, belirsizAktarim, belirsizAvax;
{
  sifirla();
  oyuncu('acc:3', { wallet: W });
  kipler = ['yayin-koptu', 'yayin-koptu', 'yayin-koptu'];
  belirsizCekim = islemEkle('acc:3', 'withdraw_ada', 40);
  belirsizAktarim = islemEkle('acc:3', 'settle', 60);
  belirsizAvax = islemEkle('acc:3', 'withdraw_avax', 0.01);
  const bekleyenOnce = kasaSatiri('acc:3').pending;
  await kasa.processOps();
  for (const id of [belirsizCekim, belirsizAktarim, belirsizAvax]) {
    const r = islem(id);
    assert.equal(r.status, 'sending');
    assert.match(r.error, /^Onay bekleniyor: /);
    assert.ok(r.tx_hash && r.raw_tx, 'imzalı işlem saklandı (aynı sıra numarasıyla yeniden denenebilsin)');
  }
  assert.equal(kasaSatiri('acc:3').pending, bekleyenOnce, 'belirsiz aktarım için borç geri eklenmedi');
  // Yeni bir tur "gönderiliyor" kalanları yeniden göndermez
  const sayi = gonderimler.length;
  await kasa.processOps();
  assert.equal(gonderimler.length, sayi, 'gönderiliyor kalan işlem ikinci kez yayınlanmaz');
  ok('Yayın sonrası kopma: işlem "onay bekleniyor" kalır, tekrar gönderilmez, borç geri eklenmez');
}

// ── 3) İşlem zincirde geri alındı / imza öncesi hata: net başarısızlık, aktarım borcu geri döner ──
{
  sifirla();
  oyuncu('acc:4', { wallet: W });
  kipler = ['geri-alindi', 'imza-oncesi', 'geri-alindi'];
  const a = islemEkle('acc:4', 'settle', 70), b = islemEkle('acc:4', 'settle', 30), c = islemEkle('acc:4', 'return_ada', 15);
  const once = kasaSatiri('acc:4').pending;
  await kasa.processOps();
  assert.equal(islem(a).status, 'failed'); assert.equal(islem(b).status, 'failed'); assert.equal(islem(c).status, 'failed');
  assert.equal(kasaSatiri('acc:4').pending, once + 100, 'iki başarısız aktarımın borcu (70 + 30) geri döndü; iade borç eklemez');
  ok('Geri alınan ya da imzalanamayan işlem başarısız sayılır; aktarım borcu kaybolmaz, çekim/iade borç doğurmaz');
}

// ── 4) reconcileOps: zincir kararı işlenir ──
{
  sifirla();
  const pid = 'acc:3';
  const before = kasaSatiri(pid);
  const dep0 = db.raw.prepare('SELECT deposited_ada FROM players WHERE address = ?').get(pid).deposited_ada;
  // Hash'e göre sonuç: çekim 'sent', aktarım 'failed', AVAX 'hata' (RPC kesintisi → bekler)
  sonuc[islem(belirsizCekim).tx_hash] = 'sent';
  sonuc[islem(belirsizAktarim).tx_hash] = 'failed';
  sonuc[islem(belirsizAvax).tx_hash] = 'hata';
  const tohum = islemEkle(pid, 'settle', 12);                    // tx_hash'i olmayan "gönderiliyor": atlanmalı
  db.raw.prepare("UPDATE kasa_ops SET status = 'sending' WHERE id = ?").run(tohum);
  await kasa.reconcileOps();
  assert.equal(islem(belirsizCekim).status, 'sent');
  assert.equal(islem(belirsizAktarim).status, 'failed');
  assert.equal(islem(belirsizAktarim).error, 'Zincirde işlenmedi');
  assert.equal(islem(belirsizAvax).status, 'sending', 'RPC hatası = belirsiz: yönetici/sonraki tur karar verir');
  assert.equal(islem(tohum).status, 'sending', 'imzasız kayıt zincire sorulmaz');
  assert.equal(kasaSatiri(pid).pending, before.pending + 60, 'zincirde işlenmeyen aktarımın borcu geri döndü');
  assert.equal(db.raw.prepare('SELECT deposited_ada FROM players WHERE address = ?').get(pid).deposited_ada, dep0, 'başarısız aktarım oyuna ASTRA yazmadı');
  // Beklenen ödeme olayı doğru kuruldu
  const cekim = kontroller.find(k => k.hash === islem(belirsizCekim).tx_hash);
  assert.deepEqual(cekim.expect, { transfer: { from: before.address, to: W, amount: 40 } }, 'çekim: ADASTRA Transfer olayı beklenir');
  const aktarim = kontroller.find(k => k.hash === islem(belirsizAktarim).tx_hash);
  assert.deepEqual(aktarim.expect, { paidRef: ethers.zeroPadValue(ethers.toBeHex(belirsizAktarim), 32) }, 'aktarım: sözleşmenin Paid olayı, ref = işlem numarası');
  const avax = kontroller.find(k => k.hash === islem(belirsizAvax).tx_hash);
  assert.equal(avax.expect, null, 'AVAX gönderimi olay bırakmaz: yalnız makbuz/sıra/yaş koşulları');
  assert.ok(!kontroller.some(k => !k.hash), 'zincire hash\'siz sorgu gitmedi');
  ok('Zincir kararı işlenir: sent / failed (aktarım borcu geri) / RPC hatası (belirsiz kalır); beklenen olaylar doğru kurulur');
}

// ── 5) Aktarım zincirce doğrulanınca oyuna yazılır; bağlı cüzdan yoksa çekim yine sorgulanır (olaysız) ──
{
  sifirla();
  oyuncu('acc:5', { wallet: null });
  kipler = ['yayin-koptu', 'yayin-koptu'];
  // Aktarım ve (cüzdanı sonradan kalkmış) çekim: önce belirsiz yapılır
  const aktarim = islemEkle('acc:5', 'settle', 45);
  const iade = islemEkle('acc:5', 'return_ada', 5);
  cuzdan['acc:5'] = W;
  await kasa.processOps();
  cuzdan['acc:5'] = null;                                        // bağlı cüzdan değişikliği/kaldırma
  sonuc[islem(aktarim).tx_hash] = 'sent'; sonuc[islem(iade).tx_hash] = 'sent';
  const dep0 = db.raw.prepare('SELECT deposited_ada FROM players WHERE address = ?').get('acc:5').deposited_ada;
  const settled0 = kasaSatiri('acc:5').settled;
  await kasa.reconcileOps();
  assert.equal(islem(aktarim).status, 'sent'); assert.equal(islem(iade).status, 'sent');
  assert.equal(db.raw.prepare('SELECT deposited_ada FROM players WHERE address = ?').get('acc:5').deposited_ada, dep0 + 45, 'doğrulanan aktarım oyuncunun yatırılanına işlendi');
  assert.equal(kasaSatiri('acc:5').settled, settled0 + 45);
  const iadeSorgu = kontroller.find(k => k.hash === islem(iade).tx_hash);
  assert.equal(iadeSorgu.expect, null, 'cüzdan yoksa olay beklenmez (yalnız makbuz koşulları)');
  assert.ok(bakiyeOkumalari.length >= 2, 'sonuçlanan işlemden sonra bakiye zincirden tazelendi');
  ok('Doğrulanan aktarım oyuna yazılır ve bakiye tazelenir; bağlı cüzdan yokken de sonuçlandırma çalışır');
}

// ── 6) Taklit kasada ve zincirsiz kasada sonuçlandırma/tazeleme hiçbir şey yapmaz ──
{
  sifirla();
  const taklit = createKasa({ db, accounts, cfg: { ...cfg, testMode: true }, clock: () => now, log: sessiz });
  await taklit.reconcileOps(); await taklit.refreshActive();
  const zincirsiz = createKasa({ db, chain: null, accounts, cfg: { ...cfg, paymentsContract: '' }, clock: () => now, log: sessiz });
  assert.equal(zincirsiz.enabled, false, 'zincir/sözleşme yoksa gerçek kasa kapalı');
  await zincirsiz.refreshActive();
  assert.equal(bakiyeOkumalari.length + kontroller.length, 0);
  ok('Taklit ve zincirsiz kasa zincire hiç sormaz');
}

// ── 7) refreshActive: yalnız son 24 saatte görülen ya da bekleyeni olan oyuncular, sınırlı sayıda; RPC hatası turu düşürmez ──
{
  sifirla();
  db.raw.prepare('UPDATE kasa SET pending = 0').run();
  db.raw.prepare('UPDATE players SET last_seen = ?').run(now - 5 * 86400000);   // herkes eski
  db.raw.prepare('UPDATE players SET last_seen = ? WHERE address = ?').run(now - 1000, 'acc:1');
  db.raw.prepare('UPDATE kasa SET pending = 3 WHERE player = ?').run('acc:2');   // eski ama bekleyeni var
  const adres = id => kasaSatiri(id).address;
  await kasa.refreshActive();
  assert.deepEqual([...bakiyeOkumalari].sort(), [adres('acc:1'), adres('acc:2')].sort(), 'yalnız aktif ve bekleyeni olanlar tazelendi');
  sifirla();
  await kasa.refreshActive(1);
  assert.equal(bakiyeOkumalari.length, 1, 'sınır uygulanır');
  sifirla(); bakiyeHatasi = true;
  await kasa.refreshActive();                                    // RPC yok: istisna fırlatmaz
  assert.equal(bakiyeOkumalari.length, 2, 'bir oyuncudaki hata diğerini engellemez');
  ok('Aktif kasaların bakiye tazelemesi sınırlı ve hataya dayanıklı');
}

console.log(`\n${passed} gerçek-kip kasa hata yolu kontrolü geçti.`);
process.exit(0);
