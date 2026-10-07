import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GameStateManager } from '../js/gameState.js';
import { ammMarket } from '../js/ammMarket.js';
import { GAME_CONFIG } from '../js/config.js';

// Mock localStorage for node environment
const localStorageMock = (function() {
  let store = {};
  return {
    getItem: function(key) { return store[key] || null; },
    setItem: function(key, value) { store[key] = value.toString(); },
    clear: function() { store = {}; },
    removeItem: function(key) { delete store[key]; }
  };
})();
global.localStorage = localStorageMock;

describe('24 Saatlik Taverna Botu - 50x Önkoşul Kaynak ve Süre Dondurma (Freeze) Testleri', () => {
  let gameState;

  beforeEach(() => {
    localStorage.clear();
    gameState = new GameStateManager();
  });

  it('1. GAME_CONFIG.TAVERNA_BOT içinde zorunlu önkoşul kaynak limitleri tanımlı olmalı', () => {
    const prereqs = GAME_CONFIG.TAVERNA_BOT.REQUIRED_PREREQUISITES;
    assert.ok(prereqs, 'REQUIRED_PREREQUISITES objesi mevcut olmalı');
    assert.strictEqual(prereqs.iron, 50, 'En az 50 demir gerekli');
    assert.strictEqual(prereqs.wood, 50, 'En az 50 odun gerekli');
    assert.strictEqual(prereqs.wheat, 50, 'En az 50 buğday gerekli');
    assert.strictEqual(prereqs.adAstra, 0.5, 'En az 0,5 ASTRA gerekli (v2 ölçekli)');
  });

  it('2. checkBotPrerequisites fonksiyonu eksik kaynakları doğru raporlamalı', () => {
    // Tüm kaynakları sıfırla
    gameState.state.inventory = { iron: 10, wood: 50, wheat: 50 };
    gameState.state.adAstraBalance = 50;

    let res = gameState.checkBotPrerequisites();
    assert.strictEqual(res.isMet, false, 'Demir 10 olduğu için hazır olmamalı');
    assert.ok(res.missing.some(m => m.key === 'iron'), 'Demir eksik olarak listelenmeli');

    // Demiri de 50 yap
    gameState.state.inventory.iron = 50;
    res = gameState.checkBotPrerequisites();
    assert.strictEqual(res.isMet, true, 'Tüm kaynaklar >= 50 olduğunda hazır olmalı');
    assert.strictEqual(res.missing.length, 0);
  });

  it('3. Bot aktifken kaynaklardan biri 50 altına düşerse bot duraklatılmalı ve süresi dondurulmalı', () => {
    // Kullanıcıya bol kaynak ve ASTRA ver
    gameState.state.inventory = { iron: 100, wood: 100, wheat: 100 };
    gameState.state.adAstraBalance = 50000;

    // 24 saatlik bot satın al
    const buyResult = gameState.buyTavernaAutomationBot(false);
    assert.strictEqual(buyResult.success, true, 'Bot satın alınabilmeli');
    assert.strictEqual(gameState.isAutoCollectorActive(), true, 'Bot aktif olmalı');
    assert.strictEqual(gameState.isBotPaused(), false, 'Bot duraklatılmamış olmalı');

    const originalExpiry = gameState.getAutoCollectorExpiry();
    const remainingBeforePause = originalExpiry - Date.now();
    assert.ok(remainingBeforePause > 23 * 3600 * 1000, 'Kalan süre ~24 saat olmalı');

    // Odun miktarını 20ye düşürelim ve ASTRA kalmasın (satın alamaz -> duraklatılır)
    // v1.25: Bot, 50'nin üstündeki fazlayı satıp eksiği kendisi tamamlayabiliyorsa durmaz (kullanıcı kuralı:
    // "yetersiz ASTRA'da malzeme satarak devam et"). Burada satılabilecek fazla yok denecek kadar az → durmalı.
    gameState.state.inventory.wood = 20;
    gameState.state.inventory.iron = 52;
    gameState.state.inventory.wheat = 52;
    gameState.state.adAstraBalance = 0;

    // Bot pause durumunu kontrol et
    const pauseStatus = gameState.updateBotPauseState();
    assert.strictEqual(pauseStatus.isPaused, true, 'Bot duraklatılmış olmalı');
    assert.strictEqual(gameState.isBotPaused(), true, 'isBotPaused true dönmeli');
    assert.ok(gameState.state.botPausedRemainingMs > 0, 'Dondurulan süre kaydedilmeli');

    // Bot duraklatıldığında sefer tetiklenmemeli
    const expCycle = gameState.runTavernaAutomationCycle();
    assert.strictEqual(expCycle.active, false, 'Duraklatılmış bot sefer başlatmamalı');
  });

  it('4. Bot duraklatıldığında süre dondurulmalı (asla azalmamalı), kaynak tamamlanınca aynı kalan süreyle devam etmeli', () => {
    // 50x kaynaklar hazır
    gameState.state.inventory = { iron: 60, wood: 60, wheat: 60 };
    gameState.state.adAstraBalance = 50000;
    gameState.buyTavernaAutomationBot(false);

    // 1 saatlik bot süresi kaldığını varsayalım
    const oneHourMs = 3600 * 1000;
    gameState.state.botActiveUntil = Date.now() + oneHourMs;
    gameState.state.tavernaBotExpiresAt = gameState.state.botActiveUntil;

    // Demir 10a düştü ve ASTRA yok -> Bot duraklatıldı (satılabilecek fazla da yok)
    gameState.state.inventory.iron = 10;
    gameState.state.inventory.wood = 52;
    gameState.state.inventory.wheat = 52;
    gameState.state.adAstraBalance = 0;
    gameState.updateBotPauseState();

    assert.strictEqual(gameState.isBotPaused(), true);
    const frozenMs = gameState.state.botPausedRemainingMs;
    assert.ok(frozenMs > 3500 * 1000 && frozenMs <= oneHourMs, 'Yaklaşık 1 saat dondurulmuş olmalı');

    // Kullanıcı oyunda beklese veya aradan zaman geçse bile:
    // Dondurulan süre asla eksilmemeli
    assert.strictEqual(gameState.state.botPausedRemainingMs, frozenMs, 'Dondurulan süre sabit kalmalı');

    // Kullanıcı AMM pazarından veya madenden demir kazandı ve 100 demire ulaştı, ASTRA sağlandı
    gameState.state.inventory.iron = 100;
    gameState.state.adAstraBalance = 50000;
    const resumeCheck = gameState.updateBotPauseState();

    assert.strictEqual(resumeCheck.isPaused, false, 'Bot artık duraklatılmış olmamalı');
    assert.strictEqual(resumeCheck.justResumed, true, 'Yeni resume edildiğini bildirmeli');
    assert.strictEqual(gameState.isBotPaused(), false);
    assert.strictEqual(gameState.isAutoCollectorActive(), true, 'Bot yeniden aktif olmalı');

    // Kalan sürenin tam olarak dondurulduğu andaki kadar ileride olduğunu doğrula
    const newRemainingMs = gameState.getAutoCollectorExpiry() - Date.now();
    assert.ok(Math.abs(newRemainingMs - frozenMs) < 1000, 'Dondurulan süre kuruşu kuruşuna korunmuş olmalı');
  });
});
