// AdAstra: Canlı Savaş Arenası — DOM Tabanlı Sinematik Savaş Motoru
// Zindan (Dungeon) ve Kolezyum (Colosseum) Canlı Savaş Görselleştirmesi
import { sound } from './audio.js';

// Savaş kaydı innerHTML ile yazılır; asker adları başka oyunculardan gelebilir (kaynakta cleanName ile temizlenir, burası ek savunma katmanı)
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function getMonsterAvatar(level, name) {
  const n = (name || '').toLowerCase();
  if (level === 1 || n.includes('balçık') || n.includes('balcik') || n.includes('slime')) {
    return 'assets/monster_swamp_slime.jpg';
  }
  if (level === 2 || n.includes('goblin')) {
    return 'assets/monster_cave_goblin.jpg';
  }
  if (level === 3 || level === 8 || n.includes('kurt') || n.includes('tazı') || n.includes('tazi') || n.includes('hayalet')) {
    return 'assets/monster_shadow_wolf.jpg';
  }
  if (level === 4 || level === 5 || level === 6 || level === 10 || level === 11 || n.includes('iskelet') || n.includes('kemik') || n.includes('mumya')) {
    return 'assets/monster_skeleton.jpg';
  }
  if (level === 7 || level === 9 || level === 12 || n.includes('golyat') || n.includes('firavun') || n.includes('taş') || n.includes('tas') || n.includes('tarikatçı')) {
    return 'assets/monster_stone_goliath.jpg';
  }
  if (level === 13 || level === 14 || level === 15 || level === 16 || n.includes('ateş') || n.includes('ates') || n.includes('lav') || n.includes('iblis') || n.includes('berserker') || n.includes('şövalye') || n.includes('sovalye')) {
    return 'assets/monster_fire_demon.jpg';
  }
  if (level === 17 || level === 18 || n.includes('ignis') || n.includes('ejderha') || n.includes('gölge lordu') || n.includes('golge lordu')) {
    return 'assets/monster_dragon_ignis.jpg';
  }
  return 'assets/monster_swamp_slime.jpg';
}

export function getUnitAvatar(u) {
  if (u.avatar) return u.avatar;
  if (u.side === 'ally') return 'assets/ui/soldier_1.webp';
  if ((u.name || '').includes('Gladyatör') || (u.name || '').includes('Kael') || (u.name || '').includes('Şampiyon') || (u.name || '').includes('Malok')) {
    return 'assets/gladiator_rival.jpg';
  }
  return getMonsterAvatar(u.level, u.name);
}

export class AdAstraBattleArena {
  constructor(container) {
    this.root = (container && container.classList && container.classList.contains('aa-arena'))
      ? container
      : (container ? container.querySelector('.aa-arena') : null);

    if (!this.root) {
      throw new Error('AdAstraBattleArena: .aa-arena kök elemanı bulunamadı.');
    }
    this._build(this.root);
  }

  _build(root) {
    const SKILLS = [
      { id: 'shield', icon: '🛡️', name: 'Kalkan Duvarı', heal: false, aoe: false, mult: 0, shield: 0.30, cd: 3 },
      { id: 'shieldWall', icon: '🛡️', name: 'Kalkan Duvarı', heal: false, aoe: false, mult: 0, shield: 0.35, cd: 3 },
      { id: 'aoe', icon: '💥', name: 'Şok Dalgası', heal: false, aoe: true, mult: 0.55, shield: 0, cd: 3 },
      { id: 'shockwave', icon: '💥', name: 'Şok Dalgası', heal: false, aoe: true, mult: 0.60, shield: 0, cd: 3 },
      { id: 'heal', icon: '✨', name: 'Sahra Merhemi', heal: true, aoe: false, mult: 0.30, shield: 0, cd: 4 },
      { id: 'fieldMedic', icon: '✨', name: 'Sahra Merhemi', heal: true, aoe: false, mult: 0.35, shield: 0, cd: 4 },
      { id: 'pierce', icon: '🏹', name: 'Delici Ok', heal: false, aoe: false, mult: 1.5, shield: 0, cd: 3, pierce: true },
      { id: 'piercingShot', icon: '🏹', name: 'Delici Atış', heal: false, aoe: false, mult: 1.55, shield: 0, cd: 3, pierce: true },
      { id: 'sunder', icon: '🪓', name: 'Zırh Kırıcı', heal: false, aoe: false, mult: 1.1, shield: 0, cd: 3 },
      { id: 'armorBreaker', icon: '🪓', name: 'Zırh Kırıcı', heal: false, aoe: false, mult: 1.2, shield: 0, cd: 3 },
      { id: 'cleave', icon: '⚔️', name: 'Yarma Darbesi', heal: false, aoe: true, mult: 0.65, cd: 3 },
      { id: 'execute', icon: '💀', name: 'İnfaz Darbesi', heal: false, aoe: false, mult: 1.8, cd: 4 }
    ];

    const MONSTER_SKILLS = [
      { id: 'cleave', icon: '💥', name: 'Yarma Darbesi', aoe: true, mult: 0.5, cd: 3 },
      { id: 'regen', icon: '🌀', name: 'Kadim Yenilenme', heal: true, mult: 0.10, cd: 4 },
      { id: 'roar', icon: '😱', name: 'Dehşet Çığlığı', stun: true, mult: 0, cd: 4 },
      { id: 'slam', icon: '🗿', name: 'Taş Ezmesi', aoe: true, mult: 0.6, cd: 3 },
      { id: 'dragonBreath', icon: '🔥', name: 'Ejderha Nefesi', aoe: true, mult: 0.7, cd: 3 },
      { id: 'poisonBite', icon: '🦂', name: 'Zehirli Isırık', mult: 1.2, cd: 3 }
    ];

    // Örnek Gösterim Verileri
    const PRESETS = {
      dungeon: {
        context: 'Kat 3 · Seviye 9 — <strong>Kadim Taş Golyat</strong> (Zindan Bossu)',
        rank: '+%100 Ganimet',
        allies: [
          { name: 'Savaşçı I', icon: '⚔️', avatar: 'assets/soldier_avatar.jpg', hp: 340, atk: 52, row: 'front', skills: ['shieldWall', 'armorBreaker'] },
          { name: 'Savaşçı II', icon: '🗡️', avatar: 'assets/soldier_avatar.jpg', hp: 310, atk: 58, row: 'front', skills: ['piercingShot'] },
          { name: 'Savaşçı III', icon: '🛡️', avatar: 'assets/soldier_avatar.jpg', hp: 360, atk: 44, row: 'front', skills: ['shieldWall'] },
          { name: 'Savaşçı IV', icon: '🏹', avatar: 'assets/soldier_avatar.jpg', hp: 260, atk: 60, row: 'back', skills: ['piercingShot', 'shockwave'] },
          { name: 'Savaşçı V', icon: '✨', avatar: 'assets/soldier_avatar.jpg', hp: 250, atk: 38, row: 'back', skills: ['fieldMedic'] },
        ],
        enemies: [
          {
            name: 'Kadim Taş Golyat', icon: '🗿', avatar: 'assets/monster_stone_goliath.jpg', level: 9, hp: 2600, atk: 150, boss: true, skills: ['cleave', 'regen', 'roar'],
            phases: [
              { at: 0.6, text: 'FAZ 2 — TAŞ ÖFKESİ', sub: 'Golyat çatladı, saldırıları hızlanıyor.' },
              { at: 0.25, text: 'FAZ 3 — SON DİRENİŞ', sub: 'Golyat çöküşten önce son gücünü topluyor.' }
            ]
          }
        ],
        loot: ['🧩 +3 Teçhizat Parçası', '🗝️ Zindan Anahtarı', '🟣 +4.200 ADASTRA']
      },
      colosseum: {
        context: 'Haftalık Kolezyum · <strong>Gölge Gladyatörü Kael</strong> ile Eşleşme',
        rank: 'ELO 1.240',
        allies: [
          { name: 'Şampiyon', icon: '🦁', avatar: 'assets/soldier_avatar.jpg', hp: 520, atk: 70, row: 'front', skills: ['armorBreaker', 'shieldWall'] },
          { name: 'Muhafız', icon: '🛡️', avatar: 'assets/soldier_avatar.jpg', hp: 480, atk: 50, row: 'front', skills: ['shieldWall'] },
          { name: 'Okçu', icon: '🏹', avatar: 'assets/soldier_avatar.jpg', hp: 340, atk: 62, row: 'back', skills: ['piercingShot'] },
        ],
        enemies: [
          { name: 'Gölge Gladyatörü Kael', icon: '🥷', avatar: 'assets/gladiator_rival.jpg', hp: 560, atk: 66, row: 'front', skills: ['armorBreaker'] },
          { name: 'Çöl Akrebi Malok', icon: '🦂', avatar: 'assets/gladiator_rival.jpg', hp: 420, atk: 58, row: 'front', skills: ['cleave'] },
          { name: 'Kemik Okçusu', icon: '🏹', avatar: 'assets/monster_skeleton.jpg', hp: 300, atk: 54, row: 'back', skills: ['piercingShot'] },
        ],
        loot: ['+18 ELO', '🔑 Arena Anahtarı', '🟣 +160 ADASTRA']
      }
    };

    let mode = 'dungeon';
    let units = [];
    let round = 0;
    let running = false;
    let timer = null;
    let speed = 1;
    let phaseIndexUsed = {};
    let activeMatchConfig = null;
    let onCompleteCallback = null;
    // Kayıttan oynatma: sonuç combat.js'te hesaplanır, arena yalnızca olayları canlandırır
    let replay = null;
    let replayQueue = [];
    let replayIdx = 0;
    let finished = false;

    const $ = sel => root.querySelector(sel);
    const stage = $('#aa-stage');
    const allyFlank = $('#aa-allyFlank');
    const enemyFlank = $('#aa-enemyFlank');
    const fxLayer = $('#aa-fxLayer');
    const logWrap = $('#aa-logWrap');
    const queueTrack = $('#aa-queueTrack');
    const roundVal = $('#aa-roundVal');
    const stateVal = $('#aa-stateVal');
    const resultBanner = $('#aa-resultBanner');
    const phaseBanner = $('#aa-phaseBanner');
    const playBtn = $('#aa-playBtn');
    const skipBtn = $('#aa-skipBtn');
    const resetBtn = $('#aa-resetBtn');
    const resultBtn = $('#aa-resultBtn');
    const closeBtn = $('#aa-closeBtn');

    function log(html, cls) {
      if (!logWrap) return;
      const line = document.createElement('div');
      line.className = 'log-line' + (cls ? ' ' + cls : '');
      line.innerHTML = html;
      logWrap.prepend(line);
      while (logWrap.children.length > 50) logWrap.removeChild(logWrap.lastChild);
    }

    function buildUnits(config) {
      const list = [];
      const alliesSource = config.allies || PRESETS[mode].allies;
      const enemiesSource = config.enemies || PRESETS[mode].enemies;

      alliesSource.forEach((u, i) => {
        const hp = Math.max(1, Math.round(u.hp != null ? u.hp : (u.maxHp || 100)));
        const maxHp = Math.max(1, Math.round(u.maxHp != null ? u.maxHp : hp));
        list.push({
          ...u,
          side: 'ally',
          id: 'a' + i,
          sourceIndex: u.sourceIndex != null ? u.sourceIndex : i,
          avatar: u.avatar || 'assets/soldier_avatar.jpg',
          hp,
          maxHp,
          atk: Math.max(1, Math.round(u.atk || 25)),
          row: u.row === 'back' ? 'back' : 'front',
          skills: Array.isArray(u.skills) && u.skills.length ? u.skills : ['shieldWall'],
          cd: {},
          shieldPts: 0,
          alive: hp > 0,
          dead: hp <= 0
        });
      });

      enemiesSource.forEach((u, i) => {
        const hp = Math.max(1, Math.round(u.hp != null ? u.hp : (u.maxHp || 100)));
        const maxHp = Math.max(1, Math.round(u.maxHp != null ? u.maxHp : hp));
        const defaultAvatar = (config.mode === 'colosseum' || mode === 'colosseum')
          ? 'assets/gladiator_rival.jpg'
          : getMonsterAvatar(u.level, u.name);

        list.push({
          ...u,
          side: 'enemy',
          id: 'e' + i,
          avatar: u.avatar || defaultAvatar,
          hp,
          maxHp,
          atk: Math.max(1, Math.round(u.atk || 20)),
          row: u.row === 'back' ? 'back' : 'front',
          boss: !!(u.boss || u.isBoss),
          phases: u.phases || [],
          skills: Array.isArray(u.skills) && u.skills.length ? u.skills : (u.boss ? ['cleave', 'roar'] : ['cleave']),
          cd: {},
          shieldPts: 0,
          alive: hp > 0,
          dead: hp <= 0
        });
      });

      return list;
    }

    function render() {
      if (!allyFlank || !enemyFlank) return;
      allyFlank.innerHTML = '';
      enemyFlank.innerHTML = '';
      const grouped = { ally: { front: [], back: [] }, enemy: { front: [], back: [] } };
      units.forEach(u => {
        const side = u.side || 'ally';
        const r = u.row === 'back' ? 'back' : 'front';
        if (grouped[side] && grouped[side][r]) {
          grouped[side][r].push(u);
        }
      });

      function renderGroup(container, g) {
        const backWrap = document.createElement('div');
        backWrap.className = 'row-group row-back';
        g.back.forEach(u => backWrap.appendChild(unitEl(u)));

        const frontWrap = document.createElement('div');
        frontWrap.className = 'row-group row-front';
        g.front.forEach(u => frontWrap.appendChild(unitEl(u)));

        if (g.back.length) container.appendChild(backWrap);
        container.appendChild(frontWrap);
      }

      renderGroup(allyFlank, grouped.ally);
      renderGroup(enemyFlank, grouped.enemy);
      renderQueue();
    }

    function unitEl(u) {
      const el = document.createElement('div');
      el.className = 'unit ' + u.side + (u.boss ? ' unit--boss' : '') + (u.dead ? ' dead' : '');
      el.id = 'aa-unit-' + u.id;
      const pct = Math.max(0, u.hp / u.maxHp);
      const hpClass = pct > 0.5 ? '' : (pct > 0.22 ? 'mid' : 'low');
      const avatarSrc = getUnitAvatar(u);
      const fallbackIcon = u.icon || (u.side === 'ally' ? '⚔️' : '💀');

      el.innerHTML = `
        <div class="shield-ring ${u.shieldPts > 0 ? 'show' : ''}" id="aa-shield-${u.id}"></div>
        <div class="icon-badge">
          <img src="${avatarSrc}" class="unit-avatar-img" alt="${esc(u.name)}" data-fb="next" />
          <span class="avatar-fallback" style="display:none; font-size:1.4rem;">${fallbackIcon}</span>
        </div>
        <div class="hp-track"><div class="hp-fill ${hpClass}" style="width:${Math.round(pct * 100)}%"></div></div>
        <div class="unit-name" title="${esc(u.name)}">${esc(u.name)}</div>
        <div class="unit-hp-text" style="font-size:0.68rem; color:#cbd5e1; text-align:center; font-weight:700; margin-top:1px;">${u.hp}/${u.maxHp}</div>
      `;
      return el;
    }

    function updateUnitDom(u) {
      const el = root.querySelector('#aa-unit-' + u.id);
      if (!el) return;
      el.classList.toggle('dead', u.dead);
      const pct = Math.max(0, u.hp / u.maxHp);
      const fill = el.querySelector('.hp-fill');
      if (fill) {
        fill.style.width = Math.round(pct * 100) + '%';
        fill.className = 'hp-fill ' + (pct > 0.5 ? '' : (pct > 0.22 ? 'mid' : 'low'));
      }
      const hpTxt = el.querySelector('.unit-hp-text');
      if (hpTxt) {
        hpTxt.textContent = `${Math.max(0, Math.round(u.hp))}/${u.maxHp}`;
      }
    }

    function renderQueue() {
      if (!queueTrack) return;
      queueTrack.innerHTML = '';
      const alive = units.filter(u => !u.dead).sort((a, b) => (b.atk + (b.boss ? 40 : 0)) - (a.atk + (a.boss ? 40 : 0)));
      alive.slice(0, 10).forEach((u, i) => {
        const c = document.createElement('div');
        c.className = 'queue-chip' + (i === 0 ? ' next' : '') + (u.side === 'ally' ? ' chip-ally' : ' chip-enemy');
        const avatarSrc = getUnitAvatar(u);
        c.innerHTML = `
          <img src="${avatarSrc}" class="queue-avatar-img" alt="${esc(u.name)}" data-fb="text:${u.icon || (u.side === 'ally' ? '⚔️' : '💀')}" />
        `;
        c.title = `${esc(u.name)} (Atk: ${u.atk}, HP: ${u.hp}/${u.maxHp})`;
        queueTrack.appendChild(c);
      });
    }

    function spawnDmg(unitId, text, cls) {
      if (!fxLayer) return;
      const el = root.querySelector('#aa-unit-' + unitId);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const sr = fxLayer.getBoundingClientRect();
      const dmg = document.createElement('div');
      dmg.className = 'dmg-num ' + (cls || '');
      dmg.textContent = text;
      dmg.style.left = (r.left - sr.left + r.width / 2 - 14 + (Math.random() * 16 - 8)) + 'px';
      dmg.style.top = (r.top - sr.top - 6) + 'px';
      fxLayer.appendChild(dmg);
      setTimeout(() => { if (dmg && typeof dmg.remove === 'function') dmg.remove(); }, 1000);
    }

    function spawnBurst(unitId) {
      if (!fxLayer) return;
      const el = root.querySelector('#aa-unit-' + unitId);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const sr = fxLayer.getBoundingClientRect();
      const b = document.createElement('div');
      b.className = 'skill-burst';
      b.style.left = (r.left - sr.left + r.width / 2) + 'px';
      b.style.top = (r.top - sr.top + r.height / 2) + 'px';
      fxLayer.appendChild(b);
      setTimeout(() => { if (b && typeof b.remove === 'function') b.remove(); }, 650);
    }

    function caption(text) {
      if (!fxLayer) return;
      const c = document.createElement('div');
      c.className = 'skill-caption';
      c.textContent = text;
      fxLayer.appendChild(c);
      setTimeout(() => { if (c && typeof c.remove === 'function') c.remove(); }, 1600);
    }

    function flash(unitId) {
      const el = root.querySelector('#aa-unit-' + unitId);
      if (!el) return;
      el.classList.remove('hit');
      void el.offsetWidth;
      el.classList.add('hit');
    }

    function pickTarget(list, opts) {
      const alive = list.filter(u => !u.dead);
      if (!alive.length) return null;
      if (opts && opts.pierce) {
        const back = alive.filter(u => u.row === 'back');
        const pool = back.length ? back : alive;
        return pool.reduce((a, b) => a.hp / a.maxHp <= b.hp / b.maxHp ? a : b);
      }
      const front = alive.filter(u => u.row === 'front');
      const pool = front.length ? front : alive;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    function dealDamage(target, amount, isCrit) {
      let dmg = Math.max(1, Math.round(amount));
      if (target.shieldPts > 0) {
        const absorbed = Math.min(target.shieldPts, dmg);
        target.shieldPts -= absorbed;
        dmg -= absorbed;
        const sr = root.querySelector('#aa-shield-' + target.id);
        if (sr) sr.classList.toggle('show', target.shieldPts > 0);
      }
      target.hp = Math.max(0, target.hp - dmg);
      if (target.hp <= 0 && !target.dead) {
        target.dead = true;
        log(`💀 <b>${esc(target.name)}</b> yere serildi!`, 'dmg');
        if (sound && sound.playBreakWarning) sound.playBreakWarning();
      } else {
        if (sound && sound.playPickaxe) sound.playPickaxe();
      }
      updateUnitDom(target);
      flash(target.id);
      spawnDmg(target.id, (isCrit ? '💥 ' : '') + '-' + dmg, isCrit ? 'dmg crit' : 'dmg');
      return dmg;
    }

    function healUnit(target, amount) {
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + Math.round(amount));
      const healed = target.hp - before;
      updateUnitDom(target);
      if (healed > 0) {
        spawnDmg(target.id, '+' + healed, 'heal');
        if (sound && sound.playHarvest) sound.playHarvest();
      }
      return healed;
    }

    function act(u) {
      const enemies = units.filter(e => e.side !== u.side);
      const allies = units.filter(e => e.side === u.side);
      if (!enemies.some(e => !e.dead)) return;

      const el = root.querySelector('#aa-unit-' + u.id);
      if (el) {
        el.classList.add('acting');
        setTimeout(() => el.classList.remove('acting'), 500);
      }

      const pool = u.side === 'ally'
        ? SKILLS.filter(s => u.skills && u.skills.includes(s.id))
        : MONSTER_SKILLS.filter(s => u.skills && u.skills.includes(s.id));

      let usable = pool.find(s => !(u.cd[s.id] > 0));
      if (usable && Math.random() < 0.58) {
        u.cd[usable.id] = usable.cd;
        spawnBurst(u.id);
        caption(usable.icon + ' ' + usable.name);
        if (sound && sound.playLevelUp) sound.playLevelUp();

        if (usable.heal) {
          const target = allies.filter(a => !a.dead).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
          if (target) {
            const h = healUnit(target, u.atk * usable.mult + target.maxHp * 0.12);
            log(`✨ <b>${esc(u.name)}</b> ${esc(target.name)}'i <b class="num">+${h}</b> iyileştirdi.`, 'heal skill');
          }
        } else if (usable.aoe) {
          const targets = enemies.filter(e => !e.dead).slice(0, 3);
          log(`💥 <b>${esc(u.name)}</b> ${usable.name} kullandı — ${targets.length} hedef etkilendi!`, 'skill');
          targets.forEach(t => dealDamage(t, u.atk * usable.mult));
        } else if (usable.shield) {
          u.shieldPts = Math.round(u.maxHp * usable.shield);
          const sr = root.querySelector('#aa-shield-' + u.id);
          if (sr) sr.classList.add('show');
          log(`🛡️ <b>${esc(u.name)}</b> kalkan ördü (+${u.shieldPts} emici zırh).`, 'skill');
        } else if (usable.stun) {
          const t = pickTarget(enemies);
          if (t) {
            t.stunned = true;
            log(`😱 <b>${esc(u.name)}</b> ${esc(t.name)}'i sersemletti!`, 'skill');
          }
        } else {
          const t = pickTarget(enemies, { pierce: usable.pierce });
          if (t) {
            const isCrit = Math.random() < 0.22;
            const d = dealDamage(t, u.atk * usable.mult * (isCrit ? 1.6 : 1), isCrit);
            log(`${usable.icon} <b>${esc(u.name)}</b> ${usable.name} ile ${esc(t.name)}'e <b class="num">-${d}</b> hasar verdi.`, 'dmg skill');
          }
        }
        return;
      }

      if (u.stunned) {
        log(`😵 <b>${esc(u.name)}</b> sersemlemiş durumda, hamle yapamadı.`, 'system');
        u.stunned = false;
        return;
      }

      const t = pickTarget(enemies);
      if (!t) return;
      const isCrit = Math.random() < 0.16;
      const raw = u.atk * (0.85 + Math.random() * 0.3) * (isCrit ? 1.7 : 1);
      const d = dealDamage(t, raw, isCrit);
      log(`${isCrit ? '💥 <b>KRİTİK!</b> ' : '⚔️ '}<b>${esc(u.name)}</b> ${esc(t.name)}'e <b class="num">-${d}</b> hasar verdi.`, 'dmg');
    }

    function tickCooldowns() {
      units.forEach(u => {
        for (const k in u.cd) {
          if (u.cd[k] > 0) u.cd[k]--;
        }
      });
    }

    function checkPhases() {
      if (mode !== 'dungeon') return;
      const boss = units.find(u => u.boss);
      if (!boss || boss.dead) return;
      const phases = boss.phases || (PRESETS.dungeon.enemies[0].phases || []);
      const pct = boss.hp / boss.maxHp;
      phases.forEach((ph, idx) => {
        const atThreshold = ph.at != null ? ph.at : (ph.atPct || 0.5);
        if (pct <= atThreshold && !phaseIndexUsed[idx]) {
          phaseIndexUsed[idx] = true;
          showPhaseBanner(ph.text || ph.name, ph.sub || 'Düşman öfkeleniyor!');
          log(`⚡ <b class="num">${ph.text || ph.name}</b> — ${boss.name} güçleniyor!`, 'system');
          if (sound && sound.playBreakWarning) sound.playBreakWarning();
        }
      });
    }

    function showPhaseBanner(text, sub) {
      if (!phaseBanner) return;
      const pt = $('#aa-phaseTxt');
      if (pt) pt.innerHTML = text + (sub ? `<span class="sub">${sub}</span>` : '');
      phaseBanner.classList.remove('show');
      void phaseBanner.offsetWidth;
      phaseBanner.classList.add('show');
    }

    function endCheck() {
      const alliesAlive = units.some(u => u.side === 'ally' && !u.dead);
      const enemiesAlive = units.some(u => u.side === 'enemy' && !u.dead);
      if (alliesAlive && enemiesAlive) return false;

      showResult(!enemiesAlive);
      return true;
    }

    function showResult(win) {
      if (finished) return;
      finished = true;
      stop();
      if (stateVal) stateVal.textContent = win ? 'Zafer' : 'Yenilgi';
      // Ana oyunun geri çağrısı önce çalışır (bildirimler, can/ödül zaten işlenmiş); yapılandırılmış sonuç döndürürse
      // sonuç kartında gerçekten kazanılanlar gösterilir: { baslik?, altBaslik?, satirlar: string[], not?, eylemler: [{etiket, birincil?, tikla}] }
      let sonuc = null;
      if (typeof onCompleteCallback === 'function') {
        const callback = onCompleteCallback;
        onCompleteCallback = null; // Mükerrer çağrıyı önle
        try {
          sonuc = callback({ win, mode, round, units: [...units] }) || null;
        } catch (err) {
          console.error('Savaş sonucu işlenirken hata:', err);
        }
      }

      const rTitle = $('#aa-resultTitle');
      if (rTitle) {
        rTitle.textContent = (sonuc && sonuc.baslik) || (win ? (mode === 'dungeon' ? '🏆 ZAFER!' : '🏆 ARENA ŞAMPİYONU!') : '💀 YENİLGİ');
        rTitle.className = 'title ' + (win ? 'win' : 'lose');
      }
      const rSub = $('#aa-resultSub');
      if (rSub) rSub.textContent = (sonuc && sonuc.altBaslik) || `${round} turda ${win ? 'kazanıldı' : 'kaybedildi'}`;

      const lootWrap = $('#aa-resultLoot');
      if (lootWrap) {
        lootWrap.innerHTML = '';
        let lootList;
        if (sonuc && Array.isArray(sonuc.satirlar)) lootList = sonuc.satirlar;
        else lootList = win ? ((activeMatchConfig && activeMatchConfig.loot) || PRESETS[mode].loot || []) : [];
        lootList.forEach(l => {
          const s = document.createElement('span');
          s.textContent = l;
          lootWrap.appendChild(s);
        });
        if (win) {
          log('🎉 <b>Savaş kazanıldı!</b>', 'system');
          if (sound && sound.playLevelUp) sound.playLevelUp();
        } else {
          log('☠️ Ordu geri çekildi. Yeniden denemek için askerlerini iyileştir.', 'system');
        }
      }
      const rNote = $('#aa-resultNote');
      if (rNote) rNote.textContent = (sonuc && sonuc.not) || '';

      const actWrap = $('#aa-resultActions');
      if (actWrap) {
        actWrap.innerHTML = '';
        ((sonuc && sonuc.eylemler) || []).forEach(e => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'ctrl-btn' + (e.birincil ? ' primary' : '');
          b.textContent = e.etiket;
          b.addEventListener('click', () => {
            closeOverlay();
            if (typeof e.tikla === 'function') e.tikla();
          });
          actWrap.appendChild(b);
        });
      }

      if (resultBanner) resultBanner.classList.add('show');
    }

    function closeOverlay() {
      stop();
      const overlay = root.closest('.battle-arena-modal-overlay') || document.getElementById('battle-arena-modal');
      if (overlay) {
        overlay.classList.remove('active');
        document.body.classList.remove('modal-open');
      }
    }

    // ── Kayıttan oynatma ────────────────────────────────────────────────
    function unitByUid(uid) {
      return uid ? units.find(u => u.uid === uid) : null;
    }

    function pulseActing(u) {
      const el = root.querySelector('#aa-unit-' + u.id);
      if (!el) return;
      el.classList.add('acting');
      setTimeout(() => el.classList.remove('acting'), 450);
    }

    function applyEvent(ev, animate) {
      const actor = unitByUid(ev.actorUid);
      const target = unitByUid(ev.targetUid);
      switch (ev.type) {
        case 'damage': {
          if (actor && animate) pulseActing(actor);
          if (target) {
            target.hp = Math.max(0, ev.targetHp);
            if (ev.died || target.hp <= 0) target.dead = true;
            if (animate) {
              updateUnitDom(target);
              flash(target.id);
              spawnDmg(target.id, (ev.isCrit ? '💥 ' : '') + '-' + ev.amount, ev.isCrit ? 'dmg crit' : 'dmg');
              if (sound && sound.playPickaxe) sound.playPickaxe();
            }
          }
          const how = ev.label && ev.label !== 'Saldırı' ? ` <span class="muted">(${ev.label})</span>` : '';
          const shieldTxt = ev.absorbed > 0 ? ` <span class="muted">· kalkan ${ev.absorbed} emdi</span>` : '';
          log(`${ev.isCrit ? '💥 <b>KRİTİK!</b> ' : '⚔️ '}<b>${esc(ev.actor)}</b> → ${esc(ev.target)} <b class="num">-${ev.amount}</b>${how}${shieldTxt}`, 'dmg');
          if (target && target.dead) log(`💀 <b>${esc(ev.target)}</b> yere serildi!`, 'dmg');
          break;
        }
        case 'heal': {
          if (target) {
            target.hp = Math.max(0, ev.targetHp);
            if (animate) { updateUnitDom(target); spawnDmg(target.id, '+' + ev.amount, 'heal'); }
          }
          log(`✨ <b>${esc(ev.actor)}</b> → ${esc(ev.target)} <b class="num">+${ev.amount}</b> iyileştirdi.`, 'heal skill');
          break;
        }
        case 'ability': {
          if (actor && animate) {
            pulseActing(actor);
            spawnBurst(actor.id);
            caption((ev.icon || '✨') + ' ' + (ev.ability || ''));
            if (/Kalkan|Son Nefes/.test(ev.ability || '')) {
              const sr = root.querySelector('#aa-shield-' + actor.id);
              if (sr) sr.classList.add('show');
            }
          }
          log(ev.text || `${ev.icon || '✨'} <b>${esc(ev.actor)}</b> ${ev.ability}`, 'skill');
          break;
        }
        case 'phase': {
          if (animate) {
            const m = /FAZ \d+:\s*([^—]+)—\s*(.*)/.exec(ev.text || '');
            showPhaseBanner(m ? m[1].trim() : (ev.text || 'YENİ FAZ'), m ? m[2].trim() : '');
            if (sound && sound.playBreakWarning) sound.playBreakWarning();
          }
          log(`⚡ <b class="num">${ev.text}</b>`, 'system');
          break;
        }
        case 'rage':
        case 'modifier':
          log(ev.text, 'system');
          break;
        case 'stunned':
          log(`😵 <b>${esc(ev.actor)}</b> sersemlemiş, hamle yapamadı.`, 'system');
          break;
        case 'dot': {
          if (target) {
            target.hp = Math.max(0, ev.targetHp);
            if (ev.died || target.hp <= 0) target.dead = true;
            if (animate) { updateUnitDom(target); spawnDmg(target.id, '-' + ev.amount, 'dmg'); }
          }
          log(`🔥 ${esc(ev.target)} <b class="num">-${ev.amount}</b> (${ev.dotType === 'poison' ? 'zehir' : 'yanma'})`, 'dmg');
          break;
        }
        default:
          break;
      }
    }

    function syncFinalHp() {
      if (!replay) return;
      const finals = [...(replay.allies || []), ...(replay.enemies || [])];
      finals.forEach(fu => {
        const u = unitByUid(fu.uid);
        if (u) { u.hp = Math.max(0, Math.round(fu.hp)); u.dead = u.hp <= 0; }
      });
    }

    function finishReplay() {
      syncFinalHp();
      render();
      showResult(!!replay.victory);
    }

    function playReplayStep() {
      if (!running || finished) return;
      if (replayIdx >= replayQueue.length) { finishReplay(); return; }
      const item = replayQueue[replayIdx++];
      if (item.round !== round) {
        round = item.round;
        if (roundVal) roundVal.textContent = round;
      }
      applyEvent(item.ev, true);
      const wait = item.ev.type === 'phase' ? 1400 : (item.ev.type === 'ability' ? 700 : 480);
      timer = setTimeout(playReplayStep, wait / speed);
    }

    function stepRound() {
      round++;
      if (roundVal) roundVal.textContent = round;
      tickCooldowns();
      const order = units.filter(u => !u.dead).sort((a, b) => (b.atk + (b.boss ? 60 : 0) + Math.random() * 20) - (a.atk + (a.boss ? 60 : 0) + Math.random() * 20));
      let i = 0;

      function next() {
        if (i >= order.length) {
          checkPhases();
          if (!endCheck() && running) timer = setTimeout(stepRound, 900 / speed);
          return;
        }
        const u = order[i++];
        if (!u.dead) act(u);
        renderQueue();
        if (endCheck()) return;
        timer = setTimeout(next, 520 / speed);
      }
      next();
    }

    function start() {
      if (running) return;
      running = true;
      if (stateVal) stateVal.textContent = 'Savaşta';
      if (playBtn) playBtn.textContent = '⏸ Duraklat';
      if (replay) { playReplayStep(); return; }
      stepRound();
    }

    function stop() {
      running = false;
      clearTimeout(timer);
      if (playBtn) playBtn.textContent = '▶ Devam Et';
      if (stateVal && stateVal.textContent === 'Savaşta') stateVal.textContent = 'Duraklatıldı';
    }

    function skipToEnd() {
      stop();
      if (replay) {
        while (replayIdx < replayQueue.length) {
          const item = replayQueue[replayIdx++];
          round = item.round;
          applyEvent(item.ev, false);
        }
        if (roundVal) roundVal.textContent = round;
        finishReplay();
        return;
      }
      let maxSafety = 200;
      while (!endCheck() && maxSafety-- > 0) {
        round++;
        tickCooldowns();
        const order = units.filter(u => !u.dead).sort((a, b) => b.atk - a.atk);
        for (const u of order) {
          if (!u.dead) act(u);
          if (endCheck()) break;
        }
      }
      if (roundVal) roundVal.textContent = round;
      render();
    }

    function reset() {
      stop();
      finished = false;
      replayIdx = 0;
      round = 0;
      if (roundVal) roundVal.textContent = 0;
      if (stateVal) stateVal.textContent = 'Hazır';
      phaseIndexUsed = {};
      if (resultBanner) resultBanner.classList.remove('show');
      if (playBtn) playBtn.textContent = '▶ Savaşı Başlat';
      units = buildUnits(activeMatchConfig || PRESETS[mode]);
      render();
      if (logWrap) {
        logWrap.innerHTML = '';
        log('⚔️ Savaş alanına girildi… <b>Savaşı Başlat</b> ile izle veya <b>Anında Bitir</b>.', 'system');
      }
    }

    function updateModeBadge(m) {
      const badgeDungeon = $('#aa-modeBadgeDungeon');
      const badgeColosseum = $('#aa-modeBadgeColosseum');
      if (badgeDungeon) badgeDungeon.style.display = (m === 'dungeon') ? 'inline-flex' : 'none';
      if (badgeColosseum) badgeColosseum.style.display = (m === 'colosseum') ? 'inline-flex' : 'none';
    }

    function setMode(m) {
      mode = m;
      root.setAttribute('data-mode', m);
      updateModeBadge(m);
      const ctxEl = $('#aa-contextText');
      if (ctxEl) ctxEl.innerHTML = (activeMatchConfig && activeMatchConfig.context) || PRESETS[m].context;
      const rankEl = $('#aa-rankPill');
      if (rankEl) rankEl.textContent = (activeMatchConfig && activeMatchConfig.rank) || PRESETS[m].rank;
      reset();
    }

    // Canlı Maç Yükleme ve Başlatma (Gerçek Oyun Verileriyle)
    function startBattle(config) {
      activeMatchConfig = config || {};
      mode = config.mode || 'dungeon';
      onCompleteCallback = config.onComplete || null;
      replay = config.replay || null;
      replayQueue = [];
      if (replay && Array.isArray(replay.rounds)) {
        replay.rounds.forEach(r => (r.events || []).forEach(ev => replayQueue.push({ round: r.round, ev })));
        // Tura bağlı olmayan başlangıç olayları (ör. kat etkisi)
        const counted = new Set(replayQueue.map(x => x.ev));
        (replay.log || []).filter(ev => !counted.has(ev)).forEach(ev => replayQueue.unshift({ round: 0, ev }));
      }

      root.setAttribute('data-mode', mode);
      updateModeBadge(mode);

      const ctxEl = $('#aa-contextText');
      if (ctxEl) ctxEl.innerHTML = config.context || PRESETS[mode].context;
      const rankEl = $('#aa-rankPill');
      if (rankEl) rankEl.textContent = config.rank || PRESETS[mode].rank;

      reset();
      // Otomatik olarak savaşı başlat
      start();
    }

    // Buton Dinleyicileri

    if (playBtn) playBtn.addEventListener('click', () => running ? stop() : start());
    if (skipBtn) skipBtn.addEventListener('click', skipToEnd);
    if (resetBtn) resetBtn.addEventListener('click', reset);
    if (resultBtn) resultBtn.addEventListener('click', reset);

    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);

    const resCloseBtn = $('#aa-resultCloseBtn');
    if (resCloseBtn) resCloseBtn.addEventListener('click', closeOverlay);

    root.querySelectorAll('.speed-btn').forEach(b => b.addEventListener('click', () => {
      root.querySelectorAll('.speed-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      speed = parseFloat(b.dataset.speed) || 1;
    }));

    setMode('dungeon');

    // Dışarıya Açık Kontrol API'si
    this.start = start;
    this.stop = stop;
    this.reset = reset;
    this.setMode = setMode;
    this.startBattle = startBattle;
    this.skipToEnd = skipToEnd;
    this.destroy = () => { stop(); };
  }
}
