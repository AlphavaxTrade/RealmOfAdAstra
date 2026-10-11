// Realm of AdAstra — Taktik Savaş Motoru
// ============================================================================
// Birim düzeyinde, sıra tabanlı savaş. Aynı motor zindanı, kolezyumu ve
// dünya bossunu besler; tarayıcıda ve sunucuda aynı sonucu verir.
//
// Motor saf hesaptır: DOM bilmez, oyun durumuna yazmaz. Girdi olarak iki birim
// listesi ve bir tohum alır, tur tur olay kaydı (log) üretir. Aynı tohum aynı
// savaşı verir; sunucu otoritesi ve savaş öncesi Monte Carlo tahmini buna dayanır.
//
// DİKKAT: rastgele sayı çekme SIRASI savaşın sonucudur. Bir satırı taşımadan
// önce tests/altin/savas_kayit.json (altın kayıt) ile karşılaştır.
// ============================================================================

import { GAME_CONFIG } from './config.js';

// ─────────────────────────────────────────────────────────────────────────
// Tohumlu rastgele sayı üreteci (mulberry32)
// ─────────────────────────────────────────────────────────────────────────
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Birim ve durum (statü) yardımcıları
// ─────────────────────────────────────────────────────────────────────────
const canliMi = u => u.hp > 0;
const hayattaVar = liste => liste.some(canliMi);

const durumToplami = (u, tur) => u.statuses
  .filter(s => s.type === tur)
  .reduce((toplam, s) => toplam + (s.magnitude || 0), 0);
const durumVar = (u, tur) => u.statuses.some(s => s.type === tur);

// stackable:false olan durum yeniden gelirse süre ve güç büyük olana yükseltilir, ikinci kopya eklenmez
function durumEkle(u, durum) {
  const var_ = u.statuses.find(s => s.type === durum.type && s.stackable === false);
  if (var_) {
    var_.turns = Math.max(var_.turns, durum.turns);
    var_.magnitude = Math.max(var_.magnitude || 0, durum.magnitude || 0);
    return;
  }
  u.statuses.push({ stackable: true, ...durum });
}

// Etkin değerler: durumların etkisi uygulanmış saldırı / zırh / hız
const etkinSaldiri = u => u.atk * (1 + durumToplami(u, 'rage')) * (durumVar(u, 'weaken') ? 0.7 : 1);
const etkinZirh = u => u.armor * (1 + durumToplami(u, 'fortify')) * (durumVar(u, 'sunder') ? 0.6 : 1);
const etkinHiz = u => u.speed * (1 + durumToplami(u, 'haste')) * (durumVar(u, 'chill') ? 0.65 : 1);

// Zırhın hasarı azaltma oranı: azalan verimli, hiçbir zaman %100 olmaz
function zirhCarpani(zirh, delme) {
  const etkin = Math.max(0, (zirh || 0) - (delme || 0));
  return 1 - etkin / (etkin + GAME_CONFIG.COMBAT.ARMOR_CONSTANT);
}

// Olay kaydı (log) alanları
const aktorAlanlari = u => ({ actor: u.name, actorIcon: u.icon, actorSide: u.side, actorUid: u.uid });
const hedefAlanlari = u => ({ target: u.name, targetIcon: u.icon, targetUid: u.uid });
function yetenekKaydi(log, self, ad, icon, text) {
  log.push({ type: 'ability', ability: ad, icon, ...aktorAlanlari(self), text });
}

// ─────────────────────────────────────────────────────────────────────────
// Birim oluşturma
// ─────────────────────────────────────────────────────────────────────────
let birimSayaci = 0;

export function createUnit(spec) {
  const maxHp = Math.max(1, Math.round(spec.maxHp != null ? spec.maxHp : 100));
  const skills = Array.isArray(spec.skills) && spec.skills.length ? [...spec.skills] : ['shieldWall'];

  return {
    uid: spec.uid || `u_${++birimSayaci}`,
    sourceIndex: spec.sourceIndex != null ? spec.sourceIndex : -1,   // oyuncunun asker listesindeki sırası
    name: spec.name || 'AdAstra Şampiyonu',
    icon: spec.icon || '⚔️',
    level: spec.level || 1,
    side: spec.side || 'ally',

    maxHp,
    hp: Math.max(0, Math.round(spec.hp != null ? spec.hp : maxHp)),
    atk: Math.max(1, Math.round(spec.atk != null ? spec.atk : 25)),
    armor: Math.max(0, Math.round(spec.armor != null ? spec.armor : 10)),
    speed: Math.max(1, Math.round(spec.speed != null ? spec.speed : 10)),
    crit: spec.crit != null ? spec.crit : 0.05,
    critDmg: spec.critDmg != null ? spec.critDmg : GAME_CONFIG.COMBAT.BASE_CRIT_DAMAGE,
    pen: Math.max(0, spec.pen != null ? spec.pen : 5),
    lifesteal: spec.lifesteal || 0,

    row: spec.row || 'front',                 // 'front' | 'back'
    skills,                                   // askerin yetenekleri (müttefik taraf kullanır)
    abilities: spec.abilities || null,        // canavar yetenekleri (düşman taraf kullanır)
    abilityCooldown: spec.abilityCooldown || 3,
    actionsPerRound: Math.max(1, spec.actionsPerRound || 1),   // boss tur başına birden çok hamle yapabilir

    statuses: [],
    cooldown: 0,
    usedLastStand: false,

    // Savaş sonu raporu için sayaçlar
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
    kills: 0
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Hedef seçimi — ön saf / arka saf mevzisi
// Taunt her şeyi ezer. Delici saldırı arka safın en yaralısını bulur.
// Ön saf ayaktayken vuruşların %85'i ön safa gider, %15'i arkaya sızar.
// ─────────────────────────────────────────────────────────────────────────
export function selectTarget(attacker, enemies, rng = Math.random, { piercing = false } = {}) {
  const canli = enemies.filter(canliMi);
  if (canli.length === 0) return null;

  const alayciler = canli.filter(u => durumVar(u, 'taunt'));
  if (alayciler.length > 0) return alayciler[Math.floor(rng() * alayciler.length)];

  if (piercing) {
    const arka = canli.filter(u => u.row === 'back');
    const havuz = arka.length > 0 ? arka : canli;
    return havuz.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
  }

  const on = canli.filter(u => u.row === 'front');
  if (on.length > 0) {
    const kapsama = GAME_CONFIG.COMBAT.FRONTLINE_COVER != null ? GAME_CONFIG.COMBAT.FRONTLINE_COVER : 0.85;
    if (rng() < kapsama) return on[Math.floor(rng() * on.length)];
  }

  return canli[Math.floor(rng() * canli.length)];
}

// ─────────────────────────────────────────────────────────────────────────
// Hasar, kalkan, iyileştirme
// ─────────────────────────────────────────────────────────────────────────
const kalkanToplami = u => u.statuses
  .filter(s => s.type === 'shield')
  .reduce((t, s) => t + s.magnitude, 0);

function kalkanTuket(u, miktar) {
  let kalan = miktar;
  for (const s of u.statuses) {
    if (s.type !== 'shield' || kalan <= 0) continue;
    const alinan = Math.min(s.magnitude, kalan);
    s.magnitude -= alinan;
    kalan -= alinan;
  }
  u.statuses = u.statuses.filter(s => !(s.type === 'shield' && s.magnitude <= 0));
}

// Sıra: kritik zarı → zırh → ±%8 varyans (ikinci zar). Kalkan önce emer.
function hasarVur(saldirgan, hedef, hamHasar, rng, log, etiket = '') {
  let hasar = hamHasar;
  const kritik = rng() < saldirgan.crit;
  if (kritik) hasar *= saldirgan.critDmg;

  hasar *= zirhCarpani(etkinZirh(hedef), saldirgan.pen);
  hasar *= 0.92 + rng() * 0.16;
  hasar = Math.max(1, Math.round(hasar));

  const emilen = Math.min(kalkanToplami(hedef), hasar);
  if (emilen > 0) {
    kalkanTuket(hedef, emilen);
    hasar -= emilen;
  }

  hedef.hp = Math.max(0, hedef.hp - hasar);
  saldirgan.damageDealt += hasar;
  hedef.damageTaken += hasar;

  if (saldirgan.lifesteal > 0 && hasar > 0) {
    const iyilesen = Math.round(hasar * saldirgan.lifesteal);
    saldirgan.hp = Math.min(saldirgan.maxHp, saldirgan.hp + iyilesen);
    saldirgan.healingDone += iyilesen;
  }

  const oldu = hedef.hp <= 0;
  if (oldu) saldirgan.kills += 1;

  log.push({
    type: 'damage',
    ...aktorAlanlari(saldirgan), ...hedefAlanlari(hedef),
    amount: hasar, absorbed: emilen, isCrit: kritik, label: etiket,
    targetHp: hedef.hp, targetMaxHp: hedef.maxHp,
    died: oldu
  });
}

function iyilestir(iyilestirici, hedef, miktar, log) {
  const onceki = hedef.hp;
  hedef.hp = Math.min(hedef.maxHp, hedef.hp + Math.round(miktar));
  const iyilesen = hedef.hp - onceki;
  if (iyilesen > 0) {
    iyilestirici.healingDone += iyilesen;
    log.push({
      type: 'heal',
      ...aktorAlanlari(iyilestirici), ...hedefAlanlari(hedef),
      amount: iyilesen, targetHp: hedef.hp, targetMaxHp: hedef.maxHp
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Asker yetenekleri (6 aktif + 1 pasif). Bir askerin 1-3 yeteneği olur;
// sırayla denenir, ilk uygulanabilen kullanılır ve bekleme süresi başlar.
// execute(self, own, foes, rng, log) → kullanıldıysa true
// ─────────────────────────────────────────────────────────────────────────
export const PLAYER_SKILLS = {
  shieldWall: {
    id: 'shieldWall', name: 'Kalkan Duvarı', icon: '🛡️', role: 'Tanklık', cooldown: 3,
    desc: 'Kendine 2 tur taunt çeker, +%45 zırh ve %20 kalkan kazanır.',
    execute(self, own, foes, rng, log) {
      const kalkan = Math.round(self.maxHp * 0.20);
      durumEkle(self, { type: 'taunt', turns: 2, stackable: false });
      durumEkle(self, { type: 'fortify', turns: 2, magnitude: 0.45, stackable: false });
      durumEkle(self, { type: 'shield', turns: 3, magnitude: kalkan });
      yetenekKaydi(log, self, 'Kalkan Duvarı', '🛡️',
        `${self.name} Kalkan Duvarı kurdu: Düşman ateşini üzerine çekiyor (+%45 Zırh, ${kalkan} Kalkan)!`);
      return true;
    }
  },

  shockwave: {
    id: 'shockwave', name: 'Şok Dalgası', icon: '⚡', role: 'AoE Temizleme', cooldown: 3,
    desc: 'Ön saftaki en fazla 3 hedefe alan hasarı vurur.',
    execute(self, own, foes, rng, log) {
      const canli = foes.filter(canliMi);
      const on = canli.filter(u => u.row === 'front');
      const hedefler = (on.length > 0 ? on : canli).slice(0, 3);
      if (hedefler.length === 0) return false;
      yetenekKaydi(log, self, 'Şok Dalgası', '⚡',
        `${self.name} yeri sarsan bir Şok Dalgası gönderdi — ${hedefler.length} hedefe vurdu!`);
      for (const h of hedefler) hasarVur(self, h, etkinSaldiri(self) * 0.85, rng, log, 'Şok Dalgası');
      return true;
    }
  },

  fieldMedic: {
    id: 'fieldMedic', name: 'Sahra Merhemi', icon: '✨', role: 'Sağlık / Destek', cooldown: 3,
    desc: 'En yaralı müttefiği iyileştirir, lanetleri temizler ve moral verir.',
    execute(self, own, foes, rng, log) {
      const yarali = own.filter(canliMi).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
      if (!yarali) return false;
      const miktar = Math.round(self.maxHp * 0.22 + etkinSaldiri(self) * 0.5);
      yetenekKaydi(log, self, 'Sahra Merhemi', '✨',
        `${self.name} Sahra Merhemi uyguladı: ${yarali.name} ${miktar} HP iyileşti ve arındı!`);
      iyilestir(self, yarali, miktar, log);
      const LANETLER = ['burn', 'poison', 'weaken', 'chill', 'sunder'];
      yarali.statuses = yarali.statuses.filter(s => !LANETLER.includes(s.type));
      durumEkle(yarali, { type: 'rage', turns: 2, magnitude: 0.15, stackable: false });
      return true;
    }
  },

  armorBreaker: {
    id: 'armorBreaker', name: 'Zırh Kırıcı', icon: '🪓', role: 'Anti-Tank', cooldown: 3,
    desc: 'Hedefe sert bir darbe indirir ve zırhını 3 tur kırar (-%40 zırh).',
    execute(self, own, foes, rng, log) {
      const hedef = selectTarget(self, foes, rng);
      if (!hedef) return false;
      yetenekKaydi(log, self, 'Zırh Kırıcı', '🪓',
        `${self.name} ${hedef.name}'in zırhına sert bir darbe indirdi (-%40 zırh)!`);
      durumEkle(hedef, { type: 'sunder', turns: 3, stackable: false });   // hasardan ÖNCE: darbe kırık zırha iner
      hasarVur(self, hedef, etkinSaldiri(self) * 1.30, rng, log, 'Zırh Kırıcı');
      return true;
    }
  },

  stunStrike: {
    id: 'stunStrike', name: 'Sersemletme Darbesi', icon: '💫', role: 'Kontrol', cooldown: 4,
    desc: 'Hedefe vurur ve 1 tur sersemleterek hareketini engeller.',
    execute(self, own, foes, rng, log) {
      const hedef = selectTarget(self, foes, rng);
      if (!hedef) return false;
      yetenekKaydi(log, self, 'Sersemletme Darbesi', '💫',
        `${self.name} kafaya indirdiği darbeyle ${hedef.name}'i sersemletti (1 tur devre dışı)!`);
      durumEkle(hedef, { type: 'stun', turns: 1, stackable: false });
      hasarVur(self, hedef, etkinSaldiri(self) * 1.10, rng, log, 'Sersemletme');
      return true;
    }
  },

  bloodFrenzy: {
    id: 'bloodFrenzy', name: 'Kan Çılgınlığı', icon: '🩸', role: 'Riskli Hasar', cooldown: 3,
    desc: 'Kendi zırhını düşürerek 2 tur boyunca saldırı gücünü +%50 artırır.',
    execute(self, own, foes, rng, log) {
      durumEkle(self, { type: 'rage', turns: 2, magnitude: 0.50, stackable: false });
      durumEkle(self, { type: 'sunder', turns: 2, stackable: false });
      yetenekKaydi(log, self, 'Kan Çılgınlığı', '🩸',
        `${self.name} Kan Çılgınlığına girdi: +%50 Saldırı Gücü kazandı (-%40 Zırh feragatiyle)!`);
      const hedef = selectTarget(self, foes, rng);
      if (hedef) hasarVur(self, hedef, etkinSaldiri(self) * 1.25, rng, log, 'Çılgın Vuruş');
      return true;
    }
  },

  // Pasif: her hamle başında motor tetik koşulunu denetler, bir kez çalışır
  lastStand: {
    id: 'lastStand', name: 'Son Nefes', icon: '🔥', role: 'Pasif', isPassive: true,
    desc: 'Canı %25 altına düştüğünde bir kerelik %35 kalkan ve zırh patlaması tetikler.',
    checkTrigger(self, log) {
      if (self.usedLastStand || !canliMi(self)) return false;
      if (self.hp > self.maxHp * 0.25) return false;
      self.usedLastStand = true;
      const kalkan = Math.round(self.maxHp * 0.35);
      durumEkle(self, { type: 'shield', turns: 3, magnitude: kalkan });
      durumEkle(self, { type: 'fortify', turns: 3, magnitude: 0.50, stackable: false });
      yetenekKaydi(log, self, 'Son Nefes', '🔥',
        `🔥 ${self.name} ölümün eşiğinde Son Nefes pasifini tetikledi: ${kalkan} Kalkan ve +%50 Zırh kazandı!`);
      return true;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Canavar yetenekleri (zindan ve boss tarafı). Aynı imza: kullanıldıysa true.
// ─────────────────────────────────────────────────────────────────────────
const CANAVAR_YETENEKLERI = {
  // Alan hasarı EN FAZLA MAX_AOE_TARGETS hedef vurur. Sınırsız olsaydı 18 kişilik
  // ordu 18 kat hasar yer, tek hedefli saldırılar anlamsızlaşır, denge eğrisi zıplardı.
  cleave(self, own, foes, rng, log) {
    const canli = foes.filter(canliMi);
    const on = canli.filter(u => u.row === 'front');
    const oncelikli = on.length > 0 ? on : canli;
    const sonrakiler = canli.filter(u => !oncelikli.includes(u));
    const hedefler = [...oncelikli, ...sonrakiler].slice(0, GAME_CONFIG.COMBAT.MAX_AOE_TARGETS || 4);
    if (hedefler.length === 0) return false;
    yetenekKaydi(log, self, 'Yarma Darbesi', '💥',
      `${self.name} geniş bir yay çizerek ön safta ${hedefler.length} birimi biçti!`);
    for (const h of hedefler) hasarVur(self, h, etkinSaldiri(self) * 0.62, rng, log, 'Yarma Darbesi');
    return true;
  },

  sunder(self, own, foes, rng, log) {
    const hedef = selectTarget(self, foes, rng);
    if (!hedef) return false;
    yetenekKaydi(log, self, 'Zırh Parçalayıcı', '🪓',
      `${self.name} ${hedef.name}'in zırhını paramparça etti (-%40 zırh)!`);
    durumEkle(hedef, { type: 'sunder', turns: 3, stackable: false });
    hasarVur(self, hedef, etkinSaldiri(self) * 1.1, rng, log, 'Zırh Parçalayıcı');
    return true;
  },

  regenerate(self, own, foes, rng, log) {
    const miktar = Math.round(self.maxHp * 0.08);
    yetenekKaydi(log, self, 'Kadim Yenilenme', '🌀', `${self.name} kadim güçlerden beslenip ${miktar} can yeniledi.`);
    iyilestir(self, self, miktar, log);
    return true;
  },

  terrify(self, own, foes, rng, log) {
    const hedef = selectTarget(self, foes, rng);
    if (!hedef) return false;
    yetenekKaydi(log, self, 'Dehşet Çığlığı', '😱', `${self.name} dehşet çığlığı attı — ${hedef.name} bir tur donakaldı!`);
    durumEkle(hedef, { type: 'stun', turns: 1, stackable: false });
    return true;
  },

  swoop(self, own, foes, rng, log) {
    const hedef = selectTarget(self, foes, rng, { piercing: true });
    if (!hedef) return false;
    yetenekKaydi(log, self, 'Kanat Dalışı', '🦅', `${self.name} ön safı aşıp arka safa daldı!`);
    hasarVur(self, hedef, etkinSaldiri(self) * 1.35, rng, log, 'Kanat Dalışı');
    return true;
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Boss fazları: düşman toplam canı atPct altına inince bir kez tetiklenir.
// Seviye 9 (Taş Golyat) ve seviye 18 (IGNIS) için.
// ─────────────────────────────────────────────────────────────────────────
export const DEFAULT_BOSS_PHASES = {
  9: [
    {
      atPct: 0.50,
      name: 'Taş Kabuk',
      text: 'Kadim Taş Golyat taş kabuğuna büründü! (+%50 Zırh ve devasa Kalkan)',
      onEnter({ enemies }) {
        for (const e of enemies.filter(canliMi)) {
          durumEkle(e, { type: 'fortify', turns: 3, magnitude: 0.50, stackable: false });
          durumEkle(e, { type: 'shield', turns: 3, magnitude: Math.round(e.maxHp * 0.25) });
        }
      }
    }
  ],
  18: [
    {
      atPct: 0.60,
      name: 'Ejderha Gazabı',
      text: 'Kıyamet Ejderhası IGNIS kükreyerek alev saçtı! (+%50 Saldırı Gücü)',
      onEnter({ enemies }) {
        for (const e of enemies.filter(canliMi)) {
          durumEkle(e, { type: 'rage', turns: 4, magnitude: 0.50, stackable: false });
        }
      }
    },
    {
      atPct: 0.25,
      name: 'Kıyamet Alevi',
      text: 'IGNIS son nefesinde tüm ön safı alevlere boğdu! (Sersemletme Darbesi)',
      onEnter({ allies, rng }) {
        const canli = allies.filter(canliMi);
        const on = canli.filter(u => u.row === 'front');
        for (const a of (on.length > 0 ? on : canli)) {
          if (rng() < 0.75) durumEkle(a, { type: 'stun', turns: 1, stackable: false });
        }
      }
    }
  ]
};

// ─────────────────────────────────────────────────────────────────────────
// Tur sonu: yanma/zehir hasarı, sonra tüm durumların süresi bir azalır
// ─────────────────────────────────────────────────────────────────────────
function turSonuDurumlari(u, log) {
  if (!canliMi(u)) return;

  for (const s of u.statuses) {
    if (s.type !== 'burn' && s.type !== 'poison') continue;
    const hasar = Math.max(1, Math.round(s.magnitude));
    u.hp = Math.max(0, u.hp - hasar);
    u.damageTaken += hasar;
    log.push({
      type: 'dot', dotType: s.type,
      ...hedefAlanlari(u),
      amount: hasar, targetHp: u.hp, targetMaxHp: u.maxHp,
      died: u.hp <= 0
    });
  }

  u.statuses = u.statuses
    .map(s => ({ ...s, turns: s.turns - 1 }))
    .filter(s => s.turns > 0 && !(s.type === 'shield' && s.magnitude <= 0));
}

// Bir birimin sırası: pasif tetik → bekleme bitmişse yetenek → olmadıysa düz saldırı
function hamleYap(birim, own, foes, rng, log) {
  const muttefik = birim.side === 'ally';
  const yetenekler = birim.skills && birim.skills.length ? birim.skills : ['shieldWall'];
  if (muttefik && yetenekler.includes('lastStand')) {
    PLAYER_SKILLS.lastStand.checkTrigger(birim, log);
  }

  let yetenekKullandi = false;
  if (birim.cooldown <= 0) {
    if (muttefik) {
      for (const anahtar of yetenekler) {
        const yetenek = PLAYER_SKILLS[anahtar];
        if (!yetenek || yetenek.isPassive || typeof yetenek.execute !== 'function') continue;
        if (yetenek.execute(birim, own, foes, rng, log)) {
          birim.cooldown = yetenek.cooldown || 3;
          yetenekKullandi = true;
          break;
        }
      }
    } else if (birim.abilities && birim.abilities.length) {
      const kit = CANAVAR_YETENEKLERI[birim.abilities[Math.floor(rng() * birim.abilities.length)]];
      if (kit && kit(birim, own, foes, rng, log)) {
        birim.cooldown = birim.abilityCooldown || 3;
        yetenekKullandi = true;
      }
    }
  } else {
    birim.cooldown--;
  }

  if (!yetenekKullandi) {
    const hedef = selectTarget(birim, foes, rng);
    if (hedef) hasarVur(birim, hedef, etkinSaldiri(birim), rng, log, 'Saldırı');
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ANA SİMÜLASYON
// ─────────────────────────────────────────────────────────────────────────
export function simulateBattle({
  allies,
  enemies,
  seed = Date.now(),
  maxRounds = GAME_CONFIG.COMBAT.MAX_ROUNDS,
  rageAfterRound = GAME_CONFIG.COMBAT.RAGE_AFTER_ROUND,
  bossPhases = null            // [{ atPct, name, text, onEnter(ctx) }]
} = {}) {
  const rng = makeRng(seed);
  const log = [];
  const rounds = [];

  allies.forEach(u => { u.side = 'ally'; });
  enemies.forEach(u => { u.side = 'enemy'; });

  const dusmanToplamCan = enemies.reduce((t, u) => t + u.maxHp, 0);
  let fazSirasi = -1;
  let tur = 0;
  let ofkeUyarildi = false;

  while (tur < maxRounds && hayattaVar(allies) && hayattaVar(enemies)) {
    tur++;
    const turBasiLog = log.length;

    // Boss fazı: en derin eşikten başlanır, bir turda en fazla bir faz geçilir
    if (bossPhases) {
      const canYuzdesi = enemies.reduce((t, u) => t + Math.max(0, u.hp), 0) / Math.max(1, dusmanToplamCan);
      for (let i = bossPhases.length - 1; i > fazSirasi; i--) {
        if (canYuzdesi > bossPhases[i].atPct) continue;
        fazSirasi = i;
        const faz = bossPhases[i];
        log.push({ type: 'phase', text: `⚡ FAZ ${i + 2}: ${faz.name} — ${faz.text}` });
        if (typeof faz.onEnter === 'function') faz.onEnter({ allies, enemies, log, rng });
        break;
      }
    }

    // Öfke: uzayan savaş cezalandırılır; eşikten sonra düşman saldırısına sabit zam gelir.
    if (tur > rageAfterRound) {
      for (const e of enemies.filter(canliMi)) {
        durumEkle(e, { type: 'rage', turns: 99, magnitude: GAME_CONFIG.COMBAT.RAGE_PER_ROUND, stackable: false });
      }
      if (!ofkeUyarildi) {
        ofkeUyarildi = true;
        log.push({ type: 'rage', text: `🔥 ÖFKE! ${rageAfterRound}. tur geçildi — düşman her tur güçleniyor. Savaşı bitir!` });
      }
    }

    // İnisiyatif: hız ±%10 zarla her tur yeniden sıralanır; çok hamleli birim sıraya birkaç kez girer
    const sira = [];
    for (const u of [...allies, ...enemies]) {
      if (!canliMi(u)) continue;
      for (let a = 0; a < u.actionsPerRound; a++) {
        sira.push({ u, hiz: etkinHiz(u) * (0.9 + rng() * 0.2) - a * 0.001 });
      }
    }
    sira.sort((x, y) => y.hiz - x.hiz);

    for (const { u: birim } of sira) {
      if (!canliMi(birim)) continue;
      if (!hayattaVar(allies) || !hayattaVar(enemies)) break;

      if (durumVar(birim, 'stun')) {
        log.push({ type: 'stunned', ...aktorAlanlari(birim) });
        continue;
      }

      const own = birim.side === 'ally' ? allies : enemies;
      const foes = birim.side === 'ally' ? enemies : allies;
      hamleYap(birim, own, foes, rng, log);
    }

    [...allies, ...enemies].forEach(u => turSonuDurumlari(u, log));

    rounds.push({
      round: tur,
      events: log.slice(turBasiLog),
      allyHp: allies.reduce((t, u) => t + Math.max(0, u.hp), 0),
      allyMaxHp: allies.reduce((t, u) => t + u.maxHp, 0),
      enemyHp: enemies.reduce((t, u) => t + Math.max(0, u.hp), 0),
      enemyMaxHp: dusmanToplamCan,
      aliveAllies: allies.filter(canliMi).length,
      aliveEnemies: enemies.filter(canliMi).length
    });
  }

  const dusmanBitti = !hayattaVar(enemies);
  const muttefikBitti = !hayattaVar(allies);
  const victory = dusmanBitti && !muttefikBitti;

  return {
    victory,
    winner: victory ? 'ally' : (muttefikBitti ? 'enemy' : 'draw'),
    timeout: !dusmanBitti && !muttefikBitti,
    rounds,
    roundCount: tur,
    log,
    allies,
    enemies,
    survivors: allies.filter(canliMi).length,
    casualties: allies.filter(u => !canliMi(u)).length,
    // "En çok katkı veren" tablosu için
    mvp: [...allies].sort((a, b) => (b.damageDealt + b.healingDone) - (a.damageDealt + a.healingDone))[0] || null,
    totalDamageDealt: allies.reduce((t, u) => t + u.damageDealt, 0),
    totalDamageTaken: allies.reduce((t, u) => t + u.damageTaken, 0)
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Savaş öncesi tahmin (Monte Carlo): savaş gerçekten `samples` kez oynanır.
// opts.seedBase verilirse sonuç tekrarlanabilir; yoksa saat tohumu kullanılır.
// ─────────────────────────────────────────────────────────────────────────
export function predictBattle(buildAllies, buildEnemies, samples = 120, opts = {}) {
  const { seedBase = Date.now(), ...savasSecenekleri } = opts;
  let zafer = 0;
  let toplamTur = 0;
  let toplamKayip = 0;
  let zamanAsimi = 0;

  for (let i = 0; i < samples; i++) {
    const sonuc = simulateBattle({
      allies: buildAllies(),
      enemies: buildEnemies(),
      seed: (seedBase ^ (i * 2654435761)) >>> 0,
      ...savasSecenekleri
    });
    if (sonuc.victory) zafer++;
    if (sonuc.timeout) zamanAsimi++;
    toplamTur += sonuc.roundCount;
    toplamKayip += sonuc.casualties;
  }

  const oran = zafer / samples;
  let difficulty = 'Kolay';
  if (oran < 0.15) difficulty = 'İmkansız';
  else if (oran < 0.40) difficulty = 'Çok Zor';
  else if (oran < 0.65) difficulty = 'Zor';
  else if (oran < 0.85) difficulty = 'Dengeli';

  return {
    winChance: Math.round(oran * 100),
    difficulty,
    avgRounds: +(toplamTur / samples).toFixed(1),
    avgCasualties: +(toplamKayip / samples).toFixed(1),
    timeoutRate: +(zamanAsimi / samples).toFixed(2),
    samples
  };
}
