// Oyun kuralları: 4.000 tohumlu rastgele işlemde (beyaz listedeki tüm işlemler, 3 oyuncu, zaman atlamaları,
// haftalık hesaplaşma) her adımdaki oyuncu ve dünya durumu eski kodun ürettiği altın kayıtla birebir aynı olmalı.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calistir, ADIM_SAYISI, TOHUM } from './altin/oyun_fuzz_senaryo.mjs';

const dizin = path.dirname(fileURLToPath(import.meta.url));
const beklenen = JSON.parse(fs.readFileSync(path.join(dizin, 'altin', 'oyun_fuzz_kayit.json'), 'utf8'));
assert.equal(beklenen.adimSayisi, ADIM_SAYISI);
assert.equal(beklenen.tohum, TOHUM);

const { kayit, plan } = await calistir(ADIM_SAYISI, TOHUM);
assert.equal(kayit.length, beklenen.kayit.length);

const ilkFark = kayit.findIndex((k, i) => k !== beklenen.kayit[i]);
if (ilkFark >= 0) {
  const o = plan[ilkFark];
  assert.fail(`oyun ${ilkFark}. adımda altın kayıttan saptı: ${JSON.stringify(o)}`);
}
console.log(`✅ ${ADIM_SAYISI} oyun işlemi altın kayıtla birebir aynı`);

// Anlamlı mı: işlemlerin önemli bir kısmı gerçekten uygulanmış olmalı
const islemler = plan.filter(o => o.tur === 'islem');
const basarili = islemler.filter(o => o.sonuc === 'ok');
assert.ok(basarili.length > 700, `rastgele işlemlerin çok azı uygulandı: ${basarili.length}`);
assert.ok(new Set(basarili.map(o => o.ad)).size >= 50, 'başarıyla uygulanan farklı işlem sayısı düşük');
assert.ok(!islemler.some(o => o.sonuc.startsWith('HATA')), 'bir işlem hata fırlattı');
console.log(`✅ senaryo anlamlı: ${basarili.length} işlem uygulandı, ${new Set(basarili.map(o => o.ad)).size} farklı işlem`);
