// Test paneli olayları yalnızca bir kez bağlanmalı.
// Önceden initDevPanelEvents iki kez çağrılıyordu; her test düğmesi iki kez çalışıyordu
// (+6 saat ileri sarma botun süresinden 12 saat düşüyor, +10.000 ASTRA 20.000 ekliyordu).
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const calls = src.match(/^\s*initDevPanelEvents\(\);/gm) || [];
assert.equal(calls.length, 1, `initDevPanelEvents bir kez çağrılmalı (bulunan: ${calls.length})`);
assert.ok(/if \(devPanelEventsBound\) return;/.test(src), 'initDevPanelEvents tekrar bağlanmaya karşı korunmalı');
console.log('✅ Test paneli olayları tek kez bağlanıyor');
