// docs/kurumsal/SEMA.md koddan üretilir ve GÜNCEL olmalı (kurumsal A5.1): şema geçişi eklenip belge unutulursa test kırılır.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { belgeUret, BELGE_YOLU } from '../scripts/db/sema-belge.mjs';

const uretilen = belgeUret();
assert.ok(uretilen.includes('## sessions') && uretilen.includes('## kasa_ops') && uretilen.includes('schema_migrations'), 'beklenen tablolar belgede');
assert.ok(uretilen.includes('`sessions_bitis`'), 'indeksler belgede');
assert.ok(!uretilen.includes('(açıklama yok)'), 'her tablonun açıklaması yazılmalı: scripts/db/sema-belge.mjs ACIKLAMA');
const mevcut = fs.existsSync(BELGE_YOLU) ? fs.readFileSync(BELGE_YOLU, 'utf8').replace(/\r\n/g, '\n') : '';
assert.equal(mevcut, uretilen, 'docs/kurumsal/SEMA.md güncel değil: node scripts/db/sema-belge.mjs çalıştır');
console.log('✅ şema belgesi koddan üretilmiş hâliyle aynı');
console.log('\n1/1 şema belgesi testi geçti');
