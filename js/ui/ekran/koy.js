// Realm of AdAstra — Köy Evleri ekranı: nüfus, buğday ihtiyacı, emek puanı ve yeni ev yapma.
import { ekranKaydet, kap, kart, not, uyari, dugme, izgara, hucre, satir, tam, sayi, esc } from './cekirdek.js';
import { kaynakAdi, planBedeli, hizliAlVeYap } from './bilesik.js';

const ekran = {
  id: 'koy',
  goruldu: 'koy',
  canliYenile: true,
  baslik: () => ['🏘️', 'Köy evleri'],

  govde(b) {
    const gs = b.gameState;
    const koy = gs.getVillageInfo();
    const envanter = gs.state.inventory || {};
    const evBasina = b.GAME_CONFIG.KOY?.VILLAGERS_PER_HOUSE ?? 10;

    const bedelMetni = koy.nextHouseCost
      ? Object.entries(koy.nextHouseCost).map(([k, n]) => `${esc(tam(n))} ${kaynakAdi(b, k)}`).join(' + ')
      : '—';
    const yeter = koy.nextHouseCost
      ? Object.entries(koy.nextHouseCost).every(([k, n]) => (envanter[k] || 0) >= n)
      : false;

    const durum = kart({
      baslik: '🏘️ Köy durumu',
      rozet: `<span class="ek-etiket">${koy.houses} ev · ${tam(koy.villagers)} / ${tam(koy.capacity)} köylü</span>`,
      icerik: [
        not(`Her köylü günde ${tam(b.GAME_CONFIG.KOY.WHEAT_PER_VILLAGER_DAY)} buğday yer (ev dolu ise 10 köylü = günde ${tam(10 * b.GAME_CONFIG.KOY.WHEAT_PER_VILLAGER_DAY)}); buğday varsa nüfus günde %2 büyür (ev kapasitesine kadar). ${koy.starveDays} gün aç kalırsa günde %5 göç eder. Her köylü günde 1 emek puanı üretir (Konsey projeleri için). Her 10 köylü üretimi %1 artırır (en çok %20). Her asker için 1 köylü gerekir.`),
        koy.starving ? uyari(`Köy aç! ${koy.starvingDays} gündür buğday yok; ${koy.starveDays} günden sonra köylüler göç eder. Günlük ihtiyaç: ${tam(koy.wheatPerDay)} buğday.`, 'kotu') : '',
        izgara([
          hucre('Köylü', tam(koy.villagers)),
          hucre('Günlük buğday', tam(koy.wheatPerDay), (envanter.wheat || 0) < koy.wheatPerDay ? 'kotu' : ''),
          hucre('Emek puanı', tam(koy.labor)),
          hucre('Üretim bonusu', `+%${sayi(koy.bonus * 100)}`, 'iyi'),
          hucre('Asker hakkı', `${tam(koy.soldiers)} / ${tam(koy.soldierCap)}`)
        ]),
        satir('Kapasite', `${tam(koy.capacity)} köylü · günde +%${sayi(koy.growthPerDay * 100)}`),
        satir('Günlük emek', `+${tam(koy.laborPerDay)}`)
      ].join('')
    });

    const neden = !koy.canBuildHouse && koy.houseLimitReason ? `${koy.houseLimitReason}.` : (!yeter ? 'Malzeme eksik.' : '');
    const plan = !yeter && koy.canBuildHouse ? gs.getQuickBuyPlan('house') : null;
    const yeniEv = kart({
      baslik: '🏗️ Yeni ev',
      rozet: `<span class="ek-etiket">${koy.houses} / ${koy.maxHouses} (hesap seviyesi kadar)</span>`,
      icerik: satir('Bedel', bedelMetni.replace(/<[^>]*>/g, ''))
        + dugme({ e: 'evYap', metin: `🏘️ Ev yap (+${evBasina} köylü kapasitesi)`, ton: 'iyi', devreDisi: !(koy.canBuildHouse && yeter), genis: true })
        + (plan && plan.items.length ? dugme({ e: 'evHizli', metin: `⚡ Eksikleri al ve ev yap · ${planBedeli(plan)}`, ton: 'iyi', devreDisi: !plan.ok, genis: true, ipucu: plan.ok ? 'Eksik malzemeyi pazardan alıp evi yapar' : plan.reason }) : '')
        + (neden ? `<p class="ek-kucuk">${esc(neden)}</p>` : '')
    });
    return kap(durum + yeniEv);
  },

  eylemler: {
    evYap(b) {
      const r = b.gameState.buildHouse();
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    async evHizli(b) {
      await hizliAlVeYap(b, 'house', { baslik: 'Eksikler alınıp ev yapılsın mı?', tamam: 'Al ve ev yap', yap: () => b.gameState.buildHouse() });
    }
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
