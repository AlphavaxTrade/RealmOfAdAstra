import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(projectRoot, p), 'utf-8');

test('🖱️ Harita & Zindan imleci ve v1.25 ekran yerleşimi', async (t) => {
  await t.test('1. index.html içinde sadece 1 adet phaser-game-container bulunmalı', () => {
    const matches = read('index.html').match(/id=["']phaser-game-container["']/g) || [];
    assert.strictEqual(matches.length, 1, 'index.html içinde tam olarak 1 adet phaser-game-container olmalıdır');
  });

  await t.test('2. Harita sahnesi binaların üzerinde el imleci göstermeli', () => {
    const sceneCode = read('js/grandTownScene.js');
    assert.ok(/cursor\s*=\s*[^;]*'pointer'/.test(sceneCode), 'Bina üzerine gelince pointer imleci ayarlanmalıdır');
    assert.ok(/cursor\s*=\s*[^;]*'grab'/.test(sceneCode), 'Boş alanda sürükleme (grab) imleci ayarlanmalıdır');
  });

  await t.test('3. Zindan sahnesi imleç ve ipucu konumunu tuval üst kenarına göre hesaplamalı', () => {
    const sceneCode = read('js/dungeonScene.js');
    assert.ok(sceneCode.includes("_imlec('pointer')") && sceneCode.includes('setDefaultCursor(tur)'), 'Zindan oda/portal hover anında pointer imleci ayarlanmalıdır');
    assert.ok(sceneCode.includes('_tuvalUstu()') && sceneCode.includes('getBoundingClientRect().top'), 'Zindan ipucu Y koordinatına tuval üst kenarı eklenmelidir');
  });

  await t.test('4. Harita alanı üst bar ve telefon alt çubuğunun altından başlamalı', () => {
    const css = read('css/theme.css');
    assert.ok(css.includes('top: var(--hud-h) !important'), 'Harita üst barın hemen altından başlamalıdır');
    assert.ok(/height: calc\(100dvh - var\(--hud-h\) - var\(--tabbar-h\)/.test(css), 'Harita yüksekliği üst bar ve alt çubuk düşülerek hesaplanmalıdır');
    assert.ok(read('index.html').includes('css/theme.css'), 'theme.css sayfaya yüklenmelidir');
  });

  await t.test('5. Harita boyutu gerçek kutudan okunmalı (telefonda üst bar daha yüksek)', () => {
    const app = read('js/app.js');
    assert.ok(app.includes('function getStageSize()'), 'getStageSize tanımlı olmalıdır');
    assert.ok(!/innerHeight - 92\)\);/.test(app), 'Sabit 92px yükseklik varsayımı kalmamalıdır');
  });
});
