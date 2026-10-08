# ADR 0004: Oturum anahtarı tarayıcıda nerede durur?

Tarih: 8 Ekim 2026 · Durum: **Kabul edildi (geçici)**, Vercel çıkışında yeniden değerlendirilecek

## Bağlam
Oyuncunun giriş anahtarı bugün tarayıcıda `localStorage`'da durur (`js/net/online.js`) ve her istekte `Authorization: Bearer`
başlığıyla gider. Sunucu tarafında anahtar artık yalnız SHA-256 özetiyle saklanır (ADR dışı, A2.7).

`localStorage`, sayfaya sızan bir betik (XSS) tarafından okunabilir. En güvenli standart çözüm HttpOnly çerezdir (betik okuyamaz).

## Neden hemen değiştirilmedi
Oyunun statik dosyaları `realmofadastra.vercel.app` adresinden de sunulabiliyor, API ise başka bir adreste (`CORS_ORIGINS`).
Çapraz kaynaklı çerez (`SameSite=None; Secure`) hem tarayıcı kısıtlarına takılır hem CSRF koruması gerektirir.
Bearer başlığı çapraz kaynakta sorunsuz çalışır ve CSRF'e doğal olarak kapalıdır (başlığı başka site ekleyemez).

## Alınan azaltmalar
- Sayfa CSP'si `script-src 'self'`: dışarıdan betik yüklenemez, satır içi betik çalışmaz.
- Kullanıcı kaynaklı metinler kaynakta temizlenir, ekranda kaçışlanır, bildirimler düz yazıdır (A2.11).
- Anahtar 30 gün geçerli ve "bütün cihazlardan çık" ile iptal edilebilir; şifre sıfırlama bütün oturumları kapatır.
- Sunucuda yalnız özet saklanır; kayıt dosyası ele geçse bile anahtarlar kullanılamaz.

## Karar
Şimdilik Bearer + `localStorage`. Oyun tek alan adından (aynı kaynak) sunulmaya başlayınca:
1. Giriş yanıtı oturumu `HttpOnly; Secure; SameSite=Lax` çerez olarak koyar, gövdede anahtar dönmez.
2. Durum değiştiren istekler için `Origin` denetimi (yabancı kaynaktan gelen çerezli istek reddedilir).
3. `Authorization: Bearer` yalnız uygulama/kit istemcileri için kalır.
4. `SESSION_DAYS` 30 → 7 gün ve kayan yenileme.

Bu değişiklik Vercel yayınının kapanmasına bağlıdır (Aşama 1'de "kullanım dışı" işaretlendi).
