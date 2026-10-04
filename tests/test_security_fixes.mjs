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

// 2) Çark hammaddeyle çevrilince yoktan ADA kaydı oluşmaz
{
  const gp = E.globalPool.state;
  const spentBefore = gp.totalSpent || 0, burnBefore = gp.totalBurned || 0, creatorBefore = gp.creatorRoyaltyTotal || 0;
  E.mutatePlayer(P, gs => { gs.state.inventory.wheat = 1e6; gs.state.warehouseLevel = 18; });
  const r = E.act(P, 'spinCarnivalWheel', ['wheat']);
  assert.ok(r.result.success, 'Çark gerçekten çevrildi: ' + r.result.message);
  {
    assert.equal(gp.totalSpent || 0, spentBefore, 'Harcama kaydı oluşmadı');
    assert.equal(gp.totalBurned || 0, burnBefore, 'Yoktan yakım kaydı yok (zincire gerçek yakım gitmez)');
    assert.equal(gp.creatorRoyaltyTotal || 0, creatorBefore, 'Yoktan yapımcı payı yok');
  }
  ok('Çark hammaddeyle çevrilince yoktan para oluşmuyor');
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

// 4) Ücretsiz oyuncu payı: e-postasını doğrulamamış hesap almaz
{
  const cfg = { ...loadConfig({}), dbFile: ':memory:' };
  const mailer = createMailer({ db, cfg, log: { log() {} } });
  const accounts = createAccounts({ db, cfg, mailer, verifyMessage: (m, s) => ethers.verifyMessage(m, s) });
  const v = await accounts.register('dogru@ornek.com', 'gizli-sifre-123');
  const link = /verify=([a-f0-9]+)/.exec(db.kvJson('dev:outbox', [])[0].text)[1];
  accounts.verifyEmail(link);
  const u = await accounts.register('sahte@ornek.com', 'gizli-sifre-123');
  for (const p of [v.playerId, u.playerId]) E.withPlayer(p, () => null);
  const world = createWorld({ db, engine: E, accounts, cfg, log: { warn() {}, error() {} } });
  const market = { priceUsd: 2e-7, mcapUsd: 20000, graduated: false, curveSupply: 2e9 };
  const s = world.settleWeek(E.globalPool.state.epochId, market);
  const vb = E.readPlayer(v.playerId).adAstraBalance, ub = E.readPlayer(u.playerId).adAstraBalance;
  assert.ok(vb > 0, 'Doğrulanmış hesap ücretsiz payı aldı');
  assert.equal(ub, 0, 'Doğrulanmamış hesap almadı');
  assert.ok(s.faucet.players >= 1);
  ok('Ücretsiz oyuncu payı yalnız e-postası doğrulanmış hesaplara');
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
