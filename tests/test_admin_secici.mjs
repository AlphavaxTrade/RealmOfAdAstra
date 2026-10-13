// Yönetici panelinin (server/admin.js) Ledger ile zincire gönderdiği işlem seçicileri sözleşmelerin gerçek imzalarıyla
// aynı olmalı. 14 Ekim 2026 taramasında panel `propose(uint16[19])` seçicisini gönderiyordu, sözleşme ise 21 elemanlı
// (`propose(uint16[21])`): panelden oran önerisi zincirde geri dönerdi ve hiçbir test fark etmiyordu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { id } from 'ethers';
import { RATE_COUNT } from '../js/economy/rates.js';

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
  'transfer(address,uint256)': 'oyun cüzdanına ASTRA',
};
const izinli = new Set(Object.keys(beklenen).map(sel));

// Panelin kullandığı her seçici bu listede olmalı ve listedeki her seçici panelde kullanılmalı.
const kullanilan = new Set([...admin.matchAll(/'(0x[0-9a-f]{8})'/g)].map(x => x[1]));
for (const s of kullanilan) assert.ok(izinli.has(s), `Panelde tanımsız seçici: ${s} (sözleşme imzasıyla eşleşmiyor)`);
for (const [imza, ne] of Object.entries(beklenen)) assert.ok(kullanilan.has(sel(imza)), `Panel "${ne}" için ${imza} (${sel(imza)}) seçicisini kullanmıyor`);
console.log(`✅ Panel seçicileri sözleşme imzalarıyla aynı (${kullanilan.size} seçici, oran dizisi ${n} değer)`);

// Oran formu kaç değer gönderiyorsa sözleşme o kadar bekler.
assert.ok(admin.includes('arr.length !== ' + n), 'Panel, oran listesinin uzunluğunu göndermeden önce denetlemeli');
console.log('✅ Panel gönderim öncesi oran listesi uzunluğunu denetliyor');
