// Realm of AdAstra sunucusu — dünya işleri: haftalık hesaplaşma, yatırma, çekim, zincir ödemeleri
// ============================================================================
// Haftalık hesaplaşma (her Pazartesi 00:01 TSİ, oyunun hafta değişiminde) — kurallar server/economy.js:
//  1. Çekim talepleri ortak havuzdan katkı puanına göre karşılanır; hak kirası ödenir; sığmayan kısım
//     bakiyeye döner.
//  2. Çekim ücretinin %70'i temel gelire, %30'u yakıma (oranlar RealmRates sözleşmesinden değişebilir).
//  3. Fren açıksa hazine kasalarının %1'i yakılır.
//  4. Ücretsiz oyunculara (hiç yatırma yapmamış, bu hafta oynamış) görev kasasından pay.
//  5. Fiyat çarpanı, temel gelir ağırlıkları güncellenir.
//  6. Oyun içi yakım ve yapımcı payı zincire aktarılır (yakım → ölü adres, yapımcı → yapımcı cüzdanı).
// Zincir ödemeleri "pending → sending → sent" sırasıyla işlenir. Sunucu gönderim sırasında kapanırsa
// kayıt "sending" kalır ve TEKRAR GÖNDERİLMEZ; yönetici panelinden kontrol edilir (çift ödeme olmaz).
import { SYSTEM } from './engine.js';
import { olusturOranlar } from './world/oranlar.js';
import { olusturPiyasa } from './world/piyasa.js';
import { olusturYatirma } from './world/yatirma.js';
import { olusturOdemeler } from './world/odemeler.js';
import { olusturUretim } from './world/uretim.js';
import { olusturHaftalik } from './world/haftalik.js';
import { olusturBoss } from './world/boss.js';
import { olusturOrtakGelir } from './world/ortakGelir.js';
import { olusturSicakCuzdan } from './world/sicakCuzdan.js';
import { DAY } from './world/yardimci.js';

export function createWorld({ db, engine, chain = null, arena = null, accounts = null, kasa = null, mailer = null, kapi = null, pazar = null, sponsor = null, cfg, clock = () => Date.now(), log = console }) {
  const E = engine;
  const econ = () => db.kvJson('world:economy', {});
  const setEcon = patch => { const next = { ...econ(), ...patch }; db.kvSetJson('world:economy', next); return next; };
  const creatorWallet = () => E.GAME_CONFIG.CREATOR_WALLET_ADDRESS;
  // Hepsi ya da hiçbiri: hata olursa veritabanı geri alınır, bellekteki kayıt kopyası da boşaltılır
  const atomic = fn => { try { return db.tx(fn); } catch (err) { E.reloadWorld(); throw err; } };

  // Dünya işleri alan bazlı modüllerde (server/world/*); her biri öncekilerin ürettiklerine `w` üzerinden erişir
  const w = { db, E, chain, arena, accounts, kasa, mailer, kapi, pazar, sponsor, cfg, clock, log, econ, setEcon, creatorWallet, atomic };
  Object.assign(w, olusturOranlar(w));
  Object.assign(w, olusturPiyasa(w));
  Object.assign(w, olusturYatirma(w));
  Object.assign(w, olusturOdemeler(w));
  Object.assign(w, olusturUretim(w));
  Object.assign(w, olusturHaftalik(w));
  Object.assign(w, olusturBoss(w));
  Object.assign(w, olusturOrtakGelir(w));
  Object.assign(w, olusturSicakCuzdan(w));
  const { currentRates, syncRates, ratesStatus, snapshotMarket, currentCap, externalBuy, requestWithdraw, cancelWithdraw, withdrawStatus, scanDeposits, creditDeposits, processPayouts, reconcilePayouts, refreshUretim, refreshLive, settleWeek, runWeekly, runWorldBoss, creditPartnerIncome, scanPartnerIncome, partnerIncomeStatus, hotWalletNeed, checkHotWallet } = w;

  const last = { market: 0, deposits: 0, live: 0, payouts: 0 };
  let ticking = false;
  // Zamanlayıcı nabzı: /api/ready ve /metrics okur (tur takılırsa ya da hep hata verirse dışarıdan görünür)
  const nabiz = { olusturuldu: clock(), sonBaslangic: null, sonBitis: null, sonSureMs: null, tur: 0, hataSayisi: 0, sonHata: null, sonHataZamani: null };
  const tickDurumu = () => ({ ...nabiz, calisiyor: ticking, yasMs: clock() - (ticking ? nabiz.sonBaslangic : (nabiz.sonBitis ?? nabiz.olusturuldu)) });
  async function tick() {
    if (ticking) return;
    ticking = true;
    nabiz.sonBaslangic = clock();
    try {
      E.globalPool.checkEpochExpiration();
      const ep = E.globalPool.state.epochId;
      const done = db.kvGet('world:epochProcessed');
      if (done == null) db.kvSet('world:epochProcessed', ep);
      else if (ep > Number(done)) {
        await runWeekly(ep - 1);
        db.kvSet('world:epochProcessed', ep);
      }
      const now = clock();
      // Dünya bossu: bu haftanın savaş anı geçtiyse ve henüz yapılmadıysa (ilk açılışta geçmişe dönük savaş yapılmaz)
      const bossTime = E.gs.getWorldBossSchedule(now).lastBattleTime;
      const bossDone = Number(db.kvGet('world:bossLastBattle')) || 0;
      if (!bossDone) db.kvSet('world:bossLastBattle', bossTime);
      else if (bossTime > bossDone) runWorldBoss(bossTime);
      if (chain && now - last.market >= 3600000) { last.market = now; await snapshotMarket().catch(err => log.warn('Piyasa:', err.message)); }
      if (chain && now - last.deposits >= 120000) { last.deposits = now; await scanDeposits().catch(err => log.warn('Yatırma tarama:', err.message)); }
      if (now - last.live >= 600000) { last.live = now; refreshLive(); }
      if (now - (last.uretim || 0) >= 3600000) { last.uretim = now; try { refreshUretim(); } catch (err) { log.warn('Üretim Hakkı:', err.message); } }
      // Kapı kuralı (saatte bir): pasiflik uyarı/askı, boş yerleri sıradan doldur, sınır büyümesi
      if (kapi && now - (last.kapi || 0) >= 3600000) { last.kapi = now; try { kapi.run(); } catch (err) { log.warn('Kapı:', err.message); } }
      // İlan pazarı: süresi dolan ilanların eşyası sahibine döner
      if (pazar && now - (last.pazar || 0) >= 3600000) { last.pazar = now; try { pazar.expire(); } catch (err) { log.warn('İlan pazarı:', err.message); } }
      if (kasa && now - (last.kasaRefresh || 0) >= 120000) { last.kasaRefresh = now; await kasa.refreshActive().catch(err => log.warn('Kasa bakiyeleri:', err.message)); }
      if (kasa && now - (last.kasaSettle || 0) >= 3600000) { last.kasaSettle = now; kasa.queueSettlements(); if (kasa.enforceCaps) kasa.enforceCaps(); }
      if (kasa && now - (last.kasaOps || 0) >= 300000) {
        last.kasaOps = now;
        await kasa.reconcileOps().catch(err => log.warn('Kasa kontrolü:', err.message));
        await kasa.processOps().catch(err => log.warn('Kasa işlemleri:', err.message));
      }
      if (now - last.payouts >= 300000) {
        last.payouts = now;
        await reconcilePayouts().catch(err => log.warn('Ödeme kontrolü:', err.message));
        await processPayouts().catch(err => log.warn('Ödeme:', err.message));
      }
      if (chain && cfg.ratesContract && now - (last.rates || 0) >= 300000) { last.rates = now; await syncRates().catch(err => log.warn('Oran sözleşmesi:', err.message)); }
      if (chain && now - (last.partner || 0) >= 300000) { last.partner = now; await scanPartnerIncome().catch(err => log.warn('Ortak gelir:', err.message)); }
      if (chain && now - (last.hotWallet || 0) >= DAY) { last.hotWallet = now; await checkHotWallet().catch(err => log.warn('Oyun cüzdanı:', err.message)); }
      // Haftalık pazar geri alımı (dünya işi; sistem hesabıyla); ISO hafta anahtarı sayesinde günde çok kez çağrılsa da haftada bir çalışır
      E.withPlayer(SYSTEM, gs => gs.checkWeeklyAutonomousBuyback());
    } catch (err) {
      nabiz.hataSayisi++; nabiz.sonHata = String(err?.message || err).slice(0, 300); nabiz.sonHataZamani = clock();
      throw err;
    } finally {
      ticking = false;
      nabiz.sonBitis = clock(); nabiz.sonSureMs = nabiz.sonBitis - nabiz.sonBaslangic; nabiz.tur++;
    }
  }

  function setPaused(paused) { setEcon({ paused: !!paused }); db.event(paused ? 'pause' : 'resume'); return { paused: !!paused }; }
  // Universe aşaması (R3): 0 Realm, 1 Hazırlık (Hazırlık Deposu açılır), 2 Ön sipariş, 3 Universe — yalnız yönetici değiştirir; kayıt kv'de
  { const st = db.kvGet('world:universeStage'); if (st != null) E.GAME_CONFIG.UNIVERSE_STAGE = Math.max(0, Math.min(3, Number(st) || 0)); }
  function setUniverseStage(stage) {
    const n = Math.floor(Number(stage));
    if (!Number.isInteger(n) || n < 0 || n > 3) throw new Error('Aşama 0 ile 3 arasında olmalı');
    const from = Number(E.GAME_CONFIG.UNIVERSE_STAGE) || 0;
    E.GAME_CONFIG.UNIVERSE_STAGE = n;
    db.kvSet('world:universeStage', n);
    db.event('universe-stage', null, { from, to: n });
    return { universeStage: n };
  }
  const universeStage = () => Number(E.GAME_CONFIG.UNIVERSE_STAGE) || 0;

  // 🧪 Vanilla sıfırlama (yalnız deneme sunucusu): bütün oyuncu kayıtları, pazar havuzları, hazine, haftalık dünya,
  // piyango, kolezyum, dünya bossu, ilan pazarı ve ekonomi kaydı silinir → oyun ilk açılış gününe döner.
  // Hesaplar, şifreler, vatandaşlık (kapı) ve yönetici ayarları (Universe aşaması, kapı sınırı) KALIR.
  function vanillaReset() {
    if (!cfg.testMode) throw new Error('Vanilla sıfırlama yalnız deneme sunucusunda çalışır');
    db.tx(() => {
      db.raw.prepare("DELETE FROM kv WHERE key LIKE 'ls:%'").run();          // oyuncu kayıtları + dünya nesneleri (havuz, hazine, kota)
      for (const k of ['world:economy', 'world:lottery', 'world:arena', 'world:bossLastBattle', 'world:epochProcessed']) db.kvDel(k);
      for (const t of ['listings', 'kasa_usage', 'pay_quotes']) { try { db.raw.exec(`DELETE FROM ${t}`); } catch { /* tablo yok */ } }
    });
    E.reloadWorld();                                                         // bellekteki kopyalar tohum değerleriyle yeniden kurulur
    db.kvSet('world:epochProcessed', E.globalPool.state.epochId);           // geçmiş hafta için hesaplaşma yapılmasın
    db.event('vanilla_reset');
    log.warn('🧪 Vanilla sıfırlama: dünya ve bütün oyuncu kayıtları ilk güne döndü.');
    return { ok: true, epochId: E.globalPool.state.epochId };
  }


  return { vanillaReset, setUniverseStage, universeStage, refreshUretim, syncRates, ratesStatus, currentRates, scanPartnerIncome, creditPartnerIncome, partnerIncomeStatus, checkHotWallet, hotWalletNeed, reconcilePayouts, runWorldBoss, tick, tickDurumu, runWeekly, settleWeek, snapshotMarket, externalBuy, scanDeposits, creditDeposits, processPayouts, requestWithdraw, cancelWithdraw, withdrawStatus, refreshLive, setPaused, econ, setEcon, currentCap };
}
