// ASTRA akış modeli (19 Ekim 2026, scripts/ekonomi/akis-modeli.mjs): hazine paylaşımı ve taşma kuralı bozulursa kapı kırmızı olur.
// Model gerçek hazine ve harcama kodunu çalıştırır; harcama karışımları SENARYODUR (gerçek oyuncu verisi değil).
// Bu test bilerek bir DENGE sözleşmesidir: bir ayarı (kasa ağırlığı, doğrudan pay, taşma eşiği, tohum) değiştirirsen ve bu test kırılırsa
// önce modeli çalıştır (node scripts/ekonomi/akis-modeli.mjs), yeni rakamları değerlendir, sonra eşikleri bilerek güncelle.
import assert from 'node:assert/strict';
import { simuleEt, KARISIMLAR, ODEYEN_KASALAR } from '../scripts/ekonomi/akis-modeli.mjs';
const { GAME_CONFIG: C } = await import('../js/config.js');
const { treasury } = await import('../js/treasury.js');

let n = 0;
const ok = (ad) => { n++; console.log(`✅ ${ad}`); };

// 1) Yapı: ağırlıklar %100, doğrudan paylar "bir kısmı kendine, kalanı herkese" (hiçbir bölge harcamanın %70'inden fazlasını kendine ayıramaz)
{
  const toplam = Object.values(C.TREASURY_ALLOCATION).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(toplam - 1) < 1e-9, `kasa ağırlıkları toplamı 1 olmalı (${toplam})`);
  for (const [ad, pay, enCok] of [['zindan kapı harcı', C.DUNGEON_GATE_POOL_SHARE, 0.7], ['çark', C.CARNIVAL.WHEEL_CARNIVAL_SHARE, 0.85], ['kolezyum', C.COLOSSEUM.ENTRY_ARENA_SHARE, 0.7]]) {
    assert.ok(pay > 0 && pay <= enCok, `${ad}: doğrudan pay (0, %${enCok * 100}] olmalı, şimdi ${pay}: kalanı bütün kasalara dağılmalı`);
  }
  ok('kasa ağırlıkları %100; doğrudan paylar sınırlı: zindan/kolezyum <= %70, çark <= %85 (oyunun her yeri birbirini besler)');
}

// 2) Ağırlıklar kapasiteyle orantılı: ödeme yapan her kasanın payı, haftalık ödeme kapasitesi payına (Fatih ve UOA tohumunun ~%9,65'i düşülmüş) ±%20 yakın
{
  const oran = (id) => (id === 'ammBuyback' ? 0.03 : C.TREASURY_WEEKLY_BUDGET.RATES[id]);
  const kap = Object.fromEntries(ODEYEN_KASALAR.map((id) => [id, C.TREASURY_SEED[id] * oran(id)]));
  const top = Object.values(kap).reduce((s, v) => s + v, 0);
  const ayrilan = 1 - C.TREASURY_ALLOCATION.fatih - C.TREASURY_ALLOCATION.uoaTohum;
  for (const id of ODEYEN_KASALAR) {
    const hedef = ayrilan * kap[id] / top;
    const gercek = C.TREASURY_ALLOCATION[id];
    assert.ok(Math.abs(gercek / hedef - 1) <= 0.2, `${id}: ağırlık ${gercek} kapasiteye göre ~${hedef.toFixed(3)} olmalı (±%20)`);
  }
  ok('kasa ağırlıkları ödeme kapasitesiyle orantılı (±%20)');
}

// 3) 52 hafta, harcama ödeme kapasitesini tam karşılarken: hiçbir kasa şişmez ya da aç kalmaz (4 harcama karışımı)
{
  for (const k of Object.keys(KARISIMLAR)) {
    const r = simuleEt({ karisim: k, harcamaDuzeyi: 1 });
    assert.ok(r.enDusuk >= 0.70, `${k}: en aç kasa ${r.enDusuk.toFixed(2)} (>= 0,70 olmalı): ${JSON.stringify(r.saglik)}`);
    assert.ok(r.enYuksek <= 1.30, `${k}: en şişkin kasa ${r.enYuksek.toFixed(2)} (<= 1,30 olmalı): ${JSON.stringify(r.saglik)}`);
    assert.ok(r.saglik.worldBoss >= 0.70 && r.saglik.ammBuyback >= 0.70, `${k}: Dünya Boss ve Geri Alım kasaları aç bırakılmamalı`);
  }
  ok('tam harcamada 52 hafta: kasa sağlığı 0,70–1,30 bandında (4 karışım)');
}

// 4) Harcama düşükken (kapasitenin %70'i): kasalar tasarım gereği yavaş erir ama şişen ve çöken olmaz
{
  for (const k of Object.keys(KARISIMLAR)) {
    const r = simuleEt({ karisim: k, harcamaDuzeyi: 0.7 });
    assert.ok(r.enDusuk >= 0.40, `${k}: %70 harcamada en aç kasa ${r.enDusuk.toFixed(2)} (>= 0,40)`);
    assert.ok(r.enYuksek <= 1.30, `${k}: %70 harcamada en şişkin kasa ${r.enYuksek.toFixed(2)} (<= 1,30)`);
  }
  ok('%70 harcamada: kasalar yavaş erir, hiçbiri çökmez ya da şişmez');
}

// 5) Muhasebe ve yakım: harcamanın en az %2,5'i yakılır (doğrudan paylar düşünce yakım artar); ödenen para kasalardan çıkar, yoktan para yok
{
  const r = simuleEt({ karisim: 'dengeli', harcamaDuzeyi: 1 });
  assert.ok(r.yakilan / r.harcanan >= 0.025, `yakım oranı ${(r.yakilan / r.harcanan * 100).toFixed(2)}% (>= %2,5)`);
  assert.ok(r.odenenToplam > 0, 'oyunculara ödenen pozitif ve kasalardan çıkıyor');
  const ucuncu = r.yakilan + r.telif + r.temelGelir;
  assert.ok(ucuncu < r.harcanan, 'yakım + yapımcı + temel gelir harcamanın tamamı olamaz');
  ok('yakım >= %2,5 ve muhasebe tutarlı');
}

// 6) Taşma kuralı: dolu kasaya giren para en aç kasaya akar; toplam ASTRA korunur
{
  treasury.reset();
  const pools = treasury.state.pools;
  const tohum = { ...C.TREASURY_SEED };
  pools.arena = tohum.arena * 0.2;           // çok aç
  const once = Object.values(pools).reduce((s, v) => s + v, 0);
  const giren = 10000000;   // zindanın 1,25 tavanına ~4,7 M sığar; kalan ~5,3 M kolezyumun açığına (~8 M) akar
  treasury.depositTo('dungeon', giren);
  const sonra = Object.values(treasury.state.pools).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sonra - once - giren) < 1e-3, 'taşmada toplam korunur');
  const enCok = C.TREASURY_OVERFLOW.HEALTH_MAX;
  assert.ok(treasury.state.pools.dungeon <= tohum.dungeon * enCok + 1, `zindan kasası tohumun ${enCok} katını geçmez (açık varken)`);
  assert.ok(treasury.state.pools.arena > tohum.arena * 0.2 + 4e6, 'fazla para en aç kasaya (kolezyum) aktı');
  // taşma havuzu dışındaki kasaya (Fatih) doğrudan giriş taşmaz
  treasury.reset();
  const f0 = treasury.state.pools.fatih;
  treasury.depositTo('fatih', 5000000);
  assert.equal(treasury.state.pools.fatih, f0 + 5000000, 'Fatih kasası taşma kuralına girmez');
  treasury.reset();
  ok('taşma kuralı: fazla en aç kasaya akar, toplam korunur, Fatih etkilenmez');
}

console.log(`\n${n} akış modeli kontrolü geçti.`);
