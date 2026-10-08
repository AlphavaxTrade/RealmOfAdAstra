// Sunucu — Katılım Puanı saf fonksiyonları (E-planı Faz 1, 8 Ekim 2026): kategori eşlemesi, seviyeyle büyüyen
// eşik, haftalık sonuç, hazır aday kontrolü. Kapı (askı/davet/izin) akışının bütünü tests/test_v2_kapi.mjs'te.
import assert from 'node:assert/strict';
import { kategoriOf, esikSeviye, haftaSonucu, hazirMiState, eslemeGecerliMi } from '../server/aktiflik.js';
import { GAME_CONFIG } from '../js/config.js';
import { ACTIONS } from '../server/actions.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const KP = GAME_CONFIG.KATILIM_PUANI;

// 1) Eşleme ACTIONS beyaz listesiyle tutarlı; her kategori gerçek bir işleme karşılık gelir
{
  assert.ok(eslemeGecerliMi(), 'eşlemedeki her ad gerçek bir işlem (server/actions.js ACTIONS)');
  assert.equal(kategoriOf('claimExpedition'), 'sefer');
  assert.equal(kategoriOf('fightDungeon'), 'zindan');
  assert.equal(kategoriOf('executeColosseum1v1Match'), 'kolezyum');
  assert.equal(kategoriOf('stakeArmyForWorldBoss'), 'boss');
  assert.equal(kategoriOf('marketBuy'), 'pazar');
  assert.equal(kategoriOf('contributeToOtorite'), 'konsey');
  assert.equal(kategoriOf('spinCarnivalWheel'), 'karnaval');
  assert.equal(kategoriOf('claimOnboardingReward'), 'rehber');
  assert.equal(kategoriOf('claimWeeklyUbi'), null, 'pasif ödül toplama katılım sayılmaz (kasıtlı)');
  assert.equal(kategoriOf('bilinmeyenIslem'), null);
  // Her KATEGORILER öğesinin en az bir gerçek işlemi olmalı (hiç karşılığı olmayan ölü kategori olmasın)
  const kategorilerdeVar = new Set(Object.keys(ACTIONS).map(kategoriOf).filter(Boolean));
  for (const k of KP.KATEGORILER) assert.ok(kategorilerdeVar.has(k), `"${k}" kategorisine karşılık en az bir işlem var`);
  ok('kategori eşlemesi: ACTIONS ile tutarlı, her kategorinin karşılığı var, pasif ödüller sayılmaz');
}

// 2) Eşik seviyeyle büyür: taban (Sv.1-9) → +1 her ESIK_SEVIYE_ARALIGI seviyede → tavanda durur
{
  assert.equal(esikSeviye(1), KP.ESIK_TABAN, 'Sv.1 taban eşik');
  assert.equal(esikSeviye(9), KP.ESIK_TABAN, 'Sv.9 hâlâ taban (aralık dolmadı)');
  assert.equal(esikSeviye(10), KP.ESIK_TABAN, 'Sv.10: (10-1)/10 taban aralığında henüz +1 olmaz');
  assert.equal(esikSeviye(11), KP.ESIK_TABAN + 1, 'Sv.11: bir aralık geçti → +1');
  assert.equal(esikSeviye(1000), KP.ESIK_TAVAN, 'çok yüksek seviye tavanda durur');
  ok('eşik seviyeyle büyür, tavanda durur');
}

// 3) Haftalık sonuç: çeşitlilik sayılır, aynı kategoriyi tekrarlamak ek puan getirmez
{
  const r1 = haftaSonucu({ touched: { sefer: true, bakim: true }, level: 1 });
  assert.equal(r1.puan, 2); assert.equal(r1.esik, KP.ESIK_TABAN); assert.equal(r1.saglikli, 2 >= KP.ESIK_TABAN);
  const r2 = haftaSonucu({ touched: { sefer: true }, level: 50 }); // yüksek seviye, tek kategori
  assert.equal(r2.puan, 1); assert.equal(r2.saglikli, false, 'üst seviyede tek kategori yetmez');
  const r3 = haftaSonucu({ touched: {}, level: 1 });
  assert.equal(r3.puan, 0); assert.equal(r3.saglikli, KP.ESIK_TABAN === 0);
  ok('haftalık sonuç: puan = dokunulan kategori sayısı, eşikle karşılaştırılır');
}

// 4) Hazır aday: ham JSON durumundan, GameStateManager örneği gerekmeden okunur
{
  const idler = GAME_CONFIG.KAPI.READY_TASK_IDS;
  assert.ok(idler.length >= 1, 'en az bir hazır aday adımı tanımlı');
  assert.equal(hazirMiState(null), false);
  assert.equal(hazirMiState({ candidateReady: {} }), false, 'hiç adım tamamlanmamış');
  const tam = Object.fromEntries(idler.map(id => [id, true]));
  assert.equal(hazirMiState({ candidateReady: tam }), true, 'bütün adımlar tamam');
  const yarim = { ...tam, [idler[0]]: false };
  assert.equal(hazirMiState({ candidateReady: yarim }), false, 'bir adım eksikse hazır değil');
  ok('hazır aday: ham durumdan güvenle okunur (çökme yok), tüm adımlar gerekir');
}

console.log(`\n${passed}/4 katılım puanı (saf fonksiyon) kontrolü geçti`);
