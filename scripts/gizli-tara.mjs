// Gizli bilgi taraması (kurumsal A2.1): commit'e/depoya anahtar, şifre, token kaçmasın.
// Kullanım:
//   node scripts/gizli-tara.mjs            → git'in izlediği bütün dosyalar
//   node scripts/gizli-tara.mjs --staged   → yalnız commit'e eklenmiş (staged) dosyalar (pre-commit kancası)
// Bilerek sahte olan bir satırı işaretlemek için satırın sonuna şunu yaz:  gizli-tara: izin
// Çıkış kodu: 0 temiz, 1 bulgu var.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const IZIN = 'gizli-tara: izin';
const IKILI = /\.(png|jpe?g|webp|gif|ico|mp3|ogg|wav|woff2?|glb|gltf|bin|zip|gz|db|lock)$/i;
const ENV_DOSYASI = /(^|\/)\.env(\.[^/]+)?$/;
const ENV_ORNEK = /(^|\/)\.env\.(example|ornek|sample)$/;

// Her kural: ad + satırda aranacak desen
export const KURALLAR = [
  { ad: 'özel anahtar bloğu', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/ },
  { ad: 'AWS erişim anahtarı', re: /\bAKIA[0-9A-Z]{16}\b/ },
  // ANAHTAR/ŞİFRE/TOKEN adına atanmış uzun onaltılık dize (0x'li ya da değil). İşlem özetleri (tx hash) bu adlarla yazılmaz.
  // (_ADDRESS ile biten adlar herkese açık adrestir: TOKEN_ADDRESS gibi)
  { ad: 'gizli değer atanmış', re: /(?:PRIVATE_?KEY|SECRET|TOKEN|PASSWORD|MASTER_?KEY|API_?KEY)(?!\w*ADDRESS)\w*['"]?\s*[:=]\s*['"]?(?:0x)?[0-9a-fA-F]{40,}\b/i },
  // Örnek şifreler (sifre, password, xxx, <şifre> ...) sayılmaz
  { ad: 'bağlantı adresinde şifre', re: /\b(?:postgres|mysql|mongodb|smtps?|amqp):\/\/[^\s:/@]+:(?!(?:sifre|şifre|password|parola|pass|xxx+|\*+|changeme|<[^>]*>)@)[^\s@/]{3,}@/i }
];

// Tek bir metni tara; bulguları döndür ({ dosya, satir, kural })
export function taraMetin(metin, dosya = '(metin)') {
  const out = [];
  const satirlar = String(metin).split(/\r?\n/);
  for (let i = 0; i < satirlar.length; i++) {
    const s = satirlar[i];
    if (s.includes(IZIN)) continue;
    for (const k of KURALLAR) if (k.re.test(s)) out.push({ dosya, satir: i + 1, kural: k.ad });
  }
  return out;
}

// Dosya adı tek başına yasak mı (.env gibi)
export function yasakDosyaMi(ad) {
  const a = ad.replace(/\\/g, '/');
  return ENV_DOSYASI.test(a) && !ENV_ORNEK.test(a);
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function tara({ staged = false, cwd = process.cwd() } = {}) {
  const liste = git(staged ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR'] : ['ls-files'], cwd).split('\n').filter(Boolean);
  const bulgu = [];
  for (const f of liste) {
    if (yasakDosyaMi(f)) { bulgu.push({ dosya: f, satir: 0, kural: 'gizli ayar dosyası depoda' }); continue; }
    if (IKILI.test(f)) continue;
    let metin;
    try {
      metin = staged ? git(['show', ':' + f], cwd) : fs.readFileSync(path.join(cwd, f), 'utf8');
    } catch { continue; }   // silinmiş / okunamayan dosya: taranacak içerik yok
    if (metin.length > 5 * 1024 * 1024) continue;   // çok büyük dosya (veri); gizli anahtar burada aranmaz
    bulgu.push(...taraMetin(metin, f));
  }
  return bulgu;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bulgu = tara({ staged: process.argv.includes('--staged') });
  if (!bulgu.length) { console.log('✅ Gizli bilgi taraması temiz.'); process.exit(0); }
  console.error(`❌ ${bulgu.length} olası gizli bilgi bulundu:`);
  for (const b of bulgu) console.error(`   ${b.dosya}${b.satir ? ':' + b.satir : ''}  → ${b.kural}`);
  console.error('Gerçekse: anahtarı .env\'e taşı, açığa çıktıysa yenisini al. Bilerek sahteyse satıra "gizli-tara: izin" ekle.');
  process.exit(1);
}
