// ASTRA AKIŞ MODELİ (19 Ekim 2026): oyuncu harcaması kasalara nasıl dağılıyor, kasalar kendi kendini dengeliyor mu?
// ---------------------------------------------------------------------------------------------------------------------------
// Model GERÇEK kodu çalıştırır (js/treasury.js ve js/globalPool.js; kopya hesap yok): bir haftalık harcama, kaynağına göre
//   - doğrudan pay (zindan kapı harcı, çark, kolezyum) → treasury.depositDirect(kendi kasa; %4'ü önce UOA tohumuna)
//   - kalanı → globalPool.recordTokenSpend (yakım, yapımcı payı, temel gelir, TREASURY_ALLOCATION ağırlıklı kasalar, taşma kuralı)
// akar; haftalık ödeme kasaların kapasitesine göre (oran × bakiye, EN SIKI durum: kullanım %100) kasadan düşer.
// Çıktı: 52 hafta sonunda her ödeme yapan kasanın "sağlığı" = bakiye / başlangıç bakiyesi (1,00 = başladığı yerde).
//
// Sınırlama: harcama karışımı SENARYO olarak varsayılır (gerçek oyuncu verisi değil). Gerçek veri geldikçe KARISIMLAR güncellenmeli.
// Kullanım:  node scripts/ekonomi/akis-modeli.mjs            (tablo basar)
//            testi: tests/test_ekonomi_akis_modeli.mjs        (rakamlar bozulursa kapı kırmızı olur)
import { pathToFileURL } from 'node:url';

// Node'da tarayıcı depolaması yok: bellekte basit bir taklit (hazine ve havuz defterleri buraya yazar)
const depo = new Map();
globalThis.localStorage = globalThis.localStorage || {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};

const { GAME_CONFIG: C } = await import('../../js/config.js');
const { treasury } = await import('../../js/treasury.js');
const { globalPool } = await import('../../js/globalPool.js');

// Ödeme yapan kasalar ve haftalık ödeme oranları (config.TREASURY_WEEKLY_BUDGET.RATES; geri alım kasası oranı TARGET_RESERVE'deki %3)
export const ODEYEN_KASALAR = ['dungeon', 'arena', 'worldBoss', 'ammBuyback', 'quest', 'carnival'];
const haftalikOran = (id) => (id === 'ammBuyback' ? 0.03 : C.TREASURY_WEEKLY_BUDGET.RATES[id]);

// Harcamanın kaynakları: doğrudan payı olanlar (config'ten) + "diğer" (pazar, demirhane, kışla, taverna… hepsi ortak dağılım)
const dogrudan = () => ({
  dungeon: { kasa: 'dungeon', pay: C.DUNGEON_GATE_POOL_SHARE ?? 1 },
  carnival: { kasa: 'carnival', pay: C.CARNIVAL.WHEEL_CARNIVAL_SHARE ?? 0.85 },
  arena: { kasa: 'arena', pay: C.COLOSSEUM.ENTRY_ARENA_SHARE ?? 0.7 }
});

export const KARISIMLAR = {
  dengeli: { dungeon: 0.25, carnival: 0.20, arena: 0.15, diger: 0.40 },
  zindanAgirlikli: { dungeon: 0.50, carnival: 0.10, arena: 0.10, diger: 0.30 },
  carkAgirlikli: { dungeon: 0.10, carnival: 0.50, arena: 0.10, diger: 0.30 },
  kolezyumAgirlikli: { dungeon: 0.10, carnival: 0.10, arena: 0.50, diger: 0.30 }
};

function sifirla() {
  depo.clear();
  treasury.reset();
  globalPool.vanillaReset();
}

const toplamKasa = () => Object.values(treasury.state.pools).reduce((s, v) => s + v, 0);

/**
 * @param {object} o
 * @param {keyof typeof KARISIMLAR | object} o.karisim  harcama karışımı (kaynak → pay, toplam 1)
 * @param {number} o.harcamaDuzeyi  haftalık harcama / haftalık ödeme kapasitesi (1 = harcama ödeme kapasitesini tam karşılar)
 * @param {number} [o.hafta]
 * @param {number} [o.parca]  haftalık harcama kaç dilime bölünür (taşma kuralı küçük dilimlerde işler)
 */
export function simuleEt({ karisim, harcamaDuzeyi = 1, hafta = 52, parca = 10 }) {
  const mix = typeof karisim === 'string' ? KARISIMLAR[karisim] : karisim;
  const d = dogrudan();
  sifirla();
  const tohum = { ...treasury.state.pools };
  const kapasite = ODEYEN_KASALAR.reduce((s, id) => s + tohum[id] * haftalikOran(id), 0);
  // Harcamanın ödeme yapan kasalara düşen oranı (ağırlıklar ve doğrudan paylardan): haftalık harcamayı kapasiteye göre ölçeklemek için
  const odeyenAgirlik = ODEYEN_KASALAR.reduce((s, id) => s + (C.TREASURY_ALLOCATION[id] || 0), 0);
  let oran = 0;
  for (const [kaynak, pay] of Object.entries(mix)) {
    const dp = kaynak === 'diger' ? 0 : d[kaynak].pay;
    oran += pay * (dp * (1 - C.UOA_TOHUM_ORANI) + (1 - dp) * C.TOKEN_REWARD_POOL_RATE * odeyenAgirlik);
  }
  const haftalikHarcama = harcamaDuzeyi * kapasite / oran;

  const onceToplam = toplamKasa();
  let yakilan = 0, telif = 0, temelGelir = 0, harcanan = 0;
  for (let h = 0; h < hafta; h++) {
    for (let p = 0; p < parca; p++) {
      for (const [kaynak, pay] of Object.entries(mix)) {
        const x = haftalikHarcama * pay / parca;
        harcanan += x;
        const dp = kaynak === 'diger' ? 0 : d[kaynak].pay;
        if (dp > 0) treasury.depositDirect(d[kaynak].kasa, x * dp);   // %4'ü önce UOA tohumuna
        const kalan = x * (1 - dp);
        if (kalan > 0) {
          const sonuc = globalPool.recordTokenSpend(kalan);
          yakilan += sonuc.burned; telif += sonuc.creatorRoyalty; temelGelir += sonuc.ubiShare;
        }
      }
    }
    for (const id of ODEYEN_KASALAR) treasury.state.pools[id] -= treasury.state.pools[id] * haftalikOran(id);   // haftalık ödeme (en sıkı durum)
  }
  const saglik = Object.fromEntries(ODEYEN_KASALAR.map((id) => [id, treasury.state.pools[id] / tohum[id]]));
  const v = Object.values(saglik);
  // Muhasebe: kasalara giren + yakılan + yapımcı + temel gelir = harcanan; ödenen = kasaların kaybı
  const odenenToplam = (onceToplam + harcanan - yakilan - telif - temelGelir) - toplamKasa();
  return { saglik, enDusuk: Math.min(...v), enYuksek: Math.max(...v), yakilan, telif, temelGelir, harcanan, odenenToplam, haftalikHarcama };
}

// Doğrudan çalıştırılırsa tablo basar
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const f = (x) => x.toFixed(2);
  for (const dz of [1, 0.7, 0.5]) {
    console.log(`\n=== Harcama düzeyi: ödeme kapasitesinin %${dz * 100}'ü (52 hafta, kasa sağlığı = bakiye / başlangıç)`);
    for (const k of Object.keys(KARISIMLAR)) {
      const r = simuleEt({ karisim: k, harcamaDuzeyi: dz });
      console.log(`${k.padEnd(18)} ${ODEYEN_KASALAR.map((id) => `${id.slice(0, 6)} ${f(r.saglik[id])}`).join(' · ')}   [en düşük ${f(r.enDusuk)} · en yüksek ${f(r.enYuksek)}] yakılan ${Math.round(r.yakilan).toLocaleString('tr-TR')}`);
    }
  }
}
