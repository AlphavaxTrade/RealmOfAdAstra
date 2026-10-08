// Dağıtım dosyaları POLİTİKA testi (kurumsal A6): Docker bu makinede olmadığından imaj yerelde derlenemez; bunun yerine dosyaların güvenlik/
// tutarlılık ilkeleri ayrıştırılıp denetlenir (gerçek derleme CI'da, Aşama 8). Bir ilke kaldırılırsa bu test kırılır.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { DEGISKENLER } from '../scripts/env-belge.mjs';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = y => fs.readFileSync(path.join(kok, y), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

// 1) Dockerfile: çok aşamalı, kök olmayan kullanıcı, sağlık denetimi, sızıntı yok
{
  const d = oku('Dockerfile');
  const satirlar = d.split('\n').filter(s => !s.trim().startsWith('#'));
  const duz = satirlar.join('\n');
  const asamalar = [...duz.matchAll(/^FROM\s+\S+\s+AS\s+(\S+)/gim)].map(m => m[1]);
  assert.deepEqual(asamalar, ['derle', 'bagimlilik', 'calisma'], 'üç aşamalı build: derle → bagimlilik → calisma');
  assert.match(duz, /^ARG NODE_VERSION=(\d+)$/m);
  const surum = duz.match(/^ARG NODE_VERSION=(\d+)$/m)[1];
  assert.equal(surum, oku('.nvmrc').trim().split('.')[0], 'Docker ve .nvmrc aynı Node sürümünde olmalı');
  assert.ok(/npm ci --omit=dev/.test(duz), 'çalışma bağımlılıkları yalnız üretim paketleri');
  assert.ok(!/npm install/.test(duz), 'npm install yok (kilit dosyasına sadık npm ci)');
  assert.ok(!/^COPY\s+\.\s+\./m.test(duz), 'COPY . . yok: yalnız gereken klasörler kopyalanır');
  assert.ok(!/^ADD\s/m.test(duz), 'ADD yok');
  const son = duz.slice(duz.search(/^FROM\s+\S+\s+AS\s+calisma/m));
  assert.match(son, /^USER node$/m, 'çalışma imajı kök olmayan kullanıcıyla çalışır');
  assert.match(son, /^HEALTHCHECK/m, 'sağlık denetimi var');
  assert.match(son, /^STOPSIGNAL SIGTERM$/m);
  assert.match(son, /^ENV NODE_ENV=production/m, 'üretim kipi imajda hazır');
  assert.ok(!/COPY[^\n]*(tests|docs|scripts|research|contracts)/.test(son), 'çalışma imajına test/belge/araç kopyalanmaz');
  assert.ok(!/^ENV[^\n]*(KEY|TOKEN|PASSWORD|SECRET)/mi.test(duz), 'imaja gizli bilgi ENV ile gömülmez');
  assert.match(son, /COPY --from=derle[^\n]*dist/, 'derlenmiş oyun derle aşamasından gelir');
  assert.ok(!/vite|phaser|three/.test(son.replace(/--from=derle[^\n]*/g, '')), 'çalışma aşamasında derleme araçları yok');
  assert.ok(son.includes('apt-get -y upgrade'), 'taban imajın düzeltilmiş paketleri güncellenir (Trivy bulgusu)');
  for (const paketYoneticisi of ['/usr/local/lib/node_modules/npm', '/usr/local/lib/node_modules/corepack', '/opt/yarn-']) assert.ok(son.includes(paketYoneticisi), `çalışma imajından ${paketYoneticisi} kaldırılır (kullanılmayan paket yöneticisi = gereksiz açık ve saldırı yüzeyi)`);
  assert.ok(!son.includes('npm ci') && !son.includes('npm install'), 'çalışma imajı paket kurmaz');
  ok('Dockerfile: 3 aşama, Node sürümü .nvmrc ile aynı, kök olmayan kullanıcı, sağlık denetimi, gizli bilgi/gereksiz dosya yok');
}

// 2) .dockerignore: gizli bilgi ve gereksizler derleme bağlamına girmez
{
  const sat = oku('.dockerignore').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  for (const g of ['node_modules', '.git', 'server/.env', '.env', '*.db', 'secrets', 'docs', 'tests', 'data', 'logs']) assert.ok(sat.includes(g), `.dockerignore'da ${g} olmalı`);
  assert.ok(sat.includes('!scripts/sikistir.mjs'), 'derleme için gereken tek betik geri alınmış olmalı');
  ok('.dockerignore: gizli bilgi, kayıtlar, belge/test/araçlar bağlam dışında');
}

// 3) docker-compose.yml: sertleştirme + yalnız yerel port + profiller
{
  const c = YAML.parse(oku('docker-compose.yml'));
  const r = c.services.realm;
  assert.equal(r.read_only, true, 'kök dosya sistemi salt okunur');
  assert.ok(r.tmpfs.includes('/tmp'));
  assert.deepEqual(r.cap_drop, ['ALL']);
  assert.ok(r.security_opt.includes('no-new-privileges:true'));
  assert.equal(r.init, true);
  assert.ok(r.mem_limit && r.pids_limit, 'bellek ve süreç sayısı sınırı');
  assert.ok(Number.parseInt(r.mem_limit, 10) <= 12, '16 GB makinede işletim sistemi için pay bırakır');
  assert.ok(r.ports.every(p => String(p).startsWith('127.0.0.1:')), 'oyun portu yalnız yerel adrese açık (önünde HTTPS katmanı)');
  assert.equal(r.restart, 'unless-stopped');
  assert.ok(Number.parseInt(r.stop_grace_period, 10) >= 15, 'kapanış bekleme süresi (10 sn) + pay: Docker varsayılanı 10 sn yetmez');
  assert.ok(r.logging && r.logging.options['max-size'], 'günlük döndürme');
  assert.ok(r.volumes.some(v => String(v).endsWith(':/data')), 'kalıcı veri hacmi');
  assert.ok(r.environment.some(e => e === 'NODE_ENV=production'));
  for (const [ad, s] of Object.entries(c.services)) {
    assert.ok(!s.privileged, ad + ' ayrıcalıklı olmamalı');
    assert.notEqual(s.network_mode, 'host', ad + ' host ağında olmamalı');
    assert.ok(!(s.volumes || []).some(v => String(v).includes('docker.sock')), ad + ' docker.sock bağlamaz');
  }
  assert.deepEqual(c.services.caddy.profiles, ['https']);
  assert.deepEqual(c.services.yedek.profiles, ['yedek']);
  assert.ok(c.services.caddy.depends_on.realm.condition === 'service_healthy', 'Caddy sunucu sağlıklı olunca başlar');
  assert.deepEqual(c.services.caddy.cap_drop, ['ALL']);
  const yedekKomut = c.services.yedek.command;
  assert.ok(fs.existsSync(path.join(kok, yedekKomut[1])), 'yedek servisinin komutu gerçek bir dosya: ' + yedekKomut.join(' '));
  assert.ok(c.services.yedek.volumes.some(v => String(v).endsWith(':/yedek')) && c.services.yedek.volumes.some(v => String(v).endsWith(':/data')), 'yedek servisi veriyi okur, yedekleri yazar');
  assert.ok(r.volumes.includes('./yedek:/yedek:ro'), 'oyun sunucusu yedek klasörünü yalnız OKUR (yedek yaşı ölçüsü için), yazamaz');
  assert.ok(c.services.yedek.environment.some(e => e === 'YEDEK_KLASORU=/yedek') && r.environment.some(e => e === 'YEDEK_KLASORU=/yedek'));
  assert.ok(Number.parseInt(c.services.yedek.mem_limit, 10) <= 1024 || /m$/.test(c.services.yedek.mem_limit), 'yedek servisinin bellek sınırı küçük');
  ok('docker-compose.yml: salt okunur dosya sistemi, tüm yetkiler kapalı, kaynak sınırı, yalnız yerel port, günlük döndürme, profiller');
}

// 4) Gizli bilgi bindirmesi: her *_FILE değişkeni gerçek bir secret'a ve belgelenmiş bir gizli değişkene bağlı
{
  const g = YAML.parse(oku('docker-compose.gizli.yml'));
  const gizliAdlar = DEGISKENLER.filter(d => d[4].includes('G')).map(d => d[1]);
  const envler = Object.values(g.services).flatMap(s => s.environment).map(e => e.split('='));
  assert.ok(envler.length >= 4);
  for (const [ad, yol] of envler) {
    assert.ok(ad.endsWith('_FILE') && gizliAdlar.includes(ad.replace(/_FILE$/, '')), `${ad} belgelenmiş bir gizli değişkenin _FILE'ı olmalı`);
    const secretAdi = yol.replace('/run/secrets/', '');
    assert.ok(Object.values(g.services).some(s => s.secrets.includes(secretAdi)), `${secretAdi} bir servise bağlı olmalı`);
    assert.match(g.secrets[secretAdi].file, /^\.\/secrets\/.+\.txt$/, 'secret dosyaları ./secrets/ altında');
  }
  const gitignore = oku('.gitignore');
  assert.ok(/^[/]?secrets[/]?$/m.test(gitignore), "secrets/ .gitignore içinde olmalı");
  ok('gizli bilgi bindirmesi: her _FILE belgelenmiş gizli değişkene ve gerçek bir secret\'a bağlı; secrets/ git dışı');
}

// 5) Caddy ve systemd
{
  const cf = oku('deploy/Caddyfile');
  assert.match(cf, /reverse_proxy realm:8080/);
  assert.match(cf, /encode zstd gzip/);
  assert.match(cf, /lb_try_duration/, 'yeniden başlatmada 502 olmasın');
  assert.match(cf, /request_body\s*\{[^}]*max_size/s, 'gövde sınırı');
  const u = oku('deploy/realm.service');
  const yonerge = ad => { const s = u.split(String.fromCharCode(10)).find(l => l.startsWith(ad + '=')); return s ? s.slice(ad.length + 1) : undefined; };
  for (const [ad, deger] of [['NoNewPrivileges', 'true'], ['ProtectSystem', 'strict'], ['PrivateTmp', 'true'], ['ProtectHome', 'true'], ['User', 'realm']]) assert.equal(yonerge(ad), deger, ad);
  assert.ok(yonerge('MemoryMax') && yonerge('TasksMax'), 'kaynak sınırı');
  assert.ok(!/^MemoryDenyWriteExecute=true/m.test(u), 'V8 JIT için MemoryDenyWriteExecute AÇILMAMALI');
  assert.equal(yonerge('KillSignal'), 'SIGTERM');
  assert.ok((u.match(/^LoadCredential=/gm) || []).length >= 4 && (u.match(/_FILE=\/run\/credentials\/realm\.service\//g) || []).length >= 4, 'gizli bilgiler LoadCredential ile dosyadan');
  const y = oku('deploy/realm-yedek.service'), z = oku('deploy/realm-yedek.timer');
  const yy = ad => { const s = y.split(String.fromCharCode(10)).find(x => x.startsWith(ad + '=')); return s ? s.slice(ad.length + 1) : undefined; };
  assert.equal(yy('Type'), 'oneshot'); assert.equal(yy('User'), 'realm'); assert.equal(yy('NoNewPrivileges'), 'true'); assert.equal(yy('ProtectSystem'), 'strict');
  assert.ok(yy('ExecStart').endsWith('server/yedek/cli/yedekle.js') && fs.existsSync(path.join(kok, 'server/yedek/cli/yedekle.js')), 'yedek birimi gerçek betiği çalıştırır');
  assert.ok(yy('ReadWritePaths').includes('/srv/realm/yedek') && yy('MemoryMax'), 'yazılabilir yol ve kaynak sınırı');
  assert.ok(/^OnCalendar=hourly$/m.test(z) && /^Persistent=true$/m.test(z), 'saatlik ve kaçan yedek açılışta alınır');
  assert.ok(!/^LoadCredential=yedek/m.test(y), 'şifreli yedek varsayılan KAPALI (anahtar dosyası yoksa birim açılmaz); açmak için yorum satırı');
  ok('Caddyfile (HTTPS, 502 koruması, gövde sınırı) ve systemd birimi (sertleştirme, kaynak sınırı, gizli bilgi dosyadan)');
}

// 6) Derleme aşaması, tarayıcı kodunun js/ DIŞINA uzanan her içe aktarmasını kopyalıyor (ilk gerçek CI imaj derlemesi bunu yakaladı:
//    js/net/online.js ../../server/actions.js dosyasını içe alıyor ama Dockerfile kopyalamıyordu → "Could not resolve")
{
  const d = oku('Dockerfile');
  const derle = d.slice(d.indexOf(' AS derle'), d.indexOf(' AS bagimlilik'));
  const kopyalananlar = derle.split(String.fromCharCode(10)).filter(s => s.startsWith('COPY ') && !s.includes('--from')).flatMap(s => s.split(' ').slice(1, -1)).map(s => (s.startsWith('./') ? s.slice(2) : s).replace(/[/]$/, ''));
  const jsKokleri = [];
  const gez = d2 => { for (const e of fs.readdirSync(path.join(kok, d2), { withFileTypes: true })) { const y = d2 + '/' + e.name; if (e.isDirectory()) gez(y); else if (y.endsWith('.js')) jsKokleri.push(y); } };
  gez('js');
  const disari = new Set();
  for (const dosya of jsKokleri) {
    for (const satir of oku(dosya).split(String.fromCharCode(10))) {
      const bas = satir.indexOf("from '");
      if (bas < 0) continue;
      const hedef = satir.slice(bas + 6, satir.indexOf("'", bas + 6));
      if (!hedef.startsWith('.')) continue;
      const cozulen = path.posix.normalize(path.posix.join(path.posix.dirname(dosya), hedef));
      if (!cozulen.startsWith('js/')) disari.add(cozulen);
    }
  }
  assert.ok(disari.has('server/actions.js'), 'beklenen: tarayıcı kodu server/actions.js dosyasını içe alıyor');
  for (const h of disari) assert.ok(kopyalananlar.some(k => h === k || h.startsWith(k + '/')), `derle aşaması ${h} dosyasını kopyalamıyor (tarayıcı kodu içe alıyor): Dockerfile'a COPY ekleyin`);
  ok(`derleme aşaması js/ dışına uzanan ${disari.size} içe aktarmayı kopyalıyor`);
}

console.log(`\n${passed}/6 dağıtım dosyası politika testi geçti`);
