// Yük testi aracının saf yardımcıları (kurumsal A4.1): yüzdelik, özet, CSV özeti, seçenekler, senaryo isteği, CPU profil özeti
import assert from 'node:assert/strict';
import { yuzdelik, ozetle, csvOzeti, secenekler, senaryoIstegi } from '../scripts/yuk/yuk.mjs';
import { ozetle as cpuOzetle } from '../scripts/yuk/cpu-ozet.mjs';
import { kontrolEt } from '../scripts/yuk/kontrol.mjs';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

// 1) Yüzdelik (en yakın sıra yöntemi)
{
  const s = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(yuzdelik(s, 50), 50);
  assert.equal(yuzdelik(s, 95), 95);
  assert.equal(yuzdelik(s, 99), 99);
  assert.equal(yuzdelik(s, 100), 100);
  assert.equal(yuzdelik([7], 99), 7);
  assert.equal(yuzdelik([], 50), 0);
  ok('yüzdelik: p50/p95/p99/p100, tek eleman, boş dizi');
}

// 2) Özet: sıralar, hata sayar, saniyede istek
{
  const o = ozetle([30, 10, 20, 40], 1, 2);
  assert.deepEqual(o, { istek: 5, hata: 1, rps: 2.5, p50: 20, p95: 40, p99: 40, max: 40 });
  assert.equal(ozetle([], 3, 1).p50, 0);
  ok('özet: sıralama, hata ve istek/sn');
}

// 3) Sunucu ölçüm CSV'si: sızıntı göstergesi heap (GC sonrası) ilk/son/maks
{
  const csv = 'saniye,rss_mb,heap_kullanilan_mb,heap_toplam_mb,dis_mb,olay_dongusu_p99_ms,olay_dongusu_kullanim\n0,100,20,30,5,10,0.1\n2,150,25,30,5,40,0.9\n4,140,22,30,5,20,0.5\n';
  const c = csvOzeti(csv);
  assert.deepEqual(c, { ornek: 3, rssMax: 150, heapIlk: 20, heapSon: 22, heapMax: 25, olayP99Max: 40, olayKullanimMax: 0.9 });
  assert.equal(csvOzeti('baslik\n'), null);
  ok('CSV özeti: rss/heap/olay döngüsü');
}

// 4) Komut satırı seçenekleri
{
  const v = secenekler([]);
  assert.deepEqual([v.oyuncu, v.baglanti, v.sure, v.soak, v.cpuProf], [200, [50], 10, 0, false]);
  const o = secenekler(['--oyuncu=1000', '--baglanti=50,500,2000', '--sure=5', '--senaryo=state,karma', '--soak=1800', '--cpu-prof', '--heap=8192', '--json=x.json']);
  assert.deepEqual([o.oyuncu, o.baglanti, o.sure, o.senaryo, o.soak, o.cpuProf, o.heap, o.json], [1000, [50, 500, 2000], 5, ['state', 'karma'], 1800, true, 8192, 'x.json']);
  ok('seçenekler: varsayılanlar ve ayrıştırma');
}

// 5) Senaryo istekleri: doğru yol/yöntem, oyuncular sırayla dağıtılır, bilinmeyen senaryo hata verir
{
  const tokenlar = ['t0', 't1', 't2'];
  const sabit = () => 0.01;
  assert.deepEqual(senaryoIstegi('health', tokenlar, 0, sabit), { yol: '/api/health' });
  assert.deepEqual(senaryoIstegi('state', tokenlar, 4, sabit), { yol: '/api/state', token: 't1' });
  const a = senaryoIstegi('aksiyon', tokenlar, 2, sabit);
  assert.equal(a.yontem, 'POST'); assert.equal(a.yol, '/api/action'); assert.equal(a.token, 't2'); assert.ok(a.govde.name);
  assert.equal(senaryoIstegi('karma', tokenlar, 0, () => 0.1).yol, '/api/state');
  assert.equal(senaryoIstegi('karma', tokenlar, 0, () => 0.7).yol, '/api/action');
  assert.ok(['/api/wallet', '/api/pvp/status'].includes(senaryoIstegi('karma', tokenlar, 0, () => 0.95).yol));
  assert.equal(senaryoIstegi('statik', tokenlar, 0, () => 0.1, '/assets/x.js').yol, '/');
  assert.equal(senaryoIstegi('statik', tokenlar, 0, () => 0.9, '/assets/x.js').yol, '/assets/x.js');
  assert.throws(() => senaryoIstegi('yok', tokenlar, 0, sabit), /bilinmeyen senaryo/);
  ok('senaryo istekleri: yol, yöntem, oyuncu dağıtımı, bilinmeyen senaryo hatası');
}

// 6) CPU profil özeti: kendi süresine göre sıralar, aynı işlevi birleştirir
{
  const profil = {
    nodes: [
      { id: 1, callFrame: { functionName: '(root)', url: '', lineNumber: -1 } },
      { id: 2, callFrame: { functionName: 'sicak', url: 'file:///proje/server/a.js', lineNumber: 9 } },
      { id: 3, callFrame: { functionName: 'sicak', url: 'file:///proje/server/a.js', lineNumber: 9 } },
      { id: 4, callFrame: { functionName: 'soguk', url: 'file:///proje/server/b.js', lineNumber: 0 } }
    ],
    samples: [2, 3, 4, 2],
    timeDeltas: [1000, 1000, 1000, 1000]
  };
  const r = cpuOzetle(profil, 5);
  assert.equal(r[0].ad, 'sicak');
  assert.equal(r[0].yuzde, 75);
  assert.equal(r[0].satir, 10);
  assert.equal(r[1].ad, 'soguk');
  ok('CPU özeti: aynı işlev birleşir, yüzde ve satır doğru');
}

// 7) Regresyon kapısı: eşik altı yavaşlama, hata ve bellek şişmesi yakalanır
{
  const esik = { state: { rpsMin: 350, p95MaxMs: 400 }, karma: { rpsMin: 300, p95MaxMs: 450 }, hataMax: 0, heapBuyumeMaxMB: 40 };
  const iyi = { senaryolar: [{ ad: 'state', rps: 800, p95: 80, hata: 0, sunucu: { heapIlk: 20, heapSon: 24 } }, { ad: 'karma', rps: 700, p95: 90, hata: 0, sunucu: { heapIlk: 20, heapSon: 25 } }] };
  assert.deepEqual(kontrolEt(iyi, esik), []);
  const kotu = { senaryolar: [{ ad: 'state', rps: 200, p95: 500, hata: 3, sunucu: { heapIlk: 20, heapSon: 20 } }, { ad: 'karma', rps: 700, p95: 90, hata: 0, sunucu: { heapIlk: 20, heapSon: 90 } }] };
  const ih = kontrolEt(kotu, esik);
  assert.equal(ih.length, 4, ih.join(' | '));
  assert.ok(ih.some(x => /state: 200 istek/.test(x)) && ih.some(x => /p95 500/.test(x)) && ih.some(x => /3 hatalı/.test(x)) && ih.some(x => /bellek/.test(x)));
  assert.ok(kontrolEt({ senaryolar: [] }, esik).some(x => /koşulmadı/.test(x)));
  ok('regresyon kapısı: yavaşlama, p95, hata ve bellek şişmesi yakalanır');
}

console.log(`
${passed}/7 yük aracı testi geçti`);
