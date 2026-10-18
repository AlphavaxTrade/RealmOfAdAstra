// Realm of AdAstra — Şifahane ekranı: şifalı otla hemen iyileştirme (hemen iyileştirmenin tek yolu).
import { ekranKaydet, kap, kart, katli, not, uyari, dugme, tam, astra, esc } from './cekirdek.js';
import { hizliIyilestir } from './bilesik.js';

const ekran = {
  id: 'sifahane',
  canliYenile: true,
  baslik: () => ['🌿', 'Şifahane'],

  govde(b) {
    const gs = b.gameState;
    const S = b.GAME_CONFIG.SIFAHANE || {};
    const ot = Math.floor(gs.state.inventory.herb || 0);
    const bakiye = gs.state.adAstraBalance || 0;
    const yaralilar = (gs.state.soldierUnits || [])
      .map((s, i) => ({ i, s, bilgi: gs.getHerbHealInfo(i) }))
      .filter((x) => x.bilgi && !x.bilgi.isFull);

    const satirlar = yaralilar.map(({ i, s, bilgi }) => {
      const yeter = ot >= bilgi.herbsNeeded && bakiye >= bilgi.herbAdaCost;
      const plan = !yeter && ot < bilgi.herbsNeeded ? gs.getQuickBuyPlan(`heal:${i}`) : null;
      return `<div class="ek-oge">
        <div class="ek-oge-govde"><b>${esc(s.name)}</b><small>${esc(tam(bilgi.battleHp))} / ${esc(tam(bilgi.battleMaxHp))} can</small></div>
        ${plan && plan.items.length
    ? dugme({ e: 'hizli', metin: `⚡ Eksik otu al ve iyileştir · ~${tam(Math.ceil(plan.total + plan.extraAda))} ASTRA`, ton: 'iyi', veri: { asker: i }, devreDisi: !plan.ok })
    : dugme({ e: 'iyilestir', metin: `🌿 İyileştir (${tam(bilgi.herbsNeeded)} ot + ${astra(bilgi.herbAdaCost)} ASTRA)`, ton: 'iyi', veri: { asker: i }, devreDisi: !yeter })}
      </div>`;
    }).join('');

    const toplu = gs.getAllHealCost();
    const hepsiPlan = toplu.count > 0 ? gs.getQuickBuyPlan('heal') : null;
    const hepsiMetin = hepsiPlan && hepsiPlan.items.length
      ? `⚡ Eksik otu al ve hepsini iyileştir · ~${tam(Math.ceil(hepsiPlan.total + hepsiPlan.extraAda))} ASTRA`
      : `🌿 Hepsini iyileştir (${tam(toplu.totalHerbs)} ot + ${astra(toplu.totalAda)} ASTRA)`;

    const govde = yaralilar.length === 0
      ? uyari('Bütün askerler tam can.', 'iyi')
      : `<div class="ek-liste">${satirlar}</div>${dugme({ e: 'hepsi', metin: hepsiMetin, ton: 'iyi', genis: true, devreDisi: !!hepsiPlan && hepsiPlan.items.length > 0 && !hepsiPlan.ok })}`;

    const yollar = katli('İyileştirmenin üç yolu: hangisi neden var?',
      not(`<b>1) Kendiliğinden:</b> hiçbir şey yapmazsan asker 24 saatte tam cana kavuşur; can başına az buğday ve çok az ASTRA harcanır. En ucuzu, ama beklersin.`)
      + not(`<b>2) Şifalı otla (burası):</b> hemen iyileştirmenin <b>tek</b> yolu. 1 şifalı ot ${esc(S.HP_PER_HERB ?? 2)} can iyileştirir, kullanılan ot yakılır; üstüne can başına ${esc(S.ADA_PER_HP ?? 0.01)} ASTRA ödersin. Şifalı otun bu ekrandan başka sürekli harcandığı yer yok; yakım burada kurulur ki ot ucuzlayıp değerini yitirmesin.`)
      + not(`<b>3) Parşömenle:</b> "Ordu İyileştirme Parşömeni" zindandan düşer ya da pazardan alınır; bir askere ${esc(S.PARSOMEN_CAN ?? 4)} can verir (2 şifalı otun karşılığı), ot ve ASTRA harcamaz. Pazar fiyatıyla ota göre pahalıdır, o yüzden büyük iyileştirmeler için ot daha ucuza gelir.`),
    { k: 'yollar' });

    return kap(kart({
      baslik: '🌿 Şifahane',
      rozet: `<span class="ek-etiket is-iyi">${esc(tam(ot))} şifalı ot</span>`,
      icerik: not(`Hemen iyileştirme yalnız şifalı otla olur: 1 ot = ${esc(S.HP_PER_HERB ?? 2)} can. Otun yetmezse "Eksik otu al" düğmesi pazardan alıp iyileştirir. Şifalı ot Şifalı Ot Bahçesi seferlerinden gelir.`)
        + govde
        + yollar
        + dugme({ e: 'kisla', metin: '⚔️ Kışlaya git', ton: 'hayalet', genis: true })
    }));
  },

  eylemler: {
    iyilestir(b, el) {
      const r = b.gameState.healSoldierWithHerb(parseInt(el.dataset.asker, 10));
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    async hizli(b, el) {
      await hizliIyilestir(b, parseInt(el.dataset.asker, 10));
    },
    async hepsi(b) {
      await hizliIyilestir(b);
    },
    kisla() {
      return { git: 'kisla' };
    }
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
