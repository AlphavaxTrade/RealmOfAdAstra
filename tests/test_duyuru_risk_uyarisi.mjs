import test from 'node:test';
import assert from 'node:assert/strict';

// Import GAME_CONFIG from js/config.js
import { GAME_CONFIG } from '../js/config.js';

test('🔔 Risk uyarısı duyurusu (Ben → Duyurular) doğrulama testi', async (t) => {
  await t.test('1. GAME_CONFIG.ANNOUNCEMENTS dizisi tanımlı ve en az 1 duyuru içermeli', () => {
    assert.ok(Array.isArray(GAME_CONFIG.ANNOUNCEMENTS), 'ANNOUNCEMENTS bir dizi olmalıdır');
    assert.ok(GAME_CONFIG.ANNOUNCEMENTS.length >= 1, 'En az 1 duyuru bulunmalıdır');
  });

  await t.test('2. Kullanıcının belirttiği güvenlik ve audit uyarı metni eksiksiz yer almalı', () => {
    const primaryAnnouncement = GAME_CONFIG.ANNOUNCEMENTS[0];
    assert.ok(primaryAnnouncement, 'İlk duyuru nesnesi bulunamadı');
    assert.strictEqual(primaryAnnouncement.id, 'audit_risk_warning');
    assert.ok(primaryAnnouncement.badge.includes('GÜVENLİK & RİSK UYARISI') || primaryAnnouncement.badge.includes('RİSK'));

    // Metin içeriği kontrolü
    const text = primaryAnnouncement.text;
    assert.ok(text.includes('antigravity ide gemini 3.8 flash botu'), 'Bot uyarısı metinde bulunmalıdır');
    assert.ok(text.includes('hiçbir audit yapılmamıştır'), 'Audit uyarısı metinde bulunmalıdır');
    assert.ok(text.includes('yazılım/kodlama bilmeyen tek bir kullanıcı'), 'Geliştirici uyarısı metinde bulunmalıdır');
    assert.ok(text.includes('ana web3 cüzdanınızla bağlanmayın'), 'Cüzdan uyarısı metinde bulunmalıdır');
    assert.ok(text.includes('deneysel bir süreçtir lütfen riskinizi gözeterek yatırım yapın'), 'Deneysel risk uyarısı metinde bulunmalıdır');
    assert.ok(text.includes('anlayısınız ve ilginiz için teşekkür ederim'), 'Kapanış metni bulunmalıdır');
  });

});
