# Realm of Astra — Sunucu Kurulumu

Bu belge, oyunu bir sunucuda çevrimiçi (gerçek ADASTRA ile) çalıştırmak içindir. Sunucu tek bir program: oyunun kendisini de sunar, oyuncuların kayıtlarını tutar, haftalık ekonomi hesaplarını yapar ve ADASTRA gönderir.

## Ne gerekiyor?

- Linux bir sunucu (en az 1 işlemci, 1 GB bellek yeterli) ve üzerinde **Docker**.
- Bir alan adı ve HTTPS. Cüzdanla giriş HTTPS ister. Önüne Caddy ya da Nginx konabilir; aşağıda Caddy örneği var.
- **Oyun cüzdanı:** Yalnızca bu oyun için açılmış yeni bir Avalanche cüzdanı.
  - İçinde oyunun ihtiyacı kadar ADASTRA (başlangıç: 200 milyon) ve işlem ücretleri için biraz AVAX (ör. 1-2 AVAX) olsun.
  - Kişisel cüzdanını **kullanma**.

## 1. Kodu sunucuya al

```bash
git clone https://github.com/blockchainary/AdAstra-Game-1.git realm
cd realm
```

## 2. Ayarları gir

```bash
cp server/.env.example server/.env
nano server/.env
```

Doldurulacaklar:

| Ayar | Ne yazılır |
|---|---|
| `ADMIN_TOKEN` | Uzun, rastgele bir şifre (ör. `openssl rand -hex 32` çıktısı). Yönetici panelinin şifresi. |
| `GAME_WALLET_PRIVATE_KEY` | Oyun cüzdanının gizli anahtarı. Sunucu çekimleri bununla gönderir. |
| `PAYOUT_MODE` | `auto`: sunucu kendisi gönderir. `manual`: yönetici panelinden onaylayınca gönderir. |
| `WEEKLY_SEND_CAP_ADA` | Bir haftada oyunculara gidebilecek en fazla ADA. Güvenlik sınırıdır. |
| `LAUNCH_PRICE_USD` | 1 ADASTRA'nın açılış fiyatı ($). Boş kalırsa sunucunun ilk okuduğu fiyat kullanılır. |

⚠️ `server/.env` dosyası gizlidir; GitHub'a gönderilmez, kimseyle paylaşılmaz.

## 3. Çalıştır

```bash
docker compose up -d --build
docker compose logs -f        # "Realm of Astra sunucusu çalışıyor" satırını gör
```

Oyun `http://SUNUCU:8080` adresinde açılır. Kayıtlar sunucudaki `data/realm.db` dosyasındadır; bu dosyayı düzenli yedekle.

## 4. HTTPS (Caddy örneği)

`/etc/caddy/Caddyfile`:

```
oyun.alanadin.com {
    reverse_proxy localhost:8080
}
```

`sudo systemctl reload caddy`. Bundan sonra oyun `https://oyun.alanadin.com` adresinden açılır.

## 5. Yönetici paneli

`https://oyun.alanadin.com/admin`. Şifre `ADMIN_TOKEN`. Panelde şunlar görünür:

- Oyun cüzdanındaki ADA, ADASTRA fiyatı, piyasa değeri, fren durumu ve fiyat çarpanı
- Bu haftaki çekim sınırı, oyuncu sayıları, bekleyen çekim talepleri ve hazine kasaları
- Son haftalık hesaplaşmanın özeti, bütün ödemeler (zincirdeki işlem bağlantısıyla) ve olaylar

Düğmeler:

- **⏸️ Durdur:** Çekim talepleri ve zincir ödemeleri hemen durur. Bir sorun görürsen ilk bunu kullan.
- **▶️ Devam ettir:** Durdurmayı kaldırır.
- **📤 Bekleyen ödemeleri şimdi gönder:** `manual` modda ödemeler bu düğmeyle gider.

"⚠️ gönderiliyordu" durumundaki bir ödeme, sunucu gönderim sırasında kapanmış demektir. Sunucu böyle bir ödemeyi **çift ödeme olmasın diye kendiliğinden tekrar göndermez**. İşlemin zincirde gerçekleşip gerçekleşmediğine snowtrace.io'dan bak.

## Oyun nasıl işliyor? (kısa)

- Oyuncu cüzdanıyla (Core / MetaMask) imza atarak girer. İmza hiçbir işlem ya da ücret onaylamaz.
- Bütün oyun işlemleri sunucuda çalışır. Tarayıcıdan gelen hile girişimleri (bakiye değiştirme, test düğmeleri, sahte eşya) reddedilir.
- **Yatırma:** Oyuncu kendi cüzdanından oyun cüzdanına ADASTRA gönderir. Birkaç dakika içinde serbest bakiyesine eklenir.
- **Çekim:**
  - Oyuncu serbest bakiyesinden talep verir. Talepler her **Pazartesi 00:01 (TSİ)** ortak haftalık havuzdan karşılanır.
  - Havuzun büyüklüğü, satıldığında ADASTRA fiyatını en fazla %2 düşürecek miktardır. Havuz katkı puanına göre paylaşılır.
  - Ücret %3'tür (fiyat freni açıkken %6). Ücretin %70'i temel gelire gider, %30'u yakılır. Başkasının kullanmadığı hakkı kullanan, %1,5 hak kirası öder.
- **Haftalık işler:**
  - Ücretsiz oyuncu payı dağıtılır.
  - Ortak piyango çekilir; haftada tek kazanan çıkar.
  - Fiyat çarpanı ve temel gelir güncellenir.
  - Oyun içi yakım ölü adrese, yapımcı payı `0x58DBCF66bdd7BfA9da98aDba1965b3794321087C` cüzdanına gönderilir.

## Güncelleme

```bash
git pull
docker compose up -d --build
```

## Sorun giderme

- **"Oyun dosyaları bulunamadı":** Paketi yeniden kur: `docker compose up -d --build`.
- **Panelde "Otomatik (anahtar yok!)":** `GAME_WALLET_PRIVATE_KEY` boş. Ödemeler gönderilmez, panelden onay bekler.
- **Yatırmalar görünmüyor:** Zincir bağlantısına bak (`docker compose logs`). Sunucu yatırmaları 2 dakikada bir tarar. Oyuncunun yatırmayı oyuna girdiği cüzdandan yapmış olması gerekir.
