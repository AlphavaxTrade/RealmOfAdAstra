// Realm of AdAstra — v3 gezinme verisi: alt çubuk sekmeleri ve her sekmenin ana listesi (hub). DOM'a dokunmaz; testlerde doğrudan içe alınır.

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Alt çubuk sekmeleri → panel (hub) içerikleri. kilit: gameState.getFeatureLock anahtarı (kilitliyse nedenini gösterir)
export const SEKMELER = [
  { id: 'harita', simge: '🗺️', ad: 'Harita' },
  { id: 'kralik', simge: '🏰', ad: 'Krallık' },
  { id: 'savas', simge: '⚔️', ad: 'Savaş' },
  { id: 'pazar', simge: '🏪', ad: 'Pazar' },
  { id: 'ben', simge: '👤', ad: 'Ben' }
];

export const HUB = {
  kralik: { baslik: ['🏰', 'Krallık'], ogeler: [
    { k: 'merkez', s: '🏰', ad: 'Krallık merkezi', ac: 'Topla, onar, doldur: tek dokunuşla toplu işlemler' },
    { k: 'taverna', s: '🍺', ad: 'Taverna ve bot', ac: '24 saat kendiliğinden çalışan yardımcı', kilit: 'tavern' },
    { k: 'demirhane', s: '⚒️', ad: 'Demirhane', ac: 'Dövme, onarım, geri dönüşüm', kilit: 'blacksmith' },
    { k: 'koy', s: '🏘️', ad: 'Köy ve Konsey', ac: 'Köylüler, evler, ortak projeler ve katkın' },
    { k: 'uzay', s: '🚀', ad: 'Roket Rampası', ac: 'UOA ya geçiş roketi ve hazırlık deposu', minSeviye: 8 },
    // Menüde görünmeyen ama aranabilen / başka ekranlardan açılan ekranlar (Ctrl+K, bağlantılar): aynı işi yapan ekranlar tek girişte birleşti
    { k: 'silo', s: '📦', ad: 'Silo ve depo', ac: 'Ambar doluluğu ve yükseltme (Krallık merkezinden de açılır)', gizli: true },
    { k: 'sifahane', s: '🌿', ad: 'Şifahane', ac: 'Şifalı otla iyileştirme ayrıntıları (Kışla ekranından da yapılır)', gizli: true },
    { k: 'konsey', s: '🏛️', ad: 'Sirius Konseyi', ac: 'Katkı puanın, hızlı katkı, ortak projeler (Köy ve Konsey ekranında)', gizli: true }
  ] },
  savas: { baslik: ['⚔️', 'Savaş'], ogeler: [
    { k: 'kisla', s: '⚔️', ad: 'Kışla', ac: 'Ordun, askerlerin ve teçhizatları', kilit: 'barracks' },
    { k: 'zindan', s: '💀', ad: 'Zindan', ac: 'Katlara in, canavarlarla savaş', kilit: 'dungeon' },
    { k: 'kolezyum', s: '🏟️', ad: 'Arena', ac: 'Oyunculara karşı düello, haftalık lig ve dünya bossu', kilit: 'colosseum' },
    { k: 'zindanmod', s: '🗺️', ad: 'Zindan modu', ac: 'Normal, Zor, Uzman, Cehennem (Zindan ekranından da açılır)', kilit: 'dungeon', gizli: true },
    { k: 'savasalani', s: '🚩', ad: 'Savaş alanı', ac: 'Haftalık dünya bossu (Arena ekranında)', kilit: 'battlefield', gizli: true }
  ] },
  pazar: { baslik: ['🏪', 'Pazar'], ogeler: [
    { k: 'pazar', s: '🏪', ad: 'Meydan pazarı', ac: 'Hammadde al-sat, teçhizat parçası, ilanlar', kilit: 'market' },
    { k: 'karnaval', s: '🎪', ad: 'Karnaval', ac: 'Şans çarkı ve haftalık piyango', kilit: 'carnival' },
    { k: 'koleksiyon', s: '👑', ad: 'Sandıklar ve koleksiyon', ac: 'Sandıkların, anahtarların, koleksiyonun' }
  ] },
  ben: { baslik: ['👤', 'Ben'], ogeler: [
    { k: 'profil', s: '🧙', ad: 'Karakterim', ac: 'Seviye, stamina ve haftalık gelirin' },
    { k: 'hesap', s: '🔐', ad: 'Hesap ve cüzdan', ac: 'Giriş, yatırma ve çekim' },
    { k: 'oyunrehberi', s: '📖', ad: 'Oyun rehberi', ac: 'Bütün özellikler: resimli ve örnekli anlatım' },
    { k: 'rehber', s: '🧭', ad: 'Görevler ve yardım', ac: 'Sıradaki görevler ve ödüller' },
    { k: 'ayarlar', s: '⚙️', ad: 'Ayarlar', ac: 'Yazı boyutu, hareket, klavye kısayolları' },
    { k: 'sorunbildir', s: '📮', ad: 'Sorun bildir', ac: 'Hata, öneri ya da soru gönder; ekran görüntüsü ekle' },
    // Gelişmiş: yeni oyuncunun ilk bakışta ihtiyacı olmayan ekranlar tek katlı bölümde
    { k: 'kotalar', s: '📊', ad: 'Kotalarım', ac: 'Bugün ve bu hafta neler kaldı', gelismis: true },
    { k: 'hazine', s: '🏛️', ad: 'Hazine ve gelir panosu', ac: 'Kasalar, kapı durumu, katılım karnen', gelismis: true },
    { k: 'ekonomi', s: '📈', ad: 'Ekonomi panosu', ac: 'Oyunun parası nerede, ne kadar dönüyor', gelismis: true },
    { k: 'tur', s: '🎓', ad: 'Oyun turu', ac: 'Oyunu baştan, adım adım tanıt', gelismis: true },
    { k: 'komut', s: '🔎', ad: 'Ara ve git', ac: 'Her yere yazarak git (Ctrl+K)', gelismis: true },
    { k: 'duyurular', s: 'ℹ️', ad: 'Duyurular ve uyarılar', ac: 'Önemli bilgilendirmeler', gelismis: true },
    { k: 'surum', s: '📜', ad: 'Sürüm geçmişi', ac: 'Neler değişti', gelismis: true },
    { k: 'test', s: '🧪', ad: 'Test laboratuvarı', ac: 'Mekanikleri tek tek dene ve doğrula (yalnız deneme sürümünde)', yalnizTest: true, gelismis: true }
  ] }
};


// Bir sekmenin ana listesinin HTML'i. getLock(anahtar) kilitliyse {reason} döner (oyunun getFeatureLock'u); testMenusuVar=false ise "yalnız test" öğeleri gizlenir.
// seviye: oyuncunun hesap seviyesi (minSeviye'li öğeler ona kadar menüde görünmez; verilmezse hepsi görünür). gizli öğeler menüde yoktur (Ctrl+K ve bağlantılarla açılır).
export function hubHtml(id, getLock, testMenusuVar, seviye = 999) {
  const h = HUB[id];
  const gorunur = h.ogeler.filter((o) => !(o.yalnizTest && !testMenusuVar) && !o.gizli && !((o.minSeviye || 0) > seviye));
  const kart = (o) => {
    const kilit = o.kilit && getLock ? getLock(o.kilit) : null;
    return `<button type="button" class="v3-kart${kilit ? ' is-kilitli' : ''}" data-v3-git="${o.k}">
      <span class="v3-kart-simge" aria-hidden="true">${o.s}</span>
      <span class="v3-kart-govde"><b>${esc(o.ad)}</b><small>${kilit ? '🔒 ' + esc(kilit.reason) : esc(o.ac)}</small></span>
      <span class="v3-kart-ok" aria-hidden="true">›</span></button>`;
  };
  const ana = gorunur.filter((o) => !o.gelismis).map(kart).join('');
  const gelismis = gorunur.filter((o) => o.gelismis).map(kart).join('');
  return `<div class="v3-hub">${ana}${gelismis ? `<details class="v3-gelismis"><summary>Gelişmiş</summary><div class="v3-hub">${gelismis}</div></details>` : ''}</div>`;
}
