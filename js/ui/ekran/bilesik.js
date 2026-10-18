// Realm of AdAstra — birden çok ekranın kullandığı birleşik parçalar (hızlı al kartı, kaynak simgesi, maliyet satırı).
import { esc, dugme, kart, uyari, tam, astra, sure } from './cekirdek.js';
import { resImg } from '../art.js';
import { onay } from '../v3/bilesenler.js';

// Hammaddenin simge kutusunun içeriği: resim (yedek emoji ile)
export function kaynakSimgesi(b, key) {
  const m = (b.GAME_CONFIG.RESOURCE_META || {})[key] || {};
  return resImg(key, m.icon || '');
}

// Hazır HTML'e girer: ad kaçırılmış döner (yapılandırma verisi bile olsa ham HTML bileşenlerine kaçırılmamış metin geçmesin)
export const kaynakAdi = (b, key) => {
  const m = (b.GAME_CONFIG.RESOURCE_META || {})[key] || {};
  return esc(m.name || key);
};

// "elinde / gereken" satırı: yetiyorsa yeşil, yetmiyorsa kırmızı
export function maliyetSatiri(etiketHtml, sahip, gereken, { astraMi = false } = {}) {
  const yeter = sahip >= gereken;
  const yaz = astraMi ? astra : tam;
  return `<div class="ek-satir ${yeter ? 'is-iyi' : 'is-kotu'}"><span>${etiketHtml}</span><b>${esc(yaz(sahip))} / ${esc(yaz(gereken))}</b></div>`;
}

// Eksik hammaddeleri pazardan alıp bir işlemi mümkün kılan kart (seviye atlama, silo yükseltme)
// kind: 'levelup' | 'warehouse' | 'craft:<yuva>'. Eksik yoksa boş metin.
export function hizliAlKarti(b, kind, eylem = 'hizliAl') {
  const plan = b.gameState.getQuickBuyPlan(kind);
  if (!plan.items.length) return '';
  const liste = plan.items.map((i) => `${esc(tam(i.qty))} ${esc(i.name)}`).join(' · ');
  const ek = [];
  if (plan.capBlocked) ek.push(uyari('Siloda yer yetmediği için bir kısmı alınamıyor.', 'uyari'));
  if (!plan.ok && plan.reason) ek.push(uyari(esc(plan.reason), 'kotu'));
  return kart({
    icerik: `<p class="ek-not"><b class="ek-iyi">Eksikler:</b> ${liste}<br><span class="ek-kucuk">Pazardan yaklaşık ${esc(tam(Math.ceil(plan.total)))} ASTRA</span></p>
      ${ek.join('')}
      ${dugme({ e: eylem, metin: '⚡ Hızlı al', ton: 'iyi', devreDisi: !plan.ok, veri: { kind }, genis: true })}`
  });
}

// Planı onaylatır ve eksikleri sırayla pazardan alır. Döndürür: { alinan, hata }
export async function hizliAl(b, kind) {
  const gs = b.gameState;
  const plan = gs.getQuickBuyPlan(kind);
  if (!plan.ok) { b.bildir(plan.reason || 'Alım yapılamıyor.', 'error'); return { alinan: 0, hata: true }; }
  const liste = plan.items.map((i) => `• ${tam(i.qty)} ${i.name} (${astra(i.cost)} ASTRA)`).join('\n');
  const tamam = await onay({
    baslik: 'Eksikler pazardan alınsın mı?',
    metin: `${liste}\nToplam ${astra(plan.total)} ASTRA`,
    tamam: 'Satın al'
  });
  if (!tamam) return { alinan: 0, hata: false };
  let alinan = 0;
  for (const it of plan.items) {
    const r = await gs.marketBuy(it.res, it.qty);
    if (r && r.success) { alinan++; continue; }
    b.bildir(`${it.name} alınamadı: ${(r && r.message) || ''}`, 'error');
    return { alinan, hata: true };
  }
  if (alinan) b.bildir(`⚡ ${alinan} hammadde pazardan alındı.`, 'success');
  return { alinan, hata: false };
}

// Tek adımlık işlerde (köy evi, roket, alet tamiri) "eksikleri al ve yap": plan çıkarılır, onaylatılır, eksikler pazardan alınır, sonra iş yapılır.
// yap: eksikler alındıktan sonra çağrılan işlem; { success, message } döndürmeli. Döndürür: { yapildi, hata }
export async function hizliAlVeYap(b, kind, { baslik, tamam, yap }) {
  const gs = b.gameState;
  const plan = gs.getQuickBuyPlan(kind);
  if (plan.items.length) {
    if (!plan.ok) { b.bildir(plan.reason || 'Alım yapılamıyor.', 'error'); return { yapildi: false, hata: true }; }
    const satirlar = plan.items.map((i) => `• ${tam(i.qty)} ${i.name} (${astra(i.cost)} ASTRA)`).join('\n');
    const ek = plan.extraAda > 0 ? ` + işin kendi bedeli ${astra(plan.extraAda)} ASTRA` : '';
    const onayli = await onay({ baslik, metin: `${satirlar}\nAlım ${astra(plan.total)} ASTRA${ek}`, tamam });
    if (!onayli) return { yapildi: false, hata: false };
    for (const it of plan.items) {
      const r = await gs.marketBuy(it.res, it.qty);
      if (!r || !r.success) { b.bildir(`${it.name} alınamadı: ${(r && r.message) || ''}`, 'error'); return { yapildi: false, hata: true }; }
    }
  }
  const sonuc = await yap();
  if (sonuc && sonuc.message) b.bildir(sonuc.message, sonuc.success ? 'success' : 'error');
  return { yapildi: !!(sonuc && sonuc.success), hata: !(sonuc && sonuc.success) };
}

// "Eksik otu al ve iyileştir" düğmesinin toplam bedeli: pazardan ot alımı + iyileştirme ASTRA'sı. Kışla, Şifahane ve Zindan AYNI yazıyı kullanır
// (eskiden biri tam sayıya yuvarlıyor, öbürü kuruşlu yazıyordu: 6 ASTRA ile 5,51 ASTRA).
export const planBedeli = (plan) => `${astra((Number(plan.total) || 0) + (Number(plan.extraAda) || 0))} ASTRA`;

// Eşyanın konum kaydı (sunucu modunda eşya nesnesi yerine konum gider): getAllArmoryEquipmentList() satırından
export const esyaKonumu = (g) => ({ source: g.source, slotKey: g.slotKey, armoryIndex: g.armoryIndex ?? null, soldierIndex: g.soldierIndex ?? null });
const ayniKonum = (a, c) => a.source === c.source && a.slotKey === c.slotKey && a.armoryIndex === c.armoryIndex && a.soldierIndex === c.soldierIndex;

// Onarım için "Eksikleri al ve onar": konum verilirse o eşya, verilmezse hasarlı bütün eşyalar. Eşyalar tek tek, sırayla onarılır; her birinin
// eksiği (odun, demir, kömür, parça) o an pazardan alınır, silo hepsini birden tutmak zorunda kalmaz. Döndürür: { onarilan, hata }
export async function hizliOnar(b, konum = null) {
  const gs = b.gameState;
  const liste = () => gs.getAllArmoryEquipmentList();
  const sira = (k) => liste().findIndex((g) => ayniKonum(esyaKonumu(g), k));
  const hasarli = (g) => (g.item.durability ?? 13) < (g.item.maxDurability || 13);
  const hedefler = konum ? [konum] : liste().filter(hasarli).map(esyaKonumu);
  if (!hedefler.length) { b.bildir('Onarılacak eşya yok.', 'info'); return { onarilan: 0, hata: false }; }
  const plan = gs.getQuickBuyPlan(konum ? `repair:${sira(konum)}` : 'repairall');
  if (plan.items.length) {
    if (!plan.ok) { b.bildir(plan.reason || 'Alım yapılamıyor.', 'error'); return { onarilan: 0, hata: true }; }
    const satirlar = plan.items.map((i) => `• ${tam(i.qty)} ${i.name} (${astra(i.cost)} ASTRA)`).join('\n');
    const tamam = await onay({
      baslik: 'Eksikler alınıp onarım yapılsın mı?',
      metin: `${satirlar}\nAlım ${astra(plan.total)} ASTRA + onarım bedeli ${astra(plan.extraAda)} ASTRA`,
      tamam: 'Al ve onar'
    });
    if (!tamam) return { onarilan: 0, hata: false };
  }
  let onarilan = 0;
  for (const k of hedefler) {
    const s = sira(k);
    if (s < 0) continue;
    const adim = gs.getQuickBuyPlan(`repair:${s}`);
    if (adim.items.length) {
      if (!adim.ok) { b.bildir(`${onarilan} eşya onarıldı; devamı yapılamadı: ${adim.reason}`, 'warning'); return { onarilan, hata: true }; }
      for (const it of adim.items) {
        const r = await gs.marketBuy(it.res, it.qty);
        if (!r || !r.success) { b.bildir(`${onarilan} eşya onarıldı; ${it.name} alınamadı: ${(r && r.message) || ''}`, 'error'); return { onarilan, hata: true }; }
      }
    }
    const r = await gs.repairEquipment(k);
    if (!r || !r.success) { b.bildir(`${onarilan} eşya onarıldı; devamı yapılamadı: ${(r && r.message) || ''}`, 'error'); return { onarilan, hata: true }; }
    onarilan++;
  }
  b.bildir(`🔨 ${onarilan} eşya, eksikleri alınarak onarıldı.`, 'success');
  return { onarilan, hata: false };
}

// Kendiliğinden iyileşme ile hemen iyileştirmenin ne harcayacağı yan yana (canlı: ekran yenilendikçe kalan eksiğe göre güncellenir).
// k: { saniye, kendiOt, kendiAda, hemenOt, hemenAda }. Ot sayıları yukarı yuvarlanır (kısmi ot harcanmaz, hemen iyileştirmede).
export function iyilesmeKiyasi(k) {
  const ot = (n) => tam(Math.ceil(Number(n) || 0));
  return `<div class="ek-kucuk ek-kiyas">
    <div>⏳ <b>Kendiliğinden</b> (${esc(sure((k.saniye || 0) * 1000))}): ~${esc(ot(k.kendiOt))} 🌿 şifalı ot + ${esc(astra(k.kendiAda))} ASTRA</div>
    <div>⚡ <b>Hemen</b>: ${esc(ot(k.hemenOt))} 🌿 şifalı ot + ${esc(astra(k.hemenAda))} ASTRA</div></div>`;
}

// Şifalı otla "Hızlı iyileştir" (Kışla, Şifahane, Zindan, Krallık merkezi, Kolezyum): hemen iyileştirmenin tek yolu şifalı ottur.
// Eksik ot pazardan alınır (asker asker: silo hepsini birden tutmak zorunda kalmaz), sonra iyileştirilir. sira verilirse yalnız o asker.
// Ot yetiyorsa onay sorulmaz (bedel zaten düğmede yazıyor). Döndürür: { iyilesen, hata }
export async function hizliIyilestir(b, sira = null) {
  const gs = b.gameState;
  const yaralilar = sira != null
    ? [sira]
    : (gs.state.soldierUnits || []).map((_, i) => i).filter((i) => (gs.getHerbHealInfo(i) || {}).missingHp > 0);
  if (!yaralilar.length || (sira != null && !((gs.getHerbHealInfo(sira) || {}).missingHp > 0))) {
    b.bildir('İyileştirilecek yaralı asker yok.', 'info');
    return { iyilesen: 0, hata: false };
  }
  const plan = gs.getQuickBuyPlan(sira == null ? 'heal' : `heal:${sira}`);
  if (plan.items.length) {
    if (!plan.ok) { b.bildir(plan.reason || 'Alım yapılamıyor.', 'error'); return { iyilesen: 0, hata: true }; }
    const liste = plan.items.map((i) => `• ${tam(i.qty)} ${i.name} (${astra(i.cost)} ASTRA)`).join('\n');
    const tamam = await onay({
      baslik: 'Eksik ot alınıp askerler iyileştirilsin mi?',
      metin: `${liste}\nOt alımı ${astra(plan.total)} ASTRA + iyileştirme bedeli ${astra(plan.extraAda)} ASTRA`,
      tamam: 'Al ve iyileştir'
    });
    if (!tamam) return { iyilesen: 0, hata: false };
  }
  let iyilesen = 0; let ot = 0; let ada = 0;
  // Asker asker, tur tur: eksik ot alınır (silo en çok boş yeri kadar), eldeki otla iyileştirilir; silo bir askerin tam bedelini
  // tutamayacak kadar küçükse kısmi iyileşmeyle birkaç turda tamamlanır. Her turda en az 1 ot harcanır, sonsuz döngü olmaz.
  for (const i of yaralilar) {
    let tamamlandi = false;
    for (let tur = 0; tur < 40; tur++) {
      const bilgi = gs.getHerbHealInfo(i);
      if (!bilgi || bilgi.isFull) { tamamlandi = true; break; }
      if (bilgi.herbsInStock < bilgi.herbsNeeded) {
        const oda = Math.max(0, Math.floor((gs.getWarehouseCapacity().herb || 0) - bilgi.herbsInStock));
        const al = Math.min(bilgi.herbsNeeded - bilgi.herbsInStock, oda);
        if (al > 0) {
          const alim = await gs.marketBuy('herb', al);
          if (!alim || !alim.success) { b.bildir(`${iyilesen} asker iyileşti; şifalı ot alınamadı: ${(alim && alim.message) || ''}`, 'error'); return { iyilesen, hata: true }; }
        }
      }
      const r = await gs.healSoldierWithHerb(i, { kismi: true });
      if (!r || !r.success) { b.bildir((r && r.message) || 'İyileştirilemedi.', 'error'); return { iyilesen, hata: true }; }
      ot += r.herbsUsed || 0; ada += r.adaCost || 0;
      if (!r.partial) { tamamlandi = true; break; }
    }
    if (!tamamlandi) { b.bildir(`${iyilesen} asker iyileşti; bir askerin iyileştirmesi tamamlanamadı (silo çok küçük olabilir).`, 'warning'); return { iyilesen, hata: true }; }
    iyilesen++;
  }
  b.bildir(`🌿 ${iyilesen} asker anında iyileşti (-${tam(ot)} 🌿 şifalı ot, -${astra(ada)} ASTRA)`, 'success');
  return { iyilesen, hata: false };
}
