// Çark dönüş açısı: her kazanan dilim, hangi açıdan başlanırsa başlansın ibrenin altında durur ve çark hep ileri döner.
import assert from 'node:assert/strict';
import { hedefDerece, ibredekiDilim, donusIstatistigi } from '../js/ui/ekran/cark.js';

for (const n of [3, 7, 15, 18]) {
  for (let kazanan = 0; kazanan < n; kazanan++) {
    for (const baslangic of [0, 13.7, 179.9, 359.99, 1234.5, -50]) {
      for (const tur of [5, 6, 7]) {
        const hedef = hedefDerece({ dilimSayisi: n, kazananSira: kazanan, simdiki: baslangic, tur });
        assert.equal(ibredekiDilim(hedef, n), kazanan, `n=${n} kazanan=${kazanan} başlangıç=${baslangic}`);
        assert.ok(hedef >= baslangic + tur * 360 - 1e-9 && hedef < baslangic + (tur + 1) * 360, 'çark ileri ve en az tur kadar döner');
      }
    }
  }
}
console.log('✅ her dilim ibrenin altında duruyor (3/7/15/18 dilim, her başlangıç açısı)');

// Dönüş istatistiği: tek ödüllü basit tablo
{
  const tablo = [
    { type: 'ada', weight: 50, valAda: 2 },
    { type: 'ada', weight: 50, valAda: 0 },
    { type: 'bot_free', weight: 0, valAda: 460 }
  ];
  const s = donusIstatistigi(tablo, 1);
  assert.equal(s.donus, 100, 'beklenen kazanç 1 ASTRA, bedel 1 → %100');
  assert.equal(s.geri, 50, 'yarısında en az bedel geri gelir');
  const parcali = donusIstatistigi([{ type: 'ada', weight: 50, valAda: 2 }, { type: 'ticket_shard', weight: 50, valAda: 0.333 }], 1);
  assert.ok(parcali.donus > 100, '3 parça = 1 bedava çevirme hesaba katılır');
  console.log('✅ dönüş istatistiği');
}
