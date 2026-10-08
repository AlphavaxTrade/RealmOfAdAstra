// Realm of AdAstra — GameStateManager yöntemleri: AMM pazar alım/satım, hızlı alım planı, komut paleti
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { ammMarket } from '../ammMarket.js';
import { RES_KEYS } from './ortak.js';

export const pazarYontemleri = {
  // =========================================================================
  // 🏪 v1.25: PAZAR ALIM-SATIM (tek yerde; taban fiyat, gerçek %2 yakım ve silo kontrolüyle)
  // =========================================================================
  marketSell(resKey, qty) {
    const amount = Number(qty);
    if (!(amount > 0)) return { success: false, message: 'Lütfen satmak istediğin geçerli bir miktar gir!' };
    const owned = resKey === 'boxes' ? (this.state.lockedBoxes || 0)
      : resKey === 'keys' ? (this.state.arenaKeys || 0)
      : (Number(this.state.inventory[resKey]) || 0);
    if (owned < amount) {
      return { success: false, message: `Yetersiz ${this.getResourceNameTr(resKey) || resKey}! Envanterinde ${Math.floor(owned).toLocaleString('tr-TR')} adet var.` };
    }
    const res = ammMarket.executeSell(resKey, amount);
    if (!res.success) return res;
    if (resKey === 'boxes') this.state.lockedBoxes -= amount;
    else if (resKey === 'keys') this.state.arenaKeys -= amount;
    else this.state.inventory[resKey] = (Number(this.state.inventory[resKey]) || 0) - amount;
    this.state.adAstraBalance = (this.state.adAstraBalance || 0) + res.adAstraReceived;
    if (RES_KEYS().includes(resKey)) this._onAdaEarned(res.adAstraReceived, { saleOf: resKey });
    else this._onAdaEarned(res.adAstraReceived);
    this.saveState();
    return { ...res, qty: amount };
  },

  // ⚡ Hızlı al planı: seviye atlama ('levelup') ya da silo yükseltme ('warehouse') için eksik hammaddeler ve pazar bedeli.
  // ok: hesaptaki ASTRA hem bu alıma hem yükseltmenin kendi ASTRA bedeline (%3 payla) yetiyor mu.
  getQuickBuyPlan(kind) {
    const inv = this.state.inventory || {};
    const cap = this.getWarehouseCapacity();
    let target = null, extraAda = 0, xpShort = false;
    if (kind === 'levelup') {
      const req = this.getNextLevelRequirement();
      if (!req || req.isMaxLevel) return { ok: false, items: [], reason: 'Maksimum seviyedesin.' };
      target = { wood: req.wood, iron: req.iron, wheat: req.wheat };
      extraAda = Number(req.adAstra) || 0;
      if ((Number(this.state.currentXp) || 0) < req.xp) xpShort = true;
    } else if (kind === 'warehouse') {
      const c = this.getWarehouseUpgradeCost();
      if (!c || c.isMaxLevel) return { ok: false, items: [], reason: 'Silo en üst seviyede.' };
      // Hem yükseltme bedeli hem %80 doluluk şartı karşılanır (v2: bütün hammaddeler)
      target = Object.fromEntries((c.keys || RES_KEYS()).map(k => [k, Math.max((c.costs || {})[k] || 0, (c.fills || {})[k] || 0)]));
      extraAda = Number(c.adAstra) || 0;
    } else if (String(kind).startsWith('craft:')) {
      const slot = String(kind).slice(6);
      if (!(GAME_CONFIG.EQUIPMENT_RECIPES || {})[slot]) return { ok: false, items: [], reason: 'Geçersiz tarif.' };
      const c = this.calculateEquipmentCraftCost(slot);
      target = { iron: c.ironCost, wood: c.woodCost, fragments: c.fragCost };
      extraAda = Number(c.adaCost) || 0;
    } else return { ok: false, items: [], reason: 'Geçersiz.' };
    const items = [];
    let total = 0, capBlocked = false;
    for (const res of Object.keys(target)) {
      const have = Math.floor(Number(inv[res]) || 0);
      let need = Math.max(0, Math.ceil(target[res] - have));
      const room = cap && cap[res] != null ? Math.max(0, Math.floor(cap[res] - have)) : need;
      if (need > room) { need = room; capBlocked = true; }
      if (need <= 0) continue;
      const cost = ammMarket.getEstimatedCostForBuy(res, need);
      if (!isFinite(cost)) return { ok: false, items: [], reason: 'Pazarda yeterli hammadde yok.' };
      items.push({ res, qty: need, cost, name: this.getResourceNameTr(res) });
      total += cost;
    }
    const balance = Number(this.state.adAstraBalance) || 0;
    const needAda = total + extraAda * 1.03;
    if (xpShort && items.length) return { ok: false, items, total, extraAda, balance, needAda, capBlocked, reason: 'Önce deneyimi (XP) tamamla; hammaddeyi seviye atlayabileceğin zaman al.' };
    return { ok: items.length > 0 && balance >= needAda && !capBlocked, items, total, extraAda, balance, needAda, capBlocked,
      reason: !items.length ? 'Eksik hammadde yok.' : capBlocked ? 'Silon bu kadar hammadde alamıyor: önce siloyu yükselt.' : balance < needAda ? `ADA yetmiyor: alım ~${Math.ceil(total).toLocaleString('tr-TR')} + yükseltme ~${Math.ceil(extraAda).toLocaleString('tr-TR')} ASTRA gerekli.` : '' };
  },

  // 🧺 Depoyu doldur: siloda boş yer kadar, ASTRA yetmezse alınabilecek en fazla miktar
  getFillWarehouseQty(resKey) {
    const cap = this.getWarehouseCapacity()[resKey];
    const have = Math.floor(Number((this.state.inventory || {})[resKey]) || 0);
    let qty = Math.max(0, Math.floor((cap || 0) - have));
    const balance = Number(this.state.adAstraBalance) || 0;
    const costOf = q => (q > 0 ? ammMarket.getEstimatedCostForBuy(resKey, q) : 0);
    if (qty > 0 && !(costOf(qty) <= balance)) {
      let lo = 0, hi = qty;                                   // bütçeye sığan en büyük miktar
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (costOf(mid) <= balance) lo = mid; else hi = mid - 1; }
      return { qty: lo, room: qty, cost: costOf(lo), limitedByAda: true };
    }
    return { qty, room: qty, cost: costOf(qty), limitedByAda: false };
  },

  marketBuy(resKey, qty) {
    const amount = Number(qty);
    if (!(amount > 0)) return { success: false, message: 'Lütfen satın almak istediğin geçerli bir miktar gir!' };
    const est = ammMarket.getEstimatedCostForBuy(resKey, amount);
    if (!isFinite(est)) return { success: false, message: 'Havuzda bu miktarı karşılayacak yeterli likidite yok!' };
    if ((this.state.adAstraBalance || 0) < est) {
      return { success: false, message: `Yetersiz ASTRA! Gereken: ~${est.toFixed(2)} ASTRA, bakiyen: ${(this.state.adAstraBalance || 0).toFixed(2)} ASTRA` };
    }
    if (RES_KEYS().includes(resKey)) {
      const limit = this.getWarehouseCapacity()[resKey];
      const cur = Number(this.state.inventory[resKey]) || 0;
      if (limit != null && cur + amount > limit) {
        return { success: false, message: `Silo kapasitesi aşılamaz! Alabileceğin en fazla boş alan: ${Math.max(0, Math.floor(limit - cur)).toLocaleString('tr-TR')} ${this.getResourceNameTr(resKey)}` };
      }
    }
    const res = ammMarket.executeBuyAmount(resKey, amount);
    if (!res.success) return res;
    this.state.adAstraBalance = (this.state.adAstraBalance || 0) - res.cost;
    this._onAdaSpent(res.cost, { boughtResource: resKey });
    if (resKey === 'boxes') this.state.lockedBoxes = (this.state.lockedBoxes || 0) + res.resourceReceived;
    else if (resKey === 'keys') this.state.arenaKeys = (this.state.arenaKeys || 0) + res.resourceReceived;
    else this.state.inventory[resKey] = (Number(this.state.inventory[resKey]) || 0) + res.resourceReceived;
    this.saveState();
    const resume = this.updateBotPauseState();
    return { ...res, qty: amount, botJustResumed: !!(resume && resume.justResumed) };
  },

  // =========================================================================
  // COMMAND PALETTE: ARANABILIR EYLEM LİSTESİ
  // =========================================================================
  getCommandPaletteActions() {
    return [
      { id: 'dashboard', icon: '🏰', label: 'Krallık Merkezi', shortcut: 'TAB', category: 'Panel' },
      { id: 'treasury', icon: '🏦', label: 'Krallık Hazinesi & Ödül Havuzları', shortcut: 'H', category: 'Panel' },
      { id: 'forest', icon: '🌲', label: 'Zümrüt Ormanı & Oduncu', shortcut: '1 / S', category: 'Bina' },
      { id: 'mine', icon: '⛏️', label: 'Maden Ocağı & Demirci', shortcut: '2 / I', category: 'Bina' },
      { id: 'farm', icon: '🌾', label: 'Güneş Tarlası & Çiftlik', shortcut: '3 / F', category: 'Bina' },
      { id: 'barracks', icon: '⚔️', label: 'Kışla & Ordu Yönetimi', shortcut: '4 / B', category: 'Bina' },
      { id: 'market', icon: '🏪', label: 'AMM Pazar Yeri', shortcut: '5 / M', category: 'Bina' },
      { id: 'dungeon', icon: '💀', label: 'Zindan', shortcut: '6 / D', category: 'Bina' },
      { id: 'colosseum', icon: '🏟️', label: 'Kolezyum Arenası', shortcut: '7 / C', category: 'Bina' },
      { id: 'inventory', icon: '🎒', label: 'Envanter & Karakter', shortcut: 'E', category: 'Panel' },
      { id: 'quota', icon: '📊', label: 'Kota ve Sınırlar (haftalık kota, zindan, piyango)', shortcut: 'K', category: 'Panel' },
      { id: 'claimAll', icon: '⚡', label: 'Tüm Seferleri Topla & Yeniden Başlat', shortcut: '', category: 'Eylem' },
      { id: 'repairAll', icon: '🔨', label: 'Tüm Aletleri Onar', shortcut: '', category: 'Eylem' },
      { id: 'healAll', icon: '🌾', label: 'Tüm Orduyu İyileştir', shortcut: '', category: 'Eylem' },
      { id: 'autoEquip', icon: '⚔️', label: 'En İyi Eşyaları Otomatik Dağıt', shortcut: '', category: 'Eylem' },
      { id: 'economy', icon: '📈', label: 'Ekonomi ve Tokenomi Paneli', shortcut: '', category: 'Panel' },
    ];
  },
};
