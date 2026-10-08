// Realm of AdAstra — GameStateManager yöntemleri: Zindan ganimeti, eserler, Pandora kutusu, Genesis NFT, Arena anahtarı
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { sound } from '../audio.js';
import { treasury } from '../treasury.js';

export const kesifYontemleri = {
  // =========================================================================
  // 6. GAMEFI & RPG EKONOMİSİ (PHASE 1)
  // =========================================================================

  // Zindan Canavarı Yenildiğinde XP, AdAstra ve Şansa Bağlı Ganimet Dağıtır
  addDungeonXpAndDrops(level, isBoss = false, { rewarded = true } = {}) {
    const lvl = Math.max(1, Math.min(18, level));
    // SADECE Kat 3 (Lv.9 Kadim Taş Golyat) ve Kat 6 (Lv.18 Kıyamet Ejderhası IGNIS) Bosslarında %100 çarpan etkisi (+%100 ekstra şans, 2 katı)
    const base = this.getDungeonBaseReward(lvl, isBoss);
    const isMajorBoss = base.isMajorBoss;
    const bossMultiplier = isMajorBoss ? (GAME_CONFIG.BOSS_DROP_MULTIPLIER || 2.0) : 1.0;

    const xpGained = base.xp;
    this.addXp(xpGained);

    // Antrenman girişi (günlük ödüllü haklar bitti, kapı harcı ödenmedi): yalnızca deneyim
    if (!rewarded) {
      this.saveState();
      return { success: true, trainingOnly: true, xpGained, adAstraGained: 0, fragmentsGained: 0, boxGained: 0, artifactDiscovered: null, scrollGained: null };
    }

    // Günlük zindan bütçesi: kasa bir günde en fazla bakiyesinin %1'ini öder
    const day = this.getDungeonDayStatus();
    const targetAdAstra = Math.min(base.ada, day.budgetLeft);
    let adAstraGained = 0;
    if (targetAdAstra > 0) {
      const draw = (typeof treasury !== 'undefined' && treasury && treasury.withdraw)
        ? treasury.withdraw('dungeon', targetAdAstra)   // yuvarlama yok: kasadan çıkan tam miktar oyuncuya gider (1 ASTRA altı ödül sıfıra inmesin, ASTRA yoktan oluşmasın)
        : { granted: targetAdAstra };
      adAstraGained = Math.max(0, draw.granted != null ? draw.granted : targetAdAstra);
      this.state.dailyCounters.dungeonPaid = (this.state.dailyCounters.dungeonPaid || 0) + adAstraGained;
    }
    const budgetCapped = adAstraGained < base.ada;
    this.state.adAstraBalance += adAstraGained;
    this._onAdaEarned(adAstraGained);

    let fragmentsGained = 0;
    const accountLevel = this.state.level || 1;
    const fragmentChance = Math.min(0.95, this.getFragmentDropRate(accountLevel) * bossMultiplier);
    if (Math.random() < fragmentChance) {
      fragmentsGained = isMajorBoss ? (3 + Math.floor(Math.random() * 4)) : (1 + Math.floor(Math.random() * 2));
      this.state.inventory.fragments = (this.state.inventory.fragments || 0) + fragmentsGained;
    }

    let boxGained = 0;
    const boxChance = Math.min(0.5, this.getBoxDropRate(accountLevel) * bossMultiplier);
    if (Math.random() < boxChance) {
      boxGained = 1;
      this.state.lockedBoxes = (this.state.lockedBoxes || 0) + 1;
    }

    let artifactDiscovered = null;
    if (isMajorBoss) {
      const artifactChance = Math.min(1, GAME_CONFIG.ARTIFACT_BASE_RATE * lvl * 6);
      if (Math.random() < artifactChance) {
        artifactDiscovered = this.discoverArtifact(lvl);
      }
    }

    // 📜 Zindan Zafer Ganimeti: Canavarlardan Düşen Parşömenler (Yalnızca Ordu İyileştirme & 100 Stamina)
    let scrollGained = null;
    const scrollChance = isMajorBoss ? 0.40 : 0.07;
    if (Math.random() < scrollChance) {
      const isHeal = Math.random() < 0.60;
      const scrollType = isHeal ? 'scroll_heal' : 'scroll_stamina';
      this.state.inventory[scrollType] = (this.state.inventory[scrollType] || 0) + 1;
      scrollGained = {
        type: scrollType,
        name: isHeal ? 'Ordu İyileştirme Parşömeni (+10 HP)' : '100 Stamina Doldurma Parşömeni',
        icon: isHeal ? '📜' : '⚡',
        image: isHeal ? 'assets/scroll_heal.jpg' : 'assets/scroll_stamina.jpg'
      };
    }

    sound.playLevelUp();
    this.saveState();

    return { xpGained, adAstraGained, fragmentsGained, boxGained, artifactDiscovered, scrollGained, isBoss: isMajorBoss, budgetCapped, baseAda: base.ada };
  },

  // Henüz Keşfedilmemiş Bir Koleksiyon Eserini Açığa Çıkarır (Varsa Zindan Seviyesine Uygun Olanı Önceliklendirir)
  discoverArtifact(preferredLevel = null) {
    const undiscovered = this.state.collectionArtifacts.filter(a => !a.discovered);
    if (undiscovered.length === 0) return null;

    const exactMatch = preferredLevel !== null
      ? undiscovered.find(a => {
        const cfg = GAME_CONFIG.COLLECTION_ARTIFACTS.find(c => c.id === a.id);
        return cfg && cfg.dropLevel === preferredLevel;
      })
      : null;

    const pick = exactMatch || undiscovered[Math.floor(Math.random() * undiscovered.length)];
    pick.discovered = true;
    pick.discoveredAt = Date.now();

    const cfg = GAME_CONFIG.COLLECTION_ARTIFACTS.find(c => c.id === pick.id);
    return { id: pick.id, name: cfg.name, icon: cfg.icon, rarity: cfg.rarity, lore: cfg.lore };
  },

  // Kilitli Sandığı Açar (SADECE 18 Koleksiyon Eserinden Biri Çıkar - Rarity Ağırlıklı)
  unboxMysteryBox() {
    if ((this.state.lockedBoxes || 0) <= 0) {
      return { success: false, message: 'Açılacak Pandora Kutun yok!' };
    }
    if ((this.state.arenaKeys || 0) <= 0) {
      return {
        success: false,
        message: '🔑 Pandora Kutusu açmak için en az 1 Anahtar gerekir! (Anahtarlar yalnızca Kolezyum haftalık derecesinden, Şans Çarkından veya AMM Pazarından temin edilebilir).'
      };
    }

    this.state.lockedBoxes -= 1;
    this.state.arenaKeys -= 1;
    this.burnItem('boxes', 1);
    this.burnItem('keys', 1);

    // Rarity Ağırlıkları: Common (%50), Rare (%30), Epic (%15), Legendary (%5)
    const roll = Math.random();
    let selectedRarity = 'common';
    if (roll < 0.05) {
      selectedRarity = 'legendary'; // %5 Efsanevi
    } else if (roll < 0.20) {
      selectedRarity = 'epic';      // %15 Epik
    } else if (roll < 0.50) {
      selectedRarity = 'rare';      // %30 Nadir
    } else {
      selectedRarity = 'common';    // %50 Yaygın
    }

    // Seçilen rarity'ye ait tüm eserleri bul
    const pool = GAME_CONFIG.COLLECTION_ARTIFACTS.filter(c => c.rarity === selectedRarity);
    const chosenConfig = pool.length > 0
      ? pool[Math.floor(Math.random() * pool.length)]
      : GAME_CONFIG.COLLECTION_ARTIFACTS[Math.floor(Math.random() * GAME_CONFIG.COLLECTION_ARTIFACTS.length)];

    // Kullanıcının koleksiyonundaki eşleşen eseri bul veya oluştur
    let userArt = (this.state.collectionArtifacts || []).find(a => a.id === chosenConfig.id);
    if (!userArt) {
      userArt = { id: chosenConfig.id, discovered: false, discoveredAt: null, count: 0 };
      if (!this.state.collectionArtifacts) this.state.collectionArtifacts = [];
      this.state.collectionArtifacts.push(userArt);
    }

    const wasDiscovered = userArt.discovered;
    userArt.discovered = true;
    if (!userArt.discoveredAt) userArt.discoveredAt = Date.now();
    userArt.count = (userArt.count || 0) + 1;

    const rarityBadge = chosenConfig.rarity === 'legendary' ? '💎 EFSANEVİ' : (chosenConfig.rarity === 'epic' ? '🟣 EPİK' : (chosenConfig.rarity === 'rare' ? '🔵 NADİR' : '🟢 YAYGIN'));
    const isDuplicate = wasDiscovered;

    sound.playLevelUp();
    this.saveState();

    return {
      success: true,
      type: 'artifact',
      isDuplicate,
      artifact: {
        id: chosenConfig.id,
        name: chosenConfig.name,
        icon: chosenConfig.icon,
        rarity: chosenConfig.rarity,
        lore: chosenConfig.lore,
        count: userArt.count
      },
      message: isDuplicate
        ? `📦 Pandora Kutusundan [${rarityBadge}] ${chosenConfig.icon} ${chosenConfig.name} çıktı! (Koleksiyonunda ${userArt.count} adet oldu)`
        : `🎉 TEBRİKLER! Pandora Kutusundan YENİ [${rarityBadge}] ${chosenConfig.icon} ${chosenConfig.name} keşfettin!`
    };
  },

  openMysteryBox() {
    return this.unboxMysteryBox();
  },

  // 18 Koleksiyon Eseri Tamamlandığında Genesis NFT'yi Basar
  mintGenesisNft() {
    if (this.state.genesisNftMinted) {
      return { success: false, message: 'Genesis NFT zaten basıldı!' };
    }

    const required = GAME_CONFIG.GENESIS_NFT.requiredArtifacts;
    const discoveredCount = this.state.collectionArtifacts.filter(a => a.discovered).length;
    if (discoveredCount < required) {
      return { success: false, message: `Tüm koleksiyonu tamamlamalısın! (${discoveredCount}/${required} Eser)` };
    }

    const cost = this.adaPrice(GAME_CONFIG.GENESIS_NFT.adAstraCost);
    if (this.state.adAstraBalance < cost) {
      return { success: false, message: `Yetersiz AdAstra! (${cost} ASTRA gerekli)` };
    }

    this.state.adAstraBalance -= cost;
    this._onAdaSpent(cost);
    globalPool.recordTokenSpend(cost);
    this.state.genesisNftMinted = true;
    // v2 (M): Genesis NFT = Universe'de gezegen satın alma hakkı
    this.state.grants = Array.from(new Set([...(Array.isArray(this.state.grants) ? this.state.grants : []), ...((GAME_CONFIG.GENESIS_NFT && GAME_CONFIG.GENESIS_NFT.grants) || ['universe_planet_purchase'])]));

    sound.playLevelUp();
    this.saveState();

    return { success: true, message: `🏆 ${GAME_CONFIG.GENESIS_NFT.name} başarıyla basıldı! Efsane tamamlandı!` };
  },

  // Kolezyum/Arena Girişleri İçin Arena Anahtarı Ekler
  addArenaKey(count = 1) {
    this.state.arenaKeys = (this.state.arenaKeys || 0) + count;
    this.saveState();
    return this.state.arenaKeys;
  },
};
