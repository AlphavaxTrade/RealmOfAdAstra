// Kaynak dosyalar git'e GİRİYOR mu (kurumsal A9 dersi): `.gitignore` içindeki `yedek/` satırı her klasörde geçerli olduğundan server/yedek/
// (Aşama 9'un bütün kodu) sessizce git dışı kalmış, yerelde testler geçtiği için fark edilmemiş, ilk CI koşusu yakalamıştı. Bu test aynı
// kazayı kalıcı olarak kapatır: kaynak klasörlerde git'in YOKSAYDIĞI dosya olamaz (bilinen üretilmiş yollar hariç).
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const git = (...args) => spawnSync('git', args, { cwd: kok, encoding: 'utf8' });

if (git('rev-parse', '--is-inside-work-tree').stdout.trim() !== 'true') {
  console.log('⏭️  git deposu değil (kaynak paketinden çalışıyor): test atlandı');
  process.exit(0);
}

const KAYNAK_KLASORLERI = ['server/', 'js/', 'scripts/', 'tests/', 'deploy/', 'contracts/', 'css/', 'public/', 'docs/kurumsal/', '.github/', '.githooks/'];
// Bilerek git dışı: gizli ayar, üretilen derleme çıktısı
const BILEREK = new Set(['server/.env', 'contracts/build/']);

// 1) Kaynak klasörlerde yoksayılan dosya yok
{
  const r = git('ls-files', '--others', '--ignored', '--exclude-standard', '--directory');
  assert.equal(r.status, 0, r.stderr);
  const yoksayilan = r.stdout.split('\n').map(s => s.trim()).filter(Boolean)
    .filter(y => KAYNAK_KLASORLERI.some(k => y.startsWith(k)) && !BILEREK.has(y));
  assert.deepEqual(yoksayilan, [], 'git bu kaynak yollarını SESSİZCE yoksayıyor (.gitignore çok geniş olabilir): ' + yoksayilan.join(', '));
  ok('kaynak klasörlerde git\'in yoksaydığı dosya yok');
}

// 2) Kritik kaynaklar gerçekten izleniyor (commit'e girmiş)
{
  const gerekli = ['server/yedek/yedekle.js', 'server/yedek/geriyukle.js', 'server/yedek/sifre.js', 'server/yedek/saklama.js', 'server/yedek/dongu.js',
    'server/yedek/cli/yedekle.js', 'server/yedek/cli/geri-yukle.js', 'server/yedek/cli/dogrula.js', 'server/index.js', 'server/log.js', 'server/gecis/MUHUR.json'];
  const izlenen = new Set(git('ls-files').stdout.split('\n'));
  assert.deepEqual(gerekli.filter(y => !izlenen.has(y)), [], 'izlenmeyen kritik dosya (git add edilmemiş ya da yoksayılıyor)');
  ok(`${gerekli.length} kritik kaynak dosya git'te izleniyor`);
}

// 3) Yalnız kökteki yedek/ ve secrets/ klasörleri yoksayılır
{
  const yoksay = y => git('check-ignore', '-q', y).status === 0;
  assert.equal(yoksay('yedek/realm-20261008-100000.db.gz'), true, 'kökteki yedek klasörü yoksayılmalı (içinde veritabanı yedekleri olur)');
  assert.equal(yoksay('secrets/admin_token.txt'), true, 'kökteki secrets klasörü yoksayılmalı');
  assert.equal(yoksay('server/yedek/yedekle.js'), false, 'server/yedek kaynak kodudur, yoksayılmamalı');
  ok('.gitignore yalnız kökteki yedek/ ve secrets/ klasörlerini yoksayıyor, server/yedek kaynağını değil');
}

console.log(`\n${passed}/3 git izleme testi geçti`);
