// Belge sağlığı (kurumsal A10): belgelerin verdiği bağlantılar, bahsettiği dosya yolları ve `npm run` komutları GERÇEKTEN var mı;
// mermaid şemaları kapalı ve tanınan türde mi. Kod değişince belge sessizce eskimesin (kırık bağlantı = kırık test).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(kok, 'package.json'), 'utf8'));
let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const oku = y => fs.readFileSync(path.join(kok, y), 'utf8').replace(/\r\n/g, '\n');
const var_ = y => fs.existsSync(path.join(kok, y));

// Denetlenen belgeler: bu dönüşümde yazılan/güncellenenler (eski tasarım belgelerinin kırık bağlantıları kapsam dışı)
const belgeler = ['README.md', 'docs/architecture.md', 'docs/DEPLOY.md', 'docs/SUNUCU_KURULUM.md',
  ...fs.readdirSync(path.join(kok, 'docs/kurumsal')).filter(f => f.endsWith('.md')).map(f => 'docs/kurumsal/' + f),
  ...fs.readdirSync(path.join(kok, 'docs/kurumsal/ADR')).filter(f => f.endsWith('.md')).map(f => 'docs/kurumsal/ADR/' + f)];

// Git'e girmeyen ya da çalışma sırasında oluşan yollar: varlığı beklenmez
const BEKLENMEYEN = new Set(['server/.env', 'server/.env.example', 'dist', 'data', 'yedek', 'secrets', 'coverage', 'logs']);
const kodBloklarindanArinmis = md => md.replace(/```[\s\S]*?```/g, '');
const DIZINLER = ['server/', 'js/', 'docs/', 'scripts/', 'deploy/', 'tests/', 'contracts/', 'css/', 'public/'];

// 1) Markdown bağlantıları (göreli) var olan dosyaya gidiyor
{
  let sayac = 0;
  for (const b of belgeler) {
    const md = kodBloklarindanArinmis(oku(b));
    for (const m of md.matchAll(/\]\(([^)\s]+)\)/g)) {
      const hedef = m[1].split('#')[0];
      if (!hedef || /^(https?:|mailto:)/.test(hedef)) continue;
      const yol = path.normalize(path.join(path.dirname(b), hedef)).split(path.sep).join('/');
      assert.ok(var_(yol), `${b}: bağlantı hedefi yok → ${m[1]}`);
      sayac++;
    }
  }
  assert.ok(sayac >= 15, 'bağlantı sayısı: ' + sayac);
  ok(`${belgeler.length} belgede ${sayac} göreli bağlantı var olan dosyaya gidiyor`);
}

// 2) Belgelerde `kod biçiminde` geçen depo yolları gerçekten var
{
  let sayac = 0; const eksik = [];
  for (const b of belgeler) {
    for (const m of kodBloklarindanArinmis(oku(b)).matchAll(/`([^`\n]+)`/g)) {
      let y = m[1].trim();
      if (!DIZINLER.some(d => y.startsWith(d))) continue;
      if (/[*<>{}$|=\s]/.test(y) || y.includes('...') || y.includes('…')) continue;          // kalıp/değişken/komut: yol değil
      y = y.replace(/[,.;:)]+$/, '');
      if (BEKLENMEYEN.has(y) || BEKLENMEYEN.has(y.replace(/\/$/, ''))) continue;
      if (b === 'docs/SUNUCU_KURULUM.md') continue;
      sayac++;
      if (!var_(y.replace(/\/$/, ''))) eksik.push(`${b}: ${y}`);
    }
  }
  assert.deepEqual(eksik, [], 'belgede geçen ama depoda olmayan yollar');
  assert.ok(sayac >= 80, 'denetlenen yol sayısı: ' + sayac);
  ok(`belgelerde geçen ${sayac} depo yolu gerçekten var`);
}

// 3) Belgelerdeki `npm run X` komutları package.json'da tanımlı
{
  const kullanilan = new Set();
  for (const b of belgeler) for (const m of oku(b).matchAll(/npm run ([a-z0-9:-]+)/g)) kullanilan.add(m[1]);
  assert.deepEqual([...kullanilan].filter(k => !pkg.scripts[k]), [], 'package.json\'da olmayan npm betiği');
  assert.ok(kullanilan.size >= 10, 'denetlenen komut: ' + kullanilan.size);
  ok(`belgelerdeki ${kullanilan.size} farklı "npm run" komutu tanımlı`);
}

// 4) Mermaid şemaları: bloklar kapalı, tanınan türde
{
  let sayac = 0;
  for (const b of belgeler) {
    const md = oku(b);
    assert.equal((md.match(/```/g) || []).length % 2, 0, `${b}: kapanmamış kod bloğu`);
    for (const m of md.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
      sayac++;
      assert.match(m[1].trim(), /^(flowchart|sequenceDiagram|graph|stateDiagram|erDiagram)\b/, `${b}: tanınmayan mermaid türü`);
      const acik = (m[1].match(/\bsubgraph\b/g) || []).length, kapali = (m[1].match(/^\s*end\s*$/gm) || []).length;
      assert.equal(acik, kapali, `${b}: subgraph/end sayısı eşit değil`);
    }
  }
  assert.ok(sayac >= 4, 'mermaid şema sayısı: ' + sayac);
  ok(`${sayac} mermaid şeması kapalı ve tanınan türde`);
}

// 5) Her ADR numaralı, tarihli ve durumlu; numaralar ardışık, tekil
{
  const adrler = fs.readdirSync(path.join(kok, 'docs/kurumsal/ADR')).filter(f => f.endsWith('.md')).sort();
  adrler.forEach((f, i) => {
    assert.match(f, /^[0-9]{4}-/, f);
    assert.equal(Number(f.slice(0, 4)), i + 1, `ADR numarası ardışık değil: ${f}`);
    const md = oku('docs/kurumsal/ADR/' + f);
    assert.ok(md.split(String.fromCharCode(10))[0].startsWith(`# ADR ${f.slice(0, 4)}:`), `${f}: başlık numarası dosya adıyla uyuşmuyor`);
    assert.match(md, /Tarih: .*Durum: /, `${f}: tarih ve durum satırı`);
  });
  ok(`${adrler.length} ADR ardışık numaralı, başlık/tarih/durum tamam`);
}

console.log(`\n${passed}/5 belge sağlığı testi geçti`);
