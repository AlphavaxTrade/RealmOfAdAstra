// Yeni ekranlar (js/ui/ekran/*): her ekran iki oyuncu durumunda (yeni hesap, ileri seviye zengin hesap) çizilir.
// Denetlenenler: metin üretiyor mu, bozuk değer (NaN, undefined, [object, Infinity, null) yok mu, etiketler dengeli mi,
// satır içi stil yok mu (yeni ekranlar yalnız ek-* sınıflarını kullanır), her data-e'nin bir eylemi var mı.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: k => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: k => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { globalPool } = await import('../js/globalPool.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { treasury } = await import('../js/treasury.js');
const ekran = await import('../js/ui/ekran/index.js');

function baglam(gameState) {
  const bildirimler = [];
  return {
    gameState, GAME_CONFIG, globalPool, ammMarket, treasury,
    online: { active: false },
    bildir: (m, t) => bildirimler.push([m, t]),
    bildirimler,
    hudYenile() {},
    kilit: () => null
  };
}

// Bu denetim yalnız etiket dengesine bakar (void etiketler hariç)
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'col', 'wbr', 'source']);
function etiketDengesi(html) {
  const yigin = [];
  for (const m of html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g)) {
    const kapanis = m[0].startsWith('</');
    const ad = m[1].toLowerCase();
    if (VOID.has(ad) || m[2] === '/') continue;
    if (!kapanis) { yigin.push(ad); continue; }
    const son = yigin.pop();
    if (son !== ad) return `beklenen </${son}>, bulunan </${ad}>`;
  }
  return yigin.length ? `kapanmayan etiket: <${yigin.at(-1)}>` : '';
}
const gorunurMetin = html => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');

function zenginHesap(gs) {
  const s = gs.state;
  s.level = 30; s.currentXp = 1e6; s.adAstraBalance = 250000;
  s.stamina = 5000; s.arenaKeys = 6; s.lockedBoxes = 3;
  for (const k of GAME_CONFIG.RESOURCE_KEYS) s.inventory[k] = 4000;
  s.inventory.fragments = 120; s.inventory.boxes = 2; s.inventory.keys = 3;
  s.warehouseLevel = 3;
  for (let i = 0; i < 4; i++) gs.buySoldierUnit();
  s.dungeonProgress = 5;
  const esya = (id, yuva, ad, ikon, atk, hp, dayanikli) => ({ id, slot: yuva, name: ad, icon: ikon, level: 2, baseAtk: atk, baseHp: hp, atkBonus: atk, hpBonus: hp, durability: dayanikli, maxDurability: 13, craftedAt: 1 });
  s.armoryInventory = [esya('t1', 'weapon', 'Deneme Kılıcı', '🗡️', 12, 0, 13), esya('t2', 'helmet', 'Deneme Miğferi', '🪖', 0, 20, 5), esya('t3', 'armor', 'Deneme Zırhı', '🛡️', 0, 40, 13)];
}

const durumlar = {
  'yeni hesap': () => new GameStateManager(),
  'zengin hesap': () => { const g = new GameStateManager(); zenginHesap(g); return g; }
};

const ekranlar = ekran.ekranlar();
assert.ok(ekranlar.length >= 1, 'kayıtlı ekran yok');

for (const [durumAdi, kur] of Object.entries(durumlar)) {
  depo.clear();
  const gs = kur();
  const b = baglam(gs);
  for (const e of ekranlar) {
    for (const secenek of (e.ornekSecenekler ? e.ornekSecenekler(b) : [{}])) {
    const etiket = `${e.id}${secenek.kaynak ? ':' + secenek.kaynak : ''} (${durumAdi})`;
    const baslik = e.baslik(b, secenek);
    assert.ok(Array.isArray(baslik) && baslik.length === 2 && baslik.every(x => typeof x === 'string' && x), `${etiket}: başlık [simge, ad] olmalı`);
    const html = e.govde(b, secenek);
    assert.equal(typeof html, 'string', `${etiket}: gövde metin olmalı`);
    assert.ok(html.length > 80, `${etiket}: gövde çok kısa`);
    const metin = gorunurMetin(html);
    const bozuk = metin.match(/NaN|undefined|\[object|Infinity|\bnull\b/);
    assert.equal(bozuk, null, `${etiket}: bozuk değer görünüyor: ${bozuk && bozuk[0]}`);
    assert.equal(etiketDengesi(html), '', `${etiket}: ${etiketDengesi(html)}`);
    assert.ok(!/\sstyle="(?![^"]*--p:)/.test(html), `${etiket}: satır içi stil kullanılmış (yalnız --p çubuk değişkenine izin var)`);
    // data-e adlarının hepsinin eylemi olmalı
    for (const m of html.matchAll(/data-e="([^"]+)"/g)) {
      assert.ok(e.eylemler && typeof e.eylemler[m[1]] === 'function', `${etiket}: data-e="${m[1]}" için eylem yok`);
    }
    for (const m of html.matchAll(/data-e-degis="([^"]+)"/g)) {
      assert.ok(e.degisimler && typeof e.degisimler[m[1]] === 'function', `${etiket}: data-e-degis="${m[1]}" için eylem yok`);
    }
    }
  }
}
console.log(`✅ ${ekranlar.length} ekran 2 hesap durumunda temiz çizildi: ${ekranlar.map(e => e.id).join(', ')}`);
