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

// Tavanlar: { harf, dugme, sayi }. Aşama 0 (19 Ekim 2026): mevcut ölçümün biraz üstü. Her aşama bitince ilgili satır düşürülür.
// Hedef (plan): harf ≤ ~700, düğme ≤ 6, sayı ≤ 15 (tüm ekranlar; sürüm geçmişi ayrı).
const TAVAN = {
  surum: { harf: 80000, dugme: 2, sayi: 900 },
  konsey: { harf: 5200, dugme: 18, sayi: 120 },
  karakter: { harf: 3000, dugme: 16, sayi: 120 },
  kotalar: { harf: 3000, dugme: 2, sayi: 100 },
  hazine: { harf: 2900, dugme: 12, sayi: 60 },
  karnaval: { harf: 2500, dugme: 18, sayi: 90 },
  uzay: { harf: 1800, dugme: 8, sayi: 40 },
  taverna: { harf: 1800, dugme: 8, sayi: 20 },
  koleksiyon: { harf: 1500, dugme: 4, sayi: 40 },
  kisla: { harf: 1500, dugme: 30, sayi: 60 },
  demirhane: { harf: 1400, dugme: 10, sayi: 90 },
  merkez: { harf: 1400, dugme: 8, sayi: 70 },
  savasalani: { harf: 1300, dugme: 4, sayi: 50 },
  sifahane: { harf: 1300, dugme: 3, sayi: 20 },
  savashazirlik: { harf: 1300, dugme: 15, sayi: 55 },
  silo: { harf: 1200, dugme: 3, sayi: 70 },
  ekonomi: { harf: 1200, dugme: 5, sayi: 35 },
  zindanmod: { harf: 1200, dugme: 2, sayi: 30 },
  kolezyum: { harf: 1100, dugme: 12, sayi: 40 },
  pazar: { harf: 1000, dugme: 26, sayi: 45 },
  koy: { harf: 800, dugme: 3, sayi: 40 },
  bolge: { harf: 800, dugme: 4, sayi: 25 },
  cevrimdisi: { harf: 600, dugme: 3, sayi: 40 },
  hurda: { harf: 600, dugme: 4, sayi: 15 },
  geribildirim: { harf: 300, dugme: 2, sayi: 5 }
};
const VARSAYILAN = { harf: 1500, dugme: 12, sayi: 60 };   // tavanı yazılmamış yeni ekranlar bunu aşmamalı

depo.clear();
ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
const gs = new GameStateManager();
gs.state.level = 12; gs.state.adAstraBalance = 3e6;
for (let i = 0; i < 4; i++) gs.buySoldierUnit();
for (const k of GAME_CONFIG.RESOURCE_KEYS) gs.state.inventory[k] = 4000;
const b = { gameState: gs, GAME_CONFIG, globalPool, ammMarket, treasury, online: { active: false }, bildir() {}, hudYenile() {}, kilit: () => null };

const olc = (html) => {
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
