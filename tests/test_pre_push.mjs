// scripts/pre-push.mjs (.githooks/pre-push): GitHub ücretsiz planında gizli depoya dal koruması konamadığı için (docs/kurumsal/DAL_KORUMASI.md)
// yerel güvence: `main`'e doğrudan itme ve `main`'i silme ENGELLENİR (bilinçli istisna: REALM_MAIN_PUSH=1). Gerçek git depolarıyla sınanır.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const betik = path.join(kok, 'scripts', 'pre-push.mjs');
let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

if (spawnSync('git', ['--version']).status !== 0) { console.log('⏭️  git yok: test atlandı'); process.exit(0); }

const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'prepush-'));
const git = (cwd, env, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env } });
try {
  const uzak = path.join(gecici, 'uzak.git'), is = path.join(gecici, 'is');
  git(gecici, {}, 'init', '-q', '--bare', uzak);
  git(gecici, {}, 'clone', '-q', uzak, is);
  for (const [k, v] of [['user.email', 'test@ornek.com'], ['user.name', 'Test'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) git(is, {}, 'config', k, v);
  // Kanca: gerçek betiği mutlak yoldan çağırır (deponun kendi .githooks/pre-push dosyasıyla aynı mantık)
  fs.mkdirSync(path.join(is, '.githooks'));
  fs.writeFileSync(path.join(is, '.githooks', 'pre-push'), `#!/bin/sh\nexec node "${betik.split(path.sep).join('/')}" "$@"\n`, { mode: 0o755 });
  git(is, {}, 'config', 'core.hooksPath', '.githooks');
  fs.writeFileSync(path.join(is, 'a.txt'), '1');
  git(is, {}, 'add', '-A'); git(is, {}, 'commit', '-q', '-m', 'ilk');
  git(is, {}, 'branch', '-M', 'main');
  git(is, {}, 'checkout', '-q', '-b', 'kurumsal');

  // 1) Özellik dalına itme serbest
  {
    const r = git(is, {}, 'push', '-q', 'origin', 'kurumsal');
    assert.equal(r.status, 0, r.stderr);
    ok('kurumsal gibi bir dala itme serbest');
  }
  // 2) main'e doğrudan itme engellenir ve nedeni açıkça yazılır
  {
    const r = git(is, {}, 'push', 'origin', 'kurumsal:main');
    assert.notEqual(r.status, 0, 'main\'e itme engellenmeliydi');
    assert.match(r.stderr, /main/); assert.match(r.stderr, /REALM_MAIN_PUSH=1/);
    assert.equal(git(uzak, {}, 'rev-parse', '--verify', '-q', 'refs/heads/main').status !== 0, true, 'uzakta main OLUŞMADI');
    ok('main\'e doğrudan itme engellenir; mesaj nedeni ve istisna yolunu söyler');
  }
  // 3) Bilinçli istisna: REALM_MAIN_PUSH=1
  {
    const r = git(is, { REALM_MAIN_PUSH: '1' }, 'push', '-q', 'origin', 'kurumsal:main');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(git(uzak, {}, 'rev-parse', '--verify', 'refs/heads/main').status, 0, 'uzakta main oluştu');
    ok('REALM_MAIN_PUSH=1 ile bilinçli itme çalışır');
  }
  // 4) main'i silmek (ve zorla itmek) de engellenir
  {
    const sil = git(is, {}, 'push', 'origin', ':main');
    assert.notEqual(sil.status, 0, 'main silme engellenmeliydi');
    fs.writeFileSync(path.join(is, 'a.txt'), '2'); git(is, {}, 'commit', '-q', '-am', 'ikinci');
    const zorla = git(is, {}, 'push', '--force', 'origin', 'kurumsal:main');
    assert.notEqual(zorla.status, 0, 'main\'e zorla itme engellenmeliydi');
    ok('main silme ve main\'e zorla itme engellenir');
  }
  // 5) Betik doğrudan: stdin biçimi (yerel ref, yerel sha, uzak ref, uzak sha); main dışı her şey geçer
  {
    const sifir = '0'.repeat(40);
    const calistir = (girdi, env = {}) => spawnSync(process.execPath, [betik, 'origin', 'url'], { input: girdi, encoding: 'utf8', env: { ...process.env, ...env } });
    assert.equal(calistir(`refs/heads/x ${'a'.repeat(40)} refs/heads/x ${sifir}\n`).status, 0);
    assert.equal(calistir(`refs/heads/x ${'a'.repeat(40)} refs/tags/v1 ${sifir}\n`).status, 0, 'etiket itme serbest');
    assert.equal(calistir(`refs/heads/x ${'a'.repeat(40)} refs/heads/main ${sifir}\n`).status, 1);
    assert.equal(calistir(`(delete) ${sifir} refs/heads/main ${'b'.repeat(40)}\n`).status, 1);
    assert.equal(calistir(`refs/heads/x ${'a'.repeat(40)} refs/heads/main ${sifir}\n`, { REALM_MAIN_PUSH: '1' }).status, 0);
    assert.equal(calistir('').status, 0, 'boş girdi sorun çıkarmaz');
    ok('betik: yalnız refs/heads/main hedefi engellenir; etiket, diğer dallar ve boş girdi geçer');
  }
} finally { try { fs.rmSync(gecici, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { console.warn('geçici klasör silinemedi:', e.code); } }

console.log(`\n${passed}/5 pre-push testi geçti`);
