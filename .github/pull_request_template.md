## Ne değişti
<!-- Bir iki cümle; neden gerekliydi -->

## Nasıl doğrulandı
- [ ] `npm run kontrol` yeşil (lint, ölü kod, gizli bilgi, test+kapsam, derleme, üretim açığı)
- [ ] Yeni davranış için en az bir otomatik test eklendi
- [ ] Arayüz değiştiyse tarayıcıda denendi (yenileyince veri duruyor mu, konsol hatası, telefon genişliği)

## Para / zincir / oyun kuralı
- [ ] Ödeme, Kasa, zincir ya da oyun ekonomisi koduna dokunmadı
- [ ] Dokunduysa: karakterizasyon testi önce yazıldı, altın kayıt farkı yok (ya da bilinçli ve açıklandı)

## Gizli bilgi
- [ ] Diff'te anahtar, şifre, token yok (`npm run gizli-tara`)
- [ ] Yeni ortam değişkeni varsa `scripts/env-belge.mjs` ve `docs/kurumsal/ORTAM.md` güncellendi
