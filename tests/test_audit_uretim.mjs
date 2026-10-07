// scripts/audit-uretim.mjs: özet hesabı ve üretim-yalnız klasör hazırlığı (ağ gerektirmez)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ozet, uretimKlasoru } from '../scripts/audit-uretim.mjs';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

// 1) Özet: eşik ve üstünü sayar, listeyi süzer
{
  const j = {
    metadata: { vulnerabilities: { info: 0, low: 1, moderate: 2, high: 1, critical: 1, total: 5 }, dependencies: { total: 39 } },
    vulnerabilities: {
      a: { severity: 'low', isDirect: false, fixAvailable: true },
      b: { severity: 'moderate', isDirect: false, fixAvailable: true },
      nodemailer: { severity: 'high', isDirect: true, fixAvailable: { name: 'nodemailer', version: '10.0.16' } },
      z: { severity: 'critical', isDirect: false, fixAvailable: false }
    }
  };
  const o = ozet(j, 'high');
  assert.equal(o.esikUstu, 2);
  assert.deepEqual(o.liste.map(x => x.ad).sort(), ['nodemailer', 'z']);
  assert.equal(o.liste.find(x => x.ad === 'nodemailer').duzeltme, 'nodemailer@10.0.16');
  assert.equal(ozet(j, 'moderate').esikUstu, 4);
  assert.equal(o.paket, 39);
  ok('özet eşik üstü açıkları sayar ve listeler');
}

// 2) Boş/bozuk girdi çökertmez
{
  assert.equal(ozet({}, 'high').esikUstu, 0);
  assert.equal(ozet(null, 'high').esikUstu, 0);
  ok('boş girdide sıfır açık');
}

// 3) Geçici klasörde yalnız üretim bağımlılıkları var, geliştirme olanlar yok
{
  const k = uretimKlasoru();
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(k, 'package.json'), 'utf8'));
    assert.ok(k.startsWith(os.tmpdir()));
    assert.equal(pkg.devDependencies, undefined, 'devDependencies çıkarıldı');
    assert.ok(pkg.dependencies && pkg.dependencies.ethers && pkg.dependencies.nodemailer, 'üretim bağımlılıkları duruyor');
    assert.equal(pkg.dependencies.three, undefined, 'three artık üretimde değil (A1)');
    assert.ok(fs.existsSync(path.join(k, 'package-lock.json')), 'aynı sürümler için kilit dosyası kopyalandı');
  } finally { fs.rmSync(k, { recursive: true, force: true }); }
  ok('üretim-yalnız klasör doğru hazırlanır');
}

console.log(`\n${passed}/3 audit-uretim testi geçti`);
