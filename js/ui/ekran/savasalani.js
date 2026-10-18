// Realm of AdAstra — Savaş alanı ekranı: haftalık Dünya Bossu. Ordu kilitleme, hasar hesabı, ödül talebi.
import { ekranKaydet, kap, kart, satir, cubuk, cubukSatiri, dugme, dugmeler, uyari, not, izgara, hucre, etiket, tam, astra, sayi, esc } from './cekirdek.js';
import { onay } from '../v3/bilesenler.js';

function guc(b) {
  const gs = b.gameState;
  const asker = gs.state.soldierUnits || [];
  const boss = gs.getWorldBossInfo();
  const kilitli = !!boss.userStaked;
  const g = gs.calculateUserWorldBossPower();
  let atk = 0;
  let hp = 0;
  asker.forEach((_, i) => {
    const s = gs.getSoldierFullStats(i);
    if (s) { atk += s.totalAtk; hp += s.totalMaxHp; }
  });
  const cesit = gs.calculateSquadSkillDiversity();
  const olasiHasar = Math.floor(Math.floor(atk + hp * 0.25) * cesit.diversityMultiplier);
  const olasiAstra = gs.estimateWorldBossReward(olasiHasar);
  const hasar = kilitli ? g.calculatedDamage : olasiHasar;
  const beklenen = kilitli ? g.estimatedAda : olasiAstra;
  return {
    boss, kilitli, asker, g,
    sayi: kilitli ? (boss.userStakedSoldiersCount || 0) : asker.length,
    atkKatki: kilitli ? g.atkContribution : Math.floor(atk),
    hpKatki: kilitli ? g.hpContribution : Math.floor(hp * 0.25),
    hasar,
    beklenen,
    oran: hasar > 0 ? beklenen / hasar : 0       // 1 hasarın tahmini ASTRA karşılığı (haftalık havuzdan)
  };
}

const ekran = {
  id: 'savasalani',
  kilit: 'battlefield',
  canliYenile: true,
  baslik: () => ['🌋', 'Savaş alanı'],

  govde(b) {
    const gs = b.gameState;
    const v = guc(b);
    const { boss } = v;
    const talep = boss.claimableRewardAda || 0;
    const takvim = gs.getWorldBossSchedule();
    const kalan = takvim.msUntilNext;
    const kalanMetin = `${Math.floor(kalan / 86400000)}g ${Math.floor((kalan % 86400000) / 3600000)}s ${Math.floor((kalan % 3600000) / 60000)}dk`;
    const bossCan = boss.maxBossHp > 0 ? (boss.bossHp / boss.maxBossHp) * 100 : 0;
    const cezaOrani = v.g.earlyUnstakePenaltyRate;

    const aciklama = kart({
      baslik: '🌋 Haftalık dünya bossu',
      rozet: etiket(`Bu haftanın havuzu: ${astra(boss.weeklyAdaPool)} ASTRA`, 'vurgu'),
      vurgu: 'uyari',
      icerik: not('<b>Otomatik savaş:</b> manuel saldırmazsın. Hafta boyunca kilitlenen orduların saldırı ve can puanlarından toplam hasar hesaplanır; <b>her Pazar 18:00\'de (TSİ)</b> savaş otomatik yapılır ve haftanın havuzu hasar payına göre paylaşılır. Havuz kasanın %' + Math.round((b.GAME_CONFIG.WORLD_BOSS.WEEKLY_DISTRIBUTION_RATE || 0.03) * 100) + '\'ü kadardır (kasada toplam ' + tam(boss.vaultAda || 0) + ' ASTRA).')
        + satir('Hasar formülü', 'ATK × 1,0 + HP × 0,25 (yetenek çeşitliliği bonuslu)')
    });

    const ordu = kart({
      baslik: '🛡️ Kilitlediğin ordu ve hasar potansiyeli',
      rozet: v.kilitli ? etiket('✅ savaş için kilitli', 'iyi') : etiket('⚠️ ordu kilitli değil', 'uyari'),
      icerik: izgara([
        hucre(v.kilitli ? 'Kilitli asker' : 'Hazır asker', `⚔️ ${tam(v.sayi)}`),
        hucre('Saldırı katkısı (1:1)', `💥 +${tam(v.atkKatki)}`),
        hucre('Can katkısı (1:0,25)', `❤️ +${tam(v.hpKatki)}`),
        hucre('Hesaplanan hasar', `🎯 ${tam(v.hasar)}`, 'iyi')
      ])
      + satir(v.kilitli ? 'Kilitli ordunun Pazar kazancı' : 'Tahmini Pazar kazancı', `~${astra(v.beklenen)} ASTRA`, 'iyi')
      + `<p class="ek-kucuk">${esc(tam(v.hasar))} hasar × ${esc(sayi(v.oran, 3))} ASTRA</p>`
      + dugmeler(
        dugme({ e: 'kilitle', metin: v.kilitli ? '🔄 Kilitli orduyu güncelle' : '🛡️ Tüm ordumu kilitle (Pazar 18:00 için)', ton: v.kilitli ? '' : 'birincil', devreDisi: v.asker.length === 0 }),
        v.kilitli ? dugme({ e: 'erken', metin: `🔓 %${Math.round(cezaOrani * 100)} cezayla erken çek (${astra(Math.max(1, Math.round(v.g.estimatedAda * cezaOrani)))} ASTRA)`, ton: 'tehlike' }) : ''
      )
      + (v.asker.length === 0 ? uyari('Kışladan asker alıp ordunu kurduğunda burada kilitleyebilirsin.') : '')
    });

    const bossKarti = kart({
      baslik: `${esc(boss.icon)} ${esc(boss.name)}`,
      rozet: etiket('Pazar 18:00 TSİ otomatik savaş'),
      icerik: cubukSatiri('Boss canı', `${tam(boss.bossHp)} / ${tam(boss.maxBossHp)} (%${Math.floor(bossCan)})`, bossCan, { renk: '#ef4444' })
        + satir('Hasar başına ASTRA', `1 hasar = ${sayi(v.oran, 3)} ASTRA`)
        + satir('Önceki savaştaki toplam hasarın', `${tam(boss.userDamage || 0)}`, 'iyi')
        + satir('Sonraki otomatik savaş', `${kalanMetin} (Pazar 18:00 TSİ)`)
    });

    const odul = kart({
      baslik: '🎁 Toplanmaya hazır ödülün',
      vurgu: talep > 0 ? 'iyi' : '',
      icerik: `<div class="ek-buyuk">🟣 ${esc(astra(talep))} <small>ASTRA</small></div>`
        + dugme({
          e: 'talep',
          metin: talep > 0 ? `🎁 ${astra(talep)} ASTRA ödülünü ve ordunu topla` : (v.kilitli ? '⏳ Pazar 18:00 savaşı bekleniyor (ordu kilitli)' : '⏳ Kilitli ordu ya da ödül yok'),
          ton: talep > 0 ? 'birincil' : '', devreDisi: !(talep > 0 || v.kilitli), genis: true
        })
    });
    return kap([aciklama, ordu, bossKarti, odul].join(''));
  },

  eylemler: {
    kilitle(b) {
      const r = b.gameState.stakeArmyForWorldBoss();
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    async erken(b) {
      const gs = b.gameState;
      const g = gs.calculateUserWorldBossPower();
      const ceza = Math.max(1, Math.round(g.estimatedAda * g.earlyUnstakePenaltyRate));
      const tamam = await onay({
        baslik: 'Ordu erken çekilsin mi?',
        metin: `Tahmini kazancının %${Math.round(g.earlyUnstakePenaltyRate * 100)}'i olan ${astra(ceza)} ASTRA ceza ödenir ve ordun serbest kalır.`,
        tamam: 'Cezayı öde ve çek', tehlikeli: true
      });
      if (!tamam) return false;
      const r = gs.emergencyUnstakeWorldBossArmy();
      b.bildir(r.message, r.success ? 'success' : 'error');
      return undefined;
    },
    talep(b) {
      const r = b.gameState.claimWorldBossReward();
      b.bildir(r.message, r.success ? 'success' : 'error');
    }
  }
};

void astra; void cubuk;
export default ekranKaydet(ekran);
