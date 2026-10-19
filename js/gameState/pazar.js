// Realm of AdAstra — GameStateManager yöntemleri: pazar alım/satım, "hızlı al" planı, depoyu doldurma.
// 11 Ekim 2026'da baştan yazıldı (komut paleti listesi arayüze, js/ui/v3/palet.js'e taşındı).
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { GAME_CONFIG } from '../config.js';
import { ammMarket } from '../ammMarket.js';
import { RES_KEYS, kaynakAdi } from './ortak.js';

// Hızlı al planında alım bedeline eklenen pay: yükseltmenin kendi ASTRA bedeli %3 payla hesaba katılır
const ASTRA_PAYI = 1.03;

const tr = (n) => Number(n).toLocaleString('tr-TR');

// Teçhizat parçası bölünemez: kesirli miktar alınıp satılamaz. (Pandora kutusu ve Anahtar artık takas havuzunda yok: 18 Ekim 2026)
const TAM_SAYILI = ['fragments'];
const tamSayiHatasi = (anahtar, miktar) => (TAM_SAYILI.includes(anahtar) && !Number.isInteger(miktar)
  ? { success: false, message: 'Bu varlık bölünemez: tam sayı gir.' } : null);

export const pazarYontemleri = {
  _pazarStoku(anahtar) {
    return Number(this.state.inventory[anahtar]) || 0;
  },

  marketSell(resKey, qty) {
    const miktar = Number(qty);
    if (!(miktar > 0)) return { success: false, message: 'Lütfen satmak istediğin geçerli bir miktar gir!' };
    const kesir = tamSayiHatasi(resKey, miktar);
    if (kesir) return kesir;
    const eldeki = this._pazarStoku(resKey);
    if (eldeki < miktar) {
      return { success: false, message: `Yetersiz ${kaynakAdi(resKey) || resKey}! Envanterinde ${tr(Math.floor(eldeki))} adet var.` };
    }

    const sonuc = ammMarket.executeSell(resKey, miktar);
    if (!sonuc.success) return sonuc;

    this.state.inventory[resKey] = (Number(this.state.inventory[resKey]) || 0) - miktar;

    this.state.adAstraBalance = (this.state.adAstraBalance || 0) + sonuc.adAstraReceived;
    this._onAdaEarned(sonuc.adAstraReceived, RES_KEYS().includes(resKey) ? { saleOf: resKey } : undefined);
    this.saveState();
    return { ...sonuc, qty: miktar };
  },

  marketBuy(resKey, qty) {
    const miktar = Number(qty);
    if (!(miktar > 0)) return { success: false, message: 'Lütfen satın almak istediğin geçerli bir miktar gir!' };
    const kesir = tamSayiHatasi(resKey, miktar);
    if (kesir) return kesir;

    const tahmin = ammMarket.getEstimatedCostForBuy(resKey, miktar);
    if (!isFinite(tahmin)) return { success: false, message: 'Havuzda bu miktarı karşılayacak yeterli likidite yok!' };
    const bakiye = this.state.adAstraBalance || 0;
    if (bakiye < tahmin) {
      return { success: false, message: `Yetersiz ASTRA! Gereken: ~${tahmin.toFixed(2)} ASTRA, bakiyen: ${bakiye.toFixed(2)} ASTRA` };
    }
    if (RES_KEYS().includes(resKey) || resKey === 'fragments') {   // teçhizat parçasının da silo sınırı vardır
      const sinir = this.getWarehouseCapacity()[resKey];
      const mevcut = Number(this.state.inventory[resKey]) || 0;
      if (sinir != null && mevcut + miktar > sinir) {
        return { success: false, message: `Silo kapasitesi aşılamaz! Alabileceğin en fazla boş alan: ${tr(Math.max(0, Math.floor(sinir - mevcut)))} ${kaynakAdi(resKey)}` };
      }
    }

    const sonuc = ammMarket.executeBuyAmount(resKey, miktar);
    if (!sonuc.success) return sonuc;

    this.state.adAstraBalance = (this.state.adAstraBalance || 0) - sonuc.cost;
    this._onAdaSpent(sonuc.cost, { boughtResource: resKey, sinkPart: this.pazarSistemPayi(sonuc) });
    this.state.inventory[resKey] = (Number(this.state.inventory[resKey]) || 0) + sonuc.resourceReceived;
    // Elle alınan kaynağı bot bir süre satmaz (botSilo._botKaynakSat)
    if (RES_KEYS().includes(resKey)) this.state.elleAlim = { ...(this.state.elleAlim || {}), [resKey]: this._now() };
    this.saveState();

    // Duraklamış bot, eksik kaynak alınınca uyanmış olabilir
    const uyanma = this.updateBotPauseState();
    return { ...sonuc, qty: miktar, botJustResumed: !!(uyanma && uyanma.justResumed) };
  },

  /**
   * ⚡ Hızlı al planı: seviye atlama ('levelup'), silo yükseltme ('warehouse'), teçhizat dövme
   * ('craft:<yuva>') ya da cephanelikteki bir eşyanın geliştirilmesi ('upgrade:<eşya sırası>') ve onarımı ('repair:<eşya sırası>',
   * 'repairall'; sıra getAllArmoryEquipmentList() içindeki konumdur), iyileştirme ('heal', 'heal:<sıra>'), köy evi ('house'), roket ('rocket'),
   * alet tamiri ('tool:<alet>') ve zindan modu geçişinin kalan hammaddesi ('modgate') için eksik kaynaklar ve pazar bedeli. ok = ASTRA hem bu alıma hem işin kendi
   * ASTRA bedeline (%3 payla) yetiyor, silo bu miktarı alıyor ve XP tamam.
   */
  getQuickBuyPlan(kind) {
    const depo = this.state.inventory || {};
    const kapasite = this.getWarehouseCapacity();
    let hedef;
    let ekAstra = 0;
    let xpEksik = false;
    let kapasitesiz = false;   // toplu geliştirme: eşyalar sırayla yükseltilir, toplam bedelin hepsi aynı anda siloda durmak zorunda değil

    if (kind === 'levelup') {
      const gerek = this.getNextLevelRequirement();
      if (!gerek || gerek.isMaxLevel) return { ok: false, items: [], reason: 'Maksimum seviyedesin.' };
      hedef = { ...(gerek.costs || { wood: gerek.wood, iron: gerek.iron, wheat: gerek.wheat }) };
      ekAstra = Number(gerek.adAstra) || 0;
      xpEksik = (Number(this.state.currentXp) || 0) < gerek.xp;
    } else if (kind === 'warehouse') {
      const bedel = this.getWarehouseUpgradeCost();
      if (!bedel) return { ok: false, items: [], reason: 'Silo en üst seviyede.' };
      if (bedel.accountLevelBlocked) return { ok: false, items: [], reason: `Silo seviyesi hesap seviyeni geçemez: önce hesabını ${bedel.accountLevelNeeded}. seviyeye yükselt.` };
      // Hem yükseltme bedeli hem %80 doluluk şartı karşılanır (bütün hammaddeler)
      hedef = Object.fromEntries(bedel.keys.map(k => [k, Math.max(bedel.costs[k] || 0, bedel.fills[k] || 0)]));
      ekAstra = Number(bedel.adAstra) || 0;
    } else if (String(kind).startsWith('craft:')) {
      const yuva = String(kind).slice(6);
      if (!(GAME_CONFIG.EQUIPMENT_RECIPES || {})[yuva]) return { ok: false, items: [], reason: 'Geçersiz tarif.' };
      const bedel = this.calculateEquipmentCraftCost(yuva);
      hedef = { iron: bedel.ironCost, wood: bedel.woodCost, coal: bedel.coalCost, fragments: bedel.fragCost };
      ekAstra = Number(bedel.adaCost) || 0;
    } else if (String(kind).startsWith('upgrade:')) {
      const kayit = this.getAllArmoryEquipmentList()[Number(String(kind).slice(8))];
      if (!kayit || !kayit.item) return { ok: false, items: [], reason: 'Eşya bulunamadı.' };
      const bedel = this.calculateEquipmentUpgradeCost(kayit.item);
      if (!bedel || bedel.isMaxLevel) return { ok: false, items: [], reason: 'Eşya zaten en yüksek seviyede.' };
      hedef = { iron: bedel.ironCost, wood: bedel.woodCost, coal: bedel.coalCost, stone: bedel.stoneCost, fragments: bedel.fragCost };
      ekAstra = Number(bedel.adaCost) || 0;
    } else if (String(kind).startsWith('upgradeset:')) {
      // upgradeset:<yuva|all>:<seviye|-> → Demirhane toplu geliştirme (hepsi, tür ya da tür + seviye)
      const [yuva, seviye] = String(kind).slice(11).split(':');
      const bedel = this.getUpgradeSetCost(yuva === 'all' ? null : yuva, seviye && seviye !== '-' ? Number(seviye) : null);
      if (!bedel.count) return { ok: false, items: [], reason: 'Geliştirilecek uygun teçhizat bulunamadı.' };
      hedef = { iron: bedel.ironCost, wood: bedel.woodCost, coal: bedel.coalCost, stone: bedel.stoneCost, fragments: bedel.fragCost };
      ekAstra = Number(bedel.adaCost) || 0;
      kapasitesiz = true;
    } else if (String(kind).startsWith('repair:')) {
      // repair:<getAllArmoryEquipmentList sırası> → tek eşyanın onarımı (odun, demir, kömür, parça + ASTRA)
      const kayit = this.getAllArmoryEquipmentList()[Number(String(kind).slice(7))];
      if (!kayit || !kayit.item) return { ok: false, items: [], reason: 'Eşya bulunamadı.' };
      const bedel = this.calculateEquipmentRepairCost(kayit.item);
      if (!bedel || !(bedel.missingDurability > 0)) return { ok: false, items: [], reason: 'Eşya zaten sağlam.' };
      hedef = { iron: bedel.ironCost, wood: bedel.woodCost, coal: bedel.coalCost, fragments: bedel.fragCost };
      ekAstra = Number(bedel.adaCost) || 0;
    } else if (kind === 'repairall') {
      // Bütün hasarlı eşyalar: onarım sırayla yapılır, toplam bedelin hepsi aynı anda siloda durmak zorunda değil
      const b = this.getRepairAllCost();
      if (!b.onarilacak.length) return { ok: false, items: [], reason: 'Onarılacak eşya yok.' };
      hedef = { iron: b.demir, wood: b.odun, coal: b.komur, fragments: b.parca };
      ekAstra = Number(b.ada) || 0;
      kapasitesiz = true;
    } else if (kind === 'heal' || String(kind).startsWith('heal:')) {
      // Şifalı otla hemen iyileştirme (Kışla, Zindan, Şifahane "Hızlı iyileştir"): eksik ot pazardan alınır, ASTRA payı eklenir.
      // 'heal' = bütün yaralılar, 'heal:<sıra>' = tek asker
      const tek = kind === 'heal' ? null : Number(String(kind).slice(5));
      const iyilestirme = tek == null ? this.getAllHealCost() : (() => {
        const b = this.getHerbHealInfo(tek);
        return b && b.missingHp > 0 ? { totalHerbs: b.herbsNeeded, totalAda: b.herbAdaCost, count: 1 } : { count: 0 };
      })();
      if (!iyilestirme.count) return { ok: false, items: [], reason: tek == null ? 'Yaralı asker yok.' : 'Asker zaten tam can.' };
      hedef = { herb: iyilestirme.totalHerbs };
      ekAstra = Number(iyilestirme.totalAda) || 0;
      kapasitesiz = true;   // tahmin: iyileştirme tur tur yapılır (ekran/bilesik.js hizliIyilestir), ot hepsi birden siloda durmak zorunda değil
    } else if (kind === 'house') {
      // Köy evi: yalnız hammadde (odun, taş, demir); ev sayısı hesap seviyesini geçemez
      const koy = this.getVillageInfo();
      if (!koy.nextHouseCost) return { ok: false, items: [], reason: koy.houseLimitReason || 'Daha fazla ev yapılamaz.' };
      if (!koy.canBuildHouse) return { ok: false, items: [], reason: `${koy.houseLimitReason || 'Ev sınırı'}.` };
      hedef = { ...koy.nextHouseCost };
    } else if (kind === 'rocket') {
      // Roket görevi: parçaların hammaddeleri pazardan, 'adAstra' parçası ASTRA bedeli olarak eklenir
      const roket = this.getRocketStatus();
      if (roket.ready) return { ok: false, items: [], reason: 'Roket zaten hazır.' };
      if (!roket.levelOk) return { ok: false, items: [], reason: `Hesap seviyesi en az ${roket.minLevel} olmalı.` };
      hedef = {};
      for (const p of roket.parts) {
        if (p.key === 'adAstra') ekAstra = Number(p.need) || 0; else hedef[p.key] = p.need;
      }
    } else if (kind === 'rocketup') {
      // Roket geliştirme (seviye 2-5): sıradaki seviyenin hammadde parçaları pazardan, adAstra kalemi işin kendi ASTRA bedeli
      const roket = this.getRocketStatus();
      if (!roket.ready) return { ok: false, items: [], reason: 'Önce roketi yap.' };
      if (!roket.next) return { ok: false, items: [], reason: 'Roket zaten en üst seviyede.' };
      hedef = {};
      for (const p of roket.next.parts) {
        if (p.key === 'adAstra') ekAstra = Number(p.need) || 0; else hedef[p.key] = p.need;
      }
    } else if (String(kind).startsWith('tool:')) {
      // tool:<alet kimliği> → alet tamiri (odun + demir + ASTRA)
      const bedel = this.calculateRepairCost(String(kind).slice(5));
      if (!bedel) return { ok: false, items: [], reason: 'Alet bulunamadı.' };
      if (!(bedel.missingDurability > 0)) return { ok: false, items: [], reason: 'Alet zaten sağlam.' };
      hedef = { wood: bedel.woodCost, iron: bedel.ironCost };
      ekAstra = Number(bedel.adAstraCost) || 0;
    } else if (kind === 'modgate') {
      // Zindan modu geçişi: hammadde katkısının KALAN kısmı (verilenler zaten yakıldı) + son adımdaki ASTRA bedeli.
      // Katkı tur tur verilir (ekran/zindanmod.js hizliModGecis), hepsi birden siloda durmak zorunda değil.
      const bilgi = this.getDungeonModeInfo();
      if (!bilgi.gecis) return { ok: false, items: [], reason: 'Zaten en yüksek moddasın.' };
      if (!bilgi.bitti) return { ok: false, items: [], reason: `Önce ${bilgi.ad} modun son canavarını yenmelisin.` };
      hedef = Object.fromEntries(Object.entries(bilgi.gecis.kalan).filter(([, v]) => v > 0));
      ekAstra = Number(bilgi.gecis.astra) || 0;
      kapasitesiz = true;
    } else {
      return { ok: false, items: [], reason: 'Geçersiz.' };
    }

    const items = [];
    let toplam = 0;
    let siloYetmiyor = false;
    for (const kaynak of Object.keys(hedef)) {
      const elde = Math.floor(Number(depo[kaynak]) || 0);
      let gerekli = Math.max(0, Math.ceil(hedef[kaynak] - elde));
      const bosYer = kapasite[kaynak] != null ? Math.max(0, Math.floor(kapasite[kaynak] - elde)) : gerekli;
      if (!kapasitesiz && gerekli > bosYer) { gerekli = bosYer; siloYetmiyor = true; }
      if (gerekli <= 0) continue;
      const bedel = ammMarket.getEstimatedCostForBuy(kaynak, gerekli);
      if (!isFinite(bedel)) return { ok: false, items: [], reason: 'Pazarda yeterli hammadde yok.' };
      items.push({ res: kaynak, qty: gerekli, cost: bedel, name: kaynakAdi(kaynak) });
      toplam += bedel;
    }

    const balance = Number(this.state.adAstraBalance) || 0;
    const needAda = toplam + ekAstra * ASTRA_PAYI;
    const ortak = { items, total: toplam, extraAda: ekAstra, balance, needAda, capBlocked: siloYetmiyor };
    if (xpEksik && items.length) {
      return { ok: false, ...ortak, reason: 'Önce deneyimi (XP) tamamla; hammaddeyi seviye atlayabileceğin zaman al.' };
    }

    let neden = '';
    if (items.length === 0) neden = 'Eksik hammadde yok.';
    else if (siloYetmiyor) neden = 'Silon bu kadar hammadde alamıyor: önce siloyu yükselt.';
    else if (balance < needAda) neden = `ASTRA yetmiyor: alım ~${tr(Math.ceil(toplam))} + yükseltme ~${tr(Math.ceil(ekAstra))} ASTRA gerekli.`;
    return { ok: items.length > 0 && balance >= needAda && !siloYetmiyor, ...ortak, reason: neden };
  },

  // 🧺 Depoyu doldur: siloda boş yer kadar; ASTRA yetmezse bütçeye sığan en büyük miktar
  getFillWarehouseQty(resKey) {
    const kapasite = this.getWarehouseCapacity()[resKey];
    const mevcut = Math.floor(Number((this.state.inventory || {})[resKey]) || 0);
    const bosYer = Math.max(0, Math.floor((kapasite || 0) - mevcut));
    const bakiye = Number(this.state.adAstraBalance) || 0;
    const bedelOf = (q) => (q > 0 ? ammMarket.getEstimatedCostForBuy(resKey, q) : 0);

    if (bosYer > 0 && !(bedelOf(bosYer) <= bakiye)) {
      let alt = 0;
      let ust = bosYer;
      while (alt < ust) {
        const orta = Math.ceil((alt + ust) / 2);
        if (bedelOf(orta) <= bakiye) alt = orta; else ust = orta - 1;
      }
      return { qty: alt, room: bosYer, cost: bedelOf(alt), limitedByAda: true };
    }
    return { qty: bosYer, room: bosYer, cost: bedelOf(bosYer), limitedByAda: false };
  }
};
