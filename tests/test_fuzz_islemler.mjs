// Bulanıklık (fuzz) testi (kurumsal A2.10): beyaz listedeki HER işleme (a) geçerli ama uç değerlerle ve (b) bozuk girdilerle
// binlerce istek atılır. Sunucu hiçbir zaman 500 vermemeli (400 = reddedildi, 200 = işlendi), ayakta kalmalı ve oyuncu
// durumu bozulmamalı (NaN / sonsuz / eksi bakiye yok). Tohum sabit: aynı istekler her koşuda aynıdır.
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts } from '../server/accounts.js';
import { ACTIONS } from '../server/actions.js';
import { GAME_CONFIG } from '../js/config.js';

let passed = 0;
const ok = name => { passed++; console.log(`✅ ${name}`); };
const quiet = { log() {}, warn() {}, error() {} };

// Sabit tohumlu rastgele (tekrarlanabilir)
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20261008);
const pick = arr => arr[Math.floor(rnd() * arr.length)];

const NODES = GAME_CONFIG.RESOURCE_KEYS;
const SLOTS = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
// Her argüman türü için geçerli ama uç örnekler (server/actions.js içindeki T doğrulayıcılarıyla uyumlu)
const GECERLI = {
  int: [0, 1, 2, 3, 18, -1, 1e9, -1e9],
  idx: [0, 1, 2, 5, 63],
  qty: [1, 2, 0.5, 1e-9, 1e6, 1e12],
  bool: [true, false],
  str: ['', 'a', 'x'.repeat(64), '<script>alert(1)</script>', '__proto__', 'constructor'],
  name: ['', 'Ali', 'x'.repeat(24), '<img src=x onerror=alert(1)>', 'constructor', 'ş'.repeat(24)],
  slot: SLOTS,
  node: NODES,
  res: [...NODES, 'fragments', 'boxes', 'keys'],
  idxArr: [[0], [0, 1, 2], [63], [0, 0, 0], Array.from({ length: 18 }, (_, i) => i)],
  ref: [{ source: 'armory', armoryIndex: 0 }, { source: 'armory', armoryIndex: 99999 }, { source: 'soldier', soldierIndex: 0, slotKey: 'weapon' }, { source: 'kingdom', slotKey: 'armor', itemId: 'yok' }, { source: 'armory', armoryIndex: 0, itemId: '__proto__' }],
  buff: Object.keys(GAME_CONFIG.TAVERN_BUFFS || {}),
  tool: Object.keys(GAME_CONFIG.TOOLS || {}),
  scroll: ['scroll_heal', 'scroll_stamina', 'scroll_teleport', 'scroll_repair'],
  row: ['front', 'back'],
  wheelPay: ['ada', 'ticket', ...NODES],
  quest: (GAME_CONFIG.ONBOARDING_QUESTS || []).map(q => q.id),
  section: [...(GAME_CONFIG.ONBOARDING_SECTIONS || []).map(b => b.id), (GAME_CONFIG.ONBOARDING_FINAL || {}).id],
  gorulen: ['merkez', 'bolge', 'kota', 'koy', 'hazine', 'ekonomi', 'profil', 'zindanOnizleme', 'ilan', 'yakim', 'lig', 'havuzlar', 'tur'],
  fightOpts: [{}, { payGateFee: true }, { payGateFee: false }],
  amounts: [{}, { wood: 1 }, { wood: 1e12 }, { stone: 0 }, Object.fromEntries(NODES.map(k => [k, 5]))]
};
const GECERLI_DEGER = (tur) => { const t = tur.replace('?', ''); const l = GECERLI[t]; assert.ok(l && l.length, 'fuzz örneği tanımsız: ' + t); return pick(l); };

// (b) Bozuk girdi gövdeleri (ham JSON metni: JSON.stringify yapamayacağı şeyleri de gönderebilelim)
const BOZUK_ARGUMANLAR = ['[]', '[null]', '["x"]', '[{}]', '[[]]', '[1e999]', '[-1e999]', '[true]', '["__proto__"]', '[{"__proto__":{"admin":true}}]',
  '[0,0,0,0,0,0,0,0,0,0]', '[{"a":{"b":{"c":{"d":{"e":{}}}}}}]', '[9007199254740993]', '[-0]', '[0.1e-300]', '["\\u0000"]', '[{"constructor":{"prototype":{}}}]'];

// Sunucuyu kur
const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: 'yonetici-test-anahtari-uzun-1234567890', serveDist: false, rateLimitPerSec: 1e6, publicRateLimitPerSec: 1e6, ipRateLimitPerSec: 1e6, testMode: true };
const db = openDb(':memory:');
const engine = await createEngine(db, { testMode: true });
const mailer = createMailer({ db, cfg, log: quiet });
const accounts = createAccounts({ db, cfg, mailer, verifyMessage: () => '0x0' });
const world = createWorld({ db, engine, chain: null, accounts, mailer, cfg, log: quiet });
const hatalar = [];
const app = createApp({ db, engine, world, accounts, chain: null, cfg, log: { log() {}, warn() {}, error: (...a) => hatalar.push(a.map(x => (x && x.stack) || String(x)).join(' ').slice(0, 400)) } });
const server = app.server().listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
async function post(path, bodyText, token) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: bodyText });
  const metin = await res.text();
  let body = null; try { body = JSON.parse(metin); } catch { /* JSON olmayan yanıt: aşağıda kontrol edilir */ }
  return { status: res.status, body, metin };
}
const lastLink = kind => { const m = db.kvJson('dev:outbox', [])[0]; for (const p of (m ? m.text : '').matchAll(/[?&](\w+)=([a-f0-9]+)/g)) if (p[1] === kind) return p[2]; return null; };

try {
  const kayit = await post('/api/account/register', JSON.stringify({ email: 'fuzz@ornek.com', password: 'gizli-sifre-123' }));
  assert.equal(kayit.status, 200);
  const dogru = await post('/api/account/verify', JSON.stringify({ token: lastLink('verify') }));
  const token = dogru.body.token, pid = dogru.body.playerId;
  // Zengin oyuncu: pahalı işlemler de gerçekten çalışsın (yalnız bakiye/envanter/seviye)
  const zengin = () => engine.mutatePlayer(pid, gs => {
    gs.state.adAstraBalance = Math.max(Number(gs.state.adAstraBalance) || 0, 5e6);
    for (const k of NODES) gs.state.inventory[k] = Math.max(Number(gs.state.inventory[k]) || 0, 1e5);
    gs.state.level = Math.max(Number(gs.state.level) || 1, 25);
  });
  zengin();

  const durumKontrol = etiket => {
    const s = engine.readPlayer(pid);
    const metin = JSON.stringify(s);
    assert.ok(!/NaN|Infinity/.test(metin.replace(/"[^"]*"/g, m => (/NaN|Infinity/.test(m) ? '' : m))), `${etiket}: oyuncu kaydında NaN/Infinity var`);
    assert.ok(Number.isFinite(s.adAstraBalance) && s.adAstraBalance >= -1e-6, `${etiket}: ASTRA bakiyesi bozuk: ${s.adAstraBalance}`);
    for (const k of NODES) assert.ok(Number.isFinite(s.inventory[k]) && s.inventory[k] >= -1e-6, `${etiket}: ${k} envanteri bozuk: ${s.inventory[k]}`);
  };

  // 1) Bilinmeyen / tehlikeli işlem adları reddedilir
  {
    for (const ad of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'cheatAddResources', 'fastForwardTime', 'yok_boyle_islem', '', 'a'.repeat(1000)]) {
      const r = await post('/api/action', JSON.stringify({ name: ad, args: [] }), token);
      // Deneme sunucusunda test menüsü işlemleri (cheat*) bilerek açık; diğerleri 400 olmalı. Hiçbiri 500 olmamalı.
      assert.notEqual(r.status, 500, `işlem adı "${ad.slice(0, 20)}" 500 verdi`);
    }
    assert.equal((await post('/api/action', JSON.stringify({ name: 123, args: [] }), token)).status, 400);
    assert.equal((await post('/api/action', JSON.stringify({ name: { toString: 1 }, args: [] }), token)).status, 400);
    assert.equal((await post('/api/action', '{"name":"levelUp","args":"yok"}', token)).status, 200 /* args dizi değil → boş sayılır */);
    ok('bilinmeyen/tehlikeli işlem adları 500 vermez; geçersiz ad türleri 400');
  }

  // 2) (a) Geçerli ama uç değerlerle her işlem
  const IZLEYENLER = Object.keys(ACTIONS);
  const sayac = { 200: 0, 400: 0, diger: 0 };
  const basarili = new Set(); let basariliSayisi = 0;   // oyun kuralı gerçekten uyguladı (success:true)
  {
    const TUR_BASINA = 14;
    for (const ad of IZLEYENLER) {
      for (let i = 0; i < TUR_BASINA; i++) {
        const args = ACTIONS[ad].types.map(t => (t.endsWith('?') && rnd() < 0.3 ? undefined : GECERLI_DEGER(t)));
        while (args.length && args[args.length - 1] === undefined) args.pop();
        const r = await post('/api/action', JSON.stringify({ name: ad, args: args.map(a => (a === undefined ? null : a)) }), token);
        if (r.status === 200 && r.body && r.body.result && r.body.result.success === true) { basariliSayisi++; basarili.add(ad); }
        if (r.status === 200) sayac[200]++; else if (r.status === 400) sayac[400]++; else sayac.diger++;
        assert.ok([200, 400].includes(r.status), `${ad}(${JSON.stringify(args).slice(0, 120)}) beklenmeyen durum ${r.status}: ${r.metin.slice(0, 200)}`);
        if (i % 7 === 6) zengin();   // kaynaklar tükenirse yeniden doldur ki işlemler gerçekten koşsun
      }
      durumKontrol(ad);
    }
    assert.ok(sayac[200] > IZLEYENLER.length * 3, `çok az işlem gerçekten çalıştı (${sayac[200]}): fuzz anlamsız kalır`);
    assert.ok(basarili.size >= 15, `en az 15 farklı işlem gerçekten başarıyla çalışmalı (çalışan: ${basarili.size}: ${[...basarili].join(',')})`);
    ok(`${IZLEYENLER.length} işlem × 14 uç değer (${basariliSayisi} istek oyunda gerçekten uygulandı, ${basarili.size} farklı işlem): hiçbiri 500 vermedi (200:${sayac[200]}, 400:${sayac[400]}), oyuncu durumu sağlam`);
  }

  // 3) (b) Bozuk girdi gövdeleri
  {
    let n = 0;
    for (const ad of IZLEYENLER) {
      for (const arg of BOZUK_ARGUMANLAR) {
        const r = await post('/api/action', `{"name":${JSON.stringify(ad)},"args":${arg}}`, token);
        n++;
        assert.ok([200, 400].includes(r.status), `${ad} ${arg} → ${r.status}: ${r.metin.slice(0, 200)}`);
      }
    }
    // Bozuk JSON gövdeleri
    for (const govde of ['', '{', '[]', 'null', '"x"', '{"name":', '{"name":"levelUp","args":[}', '\u0000', '{"name":"levelUp","args":[]}'.repeat(3)]) {
      const r = await post('/api/action', govde, token);
      n++;
      assert.ok([200, 400].includes(r.status), `gövde ${JSON.stringify(govde).slice(0, 40)} → ${r.status}`);
    }
    durumKontrol('bozuk girdiler');
    ok(`${n} bozuk girdi: hiçbiri 500 vermedi, oyuncu durumu sağlam`);
  }

  // 4) Sunucu hâlâ ayakta ve beklenmeyen sunucu hatası günlüğe düşmedi
  {
    const h = await fetch(base + '/api/health');
    assert.equal(h.status, 200);
    await h.arrayBuffer();
    assert.deepEqual(hatalar, [], 'sunucu hata günlüğüne yazılan beklenmeyen hata var:\n' + hatalar.slice(0, 5).join('\n'));
    ok('sunucu ayakta; beklenmeyen hata günlüğü boş');
  }
} finally { server.close(); }

console.log(`\n${passed}/4 fuzz testi geçti`);
