# Arayüz envanteri (8 Ekim 2026) — yeni UX/UI çalışmasının Aşama 0'ı

Ölçüm: deneme sunucusu (8080), deneme hesabı (Sv.30), Chrome ile iki ekran boyutu: masaüstü 1280×800 ve telefon 390×844. Ekran görüntüleri geçicidir (depoya konmadı); ölçüm betiği de geçici klasördeydi. Hiçbir eylem düğmesine basılmadı, sadece ekranlar açıldı. Konsolda **sıfır hata** çıktı; sorunlar hata değil, kullanım sorunu.

## En önemli bulgular (önem sırasıyla)

1. **Telefonda üst çubuk bozuk.** Kaynak hapları (odun, taş…) ikinci satıra taşıp haritanın üstüne biniyor; ayrıca "Risk uyarısı" kayan şeridi bir satırı sürekli yiyor. İlk bakışta ekran dağınık görünüyor.
2. **Aynı yere 3-4 ayrı yoldan gidiliyor, ama hiçbirinde tam menü yok.** Pazar: yan menü, alt çubuk, harita, parça hapı. Bot: üst şerit, yan çubuk hapı, alt çubuk, taverna. Karnaval: üst şerit, yan menü, haritadaki çark. Yeni oyuncu hangisinin "asıl" yol olduğunu anlayamaz.
3. **Telefonda ana menünün yarısı ekranın dışında.** "Menü" sekmesini açınca önce sefer kartları ve Üretim Hakkı geliyor; Envanter, Zindan, Karnaval, Taverna düğmeleri ekranın altında, kaydırmadan görünmüyor (otomatik tıklama bile "ekran dışı" dedi).
4. **Pazar çok uzun ve ağır.** Masaüstünde 3.006 px, telefonda 3.879 px kaydırma; 4-5 sekme ("Hammadde & Pandora Havuzları", "Teçhizat Parçaları", "P2P Koleksiyon", "Otonom Buyback & Yakım", "İlan Pazarı"). Ekranda 6 küçük (36 px altı) dokunma hedefi.
5. **Test menüsü düz ve tehlikeli.** Tek uzun liste, 58 etkileşim öğesi, bunların 35'i 36 px'ten küçük. En üstte kırmızı "100M tohumuna & vanilla hesaba sıfırla" düğmesi duruyor (onay istiyor mu: Aşama 4'te kontrol edilecek). Hangi düğmenin hangi mekaniği sınadığı, beklenen sonucun ne olduğu yazmıyor.
6. **Telefonda küçük dokunma hedefleri çok:** Kışla ekranında 24 etkileşimin 10'u 36 px'ten küçük; Pazar'da 6; ana ekranda 2-3.
7. **Terimler yabancı ve teknik, Türkçe-İngilizce karışık:** AMM, Buyback, P2P, Tokenomics, "Makro Simülatör", "Havuz", "Üretim Hakkı", "vanilla". Açıklama/“?” yok.
8. **Yeni oyuncu rehberi küçük bir kutu** (sol altta "Krallık Rehberi 1/10"); haritanın ve telefonda alt çubuğun üstüne biniyor. Yönlendirme yok, ilk girişte bir tur yok.
9. **Sürüm geçmişi penceresi 28.701 karakter, 7.972 px uzunluğunda**; bu bir "bildirim" değil, belge.
10. **Masaüstünde üst şeritte etiketsiz simgeler:** kale, nokta, bot, kalem simgeleri ne olduğunu söylemiyor (etiketler dar ekranda gizli).

## Ekran ekran (kaydırma yüksekliği px / etkileşim / küçük hedef)

| Ekran | Masaüstü | Telefon | Not |
|---|---|---|---|
| Açılış (harita) | 800 / 17 / 3 | 844 / 17 / 2 | telefonda üst çubuk taşması (bulgu 1) |
| Krallık merkezi | 746 / 4 / 0 | 1172 / 4 / 0 | "Tek dokunuşla toplu işlemler" iyi fikir; sefer takipçisi ve alet dayanıklılığı yan çubukla yinelenir |
| Taverna & Bot | 654 / 6 / 3 | 1030 / 4 / 1 | 3 giriş yolu |
| Pazar | 3006 / 17 / 6 (5 sekme) | 3879 / 16 / 6 (4 sekme) | bulgu 4 |
| Kolezyum | 687 / 10 / 3 (3 sekme) | 966 / 9 / 0 | |
| Sandıklar & NFT | 631 / 3 / 2 | 721 / 3 / 2 | başlık "18 parçalık NFT koleksiyonu & Pandora kutuları" |
| Envanter | 2124 / 1 / 0 | (ölçülemedi: ekran dışı) | uzun tek sayfa |
| Kışla | (pencere olarak açılmadı: ayrı ekran) | 1485 / 24 / 10 (2 sekme) | arama, süzgeç, sıralama, taktik, toplu eylem aynı ekranda |
| Zindan, Karnaval, Taverna (yan menü) | ayrı sahne/pencere | ölçülemedi (ekran dışı) | |
| 6 kaynak bölgesi (telefon) | — | ~590-600 karakter, 2 etkileşim | sade ve iyi; örnek alınacak kalıp |
| Test menüsü | 800 / 58 / 35 | — | bulgu 5 |
| Sürüm geçmişi | 7972 / 0 | — | bulgu 9 |

## Ölçülemeyenler (dürüst not)
Masaüstünde "Kotalar", "Karnaval" üst düğmeleri ve tek tek kaynak hapları betikle tıklanamadı ("görünür değil" yanıtı); ekran görüntüsünde hapların göründüğü için nedeni (aynı kimlikli gizli kopya mı, örtülü mü) belirsiz. Kışla/Zindan/Karnaval/Taverna'nın masaüstü ve telefon ayrıntıları Aşama 2'de ilgili ekran taşınırken tek tek ölçülecek.

## Bundan çıkan tasarım girdileri (plana işlendi)
- Üst HUD tek satıra inmeli; kaynaklar telefonda "tek hap + dokununca açılır" olmalı; risk uyarısı kayan şerit yerine tek satırlık kapatılabilir bilgi.
- Her hedefe tek "asıl yol" (5 sekme); yan çubuk ve üst şerit menüleri sekmelere dağılır.
- Altı bölge penceresi gibi sade kalıp (başlık + 1 birincil eylem + 2 satır bilgi) tüm ekranlara örnek.
- Pazar: "Al/Sat · İlan · Yakım" üç bölüm; diğer ayrıntı katlı.
- Test Laboratuvarı: yıkıcı eylemler ayrı ve onaylı; her kartta "ne sınar / beklenen sonuç".
- Sürüm geçmişi: son 3 sürüm özet + "tümü" bağlantısı.
- Tüm dokunma hedefleri ≥ 44 px (telefon).
