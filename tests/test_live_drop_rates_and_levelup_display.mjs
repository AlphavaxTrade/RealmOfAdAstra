import { GameStateManager } from '../js/gameState.js';
import '../js/config.js';

console.log('--- 🧪 ZİNDAN & KARAKTER GELİŞİMİ CANLI GANİMET VE SEVİYE ARTIŞI TESTİ ---');

const gm = new GameStateManager();

// 1. Seviye 1 Oranları
const f1 = gm.getFragmentDropRate(1);
const b1 = gm.getBoxDropRate(1);

console.log(`Lv.1 Teçhizat Parçası Oranı: ${(f1 * 100).toFixed(4)}% -> Format: ${gm.formatDropChance(f1)}`);
console.log(`Lv.1 Pandora Kutusu Oranı: ${(b1 * 100).toFixed(5)}% -> Format: ${gm.formatDropChance(b1)}`);

if (gm.formatDropChance(f1) !== '%0.18') {
  throw new Error(`Beklenen Lv.1 parça oranı %0.18 fakat ${gm.formatDropChance(f1)} bulundu!`);
}
if (gm.formatDropChance(b1) !== '%0.0018') {
  throw new Error(`Beklenen Lv.1 kutu oranı %0.0018 fakat ${gm.formatDropChance(b1)} bulundu!`);
}

// 2. Seviye 81 Oranları (Tam 100 Kat)
const f81 = gm.getFragmentDropRate(81);
const b81 = gm.getBoxDropRate(81);

console.log(`Lv.81 Teçhizat Parçası Oranı: ${(f81 * 100).toFixed(2)}% -> Format: ${gm.formatDropChance(f81)}`);
console.log(`Lv.81 Pandora Kutusu Oranı: ${(b81 * 100).toFixed(2)}% -> Format: ${gm.formatDropChance(b81)}`);

if (gm.formatDropChance(f81) !== '%18.00') {
  throw new Error(`Beklenen Lv.81 parça oranı %18.00 fakat ${gm.formatDropChance(f81)} bulundu!`);
}
if (gm.formatDropChance(b81) !== '%0.18') {
  throw new Error(`Beklenen Lv.81 kutu oranı %0.18 fakat ${gm.formatDropChance(b81)} bulundu!`);
}

const fragRatio = f81 / f1;
const boxRatio = b81 / b1;
console.log(`Parça Artış Katsayısı (Lv.81 / Lv.1): ${fragRatio.toFixed(2)}x`);
console.log(`Kutu Artış Katsayısı (Lv.81 / Lv.1): ${boxRatio.toFixed(2)}x`);

if (Math.abs(fragRatio - 100) > 0.001 || Math.abs(boxRatio - 100) > 0.001) {
  throw new Error(`Artış katsayısı tam 100x olmalıdır!`);
}

// 3. Kat 3 ve Kat 6 Boss Katları +%100 (2x) Çarpan Etkisi
const f1Boss = f1 * 2.0;
const b1Boss = b1 * 2.0;
console.log(`Kat 3 / Kat 6 Boss Katında Parça Oranı: ${gm.formatDropChance(f1Boss)}`);
console.log(`Kat 3 / Kat 6 Boss Katında Kutu Oranı: ${gm.formatDropChance(b1Boss)}`);

if (gm.formatDropChance(f1Boss) !== '%0.36' || gm.formatDropChance(b1Boss) !== '%0.0036') {
  throw new Error(`Boss katı 2x çarpanı yanlış formatlandı!`);
}

// 4. getNextLevelRequirement Ganimet Artış Bilgileri
const req = gm.getNextLevelRequirement();
console.log('Seviye Atlama Gereksinim Bilgileri:');
console.log(`- Mevcut Parça Oranı: ${req.curFragRateFormatted}`);
console.log(`- Sonraki Seviye Parça Oranı: ${req.nextFragRateFormatted}`);
console.log(`- Mevcut Kutu Oranı: ${req.curBoxRateFormatted}`);
console.log(`- Sonraki Seviye Kutu Oranı: ${req.nextBoxRateFormatted}`);

if (!req.curFragRateFormatted || !req.nextFragRateFormatted || !req.curBoxRateFormatted || !req.nextBoxRateFormatted) {
  throw new Error(`getNextLevelRequirement ganimet format alanları eksik!`);
}

console.log('🎉 CANLI GANİMET VE SEVİYE YÜKSELTME METRİKLERİ TESTİ %100 BAŞARILI!');
