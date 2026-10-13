// Realm of Astra — açılış betiği (index.html'den ayrıldı: tarayıcı koruması (CSP) sayfaya gömülü kodu çalıştırmaz)
// Açılış perdesi (denetim QA-10): eskiden 2,5 saniyede HER durumda kapanıyordu; sunucu yavaşken (oyun 12-20 sn sonra açılıyor)
// oyuncu boş koyu ekrana bakıyordu. Şimdi perde oyun gerçekten hazır olana dek (window.__v3: üst çubuk, sekmeler ve harita kurulunca
// js/ui/v3/kabuk.js koyar) açık kalır, "Krallığa bağlanılıyor" yazar; 45 saniyede oyun açılmazsa açıklayıcı hata ve "Yeniden dene" gösterir.
// JS modülü hiç yüklenemese bile (ağ, eski tarayıcı) betik bağımsız çalışır ve hatayı gösterir.
(function () {
  var fill = document.getElementById('loading-bar-fill');
  var pct = document.getElementById('loading-percentage');
  var screen = document.getElementById('loading-screen');
  var soz = document.getElementById('loading-quote');
  var EN_AZ_MS = 2000;      // perde hazır olsa bile bu kadar görünür (titremesin)
  var UYARI_MS = 12000;     // "sunucu yavaş" açıklaması
  var EN_COK_MS = 45000;    // bu süreden sonra hata kartı
  var basladi = Date.now();
  var p = 0;
  var bitti = false;
  var hataGosterildi = false;

  if (soz) soz.setAttribute('role', 'status');   // metin değişince ekran okuyucu duyurur

  var iv = setInterval(function () {
    p += Math.floor(Math.random() * 12) + 8;
    if (p >= 95) { p = 95; clearInterval(iv); }
    if (fill) fill.style.width = p + '%';
    if (pct) pct.innerText = '%' + p;
  }, 80);

  var hazirMi = function () { return !!(window.__v3 || window.__oyunHazir); };

  var perdeyiKapat = function () {
    if (bitti) return;
    bitti = true;
    clearInterval(iv);
    clearInterval(izle);
    if (fill) fill.style.width = '100%';
    if (pct) pct.innerText = '%100';
    setTimeout(function () {
      if (screen) { screen.style.opacity = '0'; setTimeout(function () { screen.style.display = 'none'; }, 500); }
    }, 300);
  };

  var hataGoster = function (metin) {
    if (hataGosterildi || bitti) return;
    hataGosterildi = true;
    clearInterval(iv);
    if (fill) fill.style.width = '100%';
    if (pct) pct.innerText = '';
    if (soz) {
      soz.textContent = metin;
      soz.setAttribute('role', 'alert');
      if (soz.parentNode) {
        var dugme = document.createElement('button');
        dugme.type = 'button';
        dugme.className = 'loading-yeniden';
        dugme.textContent = 'Yeniden dene';
        dugme.addEventListener('click', function () { location.reload(); });
        soz.parentNode.appendChild(dugme);
        try { dugme.focus(); } catch (e) { /* odak verilemedi */ }
      }
    }
  };

  var izle = setInterval(function () {
    var gecen = Date.now() - basladi;
    if (hazirMi()) {
      if (gecen >= EN_AZ_MS) perdeyiKapat();
      return;
    }
    if (hataGosterildi) return;
    if (gecen >= EN_COK_MS) {
      hataGoster('Krallığa bağlanılamadı: oyun ' + Math.round(gecen / 1000) + ' saniyede açılmadı. İnternet bağlantını kontrol edip yeniden dene; sorun sürerse sunucu geçici olarak yanıt vermiyor olabilir.');
    } else if (gecen >= UYARI_MS) {
      if (soz) soz.textContent = 'Sunucu yavaş yanıt veriyor, bekliyoruz… (' + Math.round(gecen / 1000) + ' sn)';
    } else if (gecen >= EN_AZ_MS + 500) {
      if (soz) soz.textContent = 'Krallığa bağlanılıyor…';
    }
  }, 250);

  // Oyun betiği (modül) yüklenemezse 45 saniye beklemeden hata göster
  window.addEventListener('error', function (e) {
    var t = e && e.target;
    if (t && t.tagName === 'SCRIPT' && !hazirMi()) hataGoster('Oyun dosyaları yüklenemedi. İnternet bağlantını kontrol edip yeniden dene.');
  }, true);
})();

// Resim yüklenemezse yedeği göster (eskiden resimlerin içine gömülü onerror kodu vardı; CSP onu engeller).
//  data-fb="next"      → resmi gizle, hemen sonraki öğeyi göster
//  data-fb="text:⚔️"   → resmi gizle, kutunun içine bu yazıyı koy
document.addEventListener('error', function (e) {
  var t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.fb) return;
  t.style.display = 'none';
  var fb = t.dataset.fb;
  if (fb === 'next') { if (t.nextElementSibling) t.nextElementSibling.style.display = 'block'; }
  else if (fb.indexOf('text:') === 0 && t.parentElement) t.parentElement.textContent = fb.slice(5);
}, true);
