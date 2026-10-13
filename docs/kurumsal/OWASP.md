# OWASP Top 10 denetimi (kurumsal dönüşüm, Aşama 2, 8 Ekim 2026)

Yöntem: kodu elle okuma + araçlar (`npm run lint` güvenlik eklentisiyle, `npm run gizli-tara`, `npm run audit-uretim`,
`knip`) + bu aşamada yazılan testler. Her satırda: ne bulundu, ne yapıldı, hangi testle korunuyor, ne açık kaldı.

| # | Başlık | Bulgu ve yapılan | Koruyan test | Açık / kabul edilen |
|---|---|---|---|---|
| A01 | Erişim denetimi | Rotalar beyaz liste (`Object.hasOwn`), 10 herkese açık rota, gerisi oturum ister; yönetici ayrı şifreyle; kapı (vatandaş) denetimi işlem ve pazar uçlarında; `POST /api/dev/vanilla-reset` yalnız TEST_MODE. Kolezyum maç tekrarı **bilerek herkese açık** (numaralar sıralı); içinde hesap/cüzdan/e-posta yok, kimlik alanı yok. | `test_server_pvp` (2b), `test_v2_kapi`, `test_security_fixes` | Deneme sunucusunda giriş yapmış herkes `vanilla-reset` çağırabilir (yalnız TEST_MODE; gerçek sunucuda 404). |
| A02 | Şifreleme | **Oturum anahtarı** veritabanında SHA-256 özetiyle (A2.7). **Parola** scrypt N=65536 r=8 p=2, asenkron (A2.12a); eski özetler girişte yenilenir. **Rastgelelik**: piyango, PvP tohumu ve sunucudaki oyun sonuçları `crypto`'dan (A2.5); sunucuda `Math.random` ESLint ile yasak. Oyun Kasası anahtarları AES-256-GCM (`KASA_MASTER_KEY`). HSTS (HTTPS yayında) (A2.8). | `test_oturum_ozet`, `test_parola`, `test_rastgele` | Oyun cüzdanı özel anahtarı `.env`'de düz metin (mimari; sıcak/soğuk cüzdan ve `*_FILE` desteği Aşama 6). Oturum özeti tuzsuz SHA-256: 256 bit rastgele anahtar için yeterli (parola gibi tahmin edilemez). |
| A03 | Enjeksiyon | **SQL**: bütün sorgular hazır ifade; dinamik SQL yalnız sabit sütun/tablo listeleri (`ALTER TABLE` sütunları, `vanillaReset` tablo adları), kullanıcı girdisi hiçbir SQL parçasına girmiyor. **XSS**: isimler kaynakta `cleanName` ile temizlenir; ekranda `escHtml`/`esc()`; bildirim kutusu düz yazı (`textContent`); sayfa CSP'li (A2.11). **Bozuk girdi**: 66 işlem × uç değerler + 1131 bozuk girdi fuzz testi, sunucu hiç 500 vermedi. | `test_isim_temizleme`, `test_fuzz_islemler`, `test_security_fixes` | `js/app.js` içinde ~68 `innerHTML` var; kullanıcı kaynaklı alanlar elle gözden geçirildi, kalanlar oyunun kendi sabit verisi. Aşama 3'te arayüz bölünürken tekrar taranacak. |
| A04 | Güvensiz tasarım | Hız sınırları: IP (40/sn), oturum (15/sn), herkese açık uçlar (5/sn/IP), yönetici yanlış şifre (10/10 dk), giriş kilidi (e-posta 10, IP 50 / 15 dk), 2FA (5 deneme). Para yolları çift ödemeye karşı (imzala→kaydet→yayınla, `sending` durumu tekrar gönderilmez). | `test_server_payments`, `test_security_fixes` | Hız sınırı bellek içinde (tek süreç için yeterli; çok süreçli ölçeklemede ortak depo gerekir, `docs/kurumsal/ADR`). Ücretsiz havuz için çoklu hesap (sybil) kararı bekliyor (kullanıcı kararı gerekir). |
| A05 | Yanlış yapılandırma | Güvenlik başlıkları + COOP + HSTS; açık HTTP zaman aşımları (yavaş istemci kesilir, büyük başlık 431) (A2.8); TEST_MODE kilitleri (gerçek anahtarla/ağla açılmaz); `PAROLA_HAFIF` gerçek sunucuda reddedilir; hash'li dosyalara `immutable` önbellek. | `test_http_basliklar`, `test_security_fixes` | CSP `style-src 'unsafe-inline'` (arayüz satır içi stile dayanıyor; script tarafı `'self'` ile kilitli). Üretim ayar doğrulaması (zorunlu değişkenler) Aşama 6'da. |
| A06 | Eski bileşenler | `nodemailer` 6 → 10 (üretimdeki tek yüksek açık, A2.4). `npm run audit-uretim`: **0 açık**. `npm audit`'in 42 uyarısı ganache/webpack gibi **yalnız test** paketlerinden (üretimde kurulu değil). | `test_audit_uretim`, `test_mailer` | Dependabot Aşama 8'de. Test araçlarındaki uyarılar kabul (üretim imajına girmiyor). |
| A07 | Kimlik doğrulama | Güçlü parola özeti, giriş kilidi, TOTP 2FA + 10 yedek kod (scrypt + kod başına tuz; eski hızlı özetli kayıtlar çalışır, "yedek kodları yenile" ile yükseltilir), kayıt/giriş yanıtları hesabın varlığını sızdırmaz, şifre sıfırlamada bütün oturumlar kapanır, cüzdan değişimi 48 saat + e-posta onayı. | `test_oturum_ozet`, `test_parola`, `test_server_flow` | Oturum anahtarı tarayıcıda `localStorage` (bkz. ADR 0004); oturum süresi 30 gün (`SESSION_DAYS`), kısaltma önerilir. |
| A08 | Yazılım bütünlüğü | `package-lock.json` + `npm ci`; ödemeler zincirde doğrulanır (sunucu tarayıcıya güvenmez); sözleşme derleme çıktısı CI'da denetlenir. | `test_contract_payments`, `test_server_payments` | İmaj imzalama ve SBOM Aşama 8'de. |
| A09 | Günlük ve izleme | Yönetici POST'ları ve yetkisiz denemeler olay kaydına (gövde/şifre yazılmaz) (A2.9). `events` tablosu. | `test_yonetici_denetim_izi` | Yapılandırılmış log, metrik, uyarı Aşama 7'de. |
| A10 | SSRF | Sunucu dışarıya yalnız yapılandırmadaki zincir RPC adreslerine (`RPC_URLS`) ve e-posta sunucusuna (`SMTP_URL`) bağlanır; istek parametresinden gelen adrese gitmez (`fetch` yalnız tarayıcıdaki yönetici betiğinde). | (kod taraması) | Yok. |

## Bu aşamada bulunan ve kapatılan gerçek açıklar (özet)
1. Piyango ve oyun sonuçları tahmin edilebilir rastgelelikle çözülüyordu → `crypto`.
2. Oturum anahtarları veritabanında düz metindi → SHA-256 özeti, eski kayıtlar yerinde dönüştürüldü.
3. Parola özeti OWASP asgarisinin altındaydı ve sunucuyu bloklayabiliyordu → güçlü ve asenkron.
4. `nodemailer` yüksek riskli açığı → 10.0.16.
5. HSTS yoktu, HTTP zaman aşımları açık değildi → eklendi.
6. Yönetici işlemleri iz bırakmıyordu → denetim izi.
7. Kolezyum savaş kaydı ve bildirim kutusu `innerHTML` ile yazılıyordu → savunma katmanı eklendi.
8. Gerçek bir arayüz hatası: Karnaval "Hazine & Havuzlar" ekranındaki "Dünya Bossu" kısayolu olmayan bir fonksiyonu çağırıyordu → kaldırıldı.

## Otomatik kapılar (CI'da çalışacak, Aşama 8)
`npm run lint` (güvenlik eklentisi, uyarı tavanı), `npm run gizli-tara`, `npm run audit-uretim`, `npm test`.
