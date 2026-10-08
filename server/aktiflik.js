// Realm of AdAstra sunucusu — "aktif vatandaş" tek tanımı (E-planı S7, 8 Ekim 2026)
// ============================================================================
// docs/v2/KARARLAR_KESIN.md kapı bölümünde KAPI.ACTIVE_DAYS_PER_WEEK = 3 zaten tanımlıydı ama hiçbir yerde
// okunmuyordu; kapı ekranında "aktif vatandaş" diye bir sayı da yoktu (yalnız vatandaş/sırada/askıda sayılıyordu).
// Tanım: oyuncunun son 7 günde GERÇEKTEN hasat yaptığı (bir sefer tamamlayıp topladığı) farklı gün sayısı
// ACTIVE_DAYS_PER_WEEK'i (varsayılan 3) geçer veya eşitlerse "aktif vatandaş" sayılır.
//
// Veri kaynağı: js/gameState/ekonomi.js _recordUretimUse'un zaten tuttuğu state.uretim.activeDays (yeni bir
// izleme eklenmedi) — bir gün ancak sefer TAMAMLANIP toplanınca bu listeye girer, salt girişle girmez. Bu yüzden
// "≥3 gün VE ≥1 sefer" şartının ikinci yarısı ("≥1 sefer") otomatik sağlanır; ayrı bir sayaç gerekmez.
//
// BİLEREK dokunulmayanlar (bunlar farklı amaçlar için farklı eşikler kullanır, "tek tanım" bunları birleştirmez):
//  • Üretim Hakkı ağırlığı (js/gameState/ekonomi.js getUretimActivity): 0,25-1 arası SÜREKLİ bir oran (aynı
//    activeDays verisinden, ama eşiksiz) — kişisel hak hesaplamasının girdisi, boolean bir "aktif mi" değil.
//  • UBI hak sahipliği (server/world/haftalik.js): son 14 gün görülme — "hâlâ oyunda mı" sorusu, kapının
//    "gerçekten oynuyor mu" sorusundan ayrı ve daha gevşek bir eşik.
//  • Ücretsiz oyuncu havuzu (js/economy/faucet.js): son 7 gün görülme — sahte hesap karşıtı kendi kuralları var.
const DAY = 86400000;

// Oyuncunun son 7 günde (bugün dahil) sefer tamamlayıp topladığı farklı gün sayısı
export function activeDaysInLast7(playerState, now = Date.now()) {
  const days = (playerState && playerState.uretim && Array.isArray(playerState.uretim.activeDays)) ? playerState.uretim.activeDays : [];
  const today = Math.floor(Number(now) / DAY);
  return days.filter(d => Number(d) > today - 7 && Number(d) <= today).length;
}

// Kapı kuralının "aktif vatandaş" tanımı: son 7 günde ≥ minDays gün sefer tamamlanmış
export function isActiveCitizen(playerState, now = Date.now(), minDays = 3) {
  return activeDaysInLast7(playerState, now) >= (Number(minDays) || 3);
}
