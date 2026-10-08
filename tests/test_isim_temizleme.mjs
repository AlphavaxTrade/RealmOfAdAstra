// Oyuncunun yazdığı isimler başka oyuncuların ekranında görünür (kurumsal A2.11): her giriş noktasında HTML işaretleri atılır,
// Kolezyum eşleşmesinde rakibe giden ad ve bildirimler temizdir; ekran tarafında savunma katmanları yerinde.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createArena } from '../server/arena.js';
import { cleanName } from '../js/gameState.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const KOTU = ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>', '"><svg onload=alert(1)>', "' onmouseover='alert(1)", '`${alert(1)}`', 'a\u202eb\u200bc', '&lt;b&gt;'];
const YASAK = /[<>&"'`\\\u0000-\u001f\u200b-\u200f\u2028-\u202e]/;

// 1) cleanName: tehlikeli işaretler ve görünmez/yön değiştiren karakterler atılır, uzunluk sınırlanır
{
  for (const k of KOTU) assert.ok(!YASAK.test(cleanName(k)), `temiz kalmadı: ${JSON.stringify(k)} → ${JSON.stringify(cleanName(k))}`);
  assert.equal(cleanName('x'.repeat(100)).length, 24);
  assert.equal(cleanName(null), '');
  assert.equal(cleanName('  Ali   Veli  '), 'Ali Veli');
  ok('cleanName tehlikeli işaretleri ve görünmez karakterleri atar');
}

// 2) Sunucudaki giriş noktaları: asker adı, taktik adı, Kolezyum takım adı, bildirimler
{
  const db = openDb(':memory:');
  const E = await createEngine(db, { testMode: true });
  const arena = createArena({ db, engine: E });
  const A = '0x' + 'a1'.repeat(20), B = '0x' + 'b2'.repeat(20);
  for (const addr of [A, B]) {
    db.q.playerAdd.run(addr, Date.now(), Date.now());
    E.withPlayer(addr, () => null);
    E.mutatePlayer(addr, gs => { gs.state.adAstraBalance += 20000; gs.state.arenaKeys = 5; gs.state.level = 5; });
    assert.ok(E.act(addr, 'buySoldierUnit', []).result.success);
  }
  for (const k of KOTU) {
    E.act(A, 'renameSoldierUnit', [0, k.slice(0, 24)]);
    E.act(A, 'saveCombatPreset', [1, k.slice(0, 24)]);
    const s = E.readPlayer(A);
    assert.ok(!YASAK.test(s.soldiers ? JSON.stringify(s.soldiers.map(x => x.name)) : ''), 'asker adı temiz olmalı: ' + k);
    const presetAd = s.combatPresets && s.combatPresets.presets && s.combatPresets.presets[1] && s.combatPresets.presets[1].name;
    assert.ok(!presetAd || !YASAK.test(presetAd), 'taktik adı temiz olmalı: ' + k);
  }
  // A'nın askeri saldırgan adlı; B ile eşleşince B'nin bildirimi/maç kaydı temiz olmalı
  E.act(A, 'renameSoldierUnit', [0, '<img src=x onerror=alert(1)>']);
  assert.ok(arena.queue(A, '1v1', [0]).result.success);
  const q = arena.queue(B, '1v1', [0]);
  assert.ok(q.result.matched, q.result.message);
  const bAfter = E.readPlayer(B);
  assert.ok(!/[<>"'`]/.test(String(q.result.opponentName)), 'rakip adı temiz: ' + q.result.opponentName);
  for (const n of [...(bAfter.pendingNotices || []), ...(E.readPlayer(A).pendingNotices || [])]) assert.ok(!/[<>]/.test(n.message), 'bildirimde HTML işareti: ' + n.message);
  const m = arena.getMatch(q.result.matchId);
  assert.ok(!/[<>]/.test(JSON.stringify([m.a.name, m.b.name, m.a.units.map(u => u.name), m.b.units.map(u => u.name)])), 'maç kaydındaki adlar temiz');
  for (const e of bAfter.pvpMatches || []) assert.ok(!/[<>]/.test(e.opponent), 'maç geçmişindeki rakip adı temiz');
  db.close();
  ok('asker adı, taktik adı, Kolezyum rakip adı, bildirimler ve maç kaydı temiz');
}

// 3) Ekran tarafı savunma katmanları (js/app.js kaynağı): bildirim kutusu düz yazı kullanır, rakip adları kaçışlanır
{
  const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const src = fs.readFileSync(path.join(kok, 'js/app.js'), 'utf8');
  const bas = src.indexOf('function showToast(');
  const gov = src.slice(bas, src.indexOf('\n}\n', bas));
  assert.ok(gov.includes('textContent'), 'showToast mesajı textContent ile koymalı');
  assert.ok(!/innerHTML[^;\n]*\$\{message\}/.test(gov), 'showToast mesajı innerHTML içine koymamalı');
  for (const m of src.matchAll(/<strong>\$\{([^}]*opponent[^}]*)\}<\/strong>/gi)) assert.ok(/^escHtml\(/.test(m[1].trim()), 'rakip adı kaçışlanmadan HTML\'e girmiş: ' + m[1]);
  ok('ekran: showToast düz yazı, rakip adları escHtml ile');
}

// 4) Savaş ekranı (js/battleArena.js): savaş kaydı innerHTML ile yazılır, asker adları esc() ile geçer
{
  const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const src = fs.readFileSync(path.join(kok, 'js/battleArena.js'), 'utf8');
  const ham = src.match(/\$\{(?:u\.name|t\.name|target\.name|ev\.actor|ev\.target)\}/g) || [];
  assert.deepEqual(ham, [], 'savaş ekranında kaçışsız ad ifadesi var: ' + ham.join(', '));
  assert.ok(/const esc = /.test(src), 'esc yardımcısı tanımlı olmalı');
  ok('savaş ekranı: asker adları esc() ile yazılır');
}

console.log(`\n${passed}/4 isim temizleme testi geçti`);
