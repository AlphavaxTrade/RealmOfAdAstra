// Git kancalarını bu depoya bağlar (kurumsal A8): .githooks klasörü sürüm kontrolünde olduğundan herkes aynı kapıyı kullanır.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const r = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
if (r.status !== 0) { console.error('git config başarısız: bu klasör bir git deposu mu?'); process.exit(1); }
try { fs.chmodSync('.githooks/pre-commit', 0o755); } catch (err) { console.warn('chmod atlandı (Windows\'ta gerekmez):', err.message); }
console.log('✅ Kanca kuruldu: her commit öncesi gizli bilgi taraması + hata-sıfır lint + hızlı testler çalışır.');
