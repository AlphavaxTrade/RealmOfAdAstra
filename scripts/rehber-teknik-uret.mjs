// Oyun Rehberi'nin "Teknik başvuru" bölümlerini OYUN MOTORUNDAN üretir ve public/rehber.html içine yazar.
// Kullanım: node scripts/rehber-teknik-uret.mjs            (rehber.html'i günceller)
//           node scripts/rehber-teknik-uret.mjs --kontrol  (yazmaz; dosya güncel değilse çıkış kodu 1 — tests/test_rehber_teknik.mjs)
//           node scripts/rehber-teknik-uret.mjs --konsol   (üretilen bloğu ekrana yazar)
// Neden betikle: bu bölümlerde yüzlerce sayı var (seviye bedelleri, silo, kota, kasa oranları...). Elle yazılırsa kural değişince
// sessizce yanlış kalır. Burada her sayı js/config.js ve oyun motorundan okunur; ayar değişince test (drift) kırılır, betik yeniden çalıştırılır.
// Metinler kullanıcıya (oyuncuya) yazılmıştır: sade Türkçe, formülün yanında düz cümleyle açıklaması ve örnek.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG: C } = await import('../js/config.js');
const { globalPool } = await import('../js/globalPool.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { DUNGEON_LEVELS } = await import('../js/bestiary.js');
const { WEEKLY_RULES: W, allocateWithdrawals, withdrawCapTokens } = await import('../server/economy.js');
const { levelWeight } = await import('../js/economy/ubi.js');
const { weightOf, capFraction, streakMultiplier } = await import('../js/economy/faucet.js');
const { PVP_RULES } = await import('../js/economy/pvp.js');

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEDEF = path.join(KOK, 'public', 'rehber.html');
const BASLA = '<!-- ============ TEKNİK BAŞVURU: BAŞLA (scripts/rehber-teknik-uret.mjs üretir; elle düzenleme) ============ -->';
const BITIS = '<!-- ============ TEKNİK BAŞVURU: BİTİŞ ============ -->';
const GRUP = 'Teknik başvuru';
const TARIH = '15 Ekim 2026';

const gs = new GameStateManager();
const U = C.URETIM_HAKKI;
const K6 = C.RESOURCE_KEYS;
const META = C.RESOURCE_META;
const BASE = C.BASE_PRODUCTION;
const ACILIS = Object.fromEntries(K6.map((k) => [k, C.AMM_CORRIDORS[k].defaultPriceAda]));
const AD = (k) => `${META[k].icon} ${META[k].name}`;

// ── Biçim yardımcıları ────────────────────────────────────────────────────
const n = (v) => (typeof v === 'string' ? v : Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 4, minimumFractionDigits: 0 }));
const sayi = (v, o = 0) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: o, minimumFractionDigits: 0 });
const yuzde = (oran, o = 1) => `%${sayi(oran * 100, o)}`;
const astra = (v, o = 2) => `${sayi(v, o)} ASTRA`;
const sure = (dk) => (dk < 120 ? `${sayi(dk)} dk` : `${sayi(dk / 60, 1)} sa`);
const tablo = (basliklar, satirlar) =>
  `<div class="tablo-kap"><table>\n    <tr>${basliklar.map((b) => `<th>${b}</th>`).join('')}</tr>\n` +
  satirlar.map((s) => `    <tr>${s.map((h) => `<td>${h}</td>`).join('')}</tr>`).join('\n') + '\n  </table></div>';
const kutu = (tur, simge, baslik, govde) => `<div class="kutu ${tur}" data-s="${simge}"><b>${baslik}</b>${govde}</div>`;
const ornek = (govde) => kutu('ornek', '🧮', 'Örnek', govde);
const dikkat = (baslik, govde) => kutu('dikkat', '⚠️', baslik, govde);
const ipucu = (govde) => kutu('ipucu', '💡', 'İpucu', govde);
const formul = (satirlar) => `<div class="kutu ozet-kutu" data-s="📐"><b>Formül</b>${satirlar.map((s) => `<p>${s}</p>`).join('')}</div>`;
const acilir = (baslik, govde) => `<details><summary>${baslik}</summary><div>${govde}</div></details>`;
const bolum = (id, ikon, baslik, ozet, govde) => `<section class="bolum" id="${id}" data-grup="${GRUP}" data-ikon="${ikon}">
  <div class="bolum-baslik"><div class="no">${ikon}</div><div><small>Teknik başvuru</small><h2>${baslik}</h2></div></div>
  <p class="ozet">${ozet}</p>
${govde}
</section>`;

// Seviye bedelleri vb. için oyun durumunu geçici ayarla (köylü bonusu 0: tablolar yalın değeri gösterir)
gs.state.village = { houses: 1, villagers: 0, labor: 0, lastGrowthAt: 0, starvingSince: 0 };
const seviyedeIken = (L, fn) => { const eski = gs.state.level; gs.state.level = L; try { return fn(); } finally { gs.state.level = eski; } };

const EN_UST = C.MAX_PLAYER_LEVEL;                  // 81
const GOSTER = [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 81];

// ═══════════════════════════════════════════════════════════════════════════
// 0) GİRİŞ
// ═══════════════════════════════════════════════════════════════════════════
const giris = bolum('t-giris', '📐', 'Bu bölüm: oyunun bütün sayıları', 'Bu oyun bir yatırım ve strateji oyunudur; ne kadar kazanıp ne kadar harcayacağını <b>baştan bilmek senin hakkındır</b>. Aşağıdaki bölümlerde her bedel, her limit ve her formül açıkça yazılı.',
`  <div class="kutu ozet-kutu" data-s="🧭"><b>Bu bölüm nasıl okunur?</b>
  <p>Her başlıkta önce <b>kural</b> (düz cümleyle), sonra <b>formül</b>, sonra <b>örnek</b> ve <b>tablolar</b> var. Uzun tablolar "aç / kapa" kutularının içindedir. Sayıların hepsi oyunun ayar dosyasından ve hesap kodundan <b>otomatik üretilmiştir</b>; elle yazılmış sayı yoktur.</p></div>
  <h3>Önce şunları bil</h3>
  <ul>
    <li><b>Sürüm:</b> ${C.GAME_VERSION} · <b>Hazırlanma:</b> ${TARIH}. Oyun şu an <b>deneme aşamasındadır</b>: sayılar test sonuçlarına göre ayarlanabilir. Bir ayar değişirse bu sayfa da yenilenir.</li>
    <li><b>Kesin güncel değer</b> her zaman oyunun ilgili ekranındadır (Kotalarım, Silo, Karakterim, Ekonomi panosu, Hazine). Bu sayfa <i>nasıl hesaplandığını</i> ve temel değerleri anlatır.</li>
    <li><b>ASTRA bedelleri "temel fiyattır".</b> Oyunda ASTRA'nın dolar değeri çok düşerse ya da yükselirse bedeller bir <b>fiyat çarpanıyla</b> ölçeklenir (<a href="#t-fiyat">fiyat çarpanı</a>). Çarpan 1,0 iken değerler aynen bu sayfadaki gibidir.</li>
    <li><b>Hammadde karşılıklı ASTRA değerleri</b> (örneğin "seviye bedeli 15,77 ASTRA") pazarın <b>açılış fiyatıyla</b> hesaplanmıştır. Pazar fiyatı oynadıkça bu ASTRA kısmı da oynar.</li>
    <li><b>Haftalık sıfırlama</b> her Pazartesi 00:01'dedir (Türkiye saati). "Günlük" sayaçlar da Türkiye saatiyle gece yarısı yenilenir.</li>
  </ul>
  <h3>Hızlı gitmek için</h3>
  <ul>
    <li><a href="#t-limitler">Bütün limitler tek tabloda</a> (günlük, haftalık, küresel)</li>
    <li><a href="#t-akis">ASTRA nereye gider</a> · <a href="#t-kasalar">Ödül kasaları</a> · <a href="#t-cekim">ASTRA çekimi</a> · <a href="#t-kilit">Kilitli bakiye</a></li>
    <li><a href="#t-uretim">Üretim ve sefer</a> · <a href="#t-kota">Günlük ve haftalık kota</a> · <a href="#t-otorite">Otorite ve Konsey</a></li>
    <li><a href="#t-seviye">Seviye atlama bedelleri</a> · <a href="#t-silo">Silo bedelleri</a> · <a href="#t-savas">Asker ve teçhizat</a> · <a href="#t-koy">Köy ve bot</a></li>
    <li><a href="#t-pazar">Pazar formülleri</a> · <a href="#t-kazanc">Zindan, Kolezyum, boss, çark, piyango</a> · <a href="#t-gelir">Temel gelir ve ücretsiz havuz</a> · <a href="#t-zincir">Zincir sınırları</a></li>
  </ul>`);

// ═══════════════════════════════════════════════════════════════════════════
// 1) BÜTÜN LİMİTLER
// ═══════════════════════════════════════════════════════════════════════════
const yolGorev = C.ONBOARDING_QUESTS.reduce((s, x) => s + x.rewardAda, 0);
const yolBolum = C.ONBOARDING_SECTIONS.reduce((s, x) => s + x.bonusAda, 0);
const yolToplam = yolGorev + yolBolum + C.ONBOARDING_FINAL.bonusAda;
const TB = C.TREASURY_WEEKLY_BUDGET;
const kasaOran = (id) => TB.RATES[id];
const limitler = bolum('t-limitler', '🚦', 'Bütün limitler tek tabloda', 'Oyunda "en fazla şu kadar" diyen her sınır: <b>günlük</b>, <b>haftalık</b> ve <b>küresel</b> (herkesin ortak) limitler. Ayrıntısı ilgili bölümde.',
`  <h3>⛏️ Hammadde çıkarma (kota)</h3>
${tablo(['Limit', 'Süre', 'Değer', 'Kimin için?'], [
  ['Kişisel haftalık çıkarma hakkın (Üretim Hakkı)', 'Haftalık', `Her hammadde için ayrı: temel üretim × çalışma süresi × kota katsayısı × senin ağırlığın. Başlangıç ayarlarında ağırlığı 1,0 olan oyuncuya buğdaydan ${sayi(Math.floor(BASE.wheat * 60 * 20 * 6 * C.URETIM_HAKKI.QPP_START))} birim`, 'Sana özel'],
  ['Günlük açılan pay', 'Günlük', `Haftalık hakkın her gün <b>1/7'si</b> açılır; kullanmadığın birikir (yalnız o hafta içinde)`, 'Sana özel'],
  ['Başkasının kullanmadığı hak', 'Günlük', `Kendi hakkın bitince, toplam çıkardığın miktar açılmış payının <b>${n(U.FAIRNESS_CAP)} katına</b> varana dek (ortak kapasitede boş yer varsa) çıkarabilirsin`, 'Sana özel'],
  ['Dünyanın toplam haftalık kapasitesi', 'Haftalık', 'Tüm aktif oyuncuların ağırlıkları toplamı × birim hak. Oyuncu arttıkça kapasite büyür, kişi başı hak değişmez', 'Küresel (herkes)'],
  ['Kota katsayısı (termostat)', 'Haftalık', `Başlangıç ${n(C.URETIM_HAKKI.QPP_START)}; her hafta fiyata göre en çok ±%${sayi(C.URETIM_HAKKI.TERMO_STEP * 100)}; en az ${n(C.URETIM_HAKKI.QPP_MIN)}, en çok ${n(C.URETIM_HAKKI.QPP_MAX)}`, 'Küresel (her hammadde ayrı)'],
  ['Stamina (enerji)', 'Sürekli', `En çok: ${n(C.MAX_STAMINA)} + ${n(C.STAMINA_MAX_PER_LEVEL)} × (seviye − 1) (ya da 6 alanı aynı anda başlatmaya yetecek kadar); her ${n(C.STAMINA_NATURAL_REGEN_INTERVAL)} saniyede 1 yenilenir`, 'Sana özel']
])}
  <h3>🏦 ASTRA çekimi</h3>
${tablo(['Limit', 'Süre', 'Değer', 'Kimin için?'], [
  ['En az çekim', 'Talep başına', `${sayi(1000)} ASTRA (sunucu ayarı)`, 'Sana özel'],
  ['Çekilebilir bakiye', 'Anlık', 'Yalnız <b>serbest</b> bakiyen (kilitli ve sponsorlu kısım çekilemez)', 'Sana özel'],
  ['Çekim zamanı', 'Haftalık', 'Talepler yalnız <b>Pazartesi 00:01</b>\'de, haftalık havuzdan karşılanır. Günlük çekim yoktur', 'Herkes'],
  ['Haftalık çekim havuzu', 'Haftalık', `Fiyatı en çok ${yuzde(W.maxPriceDrop, 0)} düşürecek miktar × fiyat katsayısı (k); ayrıca son 4 haftadaki dış alımın ${yuzde(W.externalBuyShare, 0)}'si; en az ${yuzde(W.capFloorShare, 0)} taban`, 'Küresel (herkes)'],
  ['Kişisel pay', 'Haftalık', 'Havuz × <b>senin katkı puanın ÷ herkesin toplam puanı</b>; kullanılmayan paylar isteyenlere kiralanır', 'Sana özel'],
  ['Çekim ücreti', 'Çekim başına', `${yuzde(W.fee, 0)} (fren açıkken ${yuzde(W.feeBrake, 0)}); ücretin yarısı temel gelire, yarısı yakıma. Kiraladığın hak için ${yuzde(W.rent)} kira`, 'Sana özel'],
  ['Sunucunun haftalık gönderim güvenlik tavanı', 'Haftalık', `${sayi(100000000)} ASTRA (sunucu ayarı; ayrıca oyun cüzdanının bakiyesini aşamaz)`, 'Küresel (herkes)'],
  ['Oyun Kasası çekimi', 'Anlık', 'Kesintisiz ve havuzsuz: kasaya sen koyduğun senin paran', 'Sana özel']
])}
  <h3>🏛️ Ödül kasaları</h3>
${tablo(['Limit', 'Süre', 'Değer', 'Kimin için?'], [
  ['Her kasanın haftalık ödeme bütçesi', 'Haftalık', `Kasa × oran × sağlık + son ${n(TB.INFLOW_WEEKS)} hafta girişinin ortalamasının ${yuzde(TB.INFLOW_SHARE, 0)}'ı. Oranlar: zindan ${yuzde(kasaOran('dungeon'))}, kolezyum ${yuzde(kasaOran('arena'))}, boss ${yuzde(kasaOran('worldBoss'))}, görev ${yuzde(kasaOran('quest'))}, karnaval ${yuzde(kasaOran('carnival'))}`, 'Küresel (herkes)'],
  ['Kişi başı haftalık pay tavanı', 'Haftalık', `Bütçe × ${n(TB.PERSON_CAP_MULT)} ÷ aktif oyuncu (en az ${n(TB.PERSON_CAP_MIN_ACTIVE)} sayılır)`, 'Sana özel'],
  ['Tek ödül', 'İşlem başı', `Kasanın en çok ${yuzde(C.TREASURY_SINGLE_DRAW_CAP, 0)}'si`, 'Herkes'],
  ['Kasa zayıfsa ödül küçülür', 'Anlık', `Kasa sağlığı &lt; 1 ise ödül sağlıkla çarpılır (en az ${yuzde(C.TREASURY_MIN_PAYOUT_RATIO, 0)} kalır)`, 'Herkes']
])}
  <h3>⚔️ Oyun içi günlük ve haftalık sınırlar</h3>
${tablo(['Limit', 'Süre', 'Değer', 'Kimin için?'], [
  ['Zindan: ödüllü giriş', 'Günlük', `${n(C.DUNGEON.DAILY_RUNS)} giriş (ilk giriş silahı aşındırmaz). 6. girişten sonra kapı harcı: katın ödülünün ${yuzde(C.DUNGEON.GATE_FEE_RATE, 0)}'si`, 'Sana özel'],
  ['Zindan: kişisel ASTRA tavanı', 'Günlük', `En az 5 ödüllü girişin değeri; ya da orduya harcadığın × ${n(C.DUNGEON.RETURN_SHARE)} ÷ ${n(C.DUNGEON.PAYBACK_DAYS)} (hangisi büyükse)`, 'Sana özel'],
  ['Zindan kasası günlük bütçesi', 'Günlük', `Kasanın ${yuzde(C.DUNGEON.DAILY_BUDGET_RATE, 2)}'sı`, 'Küresel (herkes)'],
  ['Kolezyum: maç', 'Günlük', `${n(C.COLOSSEUM.DAILY_MATCH_CAP)} maç; her maça ${n(C.COLOSSEUM.ENTRY_KEY_COST)} anahtar ve ${n(C.COLOSSEUM.ENTRY_STAMINA_COST)} stamina`, 'Sana özel'],
  ['Kolezyum: ödül', 'Günlük', `En çok ${n(C.COLOSSEUM.DAILY_REWARD_CAP_ASTRA)} ASTRA`, 'Sana özel'],
  ['Kolezyum: gerçek rakip sıralaması', 'Haftalık', `İlk 10 oyuncu; kolezyum kasasının ${yuzde(PVP_RULES.weeklyPoolShare, 0)}'si paylaşılır`, 'Küresel (herkes)'],
  ['Dünya bossu', 'Haftalık', `Pazar 18:00 (TSİ) tek savaş; havuz boss kasasının ${yuzde(C.WORLD_BOSS.WEEKLY_DISTRIBUTION_RATE, 0)}'ü`, 'Küresel (herkes)'],
  ['Çark: hammaddeyle çevirme', 'Günlük', `${n(C.CARNIVAL.WHEEL_RESOURCE_DAILY_LIMIT)} çevirme (ASTRA ile çevirmenin günlük sınırı yok)`, 'Sana özel'],
  ['Çark: kasa şartı', 'Anlık', `Karnaval kasasında en az ${n(C.CARNIVAL.WHEEL_MIN_CARNIVAL_BALANCE)} ASTRA yoksa çark kapanır`, 'Küresel (herkes)'],
  ['Piyango bileti', 'Haftalık', `Hesap başına en çok ${n(C.CARNIVAL.LOTTERY.MAX_TICKETS_PER_ACCOUNT)} bilet`, 'Sana özel'],
  ['Pazar: tek işlem', 'İşlem başı', `Havuzdaki malın en çok ${yuzde(C.AMM_SINGLE_TRADE_SHARE, 0)}'i`, 'Herkes'],
  ['Pazar: fiyat koridoru', 'Sürekli', 'Fiyat açılışın 0,5 katının altına inemez, 2,5 katının üstüne çıkamaz', 'Herkes'],
  ['İlan pazarı', 'Sürekli', `En çok ${n(C.ILAN_PAZARI.MAX_LISTINGS)} açık ilan; ilan ${n(C.ILAN_PAZARI.DAYS)} gün durur; komisyon ${yuzde(C.ILAN_PAZARI.FEE, 0)}`, 'Sana özel'],
  ['Temel gelir (UBI)', 'Haftalık', `${n(C.UBI_CONFIG.MIN_LEVEL)}. seviyeden itibaren; tek kişi haftalık kasanın en çok ${yuzde(C.UBI_CONFIG.MAX_SINGLE_CLAIM_SHARE, 0)}'ini alır`, 'Sana özel'],
  ['Ücretsiz oyuncu havuzu', 'Haftalık', `Görev kasasının en çok ${yuzde(C.FREE_PLAYER_POOL.WEEKLY_POOL_CAP)}'i; aylık piyasa değerinin ${yuzde(W.faucetMonthlyMcapShare, 0)}'i; kişi başı en çok ${n(W.faucetMaxUsdPerPlayer)} $/ay`, 'Küresel (herkes)'],
  ['Krallık Yolu görev ödülleri', 'Hesap başına', `Toplam ${sayi(yolToplam)} ASTRA (${C.ONBOARDING_QUESTS.length} görev ${sayi(yolGorev)} + ${C.ONBOARDING_SECTIONS.length} bölüm bonusu ${sayi(yolBolum)} + final ${sayi(C.ONBOARDING_FINAL.bonusAda)})`, 'Sana özel']
])}
  <h3>🏘️ Yapı ve kayıt sınırları</h3>
${tablo(['Limit', 'Süre', 'Değer', 'Kimin için?'], [
  ['Silo seviyesi', 'Kalıcı', `${n(C.WAREHOUSE.baseLevels)} seviye; ikinci oyun (Universe) açılana kadar en çok ${n(C.WAREHOUSE.universeGateLevel)}`, 'Sana özel'],
  ['Köy evi', 'Kalıcı', `En çok ${n(C.KOY.MAX_HOUSES)} ev ve ev sayısı hesap seviyeni geçemez; ev başına ${n(C.KOY.VILLAGERS_PER_HOUSE)} köylü`, 'Sana özel'],
  ['Asker sayısı', 'Kalıcı', 'Her asker 1 köylü ister (200 köylüye kadar); tek zindan savaşına en çok 18 asker', 'Sana özel'],
  ['Vatandaş sayısı (kapı)', 'Sürekli', `Başlangıç sınırı ${n(C.KAPI.START_LIMIT)}; aynı internet adresinden günde en çok ${n(C.KAPI.IP_DAILY_ADMIT)} yeni vatandaş; kayıt harcı ${n(C.KAPI.REGISTRATION_FEE_ADA)} ASTRA`, 'Küresel (herkes)'],
  ['Kasa sözleşmesi: tek ödeme', 'İşlem başı', 'Kasadaki paranın en çok %2\'si (kontratta sahibin bile üst sınırı %10)', 'Küresel (herkes)'],
  ['Kasa sözleşmesi: günlük toplam', 'Kayan 24 saat', 'Kasadaki paranın en çok %5\'i (kontratta sahibin bile üst sınırı %30)', 'Küresel (herkes)']
])}`);

// ═══════════════════════════════════════════════════════════════════════════
// 2) ASTRA AKIŞI
// ═══════════════════════════════════════════════════════════════════════════
const hazinePay = C.TOKEN_REWARD_POOL_RATE;
const KASA_AD = { dungeon: '🗺️ Zindan Ganimet Kasası', arena: '🏟️ Kolezyum Şampiyonluk Havuzu', worldBoss: '🌋 Dünya Bossu Ödül Havuzu', ammBuyback: '🛡️ Pazar Geri Alım Kasası', quest: '📜 Görev ve Ücretsiz Oyuncu Kasası', carnival: '🎪 Karnaval Ödül Havuzu', fatih: '👑 Fatih Kasası', konsey: '🏛️ Sirius Konseyi Kasası', universe: '🚀 Universe Tohum Rezervi (kilitli)' };
const seedToplam = Object.values(C.TREASURY_SEED).reduce((s, v) => s + v, 0);
const ammToplam = Object.values(C.AMM_SEED_ASTRA).reduce((s, v) => s + v, 0);
const akis = bolum('t-akis', '💸', 'ASTRA nereye gider? (harcama bölüşümü)', 'Oyunda harcadığın her ASTRA dört yere bölünür. Hiçbir ASTRA yok olmaz ve havadan yenisi basılmaz: ya yakılır ya da başka bir kasaya geçer.',
`  <h3>Her harcamanın bölüşümü</h3>
${tablo(['Pay', 'Oran', '1.000 ASTRA harcayınca', 'Ne olur?'], [
  ['🔥 Yakım', yuzde(C.TOKEN_BURN_RATE, 0), astra(1000 * C.TOKEN_BURN_RATE, 0), 'Kalıcı olarak silinir (haftalık hesaplaşmada ölü adrese gönderilir); arz azalır'],
  ['🎨 Yapımcı payı', yuzde(C.CREATOR_ROYALTY_RATE, 0), astra(1000 * C.CREATOR_ROYALTY_RATE, 0), 'Sabit yapımcı cüzdanına gider'],
  ['🤝 Temel gelir (UBI)', yuzde(C.UBI_POOL_RATE, 0), astra(1000 * C.UBI_POOL_RATE, 0), 'O haftanın temel gelir kasasında birikir; Pazartesi 00:01\'de oyunculara dağıtılır'],
  ['🏛️ Ödül kasaları', yuzde(hazinePay, 0), astra(1000 * hazinePay, 0), 'Aşağıdaki 8 kasaya bölünür']
])}
  <h3>Kasalara bölüşüm (hazine payının içinde)</h3>
  <p>Hazineye giden %${sayi(hazinePay * 100)}, sabit oranlarla sekiz kasaya dağılır. 1.000 ASTRA harcandığında her kasaya düşen miktar yanda yazılıdır:</p>
${tablo(['Kasa', 'Hazine payının %\'si', '1.000 ASTRA harcayınca', 'Ne ödeme yapar?'], [
  [KASA_AD.dungeon, yuzde(C.TREASURY_ALLOCATION.dungeon, 0), astra(1000 * hazinePay * C.TREASURY_ALLOCATION.dungeon, 1), 'Zindan zafer ödülleri'],
  [KASA_AD.arena, yuzde(C.TREASURY_ALLOCATION.arena, 0), astra(1000 * hazinePay * C.TREASURY_ALLOCATION.arena, 1), 'Kolezyum maç ödülü ve haftalık ilk 10'],
  [KASA_AD.worldBoss, yuzde(C.TREASURY_ALLOCATION.worldBoss, 0), astra(1000 * hazinePay * C.TREASURY_ALLOCATION.worldBoss, 1), 'Pazar günkü boss savaşı payları'],
  [KASA_AD.ammBuyback, yuzde(C.TREASURY_ALLOCATION.ammBuyback, 0), astra(1000 * hazinePay * C.TREASURY_ALLOCATION.ammBuyback, 1), 'Fiyat düşünce hammadde alıp yakar (oyuncuya ödeme yapmaz)'],
  [KASA_AD.quest, yuzde(C.TREASURY_ALLOCATION.quest, 0), astra(1000 * hazinePay * C.TREASURY_ALLOCATION.quest, 1), 'Krallık Yolu, promo kodları, ücretsiz oyuncu payı'],
  [KASA_AD.carnival, yuzde(C.TREASURY_ALLOCATION.carnival, 0), astra(1000 * hazinePay * C.TREASURY_ALLOCATION.carnival, 1), 'Çark ve piyango ödülleri'],
  [KASA_AD.fatih, yuzde(C.TREASURY_ALLOCATION.fatih, 0), astra(1000 * hazinePay * C.TREASURY_ALLOCATION.fatih, 1), '18. kat bossunu ilk kez yenene Fatih Ödülü'],
  [KASA_AD.konsey, yuzde(C.TREASURY_ALLOCATION.konsey, 0), astra(1000 * hazinePay * C.TREASURY_ALLOCATION.konsey, 1), 'Sirius Konseyi projeleri']
])}
  <div class="kutu ipucu" data-s="💡"><b>Bilmen gereken</b>
  <p>Bu bölüşüm <b>RealmRates</b> adlı bir zincir sözleşmesinden okunur; değiştirmek için <b>${24} saatlik bekleme</b> gerekir. Yani oranlar bir gecede değişemez, herkes önceden görür.</p></div>
  <h3>Başlangıç parası: ${sayi((seedToplam + ammToplam + C.CARNIVAL.LOTTERY.SEED_POOL_ADA) / 1e6)} milyon ASTRA nereye ayrıldı?</h3>
${tablo(['Yer', 'Başlangıç tohumu', 'Not'], [
  ['🏪 Pazar havuzları', astra(ammToplam, 0), `6 hammaddeye ${sayi(C.AMM_SEED_ASTRA.raw)}, parça/anahtar/kutu/parşömenlere ${sayi(ammToplam - C.AMM_SEED_ASTRA.raw)}`],
  ...Object.keys(C.TREASURY_SEED).map((id) => [KASA_AD[id], astra(C.TREASURY_SEED[id], 0), id === 'universe' ? 'İkinci oyun açılana kadar kimse kullanamaz' : id === 'fatih' ? 'Yalnız 18. kat bossu için' : id === 'konsey' ? 'Proje kasası' : 'Ödeme kasası']),
  ['🎟️ Piyango kasası', astra(C.CARNIVAL.LOTTERY.SEED_POOL_ADA, 0), 'Kazanan ödülünü buradan alır']
])}
  <p>Toplam: <b>${astra(seedToplam + ammToplam + C.CARNIVAL.LOTTERY.SEED_POOL_ADA, 0)}</b>.</p>
  ${ornek(`<p>Bir askere 205,12 ASTRA ödedin. <b>${sayi(205.12 * C.TOKEN_BURN_RATE, 2)}</b> yanar, <b>${sayi(205.12 * C.CREATOR_ROYALTY_RATE, 2)}</b> yapımcıya gider, <b>${sayi(205.12 * C.UBI_POOL_RATE, 2)}</b> temel gelir kasasına girer, kalan <b>${sayi(205.12 * hazinePay, 2)}</b> sekiz kasaya dağılır (zindan kasasına ${sayi(205.12 * hazinePay * C.TREASURY_ALLOCATION.dungeon, 2)} gibi).</p>`)}
  <div class="kutu dikkat" data-s="⚠️"><b>İki istisna</b>
  <p><b>Zindan kapı harcı</b> yüzde yüz zindan kasasına gider. <b>Çarkın ASTRA ile çevirme bedelinin ${yuzde(C.CARNIVAL.WHEEL_CARNIVAL_SHARE, 0)}'i</b> doğrudan karnaval kasasına, kalan ${yuzde(1 - C.CARNIVAL.WHEEL_CARNIVAL_SHARE, 0)}'i normal bölüşüme girer. Piyango biletlerinin ${yuzde(1 - C.CARNIVAL.LOTTERY.AMORTI_SHARE, 0)}'si piyango kasasına, ${yuzde(C.CARNIVAL.LOTTERY.AMORTI_SHARE, 0)}'si amorti kasasına gider.</p></div>`);

// ═══════════════════════════════════════════════════════════════════════════
// 3) ÜRETİM, SEFER, STAMINA
// ═══════════════════════════════════════════════════════════════════════════
const egim = (C.EXPEDITION_MAX_DURATION_MINUTES - C.EXPEDITION_MIN_DURATION_MINUTES) / (C.EXPEDITION_MAX_LEVEL - C.EXPEDITION_MIN_LEVEL);
const seviyeSatiri = (L) => {
  const dk = gs.getExpeditionDurationMinutes(L);
  const carpan = gs.getLevelProductionMultiplier(L);
  const verim = K6.map((k) => sayi(Math.max(10, Math.floor(BASE[k] * carpan * dk))));
  const xp = Math.max(5, Math.floor(35 * parseFloat((dk / 60).toFixed(2))));
  return [`<b>Lv.${L}</b>`, sure(dk), `×${sayi(carpan, 2)}`, ...verim, `${sayi(gs.getExpeditionStaminaCost(L))} ⚡`, `${sayi(gs.getMaxStamina(L))} ⚡`, sayi(xp)];
};
const uretimBasliklar = ['Seviye', 'Sefer süresi', 'Üretim çarpanı', ...K6.map((k) => `${META[k].icon} ${META[k].name}`), 'Sefer stamina', 'En çok stamina', 'Sefer XP\'si'];
const uretim = bolum('t-uretim', '⛏️', 'Üretim hızı, sefer süresi ve stamina', 'Bir seferin ne kadar sürdüğü, ne kadar ürün getirdiği ve ne kadar enerji harcadığı. Seviye atladıkça <b>dakikalık üretim biraz artar, sefer süresi çok uzar</b>.',
`  <h3>1) Dakikalık temel üretim</h3>
${tablo(['Hammadde', 'Dakikada', 'Saatte', 'Günde (24 saat)', 'Açılış fiyatı (1 birim)'], K6.map((k) => [AD(k), sayi(BASE[k], 2), sayi(BASE[k] * 60, 0), sayi(BASE[k] * 1440, 0), `${sayi(ACILIS[k], 4)} ASTRA`]))}
  <p>Bu değerler <b>1. seviyedeki</b> hızdır. Her seviye atlayışta üretim ${yuzde(C.LEVEL_PRODUCTION_BONUS_PER_LEVEL, 0)} artar; ayrıca köylü bonusu eklenir.</p>
${formul([
  `<b>Dakikalık üretim</b> = temel hız × (1 + ${n(C.LEVEL_PRODUCTION_BONUS_PER_LEVEL)} × (seviye − 1)) × (1 + köylü bonusu)`,
  `<b>Köylü bonusu</b> = her 10 köylü için +%${sayi(C.KOY.PROD_BONUS_PER_10 * 100)}, en çok +%${sayi(C.KOY.PROD_BONUS_MAX * 100)} (200 köylüde dolar). Şifa Bahçesi projesi bitince şifalı ota ayrıca +%5.`
])}
  ${ornek('<p>30. seviyede buğday: 9 × (1 + 0,01 × 29) = 9 × 1,29 = <b>11,61 / dakika</b>. 100 köylün varsa bonus +%10: 11,61 × 1,10 = <b>12,77 / dakika</b>.</p>')}
  <h3>2) Sefer süresi</h3>
${formul([
  `<b>Sefer süresi (dakika)</b> = ${n(C.EXPEDITION_MIN_DURATION_MINUTES)} + (seviye − 1) × ${sayi(egim, 2)}`,
  `1. seviyede ${n(C.EXPEDITION_MIN_DURATION_MINUTES)} dakika, 81. seviyede ${sayi(C.EXPEDITION_MAX_DURATION_MINUTES / 60)} saat. Nehir Köprüsü projesi bitince süreler %2 kısalır.`
])}
  <h3>3) Bir seferin getirisi ve maliyeti</h3>
${formul([
  '<b>Sefer ürünü</b> = dakikalık üretim × sefer süresi (en az 10 birim). Sefer başladığı andaki hız geçerlidir; sefer sırasında seviye atlamak geçmişe dönük artırmaz.',
  '<b>Sefer XP\'si</b> = 35 × sefer süresi (saat), en az 5.',
  `<b>Sefer stamina bedeli</b> = ${n(C.STAMINA_COST_PER_EXPEDITION)} × (sefer süresi ÷ 18 dk) × üretim çarpanı × ${n(1 - C.STAMINA_EFFICIENCY_PER_LEVEL)} <sup>(seviye − 1)</sup>`,
  `<b>En çok stamina</b> = ${n(C.MAX_STAMINA)} + ${n(C.STAMINA_MAX_PER_LEVEL)} × (seviye − 1); ama en az 6 alanı birden başlatmaya yetecek kadar (sefer bedelinin ${n(C.STAMINA_MAX_HEADROOM)} katı).`,
  `<b>Stamina yenilenmesi:</b> her ${n(C.STAMINA_NATURAL_REGEN_INTERVAL)} saniyede 1 (saatte 24). İstersen buğdayla doldurursun: 1 stamina = ${n(C.WHEAT_PER_STAMINA)} buğday.`
])}
  <p>Aşağıda seçili seviyeler görünüyor (köylü bonusu hariç, yalın değerler). Bütün seviyelerin tablosu bu başlığın en altında.</p>
${tablo(uretimBasliklar, GOSTER.map(seviyeSatiri))}
  ${acilir('📋 Bütün seviyeler (1 – 81)', tablo(uretimBasliklar, Array.from({ length: EN_UST }, (_, i) => seviyeSatiri(i + 1))))}
  ${ornek(`<p>1. seviyede 18 dakikalık bir sefer: odun ${sayi(Math.max(10, Math.floor(BASE.wood * 18)))}, demir ${sayi(Math.max(10, Math.floor(BASE.iron * 18)))}, buğday ${sayi(Math.max(10, Math.floor(BASE.wheat * 18)))} birim getirir ve ${sayi(gs.getExpeditionStaminaCost(1))} stamina yer. Altı alanı birden çalıştırsan ${sayi(6 * gs.getExpeditionStaminaCost(1))} stamina gider (başlangıç stamina çubuğu ${n(C.MAX_STAMINA)}).</p>`)}
  <h3>4) Aletler</h3>
  <p>Her hammaddenin kendi aleti vardır (orak, keski, balta, kömür kazması, kazma, ot bıçağı). Bir alet <b>${sayi(C.TOOLS.sickle.maxDurability)} dakika</b> dayanır; sefer sürdükçe dakikada 1 aşınır. Alet bozulursa o alandaki sefer durur. Onarım bedeli aşağıda "Köy ve bot" başlığında.</p>`);

// ═══════════════════════════════════════════════════════════════════════════
// 4) SEVİYE ATLAMA BEDELLERİ
// ═══════════════════════════════════════════════════════════════════════════
const seviyeBedeli = [];
for (let L = 1; L < EN_UST; L++) {
  seviyeBedeli.push(seviyedeIken(L, () => {
    const g = gs.getNextLevelRequirement();
    const kirpildi = Object.keys(g.uncappedCosts || {}).length > 0;
    return { L, g, kirpildi };
  }));
}
const bedelSatiri = ({ L, g, kirpildi }) => [`<b>Lv.${L} → ${L + 1}</b>`, sayi(g.xp), ...K6.map((k) => sayi(g.costs[k] || 0)), sayi(g.adAstra, 2), kirpildi ? '✂️ silo tavanı' : '—'];
const bedelBasliklar = ['Geçiş', 'Gereken XP', ...K6.map((k) => `${META[k].icon} ${META[k].name}`), 'ASTRA', 'Not'];
const toplamBedel = Object.fromEntries(K6.map((k) => [k, seviyeBedeli.reduce((s, r) => s + (r.g.costs[k] || 0), 0)]));
const toplamAstra = seviyeBedeli.reduce((s, r) => s + r.g.adAstra, 0);
const toplamXp = seviyeBedeli.reduce((s, r) => s + r.g.xp, 0);
const siloTavan = gs.getLevelUpCostCeiling();
const seviyeBolum = bolum('t-seviye', '⭐', 'Seviye atlama bedelleri (1 → 81)', 'Her seviye atlayışta <b>ne kadar XP, hangi hammaddeden ne kadar ve kaç ASTRA</b> gittiği. 80 geçişin hepsi aşağıda.',
`${formul([
  `<b>Toplam XP (seviye L'ye kadar)</b> = ${sayi(2520)} × ${sayi(1100)} × ((L − 1) ÷ ${EN_UST - 1}) <sup>2,2</sup>  → bir seviyeden sonrakine gereken XP, bu toplamın farkıdır (en az 60). Hedef: günde ~${sayi(2520)} XP ile 81. seviyeye yaklaşık 1.100 günde varılsın.`,
  '<b>Hammadde bedeli</b> = bir "XP döngüsü"nde altı alanda toplanan miktarın <b>yarısı</b>. Döngü sayısı = gereken XP ÷ (6 × sefer XP\'si); sefer XP\'si = 35 × sefer süresi (saat).',
  `<b>Silo tavanı:</b> hiçbir hammaddenin bedeli, ulaşılabilir en büyük silonun (12. seviye) kapasitesinin <b>${yuzde(C.LEVEL_UP_SILO_SHARE, 0)}'ini</b> geçemez. Bu tavanlar: ${K6.map((k) => `${META[k].icon} ${sayi(siloTavan[k])}`).join(' · ')}.`,
  '<b>ASTRA bedeli</b> = bu hammaddelerin o anki pazar değeri (tabloda açılış fiyatıyla).'
])}
  ${dikkat('Sık yapılan hata', '<p>Seviye atlamak için XP tek başına yetmez: bedeldeki <b>hammaddenin hepsi</b> ve ASTRA da siloda/cüzdanında olmalı. Bedel silonun alabileceğinden büyükse oyun sana "önce siloyu yükselt" der.</p>')}
  <h3>Toplamlar (1 → 81)</h3>
${tablo(['Kalem', 'Toplam'], [
  ['Gereken XP', sayi(toplamXp)],
  ...K6.map((k) => [AD(k), sayi(toplamBedel[k])]),
  ['ASTRA (açılış fiyatıyla)', astra(toplamAstra, 0)]
])}
  <p>Tablolar silo tavanına takılan yerlerde (✂️) hammaddeyi tavandan fazla istemez; bu yüzden orta seviyelerden sonra bedel <b>sabit kalır</b>.</p>
  <h3>Seçili seviyeler</h3>
${tablo(bedelBasliklar, GOSTER.filter((L) => L < EN_UST).map((L) => bedelSatiri(seviyeBedeli[L - 1])))}
  ${acilir('📋 Bütün geçişler (1 → 2 … 80 → 81)', tablo(bedelBasliklar, seviyeBedeli.map(bedelSatiri)))}
  ${ipucu('<p>Seviye atlayınca sefer süren uzar. Bu yüzden her seviyede biraz daha az sık, ama daha büyük sefer yaparsın; üretim <b>dakikalık</b> olarak yalnız %1 artar.</p>')}`);

// ═══════════════════════════════════════════════════════════════════════════
// 5) SİLO
// ═══════════════════════════════════════════════════════════════════════════
const siloSatiri = (L) => {
  const kap = gs.getWarehouseCapacity(L);
  const b = gs.getWarehouseUpgradeCost(L);
  const kilitli = L > C.WAREHOUSE.universeGateLevel;
  const bedel = b ? K6.map((k) => sayi(b.costs[k])).concat([sayi(b.adAstra, 2)]) : K6.map(() => '—').concat(['—']);
  return [`<b>${L}</b>${kilitli ? ' 🔒' : ''}`, ...K6.map((k) => sayi(kap[k])), sayi(kap.fragments), ...(L >= C.WAREHOUSE.baseLevels ? K6.map(() => '—').concat(['en üst']) : kilitli ? K6.map(() => '🔒').concat(['Universe']) : bedel)];
};
const siloBasliklar = ['Seviye', ...K6.map((k) => `${META[k].icon} ${META[k].name}`), '🧩 Parça', ...K6.map((k) => `Bedel ${META[k].icon}`), 'Bedel ASTRA'];
const siloUst = C.WAREHOUSE.universeGateLevel;
const siloToplam = Object.fromEntries(K6.map((k) => [k, 0]));
let siloAstra = 0;
for (let L = 1; L < siloUst; L++) { const b = gs.getWarehouseUpgradeCost(L); K6.forEach((k) => { siloToplam[k] += b.costs[k]; }); siloAstra += b.adAstra; }
const oran = (k) => Math.pow(C.WAREHOUSE.maxCapacities[k] / C.WAREHOUSE.initialCapacities[k], 1 / (C.WAREHOUSE.baseLevels - 1));
const silo = bolum('t-silo', '📦', 'Silo: kapasite ve yükseltme bedelleri', 'Her silo seviyesinde ne kadar mal saklayabildiğin ve bir üst seviye için <b>ne kadar hammadde ve ASTRA</b> harcayacağın.',
`${formul([
  `<b>Kapasite (seviye L)</b> = 1. seviye kapasite × (büyüme oranı) <sup>(L − 1)</sup>. Büyüme oranı her hammaddede farklıdır: son seviye kapasitesi ÷ ilk seviye kapasitesi'nin ${C.WAREHOUSE.baseLevels - 1}. kökü. Örnek: buğday ${sayi(C.WAREHOUSE.initialCapacities.wheat)} → ${sayi(C.WAREHOUSE.maxCapacities.wheat)}, aşama başına ×${sayi(oran('wheat'), 3)}.`,
  '<b>1. seviye silo = tek alanın 1 saatlik üretimi</b> (buğday 9 × 60 = 540, taş 6 × 60 = 360 …). Yani ilk silo yaklaşık üç 18 dakikalık seferin ürününü alır; ondan fazlası siloya sığmaz ve seferde bekler.',
  `<b>Parça kapasitesi</b> = ${n(C.WAREHOUSE.initialCapacities.fragments)} + ${n(C.WAREHOUSE.fragmentsPerLevel)} × (L − 1); son seviyede ${sayi(C.WAREHOUSE.maxCapacities.fragments)}.`,
  '<b>Yükseltme bedeli (L → L+1)</b> = her hammaddede <b>şimdiki kapasitenin yarısı</b> + bu miktarların pazar değeri kadar ASTRA.',
  '<b>Yükseltme şartı:</b> altı ambarın hepsi şimdiki kapasitenin en az %80\'i kadar dolu olmalı.',
  'Büyük Ambar Konsey projesi bitince herkesin silo kapasitesi %5 artar.'
])}
${tablo(siloBasliklar, Array.from({ length: C.WAREHOUSE.baseLevels }, (_, i) => siloSatiri(i + 1)))}
  <p>🔒 işaretli seviyeler ikinci oyun (Universe) açılana kadar kapalıdır. Üst seviyeler Universe'ten gelen malzeme isteyecektir.</p>
  <h3>1. seviyeden ${siloUst}. seviyeye toplam maliyet</h3>
${tablo(['Kalem', 'Toplam'], [...K6.map((k) => [AD(k), sayi(siloToplam[k])]), ['ASTRA (açılış fiyatıyla)', astra(siloAstra, 0)]])}
  ${ornek(`<p>Silo 3 → 4: buğday kapasiten ${sayi(gs.getWarehouseCapacity(3).wheat)}; bedel buğdayda ${sayi(gs.getWarehouseUpgradeCost(3).costs.wheat)} (yarısı) ve ${sayi(gs.getWarehouseUpgradeCost(3).adAstra, 2)} ASTRA. Şartı sağlamak için altı ambarın da kapasitesinin %80'ini doldurman gerekir: buğday ${sayi(Math.round(gs.getWarehouseCapacity(3).wheat * 0.8))} ve diğerleri.</p>`)}`);

// ═══════════════════════════════════════════════════════════════════════════
// 6) KOTA (ÜRETİM HAKKI)
// ═══════════════════════════════════════════════════════════════════════════
const hakParam = (qpp, otorite) => ({ qpp: Object.fromEntries(K6.map((k) => [k, qpp])), adminMult: 1, otoriteLevel: otorite, sumWeight: 1, priceRatio: {} });
const haftalikHak = (k, qpp = U.QPP_START, otorite = 0) => Math.floor(globalPool.weeklyRightPerWeight(k, hakParam(qpp, otorite)) + 1e-6);
const hakDegeri = (qpp, otorite) => K6.reduce((s, k) => s + haftalikHak(k, qpp, otorite) * ACILIS[k], 0);
const gunler = ['1. gün (Pzt)', '2. gün (Sal)', '3. gün (Çar)', '4. gün (Per)', '5. gün (Cum)', '6. gün (Cmt)', '7. gün (Paz)'];
const kota = bolum('t-kota', '📊', 'Kota: günlük ve haftalık çıkarma limitleri', 'Hammaddeyi sınırsız çıkaramazsın: her hafta herkesin çıkarabileceği bir <b>ortak kapasite</b> ve senin payın vardır. Sınır, hammaddelerin kıt kalması (ve fiyatın çökmemesi) içindir.',
`  <h3>Kural, sade anlatımla</h3>
  <ol class="adimlar">
    <li><b>Dünyanın haftalık kapasitesi</b> her hammadde için ayrı hesaplanır. Oyuncu sayısı arttıkça kapasite de büyür; yani <b>kişi başına düşen hak oyuncu sayısına bağlı değildir</b>.</li>
    <li><b>Senin haftalık hakkın</b> = birim hak × senin <b>ağırlığın</b>. Ağırlık; seviyene, geçen haftaki katkı kademene ve ne kadar düzenli oynadığına bağlıdır.</li>
    <li>Hakkın <b>her gün 1/7'si açılır</b> ve kullanmadığın o hafta içinde birikir. Pazartesi 00:01'de hepsi sıfırlanır.</li>
    <li>Hakkın bitince, başkalarının kullanmadığı pay varsa <b>açılmış payının ${n(U.FAIRNESS_CAP)} katına kadar</b> çıkarabilirsin.</li>
  </ol>
${formul([
  '<b>Birim hak (hammadde başına, haftalık)</b> = temel hız (dakika) × çalışma dakikası × kota katsayısı × Otorite çarpanı × yönetici çarpanı',
  `<b>Çalışma dakikası</b> = (günlük çalışma saati × 60) × haftada çalışılan gün. Otorite yokken: ${n(C.OTORITE.HOURS_BASE)} saat × ${n(C.OTORITE.DAYS_BASE)} gün = ${sayi(C.OTORITE.HOURS_BASE * 60 * C.OTORITE.DAYS_BASE)} dakika.`,
  `<b>Senin hakkın</b> = birim hak × ağırlığın.   <b>Dünya kapasitesi</b> = birim hak × tüm aktif oyuncuların ağırlıkları toplamı.`,
  `<b>Ağırlık</b> = seviye faktörü × katkı kademesi çarpanı × aktiflik. Seviye faktörü = en çok ${n(U.LEVEL_WEIGHT_MAX)} olmak üzere 1 + ${n(U.LEVEL_WEIGHT_PER_LEVEL)} × seviye; aktiflik = son 7 günün kaçında sefer topladığın ÷ 7 (en az ${n(U.ACTIVITY_MIN)}; ilk hafta tam sayılır).`,
  `<b>Adalet tavanı:</b> hiç kimsenin ağırlığı, dünyadaki en düşük aktif ağırlığın ${n(U.FAIRNESS_CAP)} katını geçemez.`
])}
  <h3>Başlangıç ayarlarında bir "birim hak"</h3>
  <p>Kota katsayısı ${n(U.QPP_START)}, Otorite 0. seviye, ağırlık 1,0 iken haftalık hak ve açılış fiyatıyla ASTRA karşılığı:</p>
${tablo(['Hammadde', 'Haftalık hak', 'Her gün açılan (1/7)', 'Açılış fiyatıyla değeri'], [
  ...K6.map((k) => [AD(k), sayi(haftalikHak(k)), sayi(haftalikHak(k) / 7), astra(haftalikHak(k) * ACILIS[k], 1)]),
  ['<b>Toplam</b>', '', '', `<b>${astra(hakDegeri(U.QPP_START, 0), 0)}</b>`]
])}
  <p>Bu değerin <b>hepsini toplayıp pazara satmak</b> mümkün değildir: satışta %2 komisyon, %2 hammadde yakımı ve fiyat düşüşü (kayma) vardır; üstelik hammaddenin bir kısmı seviye atlamak, teçhizat, silo gibi yerlere gider.</p>
  <h3>Dünyanın haftalık kapasitesi oyuncu sayısıyla büyür</h3>
  <p>Ağırlıklar toplamı = oyuncu sayısı × ortalama ağırlık. Ortalama ağırlığı 1,0 varsayarsak (kota katsayısı ${n(U.QPP_START)}, Otorite 0) dünyanın haftalık kapasitesi:</p>
${tablo(['Oyuncu sayısı', ...K6.map((k) => `${META[k].icon} ${META[k].name}`)], [1, 50, 100, 500, 1000].map((N) => [`<b>${sayi(N)}</b>`, ...K6.map((k) => sayi(haftalikHak(k) * N))]))}
  <p>Kişi başı hak değişmez; yani kalabalıkta herkes için pay küçülmez. Küçülen şey fiyattır: çok oyuncu çok hammadde üretir, termostat fiyat düşerse kota katsayısını azaltır.</p>
  <h3>Günlük açılma</h3>
  <p>Buğdayda ${sayi(haftalikHak('wheat'))} birimlik haftalık hak için açılan toplam:</p>
${tablo(['Gün', 'O güne kadar açılmış toplam', 'Yüzde'], gunler.map((g, i) => [g, sayi(Math.floor(haftalikHak('wheat') * (i + 1) / 7)), `%${sayi((i + 1) / 7 * 100, 0)}`]))}
  <h3>Kota katsayısı (termostat) ve Otorite ne yapar?</h3>
  <p>Aşağıdaki tablo, ağırlığı 1,0 olan bir oyuncunun <b>6 hammaddelik toplam haftalık hakkının açılış fiyatıyla değerini</b> gösterir. Satırlar kota katsayısı, sütunlar Otorite seviyesidir:</p>
${tablo(['Kota katsayısı', ...[0, 5, 10, 15, 20].map((o) => `Otorite ${o}`)], [U.QPP_MIN, 0.2, U.QPP_START, 0.7, U.QPP_MAX].map((q) => [`<b>${n(q)}</b>`, ...[0, 5, 10, 15, 20].map((o) => astra(hakDegeri(q, o), 0))]))}
  <ul>
    <li><b>Termostat:</b> her hafta bir hammaddenin fiyatı açılış fiyatının <b>üstündeyse</b> o hammaddenin kota katsayısı %${sayi(U.TERMO_STEP * 100)} artar (daha çok çıkarılsın); <b>altındaysa</b> %${sayi(U.TERMO_STEP * 100)} azalır. Böylece fiyat çökmez.</li>
    <li><b>Otorite:</b> Konsey'in ortak inşaatıdır; her seviye herkesin hakkını %${sayi(C.OTORITE.PER_LEVEL_BONUS * 100)} artırır, çalışma süresini uzatır (<a href="#t-otorite">bedelleri</a>).</li>
    <li><b>Yakım kotayı da düşürür:</b> harcanan (yakılan) hammadde o haftanın dünya kapasitesinden <b>kalıcı olarak</b> düşer; yani çok harcayan herkesin kotasını biraz kısar.</li>
    <li><b>Konsey ortak kasası:</b> çıkardığın miktarın ayrıca %${sayi(C.OTORITE.COMMON_CHEST_RATE * 100)}'i dünya kapasitesinden alınıp Konsey stoğuna girer (senin hakkından da sayılır).</li>
  </ul>
  <h3>Ağırlık: örnek değerler</h3>
${tablo(['Seviye', 'Seviye faktörü', 'Katkı kademesi', 'Kademe çarpanı', 'Aktiflik', 'Ağırlık'], [
  [1, 'Yok', 1.0, 1.0],
  [10, 'Bronz', 1.05, 1.0],
  [20, 'Gümüş', 1.10, 1.0],
  [30, 'Altın', 1.20, 1.0],
  [40, 'Platin', 1.35, 1.0],
  [50, 'Elmas', 1.50, 1.0],
  [30, 'Altın', 1.20, 0.5],
  [20, 'Yok', 1.0, 0.25]
].map(([L, kad, kc, akt]) => {
  const sf = Math.min(U.LEVEL_WEIGHT_MAX, 1 + U.LEVEL_WEIGHT_PER_LEVEL * L);
  return [`Lv.${L}`, sayi(sf, 3), kad, `×${sayi(kc, 2)}`, `%${sayi(akt * 100, 0)}`, `<b>${sayi(sf * kc * akt, 3)}</b>`];
}))}
  <p>Katkı kademeleri <b>geçen haftanın katkı puanına</b> göre belirlenir: ${U.TIERS.map((t) => `${t.name} ≥ ${sayi(t.min)} (×${sayi(t.mult, 2)})`).join(', ')}. Eşikler fiyat çarpanıyla ölçeklenir. Katkı puanı: harcadığın her ASTRA 1 puan; yakılan ya da net satılan hammaddenin değeri 0,5 puan.</p>
  ${ornek(`<p>Seviye 20, Gümüş kademe, haftanın her günü oynuyorsun: ağırlık = ${sayi(Math.min(2, 1 + 0.025 * 20), 2)} × 1,10 × 1,0 = <b>${sayi(Math.min(2, 1 + 0.025 * 20) * 1.1, 3)}</b>. Haftalık buğday hakkın: ${sayi(haftalikHak('wheat'))} × ${sayi(Math.min(2, 1 + 0.025 * 20) * 1.1, 3)} = <b>${sayi(haftalikHak('wheat') * Math.min(2, 1 + 0.025 * 20) * 1.1)}</b> birim; her gün bunun 1/7'si açılır.</p>`)}`);

// ═══════════════════════════════════════════════════════════════════════════
// 7) OTORİTE VE KONSEY
// ═══════════════════════════════════════════════════════════════════════════
const O = C.OTORITE;
const otoriteSatiri = (L) => {
  const units = Math.round(O.BASE_UNITS * Math.pow(O.LEVEL_MULT, L));
  const gidis = L < O.MAX_LEVEL;
  return [`<b>${L} → ${L + 1}</b>`, gidis ? sayi(units) : '—', `${sayi(globalPool.otoriteWork(L + 1).hours, 1)} sa × ${sayi(globalPool.otoriteWork(L + 1).days, 2)} gün`, `×${sayi(globalPool.otoriteWork(L + 1).mult, 2)}`, `×${sayi((globalPool.otoriteWork(L + 1).minutes * globalPool.otoriteWork(L + 1).mult) / (globalPool.otoriteWork(0).minutes), 2)}`];
};
const konsey = bolum('t-otorite', '🏛️', 'Otorite ve Konsey projeleri: maliyetler', 'Sirius Konseyi herkesin ortak inşaatıdır. <b>Otorite</b> herkesin kotasını büyütür, <b>projeler</b> kalıcı bonus verir. Malzemeyi tek tek oyuncular verir (ASTRA gerekmez).',
`  <h3>Madencilik Otoritesi (20 seviye)</h3>
${formul([
  `<b>Bir seviyenin bedeli (birim)</b> = ${sayi(O.BASE_UNITS)} × ${n(O.LEVEL_MULT)} <sup>(seviye)</sup>. 0 → 1 için ${sayi(O.BASE_UNITS)} birim, her seviyede ${n(O.LEVEL_MULT)} kat.`,
  `<b>Karışım:</b> ${K6.map((k) => `${META[k].icon} ${META[k].name} ${yuzde(O.MIX[k], 0)}`).join(', ')}. Her hammaddenin kendi payı ayrı ayrı dolmalı.`,
  `<b>Etkisi:</b> her seviye herkesin hakkını +%${sayi(O.PER_LEVEL_BONUS * 100)} büyütür; günlük çalışma süresi ${n(O.HOURS_BASE)} saatten (${n(O.HOURS_PER_LEVEL)} saat/seviye) en çok 24'e, haftalık gün sayısı ${n(O.DAYS_BASE)}'dan (${n(O.DAYS_PER_LEVEL)} gün/seviye) en çok 7'ye çıkar.`,
  `<b>Otomatik katkı:</b> çıkarılan her hammaddenin %${sayi(O.COMMON_CHEST_RATE * 100)}'i Konsey stoğuna girer; stok her hammadde için yarı yarıya Otorite'ye ve etkin projeye kendiliğinden aktarılır.`
])}
${tablo(['Seviye geçişi', 'Toplam birim', 'Çalışma süresi', 'Herkesin hak çarpanı', 'Toplam kapasite (0. seviyeye göre)'], Array.from({ length: O.MAX_LEVEL }, (_, L) => otoriteSatiri(L)))}
  <p>Karışım örneği (0 → 1 seviyesi, ${sayi(O.BASE_UNITS)} birim): ${K6.map((k) => `${META[k].icon} ${META[k].name} ${sayi(Math.round(O.BASE_UNITS * O.MIX[k]))}`).join(' · ')}.</p>
  <h3>Konsey projeleri (5 proje, sırayla)</h3>
  <p>Her proje <b>${sayi(C.KONSEY_PROJELERI[0].units)} birim hammadde</b> ve <b>${sayi(C.KONSEY_PROJELERI[0].labor)} emek puanı</b> ister. Emek puanını köylülerin üretir (köylü başına günde ${n(C.KOY.LABOR_PER_VILLAGER_DAY)} puan). Biri açık olur; bitince sıradaki başlar.</p>
${tablo(['Proje', 'Etkisi', 'Karışım'], C.KONSEY_PROJELERI.map((p) => [`${p.icon} ${p.name}`, p.desc, K6.filter((k) => p.mix[k]).map((k) => `${META[k].icon} ${yuzde(p.mix[k], 0)}`).join(' · ')]))}
  ${ornek('<p>Bir projenin 6.000.000 birimi, 1.000 oyuncu her gün 1.000 birim verirse 6 günde dolar. 100 oyuncuda 60 gün sürer. Bu yüzden Konsey stoğunun otomatik aktarımı önemlidir: çıkarılan her hammaddenin %5\'i kendiliğinden buraya gider.</p>')}`);

// ═══════════════════════════════════════════════════════════════════════════
// 8) KİLİTLİ BAKİYE
// ═══════════════════════════════════════════════════════════════════════════
const LB = C.LOCKED_BALANCE;
const kilitHaftaIdle = (l, h) => l * Math.pow(1 - LB.WEEKLY_UNLOCK_BASE, h);
const kilitHaftaAktif = (l, h) => l * Math.pow((1 - LB.WEEKLY_UNLOCK_BASE) * Math.pow(1 - LB.WEEKLY_UNLOCK_ACTIVE / 7, 7), h);
const kilit = bolum('t-kilit', '🔒', 'Kilitli bakiye: ne zaman açılır?', 'Kazandığın ASTRA\'nın <b>çoğu kilitli</b> gelir: oyunda harcayabilirsin ama çekemezsin. Kilit üç şekilde açılır: harcayarak, zamanla ve her gün oyuna girerek.',
`${formul([
  `<b>Kazanç:</b> oyunda kazanılan ASTRA'nın <b>%${sayi(LB.FREE_SHARE * 100)}'i serbest</b>, <b>%${sayi((1 - LB.FREE_SHARE) * 100)}'i kilitli</b> gelir.`,
  `<b>Harcama:</b> önce kilitli bakiye harcanır; ayrıca harcadığın tutarın <b>%${sayi(LB.UNLOCK_ON_SPEND * 100)}'i kadar</b> kilit daha açılır (serbest olur).`,
  `<b>Zaman:</b> kilitli bakiyenin her hafta <b>%${sayi(LB.WEEKLY_UNLOCK_BASE * 100)}'i</b> kendiliğinden açılır (geçen süreye orantılı, günlük kesirle).`,
  `<b>Aktiflik:</b> o gün oyuna girdiysen ek olarak günde %${sayi(LB.WEEKLY_UNLOCK_ACTIVE / 7 * 100, 2)} daha açılır. Her gün girersen bu haftada <b>%${sayi(LB.WEEKLY_UNLOCK_ACTIVE * 100, 1)}</b> ek eder; zamanla birlikte toplam yaklaşık %${sayi((1 - (1 - LB.WEEKLY_UNLOCK_BASE) * Math.pow(1 - LB.WEEKLY_UNLOCK_ACTIVE / 7, 7)) * 100, 1)}/hafta.`,
  'Fiyat dalgalanırsa kilit açılma tabanı fiyat katsayısı (k) ile ölçeklenir (0,5 – 1,5).'
])}
  <h3>1.000 kilitli ASTRA hiç harcamasan kaç haftada açılır?</h3>
${tablo(['Hafta', 'Hiç girmezsen kalan kilitli', 'Her gün girersen kalan kilitli', 'Her gün girersen açılan toplam'], [1, 2, 4, 8, 12, 26, 52].map((h) => [`${h}. hafta`, sayi(kilitHaftaIdle(1000, h), 0), sayi(kilitHaftaAktif(1000, h), 0), sayi(1000 - kilitHaftaAktif(1000, h), 0)]))}
  <p>Yani harcamadan yalnız zamana güvenirsen kilidin yarısı <b>yaklaşık ${sayi(Math.log(0.5) / Math.log((1 - LB.WEEKLY_UNLOCK_BASE) * Math.pow(1 - LB.WEEKLY_UNLOCK_ACTIVE / 7, 7)), 0)}</b> haftada (her gün girersen) açılır. Oyunda harcamak bunu çok hızlandırır.</p>
  ${ornek(`<p>Zindandan <b>100 ASTRA</b> kazandın: 20 serbest, 80 kilitli. Sonra bir yükseltme için <b>50 ASTRA</b> harcadın: 50'si kilitliden düşer (kilitli 80 → 30), üstüne harcamanın %20'si olan <b>10 ASTRA</b>'nın kilidi daha açılır (kilitli 30 → 20, serbest 20 → 30). (Harcama her zaman önce kilitli bakiyeden yapılır.)</p>`)}
  <div class="kutu dikkat" data-s="⚠️"><b>Pazardan alınan hammaddeye özel kural</b>
  <p>Kilitli ASTRA ile hammadde alıp pazarda geri satarak kilidi açamazsın: alımda kilit yalnız pazarın aldığı komisyon ve yakım payı kadar açılır, geri satışta o kısım yine kilitli döner. Aynı hammaddeyi alıp satmak katkı puanı da getirmez.</p></div>
  <p>Oyundan kazandığın <b>her</b> ASTRA bu kuralla (%${sayi(LB.FREE_SHARE * 100)} serbest) gelir: zindan, kolezyum, boss, çark, piyango, Krallık Yolu görevleri, Fatih Ödülü ve <b>pazara hammadde satınca aldığın ASTRA</b> da. <b>Ücretsiz oyuncu havuzu payı ve promosyon kodu ödülleri ise tamamen kilitli</b> gelir.</p>`);

// ═══════════════════════════════════════════════════════════════════════════
// 9) ASTRA ÇEKİMİ
// ═══════════════════════════════════════════════════════════════════════════
const ornekCap = 1000000;
const ornekSonuc = allocateWithdrawals([
  { id: 'A', requested: 800000, score: 600 },
  { id: 'B', requested: 100000, score: 300 },
  { id: 'C', requested: 0, score: 100 }
], ornekCap);
const satirOrnek = (id, ad) => { const r = ornekSonuc.rows.find((x) => x.id === id); return [ad, sayi(r.requested), sayi(r.own), sayi(r.granted), sayi(r.extra), sayi(r.fee), sayi(r.rent), sayi(r.net)]; };
const kirasi = (id) => { const p = ornekSonuc.rentPayouts.find((x) => x.id === id); return p ? sayi(p.amount) : '0'; };
const cekim = bolum('t-cekim', '🏦', 'ASTRA çekimi: haftalık, küresel limitler', 'ASTRA\'yı oyundan cüzdanına <b>haftada bir</b>, <b>ortak bir havuzdan</b> çekersin. Havuz, çekilen ASTRA piyasada satılsa fiyatı çok düşürmeyecek kadar küçük tutulur. Böylece kimse "çıkış kapısında" ezilmez ve token değeri korunur.',
`  <h3>Adım adım</h3>
  <ol class="adimlar">
    <li><b>Şartlar:</b> e-postan doğrulanmış, hesabına cüzdan bağlı, Muhafız Mührü açıksa kod girilmiş olmalı. En az ${sayi(1000)} ASTRA talep edebilirsin ve yalnız <b>serbest</b> bakiyenden.</li>
    <li><b>Talep:</b> tutar bakiyenden düşer ve sıraya girer; istersen Pazartesi'den önce iptal edip geri alırsın.</li>
    <li><b>Hesaplaşma:</b> her Pazartesi 00:01'de (TSİ) haftalık havuz, katkı puanlarına göre herkesin payına bölünür. Payına sığmayan talep <b>bakiyene geri döner</b>; kayıp olmaz.</li>
    <li><b>Ödeme:</b> net tutar cüzdanına gönderilir (ücret ve kira düşülmüş).</li>
  </ol>
  <h3>Haftalık havuz nasıl hesaplanır?</h3>
${formul([
  `<b>Fiyat tavanı</b> = fiyatı en çok ${yuzde(W.maxPriceDrop, 0)} düşürecek token miktarı. Borsaya geçmeden önce (bağlanma eğrisinde): arz × (1 − √(1 − ${n(W.maxPriceDrop)})) = arzın %${sayi((1 - Math.sqrt(1 - W.maxPriceDrop)) * 100, 3)}'i. Borsada: havuzdaki token × (1 ÷ √(1 − ${n(W.maxPriceDrop)}) − 1) = havuzun %${sayi((1 / Math.sqrt(1 - W.maxPriceDrop) - 1) * 100, 3)}'i.`,
  `<b>Dış alım tavanı</b> = son ${n(W.externalWindowDays)} gündeki piyasadan net token alımı (ve trade sitesinden gelen pay) × ${n(W.externalBuyShare)}.`,
  `<b>Haftalık havuz</b> = en büyüğü( fiyat tavanı × ${n(W.capFloorShare)} ,  en küçüğü( fiyat tavanı × k ,  dış alım tavanı ) ).  <i>k</i> = güncel piyasa değeri ÷ 30 günlük zirve (${n(W.kMin)} – ${n(W.kMax)} arası).`,
  `Ayrıca sunucu ayarı haftalık gönderim tavanı (varsayılan ${sayi(100000000)} ASTRA) ve oyun cüzdanındaki bakiye havuzu geçemez.`,
  `<b>Kişisel pay</b> = havuz × (senin haftalık katkı puanın ÷ herkesin toplam katkı puanı).`
])}
  <h3>Ücret ve "hak kirası"</h3>
${tablo(['Kalem', 'Oran', 'Ne olur?'], [
  ['Çekim ücreti', yuzde(W.fee, 0), 'Çekilen miktardan kesilir. Yarısı haftalık temel gelire, yarısı yakıma gider'],
  ['Fren açıkken ücret', yuzde(W.feeBrake, 0), 'Piyasa değeri sert düşünce ücret iki katına çıkar'],
  ['Hak kirası', yuzde(W.rent), 'Kendi payından fazla çekersen, fazla çektiğin miktarın bu kadarı payını kullanmayanlara kira olarak gider']
])}
  <h3>Fren (piyasa düşerken koruma)</h3>
  <ul>
    <li><b>Açılır:</b> piyasa değerinin son 3 günlük ortalaması, 30 günlük zirvenin %${sayi(W.brakeOnRatio * 100)}'inin altına inerse.</li>
    <li><b>Kapanır:</b> zirvenin %${sayi(W.brakeOffRatio * 100)}'ine dönerse ya da ${n(W.brakeQuietDays)} gün yeni dip yapılmazsa.</li>
    <li><b>Açıkken:</b> çekim ücreti ${yuzde(W.feeBrake, 0)} olur ve her kasanın haftada %${sayi(W.defenseBurnWeekly * 100)}'i yakılır (fiyat savunması).</li>
  </ul>
  <h3>Sayılarla örnek</h3>
  <p>Bu hafta havuz <b>${sayi(ornekCap)} ASTRA</b> olsun. Üç oyuncu: A (katkı puanı 600, <b>800.000</b> çekmek istiyor), B (puan 300, 100.000 istiyor), C (puan 100, hiç çekmiyor). Toplam puan 1.000 olduğu için payları 600.000 / 300.000 / 100.000'dir.</p>
${tablo(['Oyuncu', 'İstediği', 'Kendi payı', 'Payından aldığı', 'Kiraladığı ek', 'Ücret (%3)', 'Kira (%1,5)', 'Eline geçen'], [satirOrnek('A', 'A'), satirOrnek('B', 'B'), satirOrnek('C', 'C')])}
  <p>A payından fazla istedi: B'nin kullanmadığı ${sayi(ornekSonuc.rows.find((x) => x.id === 'B').unused)} ve C'nin ${sayi(ornekSonuc.rows.find((x) => x.id === 'C').unused)} payından ${sayi(ornekSonuc.rows.find((x) => x.id === 'A').extra)} kiraladı. A'nın ödediği ${sayi(ornekSonuc.rows.find((x) => x.id === 'A').rent)} kira, payını kullanmayanlara dağıldı: B ${kirasi('B')}, C ${kirasi('C')} ASTRA. Toplam ücret ${sayi(ornekSonuc.totals.fee)}: yarısı (${sayi(ornekSonuc.totals.feeToUbi)}) temel gelire, yarısı (${sayi(ornekSonuc.totals.feeBurn)}) yakıma.</p>
  <h3>Oyun Kasası çekimi: bu havuza girmez</h3>
  <p>Her hesaba, sunucunun yönettiği küçük bir <b>Oyun Kasası</b> adresi açılır. Sen yokken çalışan işler (bot, iyileştirme, onarım) buradan ödenir. Kasaya <b>sen koyduğun</b> ASTRA ve AVAX'ı istediğin an, ücret ve havuz olmadan, bağlı cüzdanına geri çekebilirsin. Kazanılmış ASTRA kasaya aktarılamaz (kesinti kaçışı olmasın diye). Kasadaki paranın "günlük ortalama harcamanın 30 katı"nı (en az 20.000 ASTRA) aşan kısmı otomatik cüzdanına iade edilir.</p>
  ${dikkat('Neden "haftada bir ve havuzdan"?', '<p>Tüm oyuncular aynı gün hepsini çekmeye kalksa fiyat çökerdi. Havuz, her hafta çekimin fiyatı en çok %2 düşüreceği büyüklüğe ayarlandığı için herkes çekebilir ve piyasa dayanır. Çekmediğin pay kaybolmaz; kullanmayana kira olarak döner.</p>')}`);

// ═══════════════════════════════════════════════════════════════════════════
// 10) PAZAR (AMM)
// ═══════════════════════════════════════════════════════════════════════════
const havuz = (k) => ammMarket.pools[k];
const w1000 = havuz('wood');
const satNet = 1000 * (1 - C.AMM_RESOURCE_FEE_RATE);
const satBrut = (w1000.adAstraReserve * satNet) / (w1000.resourceReserve + satNet);
const satKom = satBrut * C.AMM_FEE_RATE;
const alBrut = 1000 * (1 + C.AMM_RESOURCE_FEE_RATE);
const alNet = (w1000.adAstraReserve * alBrut) / (w1000.resourceReserve - alBrut);
const alKom = alNet * C.AMM_FEE_RATE;
const pazar = bolum('t-pazar', '🏪', 'Pazar: fiyat nasıl oluşur?', 'Pazarda alıcı ve satıcı aranmaz: her malın bir <b>havuzu</b> vardır ve fiyat havuzdaki oranla belirlenir. Çok alınan pahalanır, çok satılan ucuzlar.',
`${formul([
  '<b>Fiyat</b> = havuzdaki ASTRA ÷ havuzdaki mal.  <b>Sabit çarpım kuralı:</b> mal × ASTRA = sabit; birini alırsan diğeri oransal olarak değişir.',
  `<b>Satış:</b> havuza giren net mal = sattığın × (1 − ${n(C.AMM_RESOURCE_FEE_RATE)}); eline geçen brüt ASTRA = havuz_ASTRA × net_mal ÷ (havuz_mal + net_mal); sonra %${sayi(C.AMM_FEE_RATE * 100)} komisyon düşülür.`,
  `<b>Alış:</b> havuzdan çıkan brüt mal = aldığın × (1 + ${n(C.AMM_RESOURCE_FEE_RATE)}); ödediğin ASTRA = havuz_ASTRA × brüt_mal ÷ (havuz_mal − brüt_mal), üstüne %${sayi(C.AMM_FEE_RATE * 100)} komisyon.`,
  `<b>Hammadde yakımı:</b> alırken ve satarken işlem miktarının %${sayi(C.AMM_RESOURCE_FEE_RATE * 100)}'si kalıcı olarak yakılır.`,
  `<b>Tek işlem sınırı:</b> havuzdaki malın en çok %${sayi(C.AMM_SINGLE_TRADE_SHARE * 100)}'i. <b>Koridor:</b> fiyat açılışın 0,5 katından aşağı inemez, 2,5 katından yukarı çıkamaz.`
])}
  <h3>Başlangıç havuzları ve koridor</h3>
${tablo(['Mal', 'Açılış fiyatı', 'Taban', 'Tavan', 'Havuz: ASTRA', 'Havuz: mal', 'Tek işlem sınırı'], [
  ...K6.map((k) => [AD(k), sayi(ACILIS[k], 4), sayi(C.AMM_CORRIDORS[k].minPriceAda, 4), sayi(C.AMM_CORRIDORS[k].maxPriceAda, 4), sayi(havuz(k).adAstraReserve), sayi(havuz(k).resourceReserve), sayi(havuz(k).resourceReserve * C.AMM_SINGLE_TRADE_SHARE)]),
  ...['fragments', 'boxes', 'keys', 'scroll_heal', 'scroll_stamina'].map((k) => [havuz(k).icon + ' ' + havuz(k).name, sayi(C.AMM_CORRIDORS[k].defaultPriceAda, 3), sayi(C.AMM_CORRIDORS[k].minPriceAda, 3), sayi(C.AMM_CORRIDORS[k].maxPriceAda, 3), sayi(havuz(k).adAstraReserve), sayi(havuz(k).resourceReserve), sayi(havuz(k).resourceReserve * C.AMM_SINGLE_TRADE_SHARE)])
])}
  ${ornek(`<p><b>1.000 odun sat.</b> Havuz ${sayi(w1000.resourceReserve)} odun ve ${sayi(w1000.adAstraReserve)} ASTRA tutuyor (fiyat ${sayi(w1000.adAstraReserve / w1000.resourceReserve, 4)}). ${sayi(satNet)} odun havuza girer, ${sayi(1000 - satNet)} odun yanar. Brüt ASTRA: ${sayi(satBrut, 3)}; komisyon (%2): ${sayi(satKom, 3)}; <b>eline geçen ${sayi(satBrut - satKom, 3)} ASTRA</b> (ortalama ${sayi((satBrut - satKom) / 1000, 4)}/odun, fiyat farkı küçük çünkü havuz büyük).</p>
  <p><b>1.000 odun al.</b> Brüt ${sayi(alBrut)} odun çıkar, ${sayi(alBrut - 1000)} odun yanar. Havuza ${sayi(alNet, 3)} ASTRA girer + %2 komisyon ${sayi(alKom, 3)} → <b>toplam ${sayi(alNet + alKom, 3)} ASTRA</b>.</p>`)}
  <h3>Geri alım (fiyat düşünce destek)</h3>
  <ul>
    <li>Bir malın fiyatı açılışın <b>%${sayi(C.AMM_BUYBACK.TRIGGER_DROP * 100)}'ünden fazla</b> düşerse, Pazar Geri Alım Kasası <b>haftada kendi bakiyesinin %${sayi(C.AMM_BUYBACK.WEEKLY_RATE * 100)}'üne kadar</b> o malı alıp yakar.</li>
    <li>Öncelik: hammaddeler %75 (üretim değerine göre), parça %10, anahtar %8, kutu %7.</li>
    <li>Bu kasa oyuncuya ödeme yapmaz; yalnız fiyatı savunur.</li>
  </ul>
  <h3>Komisyon nereye gider?</h3>
  <p>%${sayi(C.AMM_FEE_RATE * 100)} komisyon her harcama gibi bölünür: %${sayi(C.TOKEN_BURN_RATE * 100)} yakım, %${sayi(C.CREATOR_ROYALTY_RATE * 100)} yapımcı, %${sayi(C.UBI_POOL_RATE * 100)} temel gelir, %${sayi(hazinePay * 100)} kasalar. Hammadde yakımı ise ASTRA değil <b>hammaddenin kendisi</b> silinir ve o hammaddenin haftalık dünya kapasitesini de düşürür.</p>
  <h3>Oyuncular arası ilan pazarı</h3>
  <p>Teçhizat için ayrıdır: satıcı fiyatı kendisi koyar (${n(C.ILAN_PAZARI.MIN_PRICE)} – 1.000.000.000 ASTRA); komisyon %${sayi(C.ILAN_PAZARI.FEE * 100)} (yarısı yakılır, yarısı kasalara); ilan ${n(C.ILAN_PAZARI.DAYS)} gün durur; satıcıya gelen paranın en az %${sayi(C.ILAN_PAZARI.SELLER_LOCKED_SHARE * 100)}'i kilitli gelir.</p>`);

// ═══════════════════════════════════════════════════════════════════════════
// 11) KASALAR (bütçe ve kişi tavanı)
// ═══════════════════════════════════════════════════════════════════════════
const annual = (seed, r) => Math.round(seed * (1 - Math.pow(1 - r, 52)));
const kasalar = bolum('t-kasalar', '🏛️', 'Ödül kasaları: bütçe, sağlık ve kişi tavanı', 'Ödüller kasalardan çıkar ve kasalar <b>asla yoktan para basmaz</b>. Bunun için her kasanın haftalık bir ödeme bütçesi, kişi başına pay tavanı ve "sağlık" derecesi vardır.',
`${formul([
  `<b>Kasa sağlığı</b> = kasadaki ASTRA ÷ hedef rezerv (0 – 1). Hedef rezerv = 12 aylık ödeme = tohum × (1 − (1 − haftalık oran) <sup>52</sup>).`,
  `<b>Haftalık bütçe</b> = kasa × oran × en büyüğü(sağlık, ${n(TB.HEALTH_MIN)}) + son ${n(TB.INFLOW_WEEKS)} haftanın ortalama girişinin ${yuzde(TB.INFLOW_SHARE, 0)}'ı.`,
  `<b>Kişi başı haftalık pay tavanı</b> = bütçe × ${n(TB.PERSON_CAP_MULT)} ÷ en büyüğü(aktif vatandaş, ${n(TB.PERSON_CAP_MIN_ACTIVE)}). Böylece biri tüm bütçeyi tek başına süpüremez.`,
  `<b>Tek ödül</b> ≤ kasanın ${yuzde(C.TREASURY_SINGLE_DRAW_CAP, 0)}'si.  <b>Sağlık &lt; 1</b> ise ödül sağlıkla çarpılır (en az ${yuzde(C.TREASURY_MIN_PAYOUT_RATIO, 0)}).`,
  `Bütçe dolunca oyun "${n(TB.FULL_MESSAGE)}" der: kayıp yok, hak Pazartesi yenilenir.`
])}
${tablo(['Kasa', 'Tohum', 'Haftalık bütçe oranı', 'Hedef rezerv (12 ay)', 'Başlangıç haftalık bütçe', '100 aktif oyuncuda kişi tavanı'], ['dungeon', 'arena', 'worldBoss', 'quest', 'carnival'].map((id) => {
  const seed = C.TREASURY_SEED[id];
  const r = TB.RATES[id];
  const hedef = C.TREASURY_TARGET_RESERVE[id];
  const saglik = Math.max(TB.HEALTH_MIN, Math.min(1, seed / hedef));
  const butce = seed * r * saglik;
  return [KASA_AD[id], sayi(seed), yuzde(r), sayi(hedef), sayi(butce), sayi(butce * TB.PERSON_CAP_MULT / 100)];
}))}
  <p>Başlangıç haftalık bütçe, kasa dolu ve sağlıklıyken <b>harcamalardan gelen girişi hesaba katmadan</b> yazılmıştır; giriş arttıkça bütçe büyür.</p>
  ${ornek(`<p>Zindan kasası ${sayi(C.TREASURY_SEED.dungeon)} ASTRA, oran ${yuzde(TB.RATES.dungeon)}: ilk haftanın bütçesi ${sayi(C.TREASURY_SEED.dungeon * TB.RATES.dungeon)} ASTRA. 100 aktif oyuncuyla bir kişi bu hafta zindandan en çok ${sayi(C.TREASURY_SEED.dungeon * TB.RATES.dungeon * TB.PERSON_CAP_MULT / 100)} ASTRA alabilir. Bunun yanında zindanın günlük bütçesi kasanın ${yuzde(C.DUNGEON.DAILY_BUDGET_RATE, 2)}'sı: ${sayi(C.TREASURY_SEED.dungeon * C.DUNGEON.DAILY_BUDGET_RATE)} ASTRA/gün (herkes için).</p>`)}
  <p>Hedef rezervin altına düşen kasada ödüller küçülür; böylece kasa hiçbir zaman sıfırlanmaz ve yıllarca dayanır. <b>Konsey</b>, <b>Fatih</b> ve <b>Universe</b> kasaları sürekli ödeme yapmaz: proje, tek olay ve kilitli rezerv içindir.</p>`);

// ═══════════════════════════════════════════════════════════════════════════
// 12) ASKER VE TEÇHİZAT
// ═══════════════════════════════════════════════════════════════════════════
const askerSatiri = (n) => [`<b>${n}. asker</b>`, astra(gs.getSoldierCost(n), 2), astra(Array.from({ length: n }, (_, i) => gs.getSoldierCost(i + 1)).reduce((s, v) => s + v, 0), 0)];
const yuvalar = [['weapon', '🗡️ Silah'], ['helmet', '🪖 Miğfer'], ['armor', '🛡️ Zırh'], ['legs', '👖 Dizlik'], ['boots', '👢 Çizme']];
const esyaYuk = (slot, L) => {
  const t = C.EQUIPMENT_RECIPES[slot];
  return gs.calculateEquipmentUpgradeCost({ slot, level: L, baseAtk: t.baseAtk, baseHp: t.baseHp, name: t.name, icon: t.icon });
};
const toplamEsya = (slot) => {
  const d = gs.calculateEquipmentCraftCost(slot);
  const t = { wood: d.wood, iron: d.iron, coal: d.coal, stone: 0, fragments: d.fragments, astra: d.adaCost };
  for (let L = 1; L < C.EQUIPMENT_MAX_LEVEL; L++) { const y = esyaYuk(slot, L); t.wood += y.woodCost; t.iron += y.ironCost; t.coal += y.coalCost; t.stone += y.stoneCost; t.fragments += y.fragmentCost; t.astra += y.adAstraCost; }
  return t;
};
const yuk1 = (L) => { const y = esyaYuk('weapon', L); return [`<b>${L} → ${L + 1}</b>`, sayi(y.woodCost), sayi(y.ironCost), sayi(y.coalCost), sayi(y.stoneCost), sayi(y.fragmentCost), sayi(y.adAstraCost, 2), `+${sayi(y.nextAtk)} ATK`]; };
const savasBolum = bolum('t-savas', '⚔️', 'Asker, teçhizat ve onarım bedelleri', 'Ordunu kurmanın ve silahlandırmanın maliyeti. Bütün bedeller <b>temel fiyattır</b> (fiyat çarpanı 1,0).',
`  <h3>Asker alım bedeli</h3>
${formul([
  `<b>n. asker</b> = ${n(C.SOLDIER_COST_BASE)} × n <sup>${sayi(C.SOLDIER_COST_EXPONENT, 4)}</sup> ASTRA. İlk asker ${n(C.SOLDIER_COST_BASE)}, 18. asker tam ${sayi(C.SOLDIER_18_TARGET_COST)} ASTRA'dır.`,
  '<b>Köylü şartı:</b> her asker bir köylü sayılır; köylün yoksa asker alamazsın (<a href="#t-koy">köy evleri</a>).',
  'Asker alırken harcadığın ASTRA normal bölüşüme girer (%5 yakım, %3 yapımcı, %6 temel gelir, %86 kasalar). Bu harcama Fatih Ödülü hesabına da yazılır.'
])}
${tablo(['Sıra', 'Bedel', 'Şu ana kadar toplam'], [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 25, 30].map(askerSatiri))}
  <p>18 askerin toplamı <b>${astra(Array.from({ length: 18 }, (_, i) => gs.getSoldierCost(i + 1)).reduce((s, v) => s + v, 0), 0)}</b>'dır; "Fatih Ödülü" tavanı da bu rakamdır.</p>
  <h3>Asker gelişimi</h3>
  <ul>
    <li><b>Seviye başına:</b> +${n(C.SOLDIER_ATK_PER_LEVEL)} saldırı, +${n(C.SOLDIER_HP_PER_LEVEL)} can. Başlangıç: ${n(C.SOLDIER_BASE_ATK)} saldırı, ${n(C.SOLDIER_MAX_HP)} can.</li>
    <li><b>Gereken XP</b> = seviye × 100 (Lv.1 → 2 için 100, Lv.10 → 11 için 1.000 …).</li>
    <li><b>Yetenekler:</b> 10. seviyede Şok Dalgası, 25'te Zırh Kırıcı, 45'te Sahra Merhemi, 65'te Son Direniş.</li>
  </ul>
  <h3>Teçhizat: dövme</h3>
${formul([
  `<b>Dövme bedeli</b> = eşyanın "değer dakikası" × dakikalık üretim. Değer dakikası = ${n(C.EQUIPMENT_CRAFT_MINUTES.PER_ATK)} × saldırı + ${n(C.EQUIPMENT_CRAFT_MINUTES.PER_HP)} × can. Odun ve demir tam, kömür üçte biri; 1 teçhizat parçası; ayrıca bu hammaddelerin pazar değeri kadar ASTRA.`,
  `<b>Yükseltme (L → L+1)</b> = dövme bedelinin 1,18 <sup>L</sup> katı (odun, demir, kömür) + <b>bileme taşı</b>; parça: 2 <sup>L</sup> (1 → 2 → 4 → 8 …). En çok ${n(C.EQUIPMENT_MAX_LEVEL)}. seviye.`,
  '<b>Her yükseltmede güç</b> = temel × (1 + 0,35 × (seviye − 1)). Dayanıklılık 13; her zafer −1; yükseltme dayanıklılığı da tamamlar.',
  `<b>Onarım</b> = eşyaya o ana kadar harcanan toplam hammaddenin %10'u × (eksik dayanıklılık ÷ 13) + pazar değeri kadar ASTRA.  <b>Geri dönüşüm:</b> hammaddelerin %${sayi(C.RECYCLE_RETURN_RATE * 100)}'i geri gelir, ASTRA geri gelmez.`
])}
${tablo(['Yuva', 'Saldırı', 'Can', 'Odun', 'Demir', 'Kömür', 'Parça', 'ASTRA (dövme)'], yuvalar.map(([s, ad]) => { const d = gs.calculateEquipmentCraftCost(s); const t = C.EQUIPMENT_RECIPES[s]; return [ad, t.baseAtk, t.baseHp, sayi(d.wood), sayi(d.iron), sayi(d.coal), d.fragments, sayi(d.adaCost, 2)]; }))}
  <h3>Silahın yükseltme bedelleri (1 → 10)</h3>
${tablo(['Geçiş', 'Odun', 'Demir', 'Kömür', 'Taş', 'Parça', 'ASTRA', 'Yeni güç'], Array.from({ length: C.EQUIPMENT_MAX_LEVEL - 1 }, (_, i) => yuk1(i + 1)))}
  <h3>Bir eşyayı en üst seviyeye (10) çıkarmanın toplamı</h3>
${tablo(['Yuva', 'Odun', 'Demir', 'Kömür', 'Taş', 'Parça', 'ASTRA'], yuvalar.map(([s, ad]) => { const t = toplamEsya(s); return [ad, sayi(t.wood), sayi(t.iron), sayi(t.coal), sayi(t.stone), sayi(t.fragments), sayi(t.astra, 0)]; }))}
  <p>Beş yuvanın hepsi 10. seviyede: ${astra(yuvalar.reduce((s, [slot]) => s + toplamEsya(slot).astra, 0), 0)} ve ${sayi(yuvalar.reduce((s, [slot]) => s + toplamEsya(slot).fragments, 0))} parça ister (asker başına).</p>
  <h3>Küme bonusu</h3>
  <p>Aynı askerin üstünde 2 parça: +%5 saldırı ve can; 4 parça: +%12; 5 parça (tam takım): <b>+%25</b>.</p>
  <h3>İyileştirme bedeli (1 can başına)</h3>
${tablo(['Yöntem', 'Süre', 'Buğday', 'ASTRA', '100 can için'], [
  ['Pasif (kendiliğinden)', '24 saatte tam can', sayi(C.SOLDIER_PASSIVE_HEAL.wheatPerHp, 2), sayi(C.SOLDIER_PASSIVE_HEAL.adaPerHp, 4), `${sayi(C.SOLDIER_PASSIVE_HEAL.wheatPerHp * 100)} buğday + ${sayi(C.SOLDIER_PASSIVE_HEAL.adaPerHp * 100, 2)} ASTRA`],
  ['Hızlı (anında)', 'Anında', sayi(C.SOLDIER_FAST_HEAL.wheatPerHp, 2), sayi(C.SOLDIER_FAST_HEAL.adAstraPerHp, 3), `${sayi(C.SOLDIER_FAST_HEAL.wheatPerHp * 100)} buğday + ${sayi(C.SOLDIER_FAST_HEAL.adAstraPerHp * 100, 2)} ASTRA`],
  ['Şifahane (şifalı ot)', 'Anında', `1 ot = ${n(C.SIFAHANE.HP_PER_HERB)} can`, `hızlı bedelin ${yuzde(C.SIFAHANE.ADA_SHARE_WITH_HERB, 0)}'i`, 'Otla birlikte ASTRA yarıya iner']
])}`);

// ═══════════════════════════════════════════════════════════════════════════
// 13) KÖY, ALET ONARIMI VE BOT
// ═══════════════════════════════════════════════════════════════════════════
const evSatiri = (n) => { const c = gs.getHouseCost(n); return [`<b>${n}. ev</b>`, sayi(c.wood), sayi(c.stone), sayi(c.iron), sayi(n * C.KOY.VILLAGERS_PER_HOUSE)]; };
const aletOnarim = (L) => seviyedeIken(L, () => {
  gs.state.tools = gs.state.tools || {};
  gs.state.tools.axe = { ...(gs.state.tools.axe || {}), durability: 0, maxDurability: C.TOOLS.axe.maxDurability };
  const b = gs.calculateRepairCost('axe');
  return [`<b>Lv.${L}</b>`, sayi(b.woodCost), sayi(b.ironCost), sayi(b.adAstraCost, 2)];
});
// Bot ücreti, o an açık olan haktan etkilenir (hafta ilerledikçe biriken hak ücreti büyütür); tablo "haftanın ilk günü" için sabitlenir
const botSatiri = (L) => seviyedeIken(L, () => {
  globalPool.state.epochEndTime = Date.now() + 7 * 86400000 - 60000;
  const b = gs.calculateTavernaBotProfitAndCost();
  return [`<b>Lv.${L}</b>`, sayi(b.grossRevenueAda, 1), sayi(b.staminaWheatCostAda, 1), sayi(b.toolRepairCostAda, 1), sayi(b.netProfitAda, 1), sayi(b.botCostAda, 1)];
});
const koy = bolum('t-koy', '🏘️', 'Köy, alet onarımı, bot ve taverna', 'Köylülerin nasıl çoğaldığı, ev ve alet onarım bedelleri ve botun günlük ücretinin nasıl hesaplandığı.',
`  <h3>Köy evleri</h3>
${formul([
  `<b>Başlangıç:</b> ${n(C.KOY.START_HOUSES)} ev, ${n(C.KOY.START_VILLAGERS)} köylü. Ev başına ${n(C.KOY.VILLAGERS_PER_HOUSE)} köylü kapasitesi.`,
  `<b>Büyüme:</b> kapasite boşsa köylü sayısı günde %${sayi(C.KOY.GROWTH_PER_DAY * 100)} artar. Her köylü günde ${n(C.KOY.WHEAT_PER_VILLAGER_DAY)} buğday yer.`,
  `<b>Açlık:</b> buğday yetmezse ${n(C.KOY.STARVE_DAYS)} gün sonra köylüler günde %${sayi(C.KOY.STARVE_LOSS_PER_DAY * 100)} azalır.`,
  `<b>Faydası:</b> her köylü günde ${n(C.KOY.LABOR_PER_VILLAGER_DAY)} emek puanı üretir; her 10 köylü üretimi %${sayi(C.KOY.PROD_BONUS_PER_10 * 100)} artırır (en çok %${sayi(C.KOY.PROD_BONUS_MAX * 100)}); her asker 1 köylü sayılır.`,
  `<b>n. evin bedeli</b> = ${sayi(C.KOY.HOUSE_BASE_COST.wood)} odun, ${sayi(C.KOY.HOUSE_BASE_COST.stone)} taş, ${sayi(C.KOY.HOUSE_BASE_COST.iron)} demir × ${n(C.KOY.HOUSE_COST_MULT)} <sup>(n − 2)</sup> (2. ev taban). En çok ${n(C.KOY.MAX_HOUSES)} ev ve ev sayısı hesap seviyeni geçemez.`
])}
${tablo(['Ev', 'Odun', 'Taş', 'Demir', 'Kapasite (köylü)'], [2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 20].map(evSatiri))}
  <h3>Alet onarımı (tam aşınmış alet)</h3>
${formul([
  `<b>Odun</b> = eksik dakika × (dakikalık odun üretimi × %25 ÷ 6 alet).  <b>Demir</b> aynı şekilde demir üretiminden.`,
  `<b>ASTRA</b> = bu odun ve demirin pazar değerinin %${sayi(C.TOOL_REPAIR_ADA_SHARE * 100)}'i.`
])}
${tablo(['Seviye', 'Odun', 'Demir', 'ASTRA'], [1, 10, 20, 30, 50, 81].map(aletOnarim))}
  <h3>Otomasyon botu (Taverna)</h3>
${formul([
  '<b>Günlük net kâr</b> = 24 saatlik üretimin pazar değeri − o üretim için harcanan stamina (buğday) − alet aşınma bedeli. Üretim, senin <b>kendi üretim hakkınla</b> sınırlanır.',
  `<b>Bot ücreti (24 saat)</b> = net kârın <b>%50'si</b> (en az 1 ASTRA). 6 saatlik paket = günlüğün ¼'ü (en az 0,5). İlk kez 1 saat ücretsiz deneme.`,
  `<b>Güvenlik payı:</b> bot kasada her zaman en az ${n(C.TAVERNA_BOT.MIN_ADA_RESERVE)} ASTRA (oto-yenileme açıksa ertesi günün ücreti) bırakır. Oyun kapalıyken en çok ${n(C.TAVERNA_BOT.MAX_OFFLINE_CATCHUP_HOURS)} saat telafi eder.`
])}
${tablo(['Seviye', 'Brüt üretim değeri/gün', 'Stamina (buğday)', 'Alet aşınması', 'Net kâr/gün', '24 saatlik bot ücreti'], [1, 10, 20, 30].map(botSatiri))}
  <p>Değerler <b>haftanın ilk günü</b> için, açılış fiyatlarıyla ve ağırlığı 1,0 olan bir oyuncu için hesaplanmıştır: o gün yalnız günlük açılan pay (haftalık hakkın 1/7'si) kullanılabildiği için ücret düşüktür. Hafta ilerledikçe kullanmadığın hak biriktiği için, pazar fiyatı ve kalan kotan değiştikçe ücret de yükselir. Ücretin <b>%50 yakım + kasalar</b> olarak normal bölüşüme girer.</p>`);

// ═══════════════════════════════════════════════════════════════════════════
// 14) KAZANÇ KAYNAKLARI
// ═══════════════════════════════════════════════════════════════════════════
const zindanSatiri = (d) => {
  const buyuk = d.isBoss || d.level === 9 || d.level === 18;
  const r = gs.getDungeonBaseReward(d.level, buyuk);
  return [`<b>Sv.${d.level}</b> (Kat ${d.floor})`, `${d.icon || ''} ${d.name}`, sayi(d.hp), sayi(d.atk), sayi(r.ada, 2), sayi(gs.getDungeonGateFee(d.level, buyuk), 2), sayi(gs.getDungeonStaminaCost(d.level, 1)), sayi(d.rewardXp)];
};
const cark = C.CARNIVAL.WHEEL_REWARDS;
const cWeight = cark.reduce((s, r) => s + r.weight, 0);
const cEV = cark.reduce((s, r) => s + r.weight * r.valAda, 0) / cWeight;
const cEVbotsuz = cark.filter((r) => r.type !== 'bot_free').reduce((s, r) => s + r.weight * r.valAda, 0) / cWeight;
const liglar = C.COLOSSEUM.LEAGUES.slice().reverse();
const kazanc = bolum('t-kazanc', '💰', 'Kazanç kaynakları: zindan, kolezyum, boss, çark, piyango', 'ASTRA kazandıran bütün yollar, her birinin sınırı ve ödülün hangi kasadan çıktığı.',
`  <h3>🗺️ Zindan</h3>
${formul([
  `<b>Zafer ödülü</b> = ${n(C.DUNGEON.REWARD_ADA_PER_LEVEL)} ASTRA × canavar seviyesi (9. ve 18. seviyede ×${n(C.DUNGEON.MAJOR_BOSS_REWARD_MULT)}). Ödül zindan kasasından çıkar ve %${sayi(C.LOCKED_BALANCE.FREE_SHARE * 100)}'i serbest, kalanı kilitli gelir.`,
  `<b>Günlük giriş:</b> ${n(C.DUNGEON.DAILY_RUNS)} ödüllü giriş; sonrası kapı harcıyla (ödülün %${sayi(C.DUNGEON.GATE_FEE_RATE * 100)}'si, tamamı zindan kasasına) ödüllü, ödenmezse yalnız deneyim.`,
  `<b>Kişisel günlük tavan</b> = en büyüğü( ${n(C.DUNGEON.DAILY_RUNS)} × ulaştığın en değerli katın ödülü ,  orduya harcadığın ASTRA × ${n(C.DUNGEON.RETURN_SHARE)} ÷ ${n(C.DUNGEON.PAYBACK_DAYS)} ).`,
  `<b>Her giriş stamina ister:</b> asker başına ${n(C.DUNGEON_STAMINA_COST_PER_SOLDIER.BASE_PER_SOLDIER)} + canavar seviyesi (tablo aşağıda).`,
  `<b>Fatih Ödülü:</b> 18. kat bossunu ilk kez yenince, orduya harcadığın − zindandan kazandığın fark (en çok 18 askerin toplam fiyatı kadar) Fatih kasasından bir defaya mahsus ödenir.`
])}
${tablo(['Seviye', 'Canavar', 'Can', 'Saldırı', 'Ödül (ASTRA)', 'Kapı harcı', 'Stamina/asker', 'Asker XP'], DUNGEON_LEVELS.map(zindanSatiri))}
  ${ornek(`<p>Bir oyuncu orduya <b>${sayi(10000)} ASTRA</b> harcadı ve 12. kata kadar açtı. Kişisel günlük tavan = en büyüğü(5 × ${sayi(gs.getDungeonBaseReward(12).ada, 1)} = ${sayi(5 * gs.getDungeonBaseReward(12).ada, 1)}, 10.000 × ${n(C.DUNGEON.RETURN_SHARE)} ÷ ${n(C.DUNGEON.PAYBACK_DAYS)} = ${sayi(10000 * C.DUNGEON.RETURN_SHARE / C.DUNGEON.PAYBACK_DAYS, 1)}) = <b>${sayi(Math.max(5 * gs.getDungeonBaseReward(12).ada, 10000 * C.DUNGEON.RETURN_SHARE / C.DUNGEON.PAYBACK_DAYS), 1)} ASTRA/gün</b>.</p>`)}
  <h3>🏟️ Kolezyum</h3>
${formul([
  `<b>Maç ödülü</b> = en küçüğü( ${n(C.COLOSSEUM.WIN_REWARD_ASTRA)} × lig çarpanı ,  kolezyum kasasının %${sayi(C.COLOSSEUM.WIN_REWARD_POOL_SHARE * 100, 2)}'si ). Günlük ödül tavanı ${n(C.COLOSSEUM.DAILY_REWARD_CAP_ASTRA)} ASTRA.`,
  `<b>Giriş:</b> ${n(C.COLOSSEUM.ENTRY_KEY_COST)} anahtar + ${n(C.COLOSSEUM.ENTRY_STAMINA_COST)} stamina; günde en çok ${n(C.COLOSSEUM.DAILY_MATCH_CAP)} maç. Rakip puanı seninkinin ±${n(C.COLOSSEUM.RATING_SPREAD)} civarındadır; puan değişimi ELO (K = ${n(C.COLOSSEUM.K_FACTOR)}), başlangıç ${n(C.COLOSSEUM.STARTING_RATING)}.`,
  `<b>Gerçek rakiplerle sıralama:</b> 1v1 zaferi 1 puan, 3v3 zaferi 3 puan. Haftalık ilk 10 oyuncu, kolezyum kasasının %${sayi(PVP_RULES.weeklyPoolShare * 100)}'sini şu paylarla alır: ${PVP_RULES.topWeights.map((w, i) => `${i + 1}. %${w}`).join(', ')}.`
])}
${tablo(['Lig', 'En az puan', 'Maç ödül çarpanı', 'Maç ödülü (taban)'], liglar.map((l) => [l.name, sayi(l.minRating), `×${n(l.rewardMult)}`, astra(C.COLOSSEUM.WIN_REWARD_ASTRA * l.rewardMult, 1)]))}
  <h3>🌋 Dünya bossu</h3>
${formul([
  `<b>Zamanı:</b> her Pazar 18:00 (TSİ); tek otomatik savaş. Ordunu Pazar'dan önce "kilitlersin".`,
  `<b>Hasar</b> = (toplam saldırı × 1,0 + toplam can × 0,25) × <b>beceri çeşitliliği çarpanı</b>. Çeşitlilik: ilk rolden sonraki her farklı rol için +%${sayi(C.WORLD_BOSS.SKILL_DIVERSITY_BONUS_PER_ROLE * 100)}, en çok +%${sayi(C.WORLD_BOSS.MAX_SKILL_DIVERSITY_BONUS * 100)} (Tank, AoE, Şifacı, Anti-Tank, Kontrol, Berserker, Hayatta Kalma).`,
  `<b>Haftalık havuz</b> = boss kasasının %${sayi(C.WORLD_BOSS.WEEKLY_DISTRIBUTION_RATE * 100)}'ü.  <b>Ödülün</b> = havuz × (senin hasarın ÷ geçen haftanın toplam krallık hasarı ya da boss canı ${sayi(C.WORLD_BOSS.BASE_HP)}; hangisi büyükse).`,
  `<b>Erken çekilme cezası:</b> tahmini kazancının %${sayi(C.WORLD_BOSS.EARLY_UNSTAKE_PENALTY * 100)}'i (Savunma Duvarı projesi bitince %12).`
])}
  <h3>🎡 Şans çarkı</h3>
  <p>Bir çevirme <b>${n(C.CARNIVAL.WHEEL_COST_ADA)} ASTRA</b>'dır (ya da dengi hammadde ya da bilet). Ortalama geri dönüş: <b>%${sayi(cEVbotsuz / C.CARNIVAL.WHEEL_COST_ADA * 100, 1)}</b> (24 saatlik bot ikramiyesi sayılmadan), bot dahil <b>%${sayi(cEV / C.CARNIVAL.WHEEL_COST_ADA * 100, 1)}</b>. Amorti bilet parçaları (3 parça = 1 bedava çevirme) hesaba katılmıştır. ASTRA ile çevirme bedelinin %${sayi(C.CARNIVAL.WHEEL_CARNIVAL_SHARE * 100)}'i karnaval kasasına girer; ödüller oradan çıkar.</p>
${tablo(['Ödül', 'Şans', 'Değeri (ASTRA)'], cark.slice().sort((a, b) => b.valAda - a.valAda).map((r) => [r.name, `%${sayi(r.weight / cWeight * 100, 2)}`, sayi(r.valAda, 2)]))}
  <h3>🎟️ Haftalık piyango</h3>
${formul([
  `<b>Bilet:</b> ${n(C.CARNIVAL.LOTTERY.TICKET_COST_ADA)} ASTRA. Bedelin %${sayi((1 - C.CARNIVAL.LOTTERY.AMORTI_SHARE) * 100)}'i piyango kasasına, %${sayi(C.CARNIVAL.LOTTERY.AMORTI_SHARE * 100)}'si amorti kasasına. Hesap başına haftada en çok ${n(C.CARNIVAL.LOTTERY.MAX_TICKETS_PER_ACCOUNT)} bilet.`,
  `<b>Çekiliş:</b> haftada TEK kazanan (Pazartesi 00:01). Şansın = senin biletlerin ÷ toplam bilet. Kazanan, biletlerine ödediğinin <b>${n(C.CARNIVAL.LOTTERY.WINNER_MULTIPLIER)} katını</b> alır; biletleri yanar.`,
  `<b>Kazanamayanların biletleri</b> yanmaz, sonraki haftaya devreder; ama her çekilişte ödenen değerleri %${sayi(C.CARNIVAL.LOTTERY.CARRY_AGING_RATE * 100)} düşer (en çok yarıya kadar).`,
  '<b>Kasa bitince:</b> kazanan kasada kalanı alır, amorti kasası kalan biletlere bölünür ve biletler kapanır; piyango sıfırdan dolar.'
])}
  ${ornek(`<p>Toplam 1.000 bilet var, sen 20 tane aldın: şansın %${sayi(20 / 1000 * 100)}. Kazanırsan 20 × ${n(C.CARNIVAL.LOTTERY.TICKET_COST_ADA)} × ${n(C.CARNIVAL.LOTTERY.WINNER_MULTIPLIER)} = <b>${sayi(20 * C.CARNIVAL.LOTTERY.TICKET_COST_ADA * C.CARNIVAL.LOTTERY.WINNER_MULTIPLIER)} ASTRA</b>. Kazanmazsan biletlerin sonraki haftaya geçer, değerleri %5 düşer.</p>`)}`);

// ═══════════════════════════════════════════════════════════════════════════
// 15) TEMEL GELİR, ÜCRETSİZ HAVUZ, KATKI PUANI, KAPI
// ═══════════════════════════════════════════════════════════════════════════
const FP = C.FREE_PLAYER_POOL;
const ubiSatiri = (L) => [`Lv.${L}`, sayi(levelWeight(L, { minLevel: C.UBI_CONFIG.MIN_LEVEL, weight: (x) => 1 + Math.sqrt(Math.max(1, x) - 1) * 0.75 }), 2)];
const fauSatir = (c, seri) => {
  const agirlik = weightOf({ contribution: c, priceMultiplier: 1, streakWeeks: seri }, FP);
  return [sayi(c), `${seri}. hafta`, `×${sayi(streakMultiplier(seri, FP), 1)}`, sayi(agirlik, 1), `%${sayi(capFraction(agirlik, FP) * 100, 0)}`];
};
const gelir = bolum('t-gelir', '🎁', 'Temel gelir, ücretsiz oyuncu havuzu ve kapı', 'Para yatırmadan da oynayanlara ve aktif herkese giden düzenli paylar; ve oyuna giriş sınırı.',
`  <h3>🤝 Temel gelir (UBI)</h3>
${formul([
  `<b>Kasa:</b> bir haftada harcanan her ASTRA'nın %${sayi(C.UBI_POOL_RATE * 100)}'sı + çekim ücretinin yarısı + önceki haftadan çekilmeyen pay. Pazartesi 00:01'de açılır.`,
  `<b>Hak:</b> ${n(C.UBI_CONFIG.MIN_LEVEL)}. seviye ve üstü, son 2 haftada oynamış, izinde olmayan oyuncular.`,
  `<b>Ağırlık</b> W(L) = 1 + 0,75 × √(L − 1).  <b>Payın</b> = kasa × W(sen) ÷ (tüm hak sahiplerinin W toplamı); tek kişi en çok kasanın %${sayi(C.UBI_CONFIG.MAX_SINGLE_CLAIM_SHARE * 100)}'ini alır, artanı kasada kalıp sonraki haftaya geçer.`
])}
${tablo(['Seviye', 'Ağırlık W(L)'], [3, 5, 10, 20, 30, 40, 50, 60, 70, 81].map(ubiSatiri))}
  ${ornek(`<p>Bu haftanın kasası 100.000 ASTRA, hak sahiplerinin W toplamı 400 olsun. 30. seviyedeki bir oyuncu (W = ${ubiSatiri(30)[1]}) kasadan 100.000 × ${ubiSatiri(30)[1]} ÷ 400 = <b>${sayi(100000 * Number(ubiSatiri(30)[1].replace(',', '.')) / 400, 0)} ASTRA</b> alır.</p>`)}
  <h3>🎁 Ücretsiz oyuncu havuzu</h3>
${formul([
  `<b>Kimler?</b> hiç para yatırmamış, e-postası doğrulanmış, en az ${n(FP.MIN_LEVEL)}. seviye, o hafta en az ${n(FP.MIN_WEEKLY_CONTRIBUTION)} katkı puanı toplamış (fiyat çarpanıyla ölçeklenir) ve izinde olmayan oyuncular.`,
  `<b>Havuz büyüklüğü (haftalık)</b> = en küçüğü( piyasa değerinin %${sayi(W.faucetMonthlyMcapShare * 100)}'i ÷ ${n(W.weeksPerMonth)} hafta, kişi başı ${n(W.faucetMaxUsdPerPlayer)} $ × kişi ÷ ${n(W.weeksPerMonth)}, görev kasasının %${sayi(FP.WEEKLY_POOL_CAP * 100, 1)}'i ).`,
  `<b>Kişisel ağırlık</b> = en küçüğü(katkı puanın, ${n(FP.WEIGHT_CAP_CONTRIBUTION)}) <sup>${n(FP.WEIGHT_EXP)}</sup> × sadakat çarpanı. Sadakat çarpanı her üst üste hafta +%${sayi(FP.STREAK_STEP * 100)} (en çok ×${n(FP.STREAK_MAX)}); bir hafta kaçırırsan seri yarıya iner.`,
  `<b>Kişi başı tavan</b> kendi ağırlığınla ölçeklenir; tam tavan için ${n(FP.FULL_CONTRIBUTION)} katkı puanı ve en yüksek seri gerekir. Pay <b>tamamen kilitli</b> gelir.`
])}
${tablo(['Haftalık katkı puanı', 'Seri', 'Sadakat çarpanı', 'Ağırlık', 'Tavanın yüzdesi'], [
  fauSatir(1, 1), fauSatir(10, 1), fauSatir(10, 5), fauSatir(10, 11), fauSatir(50, 1), fauSatir(100, 1), fauSatir(1000, 1)
])}
  <p>Üs ${n(FP.WEIGHT_EXP)} (1'den büyük) olduğu için aynı emeği birkaç hesaba bölmek sana <b>daha az</b> kazandırır; tek hesapta toplamak her zaman daha iyidir.</p>
  <h3>🏅 Katkı puanı</h3>
  <ul>
    <li><b>Harcadığın her ASTRA</b> → ${n(C.CONTRIBUTION.ADA_SPEND_WEIGHT)} puan (pazardan hammadde alımı hariç).</li>
    <li><b>Yakılan ya da harcanan hammaddenin değeri</b> → ${n(C.CONTRIBUTION.RESOURCE_BURN_WEIGHT)} puan (ASTRA cinsinden).</li>
    <li><b>Pazara net hammadde satışı</b> → ${n(C.CONTRIBUTION.RESOURCE_SALE_WEIGHT)} puan. Aynı hammaddeyi alıp satmak puan getirmez.</li>
    <li>Puan her hafta sıfırlanır; <b>çekim payın</b> ve <b>üretim hakkı kademen</b> geçen haftanın puanına göre belirlenir.</li>
  </ul>
  <h3>🚪 Kapı (giriş sınırı) ve katılım puanı</h3>
${formul([
  `<b>Vatandaş sınırı:</b> başlangıçta ${n(C.KAPI.START_LIMIT)} kişi. Yer açılana kadar bekleme sırası vardır; sıra gelince ${n(C.KAPI.INVITE_HOURS)} saatlik davet süresi.`,
  `<b>Büyüme:</b> kişi başı aylık dolar göstergesi (son ${n(C.KAPI.AVG_MONTHS)} ayın ortalaması) kademeli eşikleri (${C.KAPI.USD_TIERS.join(' / ')} $) geçtikçe sınır %${sayi(C.KAPI.GROWTH_STEP * 100)}'lik adımlarla büyür. Şu an otomatik büyüme kapalıdır; sınırı yalnız yönetici değiştirir.`,
  `<b>Katılım puanı:</b> haftada dokunduğun farklı alan sayısı (sefer, bakım, kışla, zindan, kolezyum, boss, pazar, konsey, karnaval, rehber). Eşik = en çok ${n(C.KATILIM_PUANI.ESIK_TAVAN)}, ${n(C.KATILIM_PUANI.ESIK_TABAN)} + (seviye ÷ ${n(C.KATILIM_PUANI.ESIK_SEVIYE_ARALIGI)}). ${n(C.KATILIM_PUANI.UYARI_HAFTA)} hafta eşiğin altında kalırsan uyarı, ${n(C.KATILIM_PUANI.IZIN_SORUSU_HAFTA)} haftada "izin ister misin" sorusu gelir; yıllık ${n(C.KATILIM_PUANI.IZIN_YILLIK_GUN)} gün izin hakkın vardır.`,
  `<b>Kayıt harcı:</b> ${n(C.KAPI.REGISTRATION_FEE_ADA)} ASTRA; aynı internet adresinden günde en çok ${n(C.KAPI.IP_DAILY_ADMIT)} yeni vatandaş.`
])}`);

// ═══════════════════════════════════════════════════════════════════════════
// 16) FİYAT ÇARPANI
// ═══════════════════════════════════════════════════════════════════════════
const fiyat = bolum('t-fiyat', '💱', 'Fiyat çarpanı: ASTRA ucuzlarsa ne olur?', 'Oyundaki sabit ASTRA bedelleri, ASTRA\'nın <b>dolar karşılığı</b> değişince ölçeklenir; böylece oyuna giriş maliyeti dolar bazında korunur.',
`${formul([
  `<b>ASTRA açılış fiyatının altındaysa</b> çarpan hedefi = açılış fiyatı ÷ güncel fiyat (dolar maliyeti sabit kalır). <b>Üstündeyse</b> = (açılış ÷ güncel) <sup>${n(W.multExp)}</sup> (bedeller yavaş yavaş düşer).`,
  `<b>Kasa ömrü düzeltmesi</b> (ASTRA açılış fiyatının üstündeyken): kasalar 12 aydan kısa dayanıyorsa çarpan düşmez; 36 aydan uzunsa %10, 60 aydan uzunsa %20 daha düşer.`,
  `<b>Haftalık değişim sınırı:</b> çarpan bir haftada en çok %${sayi(W.multStep * 100)} oynar; alt sınır ${n(W.multMin)}, üst sınır ${n(W.multMax)}.`,
  `<b>Neye uygulanır?</b> asker bedeli, çark (bedel ve ASTRA ödülleri), piyango bileti, asker iyileştirmenin ASTRA kısmı, Genesis NFT, taverna güçlendirmeleri ve ücretsiz havuz katkı eşikleri. <b>Uygulanmaz:</b> zindan, kolezyum ve boss ödülleri (sabit) ile pazar fiyatlı bedeller (teçhizat, silo, seviye atlama, alet onarımı, bot ücreti): bunlar zaten pazardan ayarlanır.`
])}
  ${ornek(`<p>ASTRA'nın dolar fiyatı açılışın yarısına düşerse çarpan hedefi 2,0'dır; haftada en çok %5 oynayacağı için 14 hafta civarında 2,0'a ulaşır. 18. asker ${sayi(C.SOLDIER_18_TARGET_COST)} yerine ${sayi(C.SOLDIER_18_TARGET_COST * 2)} ASTRA olur — dolar karşılığı aynı kalır.</p>`)}`);

// ═══════════════════════════════════════════════════════════════════════════
// 17) ZİNCİR VE KONTRAT SINIRLARI
// ═══════════════════════════════════════════════════════════════════════════
const zincir = bolum('t-zincir', '⛓️', 'Zincir tarafı: kontratlar ve güvenlik sınırları', 'ASTRA zincirde (Avalanche) gerçek bir token olduğu için, oyun parası kontratlarla da korunur. Sınırlar kodla (kontratla) konmuştur; sunucu ele geçirilse bile aşılamaz.',
`  <h3>Oyun Kasası sözleşmesi (OyunKasasi)</h3>
${tablo(['Kural', 'Değer'], [
  ['Para çıkış yolları', '1) oyuncuya ödeme  2) yakım  3) sabit yapımcı cüzdanına  4) yeni kasaya geçiş (yalnız arıza için). <b>Başka hiçbir yol yoktur</b>: kişisel cüzdana çekim fonksiyonu kontratta bulunmaz.'],
  ['Tek ödeme sınırı', 'Kasadaki paranın en çok %2\'si (sunucu bu değeri doğrular; sahibin kontrattaki en üst sınırı %10)'],
  ['Günlük toplam sınır', 'Herhangi bir 24 saatte kasadaki paranın en çok %5\'i (kayan pencere; sahibin kontrattaki en üst sınırı %30)'],
  ['Ayar değişikliği', 'Sahibin önerdiği her değişiklik <b>24 saat</b> bekler; bekçi bu sürede iptal edebilir'],
  ['Acil durdurma', 'Sahip ve bekçi kasayı durdurabilir; durdurmak parayı hiçbir yere göndermez, yalnız kilitler'],
  ['Yeni kasaya geçiş', 'Yalnız hata durumunda: bekçi şart, <b>7 gün</b> bekler, günde en çok %25, hedef aynı token ve aynı yakım adresli bir kontrat olmak zorunda; sunucu bekleyen öneride ödemeyi durdurur'],
  ['Kontrat yükseltilebilir mi?', '<b>Hayır.</b> Kod sabittir; yalnız ayarlar (24 saat gecikmeyle) değişir']
])}
  <h3>Diğer kontratlar ve sunucu ayarları</h3>
${tablo(['Parça', 'Ne yapar?', 'Sınır / not'], [
  ['RealmPayments', 'Oyun içi ASTRA ödemelerini zincirde alır (pay(miktar, ref)).', 'Ağ ücretine ek komisyon = gaz fiyatı × 100.000 gaz (yaklaşık ağ ücreti kadar), AVAX olarak alınır'],
  ['RealmRates', 'Yakım, telif, temel gelir, kasa payları gibi bütün ASTRA oranlarını tutar.', 'Sahibin değişikliği 24 saat sonra geçerli olur; sunucu 5 dakikada bir okur'],
  ['Sıcak / soğuk cüzdan', 'Oyun cüzdanında yalnız ~1 haftalık ihtiyaç kadar ASTRA durur; fazlası günde bir kez donanım (soğuk) cüzdanına gider.', 'Sunucu soğuk cüzdanın yalnız adresini bilir'],
  ['Oyuncu kasaları', 'Her hesabın şifreli, sunucu yönetimli küçük cüzdanı.', 'Üst sınır: günlük ortalama harcama × 30 gün (en az 20.000 ASTRA); fazlası cüzdanına iade'],
  ['Haftalık gönderim tavanı', 'Sunucunun bir haftada oyunculara gönderebileceği toplam.', 'Varsayılan 100.000.000 ASTRA ve oyun cüzdanının bakiyesi'],
  ['Cüzdan değişikliği', 'Hesaba bağlı cüzdan değişince', '48 saat bekler, e-postaya "bu ben değilim" bağlantısı gider']
])}
  ${dikkat('Şu an hangi ağda?', '<p>Oyun şu an <b>test ağında</b> (Avalanche Fuji, sahte token) deneniyor; bu sayfadaki zincir sınırları kontratlarda aynıdır ama gerçek ağa geçmeden önce kontratlar bağımsız denetimden geçecektir.</p>')}`);

// ═══════════════════════════════════════════════════════════════════════════
const blok = [giris, limitler, akis, uretim, seviyeBolum, silo, kota, konsey, kilit, cekim, pazar, kasalar, savasBolum, koy, kazanc, gelir, fiyat, zincir].join('\n\n');
const govdeBlok = `${BASLA}\n\n${blok}\n\n${BITIS}`;

let mevcut = fs.readFileSync(HEDEF, 'utf8');
const bas = mevcut.indexOf(BASLA);
const bit = mevcut.indexOf(BITIS);
let yeni;
if (bas !== -1 && bit !== -1 && bit > bas) {
  yeni = mevcut.slice(0, bas) + govdeBlok + mevcut.slice(bit + BITIS.length);
} else {
  const hedefAnahtar = '<section class="bolum" id="gorevler"';
  const i = mevcut.indexOf(hedefAnahtar);
  if (i === -1) throw new Error('Yerleştirme noktası (gorevler bölümü) bulunamadı');
  yeni = mevcut.slice(0, i) + govdeBlok + '\n\n' + mevcut.slice(i);
}

if (process.argv.includes('--konsol')) {
  console.log(govdeBlok);
} else if (process.argv.includes('--kontrol')) {
  if (yeni !== mevcut) {
    console.error('✖ public/rehber.html "Teknik başvuru" bölümleri güncel değil. Çalıştır: node scripts/rehber-teknik-uret.mjs');
    process.exit(1);
  }
  console.log('✅ Teknik başvuru bölümleri güncel');
} else {
  fs.writeFileSync(HEDEF, yeni);
  console.log(`✅ ${path.relative(process.cwd(), HEDEF)} güncellendi (${blok.length} karakter, ${(blok.match(/<section /g) || []).length} bölüm)`);
}
process.exit(0);
