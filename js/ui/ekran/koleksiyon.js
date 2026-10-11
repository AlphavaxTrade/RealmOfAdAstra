// Realm of AdAstra — Sandıklar ve koleksiyon ekranı: 18 koleksiyon eseri, Genesis NFT basma ve Pandora kutuları.
import { ekranKaydet, kap, kart, sekmeler, dugme, uyari, not, bos, izgara, etiket, tam, esc } from './cekirdek.js';

const SEKMELER = [{ id: 'koleksiyon', ad: 'Koleksiyon (18 eser)', simge: '👑' }, { id: 'kutular', ad: 'Pandora kutuları', simge: '📦' }];

function koleksiyonSekmesi(b) {
  const s = b.gameState.state;
  const G = b.GAME_CONFIG.GENESIS_NFT;
  const bulunan = s.collectionArtifacts.filter((a) => a.discovered).length;
  const gerekli = G.requiredArtifacts;
  const hazir = bulunan >= gerekli;
  const basildi = !!s.genesisNftMinted;

  const eserler = s.collectionArtifacts.map((a) => {
    const cfg = b.GAME_CONFIG.COLLECTION_ARTIFACTS.find((c) => c.id === a.id);
    if (!a.discovered || !cfg) return '<div class="ek-hucre ek-eser is-kilitli" title="Henüz keşfedilmedi"><b>❓</b><small>🔒 kilitli</small></div>';
    return `<div class="ek-hucre ek-eser rarity-${esc(cfg.rarity)}" title="${esc(`${cfg.name}: ${cfg.lore}`)}"><b>${esc(cfg.icon)}</b><small>${esc(cfg.name)}</small></div>`;
  });

  return kart({
    baslik: `🏆 ${esc(G.name)}`,
    rozet: etiket(`${bulunan}/${gerekli} eser`, hazir ? 'iyi' : ''),
    vurgu: hazir && !basildi ? 'iyi' : '',
    icerik: not('Zindan bosslarını yenerek ve Pandora kutularını açarak 18 koleksiyon eserinin tamamını topla; ardından efsanevi Genesis NFT\'ni bas!')
      + dugme({ e: 'genesis', metin: basildi ? '✅ Genesis NFT zaten basıldı' : `🏆 Genesis NFT bas (${tam(G.adAstraCost)} ASTRA)`, ton: 'birincil', devreDisi: !hazir || basildi, genis: true })
  }) + izgara(eserler, {});
}

function kutuSekmesi(b, secenek) {
  const s = b.gameState.state;
  const kutu = s.lockedBoxes || 0;
  const anahtar = s.arenaKeys || 0;
  const acilir = kutu > 0 && anahtar > 0;
  const sonuc = secenek.sonSonuc ? uyari(`🎉 ${esc(secenek.sonSonuc.message)}`, 'iyi') : '';
  const gorunen = Math.min(kutu, 12);
  const kutular = gorunen > 0
    ? `<div class="ek-kutu-izgara">${Array.from({ length: gorunen }, () => '<span class="ek-kutu-simge" aria-hidden="true">📦</span>').join('')}</div>`
    : bos('📦', 'Açılacak Pandora kutun yok', 'Zindanlarda canavar öldürerek şansını dene!');
  return kart({
    baslik: '📦 Pandora kutuları',
    rozet: etiket(`🔑 ${anahtar} anahtar`),
    icerik: not('Her kutuyu açmak 1 🔑 anahtar gerektirir. Anahtarlar yalnızca Kolezyum derecesinden, Şans Çarkından ya da pazardan temin edilir.')
      + sonuc + kutular
      + dugme({ e: 'kutuAc', metin: `📦 Pandora kutusu aç (1 🔑 harca) · ${kutu} kutu var`, ton: 'iyi', devreDisi: !acilir, genis: true })
  });
}

const ekran = {
  id: 'koleksiyon',
  ornekSecenekler: () => [{ sekme: 'koleksiyon' }, { sekme: 'kutular' }],
  baslik: () => ['👑', 'Sandıklar ve koleksiyon'],

  govde(b, secenek) {
    secenek.sekme = secenek.sekme || 'koleksiyon';
    return kap(sekmeler(SEKMELER, secenek.sekme, 'sekme') + (secenek.sekme === 'kutular' ? kutuSekmesi(b, secenek) : koleksiyonSekmesi(b)));
  },

  eylemler: {
    sekme(b, el, secenek) {
      secenek.sekme = el.dataset.sekme;
      secenek.sonSonuc = null;
    },
    genesis(b) {
      const r = b.gameState.mintGenesisNft();
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    async kutuAc(b, el, secenek) {
      const s = b.gameState.state;
      if ((s.lockedBoxes || 0) <= 0) { b.bildir('Açılacak Pandora kutun yok!', 'error'); return false; }
      if ((s.arenaKeys || 0) <= 0) { b.bildir('🔑 Pandora kutusu açmak için en az 1 anahtar gerekir. (Anahtarlar Kolezyum derecesinden, Şans Çarkından ya da pazardan gelir.)', 'error'); return false; }
      const r = await b.gameState.unboxMysteryBox();
      if (r.success) {
        b.gameState.saveState();
        secenek.sonSonuc = r;
        b.bildir(r.message, 'success');
      } else {
        b.bildir(r.message, 'error');
      }
      return undefined;
    }
  }
};

export default ekranKaydet(ekran);
