// Realm of AdAstra — GameStateManager yöntemleri: toplu işlemler (seferleri topla ve yeniden başlat, hepsini onar,
// hepsini iyileştir, otomatik kuşanma) ve zindan savaş kurulumu / kazanma şansı tahmini.
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { GAME_CONFIG } from '../config.js';
import { createUnit, predictBattle, DEFAULT_BOSS_PHASES } from '../combat.js';
import { getDungeonEntry } from '../bestiary.js';
import { RES_KEYS, kaynakAdi } from './ortak.js';

const YUVALAR = ['weapon', 'helmet', 'armor', 'legs', 'boots'];

export const topluYontemleri = {
  // Biten seferleri toplar, bitmeyenin o ana kadarki hasadını alır, kırık aleti onarır, boştaki alanlara yeni sefer başlatır
  claimAndRestartAllExpeditions() {
    const sonuc = { claimed: 0, partialClaimed: 0, restarted: 0, totalHarvest: 0, messages: [] };

    for (const alan of Object.keys(this.state.activeExpeditions || {})) {
      const sefer = this.state.activeExpeditions[alan];
      if (!sefer) continue;
      const bitmisti = !!sefer.isCompleted;
      const r = bitmisti ? this.claimExpedition(alan) : this.claimPartialExpedition(alan);
      if (r.success) {
        if (bitmisti) sonuc.claimed++; else sonuc.partialClaimed++;
        sonuc.totalHarvest += r.amount || 0;
      } else if (r.isWarehouseFull) {
        sonuc.messages.push(r.message);
      }
    }

    // Kırık alet seferin başlamasını engellerdi (örn. orak ile buğday): otomatik onarılır
    for (const alan of RES_KEYS()) {
      const aletKimligi = (GAME_CONFIG.GLOBAL_RESOURCE_CAPS[alan] || {}).requiredTool;
      const alet = aletKimligi && this.state.tools ? this.state.tools[aletKimligi] : null;
      if (alet && alet.durability <= 0) this.repairTool(aletKimligi);
    }

    const staminasizAlanlar = [];
    for (const alan of RES_KEYS()) {
      if (this.state.activeExpeditions[alan]) continue;
      const r = this.startExpedition(alan);
      if (r.success) {
        sonuc.restarted++;
        continue;
      }
      if (r.isInsufficientStamina) staminasizAlanlar.push(kaynakAdi(alan) || alan);
      if (r.message) sonuc.messages.push(r.message);
    }
    if (staminasizAlanlar.length > 0) {
      sonuc.staminaWarning = `⚠️ ${staminasizAlanlar.join(', ')} seferini başlatmak için yeteri kadar staminanız bulunmamaktadır.`;
    }
    return sonuc;
  },

  repairAllTools() {
    const sonuc = { repaired: 0, totalWood: 0, totalIron: 0, totalWheat: 0, totalAda: 0, messages: [], hasDamagedTools: false, missingAda: false };
    for (const aletKimligi of Object.keys(this.state.tools || {})) {
      const bedel = this.calculateRepairCost(aletKimligi);
      if (!bedel || !(bedel.missingDurability > 0)) continue;
      sonuc.hasDamagedTools = true;
      if ((this.state.adAstraBalance || 0) < bedel.adAstraCost) sonuc.missingAda = true;
      const r = this.repairTool(aletKimligi);
      if (r.success) {
        sonuc.repaired++;
        sonuc.totalWood += bedel.woodCost;
        sonuc.totalIron += bedel.ironCost;
        sonuc.totalWheat += bedel.wheatCost;
        sonuc.totalAda += bedel.adAstraCost;
      } else {
        sonuc.messages.push(r.message);
      }
    }
    sonuc.success = sonuc.repaired > 0;
    if (sonuc.success) {
      sonuc.message = `🔨 ${sonuc.repaired} Adet Alet Başarıyla Onarıldı! (-${sonuc.totalWood} Odun, -${sonuc.totalIron} Demir, -${sonuc.totalAda} ASTRA)`;
    } else if (sonuc.hasDamagedTools && sonuc.missingAda) {
      sonuc.message = '⚠️ Hesapta yeteri kadar ASTRA yok!';
    } else if (sonuc.messages.length > 0) {
      sonuc.message = sonuc.messages[0];
    } else {
      sonuc.message = 'Tamir edilecek alet yok (Tüm aletler tam sağlam).';
    }
    return sonuc;
  },

  getAllRepairCost() {
    const toplam = { totalWood: 0, totalIron: 0, totalWheat: 0, totalAda: 0, count: 0 };
    for (const aletKimligi of Object.keys(this.state.tools || {})) {
      const bedel = this.calculateRepairCost(aletKimligi);
      if (!bedel || !(bedel.missingDurability > 0)) continue;
      toplam.totalWood += bedel.woodCost;
      toplam.totalIron += bedel.ironCost;
      toplam.totalWheat += bedel.wheatCost;
      toplam.totalAda += bedel.adAstraCost;
      toplam.count++;
    }
    return toplam;
  },

  // Bütün yaralıları şifalı otla iyileştirmenin toplam bedeli (healAllWithHerb ile aynı hesap): ot, ASTRA ve yaralı sayısı
  getAllHealCost() {
    // passiveHerbs / passiveAda / passiveSeconds: aynı yaralıların KENDİLİĞİNDEN iyileşmesinin bedeli (şifalı ot + ASTRA) ve en uzun süresi
    const toplam = { totalHerbs: 0, totalAda: 0, count: 0, passiveHerbs: 0, passiveAda: 0, passiveSeconds: 0 };
    const sayi = (this.state.soldierUnits || []).length;
    for (let i = 0; i < sayi; i++) {
      const bilgi = this.getHerbHealInfo(i);
      if (!bilgi || !(bilgi.missingHp > 0)) continue;
      toplam.totalHerbs += bilgi.herbsNeeded;
      toplam.totalAda += bilgi.herbAdaCost;
      toplam.passiveHerbs += bilgi.passiveHerbNeeded;
      toplam.passiveAda += bilgi.passiveAdaCost;
      toplam.passiveSeconds = Math.max(toplam.passiveSeconds, bilgi.secondsRemaining || 0);
      toplam.count++;
    }
    toplam.totalAda = Math.round(toplam.totalAda * 1000) / 1000;
    toplam.passiveAda = Math.round(toplam.passiveAda * 1000) / 1000;
    toplam.passiveHerbs = Math.round(toplam.passiveHerbs * 100) / 100;
    return toplam;
  },

  // ── Cephanelik ──────────────────────────────────────────────────────────
  // Boş yuvalara krallık yuvasındaki ve cephanelikteki en yüksek seviyeli (eşitse en sağlam) eşyayı takar
  autoEquipBest() {
    const askerler = this.state.soldierUnits || [];
    let takilan = 0;
    if (!Array.isArray(this.state.armoryInventory)) this.state.armoryInventory = [];

    for (const asker of askerler) {
      for (const yuva of YUVALAR) {
        if (!asker.equipment) asker.equipment = {};
        if (asker.equipment[yuva]) continue;

        const adaylar = [];
        if (this.state.equipment && this.state.equipment[yuva]) adaylar.push({ item: this.state.equipment[yuva], kaynak: 'kingdom' });
        this.state.armoryInventory.forEach((e) => { if (e && e.slot === yuva) adaylar.push({ item: e, kaynak: 'armory' }); });
        if (adaylar.length === 0) continue;

        adaylar.sort((a, b) => ((b.item.level || 1) - (a.item.level || 1)) || ((b.item.durability || 0) - (a.item.durability || 0)));
        const secilen = adaylar[0];
        if (secilen.kaynak === 'kingdom') {
          delete this.state.equipment[yuva];
        } else {
          const sira = this.state.armoryInventory.indexOf(secilen.item);
          if (sira !== -1) this.state.armoryInventory.splice(sira, 1);
        }
        asker.equipment[yuva] = secilen.item;
        takilan++;
      }
    }
    if (takilan > 0) this.saveState();
    return {
      success: takilan > 0,
      equipped: takilan,
      message: takilan > 0
        ? `⚔️ ${takilan} parça teçhizat otomatik olarak orduna dağıtıldı!`
        : 'Dağıtılacak boşta teçhizat veya boş asker yuvası bulunamadı.'
    };
  },

  // Askerlerin üstündeki bütün eşyaları cephanelik deposuna toplar
  unequipAllSoldiers() {
    let sokulen = 0;
    if (!Array.isArray(this.state.armoryInventory)) this.state.armoryInventory = [];
    for (const asker of (this.state.soldierUnits || [])) {
      for (const yuva of YUVALAR) {
        if (!(asker.equipment && asker.equipment[yuva])) continue;
        this.state.armoryInventory.push(asker.equipment[yuva]);
        asker.equipment[yuva] = null;
        sokulen++;
      }
    }
    if (sokulen > 0) this.saveState();
    return {
      success: sokulen > 0,
      unequipped: sokulen,
      message: sokulen > 0
        ? `🔄 ${sokulen} parça eşya askerlerden sökülüp Cephanelik Deposu'na aktarıldı!`
        : 'Sökülecek eşya bulunamadı.'
    };
  },

  // ── Zindan savaşı kurulumu ──────────────────────────────────────────────
  // Hem tahmin hem gerçek savaş aynı kurulumu kullanır (tek motor: combat.js)
  buildDungeonBattleUnits(monster, selectedSoldierIndices, monsterHp = null) {
    const askerler = this.state.soldierUnits || [];
    const muttefikler = (selectedSoldierIndices || []).filter(idx => askerler[idx]).map((idx, i) => {
      const istat = this.getSoldierFullStats(idx) || { totalAtk: 25, totalMaxHp: 100 };
      const asker = askerler[idx];
      return createUnit({
        uid: 'a' + i,
        sourceIndex: idx,
        name: asker.name,
        icon: asker.icon || '⚔️',
        level: asker.level || 1,
        maxHp: istat.totalMaxHp,
        hp: this.getSoldierBattleStart(idx).hp,   // kayıtlı can oranı toplam cana uygulanır (ordu.js getSoldierBattleStart)
        atk: istat.totalAtk,
        skills: Array.isArray(asker.skills) && asker.skills.length ? asker.skills : ['shieldWall', 'armorBreaker'],
        row: asker.row === 'back' ? 'back' : 'front',
        side: 'ally'
      });
    });

    const boss = !!(monster.isBoss || monster.level === 9 || monster.level === 18);
    const kayit = getDungeonEntry(monster.level);
    const yetenekler = kayit && Array.isArray(kayit.abilities) && kayit.abilities.length
      ? kayit.abilities
      : (boss ? ['cleave', 'terrify'] : null);
    const can = monsterHp != null ? monsterHp : this.getMonsterCurrentHp(monster.level, monster.hp);
    const dusman = createUnit({
      uid: 'e0',
      name: monster.name,
      icon: monster.icon || '💀',
      level: monster.level,
      maxHp: monster.hp,
      hp: Math.max(1, Math.min(monster.hp, can)),
      atk: monster.atk,
      abilities: yetenekler,
      abilityCooldown: boss ? 2 : 3,
      row: 'front',
      side: 'enemy'
    });
    return { allies: muttefikler, enemies: [dusman], bossPhases: DEFAULT_BOSS_PHASES[monster.level] || null, isBoss: boss };
  },

  // Gerçek savaş motoruyla (combat.js) Monte Carlo kazanma şansı
  predictDungeonBattle(monster, selectedSoldierIndices, samples = 100) {
    if (!selectedSoldierIndices || selectedSoldierIndices.length === 0) {
      return { winChance: 0, difficulty: 'İmkansız', avgRounds: 0, avgCasualties: 0, samples: 0 };
    }
    const kurulum = this.buildDungeonBattleUnits(monster, selectedSoldierIndices);
    return predictBattle(
      () => this.buildDungeonBattleUnits(monster, selectedSoldierIndices).allies,
      () => this.buildDungeonBattleUnits(monster, selectedSoldierIndices).enemies,
      samples,
      { bossPhases: kurulum.bossPhases }
    );
  },

  // Bot çalışırken ön koşulları (alet onarımı için ASTRA ve hammadde) sağlanmadığı için duraklamışsa bildirim merkezi uyarısı
  getBotResourceDeficitWarning() {
    const bitis = Math.max(
      this.state.botActiveUntil || 0,
      this.state.tavernaBotExpiresAt || 0,
      this.state.activeBuffs?.auto_collector?.expiresAt || 0
    );
    const botVar = (bitis > Date.now()) || (this.state.botPaused && (this.state.botPausedRemainingMs || 0) > 0);
    if (!botVar) return null;

    const onKosul = this.checkBotPrerequisites();
    if (onKosul.isMet) return null;
    return {
      type: 'warning',
      icon: '⏸️',
      title: '24s Otomasyon Botu Duraklatıldı (Süreniz Donduruldu)',
      text: `Botun aletleri onarabilmesi ve seferleri aksatmaması için deponuzda en az ${GAME_CONFIG.TAVERNA_BOT.REQUIRED_PREREQUISITES.iron} Demir, ${GAME_CONFIG.TAVERNA_BOT.REQUIRED_PREREQUISITES.wood} Odun, ${GAME_CONFIG.TAVERNA_BOT.REQUIRED_PREREQUISITES.wheat} Buğday ve ${GAME_CONFIG.TAVERNA_BOT.REQUIRED_PREREQUISITES.adAstra} ASTRA bulunmalıdır. Süreniz dondurulmuştur ve asla azalmaz! (Eksikler: ${onKosul.missingText}) — Kaynakları tamamladığınız an bot anında otomatik çalışmaya devam edecektir.`,
      missing: onKosul.missing
    };
  }
};
