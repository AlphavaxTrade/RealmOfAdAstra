// Ekonomi çekirdeği (hazine defteri + pazar motoru + küresel havuz): 4.000 tohumlu işlemin
// her adımdaki durumu, eski kodun ürettiği altın kayıtla birebir aynı olmalı.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calistir, ISLEM_SAYISI, TOHUM } from './altin/ekonomi_senaryo.mjs';

const dizin = path.dirname(fileURLToPath(import.meta.url));
const kayit = JSON.parse(fs.readFileSync(path.join(dizin, 'altin', 'ekonomi_kayit.json'), 'utf8'));
assert.equal(kayit.islemSayisi, ISLEM_SAYISI);
assert.equal(kayit.tohum, TOHUM);

const { ozetler, liste } = calistir(TOHUM, ISLEM_SAYISI);
assert.equal(ozetler.length, kayit.ozetler.length);

const ilkFark = ozetler.findIndex((o, i) => o !== kayit.ozetler[i]);
assert.equal(ilkFark, -1, ilkFark >= 0
  ? `ekonomi ${ilkFark}. işlemde altın kayıttan saptı: ${JSON.stringify(liste[ilkFark])}`
  : '');
console.log(`✅ ${ISLEM_SAYISI} ekonomi işlemi altın kayıtla birebir aynı`);
