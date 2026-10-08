// Realm of AdAstra — GameStateManager yöntemleri: Katılım Puanı durumu (E-planı Faz 1, 8 Ekim 2026)
// Bu dosya yalnız OYUNCUNUN KENDİ durumunu saklar (hangi kategoriye dokundu, izin hakkı, bekleyen soru). Kategori
// eşlemesi (hangi işlem hangi kategori) ve haftalık DEĞERLENDİRME (eşik karşılaştırması, askı kararı) sunucu
// dünyasındadır: server/aktiflik.js (saf hesap) + server/kapi.js (karar + veritabanı). Mixin: js/gameState.js.
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { esikSeviye } from '../economy/katilimEsik.js';

const yillikIzinHakki = () => Number(GAME_CONFIG.KATILIM_PUANI?.IZIN_YILLIK_GUN) || 30;
const izinBlokGun = () => Math.min(14, yillikIzinHakki());
const takvimYili = ms => new Date(ms).getUTCFullYear();

export const katilimYontemleri = {
  _katilim() {
    const ep = (globalPool && globalPool.state) ? globalPool.state.epochId : 1;
    const yil = takvimYili(this._now());
    let k = this.state.katilim;
    if (!k || typeof k !== 'object') {
      k = this.state.katilim = { epochId: ep, touched: {}, dusukHaftaSayisi: 0, izinYili: yil, izinYillikKalan: yillikIzinHakki(), izinModu: null, izinSorusu: null, sonUyari: null, oncelikKullanildi: false };
    }
    if (k.izinYili !== yil) { k.izinYili = yil; k.izinYillikKalan = yillikIzinHakki(); }   // yeni takvim yılı: hak yenilenir
    if (k.epochId !== ep) { k.epochId = ep; k.touched = {}; }   // yeni hafta: dokunulanlar sıfırlanır (değerlendirme sunucuda zaten yapıldı)
    if (!k.touched || typeof k.touched !== 'object') k.touched = {};
    if (typeof k.izinYillikKalan !== 'number') k.izinYillikKalan = yillikIzinHakki();
    return k;
  },

  // Bir kategoriye bu hafta dokunulduğunu işaretler (server/rotalar/oyun.js, başarılı işlem sonrası çağırır)
  _markKatilimTouch(kategori) {
    if (!kategori) return;
    this._katilim().touched[kategori] = true;
  },

  // İzindeyken (ekonomiden pay almama) mi? Üretim Hakkı / UBI hesaplarının okuyacağı tek yer.
  izindeMi() {
    const k = this._katilim();
    return !!(k.izinModu && this._now() < Number(k.izinModu.bitis));
  },

  // Aynısı, ama durumu DEĞİŞTİRMEDEN: _katilim() hafta döndüyse dokunulanları sıfırlar; haftalık hesaplaşmadan önce
  // çalışan okuma yolları (refreshUretim → _getUretimWeightRaw) bunu tetiklememeli, yoksa değerlendirme boş sayım görür.
  izindeMiOkuma() {
    const k = this.state.katilim;
    return !!(k && k.izinModu && this._now() < Number(k.izinModu.bitis));
  },

  // Oyuncunun kendi "karnesi" (Konsey ekranı / kişisel panel)
  getKatilimOzet() {
    const k = this._katilim();
    const kategoriler = GAME_CONFIG.KATILIM_PUANI?.KATEGORILER || [];
    const puan = kategoriler.filter(kat => k.touched[kat]).length;
    const esik = esikSeviye(this.state.level);   // tek kaynak: js/economy/katilimEsik.js (sunucu da aynısını kullanır)
    return {
      kategoriler: kategoriler.map(kat => ({ id: kat, dokunuldu: !!k.touched[kat] })),
      puan, esik, saglikli: puan >= esik, kategoriSayisi: kategoriler.length,
      dusukHaftaSayisi: k.dusukHaftaSayisi || 0,
      izinYillikKalan: k.izinYillikKalan,
      izindeMi: this.izindeMi(),
      izinModu: k.izinModu ? { ...k.izinModu } : null,
      izinSorusu: k.izinSorusu ? { ...k.izinSorusu } : null,
      sonUyari: k.sonUyari ? { ...k.sonUyari } : null
    };
  },

  // İzin sorusuna cevap. evet=true: kalan hakkından en çok 14 gün (ya da kalanı, hangisi azsa) kullanılır.
  cevaplaIzinSorusu(evet) {
    const k = this._katilim();
    if (!k.izinSorusu) return { success: false, message: 'Bekleyen bir izin sorusu yok.' };
    const now = this._now();
    if (now > Number(k.izinSorusu.sonTarih)) { k.izinSorusu = null; this.saveState(); return { success: false, message: 'Cevap süresi geçti.' }; }
    k.izinSorusu = null;
    if (!evet) { this.saveState(); return { success: true, izinAlindi: false, message: 'İzin kullanılmadı; katılımın takip edilmeye devam ediyor.' }; }
    if (k.izinYillikKalan <= 0) { this.saveState(); return { success: false, message: 'Bu yıl için izin hakkın kalmadı.' }; }
    const gun = Math.min(izinBlokGun(), k.izinYillikKalan);
    k.izinYillikKalan -= gun;
    k.izinModu = { baslangic: now, bitis: now + gun * 86400000, gun };
    k.dusukHaftaSayisi = 0;
    this.saveState();
    return { success: true, izinAlindi: true, gun, kalanHak: k.izinYillikKalan, message: `🏖️ ${gun} günlük izin başladı. Yerini kaybetmezsin, ama bu süre ekonomiden pay almazsın.` };
  },

  // İzni erken bitirme (oyuncu kendi isteğiyle geri dönerse)
  bitirIzin() {
    const k = this._katilim();
    if (!k.izinModu) return { success: false, message: 'Zaten izinde değilsin.' };
    k.izinModu = null;
    this.saveState();
    return { success: true, message: 'İzin bitti; katılımın yeniden takip ediliyor.' };
  },

  // ═══════════════════════════════════════════════════════════════════════
  // "Hazır aday" — sırada beklerken (misafir modunda) tamamlanan 3 basit onay adımı (oyun aksiyonu değil,
  // ekonomiye dokunmaz). server/kapi.js fillSeats() hazirMi() === true olanı önce çağırır.
  // ═══════════════════════════════════════════════════════════════════════
  misafirGorevTamamla(gorevId) {
    const gecerli = GAME_CONFIG.KAPI?.READY_TASK_IDS || [];
    if (!gecerli.includes(gorevId)) return { success: false, message: 'Geçersiz adım.' };
    if (!this.state.candidateReady || typeof this.state.candidateReady !== 'object') this.state.candidateReady = {};
    this.state.candidateReady[gorevId] = true;
    this.saveState();
    return { success: true, tamam: this.hazirAdayOzet() };
  },

  hazirMi() {
    const gecerli = GAME_CONFIG.KAPI?.READY_TASK_IDS || [];
    const c = this.state.candidateReady || {};
    return gecerli.length > 0 && gecerli.every(id => !!c[id]);
  },

  hazirAdayOzet() {
    const gecerli = GAME_CONFIG.KAPI?.READY_TASK_IDS || [];
    const c = this.state.candidateReady || {};
    return { adimlar: gecerli.map(id => ({ id, tamam: !!c[id] })), hazir: this.hazirMi() };
  }
};
