// Realm of AdAstra — GameStateManager yöntemleri: teçhizat dövme, geliştirme, onarım, kuşandırma ve hurdaya ayırma
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
//
// Kurallar: 1 ATK = EQUIPMENT_CRAFT_MINUTES.PER_ATK dakikalık taban üretim (odun + demir; kömür ve taş üçte biri kadar dakika)
// + pazar değeri kadar ASTRA + 1 parça. Dövme: odun, demir, kömür. Yükseltme: odun, demir, kömür (ocak) ve taş (bileme), hepsi
// x1,18, parça 2 katı (1 → 2 → 4 → 8 → 16). Dayanıklılık 13 (savaşa giren her askerin rastgele bir eşyası her savaşta -1); sıfırlanınca onarım (odun, demir, kömür
// ve PARÇA), eşyaya bugüne kadar harcananın %10'u ve pazar değeri, kısmi hasarda oranlanır (18 Ekim 2026'dan beri parça da: parça havuzu
// küçük, fiyatı kullanımla yükselir, bkz. AMM_SEED_ASTRA). Geri dönüşüm hepsinin %70'ini verir (taş yalnız yükseltmelerde harcanır).
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { ammMarket } from '../ammMarket.js';

const YUVALAR = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
const YUVA_ADLARI = { weapon: 'Silah', helmet: 'Miğfer', armor: 'Gövde Zırhı', legs: 'Pantolon', boots: 'Ayakkabı' };
const YUVA_SIMGELERI = { weapon: '🗡️', helmet: '🪖', armor: '🛡️', legs: '👖', boots: '👢' };
const EKIPMAN_DAYANIKLILIK = 13;   // yeni dövülen ya da yükseltilen eşyanın dayanıklılığı
const YUKSELTME_ARTISI = 1.18;
const ONARIM_ORANI = 0.10;        // onarım = eşyaya bugüne kadar harcanan her kalemin (odun, demir, kömür, parça) %10'u × hasar oranı
const DUSUK_SEVIYE_ESIGI = 1;

const sirasiVar = (v) => v !== null && v !== undefined && v !== '';

// Bir eşyanın hammadde karşılığı dakikası: ATK ve CAN başına dakika (EQUIPMENT_CRAFT_MINUTES)
function esyaDakikasi(atk, hp) {
  const dakika = GAME_CONFIG.EQUIPMENT_CRAFT_MINUTES || { PER_ATK: 2, PER_HP: 0.8 };
  return atk * dakika.PER_ATK + hp * dakika.PER_HP;
}

export const techizatYontemleri = {
  // ── Eşya bulma ──────────────────────────────────────────────────────────
  // itemOrSlot: eşya nesnesi ya da yuva adı; soldierIndex verilirse o askerin üzerindeki, yoksa krallık yuvasındaki eşya
  // Konum kaydı da kabul edilir: { source: 'armory' | 'kingdom' | 'soldier', slotKey, armoryIndex, soldierIndex }
  // (sunucuya eşya nesnesi gönderilemez; çevrimiçi modda eşya her zaman konumuyla seçilir)
  _esyaBul(itemOrSlot, soldierIndex = null) {
    if (itemOrSlot && typeof itemOrSlot === 'object' && ['armory', 'kingdom', 'soldier'].includes(itemOrSlot.source) && typeof itemOrSlot.name !== 'string') {
      const k = itemOrSlot;
      if (k.source === 'armory') return (this.state.armoryInventory || [])[Number.isInteger(k.armoryIndex) ? k.armoryIndex : -1] || null;
      if (!YUVALAR.includes(k.slotKey)) return null;
      if (k.source === 'kingdom') return (this.state.equipment || {})[k.slotKey] || null;
      const asker = (this.state.soldierUnits || [])[Number.isInteger(k.soldierIndex) ? k.soldierIndex : -1];
      return asker && asker.equipment ? asker.equipment[k.slotKey] || null : null;
    }
    if (typeof itemOrSlot === 'object' && itemOrSlot !== null) return itemOrSlot;
    if (sirasiVar(soldierIndex)) {
      const asker = (this.state.soldierUnits || [])[soldierIndex];
      return asker && asker.equipment ? asker.equipment[itemOrSlot] : null;
    }
    return this.state.equipment ? this.state.equipment[itemOrSlot] : null;
  },

  // Krallıktaki (ana yuvalar, cephanelik deposu, askerlerin üstü) bütün teçhizat tek listede
  getAllArmoryEquipmentList() {
    const liste = [];
    YUVALAR.forEach(yuva => {
      const esya = this.state.equipment ? this.state.equipment[yuva] : null;
      if (esya && esya.level > 0) {
        liste.push({ source: 'kingdom', slotKey: yuva, slotName: YUVA_ADLARI[yuva] || yuva, soldierIndex: null, soldierName: null, locationLabel: 'Krallık Ana Yuvası', item: esya });
      }
    });
    (this.state.armoryInventory || []).forEach((esya, sira) => {
      if (esya && esya.level > 0) {
        liste.push({ source: 'armory', armoryIndex: sira, slotKey: esya.slot, slotName: YUVA_ADLARI[esya.slot] || esya.slot, soldierIndex: null, soldierName: null, locationLabel: 'Cephanelik Deposu (Boşta)', item: esya });
      }
    });
    (this.state.soldierUnits || []).forEach((asker, i) => {
      YUVALAR.forEach(yuva => {
        const esya = asker.equipment ? asker.equipment[yuva] : null;
        if (esya && esya.level > 0) {
          liste.push({ source: 'soldier', slotKey: yuva, slotName: YUVA_ADLARI[yuva] || yuva, soldierIndex: i, soldierName: asker.name, locationLabel: `${asker.name} Üzerinde`, item: esya });
        }
      });
    });
    return liste;
  },

  // ── Dövme ───────────────────────────────────────────────────────────────
  // Eşyanın bugüne kadar harcanan kümülatif hammaddesi (onarım bedeli bundan oranlanır)
  // gercek: true → yükseltmeler GERÇEKTEN harcanan (yeni, x5 kararı) büyümeyle hesaplanır (geri dönüşüm iadesi); varsayılan eski 1,18 ölçeği (onarım)
  getCumulativeEquipmentResourceCost(item, { gercek = false } = {}) {
    const artis = gercek ? (GAME_CONFIG.EQUIPMENT_UPGRADE_GROWTH ?? YUKSELTME_ARTISI) : YUKSELTME_ARTISI;
    const seviye = Math.max(1, item?.level || 1);
    const atk = item?.baseAtk || (item?.slot === 'weapon' ? 25 : 0);
    const hp = item?.baseHp || (item?.slot !== 'weapon' ? 50 : 0);
    const dakika = esyaDakikasi(atk, hp);
    const uretim = GAME_CONFIG.BASE_PRODUCTION;
    const taban = {
      wood: Math.max(15, Math.round(dakika * (uretim?.wood ?? 18))),
      iron: Math.max(20, Math.round(dakika * (uretim?.iron ?? 12))),
      coal: uretim?.coal > 0 ? Math.max(10, Math.round(dakika * uretim.coal / 3)) : 0,
      stone: uretim?.stone > 0 ? Math.max(10, Math.round(dakika * uretim.stone / 3)) : 0
    };
    let odun = 0;
    let demir = 0;
    let komur = 0;
    let tas = 0;
    for (let l = 1; l <= seviye; l++) {
      const carpan = gercek ? (l <= 1 ? 1 : YUKSELTME_ARTISI * Math.pow(artis, l - 2)) : Math.pow(YUKSELTME_ARTISI, l - 1);   // gercek: upgrade ile aynı basamak çarpanı
      odun += taban.wood * carpan;
      demir += taban.iron * carpan;
      komur += taban.coal * carpan;       // dövme (l = 1) ve her yükseltme kömür ister
      if (l > 1) tas += taban.stone * carpan;   // taş yalnız yükseltmede harcanır
    }
    return {
      baseWood: taban.wood, baseIron: taban.iron, baseCoal: taban.coal, baseStone: taban.stone,
      totalWood: Math.round(odun), totalIron: Math.round(demir), totalCoal: Math.round(komur), totalStone: Math.round(tas),
      totalFragments: Math.pow(2, seviye) - 1   // dövme 1 + yükseltmeler 2, 4, 8, ... (calculateEquipmentUpgradeCost: 2^seviye)
    };
  },

  calculateEquipmentCraftCost(recipeOrSlot) {
    const tarif = typeof recipeOrSlot === 'string' ? (GAME_CONFIG.EQUIPMENT_RECIPES[recipeOrSlot] || {}) : (recipeOrSlot || {});
    const dakika = esyaDakikasi(tarif.baseAtk || 0, tarif.baseHp || 0);
    const uretim = GAME_CONFIG.BASE_PRODUCTION || {};
    const wood = Math.max(15, Math.round(dakika * (uretim.wood ?? 18)));
    const iron = Math.max(20, Math.round(dakika * (uretim.iron ?? 12)));
    const coal = uretim.coal > 0 ? Math.max(10, Math.round(dakika * uretim.coal / 3)) : 0;
    const fragments = 1;   // dövme: yeni oyuncu ilk takımı yapabilsin (yükseltme parçaları GELISIM_PARCA_CARPANI ile büyür)
    const ada = ammMarket.calculateResourcesCostAdAstra(coal > 0 ? { wood, iron, coal } : { wood, iron }).totalAda;
    return { wood, iron, coal, fragments, adAstra: ada, woodCost: wood, ironCost: iron, coalCost: coal, fragCost: fragments, adaCost: ada };
  },

  // Sınırsız dövme: bedel envanterden ve bakiyeden düşer; yuva boşsa eşya doğrudan kuşanılır, doluysa cephaneliğe eklenir
  craftEquipment(slotKey) {
    const tarif = GAME_CONFIG.EQUIPMENT_RECIPES[slotKey];
    if (!tarif) return { success: false, message: 'Geçersiz ekipman parçası!' };

    if (!this.state.equipment) this.state.equipment = Object.fromEntries(YUVALAR.map(y => [y, null]));
    if (!Array.isArray(this.state.armoryInventory)) this.state.armoryInventory = [];

    const bedel = this.calculateEquipmentCraftCost(tarif);
    const envanter = this.state.inventory;
    const komurGerekli = (bedel.coal || 0) > 0;
    if ((envanter.fragments || 0) < bedel.fragments) return { success: false, message: `Yetersiz Teçhizat Parçası! (${bedel.fragments} Teçhizat Parçaları gerekli)` };
    if ((envanter.iron || 0) < bedel.iron) return { success: false, message: `Yetersiz Demir! (${bedel.iron} Demir gerekli)` };
    if ((envanter.wood || 0) < bedel.wood) return { success: false, message: `Yetersiz Odun! (${bedel.wood} Odun gerekli)` };
    if (komurGerekli && (envanter.coal || 0) < bedel.coal) return { success: false, message: `Yetersiz Kömür! (${bedel.coal} Kömür gerekli)` };
    if (this.state.adAstraBalance < bedel.adAstra) return { success: false, message: `Yetersiz ASTRA! (${bedel.adAstra} ASTRA gerekli)` };

    envanter.fragments = (envanter.fragments || 0) - bedel.fragments;
    this.burnItem('fragments', bedel.fragments);
    envanter.iron -= bedel.iron;
    envanter.wood -= bedel.wood;
    if (komurGerekli) envanter.coal = (envanter.coal || 0) - bedel.coal;
    this.burnResources({ wood: bedel.wood, iron: bedel.iron, coal: bedel.coal || 0 });
    this.state.adAstraBalance -= bedel.adAstra;
    this._onAdaSpent(bedel.adAstra);
    this._orduHarcamasiYaz(bedel.adAstra);
    globalPool.recordTokenSpend(bedel.adAstra);

    const esya = {
      id: `${tarif.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      slot: tarif.slot,
      name: tarif.name,
      icon: tarif.icon,
      level: 1,
      baseAtk: tarif.baseAtk,
      baseHp: tarif.baseHp,
      atkBonus: tarif.baseAtk,
      hpBonus: tarif.baseHp,
      durability: EKIPMAN_DAYANIKLILIK,
      maxDurability: EKIPMAN_DAYANIKLILIK,
      craftedAt: Date.now()
    };

    let varis;
    if (!this.state.equipment[slotKey]) {
      this.state.equipment[slotKey] = esya;
      varis = 've krallık ana yuvasına kuşandırıldı';
    } else {
      this.state.armoryInventory.push(esya);
      varis = "ve Cephanelik Deposu'na eklendi";
    }
    this.saveState();
    return {
      success: true,
      message: `⚒️ ${tarif.icon} ${tarif.name} başarıyla dövüldü ${varis}! (${EKIPMAN_DAYANIKLILIK}/${EKIPMAN_DAYANIKLILIK} Dayanıklılık)`,
      item: esya
    };
  },

  // ── Yükseltme ───────────────────────────────────────────────────────────
  calculateEquipmentUpgradeCost(itemOrSlot, soldierIndex = null) {
    const esya = this._esyaBul(itemOrSlot, soldierIndex);
    if (!esya) return null;

    const simdiki = esya.level || 1;
    if (simdiki >= (GAME_CONFIG.EQUIPMENT_MAX_LEVEL || 10)) return { isMaxLevel: true, currentLevel: simdiki };

    const sonraki = simdiki + 1;
    const kumulatif = this.getCumulativeEquipmentResourceCost(esya);
    // x5 kararı: ilk yükseltme basamağı eski (1,18; yeni oyuncu ilk silosuna sığar), sonraki her basamak EQUIPMENT_UPGRADE_GROWTH katı (onarım 1,18 ölçeğinde kalır)
    const carpan = YUKSELTME_ARTISI * Math.pow(GAME_CONFIG.EQUIPMENT_UPGRADE_GROWTH ?? YUKSELTME_ARTISI, simdiki - 1);
    const woodCost = Math.max(15, Math.round(kumulatif.baseWood * carpan));
    const ironCost = Math.max(20, Math.round(kumulatif.baseIron * carpan));
    const coalCost = kumulatif.baseCoal > 0 ? Math.max(10, Math.round(kumulatif.baseCoal * carpan)) : 0;     // ocak
    const stoneCost = kumulatif.baseStone > 0 ? Math.max(10, Math.round(kumulatif.baseStone * carpan)) : 0;  // bileme taşı
    const fragmentCost = Math.round(Math.pow(2, simdiki) * (simdiki >= 4 ? (GAME_CONFIG.GELISIM_PARCA_CARPANI ?? 1) : 1));   // ilk 3 yükseltme eskisi gibi (yeni oyuncu); 4+ parça bedeli x2
    const adAstraCost = ammMarket.calculateResourcesCostAdAstra({ wood: woodCost, iron: ironCost, coal: coalCost, stone: stoneCost }).totalAda;
    return {
      isMaxLevel: false,
      currentLevel: simdiki,
      nextLevel: sonraki,
      ironCost,
      woodCost,
      coalCost,
      stoneCost,
      fragmentCost,
      adAstraCost,
      fragCost: fragmentCost,    // cephanelik kartı bu adları okur
      adaCost: adAstraCost,
      nextAtk: Math.round(esya.baseAtk * (1 + (sonraki - 1) * 0.35)),
      nextHp: Math.round(esya.baseHp * (1 + (sonraki - 1) * 0.35)),
      item: esya
    };
  },

  upgradeEquipment(itemOrSlot, soldierIndex = null) {
    const bedel = this.calculateEquipmentUpgradeCost(itemOrSlot, soldierIndex);
    if (!bedel) return { success: false, message: 'Ekipman bulunamadı!' };
    if (bedel.isMaxLevel) return { success: false, message: 'Bu ekipman zaten maksimum seviyede (Lv.10 Master)!' };

    const envanter = this.state.inventory;
    if ((envanter.fragments || 0) < bedel.fragmentCost) return { success: false, message: `Yetersiz Teçhizat Parçası! (${bedel.fragmentCost} Teçhizat Parçaları gerekli)` };
    if ((envanter.iron || 0) < bedel.ironCost) return { success: false, message: `Yetersiz Demir! (${bedel.ironCost} Demir gerekli)` };
    if ((envanter.wood || 0) < bedel.woodCost) return { success: false, message: `Yetersiz Odun! (${bedel.woodCost} Odun gerekli)` };
    if ((envanter.coal || 0) < bedel.coalCost) return { success: false, message: `Yetersiz Kömür! (${bedel.coalCost} Kömür gerekli)` };
    if ((envanter.stone || 0) < bedel.stoneCost) return { success: false, message: `Yetersiz Taş! (${bedel.stoneCost} Taş gerekli)` };
    if (this.state.adAstraBalance < bedel.adAstraCost) return { success: false, message: `Yetersiz ASTRA! (${bedel.adAstraCost} ASTRA gerekli)` };

    envanter.fragments = (envanter.fragments || 0) - bedel.fragmentCost;
    this.burnItem('fragments', bedel.fragmentCost);
    envanter.iron -= bedel.ironCost;
    envanter.wood -= bedel.woodCost;
    envanter.coal = (envanter.coal || 0) - bedel.coalCost;
    envanter.stone = (envanter.stone || 0) - bedel.stoneCost;
    this.burnResources({ wood: bedel.woodCost, iron: bedel.ironCost, coal: bedel.coalCost, stone: bedel.stoneCost });
    this.state.adAstraBalance -= bedel.adAstraCost;
    this._onAdaSpent(bedel.adAstraCost);
    this._orduHarcamasiYaz(bedel.adAstraCost);
    globalPool.recordTokenSpend(bedel.adAstraCost);

    const esya = bedel.item;
    esya.level = bedel.nextLevel;
    esya.atkBonus = bedel.nextAtk;
    esya.hpBonus = bedel.nextHp;
    esya.durability = EKIPMAN_DAYANIKLILIK;   // yükseltme dayanıklılığı da tamamlar
    this.saveState();
    return {
      success: true,
      message: `✨ ${esya.icon} ${esya.name} Seviye ${esya.level}'e yükseltildi! (+${esya.atkBonus} Saldırı, +${esya.hpBonus} Can, ${EKIPMAN_DAYANIKLILIK}/${EKIPMAN_DAYANIKLILIK} Dayanıklılık)`
    };
  },

  // Herhangi bir yerdeki eşyayı (krallık, cephanelik, asker) tek tıkla yükseltir; yoksa kimlikle arar
  upgradeAnyEquipment({ source, slotKey, armoryIndex = null, soldierIndex = null, itemId = null }) {
    let esya = null;
    if (source === 'kingdom') {
      esya = this.state.equipment ? this.state.equipment[slotKey] : null;
    } else if (source === 'armory') {
      if (armoryIndex !== null && armoryIndex !== undefined && this.state.armoryInventory) esya = this.state.armoryInventory[armoryIndex];
    } else if (source === 'soldier') {
      const asker = (this.state.soldierUnits || [])[soldierIndex];
      esya = asker?.equipment ? asker.equipment[slotKey] : null;
    }
    if (!esya && itemId) {
      const eslesen = this.getAllArmoryEquipmentList().find(e => e.item && e.item.id === itemId);
      if (eslesen) esya = eslesen.item;
    }
    if (!esya) return { success: false, message: 'Yükseltilecek ekipman bulunamadı!' };
    return this.upgradeEquipment(esya);
  },

  // Belirli yuvadaki ve/veya belirli seviyedeki eşyaları sırayla yükseltir; kaynak yetmeyince durur
  upgradeEquipmentByTypeAndLevel(targetSlot = null, targetLevel = null) {
    let yukseltilen = 0;
    const mesajlar = [];
    const enUst = GAME_CONFIG.EQUIPMENT_MAX_LEVEL || 10;
    for (const kayit of this.getAllArmoryEquipmentList()) {
      const esya = kayit.item;
      if (!esya) continue;
      const yuvaUyar = !targetSlot || targetSlot === 'all' || esya.slot === targetSlot;
      const seviyeUyar = targetLevel == null || esya.level === targetLevel;
      if (!(yuvaUyar && seviyeUyar && (esya.level || 1) < enUst)) continue;
      const r = this.upgradeEquipment(esya);
      if (!r.success) { mesajlar.push(r.message); break; }
      yukseltilen++;
    }
    if (yukseltilen === 0 && mesajlar.length > 0) return { success: false, message: mesajlar[0] };
    if (yukseltilen === 0) return { success: false, message: 'Geliştirilecek uygun teçhizat bulunamadı!' };
    return { success: true, upgradedCount: yukseltilen, message: `✨ ${yukseltilen} adet teçhizat başarıyla bir sonraki seviyeye yükseltildi!` };
  },

  // upgradeEquipmentByTypeAndLevel ile aynı seçimin (yuva + seviye) tek seferlik toplam yükseltme bedeli; "eksikleri al ve geliştir" planı bunu kullanır
  // Toplu geliştirmeye girecek eşyalar (yuva + seviye süzgeci; en yüksek seviyedekiler girmez)
  getUpgradeSetItems(targetSlot = null, targetLevel = null) {
    const enUst = GAME_CONFIG.EQUIPMENT_MAX_LEVEL || 10;
    return this.getAllArmoryEquipmentList().filter((kayit) => {
      const esya = kayit.item;
      if (!esya) return false;
      const yuvaUyar = !targetSlot || targetSlot === 'all' || esya.slot === targetSlot;
      const seviyeUyar = targetLevel == null || esya.level === targetLevel;
      return yuvaUyar && seviyeUyar && (esya.level || 1) < enUst;
    });
  },

  getUpgradeSetCost(targetSlot = null, targetLevel = null) {
    const toplam = { count: 0, ironCost: 0, woodCost: 0, coalCost: 0, stoneCost: 0, fragCost: 0, adaCost: 0 };
    for (const kayit of this.getUpgradeSetItems(targetSlot, targetLevel)) {
      const esya = kayit.item;
      const bedel = this.calculateEquipmentUpgradeCost(esya);
      if (!bedel || bedel.isMaxLevel) continue;
      toplam.count++;
      for (const k of ['ironCost', 'woodCost', 'coalCost', 'stoneCost', 'fragCost', 'adaCost']) toplam[k] += Number(bedel[k]) || 0;
    }
    return toplam;
  },

  upgradeAllEquipmentInKingdom() {
    return this.upgradeEquipmentByTypeAndLevel('all', null);
  },

  // ── Onarım ──────────────────────────────────────────────────────────────
  calculateEquipmentRepairCost(itemOrSlot, soldierIndex = null) {
    const esya = this._esyaBul(itemOrSlot, soldierIndex);
    if (!esya) return { missingDurability: 0, ironCost: 0, woodCost: 0, coalCost: 0, fragCost: 0, adaCost: 0, isRepaired: true };

    const enFazla = esya.maxDurability || EKIPMAN_DAYANIKLILIK;
    const simdiki = esya.durability != null ? esya.durability : enFazla;
    const eksik = Math.max(0, enFazla - simdiki);
    if (eksik <= 0) return { missingDurability: 0, ironCost: 0, woodCost: 0, coalCost: 0, fragCost: 0, adaCost: 0, isRepaired: true, item: esya };

    const kumulatif = this.getCumulativeEquipmentResourceCost(esya);
    const hasarOrani = eksik / enFazla;
    const woodCost = Math.max(1, Math.round(kumulatif.totalWood * ONARIM_ORANI * hasarOrani));
    const ironCost = Math.max(1, Math.round(kumulatif.totalIron * ONARIM_ORANI * hasarOrani));
    const coalCost = kumulatif.totalCoal > 0 ? Math.max(1, Math.round(kumulatif.totalCoal * ONARIM_ORANI * hasarOrani)) : 0;   // ocakta tavlama
    const fragCost = Math.max(1, Math.round(kumulatif.totalFragments * ONARIM_ORANI * hasarOrani));                              // teçhizat parçası
    const adaCost = ammMarket.calculateResourcesCostAdAstra({ wood: woodCost, iron: ironCost, coal: coalCost }).totalAda;
    return { missingDurability: eksik, ironCost, woodCost, coalCost, fragCost, adaCost, isRepaired: false, itemName: esya.name, level: esya.level || 1, item: esya };
  },

  repairEquipment(itemOrSlot, soldierIndex = null) {
    const bedel = this.calculateEquipmentRepairCost(itemOrSlot, soldierIndex);
    if (!bedel || !bedel.item) return { success: false, message: 'Onarılacak ekipman bulunamadı!' };
    const esya = bedel.item;
    const asker = sirasiVar(soldierIndex) ? (this.state.soldierUnits || [])[soldierIndex] : null;
    if (bedel.missingDurability <= 0) {
      return { success: false, message: `${esya.name} zaten tamamen sağlam (${EKIPMAN_DAYANIKLILIK}/${EKIPMAN_DAYANIKLILIK})!` };
    }

    const envanter = this.state.inventory;
    if ((envanter.iron || 0) < bedel.ironCost) return { success: false, message: `Yetersiz Demir! (${bedel.ironCost} Demir gerekli)` };
    if ((envanter.wood || 0) < bedel.woodCost) return { success: false, message: `Yetersiz Odun! (${bedel.woodCost} Odun gerekli)` };
    if ((envanter.coal || 0) < (bedel.coalCost || 0)) return { success: false, message: `Yetersiz Kömür! (${bedel.coalCost} Kömür gerekli)` };
    if ((envanter.fragments || 0) < bedel.fragCost) return { success: false, message: `Yetersiz Teçhizat Parçası! (${bedel.fragCost} Teçhizat Parçaları gerekli)` };
    if ((this.state.adAstraBalance || 0) < bedel.adaCost) return { success: false, message: `Yetersiz ASTRA! (${bedel.adaCost} ASTRA gerekli)` };

    envanter.iron -= bedel.ironCost;
    envanter.wood -= bedel.woodCost;
    envanter.coal = (envanter.coal || 0) - (bedel.coalCost || 0);
    this.burnResources({ wood: bedel.woodCost, iron: bedel.ironCost, coal: bedel.coalCost || 0 });
    if (bedel.fragCost > 0) {
      envanter.fragments = (envanter.fragments || 0) - bedel.fragCost;
      this.burnItem('fragments', bedel.fragCost);
    }
    this.state.adAstraBalance -= bedel.adaCost;
    this._onAdaSpent(bedel.adaCost);
    this._orduHarcamasiYaz(bedel.adaCost);
    globalPool.recordTokenSpend(bedel.adaCost);

    const enFazla = esya.maxDurability || EKIPMAN_DAYANIKLILIK;
    esya.durability = enFazla;
    this.saveState();
    return {
      success: true,
      message: `🔨 ${asker ? `${asker.name} üzerindeki ` : ''}${esya.name} başarıyla tamir edildi! (${enFazla}/${enFazla} Dayanıklılık)`
    };
  },

  // Krallıktaki, cephanelikteki ve askerlerdeki bütün hasarlı eşyaların toplam onarım bedeli (repairAllEquipmentInKingdom ile aynı hesap)
  getRepairAllCost() {
    const toplam = { demir: 0, odun: 0, komur: 0, parca: 0, ada: 0, onarilacak: [] };
    for (const kayit of this.getAllArmoryEquipmentList()) {
      const bedel = this.calculateEquipmentRepairCost(kayit.item);
      if (!(bedel && bedel.missingDurability > 0)) continue;
      toplam.demir += bedel.ironCost;
      toplam.odun += bedel.woodCost;
      toplam.komur += bedel.coalCost || 0;
      toplam.parca += bedel.fragCost || 0;
      toplam.ada += bedel.adaCost;
      toplam.onarilacak.push(kayit.item);
    }
    toplam.ada = Math.round(toplam.ada * 1000) / 1000;
    return toplam;
  },

  // Krallıktaki, cephanelikteki ve askerlerdeki bütün hasarlı eşyaları tek seferde onarır
  repairAllEquipmentInKingdom() {
    const { demir, odun, komur, parca, ada, onarilacak } = this.getRepairAllCost();
    if (onarilacak.length === 0) {
      return { success: false, message: `Tüm silah ve zırhlar zaten ${EKIPMAN_DAYANIKLILIK}/${EKIPMAN_DAYANIKLILIK} maksimum dayanıklılıkta!` };
    }

    const envanter = this.state.inventory;
    if ((envanter.iron || 0) < demir) return { success: false, message: `Yetersiz Demir! (${demir} Demir gerekli)` };
    if ((envanter.wood || 0) < odun) return { success: false, message: `Yetersiz Odun! (${odun} Odun gerekli)` };
    if ((envanter.coal || 0) < komur) return { success: false, message: `Yetersiz Kömür! (${komur} Kömür gerekli)` };
    if ((envanter.fragments || 0) < parca) return { success: false, message: `Yetersiz Teçhizat Parçası! (${parca} Teçhizat Parçası gerekli)` };
    if ((this.state.adAstraBalance || 0) < ada) return { success: false, message: `Yetersiz ASTRA! (${ada} ASTRA gerekli)` };

    envanter.iron -= demir;
    envanter.wood -= odun;
    envanter.coal = (envanter.coal || 0) - komur;
    this.burnResources({ wood: odun, iron: demir, coal: komur });
    if (parca > 0) {
      envanter.fragments = (envanter.fragments || 0) - parca;
      this.burnItem('fragments', parca);
    }
    this.state.adAstraBalance -= ada;
    this._onAdaSpent(ada);
    this._orduHarcamasiYaz(ada);
    globalPool.recordTokenSpend(ada);
    for (const esya of onarilacak) esya.durability = esya.maxDurability || EKIPMAN_DAYANIKLILIK;
    this.saveState();
    return {
      success: true,
      repairedCount: onarilacak.length,
      message: `🔨 Krallıktaki ${onarilacak.length} parça teçhizat tek seferde onarıldı! (-${odun} Odun, -${demir} Demir${komur > 0 ? `, -${komur} Kömür` : ''}${parca > 0 ? `, -${parca} Parça` : ''}, -${ada} ASTRA)`
    };
  },

  // ── Kuşandırma ──────────────────────────────────────────────────────────
  // Cephanelikteki ya da krallık yuvasındaki eşyayı seçilen askere takar; eski eşya cephaneliğe gider
  equipSoldierFromDepot(soldierIndex, { source, slotKey, armoryIndex }) {
    const asker = (this.state.soldierUnits || [])[soldierIndex];
    if (!asker) return { success: false, message: 'Asker bulunamadı.' };
    if (!asker.equipment) asker.equipment = {};

    let takilacak = null;
    if (source === 'armory' && this.state.armoryInventory) {
      if (armoryIndex >= 0 && armoryIndex < this.state.armoryInventory.length) takilacak = this.state.armoryInventory.splice(armoryIndex, 1)[0];
    } else if (source === 'kingdom' && this.state.equipment) {
      takilacak = this.state.equipment[slotKey];
      delete this.state.equipment[slotKey];
    }
    if (!takilacak) return { success: false, message: 'Kuşanılacak eşya bulunamadı!' };

    const yuva = takilacak.slot || slotKey;
    const eski = asker.equipment[yuva];
    asker.equipment[yuva] = takilacak;
    if (eski) {
      if (!Array.isArray(this.state.armoryInventory)) this.state.armoryInventory = [];
      this.state.armoryInventory.push(eski);
    }
    this.saveState();
    return {
      success: true,
      message: `🛡️ ${asker.name} üzerine ${takilacak.name} kuşandırıldı!${eski ? ` (Eski ${eski.name} Cephaneliğe aktarıldı)` : ''}`
    };
  },

  unequipSoldierToArmory(soldierIndex, slotKey) {
    const asker = (this.state.soldierUnits || [])[soldierIndex];
    if (!asker || !asker.equipment || !asker.equipment[slotKey]) return { success: false, message: 'Çıkarılacak ekipman yok.' };

    const esya = asker.equipment[slotKey];
    asker.equipment[slotKey] = null;
    if (!Array.isArray(this.state.armoryInventory)) this.state.armoryInventory = [];
    this.state.armoryInventory.push(esya);
    this.saveState();
    return { success: true, message: `🔄 ${esya.name} kuşanmadan çıkarıldı ve Cephanelik Deposu'na eklendi!` };
  },

  // ── Hurda ───────────────────────────────────────────────────────────────
  // Boştaki düşük seviyeli (varsayılan Lv.1) eşyaları parçaya ve demire çevirir
  scrapAllLowTierEquipment(maxLevel = DUSUK_SEVIYE_ESIGI) {
    if (!Array.isArray(this.state.armoryInventory)) this.state.armoryInventory = [];
    let adet = 0;
    let parca = 0;
    let demir = 0;
    const liste = [];

    const hurdala = (esya, varsayilanAd, yuva) => {
      const seviye = esya.level || 1;
      const p = Math.max(1, Math.floor(seviye * 2));
      const d = Math.max(5, Math.floor(seviye * 10));
      adet++;
      parca += p;
      demir += d;
      liste.push({ name: esya.name || varsayilanAd, icon: esya.icon || YUVA_SIMGELERI[yuva] || '⚔️', slot: esya.slot || yuva, level: seviye, fragGained: p, ironGained: d });
    };

    const kalan = [];
    for (const esya of this.state.armoryInventory) {
      if (esya && (esya.level || 1) <= maxLevel) hurdala(esya, `${esya.slot || 'Eşya'}`, esya.slot || 'weapon');
      else if (esya) kalan.push(esya);
    }
    this.state.armoryInventory = kalan;

    // Krallık ana yuvasında boşta duran düşük seviyeli eşyalar da değerlendirilir
    YUVALAR.forEach(yuva => {
      const esya = this.state.equipment ? this.state.equipment[yuva] : null;
      if (esya && (esya.level || 1) <= maxLevel) {
        hurdala({ ...esya, slot: yuva }, `${yuva} Yuvası`, yuva);
        delete this.state.equipment[yuva];
      }
    });

    if (adet === 0) {
      return { success: false, scrappedCount: 0, gainedFragments: 0, gainedIron: 0, scrappedItems: [], message: 'Hurdaya çevrilecek boşta Lv.1 veya düşük seviye eşya bulunamadı.' };
    }

    this.state.inventory.fragments = (this.state.inventory.fragments || 0) + parca;
    this.state.inventory.iron = (this.state.inventory.iron || 0) + demir;
    this.saveState();
    return {
      success: true,
      scrappedCount: adet,
      gainedFragments: parca,
      gainedIron: demir,
      scrappedItems: liste,
      message: `♻️ ${adet} adet düşük seviye boşta eşya hurdaya ayrıldı! (+${parca} 💎 Teçhizat Parçaları, +${demir} ⛏️ Demir)`
    };
  }
};
