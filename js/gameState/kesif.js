// Realm of AdAstra — GameStateManager yöntemleri: zindan ganimeti, koleksiyon eserleri, Pandora kutusu, Genesis NFT, Arena anahtarı
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { treasury } from '../treasury.js';

// Pandora kutusunun nadirlik zarı: [üst sınır, nadirlik]; zar 0-1 arası tek sayıdır
const NADIRLIK_ESIKLERI = [[0.05, 'legendary'], [0.20, 'epic'], [0.50, 'rare']];
const NADIRLIK_ROZETI = { legendary: '💎 EFSANEVİ', epic: '🟣 EPİK', rare: '🔵 NADİR', common: '🟢 YAYGIN' };

const rastgeleSec = (liste) => liste[Math.floor(Math.random() * liste.length)];

export const kesifYontemleri = {
  // Zindan canavarı yenildiğinde deneyim, ASTRA (zindan kasasından) ve şansa bağlı ganimet dağıtır.
  // rewarded=false: antrenman girişi, yalnızca deneyim.
  addDungeonXpAndDrops(level, isBoss = false, { rewarded = true } = {}) {
    const seviye = Math.max(1, Math.min(18, level));
    const taban = this.getDungeonBaseReward(seviye, isBoss);
    const buyukBoss = taban.isMajorBoss;
    // Yalnız kat 3 (Sv.9) ve kat 6 (Sv.18) bosslarında düşme şansları çarpılır
    const bossCarpani = buyukBoss ? (GAME_CONFIG.BOSS_DROP_MULTIPLIER || 2.0) : 1.0;

    this.addXp(taban.xp);
    if (!rewarded) {
      this.saveState();
      return { success: true, trainingOnly: true, xpGained: taban.xp, adAstraGained: 0, fragmentsGained: 0, boxGained: 0, artifactDiscovered: null, scrollGained: null };
    }

    // Kasa bir günde en fazla bakiyesinin %1'ini öder; çekilen tam miktar oyuncuya gider (yuvarlama yok)
    const gun = this.getDungeonDayStatus();
    const hedef = Math.min(taban.ada, gun.budgetLeft);
    let kazanilanAstra = 0;
    let butceDoldu = false;
    if (hedef > 0) {
      const cekim = treasury && treasury.withdraw ? treasury.withdraw('dungeon', hedef) : { granted: hedef };
      kazanilanAstra = Math.max(0, cekim.granted != null ? cekim.granted : hedef);
      butceDoldu = !!cekim.budgetFull;
      this.state.dailyCounters.dungeonPaid = (this.state.dailyCounters.dungeonPaid || 0) + kazanilanAstra;
    }
    const butceKisti = kazanilanAstra < taban.ada;
    this.state.adAstraBalance += kazanilanAstra;
    this._onAdaEarned(kazanilanAstra);

    const hesapSeviyesi = this.state.level || 1;

    let parca = 0;
    if (Math.random() < Math.min(0.95, this.getFragmentDropRate(hesapSeviyesi) * bossCarpani)) {
      parca = buyukBoss ? 3 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 2);
      this.state.inventory.fragments = (this.state.inventory.fragments || 0) + parca;
    }

    let kutu = 0;
    if (Math.random() < Math.min(0.5, this.getBoxDropRate(hesapSeviyesi) * bossCarpani)) {
      kutu = 1;
      this.state.lockedBoxes = (this.state.lockedBoxes || 0) + 1;
    }

    let eser = null;
    if (buyukBoss && Math.random() < Math.min(1, GAME_CONFIG.ARTIFACT_BASE_RATE * seviye * 6)) {
      eser = this.discoverArtifact(seviye);
    }

    // Parşömen: boss %40, normal canavar %7; %60 iyileştirme, %40 stamina
    let parsomen = null;
    if (Math.random() < (buyukBoss ? 0.40 : 0.07)) {
      const iyilestirme = Math.random() < 0.60;
      const tur = iyilestirme ? 'scroll_heal' : 'scroll_stamina';
      this.state.inventory[tur] = (this.state.inventory[tur] || 0) + 1;
      parsomen = {
        type: tur,
        name: iyilestirme ? 'Ordu İyileştirme Parşömeni (+10 HP)' : '100 Stamina Doldurma Parşömeni',
        icon: iyilestirme ? '📜' : '⚡',
        image: iyilestirme ? 'assets/scroll_heal.jpg' : 'assets/scroll_stamina.jpg'
      };
    }

    this.saveState();
    return {
      xpGained: taban.xp, adAstraGained: kazanilanAstra, fragmentsGained: parca, boxGained: kutu, artifactDiscovered: eser,
      scrollGained: parsomen, isBoss: buyukBoss, budgetCapped: butceKisti, budgetFull: butceDoldu, baseAda: taban.ada
    };
  },

  // Henüz keşfedilmemiş bir eseri açar; varsa bu zindan seviyesine ait olanı öncelikler
  discoverArtifact(preferredLevel = null) {
    const bulunmamis = this.state.collectionArtifacts.filter(a => !a.discovered);
    if (bulunmamis.length === 0) return null;

    const tam = preferredLevel !== null
      ? bulunmamis.find(a => {
        const cfg = GAME_CONFIG.COLLECTION_ARTIFACTS.find(c => c.id === a.id);
        return cfg && cfg.dropLevel === preferredLevel;
      })
      : null;
    const secilen = tam || rastgeleSec(bulunmamis);
    secilen.discovered = true;
    secilen.discoveredAt = Date.now();

    const cfg = GAME_CONFIG.COLLECTION_ARTIFACTS.find(c => c.id === secilen.id);
    return { id: secilen.id, name: cfg.name, icon: cfg.icon, rarity: cfg.rarity, lore: cfg.lore };
  },

  // Pandora kutusunu 1 anahtarla açar: nadirliğe göre ağırlıklı bir koleksiyon eseri çıkar (yinelenebilir)
  unboxMysteryBox() {
    if ((this.state.lockedBoxes || 0) <= 0) return { success: false, message: 'Açılacak Pandora Kutun yok!' };
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

    const zar = Math.random();
    const esik = NADIRLIK_ESIKLERI.find(([ust]) => zar < ust);
    const nadirlik = esik ? esik[1] : 'common';

    const eserler = GAME_CONFIG.COLLECTION_ARTIFACTS;
    const havuz = eserler.filter(c => c.rarity === nadirlik);
    const secilenCfg = havuz.length > 0 ? rastgeleSec(havuz) : rastgeleSec(eserler);

    if (!this.state.collectionArtifacts) this.state.collectionArtifacts = [];
    let kayit = this.state.collectionArtifacts.find(a => a.id === secilenCfg.id);
    if (!kayit) {
      kayit = { id: secilenCfg.id, discovered: false, discoveredAt: null, count: 0 };
      this.state.collectionArtifacts.push(kayit);
    }
    const yineleniyor = kayit.discovered;
    kayit.discovered = true;
    if (!kayit.discoveredAt) kayit.discoveredAt = Date.now();
    kayit.count = (kayit.count || 0) + 1;

    this.saveState();

    const rozet = NADIRLIK_ROZETI[secilenCfg.rarity] || NADIRLIK_ROZETI.common;
    return {
      success: true,
      type: 'artifact',
      isDuplicate: yineleniyor,
      artifact: { id: secilenCfg.id, name: secilenCfg.name, icon: secilenCfg.icon, rarity: secilenCfg.rarity, lore: secilenCfg.lore, count: kayit.count },
      message: yineleniyor
        ? `📦 Pandora Kutusundan [${rozet}] ${secilenCfg.icon} ${secilenCfg.name} çıktı! (Koleksiyonunda ${kayit.count} adet oldu)`
        : `🎉 TEBRİKLER! Pandora Kutusundan YENİ [${rozet}] ${secilenCfg.icon} ${secilenCfg.name} keşfettin!`
    };
  },

  openMysteryBox() {
    return this.unboxMysteryBox();
  },

  // 18 eserin tamamı toplanınca Genesis NFT basılır (Universe'de gezegen satın alma hakkı verir)
  mintGenesisNft() {
    if (this.state.genesisNftMinted) return { success: false, message: 'Genesis NFT zaten basıldı!' };

    const gereken = GAME_CONFIG.GENESIS_NFT.requiredArtifacts;
    const bulunan = this.state.collectionArtifacts.filter(a => a.discovered).length;
    if (bulunan < gereken) return { success: false, message: `Tüm koleksiyonu tamamlamalısın! (${bulunan}/${gereken} Eser)` };

    const bedel = this.adaPrice(GAME_CONFIG.GENESIS_NFT.adAstraCost);
    if (this.state.adAstraBalance < bedel) return { success: false, message: `Yetersiz AdAstra! (${bedel} ASTRA gerekli)` };

    this.state.adAstraBalance -= bedel;
    this._onAdaSpent(bedel);
    globalPool.recordTokenSpend(bedel);
    this.state.genesisNftMinted = true;
    const mevcut = Array.isArray(this.state.grants) ? this.state.grants : [];
    const yeni = (GAME_CONFIG.GENESIS_NFT && GAME_CONFIG.GENESIS_NFT.grants) || ['universe_planet_purchase'];
    this.state.grants = Array.from(new Set([...mevcut, ...yeni]));

    this.saveState();
    return { success: true, message: `🏆 ${GAME_CONFIG.GENESIS_NFT.name} başarıyla basıldı! Efsane tamamlandı!` };
  },

  // Kolezyum girişleri için Arena anahtarı ekler
  addArenaKey(count = 1) {
    this.state.arenaKeys = (this.state.arenaKeys || 0) + count;
    this.saveState();
    return this.state.arenaKeys;
  }
};
