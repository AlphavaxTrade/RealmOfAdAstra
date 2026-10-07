# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Realm of AdAstra (RoA): a browser strategy / RPG for the Avalanche ADASTRA token (shown in-game as **ASTRA**; the save field is still `adAstra`). Vanilla JS + Vite, Phaser for the dungeon, three.js for the 3D valley map, and one Node server (`server/`, `node:sqlite`) that runs the very same browser game code for every player.

- **Active branch `roa-v2`**: the v2 rewrite, done as a gradual transformation of working code (server plumbing, accounts, payments and tests kept; game core, config, screens and map converted step by step). `main` is the v1.34/1.35 line. `vanilla-stable` + tag `v1.34-vanilla` and the folder `..\adastra-realm-VANILLA-v1.34` are the pre-v2 backup: never edit that folder.
- Decisions the code is written against: `docs/v2/KARARLAR_KESIN.md`. Where the code stands and what is left: `docs/v2/DURUM_2026-10-07.md`. Design history: `docs/ROA_V2_PLAN.md`, `docs/v2/R1…R5*.md`, the economy constitution `docs/v2/EKONOMI_ILKELERI.md`.
- `README.md` describes v1 (three resources, world quota, 2D map, `npm run dev` only); do not take v2 layout or numbers from it.
- Private, machine-specific rules (the user, trial accounts, server details, push restrictions, pending decisions) live in `CLAUDE.local.md` and the memory files; `.git/info/exclude` keeps that file, `HANDOVER_SUMMARY.md`, `.claude/` and two audit docs out of git. Keep them out of this file.
- The sibling repo `..\megalodon-live-deck` (the trade site) is a different project with its own CLAUDE.md; only `scripts/sunucuya-yukle.sh` reaches into it (the SSH key vault).

## Commands

```bash
npm install
npm run dev                  # Vite on :5180 (--strictPort). No /api, so the game runs in single-player localStorage mode; test menu (T) is on
npm run build                # dist/ (manual chunks: phaser, three)
npm test                     # node tests/run_all.mjs: every tests/test_*.mjs in its own process; exit 1 lists the failures
node tests/test_v2_kapi.mjs  # one test file (plain node:assert scripts, no framework)

node server/index.js         # the game server; reads server/.env (see server/.env.example). TEST_MODE=1 CHAIN_ENABLED=0 for a trial
OYUN-SUNUCUSU-BASLAT.bat     # local TRIAL server at http://localhost:8080 under a watchdog (scripts/windows/online-keep-alive.cjs):
                             #   builds dist, TEST_MODE=1, chain off, DB data/local.db, admin at /admin with password data/admin-token.txt,
                             #   log logs/online-server.log, pid logs/online-server.pid, registered in Windows Startup
OYUN-SUNUCUSU-DURDUR.bat     # stops it (kills the pid and whatever listens on 8080). After a code change: stop, then
                             #   wscript scripts\windows\online-hidden.vbs  and wait for GET /api/health (the watchdog rebuilds first)
OYUNU-BASLAT.bat             # the older Vite-only watchdog on :5180 (keep-alive.cjs)

node contracts/compile.mjs   # solc -> contracts/build/<Name>.json (gitignored)
node contracts/deploy.mjs    # env-driven: DEPLOY_RPC, DEPLOYER_PRIVATE_KEY, OWNER_ADDRESS, TREASURY...; mainnet needs CONFIRM_MAINNET=1
node scripts/vercel-yukle.mjs [https://server]   # static game files -> realmofadastra.vercel.app (token in ~/.realm_vercel_token[.txt])
bash scripts/sunucuya-yukle.sh                   # game server -> the AWS box (user realm, /srv/realm, 127.0.0.1:8090 behind Caddy, TEST_MODE)
docker compose up -d --build                     # production packaging (Dockerfile; docs/SUNUCU_KURULUM.md)
node scripts/generate_doc_tables.mjs             # regenerates docs/LEVEL_PROGRESSION_TABLES.md from the engine
python scripts/gorsel_isle.py ikon <in.jpg> <out.webp>   # Gemini image -> transparent 256x256 webp icon (video_edit venv python)
```

Releases and chain deploys happen only at the user's request, local first (see `CLAUDE.local.md`). The game version is `GAME_CONFIG.GAME_VERSION` plus the `CHANGELOG` array in `js/config.js` (shown in-game); `package.json` has its own version. Playwright is a devDependency for ad-hoc headless checks of the built game with system Chrome (`--use-gl=angle --use-angle=swiftshader` for the 3D map); no test in `tests/` uses it.

## Architecture

### One game engine, two hosts

- The rules live in the browser modules: `js/gameState.js` (`GameStateManager`: resources, expeditions, tools, silo, army, armory, dungeon, carnival, bot, onboarding, offline catch-up), `js/globalPool.js` (the world: epochs, Üretim Hakkı / Sirius capacity, token accounting, UBI, the Hazırlık Deposu total), `js/ammMarket.js` (pool market), `js/treasury.js` (the kasalar), `js/combat.js` + `js/bestiary.js`, pure modules in `js/economy/` (rates, lottery, faucet, ubi, pvp), and `js/v2/koyVeKonsey.js` (v2 mixins `Object.assign`ed onto `GameStateManager.prototype` / `globalPool`: Köy Evleri, Şifahane, recycling, rocket, Sirius Konseyi, Hazırlık Deposu). Persistence goes through `js/storage.js` to `localStorage` (`adastra_player_save_v6`, `__yedek` backup, `__bozuk` quarantine).
- `server/engine.js` runs exactly this code in Node: it installs a `localStorage` shim backed by the sqlite `kv` table (`ls:` prefix) plus a fake `window`, then imports `js/config.js`, `gameState.js`, `globalPool.js`, ... `withPlayer(address, fn)` = load the player's save, process elapsed time, run `fn`, save; it is synchronous, so two requests never interleave. World state (market pools, treasury, quota, lottery, kapı, rates, universe stage) is shared under `world:*` kv keys; player saves under `player:<id>`. Consequently a rules test needs only a mock `localStorage` and `new GameStateManager()`, no server.
- `js/config.js` `GAME_CONFIG` is the single source of numbers; the v2 block at the top (`RESOURCE_KEYS` = 6 resources, `ASTRA_SCALE`, `URETIM_HAKKI`, `KAPI`, `ILAN_PAZARI`, `UZAY_LIMANI`, `EQUIPMENT_CRAFT_MINUTES`, `WAREHOUSE`, the 200 M ASTRA seeds) is what `KARARLAR_KESIN.md` decided. ASTRA costs are written already scaled (×0.01 of the v1 list, production ×0.3).
- The ASTRA split rates (burn / creator / UBI / pools, the 8 pool shares, special rules) can be overridden from the RealmRates contract: the `RATE_KEYS` order in `js/economy/rates.js` **is** the order in `contracts/RealmRates.sol`; never reorder. The server reads the contract every 5 minutes and applies it with `applyRates`; without `RATES_CONTRACT` the config values hold.

### Server (`server/`)

- `index.js` wires, in order: `config.js` (every env var) → `db.js` (sqlite, WAL; tables kv, players, nonces, sessions, deposits, payouts, prices, events, listings, ...) → `engine.js` → `chain.js` (Arena bonding-curve / DEX price, Chainlink AVAX/USD, transfer scans, sends) → `mailer.js` → `accounts.js` (e-mail + password with scrypt, verification / reset links, wallet linking by signature + e-mail confirmation with a 48 h change delay, optional TOTP) → `arena.js` (real PvP queue) → `kasa.js` (per-player server-managed wallet, keys AES-GCM under `KASA_MASTER_KEY`) → `kapi.js` (citizen gate: limit, waiting queue, inactivity warn / suspend, registration fee, growth indicator) → `pazar.js` (equipment listing market) → `world.js` → `payments.js` (quote, `RealmPayments.pay`, on-chain verify) → `app.js`. Startup locks: `TEST_MODE` refuses real keys or a mainnet payments contract, and a DB ever opened in test mode refuses to open in real mode.
- `app.js` is a plain `http` server. Routes are a `'METHOD /api/path'` map; `PUBLIC_ROUTES` need no login, everything else needs the Bearer session, `/api/admin/*` needs `ADMIN_TOKEN` (under 24 chars = panel off), `/admin` serves `admin.html` + `admin.js`. `GET /api/state` = player save + world snapshot; `POST /api/action {name, args}` goes through `actions.js`; non-citizens (gate) get 403 on actions and market operations.
- `server/actions.js` is the whitelist, `name: A([argTypes], { random })`. Only listed names run, args are shape-checked by `T`, `DEV_ACTIONS` (cheat / setDev / fast-forward / reset) only in test mode. `random: true` actions (`fightDungeon`, `craftEquipment`, `spinCarnivalWheel`, `unboxMysteryBox`, the PvP match, the lottery ticket) are resolved on the server only; the browser waits. Time-driven work (expeditions, bot, stamina, healing, economy tick) is recomputed server-side on every request and is `LOCAL_ONLY` display work in the browser.
- `world.js`: the minute tick from `index.js` drives the weekly settlement (Monday 00:01 TR; pure rules in `server/economy.js`: shared withdrawal pool capped at 2 % price impact, 3 / 6 % fee, brake, faucet, price multiplier), hourly `kapi.run()` + `pazar.expire()`, the Sunday world boss, payouts `pending → sending → sent` (a row left in `sending` is never resent; the admin panel reconciles), the rates sync, and the Universe stage (`world:universeStage`, admin-set, sent to players in the snapshot).

### Browser (`js/`)

- `js/app.js` is the single UI controller (HUD, every modal, market tabs incl. İlan Pazarı, armory, Konsey, spaceport depot, gate banner, offline report, test menu, Phaser bootstrap). `js/net/online.js` switches to online mode when `/api/health` answers: e-mail login, actions proxied (normal actions apply locally then post, and the server's answer replaces the local copy; random actions wait), sync every 20 s, `online.kapi / gate`, the `pazar` client, `GAME_CONFIG.UNIVERSE_STAGE` from the snapshot. It imports `../../server/actions.js`, so browser and server share one whitelist file. With no server the game is the unchanged single-player mode. Test menu: `import.meta.env.DEV` offline, `health.testMode` online.
- Map: the default is the 3D valley in `js/vadi3d/` (three.js 0.186): `vadi.js` (`startVadi3D`, `VadiBootScene` Phaser preload, camera / input / picking / hero walk / status cards, `window.realmMap.flyTo(zoneId)`), `dunya.js` (island terrain, sea, roads, river, mountains, castle, nature instancing), `binalar.js` (modular house builder + one template per zone from the Kenney CC0 kits in `public/assets/3d/{town,castle,nature}`; `Textures/colormap.png` must sit beside the GLBs or the models render white), `yukle.js` (GLTF cache, `piece`, `instancedPiece`), `galeri.js` (developer galleries `?galeri=town|castle|nature&sayfa=N`, `?galeri=binalar`). Zone ids and positions come from `TOWN_ZONES` in `js/grandTownScene.js`, the old 2D Phaser map, still reachable with `?harita=2d` (or localStorage `harita=2d`, which is also the automatic fallback when 3D fails). The dungeon stays Phaser (`dungeonScene.js`); the 3D layer is hidden / shown around it (`body.map-3d`, `.in-dungeon`).
- Smaller UI modules: `js/ui/barracks.js`, `ui/limits.js`, `ui/art.js`; styles `css/theme.css` (main), `style.css`, `barracks.css`, `battle-arena.css`; `index.html` is the skeleton; `public/boot.js` carries the CSP.

### Contracts (`contracts/`)

`RealmPayments.sol` (`pay(amount, ref)`: ADASTRA to the treasury, AVAX fee = gas price × `feeGas`, the same `PAY_FEE_GAS` on the server), `RealmRates.sol` (owner-only rate changes effective after 24 h), `test/MockToken.sol` for Fuji; `tests/test_contract_payments.mjs` and `test_rates_contract.mjs` run them on ganache.

## Tests: how they are built

- Engine tests: set `globalThis.localStorage` to a tiny mock, `new GameStateManager()`, drive it with a simulated clock, assert with `node:assert/strict`, print ✅ lines.
- Server tests: `openDb(':memory:')`, `createEngine(db, { testMode: true })`, `createMailer / createAccounts / createKapi / createWorld / createApp` with a fake `clock: () => now` and a quiet `log`, `app.server().listen(0)`, then `fetch` against it. Register with `POST /api/account/register`, read the verification link from the kv outbox `dev:outbox`, verify, keep the Bearer token. Tweak `engine.GAME_CONFIG.*` for small scenarios (e.g. `KAPI.START_LIMIT = 2`).
- Never use real user data, keys or production DB files; tests must not touch the chain.
- Done means `npm test` (all files) and `npm run build` pass, and for UI work the built game was opened on the local trial server.

## Conventions and gotchas

- User-facing text, docs, identifiers and most comments are Turkish. Commit titles are plain-word Turkish without Turkish letters (e.g. `v2 K3: vadi sinirli bir ada oldu ...`) listing what changed; `docs:` for document-only commits.
- Keep every step playable: v2 converts existing code rather than rewriting from zero; don't drop server plumbing or existing tests to make a feature fit.
- Economy numbers come from the decision docs; a new cost must fit the level-1 silo (one hour of production) or the user cannot play it (`tests/test_new_mechanics_v106.mjs` guards the craft costs).
- The map stays static: animated decorations (villagers, clouds, birds, smoke, blinking rings) were removed on request; don't re-add them. Building hover shows the designed info card (`.map-card`, `.map-label`), not rings.
- three.js 0.186 has no `PCFSoftShadowMap`; use `PCFShadowMap`. Kenney tile scale is `S = 2.3`, world 168 × 100 units, wall panels sit on the +x edge of a tile (`cx = 0.45`, `ry = dir × 90°`, dir 0 east / 1 north / 2 west / 3 south).
- `npm run dev` never exercises the server path; anything touching accounts, the gate, listings or payouts must be checked against `node server/index.js` or the :8080 trial server, which serves `dist/` (rebuild first).
- `data/`, `logs/`, `dist/`, `server/.env`, `*.db`, `contracts/build/` are gitignored; `server/.env.example` lists every env var.

## Çalışma kuralları (Claude proje kiti)

Kaynak: `claude-proje-kiti/claude-proje-kiti` (`KURULUM.md`). Bu bölümle yukarıdaki proje kuralları çelişirse **yukarıdakiler geçer** (ör. mevcut yığın Vanilla JS + Vite + `node:sqlite` korunur, kitin Next.js önerisi uygulanmaz; test düzeni `tests/test_*.mjs`; commit başlıkları Türkçe harfsiz; sürüm yayını ve zincir işlemleri yalnız kullanıcı isteyince, önce localhost; push kısıtları `CLAUDE.local.md`'de).

- **Kullanıcı ve dil:** kullanıcı yazılımcı değil; sade Türkçe, teknik terim ilk geçtiğinde bir cümleyle açıklanır. Dürüstlük önce: çalışmayan şeye "çalışıyor", denemediğine "test ettim" denmez. Teknik kararları ben veririm, her birini bir cümleyle gerekçelendirip alternatifini söylerim.
- **İşi baştan sona ben yaparım:** kurulum, komut, test, tarayıcıda deneme, hata ayıklama kullanıcıya devredilmez. Bozulursa önce logu okuyup kendim çözerim; üç denemede olmazsa ne denediğimi ve neye ihtiyacım olduğunu anlatırım. Kullanıcıdan yalnız karar, hesap/anahtar, ödeme ve yayın/push onayı istenir.
- **Gerçek veri:** sahte veri, gömülü dizi, tarayıcı `localStorage`'ı sunucu verisi sayılmaz (tek oyunculu yerel mod hariç; o bilinen tasarım). Geçici sahte veri kullanılırsa "SAHTE VERİ" diye belirtilir. Veritabanı değişikliği `server/db.js` yolundan; elle tablo silme yok.
- **Gizli bilgi:** anahtar yalnız `server/.env`'de; kullanıcı anahtarı sohbete yapıştırırsa kullanmam, açığa çıktığını söyleyip yenilemesini öneririm. Commit öncesi `git diff --cached` ile gizli bilgi kontrolü.
- **Test ve doğrulama:** yeni özelliğe en az bir otomatik test; geçmeyen test varken "bitti" denmez, test silinip zayıflatılmaz. Arayüz değişince build edilmiş oyun yerel deneme sunucusunda gerçekten denenir (yenileyince kayıt duruyor mu, konsolda hata var mı, mobil genişlik) ve raporda ne denediğim yazılır; deneyemediysem nedeni söylenir.
- **Hata yönetimi:** her sunucu hatası loglanır (hangi istek, hangi oyuncu kimliği; şifre/token/anahtar yok), kullanıcıya anlaşılır mesaj gösterilir, boş `catch {}` yasak.
- **Git:** büyük değişiklik veya silmeden önce commit (geri dönüş noktası). Force push, geçmişi yeniden yazma, `.git` silme yasak. Onaysız büyük bölüm silip baştan yazma yok; gerekirse nedeni açıklanır, onay alınır, eskisi bir dalda saklanır. `..\adastra-realm-VANILLA-v1.34` klasörüne dokunulmaz.
- **Çalışma şekli:** büyük iş önce kısa plan + onay; aynı anda tek özellik (bitir, doğrula, commit'le); alt ajan açmadan önce sorulur; emin olmadığım kütüphane API'sini tahmin etmem, belgesine bakarım; kullanıcı "dur" derse commit'lenmemiş her şeyi listelerim.
- **İş sonu raporu:** ne yapıldı, nasıl doğrulandı, kullanıcının şimdi ne yapması gerekiyor. "Bitti" demeden önce: veri gerçekten kaydoluyor mu, `npm test` ve `npm run build` geçti mi, oyun denendi mi, gizli bilgi sızmadı mı, commit atıldı mı.
