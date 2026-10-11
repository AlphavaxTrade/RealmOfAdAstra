// Realm of AdAstra — birden çok ekranın kullandığı birleşik parçalar (hızlı al kartı, kaynak simgesi, maliyet satırı).
import { esc, dugme, kart, uyari, tam, astra } from './cekirdek.js';
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
  const liste = plan.items.map((i) => `• ${tam(i.qty)} ${i.name} (~${tam(Math.ceil(i.cost))} ASTRA)`).join('\n');
  const tamam = await onay({
    baslik: 'Eksikler pazardan alınsın mı?',
    metin: `${liste}\nToplam ~${tam(Math.ceil(plan.total))} ASTRA`,
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
