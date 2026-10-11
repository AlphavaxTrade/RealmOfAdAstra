import { GameStateManager } from '../js/gameState.js';
import { DUNGEON_LEVELS } from '../js/bestiary.js';

const gs = new GameStateManager();

// 1. ACCOUNT LEVELS 1 - 81
let accountLevelsMd = `| Seviye | Sefer Süresi | Sefer Başı Stamina | Max Stamina (⚡) | Zindan Parça Şansı | Pandora Sandığı Şansı | UBI Dağıtım Katsayısı W(L) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
`;
for (let l = 1; l <= 81; l++) {
  const dur = gs.getExpeditionDurationHours(l);
  const stamCost = gs.getExpeditionStaminaCost(l);
  const maxStam = gs.getMaxStamina(l);
  const fragRate = (0.18 + (l - 1) * ((18.00 - 0.18) / 80)).toFixed(3) + '%';
  const boxRate = (0.0018 + (l - 1) * ((0.18 - 0.0018) / 80)).toFixed(4) + '%';
  const ubiWeight = Math.pow(l, 1.85).toFixed(2);
  accountLevelsMd += `| **Lv.${l}** | ${dur} Saat | ${stamCost} ⚡ | ${maxStam} ⚡ | ${fragRate} | ${boxRate} | ${ubiWeight} |\n`;
}

// 2. WAREHOUSE 1 - 18
let warehouseMd = `| Seviye | 🌲 Odun Kapasitesi | ⛏️ Demir Kapasitesi | 🌾 Buğday Kapasitesi | 🧩 Parça Kapasitesi | Gerekli Odun | Gerekli Demir | Gerekli Buğday | Gerekli ADA (AMM Karşılığı) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
`;
for (let l = 1; l <= 18; l++) {
  const cap = gs.getWarehouseCapacity(l);
  const cost = gs.getWarehouseUpgradeCost(l);
  if (cost) {
    warehouseMd += `| **Seviye ${l}** | ${cap.wood.toLocaleString('tr-TR')} | ${cap.iron.toLocaleString('tr-TR')} | ${cap.wheat.toLocaleString('tr-TR')} | ${cap.fragments.toLocaleString('tr-TR')} | ${cost.wood.toLocaleString('tr-TR')} | ${cost.iron.toLocaleString('tr-TR')} | ${cost.wheat.toLocaleString('tr-TR')} | ~${cost.adAstra.toLocaleString('tr-TR')} ADA |\n`;
  } else {
    warehouseMd += `| **Seviye ${l} (MAX)** | ${cap.wood.toLocaleString('tr-TR')} | ${cap.iron.toLocaleString('tr-TR')} | ${cap.wheat.toLocaleString('tr-TR')} | ${cap.fragments.toLocaleString('tr-TR')} | *Maksimum* | *Maksimum* | *Maksimum* | *Maksimum* |\n`;
  }
}

// 3. SOLDIERS RECRUITMENT 1 - 18 & STATS
let soldierRecruitmentMd = `| Asker Sırası | Satın Alma Bedeli ($ADASTRA) | Seviye 1 Taban HP | Seviye 1 Taban ATK | Seviye Başı HP Artışı | Seviye Başı ATK Artışı | Tam İyileşme Süresi |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
`;
for (let i = 1; i <= 18; i++) {
  const cost = gs.getSoldierCost(i);
  soldierRecruitmentMd += `| **${i}. Asker** | **${cost.toLocaleString('tr-TR')} ADA** | 100 HP | 25 ATK | +25 HP / Lv | +6 ATK / Lv | 24 Saat (1440 Dk) |\n`;
}

// 4. SOLDIER LEVEL PROGRESSION 1 - 81 SAMPLE
let soldierLevelsMd = `| Asker Seviyesi | Toplam HP | Toplam ATK | Zırh | Hız | Kritik Şansı | Zırh Delme |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
`;
for (let l = 1; l <= 81; l++) {
  const hp = 100 + (l - 1) * 25;
  const atk = 25 + (l - 1) * 6;
  soldierLevelsMd += `| **Lv.${l}** | ${hp.toLocaleString('tr-TR')} HP | ${atk.toLocaleString('tr-TR')} ATK | 10 Def | 10 Spd | %5.0 | 5 Pen |\n`;
}

// 5. EQUIPMENT 5 SLOTS & 10 LEVELS
const slotNames = {
  weapon: { name: 'Kadim Savaş Silahı', icon: '🗡️', type: 'ATK' },
  helmet: { name: 'Kraliyet Miğferi', icon: '🪖', type: 'HP' },
  armor: { name: 'Titanyum Gövde Zırhı', icon: '🛡️', type: 'HP' },
  legs: { name: 'Muhafız Zırhlı Pantolonu', icon: '👖', type: 'HP' },
  boots: { name: 'Fırtına Süvari Çizmesi', icon: '🥾', type: 'HP' }
};

let equipmentCraftMd = `| Ekipman Yuvası | İkon | Tip | Seviye 1 Taban Stat | Gerekli Odun | Gerekli Demir | Gerekli Parça | Gerekli ADA (AMM Karşılığı) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
`;
for (const [slot, meta] of Object.entries(slotNames)) {
  const craft = gs.calculateEquipmentCraftCost(slot);
  const statText = meta.type === 'ATK' ? '+10 Saldırı' : '+15 Can';
  equipmentCraftMd += `| **${meta.name}** | ${meta.icon} | ${meta.type} | ${statText} | ${craft.woodCost.toLocaleString('tr-TR')} | ${craft.ironCost.toLocaleString('tr-TR')} | ${craft.fragCost} Parça | ~${craft.adaCost.toLocaleString('tr-TR')} ADA |\n`;
}

let equipmentUpgradeMd = `| Ekipman Seviyesi | Silah ATK Bonusu | Zırh/Miğfer/Pantolon/Çizme HP Bonusu | Dayanıklılık | Gerekli Odun | Gerekli Demir | Gerekli Parça | Gerekli ADA (AMM Karşılığı) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
`;
for (let l = 1; l <= 10; l++) {
  if (l === 1) {
    equipmentUpgradeMd += `| **Seviye 1** | +10 ATK | +15 HP | 13/13 | *Craft ile Yapılır* | *Craft ile Yapılır* | *Craft ile Yapılır* | *Craft ile Yapılır* |\n`;
  } else {
    const upWeapon = gs.calculateEquipmentUpgradeCost({ slot: 'weapon', level: l - 1, baseAtk: 10 + (l - 2) * 4, baseHp: 0 });
    const upArmor = gs.calculateEquipmentUpgradeCost({ slot: 'armor', level: l - 1, baseAtk: 0, baseHp: 15 + (l - 2) * 6 });
    if (upWeapon && !upWeapon.isMaxLevel) {
      equipmentUpgradeMd += `| **Seviye ${l}** | +${upWeapon.nextAtk} ATK | +${upArmor.nextHp} HP | 13/13 | ${upWeapon.woodCost.toLocaleString('tr-TR')} | ${upWeapon.ironCost.toLocaleString('tr-TR')} | ${upWeapon.fragmentCost} Parça | ~${upWeapon.adAstraCost.toLocaleString('tr-TR')} ADA |\n`;
    } else {
      const finalAtk = 10 + (l - 1) * 4;
      const finalHp = 15 + (l - 1) * 6;
      equipmentUpgradeMd += `| **Seviye ${l} (MAX)** | +${finalAtk} ATK | +${finalHp} HP | 13/13 | *Maksimum* | *Maksimum* | *Maksimum* | *Maksimum* |\n`;
    }
  }
}

// 6. DUNGEON 18 LEVELS
let dungeonMd = `| Kat | Zindan Seviyesi | Canavar Adı | İkon | Can | Saldırı | Asker XP | Özel Yetenekler | Türü / Unvanı |
| :---: | :---: | :--- | :---: | ---: | ---: | ---: | :--- | :--- |
`;
DUNGEON_LEVELS.forEach(d => {
  const abilities = d.abilities && d.abilities.length > 0 ? d.abilities.join(', ') : 'Temel Vuruş';
  const typeLabel = d.isBoss ? `🔥 **${d.bossLabel || 'BOSS'}** (+%100 Ganimet)` : (d.isFloorGuard ? '🛡️ Kat Muhafızı' : '⚔️ Normal Yaratık');
  dungeonMd += `| Kat ${d.floor} | **Seviye ${d.level}** | ${d.name} | ${d.icon} | ${d.hp.toLocaleString('tr-TR')} | ${d.atk.toLocaleString('tr-TR')} | ${d.rewardXp.toLocaleString('tr-TR')} | ${abilities} | ${typeLabel} |\n`;
});

// Output everything to a generated markdown file
const combined = {
  accountLevelsMd,
  warehouseMd,
  soldierRecruitmentMd,
  soldierLevelsMd,
  equipmentCraftMd,
  equipmentUpgradeMd,
  dungeonMd
};

// Tablolar yalnızca konsola yazılır; kalıcı dosya üretilmez.
console.log(JSON.stringify(combined, null, 2));
console.log('✅ Tüm matematiksel tablolar başarıyla oluşturuldu!');
