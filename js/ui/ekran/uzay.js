// Realm of AdAstra — Uzay Limanı ekranı: Universe'e hazırlık, roket görevi ve Hazırlık Deposu (Yük İskelesi).
import { ekranKaydet, kap, kart, not, uyari, dugme, izgara, hucre, cubukSatiri, tam, astra, esc } from './cekirdek.js';
import { onay } from '../v3/bilesenler.js';
import { planBedeli, hizliAlVeYap } from './bilesik.js';

const ASAMALAR = [
  'Aşama 0: Realm (Universe kapalı)',
  'Aşama 1: Hazırlık (Hazırlık Deposu açık)',
  'Aşama 2: Ön sipariş',
  'Aşama 3: Universe açık'
];

function depoBolumu(dp) {
  const satirlar = dp.open ? dp.rows.map((r) => `<div class="ek-oge">
      <div class="ek-oge-govde"><b>${esc(r.icon)} ${esc(r.name)}</b><small>${esc(tam(r.stored))} / ${esc(tam(r.cap))}</small></div>
      <div class="ek-dugmeler">
        ${dugme({ e: 'depoKoy', metin: `📦 Yarısını koy (${tam(Math.min(Math.floor(r.have / 2), r.room))})`, veri: { res: r.key }, devreDisi: !(r.have >= 2 && r.room > 0) })}
        ${dugme({ e: 'depoAl', metin: '↩️ Geri al', veri: { res: r.key }, devreDisi: !(r.stored > 0), ipucu: `Hepsini geri al (%${Math.round(dp.cancelFee * 100)} kesinti)` })}
      </div>
    </div>`).join('') : '';
  return kart({
    baslik: '📦 Yük İskelesi: Hazırlık Deposu',
    vurgu: dp.open ? 'vurgu' : '',
    rozet: `<span class="ek-etiket">${dp.open ? `doluluk %${Math.round(dp.fill * 100)} · değer ${astra(dp.value)} ASTRA` : '🔒 Aşama 1\'de açılır'}</span>`,
    icerik: not(`Universe'e götüreceğin hammaddeyi buraya koyarsın: silodan çıkar, pazara giremez. Sınır: her hammaddede ${dp.weeksCap} haftalık Üretim Hakkın; dünya toplamı ${astra(dp.worldCap)} ASTRA değeri (şu an ${astra(dp.worldTotal)}). Geri alırsan %${Math.round(dp.cancelFee * 100)} kesinti yakılır. Universe açılış günü depoyu Sirius Konseyi teslim alır.`)
      + (dp.open ? `<div class="ek-liste">${satirlar}</div>` : '')
  });
}

const ekran = {
  id: 'uzay',
  canliYenile: true,
  baslik: () => ['🚀', 'Uzay Limanı'],

  govde(b) {
    const gs = b.gameState;
    const roket = gs.getRocketStatus();
    const koy = gs.getVillageInfo();
    const asker = (gs.state.soldierUnits || []).length;
    const asama = b.GAME_CONFIG.UNIVERSE_STAGE || 0;
    const hazirlik = gs.getUniversePrepProgress();
    const dp = hazirlik.depot;

    const durum = kart({
      baslik: '🚀 Uzay Limanı',
      rozet: `<span class="ek-etiket">${esc(ASAMALAR[asama] || ASAMALAR[0])}</span>`,
      icerik: not('Universe\'e hazırlık merkezi: Roket Rampası (roket görevi), Yük İskelesi (Hazırlık Deposu) ve Gözlem Kulesi (kilitli). Realm tek başına en az 1 yıl oynanır; Universe açıldığında geçiş buradan yapılır.')
        + cubukSatiri('Universe\'e hazırlık', `%${hazirlik.pct}`, hazirlik.pct, { renk: '#a78bfa' })
        + izgara([
          hucre('Roket', roket.ready ? 'Hazır ✅' : 'Yapılmadı'),
          hucre('Hazırlık Deposu', dp.open ? `%${Math.round(dp.fill * 100)}` : 'Kilitli'),
          hucre('Köylü', `${tam(koy.villagers)} / 100`),
          hucre('Asker', `${tam(asker)} / 10`),
          hucre('Genesis NFT', gs.state.genesisNftMinted ? 'Var ✅' : 'Yok')
        ])
    });

    const roketPlani = !roket.ready && roket.levelOk && !roket.partsOk ? gs.getQuickBuyPlan('rocket') : null;
    const parcalar = roket.parts.map((p) => `<div class="ek-satir ${p.ok ? 'is-iyi' : 'is-kotu'}"><span>${esc(p.icon)} ${esc(p.name)}</span><b>${esc(tam(p.have))} / ${esc(tam(p.need))}</b></div>`).join('');
    const rampa = kart({
      baslik: '🛠️ Roket Rampası',
      rozet: `<span class="ek-etiket">${roket.ready ? '🏅 Roket hazır' : (roket.levelOk ? 'parçalar' : `seviye ${roket.minLevel} gerekli`)}</span>`,
      icerik: parcalar
        + dugme({ e: 'roket', metin: '🚀 Roketi yap', ton: 'iyi', devreDisi: !roket.canBuild, genis: true })
        + (roketPlani && roketPlani.items.length ? dugme({ e: 'roketHizli', metin: `⚡ Eksikleri al ve roketi yap · ${planBedeli(roketPlani)}`, ton: 'iyi', devreDisi: !roketPlani.ok, genis: true, ipucu: roketPlani.ok ? 'Eksik hammaddeyi pazardan alıp roketi yapar' : roketPlani.reason }) : '')
        + (roket.reason && !roket.ready ? `<p class="ek-kucuk">${esc(roket.reason)}</p>` : '')
        + (roket.ready ? uyari(`Roket ${new Date(roket.builtAt).toLocaleDateString('tr-TR')} tarihinde hazırlandı; Universe'e geçiş kilidi burada açılacak.`, 'iyi') : '')
    });
    // Roket seviyeleri (19 Ekim 2026): mevcut özellikler, sıradaki seviyenin bedeli, mürettebat; fırlatma UOA açılana kadar kilitli
    let seviyeKarti = '';
    if (roket.ready && roket.spec) {
      const s = roket.spec;
      const gelisim = roket.next ? (() => {
        const plan = !roket.next.partsOk ? gs.getQuickBuyPlan('rocketup') : null;
        const satirlar = roket.next.parts.map((p) => `<div class="ek-satir ${p.ok ? 'is-iyi' : 'is-kotu'}"><span>${esc(p.icon)} ${esc(p.name)}</span><b>${esc(tam(p.have))} / ${esc(tam(p.need))}</b></div>`).join('');
        return `<p class="ek-not"><b>Seviye ${roket.next.spec.level} için:</b> gidiş ${roket.next.spec.travelHours} sa · taşıma ${esc(tam(roket.next.spec.cargo))} birim · mürettebat ${roket.next.spec.crew}</p>`
          + satirlar
          + dugme({ e: 'roketYukselt', metin: `🛠️ Roketi seviye ${roket.next.spec.level}'e yükselt`, ton: 'iyi', devreDisi: !roket.next.canUpgrade, genis: true })
          + (plan && plan.items.length ? dugme({ e: 'roketYukseltHizli', metin: `⚡ Eksikleri al ve yükselt · ${planBedeli(plan)}`, ton: 'iyi', devreDisi: !plan.ok, genis: true, ipucu: plan.ok ? 'Eksik hammaddeyi pazardan alıp roketi yükseltir' : plan.reason }) : '');
      })() : uyari('Roket en üst seviyede.', 'iyi');
      seviyeKarti = kart({
        baslik: `🚀 Roket seviye ${roket.rocketLevel} / ${roket.maxRocketLevel}`,
        rozet: `<span class="ek-etiket">${roket.launchOpen ? 'fırlatma açık' : 'UOA kapalı'}</span>`,
        icerik: not('Roket, Realm\'dan UOA\'ya (ikinci oyun) geçiş rampasıdır; gidiş-dönüş yapılabilir. Seviye yükseldikçe daha hızlı gider, daha çok hammadde ve daha çok kişi taşır. Mürettebat köylü + askerdir.')
          + izgara([
            hucre('Gidiş süresi', `${s.travelHours} saat`),
            hucre('Taşıma', `${tam(s.cargo)} birim`),
            hucre('Mürettebat', `${tam(roket.crewFits)} / ${tam(s.crew)}`),
            hucre('Elindeki köylü + asker', tam(roket.crewNow))
          ])
          + gelisim
          + dugme({ e: 'roketFirlat', metin: '🚀 UOA\'ya fırlat', ton: 'hayalet', devreDisi: !roket.launchOpen, genis: true, ipucu: roket.launchReason || 'Fırlatma' })
          + (roket.launchReason ? `<p class="ek-kucuk">${esc(roket.launchReason)}</p>` : '')
      });
    }
    return kap(durum + rampa + seviyeKarti + depoBolumu(dp));
  },

  eylemler: {
    roket(b) {
      const r = b.gameState.buildRocket();
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    roketYukselt(b) {
      const r = b.gameState.upgradeRocket();
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    async roketYukseltHizli(b) {
      await hizliAlVeYap(b, 'rocketup', { baslik: 'Eksikler alınıp roket yükseltilsin mi?', tamam: 'Al ve yükselt', yap: () => b.gameState.upgradeRocket() });
    },
    roketFirlat(b) {
      b.bildir('UOA henüz açılmadı: fırlatma kilitli. Harcadığın ASTRA\'nın %4\'ü UOA tohumunda birikiyor.', 'error');
    },
    async roketHizli(b) {
      await hizliAlVeYap(b, 'rocket', { baslik: 'Eksikler alınıp roket yapılsın mı?', tamam: 'Al ve roketi yap', yap: () => b.gameState.buildRocket() });
    },
    depoKoy(b, el) {
      const k = el.dataset.res;
      const yari = Math.floor(((b.gameState.state.inventory || {})[k] || 0) / 2);
      const r = b.gameState.depositToPrepDepot({ [k]: yari });
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    async depoAl(b, el) {
      const gs = b.gameState;
      const k = el.dataset.res;
      const durum = gs.getPrepDepotStatus();
      const satir_ = durum.rows.find((x) => x.key === k);
      if (!satir_ || !(satir_.stored > 0)) return false;
      const tamam = await onay({
        baslik: 'Depodan geri alınsın mı?',
        metin: `${tam(satir_.stored)} ${satir_.name} geri alınır; %${Math.round(durum.cancelFee * 100)} kesinti yakılır.`,
        tamam: 'Geri al', tehlikeli: true
      });
      if (!tamam) return false;
      const r = gs.withdrawFromPrepDepot(k, satir_.stored);
      b.bildir(r.message, r.success ? 'success' : 'error');
    }
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
