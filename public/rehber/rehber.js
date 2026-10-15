// Oyun Rehberi: yan içindekiler (aktif bölüm), arama, mobil menü, başa dön, resim büyütme. Dış bağımlılık yok.
(function () {
  'use strict';
  var $ = function (s, k) { return (k || document).querySelector(s); };
  var $$ = function (s, k) { return Array.prototype.slice.call((k || document).querySelectorAll(s)); };

  // 1) Yan menüyü bölümlerden kur (ana başlıklar data-grup ile gruplanır)
  var yan = $('#yan-liste');
  var bolumler = $$('section.bolum');
  var gruplar = {};
  var sira = [];
  bolumler.forEach(function (b) {
    var g = b.getAttribute('data-grup') || 'Diğer';
    if (!gruplar[g]) { gruplar[g] = []; sira.push(g); }
    gruplar[g].push(b);
  });
  var html = '';
  sira.forEach(function (g) {
    html += '<h4>' + g + '</h4>';
    gruplar[g].forEach(function (b) {
      var h = $('h2', b);
      var ik = b.getAttribute('data-ikon') || '•';
      html += '<a href="#' + b.id + '" data-bolum="' + b.id + '"><i>' + ik + '</i><span>' + h.textContent + '</span></a>';
    });
  });
  html += '<div class="bos" id="yan-bos">Eşleşen bölüm yok.</div>';
  yan.innerHTML = html;

  // 2) Aktif bölümü işaretle
  var linkler = $$('a[data-bolum]', yan);
  function aktifGuncelle() {
    var y = window.scrollY + 120, aktif = bolumler[0];
    bolumler.forEach(function (b) { if (b.offsetTop <= y) aktif = b; });
    linkler.forEach(function (l) { l.classList.toggle('aktif', l.getAttribute('data-bolum') === aktif.id); });
    // Aktif bağlantıyı menüde görünür tut: yalnız menünün kendi kaydırmasını değiştir (scrollIntoView sayfayı da kaydırıp
    // tıklamayı ve yumuşak kaydırmayı bozuyordu) ve kullanıcı menünün üstündeyken (tıklamak üzereyken) listeyi oynatma
    var a = $('a.aktif', yan);
    if (a && yan.scrollHeight > yan.clientHeight && !yan.matches(':hover')) {
      var r = a.getBoundingClientRect(), p = yan.getBoundingClientRect();
      if (r.top < p.top + 40) yan.scrollTop -= (p.top + 40 - r.top);
      else if (r.bottom > p.bottom - 40) yan.scrollTop += (r.bottom - (p.bottom - 40));
    }
    var basa = $('#basa');
    if (basa) basa.classList.toggle('goster', window.scrollY > 900);
  }
  var bekliyor = false;
  window.addEventListener('scroll', function () {
    if (bekliyor) return;
    bekliyor = true;
    window.requestAnimationFrame(function () { bekliyor = false; aktifGuncelle(); });
  }, { passive: true });
  aktifGuncelle();

  // 2b) Sayfa içi bağlantılar: hedefe doğrudan git. Tarayıcının yumuşak kaydırması çok uzun sayfada (≈90.000 px) yarıda kalıyor
  // ve geç yüklenen görseller (loading="lazy") hedefi kaydırıyordu; bu yüzden birkaç kez yeniden hizalanır, kullanıcı kaydırırsa durur.
  var hizaToken = 0;
  function bolumeGit(id) {
    var s = document.getElementById(id);
    if (!s) return;
    var y = s.getBoundingClientRect().top + window.scrollY - 86;
    window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
  }
  function hizala(id) {
    var t = ++hizaToken;
    bolumeGit(id);
    [150, 450, 1000, 2000].forEach(function (ms) {
      setTimeout(function () { if (t === hizaToken) bolumeGit(id); }, ms);
    });
  }
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ad) {
    window.addEventListener(ad, function (e) {
      if (ad === 'mousedown' && e.target.closest && e.target.closest('a[href^="#"]')) return;
      hizaToken++;
    }, { passive: true });
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = decodeURIComponent(a.getAttribute('href').slice(1));
    if (!id || !document.getElementById(id)) return;
    e.preventDefault();
    if (history.replaceState) history.replaceState(null, '', '#' + id);
    hizala(id);
  });
  if (location.hash.length > 1) {
    var ilk = decodeURIComponent(location.hash.slice(1));
    if (document.getElementById(ilk)) window.addEventListener('load', function () { hizala(ilk); });
  }

  // 3) Arama: bölüm metninde geçen kelimeye göre menüyü ve bölümleri süzer
  var arama = $('#ara');
  var dizin = bolumler.map(function (b) { return { id: b.id, el: b, metin: b.textContent.toLowerCase().replace(/\s+/g, ' ') }; });
  function turkce(s) { return s.toLocaleLowerCase('tr-TR'); }
  arama.addEventListener('input', function () {
    var q = turkce(arama.value.trim());
    var say = 0;
    dizin.forEach(function (d) {
      var eslesir = !q || turkce(d.metin).indexOf(q) !== -1;
      d.el.style.display = eslesir ? '' : 'none';
      var l = $('a[data-bolum="' + d.id + '"]', yan);
      if (l) l.style.display = eslesir ? '' : 'none';
      if (eslesir) say++;
    });
    $('#yan-bos').style.display = say ? 'none' : 'block';
    $$('h4', yan).forEach(function (h) {
      var s = h.nextElementSibling, goster = false;
      while (s && s.tagName === 'A') { if (s.style.display !== 'none') goster = true; s = s.nextElementSibling; }
      h.style.display = goster ? '' : 'none';
    });
  });

  // 4) Mobil menü
  var ac = $('#menu-ac');
  if (ac) ac.addEventListener('click', function () { document.body.classList.toggle('menu-acik'); });
  yan.addEventListener('click', function (e) { if (e.target.closest('a')) document.body.classList.remove('menu-acik'); });

  // 5) Resim büyütme
  var buyut = $('#buyut');
  var buyutImg = $('img', buyut);
  document.addEventListener('click', function (e) {
    var f = e.target.closest('figure.resim .cerceve');
    if (f) { buyutImg.src = $('img', f).src; buyutImg.alt = $('img', f).alt; buyut.classList.add('ac'); return; }
    if (e.target.closest('#buyut')) buyut.classList.remove('ac');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { buyut.classList.remove('ac'); document.body.classList.remove('menu-acik'); }
    if (e.key === '/' && document.activeElement !== arama && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); arama.focus(); }
  });
})();
