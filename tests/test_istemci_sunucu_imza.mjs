// İstemci ile sunucu işlem şablonları uyumlu mu? Arayüz kodundaki `gameState.<işlem>(...)` çağrılarının argüman sayısı,
// sunucu beyaz listesindeki (server/actions.js) şablonun uzunluğunu aşmamalı: çevrimiçi modda fazla argümanlar sessizce
// kırpılır ve işlem sunucuda başka anlama gelir ya da reddedilir (örn. buyTavernaAutomationBot(false, saat) kırpılıyordu).
// 11 Ekim 2026 ön yüz taramasında bulunan sorun sınıfı: bu test aynı hatanın yeniden girmesini engeller.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIONS } from '../server/actions.js';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dosyalar = [];
const gez = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) gez(p); else if (p.endsWith('.js')) dosyalar.push(p);
  }
};
gez(path.join(kok, 'js', 'ui'));
dosyalar.push(path.join(kok, 'js', 'app.js'), path.join(kok, 'js', 'net', 'online.js'));

// Çağrının üst düzey argüman sayısı (iç içe parantez, köşeli ve kıvrık ayraçlar ve dizgeler gözetilir)
function argumanSayisi(kaynak, acilis) {
  let derin = 0; let say = 0; let bos = true; let tirnak = null;
  for (let i = acilis; i < kaynak.length; i++) {
    const c = kaynak[i];
    if (tirnak) {
      if (c === '\\') i++;
      else if (c === tirnak) tirnak = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { tirnak = c; bos = false; continue; }
    if ('([{'.includes(c)) { derin++; if (derin > 1) bos = false; continue; }
    if (')]}'.includes(c)) { derin--; if (derin === 0) return bos ? 0 : say + 1; continue; }
    if (c === ',' && derin === 1) { say++; continue; }
    if (!/\s/.test(c)) bos = false;
  }
  return -1;
}

const ihlaller = [];
let kontrol = 0;
for (const dosya of dosyalar) {
  const kaynak = fs.readFileSync(dosya, 'utf8');
  const desen = /\b(?:gameState|gs)\.([A-Za-z0-9_]+)\(/g;
  let m;
  while ((m = desen.exec(kaynak))) {
    const ad = m[1];
    if (!Object.hasOwn(ACTIONS, ad)) continue;
    const sayi = argumanSayisi(kaynak, m.index + m[0].length - 1);
    if (sayi < 0) continue;
    kontrol++;
    const izinli = ACTIONS[ad].types.length;
    if (sayi > izinli) {
      const satir = kaynak.slice(0, m.index).split('\n').length;
      ihlaller.push(`${path.relative(kok, dosya)}:${satir} ${ad}(${sayi} argüman) — sunucu şablonu ${izinli} argüman alıyor`);
    }
  }
}
assert.ok(kontrol > 50, `çağrı taraması çok az çağrı buldu: ${kontrol}`);
assert.deepEqual(ihlaller, [], 'istemci çağrısı sunucu şablonundan fazla argüman veriyor:\n' + ihlaller.join('\n'));
console.log(`✅ ${kontrol} arayüz çağrısının argüman sayısı sunucu şablonlarına uyuyor`);
