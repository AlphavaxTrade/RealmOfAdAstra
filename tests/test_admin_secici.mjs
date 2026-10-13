// Yönetici panelinin (server/admin.js) Ledger ile zincire gönderdiği işlem seçicileri sözleşmelerin gerçek imzalarıyla
// aynı olmalı. 13 Ekim 2026 taramasında panel `propose(uint16[19])` seçicisini gönderiyordu, sözleşme ise 21 elemanlı
// (`propose(uint16[21])`): panelden oran önerisi zincirde geri dönerdi ve hiçbir test fark etmiyordu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { id } from 'ethers';
import { RATE_COUNT, RATE_KEYS } from '../js/economy/rates.js';

const admin = readFileSync(new URL('../server/admin.js', import.meta.url), 'utf8');
const rates = readFileSync(new URL('../contracts/RealmRates.sol', import.meta.url), 'utf8');
const sel = sig => id(sig).slice(0, 10);

// Sözleşmedeki gerçek dizi uzunluğu (kaynaktan okunur) hem JS'teki RATE_COUNT hem panel seçicisiyle aynı olmalı.
const m = rates.match(/function propose\(uint16\[(\d+)\] calldata rates\)/);
assert.ok(m, 'RealmRates.propose imzası kaynakta bulunamadı');
const n = Number(m[1]);
assert.equal(n, RATE_COUNT, 'RealmRates dizi uzunluğu ile js/economy/rates.js RATE_COUNT aynı olmalı (RATE_KEYS sırası)');

const beklenen = {
  [`propose(uint16[${n}])`]: 'oran önerisi',
  'cancel()': 'öneriyi geri çekme',
  'acceptOwnership()': 'sahipliği kabul',
  'setPaused(bool)': 'ödemeleri durdur/aç',
  'cancelConfig()': 'bekleyen hazine/komisyon adresi değişikliğini iptal (24 saat gecikmeli, K5)',
  'transfer(address,uint256)': 'oyun cüzdanına ASTRA',
};
const izinli = new Set(Object.keys(beklenen).map(sel));

// Ödeme sözleşmesinde adres değişikliği 24 saat gecikmeli iki adımlı olmalı (K5): anında değiştiren setConfig kalmamalı,
// panelin iptal düğmesinin kullandığı cancelConfig() gerçekten var olmalı.
const odeme = readFileSync(new URL('../contracts/RealmPayments.sol', import.meta.url), 'utf8');
assert.ok(!/function setConfig\(/.test(odeme), 'RealmPayments.setConfig anında adres değiştirirdi: kaldırılmış olmalı');
for (const f of ['proposeConfig(address treasury_, address feeReceiver_)', 'applyConfig()', 'cancelConfig()', 'setFeeGas(uint256 feeGas_)']) assert.ok(odeme.includes('function ' + f), 'RealmPayments.' + f + ' yok');
assert.match(odeme, /CONFIG_DELAY = 24 hours/);
// Yapımcı payı (sıra 1) sözleşmede ve JS'te aynı üst sınır (%10 = 1000 bps)
assert.match(rates, /MAX_CREATOR_BPS = 1000/);
assert.equal(RATE_KEYS[1].key, 'creator');
assert.equal(RATE_KEYS[1].max, 1000, 'js/economy/rates.js yapımcı payı üst sınırı sözleşmeyle aynı olmalı');

// Panelin kullandığı her seçici bu listede olmalı ve listedeki her seçici panelde kullanılmalı.
const kullanilan = new Set([...admin.matchAll(/'(0x[0-9a-f]{8})'/g)].map(x => x[1]));
for (const s of kullanilan) assert.ok(izinli.has(s), `Panelde tanımsız seçici: ${s} (sözleşme imzasıyla eşleşmiyor)`);
for (const [imza, ne] of Object.entries(beklenen)) assert.ok(kullanilan.has(sel(imza)), `Panel "${ne}" için ${imza} (${sel(imza)}) seçicisini kullanmıyor`);
console.log(`✅ Panel seçicileri sözleşme imzalarıyla aynı (${kullanilan.size} seçici, oran dizisi ${n} değer)`);

// Oran formu kaç değer gönderiyorsa sözleşme o kadar bekler.
assert.ok(admin.includes('arr.length !== ' + n), 'Panel, oran listesinin uzunluğunu göndermeden önce denetlemeli');
console.log('✅ Panel gönderim öncesi oran listesi uzunluğunu denetliyor');
