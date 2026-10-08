// Statik dosya sunumu: ön-sıkıştırılmış (.br / .gz) dosyalar, Content-Length, Vary, bayat kopya koruması (kurumsal A4.5)
// + derleme sonrası sıkıştırma betiği (scripts/sikistir.mjs). Yük testi: phaser (1,46 MB) sunumu en yavaş uçtu.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { sikistirKlasor } from '../scripts/sikistir.mjs';
import { createStatic } from '../server/statik.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-sik-'));
fs.mkdirSync(path.join(dist, 'assets'));
const HTML = '<!doctype html><title>oyun</title>' + '<p>satir tekrar eden icerik</p>'.repeat(200);
const JS = '/* uygulama */\n' + 'function f(){return "deneme degeri";}\n'.repeat(1500);
fs.writeFileSync(path.join(dist, 'index.html'), HTML);
fs.writeFileSync(path.join(dist, 'assets', 'uygulama-AbCd1234.js'), JS);
fs.writeFileSync(path.join(dist, 'assets', 'kucuk.js'), 'console.log(1);');
fs.writeFileSync(path.join(dist, 'assets', 'resim.png'), crypto.getRandomValues(new Uint8Array(4000)));
fs.writeFileSync(path.join(dist, 'assets', 'sikismaz.js'), Buffer.from(crypto.getRandomValues(new Uint8Array(3000))));   // sıkıştırınca küçülmeyen gürültü

// 1) Sıkıştırma betiği: yalnız büyük ve küçülen metin dosyaları için .br/.gz üretir
{
  const r = sikistirKlasor(dist);
  const var_ = a => fs.existsSync(path.join(dist, a));
  assert.ok(var_('index.html.br') && var_('index.html.gz'), 'html sıkıştırıldı');
  assert.ok(var_('assets/uygulama-AbCd1234.js.br') && var_('assets/uygulama-AbCd1234.js.gz'));
  assert.ok(!var_('assets/kucuk.js.br'), '1 KB altı dosya sıkıştırılmaz');
  assert.ok(!var_('assets/resim.png.br'), 'görsel sıkıştırılmaz (zaten sıkışık)');
  assert.ok(!var_('assets/sikismaz.js.br'), 'küçülmeyen dosya için kopya yazılmaz');
  assert.equal(zlib.brotliDecompressSync(fs.readFileSync(path.join(dist, 'index.html.br'))).toString(), HTML);
  assert.equal(zlib.gunzipSync(fs.readFileSync(path.join(dist, 'index.html.gz'))).toString(), HTML);
  assert.ok(r.dosya >= 2 && r.kazancBayt > 0);
  const ikinci = sikistirKlasor(dist);
  assert.equal(ikinci.dosya, 0, 'ikinci çalıştırma güncel kopyalara dokunmaz');
  ok('sikistir.mjs: yalnız büyük+küçülen metin dosyaları, doğru içerik, tekrar çalıştırma zararsız');
}

// Sunucu
const statik = createStatic({ cfg: { serveDist: true, distDir: dist }, secHeaders: { 'X-Test': '1' } });
const server = http.createServer((req, res) => statik(req, res, new URL(req.url, 'http://x').pathname));
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const getir = (yol, kodlama) => new Promise((resolve, reject) => {
  http.get({ port, host: '127.0.0.1', path: yol, headers: kodlama === undefined ? {} : { 'Accept-Encoding': kodlama } }, res => {
    const parcalar = []; res.on('data', d => parcalar.push(d)); res.on('end', () => resolve({ durum: res.statusCode, baslik: res.headers, govde: Buffer.concat(parcalar) }));
  }).on('error', reject);
});

try {
  // 2) Brotli kabul edilirse brotli; içerik aynı, uzunluk doğru
  {
    const r = await getir('/assets/uygulama-AbCd1234.js', 'br, gzip');
    assert.equal(r.durum, 200);
    assert.equal(r.baslik['content-encoding'], 'br');
    assert.equal(r.baslik['vary'], 'Accept-Encoding');
    assert.equal(r.baslik['content-type'], 'text/javascript; charset=utf-8', 'tür ORİJİNAL dosyanınki (.br değil)');
    assert.equal(Number(r.baslik['content-length']), r.govde.length);
    assert.equal(zlib.brotliDecompressSync(r.govde).toString(), JS);
    assert.ok(r.govde.length < JS.length / 5, 'gerçekten küçüldü');
    assert.equal(r.baslik['cache-control'], 'public, max-age=31536000, immutable', 'önbellek kuralları sıkıştırmayla bozulmaz');
    ok('br kabul edilince brotli: doğru tür, uzunluk, içerik, önbellek başlığı');
  }

  // 3) Yalnız gzip / q=0 ile br reddi / kodlama yok
  {
    const g = await getir('/assets/uygulama-AbCd1234.js', 'gzip');
    assert.equal(g.baslik['content-encoding'], 'gzip');
    assert.equal(zlib.gunzipSync(g.govde).toString(), JS);
    const q0 = await getir('/assets/uygulama-AbCd1234.js', 'br;q=0, gzip;q=0.5');
    assert.equal(q0.baslik['content-encoding'], 'gzip', 'q=0 olan kodlama seçilmez');
    const ham = await getir('/assets/uygulama-AbCd1234.js');
    assert.equal(ham.baslik['content-encoding'], undefined);
    assert.equal(ham.govde.toString(), JS);
    assert.equal(Number(ham.baslik['content-length']), Buffer.byteLength(JS));
    assert.equal(ham.baslik['vary'], 'Accept-Encoding', 'ham yanıtta da Vary: aracılar karıştırmasın');
    ok('gzip yedeği, q=0 reddi, kodlama yokken ham içerik (Content-Length ile)');
  }

  // 4) Sıkıştırılmış kopyası olmayan dosya, br kabul edilse de ham gider; görsel Vary almaz
  {
    const k = await getir('/assets/kucuk.js', 'br, gzip');
    assert.equal(k.baslik['content-encoding'], undefined);
    assert.equal(k.govde.toString(), 'console.log(1);');
    const png = await getir('/assets/resim.png', 'br');
    assert.equal(png.baslik['content-encoding'], undefined);
    assert.equal(png.baslik['vary'], undefined, 'sıkıştırılamaz türlerde Vary yok');
    ok('kopyası olmayan dosya ham gider; görsel Vary almaz');
  }

  // 5) HTML: sıkıştırılmış gelse de CSP ve no-cache korunur; bilinmeyen sayfa ana sayfaya düşer (sıkıştırılmış)
  {
    const h = await getir('/', 'br');
    assert.equal(h.baslik['content-encoding'], 'br');
    assert.equal(h.baslik['cache-control'], 'no-cache');
    assert.match(h.baslik['content-security-policy'], /default-src 'self'/);
    assert.equal(h.baslik['x-test'], '1', 'güvenlik başlıkları korunur');
    assert.equal(zlib.brotliDecompressSync(h.govde).toString(), HTML);
    const yok = await getir('/baska/sayfa', 'br');
    assert.equal(yok.durum, 200);
    assert.equal(zlib.brotliDecompressSync(yok.govde).toString(), HTML);
    ok('HTML: CSP, no-cache ve güvenlik başlıkları sıkıştırmayla korunur');
  }

  // 6) Bayat kopya koruması: orijinal .br'den YENİYSE eski kopya sunulmaz
  {
    const orijinal = path.join(dist, 'assets', 'uygulama-AbCd1234.js');
    const yeniIcerik = JS + '\n/* yeni sürüm */';
    fs.writeFileSync(orijinal, yeniIcerik);
    const gelecek = new Date(Date.now() + 60000);
    fs.utimesSync(orijinal, gelecek, gelecek);   // orijinal sıkıştırılmış kopyalardan daha yeni
    await new Promise(r => setTimeout(r, 5200));   // dosya bilgisi önbelleği (5 sn) dolsun
    const r = await getir('/assets/uygulama-AbCd1234.js', 'br, gzip');
    assert.equal(r.baslik['content-encoding'], undefined, 'bayat .br sunulmamalı');
    assert.equal(r.govde.toString(), yeniIcerik, 'güncel ham içerik sunulur');
    ok('derleme sonrası bayat .br/.gz kopyası sunulmaz');
  }

  // 7) Yol gezme hâlâ engelli
  {
    const raw = await new Promise(resolve => {
      const net = http.request({ port, host: '127.0.0.1', path: '/..%2f..%2fetc%2fpasswd', method: 'GET' }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      net.end();
    });
    assert.ok(raw === 403 || raw === 200, 'yol gezme ya 403 ya ana sayfa: ' + raw);
    ok('yol gezme engeli sıkıştırma değişikliğinden etkilenmedi');
  }
} finally { server.close(); fs.rmSync(dist, { recursive: true, force: true }); }

console.log(`\n${passed}/7 statik sıkıştırma testi geçti`);
