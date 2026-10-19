// Realm of AdAstra — Savaşa hazırlık ekranı (zindan): düşman, giriş koşulları, ordu seçimi ve savaşın başlatılması.
// Kurallar js/gameState/zindan.js, sefer.js ve toplu.js içindedir; savaşın canlandırması canlı savaş arenasında oynanır.
import {
  ekranKaydet, kap, kart, katli, satir, cubukSatiri, dugme, uyari, not, bos, izgara, hucre, etiket,
  tam, astra, sayi, esc, ac
} from './cekirdek.js';
import { soldierPortrait } from '../art.js';
import { DEFAULT_BOSS_PHASES, PLAYER_SKILLS } from '../../combat.js';
import { getDungeonEntry } from '../../bestiary.js';
import { sonSavasiYaz } from '../zindan/son-savas.js';
import { kazancYazisi, odemeOnizlemeNotu, odemeSinirNotu } from '../kazanc-yazisi.js';

const TAKTIK_SIMGE = { 1: '🛡️', 2: '⚔️', 3: '🏹' };


const asBoss = (m) => !!(m.isBoss || m.level === 9 || m.level === 18);
const askerler = (b) => b.gameState.state.soldierUnits || [];
// Sunucu tek savaşa en çok 25 asker kabul eder (server/actions.js idxArr; Cehennem modunda asker hakkı 25'e çıkar); daha fazlası seçilirse işlem reddedilirdi
const EN_COK_ASKER = 25;

// Seçili asker sırası: var olmayanlar atılır, boşsa herkes seçilir
function seciliAskerler(b, secenek) {
  const n = askerler(b).length;
  let sec = (secenek.secili || []).filter((i) => i < n).slice(0, EN_COK_ASKER);
  if (!sec.length && n > 0 && !secenek.secimYapildi) sec = Array.from({ length: Math.min(n, EN_COK_ASKER) }, (_, i) => i);
  secenek.secili = sec;
  return sec;
}

function dusmanKarti(b, m, secili, terms) {
  const gs = b.gameState;
  const boss = asBoss(m);
  const taban = gs.getDungeonBaseReward(m.level, boss);
  const beklenenAstra = Math.min(taban.ada, terms.budgetLeft);
  const tahmin = gs.predictDungeonBattle(m, secili);
  const resim = m.avatar || (b.canavarResmi ? b.canavarResmi(m.level, m.name) : '');
  const stamina = Math.floor(gs.state.stamina || 0);
  const enFazla = gs.getMaxStamina();
  const askerBasi = gs.getDungeonStaminaCost(m.level, 1);
  const yeter = terms.staminaOk || secili.length === 0;
  const sans = tahmin.winChance;
  const sansTon = sans >= 75 ? 'iyi' : (sans >= 50 ? 'uyari' : 'kotu');
  const sansYazi = sans >= 75 ? '🔥 Ordun ezici üstünlüğe sahip!' : (sans >= 50 ? '⚖️ Dengeli bir savaş, yaralanmalar olabilir.' : '⚠️ Yüksek risk! Ordun yenilgiye uğrayabilir.');

  return kart({
    baslik: `${esc(m.icon || '💀')} ${esc(m.name)}`,
    rozet: etiket(`${m.level}. kat${boss ? ' · Boss' : ''}`, boss ? 'kotu' : ''),
    icerik: izgara([hucre('Can', `${tam(m.hp)} HP`, 'kotu'), hucre('Saldırı', `${tam(m.atk)} ATK`, 'uyari')], { kolon: 2 })
      + (resim ? `<div class="ek-dusman-resim"><img src="${esc(resim)}" alt="" draggable="false" data-fb="text:${esc(m.icon || '💀')}"></div>` : '')
      + satir('Ganimet', `+${astra(beklenenAstra)} ASTRA · +${tam(taban.xp)} XP · askerlere +${tam(m.rewardXp || 0)} XP`, 'iyi')
      + satir('Kazanma şansın', `%${tam(sans)} (${tahmin.difficulty})`, sansTon)
      + `<p class="ek-kucuk">${esc(sansYazi)}</p>`
      + satir('⚡ Savaş stamina bedeli', secili.length ? `${terms.staminaCost} ⚡` : '0 ⚡', yeter ? '' : 'kotu')
      + `<p class="ek-kucuk">${secili.length ? `${esc(secili.length)} asker × ${esc(askerBasi)} ⚡ (${esc(m.level)}. kat) · mevcut ${esc(stamina)}/${esc(enFazla)} ⚡` : 'Asker seçilmedi'}</p>`
      + (!yeter
        ? uyari(`${esc(terms.staminaShortfall)} ⚡ stamina eksik.`, 'kotu') + dugme({ e: 'staminaDoldur', metin: '🍞 Buğdayla doldur' })
        : '')
  });
}

function girisKarti(b, m, terms) {
  const gs = b.gameState;
  const ucret = gs.getDungeonGateFee(m.level, asBoss(m));
  const paySayi = b.GAME_CONFIG.DUNGEON_GATE_POOL_SHARE ?? 1;
  const kasayaNot = paySayi >= 1
    ? 'Harcın tamamı zindan kasasına gider.'
    : `Harçtan %${sayi(paySayi * 100, 1)} doğrudan zindan kasasına gider, kalanı her harcama gibi dağıtılır.`;
  const taban = gs.getDungeonBaseReward(m.level, asBoss(m));

  const kurallar = terms.nextNeedsFee
    ? not('Günlük harçsız girişlerin bitti: sonraki girişler kapı harcıyla yapılır (savaşa girerken ödenir). Harçlı giriş de ödüllüdür. Stamina harcanır, eşyalar aşınır. Harç ödemeden giriş yoktur. Haklar her gece 00:00\'da (TSİ) yenilenir.')
    : not(`${terms.nextWeaponWear ? `Savaşa giren her askerin takılı eşyalarından rastgele ortalama ${sayi(gs.getDungeonWearPerSoldier(m.level), 1)} tanesi 1'er aşınır (kat ve zindan moduyla artar).` : 'Günün ilk girişi: eşyaların aşınmaz.'} Stamina harcanır. Harçsız ödüllü giriş: ${terms.freeLeft} / ${terms.freeTotal} kaldı. Haklar her gece 00:00'da (TSİ) yenilenir.`);

  return kart({
    baslik: `🎟️ Bugünkü ${esc(terms.nextEntryNumber)}. girişin`,
    rozet: etiket(terms.nextNeedsFee ? 'Kapı harçlı' : 'Ödüllü', terms.nextNeedsFee ? 'uyari' : 'iyi'),
    icerik: cubukSatiri('Bugünkü ödüllü girişler', `${terms.freeUsed} / ${terms.freeTotal}`, terms.freeTotal > 0 ? (terms.freeUsed / terms.freeTotal) * 100 : 0, { ton: terms.nextNeedsFee ? 'dolu' : '' })
      + (terms.nextNeedsFee
        ? (terms.budgetBlocked
          ? uyari('🏦 Bugünkü zindan ödeme payını doldurdun (bu sınır yalnız senin hesabın için, diğer oyuncuları etkilemez): bugün yeni giriş yapılamaz. Yarın 00:00\'da (TSİ) yenilenir.', 'kotu')
          : `<p class="ek-not"><b>🚪 Kapı harcı: ${esc(astra(ucret))} ASTRA</b><br><small>Savaşa girerken ödenir, ödülle girersin. ${esc(kasayaNot)}</small></p>`)
        : '')
      + gunlukOdemeNotu(terms, taban.ada)
      + katli('Giriş kuralları', kurallar, { k: 'zindan-giris' })
  });
}

// Bugünkü ödeme payı (kasanın günlük bütçesi ve kişi tavanı; kural gameState.getDungeonDayStatus) bu zaferin ödülüne yetmiyorsa söyler
function gunlukOdemeNotu(terms, tabanAda) {
  const n = odemeOnizlemeNotu(terms.budgetLeft, tabanAda, terms.personalCap);
  return n ? uyari(esc(n.metin), n.ton) : '';
}

function ordu(b, secenek, secili) {
  const gs = b.gameState;
  const liste = askerler(b);
  if (!liste.length) {
    return kart({
      icerik: bos('⚠️', 'Ordunda asker yok', 'Zindan canavarlarıyla savaşmak için Kışladan asker eğitmelisin.')
        + dugme({ e: 'git', veri: { hedef: 'kisla' }, metin: '⚔️ Kışlaya git ve asker eğit', ton: 'birincil', genis: true })
    });
  }
  if (gs.isArmyStakedInWorldBoss()) {
    return kart({
      baslik: '🔒 Ordun World Boss savaşına kilitli',
      vurgu: 'kotu',
      icerik: not(`Askerlerin Pazar 18:00 (TSİ) dünya bossu savaşı için kilit altında ve başka hiçbir alanda kullanılamaz. Savaş alanından %${Math.round(gs.getWorldBossEarlyUnstakeRate() * 100)} cezayla erken çekebilir ya da Pazar 18:00 sonrasını bekleyebilirsin.`)
        + dugme({ e: 'git', veri: { hedef: 'savasalani' }, metin: '🌋 Savaş alanına git', genis: true })
    });
  }

  const taktik = gs.getCombatPresets();
  const aktif = taktik.activePresetId || 1;
  const aktifAd = (taktik.presets && taktik.presets[aktif] && taktik.presets[aktif].name) || `Taktik ${aktif}`;
  const silahlar = secili.map((idx) => {
    const s = liste[idx];
    const w = (s && s.equipment && s.equipment.weapon) || (gs.state.equipment && gs.state.equipment.weapon);
    if (!w) return null;
    const max = w.maxDurability || 13;
    const cur = w.durability != null ? w.durability : max;
    return `${(s && s.name) || '#' + (idx + 1)}: ${w.icon || ''} ${w.name} (${cur}/${max})`;
  }).filter(Boolean);

  const satirlar = liste.map((s, idx) => {
    const f = gs.getSoldierFullStats(idx);
    const seciliMi = secili.includes(idx);
    const arka = s.row === 'back';
    const yetenekler = (s.skills || ['shieldWall']).map((k) => (PLAYER_SKILLS[k] && PLAYER_SKILLS[k].icon) || '⚡').join(' ');
    return `<div class="ek-asker${seciliMi ? ' is-secili' : ''}">
        <button type="button" class="ek-asker-sec" data-e="sec" data-idx="${idx}" aria-pressed="${seciliMi}">
          <span class="ek-asker-isaret" aria-hidden="true">${seciliMi ? '✅' : '⬜'}</span>
          <span class="ek-simge is-kucuk"><img src="${esc(soldierPortrait(s, idx))}" alt="" draggable="false" data-fb="text:${esc(s.icon || '⚔️')}"></span>
          <span class="ek-asker-ad"><b>#${idx + 1} ${esc(s.name)}</b><small>${esc(tam(gs.getSoldierBattleStart(idx).hp))} / ${esc(tam(gs.getSoldierBattleStart(idx).maxHp))} HP · ${esc(tam((f && f.totalAtk) || 20))} ATK · ${esc(yetenekler)}</small></span>
        </button>
        <button type="button" class="ek-dugme" data-e="mevzi" data-idx="${idx}">${arka ? '🏹 Arka' : '🛡️ Ön'}</button>
      </div>`;
  }).join('');

  return kart({
    baslik: `🛡️ Savaşa girecek askerler (${secili.length}/${liste.length})`,
    rozet: etiket(aktifAd),
    icerik: `<div class="ek-dugmeler">${dugme({ e: 'otomatik', ton: 'iyi', metin: '⚡ Kazanacak kadar seç', ipucu: 'En güçlülerden başlayarak kazanma şansı %80 olana kadar seçer' })}${dugme({ e: 'hepsi', metin: 'Tümünü seç' })}</div>`
      + `<div class="ek-asker-liste">${satirlar}</div>`
      + katli('🎯 Taktik ve silahlar',
        not('Taktik, ön ve arka saf dizilişini kaydeder. Üç hazır taktikten birini uygula ya da şu anki dizilişi aktif taktiğe kaydet.')
        + `<div class="ek-dugmeler">${[1, 2, 3].map((p) => dugme({
          e: 'taktik', veri: { no: p }, ton: p === aktif ? 'birincil' : '', metin: `${TAKTIK_SIMGE[p]} T${p}`,
          ipucu: (taktik.presets && taktik.presets[p] && taktik.presets[p].name) || `Taktik ${p}`
        })).join('')}</div>`
        + dugme({ e: 'taktikKaydet', metin: `💾 T${aktif}'e kaydet`, genis: true })
        + (silahlar.length
          ? not(`🗡️ Kuşanılmış silahlar: <b>${esc(silahlar.join(' • '))}</b>`)
          : not('ℹ️ Kuşanılmış silah yok; temel ordu gücüyle savaşılacak.')),
      { k: 'zindan-taktik' })
  });
}

const ekran = {
  id: 'savashazirlik',
  goruldu: 'zindanOnizleme',
  baslik: () => ['⚔️', 'Savaşa hazırlık'],
  ornekSecenekler: () => [{ canavar: { ...getDungeonEntry(1) } }, { canavar: { ...getDungeonEntry(9), isBoss: true } }],

  govde(b, secenek) {
    const m = secenek.canavar;
    const gs = b.gameState;
    const secili = seciliAskerler(b, secenek);
    const terms = gs.getDungeonEntryTerms(m.level, asBoss(m), secili.length);
    const kilitli = gs.isArmyStakedInWorldBoss();
    const yok = askerler(b).length === 0;
    const staminaYetersiz = !terms.staminaOk && secili.length > 0;
    const harcYok = !!terms.nextNeedsFee && !!terms.budgetBlocked;
    const baslamaOlmaz = yok || kilitli || secili.length === 0 || staminaYetersiz || harcYok;
    let baslaYazi = terms.nextNeedsFee && terms.fee > 0 ? `🚪 Harç öde (${astra(terms.fee)} ASTRA) ve savaşa başla` : '⚔️ Savaşa başla';
    if (kilitli) baslaYazi = '🔒 Ordu kilitli';
    else if (yok) baslaYazi = '⚔️ Asker yok';
    else if (secili.length === 0) baslaYazi = '⚔️ Asker seçin';
    else if (staminaYetersiz) baslaYazi = `⚡ Yetersiz stamina (${Math.floor(gs.state.stamina || 0)}/${terms.staminaCost} ⚡)`;
    else if (harcYok) baslaYazi = '🏦 Bugünkü ödeme payın doldu';

    const parsomen = gs.state.inventory.scroll_heal || 0;
    return kap([
      girisKarti(b, m, terms),
      dusmanKarti(b, m, secili, terms),
      ordu(b, secenek, secili),
      `<div class="ek-eylem-cubugu">
        ${parsomen > 0 ? dugme({ e: 'parsomen', metin: `📜 Parşömenle iyileştir (${parsomen})`, ipucu: 'Bir askeri +4 can iyileştirir' }) : ''}
        ${dugme({ e: 'vazgec', metin: '🏳️ Vazgeç' })}
        ${dugme({ e: 'basla', ton: 'iyi', devreDisi: baslamaOlmaz, metin: esc(baslaYazi) })}
      </div>`
    ].join(''));
  },

  eylemler: {
    git(b, el) {
      return { git: el.dataset.hedef };
    },

    vazgec() {
      return { kapat: true };
    },

    sec(b, el, secenek) {
      const i = parseInt(el.dataset.idx, 10);
      secenek.secimYapildi = true;
      const liste = secenek.secili || [];
      secenek.secili = liste.includes(i) ? liste.filter((x) => x !== i) : [...liste, i].slice(0, EN_COK_ASKER);
    },

    hepsi(b, el, secenek) {
      secenek.secimYapildi = true;
      secenek.secili = askerler(b).map((_, i) => i).slice(0, EN_COK_ASKER);
    },

    // En güçlülerden başlayarak kazanma şansı %80'e ulaşana kadar (ulaşamazsa hepsi)
    otomatik(b, el, secenek) {
      const gs = b.gameState;
      const sira = askerler(b).map((_, i) => {
        const f = gs.getSoldierFullStats(i) || { totalAtk: 0, totalMaxHp: 0 };
        return { i, w: f.totalAtk * 3 + f.totalMaxHp };
      }).sort((x, y) => y.w - x.w).map((x) => x.i);
      const secilen = [];
      for (const i of sira) {
        secilen.push(i);
        if ((gs.predictDungeonBattle(secenek.canavar, secilen).winChance || 0) >= 80) break;
      }
      secenek.secimYapildi = true;
      secenek.secili = secilen;
      const sans = gs.predictDungeonBattle(secenek.canavar, secilen).winChance || 0;
      b.bildir(sans >= 80
        ? `⚡ ${secilen.length} asker yeterli: kazanma şansı %${sans}`
        : `Bütün ordunla bile kazanma şansı %${sans}. Askerlerini güçlendirmen gerekebilir.`, sans >= 80 ? 'success' : 'info');
    },

    mevzi(b, el) {
      const i = parseInt(el.dataset.idx, 10);
      const s = askerler(b)[i];
      if (!s) return false;
      b.gameState.setSoldierRow(i, s.row === 'back' ? 'front' : 'back');
      return undefined;
    },

    taktik(b, el) {
      const r = b.gameState.applyCombatPreset(parseInt(el.dataset.no, 10));
      if (r.success) b.bildir(r.message, 'info');
    },

    taktikKaydet(b) {
      const r = b.gameState.saveCombatPreset(b.gameState.state.combatPresets?.activePresetId || 1);
      if (r.success) b.bildir(r.message, 'success');
    },

    staminaDoldur(b, el, secenek) {
      const m = secenek.canavar;
      const terms = b.gameState.getDungeonEntryTerms(m.level, asBoss(m), (secenek.secili || []).length);
      const r = b.gameState.refillStaminaExact(terms.staminaShortfall || 20);
      b.bildir(r.message, r.success ? 'success' : 'error');
    },

    parsomen(b) {
      const r = b.gameState.useScroll('scroll_heal');
      b.bildir(r.message, r.success ? 'success' : 'error');
    },

    async basla(b, el, secenek) {
      const gs = b.gameState;
      const m = secenek.canavar;
      const secili = secenek.secili || [];
      if (gs.isArmyStakedInWorldBoss()) { b.bildir('🔒 Ordun World Boss savaşına kilitlidir! Zindanda savaşamazsın.', 'error'); return false; }
      if (!secili.length) { b.bildir('En az 1 asker seçmelisin!', 'error'); return false; }
      const terms = gs.getDungeonEntryTerms(m.level, asBoss(m), secili.length);
      if (!terms.staminaOk) {
        b.bildir(`⚠️ Yetersiz stamina! ${secili.length} asker için ${terms.staminaCost} ⚡ gerekiyor (mevcut: ${Math.floor(gs.state.stamina || 0)} ⚡).`, 'error');
        return undefined;
      }
      if (terms.budgetBlocked) { b.bildir('🏦 Bugünkü zindan ödeme payını doldurdun (bu sınır yalnız senin hesabın için, diğer oyuncuları etkilemez): bugün yeni giriş yapılamaz.', 'error'); return false; }
      const harc = !!terms.nextNeedsFee;   // günlük harçsız haklar bitince kapı harcı savaşa girerken ödenir (antrenman girişi yok)
      if (harc) {
        const ucret = gs.getDungeonGateFee(m.level, asBoss(m));
        if ((gs.state.adAstraBalance || 0) < ucret) { b.bildir(`Kapı harcı için ${astra(ucret)} ASTRA gerekiyor.`, 'error'); return false; }
      }
      sonSavasiYaz(m.level, secili);   // zindan ekranındaki "son savaşı tekrarla" için
      return savasiOyna(b, m, secili, harc);
    }
  }
};

// Giriş + savaş + sonuç tek adımda (gameState.fightDungeon); arena yalnızca dönen kaydı canlandırır.
async function savasiOyna(b, m, secili, odeHarc) {
  const gs = b.gameState;
  const liste = askerler(b);
  const hpOnce = secili.map((idx) => (liste[idx] ? gs.getSoldierBattleStart(idx).hp : null));   // savaş ölçeğinde başlangıç canı
  const canavarCanOnce = gs.getMonsterCurrentHp(m.level, m.hp);

  const fight = await gs.fightDungeon(m.level, secili, { payGateFee: odeHarc });
  if (!fight.success) { b.bildir(fight.message, 'error'); return undefined; }
  const { entry, sim, outcome } = fight;
  const staminaBedeli = entry.staminaCost;
  b.hudYenile();

  const muttefikler = secili.filter((idx) => liste[idx]).map((idx, i) => {
    const f = gs.getSoldierFullStats(idx) || { totalAtk: 25, totalMaxHp: 100 };
    const s = liste[idx];
    const hp0 = hpOnce[secili.indexOf(idx)];
    return {
      uid: 'a' + i, name: s.name, icon: s.icon || '⚔️', avatar: s.avatar || 'assets/soldier_avatar.jpg', sourceIndex: idx,
      hp: hp0 != null ? hp0 : f.totalMaxHp, maxHp: f.totalMaxHp, atk: f.totalAtk, row: s.row || 'front',
      skills: Array.isArray(s.skills) && s.skills.length ? s.skills : ['shieldWall', 'armorBreaker']
    };
  });
  if (!muttefikler.length) { b.bildir('Savaşa katılacak geçerli bir asker bulunamadı!', 'error'); return undefined; }

  const boss = asBoss(m);
  const dusman = {
    uid: 'e0', name: m.name, icon: m.icon || '💀', avatar: m.avatar || (b.canavarResmi ? b.canavarResmi(m.level, m.name) : ''),
    level: m.level, hp: canavarCanOnce, maxHp: m.hp, atk: m.atk, boss, row: 'front',
    skills: m.abilities || (boss ? ['cleave', 'roar'] : ['cleave']),
    phases: DEFAULT_BOSS_PHASES[m.level]
      ? DEFAULT_BOSS_PHASES[m.level].map((p) => ({ at: p.atPct || 0.5, text: p.name || 'ÖFKE PATLAMASI', sub: p.text || 'Düşman gücünü topluyor!' }))
      : []
  };

  const serbestOran = (b.GAME_CONFIG.LOCKED_BALANCE || {}).FREE_SHARE;   // kazancın serbest kısmı; kalanı kilitli (QA-14)
  const taban = gs.getDungeonBaseReward(m.level, boss);
  const onizlemeAstra =Math.min(taban.ada, gs.getDungeonDayStatus().budgetLeft);
  const ganimet = [
    `🟣 ${kazancYazisi(onizlemeAstra, serbestOran)}`,
    `✨ +${m.rewardXp || (m.level * 15)} Asker XP`,
    `🧩 Teçhizat Parçası (${gs.getFragmentDropRate(gs.state.level)}% şans)`,
    `📦 Pandora Kutusu (${gs.getBoxDropRate(gs.state.level)}% şans)`
  ];

  // Savaş başında işlendi: günlük kalan ödeme payı şimdi, sonuçtan sonraki değeridir (kural gameState.getDungeonDayStatus)
  const odemeNotu = outcome.victory ? odemeSinirNotu({
    haftalikDoldu: !!(outcome.budgetFull || outcome.personCapped),
    azaldi: !!outcome.budgetCapped,
    gunlukKalan: gs.getDungeonDayStatus().budgetLeft,
    haftalikMesaj: b.GAME_CONFIG.TREASURY_WEEKLY_BUDGET.FULL_MESSAGE
  }) : '';
  const basladi = b.arenaBaslat({
    mode: 'dungeon',
    context: `Kat ${m.level} · Seviye ${m.level} — <strong>${esc(m.name)}</strong> ${boss ? '(Zindan Bossu)' : ''}`,
    rank: `${entry.fee > 0 ? 'Kapı harcıyla ödüllü' : 'Ödüllü giriş'} · Stamina: -${staminaBedeli} ⚡`,
    replay: sim,
    allies: muttefikler,
    enemies: [dusman],
    loot: ganimet,
    onComplete: () => {
      // Durum savaş başında işlendi; burada yalnızca bildirimler ve sonuç kartı gösterilir
      if (outcome.victory) {
        const duyuru = [
          `${m.name} yenildi! ${kazancYazisi(outcome.adaReward, serbestOran)} kazandın (⚡ -${staminaBedeli} stamina).`,
          odemeNotu,
          outcome.scrollGained ? `📜 ${outcome.scrollGained.name} düştü!` : '',
          `Savaşa katılan askerlerin +${m.rewardXp} asker XP kazandı.`,
          outcome.fatihOdulu ? `👑 Fatih Ödülü: +${astra(outcome.fatihOdulu.odul)} ASTRA (orduna harcadığının zindanda geri dönmeyen kısmı)` : '',
        outcome.levelUps.length ? `🎉 ${outcome.levelUps.join(', ')}` : '',
          outcome.weaponsWorn.length ? `🛡️ Eşya aşınması: ${outcome.weaponsWorn.join(', ')}` : ''
        ].filter(Boolean).join(' ');
        if (b.bildirimEkle) b.bildirimEkle('🏆', duyuru);
        if (outcome.weaponsWorn.length) b.bildir(`🛡️ Eşyaların dayanıklılığı -1 azaldı: ${outcome.weaponsWorn.join(', ')}`, 'info');
        b.bildir(`🏆 Zafer! ${m.name} mağlup edildi! (${kazancYazisi(outcome.adaReward, serbestOran)})`, 'success');
        window.dispatchEvent(new CustomEvent('monster-defeated', { detail: { level: m.level } }));   // zindan haritası levhaları tazeler
      } else {
        b.bildir(`💀 Bozgun! Ordun ${m.name} karşısında geri çekildi. Kalan can: ${outcome.remainingEnemyHp}/${m.hp}`, 'error');
      }
      b.hudYenile();

      const satirlar = [];
      if (outcome.victory) {
        satirlar.push(`🟣 ${kazancYazisi(outcome.adaReward || 0, serbestOran)}`);
        satirlar.push(`✨ +${m.rewardXp} asker XP`);
        if (outcome.xpGained) satirlar.push(`🧙 +${tam(outcome.xpGained)} hesap XP`);
        if (outcome.fragmentsGained) satirlar.push(`🧩 +${outcome.fragmentsGained} teçhizat parçası`);
        if (outcome.boxGained) satirlar.push(`📦 +${outcome.boxGained} Pandora kutusu`);
        if (outcome.scrollGained) satirlar.push(`📜 ${outcome.scrollGained.name}`);
        if (outcome.fatihOdulu) satirlar.push(`👑 Fatih Ödülü: +${astra(outcome.fatihOdulu.odul)} ASTRA`);
        outcome.levelUps.forEach((t) => satirlar.push(`🎉 ${t}`));
        if (outcome.weaponsWorn.length) satirlar.push(`🛡️ Eşya aşındı: ${outcome.weaponsWorn.join(', ')}`);
        satirlar.push(`⚡ -${staminaBedeli} stamina`);
        return {
          altBaslik: `${m.name} yenildi`,
          satirlar,
          not: odemeNotu,
          eylemler: [
            { etiket: '↻ Aynı savaşı tekrarla', birincil: true, tikla: () => ac('savashazirlik', { canavar: m, secili: [...secili], secimYapildi: true }) },
            { etiket: '⚔️ Kışlaya git', tikla: () => ac('kisla') }
          ]
        };
      }
      satirlar.push(`💀 ${m.name}: ${outcome.remainingEnemyHp}/${m.hp} can kaldı`);
      satirlar.push(`⚡ -${staminaBedeli} stamina`);
      return {
        baslik: '💀 BOZGUN',
        altBaslik: `${m.name} karşısında geri çekildin`,
        satirlar,
        not: 'Düşmanın kalan canı kaydedildi. Askerlerini iyileştirip yeniden girince kaldığın yerden devam edersin.',
        eylemler: [
          { etiket: '🌾 Askerleri iyileştir', birincil: true, tikla: () => ac('kisla') },
          { etiket: '↻ Tekrar dene', tikla: () => ac('savashazirlik', { canavar: m, secili: [...secili], secimYapildi: true }) }
        ]
      };
    }
  });
  return basladi ? false : undefined;
}

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
