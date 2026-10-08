// Simülasyon DEĞİŞMEZLERİ (T3): her simüle haftanın sonunda GERÇEK durumdan (veritabanı, motor) hesaplanır; bağımsız bir
// sayım oyunun kendi sayaçlarıyla çelişirse ihlal olarak bildirilir. Ağırlık: 'kritik' = para/adalet hatası (simülasyon başarısız),
// 'bulgu' = bilinen/şüpheli sapma (rapora girer, tek başına başarısız saymaz).

const topla = o => Object.values(o || {}).reduce((s, v) => s + (Number(v) || 0), 0);
const yakin = (a, b, tol) => Math.abs(a - b) <= tol;

// Oyundaki bütün ASTRA'nın konumlara göre dökümü
export function anlikFoto(W) {
  const { E, db } = W;
  const adresler = db.q.playersAll.all().map(p => p.address);
  adresler.push(W.SYSTEM);
  const f = { oyuncuBakiye: 0, bekleyenCekim: 0, piyangoBekleyen: 0, bossBekleyen: 0, kasalar: 0, amm: 0, piyango: 0, ubi: 0, bozuk: [] };
  for (const a of adresler) {
    const st = E.readPlayer(a);
    if (!st) continue;
    const bal = Number(st.adAstraBalance) || 0, kilit = Number(st.lockedAda) || 0;
    f.oyuncuBakiye += bal;
    f.bekleyenCekim += Number(st.pendingWithdrawAda) || 0;
    f.piyangoBekleyen += Number(st.lotteryPendingPayout) || 0;
    f.bossBekleyen += Number(st.worldBoss && st.worldBoss.claimableRewardAda) || 0;
    if (!Number.isFinite(bal) || bal < -1e-6) f.bozuk.push(`${a}: bakiye ${bal}`);
    if (kilit > bal + 1e-6 || kilit < -1e-6) f.bozuk.push(`${a}: kilitli ${kilit} > bakiye ${bal}`);
  }
  f.kasalar = topla(E.treasury.state.pools);
  f.amm = Object.values(E.ammMarket.pools).reduce((s, p) => s + (Number(p.adAstraReserve) || 0), 0);
  const L = E.lottery(); f.piyango = (Number(L.pool) || 0) + (Number(L.amortiPool) || 0);
  const gp = E.globalPool.state; f.ubi = (Number(gp.ubiClaimPot) || 0) + (Number(gp.ubiWeekAccrued) || 0);
  f.toplam = f.oyuncuBakiye + f.bekleyenCekim + f.piyangoBekleyen + f.bossBekleyen + f.kasalar + f.amm + f.piyango + f.ubi;
  return f;
}

// Haftalık özetlerden toplanan, oyunun KENDİ sayaçlarından bağımsız çıkış kalemleri
export function kumulatifEkle(cum, ozet) {
  if (!ozet) return;
  const w = ozet.withdraw || {};
  cum.cekimNet += Number(w.sent) || 0;
  cum.cekimYakim += Number(w.feeBurn) || 0;
  cum.savunmaYakim += Number(ozet.defenseBurn) || 0;
  cum.haftaSayisi++;
}

// ihlaller: [{ kod, agirlik, mesaj }]
export function haftalikDegismezler(W, ctx) {
  const { E, db, kapi } = W;
  const ih = [];
  const kayit = (kod, agirlik, mesaj) => ih.push({ kod, agirlik, mesaj });
  const foto = anlikFoto(W);
  const gp = E.globalPool.state, T = E.treasury.state;

  // K2: bozuk oyuncu bakiyeleri
  for (const b of foto.bozuk.slice(0, 5)) kayit('K2', 'kritik', 'oyuncu kaydı bozuk: ' + b);
  for (const [k, v] of Object.entries(T.pools)) if (!(v >= -1e-6)) kayit('K2', 'kritik', `kasa ${k} negatif: ${v}`);

  // K1: kasa defteri — toplam = tohum + giriş − çıkış − fiyat-savunma yakımı
  const beklenenKasa = ctx.ilk.kasalar + topla(T.inflow) - topla(T.outflow) - ctx.cum.savunmaYakim;
  if (!yakin(foto.kasalar, beklenenKasa, 1e-6 * Math.max(1, ctx.ilk.kasalar) + 1)) kayit('K1', 'kritik', `kasa defteri tutmuyor: gerçek ${foto.kasalar.toFixed(2)} ≠ beklenen ${beklenenKasa.toFixed(2)} (fark ${(foto.kasalar - beklenenKasa).toFixed(2)})`);

  // B1: yaşam boyu sayaçlar
  if (!yakin(T.lifetimeDeposited, topla(T.inflow), 1)) kayit('B1', 'bulgu', `lifetimeDeposited ${T.lifetimeDeposited.toFixed(2)} ≠ Σ giriş ${topla(T.inflow).toFixed(2)}`);
  if (!yakin(T.lifetimeWithdrawn, topla(T.outflow), 1)) kayit('B1', 'bulgu', `lifetimeWithdrawn ${T.lifetimeWithdrawn.toFixed(2)} ≠ Σ çıkış ${topla(T.outflow).toFixed(2)} (geri alım sayaç boşluğu şüphesi)`);

  // K3: ASTRA korunumu
  const ortakGiris = db.raw.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM partner_income').get().t;
  const girisler = ctx.dis.depozito + ortakGiris;
  const cikislar = (Number(gp.totalBurned) || 0) + (Number(gp.creatorRoyaltyTotal) || 0) + ctx.cum.cekimNet + ctx.cum.cekimYakim + ctx.cum.savunmaYakim;
  const fark = foto.toplam - ctx.ilk.toplam - girisler + cikislar;
  ctx.korunumFarki = fark;
  // Yuvarlama gürültüsü işlem başına ≤ ~0,01 ASTRA'dır (taban fiyat/komisyon kuruş yuvarlamaları); gerçek kaçak bunun çok üstünde olur
  const gurultu = 5 + 0.01 * (ctx.haftaEylem || 0);
  const delta = fark - (ctx.oncekiFark || 0);
  ctx.oncekiFark = fark;
  if (Math.abs(delta) > gurultu || Math.abs(fark) > 1e-6 * ctx.ilk.toplam + 1) kayit('K3', 'kritik', `ASTRA korunumu bozuk: bu hafta ${delta.toFixed(2)} (toplam fark ${fark.toFixed(2)}; gürültü payı ±${gurultu.toFixed(1)}) — sistemdeki ${foto.toplam.toFixed(2)}, başlangıç ${ctx.ilk.toplam.toFixed(2)}, giren ${girisler.toFixed(2)}, çıkan ${cikislar.toFixed(2)}`);

  // K8: hesaplaşma sonrası bekleyen çekim kalmaz
  if (foto.bekleyenCekim > 0.01 && ctx.yeniHafta) kayit('K8', 'kritik', `hesaplaşma sonrası bekleyen çekim ${foto.bekleyenCekim.toFixed(2)}`);

  // K4: kapı sayımları
  const ks = kapi.publicSummary();
  const davet = Object.keys(db.kvJson('world:kapi:davet', {})).length;
  if (ks.citizens + davet > ks.limit) kayit('K4', 'kritik', `vatandaş ${ks.citizens} + bekleyen davet ${davet} > sınır ${ks.limit}`);
  if (ks.active > ks.citizens) kayit('K4', 'kritik', `aktif ${ks.active} > vatandaş ${ks.citizens}`);

  // K5: UBI devri (yalnız yeni hafta başında): açılış havuzu = önceki hafta birikimi + talep edilmemiş havuz
  if (ctx.yeniHafta && ctx.oncekiUbi) {
    const beklenen = ctx.oncekiUbi.accrued + ctx.oncekiUbi.pot;
    if (!yakin(Number(gp.ubiClaimPotAtOpen) || 0, beklenen, 1e-6 * Math.max(1, beklenen) + 0.01)) kayit('K5', 'kritik', `UBI devri: açılış ${(gp.ubiClaimPotAtOpen || 0).toFixed(2)} ≠ önceki birikim+havuz ${beklenen.toFixed(2)}`);
  }

  // K6: gösterge — son haftalık satır, bağımsız sayılan dağıtılan toplamla aynı; indicator() satırlardan elle aynı
  const s = kapi.state();
  const satir = (s.history || []).at(-1);
  if (ctx.yeniHafta && satir && ctx.haftaVerilen != null) {
    const beklenen = ctx.haftaVerilen + (Number(ctx.sonOzet && ctx.sonOzet.lottery && ctx.sonOzet.lottery.prize) || 0) + (Number(ctx.sonOzet && ctx.sonOzet.lottery && ctx.sonOzet.lottery.amorti) || 0);
    if (!yakin(satir.distributedAda, beklenen, 0.01 * Math.max(1, beklenen) + 0.05)) kayit('K6', 'kritik', `gösterge: kayıtlı dağıtılan ${satir.distributedAda} ≠ bağımsız sayım ${beklenen.toFixed(2)}`);
  }
  {
    const ind = kapi.publicSummary().indicator;
    const aylar = Number(E.GAME_CONFIG.KAPI.AVG_MONTHS) || 3, since = W.zaman.T - aylar * 30 * 86400000;
    const rows = (s.history || []).filter(r => r.at >= since && r.citizens > 0);
    const ort = f => (rows.length ? rows.map(f).reduce((a, b) => a + b, 0) / rows.length : 0);
    const d = Math.round(ort(r => r.distributedAda * r.priceUsd / r.citizens) * 4.33 * 100) / 100;
    const c = Math.round(ort(r => (r.withdrawCapAda || 0) * r.priceUsd / r.citizens) * 4.33 * 100) / 100;
    if (!yakin(ind.usdPerPlayerMonth, d, 0.011) || !yakin(ind.withdrawableUsdPerPlayerMonth, c, 0.011)) kayit('K6', 'kritik', `indicator() elle hesapla uyuşmuyor: ${JSON.stringify(ind)} ≠ ${d}/${c}`);
  }

  // B3: izindeki oyuncu üretim ağırlığı/pay almamalı (onaylı kural: izindeyken Üretim Hakkı/UBI payı almaz)
  let izinliAgirlik = 0;
  for (const p of db.q.playersAll.all()) {
    const st = E.readPlayer(p.address);
    const k = st && st.katilim;
    if (k && k.izinModu && W.zaman.T < Number(k.izinModu.bitis)) {
      const w = E.withPlayer(p.address, gs => gs.getUretimWeight()).result;
      if (w && Number(w.weight) > 0) izinliAgirlik++;
    }
  }
  if (izinliAgirlik) kayit('B3', 'bulgu', `${izinliAgirlik} izindeki oyuncu hâlâ Üretim Hakkı ağırlığı taşıyor (onaylı kural: izindeyken pay almaz)`);

  return { ihlaller: ih, foto };
}
