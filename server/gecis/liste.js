// Geçişlerin sıralı listesi. YENİ GEÇİŞ: yeni dosya (NNN_ad.js) yaz, buraya ekle, tests/test_gecis.mjs mührünü güncelle.
import * as g001 from './001_taban.js';
import * as g002 from './002_kolonlar.js';
import * as g003 from './003_oturum_ozet.js';
import * as g004 from './004_indeksler.js';
import * as g005 from './005_eposta_anahtari.js';
import * as g006 from './006_kapi_ip.js';
import * as g007 from './007_eposta_belirtec_ozeti.js';
import * as g008 from './008_muhur_sifirlama.js';
import * as g009 from './009_geri_bildirim.js';
import * as g010 from './010_denge.js';
import * as g011 from './011_piyango_kasa_paylasim.js';

export const GECISLER = [g001, g002, g003, g004, g005, g006, g007, g008, g009, g010, g011].sort((a, b) => a.surum - b.surum);
