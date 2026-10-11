// Realm of AdAstra — GameStateManager yöntemleri: Krallık / ekonomi / hazine özetleri, AMM geri alım
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { ammMarket } from '../ammMarket.js';
import { treasury } from '../treasury.js';
import { zeroRes, RES_KEYS } from './ortak.js';

// ISO hafta anahtarı ("2026-W41"): haftalık geri alımın günde değil haftada bir çalışmasını sağlar.
// Hafta UTC Pazartesi başlar.
export function isoWeekKey(ms) {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1 - (d.getUTCDay() || 7));   // haftanın Pazartesi'sine sabitle
  const yilBasi = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const hafta = Math.ceil((((d - yilBasi) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(hafta).padStart(2, '0')}`;
}

export const ozetYontemleri = {
  // Krallık merkezinin tek veri kaynağı: seferler, aletler, ordu, depo ve altı hammaddenin silo doluluğu
  getRealmSummary() {
    const state = this.state;
    const aletler = state.tools || {};
    const asker = state.soldierUnits || [];
    const seferler = state.activeExpeditions || {};

    const aktifSeferler = Object.keys(seferler).map(nodeId => {
      const bilgi = this.getAccruedExpeditionHarvest(nodeId);
      const kaynak = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId];
      return { nodeId, name: kaynak?.name || nodeId, icon: kaynak?.icon || '📦', ...bilgi, isCompleted: seferler[nodeId].isCompleted };
    });

    // Alet sağlığı: dayanıklılık dakika cinsinden (varsayılan 72 saat = 4320)
    const aletOzeti = Object.keys(aletler).map(id => {
      const cfg = GAME_CONFIG.TOOLS[id];
      const enFazla = cfg?.maxDurability || 4320;
      const guncel = Math.max(0, Math.min(enFazla, aletler[id].durability != null ? aletler[id].durability : enFazla));
      return {
        id, name: cfg?.name || id, durability: guncel, maxDurability: enFazla,
        pct: Math.min(100, Math.max(0, Math.round((guncel / enFazla) * 100))),
        icon: cfg?.icon || '🔧'
      };
    });
    const aletSagligi = aletOzeti.length > 0 ? Math.round(aletOzeti.reduce((t, a) => t + a.pct, 0) / aletOzeti.length) : 100;

    // Ordu
    const toplamAtk = asker.reduce((t, _, i) => t + (this.getSoldierFullStats(i)?.totalAtk || 20), 0);
    const toplamHp = asker.reduce((t, _, i) => t + (this.getSoldierFullStats(i)?.totalMaxHp || 100), 0);
    const yaralilar = asker.filter(s => (s.hp || 0) < (s.maxHp || 100)).length;
    const hpYuzdesi = asker.length > 0
      ? Math.round(asker.reduce((t, s) => t + ((s.hp || 0) / (s.maxHp || 100)) * 100, 0) / asker.length)
      : 100;

    // Depo: oyunun bütün hammaddeleri için doluluk (kapasite 0 ise yüzde 0)
    const envanter = state.inventory || {};
    const kapasite = this.getWarehouseCapacity();
    const meta = GAME_CONFIG.RESOURCE_META || {};

    return {
      level: state.level, xp: state.currentXp, ada: state.adAstraBalance,
      stamina: state.stamina, maxStamina: this.getMaxStamina(),
      activeExps: aktifSeferler, completedExps: aktifSeferler.filter(e => e.isCompleted),
      toolSummary: aletOzeti, avgToolHealth: aletSagligi,
      soldierCount: asker.length, totalAtk: toplamAtk, totalHp: toplamHp, woundedCount: yaralilar, avgHpPct: hpYuzdesi,
      inventory: envanter, warehouseCapacity: kapasite,
      kaynaklar: RES_KEYS().map(key => {
        const m = meta[key] || {};
        const miktar = Number(envanter[key]) || 0;
        const kap = Number(kapasite[key]) || 0;
        return {
          key, name: m.name || key, icon: m.icon || '📦', color: m.color || '#10b981',
          amount: miktar, cap: kap, pct: kap > 0 ? Math.min(100, Math.round((miktar / kap) * 100)) : 0
        };
      })
    };
  },

  // =========================================================================
  // 🏛️ KRALLIK HAZİNESİ, TOKENOMİCS VE TÜM HAVUZLARIN DETAYLI ÖZETİ
  // =========================================================================
  getEconomyAndPoolsSummary() {
    const summary = treasury.getSummary();
    const state = this.state;
    this.getWorldBossInfo();   // dünya bossu kaydı yoksa burada oluşturulur

    // Kasa payları hazine girişinin yüzdesidir (toplam 1); sharePct = hazine payı içindeki yüzde
    const alloc = GAME_CONFIG.TREASURY_ALLOCATION;

    const burnRate = GAME_CONFIG.TOKEN_BURN_RATE ?? 0.05;
    const ubiRate = GAME_CONFIG.UBI_POOL_RATE ?? 0.06;
    const creatorRate = GAME_CONFIG.CREATOR_ROYALTY_RATE ?? 0.03;
    const lotteryPool = state.lotteryPool != null ? state.lotteryPool : (GAME_CONFIG.CARNIVAL?.LOTTERY?.SEED_POOL_ADA || 12000000);
    const amortiPool = state.lotteryAmortiPool || 0;
    const myTickets = state.lotteryTickets || 0;
    const lotteryWinnerMultiplier = GAME_CONFIG.CARNIVAL?.LOTTERY?.WINNER_MULTIPLIER || 2.0;
    const lotteryTicketPrice = this.getLotteryRules().ticketPrice;
    const lotteryWinnerShare = myTickets > 0 ? myTickets * lotteryTicketPrice * lotteryWinnerMultiplier : 2 * lotteryTicketPrice;
    const lotteryAmortiShare = Math.round(lotteryPool * (GAME_CONFIG.CARNIVAL?.LOTTERY?.AMORTI_SHARE ?? 0.02));
    const lotteryRolloverShare = Math.max(0, lotteryPool - lotteryAmortiShare);

    // Sadece Karnaval Çarkında Anında Yakılan Hammaddeler sayacı (genel oyundaki yakımlar hariç)
    const burnedResources = state.carnivalBurnedResources || zeroRes();
    const lifetimeBurnedAda = Math.round((treasury.state?.lifetimeBurned || 0) + (globalPool.state?.totalBurned || 0));

    const pools = [
      {
        id: 'dungeon',
        name: 'Zindan Ganimet Kasası',
        icon: '🏰',
        color: '#06b6d4',
        sharePct: Math.round((alloc.dungeon || 0) * (GAME_CONFIG.TOKEN_REWARD_POOL_RATE ?? 0.86) * 1000) / 10,
        balance: Math.round(treasury.getPool('dungeon')),
        target: GAME_CONFIG.TREASURY_TARGET_RESERVE?.dungeon || 10000000,
        health: treasury.getPoolHealth('dungeon'),
        inflow: Math.round(treasury.state?.inflow?.dungeon || 0),
        outflow: Math.round(treasury.state?.outflow?.dungeon || 0),
        description: '6 Katlı ve 18 Seviyeli kadim zindan canavarlarını ve kat bosslarını yenen gezginlere zafer ganimeti olarak dağıtılır.',
        howToEarn: 'Zindana gir, canavarları katlet ve kat bosslarını devir.',
        actionType: 'dungeon',
        actionText: '💀 Zindana Git'
      },
      {
        id: 'ammBuyback',
        name: 'AMM DEX Likidite & Buyback',
        icon: '🤖',
        color: '#38bdf8',
        sharePct: Math.round((alloc.ammBuyback || 0) * (GAME_CONFIG.TOKEN_REWARD_POOL_RATE ?? 0.86) * 1000) / 10,
        balance: Math.round(treasury.getPool('ammBuyback')),
        target: GAME_CONFIG.TREASURY_TARGET_RESERVE?.ammBuyback || 7200000,
        health: treasury.getPoolHealth('ammBuyback'),
        inflow: Math.round(treasury.state?.inflow?.ammBuyback || 0),
        outflow: Math.round(treasury.state?.outflow?.ammBuyback || 0),
        description: 'Piyasa dalgalanmalarında DEX fiyat tabanını korumak, arz fazlası tokenları geri alıp yakmak ve likiditeyi desteklemek için kullanılır.',
        howToEarn: 'AMM Pazarında işlem yapıldığında otomatik devreye girer.',
        actionType: 'market',
        actionText: '🏪 Markete Git'
      },
      {
        id: 'worldBoss',
        name: 'Dünya Bossu (World Boss) Akın Havuzu',
        icon: '🌋',
        color: '#ef4444',
        sharePct: Math.round((alloc.worldBoss || 0) * (GAME_CONFIG.TOKEN_REWARD_POOL_RATE ?? 0.86) * 1000) / 10,
        balance: Math.round(treasury.getPool('worldBoss')),
        target: GAME_CONFIG.TREASURY_TARGET_RESERVE?.worldBoss || 6000000,
        health: treasury.getPoolHealth('worldBoss'),
        inflow: Math.round(treasury.state?.inflow?.worldBoss || 0),
        outflow: Math.round(treasury.state?.outflow?.worldBoss || 0),
        description: 'Her Pazar 18:00 TSİ otomatik savaşında kilitlenen orduların Kadim Kıyamet Behemothuna verdiği hasar oranında dağıtılır.',
        howToEarn: 'Ordunu kışladan savaşa kilitle, Pazar 18:00 hasar payını kap.',
        actionType: 'boss',
        actionText: '🌋 Boss Karargahı'
      },
      {
        id: 'arena',
        name: 'Kolezyum Gladyatör Havuzu',
        icon: '🏟️',
        color: '#f59e0b',
        sharePct: Math.round((alloc.arena || 0) * (GAME_CONFIG.TOKEN_REWARD_POOL_RATE ?? 0.86) * 1000) / 10,
        balance: Math.round(treasury.getPool('arena')),
        target: GAME_CONFIG.TREASURY_TARGET_RESERVE?.arena || 4000000,
        health: treasury.getPoolHealth('arena'),
        inflow: Math.round(treasury.state?.inflow?.arena || 0),
        outflow: Math.round(treasury.state?.outflow?.arena || 0),
        description: 'Arena anahtarı kullanan şampiyonların 1v1 düelloları ve haftalık sıralama ödülleri bu fondan çekilir.',
        howToEarn: 'Arena anahtarı kuşan, Kolezyuma çık ve şampiyonları devir.',
        actionType: 'colosseum',
        actionText: '🏟️ Kolezyuma Git'
      },
      {
        id: 'carnival',
        name: 'Krallık Karnavalı & Şans Kasası',
        icon: '🎪',
        color: '#ec4899',
        sharePct: Math.round((alloc.carnival || 0) * (GAME_CONFIG.TOKEN_REWARD_POOL_RATE ?? 0.86) * 1000) / 10,
        balance: Math.round(treasury.getPool('carnival')),
        target: GAME_CONFIG.TREASURY_TARGET_RESERVE?.carnival || 4000000,
        health: treasury.getPoolHealth('carnival'),
        inflow: Math.round(treasury.state?.inflow?.carnival || 0),
        outflow: Math.round(treasury.state?.outflow?.carnival || 0),
        description: '15 potansiyel ödüllü Şans Çarkındaki doğrudan token ödüllerinin emisyon kasasıdır.',
        howToEarn: `Karnavalda ${this.getWheelCostAda()} ASTRA, hammadde veya biletle şans çarkını çevir.`,
        actionType: 'carnival_wheel',
        actionText: '🎡 Şans Çarkı'
      },
      {
        id: 'quest',
        name: 'Görev & Ücretsiz Oyuncu Kasası',
        icon: '📜',
        color: '#22c55e',
        sharePct: Math.round((alloc.quest || 0) * (GAME_CONFIG.TOKEN_REWARD_POOL_RATE ?? 0.86) * 1000) / 10,
        balance: Math.round(treasury.getPool('quest')),
        target: GAME_CONFIG.TREASURY_TARGET_RESERVE?.quest || 8000000,
        health: treasury.getPoolHealth('quest'),
        inflow: Math.round(treasury.state?.inflow?.quest || 0),
        outflow: Math.round(treasury.state?.outflow?.quest || 0),
        description: 'Görev ödülleri bu kasadan ödenir. Sunucu aşamasında ücretsiz oyunculara her ay piyasa değerinin %1\'i (kişi başı en fazla 100$) de buradan dağıtılacak.',
        howToEarn: 'Başlangıç görevlerini tamamla ve ödülünü al.',
        actionType: 'quests',
        actionText: '📜 Görevler'
      }
    ];

    // v2: yeni kasalar (Fatih, Sirius Konseyi, Universe rezervi) da listede
    const EXTRA_POOL_META = {
      fatih: { icon: '👑', color: '#f59e0b', description: '18. kat bossunu ilk kez yenen oyuncuya Fatih Ödülü bu kasadan ödenir (ordu harcamalarının bir payıyla dolar).', howToEarn: 'Zindanın 18. katındaki bossu yen.', actionType: 'dungeon', actionText: '💀 Zindana Git' },
      konsey: { icon: '🏛️', color: '#a78bfa', description: 'Sirius Konseyi kasası: Madencilik Otoritesi\'nin çelik payı, Konsey projeleri ve Universe açılış günü ödülleri buradan.', howToEarn: 'Otorite ve Konsey projelerine katkı yap.', actionType: 'council', actionText: '🏛️ Konsey' },
      universe: { icon: '🚀', color: '#38bdf8', description: 'Universe Tohum Rezervi: Realm bu kasaya dokunamaz; Universe açılınca Galaksi Pazarı ve Hazırlık Deposu için kullanılır.', howToEarn: 'Kilitli — Universe açılışına kadar.', actionType: 'spaceport', actionText: '🚀 Uzay Limanı' }
    };
    const listed = new Set(pools.map(p => p.id));
    for (const id of Object.keys(GAME_CONFIG.TREASURY_SEED || {})) {
      if (listed.has(id)) continue;
      const m = EXTRA_POOL_META[id] || {};
      pools.push({
        id,
        name: (GAME_CONFIG.TREASURY_POOL_NAMES || {})[id] || id,
        icon: m.icon || '🏦',
        color: m.color || '#94a3b8',
        sharePct: Math.round((alloc[id] || 0) * (GAME_CONFIG.TOKEN_REWARD_POOL_RATE ?? 0.86) * 1000) / 10,
        balance: Math.round(treasury.getPool(id)),
        target: GAME_CONFIG.TREASURY_TARGET_RESERVE?.[id] || 0,
        health: treasury.getPoolHealth(id),
        inflow: Math.round(treasury.state?.inflow?.[id] || 0),
        outflow: Math.round(treasury.state?.outflow?.[id] || 0),
        description: m.description || '',
        howToEarn: m.howToEarn || '',
        actionType: m.actionType || null,
        actionText: m.actionText || '',
        locked: (GAME_CONFIG.TREASURY_LOCKED_POOLS || []).includes(id)
      });
    }
    const totalPoolsBalance = pools.reduce((acc, p) => acc + p.balance, 0) + lotteryPool;

    return {
      burnRatePct: Math.round(burnRate * 100),
      ubiRatePct: Math.round(ubiRate * 100),
      creatorRatePct: Math.round(creatorRate * 100),
      treasuryRatePct: Math.round((GAME_CONFIG.TOKEN_REWARD_POOL_RATE ?? 0.86) * 100),
      allocations: alloc,
      pools,
      totalPoolsBalance,
      lifetimeBurnedAda,
      burnedResources,
      ammBurnedResources: (typeof ammMarket !== 'undefined' && ammMarket.getBurnedResources)
        ? ammMarket.getBurnedResources()
        : zeroRes(),
      lottery: {
        lotteryPool,
        amortiPool,
        winnerShare: lotteryWinnerShare,
        amortiShare: lotteryAmortiShare,
        rolloverShare: lotteryRolloverShare
      },
      solvencyPct: Math.round((summary.solvency || 1) * 100),
      totalDeposited: Math.round(treasury.state?.lifetimeDeposited || 0),
      totalWithdrawn: Math.round(treasury.state?.lifetimeWithdrawn || 0)
    };
  },

  // 🛡️ AMM DEX Otonom Buyback & Yakım Operasyonu
  // v2 (kurumsal E-planı S2 düzeltmesi, 8 Ekim 2026): oran artık tek kaynaktan (GAME_CONFIG.AMM_BUYBACK.WEEKLY_RATE,
  // %3) okunur; eskiden burada gömülü %15 vardı ve docs/v2/KARARLAR_KESIN.md'deki "haftada %3" kararından sapıyordu.
  executeAmmTreasuryBuyback(cycleBudgetCap = (GAME_CONFIG.AMM_BUYBACK?.WEEKLY_RATE ?? 0.03)) {
    if (typeof ammMarket !== 'undefined' && typeof ammMarket.executeAutonomousBuyback === 'function') {
      const res = ammMarket.executeAutonomousBuyback(cycleBudgetCap);
      this.saveState();
      return res;
    }
    return { success: false, message: 'AMM Market motoru bulunamadı.' };
  },

  // 🔄 Haftalık Otonom Buyback & Yakım Kontrolü (haftada 1 kez çalışır; ISO hafta anahtarıyla)
  // v2 düzeltmesi: eskiden "Gün Sonu" diye HER GÜN çalışıyordu (günde %15 = kararın ~35 katı hızında kasa eritiyordu).
  checkWeeklyAutonomousBuyback(forcedNow = null) {
    const now = forcedNow || this._calendarNow();
    const weekKey = isoWeekKey(now);
    if (!this.state.lastAmmBuybackWeek) {
      this.state.lastAmmBuybackWeek = weekKey;
      return { executed: false, reason: 'initial_marker' };
    }
    if (this.state.lastAmmBuybackWeek !== weekKey) {
      this.state.lastAmmBuybackWeek = weekKey;
      const res = this.executeAmmTreasuryBuyback();
      if (res && res.executed) {
        console.log(`[AMM Buyback] Haftalık otonom buyback çalıştırıldı (${weekKey}):`, res);
      }
      return { executed: true, result: res, week: weekKey };
    }
    return { executed: false, reason: 'already_run_this_week' };
  },

  getAmmBuybackAnalysis(cycleBudgetCap = (GAME_CONFIG.AMM_BUYBACK?.WEEKLY_RATE ?? 0.03)) {
    if (typeof ammMarket !== 'undefined' && typeof ammMarket.getBuybackAnalysis === 'function') {
      return ammMarket.getBuybackAnalysis(cycleBudgetCap);
    }
    return null;
  },
};
