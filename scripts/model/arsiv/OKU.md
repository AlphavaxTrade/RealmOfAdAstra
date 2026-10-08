# Arşiv — eski ekonomi modelleri (E-planı S11, 8 Ekim 2026)

Bu 3 model 30 Eylül 2026'da yazıldı; o günün ekonomisini yansıtıyorlar (yakım %13 değil %5, 6 kasa değil 8,
3 hammadde değil 6, eski pazar tohumları). 7 Ekim'deki R2-R4 kararlarından (6 hammadde, 200 M tohum, 8 kasa,
yakım %5, Üretim Hakkı) sonra güncel değiller; bir sonraki aracın (`denge_modeli.mjs` / `astra_fiyat_yolu.mjs`)
yerini aldılar. Koşulmaları artık doğru sonuç vermez — yalnız "o gün hangi kararın hangi hesaba dayandığını"
göstermek için tutuluyor (`js/config.js` ve `server/economy.js`'deki "30 Eylül" tarihli yorumlar bunları anar).

- `world_economy_model.mjs` + `world_result_g0*.json` → yerini `denge_modeli.mjs` aldı (R3/R4).
- `token_economy_model.mjs` + `token_result_final.json` → yerini `astra_fiyat_yolu.mjs` aldı (R4c).
- `dungeon_economy_model.mjs` + `dungeon_model_result_2026-09-30.json` → zindan ödül oranı artık
  `js/config.js DUNGEON.REWARD_ADA_PER_LEVEL` (0,9/seviye); ayrı bir güncel model yok, gerekirse yeniden yazılır.
