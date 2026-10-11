// Realm of AdAstra — Kolezyum ekranı: 1v1 düello (hazır rakip), lig kademeleri ve gerçek rakiplerle sunucu eşleşmesi.
// Kurallar js/gameState/kolezyum.js (düello), js/economy/pvp.js ve server/arena.js (gerçek rakip) içindedir.
import {
  ekranKaydet, kap, kart, katli, satir, sekmeler, dugme, uyari, not, bos, izgara, hucre, etiket,
  tam, astra, sayi, esc, ac, yenile
} from './cekirdek.js';

const SEKMELER = [
  { id: 'duel', ad: 'Düello', simge: '⚔️' },
  { id: 'lig', ad: 'Lig', simge: '🏆' },
  { id: 'pvp', ad: 'Rakipler', simge: '🌐' }
];
const TAKTIK_SIMGE = { 1: '🛡️', 2: '⚔️', 3: '🏹' };

// Ekranlar arası seçili şampiyon (panel kapanıp açılınca korunur)
let sonSampiyon = 0;
// Gerçek rakip sekmesi: seçili modlar ve askerler
let pvpMod = '1v1';
let pvpSecili = null;

const asker = (b) => b.gameState.state.soldierUnits || [];
const cevrimici = (b) => !!(b.online && b.online.active);

// ── Düello ───────────────────────────────────────────────────────────────
function duelloSekmesi(b, secenek) {
  const gs = b.gameState;
  const liste = asker(b);
  const idx = Math.min(secenek.sampiyon, Math.max(0, liste.length - 1));
  const sampiyon = liste[idx];

  if (gs.isArmyStakedInWorldBoss()) {
    return kart({
      baslik: '🔒 Ordun World Boss savaşına kilitli',
      vurgu: 'kotu',
      icerik: not(`Askerlerin Pazar 18:00 (TSİ) dünya bossu savaşı için kilit altında. Kolezyumda dövüşmek için Savaş alanından ordunu %${Math.round(gs.getWorldBossEarlyUnstakeRate() * 100)} cezayla erken çekebilir ya da Pazar 18:00 sonrasını bekleyebilirsin.`)
        + dugme({ e: 'git', veri: { hedef: 'savasalani' }, metin: '🌋 Savaş alanına git', genis: true })
    });
  }
  if (!sampiyon) {
    return kart({
      icerik: bos('⚔️', 'Kolezyuma çıkacak askerin yok', 'Kışladan asker alıp geri gel.')
        + dugme({ e: 'git', veri: { hedef: 'kisla' }, metin: '⚔️ Kışlaya git', ton: 'birincil', genis: true })
    });
  }

  const istat = gs.getSoldierFullStats(idx) || { totalAtk: 0, totalMaxHp: sampiyon.maxHp || 100 };
  const maxCan = sampiyon.maxHp || 100;
  const can = Math.floor(sampiyon.hp != null ? sampiyon.hp : maxCan);
  const yarali = can < maxCan;
  const arka = sampiyon.row === 'back';
  const giris = gs.getColosseumEntryStatus();
  const agirYarali = can <= 15;
  const engel = agirYarali ? 'Şampiyon ağır yaralı, önce iyileştir' : giris.blockReason;
  const iyilesme = gs.getSoldierHealInfo(idx);
  const taktik = gs.getCombatPresets();
  const aktifTaktik = taktik.activePresetId || 1;
  const taktikAd = (taktik.presets && taktik.presets[aktifTaktik] && taktik.presets[aktifTaktik].name) || `Taktik ${aktifTaktik}`;
  const tier = gs.getColosseumTier();
  const istatistik = gs.state.colosseumStats || { wins: 0, losses: 0, score: 0, rating: b.GAME_CONFIG.COLOSSEUM.STARTING_RATING };

  const secim = `<label class="ek-alan" for="ek-sampiyon"><span>Şampiyon</span>
      <select class="ek-girdi" id="ek-sampiyon" data-e-degis="sampiyon">${liste.map((s, i) =>
        `<option value="${i}"${i === idx ? ' selected' : ''}>${esc(s.name)} · Sv.${esc(s.level || 1)} · ❤️ ${esc(Math.floor(s.hp != null ? s.hp : (s.maxHp || 100)))}/${esc(s.maxHp || 100)}</option>`).join('')}</select></label>`;

  return [
    kart({
      baslik: '⚔️ 1v1 Kolezyum düellosu',
      rozet: etiket(`🔑 ${giris.keys} anahtar`),
      icerik: not('Şampiyonunu seç ve Kolezyuma çık: kendi ligine uygun rakip bulunur, 1v1 savaş başlar. Şampiyon kolezyumda ölmez ama yaralanabilir; yaralıyı buğdayla iyileştirirsin.')
        + satir('Liginin kademesi', `${tier.name} · ${tam(istatistik.rating)} puan`, 'iyi')
    }),
    kart({
      baslik: 'Şampiyonun',
      icerik: secim
        + izgara([
          hucre('Toplam saldırı', `⚔️ ${tam(istat.totalAtk)}`),
          hucre('Can', `❤️ ${can}/${maxCan}`, can <= 25 ? 'kotu' : ''),
          hucre('Mevzi', arka ? '🏹 Arka saf' : '🛡️ Ön saf')
        ], { kolon: 2 })
        + dugme({ e: 'mevzi', metin: arka ? '🛡️ Ön safa al' : '🏹 Arka safa al' })
        + (yarali && iyilesme && !iyilesme.isFull
          ? uyari(`Şampiyonun yaralı. Anında iyileştirme: ${esc(tam(iyilesme.wheatNeeded))} 🌾 buğday + ${esc(astra(iyilesme.adaCost))} ASTRA.`, 'uyari')
            + dugme({ e: 'iyilestir', metin: '⚡ Anında iyileştir', devreDisi: iyilesme.wheatInStock < iyilesme.wheatNeeded || iyilesme.adaInBalance < iyilesme.adaCost })
          : '')
    }),
    kart({
      baslik: 'Giriş bedeli',
      icerik: satir('Bugünkü maç', `${giris.used} / ${giris.cap}`, giris.used >= giris.cap ? 'kotu' : '')
        + satir('Anahtar bedeli', `${giris.keyCost} (sende ${giris.keys})`, giris.keys < giris.keyCost ? 'kotu' : '')
        + satir('Stamina bedeli', `${giris.staminaCost} ⚡ (sende ${giris.stamina})`, giris.stamina < giris.staminaCost ? 'kotu' : '')
        + dugme({ e: 'dovus', ton: 'iyi', genis: true, devreDisi: !!engel, metin: engel ? `🔒 ${esc(engel)}` : '⚔️ Kolezyuma çık (1v1)' })
    }),
    katli(`🎯 Taktik: ${esc(taktikAd)}`,
      not('Taktik, askerlerinin ön ve arka saf dizilişini kaydeder. Üç hazır taktikten birini uygula ya da şu anki dizilişi aktif taktiğe kaydet.')
      + `<div class="ek-dugmeler">${[1, 2, 3].map((p) => dugme({
        e: 'taktik', veri: { no: p }, ton: p === aktifTaktik ? 'birincil' : '',
        metin: `${TAKTIK_SIMGE[p]} T${p}`, ipucu: (taktik.presets && taktik.presets[p] && taktik.presets[p].name) || `Taktik ${p}`
      })).join('')}</div>`
      + dugme({ e: 'taktikKaydet', metin: `💾 T${aktifTaktik}'e kaydet`, genis: true }),
    { k: 'kolezyum-taktik' })
  ].join('');
}

// ── Lig ──────────────────────────────────────────────────────────────────
function ligSekmesi(b) {
  const gs = b.gameState;
  const C = b.GAME_CONFIG.COLOSSEUM;
  const tier = gs.getColosseumTier();
  const s = gs.state.colosseumStats || { wins: 0, losses: 0, score: 0, rating: C.STARTING_RATING };
  const basamaklar = [...C.LEAGUES].sort((x, y) => y.minRating - x.minRating).map((l) => {
    const benim = l.id === tier.id;
    return `<div class="ek-satir${benim ? ' is-iyi' : ''}"><span>${benim ? '▶ ' : ''}${esc(l.name)}</span><b>${esc(tam(l.minRating))}+ puan · ödül ×${esc(sayi(l.rewardMult, 2))}</b></div>`;
  }).join('');

  return [
    kart({
      baslik: '🏆 Senin derecen',
      rozet: etiket(tier.name, 'vurgu'),
      icerik: izgara([
        hucre('Puanın', tam(s.rating)),
        hucre('Galibiyet', tam(s.wins), 'iyi'),
        hucre('Mağlubiyet', tam(s.losses)),
        hucre('Lig puanı', tam(s.score))
      ], { kolon: 2 })
        + not('Puan, her maçta rakibin puanına göre değişir (ELO). Lig kademesi puanına göre sabittir; kademe yükseldikçe zafer ödülü büyür.')
    }),
    kart({ baslik: 'Lig kademeleri', icerik: basamaklar }),
    cevrimici(b)
      ? kart({
        baslik: '🌐 Haftalık sıralama gerçek oyuncularla',
        icerik: not('Çevrimiçi oyunda sıralama ve haftalık ödüller sunucuda tutulur. Hafta sonunda ilk 10 oyuncu Kolezyum kasasından pay alır.')
          + dugme({ e: 'sekme', veri: { sekme: 'pvp' }, metin: '🌐 Gerçek rakipler ve sıralama', ton: 'birincil', genis: true })
      })
      : uyari('Haftalık sıralama ve ödüller yalnızca çevrimiçi oyunda, gerçek oyuncularla çalışır. Tek başına oynarken düello puanın ve lig kademen kayıt altındadır.')
  ].join('');
}

// ── Gerçek rakipler ─────────────────────────────────────────────────────
function pvpSekmesi(b, secenek) {
  if (!cevrimici(b)) {
    return kart({
      baslik: '🌐 Gerçek rakipler',
      icerik: not('Bu bölüm oyun sunucudan açıldığında çalışır: askerini seçip "Maç ara"ya basarsın, sırada bekleyen ilk oyuncuyla maçın sunucuda oynanır. 1v1 zaferi 1, 3v3 zaferi 3 puan; haftalık ilk 10 ödül alır.')
    });
  }
  if (!(b.girisli && b.girisli())) {
    return kart({
      baslik: '🌐 Gerçek rakipler',
      icerik: not('Gerçek oyunculara karşı maç yapmak için giriş yap ya da hesap aç.')
        + dugme({ e: 'giris', metin: '🔐 Giriş yap', ton: 'birincil', genis: true })
    });
  }
  if (secenek.pvpHata) {
    return kart({ baslik: '🌐 Gerçek rakipler', icerik: uyari(esc(secenek.pvpHata), 'kotu') + dugme({ e: 'pvpYenile', metin: '↻ Tekrar dene' }) });
  }
  const st = secenek.pvpVeri;
  if (!st) return kart({ baslik: '🌐 Gerçek rakipler', icerik: not('⏳ Yükleniyor…') });

  const liste = asker(b);
  const boyut = pvpMod === '3v3' ? 3 : 1;
  if (!Array.isArray(pvpSecili) || pvpSecili.some((i) => !liste[i])) {
    pvpSecili = liste.length ? [Math.min(secenek.sampiyon || 0, liste.length - 1)] : [];
  }
  const sirada = st.queue;
  const sonucSimge = { win: '🏆', loss: '💀', draw: '🤝' };

  const askerSecimi = liste.map((s, i) => {
    const f = b.gameState.getSoldierFullStats(i) || { totalAtk: 0, totalMaxHp: 0 };
    const secili = pvpSecili.includes(i);
    return `<button type="button" class="ek-secenek${secili ? ' is-secili' : ''}" data-e="pvpSec" data-idx="${i}"${sirada ? ' disabled' : ''}>
      <b>${esc(s.icon || '⚔️')} ${esc(s.name)}</b><small>Sv.${esc(s.level || 1)} · ⚔️ ${esc(tam(f.totalAtk))} · ❤️ ${esc(tam(f.totalMaxHp))}</small></button>`;
  }).join('');

  const kurallar = `Askerini seç, "Maç ara"ya bas: sırada bekleyen ilk oyuncuyla maçın sunucuda oynanır (rakibin çevrimiçi olması gerekmez). 1v1 zaferi <b>1 puan</b>, 3v3 zaferi <b>3 puan</b>. Her Pazartesi 00:01'de ilk 10, Kolezyum kasasının %${esc(Math.round(((st.rules && st.rules.weeklyPoolShare) || 0) * 100))}'unu paylaşır. Maç askerinin canını azaltmaz. Giriş: anahtar + stamina (sıradan çıkarsan iade edilir).`;

  const sira = sirada
    ? kart({
      vurgu: 'uyari',
      icerik: not(`⏳ <b>${esc(sirada.mode)}</b> için sıradasın · ${esc(Math.max(1, Math.round((Date.now() - sirada.at) / 60000)))} dakikadır bekliyorsun. Rakip gelince maç sunucuda oynanır, sonucu buradan izlersin.`)
        + dugme({ e: 'pvpCik', metin: '↩️ Sıradan çık' })
    })
    : kart({
      baslik: 'Maç ara',
      icerik: `<div class="ek-dugmeler">${dugme({ e: 'pvpMod', veri: { mod: '1v1' }, ton: pvpMod === '1v1' ? 'birincil' : '', metin: '1v1 (1 asker)' })}${dugme({ e: 'pvpMod', veri: { mod: '3v3' }, ton: pvpMod === '3v3' ? 'birincil' : '', metin: '3v3 (3 asker)' })}</div>`
        + (liste.length ? `<div class="ek-izgara is-genis">${askerSecimi}</div>` : bos('⚔️', 'Önce Kışladan asker al'))
        + dugme({ e: 'pvpSira', ton: 'iyi', genis: true, devreDisi: pvpSecili.length !== boyut, metin: `⚔️ Maç ara (${pvpMod}) — ${pvpSecili.length}/${boyut} asker seçili` })
    });

  const ilk10 = st.top.length
    ? st.top.map((r, i) => `<div class="ek-satir${r.me ? ' is-iyi' : ''}"><span>${esc(r.rank)}. ${esc(r.name)}</span><b>${esc(r.points)} puan · ~${esc(tam(st.prizes[i]))} ASTRA</b></div>`).join('')
    : not('Bu hafta henüz maç yok. İlk puanı sen al!');
  const benim = st.mine
    ? satir('Senin sıran', `${st.mine.rank}. · ${st.mine.points} puan · ${st.mine.wins} G / ${st.mine.losses} M`, 'iyi')
    : '';
  const maclar = st.matches.length
    ? st.matches.map((m) => `<div class="ek-kutu"><div class="ek-satir"><span>${esc(sonucSimge[m.result] || '')} ${esc(m.mode)} · ${esc(m.opponent)}</span><b>${m.points ? `+${esc(m.points)} puan` : ''}</b></div>
        ${m.why ? `<p class="ek-kucuk ek-kotu">Neden kaybettin: ${esc(m.why.join(' '))}</p>` : ''}
        ${dugme({ e: 'pvpIzle', veri: { id: m.id }, metin: '▶️ İzle' })}</div>`).join('')
    : not('Henüz maçın yok.');

  return [
    kart({
      baslik: '🌐 Gerçek rakipler',
      rozet: etiket(`Sırada: 1v1 ${st.waiting['1v1']} · 3v3 ${st.waiting['3v3']}`),
      icerik: not('Askerini seç, "Maç ara"ya bas; ilk bekleyen oyuncuyla maçın sunucuda oynanır.')
        + katli('Kurallar ve ödüller', not(kurallar), { k: 'pvp-kurallar' })
    }),
    sira,
    kart({ baslik: "🏆 Bu haftanın ilk 10'u", icerik: ilk10 + benim }),
    kart({ baslik: '📜 Son maçların', icerik: maclar })
  ].join('');
}

// Arena sahnesine verilen birim görünümü; başka oyunculardan gelen adlar etkisizleştirilir
function birimGorunumu(u, taraf) {
  return {
    uid: u.uid, name: esc(u.name), icon: esc(u.icon || (taraf === 'ally' ? '⚔️' : '🥷')),
    avatar: taraf === 'ally' ? 'assets/soldier_avatar.jpg' : 'assets/gladiator_rival.jpg',
    hp: u.maxHp, maxHp: u.maxHp, atk: u.atk,
    skills: Array.isArray(u.skills) && u.skills.length ? u.skills : ['shieldWall'],
    row: u.row || 'front'
  };
}

function tekrarOynat(b, { allies, enemies, sim, title, resultText, why }) {
  return b.arenaBaslat({
    mode: 'colosseum',
    context: title,
    rank: 'Gerçek rakip · tekrar',
    allies: allies.map((u) => birimGorunumu(u, 'ally')),
    enemies: enemies.map((u) => birimGorunumu(u, 'enemy')),
    loot: why && why.length ? why.map((t) => '💡 ' + t) : [],
    replay: sim,
    onComplete: () => {
      if (resultText) b.bildir(resultText, resultText.startsWith('🏆') ? 'success' : 'info');
    }
  });
}

const ekran = {
  id: 'kolezyum',
  kilit: 'colosseum',
  ornekSecenekler: () => [{ sekme: 'duel' }, { sekme: 'lig' }, { sekme: 'pvp' }],
  baslik: () => ['🏟️', 'Kolezyum'],

  govde(b, secenek) {
    secenek.sekme = secenek.sekme || 'duel';
    if (secenek.sampiyon == null) secenek.sampiyon = sonSampiyon;
    const icerik = secenek.sekme === 'lig' ? ligSekmesi(b) : (secenek.sekme === 'pvp' ? pvpSekmesi(b, secenek) : duelloSekmesi(b, secenek));
    return kap(sekmeler(SEKMELER, secenek.sekme, 'sekme') + icerik);
  },

  // Gerçek rakip verisi sunucudan bir kez yüklenir; eylemlerden sonra yeniden istenir
  sonra(b, secenek) {
    if (secenek.sekme !== 'pvp' || !cevrimici(b) || !(b.girisli && b.girisli())) return;
    if (secenek.pvpVeri || secenek.pvpYukleniyor || secenek.pvpHata) return;
    secenek.pvpYukleniyor = true;
    b.pvp.status()
      .then((v) => { secenek.pvpVeri = v; })
      .catch((e) => { secenek.pvpHata = (e && e.message) || 'Sunucuya ulaşılamadı.'; })
      .finally(() => { secenek.pvpYukleniyor = false; yenile(); });
  },

  degisimler: {
    sampiyon(b, el, secenek) {
      secenek.sampiyon = parseInt(el.value, 10) || 0;
      sonSampiyon = secenek.sampiyon;
    }
  },

  eylemler: {
    sekme(b, el, secenek) {
      secenek.sekme = el.dataset.sekme;
    },

    git(b, el) {
      return { git: el.dataset.hedef };
    },

    mevzi(b, el, secenek) {
      const s = asker(b)[secenek.sampiyon];
      if (!s) return false;
      const r = b.gameState.setSoldierRow(secenek.sampiyon, s.row === 'back' ? 'front' : 'back');
      if (r && r.success === false) b.bildir(r.message, 'error');
      return undefined;
    },

    taktik(b, el) {
      const r = b.gameState.applyCombatPreset(parseInt(el.dataset.no, 10));
      if (r.success) b.bildir(r.message, 'info');
    },

    taktikKaydet(b) {
      const aktif = b.gameState.state.combatPresets?.activePresetId || 1;
      const r = b.gameState.saveCombatPreset(aktif);
      if (r.success) b.bildir(r.message, 'success');
    },

    iyilestir(b, el, secenek) {
      const r = b.gameState.healSoldierInstantly(secenek.sampiyon);
      b.bildir(r.message, r.success ? 'success' : 'error');
    },

    async dovus(b, el, secenek) {
      const gs = b.gameState;
      const idx = secenek.sampiyon;
      const sampiyon = asker(b)[idx];
      if (!sampiyon) { b.bildir('Kolezyuma çıkacak bir şampiyon bulunamadı!', 'error'); return false; }
      if ((sampiyon.hp || 0) <= 15) {
        b.bildir(`⚠️ ${sampiyon.name} ağır yaralı (Can: ${sampiyon.hp}/${sampiyon.maxHp}). Kolezyuma çıkmadan önce iyileştirilmelidir!`, 'error');
        return false;
      }
      const r = await gs.executeColosseum1v1Match(idx);
      if (!r.success) { b.bildir(r.message, 'error'); return false; }
      b.hudYenile();

      const istat = gs.getSoldierFullStats(idx) || { totalAtk: 65, totalMaxHp: 500 };
      const dolu = b.GAME_CONFIG.TREASURY_WEEKLY_BUDGET.FULL_MESSAGE;
      const eloSatiri = `⭐ ${r.ratingDelta >= 0 ? '+' : ''}${r.ratingDelta} ELO (yeni puan ${r.newRating})`;
      const odulSatiri = r.rewardKeys > 0 ? '🔑 +1 Arena Anahtarı' : '🏆 Haftalık lig puanı +3';
      const basladi = b.arenaBaslat({
        mode: 'colosseum',
        context: `Haftalık Kolezyum · <strong>${esc(r.opponentName)}</strong> ile 1v1 Düello`,
        rank: `ELO ${r.newRating} · ${r.tier ? r.tier.name : 'Lig maçı'}`,
        allies: [{
          uid: r.allyUid, name: r.championName || sampiyon.name, icon: sampiyon.icon || '🦁',
          avatar: sampiyon.avatar || 'assets/soldier_avatar.jpg', sourceIndex: idx,
          hp: r.championStartHp != null ? r.championStartHp : istat.totalMaxHp, maxHp: r.championMaxHp || istat.totalMaxHp,
          atk: istat.totalAtk,
          skills: Array.isArray(sampiyon.skills) && sampiyon.skills.length ? sampiyon.skills : ['shieldWall', 'armorBreaker'],
          row: sampiyon.row || 'front'
        }],
        enemies: [{
          uid: r.enemyUid, name: esc(r.opponentName), icon: esc(r.opponentIcon || '🥷'), avatar: 'assets/gladiator_rival.jpg',
          hp: r.opponentHp || 350, maxHp: r.opponentHp || 350, atk: r.opponentAtk || 50, skills: ['armorBreaker', 'cleave'], row: 'front'
        }],
        loot: [`🪙 +${r.rewardAda} ASTRA${r.budgetFull ? ' · ' + dolu : ''}`, eloSatiri, odulSatiri],
        replay: r.replay,
        onComplete: () => {
          b.hudYenile();
          if (r.isVictory) {
            b.bildir(`🏆 Zafer! +${r.rewardAda} ASTRA ve ${r.ratingDelta >= 0 ? '+' : ''}${r.ratingDelta} ELO kazanıldı!${r.budgetFull ? ' ⏳ ' + dolu : ''}`, 'success');
            return {
              altBaslik: `${r.opponentName} yenildi`,
              satirlar: [`🪙 +${r.rewardAda} ASTRA`, eloSatiri, odulSatiri],
              not: r.budgetFull ? dolu : '',
              eylemler: [{ etiket: '🏟️ Kolezyuma dön', tikla: () => ac('kolezyum') }]
            };
          }
          b.bildir('💀 Mağlubiyet! Şampiyonun yaralandı.', 'error');
          return {
            baslik: '💀 MAĞLUBİYET',
            altBaslik: `${r.opponentName} kazandı`,
            satirlar: [eloSatiri, '🩹 Şampiyonun yaralandı'],
            not: 'Yaralı şampiyonu buğdayla ya da şifalı otla iyileştirip yeniden dene.',
            eylemler: [
              { etiket: '🌾 Kışlaya git (iyileştir)', birincil: true, tikla: () => ac('kisla') },
              { etiket: '🏟️ Kolezyuma dön', tikla: () => ac('kolezyum') }
            ]
          };
        }
      });
      return basladi ? false : undefined;
    },

    // ── Gerçek rakipler ──
    async giris(b, el, secenek) {
      if (await b.girisIste()) { secenek.pvpVeri = null; secenek.pvpHata = null; }
      else return false;
      return undefined;
    },

    pvpYenile(b, el, secenek) {
      secenek.pvpVeri = null;
      secenek.pvpHata = null;
    },

    pvpMod(b, el) {
      pvpMod = el.dataset.mod;
      pvpSecili = (pvpSecili || []).slice(0, pvpMod === '3v3' ? 3 : 1);
    },

    pvpSec(b, el) {
      const i = Number(el.dataset.idx);
      const gerek = pvpMod === '3v3' ? 3 : 1;
      const secili = (pvpSecili || []).includes(i);
      if (gerek === 1) pvpSecili = [i];
      else pvpSecili = secili ? pvpSecili.filter((x) => x !== i) : [...(pvpSecili || []), i].slice(-gerek);
    },

    async pvpCik(b, el, secenek) {
      try {
        const r = await b.pvp.leave();
        b.bildir(r.message, r.success ? 'success' : 'error');
      } catch (e) {
        b.bildir(e.message, 'error');
      }
      secenek.pvpVeri = null;
    },

    async pvpSira(b, el, secenek) {
      let r;
      try {
        r = await b.pvp.queue(pvpMod, pvpSecili);
      } catch (e) {
        b.bildir(e.message, 'error');
        secenek.pvpVeri = null;
        return undefined;
      }
      secenek.pvpVeri = null;
      if (!r.success) { b.bildir(r.message, 'error'); return undefined; }
      if (r.queued) { b.bildir(r.message, 'success'); return undefined; }
      const basladi = tekrarOynat(b, {
        allies: r.allies, enemies: r.enemies, sim: r.sim,
        title: `Gerçek rakip · <strong>${esc(r.opponentName)}</strong> (${esc(r.mode)})`, resultText: r.message, why: r.why
      });
      return basladi ? false : undefined;
    },

    async pvpIzle(b, el, secenek) {
      try {
        const m = await b.pvp.match(el.dataset.id);
        const kayit = (secenek.pvpVeri && secenek.pvpVeri.matches || []).find((x) => String(x.id) === String(el.dataset.id));
        const basladi = tekrarOynat(b, {
          allies: m.a.units, enemies: m.b.units, sim: m.sim,
          title: `Tekrar · <strong>${esc(m.a.name)}</strong> vs <strong>${esc(m.b.name)}</strong> (${esc(m.mode)})`,
          resultText: '', why: kayit && kayit.why
        });
        return basladi ? false : undefined;
      } catch (e) {
        b.bildir(e.message, 'error');
        return false;
      }
    }
  }
};

export default ekranKaydet(ekran);
