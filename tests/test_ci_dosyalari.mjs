// CI/CD ve kalite kapısı dosyaları POLİTİKA testi (kurumsal A8). İş akışları GitHub'da çalışır (burada çalıştırılamaz); bu test dosyaların
// güvenlik/tutarlılık ilkelerini ayrıştırıp denetler: en az yetki, zaman sınırı, sabitlenmiş sürümler, yerel kontrol = CI kontrolü.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = y => fs.readFileSync(path.join(kok, y), 'utf8').replace(/\r\n/g, '\n');
const var_ = y => fs.existsSync(path.join(kok, y));
const pkg = JSON.parse(oku('package.json'));
let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const adimlar = is => is.steps || [];
const komutlar = wf => Object.values(wf.jobs).flatMap(j => adimlar(j).map(s => s.run).filter(Boolean)).join('\n');

// 1) ci.yml: tetikleyiciler, en az yetki, eşzamanlılık, zaman sınırı, güvenli desenler
{
  const wf = YAML.parse(oku('.github/workflows/ci.yml'));
  const on = wf.on || wf.true;
  assert.ok(on.push && 'pull_request' in on, 'push ve pull_request tetikler');
  assert.ok(on.push.branches.includes('main') && on.push.branches.includes('kurumsal'));
  assert.deepEqual(wf.permissions, { contents: 'read' }, 'varsayılan yetki yalnız okuma');
  assert.ok(wf.concurrency?.group && wf.concurrency['cancel-in-progress'] === true, 'aynı dalda eski koşu iptal edilir');
  for (const [ad, j] of Object.entries(wf.jobs)) assert.ok(Number.isInteger(j['timeout-minutes']) && j['timeout-minutes'] <= 30, `${ad}: zaman sınırı var`);
  const ham = oku('.github/workflows/ci.yml');
  assert.ok(!/pull_request_target/.test(ham), 'pull_request_target yok (fork koduyla gizli bilgi çalıştırılmaz)');
  assert.ok(!/\$\{\{\s*github\.event\.(issue|pull_request|comment|head_commit)/.test(ham), 'kullanıcı denetimli bağlam doğrudan komuta yazılmaz (betik enjeksiyonu)');
  assert.ok(!/secrets\./.test(ham), 'CI gizli bilgi kullanmaz');
  for (const gerekli of ['kalite', 'test', 'derleme', 'guvenlik', 'imaj']) assert.ok(wf.jobs[gerekli], `iş "${gerekli}" var`);
  ok('ci.yml: main+kurumsal+PR, yalnız okuma yetkisi, eşzamanlılık, zaman sınırları, enjeksiyon/gizli bilgi yok, 5 iş');
}

// 2) Her iş Node sürümünü .nvmrc'den alır; paketler kilit dosyasından (npm ci); eylemler sürüm etiketli
{
  const wf = YAML.parse(oku('.github/workflows/ci.yml'));
  for (const [ad, j] of Object.entries(wf.jobs)) {
    const kullan = adimlar(j).map(s => s.uses).filter(Boolean);
    for (const u of kullan) assert.match(u, /@(v?[0-9][0-9.]*|[0-9a-f]{40})$/, `${ad}: ${u} sürüm etiketli (dependabot günceller)`);
    const node = adimlar(j).find(s => /actions\/setup-node/.test(s.uses || ''));
    if (node) assert.equal(node.with['node-version-file'], '.nvmrc', `${ad}: Node sürümü .nvmrc'den`);
  }
  assert.ok(!/npm install\b/.test(komutlar(wf)), 'npm install yok (kilit dosyasına sadık npm ci)');
  assert.ok(/npm ci/.test(komutlar(wf)));
  ok('Node sürümü .nvmrc ile aynı, npm ci, eylemler sürüm etiketli');
}

// 3) CI'ın çalıştırdığı her npm betiği gerçekten var ve yerel "kontrol" ile aynı kapıları içerir
{
  const wf = YAML.parse(oku('.github/workflows/ci.yml'));
  const cmd = komutlar(wf);
  const kullanilan = [...cmd.matchAll(/npm run ([a-z0-9:-]+)/g)].map(m => m[1]);
  for (const b of kullanilan) assert.ok(pkg.scripts[b], `package.json'da "${b}" betiği yok`);
  const kontrol = oku('scripts/kontrol.mjs');
  for (const kapi of ['lint', 'olu-kod', 'gizli-tara', 'kapsam', 'kapsam-kontrol', 'build', 'audit-uretim']) {
    assert.ok(kullanilan.includes(kapi), `CI "${kapi}" kapısını çalıştırmıyor`);
    assert.ok(kontrol.includes(`'${kapi}'`), `yerel "npm run kontrol" "${kapi}" kapısını içermiyor`);
  }
  assert.ok(pkg.scripts.kontrol && pkg.scripts.hizli, 'kontrol ve hizli betikleri tanımlı');
  ok('CI ile yerel "npm run kontrol" aynı 7 kapıyı içerir; CI\'daki her npm betiği tanımlı');
}

// 4) Güvenlik işi: gizli bilgi taraması geçmişin tamamında + üretim bağımlılığı denetimi; imaj işi Trivy
{
  const wf = YAML.parse(oku('.github/workflows/ci.yml'));
  const g = JSON.stringify(wf.jobs.guvenlik);
  assert.ok(/audit-uretim/.test(g) && /gitleaks/.test(g), 'audit-uretim + gitleaks');
  const gl = adimlar(wf.jobs.guvenlik).find(s => /gitleaks/.test((s.uses || '') + (s.run || '')));
  const co = adimlar(wf.jobs.guvenlik).find(s => /actions\/checkout/.test(s.uses || ''));
  assert.equal(co.with['fetch-depth'], 0, 'gitleaks için tam geçmiş');
  assert.ok(gl, 'gitleaks adımı');
  const gitleaksSurum = JSON.stringify(wf.jobs.guvenlik).match(/gitleaks:(v[0-9.]+)/);
  assert.ok(gitleaksSurum, 'gitleaks sürümü sabitlenmiş olmalı (latest yok)');
  assert.ok(fs.existsSync(path.join(kok, '.gitleaks.toml')), 'bilinen sahte değerler .gitleaks.toml içinde nedenleriyle izinli');
  const gtoml = oku('.gitleaks.toml');
  assert.ok(gtoml.includes('useDefault = true'), 'varsayılan gitleaks kuralları açık kalmalı');
  const yolSatirlari = gtoml.split(String.fromCharCode(10)).filter(s => s.trim().startsWith('paths'));
  assert.ok(yolSatirlari.every(s => s.includes('^tests/') && s.split('^').length === 2) && yolSatirlari.length >= 1, 'yol izni yalnız tests/ için: kaynak klasörleri (server, js, scripts, deploy) kapsanmaz');
  const im = JSON.stringify(wf.jobs.imaj);
  assert.ok(/docker\/build-push-action|docker build/.test(im), 'imaj derlenir');
  assert.ok(/trivy/i.test(im), 'Trivy taraması');
  const trivySurum = im.match(/aquasec[/]trivy:([0-9][0-9.]*)/);
  assert.ok(trivySurum, 'Trivy imajı sürüm etiketiyle sabitlenmiş olmalı (latest yok)');
  assert.ok(/"push":false|push: false|"load":true/.test(im.replace(/\s/g, '')) || !/push":true/.test(im.replace(/\s/g, '')), 'CI imajı yayınlamaz');
  ok('güvenlik işi: audit-uretim + gitleaks (tam geçmiş); imaj işi: derleme + Trivy, yayın yok');
}

// 5) Elle yayın iş akışı: yalnız workflow_dispatch, imaj GHCR'a, otomatik canlıya alma yok
{
  const wf = YAML.parse(oku('.github/workflows/yayin.yml'));
  const on = wf.on || wf.true;
  assert.deepEqual(Object.keys(on), ['workflow_dispatch'], 'yalnız elle tetiklenir');
  assert.ok(on.workflow_dispatch.inputs.surum.required === true);
  const ham = oku('.github/workflows/yayin.yml');
  assert.ok(/ghcr\.io/.test(ham));
  assert.equal(wf.permissions.packages, 'write'); assert.equal(wf.permissions.contents, 'read');
  assert.ok(!/ssh|scp|rsync|kubectl|deploy/i.test(komutlar(wf)), 'sunucuya otomatik dağıtım yok');
  assert.match(ham, /\[\[\s*"\$SURUM"\s*=~|grep -Eq/, 'sürüm biçimi doğrulanır (komut enjeksiyonuna karşı)');
  ok('yayin.yml: yalnız elle, GHCR, otomatik canlıya alma yok, sürüm girdisi doğrulanır');
}

// 6) Dependabot, CODEOWNERS, PR şablonu
{
  const d = YAML.parse(oku('.github/dependabot.yml'));
  assert.equal(d.version, 2);
  const eko = d.updates.map(u => u['package-ecosystem']).sort();
  assert.deepEqual(eko, ['docker', 'github-actions', 'npm']);
  for (const u of d.updates) assert.ok(u.schedule?.interval && u['open-pull-requests-limit'] <= 10, u['package-ecosystem'] + ': takvim ve sınır');
  const co = oku('.github/CODEOWNERS');
  for (const yol of ['server/payments.js', 'server/kasa.js', 'server/chain.js', 'contracts/', '.github/', 'Dockerfile', 'deploy/']) assert.ok(co.includes(yol), `CODEOWNERS ${yol} içermeli (para/güvenlik/altyapı yolları)`);
  const pr = oku('.github/pull_request_template.md');
  for (const k of ['Ne değişti', 'Nasıl doğrulandı', 'Para', 'Gizli bilgi']) assert.ok(pr.includes(k), `PR şablonu "${k}" bölümü`);
  ok('dependabot (npm, actions, docker), CODEOWNERS (para/altyapı yolları), PR şablonu');
}

// 7) Yerel kapı: pre-commit kancası + kurulum betiği + hızlı test listesi tutarlı
{
  const kanca = oku('.githooks/pre-commit');
  assert.match(kanca, /^#!\/bin\/sh/);
  assert.ok(/scripts\/pre-commit\.mjs/.test(kanca));
  const hizli = JSON.parse(oku('tests/hizli.json'));
  assert.ok(hizli.length >= 10);
  for (const t of hizli) assert.ok(var_('tests/' + t), `hizli.json: tests/${t} yok`);
  assert.equal(new Set(hizli).size, hizli.length);
  const kur = oku('scripts/hook-kur.mjs');
  assert.ok(/core\.hooksPath/.test(kur) && /\.githooks/.test(kur));
  assert.ok(pkg.scripts['hook-kur'], 'npm run hook-kur');
  const itme = oku('.githooks/pre-push');
  assert.ok(itme.startsWith('#!/bin/sh') && itme.includes('scripts/pre-push.mjs'), 'pre-push kancası betiği çağırır');
  assert.ok(var_('scripts/pre-push.mjs'));
  assert.ok(oku('scripts/hook-kur.mjs').includes("'pre-push'"), 'hook-kur her iki kancayı da hazırlar');
  ok('pre-commit ve pre-push kancaları, hook-kur betiği ve hizli.json (var olan testler) tutarlı');
}

// 8) Dal koruma belgesi: komutlar JSON olarak ayrıştırılabilir ve zorunlu denetimler CI iş adlarıyla eşleşir
{
  const b = oku('docs/kurumsal/DAL_KORUMASI.md');
  const json = b.match(/```json\n([\s\S]*?)```/);
  assert.ok(json, 'gh api gövdesi JSON bloğu');
  const kural = JSON.parse(json[1]);
  assert.equal(kural.allow_force_pushes, false); assert.equal(kural.allow_deletions, false);
  assert.ok(kural.required_pull_request_reviews.required_approving_review_count >= 1);
  const wf = YAML.parse(oku('.github/workflows/ci.yml'));
  const adlar = Object.values(wf.jobs).map(j => j.name || '');
  for (const c of kural.required_status_checks.contexts) assert.ok(adlar.includes(c), `zorunlu denetim "${c}" CI'da iş adı olarak yok`);
  assert.ok(b.includes('gh api') && b.includes('alphavaxtrade/RealmOfAdAstra'));
  ok('DAL_KORUMASI.md: geçerli JSON, force-push/silme kapalı, zorunlu denetimler CI iş adlarıyla birebir');
}

console.log(`\n${passed}/8 CI dosyası politika testi geçti`);
