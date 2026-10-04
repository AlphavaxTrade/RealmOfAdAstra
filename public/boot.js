// Realm of Astra — açılış betiği (index.html'den ayrıldı: tarayıcı koruması (CSP) sayfaya gömülü kodu çalıştırmaz)
// Failsafe: Loading screen her durumda 3 saniyede kapanır (JS modül hatasından bağımsız)
(function() {
  var fill = document.getElementById('loading-bar-fill');
  var pct = document.getElementById('loading-percentage');
  var screen = document.getElementById('loading-screen');
  var p = 0;
  var iv = setInterval(function() {
    p += Math.floor(Math.random() * 12) + 8;
    if (p >= 95) { p = 95; clearInterval(iv); }
    if (fill) fill.style.width = p + '%';
    if (pct) pct.innerText = '%' + p;
  }, 80);
  setTimeout(function() {
    clearInterval(iv);
    if (fill) fill.style.width = '100%';
    if (pct) pct.innerText = '%100';
    setTimeout(function() {
      if (screen) { screen.style.opacity = '0'; setTimeout(function(){ screen.style.display = 'none'; }, 500); }
    }, 300);
  }, 2500);
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
