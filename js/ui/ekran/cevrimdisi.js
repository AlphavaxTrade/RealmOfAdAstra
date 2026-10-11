// Realm of AdAstra — "Sen yokken olanlar": uzakta geçen sürede botun yaptıkları ve kaynakların değişimi.
// Rapor ekrana seçenek olarak verilir ({ rapor }); oyun durumundan tüketme işini açan taraf yapar.
import { ekranKaydet, kap, kart, satir, izgara, hucre, not, dugme, sayi, esc } from './cekirdek.js';

function sureMetni(saniye) {
  const s = Math.max(0, Math.floor(saniye || 0));
  const gun = Math.floor(s / 86400);
  const saat = Math.floor((s % 86400) / 3600);
  const dakika = Math.floor((s % 3600) / 60);
  if (gun > 0) return `${gun} gün ${saat} saat`;
  if (saat > 0) return `${saat} saat ${dakika} dakika`;
  return `${dakika} dakika`;
}

// Önce → sonra satırı ve farkı
function degisimSatiri(simge, ad, once, sonra, ondalik = 0) {
  const fark = (sonra || 0) - (once || 0);
  const ton = fark > 0.004 ? 'iyi' : (fark < -0.004 ? 'kotu' : '');
  return satir(`${simge} ${ad}`, `${sayi(once, ondalik)} → ${sayi(sonra, ondalik)} (${fark >= 0 ? '+' : ''}${sayi(fark, ondalik)})`, ton);
}

const ekran = {
  id: 'cevrimdisi',
  // Ekran çizim testi ve ekran-bak aracı için örnek rapor
  ornekSecenekler: (b) => {
    const once = { ada: 120.5, warehouseLevel: 2 };
    const sonra = { ada: 188.25, warehouseLevel: 2 };
    b.GAME_CONFIG.RESOURCE_KEYS.forEach((k, i) => { once[k] = 100 * (i + 1); sonra[k] = 100 * (i + 1) + 35 * (i % 3); });
    return [{ rapor: { seconds: 5400, skippedSeconds: 0, botWorkedSeconds: 3600, expeditionsClaimed: 4, botRenewals: 1, before: once, after: sonra, village: { eaten: 12, grew: 1.5, lost: 0, villagers: 21 }, botStoppedReason: '' } }];
  },
  baslik: () => ['🌙', 'Sen yokken olanlar'],

  govde(b, secenek) {
    const r = secenek && secenek.rapor;
    if (!r) return kap(not('Gösterilecek bir rapor yok.'));
    const once = r.before || {};
    const sonra = r.after || {};
    const meta = b.GAME_CONFIG.RESOURCE_META || {};

    const ozet = izgara([
      hucre('Uzakta geçen süre', sureMetni(r.seconds + (r.skippedSeconds || 0))),
      hucre('Botun çalıştığı süre', sureMetni(r.botWorkedSeconds)),
      hucre('Toplanan sefer', sayi(r.expeditionsClaimed)),
      r.botRenewals ? hucre('Otomatik yenileme', `${r.botRenewals} kez`) : ''
    ].filter(Boolean));

    const degisimler = b.GAME_CONFIG.RESOURCE_KEYS.map((k) => {
      const m = meta[k] || {};
      return degisimSatiri(m.icon || '', m.name || k, once[k], sonra[k]);
    }).join('')
      + degisimSatiri('🟣', 'ASTRA', once.ada, sonra.ada, 2)
      + degisimSatiri('🏰', 'Silo seviyesi', once.warehouseLevel, sonra.warehouseLevel);

    const notlar = [];
    if (r.village) {
      const v = r.village;
      notlar.push(not(`🏘️ Köy: ${sayi(v.eaten)} buğday yendi, ${sayi(v.grew, 1)} köylü doğdu${v.lost > 0 ? `, ${sayi(v.lost, 1)} köylü açlıktan göç etti` : ''}; şimdi ${sayi(v.villagers)} köylü.`));
    }
    if (r.botStoppedReason) notlar.push(not(`⏸️ Bot durdu: ${esc(r.botStoppedReason)}`));
    if (r.skippedSeconds > 0) notlar.push(not(`ℹ️ Bot en fazla 7 günü telafi eder; daha eski ${sureMetni(r.skippedSeconds)} hesaba katılmadı.`));

    return kap([
      kart({ baslik: '🌙 Uzakta geçen süre', icerik: ozet }),
      kart({ baslik: '📊 Neler değişti', icerik: degisimler }),
      notlar.join(''),
      dugme({ e: 'tamam', metin: 'Tamam, devam et', ton: 'birincil', genis: true })
    ].join(''));
  },

  eylemler: {
    tamam() { return { kapat: true }; }
  }
};

export default ekranKaydet(ekran);
