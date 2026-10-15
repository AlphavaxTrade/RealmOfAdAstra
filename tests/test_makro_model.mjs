// Makro ekonomi modeli (scripts/model/makro_model.mjs, tasarım docs/v2/MAKRO_EKONOMI_PLANI.md): değişmezler.
//   1) Çıkış Kapısı formülü: taban yok, trade ve net piyasa alımının yarısı, ani düşüşte son hafta
//   2) Ödeme Kadranı: ısınma, sınırlar, haftalık adım, kasa koruması
//   3) Bütün senaryolarda: haftalık çıkış ≤ trade alımının yarısı, trade yoksa çıkış yok, kasa eksiye düşmez, Genesis ≤ sezon tavanı,
//      spekülatör şoku dışında fiyat hiçbir hafta düşmez (kullanıcı kuralı, 15 Ekim 2026)
//   4) Zincir hesabı Arena sözleşmesinin kendi teklifleriyle aynı (11 Ekim 2026 ölçümü)
import assert from 'node:assert/strict';
import { calistir, SENARYOLAR, AKIS, ekosistemCikisTavani, odemeKadrani } from '../scripts/model/makro_model.mjs';
import { curveR, zincirOlustur } from '../scripts/model/zincir.mjs';

let toplam = 0;
const ok = ad => { toplam++; console.log(`✅ ${ad}`); };

// 1) Çıkış Kapısı
{
  assert.equal(ekosistemCikisTavani({ tb: [], na: [] }), 0, 'veri yoksa çıkış yok');
  assert.equal(ekosistemCikisTavani({ tb: [0, 0, 0, 0], na: [1e9, 1e9, 1e9, 1e9] }), 0, 'trade alımı yoksa çıkış yok (taban yok)');
  assert.equal(ekosistemCikisTavani({ tb: [100, 100, 100, 100], na: [1e9, 1e9, 1e9, 1e9] }), 50, 'trade alımının yarısı');
  assert.equal(ekosistemCikisTavani({ tb: [100, 100, 100, 100], na: [40, 40, 40, 40] }), 20, 'net piyasa alımının yarısı (ikinci bekçi)');
  assert.equal(ekosistemCikisTavani({ tb: [400, 400, 400, 0], na: [1e9, 1e9, 1e9, 1e9] }), 0, 'trade bu hafta durduysa 4 haftalık ortalama beklenmez');
  assert.equal(ekosistemCikisTavani({ tb: [0, 0, 0, 400], na: [1e9, 1e9, 1e9, 1e9] }), 50, 'ani artışta 4 haftalık ortalama (400 / 4 × 0,5)');
  assert.equal(ekosistemCikisTavani({ tb: [100, 100, 100, 100], na: [1e9, 1e9, 1e9, 1e9], fiyatEtkisiTavani: 30, k: 0.5 }), 15, '%2 fiyat etkisi × k');
  assert.equal(ekosistemCikisTavani({ tb: [1e12], na: [1e12], gonderimTavani: 7 }), 7, 'haftalık gönderim sınırı');
  ok('Çıkış Kapısı: trade ve net alımın yarısı, taban yok, ani düşüşte hemen kısılır');
}

// 2) Ödeme Kadranı
{
  assert.equal(odemeKadrani({ fiyatlar: [1, 2, 3] }), 1, 'ilk 4 hafta veri birikir: 1');
  const yukselen = Array.from({ length: 13 }, (_, i) => 1 + i * 0.2);
  const k1 = odemeKadrani({ fiyatlar: yukselen, onceki: 1 });
  assert.ok(k1 > 1 && k1 <= 1 + AKIS.KADRAN_ADIM + 1e-9, 'fiyat ortalamasının üstünde: yükselir, haftada en çok %5');
  const dusen = Array.from({ length: 13 }, (_, i) => 3 - i * 0.2);
  const k2 = odemeKadrani({ fiyatlar: dusen, onceki: 1 });
  assert.ok(k2 < 1 && k2 >= 1 - AKIS.KADRAN_ADIM - 1e-9, 'fiyat ortalamasının altında: düşer, haftada en çok %5');
  let k = 1;
  for (let i = 0; i < 60; i++) k = odemeKadrani({ fiyatlar: yukselen.map(v => v * 100), onceki: k });
  assert.ok(k <= AKIS.KADRAN_MAX + 1e-9, 'tavan 1,5');
  k = 1.3;
  for (let i = 0; i < 20; i++) k = odemeKadrani({ fiyatlar: yukselen, onceki: k, kasaSagligi: AKIS.SAGLIK_2 - 0.01 });
  assert.ok(k <= AKIS.KADRAN_TAVAN_2 + 1e-9, 'kasa sağlığı dörtte birin altında: en çok 0,8');
  ok('Ödeme Kadranı: ısınma, ±%5 adım, 0,6-1,5 sınırı, kasa koruması');
}

// 3) Senaryolar
{
  const sonuc = {};
  for (const ad of Object.keys(SENARYOLAR)) {
    const r = calistir(ad);
    sonuc[ad] = r;
    for (const [kural, sayi] of Object.entries(r.ozet.ihlal)) assert.equal(sayi, 0, `${ad}: ${kural} ihlali ${sayi} hafta`);
    assert.ok(r.ozet.enYuksekHaftalikOran <= AKIS.CIKIS_TRADE_PAYI + 1e-9, `${ad}: haftalık çıkış ÷ taze trade alımı ${r.ozet.enYuksekHaftalikOran}`);
    assert.ok(r.ozet.genesis.adet <= r.girdiler.genesis.sezonTavan, `${ad}: Genesis sezon tavanı`);
    for (const a of r.aylik) for (const [k2, v] of Object.entries(a)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${ad} ${a.ay}. ay ${k2} sayı değil`);
  }
  assert.equal(sonuc.t0.ozet.toplamCikis, 0, 'trade yoksa 3 yılda hiç çıkış yok');
  assert.equal(sonuc.tohum.ozet.toplamCikis, 0);
  assert.ok(sonuc.t2000.ozet.fiyat1M.ay36 > sonuc.t750.ozet.fiyat1M.ay36 && sonuc.t750.ozet.fiyat1M.ay36 > sonuc.t250.ozet.fiyat1M.ay36, 'trade geliri arttıkça fiyat daha çok yükselir');
  const durur = sonuc.durur.aylik.filter(a => a.ay * 4 > SENARYOLAR.durur.tradeBitisHafta + 4);
  assert.ok(durur.length > 0 && durur.every(a => a.cikis === 0), 'trade durunca (4 hafta içinde) oyundan çıkış durur');
  const sok = sonuc.sok.aylik.find(a => a.ay === 6);
  const normal = sonuc.t750.aylik.find(a => a.ay === 6);
  assert.ok(sok.fiyat1M < normal.fiyat1M, 'şok senaryosunda fiyat düşük');
  ok(`${Object.keys(SENARYOLAR).length} senaryo: haftalık çıkış ≤ trade alımının yarısı, trade yoksa çıkış yok, fiyat şok dışında hiç düşmedi`);
}

// 4) Zincir
{
  const S = 2157553980;   // 11 Ekim 2026 (blok 97.277.098)
  const yakin = (a, b) => Math.abs(a - b) < 0.001;
  assert.ok(yakin(curveR(S), 12.990), 'eğrideki AVAX');
  assert.ok(yakin(curveR(S + 1e9) - curveR(S), 27.727), '1 milyar token teklifi');
  assert.ok(yakin(curveR(7.3e9) - curveR(S), 490.152), 'mezuniyete kalan');
  const Z = zincirOlustur({ avaxUsd: 10, S0: S });
  const p0 = Z.price();
  const al = Z.buyUsd(100);
  assert.ok(Z.price() > p0 && al > 0);
  Z.sellAda(al);
  assert.ok(Math.abs(Z.price() - p0) / p0 < 1e-9, 'aldığını satınca fiyat geri döner (ücret alımda)');
  ok('Zincir hesabı Arena sözleşmesinin teklifleriyle aynı');
}

console.log(`\n${toplam} makro model kontrolü geçti.`);
process.exit(0);
