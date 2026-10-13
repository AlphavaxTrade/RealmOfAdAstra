# Claude Code proje kiti
## İçindekiler

```
proje/
  CLAUDE.md                 Claude'un uyduğu kurallar: gerçek backend + veritabanı, gizli bilgi, test, tarayıcıda doğrulama, loglama, git
  .claude/settings.json     İzinler (neyi sormadan yapar, neyi sorar, neyi asla yapmaz) ve otomasyonlar
  .claude/hooks/            Bildirim, otomatik format, oturum başı bilgisi, alt satır göstergesi
```

## Kurulum (her proje için 1 dakika)

1. `proje` klasörünün **içindekileri** (CLAUDE.md dosyası ve .claude klasörü) projenin ana klasörüne kopyala.
   Windows'ta `.claude` gizli görünebilir: Dosya Gezgini > Görünüm > Gizli öğeler'i aç.
2. Projenin klasöründe terminal aç ve `claude` yaz. Bypass bayrağı gerekmez.
3. İlk açılışta Claude Code "bu klasörün ayarlarına güveniyor musun" diye sorar; evet de.

Projede zaten bir `CLAUDE.md` varsa üzerine yazma; bu dosyanın içeriğini onun sonuna ekle.

## Gerekenler

- Claude Code (https://claude.com/claude-code)
- Git. Windows'ta "Git for Windows" kurulu olmalı; Claude Code bu otomasyonları onun bash'iyle çalıştırır.
- Python 3 (alt satır göstergesi ve format için). Yoksa yalnızca o iki özellik çalışmaz, gerisi çalışır.

## Ne değişir

- **Model:** varsayılan Claude Sonnet 5.5. Günlük işlerin neredeyse tamamı için yeterli ve Opus'tan belirgin şekilde ucuz. Çok zor bir problemde oturum içinde `/model opus` yazıp geçebilirsin; bir sonraki oturum yine Sonnet ile açılır, çünkü ayar dosyası proje klasöründe.
- **Sormadan yapar:** dosya okuma/yazma, test, paket kurma, git (push hariç), docker, veritabanı komutları.
- **Önce sorar:** git push, alt ajan açma, sunucuya bağlanma, yayına alma (vercel, netlify, supabase db push…), bulut komutları, veri silen docker komutları, ödeme (stripe).
- **Asla yapmaz:** force push, git geçmişini silme, `.env` ve anahtar dosyalarını okuma, sudo, sistemi bozabilecek komutlar.
- **Otomatik:** iş bitince ve onay beklerken masaüstü bildirimi; dosya yazılınca format; alt satırda model, bağlam doluluğu ve harcanan para.

## Arkadaşına not (kod bilmiyorsan)

Claude bu kitle bir asistan gibi çalışır: komutları kendisi çalıştırır, kurulumu kendisi yapar, siteyi tarayıcıda kendisi açıp dener, hatayı kendisi bulup düzeltir. Senden yalnızca karar, hesap/anahtar ve "yayına alayım mı" onayı ister.

Claude'a ne istediğini anlat, nasıl yapılacağını değil: "Müşterilerin randevu alabildiği, benim de panelden görebildiğim bir site" gibi. CLAUDE.md onu gerçek bir sunucu ve veritabanı kurmaya, test yazmaya, tarayıcıda kendisi denemeye ve sana sade bir rapor vermeye zorlar.

Her işin sonunda şu üçünü sor, cevap yoksa iş bitmemiştir:
1. Veriler gerçekten veritabanına kaydediliyor mu? Sayfayı yenileyince duruyor mu?
2. Testler çalıştı mı, geçti mi?
3. Tarayıcıda kendin denedin mi, ne gördün?
