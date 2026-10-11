// Sunucu yük ve dayanıklılık testi (kurumsal A4.1-4.3).
// Gerçek bir sunucu SÜRECİ kaldırır (TEST_MODE, geçici veritabanı), N sanal oyuncu açar, senaryoları M eşzamanlı bağlantıyla koşturur,
// gecikme (p50/p95/p99), saniyede istek, hata ve sunucu belleğini/olay döngüsünü raporlar.
//
//   node scripts/yuk/yuk.mjs --oyuncu=200 --baglanti=50,500 --sure=10 --senaryo=health,state,aksiyon,karma,statik
//   node scripts/yuk/yuk.mjs --oyuncu=500 --baglanti=100 --senaryo=karma --soak=1800     # 30 dk dayanıklılık (bellek sızıntısı)
//   ek: --heap=12288 (MB, Node eski-nesil sınırı; 16 GB makine taklidi)  --cpu-prof  --json=sonuc.json  --port=18400
// Notlar: parola özeti hafif ayarda (PAROLA_HAFIF=1; güçlü ayarın maliyeti ayrıca ölçülür), hız sınırları kapalı (tek IP'den yük).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ── Saf yardımcılar (testlenir) ──
export function yuzdelik(siraliDizi, p) {
  if (!siraliDizi.length) return 0;
  const i = Math.min(siraliDizi.length - 1, Math.max(0, Math.ceil(p / 100 * siraliDizi.length) - 1));
  return siraliDizi[i];
}
export function ozetle(gecikmelerMs, hata, sureSn) {
  const s = [...gecikmelerMs].sort((a, b) => a - b);
  const yuvarla = x => Math.round(x * 10) / 10;
  return { istek: s.length + hata, hata, rps: yuvarla((s.length + hata) / sureSn), p50: yuvarla(yuzdelik(s, 50)), p95: yuvarla(yuzdelik(s, 95)), p99: yuvarla(yuzdelik(s, 99)), max: yuvarla(s[s.length - 1] || 0) };
}
export function csvOzeti(metin) {
  const satirlar = metin.trim().split('\n').slice(1).filter(Boolean).map(l => l.split(',').map(Number));
  if (!satirlar.length) return null;
  const sutun = i => satirlar.map(r => r[i]);
  return { ornek: satirlar.length, rssMax: Math.max(...sutun(1)), heapIlk: sutun(2)[0], heapSon: sutun(2).at(-1), heapMax: Math.max(...sutun(2)), olayP99Max: Math.max(...sutun(5)), olayKullanimMax: Math.max(...sutun(6)) };
}
export function secenekler(argv) {
  const o = { oyuncu: 200, baglanti: [50], sure: 10, senaryo: ['health', 'state', 'aksiyon', 'karma', 'statik'], heap: 12288, port: 18400, cpuProf: false, soak: 0, json: '' };
  for (const a of argv) {
    const [k, v = ''] = a.replace(/^--/, '').split('=');
    if (k === 'oyuncu') o.oyuncu = Number(v);
    else if (k === 'baglanti') o.baglanti = v.split(',').map(Number);
    else if (k === 'sure') o.sure = Number(v);
    else if (k === 'senaryo') o.senaryo = v.split(',');
    else if (k === 'heap') o.heap = Number(v);
    else if (k === 'port') o.port = Number(v);
    else if (k === 'soak') o.soak = Number(v);
    else if (k === 'json') o.json = v;
    else if (k === 'cpu-prof') o.cpuProf = true;
  }
  return o;
}

const bekle = ms => new Promise(r => setTimeout(r, ms));

export async function sunucuBaslat({ port, heap, cpuProf, adminToken, tmp }) {
  const olcum = path.join(tmp, 'olcum.csv');
  const durdur = path.join(tmp, 'durdur');
  const profDizin = path.join(tmp, 'cpu');
  const bos = Object.fromEntries(['GAME_WALLET_PRIVATE_KEY', 'KASA_MASTER_KEY', 'PAYMENTS_CONTRACT', 'RATES_CONTRACT', 'RESERVE_WALLET', 'ADMIN_EMAIL', 'SMTP_URL', 'PARTNER_INCOME_FROM', 'PARTNER_INCOME_TO', 'CORS_ORIGINS', 'PUBLIC_URL', 'TRUST_PROXY', 'PAYOUT_MODE', 'CHAIN_ID'].map(k => [k, '']));
  const env = { ...process.env, ...bos, TEST_MODE: '1', CHAIN_ENABLED: '0', HOST: '127.0.0.1', PORT: String(port), DB_FILE: path.join(tmp, 'realm.db'), ADMIN_TOKEN: adminToken,
    RATE_LIMIT_PER_SEC: '1000000', IP_RATE_LIMIT_PER_SEC: '1000000', PUBLIC_RATE_LIMIT_PER_SEC: '1000000', PAROLA_HAFIF: '1',
    YUK_OLCUM_DOSYASI: olcum, YUK_DURDUR_DOSYASI: durdur, YUK_OLCUM_ARALIK_MS: '2000' };
  const bayraklar = ['--expose-gc', `--max-old-space-size=${heap}`, '--import', pathToFileURL(path.join(kok, 'scripts/yuk/olcum-kancasi.mjs')).href];
  if (cpuProf) bayraklar.push('--cpu-prof', `--cpu-prof-dir=${profDizin}`);
  const p = spawn(process.execPath, [...bayraklar, 'server/index.js'], { cwd: kok, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let cikti = '';
  p.stdout.on('data', d => { cikti += d; }); p.stderr.on('data', d => { cikti += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(base + '/api/health'); await r.arrayBuffer(); if (r.ok) return { p, base, olcum, durdur, profDizin, cikti: () => cikti }; } catch { await bekle(250); }
  }
  p.kill();
  throw new Error('Sunucu açılmadı:\n' + cikti.slice(0, 800));
}
export async function sunucuDurdur(s) {
  fs.writeFileSync(s.durdur, '1');
  await new Promise(r => { const t = setTimeout(() => { s.p.kill(); r(); }, 8000); s.p.on('close', () => { clearTimeout(t); r(); }); });
}

async function api(base, yol, { yontem = 'GET', govde, token } = {}) {
  const r = await fetch(base + yol, { method: yontem, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: govde ? JSON.stringify(govde) : undefined });
  const metin = await r.text();
  let json = null; try { json = JSON.parse(metin); } catch { /* JSON olmayan yanıt (statik dosya) */ }
  return { durum: r.status, json };
}

export async function oyuncularOlustur(base, adminToken, n, paralel = 25) {
  const yonetici = await api(base, '/api/admin/kapi', { yontem: 'POST', govde: { limit: Math.max(100, n + 50) }, token: adminToken });
  if (yonetici.durum !== 200) throw new Error('Kapı sınırı ayarlanamadı: ' + JSON.stringify(yonetici));
  const tokenlar = new Array(n);
  let sira = 0;
  async function isci() {
    for (;;) {
      const i = sira++;
      if (i >= n) return;
      const e = `yuk${i}@ornek.com`;
      const k = await api(base, '/api/account/register', { yontem: 'POST', govde: { email: e, password: 'Yuk-Parola-123' } });
      const bag = k.json && k.json.devLink;
      const m = bag && /[?&]verify=([a-f0-9]+)/.exec(bag);
      if (!m) throw new Error('Doğrulama bağlantısı yok: ' + JSON.stringify(k));
      const v = await api(base, '/api/account/verify', { yontem: 'POST', govde: { token: m[1], password: 'Yuk-Parola-123' } });
      if (!v.json || !v.json.token) throw new Error('Doğrulama başarısız: ' + JSON.stringify(v));
      tokenlar[i] = v.json.token;
    }
  }
  await Promise.all(Array.from({ length: paralel }, isci));
  return tokenlar;
}

const BASIT_ISLEMLER = [['claimAllHarvests', []], ['refillStaminaToMaxWithWheat', []], ['startExpedition', ['wood']], ['startExpedition', ['wheat']], ['repairAllTools', []], ['claimWeeklyUbi', []], ['marketBuy', ['wheat', 5]], ['marketSell', ['wheat', 1]], ['carnivalCheer', []]];
export function senaryoIstegi(ad, tokenlar, i, rnd, statikYol) {
  const token = tokenlar[i % tokenlar.length];
  if (ad === 'health') return { yol: '/api/health' };
  if (ad === 'state') return { yol: '/api/state', token };
  if (ad === 'statik') return { yol: rnd() < 0.7 ? '/' : statikYol, statik: true };
  if (ad === 'aksiyon') { const [isim, args] = BASIT_ISLEMLER[Math.floor(rnd() * BASIT_ISLEMLER.length)]; return { yol: '/api/action', yontem: 'POST', govde: { name: isim, args }, token }; }
  if (ad === 'karma') {
    const x = rnd();
    if (x < 0.5) return { yol: '/api/state', token };
    if (x < 0.9) { const [isim, args] = BASIT_ISLEMLER[Math.floor(rnd() * BASIT_ISLEMLER.length)]; return { yol: '/api/action', yontem: 'POST', govde: { name: isim, args }, token }; }
    return { yol: rnd() < 0.5 ? '/api/wallet' : '/api/pvp/status', token };
  }
  throw new Error('bilinmeyen senaryo: ' + ad);
}

async function senaryoKos(base, ad, tokenlar, baglanti, sureSn, statikYol) {
  const gecikme = []; let hata = 0; let bitis = Date.now() + sureSn * 1000; let sayac = 0;
  const rnd = (() => { let a = 12345; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  async function isci(no) {
    while (Date.now() < bitis) {
      const q = senaryoIstegi(ad, tokenlar, no * 7919 + sayac++, rnd, statikYol);
      const t0 = performance.now();
      try {
        const r = await fetch(base + q.yol, { method: q.yontem || 'GET', headers: { 'Content-Type': 'application/json', ...(q.token ? { Authorization: 'Bearer ' + q.token } : {}) }, body: q.govde ? JSON.stringify(q.govde) : undefined });
        await r.arrayBuffer();
        if (r.status >= 500 || (r.status >= 400 && r.status !== 400)) hata++; else gecikme.push(performance.now() - t0);
      } catch { hata++; }
    }
  }
  const t0 = Date.now();
  await Promise.all(Array.from({ length: baglanti }, (_, i) => isci(i)));
  return ozetle(gecikme, hata, (Date.now() - t0) / 1000);
}

export async function ana(argv) {
  const o = secenekler(argv);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yuk-'));
  const adminToken = crypto.randomBytes(24).toString('hex');
  const sonuc = { secenek: o, makine: { cpu: os.cpus().length, bellekGB: Math.round(os.totalmem() / 1073741824), node: process.version, platform: process.platform }, senaryolar: [] };
  const s = await sunucuBaslat({ port: o.port, heap: o.heap, cpuProf: o.cpuProf, adminToken, tmp });
  try {
    const t0 = Date.now();
    const tokenlar = await oyuncularOlustur(s.base, adminToken, o.oyuncu);
    sonuc.oyuncuOlusturmaSn = Math.round((Date.now() - t0) / 100) / 10;
    console.log(`${o.oyuncu} sanal oyuncu ${sonuc.oyuncuOlusturmaSn} sn'de açıldı (kayıt + doğrulama).`);
    const html = fs.readFileSync(path.join(kok, 'dist/index.html'), 'utf8');
    const statikYol = (/\/assets\/phaser-[^"']+\.js/.exec(html) || ['/'])[0];
    if (o.soak > 0) {
      console.log(`Dayanıklılık: karma senaryo, ${o.baglanti[0]} bağlantı, ${o.soak} sn.`);
      const bitisZamani = Date.now() + o.soak * 1000;
      const tur = Math.min(60, o.soak);
      while (Date.now() < bitisZamani) {
        const r = await senaryoKos(s.base, 'karma', tokenlar, o.baglanti[0], Math.min(tur, (bitisZamani - Date.now()) / 1000), statikYol);
        const c = fs.existsSync(s.olcum) ? csvOzeti(fs.readFileSync(s.olcum, 'utf8')) : null;
        console.log(`  +${Math.round((Date.now() - (bitisZamani - o.soak * 1000)) / 1000)}sn rps=${r.rps} p95=${r.p95}ms hata=${r.hata} | sunucu rss=${c && c.rssMax}MB heap(GC sonrası)=${c && c.heapSon}MB`);
        sonuc.senaryolar.push({ ad: 'soak', ...r, sunucu: c });
      }
    } else {
      for (const ad of o.senaryo) for (const b of o.baglanti) {
        const r = await senaryoKos(s.base, ad, tokenlar, b, o.sure, statikYol);
        const c = fs.existsSync(s.olcum) ? csvOzeti(fs.readFileSync(s.olcum, 'utf8')) : null;
        sonuc.senaryolar.push({ ad, baglanti: b, ...r, sunucu: c });
        console.log(`${ad.padEnd(8)} c=${String(b).padEnd(5)} rps=${String(r.rps).padEnd(8)} p50=${String(r.p50).padEnd(6)} p95=${String(r.p95).padEnd(7)} p99=${String(r.p99).padEnd(7)} max=${String(r.max).padEnd(8)} hata=${r.hata}  | sunucu rssMax=${c && c.rssMax}MB heap=${c && c.heapSon}MB olayP99=${c && c.olayP99Max}ms ELU=${c && c.olayKullanimMax}`);
      }
    }
  } finally {
    await sunucuDurdur(s);
    sonuc.sunucuOlcumCsv = fs.existsSync(s.olcum) ? fs.readFileSync(s.olcum, 'utf8') : '';
    if (o.cpuProf && fs.existsSync(s.profDizin)) { sonuc.cpuProfilDizini = s.profDizin; console.log('CPU profili:', s.profDizin, '→ node scripts/yuk/cpu-ozet.mjs "' + s.profDizin + '"'); }
    else fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(sonuc, null, 2));
  return sonuc;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ana(process.argv.slice(2)).catch(e => { console.error('❌ ' + e.message); process.exit(1); });
}
