// Kışla: Ordu ve Cephanelik — yeni arayüz (4 Ekim 2026)
// ============================================================================
// Amaç: çok asker ve çok eşya olduğunda bile yönetim kolay olsun.
//  • Ordu: solda süzülüp sıralanabilen kompakt asker listesi, sağda seçili askerin sayfası. Eşya yuvaları en üstte;
//    bir yuvaya tıklayınca o yuvaya uyan BÜTÜN eşyalar, şu ankiyle karşılaştırmalı listelenir (tek tıkla tak/değiştir).
//  • Cephanelik: türe, konuma (boşta / askerde) göre süz, sırala; her eşyada seviye, gerçek dayanıklılık, kimin
//    üzerinde olduğu ve "en çok işe yarayacağı asker" önerisi; tek tıkla tak, başka askere taşı, çıkar, yükselt.
// Oyun kuralları değişmez: yalnız mevcut oyun işlemleri çağrılır (equipSoldierFromDepot, unequipSoldierToArmory, …).
// Tüm düğmeler data-bk="eylem" taşır; tıklamalar modal gövdesinde YAKALAMA aşamasında ele alınır (eski genel
// dinleyiciye ulaşmaz: eski panelde aynı sınıflı düğmeler yanlış pencere açıyordu).
// ============================================================================

import { equipImg, soldierPortrait } from './art.js';

const SLOTS = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
const SLOT_NAME = { weapon: 'Silah', helmet: 'Miğfer', armor: 'Zırh', legs: 'Dizlik', boots: 'Çizme' };
const SLOT_ICON = { weapon: '⚔️', helmet: '🪖', armor: '🛡️', legs: '👖', boots: '👢' };

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => Math.round(Number(v) || 0).toLocaleString('tr-TR');
const score = it => (it ? (Number(it.atkBonus) || 0) * 3 + (Number(it.hpBonus) || 0) : 0);   // sıralama için kaba güç
const usable = it => !!it && !(it.durability !== undefined && it.durability <= 0);

function dur(it) {
  const max = Number(it.maxDurability) || 13;
  const cur = it.durability != null ? Number(it.durability) : max;
  const pct = Math.max(0, Math.min(100, Math.round(cur / max * 100)));
  const tone = cur <= 3 ? 'bad' : cur <= 7 ? 'warn' : 'ok';
  return { cur, max, pct, tone };
}
const hpTone = pct => (pct <= 25 ? 'bad' : pct <= 60 ? 'warn' : 'ok');

function deltaHtml(it, cur) {
  const da = (Number(it.atkBonus) || 0) - (Number(cur?.atkBonus) || 0);
  const dh = (Number(it.hpBonus) || 0) - (Number(cur?.hpBonus) || 0);
  const part = (d, unit) => (d === 0 ? '' : `<span class="bk-delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${num(Math.abs(d))} ${unit}</span>`);
  const s = part(da, 'saldırı') + part(dh, 'can');
  return s || '<span class="bk-delta same">aynı güç</span>';
}

function statLine(it) {
  const a = Number(it.atkBonus) || 0, h = Number(it.hpBonus) || 0;
  return [a ? `+${num(a)} saldırı` : '', h ? `+${num(h)} can` : ''].filter(Boolean).join(' · ') || 'bonus yok';
}

export function createBarracksUI(deps) {
  const { gameState, GAME_CONFIG, PLAYER_SKILLS = {}, showToast, renderTopBar, reopen, getSelected, setSelected, getTab, setTab,
    getEditing, setEditing, openScrapReport } = deps;

  const ui = { q: '', chip: 'all', sort: 'order', picker: null, pickerFor: -1, aSlot: 'all', aWhere: 'idle', aSort: 'power', aLimit: 48, moveKey: null };

  const st = () => gameState.state;
  const soldiers = () => st().soldierUnits || [];

  // Bir yuvaya takılabilecek boştaki eşyalar (krallık yuvası + cephanelik)
  function candidates(slot) {
    const out = [];
    const k = (st().equipment || {})[slot];
    if (k) out.push({ item: k, source: 'kingdom', slotKey: slot, armoryIndex: null });
    (st().armoryInventory || []).forEach((it, i) => { if (it && it.slot === slot) out.push({ item: it, source: 'armory', slotKey: slot, armoryIndex: i }); });
    return out.sort((a, b) => score(b.item) - score(a.item) || dur(b.item).cur - dur(a.item).cur);
  }

  // Bütün eşyalar (boşta + askerlerin üzerinde)
  function allItems() {
    const out = [];
    const k = st().equipment || {};
    SLOTS.forEach(sl => { if (k[sl]) out.push({ item: k[sl], source: 'kingdom', slotKey: sl, armoryIndex: null, soldierIndex: null }); });
    (st().armoryInventory || []).forEach((it, i) => { if (it) out.push({ item: it, source: 'armory', slotKey: it.slot, armoryIndex: i, soldierIndex: null }); });
    soldiers().forEach((s, si) => SLOTS.forEach(sl => { const it = (s.equipment || {})[sl]; if (it) out.push({ item: it, source: 'soldier', slotKey: sl, armoryIndex: null, soldierIndex: si }); }));
    return out;
  }

  // Öneriler: boştaki eşyalar akıllıca dağıtılır — her yuva türünde en güçlü eşya en zayıf (ya da boş) yuvalı
  // askere önerilir; her asker yuvası yalnız bir kez önerilir (hepsi aynı askeri göstermesin).
  const keyOf = e => `${e.source}:${e.slotKey}:${e.armoryIndex ?? ''}:${e.soldierIndex ?? ''}`;
  function suggestions(items) {
    const map = new Map();
    SLOTS.forEach(slot => {
      const targets = soldiers().map((s, i) => { const cur = (s.equipment || {})[slot]; return { idx: i, cur, sc: usable(cur) ? score(cur) : -1 }; })
        .sort((a, b) => a.sc - b.sc || a.idx - b.idx);
      const idle = items.filter(e => e.source !== 'soldier' && e.slotKey === slot).sort((a, b) => score(b.item) - score(a.item));
      let t = 0;
      for (const e of idle) {
        while (t < targets.length && score(e.item) <= targets[t].sc) t++;
        if (t >= targets.length) break;
        map.set(keyOf(e), targets[t]);
        t++;
      }
    });
    return map;
  }

  // ── Ordu ──────────────────────────────────────────────────────────────
  function rosterFiltered() {
    const q = ui.q.trim().toLocaleLowerCase('tr-TR');
    let list = soldiers().map((s, i) => {
      const heal = gameState.getSoldierHealInfo(i) || { hp: s.hp, maxHp: s.maxHp, hpPct: 100, isFull: true };
      const stats = gameState.getSoldierFullStats(i) || { totalAtk: 0, totalMaxHp: 0 };
      const filled = SLOTS.filter(sl => (s.equipment || {})[sl]).length;
      return { s, i, heal, stats, filled };
    });
    if (q) list = list.filter(r => String(r.s.name || '').toLocaleLowerCase('tr-TR').includes(q) || String(r.i + 1) === q);
    if (ui.chip === 'hurt') list = list.filter(r => !r.heal.isFull);
    else if (ui.chip === 'missing') list = list.filter(r => r.filled < 5);
    else if (ui.chip === 'front') list = list.filter(r => r.s.row !== 'back');
    else if (ui.chip === 'back') list = list.filter(r => r.s.row === 'back');
    const by = { atk: (a, b) => b.stats.totalAtk - a.stats.totalAtk, hp: (a, b) => a.heal.hpPct - b.heal.hpPct, missing: (a, b) => a.filled - b.filled };
    if (by[ui.sort]) list.sort(by[ui.sort]);
    return list;
  }

  function rosterRows() {
    const sel = getSelected();
    const list = rosterFiltered();
    if (!list.length) return '<div class="bk-empty">Bu süzgece uyan asker yok.</div>';
    return list.map(({ s, i, heal, stats, filled }) => `
      <button type="button" class="bk-row ${i === sel ? 'is-active' : ''}" data-bk="select" data-idx="${i}" aria-pressed="${i === sel}">
        <span class="bk-row-num">${i + 1}</span>
        <img class="bk-row-face" src="${esc(soldierPortrait(s, i))}" alt="" loading="lazy" draggable="false">
        <span class="bk-row-main">
          <span class="bk-row-name">${esc(s.name)}${s.row === 'back' ? ' <span class="bk-tag">arka</span>' : ''}${heal.isPaused ? ' <span class="bk-tag bad">iyileşme durdu</span>' : ''}</span>
          <span class="bk-bar sm"><span class="bk-bar-fill ${hpTone(heal.hpPct)}" data-hp-idx="${i}" style="width:${heal.hpPct}%"></span></span>
        </span>
        <span class="bk-row-side">
          <span class="bk-pips" title="${filled}/5 yuva dolu">${SLOTS.map(sl => `<i class="${(s.equipment || {})[sl] ? 'on' : ''}"></i>`).join('')}</span>
          <span class="bk-row-atk">${num(stats.totalAtk)} ⚔</span>
        </span>
      </button>`).join('');
  }

  function counts() {
    const list = soldiers().map((s, i) => ({ s, heal: gameState.getSoldierHealInfo(i) || { isFull: true }, filled: SLOTS.filter(sl => (s.equipment || {})[sl]).length }));
    return {
      all: list.length, hurt: list.filter(r => !r.heal.isFull).length, missing: list.filter(r => r.filled < 5).length,
      front: list.filter(r => r.s.row !== 'back').length, back: list.filter(r => r.s.row === 'back').length
    };
  }

  function slotTile(s, idx, slot) {
    const it = (s.equipment || {})[slot];
    const open = ui.picker === slot;
    const n = candidates(slot).length;
    if (!it) {
      return `<button type="button" class="bk-slot is-empty ${open ? 'is-open' : ''}" data-bk="picker" data-slot="${slot}">
        <span class="bk-slot-icon is-ghost">${equipImg(slot, SLOT_ICON[slot])}</span>
        <span class="bk-slot-name">${SLOT_NAME[slot]}</span>
        <span class="bk-slot-sub">${n ? `${n} uygun eşya · seç` : 'depoda yok'}</span>
      </button>`;
    }
    const d = dur(it);
    return `<div class="bk-slot ${open ? 'is-open' : ''}">
      <button type="button" class="bk-slot-hit" data-bk="picker" data-slot="${slot}" aria-label="${SLOT_NAME[slot]} değiştir">
        <span class="bk-slot-icon">${equipImg(slot, it.icon || SLOT_ICON[slot])}</span>
        <span class="bk-slot-name">${esc(it.name)} <b>Sv.${it.level || 1}</b></span>
        <span class="bk-slot-sub">${statLine(it)}</span>
        <span class="bk-bar sm" title="Dayanıklılık ${d.cur}/${d.max}"><span class="bk-bar-fill ${d.tone}" style="width:${d.pct}%"></span></span>
        <span class="bk-slot-dur ${d.tone}">${d.cur}/${d.max} dayanıklılık</span>
      </button>
      <span class="bk-slot-actions">
        ${d.cur < d.max ? `<button type="button" class="bk-mini" data-bk="repair" data-slot="${slot}" title="${(() => { const c = gameState.calculateEquipmentRepairCost(slot, idx); return c ? `${num(c.ironCost)} demir + ${num(c.woodCost)} odun` : ''; })()}">Onar</button>` : ''}
        <button type="button" class="bk-mini" data-bk="unequip" data-slot="${slot}">Çıkar</button>
      </span>
    </div>`;
  }

  function pickerHtml(s) {
    if (!ui.picker) return '';
    const slot = ui.picker;
    const cur = (s.equipment || {})[slot];
    const list = candidates(slot);
    return `<div class="bk-picker" role="region" aria-label="${SLOT_NAME[slot]} seç">
      <div class="bk-picker-head">
        <span>${SLOT_ICON[slot]} ${SLOT_NAME[slot]} seç <span class="bk-dim">· ${list.length} eşya depoda${cur ? ` · takılı: Sv.${cur.level || 1}, ${statLine(cur)}` : ''}</span></span>
        <button type="button" class="bk-mini" data-bk="picker-close">Kapat</button>
      </div>
      ${list.length ? `<div class="bk-picker-list">${list.slice(0, 60).map(c => {
        const d = dur(c.item);
        return `<div class="bk-pick">
          <span class="bk-pick-icon">${equipImg(slot, c.item.icon || SLOT_ICON[slot])}</span>
          <span class="bk-pick-main"><b>${esc(c.item.name)} · Sv.${c.item.level || 1}</b><span class="bk-dim">${statLine(c.item)} · <span class="${d.tone}">${d.cur}/${d.max}</span></span></span>
          <span class="bk-pick-delta">${deltaHtml(c.item, cur)}</span>
          <button type="button" class="bk-btn sm primary" data-bk="equip" data-source="${c.source}" data-slot="${slot}" data-armory="${c.armoryIndex ?? ''}">${cur ? 'Değiştir' : 'Tak'}</button>
        </div>`;
      }).join('')}</div>${list.length > 60 ? `<div class="bk-dim bk-pad">En güçlü 60 eşya gösteriliyor.</div>` : ''}`
      : `<div class="bk-empty">Depoda bu yuvaya uyan eşya yok. Maden Ocağı → Demirci'de dövebilirsin.</div>`}
    </div>`;
  }

  function sheetHtml(idx) {
    const s = soldiers()[idx];
    const stats = gameState.getSoldierFullStats(idx) || { totalAtk: 0, totalMaxHp: 0 };
    const heal = gameState.getSoldierHealInfo(idx);
    const set = gameState.getSoldierSetBonus(idx);
    const scrolls = (st().inventory || {}).scroll_heal || 0;
    const editing = getEditing() === idx;
    return `<section class="bk-sheet" aria-label="Asker ayrıntısı">
      <header class="bk-sheet-head">
        <img class="bk-sheet-face" src="${esc(soldierPortrait(s, idx))}" alt="" draggable="false">
        <div class="bk-sheet-id">
          ${editing ? `
            <div class="bk-rename">
              <input type="text" id="input-soldier-rename" data-soldier-idx="${idx}" maxlength="24" value="${esc(s.name)}" aria-label="Asker adı">
              <button type="button" class="bk-btn sm primary" data-bk="rename-save">Kaydet</button>
              <button type="button" class="bk-btn sm" data-bk="rename-cancel">Vazgeç</button>
            </div>` : `
            <h3 class="bk-sheet-name">${esc(s.name)} <button type="button" class="bk-icon-btn" data-bk="rename" title="Adını değiştir" aria-label="Adını değiştir">✏️</button></h3>`}
          <div class="bk-dim">Asker ${idx + 1} · Sv.${s.level || 1}${set ? ` · <span class="bk-set">✨ ${esc(set.name)}</span>` : ''}</div>
        </div>
        <div class="bk-sheet-stats">
          <span class="bk-stat"><b>${num(stats.totalAtk)}</b> saldırı</span>
          <span class="bk-stat"><b>${num(stats.totalMaxHp)}</b> en yüksek can</span>
          <button type="button" class="bk-btn sm" data-bk="row" title="Savaşta duracağı yer">${s.row === 'back' ? '🏹 Arka saf' : '🛡️ Ön saf'} ⇄</button>
        </div>
      </header>
      ${heal ? `<div class="bk-hp">
        <div class="bk-hp-top"><span>Can</span><b class="${hpTone(heal.hpPct)}" id="bk-hp-text">${num(heal.hp)} / ${num(heal.maxHp)}</b></div>
        <span class="bk-bar"><span class="bk-bar-fill ${hpTone(heal.hpPct)}" data-hp-idx="${idx}" style="width:${heal.hpPct}%"></span></span>
        <div class="bk-hp-foot">
          <span class="bk-dim">${heal.isFull ? 'Tam can' : heal.isPaused ? '<span class="bad">İyileşme durdu: buğday ya da ASTRA yetersiz</span>' : `Kendiliğinden dolacak: ${Math.floor(heal.secondsRemaining / 3600)} sa ${Math.floor((heal.secondsRemaining % 3600) / 60)} dk`}</span>
          <span class="bk-hp-actions">
            ${!heal.isFull ? `<button type="button" class="bk-btn sm" data-bk="heal">Hemen doyur · ${num(heal.wheatNeeded)} buğday + ${num(heal.adaCost)} ASTRA</button>` : ''}
            ${!heal.isFull && scrolls > 0 ? `<button type="button" class="bk-btn sm" data-bk="scroll">Parşömen (${scrolls})</button>` : ''}
          </span>
        </div>
      </div>` : ''}
      <div class="bk-slots">${SLOTS.map(sl => slotTile(s, idx, sl)).join('')}</div>
      ${pickerHtml(s)}
      <details class="bk-skills">
        <summary>Yetenekler (${(s.skills || ['shieldWall']).length})</summary>
        <div class="bk-skill-list">${(s.skills || ['shieldWall']).map(id => {
          const sk = PLAYER_SKILLS[id] || { name: id, icon: '⚡', role: '', desc: '' };
          return `<div class="bk-skill"><b>${sk.icon} ${esc(sk.name)}</b> <span class="bk-tag">${esc(sk.role)}</span><div class="bk-dim">${esc(sk.desc)}${sk.cooldown ? ` · bekleme ${sk.cooldown} tur` : ''}</div></div>`;
        }).join('')}</div>
        <div class="bk-dim bk-pad">Yeni yetenekler seviye 10, 25, 45 ve 65'te açılır.</div>
      </details>
    </section>`;
  }

  function armyTab() {
    const list = soldiers();
    const max = GAME_CONFIG.MAX_SOLDIERS ?? Infinity;
    const cost = gameState.getSoldierCost(list.length + 1);
    const canBuy = (max === Infinity || list.length < max) && st().adAstraBalance >= cost;
    if (!list.length) {
      return `<div class="bk-hero"><h3>Ordun henüz boş</h3><p class="bk-dim">İlk askerini al; silah ve zırhları ona buradan takacaksın.</p>
        <button type="button" class="bk-btn primary" data-bk="buy" ${canBuy ? '' : 'disabled'}>Yeni asker al · ${num(cost)} ASTRA</button></div>`;
    }
    let sel = getSelected();
    if (!list[sel]) { sel = 0; setSelected(0); }
    if (ui.pickerFor !== sel) { ui.picker = null; ui.pickerFor = sel; }
    let atk = 0, hp = 0, filled = 0;
    list.forEach((s, i) => { const x = gameState.getSoldierFullStats(i); if (x) { atk += x.totalAtk; hp += x.totalMaxHp; } filled += SLOTS.filter(sl => (s.equipment || {})[sl]).length; });
    const c = counts();
    const presets = gameState.getCombatPresets ? gameState.getCombatPresets() : null;
    const activeP = presets?.activePresetId || 1;
    const blocked = gameState.isArmyPassiveHealBlocked ? gameState.isArmyPassiveHealBlocked() : false;
    const chip = (id, label, n) => `<button type="button" class="bk-chip ${ui.chip === id ? 'is-on' : ''}" data-bk="chip" data-chip="${id}">${label}${n != null ? ` <span>${n}</span>` : ''}</button>`;
    return `
      ${blocked ? `<div class="bk-alert">Buğday ya da ASTRA yetmediği için askerlerin kendiliğinden iyileşmesi durdu. Ambara buğday ekle ve hesabında ASTRA bulundur.</div>` : ''}
      <div class="bk-summary">
        <div class="bk-summary-stats">
          <span><b>${list.length}</b> asker</span><span><b>${num(atk)}</b> saldırı</span><span><b>${num(hp)}</b> can</span><span><b>${filled}/${list.length * 5}</b> yuva dolu</span>
        </div>
        <div class="bk-summary-actions">
          <button type="button" class="bk-btn primary" data-bk="prep" title="Yaralıları doyurur, boş yuvalara en iyi eşyaları takar">Orduyu hazırla</button>
          <button type="button" class="bk-btn" data-bk="auto">Boş yuvaları doldur</button>
          <button type="button" class="bk-btn" data-bk="heal-all">Hepsini doyur</button>
          <button type="button" class="bk-btn" data-bk="buy" ${canBuy ? '' : 'disabled'} title="${num(cost)} ASTRA">Yeni asker · ${num(cost)} ASTRA</button>
          <button type="button" class="bk-btn ghost" data-bk="unequip-all" title="Bütün askerlerin eşyaları depoya döner">Hepsini soy</button>
        </div>
      </div>
      ${presets ? `<div class="bk-presets"><span class="bk-dim">Diziliş:</span>${[1, 2, 3].map(pid => {
        const p = presets.presets?.[pid] || { name: `Taktik ${pid}` };
        return `<button type="button" class="bk-chip ${pid === activeP ? 'is-on' : ''}" data-bk="preset" data-pid="${pid}" title="Bu dizilişi yükle">${esc(p.name)}</button>`;
      }).join('')}<button type="button" class="bk-mini" data-bk="preset-save" title="Şu anki dizilişi seçili yuvaya kaydet">Kaydet</button></div>` : ''}
      <div class="bk-split">
        <aside class="bk-roster" aria-label="Asker listesi">
          <div class="bk-roster-tools">
            <input type="search" class="bk-search" data-bk-input="q" placeholder="Asker ara (ad ya da numara)" value="${esc(ui.q)}" aria-label="Asker ara">
            <div class="bk-chips">${chip('all', 'Tümü', c.all)}${chip('hurt', 'Yaralı', c.hurt)}${chip('missing', 'Eksik eşya', c.missing)}${chip('front', 'Ön saf', c.front)}${chip('back', 'Arka saf', c.back)}</div>
            <label class="bk-sort">Sırala
              <select data-bk-input="sort" aria-label="Sırala">
                ${[['order', 'Numara'], ['atk', 'En güçlü'], ['hp', 'En yaralı'], ['missing', 'En eksik']].map(([v, l]) => `<option value="${v}" ${ui.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="bk-roster-list" id="bk-roster-list">${rosterRows()}</div>
        </aside>
        ${sheetHtml(sel)}
      </div>`;
  }

  // ── Cephanelik ────────────────────────────────────────────────────────
  function armoryTab() {
    const items = allItems();
    const bySlot = sl => items.filter(e => e.slotKey === sl && (ui.aWhere === 'all' || (ui.aWhere === 'idle') === (e.source !== 'soldier'))).length;
    let list = items.filter(e => (ui.aSlot === 'all' || e.slotKey === ui.aSlot) && (ui.aWhere === 'all' || (ui.aWhere === 'idle') === (e.source !== 'soldier')));
    const sorts = { power: (a, b) => score(b.item) - score(a.item), level: (a, b) => (b.item.level || 1) - (a.item.level || 1) || score(b.item) - score(a.item), worn: (a, b) => dur(a.item).cur - dur(b.item).cur };
    list.sort(sorts[ui.aSort] || sorts.power);
    const total = list.length;
    const shown = list.slice(0, ui.aLimit);
    const idle = items.filter(e => e.source !== 'soldier').length;
    const chip = (id, label, n) => `<button type="button" class="bk-chip ${ui.aSlot === id ? 'is-on' : ''}" data-bk="aslot" data-slot="${id}">${label} <span>${n}</span></button>`;
    const seg = (id, label) => `<button type="button" class="bk-seg ${ui.aWhere === id ? 'is-on' : ''}" data-bk="awhere" data-where="${id}">${label}</button>`;
    const soldierOptions = (entry) => soldiers().map((s, i) => {
      if (entry.source === 'soldier' && entry.soldierIndex === i) return '';
      const cur = (s.equipment || {})[entry.slotKey];
      const da = (Number(entry.item.atkBonus) || 0) - (Number(cur?.atkBonus) || 0), dh = (Number(entry.item.hpBonus) || 0) - (Number(cur?.hpBonus) || 0);
      const note = !cur ? 'boş yuva' : [da ? `${da > 0 ? '+' : '−'}${Math.abs(da)} saldırı` : '', dh ? `${dh > 0 ? '+' : '−'}${Math.abs(dh)} can` : ''].filter(Boolean).join(', ') || 'aynı';
      return `<option value="${i}">${i + 1}. ${esc(s.name)} — ${note}</option>`;
    }).join('');
    const sugg = suggestions(items);
    const data = e => `data-source="${e.source}" data-slot="${e.slotKey}" data-armory="${e.armoryIndex ?? ''}" data-soldier="${e.soldierIndex ?? ''}"`;
    const cards = shown.map(e => {
      const it = e.item, d = dur(it), best = sugg.get(keyOf(e)) || null;
      const where = e.source === 'soldier' ? `${e.soldierIndex + 1}. ${esc(soldiers()[e.soldierIndex]?.name || '')} üzerinde` : 'Boşta';
      const up = gameState.calculateEquipmentUpgradeCost ? gameState.calculateEquipmentUpgradeCost(it) : null;
      const moving = ui.moveKey === keyOf(e);
      return `<article class="bk-item ${e.source === 'soldier' ? 'is-worn' : ''}">
        <div class="bk-item-top">
          <span class="bk-item-icon">${equipImg(e.slotKey, it.icon || SLOT_ICON[e.slotKey])}</span>
          <span class="bk-item-main"><b>${esc(it.name)}</b><span class="bk-dim">${SLOT_NAME[e.slotKey]} · Sv.${it.level || 1} · ${statLine(it)}</span></span>
        </div>
        <div class="bk-item-dur"><span class="bk-bar sm"><span class="bk-bar-fill ${d.tone}" style="width:${d.pct}%"></span></span><span class="${d.tone}">${d.cur}/${d.max}</span></div>
        <div class="bk-item-where">${where}${best ? ` · <span class="bk-hint">öneri: ${best.idx + 1}. asker, ${esc(soldiers()[best.idx].name)} — ${best.cur ? deltaHtml(it, best.cur) : 'boş yuvaya'}</span>` : ''}</div>
        ${moving ? `<div class="bk-move">
            <select data-bk-input="move-target" aria-label="Asker seç">${soldierOptions(e)}</select>
            <button type="button" class="bk-btn sm primary" data-bk="move-go" ${data(e)}>Tak</button>
            <button type="button" class="bk-mini" data-bk="move-cancel">Vazgeç</button>
          </div>` : `<div class="bk-item-actions">
            ${best ? `<button type="button" class="bk-btn sm primary" data-bk="give" ${data(e)} data-to="${best.idx}">${best.idx + 1}. askere tak</button>` : ''}
            <button type="button" class="bk-btn sm" data-bk="move" data-key="${esc(keyOf(e))}">${e.source === 'soldier' ? 'Başka askere' : 'Askere tak…'}</button>
            ${e.source === 'soldier' ? `<button type="button" class="bk-mini" data-bk="a-unequip" ${data(e)}>Çıkar</button>` : ''}
            ${up && !up.isMaxLevel ? `<button type="button" class="bk-mini" data-bk="upgrade" ${data(e)} title="Sv.${up.nextLevel}: ${num(up.ironCost)} demir, ${num(up.woodCost)} odun, ${num(up.fragmentCost)} parça, ${num(up.adAstraCost)} ASTRA">Yükselt</button>` : ''}
          </div>`}
      </article>`;
    }).join('');
    return `
      <div class="bk-summary">
        <div class="bk-summary-stats"><span><b>${items.length}</b> eşya</span><span><b>${idle}</b> boşta</span><span><b>${items.length - idle}</b> askerlerde</span></div>
        <div class="bk-summary-actions">
          <button type="button" class="bk-btn primary" data-bk="auto">Boş yuvaları doldur</button>
          <button type="button" class="bk-btn" data-bk="repair-all">Hepsini onar</button>
          <button type="button" class="bk-btn" data-bk="scrap" title="Boştaki seviye 1 fazlalıklar parçaya çevrilir">Seviye 1 fazlalıkları erit</button>
          <button type="button" class="bk-btn ghost" data-bk="unequip-all">Hepsini soy</button>
        </div>
      </div>
      <div class="bk-filters">
        <div class="bk-chips">${chip('all', 'Tümü', SLOTS.reduce((t, sl) => t + bySlot(sl), 0))}${SLOTS.map(sl => chip(sl, `${SLOT_ICON[sl]} ${SLOT_NAME[sl]}`, bySlot(sl))).join('')}</div>
        <div class="bk-filter-row">
          <div class="bk-segs" role="group" aria-label="Konum">${seg('idle', 'Boşta')}${seg('worn', 'Askerlerde')}${seg('all', 'Hepsi')}</div>
          <label class="bk-sort">Sırala
            <select data-bk-input="asort" aria-label="Sırala">
              ${[['power', 'En güçlü'], ['level', 'Seviye'], ['worn', 'Onarım bekleyen']].map(([v, l]) => `<option value="${v}" ${ui.aSort === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>
      ${total ? `<div class="bk-items">${cards}</div>` : `<div class="bk-empty">${items.length ? 'Bu süzgece uyan eşya yok.' : "Henüz eşyan yok. Maden Ocağı → Demirci'de silah ve zırh dövebilirsin."}</div>`}
      ${total > shown.length ? `<div class="bk-more"><button type="button" class="bk-btn" data-bk="more">Daha fazla göster (${shown.length}/${total})</button></div>` : ''}`;
  }

  function render() {
    const tab = getTab() === 'armory' ? 'armory' : 'army';
    const idle = (st().armoryInventory || []).filter(Boolean).length + SLOTS.filter(sl => (st().equipment || {})[sl]).length;
    return `<div class="bk">
      <div class="bk-tabs" role="tablist">
        <button type="button" role="tab" class="bk-tab ${tab === 'army' ? 'is-on' : ''}" aria-selected="${tab === 'army'}" data-bk="tab" data-tab="army">Ordu <span>${soldiers().length}</span></button>
        <button type="button" role="tab" class="bk-tab ${tab === 'armory' ? 'is-on' : ''}" aria-selected="${tab === 'armory'}" data-bk="tab" data-tab="armory">Cephanelik <span>${idle} boşta</span></button>
      </div>
      ${tab === 'armory' ? armoryTab() : armyTab()}
    </div>`;
  }

  // ── Eylemler ──────────────────────────────────────────────────────────
  const done = async (p, { toast = true } = {}) => {
    const res = await p;
    if (toast && res && res.message) showToast(res.message, res.success ? 'success' : 'error');
    renderTopBar();
    reopen();
    return res;
  };
  const refOf = el => ({ source: el.dataset.source, slotKey: el.dataset.slot, armoryIndex: el.dataset.armory === '' ? null : Number(el.dataset.armory), soldierIndex: el.dataset.soldier === '' ? null : Number(el.dataset.soldier) });

  // Eşyayı (boşta ya da başka askerde) hedef askere tak
  async function giveTo(ref, to) {
    let source = ref.source, armoryIndex = ref.armoryIndex;
    if (source === 'soldier') {
      const r = await gameState.unequipSoldierToArmory(ref.soldierIndex, ref.slotKey);
      if (!r || !r.success) return done(r);
      source = 'armory';
      armoryIndex = (st().armoryInventory || []).length - 1;     // çıkarılan eşya deponun sonuna eklenir
    }
    return done(gameState.equipSoldierFromDepot(to, { source, slotKey: ref.slotKey, armoryIndex }));
  }

  async function onClick(el) {
    const a = el.dataset.bk;
    const idx = getSelected();
    switch (a) {
      case 'tab': setTab(el.dataset.tab); ui.moveKey = null; return reopen();
      case 'select': setSelected(Number(el.dataset.idx)); setEditing(null); return reopen({ scrollTo: window.innerWidth < 760 ? '.bk-sheet' : null });
      case 'chip': ui.chip = el.dataset.chip; return reopen();
      case 'picker': ui.picker = ui.picker === el.dataset.slot ? null : el.dataset.slot; ui.pickerFor = idx; return reopen({ scrollTo: '.bk-picker' });
      case 'picker-close': ui.picker = null; return reopen();
      case 'equip': {
        const r = await done(gameState.equipSoldierFromDepot(idx, { source: el.dataset.source, slotKey: el.dataset.slot, armoryIndex: el.dataset.armory === '' ? null : Number(el.dataset.armory) }));
        if (r && r.success) { ui.picker = null; reopen(); }
        return r;
      }
      case 'unequip': return done(gameState.unequipSoldierToArmory(idx, el.dataset.slot));
      case 'repair': return done(gameState.repairEquipment(el.dataset.slot, idx));
      case 'heal': return done(gameState.instantHealSoldierUnit(idx));
      case 'scroll': { const s = soldiers()[idx]; return done(gameState.useScroll('scroll_heal', s?.id ?? idx)); }
      case 'row': { const s = soldiers()[idx]; return done(gameState.setSoldierRow(idx, s && s.row === 'back' ? 'front' : 'back')); }
      case 'rename': setEditing(idx); return reopen();
      case 'rename-cancel': setEditing(null); return reopen();
      case 'rename-save': {
        const input = document.getElementById('input-soldier-rename');
        const r = await gameState.renameSoldierUnit(idx, input ? input.value : '');
        showToast(r.message, r.success ? 'success' : 'error');
        if (r.success) { setEditing(null); reopen(); }
        return r;
      }
      case 'prep': {
        const h = await gameState.instantHealAllSoldiers();
        const e = await gameState.autoEquipBest();
        showToast([h?.message, e?.message].filter(Boolean).join(' · ') || 'Ordu hazır.', (h?.success || e?.success) ? 'success' : 'info');
        renderTopBar();
        return reopen();
      }
      case 'auto': return done(gameState.autoEquipBest());
      case 'heal-all': return done(gameState.instantHealAllSoldiers());
      case 'buy': return done(gameState.buySoldierUnit());
      case 'unequip-all': if (!confirm('Bütün askerlerin eşyaları depoya dönsün mü?')) return; return done(gameState.unequipAllSoldiers());
      case 'repair-all': return done(gameState.repairAllEquipmentInKingdom());
      case 'scrap': {
        const r = await gameState.scrapAllLowTierEquipment(1);
        renderTopBar();
        if (r && r.success && openScrapReport) return openScrapReport(r);
        showToast(r?.message || '', r?.success ? 'success' : 'info');
        return reopen();
      }
      case 'preset': return done(gameState.applyCombatPreset(Number(el.dataset.pid)));
      case 'preset-save': return done(gameState.saveCombatPreset(st().combatPresets?.activePresetId || 1));
      case 'aslot': ui.aSlot = el.dataset.slot; ui.aLimit = 48; return reopen();
      case 'awhere': ui.aWhere = el.dataset.where; ui.aLimit = 48; return reopen();
      case 'more': ui.aLimit += 48; return reopen({ keepScroll: true });
      case 'move': ui.moveKey = el.dataset.key; return reopen({ keepScroll: true });
      case 'move-cancel': ui.moveKey = null; return reopen({ keepScroll: true });
      case 'move-go': {
        const sel = el.parentElement.querySelector('select');
        ui.moveKey = null;
        if (!sel || sel.value === '') return reopen({ keepScroll: true });
        return giveTo(refOf(el), Number(sel.value));
      }
      case 'give': return giveTo(refOf(el), Number(el.dataset.to));
      case 'a-unequip': { const r = refOf(el); return done(gameState.unequipSoldierToArmory(r.soldierIndex, r.slotKey)); }
      case 'upgrade': { const r = refOf(el); return done(gameState.upgradeAnyEquipment({ source: r.source, slotKey: r.slotKey, armoryIndex: r.armoryIndex, soldierIndex: r.soldierIndex })); }
      default: return null;
    }
  }

  function onInput(el) {
    const k = el.dataset.bkInput;
    if (k === 'q') {
      ui.q = el.value;
      const box = document.getElementById('bk-roster-list');
      if (box) box.innerHTML = rosterRows();
    } else if (k === 'sort') { ui.sort = el.value; reopen(); }
    else if (k === 'asort') { ui.aSort = el.value; reopen(); }
  }

  // Modal gövdesine bir kez bağlanır; YAKALAMA aşamasında çalışır, eski genel dinleyiciye geçmez
  function install(modalBody) {
    if (modalBody.__bkInstalled) return;
    modalBody.__bkInstalled = true;
    modalBody.addEventListener('click', e => {
      const el = e.target.closest('[data-bk]');
      if (!el || !modalBody.contains(el) || !el.closest('.bk')) return;
      e.stopPropagation();
      e.preventDefault();
      if (el.disabled) return;
      Promise.resolve(onClick(el)).catch(err => showToast(err.message || String(err), 'error'));
    }, true);
    const inp = e => {
      const el = e.target.closest('[data-bk-input]');
      if (!el || !el.closest('.bk')) return;
      e.stopPropagation();
      if (el.dataset.bkInput === 'move-target') return;
      onInput(el);
    };
    modalBody.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.bkInput === 'q') inp(e); }, true);
    modalBody.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.bkInput !== 'q') inp(e); }, true);
    modalBody.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.id === 'input-soldier-rename' && e.target.closest('.bk')) {
        e.preventDefault(); e.stopPropagation();
        const btn = modalBody.querySelector('[data-bk="rename-save"]');
        if (btn) onClick(btn);
      }
    }, true);
  }

  // Canlı can güncellemesi: yalnız çubuklar ve yazı değişir (arama, açık liste ve kaydırma bozulmaz)
  function liveUpdate(root) {
    root.querySelectorAll('[data-hp-idx]').forEach(el => {
      const h = gameState.getSoldierHealInfo(Number(el.dataset.hpIdx));
      if (!h) return;
      el.style.width = h.hpPct + '%';
      el.className = 'bk-bar-fill ' + hpTone(h.hpPct);
    });
    const t = root.querySelector('#bk-hp-text');
    const h = gameState.getSoldierHealInfo(getSelected());
    if (t && h) { t.textContent = `${num(h.hp)} / ${num(h.maxHp)}`; t.className = hpTone(h.hpPct); }
  }

  return { render, install, liveUpdate, ui };
}
