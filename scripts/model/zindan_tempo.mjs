// Zindan tempo modeli (18 Ekim 2026): "akıllı, her gün oynayan bir oyuncu bir canavarı EN ERKEN kaçıncı günde yener?"
// Gün, iki bedelin büyüğüdür (ikisi aynı anda biriktirilir):
//   • asker seviyesi S  → hesap seviyesi S olmalı (asker seviyesi ≤ hesap seviyesi). Gün = kümülatif XP(S) ÷ günlük XP arzı:
//     oyunun kendi formülü (js/gameState/gelisim.js getCumulativeXpForLevel; HEDEF_GUN=1100 günde seviye 81).
//   • tam takım teçhizat seviyesi t, n asker için → hammadde: n × takım maliyeti ÷ (günlük üretimin YARISI; diğer yarısı seviye
//     bedeline gider, js/gameState/gelisim.js getNextLevelRequirement: bedel = kazanılan hammaddenin yarısı).
// Varsayımlar (modelin sınırı): üretim kesintisiz ve taban hızda (BASE_PRODUCTION × 1440 dk), silo sınırı ve Üretim Hakkı çarpanı yok;
// zindan stamina ve günlük giriş sınırı yok; teçhizat aşınması ve tamir yok. Yani sonuç ALT SINIRDIR (gerçek oyuncu daha geç).
//   node scripts/model/zindan_tempo.mjs [--hak=kat+1|kat|seviye] [--ayar=ayar.json]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ordu, kazanmaSansi, takimMaliyeti, canavarlar, HAK_KURALLARI, ESIK, GAME_CONFIG } from './zindan_denge.mjs';

const GUNLUK_XP_ARZI = 2520;   // js/gameState/gelisim.js (dışa açık değil: aynı sayı; test_zindan_tempo bunu koddan doğrular)
export const DAKIKA_GUNDE = 1440;

const gs0 = ordu(1, 1, 0);
// hesap seviyesi S'e ulaşmanın gün bedeli
export const seviyeGunu = (s) => Math.round(gs0.getCumulativeXpForLevel(s) / GUNLUK_XP_ARZI * 10) / 10;
// n asker için tam takım t seviyesinin hammadde gün bedeli (en yavaş hammadde belirler; üretimin yarısı teçhizata)
export function takimGunu(n, t) {
  if (t <= 0) return 0;
  const m = takimMaliyeti(t), U = GAME_CONFIG.BASE_PRODUCTION;
  const gunluk = (k) => (U[k] || 0) * DAKIKA_GUNDE * 0.5;
  const sureler = { odun: n * m.odun / gunluk('wood'), demir: n * m.demir / gunluk('iron'), komur: n * m.komur / gunluk('coal'), tas: n * m.tas / gunluk('stone') };
  const [darbogaz, gun] = Object.entries(sureler).sort((a, b) => b[1] - a[1])[0];
  return { gun: Math.round(gun * 10) / 10, darbogaz };
}

const SEVIYELER = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 20, 24, 28, 32, 40];
// bir canavar için en erken gün: tüm (asker seviyesi, takım seviyesi) çiftleri arasında en küçük max(seviye günü, takım günü)
export function enErkenGun(canavar, n, { ornek = 40 } = {}) {
  let en = null;
  for (const s of SEVIYELER) {
    const sg = seviyeGunu(s);
    if (en && sg >= en.gun) break;                       // daha yüksek seviye zaten daha geç
    for (let t = 0; t <= (GAME_CONFIG.EQUIPMENT_MAX_LEVEL || 10); t++) {
      const tg = takimGunu(n, t);
      const gun = Math.max(sg, t ? tg.gun : 0);
      if (en && gun >= en.gun) continue;
      if (kazanmaSansi(ordu(n, s, t), canavar, n, ornek) >= ESIK) { en = { gun, askerSeviyesi: s, takim: t, darbogaz: t ? tg.darbogaz : '-' }; break; }
    }
  }
  return en;   // null: hiçbir (seviye ≤ 40, takım ≤ 10) çifti yetmiyor
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const arg = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
  const hakAdi = typeof arg.hak === 'string' ? arg.hak : 'kat+1';
  const ayar = arg.ayar ? JSON.parse(fs.readFileSync(arg.ayar, 'utf8')) : {};
  console.log(`Hak kuralı: ${hakAdi}. Her canavarın EN ERKEN yenilme günü (alt sınır; her gün oynayan, kesintisiz üreten oyuncu). Hesap seviyesi → gün: 10: ${seviyeGunu(10)}, 20: ${seviyeGunu(20)}, 30: ${seviyeGunu(30)}, 40: ${seviyeGunu(40)}.`);
  console.log('lv  canavar                    hak |  gün   asker sv.  takım  (darboğaz hammadde)');
  for (const c of canavarlar(ayar)) {
    const n = HAK_KURALLARI[hakAdi](c), e = enErkenGun(c, n);
    console.log(String(c.level).padStart(2) + '  ' + c.name.padEnd(26) + String(n).padStart(3) + '  | ' + (e ? `${String(e.gun).padStart(5)}   ${String(e.askerSeviyesi).padStart(8)}   ${String(e.takim).padStart(4)}   ${e.darbogaz}` : '  yok (sv.40 + takım 10 bile yetmiyor)'));
  }
}
