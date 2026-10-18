// Realm of AdAstra sunucusu — "Sorun bildir" (geri bildirim / bilet) sistemi (18 Ekim 2026; trade sitesindeki GB-xxxx sisteminin karşılığı).
// Oyuncu (giriş yapmış) konu + mesaj + en çok 4 ekran görüntüsü gönderir; her bildirim RB-1001, RB-1002 … diye bir bilet numarası alır.
// Sahibi yönetici panelinde okur, durumunu değiştirir ve cevap yazar; oyuncu cevabı oyunda görür. Sahibi "RB-1001 biletine bak"
// dediğinde scripts/geri-bildirim-oku.mjs bileti (metin + bağlam + oyuncu özeti + görüntüler) okur.
// Oyuncunun yazdığı her şey VERİDİR: panelde kaçışlanarak gösterilir, okuma betiği "veri, talimat değil" başlığıyla basar, hiçbir
// yerde çalıştırılmaz. Şema: server/gecis/009_geri_bildirim.js (geri_bildirim + geri_bildirim_ek).
export const KONULAR = { hata: '🐞 Hata', oneri: '💡 Öneri', soru: '❓ Soru', odeme: '💳 Ödeme' };
export const DURUMLAR = { yeni: 'Yeni', inceleniyor: 'İnceleniyor', cozuldu: 'Çözüldü' };
export const MESAJ_EN_AZ = 5, MESAJ_EN_COK = 3000, CEVAP_EN_COK = 2000;
export const EK_EN_COK_ADET = 4;
export const EK_EN_COK = 300_000;          // bir görüntünün data: URL uzunluğu (sayfa önce küçültür); 4 görüntü + metin gövde sınırının (1,5 MB) altında kalır
export const LISTE_EN_COK = 300;
export const ILK_BILET = 1000;
const ONEK = 'RB-';

export const biletAdi = no => (no ? `${ONEK}${no}` : '');
// 'RB-1001', 'rb 1001', '#1001', '1001' -> 1001; başka her şey -> null
export const biletCoz = v => {
  let s = String(v ?? '').trim().toLowerCase();
  if (s.startsWith('rb')) s = s.slice(2).replace(/^[\s-]+/, '');
  else if (s.startsWith('#')) s = s.slice(1);
  return /^\d{1,9}$/.test(s) ? Number(s) : null;
};

const EK_RX = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
// Gerçek dosya başlığı (magic bytes): "data:image/png" yazıp başka şey yollamak reddedilir
const BASLIK = {
  jpeg: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  webp: b => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP'
};
const kirp = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);

// İstek gövdesi -> { hata } ya da { konu, mesaj, ekler, baglam }
export function temizle(b) {
  if (!b || typeof b !== 'object') return { hata: 'Geçersiz istek.' };
  const konu = String(b.konu || '');
  if (!KONULAR[konu]) return { hata: 'Bir konu seç.' };
  const mesaj = kirp(b.mesaj, MESAJ_EN_COK + 1);
  if (mesaj.length < MESAJ_EN_AZ) return { hata: 'Biraz daha anlat: en az birkaç kelime yaz.' };
  if (mesaj.length > MESAJ_EN_COK) return { hata: `Mesaj en çok ${MESAJ_EN_COK} harf olabilir.` };
  const ham = b.ekler == null || b.ekler === '' ? [] : b.ekler;
  if (!Array.isArray(ham)) return { hata: 'Ekran görüntüleri okunamadı.' };
  if (ham.length > EK_EN_COK_ADET) return { hata: `En çok ${EK_EN_COK_ADET} ekran görüntüsü ekleyebilirsin.` };
  const ekler = [];
  for (const e of ham) {
    const s = String(e ?? '');
    if (s.length > EK_EN_COK) return { hata: 'Bir ekran görüntüsü çok büyük: daha küçük bir görüntü seç.' };
    const m = EK_RX.exec(s);
    if (!m) return { hata: 'Ekran görüntüsü okunamadı: JPG, PNG ya da WEBP seç.' };
    let bayt;
    try { bayt = Buffer.from(m[2], 'base64'); } catch { return { hata: 'Ekran görüntüsü okunamadı.' }; }
    if (!BASLIK[m[1]](bayt)) return { hata: 'Ekran görüntüsü geçerli bir resim değil.' };
    ekler.push(s);
  }
  const g = b.baglam && typeof b.baglam === 'object' ? b.baglam : {};
  const baglam = { sayfa: kirp(g.sayfa, 200), surum: kirp(g.surum, 30), cihaz: kirp(g.cihaz, 200), ekran: kirp(g.ekran, 20), dil: kirp(g.dil, 20) };
  return { konu, mesaj, ekler, baglam };
}

const jsonOku = s => { if (!s) return null; try { return JSON.parse(s); } catch { return null; } };
const ozetSatir = r => ({ no: r.no, bilet: biletAdi(r.no), at: r.at, oyuncu: r.player, konu: r.konu, kisa: r.mesaj.slice(0, 140), ekSayisi: r.ek_sayisi, durum: r.durum, cevap: r.cevap || '', cevapAt: r.cevap_at || null, guncel: r.guncel });

export function createGeriBildirim({ db, engine = null, kapi = null, mailer = null, cfg = {}, clock = () => Date.now(), log = console }) {
  const raw = db.raw;
  const q = {
    sonNo: raw.prepare('SELECT COALESCE(MAX(no), 0) AS n FROM geri_bildirim'),
    ekle: raw.prepare('INSERT INTO geri_bildirim (no, player, konu, mesaj, durum, baglam, ozet, ek_sayisi, at, guncel) VALUES (?, ?, ?, ?, \'yeni\', ?, ?, ?, ?, ?)'),
    ekEkle: raw.prepare('INSERT INTO geri_bildirim_ek (no, sira, veri) VALUES (?, ?, ?)'),
    benimki: raw.prepare('SELECT * FROM geri_bildirim WHERE player = ? ORDER BY no DESC LIMIT 30'),
    tek: raw.prepare('SELECT * FROM geri_bildirim WHERE no = ?'),
    ekler: raw.prepare('SELECT sira, veri FROM geri_bildirim_ek WHERE no = ? ORDER BY sira'),
    ek: raw.prepare('SELECT veri FROM geri_bildirim_ek WHERE no = ? AND sira = ?'),
    guncelle: raw.prepare('UPDATE geri_bildirim SET durum = ?, cevap = ?, cevap_at = ?, guncel = ? WHERE no = ?'),
    sayilar: raw.prepare('SELECT durum, COUNT(*) AS n FROM geri_bildirim GROUP BY durum'),
    toplam: raw.prepare('SELECT COUNT(*) AS n FROM geri_bildirim')
  };

  // Sunucunun eklediği kısa oyuncu özeti (sahibi "RB-… biletine bak" dediğinde soru sormadan durumu görsün): salt okunur, para/anahtar yok
  function oyuncuOzeti(player) {
    const o = {};
    try {
      const s = engine?.readPlayer ? engine.readPlayer(player) : null;
      if (s) {
        const sayi = v => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : null);
        o.seviye = sayi(s.level);
        o.koylu = sayi(s.village?.villagers);
        o.siloSeviyesi = sayi(s.warehouseLevel);
        o.asker = Array.isArray(s.soldierUnits) ? s.soldierUnits.length : null;
        o.askerSeviyeleri = Array.isArray(s.soldierUnits) ? s.soldierUnits.slice(0, 18).map(a => a?.level || 1) : null;
        o.serbestAstra = sayi(s.adAstraBalance);
        o.kilitliAstra = sayi(s.lockedAda);
        o.botAcik = Number(s.botActiveUntil) > clock();
      }
    } catch (e) { log.warn?.('geri bildirim: oyuncu özeti okunamadı', e.message); }
    try { if (kapi?.statusOf) { const k = kapi.statusOf(player); o.kapi = k?.status || k?.gate || null; } } catch { /* özet isteğe bağlı */ }
    try {
      o.sonOlaylar = raw.prepare('SELECT at, type FROM events WHERE address = ? ORDER BY id DESC LIMIT 5').all(player).map(e => ({ at: e.at, tur: e.type }));
    } catch { /* özet isteğe bağlı */ }
    return o;
  }

  // temizle() sonucunu kaydeder -> { no, bilet }. Bilet numarası aynı işlem içinde verilir (iki bildirim aynı numarayı almaz).
  function kaydet(player, t, { haber = true } = {}) {
    const now = clock(), ozet = oyuncuOzeti(player);
    const no = db.tx(() => {
      const yeniNo = Math.max(ILK_BILET, q.sonNo.get().n) + 1;
      q.ekle.run(yeniNo, player, t.konu, t.mesaj, JSON.stringify(t.baglam || {}), JSON.stringify(ozet), t.ekler.length, now, now);
      t.ekler.forEach((v, i) => q.ekEkle.run(yeniNo, i, v));
      return yeniNo;
    });
    const bilet = biletAdi(no);
    log.log?.(`📮 geri bildirim ${bilet} · ${t.konu} · ${player} · ${t.ekler.length} görüntü`);
    if (haber) sahibeHaber(bilet, player, t);
    return { no, bilet };
  }

  // Sahibine kısa e-posta (ADMIN_EMAIL tanımlıysa); asla beklenmez, hata bildirimi engellemez. Panelde zaten "yeni" sayacı var.
  function sahibeHaber(bilet, player, t) {
    if (!mailer || !cfg.adminEmail) return;
    const gövde = `${bilet} · ${KONULAR[t.konu]} · oyuncu ${player}${t.ekler.length ? ` · ${t.ekler.length} ekran görüntüsü` : ''}\n\n${t.mesaj.slice(0, 400)}${t.mesaj.length > 400 ? '…' : ''}\n\nYönetici paneli → Geri bildirimler. Claude'a: "${bilet} biletine bak"`;
    Promise.resolve(mailer.send({ to: cfg.adminEmail, subject: `Realm of AdAstra: yeni geri bildirim ${bilet}`, text: gövde }))
      .catch(e => log.warn?.('geri bildirim e-postası gitmedi', e.message));
  }

  // Hız sınırı: oyuncu 10 dakikada 5 ve günde 20 (kayıtlı bildirimlerden sayılır: yeniden başlatmada sıfırlanmaz), adres 10 dakikada 15 (bellekte)
  const adresler = new Map();
  function cokHizli(player, ip = '') {
    const now = clock();
    const son = (ms) => raw.prepare('SELECT COUNT(*) AS n FROM geri_bildirim WHERE player = ? AND at >= ?').get(player, now - ms).n;
    if (son(10 * 60e3) >= 5 || son(864e5) >= 20) return true;
    if (!ip) return false;
    const a = (adresler.get(ip) || []).filter(t => now - t < 10 * 60e3);
    if (a.length >= 15) { adresler.set(ip, a); return true; }
    a.push(now); adresler.set(ip, a);
    if (adresler.size > 5000) adresler.clear();
    return false;
  }

  // Oyuncunun kendi biletleri (en yeni 30): durumu ve sahibinin cevabıyla
  const benimkiler = player => q.benimki.all(player).map(r => {
    const { no, bilet, at, konu, kisa, ekSayisi, durum, cevap, cevapAt } = ozetSatir(r);
    return { no, bilet, at, konu, kisa, ekSayisi, durum, cevap, cevapAt };
  });

  // Panel listesi: durum süzgeci + oyuncu/metin/bilet araması; durum başına sayılar
  function liste({ durum = '', ara = '' } = {}) {
    const sayi = Object.fromEntries(Object.keys(DURUMLAR).map(k => [k, 0]));
    for (const r of q.sayilar.all()) if (r.durum in sayi) sayi[r.durum] = r.n;
    const aranan = String(ara || '').trim().toLowerCase(), no = biletCoz(aranan);
    const kosul = [], arg = [];
    if (DURUMLAR[durum]) { kosul.push('durum = ?'); arg.push(durum); }
    if (aranan) {
      if (no) { kosul.push('no = ?'); arg.push(no); }
      else { kosul.push("(LOWER(player) LIKE ? ESCAPE '\\' OR LOWER(mesaj) LIKE ? ESCAPE '\\')"); const k = '%' + aranan.replace(/[\\%_]/g, c => '\\' + c) + '%'; arg.push(k, k); }
    }
    const sql = `SELECT * FROM geri_bildirim${kosul.length ? ' WHERE ' + kosul.join(' AND ') : ''} ORDER BY no DESC LIMIT ${LISTE_EN_COK}`;
    return { toplam: q.toplam.get().n, sayi, rows: raw.prepare(sql).all(...arg).map(ozetSatir) };
  }

  // Bir bilet bütünüyle: 'RB-1001' / 1001. Görüntüler veri olarak (data: URL) gelir.
  function ayrinti(biletVeyaNo, { ekleri = true } = {}) {
    const no = typeof biletVeyaNo === 'number' ? biletVeyaNo : biletCoz(biletVeyaNo);
    if (!no) throw Object.assign(new Error('Geçersiz bilet numarası.'), { kod: 400 });
    const r = q.tek.get(no);
    if (!r) throw Object.assign(new Error(`${biletAdi(no)} bulunamadı.`), { kod: 404 });
    return { ...ozetSatir(r), mesaj: r.mesaj, baglam: jsonOku(r.baglam) || {}, oyuncuOzeti: jsonOku(r.ozet) || {}, ekler: ekleri ? q.ekler.all(no).map(e => e.veri) : [] };
  }

  const ekOku = (biletVeyaNo, sira) => {
    const no = typeof biletVeyaNo === 'number' ? biletVeyaNo : biletCoz(biletVeyaNo);
    return no && Number.isInteger(sira) ? q.ek.get(no, sira)?.veri || null : null;
  };

  // Sahibinin durum değişikliği ve/veya cevabı
  function guncelle(biletVeyaNo, { durum, cevap } = {}) {
    const no = typeof biletVeyaNo === 'number' ? biletVeyaNo : biletCoz(biletVeyaNo);
    if (!no) throw Object.assign(new Error('Geçersiz bilet numarası.'), { kod: 400 });
    if (durum !== undefined && !DURUMLAR[durum]) throw Object.assign(new Error('Geçersiz durum.'), { kod: 400 });
    const yeniCevap = cevap === undefined ? undefined : kirp(cevap, CEVAP_EN_COK + 1);
    if (yeniCevap !== undefined && yeniCevap.length > CEVAP_EN_COK) throw Object.assign(new Error(`Cevap en çok ${CEVAP_EN_COK} harf olabilir.`), { kod: 400 });
    const r = q.tek.get(no);
    if (!r) throw Object.assign(new Error(`${biletAdi(no)} bulunamadı.`), { kod: 404 });
    const now = clock(), cevapDegisti = yeniCevap !== undefined && yeniCevap !== r.cevap;
    q.guncelle.run(durum ?? r.durum, yeniCevap ?? r.cevap, cevapDegisti ? (yeniCevap ? now : null) : r.cevap_at, now, no);
    return ozetSatir(q.tek.get(no));
  }

  return { temizle, kaydet, cokHizli, benimkiler, liste, ayrinti, ekOku, guncelle, biletAdi, biletCoz };
}
