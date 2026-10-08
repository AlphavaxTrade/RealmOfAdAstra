// İtme öncesi kapı (.githooks/pre-push). GitHub'ın ücretsiz planında gizli depoya dal koruması konamadığından (docs/kurumsal/DAL_KORUMASI.md)
// yerel güvence: `main`'e doğrudan itmek (zorla itmek ve silmek dahil) ENGELLENİR. Kod `kurumsal` gibi bir dala itilir, birleştirme bilinçli yapılır.
// Bilinçli istisna: REALM_MAIN_PUSH=1 git push ...   (kancayı hiç atlamak: git push --no-verify)
// git bu betiğe stdin'den satır satır verir: <yerel ref> <yerel sha> <uzak ref> <uzak sha>
import fs from 'node:fs';

let girdi = '';
try { girdi = fs.readFileSync(0, 'utf8'); } catch { /* stdin yoksa (elle çalıştırma) engellenecek bir şey yok */ }
const mainHedefi = girdi.split(String.fromCharCode(10)).map(s => s.trim().split(' ')).filter(p => p.length >= 4 && p[2] === 'refs/heads/main');
if (mainHedefi.length && process.env.REALM_MAIN_PUSH !== '1') {
  console.error([
    '',
    '⛔ main dalına doğrudan itme engellendi (yerel koruma).',
    '   GitHub ücretsiz planda gizli depoya dal koruması koymaya izin vermiyor; bu kanca onun yerine yanlışlıkla itmeyi önler.',
    '   Kodu çalışma dalına itin:  git push origin kurumsal',
    '   main\'e bilerek göndermek için (CI yeşilse, kontrol ettikten sonra):  REALM_MAIN_PUSH=1 git push origin <dal>:main',
    ''
  ].join(String.fromCharCode(10)));
  process.exit(1);
}
process.exit(0);
