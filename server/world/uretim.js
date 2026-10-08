// Realm of AdAstra sunucusu — dünya: Üretim Hakkı ve canlı görüntü tazeleme
// (kurumsal A3.10: server/world.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar createWorld'den `w` ile gelir.)
import { DAY } from './yardimci.js';

export function olusturUretim(w) {
  const { db, E, clock, log, setEcon, weekScore } = w;
  // ── Canlı çekim tahmini (her 10 dakikada) ───────────────────────────────
  // v2: Sirius Çıkarma Kapasitesi = aktif oyuncu ağırlıkları toplamı × kişi başı hak. Saatte bir tazelenir (yeni oyuncu
  // gelince kapasite büyür); fiyat/açılış oranı da kaydedilir (haftalık termostat girdisi).
  function refreshUretim() {
    let sum = 0;
    const cutoff = clock() - 14 * DAY;
    for (const p of db.q.playersAll.all()) {
      const st = E.readPlayer(p.address);
      if (!st || (Number(st.lastSeenAt) || 0) < cutoff) continue;
      const r = E.withPlayer(p.address, gs => gs.getUretimWeight().weight);
      sum += Number(r && r.result) || 0;
    }
    try { E.gs.snapshotPriceRatios(true); } catch (err) { log.warn('Fiyat oranı:', err.message); }
    E.globalPool.setSumWeight(Math.max(1, sum));
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
