// Ekran yoğunluğu bütçesi (19 Ekim 2026, arayüz sadeleştirme): her ekranın ilk görünümdeki yazı, düğme, rakam ve kart sayısı bir TAVANI aşmaz.
// Tavanlar aşama aşama düşürülür (docs/arayuz4/PLAN.md); yeni bir ekran ya da kart eklemek yoğunluğu geri artırırsa bu test uyarır.
// Ölçüm: zengin hesap (seviye 12, 4 asker, bol hammadde), her ekranın ilk örnek seçeneği; görünür yazı = etiketler çıkarılmış metin.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { globalPool } = await import('../js/globalPool.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { treasury } = await import('../js/treasury.js');
const ekran = await import('../js/ui/ekran/index.js');

// Tavanlar: { harf, dugme, sayi } = o günkü görünür ölçümün ~%8-10 üstü (20 Ekim 2026, arayüz sadeleştirme aşama 3). Her aşamada düşürülür; hedef: harf ≤ ~700, düğme ≤ 6.
const TAVAN = {
  konsey: { harf: 1500, dugme: 7, sayi: 18 },
  kotalar: { harf: 1400, dugme: 1, sayi: 37 },
  savasalani: { harf: 1200, dugme: 6, sayi: 44 },
  karakter: { harf: 1100, dugme: 6, sayi: 31 },
  karnaval: { harf: 1100, dugme: 11, sayi: 31 },
  surum: { harf: 1050, dugme: 1, sayi: 8 },
  uzay: { harf: 1050, dugme: 1, sayi: 29 },
  ekonomi: { harf: 1000, dugme: 5, sayi: 24 },
  demirhane: { harf: 950, dugme: 10, sayi: 62 },
  taverna: { harf: 850, dugme: 8, sayi: 9 },
  koleksiyon: { harf: 800, dugme: 5, sayi: 15 },
  silo: { harf: 800, dugme: 3, sayi: 58 },
  kolezyum: { harf: 750, dugme: 9, sayi: 33 },
  savashazirlik: { harf: 750, dugme: 10, sayi: 39 },
  kisla: { harf: 750, dugme: 17, sayi: 35 },
  koy: { harf: 650, dugme: 5, sayi: 34 },
  bolge: { harf: 650, dugme: 4, sayi: 22 },
  zindanmod: { harf: 600, dugme: 1, sayi: 17 },
  pazar: { harf: 550, dugme: 20, sayi: 17 },
  hazine: { harf: 500, dugme: 1, sayi: 9 },
  merkez: { harf: 500, dugme: 5, sayi: 16 },
  cevrimdisi: { harf: 500, dugme: 3, sayi: 39 },
  hurda: { harf: 450, dugme: 4, sayi: 15 },
  sifahane: { harf: 350, dugme: 3, sayi: 6 },
  geribildirim: { harf: 150, dugme: 1, sayi: 2 }
};
const VARSAYILAN = { harf: 1500, dugme: 12, sayi: 60 };   // tavanı yazılmamış yeni ekranlar bunu aşmamalı

depo.clear();
ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
const gs = new GameStateManager();
gs.state.level = 12; gs.state.adAstraBalance = 3e6;
for (let i = 0; i < 4; i++) gs.buySoldierUnit();
for (const k of GAME_CONFIG.RESOURCE_KEYS) gs.state.inventory[k] = 4000;
const b = { gameState: gs, GAME_CONFIG, globalPool, ammMarket, treasury, online: { active: false }, bildir() {}, hudYenile() {}, kilit: () => null };

// Katlı (<details>) bölümlerin gövdesi sayılmaz: oyuncu ilk bakışta yalnız başlığını (summary) görür
const gorunur = (html) => { let h = html, onceki; do { onceki = h; h = h.replace(/<details[^>]*>((?:(?!<details)[\s\S])*?)<\/details>/, (m, ic) => { const s = ic.match(/<summary[^>]*>([\s\S]*?)<\/summary>/); return s ? s[1] : ''; }); } while (h !== onceki); return h; };
const olc = (html0) => {
  const html = gorunur(html0);
  const metin = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  return { harf: metin.length, dugme: (html.match(/data-e="/g) || []).length, sayi: (metin.match(/\d[\d.,]*/g) || []).length };
};

let n = 0;
const asimlar = [];
for (const e of ekran.ekranlar()) {
  const sec = (e.ornekSecenekler ? e.ornekSecenekler(b) : [{}])[0] || {};
  const o = olc(e.govde(b, sec));
  const t = TAVAN[e.id] || VARSAYILAN;
  for (const k of ['harf', 'dugme', 'sayi']) if (o[k] > t[k]) asimlar.push(`${e.id}: ${k} ${o[k]} > tavan ${t[k]}`);
  n++;
}
assert.deepEqual(asimlar, [], `ekran yoğunluğu tavanı aşıldı:\n  ${asimlar.join('\n  ')}`);
console.log(`✅ ${n} ekranın yazı, düğme ve rakam yoğunluğu tavanın altında`);
console.log(`\n1 ekran yoğunluğu kontrolü geçti.`);
