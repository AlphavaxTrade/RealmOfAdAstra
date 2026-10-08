// Realm of AdAstra — Kapı kuralı (E-planı Faz 1, 8 Ekim 2026 — docs/v2/KARARLAR_KESIN.md bölüm J'nin yerini aldı)
// ============================================================================
// Vatandaş sınırı açılışta 100. Kayıt her zaman açık: yer yoksa hesap BEKLEME SIRASINA girer (misafir gibi gezer,
// işlem yapamaz; "hazır aday" onaylarını verebilir). "Aktif vatandaş" artık tek bir eşik değil, KATILIM PUANI
// (server/aktiflik.js): oyunun 10 kategorisinden kaçına o hafta dokunuldu, seviyeyle büyüyen bir eşiğe göre.
// Düşük katılım merdiveni: UYARI_HAFTA kadar hafta düşük → bildirim; IZIN_SORUSU_HAFTA kadar hafta düşük → "izin
// ister misin?" sorusu (IZIN_CEVAP_SAAT içinde cevap, yoksa ASKI, dönüşte sıranın ÖNÜNE). İzin hakkı (IZIN_YILLIK_GUN)
// tükenmişken yine düşük kalırsa SON_UYARI_SAAT'lik son uyarı → düzelmezse ASKI, dönüşte sıranın önceliği OLMADAN.
// Hesap verisi hiçbir zaman silinmez. Sınır büyümesi: Faz 2'nin "dağıtılan+çekilebilen" göstergesi kurulana dek
// KAPI.GROWTH_LOCKED ile kilitli. Yer açılınca sıradaki (önce HAZIR olan) adaya INVITE_HOURS'luk bir davet gider;
// süresi geçerse davet bir sonrakine geçer, cevapsız aday INVITE_PENALTY_POSITIONS kadar sıra geri düşer (elenmez).
//
// Kayıt yeri: players tablosuna gate / gate_at / gate_prio / warned_at sütunları; dünya ayarı kv 'world:kapi';
// bekleyen davetler kv 'world:kapi:davet'. Oyunun kendi kurallarına (gameState) dokunmaz: yalnız sunucu katmanı.
// ============================================================================
import { playerIdOf } from './accounts.js';
import { haftaSonucu, hazirMiState, izindeMiState, haftaTouched } from './aktiflik.js';

const DAY = 86400000, HOUR = 3600000;
const round3 = x => Math.round((Number(x) || 0) * 1000) / 1000;

export function createKapi({ db, engine, accounts = null, mailer = null, cfg = {}, clock = () => Date.now(), log = console }) {
  const E = engine;
  const K = () => E.GAME_CONFIG.KAPI || {};
  const KP = () => E.GAME_CONFIG.KATILIM_PUANI || {};
  const q = {
    get: db.raw.prepare('SELECT address, last_seen, created_at, gate, gate_at, gate_prio, warned_at FROM players WHERE address = ?'),
    set: db.raw.prepare('UPDATE players SET gate = ?, gate_at = ?, gate_prio = ?, warned_at = ? WHERE address = ?'),
    setGateAt: db.raw.prepare('UPDATE players SET gate_at = ? WHERE address = ?'),
    warn: db.raw.prepare('UPDATE players SET warned_at = ? WHERE address = ?'),
    count: db.raw.prepare('SELECT gate, COUNT(*) AS n FROM players WHERE banned = 0 GROUP BY gate'),
    citizens: db.raw.prepare("SELECT address, last_seen, warned_at FROM players WHERE banned = 0 AND gate = 'citizen'"),
    waiting: db.raw.prepare("SELECT address, gate_at, gate_prio FROM players WHERE banned = 0 AND gate = 'waiting' ORDER BY gate_prio DESC, gate_at ASC, address ASC"),
    suspended: db.raw.prepare("SELECT address, gate_at, last_seen FROM players WHERE banned = 0 AND gate = 'suspended' ORDER BY gate_at ASC"),
    migrate: db.raw.prepare("UPDATE players SET gate = 'citizen', gate_at = created_at WHERE gate = 'new'")
  };

  // ── Dünya ayarı ──
  const state = () => {
    const s = db.kvJson('world:kapi', null);
    if (s) return s;
    // İlk kurulum: kapıdan önce açılmış bütün hesaplar vatandaş kalır (kimse dışarı atılmaz)
    const init = { limit: Number(K().START_LIMIT) || 100, tier: 0, lastGrowthAt: 0, history: [], installedAt: clock() };
    db.kvSetJson('world:kapi', init);
    q.migrate.run();
    return init;
  };
  const setState = patch => { const next = { ...state(), ...patch }; db.kvSetJson('world:kapi', next); return next; };
  state();

  // ── Bekleyen davetler: { [address]: { since, deadline } } — seat açılınca sıradaki (hazır) adaya verilir ──
  const davetler = () => db.kvJson('world:kapi:davet', {});
  const setDavetler = d => db.kvSetJson('world:kapi:davet', d);

  // KESİN sayım: kararlar (admit, fillSeats, geçmiş kaydı) bunu kullanır
  function counts() {
    const out = { citizen: 0, waiting: 0, suspended: 0, new: 0 };
    for (const r of q.count.all()) out[r.gate] = (out[r.gate] || 0) + r.n;
    return out;
  }
  // GÖSTERİM sayımı: statusOf / publicSummary her istekte çağrılır ve tablo büyüdükçe pahalıdır (yük testinde CPU'nun %8'i).
  // 2 saniyelik önbellek + kapıyı değiştiren her yazmada anında geçersiz kılma (aşağıda q.set / q.migrate sarılır).
  let sayimOnbellek = null;
  function countsGoster() {
    const now = clock();
    if (!sayimOnbellek || now - sayimOnbellek.at >= 2000) sayimOnbellek = { at: now, v: counts() };
    return sayimOnbellek.v;
  }
  for (const ad of ['set', 'migrate']) {
    const st = q[ad]; const calistir = st.run.bind(st);
    st.run = (...a) => { sayimOnbellek = null; return calistir(...a); };
  }

  // ── Oyuncuya haber: oyun içi bildirim (bir sonraki girişte görünür) + e-posta (Telegram: ayrı iş, henüz yok) ──
  function notify(address, message, subject) {
    try { E.mutatePlayer(address, gs => gs.pushNotice(message, 'warning')); } catch (err) { log.warn && log.warn('Kapı bildirimi:', err.message); }
    if (mailer && accounts) {
      try {
        const me = accounts.me(address);
        if (me && me.email) mailer.send({ to: me.email, subject: `Realm of AdAstra — ${subject}`, text: message }).catch(err => log.warn && log.warn('Kapı e-postası:', err.message));
      } catch (err) { log.warn && log.warn('Kapı e-postası:', err.message); }
    }
  }

  function makeCitizen(address, why) {
    q.set.run('citizen', clock(), 0, null, address);
    db.event('gate-citizen', address, { why });
    // Kayıt harcı: 1 ASTRA (fiyat çarpanıyla ölçekli), ilk ASTRA'dan düşer (motor: engine.withPlayer)
    const fee = Number(K().REGISTRATION_FEE_ADA) || 0;
    try {
      E.mutatePlayer(address, gs => {
        const due = round3(gs.adaPrice ? gs.adaPrice(fee) : fee);
        const old = gs.state.kayitHarci || null;
        if (!old || !(old.paid >= old.due)) gs.state.kayitHarci = { due, paid: old ? Number(old.paid) || 0 : 0, since: clock() };
        if (why !== 'install') gs.pushNotice('🏛️ Sirius Konseyi seni vatandaş olarak kabul etti. Vadiye hoş geldin! Kayıt harcı ' + due + ' ASTRA ilk kazancından düşülür.', 'success');
      });
    } catch (err) { log.warn && log.warn('Kayıt harcı:', err.message); }
  }

  // Yeni doğrulanmış hesap: yer varsa vatandaş, yoksa sıra. Bekleyen davetler (henüz vatandaş değil ama bir yere
  // "aday gösterilmiş") de yer sayımına girer — yoksa yeni bir kayıt, davetli birinin yerini sırayı atlayıp kapabilir.
  function admit(address) {
    const p = q.get.get(address);
    if (!p || p.gate !== 'new') return statusOf(address);
    const s = state();
    const rezerve = Object.keys(davetler()).length;
    if (counts().citizen + rezerve < s.limit) makeCitizen(address, 'admit');
    else { q.set.run('waiting', clock(), 0, null, address); db.event('gate-wait', address); }
    return statusOf(address);
  }

  // Girişte: askıdaki hesap döndü → sıraya (önceliği var mı yok mu son askının türüne bağlı); sonra boş yer varsa hemen içeri
  function onLogin(address) {
    const p = q.get.get(address);
    if (!p) return null;
    if (p.gate === 'suspended') {
      const st = E.readPlayer(address);
      const oncelikVar = !(st && st.katilim && st.katilim.oncelikVar === false);
      q.set.run('waiting', clock(), oncelikVar ? 1 : 0, null, address);
      if (!oncelikVar) { try { E.mutatePlayer(address, gs => { gs._katilim().oncelikVar = true; }); } catch { /* bir kereliğine tüketildi, sıradaki normal */ } }
      db.event('gate-return', address, { oncelikVar });
    } else if (p.gate === 'citizen' && p.warned_at) q.warn.run(null, address);
    fillSeats();
    return statusOf(address);
  }

  // 🏛️ Davet kabul etme: sırada bekleyen, davetli bir adayın İLK gerçek oyun aksiyonu onu vatandaş yapar
  // (server/rotalar/oyun.js /api/action çağırır). Davetsiz ya da süresi geçmiş bekleyenler için false döner.
  function kabulEtDavet(address) {
    const d = davetler();
    const davet = d[address];
    if (!davet || clock() > Number(davet.deadline)) return false;
    delete d[address];
    setDavetler(d);
    makeCitizen(address, 'davet');
    return true;
  }

  // Yer açılınca sıradaki (önce HAZIR olan) adaya davet gönderir; zaten davetli olan tekrar davet edilmez.
  // Bekleyen davetler de doluluktan sayılır (iki ayrı kişiye aynı anda aynı yer için davet gitmesin).
  function fillSeats() {
    const s = state();
    const d = davetler();
    let free = s.limit - counts().citizen - Object.keys(d).length;
    if (free <= 0) return 0;   // davetler de doluluktan sayılır, d henüz değişmedi
    const bos = w => !d[w.address];
    const tumu = q.waiting.all().filter(bos);
    const hazirAdresler = new Set(tumu.filter(w => { const st = E.readPlayer(w.address); return st && hazirMiState(st, K()); }).map(w => w.address));
    const siraliListe = [...tumu.filter(w => hazirAdresler.has(w.address)), ...tumu.filter(w => !hazirAdresler.has(w.address))];
    let n = 0;
    const now = clock(), invMs = (Number(K().INVITE_HOURS) || 72) * HOUR;
    for (const w of siraliListe) {
      if (free <= 0) break;
      d[w.address] = { since: now, deadline: now + invMs };
      notify(w.address, `🏛️ Sıran geldi: AdAstra Vadisi'nde yerin açıldı! ${Number(K().INVITE_HOURS) || 72} saat içinde ilk hareketini yap, yoksa davet bir sonrakine geçer (sıran silinmez, biraz geri düşer).`, 'yerin açıldı');
      free--; n++;
    }
    setDavetler(d);
    return n;
  }

  // Süresi geçen davetler: bir sonraki (hazır) adaya geçer; cevapsız kalan INVITE_PENALTY_POSITIONS kadar geri düşer
  function davetSuresiGecenler() {
    const now = clock();
    const d = davetler();
    const gecenler = Object.entries(d).filter(([, v]) => now > Number(v.deadline));
    if (!gecenler.length) return { gecen: [] };
    const liste = q.waiting.all();
    for (const [address] of gecenler) {
      delete d[address];
      const idx = liste.findIndex(w => w.address === address);
      const kat = Number(K().INVITE_PENALTY_POSITIONS) || 3;
      if (idx >= 0) {
        // 3 sıra geri; yeterince kişi yoksa en sona (yanlışlıkla yerinde kalmasın, en azından en geriye düşsün)
        const hedefIdx = Math.min(idx + kat, liste.length - 1);
        if (hedefIdx > idx) q.setGateAt.run(Number(liste[hedefIdx].gate_at) + 1, address);
      }
      notify(address, '⏳ Davetine zamanında cevap vermedin; yerin bir sonraki hazır adaya geçti. Sıranda biraz geri düştün ama kaybolmadın.', 'davet süresi geçti');
      db.event('gate-invite-expired', address);
    }
    setDavetler(d);
    fillSeats();
    return { gecen: gecenler.map(([a]) => a) };
  }

  // ── Katılım puanı: haftanın sonunda her VATANDAŞ için değerlendirme (server/world/haftalik.js settleWeek çağırır) ──
  function haftalikKatilimDegerlendir(kapananEpoch = null) {
    const now = clock(), cfg = KP();
    const UYARI = Number(cfg.UYARI_HAFTA) || 2, SORU = Number(cfg.IZIN_SORUSU_HAFTA) || 3;
    const out = { degerlendirilen: 0, uyari: [], izinSorusu: [], sonUyari: [] };
    for (const p of q.citizens.all()) {
      const st = E.readPlayer(p.address);
      if (!st) continue;
      const k = st.katilim;
      if (k && k.izinModu && now < Number(k.izinModu.bitis)) continue; // izindeyken değerlendirme yok
      out.degerlendirilen++;
      const { puan, esik, saglikli } = haftaSonucu({ touched: haftaTouched(st, kapananEpoch), level: st.level }, cfg);
      const durum = E.mutatePlayer(p.address, gs => {
        const kk = gs._katilim();
        if (saglikli) { kk.dusukHaftaSayisi = 0; return 'saglikli'; }
        kk.dusukHaftaSayisi = (kk.dusukHaftaSayisi || 0) + 1;
        if (kk.izinSorusu || kk.sonUyari) return 'bekliyor'; // zaten bir soru/son uyarı sürüyor, yenisi açılmaz
        if (kk.dusukHaftaSayisi === UYARI) { gs.pushNotice(`⚠️ Katılım puanın düşük (bu hafta ${puan}/${esik} kategori). Düşük giderse izin hakkını kullanman istenecek.`, 'warning'); return 'uyari'; }
        if (kk.dusukHaftaSayisi >= SORU) {
          if (kk.izinYillikKalan > 0) {
            kk.izinSorusu = { soruldu: now, sonTarih: now + (Number(cfg.IZIN_CEVAP_SAAT) || 72) * HOUR };
            gs.pushNotice(`🏖️ Katılımın ${kk.dusukHaftaSayisi} haftadır düşük. İzin hakkını kullanmak ister misin? ${Number(cfg.IZIN_CEVAP_SAAT) || 72} saat içinde cevap ver (cevaplaIzinSorusu), yoksa yerin bekleyen birine geçer.`, 'warning');
            return 'izin-sorusu';
          }
          kk.sonUyari = { baslangic: now };
          gs.pushNotice(`🚨 Bu yıl için izin hakkın bitti ve katılımın hâlâ düşük. ${Number(cfg.SON_UYARI_SAAT) || 72} saat içinde katılımını artırmazsan yerin bekleyen birine geçer; döndüğünde sıranın önceliği olmaz.`, 'warning');
          return 'son-uyari';
        }
        return 'dusuk';
      });
      if (durum === 'uyari') out.uyari.push(p.address);
      else if (durum === 'izin-sorusu') out.izinSorusu.push(p.address);
      else if (durum === 'son-uyari') out.sonUyari.push(p.address);
    }
    return out;
  }

  // Süresi geçen izin soruları / son uyarılar: saatte bir (run()) kontrol edilir, haftayı beklemez
  function katilimSuresiGecenler() {
    const now = clock();
    const out = { askiyaAlindi: [] };
    for (const p of q.citizens.all()) {
      const st = E.readPlayer(p.address);
      const k = st && st.katilim;
      if (!k) continue;
      const soruGecti = k.izinSorusu && now > Number(k.izinSorusu.sonTarih);
      const uyariGecti = k.sonUyari && now > Number(k.sonUyari.baslangic) + (Number(KP().SON_UYARI_SAAT) || 72) * HOUR;
      if (!soruGecti && !uyariGecti) continue;
      E.mutatePlayer(p.address, gs => {
        const kk = gs._katilim();
        kk.izinSorusu = null; kk.sonUyari = null; kk.dusukHaftaSayisi = 0;
        if (uyariGecti) kk.oncelikVar = false; // bir sonraki dönüşte sıranın önüne geçemez (tüketilince true'ya döner)
      });
      q.set.run('suspended', now, 0, null, p.address);
      db.event('gate-suspend', p.address, { why: uyariGecti ? 'izin-hakki-bitti' : 'izin-sorusu-cevapsiz' });
      notify(p.address, uyariGecti
        ? '⏸️ Katılımın uzun süre düşük kaldı ve izin hakkın bitmişti; yerin bekleyen bir vatandaşa verildi. Döndüğünde normal sıraya girersin.'
        : '⏸️ İzin sorusuna zamanında cevap vermediğin için yerin bekleyen bir vatandaşa verildi. Hesabın ve her şeyin duruyor; döndüğünde sıranın önüne alınırsın.', 'yerin askıya alındı');
      out.askiyaAlindi.push(p.address);
    }
    if (out.askiyaAlindi.length) fillSeats();
    return out;
  }

  // E-planı Faz 2 (KARAR 1, 8 Ekim — KARARLAR_KESIN §J): "dağıtılan" = bu hafta kasalardan (zindan/kolezyum/boss/
  // görev-UBI/karnaval/Fatih/konsey) vatandaşlara GERÇEKTEN ödenen toplam (js/treasury.js withdraw() her çağrıda
  // sayar, geri alım/ammBuyback hariç — o bir ödül değil piyasa savunması) + piyango (ayrı havuz, hazineden değil).
  // "Çekilebilen" = bu haftanın global çekim tavanı (ASTRA) — kağıt üstü zengin ama nakde çevrilemeyen vatandaşla
  // kapı açılmasın diye ayrı ölçülür. Kişi başı bölüm AKTİF vatandaş sayısıyla; haftada bir kez çalıştığı için
  // (settleWeek) activeCitizens() CANLI hesaplanır — saatlik run() önbelleğinin (s.activeCount) o an bayat olma
  // riski alınmaz.
  function recordWeek(summary, priceUsd) {
    const s = state();
    const treasuryGranted = (E.treasury && E.treasury.drainWeekGrantedToCitizens) ? E.treasury.drainWeekGrantedToCitizens() : 0;
    const lotteryPaid = (Number(summary?.lottery?.prize) || 0) + (Number(summary?.lottery?.amorti) || 0);
    const distributed = treasuryGranted + lotteryPaid;
    const withdrawCapAda = Number(summary?.withdraw?.cap) || 0;
    const row = {
      epochId: summary?.epoch ?? null, at: clock(),
      distributedAda: round3(distributed), withdrawCapAda: round3(withdrawCapAda),
      priceUsd: Number(priceUsd) || 0, citizens: activeCitizens(summary?.epoch ?? null)
    };
    const history = (Array.isArray(s.history) ? s.history : []).concat([row]).slice(-60);
    setState({ history });
    return row;
  }

  function indicator() {
    const s = state();
    const months = Number(K().AVG_MONTHS) || 3;
    const since = clock() - months * 30 * DAY;
    const rows = (s.history || []).filter(r => r.at >= since && r.citizens > 0);
    if (!rows.length) return { usdPerPlayerMonth: 0, withdrawableUsdPerPlayerMonth: 0, weeks: 0 };
    // Haftalık dağıtım / çekim tavanı → dolar → aktif kişi başı; aylık = ortalama hafta × 4,33
    const perWeek = rows.map(r => r.distributedAda * r.priceUsd / r.citizens);
    const avg = perWeek.reduce((a, b) => a + b, 0) / perWeek.length;
    const perWeekW = rows.map(r => (r.withdrawCapAda || 0) * r.priceUsd / r.citizens);
    const avgW = perWeekW.reduce((a, b) => a + b, 0) / perWeekW.length;
    return {
      usdPerPlayerMonth: Math.round(avg * 4.33 * 100) / 100,
      withdrawableUsdPerPlayerMonth: Math.round(avgW * 4.33 * 100) / 100,
      weeks: rows.length
    };
  }

  // Büyüme: KARAR 1 (8 Ekim) — Faz 2'nin göstergesi kurulana dek GROWTH_LOCKED ile kilitli. Kilit açılınca İKİ şart
  // birden gerekir: dağıtılan dönemin eşiğini geçmeli VE çekilebilen en az eşiğin ÜÇTE BİRİ olmalı (KARARLAR_KESIN
  // §J) — yoksa kağıt üstü zengin ama kimse nakde çeviremeyen bir vatandaşlıkla sınır büyütülmüş olur.
  function growth() {
    if (K().GROWTH_LOCKED) return null;
    const s = state(), tiers = K().USD_TIERS || [50, 100, 300];
    const threshold = tiers[Math.min(s.tier, tiers.length - 1)];
    const ind = indicator();
    if (ind.usdPerPlayerMonth < threshold) return null;
    if (ind.withdrawableUsdPerPlayerMonth < threshold / 3) return null;
    if (clock() - (Number(s.lastGrowthAt) || 0) < 30 * DAY) return null;
    const limit = Math.ceil(s.limit * (1 + (Number(K().GROWTH_STEP) || 0.1)));
    setState({ limit, lastGrowthAt: clock() });
    db.event('gate-grow', null, { from: s.limit, to: limit, indicator: ind.usdPerPlayerMonth, withdrawable: ind.withdrawableUsdPerPlayerMonth, tier: s.tier });
    return { from: s.limit, to: limit };
  }

  // Katılım puanı eşiğini geçen vatandaş sayısı — her citizen'ın JSON durumunu okumak gerektiği için (counts()
  // gibi tek SQL sorgusu değil) saatlik run()'da hesaplanıp dünya durumuna yazılır; publicSummary() ucuzca okur.
  function activeCitizens(kapananEpoch = null) {
    let n = 0;
    for (const p of q.citizens.all()) {
      const st = E.readPlayer(p.address);
      if (!st) continue;
      if (izindeMiState(st, clock())) continue;   // izindeki yerini korur ama ekonomiden pay almaz → "aktif" sayılmaz (göstergenin paydasına girmez)
      const { saglikli } = haftaSonucu({ touched: haftaTouched(st, kapananEpoch), level: st.level }, KP());
      if (saglikli) n++;
    }
    return n;
  }

  function run() {
    const davetBitenler = davetSuresiGecenler();
    const katilimAskiya = katilimSuresiGecenler();
    const grown = growth();
    const admitted = fillSeats();
    const activeCount = activeCitizens();
    const izindeCount = q.citizens.all().reduce((n, p) => n + (izindeMiState(E.readPlayer(p.address), clock()) ? 1 : 0), 0);
    setState({ activeCount, izindeCount });
    return { davetBitenler, katilimAskiya, admitted, grown, activeCount, izindeCount };
  }

  function statusOf(address) {
    const p = q.get.get(address);
    const s = state(), c = countsGoster();
    const base = { status: p ? p.gate : 'new', limit: s.limit, citizens: c.citizen, waiting: c.waiting };
    if (p && p.gate === 'waiting') {
      const pos = q.waiting.all().findIndex(w => w.address === address);
      base.position = pos >= 0 ? pos + 1 : null;
      const davet = davetler()[address];
      if (davet) base.davet = { deadline: davet.deadline };   // hazır aday durumu /api/state (candidateReady) üzerinden okunur
    }
    return base;
  }
  const isCitizen = address => { const p = q.get.get(address); return !!p && p.gate === 'citizen'; };

  // Herkese açık özet (Sirius Konseyi ekranı)
  function publicSummary() {
    const s = state(), c = countsGoster(), tiers = K().USD_TIERS || [50, 100, 300];
    return { limit: s.limit, citizens: c.citizen, active: s.activeCount || 0, izinde: s.izindeCount || 0, waiting: c.waiting, suspended: c.suspended, tier: s.tier,
      threshold: tiers[Math.min(s.tier, tiers.length - 1)], indicator: indicator(), lastGrowthAt: s.lastGrowthAt || 0, growthLocked: !!K().GROWTH_LOCKED,
      inviteHours: Number(K().INVITE_HOURS) || 72, izinYillikGun: Number(KP().IZIN_YILLIK_GUN) || 30 };
  }

  // Yönetici özeti: sıra ve askıdakiler (e-postayla)
  function adminSummary() {
    const emailOf = a => { try { const m = accounts ? accounts.me(a) : null; return m ? m.email : null; } catch { return null; } };
    const d = davetler();
    return { ...publicSummary(),
      queue: q.waiting.all().slice(0, 50).map((w, i) => ({ position: i + 1, playerId: w.address, email: emailOf(w.address), since: w.gate_at, returning: !!w.gate_prio, davetli: !!d[w.address] })),
      suspendedList: q.suspended.all().slice(0, 50).map(p => ({ playerId: p.address, email: emailOf(p.address), since: p.gate_at, lastSeen: p.last_seen })),
      history: (state().history || []).slice(-13) };
  }

  function adminSet({ limit, tier, growthLocked } = {}) {
    const patch = {};
    if (limit != null) { const n = Math.floor(Number(limit)); if (!Number.isFinite(n) || n < 1 || n > 100000) throw new Error('Sınır 1 ile 100.000 arasında olmalı'); patch.limit = n; }
    if (tier != null) { const t = Math.floor(Number(tier)); const max = (K().USD_TIERS || [50, 100, 300]).length - 1; if (!Number.isFinite(t) || t < 0 || t > max) throw new Error('Dönem 0 ile ' + max + ' arasında olmalı'); patch.tier = t; }
    if (growthLocked != null) { E.GAME_CONFIG.KAPI.GROWTH_LOCKED = !!growthLocked; db.event('gate-growth-lock', null, { growthLocked: !!growthLocked }); }
    if (!Object.keys(patch).length && growthLocked == null) throw new Error('Değişecek bir şey yok');
    const next = Object.keys(patch).length ? setState(patch) : state();
    if (Object.keys(patch).length) db.event('gate-admin', null, patch);
    fillSeats();
    return { limit: next.limit, tier: next.tier, ...publicSummary() };
  }

  // Yönetici: bir hesabı elle içeri al / askıya al / sıraya koy
  function adminSetPlayer(address, status) {
    const p = q.get.get(address);
    if (!p) throw new Error('Oyuncu yok');
    if (status === 'citizen') { if (p.gate === 'citizen') return statusOf(address); makeCitizen(address, 'admin'); notify(address, '🏛️ Yönetici seni vadiye aldı: artık vatandaşsın.', 'yerin açıldı'); }
    else if (status === 'suspended') { q.set.run('suspended', clock(), 0, null, address); db.event('gate-suspend', address, { by: 'admin' }); fillSeats(); }
    else if (status === 'waiting') { q.set.run('waiting', clock(), 1, null, address); db.event('gate-wait', address, { by: 'admin' }); fillSeats(); }
    else throw new Error('Durum citizen / waiting / suspended olmalı');
    return statusOf(address);
  }

  return { admit, onLogin, run, fillSeats, kabulEtDavet, davetSuresiGecenler, haftalikKatilimDegerlendir, katilimSuresiGecenler,
    activeCitizens, recordWeek, indicator, growth, statusOf, isCitizen, publicSummary, adminSummary, adminSet, adminSetPlayer, state, counts, playerIdOf };
}
