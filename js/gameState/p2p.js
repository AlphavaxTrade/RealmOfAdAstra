// Realm of AdAstra — GameStateManager yöntemleri: Eser ilanları (P2P)
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { sound } from '../audio.js';

export const p2pYontemleri = {
  // =========================================================================
  // P2P KOLEKSİYON ESERİ PAZARYERİ (ORDER BOOK & İLAN YÖNETİMİ)
  // =========================================================================
  getP2PArtifactListings() {
    if (!this.state.p2pMarketListings || this.state.p2pMarketListings.length === 0) {
      this.state.p2pMarketListings = [
        { id: 'p2p_1', artifactId: 'artifact_01', sellerName: 'Gezgin_Goblins', priceAda: 85, createdAt: Date.now() - 3600000 },
        { id: 'p2p_2', artifactId: 'artifact_04', sellerName: 'Lord_Kaelen', priceAda: 160, createdAt: Date.now() - 7200000 },
        { id: 'p2p_3', artifactId: 'artifact_06', sellerName: 'Tüccar_Kael', priceAda: 290, createdAt: Date.now() - 14400000 },
        { id: 'p2p_4', artifactId: 'artifact_09', sellerName: 'Gladyator_Rex', priceAda: 650, createdAt: Date.now() - 28800000 },
        { id: 'p2p_5', artifactId: 'artifact_12', sellerName: 'Saray_Muhafizi', priceAda: 1200, createdAt: Date.now() - 43200000 },
        { id: 'p2p_6', artifactId: 'artifact_17', sellerName: 'Ejderha_Avcisi', priceAda: 2800, createdAt: Date.now() - 86400000 }
      ];
    }
    return this.state.p2pMarketListings;
  },

  createP2PArtifactListing(artifactId, priceAda) {
    const price = Math.floor(Number(priceAda));
    if (isNaN(price) || price < 10) {
      return { success: false, message: 'Minimum satış fiyatı 10 ASTRA olmalıdır!' };
    }
    const art = (this.state.collectionArtifacts || []).find(a => a.id === artifactId);
    if (!art || !art.discovered) {
      return { success: false, message: 'Sahip olmadığınız veya henüz keşfetmediğiniz bir eseri satışa çıkaramazsınız!' };
    }
    const cfg = GAME_CONFIG.COLLECTION_ARTIFACTS.find(c => c.id === artifactId);
    const listing = {
      id: `p2p_${Date.now()}`,
      artifactId,
      sellerName: this.state.profileName || 'AlphAvax Gezgini',
      isUserListing: true,
      priceAda: price,
      createdAt: Date.now()
    };

    const listings = this.getP2PArtifactListings();
    listings.unshift(listing);
    this.saveState();

    return { success: true, message: `🚀 ${cfg ? cfg.icon : '👑'} ${cfg ? cfg.name : artifactId} eseri ${price.toLocaleString()} ASTRA fiyatla pazara ilan verildi!`, listing };
  },

  buyP2PArtifactListing(listingId) {
    const listings = this.getP2PArtifactListings();
    const idx = listings.findIndex(l => l.id === listingId);
    if (idx === -1) return { success: false, message: 'İlan bulunamadı veya daha önce satıldı!' };

    const listing = listings[idx];
    if (this.state.adAstraBalance < listing.priceAda) {
      return { success: false, message: `Yetersiz Bakiye! (${listing.priceAda.toLocaleString()} ASTRA gerekli)` };
    }

    this.state.adAstraBalance -= listing.priceAda;
    this._onAdaSpent(listing.priceAda);
    globalPool.recordTokenSpend(listing.priceAda);

    // Keşfedildi olarak işaretle
    const art = (this.state.collectionArtifacts || []).find(a => a.id === listing.artifactId);
    if (art) {
      art.discovered = true;
      art.discoveredAt = Date.now();
    }

    const cfg = GAME_CONFIG.COLLECTION_ARTIFACTS.find(c => c.id === listing.artifactId);

    // İlanı pazardan kaldır
    listings.splice(idx, 1);
    sound.playLevelUp();
    this.saveState();

    return { success: true, message: `🎉 ${cfg ? cfg.icon : '👑'} ${cfg ? cfg.name : listing.artifactId} eseri ${listing.priceAda.toLocaleString()} ASTRA ödenerek pazardan satın alındı ve albümüne eklendi!` };
  },

  cancelP2PArtifactListing(listingId) {
    const listings = this.getP2PArtifactListings();
    const idx = listings.findIndex(l => l.id === listingId);
    if (idx === -1) return { success: false, message: 'İlan bulunamadı!' };

    listings.splice(idx, 1);
    this.saveState();
    return { success: true, message: 'İlan başarıyla pazardan kaldırıldı.' };
  },
};
