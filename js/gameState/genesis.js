// Realm of AdAstra — GameStateManager yöntemleri: Genesis Yolu ve Genesis katkı defteri
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
//
// Makro plan C6 (docs/v2/MAKRO_EKONOMI_PLANI.md, kullanıcı onayı 15 Ekim 2026): Genesis NFT uzun ve pahalı bir yolun sonudur;
// ekosistem karşılığını ASTRA olarak değil ayrıcalıkla (süresiz Uydu, Gözlemevi %50, gezegen hakkı, stake çarpanı) öder.
// Kullanıcı kuralı: Genesis basan, ekosisteme en az KATKI_YIL yıllık beklenen ayrıcalık maliyetini önden ödemiş olmalı.
// Yol: şartlar (seviye, hesap yaşı, Krallık Yolu, Fatih, 4 hafta Altın katkı) → 18 eser → her eseri uyandırma (ASTRA + yakılan
// hammadde, aynı anda tek eser, 72 saat) → mühür (dolar sabit bedel, yarısı yakılır; açık mühür sayısı trade gelirine bağlı).
//
// Dünya bilgisi (ASTRA'nın dolar fiyatı, açık mühür sayısı, hesap açılış zamanı) KAYDA YAZILMAZ: sunucu motoru ve çevrimiçi istemci
// this._dunya'ya koyar. Yoksa (tek oyunculu mod, zincirsiz deneme sunucusu) yedek fiyat ve sezon tavanı kullanılır.
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { treasury } from '../treasury.js';
import { round3 } from './ortak.js';
import { genesisAyricalikMaliyeti } from '../economy/genesis.js';

const GUN = 86400000;
const AYAR = () => GAME_CONFIG.GENESIS_YOLU || {};

export const genesisYontemleri = {
  _genesisDunya() {
    const G = AYAR();
    const d = this._dunya || {};
    const olculen = Number(d.astraUsd) > 0;
    const tavan = Number(G.SEZON_TAVAN) || 100;
    const acikHam = d.genesisAcik;
    const acik = acikHam != null && Number.isFinite(Number(acikHam)) ? Math.max(0, Math.min(tavan, Math.floor(Number(acikHam)))) : tavan;
    return {
      astraUsd: olculen ? Number(d.astraUsd) : (Number(G.YEDEK_ASTRA_USD) || 0),
      fiyatOlculdu: olculen,
      acik, tavan,
      basilan: Number(globalPool && globalPool.state && globalPool.state.genesisBasilan) || 0,
      hesapAcilis: Number(d.hesapAcilis) > 0 ? Number(d.hesapAcilis) : null
    };
  },

  _genesisDefter() {
    let k = this.state.genesisKatki;
    if (!k || typeof k !== 'object') k = this.state.genesisKatki = { harcananUsd: 0, yakilanUsd: 0, cekilenUsd: 0 };
    return k;
  },

  // Katkı defterine yaz. tur: 'harcama' (oyunda harcanan ASTRA) | 'yakim' (yakılan hammaddenin ASTRA değeri). O anki dolar fiyatıyla.
  _genesisKatkiYaz(astra, tur = 'harcama') {
    const v = Number(astra) || 0;
    if (!(v > 0)) return;
    const usd = v * this._genesisDunya().astraUsd;
    if (!(usd > 0)) return;
    const k = this._genesisDefter();
    if (tur === 'yakim') k.yakilanUsd = (Number(k.yakilanUsd) || 0) + usd;
    else k.harcananUsd = (Number(k.harcananUsd) || 0) + usd;
  },

  // Oyundan cüzdana çekilen ASTRA (sunucu haftalık hesaplaşmada çağırır): çekim anındaki fiyatla düşülür
  genesisCekimYaz(astra, usdFiyat = null) {
    const v = Number(astra) || 0;
    if (!(v > 0)) return;
    const fiyat = Number(usdFiyat) > 0 ? Number(usdFiyat) : this._genesisDunya().astraUsd;
    const k = this._genesisDefter();
    k.cekilenUsd = (Number(k.cekilenUsd) || 0) + v * fiyat;
  },

  // Mühür bedeli (ASTRA): dolar sabit bedel ÷ güncel ASTRA fiyatı
  genesisMuhurBedeli() {
    const usd = Number((AYAR().MUHUR || {}).USD) || 0;
    const fiyat = this._genesisDunya().astraUsd;
    return fiyat > 0 ? round3(usd / fiyat) : 0;
  },

  // Bir eserin uyandırma bedeli: birim × (ASTRA × bedel çarpanı + hammadde)
  getUyandirmaBedeli(eserId) {
    const U = AYAR().UYANDIRMA || {};
    const cfg = (GAME_CONFIG.COLLECTION_ARTIFACTS || []).find(c => c.id === eserId);
    if (!cfg) return null;
    const birim = Number((U.BIRIM || {})[cfg.rarity]) || 1;
    const hammadde = Object.fromEntries(Object.entries(U.BIRIM_HAMMADDE || {}).map(([k, v]) => [k, Math.round((Number(v) || 0) * birim)]));
    return { birim, astra: this.adaPrice(birim * (Number(U.BIRIM_ASTRA) || 0)), hammadde, sureMs: (Number(U.SURE_SAAT) || 72) * 3600000 };
  },

  // Süresi dolan uyandırmayı tamamlar (her okumada ve işlemde çağrılır). Döndürür: tamamlanan eserin kimliği ya da null.
  _uyandirmaTamamla() {
    const u = this.state.genesisUyandirma;
    if (!u || typeof u !== 'object') return null;
    if (this._now() < (Number(u.bitis) || 0)) return null;
    const a = (this.state.collectionArtifacts || []).find(x => x.id === u.id);
    if (a) { a.uyandi = true; a.uyandiAt = Number(u.bitis) || this._now(); }
    delete this.state.genesisUyandirma;
    return u.id;
  },

  // Bir eseri uyandırmaya başlar (aynı anda tek eser): ASTRA harcanır, hammadde yakılır
  uyandirEser(eserId) {
    this._uyandirmaTamamla();
    const s = this.state;
    const id = String(eserId || '');
    const a = (s.collectionArtifacts || []).find(x => x.id === id);
    const cfg = (GAME_CONFIG.COLLECTION_ARTIFACTS || []).find(c => c.id === id);
    if (!a || !cfg) return { success: false, message: 'Eser bulunamadı.' };
    if (!a.discovered) return { success: false, message: 'Bu eser henüz keşfedilmedi.' };
    if (a.uyandi) return { success: false, message: `${cfg.name} zaten uyandı.` };
    if (s.genesisUyandirma) {
      const aktif = (GAME_CONFIG.COLLECTION_ARTIFACTS || []).find(c => c.id === s.genesisUyandirma.id);
      return { success: false, message: `Şu an ${aktif ? aktif.name : 'bir eser'} uyanıyor; aynı anda tek eser uyanır.` };
    }
    const b = this.getUyandirmaBedeli(id);
    if ((Number(s.adAstraBalance) || 0) < b.astra) return { success: false, message: `Yetersiz ASTRA! (${b.astra.toLocaleString('tr-TR')} ASTRA gerekli)` };
    for (const [k, v] of Object.entries(b.hammadde)) {
      if ((Number(s.inventory[k]) || 0) < v) return { success: false, message: `Yetersiz hammadde: ${v.toLocaleString('tr-TR')} ${k} gerekli.` };
    }
    s.adAstraBalance = round3((Number(s.adAstraBalance) || 0) - b.astra);
    this._onAdaSpent(b.astra);
    globalPool.recordTokenSpend(b.astra);
    for (const [k, v] of Object.entries(b.hammadde)) s.inventory[k] = (Number(s.inventory[k]) || 0) - v;
    this.burnResources(b.hammadde);
    const now = this._now();
    s.genesisUyandirma = { id, bas: now, bitis: now + b.sureMs };
    this.saveState();
    return { success: true, message: `✨ ${cfg.icon} ${cfg.name} uyanmaya başladı (${Math.round(b.sureMs / 3600000)} saat).` };
  },

  // Genesis Yolu'nun bütün durumu (ekran ve mühür için)
  getGenesisYolu() {
    this._uyandirmaTamamla();
    const G = AYAR();
    const S = G.SART || {};
    const s = this.state;
    const d = this._genesisDunya();
    const now = this._now();
    const eserler = s.collectionArtifacts || [];
    const gerekliEser = Number((GAME_CONFIG.GENESIS_NFT || {}).requiredArtifacts) || 18;
    const uyanmis = eserler.filter(a => a.discovered && a.uyandi).length;
    const kesfedilen = eserler.filter(a => a.discovered).length;

    const kademeler = (GAME_CONFIG.URETIM_HAKKI || {}).TIERS || [];
    const kademe = kademeler.find(t => t.id === S.KATKI_KADEMESI) || { name: '-', min: 0 };
    const esik = (Number(kademe.min) || 0) * this.getAdaPriceMultiplier();
    const c = this._contribution();
    const hafta = Number(S.KATKI_HAFTA) || 4;
    const gecmis = (Array.isArray(c.gecmis) ? c.gecmis : []).slice(-hafta);
    const hesapYasiGun = d.hesapAcilis ? Math.max(0, (now - d.hesapAcilis) / GUN) : 0;
    const finalId = (GAME_CONFIG.ONBOARDING_FINAL || {}).id;

    const maliyet = genesisAyricalikMaliyeti(G);
    const k = this._genesisDefter();
    const net = (Number(k.harcananUsd) || 0) + (Number(k.yakilanUsd) || 0) - (Number(k.cekilenUsd) || 0);
    const muhurUsd = Number((G.MUHUR || {}).USD) || 0;
    const yerSiniri = Math.min(d.acik, d.tavan);

    const sartlar = [
      { id: 'seviye', ad: `Hesap seviyesi en az ${S.HESAP_SEVIYESI}`, ok: (Number(s.level) || 1) >= (Number(S.HESAP_SEVIYESI) || 0), deger: `Sv.${Number(s.level) || 1}` },
      { id: 'yas', ad: `Hesap en az ${S.HESAP_YASI_GUN} günlük`, ok: hesapYasiGun >= (Number(S.HESAP_YASI_GUN) || 0), deger: `${Math.floor(hesapYasiGun)} gün` },
      { id: 'krallik', ad: 'Krallık Yolu tamamlandı', ok: !S.KRALLIK_YOLU || !!(finalId && s.onboardingSections && s.onboardingSections[finalId] && s.onboardingSections[finalId].claimed), deger: '' },
      { id: 'fatih', ad: 'Zindanın 18. kat bossu yenildi (Fatih)', ok: !S.FATIH || !!(s.fatih && s.fatih.alindi), deger: '' },
      { id: 'katki', ad: `Son ${hafta} haftanın her birinde katkı en az ${kademe.name} (${Math.ceil(esik).toLocaleString('tr-TR')} puan)`, ok: gecmis.length >= hafta && gecmis.every(v => (Number(v) || 0) >= esik), deger: gecmis.map(v => Math.round(Number(v) || 0)).join(' · ') || '-' },
      { id: 'eser', ad: `${gerekliEser} eserin hepsi uyandı (${kesfedilen} keşfedildi)`, ok: uyanmis >= gerekliEser, deger: `${uyanmis}/${gerekliEser}` },
      { id: 'defter', ad: `Ekosisteme net katkı (mühür dahil) en az ${Math.round(maliyet.gerekli)} $`, ok: net + muhurUsd >= maliyet.gerekli - 1e-9, deger: `${(net + muhurUsd).toFixed(2)} $` },
      { id: 'yer', ad: 'Açık mühür yeri var', ok: d.basilan < yerSiniri, deger: `${d.basilan}/${yerSiniri}` }
    ];
    const basildi = !!s.genesisNftMinted;
    return {
      basildi, no: s.genesisNo || null, zincir: s.genesisZincir || null,
      sartlar, hazir: !basildi && sartlar.every(x => x.ok),
      defter: { harcananUsd: Number(k.harcananUsd) || 0, yakilanUsd: Number(k.yakilanUsd) || 0, cekilenUsd: Number(k.cekilenUsd) || 0, net },
      maliyet,
      muhur: { usd: muhurUsd, astra: this.genesisMuhurBedeli(), yakimPayi: Number((G.MUHUR || {}).YAKIM_PAYI) || 0 },
      uyandirma: s.genesisUyandirma ? { ...s.genesisUyandirma, kalanMs: Math.max(0, (Number(s.genesisUyandirma.bitis) || 0) - now) } : null,
      dunya: d
    };
  },

  // Genesis NFT'yi basar: bütün şartlar + mühür bedeli (dolar sabit; yarısı yakılır, yarısı her harcama gibi kasalara)
  mintGenesisNft() {
    const s = this.state;
    if (s.genesisNftMinted) return { success: false, message: 'Genesis NFT zaten basıldı!' };
    const y = this.getGenesisYolu();
    const eksik = y.sartlar.filter(x => !x.ok);
    if (eksik.length) return { success: false, message: `Genesis için eksik şartlar: ${eksik.map(x => x.ad).join(' · ')}` };
    const bedel = y.muhur.astra;
    if (!(bedel > 0)) return { success: false, message: 'Mühür bedeli hesaplanamadı (ASTRA fiyatı yok).' };
    if ((Number(s.adAstraBalance) || 0) < bedel) return { success: false, message: `Yetersiz ASTRA! Mühür bedeli ${bedel.toLocaleString('tr-TR')} ASTRA (${y.muhur.usd} $).` };

    s.adAstraBalance = round3((Number(s.adAstraBalance) || 0) - bedel);
    this._onAdaSpent(bedel);
    const yak = round3(bedel * y.muhur.yakimPayi);
    if (yak > 0) {
      globalPool.state.totalBurned = (Number(globalPool.state.totalBurned) || 0) + yak;   // sunucu haftalık hesaplaşmada ölü adrese gönderir
      treasury.recordBurn(yak);
    }
    globalPool.recordTokenSpend(round3(bedel - yak));
    const no = (Number(globalPool.state.genesisBasilan) || 0) + 1;
    globalPool.state.genesisBasilan = no;
    globalPool.saveState();

    s.genesisNftMinted = true;
    s.genesisNo = no;
    s.genesisZincir = 'bekliyor';   // zincirdeki NFT (contracts/GenesisNFT.sol) bağlı cüzdana sonra basılır
    const mevcut = Array.isArray(s.grants) ? s.grants : [];
    const yeni = (GAME_CONFIG.GENESIS_NFT && GAME_CONFIG.GENESIS_NFT.grants) || ['universe_planet_purchase'];
    s.grants = Array.from(new Set([...mevcut, ...yeni]));
    this.saveState();
    return { success: true, no, bedel, yakilan: yak, message: `🏆 ${(GAME_CONFIG.GENESIS_NFT || {}).name || 'Genesis NFT'} #${no} basıldı! Ekosisteme katkın için teşekkürler.` };
  }
};
