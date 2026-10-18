# Veritabanı şeması (SQLite)

> Bu dosya **otomatik üretilir**: `node scripts/db/sema-belge.mjs` (güncelliği `tests/test_sema_belge.mjs` korur).
> Şema değişikliği yalnız `server/gecis/` altına yeni numaralı geçiş eklenerek yapılır; uygulanmış geçişler değişmez (mühür).

Geçişler: 001_taban, 002_kolonlar, 003_oturum_ozet, 004_indeksler, 005_eposta_anahtari, 006_kapi_ip, 007_eposta_belirtec_ozeti, 008_muhur_sifirlama, 009_geri_bildirim, 010_denge

## accounts

Hesaplar: e-posta (+ benzersiz email_key), parola özeti, doğrulama, bağlı/bekleyen cüzdan, iki adımlı doğrulama (sır şifreli)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| id | INTEGER |  |  | PK |
| email | TEXT | evet |  |  |
| pass_hash | TEXT | evet |  |  |
| email_verified | INTEGER | evet | 0 |  |
| created_at | INTEGER | evet |  |  |
| wallet | TEXT |  |  |  |
| wallet_set_at | INTEGER |  |  |  |
| pending_wallet | TEXT |  |  |  |
| pending_confirmed | INTEGER | evet | 0 |  |
| pending_active_at | INTEGER |  |  |  |
| totp_secret | TEXT |  |  |  |
| totp_pending | TEXT |  |  |  |
| totp_enabled | INTEGER | evet | 0 |  |
| totp_step | INTEGER | evet | 0 |  |
| backup_codes | TEXT |  |  |  |
| email_key | TEXT |  |  |  |
| totp_reset_at | INTEGER |  |  |  |
| totp_reset_note | TEXT |  |  |  |

İndeksler: `accounts_bekleyen_cuzdan`, `accounts_email_key`

## denge_goruntu

Denge İzleme: günde bir kez tüm oyuncu kayıtlarından çıkarılan dağılımlar (JSON; seviye, asker, teçhizat, zindan ilerlemesi, mod)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| gun | TEXT |  |  | PK |
| veri | TEXT | evet |  |  |

## denge_gunluk

Denge İzleme: gün + anahtar başına sayaç ve toplam (zindan savaşları, teçhizat/ordu/seviye harcamaları); ortalama = toplam / adet

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| gun | TEXT | evet |  | PK |
| anahtar | TEXT | evet |  | PK |
| adet | INTEGER | evet | 0 |  |
| toplam | REAL | evet | 0 |  |

İndeksler: `denge_gunluk_anahtar`

## denge_ilk

Denge İzleme: bir oyuncunun bir zindan canavarını bir modda ilk yendiği hesap günü (oyuncu tuzlu kısa özet; medyan hesabı için)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| oyuncu | TEXT | evet |  | PK |
| mod | INTEGER | evet |  | PK |
| seviye | INTEGER | evet |  | PK |
| hesap_gunu | REAL | evet |  |  |
| at | INTEGER | evet |  |  |

İndeksler: `denge_ilk_canavar`

## deposits

Zincirden gelen yatırmalar (tx + log sırası = tekil)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| tx_hash | TEXT | evet |  | PK |
| log_index | INTEGER | evet |  | PK |
| address | TEXT | evet |  |  |
| amount | REAL | evet |  |  |
| block | INTEGER | evet |  |  |
| credited_at | INTEGER |  |  |  |

İndeksler: `deposits_adres_blok`, `deposits_bekleyen`

## email_tokens

E-posta bağlantıları (doğrulama, şifre sıfırlama, cüzdan onayı); belirteç yalnız SHA-256 özeti

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| token | TEXT |  |  | PK |
| account_id | INTEGER | evet |  |  |
| kind | TEXT | evet |  |  |
| data | TEXT |  |  |  |
| expires | INTEGER | evet |  |  |

İndeksler: `email_tokens_bitis`, `email_tokens_hesap`

## events

Olay günlüğü (giriş, yönetici işlemleri, kapı...)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| id | INTEGER |  |  | PK |
| at | INTEGER | evet |  |  |
| address | TEXT |  |  |  |
| type | TEXT | evet |  |  |
| data | TEXT |  |  |  |

## geri_bildirim

"Sorun bildir" biletleri: no = bilet numarası (RB-1001…), konu, mesaj, durum, yönetici cevabı, tarayıcı bağlamı ve sunucunun eklediği oyuncu özeti (JSON)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| no | INTEGER |  |  | PK |
| player | TEXT | evet |  |  |
| konu | TEXT | evet |  |  |
| mesaj | TEXT | evet |  |  |
| durum | TEXT | evet | 'yeni' |  |
| cevap | TEXT | evet | '' |  |
| cevap_at | INTEGER |  |  |  |
| baglam | TEXT |  |  |  |
| ozet | TEXT |  |  |  |
| ek_sayisi | INTEGER | evet | 0 |  |
| at | INTEGER | evet |  |  |
| guncel | INTEGER | evet |  |  |

İndeksler: `geri_bildirim_durum`, `geri_bildirim_oyuncu`

## geri_bildirim_ek

Bir biletin ekran görüntüleri (en çok 4; data: URL, ayrı tablo ki liste sorguları büyük satır taşımasın)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| no | INTEGER | evet |  | PK |
| sira | INTEGER | evet |  | PK |
| veri | TEXT | evet |  |  |

## kapi_ip_kabul

Kapı: hangi (tuzlu özetli) istemci adresinden kim ne zaman vatandaş oldu (24 saatlik adres kotası; ham adres yok)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| id | INTEGER |  |  | PK |
| ip | TEXT | evet |  |  |
| player | TEXT | evet |  |  |
| at | INTEGER | evet |  |  |

İndeksler: `kapi_ip_kabul_at`, `kapi_ip_kabul_ip_at`

## kasa

Oyun Kasası: oyuncu başına sunucu yönetimli cüzdan (anahtar şifreli)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| player | TEXT |  |  | PK |
| address | TEXT | evet |  |  |
| key_enc | TEXT | evet |  |  |
| created | INTEGER | evet |  |  |
| pending | REAL | evet | 0 |  |
| settled | REAL | evet | 0 |  |
| approved | INTEGER | evet | 0 |  |
| ada | REAL | evet | 0 |  |
| avax | REAL | evet | 0 |  |
| bal_at | INTEGER | evet | 0 |  |
| last_settle | INTEGER | evet | 0 |  |

## kasa_ops

Kasa zincir işlemleri

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| id | INTEGER |  |  | PK |
| player | TEXT | evet |  |  |
| kind | TEXT | evet |  |  |
| amount | REAL | evet |  |  |
| status | TEXT | evet | 'pending' |  |
| tx_hash | TEXT |  |  |  |
| raw_tx | TEXT |  |  |  |
| tx_nonce | INTEGER |  |  |  |
| error | TEXT |  |  |  |
| created | INTEGER | evet |  |  |
| done_at | INTEGER |  |  |  |

İndeksler: `kasa_ops_durum_id`, `kasa_ops_oyuncu_id`

## kasa_usage

Kasa günlük harcama toplamı (üst sınır hesabı için)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| player | TEXT | evet |  | PK |
| day | TEXT | evet |  | PK |
| ada | REAL | evet |  |  |

## kv

Anahtar-değer deposu: oyuncu kayıtları (`ls:player:<id>`), dünya durumu (`world:*`), Kolezyum maçları (`pvp:match:<n>`), deneme e-posta kutusu

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| key | TEXT |  |  | PK |
| value | TEXT | evet |  |  |

## listings

İlan pazarı (teçhizat)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| id | INTEGER |  |  | PK |
| seller | TEXT | evet |  |  |
| item | TEXT | evet |  |  |
| price | REAL | evet |  |  |
| created_at | INTEGER | evet |  |  |
| expires | INTEGER | evet |  |  |
| status | TEXT | evet | 'active' |  |
| buyer | TEXT |  |  |  |
| closed_at | INTEGER |  |  |  |

İndeksler: `listings_alici`, `listings_satici`, `listings_status`

## nonces

Cüzdan imzası için tek kullanımlık mesajlar (eski düzen)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| address | TEXT |  |  | PK |
| nonce | TEXT | evet |  |  |
| expires | INTEGER | evet |  |  |

İndeksler: `nonces_bitis`

## partner_income

Trade sitesinden gelen ADASTRA transferleri (her biri bir kez sayılır)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| tx_hash | TEXT | evet |  | PK |
| log_index | INTEGER | evet |  | PK |
| sender | TEXT | evet |  |  |
| amount | REAL | evet |  |  |
| block | INTEGER |  |  |  |
| at | INTEGER | evet |  |  |

## pay_quotes

Cüzdandan ödeme teklifleri

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| ref | TEXT |  |  | PK |
| player | TEXT | evet |  |  |
| name | TEXT | evet |  |  |
| args | TEXT | evet |  |  |
| amount | REAL | evet |  |  |
| created | INTEGER | evet |  |  |
| expires | INTEGER | evet |  |  |
| status | TEXT | evet | 'open' |  |
| tx_hash | TEXT |  |  |  |
| paid | REAL |  |  |  |

İndeksler: `pay_quotes_durum`

## payouts

Zincire gönderilecek/gönderilmiş ödemeler (pending → sending → sent)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| id | INTEGER |  |  | PK |
| epoch | INTEGER | evet |  |  |
| kind | TEXT | evet |  |  |
| address | TEXT | evet |  |  |
| amount | REAL | evet |  |  |
| status | TEXT | evet | 'pending' |  |
| tx_hash | TEXT |  |  |  |
| error | TEXT |  |  |  |
| created_at | INTEGER | evet |  |  |
| sent_at | INTEGER |  |  |  |
| raw_tx | TEXT |  |  |  |
| tx_nonce | INTEGER |  |  |  |

İndeksler: `payouts_adres_id`, `payouts_durum_gonderim`, `payouts_durum_id`, `payouts_epoch`

## players

Oyuncu satırı: son görülme, yatırma/çekim toplamı, yasak, kapı durumu (vatandaş / sıra / askı)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| address | TEXT |  |  | PK |
| created_at | INTEGER | evet |  |  |
| last_seen | INTEGER | evet |  |  |
| deposited_ada | REAL | evet | 0 |  |
| withdrawn_ada | REAL | evet | 0 |  |
| pending_withdraw | REAL | evet | 0 |  |
| banned | INTEGER | evet | 0 |  |
| gate | TEXT | evet | 'new' |  |
| gate_at | INTEGER |  |  |  |
| gate_prio | INTEGER | evet | 0 |  |
| warned_at | INTEGER |  |  |  |
| kayit_ip | TEXT |  |  |  |

İndeksler: `players_banned_gate`, `players_kayit_ip`

## prices

ADASTRA fiyat örnekleri

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| at | INTEGER |  |  | PK |
| price_usd | REAL |  |  |  |
| mcap_usd | REAL |  |  |  |
| supply | REAL |  |  |  |
| dead | REAL |  |  |  |
| avax_usd | REAL |  |  |  |
| graduated | INTEGER |  |  |  |

## promo_codes

Promo kodları

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| code | TEXT |  |  | PK |
| reward | TEXT | evet |  |  |
| max_uses | INTEGER | evet | 0 |  |
| used | INTEGER | evet | 0 |  |
| expires | INTEGER | evet | 0 |  |
| active | INTEGER | evet | 1 |  |
| note | TEXT |  |  |  |
| created | INTEGER | evet |  |  |

## promo_pending

Kayıtta girilen, doğrulamada kullanılacak promo kodu

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| player | TEXT |  |  | PK |
| code | TEXT | evet |  |  |
| at | INTEGER | evet |  |  |

## promo_uses

Promo kodu kullanımları

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| code | TEXT | evet |  | PK |
| player | TEXT | evet |  | PK |
| at | INTEGER | evet |  |  |

## schema_migrations

Uygulanmış şema geçişleri (sürüm, ad, zaman)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| surum | INTEGER |  |  | PK |
| ad | TEXT | evet |  |  |
| uygulandi | INTEGER | evet |  |  |

## sessions

Oturumlar (anahtarın SHA-256 özeti saklanır; düz anahtar asla)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| token | TEXT |  |  | PK |
| address | TEXT | evet |  |  |
| expires | INTEGER | evet |  |  |

İndeksler: `sessions_adres`, `sessions_bitis`

## wallet_nonces

Cüzdan bağlama imza mesajları

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| account_id | INTEGER |  |  | PK |
| address | TEXT | evet |  |  |
| message | TEXT | evet |  |  |
| expires | INTEGER | evet |  |  |

## withdraw_log

Haftalık çekim hesaplaşması kaydı (oyuncu başına)

| Sütun | Tür | Zorunlu | Varsayılan | Anahtar |
|---|---|---|---|---|
| epoch | INTEGER | evet |  | PK |
| address | TEXT | evet |  | PK |
| data | TEXT | evet |  |  |
