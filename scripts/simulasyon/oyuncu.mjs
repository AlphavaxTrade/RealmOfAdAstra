// Simüle oyuncu davranışı (T3): her oyuncu GERÇEK HTTP yolundan (/api/action, /api/withdraw, /api/state) oynar; böylece katılım
// puanı, vatandaşlık denetimi ve davet kabulü üretimdeki gibi çalışır. Eylem seçimi profile göre rastgele (tohumlu) — bir
// gerçek oyuncunun neyi bildiğini taklit eder: sunucunun katılım sayacına bakmaz, yalnız kendi durumunu görür.
//
// İki bağımsız profil: HARCAMA (ucretsiz / orta / balina — denge_modeli.mjs ile aynı %70/%25/%5) ve KATILIM (ne kadar sık/çeşitli oynar).

export const KATILIM_SINIFLARI = {
  //                gunlukGiris  ekKategori
  aktif:   { gunlukGiris: 0.85, ekKategori: 3 },
  yari:    { gunlukGiris: 0.40, ekKategori: 2 },
  dusuk:   { gunlukGiris: 0.08, ekKategori: 1 },
  izinci:  { gunlukGiris: 0.85, ekKategori: 3 },   // birakHafta'da oynamayı keser (izin ister): soru gelince bildirimden görüp "evet" der, donHafta'da döner
  hayalet: { gunlukGiris: 0.85, ekKategori: 3 },   // birakHafta'dan sonra hiç girmez
  donuscu: { gunlukGiris: 0.85, ekKategori: 3 }    // birakHafta..donHafta arası girmez
};
export const HARCAMA_SINIFLARI = {
  ucretsiz: { cekimOlasilik: 0.25, pahali: false },
  orta:     { cekimOlasilik: 0.50, pahali: true },
  balina:   { cekimOlasilik: 0.70, pahali: true }
};

export function profilUret(i, rng) {
  const h = rng(), k = rng();
  const harcama = h < 0.70 ? 'ucretsiz' : h < 0.95 ? 'orta' : 'balina';
  const katilim = k < 0.50 ? 'aktif' : k < 0.75 ? 'yari' : k < 0.85 ? 'dusuk' : k < 0.92 ? 'izinci' : k < 0.96 ? 'hayalet' : 'donuscu';
  const birakHafta = 6 + Math.floor(rng() * 20);
  return { i, harcama, katilim, birakHafta, donHafta: birakHafta + 3 + Math.floor(rng() * 8) };
}

const rnd = (rng, a) => a[Math.floor(rng() * a.length)];
const karistir = (rng, a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// Bu hafta bu oyuncu oynuyor mu (hayalet/dönüşçü kuralı)
export function haftadaOynar(P, hafta) {
  if (P.profil.katilim === 'hayalet') return hafta < P.profil.birakHafta;
  if (P.profil.katilim === 'donuscu' || P.profil.katilim === 'izinci') return hafta < P.profil.birakHafta || hafta >= P.profil.donHafta;
  return true;
}

export function oyuncuOlustur(oy, profil, W) {
  return { ...oy, profil, W, durum: null, istat: {}, cekimYapildi: -1, gozlem: { izinSorusuGordu: 0, izinAldi: 0 } };
}

async function e(P, ad, args = []) {
  const r = await P.W.call('POST', '/api/action', { name: ad, args }, P.token);
  const st = (P.istat[ad] ||= { ok: 0, red: 0, http: 0 });
  if (r.status !== 200 || !r.body) { st.http++; P.sonHttp = r.status; return false; }
  if (r.body.player) P.durum = r.body.player;
  const ok = !(r.body.result && r.body.result.success === false);
  if (P.W.izleEylem) { const f = P.W.izleEylem.olc(); const d = f - P.W.izleEylem.son; P.W.izleEylem.son = f; if (Math.abs(d) > 0.2) (P.W.izleEylem.kayit[ad] ||= []).push(+d.toFixed(3)); }
  if (ok) st.ok++; else { st.red++; const m = String((r.body.result && r.body.result.message) || '?').replace(/[0-9.,]+/g, '#').slice(0, 60); (st.neden ||= {})[m] = ((st.neden || {})[m] || 0) + 1; }
  return ok;
}

export async function durumuYenile(P) {
  const r = await P.W.call('GET', '/api/state', null, P.token);
  if (r.status === 200 && r.body) { P.durum = r.body.player; P.gate = r.body.gate; }
  return r;
}

const gunNo = P => Math.floor(P.W.zaman.T / 86400000);
const askerSayisi = P => ((P.durum && P.durum.soldierUnits) || []).length;
const bakiye = P => Number(P.durum && P.durum.adAstraBalance) || 0;
// Gerçek bir oyuncu devre dışı (tıklanamaz) düğmeye basmaz: yalnız mümkün görünen eylemler denenir (gereksiz istek yükü olmasın)
const DUGUMLER = ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb'];
const SLOTLAR = ['weapon', 'armor', 'helmet', 'boots', 'legs'];

// Gerçek oyuncu seviye atlamak için kaynak biriktirir: yalnız eşiğin üstünü satar (ücretsiz oyuncu daha çok biriktirir)
const SAKLA = { ucretsiz: 300, orta: 150, balina: 60 };
async function sat(P, rng) {
  const inv = (P.durum && P.durum.inventory) || {};
  const sakla = SAKLA[P.profil.harcama];
  const aday = DUGUMLER.filter(k => (inv[k] || 0) >= sakla + 15).sort((a, b) => inv[b] - inv[a])[0];
  if (!aday) return false;
  return e(P, 'marketSell', [aday, Math.max(1, Math.floor((inv[aday] - sakla) * (0.5 + rng() * 0.5)))]);
}
async function konseyKatki(P) {
  const inv = (P.durum && P.durum.inventory) || {};
  const k = DUGUMLER.filter(x => (inv[x] || 0) >= 450).sort((a, b) => inv[b] - inv[a])[0];
  if (!k) return false;
  return e(P, 'contributeToOtorite', [{ [k]: Math.floor(inv[k] / 3) }]);
}

// Kategori → eylem merdiveni (ilk başarılı olan yeter; hiçbiri olmazsa kategoriye dokunulmamış olur — gerçek oyuncu gibi)
const KATEGORILER = {
  bakim: async (P, rng) => (await e(P, 'repairAllTools')) || (bakiye(P) >= 50 && rng() < 0.3 && ((await e(P, 'craftEquipment', [rnd(rng, SLOTLAR)])) || (await e(P, 'autoEquipBest')))),
  kisla: async P => (bakiye(P) >= 55 && (await e(P, 'buySoldierUnit'))) || (askerSayisi(P) > 0 && (await e(P, 'setSoldierRow', [0, 'front']))),
  zindan: async P => askerSayisi(P) > 0 && e(P, 'fightDungeon', [1, [0]]),
  kolezyum: async P => askerSayisi(P) > 0 && bakiye(P) >= 15 && e(P, 'executeColosseum1v1Match', [0]),
  boss: async (P, rng) => askerSayisi(P) > 0 && rng() < 0.5 && e(P, 'stakeArmyForWorldBoss'),
  pazar: async (P, rng) => (await sat(P, rng)) || (bakiye(P) >= 20 && (await e(P, 'marketBuy', ['wheat', 5]))),
  konsey: async P => konseyKatki(P),
  karnaval: async (P, rng) => (P.cheerGun !== gunNo(P) && ((P.cheerGun = gunNo(P)), await e(P, 'carnivalCheer'))) || (bakiye(P) >= 110 && (await e(P, 'buyLotteryTickets', [1 + Math.floor(rng() * 3)]))) || (bakiye(P) >= 120 && (await e(P, 'spinCarnivalWheel', ['ada']))),
  rehber: async P => {
    if (P.rehberSonra && P.W.zaman.T < P.rehberSonra) return false;
    const idler = P.W.E.GAME_CONFIG.ONBOARDING_QUESTS.map(x => x.id);
    for (let n = 0; n < idler.length; n++) { const q = idler[((P.rehberSira || 0) + n) % idler.length]; if (await e(P, 'claimOnboardingReward', [q])) { P.rehberSira = (P.rehberSira || 0) + n + 1; return true; } }
    P.rehberSonra = P.W.zaman.T + 3 * 86400000; return false;
  }
};

// Bir oyun oturumu: çekirdek döngü (hasat, sefer, satış) + profile göre rastgele ek kategoriler
export async function oturum(P, rng, hafta) {
  const sinif = KATILIM_SINIFLARI[P.profil.katilim], harcama = HARCAMA_SINIFLARI[P.profil.harcama];
  // İzin sorusu geldiyse cevapla (oyuncu oyun içi bildirimi görür)
  const k = P.durum && P.durum.katilim;
  if (k && k.izinSorusu) {
    P.gozlem.izinSorusuGordu++;
    const evet = P.profil.katilim === 'izinci' || rng() < 0.6;
    if (await e(P, 'cevaplaIzinSorusu', [evet]) && evet) P.gozlem.izinAldi++;
  }
  await e(P, 'claimAllHarvests');
  if ((Number(P.durum && P.durum.currentXp) || 0) >= 150) await e(P, 'levelUp');
  // Boş her alana sefer gönder (aktif olanlar reddedilir; stamina bitince hepsi reddedilir)
  for (const n of karistir(rng, DUGUMLER)) await e(P, 'startExpedition', [n]);
  { const inv = (P.durum && P.durum.inventory) || {}; if (DUGUMLER.some(k => (inv[k] || 0) >= 300)) await e(P, 'upgradeWarehouse'); }   // depo dolunca silo yükselt
  if (rng() < 0.7) await sat(P, rng);
  if (harcama.pahali && bakiye(P) >= 500 && rng() < 0.15) await e(P, 'buyTavernaAutomationBot', [24]);
  for (const kat of karistir(rng, Object.keys(KATEGORILER)).slice(0, sinif.ekKategori)) await KATEGORILER[kat](P, rng);
  if (P.ubiHafta !== hafta && rng() < 0.7) { P.ubiHafta = hafta; await e(P, 'claimWeeklyUbi'); }
}

// Haftada bir (hafta sonu yaklaşırken) çekim talebi: serbest bakiyenin bir kısmı
export async function cekimTalebi(P, rng, hafta, { oran = 0.5, zorla = false } = {}) {
  if (!P.cuzdan || P.cekimYapildi === hafta) return false;
  const harcama = HARCAMA_SINIFLARI[P.profil.harcama];
  if (!zorla && rng() >= harcama.cekimOlasilik) return false;
  await durumuYenile(P);
  const st = P.durum || {};
  const kilitli = Math.min(Number(st.lockedAda) || 0, Number(st.adAstraBalance) || 0);
  const serbest = Math.floor(((Number(st.adAstraBalance) || 0) - kilitli) * 100) / 100;
  const miktar = Math.floor(serbest * oran * 100) / 100;
  if (miktar < P.W.cfg.minWithdrawAda) return false;
  const r = await P.W.call('POST', '/api/withdraw', { amount: miktar }, P.token);
  P.cekimYapildi = hafta;
  (P.istat.cekim ||= { ok: 0, red: 0, http: 0 })[r.status === 200 && r.body && r.body.success ? 'ok' : 'red']++;
  return r.status === 200 && r.body && r.body.success;
}

// Sıradaki aday: hazır adaylar 3 onayı verir, davet gelince ilk eylemle kabul eder (ya da cevapsız bırakır)
export async function adayGunu(P, rng) {
  const r = await durumuYenile(P);
  if (r.status !== 200) return;
  if (P.gate && P.gate.status === 'citizen') { P.aday = false; return; }
  if (!P.gate || P.gate.status !== 'waiting') return;
  if (P.adayTur !== 'hazir_degil' && !P.onayVerdi) {
    for (const id of P.W.E.GAME_CONFIG.KAPI.READY_TASK_IDS) await P.W.call('POST', '/api/action', { name: 'misafirGorevTamamla', args: [id] }, P.token);
    P.onayVerdi = true;
  }
  if (P.gate.davet && P.adayTur === 'hazir_kabul') await e(P, 'claimAllHarvests');   // ilk gerçek eylem daveti kabul eder
}

// Oynamadığı haftalarda izinci, bildirimini (Telegram/tarayıcı) görüp bir kez girer: izin sorusu varsa "evet" der
export async function bildirimKontrol(P) {
  await durumuYenile(P);
  const k = P.durum && P.durum.katilim;
  if (k && k.izinSorusu) { P.gozlem.izinSorusuGordu++; if (await e(P, 'cevaplaIzinSorusu', [true])) P.gozlem.izinAldi++; }
}
