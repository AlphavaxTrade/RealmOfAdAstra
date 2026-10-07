// Güvenlik taraması (4 Ekim 2026) düzeltmelerinin kalıcı kontrolleri — biri geri açarsa burada yakalanır
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { validateArgs } from '../server/actions.js';
import { createWorld } from '../server/world.js';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts } from '../server/accounts.js';
import { ethers } from 'ethers';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

const db = openDb(':memory:');
const E = await createEngine(db);
const P = 'acc:900';
db.q.playerAdd.run(P, Date.now(), Date.now());
E.withPlayer(P, () => null);

// 1) Asker ve diziliş isimleri temizlenir (başka oyuncuların ekranında kod çalışamaz)
{
  E.mutatePlayer(P, gs => { gs.state.adAstraBalance = 100000; });
  assert.ok(E.act(P, 'buySoldierUnit', []).result.success);
  const r = E.act(P, 'renameSoldierUnit', [0, '<svg onload=alert(1)>']);
  assert.ok(r.result.success);
  const name = E.readPlayer(P).soldierUnits[0].name;
  assert.ok(!/[<>"'`&]/.test(name), `İsimde tehlikeli işaret kalmadı: ${name}`);
  E.act(P, 'saveCombatPreset', [1, '<img src=x onerror=alert(1)>']);
  const preset = JSON.stringify(E.readPlayer(P).combatPresets);
  assert.ok(!preset.includes('<img'), 'Diziliş adı temizlendi');
  // Eski kayıtta kalmış tehlikeli isim de Kolezyum takımına temiz girer
  E.mutatePlayer(P, gs => { gs.state.soldierUnits[0].name = '<b onmouseover=x>Eski</b>'; });
  const team = E.withPlayer(P, gs => gs.buildPvpTeam('1v1', [0])).result;
  assert.ok(team.success && !/[<>]/.test(team.name) && !/[<>]/.test(team.units[0].name), 'Kolezyum takımında isim temiz');
  ok('İsimler temizleniyor (asker, diziliş, eski kayıttaki isimler Kolezyumda)');
}

// 2) Çark hammaddeyle çevrilince yoktan ADA kaydı oluşmaz. Ödemenin yarısı pazarda satılır (4 Ekim kararı):
//    Karnaval kasasına giren ADA pazar havuzundan çıkan gerçek ADA'dır; tek "harcama" kaydı pazarın satış komisyonudur.
{
  const gp = E.globalPool.state;
  const spentBefore = gp.totalSpent || 0;
  E.mutatePlayer(P, gs => { gs.state.inventory.wheat = 1e6; gs.state.warehouseLevel = 18; });
  const ammBefore = E.ammMarket.pools.wheat.adAstraReserve;
  const carnBefore = E.treasury.getPool('carnival');
  const rnd = Math.random;
  Math.random = () => 0.99;                       // ödül: çark bileti parçası (pazara dokunmaz)
  let r;
  try { r = E.act(P, 'spinCarnivalWheel', ['wheat']); } finally { Math.random = rnd; }
  assert.ok(r.result.success, 'Çark gerçekten çevrildi: ' + r.result.message);
  const bi = r.result.burnedInfo;
  const fee = (E.globalPool.state.totalSpent || 0) - spentBefore;
  const ammDrop = ammBefore - E.ammMarket.pools.wheat.adAstraReserve;
  assert.ok(bi.soldQty > 0 && bi.carnivalIn > 0, 'Yarısı satılıp Karnaval kasasına girdi');
  assert.ok(Math.abs(E.treasury.getPool('carnival') - carnBefore - bi.carnivalIn - fee * 0.86 * E.GAME_CONFIG.TREASURY_ALLOCATION.carnival) < 1e-6, 'Karnaval kasası satış geliri kadar arttı');
  assert.ok(Math.abs(ammDrop - bi.carnivalIn - fee) < 1e-6, 'Kasaya giren ADA + komisyon = pazardan çıkan ADA (yoktan para yok)');
  assert.ok(fee > 0 && fee < 0.05 * bi.carnivalIn, 'Tek harcama kaydı pazarın küçük satış komisyonu (100 ADA değil)');
  ok('Çark hammaddeyle çevrilince yoktan para oluşmuyor (satılan yarının ADA\'sı pazardan gelir)');
}

// 3) Serbest metin yerine yalnız oyunun tanımladığı değerler
{
  for (const [name, args] of [
    ['buyTavernBuff', ['__proto__']], ['buyTavernBuff', ['constructor']], ['repairTool', ['__proto__']], ['repairTool', ['toString']],
    ['useScroll', ['__proto__']], ['setSoldierRow', [0, 'yan']], ['spinCarnivalWheel', ['bedava']], ['claimOnboardingReward', ['__proto__']],
    ['equipSoldierFromDepot', [0, { source: 'kingdom', slotKey: '__proto__' }]], ['upgradeAnyEquipment', [{ source: 'x' }]],
    ['upgradeAnyEquipment', [{ source: 'armory', armoryIndex: -1 }]]
  ]) assert.ok(validateArgs(name, args), `${name}(${JSON.stringify(args)}) reddedilmeli`);
  for (const [name, args] of [['repairTool', ['axe']], ['setSoldierRow', [0, 'back']], ['spinCarnivalWheel', ['ada']], ['useScroll', ['scroll_heal', '0']],
    ['upgradeAnyEquipment', [{ source: 'armory', armoryIndex: 0 }]], ['claimOnboardingReward', ['first_expedition']]]) {
    assert.equal(validateArgs(name, args), null, `${name}(${JSON.stringify(args)}) kabul edilmeli`);
  }
  ok('Güçlendirme, alet, parşömen, sıra, çark ödemesi, görev ve eşya konumu yalnız geçerli değerlerle');
}

// 4) Ücretsiz oyuncu payı (sahte hesaplara karşı, 4 Ekim 2026): doğrulanmış e-posta + en az 3. seviye + haftalık katkı
//    eşiği; pay katkı^1,5 × sadakat serisi; kilitli gelir. Emeğini yan hesaplara bölen daha az alır.
{
  const cfg = { ...loadConfig({}), dbFile: ':memory:' };
  const mailer = createMailer({ db, cfg, log: { log() {} } });
  const accounts = createAccounts({ db, cfg, mailer, verifyMessage: (m, s) => ethers.verifyMessage(m, s) });
  const ep = E.globalPool.state.epochId + 10;   // önceki haftaları olan bir dünya
  const mk = async (email, { verify = true, level = 3, week = 0, streak = null } = {}) => {
    const r = await accounts.register(email, 'gizli-sifre-123');
    if (verify) accounts.verifyEmail(/verify=([a-f0-9]+)/.exec(db.kvJson('dev:outbox', [])[0].text)[1]);
    E.withPlayer(r.playerId, () => null);
    E.mutatePlayer(r.playerId, gs => {
      gs.state.level = level; gs.state.adAstraBalance = 0; gs.state.lockedAda = 0;
      gs.state.contribution = { total: week, week, lastWeek: 0, epochId: ep, buyCredit: {} };
      if (streak) gs.state.faucetStreak = streak;
    });
    return r.playerId;
  };
  // v2 ölçeği (×0,01): eşik 1 puan, tam pay 10 puan. Tek hesapta 6 puan, 10 haftalık serisi olan sadık oyuncu
  const loyal = await mk('sadik@ornek.com', { week: 6, streak: { weeks: 10, lastEpoch: ep - 1 } });
  // Aynı emeği 3 yeni hesaba bölen oyuncu (2'şer puan)
  const split = [await mk('yan1@ornek.com', { week: 2 }), await mk('yan2@ornek.com', { week: 2 }), await mk('yan3@ornek.com', { week: 2 })];
  const unverified = await mk('sahte@ornek.com', { verify: false, week: 6 });
  const lowLevel = await mk('dusuk@ornek.com', { level: 2, week: 6 });
  const lazy = await mk('tembel@ornek.com', { week: 0.5 });
  // Seri kaçırılmış: 8 haftalık seri, 2 hafta ara → 8/4 = 2, bu hafta +1 = 3
  const gap = await mk('ara@ornek.com', { week: 2, streak: { weeks: 8, lastEpoch: ep - 3 } });
  const world = createWorld({ db, engine: E, accounts, cfg, log: { warn() {}, error() {} } });
  const market = { priceUsd: 2e-7, mcapUsd: 2e7, graduated: false, curveSupply: 2e9 };
  const s = world.settleWeek(ep, market);
  const bal = p => E.readPlayer(p).adAstraBalance;
  for (const p of [unverified, lowLevel, lazy]) assert.equal(bal(p), 0, 'Şartı sağlamayan almaz (doğrulanmamış / düşük seviye / az katkı)');
  const one = bal(loyal), three = split.reduce((t, p) => t + bal(p), 0);
  assert.ok(one > 0 && three > 0);
  assert.ok(Math.abs(three / one - 0.2887) < 0.01, `3 yan hesabın toplamı tek sadık hesabın ~%29'u (${(three / one * 100).toFixed(1)}%)`);
  assert.equal(E.readPlayer(loyal).faucetStreak.weeks, 11, 'Seri ilerledi');
  assert.equal(E.readPlayer(gap).faucetStreak.weeks, 3, 'Kaçırılan her hafta seriyi yarıya indirir');
  assert.ok(Math.abs(E.readPlayer(loyal).lockedAda - one) < 1e-6, 'Pay tamamen kilitli');
  assert.equal(s.faucet.players, 5, '5 hesap şartları sağladı (sadık, 3 yan hesap, seri kaçıran)');
  ok('Ücretsiz oyuncu payı: şartlar, katkıyla hızlı büyüyen pay, sadakat serisi, kilitli pay (yan hesaplar ~%29 alır)');
}

// 6) Çark: ADA bedelinin %80'i Karnaval kasasına, bilet parası kasaya geçer, hammaddeyle günde 3 hak
{
  const ep = E.globalPool.state.epochId;
  E.mutatePlayer(P, gs => { gs.state.adAstraBalance = 1e6; gs.state.inventory.wood = 1e6; gs.state.warehouseLevel = 18; });
  const rnd = Math.random;
  Math.random = () => 0.99;                       // ödül: bilet parçası (kasaya maliyetsiz)
  try {
    const c0 = E.treasury.getPool('carnival');
    const cost = E.GAME_CONFIG.CARNIVAL.WHEEL_COST_ADA;   // v2: 1 ASTRA
    const carnShare = E.GAME_CONFIG.TREASURY_ALLOCATION.carnival;
    assert.ok(E.act(P, 'spinCarnivalWheel', ['ada']).result.success);
    const gain = E.treasury.getPool('carnival') - c0;
    assert.ok(Math.abs(gain - (cost * 0.8 + cost * 0.2 * 0.86 * carnShare)) < 1e-6, `ASTRA çevirmesinde kasaya %80 + kalanın karnaval payı girdi (${gain})`);
    // Bilet: satın alınmış biletin piyango kasasındaki 98 ADA'sı Karnaval kasasına
    assert.ok(E.act(P, 'buyLotteryTickets', [1]).result.success);
    const l0 = E.lottery().pool, c1 = E.treasury.getPool('carnival');
    assert.ok(E.act(P, 'spinCarnivalWheel', ['ticket']).result.success);
    const tkNet = E.GAME_CONFIG.CARNIVAL.LOTTERY.TICKET_COST_ADA * (1 - E.GAME_CONFIG.CARNIVAL.LOTTERY.AMORTI_SHARE);   // v2: 0,98 ASTRA
    assert.ok(Math.abs(E.treasury.getPool('carnival') - c1 - tkNet) < 1e-6, 'Biletin amorti dışı bedeli Karnaval kasasına geçti');
    assert.ok(Math.abs(l0 - E.lottery().pool - tkNet) < 1e-6, 'Ortak piyango kasasından düştü');
    // Hammadde: günde 3
    let okN = 0, last = null;
    for (let i = 0; i < 4; i++) { last = E.act(P, 'spinCarnivalWheel', ['wood']).result; if (last.success) okN++; }
    assert.equal(okN, 3 - (E.readPlayer(P).dailyCounters.wheelResourceSpins - okN), 'Hammaddeyle günde en çok 3 çevirme');
    assert.ok(!last.success && /günlük sınır/.test(last.message), 'Dördüncü çevirme reddedildi');
  } finally { Math.random = rnd; }
  ok('Çark: ADA bedelinin %80\'i Karnaval kasasına, bilet parası kasaya, hammaddeyle günde 3 çevirme');
}

// 5) Sunucu açılış kilitleri: deneme modu gerçek anahtarla ya da deneme kayıt dosyası gerçek sunucuda açılmaz
{
  const run = env => spawnSync(process.execPath, ['server/index.js'], { encoding: 'utf8', timeout: 90000, env: { ...process.env, PORT: '0', CHAIN_ENABLED: '0', ...env } });
  const a = run({ TEST_MODE: '1', GAME_WALLET_PRIVATE_KEY: '0x' + '1'.repeat(64), DB_FILE: ':memory:' });
  assert.notEqual(a.status, 0, 'Deneme modu + gerçek anahtar açılmamalı');
  assert.ok(/TEST_MODE/.test(a.stderr), a.stderr);
  const b = run({ TEST_MODE: '1', KASA_MASTER_KEY: 'ab'.repeat(32), DB_FILE: ':memory:' });
  assert.notEqual(b.status, 0, 'Deneme modu + kasa ana anahtarı açılmamalı');
  ok('Deneme modu gerçek cüzdan/kasa anahtarıyla açılmıyor');
}

console.log(`\n${passed} güvenlik düzeltmesi kontrolü geçti.`);
process.exit(0);
