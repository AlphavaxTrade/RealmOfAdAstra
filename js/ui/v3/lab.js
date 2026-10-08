// Realm of AdAstra — v3 Test Laboratuvarı (eski "Test menüsü"nün yerine). Yalnız deneme/geliştirme sürümünde açılır.
// Dört sekme: Senaryolar (her mekanik için "kur → çalıştır → beklenen sonuç ✓/✗", js/dev/senaryolar.js), Araçlar (zaman, kaynak, karakter, ordu,
// zindan, kayıt noktaları, tehlikeli bölge), Durum (özet + önce/sonra farkı + ham durum), Günlük (yapılan her şey).
// Saf kısımlar (fark, kayıt listesi, HTML üreticileri) DOM'a dokunmaz ve testlerde içe alınır.
import { SENARYOLAR, KATEGORILER, senaryoCalistir, ozet } from '../../dev/senaryolar.js';
import { onay, istatSatiri, bosDurum } from './bilesenler.js';
import { esc } from './hub.js';

// ------------------------------------------------------------------ saf kısım
const ETIKET = { astra: 'ASTRA', seviye: 'Seviye', stamina: 'Stamina', maxStamina: 'Stamina üst sınırı', xp: 'XP', xpGerekli: 'XP gereken', asker: 'Asker', seferAcik: 'Açık sefer', seferHazir: 'Hazır sefer', siloSeviye: 'Silo seviyesi', siloOdun: 'Silo (odun) kapasitesi', baltaDayanikliligi: 'Balta dayanıklılığı', odunFiyati: 'Odun fiyatı', bilet: 'Piyango bileti', rehberTamam: 'Tamamlanan görevler' };

// İki özet görüntüsü arasında değişen alanlar: [{ alan, once, sonra }]
export function farkSatirlari(once, sonra) {
  const cikti = [];
  const dene = (alan, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) cikti.push({ alan, once: a, sonra: b }); };
  for (const k of Object.keys(sonra)) {
    if (k === 'env') { for (const e of new Set([...Object.keys(once.env || {}), ...Object.keys(sonra.env || {})])) dene(`Envanter: ${e}`, (once.env || {})[e], (sonra.env || {})[e]); }
    else dene(ETIKET[k] || k, once[k], sonra[k]);
  }
  return cikti;
}

const sayi = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('tr-TR') : v.toLocaleString('tr-TR', { maximumFractionDigits: 4 })) : Array.isArray(v) ? v.join(', ') || '—' : String(v ?? '—'));
export const farkHtml = (satirlar) => satirlar.length
  ? `<div class="v3-lab-fark">${satirlar.map((f) => istatSatiri(f.alan, `${sayi(f.once)} → ${sayi(f.sonra)}`)).join('')}</div>`
  : bosDurum('➖', 'Değişen bir şey yok');

// Senaryo sonucu: her beklenen adım ✓/✗, hata varsa gösterilir, altında önce/sonra farkı (katlı)
export function sonucHtml(sonuc) {
  if (!sonuc) return '';
  const adimlar = sonuc.adimlar.map((a) => `<li class="${a.tamam ? 'v3-lab-ok' : 'v3-lab-yok'}"><span aria-hidden="true">${a.tamam ? '✓' : '✗'}</span> ${esc(a.ad)}</li>`).join('');
  const hata = sonuc.hata ? `<div class="v3-lab-hata">Hata: ${esc(sonuc.hata)}</div>` : '';
  const fark = sonuc.once && sonuc.sonra ? `<details class="v3-ayrinti"><summary>Önce / sonra</summary>${farkHtml(farkSatirlari(sonuc.once, sonuc.sonra))}</details>` : '';
  return `<div class="v3-lab-sonuc ${sonuc.gecti ? 'gecti' : 'kaldi'}"><b>${sonuc.gecti ? '✅ Geçti' : '❌ Kaldı'}</b><ul>${adimlar}</ul>${hata}${fark}</div>`;
}

export function senaryoKartiHtml(s, sonuc, calistirilabilir) {
  return `<article class="v3-lab-kart" data-lab-senaryo="${esc(s.id)}">
    <b>${esc(s.ad)}</b><p>${esc(s.ne)}</p>
    <div class="v3-lab-dugmeler">
      <button type="button" class="v3-birincil" data-lab="calistir:${esc(s.id)}" ${calistirilabilir ? '' : 'disabled'}>▶ Çalıştır</button>
      <button type="button" data-lab="kur:${esc(s.id)}" ${calistirilabilir ? '' : 'disabled'} title="Yalnız ön koşulu kurar; sonrasını sen elle denersin">Durumu kur</button>
    </div>${sonucHtml(sonuc)}</article>`;
}

export function gunlukHtml(girdiler) {
  if (!girdiler.length) return bosDurum('📝', 'Günlük boş', 'Laboratuvarda yaptığın her şey burada görünür.');
  return `<div class="v3-lab-gunluk">${[...girdiler].reverse().slice(0, 100).map((g) => `<div><time>${esc(g.saat)}</time><span>${esc(g.eylem)}</span><small>${esc(g.sonuc || '')}</small></div>`).join('')}</div>`;
}

// Kayıt noktaları: en yeni başta, en çok `sinir` tane (eskisi atılır). Saf: yeni liste döner.
export function kayitEkle(liste, kayit, sinir = 8) {
  return [kayit, ...liste.filter((k) => k.id !== kayit.id)].slice(0, sinir);
}
export const KAYIT_ANAHTARI = 'roa_lab_kayitlar';

// ------------------------------------------------------------------ tarayıcı kısmı
export function kurLab(api) {
  const gs = api.gameState;
  const durum = { sekme: 'senaryo', kategori: 'hepsi', sonuclar: {}, gunluk: [], karsilastirma: null };
  const saat = () => new Date().toLocaleTimeString('tr-TR');
  const logla = (eylem, sonuc) => { durum.gunluk.push({ saat: saat(), eylem, sonuc }); if (durum.gunluk.length > 300) durum.gunluk.shift(); };
  const kayitlariOku = () => { try { return JSON.parse(localStorage.getItem(KAYIT_ANAHTARI) || '[]'); } catch { return []; } };
  const kayitlariYaz = (l) => { try { localStorage.setItem(KAYIT_ANAHTARI, JSON.stringify(l)); return true; } catch { return false; } };
  const yerel = () => !api.cevrimici();

  const kayitAl = (ad) => {
    const liste = kayitEkle(kayitlariOku(), { id: `k${Date.now()}`, ad, zaman: new Date().toISOString(), durum: JSON.stringify(gs.state) });
    if (!kayitlariYaz(liste)) { api.bildir('Kayıt noktası yazılamadı (tarayıcı deposu dolu).', 'error'); return false; }
    logla('Kayıt noktası alındı', ad); return true;
  };

  const sekmeHtml = () => {
    const sekmeler = [['senaryo', 'Senaryolar'], ['arac', 'Araçlar'], ['durum', 'Durum'], ['gunluk', 'Günlük']];
    return `<div class="v3-chipler">${sekmeler.map(([k, ad]) => `<button type="button" class="v3-chip ${durum.sekme === k ? 'active' : ''}" data-lab="sekme:${k}">${ad}</button>`).join('')}</div>`;
  };

  const senaryoSekmesi = () => {
    const liste = SENARYOLAR.filter((s) => durum.kategori === 'hepsi' || s.kategori === durum.kategori);
    const gecen = liste.filter((s) => durum.sonuclar[s.id] && durum.sonuclar[s.id].gecti).length;
    const kosan = liste.filter((s) => durum.sonuclar[s.id]).length;
    const uyari = yerel() ? '' : '<div class="v3-lab-uyari">Çevrimiçi deneme sunucusundasın: senaryolar kayıt noktası alamadığı için kapalı. Araçlar sekmesi çalışır.</div>';
    return `${uyari}<div class="v3-chipler">${[{ id: 'hepsi', ad: 'Hepsi' }, ...KATEGORILER].map((k) => `<button type="button" class="v3-chip ${durum.kategori === k.id ? 'active' : ''}" data-lab="kategori:${k.id}">${esc(k.ad)}</button>`).join('')}</div>
      <div class="v3-lab-ozet"><span>${liste.length} senaryo${kosan ? ` · ${gecen}/${kosan} geçti` : ''}</span><button type="button" data-lab="hepsini" ${yerel() ? '' : 'disabled'}>▶ Bu listeyi çalıştır</button></div>
      <p class="v3-lab-not">Senaryolar bu oyunun KENDİ kaydında çalışır; başlamadan kayıt noktası alınır (Araçlar → Kayıt noktaları'ndan geri dönebilirsin).</p>
      ${liste.map((s) => senaryoKartiHtml(s, durum.sonuclar[s.id], yerel())).join('')}`;
  };

  const aracSekmesi = () => {
    const d = (eylem, ad, ipucu = '') => `<button type="button" data-lab="${eylem}" ${ipucu ? `title="${esc(ipucu)}"` : ''}>${ad}</button>`;
    const kayitlar = kayitlariOku();
    const kayitHtml = !yerel() ? '<div class="v3-lab-uyari">Çevrimiçi modda kayıt noktası yok (kayıt sunucuda).</div>'
      : `<div class="v3-lab-satir"><input id="lab-kayit-ad" type="text" placeholder="Kayıt adı" maxlength="40"><button type="button" data-lab="kayit-al">Kaydet</button></div>
         ${kayitlar.length ? kayitlar.map((k) => `<div class="v3-lab-kayit"><span><b>${esc(k.ad)}</b><small>${new Date(k.zaman).toLocaleString('tr-TR')}</small></span><button type="button" data-lab="kayit-yukle:${esc(k.id)}">Yükle</button><button type="button" data-lab="kayit-sil:${esc(k.id)}" aria-label="Sil">✕</button></div>`).join('') : '<small class="v3-lab-not">Henüz kayıt yok.</small>'}`;
    return `
      <section class="v3-lab-bolum"><h3>⏱️ Zaman</h3><div class="v3-lab-dugmeler">${d('zaman:0.0167', '+1 dk')}${d('zaman:0.1667', '+10 dk')}${d('zaman:1', '+1 saat')}${d('zaman:24', '+1 gün')}${d('zaman:168', '+1 hafta')}</div></section>
      <section class="v3-lab-bolum"><h3>🪙 Kaynak ve ASTRA</h3><div class="v3-lab-dugmeler">${d('kaynak:1000', 'Her hammaddeye +1.000', 'Silo kapasitesine kadar eklenir')}${d('astra:1000', '+1.000 ASTRA')}${d('astra:1000000', '+1 Mn ASTRA')}${d('astra:0', 'ASTRA\'yı sıfırla')}</div></section>
      <section class="v3-lab-bolum"><h3>🧙 Karakter</h3><div class="v3-lab-dugmeler">${d('stamina', 'Stamina doldur')}</div>
        <div class="v3-lab-satir"><input id="lab-seviye" type="number" min="1" max="100" value="10" aria-label="Seviye"><button type="button" data-lab="seviye">Seviye yap</button></div></section>
      <section class="v3-lab-bolum"><h3>⚔️ Ordu ve aletler</h3><div class="v3-lab-dugmeler">${d('iyilestir', 'Askerleri iyileştir')}${d('onar', 'Hepsini onar')}</div></section>
      <section class="v3-lab-bolum"><h3>💀 Zindan</h3><div class="v3-lab-satir"><input id="lab-zindan" type="number" min="1" max="18" value="2" aria-label="Zindan katı"><button type="button" data-lab="zindan">Kata ilerlet</button></div></section>
      <section class="v3-lab-bolum"><h3>💾 Kayıt noktaları</h3>${kayitHtml}</section>
      <section class="v3-lab-bolum v3-lab-tehlike"><h3>⚠️ Tehlikeli bölge</h3><div class="v3-lab-dugmeler"><button type="button" class="v3-tehlikeli" data-lab="sifirla">Oyunu ilk güne döndür</button></div><small class="v3-lab-not">Hesabı, pazar havuzlarını ve kasaları başlangıca alır. Onay sorar.</small></section>`;
  };

  const durumSekmesi = () => {
    const simdi = ozet(gs);
    const kars = durum.karsilastirma
      ? `<h3>Karşılaştırma noktasından beri</h3>${farkHtml(farkSatirlari(durum.karsilastirma, simdi))}`
      : '<small class="v3-lab-not">Bir "karşılaştırma noktası" alırsan, sonra neyin değiştiğini burada görürsün.</small>';
    const satirlar = Object.entries(simdi).filter(([k]) => k !== 'env').map(([k, v]) => istatSatiri(ETIKET[k] || k, sayi(v))).join('');
    const env = Object.entries(simdi.env).map(([k, v]) => istatSatiri(k, sayi(v))).join('');
    let ham = ''; try { ham = JSON.stringify(gs.state, null, 1); } catch { ham = '(okunamadı)'; }
    return `<div class="v3-lab-dugmeler"><button type="button" data-lab="karsilastir">📌 Karşılaştırma noktası al</button><button type="button" data-lab="yenile">↻ Yenile</button></div>
      ${kars}<h3>Şu anki durum</h3>${satirlar}<details class="v3-ayrinti"><summary>Envanter</summary>${env}</details>
      <details class="v3-ayrinti"><summary>Ham durum (JSON, ilk 20.000 karakter)</summary><pre class="v3-lab-ham">${esc(ham.slice(0, 20000))}</pre></details>`;
  };

  const govde = () => `<div class="v3-lab">${sekmeHtml()}${{ senaryo: senaryoSekmesi, arac: aracSekmesi, durum: durumSekmesi, gunluk: () => gunlukHtml(durum.gunluk) }[durum.sekme]()}</div>`;

  const ciz = () => {
    const eski = document.getElementById('modal-body');
    const kaydirma = eski ? eski.scrollTop : 0;
    api.openPanel(['🧪', 'Test laboratuvarı'], govde());
    const yeni = document.getElementById('modal-body');
    if (yeni) yeni.scrollTop = kaydirma;
  };

  const senaryoBul = (id) => SENARYOLAR.find((s) => s.id === id);
  const calistir = (s) => {
    const sonuc = senaryoCalistir(gs, s);
    durum.sonuclar[s.id] = sonuc;
    logla(`Senaryo: ${s.ad}`, sonuc.gecti ? 'geçti' : `kaldı (${sonuc.hata || sonuc.adimlar.filter((a) => !a.tamam).map((a) => a.ad).join('; ')})`);
    return sonuc;
  };

  const eylem = async (komut) => {
    const [ad, par] = komut.split(/:(.*)/s);
    const num = Number(par);
    switch (ad) {
      case 'sekme': durum.sekme = par; break;
      case 'kategori': durum.kategori = par; break;
      case 'calistir': { const s = senaryoBul(par); if (s && yerel()) { kayitAl(`Senaryo öncesi: ${s.ad}`); calistir(s); api.hudYenile(); } break; }
      case 'kur': { const s = senaryoBul(par); if (s && yerel()) { kayitAl(`Kur öncesi: ${s.ad}`); s.kur(gs); gs.saveState(); logla(`Durum kuruldu: ${s.ad}`, 'ön koşul hazır'); api.bildir(`Durum kuruldu: ${s.ad}. Şimdi elle deneyebilirsin.`, 'success'); api.hudYenile(); } break; }
      case 'hepsini': {
        if (!yerel()) break;
        const liste = SENARYOLAR.filter((s) => durum.kategori === 'hepsi' || s.kategori === durum.kategori);
        kayitAl(`Liste öncesi (${liste.length} senaryo)`);
        let gecen = 0; for (const s of liste) if (calistir(s).gecti) gecen += 1;
        api.hudYenile(); api.bildir(`${gecen}/${liste.length} senaryo geçti.`, gecen === liste.length ? 'success' : 'error'); break;
      }
      case 'zaman': { gs.fastForwardTime(num); logla('Zaman ilerletildi', `${num} saat`); api.bildir(`⏱️ ${num >= 1 ? `${num} saat` : `${Math.round(num * 60)} dakika`} ilerletildi.`, 'success'); break; }
      case 'kaynak': { for (const k of Object.keys(gs.getWarehouseCapacity())) gs.addDevResource(k, num); logla('Kaynak eklendi', `+${num} her hammadde`); api.bildir('🪙 Hammaddeler eklendi (silo kapasitesine kadar).', 'success'); break; }
      case 'astra': { if (num === 0) gs.setDevAdAstra(0); else gs.addDevAdAstra(num); logla('ASTRA', num === 0 ? 'sıfırlandı' : `+${num}`); break; }
      case 'stamina': gs.refillDevStamina(); logla('Stamina dolduruldu'); break;
      case 'seviye': { const v = Math.max(1, Math.min(100, Math.floor(Number(document.getElementById('lab-seviye')?.value) || 1))); gs.setDevLevel(v); logla('Seviye ayarlandı', String(v)); api.bildir(`👑 Seviye ${v}.`, 'success'); break; }
      case 'iyilestir': gs.healAllDevSoldiers(); logla('Askerler iyileştirildi'); break;
      case 'onar': gs.repairAllDevTools(); logla('Her şey onarıldı'); break;
      case 'zindan': { const v = Math.max(1, Math.min(18, Math.floor(Number(document.getElementById('lab-zindan')?.value) || 1))); gs.setDungeonProgress(v); logla('Zindan ilerlemesi', `${v}. kat`); break; }
      case 'kayit-al': { const ad2 = (document.getElementById('lab-kayit-ad')?.value || '').trim() || `Kayıt ${new Date().toLocaleTimeString('tr-TR')}`; if (kayitAl(ad2)) api.bildir('💾 Kayıt noktası alındı.', 'success'); break; }
      case 'kayit-sil': kayitlariYaz(kayitlariOku().filter((k) => k.id !== par)); logla('Kayıt silindi'); break;
      case 'kayit-yukle': {
        const k = kayitlariOku().find((x) => x.id === par);
        if (!k) break;
        if (!(await onay({ baslik: `"${k.ad}" kaydına dönülsün mü?`, metin: 'Şu anki oyun durumun bu kayıtla değiştirilir ve sayfa yenilenir.', tamam: 'Geri dön', tehlikeli: true }))) return;
        try { gs.state = JSON.parse(k.durum); gs.saveState(); logla('Kayıt yüklendi', k.ad); api.bildir('💾 Kayıt yüklendi, sayfa yenileniyor…', 'success'); setTimeout(() => location.reload(), 600); } catch (e) { api.bildir(`Kayıt yüklenemedi: ${e.message}`, 'error'); }
        return;
      }
      case 'karsilastir': durum.karsilastirma = ozet(gs); logla('Karşılaştırma noktası alındı'); break;
      case 'yenile': break;
      case 'sifirla': {
        if (!(await onay({ baslik: 'Oyun ilk güne döndürülsün mü?', metin: 'Hesabın, pazar havuzları ve kasalar başlangıç değerlerine döner. Bu geri alınamaz (yerel modda önce kayıt noktası alınır).', tamam: 'İlk güne döndür', tehlikeli: true }))) return;
        if (yerel()) kayitAl('Sıfırlama öncesi');
        logla('İlk güne döndürme', 'başladı');
        await api.vanillaSifirla();
        return;
      }
      default: return;
    }
    api.hudYenile();
    ciz();
  };

  // Yakalama aşaması: eski pencere kodu içerideki tıklamaları durduruyor
  document.getElementById('rpg-modal')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lab]');
    if (!b || !document.querySelector('#modal-body .v3-lab') || b.disabled) return;
    e.stopPropagation(); e.preventDefault();
    eylem(b.dataset.lab);
  }, true);

  return { ac: () => ciz(), durum };
}
