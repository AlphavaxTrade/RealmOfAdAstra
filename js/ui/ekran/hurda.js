// Realm of AdAstra — Hurda ve geri dönüşüm raporu: Kışla'da fazla eşyalar toplu eritilince gösterilir.
// Rapor ekrana seçenek olarak verilir ({ rapor }).
import { ekranKaydet, kap, kart, satir, izgara, hucre, not, dugme, dugmeler, tam } from './cekirdek.js';

const ekran = {
  id: 'hurda',
  // Ekran çizim testi ve ekran-bak aracı için örnek rapor
  ornekSecenekler: () => [{ rapor: { scrappedCount: 2, gainedFragments: 4, gainedIron: 20, scrappedItems: [
    { icon: '🗡️', name: 'Demir Kılıç', level: 1, fragGained: 2, ironGained: 10 },
    { icon: '🛡️', name: 'Deri Zırh', level: 1, fragGained: 2, ironGained: 10 }
  ] } }],
  baslik: () => ['♻️', 'Hurda ve geri dönüşüm'],

  govde(b, secenek) {
    const r = secenek && secenek.rapor;
    if (!r) return kap(not('Gösterilecek bir rapor yok.'));
    const eritilenler = r.scrappedItems || [];
    const liste = eritilenler.map((e) => satir(
      `${e.icon || ''} ${e.name} · seviye ${e.level}`,
      `+${tam(e.fragGained)} 💎 · +${tam(e.ironGained)} ⛏️`
    )).join('');

    return kap([
      kart({
        baslik: `✨ Geri dönüşüm tamam: ${tam(r.scrappedCount)} eşya eritildi`,
        icerik: not('Askerlerinin üzerindeki teçhizatlar korundu. Yalnızca cephanelikte boşta duran 1. seviye fazlalık eşyalar eritilip hammadde ve teçhizat parçasına dönüştürüldü.')
          + izgara([
            hucre('Kazanılan teçhizat parçası', `+${tam(r.gainedFragments)} 💎`, 'iyi'),
            hucre('Geri kazanılan demir', `+${tam(r.gainedIron)} ⛏️`, 'iyi')
          ])
      }),
      eritilenler.length ? kart({ baslik: `📋 Eritilenler (${eritilenler.length} kalem)`, icerik: liste }) : '',
      dugmeler(
        dugme({ e: 'kisla', metin: 'Kışlaya dön' }),
        dugme({ e: 'demirhane', metin: '⚒️ Demirhaneye git ve yeni eşya döv', ton: 'birincil' })
      )
    ].join(''));
  },

  eylemler: {
    kisla() { return { git: 'kisla' }; },
    demirhane() { return { git: 'demirhane' }; }
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
