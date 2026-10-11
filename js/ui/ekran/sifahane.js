// Realm of AdAstra — Şifahane ekranı: şifalı otla askerleri iyileştirme.
import { ekranKaydet, kap, kart, not, uyari, dugme, tam, astra, esc } from './cekirdek.js';

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

    const satirlar = yaralilar.map(({ i, s, bilgi }) => `<div class="ek-oge">
        <div class="ek-oge-govde"><b>${esc(s.name)}</b><small>${esc(tam(bilgi.hp))} / ${esc(tam(bilgi.maxHp))} can</small></div>
        ${dugme({ e: 'iyilestir', metin: `🌿 İyileştir (${tam(bilgi.herbsNeeded)} ot + ${astra(bilgi.herbAdaCost)} ASTRA)`, ton: 'iyi', veri: { asker: i }, devreDisi: !(ot >= bilgi.herbsNeeded && bakiye >= bilgi.herbAdaCost) })}
      </div>`).join('');

    const govde = yaralilar.length === 0
      ? uyari('Bütün askerler tam can.', 'iyi')
      : `<div class="ek-liste">${satirlar}</div>${dugme({ e: 'hepsi', metin: '🌿 Hepsini otla iyileştir', ton: 'iyi', genis: true })}`;

    return kap(kart({
      baslik: '🌿 Şifahane',
      rozet: `<span class="ek-etiket is-iyi">${esc(tam(ot))} şifalı ot</span>`,
      icerik: not(`Şifalı ot ile iyileştirme: 1 ot = ${S.HP_PER_HERB ?? 5} can. Buğday harcanmaz; ASTRA bedeli anında iyileştirmenin %${Math.round((S.ADA_SHARE_WITH_HERB ?? 0.5) * 100)}'idir. Şifalı ot yalnız Şifalı Ot Bahçesi seferlerinden gelir.`)
        + govde
        + dugme({ e: 'kisla', metin: '⚔️ Kışlaya git (buğdayla iyileştirme)', ton: 'hayalet', genis: true })
    }));
  },

  eylemler: {
    iyilestir(b, el) {
      const r = b.gameState.healSoldierWithHerb(parseInt(el.dataset.asker, 10));
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    hepsi(b) {
      const r = b.gameState.healAllWithHerb();
      b.bildir(r.message, r.healed > 0 ? 'success' : 'info');
    },
    kisla() {
      return { git: 'kisla' };
    }
  }
};

export default ekranKaydet(ekran);
