// Realm of AdAstra — Sürüm geçmişi: en yeni üç sürüm açık, eskileri katlı.
import { ekranKaydet, kap, kart, katli, etiket, esc } from './cekirdek.js';
import { surumuGoruldu } from '../v3/surum-bildirim.js';

const ACIK_SURUM = 1;   // 20 Ekim 2026: yalnız en yeni sürüm açık (eskiden 3; sürümler uzun olunca ekran 6.000 harfi buluyordu)
const GORUNEN_MADDE = 3;

function surumKarti(kayit) {
  const liste = (kayit.changes || []).map((c) => `<li>${esc(c)}</li>`);
  const gorunen = liste.slice(0, GORUNEN_MADDE).join('');
  const gerisi = liste.slice(GORUNEN_MADDE);
  return kart({
    baslik: `${etiket(kayit.version, 'vurgu')} ${esc(kayit.title)}`,
    rozet: `<small class="ek-kucuk">${esc(kayit.date)}</small>`,
    icerik: `<ul class="ek-sade-liste">${gorunen}</ul>${gerisi.length ? katli(`Devamı (${gerisi.length} madde)`, `<ul class="ek-sade-liste">${gerisi.join('')}</ul>`) : ''}`
  });
}

const ekran = {
  id: 'surum',
  baslik: () => ['📜', 'Sürüm geçmişi'],

  govde(b) {
    surumuGoruldu(b.GAME_CONFIG.CHANGELOG);   // sürüm geçmişi açıldı: "yeni sürüm" bildirimi bir daha çıkmaz
    const kayitlar = [...(b.GAME_CONFIG.CHANGELOG || [])].reverse();   // en yeni üstte
    const yeni = kayitlar.slice(0, ACIK_SURUM);
    const eski = kayitlar.slice(ACIK_SURUM);
    return kap([
      yeni.map(surumKarti).join(''),
      eski.length ? katli(`Önceki sürümler (${eski.length})`, eski.map(surumKarti).join(''), { k: 'eski-surumler' }) : ''
    ].join(''));
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
