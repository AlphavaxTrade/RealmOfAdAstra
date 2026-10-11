// Realm of AdAstra v2 (7 Ekim 2026) — R5/R6/R2 kuralları: Köy Evleri, Şifahane, Demirhane geri dönüşümü, roket görevi,
// Sirius Konseyi (ortak kasa, Madencilik Otoritesi inşaatı, Konsey projeleri), Genesis hakları.
// Oyun çekirdeğine (GameStateManager) ve dünya havuzuna (GlobalResourceManager) karışım olarak eklenir:
//   Object.assign(GameStateManager.prototype, gameStateV2); Object.assign(GlobalResourceManager.prototype, globalPoolV2);
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { treasury } from '../treasury.js';

const RES_KEYS = () => GAME_CONFIG.RESOURCE_KEYS || ['wood', 'iron', 'wheat'];
const zeroRes = () => Object.fromEntries(RES_KEYS().map(k => [k, 0]));
const round3 = v => Math.round((Number(v) || 0) * 1000) / 1000;
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const resName = k => ((GAME_CONFIG.RESOURCE_META || {})[k] || {}).name || k;
const resIcon = k => ((GAME_CONFIG.RESOURCE_META || {})[k] || {}).icon || '';
// Katkı puanı için fiyat: canlı pazar (varsa) yoksa açılış fiyatı (pazar modülü döngüsel içe aktarımı önlemek için küresel nesneden okunur)
const priceOf = k => {
  try { const m = globalThis.ammMarket; const p = m && m.getPrice ? m.getPrice(k) : 0; if (p > 0) return p; } catch (e) { /* pazar yoksa koridor */ }
  return ((GAME_CONFIG.AMM_CORRIDORS || {})[k] || {}).defaultPriceAda || 0;
};

// ═══════════════════════════════════════════════════════════════════════
// DÜNYA TARAFI — Sirius Konseyi: ortak kasa, Madencilik Otoritesi inşaatı, Konsey projeleri
// ═══════════════════════════════════════════════════════════════════════
export const globalPoolV2 = {
  _konsey() {
    if (!this.state) return null;
    if (!this.state.konsey || typeof this.state.konsey !== 'object') this.state.konsey = { stock: zeroRes() };
    const k = this.state.konsey;
    if (!k.stock) k.stock = zeroRes();
    if (!k.otorite) k.otorite = { progress: {}, builtLevels: 0 };
    if (!k.otorite.progress) k.otorite.progress = {};
    if (!k.projects) k.projects = { activeIndex: 0, progress: {}, labor: 0, done: [] };
    if (!k.projects.progress) k.projects.progress = {};
    if (!Array.isArray(k.projects.done)) k.projects.done = [];
    return k;
  },

  // Madencilik Otoritesi: sıradaki seviye için gereken karışım ve ilerleme
  getOtoriteStatus() {
    const O = GAME_CONFIG.OTORITE || {};
    const k = this._konsey();
    const level = this.uretimParams().otoriteLevel;
    const max = O.MAX_LEVEL ?? 20;
    const maxed = level >= max;
    const units = maxed ? 0 : Math.round((O.BASE_UNITS ?? 2000000) * Math.pow(O.LEVEL_MULT ?? 1.4, level));
    const mix = O.MIX || { stone: 0.4, iron: 0.2, wood: 0.1 };
    const need = Object.fromEntries(Object.entries(mix).map(([r, s]) => [r, Math.round(units * s)]));
    const progress = Object.fromEntries(Object.keys(need).map(r => [r, Math.min(need[r], Math.floor(Number(k ? k.otorite.progress[r] : 0) || 0))]));
    const needTotal = Object.values(need).reduce((s, v) => s + v, 0);
    const doneTotal = Object.values(progress).reduce((s, v) => s + v, 0);
    const work = this.otoriteWork(level);
    const workNext = this.otoriteWork(Math.min(max, level + 1));
    return {
      level, max, maxed, units, need, progress,
      pct: needTotal > 0 ? Math.round((doneTotal / needTotal) * 1000) / 10 : 100,
      steelUnits: Math.round(units * (O.STEEL_SHARE ?? 0.3)),
      steelAstra: round3(units * (O.STEEL_SHARE ?? 0.3) * (O.STEEL_ASTRA_PER_UNIT ?? 0.05)),
      hours: Math.round(work.hours * 10) / 10, nextHours: Math.round(workNext.hours * 10) / 10,
      days: Math.round(work.days * 100) / 100, nextDays: Math.round(workNext.days * 100) / 100,
      perLevelBonus: O.PER_LEVEL_BONUS ?? 0.05,
      builtLevels: k ? (k.otorite.builtLevels || 0) : 0
    };
  },

  // Dünya tarafı katkı: kabul edilen miktarlar döner; karışım tamamlanınca Otorite bir seviye yükselir
  // (çelik payı Konsey kasasından ASTRA olarak ödenir), kapasite ve herkesin hakkı +%5 olur.
  contributeOtorite(amounts) {
    const k = this._konsey();
    const st = this.getOtoriteStatus();
    if (!k || st.maxed) return { accepted: {}, completed: false, steelPaid: 0, status: st };
    const accepted = {};
    for (const [r, needR] of Object.entries(st.need)) {
      const give = Math.max(0, Math.floor(Number((amounts || {})[r]) || 0));
      const take = Math.min(give, Math.max(0, needR - (st.progress[r] || 0)));
      if (take > 0) { k.otorite.progress[r] = (Number(k.otorite.progress[r]) || 0) + take; accepted[r] = take; }
    }
    let completed = false, steelPaid = 0;
    const after = this.getOtoriteStatus();
    if (Object.keys(after.need).length && Object.keys(after.need).every(r => (after.progress[r] || 0) >= after.need[r])) {
      if (treasury && treasury.withdraw && after.steelAstra > 0) steelPaid = (treasury.withdraw('konsey', after.steelAstra) || {}).granted || 0;
      if (!this.state.uretim || !this.state.uretim.qpp) this.state.uretim = this.nextUretim(this.state.uretim || null);
      this.state.uretim.otoriteLevel = after.level + 1;
      k.otorite.progress = {};
      k.otorite.builtLevels = (k.otorite.builtLevels || 0) + 1;
      k.otorite.lastCompletedAt = this.getTrustedTime();
      this.recomputeWeekCapacity();
      completed = true;
    }
    this.saveState();
    return { accepted, completed, steelPaid, status: this.getOtoriteStatus() };
  },

  // Konsey projeleri: sırayla, biri açık; hammadde (Otorite karışımı) + emek
  getProjectStatus() {
    const list = GAME_CONFIG.KONSEY_PROJELERI || [];
    const k = this._konsey();
    const idx = k ? Math.max(0, Number(k.projects.activeIndex) || 0) : 0;
    const active = list[idx] || null;
    const mix = (GAME_CONFIG.OTORITE || {}).MIX || { stone: 0.4, iron: 0.2, wood: 0.1 };
    const need = active ? Object.fromEntries(Object.entries(mix).map(([r, s]) => [r, Math.round(active.units * s)])) : {};
    const progress = Object.fromEntries(Object.keys(need).map(r => [r, Math.min(need[r], Math.floor(Number(k ? k.projects.progress[r] : 0) || 0))]));
    const labor = active ? Math.min(active.labor, Math.floor(Number(k ? k.projects.labor : 0) || 0)) : 0;
    const needTotal = Object.values(need).reduce((s, v) => s + v, 0) + (active ? active.labor : 0);
    const doneTotal = Object.values(progress).reduce((s, v) => s + v, 0) + labor;
    const done = (k ? k.projects.done : []).map(id => list.find(p => p.id === id)).filter(Boolean);
    return { active, index: idx, need, progress, labor, pct: needTotal > 0 ? Math.round((doneTotal / needTotal) * 1000) / 10 : 100, done };
  },

  contributeProject(amounts, labor = 0) {
    const k = this._konsey();
    const st = this.getProjectStatus();
    if (!k || !st.active) return { accepted: {}, acceptedLabor: 0, completed: false, status: st };
    const accepted = {};
    for (const [r, needR] of Object.entries(st.need)) {
      const give = Math.max(0, Math.floor(Number((amounts || {})[r]) || 0));
      const take = Math.min(give, Math.max(0, needR - (st.progress[r] || 0)));
      if (take > 0) { k.projects.progress[r] = (Number(k.projects.progress[r]) || 0) + take; accepted[r] = take; }
    }
    const giveL = Math.max(0, Math.floor(Number(labor) || 0));
    const acceptedLabor = Math.min(giveL, Math.max(0, st.active.labor - st.labor));
    if (acceptedLabor > 0) k.projects.labor = (Number(k.projects.labor) || 0) + acceptedLabor;
    let completed = false;
    const after = this.getProjectStatus();
    if (after.active && Object.keys(after.need).every(r => (after.progress[r] || 0) >= after.need[r]) && after.labor >= after.active.labor) {
      k.projects.done.push(after.active.id);
      k.projects.activeIndex = after.index + 1;
      k.projects.progress = {};
      k.projects.labor = 0;
      completed = true;
    }
    this.saveState();
    return { accepted, acceptedLabor, completed, status: this.getProjectStatus() };
  },

  // Biten projelerin kalıcı bonusu (ör. 'warehouse' → 0,05; 'expeditionTime' → −0,02; 'herb' → 0,05)
  getProjectBonus(key) {
    const list = GAME_CONFIG.KONSEY_PROJELERI || [];
    const k = this.state && this.state.konsey;
    const done = (k && k.projects && Array.isArray(k.projects.done)) ? k.projects.done : [];
    return done.reduce((s, id) => { const p = list.find(x => x.id === id); return s + ((p && p.bonus && Number(p.bonus[key])) || 0); }, 0);
  }
};

// ═══════════════════════════════════════════════════════════════════════
// OYUNCU TARAFI
// ═══════════════════════════════════════════════════════════════════════
export const gameStateV2 = {
  // ── Köy Evleri (R5) ──
  _village() {
    const K = GAME_CONFIG.KOY || {};
    let v = this.state.village;
    if (!v || typeof v !== 'object') v = this.state.village = { houses: K.START_HOUSES ?? 1, villagers: K.START_VILLAGERS ?? 10, labor: 0, lastGrowthAt: 0, starvingSince: 0 };
    if (!(Number(v.houses) >= 1)) v.houses = K.START_HOUSES ?? 1;
    if (!(Number(v.villagers) >= 0)) v.villagers = K.START_VILLAGERS ?? 10;
    if (!(Number(v.labor) >= 0)) v.labor = 0;
    return v;
  },

  // n. evin bedeli: 2. ev taban (×1,2 her sonraki ev)
  getHouseCost(n = this._village().houses + 1) {
    const K = GAME_CONFIG.KOY || {};
    const base = K.HOUSE_BASE_COST || { wood: 400, stone: 200, iron: 50 };
    const mult = Math.pow(K.HOUSE_COST_MULT ?? 1.2, Math.max(0, n - 2));
    return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * mult)]));
  },

  getVillageInfo() {
    const K = GAME_CONFIG.KOY || {};
    const v = this._village();
    const perHouse = K.VILLAGERS_PER_HOUSE ?? 10;
    const capacity = v.houses * perHouse;
    const villagers = Math.floor(v.villagers);
    const bonus = Math.min(K.PROD_BONUS_MAX ?? 0.2, Math.floor(villagers / 10) * (K.PROD_BONUS_PER_10 ?? 0.01));
    const soldiers = (this.state.soldierUnits || []).length;
    const perSoldier = K.VILLAGER_PER_SOLDIER ?? 1;
    const level = Math.max(1, Number(this.state.level) || 1);
    const hardMax = K.MAX_HOUSES ?? 20;
    const maxHouses = Math.min(hardMax, level);
    const starvingDays = v.starvingSince ? Math.max(0, (Number(v.starveSec) || 0) / 86400) : 0;
    const houseLimitReason = v.houses >= hardMax ? `En çok ${hardMax} ev` : (v.houses >= level ? `Ev sayısı hesap seviyesini (${level}) geçemez` : null);
    return {
      houses: v.houses, villagers, villagersExact: v.villagers, capacity, bonus,
      wheatPerDay: Math.round(villagers * (K.WHEAT_PER_VILLAGER_DAY ?? 2)),
      laborPerDay: villagers * (K.LABOR_PER_VILLAGER_DAY ?? 1), labor: Math.floor(v.labor),
      nextHouseCost: v.houses < hardMax ? this.getHouseCost(v.houses + 1) : null,
      maxHouses, canBuildHouse: v.houses < maxHouses, houseLimitReason,
      soldiers, soldierCap: Math.floor(villagers / perSoldier),
      starving: starvingDays > 0, starvingDays: Math.round(starvingDays * 10) / 10,
      growthPerDay: K.GROWTH_PER_DAY ?? 0.02, starveDays: K.STARVE_DAYS ?? 3
    };
  },

  // Üretim çarpanı: köylü bonusu (+%1 / 10 köylü) ve şifalı ot için Şifa Bahçesi projesi
  getVillageProductionMultiplier(nodeId) {
    const b = this.getVillageInfo().bonus;
    const herb = nodeId === 'herb' && globalPool && globalPool.getProjectBonus ? globalPool.getProjectBonus('herb') : 0;
    return (1 + b) * (1 + herb);
  },

  buildHouse() {
    const info = this.getVillageInfo();
    if (!info.canBuildHouse) return { success: false, message: `🏘️ Yeni ev yapılamaz: ${info.houseLimitReason || 'sınır'}.` };
    const cost = info.nextHouseCost;
    const inv = this.state.inventory || {};
    const missing = Object.entries(cost).filter(([k, n]) => (Number(inv[k]) || 0) < n);
    if (missing.length) return { success: false, message: `⚠️ Eksik malzeme: ${missing.map(([k, n]) => `${resIcon(k)} ${resName(k)} ${Math.floor(inv[k] || 0)}/${n}`).join(', ')}` };
    for (const [k, n] of Object.entries(cost)) inv[k] = (Number(inv[k]) || 0) - n;
    this.burnResources(cost);
    const v = this._village();
    v.houses += 1;
    this.saveState();
    this._markFirst('house');
    this._markFirst('house');
    return { success: true, message: `🏘️ ${v.houses}. ev yapıldı! Köy kapasitesi ${v.houses * ((GAME_CONFIG.KOY || {}).VILLAGERS_PER_HOUSE ?? 10)} köylü.`, cost, houses: v.houses };
  },

  // Zaman ilerledikçe: beslenme (2 buğday/köylü/gün), büyüme (günde %2, kapasiteye kadar), açlık (3 günden sonra günde %5 göç), emek
  processVillage(deltaSeconds) {
    const K = GAME_CONFIG.KOY || {};
    const sec = Math.max(0, Number(deltaSeconds) || 0);
    if (!sec) return null;
    const v = this._village();
    const days = sec / 86400;
    const inv = this.state.inventory || {};
    const villagers = Math.max(0, Number(v.villagers) || 0);
    if (villagers <= 0) return null;
    const need = villagers * (K.WHEAT_PER_VILLAGER_DAY ?? 2) * days;
    const have = Math.max(0, Number(inv.wheat) || 0);
    const now = this._now();
    let eaten = 0, grew = 0, lost = 0;
    if (have >= need) {
      const left = r2(have - need);
      eaten = r2(have - left);   // depodan düşen = yakılan (kuruş hassasiyetinde, defter tutar)
      inv.wheat = left;
      v.starvingSince = 0;
      v.starveSec = 0;
      const cap = v.houses * (K.VILLAGERS_PER_HOUSE ?? 10);
      if (villagers < cap) { grew = Math.min(cap - villagers, villagers * (K.GROWTH_PER_DAY ?? 0.02) * days); v.villagers = villagers + grew; }
    } else {
      eaten = have;
      inv.wheat = 0;
      if (!v.starvingSince) v.starvingSince = now - sec * 1000;
      v.starveSec = (Number(v.starveSec) || 0) + sec;   // açlık süresi oyun zamanıyla birikir
      if (v.starveSec / 86400 >= (K.STARVE_DAYS ?? 3)) { lost = Math.min(villagers, villagers * (K.STARVE_LOSS_PER_DAY ?? 0.05) * days); v.villagers = villagers - lost; }
    }
    if (eaten > 0) this.burnResource('wheat', eaten);
    v.labor = (Number(v.labor) || 0) + Math.max(0, Number(v.villagers) || 0) * (K.LABOR_PER_VILLAGER_DAY ?? 1) * days;
    return { eaten: r2(eaten), grew: r2(grew), lost: r2(lost), villagers: Math.floor(v.villagers) };
  },

  // ── Şifahane (R5): şifalı otla iyileştirme, 1 ot = 5 can, ASTRA bedeli yarı ──
  getHerbHealInfo(soldierIndex) {
    const info = this.getSoldierHealInfo(soldierIndex);
    if (!info) return null;
    const S = GAME_CONFIG.SIFAHANE || {};
    const herbsNeeded = Math.ceil(info.missingHp / (S.HP_PER_HERB ?? 5));
    const herbAdaCost = round3(info.adaCost * (S.ADA_SHARE_WITH_HERB ?? 0.5));
    return { ...info, herbsNeeded, herbAdaCost, herbsInStock: Math.floor(Number(this.state.inventory?.herb) || 0) };
  },

  healSoldierWithHerb(soldierIndex) {
    const soldier = (this.state.soldierUnits || [])[soldierIndex];
    if (!soldier) return { success: false, message: 'Asker bulunamadı!' };
    const info = this.getHerbHealInfo(soldierIndex);
    if (!info || info.isFull) return { success: false, message: `${soldier.name} zaten tam can!` };
    const inv = this.state.inventory;
    if ((Number(inv.herb) || 0) < info.herbsNeeded) return { success: false, message: `⚠️ Yetersiz şifalı ot! (${info.herbsNeeded} 🌿 gerekli, depoda ${info.herbsInStock})` };
    if ((Number(this.state.adAstraBalance) || 0) < info.herbAdaCost) return { success: false, message: `⚠️ Yetersiz ASTRA! (${info.herbAdaCost} ASTRA gerekli)` };
    inv.herb = (Number(inv.herb) || 0) - info.herbsNeeded;
    this.burnResource('herb', info.herbsNeeded);
    if (info.herbAdaCost > 0) {
      this.state.adAstraBalance = round3((Number(this.state.adAstraBalance) || 0) - info.herbAdaCost);
      this._onAdaSpent(info.herbAdaCost);
      globalPool.recordTokenSpend(info.herbAdaCost);
    }
    soldier.hp = soldier.maxHp || 100;
    this._markFirst('herbHeal');
    this.saveState();
    return { success: true, message: `🌿 ${soldier.name} Şifahane'de iyileşti! (-${info.herbsNeeded} 🌿 şifalı ot, -${info.herbAdaCost} ASTRA)`, herbsUsed: info.herbsNeeded, adaCost: info.herbAdaCost };
  },

  healAllWithHerb() {
    let healed = 0, herbs = 0, ada = 0, lastFail = null;
    (this.state.soldierUnits || []).forEach((s, i) => {
      const r = this.healSoldierWithHerb(i);
      if (r.success) { healed++; herbs += r.herbsUsed; ada += r.adaCost; } else if (!/zaten tam can/.test(r.message)) lastFail = r.message;
    });
    const message = healed > 0 ? `🌿 ${healed} asker otla iyileştirildi (-${herbs} 🌿, -${round3(ada)} ASTRA)${lastFail ? ` · ${lastFail}` : ''}` : (lastFail || 'İyileştirilecek asker yok.');
    return { success: healed > 0, healed, herbs, ada: round3(ada), message };
  },

  // ── Demirhane geri dönüşümü (R4b): eşya yok olur, hammaddelerin %70'i geri gelir, ASTRA gelmez ──
  getRecycleValue(item) {
    const cum = this.getCumulativeEquipmentResourceCost(item);
    const rate = GAME_CONFIG.RECYCLE_RETURN_RATE ?? 0.7;
    // Kömür yalnız dövmede harcanır (yükseltmeler kömür istemez): iade, yükseltme düzeyine değil dövme bedeline bağlıdır
    // (eskiden demir toplamından türetilip Sv.9 bir eşyada ödenmemiş kömür de geri veriliyordu)
    const coalDovme = item && GAME_CONFIG.EQUIPMENT_RECIPES && GAME_CONFIG.EQUIPMENT_RECIPES[item.slot]
      ? (this.calculateEquipmentCraftCost(item.slot).coalCost || 0) : 0;
    return { wood: Math.floor(cum.totalWood * rate), iron: Math.floor(cum.totalIron * rate), coal: Math.floor(coalDovme * rate) };
  },

  recycleEquipment({ source, slotKey, armoryIndex = null, soldierIndex = null } = {}) {
    let item = null, remove = null;
    if (source === 'armory') {
      const list = this.state.armoryInventory || [];
      item = list[armoryIndex]; remove = () => list.splice(armoryIndex, 1);
    } else if (source === 'kingdom') {
      item = this.state.equipment ? this.state.equipment[slotKey] : null; remove = () => { this.state.equipment[slotKey] = null; };
    } else if (source === 'soldier') {
      const s = (this.state.soldierUnits || [])[soldierIndex];
      item = s && s.equipment ? s.equipment[slotKey] : null; remove = () => { s.equipment[slotKey] = null; };
    }
    if (!item) return { success: false, message: 'Geri dönüştürülecek eşya bulunamadı.' };
    const value = this.getRecycleValue(item);
    remove();
    const got = {}, sold = {}, lost = {};
    for (const [k, qty] of Object.entries(value)) {
      if (!(qty > 0)) continue;
      const st = this.storeResource(k, qty);
      got[k] = st.stored;
      if (st.overflow > 0 && this._sellOverflow) { const r = this._sellOverflow(k, st.overflow, 'Geri dönüşüm'); if (r.soldQty) sold[k] = r.soldQty; if (r.lostQty) lost[k] = r.lostQty; }
    }
    this._markFirst('recycle');
    this._markFirst('recycle');
    this.saveState();
    const txt = Object.entries(got).map(([k, q]) => `+${q} ${resName(k)}`).join(', ');
    const extra = Object.keys(sold).length ? ` (siloya sığmayan ${Object.entries(sold).map(([k, q]) => `${q} ${resName(k)}`).join(', ')} pazarda satıldı)` : '';
    return { success: true, message: `♻️ ${item.name || 'Eşya'} geri dönüştürüldü: ${txt}${extra}.`, value, got, sold, lost };
  },

  // ── Uzay Limanı (R6): roket görevi ──
  getRocketStatus() {
    const U = GAME_CONFIG.UZAY_LIMANI || {};
    const parts = U.ROCKET_PARTS || {};
    const minLevel = U.ROCKET_MIN_LEVEL ?? 3;
    const level = Math.max(1, Number(this.state.level) || 1);
    const inv = this.state.inventory || {};
    const rows = Object.entries(parts).map(([k, need]) => {
      const have = k === 'adAstra' ? (Number(this.state.adAstraBalance) || 0) : (Number(inv[k]) || 0);
      return { key: k, name: k === 'adAstra' ? 'ASTRA' : resName(k), icon: k === 'adAstra' ? '🟣' : resIcon(k), need, have: Math.floor(have * 1000) / 1000, ok: have >= need };
    });
    const ready = !!this.state.rocketReady;
    const levelOk = level >= minLevel;
    const partsOk = rows.every(r => r.ok);
    const reason = ready ? 'Roket hazır' : (!levelOk ? `Hesap seviyesi en az ${minLevel} olmalı (şu an ${level})` : (!partsOk ? 'Eksik parça var' : null));
    return { ready, levelOk, minLevel, level, parts: rows, partsOk, canBuild: !ready && levelOk && partsOk, reason, builtAt: this.state.rocketBuiltAt || 0 };
  },

  buildRocket() {
    const st = this.getRocketStatus();
    if (st.ready) return { success: false, message: '🚀 Roket zaten hazır.' };
    if (!st.canBuild) return { success: false, message: `🚀 Roket yapılamadı: ${st.reason}.` };
    const U = GAME_CONFIG.UZAY_LIMANI || {};
    const parts = U.ROCKET_PARTS || {};
    const inv = this.state.inventory || {};
    const burn = {};
    for (const [k, need] of Object.entries(parts)) {
      if (k === 'adAstra') {
        this.state.adAstraBalance = round3((Number(this.state.adAstraBalance) || 0) - need);
        this._onAdaSpent(need);
        globalPool.recordTokenSpend(need);
      } else { inv[k] = (Number(inv[k]) || 0) - need; burn[k] = need; }
    }
    this.burnResources(burn);
    this.state.rocketReady = true;
    this.state.rocketBuiltAt = this._now();
    this.saveState();
    return { success: true, message: '🚀 Roket hazır! "Roket hazır" rozeti kazandın; Universe açıldığında geçiş kilidi buradan açılacak.' };
  },

  // ── Sirius Konseyi katkıları (oyuncu tarafı): hammadde yakılır, katkı puanı yazılır ──
  contributeToOtorite(amounts) {
    const inv = this.state.inventory || {};
    const want = {};
    for (const [k, n] of Object.entries(amounts || {})) {
      const q = Math.min(Math.max(0, Math.floor(Number(n) || 0)), Math.floor(Number(inv[k]) || 0));
      if (q > 0) want[k] = q;
    }
    if (!Object.keys(want).length) return { success: false, message: 'Verilecek hammadde yok.' };
    const r = globalPool.contributeOtorite(want);
    const acc = r.accepted || {};
    if (!Object.keys(acc).length) return { success: false, message: r.status && r.status.maxed ? 'Madencilik Otoritesi en üst seviyede.' : 'Bu hammadde için sıradaki seviyede yer kalmadı.' };
    let value = 0;
    for (const [k, q] of Object.entries(acc)) { inv[k] = (Number(inv[k]) || 0) - q; value += q * priceOf(k); }
    this.burnResources(acc);
    if (value > 0 && this._addContribution) this._addContribution(round3(value));
    this._markFirst('konsey');
    this.saveState();
    const txt = Object.entries(acc).map(([k, q]) => `${q} ${resName(k)}`).join(', ');
    return { success: true, message: r.completed ? `⛏️ Otorite ${r.status.level}. seviyeye yükseldi! (${txt}; çelik payı Konsey kasasından ${round3(r.steelPaid)} ASTRA)` : `⛏️ Otorite inşaatına ${txt} verildi (%${r.status.pct}). Katkı puanı +${round3(value)}.`, accepted: acc, completed: r.completed, contribution: round3(value) };
  },

  contributeToProject(amounts, labor = 0) {
    const inv = this.state.inventory || {};
    const v = this._village();
    const want = {};
    for (const [k, n] of Object.entries(amounts || {})) {
      const q = Math.min(Math.max(0, Math.floor(Number(n) || 0)), Math.floor(Number(inv[k]) || 0));
      if (q > 0) want[k] = q;
    }
    const giveL = Math.min(Math.max(0, Math.floor(Number(labor) || 0)), Math.floor(Number(v.labor) || 0));
    if (!Object.keys(want).length && giveL <= 0) return { success: false, message: 'Verilecek hammadde ya da emek yok.' };
    const r = globalPool.contributeProject(want, giveL);
    const acc = r.accepted || {};
    if (!Object.keys(acc).length && !(r.acceptedLabor > 0)) return { success: false, message: r.status && !r.status.active ? 'Bütün Konsey projeleri tamamlandı.' : 'Sıradaki projede bu katkıya yer kalmadı.' };
    let value = 0;
    for (const [k, q] of Object.entries(acc)) { inv[k] = (Number(inv[k]) || 0) - q; value += q * priceOf(k); }
    this.burnResources(acc);
    if (r.acceptedLabor > 0) v.labor = (Number(v.labor) || 0) - r.acceptedLabor;
    if (value > 0 && this._addContribution) this._addContribution(round3(value));
    this.saveState();
    const parts = Object.entries(acc).map(([k, q]) => `${q} ${resName(k)}`);
    if (r.acceptedLabor > 0) parts.push(`${r.acceptedLabor} emek`);
    const name = r.completed ? (r.status.done[r.status.done.length - 1] || {}).name : (r.status.active ? r.status.active.name : '');
    this._markFirst('konsey');
    this._markFirst('konsey');
    return { success: true, message: r.completed ? `🏛️ ${name} tamamlandı! Bonus bütün Sirius'a uygulandı.` : `🏛️ ${name} projesine ${parts.join(', ')} verildi (%${r.status.pct}).`, accepted: acc, acceptedLabor: r.acceptedLabor, completed: r.completed, contribution: round3(value) };
  },

  // ── Genesis NFT hakları (M): gezegen satın alma hakkı ──
  hasGrant(id) {
    return Array.isArray(this.state.grants) && this.state.grants.includes(id);
  }
};

// ════════════════════════════════════════════════════════════════════════════
// Yük İskelesi: Hazırlık Deposu (R6 / F) — Universe hazırlık aşamasında (UNIVERSE_STAGE ≥ 1) açılır.
// Oyuncu hammaddesini Universe için depoya koyar: silodan çıkar, pazara giremez, ilan verilemez.
// Sınırlar: kişi başı her hammaddede 4 haftalık Üretim Hakkı; dünya toplamı 10 M ASTRA değeri.
// Geri alma: %10 kesinti (yakılır), kalan siloya (sığmayan pazarda satılır). Açılış günü Konsey depoyu alır (ileride).
// ════════════════════════════════════════════════════════════════════════════
export const globalPoolV2Depot = {
  getPrepDepotTotal() { return Number(this.state && this.state.hazirlikDepo && this.state.hazirlikDepo.totalValue) || 0; },
  addPrepDepotValue(delta) {
    if (!this.state) return 0;
    if (!this.state.hazirlikDepo) this.state.hazirlikDepo = { totalValue: 0 };
    this.state.hazirlikDepo.totalValue = Math.max(0, round3((Number(this.state.hazirlikDepo.totalValue) || 0) + (Number(delta) || 0)));
    this.saveState();
    return this.state.hazirlikDepo.totalValue;
  }
};

export const gameStateV2Depot = {
  // Rehber görevleri: ilk kez yapılan işler (ev, otla iyileştirme, geri dönüşüm, Konsey katkısı)
  _markFirst(key) {
    if (!this.state.firsts || typeof this.state.firsts !== 'object') this.state.firsts = {};
    if (!this.state.firsts[key]) this.state.firsts[key] = this._now();
  },
  _prepDepot() {
    if (!this.state.hazirlikDepo || typeof this.state.hazirlikDepo !== 'object') this.state.hazirlikDepo = { items: zeroRes(), value: 0, since: 0 };
    if (!this.state.hazirlikDepo.items) this.state.hazirlikDepo.items = zeroRes();
    return this.state.hazirlikDepo;
  },
  getPrepDepotStatus() {
    const U = GAME_CONFIG.UZAY_LIMANI || {};
    const stage = Number(GAME_CONFIG.UNIVERSE_STAGE) || 0;
    const d = this._prepDepot();
    // Liman Rıhtımı projesi bitince kişi başı sınır çarpılır (bonus değeri çarpandır: 2 = iki kat)
    const pierMult = Math.max(1, (globalPool.getProjectBonus && globalPool.getProjectBonus('prepDepotCap')) || 1);
    const weeksCap = (U.PREP_DEPOT_WEEKS_CAP ?? 4) * pierMult;
    const rows = RES_KEYS().map(k => {
      const weekly = this.getUretimHakki ? (Number(this.getUretimHakki(k).weekly) || 0) : 0;
      const cap = Math.floor(weekly * weeksCap);
      const stored = Math.floor(Number(d.items[k]) || 0);
      return { key: k, name: resName(k), icon: resIcon(k), stored, cap, room: Math.max(0, cap - stored), price: priceOf(k), have: Math.floor(Number((this.state.inventory || {})[k]) || 0) };
    });
    const value = round3(rows.reduce((s, r) => s + r.stored * r.price, 0));
    const capValue = round3(rows.reduce((s, r) => s + r.cap * r.price, 0));
    const worldTotal = globalPool.getPrepDepotTotal ? globalPool.getPrepDepotTotal() : 0;
    const worldCap = U.PREP_DEPOT_TOTAL_ASTRA ?? 1e7;
    return { open: stage >= 1, stage, rows, value, capValue, fill: capValue > 0 ? Math.min(1, value / capValue) : 0,
      worldTotal, worldCap, worldRoom: Math.max(0, round3(worldCap - worldTotal)), cancelFee: U.PREP_DEPOT_CANCEL_FEE ?? 0.1, weeksCap };
  },
  depositToPrepDepot(amounts) {
    const st = this.getPrepDepotStatus();
    if (!st.open) return { success: false, message: '🔒 Hazırlık Deposu henüz kapalı: Universe hazırlık aşaması (Aşama 1) başlayınca açılır.' };
    const inv = this.state.inventory || {};
    const d = this._prepDepot();
    const put = {}; let value = 0; let worldRoom = st.worldRoom;
    for (const [k, n] of Object.entries(amounts || {})) {
      const row = st.rows.find(r => r.key === k);
      if (!row) continue;
      let q = Math.min(Math.max(0, Math.floor(Number(n) || 0)), row.have, row.room);
      if (row.price > 0) q = Math.min(q, Math.floor(worldRoom / row.price));
      if (q <= 0) continue;
      put[k] = q;
      inv[k] = (Number(inv[k]) || 0) - q;
      d.items[k] = (Number(d.items[k]) || 0) + q;
      value += q * row.price; worldRoom -= q * row.price;
    }
    if (!Object.keys(put).length) return { success: false, message: 'Depoya konacak uygun miktar yok (sınır: kişi başı 4 haftalık Üretim Hakkı; dünya toplamı 10 M ASTRA değeri).' };
    value = round3(value);
    d.value = round3((Number(d.value) || 0) + value);
    if (!d.since) d.since = this._now();
    if (globalPool.addPrepDepotValue) globalPool.addPrepDepotValue(value);
    if (value > 0 && this._addContribution) this._addContribution(round3(value * 0.5));   // Universe'e hazırlık katkısı: yarım ağırlık
    this.saveState();
    return { success: true, message: `📦 Hazırlık Deposu'na kondu: ${Object.entries(put).map(([k, q]) => `${q} ${resName(k)}`).join(', ')} (${value} ASTRA değeri).`, put, value };
  },
  withdrawFromPrepDepot(key, qty) {
    const d = this._prepDepot();
    const have = Math.floor(Number(d.items[key]) || 0);
    const q = Math.min(Math.max(0, Math.floor(Number(qty) || 0)), have);
    if (q <= 0) return { success: false, message: 'Depoda bu hammaddeden yok.' };
    const feeRate = (GAME_CONFIG.UZAY_LIMANI || {}).PREP_DEPOT_CANCEL_FEE ?? 0.1;
    const fee = Math.ceil(q * feeRate);
    const back = q - fee;
    d.items[key] = have - q;
    const value = round3(q * priceOf(key));
    d.value = Math.max(0, round3((Number(d.value) || 0) - value));
    if (globalPool.addPrepDepotValue) globalPool.addPrepDepotValue(-value);
    if (fee > 0) this.burnResources({ [key]: fee });
    const stRes = this.storeResource(key, back);
    let soldTxt = '';
    if (stRes.overflow > 0 && this._sellOverflow) { const r = this._sellOverflow(key, stRes.overflow, 'Hazırlık Deposu'); if (r.soldQty) soldTxt = ` (siloya sığmayan ${r.soldQty} pazarda satıldı)`; }
    this.saveState();
    return { success: true, message: `↩️ ${back} ${resName(key)} depodan geri alındı; %${Math.round(feeRate * 100)} kesinti (${fee}) yakıldı${soldTxt}.`, back, fee };
  },
  // Universe'e hazırlık yüzdesi: roket, depo doluluğu, köylü (100'e göre), asker (10'a göre), Genesis — her biri %20
  getUniversePrepProgress() {
    const U = GAME_CONFIG.UZAY_LIMANI || {};
    const W = U.PROGRESS_WEIGHTS || { rocket: 0.2, depot: 0.2, villagers: 0.2, soldiers: 0.2, genesis: 0.2 };
    const rk = this.getRocketStatus(), vi = this.getVillageInfo(), dp = this.getPrepDepotStatus();
    const soldiers = (this.state.soldierUnits || []).length;
    const parts = { rocket: rk.ready ? 1 : 0, depot: dp.fill, villagers: Math.min(1, vi.villagers / (U.PROGRESS_VILLAGERS_REF || 100)), soldiers: Math.min(1, soldiers / (U.PROGRESS_SOLDIERS_REF || 10)), genesis: this.state.genesisNftMinted ? 1 : 0 };
    const pct = Math.round(Object.entries(parts).reduce((s, [k, v]) => s + v * (W[k] || 0), 0) * 100);
    return { pct, parts, weights: W, depot: dp, rocket: rk, villagers: vi.villagers, soldiers };
  }
};
