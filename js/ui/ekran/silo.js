// Realm of AdAstra — Silo ve depo ekranı: altı hammaddenin doluluğu ve silo yükseltme.
import { ekranKaydet, kap, kart, cubuk, dugme, uyari, not, simge, tam, esc } from './cekirdek.js';
import { kaynakSimgesi, kaynakAdi, maliyetSatiri, hizliAlKarti, hizliAl } from './bilesik.js';

function yukseltmeBolumu(b) {
  const gs = b.gameState;
  const bedel = gs.getWarehouseUpgradeCost();
  if (!bedel) {
    return uyari(`Silo bu sürümdeki en üst seviyede (Seviye ${gs.state.warehouseLevel}). 13. seviye ve üstü Universe açılınca gelir.`, 'iyi');
  }
  const envanter = gs.state.inventory || {};
  const bakiye = Number(gs.state.adAstraBalance) || 0;

  // Önce şart: her ambar en az %80 dolu olmalı
  const dolulukSatirlari = bedel.keys.map((k) => {
    const sahip = Math.floor(Number(envanter[k]) || 0);
    return `<div class="ek-satir ${bedel.fillOk[k] ? 'is-iyi' : 'is-kotu'}"><span>${kaynakAdi(b, k)}</span><b>${esc(tam(sahip))} / ${esc(tam(bedel.fills[k]))} ${bedel.fillOk[k] ? '✅' : '❌'}</b></div>`;
  });
  // Sonra bedel: kapasitenin yarısı kadar hammadde + pazar değeri kadar ASTRA
  const bedelSatirlari = bedel.keys.map((k) => maliyetSatiri(kaynakAdi(b, k), Math.floor(Number(envanter[k]) || 0), bedel.costs[k]));
  bedelSatirlari.push(maliyetSatiri('ASTRA', bakiye, bedel.adAstra, { astraMi: true }));
  const yeniKapasite = bedel.keys.map((k) => `${kaynakAdi(b, k)} ${tam(bedel.nextCap[k])}`).join(' · ');

  let dugmeHtml;
  if (!bedel.is80PercentFull) dugmeHtml = dugme({ e: 'yukselt', metin: '⚠️ Tüm ambarlar en az %80 dolu olmalı', devreDisi: true, genis: true });
  else if (!bedel.canAffordCost) dugmeHtml = dugme({ e: 'yukselt', metin: '⚠️ Kaynak ya da ASTRA yetmiyor', devreDisi: true, genis: true });
  else dugmeHtml = dugme({ e: 'yukselt', metin: `🔨 Siloyu Seviye ${bedel.nextLevel}'e yükselt`, ton: 'iyi', genis: true });

  return [
    kart({
      baslik: 'Şart: ambarlar en az %80 dolu',
      rozet: bedel.is80PercentFull ? '<span class="ek-etiket is-iyi">sağlandı</span>' : '<span class="ek-etiket is-uyari">bekleniyor</span>',
      vurgu: bedel.is80PercentFull ? 'iyi' : 'uyari',
      icerik: dolulukSatirlari.join('')
    }),
    kart({
      baslik: `Seviye ${bedel.nextLevel} bedeli`,
      icerik: `${bedelSatirlari.join('')}<p class="ek-kucuk">Yeni kapasiteler: <b>${yeniKapasite}</b></p>`
    }),
    hizliAlKarti(b, 'warehouse'),
    dugmeHtml
  ].join('');
}

const ekran = {
  id: 'silo',
  canliYenile: true,
  baslik: () => ['📦', 'Silo ve depo'],
  govde(b) {
    const gs = b.gameState;
    const envanter = gs.state.inventory || {};
    const kapasite = gs.getWarehouseCapacity();
    // Teçhizat parçası da siloda yer tutar (pazardan alırken bu sınır aşılamaz), o yüzden altı hammaddenin yanında gösterilir
    const ambarlar = [...b.GAME_CONFIG.RESOURCE_KEYS, 'fragments'].map((k) => {
      const mevcut = Math.floor(Number(envanter[k]) || 0);
      const kapasiteDeger = Number(kapasite[k]) || 0;
      const yuzde = kapasiteDeger > 0 ? Math.min(100, (mevcut / kapasiteDeger) * 100) : 0;
      const parca = k === 'fragments';
      const renk = parca ? '#a78bfa' : (b.GAME_CONFIG.RESOURCE_META[k] || {}).color || '';
      const simgeHtml = parca ? '🧩' : kaynakSimgesi(b, k);
      const ad = parca ? 'Teçhizat parçası' : kaynakAdi(b, k);
      return `<div class="ek-ambar">
        <div class="ek-ambar-ust">${simge(simgeHtml, true)}<span class="ek-ambar-ad">${ad}</span><b>${esc(tam(mevcut))} / ${esc(tam(kapasiteDeger))}</b></div>
        ${cubuk(yuzde, { renk, ton: yuzde >= 99.5 ? 'dolu' : '' })}
      </div>`;
    });
    return kap([
      kart({
        baslik: `📦 Silo seviye ${gs.state.warehouseLevel}`,
        icerik: not('Siloyu yükseltince altı hammaddenin ve teçhizat parçasının kapasitesi büyür; pazardan bu sınırın üstünde alım yapılamaz. Yükseltmek için tüm ambarlar en az %80 dolu olmalı; bedel kapasitenin yarısı kadar hammadde ile bunların pazar değeri kadar ASTRA\'dır.')
      }),
      kart({ baslik: 'Ambarlar', icerik: `<div class="ek-ambarlar">${ambarlar.join('')}</div>` }),
      yukseltmeBolumu(b)
    ].join(''));
  },
  eylemler: {
    yukselt(b) {
      const r = b.gameState.upgradeWarehouse();
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    async hizliAl(b, el) {
      await hizliAl(b, el.dataset.kind);
    }
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
