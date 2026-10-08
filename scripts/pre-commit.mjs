// Commit öncesi kapı (kurumsal A8): ~15 sn. Tam doğrulama CI'da ve `npm run kontrol`'de.
// 1) gizli bilgi taraması  2) hata-sıfır lint (uyarı tavanı CI'da)  3) hızlı test grubu (tests/hizli.json)
// Kabuk kullanılmaz: Windows'ta "C:\Program Files\nodejs\node.exe" boşluk içerir ve kabukla bölünürdü.
import { spawnSync } from 'node:child_process';

// Testler kendi geçici git depolarını kurar. Git, kancayı çalıştırırken GIT_DIR / GIT_INDEX_FILE gibi değişkenleri verir (bağlı çalışma klasöründe
// daha da fazlasını); testin alt süreçleri bunları miras alırsa geçici depo yerine GERÇEK depoda çalışır (8 Ekim 2026: gerçek depoda dal
// yeniden adlandırıldı, yerel ayarlar bozuldu, kurumsal dalı GitHub'a itildi). Bu yüzden testlere GIT_* verilmez; kapının kendi taramaları verilir.
const gitDegiskenleriniAt = (env) => Object.fromEntries(Object.entries(env).filter(([k]) => !/^GIT_(?!TERMINAL_PROMPT$)/.test(k)));

const calistir = (ad, args, { testOrtami = false } = {}) => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', env: testOrtami ? gitDegiskenleriniAt(process.env) : process.env });
  if (r.status !== 0) { console.error(`\n⛔ commit durdu: "${ad}" başarısız. (Acil durumda: git commit --no-verify)`); process.exit(1); }
  console.log(`✅ ${ad} (${((Date.now() - t0) / 1000).toFixed(1)} sn)`);
};
calistir('gizli bilgi taraması', ['scripts/gizli-tara.mjs']);
calistir('lint (hata yok)', ['node_modules/eslint/bin/eslint.js', 'server', 'js', 'scripts', 'tests', 'contracts', 'eslint.config.js', '--quiet']);
calistir('hızlı testler', ['tests/run_all.mjs', '--hizli'], { testOrtami: true });
