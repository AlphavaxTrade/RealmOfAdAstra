// Geçişlerin sıralı listesi. YENİ GEÇİŞ: yeni dosya (NNN_ad.js) yaz, buraya ekle, tests/test_gecis.mjs mührünü güncelle.
import * as g001 from './001_taban.js';
import * as g002 from './002_kolonlar.js';
import * as g003 from './003_oturum_ozet.js';

export const GECISLER = [g001, g002, g003].sort((a, b) => a.surum - b.surum);
