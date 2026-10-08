// Yerel yıllık simülasyon (T3, yerel doğrulama kampanyası): ~130 hesap (100 vatandaş + bekleme sırası) GERÇEK sunucu koduyla,
// sahte saat ve sahte zincirle haftalarca oynar; her haftanın sonunda ekonomi/kapı değişmezleri gerçek durumdan denetlenir.
//   node scripts/simulasyon/yil.mjs --hafta=52 --senaryo=taban [--vatandas=100 --aday=30 --tohum=7 --cikti=auto|dosya --sessiz]
// Senaryolar: taban (dış para yok) · fiyatcokus (1 ayda %50) · toplucekim · balinalar · disgelir · sahtehesap
// Çıkış kodu: 0 = kritik ihlal yok; 1 = en az bir kritik ihlal (rapor JSON'unda ayrıntı).
// Not: bu dosya dunya.mjs'i ÖNCE içe alır (global Date'i değiştirir); başka bir dosya motoru bundan önce içe almamalı.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dunyaKur, SAAT, tohumlu } from './dunya.mjs';
import { profilUret, oyuncuOlustur, haftadaOynar, oturum, cekimTalebi, adayGunu, durumuYenile, bildirimKontrol, KATILIM_SINIFLARI } from './oyuncu.mjs';
import { anlikFoto, kumulatifEkle, haftalikDegismezler } from './degismez.mjs';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const HAFTA = Number(arg.hafta) || 52, VATANDAS = Number(arg.vatandas) || 100, ADAY = Number(arg.aday ?? 30), TOHUM = Number(arg.tohum) || 7;
const SENARYO = arg.senaryo || 'taban';
const SESSIZ = !!arg.sessiz;
const log = (...a) => { if (!SESSIZ) console.log(...a); };

// Senaryo ayarları
const SEN = {
  taban: {},
  uzun: {},
  fiyatcokus: { fiyat: g => (g < 20 ? 1 : g < 50 ? 1 - 0.5 * (g - 20) / 30 : 0.5) },     // 20. günden sonra 30 günde %50 düşer
  toplucekim: { topluCekimHafta: 10, topluCekimKisi: 30, topluCekimBakiye: 20000, arz: 3e7 },     // küçük arz: haftalık çekim tavanı ≈ 300 K, talep ≈ 600 K → tavan BAĞLAR
  balinalar: { balinaDepozito: 5e6, balinaSayisi: 10 },
  disgelir: { ortakGelir: true, ortakHaftalik: 250000, kilitAcik: true },
  sahtehesap: { dalgaHafta: 8, dalgaKisi: 100 },
  sponsor: { sponsorHafta: 3, sponsorCift: 12, sponsorMiktar: 20000, sponsorKasa: 100000 }
}[SENARYO] || {};

const rng = tohumlu(TOHUM * 7919);
const W = await dunyaKur({ tohum: TOHUM, ortakGelir: SEN.ortakGelir, fiyat: SEN.fiyat, arz: SEN.arz, limit: Number(arg.limit) || (VATANDAS >= 100 ? undefined : VATANDAS) });
const { E, kapi, world, db, zaman } = W;
const t0 = performance.now();

// ── Bağımsız sayaçlar (oyunun kendi sayaçlarına güvenmeyen ikinci defter) ──
const ctx = { cum: { cekimNet: 0, cekimYakim: 0, savunmaYakim: 0, haftaSayisi: 0 }, dis: { depozito: 0 }, ilk: null, birikim: 0, haftaVerilen: null, sonOzet: null, oncekiUbi: null, yeniHafta: false, korunumFarki: 0 };
{
  const o = E.treasury.withdraw.bind(E.treasury);
  E.treasury.withdraw = (id, n) => { const r = o(id, n); if (id !== 'ammBuyback') ctx.birikim += (r && r.granted) || 0; return r; };
  const orf = E.treasury.refund.bind(E.treasury);
  E.treasury.refund = (id, n) => { const r = orf(id, n); if (id !== 'ammBuyback') ctx.birikim -= r || 0; return r; };   // tam sayı ödülün kesirli iadesi dağıtılandan düşer
  const rw = kapi.recordWeek;
  kapi.recordWeek = (s, p) => { ctx.haftaVerilen = ctx.birikim; ctx.birikim = 0; return rw(s, p); };
}

// ── Nüfus ──
const oyuncular = [];
const adayTurleri = () => { const x = rng(); return x < 0.4 ? 'hazir_kabul' : x < 0.6 ? 'hazir_cevapsiz' : 'hazir_degil'; };
async function oyuncuEkle(i, aday) {
  const oy = await W.hesapAc(`sim${i}@ornek.com`);
  const P = oyuncuOlustur(oy, profilUret(i, rng), W);
  P.aday = !!aday; P.adayTur = aday ? adayTurleri() : null;
  oyuncular.push(P);
  return P;
}
log(`▶ Simülasyon: senaryo=${SENARYO}, ${HAFTA} hafta, ${VATANDAS} vatandaş + ${ADAY} aday, tohum=${TOHUM}`);
for (let i = 0; i < VATANDAS; i++) await oyuncuEkle(i, false);
for (let i = 0; i < ADAY; i++) await oyuncuEkle(VATANDAS + i, true);
// Sıradaki ilk kayıtlar zaten sınırın içinde vatandaş olmuş olmalı; sınır doluysa adaylar sırada
for (const P of oyuncular) { await durumuYenile(P); P.aday = !(P.gate && P.gate.status === 'citizen'); if (P.aday && !P.adayTur) P.adayTur = 'hazir_kabul'; }
// Cüzdan bağlama: vatandaşların ~%60'ı (çekim talebi verebilsin)
let cuzSayac = 1;
for (const P of oyuncular) if (!P.aday && rng() < 0.6) await W.cuzdanBagla(P, cuzSayac++);
await W.tick();                                     // ilk tick yalnız kaydeder
ctx.ilk = anlikFoto(W);                             // dış para girişlerinden ÖNCE: sonradan giren para ctx.dis.depozito ile ayrıca sayılır
ctx.sonEpoch = E.globalPool.state.epochId;
// Dış para girişleri (yalnız ilgili senaryolarda): balinalar yatırma yapar
if (SEN.balinaDepozito) {
  const balinalar = oyuncular.filter(P => !P.aday).slice(0, SEN.balinaSayisi);
  for (const P of balinalar) {
    P.profil.harcama = 'balina';
    E.mutatePlayer(P.pid, gs => { gs.state.adAstraBalance += SEN.balinaDepozito; });
    db.raw.prepare('UPDATE players SET deposited_ada = deposited_ada + ? WHERE address = ?').run(SEN.balinaDepozito, P.pid);
    ctx.dis.depozito += SEN.balinaDepozito;
  }
}
log(`  başlangıç: ${ctx.ilk.toplam.toExponential(4)} ASTRA (kasalar ${ctx.ilk.kasalar.toExponential(3)}, pazar ${ctx.ilk.amm.toExponential(3)}, piyango ${ctx.ilk.piyango.toExponential(3)})`);

// ── Ana döngü ──
const haftalar = [], ihlalSayac = {}, ihlalOrnek = {};
let hafta = 0;
const hataOrnekleri = [];
// --izle: korunum farkının hangi aşamada (tick / oyuncu oturumları) kaydığını bulmak için slot başına ölçüm
const IZLE = !!arg.izle;
const farkOlc = () => { const f = anlikFoto(W); const gp = E.globalPool.state; const ortak = db.raw.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM partner_income').get().t;
  return f.toplam - ctx.ilk.toplam - ctx.dis.depozito - ortak + (Number(gp.totalBurned) || 0) + (Number(gp.creatorRoyaltyTotal) || 0) + ctx.cum.cekimNet + ctx.cum.cekimYakim + ctx.cum.savunmaYakim; };
if (arg.izleEylem) W.izleEylem = { olc: farkOlc, son: 0, kayit: {} };
let sonFark = 0; const izleToplam = { tick: 0, oturum: 0, haftalikTick: 0 };
const faz = { tick: 0, aday: 0, oturum: 0, cekim: 0, degismez: 0 };
const olc = async (ad, fn) => { const a = performance.now(); try { return await fn(); } finally { faz[ad] += performance.now() - a; } };
function haftaKaydi() {
  const gp = E.globalPool.state, ks = kapi.publicSummary();
  const ozet = ctx.sonOzet || {};
  const sinifOrt = s => { const l = oyuncular.filter(P => !P.aday && P.profil.harcama === s).map(P => (E.readPlayer(P.pid) || {}).level || 1); return l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length * 10) / 10 : 0; };
  return {
    hafta, epoch: gp.epochId, vatandas: ks.citizens, aktif: ((kapi.state().history || []).at(-1) || {}).citizens ?? 0, ekranAktif: ks.active, bekleyen: ks.waiting, askida: ks.suspended, sinir: ks.limit,
    gosterge: ks.indicator, izinde: oyuncular.filter(P => { const k = (E.readPlayer(P.pid) || {}).katilim; return k && k.izinModu && zaman.T < Number(k.izinModu.bitis); }).length,
    kasalar: Math.round(anlikFoto(W).kasalar), cekim: ozet.withdraw ? { cap: Math.round(ozet.withdraw.cap), talep: Math.round(ozet.withdraw.requested), gonderilen: Math.round(ozet.withdraw.sent) } : null,
    ucretsizHavuz: ozet.faucet ? { oyuncu: ozet.faucet.players, toplam: Math.round(ozet.faucet.totalAda) } : null, yakilan: Math.round(Number(gp.totalBurned) || 0), sponsorPay: Math.round(ctx.cum.sponsorPay || 0), kasaOmruAy: ozet.runwayMonths ?? null,
    seviye: { ucretsiz: sinifOrt('ucretsiz'), orta: sinifOrt('orta'), balina: sinifOrt('balina') }, korunumFarki: Math.round(ctx.korunumFarki * 100) / 100
  };
}

try {
  for (hafta = 0; hafta < HAFTA; hafta++) {
    // Senaryo olayları (hafta başı)
    if (SEN.dalgaHafta === hafta) { for (let i = 0; i < SEN.dalgaKisi; i++) { const P = await oyuncuEkle(VATANDAS + ADAY + i, true); await durumuYenile(P); } log(`  [hafta ${hafta}] ${SEN.dalgaKisi} sahte hesap aynı anda kaydoldu`); }
    for (let gun = 0; gun < 7; gun++) {
      // Aday günü (günde bir)
      await olc('aday', async () => { for (const P of oyuncular) if (P.aday) await adayGunu(P, rng); });
      // İzin isteyen oyuncu oynamadığı haftalarda günde bir bildirimine bakar
      for (const P of oyuncular) if (!P.aday && P.profil.katilim === 'izinci' && !haftadaOynar(P, hafta) && rng() < 0.5) await bildirimKontrol(P);
      // Askıdan dönüş: askıdaki oyuncular bazen yeniden giriş yapar (sıraya öncelikle girer)
      for (const P of oyuncular) {
        if (!P.aday && P.gate && P.gate.status === 'suspended' && rng() < 0.3) {
          const r = await W.call('POST', '/api/account/login', { email: `sim${P.i}@ornek.com`, password: 'gizli-sifre-123' });
          if (r.status === 200 && r.body && r.body.token) { P.token = r.body.token; P.aday = true; P.adayTur = 'hazir_kabul'; P.onayVerdi = true; }
        }
      }
      for (let slot = 0; slot < 4; slot++) {
        const oncekiUbi = { accrued: Number(E.globalPool.state.ubiWeekAccrued) || 0, pot: Number(E.globalPool.state.ubiClaimPot) || 0 };
        W.ilerle(6 * SAAT);
        await olc('tick', () => W.tick());
        const ep = E.globalPool.state.epochId;
        ctx.yeniHafta = ep > ctx.sonEpoch;
        if (ctx.yeniHafta) {
          ctx.sonEpoch = ep; ctx.oncekiUbi = oncekiUbi;
          const ozet = (world.econ() || {}).lastWeekly; if (ozet && ozet.epoch !== ctx.sonOzetEpoch) { ctx.sonOzet = ozet; ctx.sonOzetEpoch = ozet.epoch; kumulatifEkle(ctx.cum, ozet); }
          { const t = oyuncular.reduce((a, P) => a + Object.values(P.istat).reduce((b, x) => b + x.ok, 0), 0); ctx.haftaEylem = t - (ctx.oncekiEylem || 0); ctx.oncekiEylem = t; }
          const { ihlaller } = await olc('degismez', async () => haftalikDegismezler(W, ctx));
          for (const x of ihlaller) { const key = x.kod + ':' + x.agirlik; ihlalSayac[key] = (ihlalSayac[key] || 0) + 1; (ihlalOrnek[key] ||= []).length < 3 && ihlalOrnek[key].push(`hafta ${hafta}: ${x.mesaj}`); }
          const hk = haftaKaydi(); hk.ihlal = ihlaller.map(x => x.kod); haftalar.push(hk);
          if (!SESSIZ && (hafta % 4 === 0 || ihlaller.length)) log(`  hafta ${String(hafta).padStart(2)}: vatandaş ${hk.vatandas} aktif ${hk.aktif} sırada ${hk.bekleyen} askıda ${hk.askida} izinde ${hk.izinde} · kasalar ${(hk.kasalar / 1e6).toFixed(1)} M · gösterge ${hk.gosterge.usdPerPlayerMonth}$/${hk.gosterge.withdrawableUsdPerPlayerMonth}$ · fark ${hk.korunumFarki}${ihlaller.length ? ' ⚠ ' + ihlaller.map(x => x.kod).join(',') : ''}`);
        }
        ctx.yeniHafta = false;
        if (W.izleEylem) W.izleEylem.son = farkOlc();
        if (IZLE) { const f = farkOlc(); const d = f - sonFark; const ad = (ep === ctx.sonEpoch && d !== 0 && (zaman.T % (7 * 86400000)) < 6 * SAAT) ? 'haftalikTick' : 'tick'; izleToplam[ad] += d; if (Math.abs(d) > 1) log(`   [izle] tick ${ad}: ${d.toFixed(2)}`); sonFark = f; }
        // Dış gelir (trade sitesi): her gün ilk slotta haftalığın 1/7'si
        if (SEN.ortakHaftalik && slot === 0) W.zincir.ortakGelirEkle(SEN.ortakHaftalik / 7);
        // Oyuncular oynar (her slotta, giriş olasılığı gün/4)
        const sira = [...oyuncular].filter(P => !P.aday && haftadaOynar(P, hafta));
        for (let i = sira.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [sira[i], sira[j]] = [sira[j], sira[i]]; }
        for (const P of sira) {
          if (rng() >= KATILIM_SINIFLARI[P.profil.katilim].gunlukGiris / 4) continue;
          try { await olc('oturum', () => oturum(P, rng, hafta)); } catch (err) { hataOrnekleri.push(`oyuncu ${P.i}: ${String(err.message).slice(0, 120)}`); }
          if (P.sonHttp === 403) { P.sonHttp = 0; await durumuYenile(P); if (P.gate && P.gate.status !== 'citizen') P.aday = true, P.adayTur = P.gate.status === 'suspended' ? null : 'hazir_kabul'; }
        }
        if (IZLE) { const f = farkOlc(); const d = f - sonFark; izleToplam.oturum += d; if (Math.abs(d) > 1) log(`   [izle] oturumlar: ${d.toFixed(2)}`); sonFark = f; }
        // Haftanın son 24 saatinde çekim talepleri
        const kalan = Number(E.globalPool.state.epochEndTime) - zaman.T;
        if (kalan > 0 && kalan <= 24 * SAAT) {
          if (SEN.sponsorHafta === hafta && !ctx.sponsorYapildi) {   // zengin vatandaşlar (dış giriş sayılır) aktif vatandaşlara sponsor olur
            ctx.sponsorYapildi = true;
            const vat = oyuncular.filter(x => !x.aday && x.cuzdan);
            let ok = 0;
            ctx.sponsorHedef = new Set();
            for (let i = 0; i < SEN.sponsorCift; i++) {
              const B = vat[vat.length - 1 - i], A = vat[i];
              if (!B || !A || B === A) continue;
              E.mutatePlayer(B.pid, gs => { gs.state.adAstraBalance += SEN.sponsorKasa; });
              ctx.dis.depozito += SEN.sponsorKasa;
              try { await W.sponsor.give(B.pid, A.pid, SEN.sponsorMiktar); ctx.sponsorHedef.add(A.pid); ok++; } catch (e) { log(`  [sponsor] reddedildi: ${e.message}`); }
            }
            log(`  [hafta ${hafta}] ${ok} sponsorluk başladı`);
          }
          const topluSimdi = SEN.topluCekimHafta === hafta;
          if (topluSimdi && !ctx.topluYapildi) {   // 30 cüzdanlı vatandaşa serbest bakiye (dış giriş sayılır): hepsi tüm serbest bakiyesini çekmek ister
            ctx.topluYapildi = true;
            for (const P of oyuncular.filter(x => !x.aday && x.cuzdan).slice(0, SEN.topluCekimKisi)) {
              E.mutatePlayer(P.pid, gs => { gs.state.adAstraBalance += SEN.topluCekimBakiye; });
              ctx.dis.depozito += SEN.topluCekimBakiye;
            }
          }
          let n = 0;
          for (const P of oyuncular) {
            if (P.aday || !P.cuzdan) continue;
            if (ctx.sponsorHedef && ctx.sponsorHedef.has(P.pid) && hafta > SEN.sponsorHafta) {   // sponsorlu oyuncular her hafta kendi parasından çekim ister (sponsorlu paraya dokunulamaz)
              E.mutatePlayer(P.pid, gs => { gs.state.adAstraBalance += 5000; gs.state.lockedAda = Math.min(gs.state.lockedAda || 0, 0); });
              ctx.dis.depozito += 5000;
              await cekimTalebi(P, rng, hafta, { oran: 1, zorla: true });
            } else
            if (topluSimdi) { if (n < SEN.topluCekimKisi && await cekimTalebi(P, rng, hafta, { oran: 1, zorla: true })) n++; }
            else await olc('cekim', () => cekimTalebi(P, rng, hafta));
          }
        }
      }
    }
  }
} catch (err) {
  console.error('⛔ Simülasyon yarıda kesildi:', err.stack || err.message);
  ihlalSayac['SIM:kritik'] = (ihlalSayac['SIM:kritik'] || 0) + 1; (ihlalOrnek['SIM:kritik'] ||= []).push(String(err.stack || err.message).slice(0, 600));
}

// ── Sonuç ──
const sureSn = Math.round((performance.now() - t0) / 100) / 10;
const eylemToplam = {};
for (const P of oyuncular) for (const [ad, s] of Object.entries(P.istat)) { const t = (eylemToplam[ad] ||= { ok: 0, red: 0, http: 0, neden: {} }); t.ok += s.ok; t.red += s.red; t.http += s.http; for (const [m, n] of Object.entries(s.neden || {})) t.neden[m] = (t.neden[m] || 0) + n; }
const sunucuHata = W.hatalar.slice(0, 5);
const durumOzeti = (() => {
  const l = oyuncular.filter(P => !P.aday).map(P => E.readPlayer(P.pid)).filter(Boolean);
  const ist = f => { const v = l.map(f).sort((a, b) => a - b); return v.length ? { ort: Math.round(v.reduce((a, b) => a + b, 0) / v.length * 100) / 100, medyan: v[Math.floor(v.length / 2)], max: v.at(-1) } : null; };
  return { oyuncu: l.length, seviye: ist(s => s.level || 1), xp: ist(s => s.currentXp || 0), astra: ist(s => s.adAstraBalance || 0), kilitli: ist(s => s.lockedAda || 0), asker: ist(s => (s.soldierUnits || []).length), stamina: ist(s => s.stamina || 0), odun: ist(s => (s.inventory || {}).wood || 0), buğday: ist(s => (s.inventory || {}).wheat || 0), cekilen: ist(s => s.withdrawnAda || 0) };
})();
const rapor = {
  durumOzeti,
  faz: Object.fromEntries(Object.entries(faz).map(([k, v]) => [k, Math.round(v / 100) / 10])),
  senaryo: SENARYO, hafta: HAFTA, vatandas: VATANDAS, aday: ADAY, tohum: TOHUM, sureSn,
  ihlalSayac, ihlalOrnek, sunucuHata, hataOrnekleri: hataOrnekleri.slice(0, 5), haftalar, eylemToplam,
  son: { vatandas: kapi.publicSummary(), foto: anlikFoto(W), gonderilen: W.zincir.gonderilen.length }
};
const kritik = Object.entries(ihlalSayac).filter(([k]) => k.endsWith(':kritik')).reduce((s, [, v]) => s + v, 0);
for (const [ad, t] of Object.entries(eylemToplam)) { const ust = Object.entries(t.neden).sort((a, b) => b[1] - a[1]).slice(0, 3); if (t.red > 20) log(`   ret ${ad} (${t.ok} ok / ${t.red} ret):`, ust.map(([m, n]) => `${n}× ${m}`).join(' | ')); }
if (IZLE) log('  [izle] aşamalara göre toplam sapma:', JSON.stringify(Object.fromEntries(Object.entries(izleToplam).map(([k, v]) => [k, Math.round(v * 100) / 100]))));
if (W.izleEylem) log('  [izleEylem] eylem başına sapma (|Δ|>0.2):', JSON.stringify(Object.fromEntries(Object.entries(W.izleEylem.kayit).map(([k, v]) => [k, { n: v.length, toplam: Math.round(v.reduce((a, b) => a + b, 0) * 100) / 100, ornek: v.slice(0, 4) }]))));
log('  oyuncu durumu:', JSON.stringify(rapor.durumOzeti));
log('  süre dağılımı (sn):', JSON.stringify(rapor.faz), ' eylem:', JSON.stringify(Object.fromEntries(Object.entries(eylemToplam).map(([k, v]) => [k, v.ok + '/' + v.red]))));
log(`\n✔ Bitti: ${HAFTA} hafta, ${oyuncular.length} hesap, ${sureSn} sn. İhlaller:`, JSON.stringify(ihlalSayac));
for (const [k, l] of Object.entries(ihlalOrnek)) for (const m of l) log(`   ${k} → ${m}`);
if (sunucuHata.length) log('  sunucu hataları:', sunucuHata);
if (arg.cikti) {
  const dosya = arg.cikti === 'auto' || arg.cikti === '1' ? path.join(kok, 'docs/v2/sim', `${SENARYO}_${HAFTA}h_t${TOHUM}.json`) : path.resolve(arg.cikti);
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  fs.writeFileSync(dosya, JSON.stringify(rapor, null, 1));
  log('  rapor:', dosya);
}
if (SESSIZ) console.log(JSON.stringify({ kritik, ihlalSayac, sureSn, sunucuHata: sunucuHata.length }));
await W.kapat();
process.exit(kritik || sunucuHata.length ? 1 : 0);
