// Seviye ilerleme ve denge tablolarını OYUN MOTORUNDAN üretir: docs/v2/SEVIYE_TABLOLARI.md
// Kullanım: node scripts/seviye-tablolari-uret.mjs   (dosyayı yazar)  ·  --konsol  (yalnız ekrana yazar)
// 11 Ekim 2026'da scripts/generate_doc_tables.mjs'in yerine yazıldı: eski betik v1 formüllerini elle yazıyordu
// ("ADA", yalnız 3 hammadde); bu betik her değeri motordan okur, bu yüzden kural değişince belge kendiliğinden güncellenir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { DUNGEON_LEVELS } = await import('../js/bestiary.js');

const gs = new GameStateManager();
const anahtarlar = GAME_CONFIG.RESOURCE_KEYS;
const meta = GAME_CONFIG.RESOURCE_META || {};
const ad = (k) => `${(meta[k] || {}).icon || ''} ${(meta[k] || {}).name || k}`.trim();
const sayi = (v, o = 0) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: o, minimumFractionDigits: 0 });
const yuzde = (oran, o = 3) => `%${sayi(oran * 100, o)}`;
const tablo = (baslik, satirlar) => [
  `| ${baslik.join(' | ')} |`,
  `| ${baslik.map(() => ':---:').join(' | ')} |`,
  ...satirlar.map((s) => `| ${s.join(' | ')} |`)
].join('\n');

const ENCOK_SEVIYE = 81;

// 1) Hesap seviyesi
const seviyeSatirlari = [];
for (let l = 1; l <= ENCOK_SEVIYE; l++) {
  const f = gs.getLevelBenefits(l);
  seviyeSatirlari.push([`**Lv.${l}**`, `${sayi(f.expeditionHours, 2)} sa`, `${sayi(gs.getExpeditionStaminaCost(l))} ⚡`, `${sayi(f.maxStamina)} ⚡`,
    `%${sayi(f.productionBonusPct, 1)}`, yuzde(f.fragmentRate), yuzde(f.boxRate, 4), sayi(f.ubiWeight, 2)]);
}

// 2) Seviye atlama bedeli
const atlamaSatirlari = [];
for (let l = 1; l < 30; l++) {
  const kayit = gs.state.level;
  gs.state.level = l;
  const g = gs.getNextLevelRequirement();
  gs.state.level = kayit;
  if (!g || g.isMaxLevel) break;
  atlamaSatirlari.push([`**Lv.${l} → ${l + 1}**`, sayi(g.xp), sayi(g.wood), sayi(g.iron), sayi(g.wheat), sayi(g.adAstra, 2)]);
}

// 3) Silo
const siloSatirlari = [];
for (let l = 1; l <= 18; l++) {
  const kap = gs.getWarehouseCapacity(l);
  const bedel = gs.getWarehouseUpgradeCost(l);
  const bedelMetni = bedel
    ? bedel.keys.map((k) => `${(meta[k] || {}).icon || k} ${sayi(bedel.costs[k])}`).join(' · ') + ` · 🟣 ${sayi(bedel.adAstra, 2)}`
    : '*en üst seviye*';
  siloSatirlari.push([`**${l}**`, ...anahtarlar.map((k) => sayi(kap[k])), sayi(kap.fragments), bedelMetni]);
}

// 4) Asker alım bedeli
const askerSatirlari = [];
for (let i = 1; i <= 18; i++) askerSatirlari.push([`**${i}. asker**`, `${sayi(gs.getSoldierCost(i), 2)} ASTRA`]);

// 5) Teçhizat dövme
const yuvaAdi = { weapon: '🗡️ Silah', helmet: '🪖 Miğfer', armor: '🛡️ Zırh', legs: '👖 Dizlik', boots: '👢 Çizme' };
const dovmeSatirlari = Object.keys(GAME_CONFIG.EQUIPMENT_RECIPES).map((yuva) => {
  const c = gs.calculateEquipmentCraftCost(yuva);
  return [`**${yuvaAdi[yuva] || yuva}**`, sayi(c.woodCost), sayi(c.ironCost), sayi(c.coalCost || 0), sayi(c.fragCost), `${sayi(c.adaCost, 2)} ASTRA`];
});

// 6) Zindan
const zindanSatirlari = DUNGEON_LEVELS.map((d) => [
  `Kat ${d.floor}`, `**Sv.${d.level}**`, `${d.icon || ''} ${d.name}`, sayi(d.hp), sayi(d.atk), sayi(d.rewardXp),
  d.isBoss ? `🔥 ${d.bossLabel || 'Boss'}` : (d.isFloorGuard ? '🛡️ Kat muhafızı' : '⚔️ Normal')
]);

const belge = `# Seviye ilerleme ve denge tabloları

> Bu belge \`node scripts/seviye-tablolari-uret.mjs\` ile **oyun motorundan** üretilir; elle düzenlenmez.
> Üretim: ${new Date().toISOString().slice(0, 10)} · oyun sürümü ${GAME_CONFIG.GAME_VERSION}. Sayılar o günkü yapılandırmadandır.

## 1. Hesap seviyesi (1 – ${ENCOK_SEVIYE})

${tablo(['Seviye', 'Sefer süresi', 'Sefer stamina bedeli', 'En çok stamina', 'Üretim bonusu', 'Parça şansı', 'Pandora kutusu şansı', 'Temel gelir ağırlığı'], seviyeSatirlari)}

## 2. Seviye atlama bedeli (ilk seviyeler)

${tablo(['Geçiş', 'Deneyim', 'Odun', 'Demir', 'Buğday', 'ASTRA'], atlamaSatirlari)}

## 3. Silo kapasitesi ve yükseltme bedeli (1 – 18)

${tablo(['Seviye', ...anahtarlar.map(ad), '🧩 Parça', 'Yükseltme bedeli'], siloSatirlari)}

## 4. Asker alım bedeli

${tablo(['Sıra', 'Bedel'], askerSatirlari)}

## 5. Teçhizat dövme (seviye 1)

${tablo(['Yuva', 'Odun', 'Demir', 'Kömür', 'Parça', 'ASTRA (pazar değeri)'], dovmeSatirlari)}

## 6. Zindan katları

${tablo(['Kat', 'Seviye', 'Canavar', 'Can', 'Saldırı', 'Asker deneyimi', 'Tür'], zindanSatirlari)}
`;

if (process.argv.includes('--konsol')) {
  console.log(belge);
} else {
  const hedef = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'v2', 'SEVIYE_TABLOLARI.md');
  fs.writeFileSync(hedef, belge);
  console.log(`✅ ${path.relative(process.cwd(), hedef)} yazıldı (${belge.split('\n').length} satır)`);
}
