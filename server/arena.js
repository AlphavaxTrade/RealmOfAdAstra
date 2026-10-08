// Realm of AdAstra sunucusu — Kolezyum: gerçek oyunculara karşı maç (eşleşme, maç, haftalık sıralama)
// ============================================================================
// Kurallar js/economy/pvp.js. Akış:
//  • "Maç ara": takım görüntüsü alınır, giriş bedeli (anahtar + stamina + günlük hak) ödenir.
//    Aynı türde (1v1 / 3v3) sırada bekleyen başka bir oyuncu varsa maç HEMEN oynanır; yoksa oyuncu sıraya girer
//    ve askerleri kilitlenir (zindan, bot maçı, dünya bossu kullanamaz).
//  • Bekleyen oyuncu çevrimdışı olabilir: maç onun kilitli takımıyla oynanır, sonucu bildirim olarak alır.
//  • Süre dolarsa kalan canı (yüzde) daha yüksek olan kazanır.
//  • Haftalık hesaplaşmada ilk 10'a Kolezyum kasasından ödül; sıralama sıfırlanır.
// ============================================================================
import { simulateBattle } from '../js/combat.js';
import { rastgele, tamsayi } from './rastgele.js';
import { PVP_RULES, explainLoss, weeklyRewards, ranking } from '../js/economy/pvp.js';

const short = a => (String(a).startsWith('acc:') ? '#' + String(a).slice(4) : String(a).slice(0, 6) + '…' + String(a).slice(-4));
const clone = o => JSON.parse(JSON.stringify(o));

export function createArena({ db, engine, clock = () => Date.now(), botWhenEmpty = false }) {
  const E = engine;
  const get = () => {
    const a = db.kvJson('world:arena', null) || {};
    return { queues: { '1v1': [], '3v3': [], ...(a.queues || {}) }, table: a.table || {}, seq: a.seq || 0, lastWeek: a.lastWeek || null };
  };
  const put = a => db.kvSetJson('world:arena', a);

  const remember = (gs, rec) => {
    const list = Array.isArray(gs.state.pvpMatches) ? gs.state.pvpMatches : [];
    list.unshift(rec);
    gs.state.pvpMatches = list.slice(0, PVP_RULES.keepMatches);
  };

  function decide(sim) {
    if (sim.winner === 'ally') return 'a';
    if (sim.winner === 'enemy') return 'b';
    const last = sim.rounds[sim.rounds.length - 1] || {};
    const a = (last.allyHp || 0) / Math.max(1, last.allyMaxHp || 1);
    const b = (last.enemyHp || 0) / Math.max(1, last.enemyMaxHp || 1);
    return a > b ? 'a' : b > a ? 'b' : null;           // tam eşitlikte berabere: puan yok
  }

  function queue(address, mode, indices) {
    const me = String(address).toLowerCase();
    const A = get();
    let opp = null, match = null;
    const out = E.withPlayer(me, gs => {
      const team = gs.buildPvpTeam(mode, indices);
      if (!team.success) return team;
      const paid = gs.payPvpEntry();
      if (!paid.success) return paid;
      const name = `${team.name} (${short(me)})`;
      const q = A.queues[mode];
      const oi = q.findIndex(x => x.address !== me);
      if (oi < 0 && botWhenEmpty) {
        // 🧪 Deneme sunucusu: sırada kimse yoksa antrenman botu (gücü senin takımının %85-115'i)
        const k = 0.85 + rastgele() * 0.3;
        q.push({ address: '0xbot', name: '🤖 Antrenman Botu', units: team.units.map(u => ({ ...u, name: '🤖 ' + u.name, atk: Math.round(u.atk * k), maxHp: Math.round(u.maxHp * k), hp: Math.round(u.maxHp * k) })), at: clock() });
      }
      const oi2 = q.findIndex(x => x.address !== me);
      if (oi2 < 0) {
        q.push({ address: me, name, units: team.units, at: clock() });
        gs.state.pvpQueue = { mode, indices: team.indices, at: clock() };
        return { success: true, queued: true, message: `⏳ Sıraya girdin (${mode}). İlk gelen rakiple maçın otomatik oynanacak; sonucu bildirim olarak alacaksın. Askerlerin maça kadar kilitli.` };
      }
      opp = q.splice(oi2, 1)[0];
      const allies = clone(team.units).map((u, i) => ({ ...u, uid: 'a' + i }));
      const enemies = clone(opp.units).map((u, i) => ({ ...u, uid: 'b' + i, sourceIndex: -1 }));
      const seed = tamsayi(0x100000000);   // maç tohumu tahmin edilemesin (kriptografik)
      const sim = simulateBattle({ allies, enemies, seed });
      const w = decide(sim);
      const pts = PVP_RULES.modes[mode].points;
      const id = ++A.seq;
      const rowOf = (addr, nm) => (A.table[addr] = A.table[addr] || { points: 0, wins: 0, losses: 0, draws: 0, name: nm });
      const ra = rowOf(me, name), rb = rowOf(opp.address, opp.name);
      ra.name = name;
      if (w === 'a') { ra.points += pts; ra.wins++; rb.losses++; }
      else if (w === 'b') { rb.points += pts; rb.wins++; ra.losses++; }
      else { ra.draws++; rb.draws++; }
      delete A.table['0xbot'];                         // bot sıralamaya girmez, ödül almaz
      const mineUnits = clone(team.units).map((u, i) => ({ ...u, uid: 'a' + i }));
      const theirUnits = clone(opp.units).map((u, i) => ({ ...u, uid: 'b' + i, sourceIndex: -1 }));
      match = { id, mode, at: clock(), seed, a: { address: me, name, units: mineUnits }, b: { address: opp.address, name: opp.name, units: theirUnits }, result: w, points: pts, sim };
      db.kvSetJson('pvp:match:' + id, match);
      const iWon = w === 'a';
      const why = w === 'b' ? explainLoss(mineUnits, theirUnits, sim, 'ally') : null;
      remember(gs, { id, mode, at: match.at, opponent: opp.name, result: iWon ? 'win' : w ? 'loss' : 'draw', points: iWon ? pts : 0, why });
      return {
        success: true, matched: true, matchId: id, mode, result: iWon ? 'win' : w ? 'loss' : 'draw', points: iWon ? pts : 0,
        opponentName: opp.name, why, sim, allies: mineUnits, enemies: theirUnits,
        message: iWon ? `🏆 ${opp.name} rakibini yendin! +${pts} lig puanı.` : w ? `💀 ${opp.name} rakibine kaybettin.` : `🤝 ${opp.name} ile berabere.`
      };
    });
    if (out.result && out.result.success) {
      if (opp && match && opp.address !== '0xbot') {
        const theyWon = match.result === 'b';
        E.mutatePlayer(opp.address, gs => {
          gs.state.pvpQueue = null;
          remember(gs, {
            id: match.id, mode, at: match.at, opponent: match.a.name, result: theyWon ? 'win' : match.result ? 'loss' : 'draw',
            points: theyWon ? match.points : 0,
            why: match.result === 'a' ? explainLoss(match.b.units, match.a.units, match.sim, 'enemy') : null
          });
          gs.pushNotice(theyWon ? `🏟️ Kolezyum: ${match.a.name} rakibini yendin! +${match.points} lig puanı. Maçı Kolezyum → Gerçek Rakipler'den izleyebilirsin.`
            : match.result ? `🏟️ Kolezyum: ${match.a.name} rakibine kaybettin. Nedenini ve maçı Kolezyum → Gerçek Rakipler'den görebilirsin.`
              : `🏟️ Kolezyum: ${match.a.name} ile berabere kaldın.`, theyWon ? 'success' : 'info');
        });
      }
      put(A);
    }
    return out;
  }

  function leave(address) {
    const me = String(address).toLowerCase();
    const A = get();
    const out = E.withPlayer(me, gs => {
      const q = gs.state.pvpQueue;
      if (!q) return { success: false, message: 'Sırada değilsin.' };
      A.queues[q.mode] = (A.queues[q.mode] || []).filter(x => x.address !== me);
      gs.refundPvpEntry();
      gs.state.pvpQueue = null;
      return { success: true, message: '↩️ Sıradan çıktın; anahtarın ve staminan iade edildi.' };
    });
    if (out.result && out.result.success) put(A);
    return out;
  }

  function status(address) {
    const me = String(address).toLowerCase();
    const A = get();
    const st = E.readPlayer(me) || {};
    const rank = ranking(A.table);
    const pool = E.treasury.getPool('arena');
    const prizes = PVP_RULES.topWeights.map(w => Math.floor(pool * PVP_RULES.weeklyPoolShare * w / 100));
    return {
      queue: st.pvpQueue || null,
      waiting: { '1v1': A.queues['1v1'].filter(x => x.address !== me).length, '3v3': A.queues['3v3'].filter(x => x.address !== me).length },
      top: rank.slice(0, 10).map(r => ({ ...r, me: r.id === me, id: undefined })),
      mine: rank.find(r => r.id === me) || null,
      prizes,
      matches: st.pvpMatches || [],
      lastWeek: A.lastWeek,
      rules: PVP_RULES
    };
  }

  function getMatch(id) {
    const m = db.kvJson('pvp:match:' + Number(id), null);
    if (!m) return null;
    return { id: m.id, mode: m.mode, at: m.at, a: { name: m.a.name, units: m.a.units }, b: { name: m.b.name, units: m.b.units }, result: m.result, points: m.points, sim: m.sim };
  }

  // Haftalık: ilk 10'a Kolezyum kasasından ödül, sıralama sıfırlanır (world.settleWeek içinden, tek işlemde)
  // v2 düzeltmesi (E-planı S6, 8 Ekim 2026): bu haftanın TOPLAM bütçesi tek bir T.withdraw() çağrısından geçer
  // (eskiden havuz doğrudan düşülüyordu, %2 tek çekim tavanı ve kasa sağlığı küçültmesi atlanıyordu); tavan devreye
  // girip bütçe küçülürse herkesin payı AYNI oranda küçülür (1. ile 10.nun arasındaki oran bozulmaz). Kesirli
  // bölüşümde (floor) kalan ufak artık son ödüllü sıraya eklenir: kasadan çıkan ile oyunculara dağıtılan tam eşit.
  function settleWeek(closedEpoch) {
    const A = get();
    const T = E.treasury;
    const rewards = weeklyRewards(A.table, T.getPool('arena'));
    const payable = rewards.filter(r => r.amount > 0);
    const wanted = payable.reduce((s, r) => s + r.amount, 0);
    const grantedTotal = wanted > 0 ? (T.withdraw('arena', wanted).granted || 0) : 0;
    let total = 0;
    payable.forEach((r, i) => {
      const isLast = i === payable.length - 1;
      const granted = isLast ? Math.max(0, grantedTotal - total) : Math.floor(r.amount * grantedTotal / wanted);
      total += granted;
      if (!(granted > 0)) return;
      E.mutatePlayer(r.id, gs => {
        gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + granted;
        gs._onAdaEarned(granted);
        gs.pushNotice(`🏆 Kolezyum haftalık sıralaması: ${r.rank}. oldun! +${granted.toLocaleString('tr-TR')} ADA (${r.points} puan).`, 'success');
      });
    });
    A.lastWeek = { epoch: closedEpoch, rewards: rewards.map(r => ({ rank: r.rank, name: r.name, points: r.points, amount: r.amount })) };
    A.table = {};
    put(A);
    return { players: rewards.length, total };
  }

  return { queue, leave, status, getMatch, settleWeek };
}
