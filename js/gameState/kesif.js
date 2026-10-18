// Realm of AdAstra — GameStateManager yöntemleri: koleksiyon eserleri, Pandora kutusu, Genesis NFT, anahtar
// (zindan ganimetinin dağıtımı js/gameState/zindan.js içindedir)
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { GAME_CONFIG } from '../config.js';

// Pandora kutusunun nadirlik zarı: [üst sınır, nadirlik]; zar 0-1 arası tek sayıdır
const NADIRLIK_ESIKLERI = [[0.05, 'legendary'], [0.20, 'epic'], [0.50, 'rare']];
const NADIRLIK_ROZETI = { legendary: '💎 EFSANEVİ', epic: '🟣 EPİK', rare: '🔵 NADİR', common: '🟢 YAYGIN' };

const rastgeleSec = (liste) => liste[Math.floor(Math.random() * liste.length)];

export const kesifYontemleri = {
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
        message: '🔑 Pandora Kutusu açmak için en az 1 Anahtar gerekir! (Anahtarlar Kolezyum haftalık 1.liğinden, Şans Çarkından veya AMM Pazarından temin edilebilir).'
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

  // Genesis NFT basma artık Genesis Yolu'nda: js/gameState/genesis.js mintGenesisNft (şartlar, uyandırma, dolar sabit mühür)

  // Pandora kutusu açmak için anahtar ekler (geliştirici)
  addArenaKey(count = 1) {
    this.state.arenaKeys = (this.state.arenaKeys || 0) + count;
    this.saveState();
    return this.state.arenaKeys;
  }
};
