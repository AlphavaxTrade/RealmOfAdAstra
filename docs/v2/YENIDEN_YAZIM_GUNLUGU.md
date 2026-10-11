# Eski kodun baştan yazımı: günlük (11 Ekim 2026)

Karar (kullanıcı): 29 Eylül 2026 öncesinden kalan kodun tamamı baştan yazılır; eski koda güvenilmez.
Ölçüm: `node scripts/eski-kod-olc.mjs` (git blame, sınır 2026-09-29).

## Yöntem (her modül için aynı)

1. **Eski davranışı dondur:** modülün eski sürümüyle rastgele ama tohumlu senaryolar koşulur, sonuç özetleri
   `tests/altin/*` altında altın kayıt olarak saklanır (yalnız eski kod bunu üretmiş olur).
2. **Yeni modülü temiz yaz:** aynı dışa açık işlev adları, aynı rastgele sayı sırası, ölü parçalar yok.
3. **Birebir eşleşme:** yeni modül altın kayıtla aynı sonucu vermeden kabul edilmez. Fark varsa ya hata düzeltilir
   ya da fark bilerek kabul edilir ve aşağıya "karar bekleyen" olarak yazılır.
4. **Tam test takımı + build + lint**, sonra commit. Eski dosya git geçmişinde durur.

Bilinen bir hatayı yeniden yazım sırasında sessizce düzeltmem: oyun dengesini değiştiriyorsa karar kullanıcıya gider.

## Yazılanlar

| Modül | Durum | Kanıt |
|---|---|---|
| `js/combat.js` (savaş motoru) | Yeniden yazıldı | `tests/test_savas_motoru_altin.mjs`: 1.500 savaş eski motorla birebir aynı |

### combat.js: kaldırılanlar
- **Kat etkisi (`modifier`)**: hiçbir yerden çağrılmıyordu (zindan hiç vermiyor; `config.js`'teki `DUNGEON_MODIFIERS` "henüz bağlı değil").
- **`element`, `revivedOnce`, `cooldowns`**: hiçbir yerde okunmuyordu (bir test `cooldowns`'u sabitliyordu; test gerçek alanı denetleyecek şekilde düzeltildi).
- `applyDamage`'in `canCrit` seçeneği: kimse kapatmıyordu.
- Birim kimliği artık `Math.random` yerine sayaçla üretiliyor (aynı çalışmada tekrarlanabilir).
- `predictBattle` isteğe bağlı `seedBase` alıyor (verilmezse eskisi gibi saat tohumu).
- "Son Nefes" açıklaması %20 diyordu, kod %25 uyguluyor: **metin** koda uyduruldu (davranış aynı).

## Karar bekleyen bulgular (davranışı değiştirir, bu yüzden dokunulmadı)

1. **Öfke sayacı büyümüyor.** Oyun "düşman her tur güçleniyor" diyor, ama 12. turdan sonra düşmana her tur aynı
   `rage` durumu (`stackable:false`) eklendiği için güç `+%18`'de sabit kalıyor (`RAGE_PER_ROUND`). Uzayan savaşlar
   metnin söylediğinden kolay. Düzeltmek zindan denge sayılarını değiştirir.
2. **Düşman tarafındaki oyuncu birimleri yeteneklerini kullanmıyor.** Motor yeteneği "müttefik" ise `skills`,
   "düşman" ise `abilities` alanından okuyor. Kolezyum rakibi (`skills: ['shieldWall','shockwave']`) ve gerçek PvP'de
   karşı taraf yalnız düz saldırı yapıyor. Düzeltmek kolezyum/PvP dengesini değiştirir.
3. **Hazır durumlar hiçbir yetenekten gelmiyor:** `burn`, `poison`, `haste`, `chill`, `weaken` motorda işleniyor
   ama onları üreten yetenek yok (Sahra Merhemi yalnız temizliyor). Ya yetenek eklenmeli ya da bu dallar sadeleşmeli.
