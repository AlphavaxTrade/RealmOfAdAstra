// "Hesabı yükseltebilirsin" kontrolü (19 Ekim 2026): XP çubuğu dolunca zafer kartı ve zindan haritası haber verir.
import assert from 'node:assert/strict';
import { seviyeHazir, seviyeHazirYazisi } from '../js/ui/seviye-hazir.js';

const gs = (xp, gereken, extra = {}) => ({ state: { currentXp: xp, level: 7 }, getNextLevelRequirement: () => ({ xp: gereken, ...extra }) });

assert.equal(seviyeHazir(gs(3000, 3750)), null, 'XP yetmiyorsa haber yok');
assert.deepEqual(seviyeHazir(gs(3750, 3750)), { sonraki: 8, xp: 3750, gereken: 3750 }, 'XP tam eşitse haber var');
assert.equal(seviyeHazir(gs(9999, 3750)).sonraki, 8, 'XP fazlaysa da haber var');
assert.equal(seviyeHazir(gs(9999, 3750, { isMaxLevel: true })), null, 'maksimum seviyede haber yok');
assert.equal(seviyeHazir(gs(5, 0)), null, 'gereken XP 0 ise (veri yok) haber yok');
assert.equal(seviyeHazir({ state: {} }), null, 'oyun bu bilgiyi vermiyorsa haber yok (NaN değil)');
assert.equal(seviyeHazir(null), null);
const yazi = seviyeHazirYazisi({ sonraki: 8 });
assert.ok(yazi.includes('Seviye 8') && yazi.includes('askerlerinin'), 'cümle seviyeyi ve askerleri söyler');
console.log('✅ hesap seviye atlayabilir kontrolü');
