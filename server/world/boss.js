// Realm of AdAstra sunucusu — dünya: dünya bossu savaşı
// (kurumsal A3.10: server/world.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar createWorld'den `w` ile gelir.)
import { fmt } from './yardimci.js';

export function olusturBoss(w) {
  const { db, E, setEcon, atomic } = w;
  // ── Ortak dünya bossu (her Pazar 18:00 TSİ) ─────────────────────────────
  // Ordusunu kilitlemiş bütün oyuncular aynı bossa vurur. Boss kasasının o haftaki payı (WEEKLY_DISTRIBUTION_RATE,
  // %3) verilen hasar oranında paylaşılır: kim önce talep ederse kasayı boşaltamaz. Ödül Kışla → World Boss'tan toplanır.
  // v2 düzeltmesi (E-planı S6/S9, 8 Ekim 2026): bu haftanın TOPLAM bütçesi tek bir T.withdraw() çağrısından geçer
  // (eskiden havuz doğrudan düşülüyordu, hiçbir tavan yoktu); böylece tek çekim ≤ kasanın %2'si tavanı ve kasa
  // sağlığı küçültmesi burada da uygulanır. Bütçe tek seferde kapandıktan SONRA hasar oranına göre bölüşülür — kişi
  // başına ayrı ayrı çekilseydi (ilk işlenen havuzu biraz küçültüp sıradakinin yüzdesini kaydırırdı) oranı bozardı.
  // Yorumdaki ve yedek değerdeki eski %10 (gerçek oran %3) de düzeltildi.
  function runWorldBoss(battleTime) {
    return atomic(() => {
      const players = db.q.playersAll.all();
      const fighters = players.map(p => p.address).filter(a => { const st = E.readPlayer(a); return !!(st && st.worldBoss && st.worldBoss.userStaked); });
      const dmg = new Map();
      let total = 0;
      for (const a of fighters) {
        E.mutatePlayer(a, gs => { const d = Math.max(0, Number(gs.calculateUserWorldBossPower().calculatedDamage) || 0); dmg.set(a, d); total += d; });
      }
      const T = E.treasury;
      const want = total > 0 ? Math.floor(T.getPool('worldBoss') * (E.GAME_CONFIG.WORLD_BOSS?.WEEKLY_DISTRIBUTION_RATE ?? 0.03)) : 0;
      const budget = want > 0 ? (T.withdraw('worldBoss', want).granted || 0) : 0;
      // Kesirli bölüşümde (floor) kalan ufak artık son savaşçıya eklenir — kasadan çekilen (budget) ile oyunculara
      // dağıtılan (paid) tam eşit olsun diye (ne bir oyuncuya gitmeyen artık kalır, ne kasadan fazladan çıkar).
      let paid = 0;
      fighters.forEach((a, idx) => {
        const d = dmg.get(a) || 0;
        const isLast = idx === fighters.length - 1;
        const reward = isLast ? Math.max(0, budget - paid) : Math.floor(budget * d / total);
        paid += reward;
        E.mutatePlayer(a, gs => {
          const b = gs.getWorldBossInfo();
          b.userDamage = d;
          b.claimableRewardAda = (Number(b.claimableRewardAda) || 0) + reward;
          b.lastBattleTimestamp = battleTime;
          b.userStaked = false;
          b.realmDamage = total;
          b.realmFighters = fighters.length;
          if (gs.state.worldBoss) gs.state.worldBoss = b;
          gs.pushNotice(`🌋 Dünya Bossu savaşı bitti: krallık toplam ${fmt(total)} hasar vurdu (${fighters.length} ordu). Senin payın %${total > 0 ? (100 * d / total).toFixed(2).replace('.', ',') : '0'} → ${fmt(reward)} ADA. Kışla → World Boss'tan topla.`, 'success');
        });
      });
      db.kvSet('world:bossLastBattle', battleTime);
      const info = { at: battleTime, fighters: fighters.length, totalDamage: total, budget, paid };
      setEcon({ lastBoss: info });
      db.event('worldBoss', null, info);
      return info;
    });
  }


  return { runWorldBoss };
}
