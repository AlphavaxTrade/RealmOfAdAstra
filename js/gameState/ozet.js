// Realm of AdAstra — GameStateManager yöntemleri: Krallık / ekonomi / hazine özetleri, AMM geri alım
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { ammMarket } from '../ammMarket.js';
import { treasury } from '../treasury.js';
import { zeroRes } from './ortak.js';

export const ozetYontemleri = {
  // =========================================================================
  // DASHBOARD: KRALIK GENEL BAKIŞ & TOPLU EYLEMLER
  // =========================================================================
  getRealmSummary() {
    const state = this.state;
    const tools = state.tools || {};
    const soldiers = state.soldierUnits || [];
    const exps = state.activeExpeditions || {};

    // Aktif Seferler
    const activeExps = Object.keys(exps).map(nodeId => {
      const exp = exps[nodeId];
      const info = this.getAccruedExpeditionHarvest(nodeId);
      const nodeConfig = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId];
      return { nodeId, name: nodeConfig?.name || nodeId, icon: nodeConfig?.icon || '📦', ...info, isCompleted: exp.isCompleted };
    });
    const completedExps = activeExps.filter(e => e.isCompleted);

    // Alet Sağlığı (72 Saat = 4320 Dakika)
    const toolSummary = Object.keys(tools).map(toolId => {
      const t = tools[toolId];
      const cfg = GAME_CONFIG.TOOLS[toolId];
      const maxDur = cfg?.maxDurability || 4320;
      const curDur = Math.max(0, Math.min(maxDur, t.durability != null ? t.durability : maxDur));
      const pct = Math.min(100, Math.max(0, Math.round((curDur / maxDur) * 100)));
      return { id: toolId, name: cfg?.name || toolId, durability: curDur, maxDurability: maxDur, pct, icon: cfg?.icon || '🔧' };
    });
    const avgToolHealth = toolSummary.length > 0 ? Math.round(toolSummary.reduce((s, t) => s + t.pct, 0) / toolSummary.length) : 100;

    // Ordu Durumu
    const totalAtk = soldiers.reduce((s, sol, i) => s + (this.getSoldierFullStats(i)?.totalAtk || 20), 0);
    const totalHp = soldiers.reduce((s, sol, i) => s + (this.getSoldierFullStats(i)?.totalMaxHp || 100), 0);
    const woundedCount = soldiers.filter(s => (s.hp || 0) < (s.maxHp || 100)).length;
    const avgHpPct = soldiers.length > 0 ? Math.round(soldiers.reduce((s, sol) => s + ((sol.hp || 0) / (sol.maxHp || 100)) * 100, 0) / soldiers.length) : 100;

    // Depo
    const inv = state.inventory || {};
    const whCap = this.getWarehouseCapacity();

    return {
      level: state.level, xp: state.currentXp, ada: state.adAstraBalance,
      stamina: state.stamina, maxStamina: this.getMaxStamina(),
      activeExps, completedExps,
      toolSummary, avgToolHealth,
      soldierCount: soldiers.length, totalAtk, totalHp, woundedCount, avgHpPct,
      inventory: inv, warehouseCapacity: whCap,
      woodPct: Math.min(100, Math.round(((inv.wood || 0) / (whCap.wood || 1080)) * 100)),
      ironPct: Math.min(100, Math.round(((inv.iron || 0) / (whCap.iron || 720)) * 100)),
      wheatPct: Math.min(100, Math.round(((inv.wheat || 0) / (whCap.wheat || 900)) * 100)),
    };
  },

  // =========================================================================
  // 🏛️ KRALLIK HAZİNESİ, TOKENOMİCS VE TÜM HAVUZLARIN DETAYLI ÖZETİ
  // =========================================================================
  getEconomyAndPoolsSummary() {
    const summary = treasury.getSummary();
    const state = this.state;
    const boss = this.getWorldBossInfo();

    // Kasa payları hazine girişinin yüzdesidir (toplam 1); sharePct = hazine payı içindeki yüzde
    const alloc = GAME_CONFIG.TREASURY_ALLOCATION;

    const burnRate = GAME_CONFIG.TOKEN_BURN_RATE ?? 0.05;
    const ubiRate = GAME_CONFIG.UBI_POOL_RATE ?? 0.06;
    const creatorRate = GAME_CONFIG.CREATOR_ROYALTY_RATE ?? 0.03;
    const lotteryPool = state.lotteryPool != null ? state.lotteryPool : (GAME_CONFIG.CARNIVAL?.LOTTERY?.SEED_POOL_ADA || 20000000);
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
        howToEarn: 'Karnavalda 100 ASTRA, hammadde veya biletle şans çarkını çevir.',
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

  // =========================================================================
  // 🏦 KRALLIK HAZİNESİ & ÖDÜL HAVUZLARI (TREASURY VAULT SUMMARY)
  // =========================================================================
  getTreasuryVaultSummary() {
    const state = this.state;
    const boss = this.getWorldBossInfo();
    const colosseum = state.colosseumStats || { wins: 0, losses: 0, totalAdaWon: 0 };
    
    // 1. Ödül Havuzları (Gerçek Hazine Kasaları, UBI ve AMM Likidite Değerleri)
    const worldBossPool = (typeof treasury !== 'undefined' && treasury.getPool) ? Math.round(treasury.getPool('worldBoss')) : (boss.weeklyAdaPool || 8000000);
    const colosseumPool = (typeof treasury !== 'undefined' && treasury.getPool) ? Math.round(treasury.getPool('arena')) : 8000000;
    const dungeonLootVault = (typeof treasury !== 'undefined' && treasury.getPool) ? Math.round(treasury.getPool('dungeon')) : 14000000;
    const carnivalPool = (typeof treasury !== 'undefined' && treasury.getPool) ? Math.round(treasury.getPool('carnival')) : 4000000;
    const ammBuybackPool = (typeof treasury !== 'undefined' && treasury.getPool) ? Math.round(treasury.getPool('ammBuyback')) : 6000000;
    const parliamentStakingPool = (typeof treasury !== 'undefined' && treasury.getPool) ? Math.round(treasury.getPool('season')) : 6000000;
    const ubiPool = (typeof globalPool !== 'undefined' && globalPool.state && globalPool.state.ubiPool)
      ? Math.round(globalPool.state.ubiPool)
      : ((GAME_CONFIG.UBI_CONFIG && GAME_CONFIG.UBI_CONFIG.INITIAL_SEED_POOL) || 2400000);
    const burnedNftPool = 42500 + ((state.genesisNftMinted ? 1 : 0) * 18000);
    const totalAmmLiquidityAda = (typeof ammMarket !== 'undefined' && ammMarket.getTotalAdAstraLiquidity) ? ammMarket.getTotalAdAstraLiquidity() : 40000000;
    const lotteryPoolAda = Math.round(state.lotteryPool || 20000000);
    const questPool = (typeof treasury !== 'undefined' && treasury.getPool) ? Math.round(treasury.getPool('quest')) : 8000000;

    const totalVaultAda = worldBossPool + colosseumPool + dungeonLootVault + carnivalPool + ammBuybackPool + parliamentStakingPool + ubiPool + questPool + totalAmmLiquidityAda;

    // 2. Kullanıcının Hak Edişleri & Payları
    const userBossDamage = boss.userDamage || 0;
    const maxBossHp = boss.maxBossHp || GAME_CONFIG.WORLD_BOSS.BASE_HP;
    const userBossRewardEstimate = Math.floor((userBossDamage / maxBossHp) * worldBossPool);

    const userStakedArmyCount = boss.userStakedSoldiersCount || 0;
    const userStakedAtk = boss.userStakedAtk || 0;

    return {
      totalVaultAda,
      totalAmmLiquidityAda,
      burnedNftPool,
      pools: [
        {
          id: 'world_boss',
          name: 'Haftalık World Boss Ödül Havuzu',
          icon: '🌋',
          color: '#ef4444',
          totalPoolAda: worldBossPool,
          description: 'Her Pazar 18:00\'de (TSİ) ordusunu kilitleyenlerin vurduğu hasara göre paylaşılır.',
          userShareText: userBossDamage > 0 ? `%${((userBossDamage / maxBossHp) * 100).toFixed(2)} Hasar Payı (~${userBossRewardEstimate.toLocaleString()} ASTRA)` : (userStakedArmyCount > 0 ? `${userStakedArmyCount} Asker Kilitli (${userStakedAtk} ATK)` : 'Ordu Kilitlenmedi'),
          userClaimableAda: 0,
          statusBadge: userStakedArmyCount > 0 ? '🛡️ Ordu Kilitli' : '⚠️ Katılmadın',
          actionType: 'boss',
          actionText: '🌋 Boss Savaşına Katıl'
        },
        {
          id: 'colosseum_arena',
          name: 'Kolezyum Gladyatör Şampiyonluk Havuzu',
          icon: '🏟️',
          color: '#f59e0b',
          totalPoolAda: colosseumPool,
          description: 'Arena anahtarı kullanan gladyatörlerin dövüşlerinden biriken haftalık zafer fonu.',
          userShareText: `${colosseum.wins || 0} Galibiyet • Kazanılan: ${(colosseum.totalAdaWon || 0).toLocaleString()} ASTRA`,
          userClaimableAda: 0,
          statusBadge: colosseum.wins > 0 ? '⚔️ Gladyatör' : 'Çaylak',
          actionType: 'colosseum',
          actionText: '🏟️ Arenaya Git'
        },
        {
          id: 'ubi_pool',
          name: 'Evrensel Temel Gelir (UBI) & Seviye Havuzu',
          icon: '🤝',
          color: '#d8b4fe',
          totalPoolAda: ubiPool,
          description: 'Tüm oyun ve silo harcamalarından %6 pay alan, her hafta Pazar gecesi 00:01\'de seviyenize göre dağıtılan pasif gelir fonu.',
          userShareText: `Mevcut Seviyeniz (Lv.${state.level || 1}) • Haftalık Hak: ${typeof globalPool !== 'undefined' ? globalPool.getUbiPoolInfo(state.level || 1).payout.toFixed(2) : '0.00'} ASTRA`,
          userClaimableAda: 0,
          statusBadge: '🏛️ UBI Payı (%6)',
          actionType: 'ubi',
          actionText: '🤝 UBI Kartını Aç'
        },
        {
          id: 'amm_buyback',
          name: 'AMM DEX Otonom Buyback & Yakım Kasası',
          icon: '🛡️',
          color: '#38bdf8',
          totalPoolAda: ammBuybackPool,
          description: 'Harcamalardan biriken hazine fonuyla her gün sonu piyasadan dipteki malzemeleri alıp kalıcı yakan stabilizasyon kasası.',
          userShareText: `Gün Sonu Alım Bütçesi: ~${Math.round(ammBuybackPool * 0.15).toLocaleString()} ASTRA`,
          userClaimableAda: 0,
          statusBadge: '🔄 Otonom Buyback',
          actionType: 'amm_buyback',
          actionText: '📊 Pazar & Buyback'
        },
        {
          id: 'parliament_staking',
          name: 'AdAstra Meclisi & Staking Getiri Havuzu',
          icon: '👑',
          color: '#a855f7',
          totalPoolAda: parliamentStakingPool,
          description: 'Topluluk meclisi oylamalarına katılan ve Arena bileti sahiplerine %18 payla dağıtılan staking havuzu.',
          userShareText: state.arenaKeys > 0 ? `${state.arenaKeys} Arena Bileti / 1:18 Oy Ağırlığı` : 'Bilet Yok (1:1 Standart Oy)',
          userClaimableAda: 0,
          statusBadge: '🏛️ Aktif Meclis',
          actionType: 'parliament',
          actionText: '🏛️ Meclis Oylaması'
        },
        {
          id: 'dungeon_loot',
          name: 'Zindan Kat & Boss Ganimet Kasası',
          icon: '🗺️',
          color: '#06b6d4',
          totalPoolAda: dungeonLootVault,
          description: '6 Katlı ve 18 Seviyeli kadim zindan canavarlarını yenen gezginlere tahsis edilen rezerv.',
          userShareText: `İlerleme: ${state.dungeonProgress || 1}. Seviye`,
          userClaimableAda: 0,
          statusBadge: `Kat ${Math.ceil((state.dungeonProgress || 1) / 3)}/6`,
          actionType: 'dungeon',
          actionText: '💀 Zindana Gir'
        },
        {
          id: 'carnival_events',
          name: 'Karnaval & Çark-ı Felek Şenlik Havuzu',
          icon: '🎪',
          color: '#ec4899',
          totalPoolAda: carnivalPool,
          description: 'Karnaval çarkı ve piyango oyunlarına tahsis edilen ödül kasası.',
          userShareText: `${state.lotteryTickets || 0} Piyango Bileti • ${state.wheelTicketShards || 0} Çark Parçası`,
          userClaimableAda: 0,
          statusBadge: '🎪 Aktif Şenlik',
          actionType: 'carnival',
          actionText: '🎪 Karnavala Git'
        },
        {
          id: 'quest_pool',
          name: 'Görev & Ücretsiz Oyuncu Kasası',
          icon: '📜',
          color: '#22c55e',
          totalPoolAda: questPool,
          description: 'Görev ödülleri bu kasadan ödenir. Sunucu aşamasında ücretsiz oyunculara her ay piyasa değerinin %1\'i (kişi başı en fazla 100$) de buradan dağıtılacak.',
          userShareText: `Katkı puanın (bu hafta): ${this.getContributionInfo().week.toLocaleString('tr-TR')}`,
          userClaimableAda: 0,
          statusBadge: '📜 Görevler',
          actionType: 'quests',
          actionText: '📜 Görevler'
        },
        {
          id: 'nft_burn',
          name: 'Deflasyonist NFT Yakım (Burn) Kasası',
          icon: '🔥',
          color: '#f97316',
          totalPoolAda: burnedNftPool,
          description: 'P2P Pazaryerindeki %18 indirimli alımlardan ve Genesis NFT üretiminden kalıcı yakılan ASTRA.',
          userShareText: `${(state.collectionArtifacts || []).filter(a => a.discovered).length}/18 Eser Keşfedildi`,
          userClaimableAda: 0,
          statusBadge: state.genesisNftMinted ? '💎 Genesis NFT Basıldı' : '🔥 Kalıcı Yakım',
          actionType: 'collection',
          actionText: '👑 Koleksiyon & NFT'
        }
      ]
    };
  },

  // 🛡️ AMM DEX Otonom Buyback & Yakım Operasyonu
  executeAmmTreasuryBuyback(cycleBudgetCap = 0.15) {
    if (typeof ammMarket !== 'undefined' && typeof ammMarket.executeAutonomousBuyback === 'function') {
      const res = ammMarket.executeAutonomousBuyback(cycleBudgetCap);
      this.saveState();
      return res;
    }
    return { success: false, message: 'AMM Market motoru bulunamadı.' };
  },

  // 🔄 Gün Sonu Otonom Buyback & Yakım Kontrolü (Günde 1 kez çalışır)
  checkDailyAutonomousBuyback(forcedToday = null) {
    const today = forcedToday || new Date(this._calendarNow()).toISOString().slice(0, 10);
    if (!this.state.lastAmmBuybackDate) {
      this.state.lastAmmBuybackDate = today;
      return { executed: false, reason: 'initial_marker' };
    }
    if (this.state.lastAmmBuybackDate !== today) {
      this.state.lastAmmBuybackDate = today;
      const res = this.executeAmmTreasuryBuyback(0.15);
      if (res && res.executed) {
        console.log(`[AMM Buyback] Gün sonu otonom buyback çalıştırıldı (${today}):`, res);
      }
      return { executed: true, result: res, date: today };
    }
    return { executed: false, reason: 'already_run_today' };
  },

  getAmmBuybackAnalysis(cycleBudgetCap = 0.15) {
    if (typeof ammMarket !== 'undefined' && typeof ammMarket.getBuybackAnalysis === 'function') {
      return ammMarket.getBuybackAnalysis(cycleBudgetCap);
    }
    return null;
  },
};
