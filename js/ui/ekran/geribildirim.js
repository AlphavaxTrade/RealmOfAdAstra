// Realm of AdAstra — Sorun bildir (geri bildirim / bilet) ekranı (18 Ekim 2026).
// Oyuncu konu + mesaj + en çok 4 ekran görüntüsü yollar; sunucu RB-1001 gibi bir bilet numarası verir, sahibi yönetici panelinde okuyup cevaplar,
// cevap bu ekranın altında "Önceki biletlerim" içinde görünür. Sunucu tarafı: server/geri-bildirim.js, uçlar POST /api/feedback ve GET /api/feedback/mine.
// Form durumu `secenek.durum` içinde durur (her açılışta yeni nesne): ekran yeniden çizilince mesaj ve görüntüler kaybolmaz.
import { ekranKaydet, yenile, kap, kart, dugme, dugmeler, uyari, not, etiket, bos, esc } from './cekirdek.js';

export const KONULAR = [['hata', '🐞 Hata'], ['oneri', '💡 Öneri'], ['soru', '❓ Soru'], ['odeme', '💳 Ödeme']];
const KONU_AD = Object.fromEntries(KONULAR);
const DURUM = { yeni: ['Yeni', ''], inceleniyor: ['İnceleniyor', 'uyari'], cozuldu: ['Çözüldü', 'iyi'] };
export const EK_EN_COK_ADET = 4;
export const EK_BUTCE = 280_000;   // bir görüntünün data: URL uzunluğu; sunucu sınırı 300.000 (server/geri-bildirim.js EK_EN_COK)
// Görüntü önce en uzun kenarı küçültülür, sonra JPEG kalitesi düşürülür; ilk bütçeye sığan alınır
export const KUCULTME_ADIMLARI = [[1280, 0.78], [1280, 0.6], [960, 0.6], [720, 0.5], [640, 0.4]];
const tarih = (t) => new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const yeniDurum = () => ({ konu: 'hata', mesaj: '', ekler: [], hazirlaniyor: false, gonderiliyor: false, hata: '', sonuc: null, gecmis: null, gecmisYukleniyor: false });
const durumOf = (secenek) => (secenek.durum ||= yeniDurum());

// Seçilen ya da yapıştırılan görüntüyü küçültüp JPEG data: URL'ye çevirir; okunamazsa ya da bütçeye sığmazsa null
async function kucult(dosya) {
  let bmp;
  try { bmp = await createImageBitmap(dosya); } catch { return null; }
  try {
    for (const [boy, kalite] of KUCULTME_ADIMLARI) {
      const o = Math.min(1, boy / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * o)); c.height = Math.max(1, Math.round(bmp.height * o));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', kalite);
      if (url.length <= EK_BUTCE) return url;
    }
    return null;
  } finally { if (bmp.close) bmp.close(); }
}

// Dosyaları sırayla ekler (en çok EK_EN_COK_ADET); durumdaki hata alanına kısa bir neden yazar
async function dosyalariEkle(s, dosyalar) {
  const d = durumOf(s);
  const resimler = [...dosyalar].filter((f) => f && /^image\//.test(f.type));
  if (!resimler.length) return;
  d.hata = '';
  d.hazirlaniyor = true; yenile();
  try {
    for (const f of resimler) {
      if (d.ekler.length >= EK_EN_COK_ADET) { d.hata = `En çok ${EK_EN_COK_ADET} ekran görüntüsü ekleyebilirsin.`; break; }
      const url = await kucult(f);
      if (url) d.ekler.push(url); else d.hata = 'Bir görüntü okunamadı ya da çok büyük: başka bir görüntü seç.';
    }
  } finally { d.hazirlaniyor = false; yenile(); }
}

function formHtml(d) {
  const konular = KONULAR.map(([k, ad]) => `<button type="button" class="ek-konu${k === d.konu ? ' is-aktif' : ''}" data-e="konu" data-k="${k}" aria-pressed="${k === d.konu}">${esc(ad)}</button>`).join('');
  const onizleme = d.ekler.map((u, i) => `<div class="ek-resim"><img src="${esc(u)}" alt="Eklenen ekran görüntüsü ${i + 1}"><button type="button" class="ek-resim-sil" data-e="kaldir" data-i="${i}" aria-label="Görüntü ${i + 1} kaldır">✕</button></div>`).join('');
  const doluMu = d.ekler.length >= EK_EN_COK_ADET;
  return kart({
    baslik: '📮 Sorun bildir',
    icerik: not('Bir hata, öneri, soru ya da ödeme sorunu mu var? Yaz; doğrudan oyunun sahibine gitsin. Cevabı aşağıda, biletinin altında görürsün.')
      + `<div class="ek-konular" role="group" aria-label="Konu">${konular}</div>`
      + `<label class="ek-alan"><span>Ne oldu?</span><textarea id="gb-mesaj" class="ek-girdi ek-metin" rows="5" maxlength="3000" data-e-girdi="mesaj" placeholder="Ne yaparken oldu, ne bekliyordun, ne gördün?">${esc(d.mesaj)}</textarea></label>`
      + `<div class="ek-resimler">${onizleme}</div>`
      + `<label class="ek-dugme ek-dosya${doluMu || d.hazirlaniyor ? ' is-pasif' : ''}">📷 Ekran görüntüsü ekle (${d.ekler.length}/${EK_EN_COK_ADET})<input type="file" accept="image/*" multiple class="ek-dosya-girdi" data-e-degis="dosya"${doluMu || d.hazirlaniyor ? ' disabled' : ''}></label>`
      + `<small class="ek-kucuk">İsteğe bağlı ama sorunu çok daha kolay anlatır. Bilgisayarda Ctrl+V ile de yapıştırabilirsin. Seninle birlikte şunlar da gider: oyun sürümü, cihazın ve hesabının kısa özeti (seviye, ordu). Şifre ya da anahtar yazma.</small>`
      + (d.hata ? uyari(esc(d.hata), 'kotu') : '')
      + (d.hazirlaniyor ? uyari('Görüntü hazırlanıyor…') : '')
      + dugmeler(dugme({ e: 'gonder', metin: d.gonderiliyor ? 'Gönderiliyor…' : '📤 Gönder', ton: 'birincil', devreDisi: d.gonderiliyor || d.hazirlaniyor, genis: true }))
  });
}

function sonucHtml(d) {
  return kart({
    baslik: 'Teşekkürler 🙏', vurgu: 'iyi',
    icerik: `<p class="ek-bilet-buyuk">Bilet numaran: <b>${esc(d.sonuc.bilet)}</b></p>`
      + not('Bildirimin oyunun sahibine ulaştı. Cevap gelince bu ekranın altında, biletinin yanında görürsün. Bu numarayı not alabilirsin.')
      + dugmeler(dugme({ e: 'yeni', metin: 'Yeni bildirim yaz', ton: 'hayalet' }))
  });
}

function gecmisHtml(d) {
  if (d.gecmis === null) return kart({ baslik: 'Önceki biletlerim', icerik: not('Yükleniyor…') });
  if (!d.gecmis.length) return kart({ baslik: 'Önceki biletlerim', icerik: bos('📭', 'Henüz bildirim göndermedin') });
  const satirlar = d.gecmis.map((x) => {
    const [ad, ton] = DURUM[x.durum] || [x.durum, ''];
    return `<li class="ek-bilet"><div class="ek-bilet-ust"><b class="ek-bilet-no">${esc(x.bilet)}</b>${etiket(ad, ton)}<span class="ek-kucuk">${esc(KONU_AD[x.konu] || x.konu)} · ${esc(tarih(x.at))}${x.ekSayisi ? ` · 📷 ${x.ekSayisi}` : ''}</span></div>`
      + `<p class="ek-bilet-metin">${esc(x.kisa)}</p>`
      + (x.cevap ? `<div class="ek-bilet-cevap"><span class="ek-kucuk">💬 Cevap${x.cevapAt ? ` · ${esc(tarih(x.cevapAt))}` : ''}</span><p>${esc(x.cevap)}</p></div>` : '')
      + '</li>';
  }).join('');
  return kart({ baslik: 'Önceki biletlerim', icerik: `<ul class="ek-biletler">${satirlar}</ul>` });
}

let yapistirmaBagli = null;   // yapıştırma dinleyicisinin bağlı olduğu panel kökü
let aktifSecenek = null;

const ekran = {
  id: 'geribildirim',
  baslik: () => ['📮', 'Sorun bildir'],

  govde(b, secenek) {
    if (!b.online || !b.online.active) {
      return kap(kart({ baslik: '📮 Sorun bildir', icerik: not('Sorun bildir, sunucuya bağlı (çevrimiçi) sürümde açılır. Şu an tek kişilik yerel moddasın.') }));
    }
    if (!b.girisli()) {
      return kap(kart({ baslik: '📮 Sorun bildir', icerik: not('Bildirim göndermek için giriş yapman gerekiyor.') + dugmeler(dugme({ e: 'giris', metin: '🔐 Giriş yap', ton: 'birincil' })) }));
    }
    const d = durumOf(secenek);
    return kap((d.sonuc ? sonucHtml(d) : formHtml(d)) + gecmisHtml(d));
  },

  eylemler: {
    konu: (b, el, s) => { durumOf(s).konu = el.dataset.k; },
    kaldir: (b, el, s) => { const d = durumOf(s); d.ekler.splice(Number(el.dataset.i), 1); d.hata = ''; },
    yeni: (b, el, s) => { Object.assign(durumOf(s), { sonuc: null, hata: '' }); },
    giris: (b) => { b.panelKapat(); b.girisIste(); return false; },
    async gonder(b, el, s) {
      const d = durumOf(s);
      d.hata = '';
      const mesaj = d.mesaj.trim();
      if (mesaj.length < 5) { d.hata = 'Biraz daha anlat: en az birkaç kelime yaz.'; return undefined; }
      d.gonderiliyor = true;
      try {
        const sekme = document.querySelector('[data-v3-sekme].active');
        const r = await b.geriBildirim.gonder({
          konu: d.konu, mesaj, ekler: d.ekler,
          baglam: { sayfa: sekme ? sekme.dataset.v3Sekme : '', surum: b.GAME_CONFIG.GAME_VERSION, cihaz: navigator.userAgent, ekran: `${innerWidth}x${innerHeight}`, dil: navigator.language }
        });
        d.sonuc = { bilet: r.bilet }; d.mesaj = ''; d.ekler = []; d.gecmis = null;
      } catch (e) {
        d.hata = e.status === 401 ? 'Oturumun kapanmış: yeniden giriş yapıp tekrar dene.' : (e.message || 'Gönderilemedi; tekrar dene.');
      } finally { d.gonderiliyor = false; }
      return undefined;
    }
  },

  girdiler: { mesaj: (b, el, s) => { durumOf(s).mesaj = el.value; } },

  degisimler: {
    dosya(b, el, s) {
      const dosyalar = [...el.files];
      el.value = '';
      dosyalariEkle(s, dosyalar);
      return false;   // ekran dosyalariEkle içinde kendisi yeniden çizilir
    }
  },

  // Her çizimden sonra: yapıştırma dinleyicisi (bir kez) ve önceki biletlerin yüklenmesi
  async sonra(b, secenek, kok) {
    aktifSecenek = secenek;
    if (yapistirmaBagli !== kok) {
      yapistirmaBagli = kok;
      kok.addEventListener('paste', (ev) => {
        if (!aktifSecenek || !kok.firstElementChild || kok.firstElementChild.dataset.ekran !== 'geribildirim' || durumOf(aktifSecenek).sonuc) return;
        const dosyalar = [...(ev.clipboardData ? ev.clipboardData.items : [])].filter((x) => x.kind === 'file' && /^image\//.test(x.type)).map((x) => x.getAsFile());
        if (!dosyalar.length) return;
        ev.preventDefault();
        dosyalariEkle(aktifSecenek, dosyalar);
      });
    }
    const d = durumOf(secenek);
    if (!b.online || !b.online.active || !b.girisli() || d.gecmis !== null || d.gecmisYukleniyor) return;
    d.gecmisYukleniyor = true;
    try { d.gecmis = (await b.geriBildirim.benim()).list || []; } catch { d.gecmis = []; } finally { d.gecmisYukleniyor = false; }
    yenile();
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
