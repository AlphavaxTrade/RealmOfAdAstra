// Git kancalarını bu depoya bağlar (kurumsal A8): .githooks klasörü sürüm kontrolünde olduğundan herkes aynı kapıları kullanır.
//   pre-commit : gizli bilgi taraması + hata-sıfır lint + hızlı testler (~15 sn)
//   pre-push   : main dalına doğrudan itmeyi engeller (GitHub ücretsiz planda dal koruması yok; docs/kurumsal/DAL_KORUMASI.md)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const r = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
if (r.status !== 0) { console.error('git config başarısız: bu klasör bir git deposu mu?'); process.exit(1); }
for (const kanca of ['pre-commit', 'pre-push']) {
  try { fs.chmodSync('.githooks/' + kanca, 0o755); } catch (err) { console.warn(`chmod atlandı (${kanca}; Windows için gerekmez):`, err.message); }
}
console.log('✅ Kancalar kuruldu: commit öncesi gizli bilgi + lint + hızlı testler; main\'e doğrudan itme engelli (istisna: REALM_MAIN_PUSH=1).');
