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
    { k: 'silo', s: '📦', ad: 'Silo ve depo', ac: 'Ambar doluluğu ve yükseltme' },
    { k: 'taverna', s: '🍺', ad: 'Taverna ve bot', ac: '24 saat kendiliğinden çalışan yardımcı', kilit: 'tavern' },
    { k: 'demirhane', s: '⚒️', ad: 'Demirhane', ac: 'Dövme, onarım, geri dönüşüm', kilit: 'blacksmith' },
    { k: 'sifahane', s: '🌿', ad: 'Şifahane', ac: 'Şifalı otla askerlerini iyileştir' },
    { k: 'koy', s: '🏘️', ad: 'Köy evleri', ac: 'Köylüler, emek ve nüfus' },
    { k: 'konsey', s: '🏛️', ad: 'Sirius Konseyi', ac: 'Kasalar, projeler, ortak kasa' },
    { k: 'uzay', s: '🚀', ad: 'Uzay Limanı', ac: 'Roket görevi ve hazırlık deposu' }
  ] },
  savas: { baslik: ['⚔️', 'Savaş'], ogeler: [
    { k: 'kisla', s: '⚔️', ad: 'Kışla', ac: 'Ordun, askerlerin ve teçhizatları', kilit: 'barracks' },
    { k: 'zindan', s: '💀', ad: 'Zindan', ac: 'Katlara in, canavarlarla savaş', kilit: 'dungeon' },
    { k: 'kolezyum', s: '🏟️', ad: 'Kolezyum', ac: 'Oyunculara karşı düello ve haftalık lig', kilit: 'colosseum' },
    { k: 'savasalani', s: '🚩', ad: 'Savaş alanı', ac: 'Haftalık dünya bossu', kilit: 'battlefield' }
  ] },
  pazar: { baslik: ['🏪', 'Pazar'], ogeler: [
    { k: 'pazar', s: '🏪', ad: 'Meydan pazarı', ac: 'Hammadde al-sat, teçhizat parçası, ilanlar', kilit: 'market' },
    { k: 'karnaval', s: '🎪', ad: 'Karnaval', ac: 'Şans çarkı ve haftalık piyango', kilit: 'carnival' },
    { k: 'koleksiyon', s: '👑', ad: 'Sandıklar ve koleksiyon', ac: 'Sandıkların, anahtarların, koleksiyonun' },
    { k: 'ekonomi', s: '📈', ad: 'Ekonomi panosu', ac: 'Oyunun parası nerede, ne kadar dönüyor' }
  ] },
  ben: { baslik: ['👤', 'Ben'], ogeler: [
    { k: 'oyunrehberi', s: '📖', ad: 'Oyun rehberi', ac: 'Bütün özellikler: resimli ve örnekli anlatım' },
    { k: 'profil', s: '🧙', ad: 'Karakterim', ac: 'Seviye, envanter ve ekipman' },
    { k: 'hesap', s: '🔐', ad: 'Hesap ve cüzdan', ac: 'Giriş, yatırma ve çekim' },
    { k: 'kotalar', s: '📊', ad: 'Kotalarım', ac: 'Haftalık ve günlük sınırların' },
    { k: 'hazine', s: '🏛️', ad: 'Hazine ve gelir panosu', ac: 'Kasalar, kapı durumu, katılım karnen' },
    { k: 'tur', s: '🎓', ad: 'Oyun turu', ac: 'Oyunu baştan, adım adım tanıt' },
    { k: 'rehber', s: '🧭', ad: 'Rehber ve yardım', ac: 'Görevler ve ödüller' },
    { k: 'komut', s: '🔎', ad: 'Ara ve git', ac: 'Her yere yazarak git (Ctrl+K)' },
    { k: 'ayarlar', s: '⚙️', ad: 'Ayarlar ve kısayollar', ac: 'Yazı boyutu, hareket, klavye kısayolları' },
    { k: 'duyurular', s: 'ℹ️', ad: 'Duyurular ve uyarılar', ac: 'Önemli bilgilendirmeler' },
    { k: 'surum', s: '📜', ad: 'Sürüm geçmişi', ac: 'Neler değişti' },
    { k: 'test', s: '🧪', ad: 'Test laboratuvarı', ac: 'Mekanikleri tek tek dene ve doğrula (yalnız deneme sürümünde)', yalnizTest: true }
  ] }
};


// Bir sekmenin ana listesinin HTML'i. getLock(anahtar) kilitliyse {reason} döner (oyunun getFeatureLock'u); testMenusuVar=false ise "yalnız test" öğeleri gizlenir.
export function hubHtml(id, getLock, testMenusuVar) {
  const h = HUB[id];
  const ogeler = h.ogeler.filter((o) => !(o.yalnizTest && !testMenusuVar));
  return `<div class="v3-hub">${ogeler.map((o) => {
    const kilit = o.kilit && getLock ? getLock(o.kilit) : null;
    return `<button type="button" class="v3-kart${kilit ? ' is-kilitli' : ''}" data-v3-git="${o.k}">
      <span class="v3-kart-simge" aria-hidden="true">${o.s}</span>
      <span class="v3-kart-govde"><b>${esc(o.ad)}</b><small>${kilit ? '🔒 ' + esc(kilit.reason) : esc(o.ac)}</small></span>
      <span class="v3-kart-ok" aria-hidden="true">›</span></button>`;
  }).join('')}</div>`;
}
