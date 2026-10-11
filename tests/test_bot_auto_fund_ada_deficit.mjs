import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GameStateManager } from '../js/gameState.js';
import '../js/ammMarket.js';
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
const NEED = GAME_CONFIG.TAVERNA_BOT.REQUIRED_PREREQUISITES.adAstra; // v2: botun ASTRA önkoşulu (0,5)

describe('🤖 Bot Çalışırken ASTRA Yetersizliğinde Depodan Eşit Miktarda Satış ve Oto-Finansman Testi', () => {
  let gameState;

  beforeEach(() => {
    localStorage.clear();
    gameState = new GameStateManager();
  });

  it('1. Bot çalışırken ASTRA 50 altına düşerse depodan tüm malzemelerden EŞİT MİKTARDA satıp 50 ASTRA temin etmeli', () => {
    // Depoda bol hammadde var, ama ASTRA 5'e düşmüş
    gameState.state.inventory = { wood: 500, iron: 500, wheat: 500 };
    gameState.state.adAstraBalance = NEED * 0.1;

    const res = gameState.autoFundBotAdaDeficit(NEED);
    assert.strictEqual(res.funded, true, 'Oto finansman başarılı olmalı');
    assert.ok(res.totalEarned > 0, 'ADA kazanılmış olmalı');
    assert.ok(gameState.state.adAstraBalance >= NEED, 'Yeni ASTRA bakiyesi en az önkoşul kadar olmalı');

    // Eşit miktarda satıldığı kontrolü:
    assert.strictEqual(res.toSell.wood, res.toSell.iron, 'Odun ve Demir eşit satılmalı');
    assert.strictEqual(res.toSell.iron, res.toSell.wheat, 'Demir ve Buğday eşit satılmalı');
    assert.ok(res.toSell.wood > 0, 'En az 1 adet satılmış olmalı');
  });

  it('2. updateBotPauseState: ASTRA < 50 olduğunda bot durmak yerine eşit satış yapıp kesintisiz çalışmaya devam etmeli', () => {
    // Bot süresi var
    gameState.state.inventory = { wood: 300, iron: 300, wheat: 300 };
    gameState.state.adAstraBalance = NEED * 0.3; // önkoşulun altında!
    gameState.state.botActiveUntil = Date.now() + (12 * 3600 * 1000);
    gameState.state.tavernaBotExpiresAt = gameState.state.botActiveUntil;

    // Bot pause durumunu güncelle
    const pauseStatus = gameState.updateBotPauseState();

    // Bot duraklatılmamalı! Çünkü oto-finansman devreye girip ASTRA'yı 50'ye tamamladı
    assert.strictEqual(pauseStatus.isPaused, false, 'Bot duraklatılmamalı, kesintisiz çalışmalı');
    assert.strictEqual(gameState.isBotPaused(), false, 'isBotPaused false olmalı');
    assert.ok(gameState.state.adAstraBalance >= NEED, 'Bakiyesi önkoşulun üzerine çıkarılmış olmalı');
  });

  it('3. Halihazırda duraklatılmış bot, updateBotPauseState anında depodan eşit satışla anında UYANMALI (Resume)', () => {
    // Kullanıcının ekranındaki durum: Bot 50 ASTRA yok diye duraklatılmıştı
    gameState.state.inventory = { wood: 250, iron: 250, wheat: 250 };
    gameState.state.adAstraBalance = NEED * 0.16;
    gameState.state.botPaused = true;
    gameState.state.botPausedRemainingMs = 18 * 3600 * 1000;

    const pauseStatus = gameState.updateBotPauseState();

    assert.strictEqual(pauseStatus.isPaused, false, 'Duraklatılmış bot anında uyanmalı');
    assert.strictEqual(gameState.isBotPaused(), false, 'isBotPaused false olmalı');
    assert.ok(gameState.state.adAstraBalance >= NEED, 'ASTRA bakiyesi önkoşulun üzerine çıkmalı');
  });
});
