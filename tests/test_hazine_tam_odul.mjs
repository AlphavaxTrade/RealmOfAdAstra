// Tam sayı ödül ve kasa iadesi (yerel doğrulama kampanyasında bulunan sızıntı): ödülü aşağı yuvarlayan her yol (görev, zindan, dünya
// bossu, kolezyum) kasadan çektiği kesirli parçayı oyuncuya vermeden SİLİYORDU — ör. 1,5 ASTRA'lık görev ödülünde 0,5 ASTRA yok oluyordu
// ("ödül basılmaz, transfer edilir" ilkesine aykırı; 52 haftalık simülasyonda ASTRA korunumu bu yüzden kayıyordu).
// Düzeltme: treasury.withdrawWhole() oyuncuya tam sayıyı verir, kesirli artığı kasaya İADE eder (refund: tüm kayıtlar geri alınır).
import assert from 'node:assert/strict';
import { TreasuryLedger } from '../js/treasury.js';
import { GAME_CONFIG } from '../js/config.js';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

// 1) Defter düzeyi: iade, çekimin bütün kayıtlarını aynen geri alır
{
  const T = new TreasuryLedger();
  const seed = T.getPool('quest');
  const r = T.withdrawWhole('quest', 3.7);
  assert.equal(r.granted, 3, 'oyuncuya tam sayı');
  assert.ok(Math.abs(T.getPool('quest') - (seed - 3)) < 1e-9, 'kasadan yalnız 3 çıktı, 0,7 kasada kaldı');
  assert.ok(Math.abs(T.state.outflow.quest - 3) < 1e-9 && Math.abs(T.state.lifetimeWithdrawn - 3) < 1e-9, 'çıkış kayıtları 3');
  assert.ok(Math.abs(T.state.weekGrantedToCitizens - 3) < 1e-9, 'bu haftanın dağıtılanı 3 (kesirli artık sayılmaz)');
  const r0 = T.withdrawWhole('quest', 0.4);
  assert.equal(r0.granted, 0); assert.ok(Math.abs(T.getPool('quest') - (seed - 3)) < 1e-9, '0,4 istendi: hiçbir şey çıkmadı');
  assert.equal(T.refund('quest', -5), 0); assert.equal(T.refund('yok', 5), 0);
  ok('withdrawWhole: oyuncuya tam sayı, kesirli artık kasada; çıkış/yaşam boyu/haftalık dağıtılan kayıtları tutarlı; geçersiz iade yok sayılır');
}

// 2) Motor düzeyi: kesirli görev ödülünde oyuncu + kasa toplamı sabit
{
  const db = openDb(':memory:');
  const E = await createEngine(db, { testMode: true });
  const kesirli = (GAME_CONFIG.ONBOARDING_QUESTS || []).find(q => q.rewardAda > 0 && q.rewardAda % 1 !== 0);
  assert.ok(kesirli, 'yapılandırmada kesirli ödüllü görev var (test anlamlı)');
  db.q.playerAdd.run('acc:t', Date.now(), Date.now());
  E.withPlayer('acc:t', () => null);
  E.mutatePlayer('acc:t', gs => { gs.state.onboarding[kesirli.id] = { done: true, claimed: false }; });
  const T = E.treasury;
  const toplam = () => T.getPool('quest') + (E.readPlayer('acc:t').adAstraBalance || 0);
  const once = toplam();
  const r = E.act('acc:t', 'claimOnboardingReward', [kesirli.id]).result;
  assert.equal(r.success, true);
  assert.equal(r.granted, Math.floor(kesirli.rewardAda), 'oyuncu görünür ödülü aynı: kesirli kısım atılmış');
  assert.ok(Math.abs(toplam() - once) < 1e-9, `ASTRA korunuyor: ${once} → ${toplam()}`);
  ok(`Görev ödülü ${kesirli.rewardAda} ASTRA: oyuncu ${r.granted} aldı, kalan ${(kesirli.rewardAda - r.granted).toFixed(2)} kasada; oyuncu+kasa toplamı değişmedi`);
}

console.log(`\n${passed} tam sayı ödül kontrolü geçti.`);
process.exit(0);
