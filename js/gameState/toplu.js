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
    const sonuc = { claimed: 0, partialClaimed: 0, restarted: 0, totalHarvest: 0, messages: [], hakBekleyen: [] };

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
      } else if (r.isQuotaWait && bitmisti) {
        // Üretim Hakkı doldu: sefer bitmiş ama mahsul izin bekliyor (19 Ekim 2026: eskiden sessizce toplanmıyordu, oyuncu nedenini anlamıyordu)
        const hak = this.getUretimHakki(alan);
        sonuc.hakBekleyen.push({ ad: kaynakAdi(alan) || alan, bekleyen: r.remainingToClaim || 0, bekle: this._fmtWait((hak.nextReleaseAt || 0) - this._now()) });
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
    const muttefikler = (selectedSoldierIndices || []).filter(idx => askerler[idx] && !this.isSoldierFallen(idx)).map((idx, i) => {
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

  // ── Otomatik dizilim (20 Ekim 2026) ──────────────────────────────────────────────────────────────────────────────────
  // Seçili askerlerin ön/arka saf dağılımını savaş motoruyla (combat.js) dener ve o canavara karşı en iyi sonucu vereni bulur. Her aday AYNI rastgele
  // tohumlarla ölçülür (aralarındaki fark şanstan değil dizilimden gelir); önce kazanma şansı, eşitse daha az kayıp. Asker sayısı en çok 8 ise bütün
  // dizilimler denenir (2^8 = 256); daha çoğunda birkaç başlangıçtan tek tek asker çevirerek iyileştirilir (zaman sınırlı). Askerin eşyası, canı, atağı
  // ve yetenekleri savaş kurulumundan (buildDungeonBattleUnits) geldiği için hesaba kendiliğinden girer.
  _dizilimDegerle(monster, secili, rows, samples, seedBase) {
    const kur = () => {
      const k = this.buildDungeonBattleUnits(monster, secili);
      for (const u of k.allies) u.row = rows[u.sourceIndex] === 'back' ? 'back' : 'front';
      return k;
    };
    const ilk = kur();
    const r = predictBattle(() => kur().allies, () => kur().enemies, samples, { seedBase, bossPhases: ilk.bossPhases });
    return { rows, r, puan: r.winChance * 1000 - (Number(r.avgCasualties) || 0) };
  },

  findBestFormation(monster, selectedIndices, { samples = 30, kesinSamples = 120, sureMs = 1500 } = {}) {
    const askerler = this.state.soldierUnits || [];
    const sira = [...new Set((selectedIndices || []).map(Number))].filter((i) => askerler[i] && !this.isSoldierFallen(i));
    if (!sira.length) return null;
    const seedBase = 0x5eed2026;
    const mevcut = Object.fromEntries(sira.map((i) => [i, askerler[i].row === 'back' ? 'back' : 'front']));
    const baslangic = Date.now();
    const adaylar = new Map();   // anahtar → { rows, puan }
    const anahtarOf = (rows) => sira.map((i) => (rows[i] === 'back' ? 'b' : 'f')).join('');
    const dene = (rows) => {
      const k = anahtarOf(rows);
      if (!adaylar.has(k)) adaylar.set(k, this._dizilimDegerle(monster, sira, rows, samples, seedBase));
      return adaylar.get(k);
    };

    if (sira.length <= 8) {
      for (let mask = 0; mask < (1 << sira.length); mask++) {
        const rows = {};
        sira.forEach((idx, bit) => { rows[idx] = (mask >> bit) & 1 ? 'back' : 'front'; });
        dene(rows);
      }
    } else {
      // Başlangıçlar: şimdiki dizilim, hepsi önde, en dayanıklı yarısı önde. Sonra tek tek asker çevirerek iyileştirme
      const guc = (i) => (this.getSoldierFullStats(i) || {}).totalMaxHp || 0;
      const dayanikliSirasi = [...sira].sort((x, y) => guc(y) - guc(x));
      const yarim = Object.fromEntries(dayanikliSirasi.map((idx, n) => [idx, n < Math.ceil(sira.length / 2) ? 'front' : 'back']));
      const hepsiOn = Object.fromEntries(sira.map((idx) => [idx, 'front']));
      let en = null;
      for (const baslat of [mevcut, yarim, hepsiOn]) {
        let simdiki = dene({ ...baslat });
        for (let gecis = 0; gecis < 3; gecis++) {
          let iyilesti = false;
          for (const idx of sira) {
            if (Date.now() - baslangic > sureMs) break;
            const rows = { ...simdiki.rows, [idx]: simdiki.rows[idx] === 'back' ? 'front' : 'back' };
            const aday = dene(rows);
            if (aday.puan > simdiki.puan) { simdiki = aday; iyilesti = true; }
          }
          if (!iyilesti || Date.now() - baslangic > sureMs) break;
        }
        if (!en || simdiki.puan > en.puan) en = simdiki;
      }
    }

    // En iyi birkaç aday (ve şimdiki dizilim) daha çok örnekle yeniden ölçülür: az örneğin şansı kazanan seçilmesin
    const liste = [...adaylar.values()].sort((x, y) => y.puan - x.puan).slice(0, 5).map((a) => a.rows);
    const kesinler = new Map();
    for (const rows of [...liste, mevcut]) {
      const k = anahtarOf(rows);
      if (!kesinler.has(k)) kesinler.set(k, this._dizilimDegerle(monster, sira, rows, kesinSamples, seedBase));
    }
    const siralanmis = [...kesinler.values()].sort((x, y) => y.puan - x.puan);
    const enIyi = siralanmis[0];
    const onceki = kesinler.get(anahtarOf(mevcut));
    // Şimdiki dizilim en iyiyle eşitse (aynı şans, aynı kayıp) değiştirilmez: oyuncunun elle verdiği dizilim korunur
    const secilen = onceki && onceki.puan >= enIyi.puan ? onceki : enIyi;
    const degisen = sira.filter((i) => secilen.rows[i] !== mevcut[i]);
    return {
      rows: secilen.rows,
      on: sira.filter((i) => secilen.rows[i] === 'front').length,
      arka: sira.filter((i) => secilen.rows[i] === 'back').length,
      winChance: secilen.r.winChance,
      oncekiSans: onceki ? onceki.r.winChance : null,
      degisen,
      denenen: adaylar.size,
      sureMs: Date.now() - baslangic
    };
  },

  // En iyi dizilimi bulup askerlere uygular (yalnız değişen askerler yazılır). Döndürür: findBestFormation sonucu + { uygulandi }
  autoArrangeFormation(monster, selectedIndices, secenek = {}) {
    const sonuc = this.findBestFormation(monster, selectedIndices, secenek);
    if (!sonuc) return null;
    for (const idx of sonuc.degisen) this.setSoldierRow(idx, sonuc.rows[idx]);
    return { ...sonuc, uygulandi: sonuc.degisen.length };
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
