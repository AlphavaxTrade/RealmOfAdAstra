// API belgesi üretici (kurumsal A10.1-A10.3). Kaynaklar: (1) koddaki gerçek rotalar ve yetkileri (createApp().rotalar()),
// (2) oyun işlemleri beyaz listesi (server/actions.js ACTIONS), (3) elle yazılan açıklamalar (docs/openapi/aciklamalar.json).
// Çıktı: docs/openapi.yaml (OpenAPI 3.1) ve docs/api/index.html (betiksiz, dış kaynaksız statik sayfa; CSP gevşetilmez).
// Kayma testi tests/test_openapi.mjs: dosyalar koddan üretilmiş hâliyle aynı olmalı. Güncelleme: node scripts/openapi-uret.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { ACTIONS } from '../server/actions.js';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const YAML_YOLU = path.join(kok, 'docs/openapi.yaml');
export const HTML_YOLU = path.join(kok, 'docs/api/index.html');
const ACIKLAMA_YOLU = path.join(kok, 'docs/openapi/aciklamalar.json');

// /api/ dışındaki uçlar (sayfalar ve ölçüm): koddaki rota tablosunda değil, istek işleyicisinde; bu yüzden burada elle tanımlı
export const OZEL_YOLLAR = [
  { anahtar: 'GET /admin', etiket: 'Sayfalar', ozet: 'Yönetici paneli sayfası', aciklama: 'Sayfanın kendisi herkese açıktır; şifre sayfada sorulur ve yönetici uçları (/api/admin/*) şifresiz çalışmaz.', guvenlik: [], icerik: 'text/html' },
  { anahtar: 'GET /admin.js', etiket: 'Sayfalar', ozet: 'Yönetici paneli betiği', aciklama: 'Panel sayfasının betiği.', guvenlik: [], icerik: 'text/javascript' },
  { anahtar: 'GET /metrics', etiket: 'Genel', ozet: 'Prometheus ölçümleri (metin biçimi)', aciklama: 'Yönetici şifresiyle ya da YALNIZ aynı makineden (vekil başlığı olmayan yerel istek). Önünde Caddy varsa dışarıdan gelen her istek şifre ister. Ölçü listesi: docs/kurumsal/GOZLEM.md', guvenlik: [{ adminAuth: [] }], icerik: 'text/plain' },
  { anahtar: 'GET /{dosya}', etiket: 'Sayfalar', ozet: 'Oyunun derlenmiş dosyaları (dist/)', aciklama: 'Hash\'li dosyalar bir yıl önbelleklenir; sıkıştırılmış (br/gz) kopyalar istemci destekliyorsa sunulur. Bilinmeyen yol ana sayfaya düşmez: 404.', guvenlik: [], icerik: '*/*', yolParametresi: 'dosya' }
];

export const TIP_ACIKLAMALARI = {
  int: 'Tam sayı (mutlak değeri en çok 1e9)',
  idx: 'Sıra numarası, 0-63',
  qty: 'Pozitif sayı (en çok 1e12)',
  bool: 'true ya da false',
  str: 'En çok 64 karakterlik metin',
  name: 'En çok 24 karakterlik ad',
  slot: 'Teçhizat yuvası: weapon, helmet, armor, legs, boots',
  node: 'Kaynak alanı / hammadde adı (js/config.js RESOURCE_KEYS)',
  res: 'Hammadde adı ya da fragments, boxes, keys',
  idxArr: '1-18 sıra numarasından oluşan dizi (her biri 0-63)',
  ref: 'Eşya konumu { source: armory|kingdom|soldier, slotKey, armoryIndex, soldierIndex, itemId } (eşyanın kendisi gönderilemez)',
  buff: 'Taverna güçlendirmesi adı (js/config.js TAVERN_BUFFS)',
  tool: 'Alet adı (js/config.js TOOLS)',
  scroll: 'Parşömen: scroll_heal, scroll_stamina, scroll_teleport, scroll_repair',
  row: 'Savaş sırası: front ya da back',
  wheelPay: 'Çark ödeme türü: ada, ticket ya da bir hammadde',
  quest: 'Rehber görevi kimliği',
  fightOpts: 'Seçenekler { payGateFee?: boolean }',
  amounts: 'Hammadde miktarları { hammadde: miktar } (en çok 8 anahtar, 0..1e12)'
};

const HATALAR = { 400: 'Geçersiz istek / kural reddi', 401: 'Giriş (oturum anahtarı) ya da yönetici yetkisi gerekli', 403: 'İzin yok (iki adımlı doğrulama kodu, vatandaşlık vb.)', 404: 'Bulunamadı ya da bu sunucuda kapalı', 409: 'Çakışma (yeniden denenebilir)', 429: 'Çok hızlı istek; biraz yavaşla', 500: 'Sunucu hatası (gövdede istekKimligi; günlükte aranır)', 503: 'Hazır değil' };
const TUR = { string: 'string', number: 'number', integer: 'integer', boolean: 'boolean', array: 'array', object: 'object' };
const opKimligi = (yontem, yol) => yontem + '_' + yol.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
const yolOf = a => a.slice(a.indexOf(' ') + 1);
const yontemOf = a => a.slice(0, a.indexOf(' ')).toLowerCase();
const yetkiGuvenligi = { acik: [], oyuncu: [{ bearerAuth: [] }], yonetici: [{ adminAuth: [] }] };
const refHata = k => ({ $ref: `#/components/responses/Hata${k}` });

async function rotalariAl() {
  const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true };
  const db = openDb(':memory:');
  const engine = await createEngine(db, { testMode: true });
  const sessiz = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
  const world = createWorld({ db, engine, chain: null, cfg, log: sessiz });
  const app = createApp({ db, engine, world, accounts: null, chain: null, cfg, log: sessiz });
  const liste = app.rotalar();
  app.metrik.durdur();
  db.close();
  return liste;
}

function islem(r, a) {
  const yol = yolOf(r.anahtar), yontem = yontemOf(r.anahtar);
  const x = a[r.anahtar];
  const op = { tags: [x.etiket], summary: x.ozet, operationId: opKimligi(yontem, yol), security: yetkiGuvenligi[r.yetki] };
  if (x.parametreler) op.parameters = x.parametreler.map(p => ({ name: p.ad, in: 'query', required: !!p.zorunlu, description: p.aciklama, schema: { type: TUR[p.tur] } }));
  if (x.govde) {
    const properties = {}, required = [];
    for (const [ad, f] of Object.entries(x.govde)) { properties[ad] = { type: TUR[f.tur], ...(f.aciklama ? { description: f.aciklama } : {}) }; if (f.zorunlu) required.push(ad); }
    op.requestBody = { required: required.length > 0, content: { 'application/json': { schema: { type: 'object', properties, ...(required.length ? { required } : {}) } } } };
  }
  const kodlar = new Set([429, 500, ...(x.govde ? [400] : []), ...(r.yetki !== 'acik' ? [401] : []), ...(x.kodlar || [])]);
  op.responses = { 200: { description: x.yanit, content: { 'application/json': { schema: { type: 'object' } } } } };
  for (const k of [...kodlar].sort((p, q) => p - q)) op.responses[k] = refHata(k);
  return { yol, yontem, op };
}

function ozelIslem(o) {
  const yol = yolOf(o.anahtar), yontem = yontemOf(o.anahtar);
  const op = { tags: [o.etiket], summary: o.ozet, description: o.aciklama, operationId: opKimligi(yontem, yol === '/{dosya}' ? '/dosya' : yol), security: o.guvenlik };
  if (o.yolParametresi) op.parameters = [{ name: o.yolParametresi, in: 'path', required: true, description: 'Dosya yolu', schema: { type: 'string' } }];
  op.responses = { 200: { description: 'İçerik', content: { [o.icerik]: { schema: { type: 'string' } } } }, 429: refHata(429), ...(o.guvenlik.length ? { 401: refHata(401) } : {}), ...(o.anahtar === 'GET /{dosya}' ? { 404: refHata(404) } : {}) };
  return { yol, yontem, op };
}

export async function uret() {
  const pkg = JSON.parse(fs.readFileSync(path.join(kok, 'package.json'), 'utf8'));
  const a = JSON.parse(fs.readFileSync(ACIKLAMA_YOLU, 'utf8'));
  const rotalar = await rotalariAl();
  const paths = {};
  const ekle = ({ yol, yontem, op }) => { (paths[yol] ??= {})[yontem] = op; };
  const etiketSirasi = ['Genel', 'Hesap', 'Oyun', 'Cüzdan ve Kasa', 'Kolezyum', 'İlan pazarı', 'Sponsorluk', 'Yönetim', 'Sayfalar'];
  const sirali = [...rotalar].sort((p, q) => etiketSirasi.indexOf(a[p.anahtar]?.etiket) - etiketSirasi.indexOf(a[q.anahtar]?.etiket));   // sort kararlı: etiket içinde kod sırası
  for (const r of sirali) { if (!a[r.anahtar]) throw new Error(`docs/openapi/aciklamalar.json içinde "${r.anahtar}" yok`); ekle(islem(r, a)); }
  for (const o of OZEL_YOLLAR) ekle(ozelIslem(o));

  const islemler = Object.fromEntries(Object.entries(ACTIONS).map(([ad, x]) => [ad, { argumanlar: x.types, ...(x.random ? { rastgele: true } : {}) }]));
  const hataYanit = k => ({ description: HATALAR[k], content: { 'application/json': { schema: { $ref: '#/components/schemas/Hata' } } } });
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Realm of AdAstra API', version: pkg.version,
      description: 'Oyun sunucusunun HTTP arayüzü. Hepsi JSON; hata gövdesi { error }. Oturum anahtarı giriş yanıtındaki token\'dır (Authorization: Bearer …). Yönetici uçları ADMIN_TOKEN ister. Her yanıtta X-Request-Id başlığı vardır; 500 yanıtında aynı kimlik gövdede de döner (günlükte aranır). Bu dosya koddan üretilir: node scripts/openapi-uret.mjs'
    },
    servers: [{ url: '/', description: 'Aynı kaynak' }],
    tags: etiketSirasi.filter(t => paths && Object.values(paths).some(m => Object.values(m).some(o => o.tags[0] === t))).map(name => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'Oyuncu oturum anahtarı (giriş yanıtındaki token; sunucuda yalnız özeti saklanır)' },
        adminAuth: { type: 'http', scheme: 'bearer', description: 'ADMIN_TOKEN (en az 24 karakter). 10 yanlış deneme IP başına 10 dakika bekletir' }
      },
      schemas: { Hata: { type: 'object', properties: { error: { type: 'string' }, istekKimligi: { type: 'string', description: 'Yalnız 500 yanıtında' } }, required: ['error'] } },
      responses: Object.fromEntries(Object.keys(HATALAR).map(k => [`Hata${k}`, hataYanit(k)]))
    },
    'x-argüman-tipleri': TIP_ACIKLAMALARI,
    'x-islemler': islemler
  };
  const yaml = '# Otomatik üretildi: node scripts/openapi-uret.mjs (elle düzenlemeyin; açıklamalar docs/openapi/aciklamalar.json içinde)\n' + YAML.stringify(spec, { lineWidth: 0 });
  return { spec, yaml, html: html(spec, a), rotalar };
}

// ── Statik sayfa: betiksiz, dış kaynaksız ───────────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const yetkiEtiketi = g => (!g.length ? ['acik', 'Açık'] : g[0].adminAuth ? ['yonetici', 'Yönetici şifresi'] : ['oyuncu', 'Oyuncu oturumu']);

function html(spec, a) {
  const satirlar = [];
  const w = s => satirlar.push(s);
  w('<!doctype html>'); w('<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">');
  w(`<title>Realm of AdAstra API</title><style>
:root{--bg:#fff;--fg:#1b1f24;--mut:#59636e;--kart:#f6f8fa;--cizgi:#d0d7de;--ac:#0969da;--acik:#1a7f37;--oyuncu:#9a6700;--yonetici:#cf222e}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--mut:#8b949e;--kart:#161b22;--cizgi:#30363d;--ac:#58a6ff;--acik:#3fb950;--oyuncu:#d29922;--yonetici:#f85149}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,sans-serif}main{max-width:900px;margin:0 auto;padding:24px 16px 64px}
h1{margin:.2em 0}h2{margin-top:2em;border-bottom:1px solid var(--cizgi);padding-bottom:.2em}code,.yol{font-family:ui-monospace,Consolas,monospace}
.op{background:var(--kart);border:1px solid var(--cizgi);border-radius:8px;padding:12px 14px;margin:12px 0}.op h3{margin:0 0 4px;font-size:1em;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.m{font-weight:700;font-size:.8em;padding:1px 8px;border-radius:4px;background:var(--ac);color:#fff}.y{font-size:.78em;border:1px solid currentColor;border-radius:10px;padding:0 8px}
.acik{color:var(--acik)}.oyuncu{color:var(--oyuncu)}.yonetici{color:var(--yonetici)}.mut{color:var(--mut)}table{border-collapse:collapse;width:100%;margin:6px 0;font-size:.92em}
th,td{border-bottom:1px solid var(--cizgi);padding:4px 8px;text-align:left;vertical-align:top}nav a{margin-right:12px}.kod{display:inline-block;margin:0 6px 2px 0;padding:0 7px;border:1px solid var(--cizgi);border-radius:4px;font-size:.85em}
</style></head><body><main>`);
  w(`<h1>Realm of AdAstra API</h1><p class="mut">Sürüm ${esc(spec.info.version)} · OpenAPI 3.1 dosyası: <code>docs/openapi.yaml</code> · Bu sayfa koddan üretilir (<code>node scripts/openapi-uret.mjs</code>).</p>`);
  w(`<p>${esc(spec.info.description)}</p>`);
  w('<p><span class="y acik">Açık</span> giriş gerekmez · <span class="y oyuncu">Oyuncu oturumu</span> <code>Authorization: Bearer &lt;token&gt;</code> · <span class="y yonetici">Yönetici şifresi</span> <code>ADMIN_TOKEN</code></p>');
  w('<nav>' + spec.tags.map(t => `<a href="#${esc(t.name)}">${esc(t.name)}</a>`).join('') + '<a href="#islemler">Oyun işlemleri</a></nav>');
  for (const t of spec.tags) {
    w(`<h2 id="${esc(t.name)}">${esc(t.name)}</h2>`);
    for (const [yol, ops] of Object.entries(spec.paths)) for (const [yontem, op] of Object.entries(ops)) {
      if (op.tags[0] !== t.name) continue;
      const [sinif, etiket] = yetkiEtiketi(op.security);
      const anahtar = `${yontem.toUpperCase()} ${yol}`;
      w(`<div class="op" id="${esc(op.operationId)}"><h3><span class="m">${yontem.toUpperCase()}</span><span class="yol">${esc(yol)}</span><span class="y ${sinif}">${etiket}</span></h3><div>${esc(op.summary)}</div>`);
      if (op.description) w(`<div class="mut">${esc(op.description)}</div>`);
      if (op.parameters) w('<table><tr><th>Parametre</th><th>Tür</th><th></th></tr>' + op.parameters.map(p => `<tr><td><code>${esc(p.name)}</code> (${esc(p.in)}${p.required ? ', zorunlu' : ''})</td><td>${esc(p.schema.type)}</td><td>${esc(p.description || '')}</td></tr>`).join('') + '</table>');
      const sema = op.requestBody?.content?.['application/json']?.schema;
      if (sema) w('<table><tr><th>İstek alanı</th><th>Tür</th><th></th></tr>' + Object.entries(sema.properties).map(([ad, f]) => `<tr><td><code>${esc(ad)}</code>${(sema.required || []).includes(ad) ? ' *' : ''}</td><td>${esc(f.type)}</td><td>${esc(f.description || '')}</td></tr>`).join('') + '</table>');
      w(`<div class="mut">Yanıt: ${esc(op.responses[200].description)}</div><div>${Object.keys(op.responses).filter(k => k !== '200').map(k => `<span class="kod" title="${esc(HATALAR[k])}">${k}</span>`).join('')}</div>`);
      if (anahtar === 'POST /api/action') w('<div class="mut">İşlem adları ve argümanları aşağıda: <a href="#islemler">Oyun işlemleri</a></div>');
      w('</div>');
    }
  }
  w('<h2 id="islemler">Oyun işlemleri (<code>POST /api/action</code>)</h2><p class="mut">Yalnız bu liste sunucuda çalışır; gelen başka her ad reddedilir. Test/hile işlemleri listede yoktur. <b>rastgele</b> işaretli işlemlerin sonucunu tarayıcı kendisi hesaplamaz, sunucuyu bekler.</p>');
  w('<table><tr><th>İşlem</th><th>Argümanlar (sırayla; ? ile bitenler isteğe bağlı)</th><th></th></tr>' + Object.entries(spec['x-islemler']).map(([ad, x]) => `<tr><td><code>${esc(ad)}</code></td><td>${x.argumanlar.length ? x.argumanlar.map(t => `<code>${esc(t)}</code>`).join(', ') : '<span class="mut">yok</span>'}</td><td>${x.rastgele ? 'rastgele' : ''}</td></tr>`).join('') + '</table>');
  w('<h3>Argüman türleri</h3><table>' + Object.entries(spec['x-argüman-tipleri']).map(([ad, s]) => `<tr><td><code>${esc(ad)}</code></td><td>${esc(s)}</td></tr>`).join('') + '</table>');
  w('</main></body></html>');
  void a;
  return satirlar.join('\n') + '\n';
}

// Doğrudan çalıştırılırsa dosyaları yaz
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { yaml, html: sayfa, rotalar } = await uret();
  fs.mkdirSync(path.dirname(HTML_YOLU), { recursive: true });
  fs.writeFileSync(YAML_YOLU, yaml);
  fs.writeFileSync(HTML_YOLU, sayfa);
  console.log(`Yazıldı: ${path.relative(kok, YAML_YOLU)} ve ${path.relative(kok, HTML_YOLU)} (${rotalar.length} rota + ${OZEL_YOLLAR.length} sayfa/ölçüm, ${Object.keys(ACTIONS).length} oyun işlemi)`);
  process.exit(0);
}
