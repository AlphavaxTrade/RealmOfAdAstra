// API belgesi KAYMA koruması (kurumsal A10.2): docs/openapi.yaml ve docs/api/index.html koddan üretilmiş hâliyle aynı olmalı;
// koddaki her rota belgede, belgedeki her rota kodda; yetki işaretleri koddakiyle birebir; her rotanın elle yazılmış açıklaması var;
// oyun işlemleri (POST /api/action) beyaz listeyle birebir. Yeni rota/işlem eklenince bu test, belgeyi güncelleyene dek kırar.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { uret, OZEL_YOLLAR, TIP_ACIKLAMALARI, YAML_YOLU, HTML_YOLU } from '../scripts/openapi-uret.mjs';
import { ACTIONS } from '../server/actions.js';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = y => (fs.existsSync(y) ? fs.readFileSync(y, 'utf8').replace(/\r\n/g, '\n') : '');
let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

const { yaml, html, rotalar } = await uret();
const diskSpec = YAML.parse(oku(YAML_YOLU));
const aciklamalar = JSON.parse(fs.readFileSync(path.join(kok, 'docs/openapi/aciklamalar.json'), 'utf8'));
const yolOf = anahtar => anahtar.slice(anahtar.indexOf(' ') + 1);
const yontemOf = anahtar => anahtar.slice(0, anahtar.indexOf(' ')).toLowerCase();

// 1) Diskteki dosyalar koddan üretilmiş hâliyle aynı
{
  assert.equal(oku(YAML_YOLU), yaml, 'docs/openapi.yaml güncel değil: node scripts/openapi-uret.mjs');
  assert.equal(oku(HTML_YOLU), html, 'docs/api/index.html güncel değil: node scripts/openapi-uret.mjs');
  ok('docs/openapi.yaml ve docs/api/index.html koddan üretilmiş hâliyle aynı');
}

// 2) Rotalar iki yönlü örtüşür (kod ↔ belge)
{
  assert.ok(rotalar.length >= 53, 'rota sayısı: ' + rotalar.length);
  const belgede = new Set();
  for (const [yol, ops] of Object.entries(diskSpec.paths)) for (const yontem of Object.keys(ops)) belgede.add(`${yontem.toUpperCase()} ${yol}`);
  const kodda = new Set([...rotalar.map(r => r.anahtar), ...OZEL_YOLLAR.map(o => o.anahtar)]);
  assert.deepEqual([...kodda].filter(k => !belgede.has(k)), [], 'kodda olup belgede olmayan rota');
  assert.deepEqual([...belgede].filter(k => !kodda.has(k)), [], 'belgede olup kodda olmayan rota');
  ok(`${kodda.size} rota (kod ${rotalar.length} + sayfa/metrik ${OZEL_YOLLAR.length}) iki yönlü örtüşüyor`);
}

// 3) Yetki işaretleri koddakiyle birebir (acik / oyuncu / yonetici)
{
  const bekle = { acik: [], oyuncu: [{ bearerAuth: [] }], yonetici: [{ adminAuth: [] }] };
  for (const r of rotalar) {
    const op = diskSpec.paths[yolOf(r.anahtar)][yontemOf(r.anahtar)];
    assert.deepEqual(op.security, bekle[r.yetki], `${r.anahtar}: kodda "${r.yetki}", belgede ${JSON.stringify(op.security)}`);
  }
  assert.equal(rotalar.filter(r => r.yetki === 'yonetici').length >= 12, true, 'yönetici uçları işaretli');
  assert.ok(rotalar.every(r => !r.anahtar.startsWith('POST /api/admin') && !r.anahtar.startsWith('GET /api/admin') || r.yetki === 'yonetici'), 'her /api/admin ucu yönetici yetkili');
  ok('her rotanın güvenlik işareti koddaki yetkiyle aynı; /api/admin/* hep yönetici');
}

// 4) Elle yazılan açıklamalar tam ve güncel
{
  const anahtarlar = rotalar.map(r => r.anahtar);
  assert.deepEqual(anahtarlar.filter(a => !aciklamalar[a]), [], 'açıklaması olmayan rota: docs/openapi/aciklamalar.json');
  assert.deepEqual(Object.keys(aciklamalar).filter(a => !a.startsWith('_') && !anahtarlar.includes(a)), [], 'kodda artık olmayan rotanın açıklaması');
  for (const a of anahtarlar) {
    const x = aciklamalar[a];
    assert.ok(x.ozet && x.ozet.length >= 8 && x.etiket && x.yanit, `${a}: özet, etiket ve yanıt açıklaması gerekli`);
    const op = diskSpec.paths[yolOf(a)][yontemOf(a)];
    assert.ok(op.summary && op.responses['200'] && op.responses['500'] && op.responses['429'], `${a}: özet, 200/429/500`);
    if (x.govde) assert.ok(op.requestBody?.content?.['application/json']?.schema?.properties, `${a}: istek gövdesi belgeli`);
  }
  ok('her rotanın özeti, etiketi, yanıt notu var; fazlalık yok; gövde alanları belgeli');
}

// 5) Oyun işlemleri beyaz listeyle birebir
{
  const belge = diskSpec['x-islemler'];
  assert.deepEqual(Object.keys(belge).sort(), Object.keys(ACTIONS).sort(), 'x-islemler = server/actions.js ACTIONS');
  for (const [ad, a] of Object.entries(ACTIONS)) {
    assert.deepEqual(belge[ad].argumanlar, a.types, `${ad}: argüman türleri`);
    assert.equal(!!belge[ad].rastgele, !!a.random, `${ad}: rastgele işareti`);
  }
  const kullanilan = new Set(Object.values(ACTIONS).flatMap(a => a.types.map(t => t.replace('?', ''))));
  assert.deepEqual([...kullanilan].filter(t => !TIP_ACIKLAMALARI[t]), [], 'açıklaması olmayan argüman türü');
  assert.deepEqual(Object.keys(diskSpec['x-argüman-tipleri']).sort(), Object.keys(TIP_ACIKLAMALARI).sort());
  assert.ok(!Object.keys(belge).some(a => /^(cheat|setDev|addDev)/.test(a)), 'hile/test işlemleri belgede yok');
  ok(`${Object.keys(belge).length} oyun işlemi beyaz listeyle birebir (argüman türleri ve rastgele işareti dahil); test/hile işlemleri yok`);
}

// 6) OpenAPI 3.1 yapı sağlığı: $ref'ler çözülür, her işlemin benzersiz kimliği var, güvenlik şemaları tanımlı
{
  assert.equal(diskSpec.openapi, '3.1.0'); assert.ok(diskSpec.info.title && diskSpec.info.version);
  const ref = JSON.stringify(diskSpec).match(/"\$ref":"([^"]+)"/g) || [];
  assert.ok(ref.length > 50);
  for (const r of ref) {
    const hedef = r.slice(8, -1).replace('#/', '').split('/');
    let n = diskSpec; for (const p of hedef) n = n?.[p];
    assert.ok(n, `çözülmeyen $ref: ${r}`);
  }
  const idler = [];
  for (const ops of Object.values(diskSpec.paths)) for (const op of Object.values(ops)) idler.push(op.operationId);
  assert.equal(new Set(idler).size, idler.length, 'operationId tekil');
  assert.ok(diskSpec.components.securitySchemes.bearerAuth && diskSpec.components.securitySchemes.adminAuth);
  for (const ops of Object.values(diskSpec.paths)) for (const op of Object.values(ops)) for (const s of op.security || []) for (const ad of Object.keys(s)) assert.ok(diskSpec.components.securitySchemes[ad], 'tanımsız güvenlik şeması ' + ad);
  ok('OpenAPI 3.1 yapısı sağlam: $ref\'ler çözülüyor, işlem kimlikleri tekil, güvenlik şemaları tanımlı');
}

// 7) Statik görünüm: dış betik/stil yok (CSP gevşetilmez), her rota sayfada
{
  assert.ok(!/<script|<link|https?:\/\//i.test(html.replace(/<a [^>]*href="https?:[^"]*"[^>]*>/g, '')), 'dış kaynak/betik yok');
  for (const r of rotalar) assert.ok(html.includes(yolOf(r.anahtar)), `${r.anahtar} sayfada`);
  assert.ok(html.includes('lang="tr"') && html.includes('<title>'));
  ok('statik API sayfası kendi kendine yeter (betik ve dış kaynak yok); her rota içinde');
}

console.log(`\n${passed}/7 API belgesi testi geçti`);
