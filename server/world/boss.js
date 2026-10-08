// Realm of AdAstra sunucusu — dünya: dünya bossu savaşı
// (kurumsal A3.10: server/world.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar createWorld'den `w` ile gelir.)
import { fmt } from './yardimci.js';

export function olusturBoss(w) {
  const { db, E, setEcon, atomic } = w;
  // ── Ortak dünya bossu (her Pazar 18:00 TSİ) ─────────────────────────────
  // Ordusunu kilitlemiş bütün oyuncular aynı bossa vurur. Boss kasasının o haftaki payı (WEEKLY_DISTRIBUTION_RATE,
  // %10) verilen hasar oranında paylaşılır: kim önce talep ederse kasayı boşaltamaz. Ödül Kışla → World Boss'tan toplanır.
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
      const budget = Math.floor(T.getPool('worldBoss') * (E.GAME_CONFIG.WORLD_BOSS?.WEEKLY_DISTRIBUTION_RATE ?? 0.10));
      let paid = 0;
      for (const a of fighters) {
        const d = dmg.get(a) || 0;
        const reward = total > 0 ? Math.floor(budget * d / total) : 0;
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
      }
      if (paid > 0) {
        T.state.pools.worldBoss -= paid;
        T.state.outflow.worldBoss = (Number(T.state.outflow.worldBoss) || 0) + paid;
        T.state.lifetimeWithdrawn = (Number(T.state.lifetimeWithdrawn) || 0) + paid;
        T.save();
      }
      db.kvSet('world:bossLastBattle', battleTime);
      const info = { at: battleTime, fighters: fighters.length, totalDamage: total, budget, paid };
      setEcon({ lastBoss: info });
      db.event('worldBoss', null, info);
      return info;
    });
  }


  return { runWorldBoss };
}
