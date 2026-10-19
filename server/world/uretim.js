// Realm of AdAstra sunucusu — dünya: Üretim Hakkı ve canlı görüntü tazeleme
// (kurumsal A3.10: server/world.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar createWorld'den `w` ile gelir.)
import { DAY } from './yardimci.js';
import { havuzDagit, botCarpani } from '../../js/economy/uretimDagitimi.js';

export function olusturUretim(w) {
  const { db, E, clock, log, setEcon, weekScore } = w;
  // ── Canlı çekim tahmini (her 10 dakikada) ───────────────────────────────
  // v2: Sirius Çıkarma Kapasitesi = aktif oyuncu ağırlıkları toplamı × kişi başı hak. Saatte bir tazelenir (yeni oyuncu
  // gelince kapasite büyür); fiyat/açılış oranı da kaydedilir (haftalık termostat girdisi).
  // v2 düzeltmesi (E-planı S8, 8 Ekim 2026): toplam (sumWeight → dünya kapasitesi) HAM ağırlıklardan hesaplanır
  // (pasta büyümez/küçülmez); aynı geçişte en düşük aktif ham ağırlık bulunup adalet tavanı (FAIRNESS_CAP katı)
  // globalPool'a yazılır — kişilerin KENDİ hakkı (getUretimWeight) bu tavanı ayrıca uygular.
  function refreshUretim() {
    let sum = 0;
    let minPositive = Infinity;
    const oyuncular = [];   // { w (ham ağırlık), S (katkı kademesi çarpanı) }: global havuzun dağıtımı için
    const cutoff = clock() - 14 * DAY;
    for (const p of db.q.playersAll.all()) {
      const st = E.readPlayer(p.address);
      if (!st || (Number(st.lastSeenAt) || 0) < cutoff) continue;
      // mutatePlayer: kaydı "görüldü" saymaz (withPlayer lastSeenAt'i tazeleyip 3 gündür girmeyen hesaba aktiflik bonusu verirdi)
      const ham = E.mutatePlayer(p.address, gs => { const r = gs._getUretimWeightRaw(); return { weight: r.weight, S: (r.tier && r.tier.mult) || 1 }; }) || {};
      const w = Number(ham.weight) || 0;
      if (w > 0) oyuncular.push({ w, S: Number(ham.S) || 1 });
      sum += w;
      if (w > 0 && w < minPositive) minPositive = w;
    }
    try { E.gs.snapshotPriceRatios(true); } catch (err) { log.warn('Fiyat oranı:', err.message); }
    E.globalPool.setSumWeight(Math.max(1, sum));
    const ratio = E.GAME_CONFIG.URETIM_HAKKI?.FAIRNESS_CAP ?? 3;
    const tavanAgirlik = isFinite(minPositive) ? minPositive * ratio : 0;
    E.globalPool.setFairnessCapWeight(tavanAgirlik);

    // 19 Ekim 2026 ekonomi planı: global haftalık havuz (fiyat ve bot ASTRA girişiyle ayarlı) oyunculara dağıtılır
    // (taban pay herkese eşit, fazlası limiti ve katkı kademesi yüksek olanlara); sonuç dünya kapasitesi olur
    try {
      const U = E.GAME_CONFIG.URETIM_HAKKI || {};
      const gp = E.globalPool;
      const params = gp.uretimParams();
      const pay = {};
      for (const key of Object.keys((gp.state && gp.state.resources) || {})) {
        const birim = gp.weeklyRightPerWeight(key, params);
        const liste = oyuncular.map(o => ({ L: birim * (tavanAgirlik > 0 ? Math.min(o.w, tavanAgirlik) : o.w), S: o.S }));
        const d = havuzDagit(liste, gp.globalHavuz(key, params), U.TABAN_PAYI ?? 0.6);
        pay[key] = { A: d.A == null ? null : Math.round(d.A * 1000) / 1000, phi: Math.round(d.phi * 1e6) / 1e6, total: Math.floor(d.total), n: d.n };
      }
      let botOrani = 1;
      try { botOrani = botCarpani((w.akisSerileri ? w.akisSerileri().tb : []), U.AYAR || {}); } catch (err) { log.warn('Bot akışı:', err.message); }
      gp.setUretimPay(pay, botOrani);
      const acil = gp.uretimAcilDurum();
      if (Object.keys(acil).length) log.warn('Üretim havuzu ACİL artış:', JSON.stringify(acil));
    } catch (err) { log.warn('Global havuz dağıtımı:', err.message); }
    return sum;
  }

  function refreshLive() {
    const ep = E.globalPool.state.epochId;
    let scoreTotal = 0;
    for (const p of db.q.playersAll.all()) scoreTotal += weekScore(E.readPlayer(p.address), ep);
    setEcon({ live: { scoreTotal, at: clock() } });
  }

  // ── Zamanlayıcı ─────────────────────────────────────────────────────────

  return { refreshUretim, refreshLive };
}
