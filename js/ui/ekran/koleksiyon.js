// Realm of AdAstra — Sandıklar ve koleksiyon ekranı: Genesis Yolu (şartlar, katkı defteri, eser uyandırma, mühür) ve Pandora kutuları.
// Kurallar js/gameState/genesis.js (makro plan C6; kullanıcı kuralı: Genesis basan, 3 yıllık ayrıcalık maliyetini önden ödemiş olmalı).
import { ekranKaydet, kap, kart, katli, sekmeler, dugme, uyari, not, bos, izgara, etiket, satir, cubukSatiri, sure, tam, astra, esc } from './cekirdek.js';

const SEKMELER = [{ id: 'koleksiyon', ad: 'Genesis Yolu (18 eser)', simge: '👑' }, { id: 'kutular', ad: 'Pandora kutuları', simge: '📦' }];
const dolar = (v) => `${(Number(v) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

function genesisKarti(b, y) {
  const G = b.GAME_CONFIG.GENESIS_NFT;
  if (y.basildi) {
    return kart({
      baslik: `🏆 ${esc(G.name)} #${esc(y.no)}`, rozet: etiket('senin', 'iyi'), vurgu: 'iyi',
      icerik: uyari(`Genesis #${esc(y.no)} senin. Zincirdeki NFT bağlı cüzdanına basılacak (durum: ${esc(y.zincir || 'bekliyor')}).`, 'iyi')
        + not('Ayrıcalıkların: trade uygulamasında süresiz Uydu üyeliği ve Gözlemevi %50 indirim, AdAstra Universe\'de gezegen satın alma hakkı, stake sitesinde ödül çarpanı, kapı sırasında öncelik. Genesis satılırsa haklar alıcıya geçer.')
    });
  }
  const tamam = y.sartlar.filter((x) => x.ok).length;
  const katkiYuzde = y.maliyet.gerekli > 0 ? ((y.defter.net + y.muhur.usd) / y.maliyet.gerekli) * 100 : 0;
  return kart({
    baslik: `🏆 ${esc(G.name)}`,
    rozet: etiket(`${tamam}/${y.sartlar.length} şart`, y.hazir ? 'iyi' : ''),
    vurgu: y.hazir ? 'iyi' : '',
    icerik: not('Genesis uzun bir yolun sonudur: hesabını büyüt, Krallık Yolu\'nu ve zindanın 18. katını bitir, 18 eseri bulup tek tek uyandır. Bu yolda yaptığın harcama ve yakımlar ekosisteme katkındır; ekosistem karşılığını ayrıcalıklarla öder. Kural: Genesis basan, ayrıcalıklarının en az 3 yıllık maliyetini önden ödemiş olmalı.')
      + cubukSatiri('Ekosisteme net katkın (mühür dahil)', `${dolar(y.defter.net + y.muhur.usd)} / ${dolar(y.maliyet.gerekli)}`, katkiYuzde, { ton: katkiYuzde >= 100 ? 'dolu' : '' })
      + katli(`Şartlar (${tamam}/${y.sartlar.length}) ve hesap (ayrıntı)`, y.sartlar.map((x) => satir(`${x.ok ? '✅' : '⬜'} ${x.ad}`, x.deger || (x.ok ? 'tamam' : 'eksik'), x.ok ? 'iyi' : '')).join('')
        + satir('Oyunda harcadığın (harcandığı andaki değer)', dolar(y.defter.harcananUsd))
        + satir('Yaktığın hammadde', dolar(y.defter.yakilanUsd))
        + satir('Oyundan çektiğin (düşülür)', dolar(y.defter.cekilenUsd))
        + satir('Mühür bedeli', `${y.muhur.usd} $ ≈ ${astra(y.muhur.astra)} ASTRA (yarısı yakılır)`)
        + (y.dunya.fiyatOlculdu ? '' : not('ASTRA fiyatı şu an ölçülemiyor; hesap yedek fiyatla yapılıyor.')), { k: 'genesis-detay' })
      + dugme({ e: 'genesis', metin: `🏆 Genesis NFT bas (${y.muhur.usd} $)`, ton: 'birincil', devreDisi: !y.hazir, genis: true })
  });
}

function eserIzgarasi(b, y) {
  const s = b.gameState.state;
  const aktif = y.uyandirma;
  const eserler = s.collectionArtifacts.map((a) => {
    const cfg = b.GAME_CONFIG.COLLECTION_ARTIFACTS.find((c) => c.id === a.id);
    if (!a.discovered || !cfg) return '<div class="ek-hucre ek-eser is-kilitli" title="Henüz keşfedilmedi"><b>❓</b><small>🔒 kilitli</small></div>';
    let alt;
    if (a.uyandi) alt = '<small>✨ uyandı</small>';
    else if (aktif && aktif.id === a.id) alt = `<small>⏳ ${esc(sure(aktif.kalanMs))}</small>`;
    else {
      const bd = b.gameState.getUyandirmaBedeli(a.id);
      const hm = Object.entries(bd.hammadde).map(([k, v]) => `${tam(v)} ${(b.GAME_CONFIG.RESOURCE_META[k] || {}).name || k}`).join(', ');
      alt = dugme({ e: 'uyandir', veri: { eser: a.id }, metin: `Uyandır · ${astra(bd.astra)} ASTRA`, ton: 'iyi', devreDisi: !!aktif, ipucu: `${bd.birim} birim: ${astra(bd.astra)} ASTRA + ${hm} (yakılır), ${Math.round(bd.sureMs / 3600000)} saat` });
    }
    return `<div class="ek-hucre ek-eser rarity-${esc(cfg.rarity)}" title="${esc(`${cfg.name}: ${cfg.lore}`)}"><b>${esc(cfg.icon)}</b><small>${esc(cfg.name)}</small>${alt}</div>`;
  });
  const ust = aktif ? uyari(`⏳ ${esc((b.GAME_CONFIG.COLLECTION_ARTIFACTS.find((c) => c.id === aktif.id) || {}).name || '')} uyanıyor: ${esc(sure(aktif.kalanMs))} kaldı. Aynı anda tek eser uyanır.`) : '';
  return ust + izgara(eserler, {});
}

function koleksiyonSekmesi(b) {
  const y = b.gameState.getGenesisYolu();
  return genesisKarti(b, y) + eserIzgarasi(b, y);
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
    uyandir(b, el) {
      const r = b.gameState.uyandirEser(el.dataset.eser);
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    async kutuAc(b, el, secenek) {
      const s = b.gameState.state;
      if ((s.lockedBoxes || 0) <= 0) { b.bildir('Açılacak Pandora kutun yok!', 'error'); return false; }
      if ((s.arenaKeys || 0) <= 0) { b.bildir('🔑 Pandora kutusu açmak için en az 1 anahtar gerekir. (Anahtarlar Kolezyum haftalık ilk üçünden gelir; kutuyu ve anahtarı İlan Pazarından da alabilirsin.)', 'error'); return false; }
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
