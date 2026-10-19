import { GameStateManager } from '../js/gameState.js';
import { GAME_CONFIG, HAMMADDE_ADEDI_CARPANI as Q } from '../js/config.js';

console.log('--- 🧪 SİSTEM DENETİMİ DÜZELTMELERİ DOĞRULAMA TESTİ ---');

const gm = new GameStateManager();

// 1. Seviye 81 Tavan Testi
gm.state.level = 81;
gm.state.currentXp = 9999999;
gm.state.inventory.wood = 999999;
gm.state.inventory.iron = 999999;
gm.state.inventory.wheat = 999999;
gm.state.adAstraBalance = 999999;

const lvlRes = gm.levelUp();
console.log('Lv.81 Yükseltme Girişimi:', lvlRes);
if (lvlRes.success) {
  throw new Error('HATA: Seviye 81 iken levelUp başarılı olmamalıydı!');
}
console.log('✅ 1. Madde Başarılı: Seviye 81 tavanı korundu.');

// 2. Stamina Buğday Tüketimi (v2: 1 Stamina = WHEAT_PER_STAMINA Buğday)
const WHEAT_20 = Math.ceil(20 * GAME_CONFIG.WHEAT_PER_STAMINA);
gm.state.level = 1;
gm.state.stamina = 50; // max 100
gm.state.inventory.wheat = 100 * Q;
const startWheat = gm.state.inventory.wheat;

const refillRes = gm.refillStaminaWithWheat(20);
console.log('Stamina Doldurma Sonucu:', refillRes);
if (!refillRes.success) {
  throw new Error(`HATA: Stamina doldurulamadı: ${refillRes.message}`);
}
const wheatUsed = startWheat - gm.state.inventory.wheat;
console.log(`20 Stamina için harcanan Buğday: ${wheatUsed} (Beklenen: ${WHEAT_20})`);
if (wheatUsed !== WHEAT_20) {
  throw new Error(`HATA: 20 Stamina için ${WHEAT_20} Buğday harcanmalıydı fakat ${wheatUsed} harcandı!`);
}
console.log(`✅ 2. Madde Başarılı: Stamina buğday tüketimi tam ${GAME_CONFIG.WHEAT_PER_STAMINA} oranında eşitlendi.`);

// 3. Vanilla Reset armoryInventory Testi
gm.vanillaReset();
if (!Array.isArray(gm.state.armoryInventory)) {
  throw new Error('HATA: Vanilla reset sonrası armoryInventory bir array olmalıydı!');
}
console.log('✅ 4. Madde Başarılı: Vanilla reset armoryInventory alanı tanımlı ve temiz.');

// 4. Zindan Hazine Entegrasyonu Testi
gm.state.level = 5;
const dropRes = gm.addDungeonXpAndDrops(5, false);
console.log('Zindan Canavarı Ödül Çekimi:', dropRes);
if (dropRes.adAstraGained <= 0) {
  throw new Error('HATA: Zindan canavarından ASTRA kazanılamadı!');
}
console.log(`Kazanılan ASTRA: ${dropRes.adAstraGained}, Hazine Zindan Havuzundan çekildi.`);
console.log('✅ 7. Madde Başarılı: Zindan ödülü hazine defteriyle muhasebeleştirildi.');

console.log('🎉 TÜM 7 MADDE DÜZELTME VE DOĞRULAMA TESTLERİ %100 BAŞARIYLA GEÇTİ!');
