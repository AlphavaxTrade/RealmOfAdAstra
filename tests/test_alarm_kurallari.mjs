// deploy/alarm-kurallari.yml kayma koruması (kurumsal A7.10): her uyarı kuralının baktığı ölçü gerçekten /metrics'te üretiliyor,
// her kuralda önem + özet + yapılacak var, adlar tekil. (Ölçü adı kodda değişirse alarm sessizce ölürdü: bu test onu yakalar.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kurallar = YAML.parse(fs.readFileSync(path.join(kok, 'deploy/alarm-kurallari.yml'), 'utf8'));

// Gerçek uygulamanın ölçü adları (TYPE satırları); histogramın bucket/sum/count ekleri de geçerli
const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true };
const db = openDb(':memory:');
const engine = await createEngine(db, { testMode: true });
const world = createWorld({ db, engine, chain: null, cfg, log: { log() {}, warn() {}, error() {} } });
const app = createApp({ db, engine, world, accounts: null, chain: null, cfg, log: { log() {}, warn() {}, error() {} } });
app.metrik.istek('GET /api/health', 200, 0.01);
const metin = app.metrik.metin();
app.metrik.durdur();
const adlar = new Set([...metin.matchAll(/^# TYPE (\S+) /gm)].map(m => m[1]));
for (const h of [...adlar].filter(a => /sure_saniye$/.test(a))) for (const ek of ['_bucket', '_sum', '_count']) adlar.add(h + ek);

{
  const tum = kurallar.groups.flatMap(g => g.rules);
  assert.ok(tum.length >= 8, 'en az 8 kural');
  const adlari = tum.map(k => k.alert);
  assert.equal(new Set(adlari).size, adlari.length, 'uyarı adları tekil');
  for (const k of tum) {
    assert.ok(k.alert && k.expr, 'alert + expr: ' + JSON.stringify(k));
    assert.ok(['kritik', 'uyari'].includes(k.labels?.onem), k.alert + ': onem etiketi kritik|uyari olmalı');
    assert.ok(k.annotations?.ozet && k.annotations?.yapilacak, k.alert + ': özet ve yapılacak (ne yapılacağı) şart');
    const ifadeAdlari = [...String(k.expr).matchAll(/\b(realm_[a-z0-9_]+)/g)].map(m => m[1]);
    for (const a of ifadeAdlari) assert.ok(adlar.has(a), `${k.alert}: "${a}" ölçüsü /metrics'te üretilmiyor (üretilenler: ${[...adlar].join(', ')})`);
  }
  ok(`${tum.length} alarm kuralı: önem + özet + yapılacak var; baktığı her ölçü gerçekten üretiliyor`);
}

{
  // Etiket değerleri de gerçek: sinif="5xx" ve nicelik="0.99" kurallarda geçiyor, çıktı bu etiketleri üretiyor
  const yaml = fs.readFileSync(path.join(kok, 'deploy/alarm-kurallari.yml'), 'utf8');
  assert.ok(yaml.includes('sinif="5xx"') && yaml.includes('nicelik="0.99"'));
  assert.ok(metin.includes('realm_olay_dongusu_gecikme_saniye{nicelik="0.99"}'), 'olay döngüsü p99 etiketi üretiliyor');
  assert.ok(metin.includes('realm_http_istek_toplam{rota="GET /api/health",sinif="2xx"}'), 'sınıf etiketi üretiliyor');
  ok('kurallardaki etiket değerleri (nicelik, sınıf) gerçek çıktıyla uyumlu');
}

console.log(`\n${passed}/2 alarm kuralı testi geçti`);
