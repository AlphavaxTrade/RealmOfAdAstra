// Koleksiyon ve Savaş alanı ekranlarının eylemleri: kutu açma anahtar harcar, eksik koleksiyonla Genesis basılmaz,
// ordu kilitlenince ekran "kilitli" gösterir, ödül alanı geçerli sayı gösterir.
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
await import('../js/ui/ekran/index.js');
const { default: koleksiyon } = await import('../js/ui/ekran/koleksiyon.js');
const { default: savasalani } = await import('../js/ui/ekran/savasalani.js');

const gs = new GameStateManager();
const s = gs.state;
s.level = 30; s.adAstraBalance = 250000; s.stamina = 5000;
for (let i = 0; i < 3; i++) gs.buySoldierUnit();

const bildirimler = [];
const b = {
  gameState: gs, GAME_CONFIG, globalPool, ammMarket, treasury,
  online: { active: false },
  bildir: (m, t) => bildirimler.push([m, t]),
  hudYenile() {}, kilit: () => null
};
const son = () => bildirimler.at(-1) || [];

// Genesis: 0/18 eserle basılamaz, bakiye değişmez
{
  const once = s.adAstraBalance;
  koleksiyon.eylemler.genesis(b);
  assert.equal(son()[1], 'error', 'eksik koleksiyonla Genesis basılmamalı');
  assert.equal(s.adAstraBalance, once, 'başarısız basımda bakiye değişmemeli');
  console.log('✅ Genesis: eksik koleksiyonla basılmıyor, bakiye aynı');
}

// Kutu açma: kutu yoksa hata, anahtar yoksa hata, ikisi de varsa 1 kutu + 1 anahtar harcanır
{
  s.lockedBoxes = 0; s.arenaKeys = 5;
  const secenek = { sekme: 'kutular' };
  assert.equal(await koleksiyon.eylemler.kutuAc(b, null, secenek), false);
  assert.equal(son()[1], 'error');
  s.lockedBoxes = 2; s.arenaKeys = 0;
  assert.equal(await koleksiyon.eylemler.kutuAc(b, null, secenek), false);
  assert.equal(s.lockedBoxes, 2, 'anahtarsız kutu açılmamalı');
  s.arenaKeys = 3;
  await koleksiyon.eylemler.kutuAc(b, null, secenek);
  assert.equal(s.lockedBoxes, 1, 'bir kutu harcanmalı');
  assert.equal(s.arenaKeys, 2, 'bir anahtar harcanmalı');
  assert.ok(secenek.sonSonuc && secenek.sonSonuc.message, 'sonuç mesajı saklanmalı');
  assert.ok(koleksiyon.govde(b, secenek).includes(secenek.sonSonuc.message.split(' ')[0]), 'sonuç ekranda görünmeli');
  console.log('✅ Pandora kutusu: 1 kutu + 1 anahtar harcanıyor, sonuç ekranda');
}

// Savaş alanı: kilitlemeden önce "kilitli değil", sonra "kilitli"; erken çekme cezası onay ister (burada eylem çağrılmaz)
{
  assert.ok(savasalani.govde(b, {}).includes('ordu kilitli değil'));
  savasalani.eylemler.kilitle(b);
  assert.equal(son()[1], 'success', 'ordu kilitlenmeli: ' + son()[0]);
  const html = savasalani.govde(b, {});
  assert.ok(html.includes('savaş için kilitli'), 'kilit sonrası rozet değişmeli');
  assert.ok(html.includes('data-e="erken"'), 'kilitliyken erken çekme düğmesi görünmeli');
  console.log('✅ Savaş alanı: kilitleme ekrana yansıyor');
}

// Ödül alanı: ekranda bozuk değer yok, toplanabilir ödül geçerli sayı
{
  const ekran = savasalani.govde(b, {});
  assert.ok(!/NaN|undefined|Infinity/.test(ekran), 'ekranda bozuk değer yok');
  const boss = gs.getWorldBossInfo();
  assert.ok(Number.isFinite(boss.claimableRewardAda), 'ödül sayı olmalı');
  console.log('✅ Savaş alanı: ödül alanı geçerli sayı');
}
