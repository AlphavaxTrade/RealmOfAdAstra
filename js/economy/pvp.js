// Realm of AdAstra — Kolezyum: gerçek oyunculara karşı maç (saf fonksiyonlar; tarayıcıda ve sunucuda aynı)
// ============================================================================
// Kullanıcı kararı (29-30 Eylül 2026):
//  • Oyuncu askerini (1v1: 1 asker, 3v3: 3 asker) kilitleyip "Maç ara"ya basar; sırada bekleyen ilk oyuncuyla
//    eşleşir. Maçı sunucu oynatır (iki oyuncunun da çevrimiçi olması gerekmez).
//  • Maç tekrar izlenebilir; kaybeden "neden kaybettin" açıklamasını görür.
//  • 1v1 zaferi 1 puan, 3v3 zaferi 3 puan. Haftalık sıralamada ilk 10 ödül alır (Kolezyum kasasından).
//  • Maç askerin canını azaltmaz: iki taraf da tam canla dövüşür (kilitlenen askerin gücü).
// ============================================================================

export const PVP_RULES = {
  modes: {
    '1v1': { size: 1, points: 1 },
    '3v3': { size: 3, points: 3 }
  },
  weeklyPoolShare: 0.30,                               // her hafta Kolezyum kasasının %30'u ilk 10'a
  topWeights: [25, 18, 14, 10, 8, 7, 6, 5, 4, 3],      // sıraya göre pay (toplam 100)
  keepMatches: 10                                      // oyuncu başına saklanan son maç sayısı
};

const HEAL = 'fieldMedic';

export function teamSummary(units) {
  const list = Array.isArray(units) ? units : [];
  const skills = new Set(list.flatMap(u => (Array.isArray(u.skills) ? u.skills : [])));
  return {
    atk: list.reduce((s, u) => s + (Number(u.atk) || 0), 0),
    hp: list.reduce((s, u) => s + (Number(u.maxHp) || 0), 0),
    armor: list.reduce((s, u) => s + (Number(u.armor) || 0), 0),
    skills: skills.size,
    heal: skills.has(HEAL),
    back: list.filter(u => u.row === 'back').length,
    size: list.length
  };
}

const pct = (a, b) => Math.round((a / Math.max(1, b) - 1) * 100);

// Kaybedenin anlayacağı kısa açıklamalar (en önemli 3 neden + bir öneri)
export function explainLoss(mine, theirs, sim = null, mineSide = 'ally') {
  const m = teamSummary(mine), t = teamSummary(theirs);
  const reasons = [];
  if (t.atk > m.atk * 1.1) reasons.push({ w: t.atk / m.atk, text: `Rakibin toplam saldırısı %${pct(t.atk, m.atk)} daha yüksekti (${Math.round(t.atk)} / ${Math.round(m.atk)}).` });
  if (t.hp > m.hp * 1.1) reasons.push({ w: t.hp / m.hp, text: `Rakibin toplam canı %${pct(t.hp, m.hp)} daha fazlaydı (${Math.round(t.hp)} / ${Math.round(m.hp)}).` });
  if (t.armor > m.armor * 1.2) reasons.push({ w: 1.05, text: `Rakibin zırhı daha kalındı (${Math.round(t.armor)} / ${Math.round(m.armor)}); vuruşların daha az işledi.` });
  if (t.heal && !m.heal) reasons.push({ w: 1.15, text: 'Rakibinde iyileştirme becerisi (Sahra Merhemi) vardı, sende yoktu.' });
  if (t.skills > m.skills) reasons.push({ w: 1.08, text: `Rakibinin beceri çeşitliliği daha fazlaydı (${t.skills} / ${m.skills}); farklı rollerdeki askerler birbirini tamamlar.` });
  if (m.size >= 3 && m.back === 0) reasons.push({ w: 1.04, text: 'Bütün askerlerin ön sıradaydı; arka sıradaki askerler daha az hasar alır.' });
  if (sim && Array.isArray(sim.allies) && Array.isArray(sim.enemies)) {
    const mySide = mineSide === 'ally' ? sim.allies : sim.enemies;
    const theirSide = mineSide === 'ally' ? sim.enemies : sim.allies;
    const dm = mySide.reduce((s, u) => s + (u.damageDealt || 0), 0);
    const dt = theirSide.reduce((s, u) => s + (u.damageDealt || 0), 0);
    if (dt > dm * 1.25) reasons.push({ w: dt / Math.max(1, dm), text: `Savaşta rakip senden %${pct(dt, dm)} daha fazla hasar verdi.` });
  }
  reasons.sort((a, b) => b.w - a.w);
  const out = reasons.slice(0, 3).map(r => r.text);
  if (!out.length) out.push('Güçler çok yakındı; kritik vuruşlar ve sıra şansı belirleyici oldu. Tekrar dene!');
  const tip = t.atk > m.atk * 1.1 || t.hp > m.hp * 1.1
    ? 'Öneri: teçhizatını Demirci\'de yükselt ve askerlerini zindanda deneyim kazanarak güçlendir.'
    : !m.heal ? 'Öneri: takımına Sahra Merhemi becerili bir asker ekle.' : 'Öneri: askerlerinin sırasını (ön/arka) değiştirip tekrar dene.';
  out.push(tip);
  return out;
}

// Haftalık ödüller: puana göre (eşitlikte daha çok galibiyet, sonra daha az mağlubiyet) ilk 10
export function weeklyRewards(table, pool, rules = PVP_RULES) {
  const rows = Object.entries(table || {})
    .map(([id, r]) => ({ id, points: r.points || 0, wins: r.wins || 0, losses: r.losses || 0, name: r.name }))
    .filter(r => r.points > 0)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.losses - b.losses);
  const budget = Math.max(0, pool) * rules.weeklyPoolShare;
  return rows.slice(0, rules.topWeights.length).map((r, i) => ({ ...r, rank: i + 1, amount: Math.floor(budget * rules.topWeights[i] / 100) }));
}

export function ranking(table) {
  return Object.entries(table || {})
    .map(([id, r]) => ({ id, points: r.points || 0, wins: r.wins || 0, losses: r.losses || 0, name: r.name || id.slice(0, 8) }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.losses - b.losses)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
