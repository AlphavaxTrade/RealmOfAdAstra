// Şema belgesini migrate edilmiş veritabanından üretir: docs/kurumsal/SEMA.md (kurumsal A5.1)
//   node scripts/db/sema-belge.mjs          → dosyayı yazar
//   node scripts/db/sema-belge.mjs --kontrol → güncel mi (tests/test_sema_belge.mjs bunu çağırır)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { gecisleriCalistir } from '../../server/gecis/index.js';
import { GECISLER } from '../../server/gecis/liste.js';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const BELGE_YOLU = path.join(kok, 'docs/kurumsal/SEMA.md');

// Tabloların ne işe yaradığı (elle yazılır; belgenin tek insan emeği olan kısmı)
const ACIKLAMA = {
  kv: 'Anahtar-değer deposu: oyuncu kayıtları (`ls:player:<id>`), dünya durumu (`world:*`), Kolezyum maçları (`pvp:match:<n>`), deneme e-posta kutusu',
  players: 'Oyuncu satırı: son görülme, yatırma/çekim toplamı, yasak, kapı durumu (vatandaş / sıra / askı)',
  nonces: 'Cüzdan imzası için tek kullanımlık mesajlar (eski düzen)', sessions: 'Oturumlar (anahtarın SHA-256 özeti saklanır; düz anahtar asla)',
  deposits: 'Zincirden gelen yatırmalar (tx + log sırası = tekil)', payouts: 'Zincire gönderilecek/gönderilmiş ödemeler (pending → sending → sent)',
  withdraw_log: 'Haftalık çekim hesaplaşması kaydı (oyuncu başına)', prices: 'ADASTRA fiyat örnekleri', events: 'Olay günlüğü (giriş, yönetici işlemleri, kapı...)',
  accounts: 'Hesaplar: e-posta (+ benzersiz email_key), parola özeti, doğrulama, bağlı/bekleyen cüzdan, iki adımlı doğrulama (sır şifreli)', email_tokens: 'E-posta bağlantıları (doğrulama, şifre sıfırlama, cüzdan onayı); belirteç yalnız SHA-256 özeti',
  wallet_nonces: 'Cüzdan bağlama imza mesajları', kasa: 'Oyun Kasası: oyuncu başına sunucu yönetimli cüzdan (anahtar şifreli)', kasa_ops: 'Kasa zincir işlemleri',
  kasa_usage: 'Kasa günlük harcama toplamı (üst sınır hesabı için)', pay_quotes: 'Cüzdandan ödeme teklifleri', listings: 'İlan pazarı (teçhizat)',
  promo_codes: 'Promo kodları', promo_uses: 'Promo kodu kullanımları', promo_pending: 'Kayıtta girilen, doğrulamada kullanılacak promo kodu',
  partner_income: 'Trade sitesinden gelen ADASTRA transferleri (her biri bir kez sayılır)', kapi_ip_kabul: 'Kapı: hangi (tuzlu özetli) istemci adresinden kim ne zaman vatandaş oldu (24 saatlik adres kotası; ham adres yok)', schema_migrations: 'Uygulanmış şema geçişleri (sürüm, ad, zaman)'
};

export function belgeUret() {
  const db = new DatabaseSync(':memory:');
  gecisleriCalistir(db, { saat: () => 0 });
  const tablolar = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
  const indeksler = db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY tbl_name, name").all();
  let md = `# Veritabanı şeması (SQLite)\n\n> Bu dosya **otomatik üretilir**: \`node scripts/db/sema-belge.mjs\` (güncelliği \`tests/test_sema_belge.mjs\` korur).\n> Şema değişikliği yalnız \`server/gecis/\` altına yeni numaralı geçiş eklenerek yapılır; uygulanmış geçişler değişmez (mühür).\n\n`;
  md += `Geçişler: ${GECISLER.map(g => `${String(g.surum).padStart(3, '0')}_${g.ad}`).join(', ')}\n\n`;
  for (const t of tablolar) {
    md += `## ${t}\n\n${ACIKLAMA[t] || '(açıklama yok)'}\n\n| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |\n|---|---|---|---|---|\n`;
    for (const c of db.prepare(`PRAGMA table_info(${t})`).all()) md += `| ${c.name} | ${c.type || ''} | ${c.notnull ? 'evet' : ''} | ${c.dflt_value ?? ''} | ${c.pk ? 'PK' : ''} |\n`;
    const ix = indeksler.filter(i => i.tbl_name === t);
    if (ix.length) md += `\nİndeksler: ${ix.map(i => `\`${i.name}\``).join(', ')}\n`;
    md += '\n';
  }
  db.close();
  return md.trimEnd() + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const yeni = belgeUret();
  if (process.argv.includes('--kontrol')) {
    const eski = fs.existsSync(BELGE_YOLU) ? fs.readFileSync(BELGE_YOLU, 'utf8').replace(/\r\n/g, '\n') : '';
    if (eski !== yeni) { console.error('❌ docs/kurumsal/SEMA.md güncel değil: node scripts/db/sema-belge.mjs'); process.exit(1); }
    console.log('✅ SEMA.md güncel');
  } else { fs.writeFileSync(BELGE_YOLU, yeni); console.log('Yazıldı:', BELGE_YOLU); }
}
