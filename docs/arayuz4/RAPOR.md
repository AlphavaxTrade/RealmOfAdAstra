# Arayüz sadeleştirme: önce / sonra raporu

Ölçüm: `node scripts/tarayici/ekran-tara.mjs` (gerçek tarayıcı, zengin hesap: seviye 12, 4 asker, bol hammadde) + `tests/test_ekran_yogunluk.mjs` (kod tarafı tavanlar).
"Önce" ham ölçüm: `olcum-once-zengin.json`. Yükseklik = panelin kaydırma yüksekliği (px, telefon 390×844; panelin görünen alanı ~650-745 px).

## Önce (Aşama 0, 19 Ekim 2026, telefon)
| Ekran | Görünen harf | Etkin düğme | Kaydırma yüksekliği |
|---|---|---|---|
| Hazine | 1.791 | 9 | 3.245 |
| Sürüm geçmişi | 6.327 | 0 | 3.210 |
| Konsey | 2.658 | 14 | 2.855 |
| Karakterim | 2.010 | 5 | 2.357 |
| Demirhane | 1.112 | 8 | 1.914 |
| Pazar | 705 | 27 | 1.767 |
| Koleksiyon | 1.269 | 2 | 1.695 |
| Kışla | 834 | 24 | 1.476 |
| Kotalarım | 1.347 | 0 | 1.415 |
| Karnaval | 977 | 14 | 1.385 |
| Silo | 1.033 | 1 | 1.371 |
| Roket Rampası | 1.306 | 6 | 1.231 |
| Ekonomi | 908 | 3 | 1.210 |
| Taverna | 757 | 6 | 1.079 |
| Krallık merkezi | 425 | 3 | 745 |

## Görev dokunuş sayısı (önce, koddan çıkarıldı; sonra aşama 5'te ölçülecek)
| Görev | Önce | Hedef |
|---|---|---|
| Askere eşya tak | Savaş sekmesi → Kışla → asker → yuva → Tak = 5 dokunuş | ≤4 (Kışla'da askere dokun → yuva → Tak) |
| Yaralı askeri iyileştir | Krallık → Şifahane/Kışla → asker → Otla = 4-5 | 1-2 ("Hepsini iyileştir") |
| Seferleri topla | Krallık → Krallık merkezi → Topla = 3 | 2 |
| Siloyu yükselt | Krallık → Silo → Yükselt (eksik varsa Pazar'a gidip geri) = 3-8 | 3, eksik varsa panelde tek dokunuşla al |
| Eşya geliştir | Krallık → Demirhane → Eşyalarım → eşya → Geliştir (eksik: Pazar) = 5-9 | ≤4, Kışla yuvasından da |
| Konsey'e katkı | Krallık → Konsey → hızlı katkı kutusu → düğme → onay = 5 | 4 |

## Aşama 1 + 2 (v1.86, 20 Ekim 2026): Kışla, Demirhane, menü, Krallık merkezi, Köy+Konsey, Arena
- Kışla: ordu özeti tek satır + 2 düğme; telefonda yatay asker şeridi; yuva paneli = takılı eşya Geliştir (eksik al) / Çıkar + uygun eşya listesi + depo boşsa "yeni döv"; yaralı rozeti; görünür düğme 24 → 14 (görünür yazı 1.225 → 663).
- Demirhane: bedel tek satır, tek ana düğme; görünür harf 1.112 → 838.
- Menü: Krallık 8 → 5, Savaş 5 → 3, Pazar 4 → 3, Ben 14 → 6 + "Gelişmiş"; Köy|Konsey ve Kolezyum|Dünya bossu tek giriş, iki sekme; Silo/Şifahane/Savaş alanı/Zindan modu/Konsey ayrı girişten kalktı ama Ctrl+K ve bağlantılarla hâlâ açılır (eski kimlikler çalışır).
- Krallık merkezi: "Şimdi yapılacaklar" listesi (tek dokunuşluk eylemler), toplu işlemler katlı.
- Ölçüm yöntemi değişti: yoğunluk testi artık katlı bölümlerin gövdesini saymaz (oyuncu ilk bakışta yalnız başlığı görür); tavanlar yeni ölçüme göre yazıldı.
- Gerçek tarayıcı: `scripts/tarayici/menu-gez.mjs` (menü, gelişmiş kat, Köy→Konsey ve Kolezyum→Dünya bossu geçişi, Şimdi yapılacaklar) ve `kisla-akis.mjs` (asker seç → yuva → panel) 390×844'te geçti.

## Aşama 3 (v1.86, 20 Ekim 2026): yoğun ekranlar + teçhizat ASTRA bedeli
Görünür (katlı bölümlerin gövdesi hariç) harf, önce → sonra: Sürüm geçmişi 6.327 → 967 · Konsey 2.679 → 1.350 · Hazine 1.789 → 453 · Karakterim 1.712 → 988 · Kotalarım 1.364 → 1.257 · Roket Rampası 1.306 → 956 · Koleksiyon 1.269 → 738 · Silo 960 → 725 · Pazar düğme 23 → 17 (Satın al / Sat iki sekme).
Teçhizat yükseltme: ASTRA bedeli = hammadde pazar değeri × (3 × 1,35^(hedef sv − 2)); 1→10 toplam ~12.700 → ~320.000 ASTRA (`tests/test_techizat_astra_bedeli.mjs`). Ham madde adetleri silo kapasitesine sığma kuralı yüzünden değişmedi.
Not: `scripts/tarayici/pazar-grafik.mjs` (kendi sunucusunu kuran eski betik) bu oturumda sayfa yüklemede zaman aşımına uğradı; Pazar ekranı yeni sürümle `test_pazar_hizli_al`, `test_ekran_cizim` testlerinden geçti ama bu betik yeniden çalıştırılıp doğrulanmadı.
