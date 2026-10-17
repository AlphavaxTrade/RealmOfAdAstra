// Realm of AdAstra sunucusu — rotalar: "Sorun bildir" (geri bildirim / bilet; mantık server/geri-bildirim.js, şema geçiş 009)
// Oyuncu: gönderir ve kendi biletlerini + sahibinin cevabını okur. Yönetici (ADMIN_TOKEN): listeler, bir bileti görüntüleriyle okur,
// durumunu değiştirir, cevap yazar. Oyuncunun yazdığı her şey veridir (panel kaçışlar, hiçbir yerde çalıştırılmaz).
import { biletCoz } from '../geri-bildirim.js';

// 4 görüntü (her biri en çok 300 KB data: URL) + metin: yalnız bu uçta gövde sınırı 64 KB yerine 1,5 MB
export const GERI_BILDIRIM_GOVDE = 1.5 * 1024 * 1024;

export default function geriBildirimRotalari(ctx) {
  const { geriBildirim: gb, readBody, clientIp } = ctx;
  const kapali = () => [404, { error: 'Geri bildirim kapalı' }];
  const sorgu = req => new URL(req.url, 'http://x').searchParams;
  const hataKodu = err => { if (err && err.kod) return [err.kod, { error: err.message }]; throw err; };
  return {
    'POST /api/feedback': async (req, me) => {
      if (!gb) return kapali();
      const t = gb.temizle(await readBody(req, GERI_BILDIRIM_GOVDE));
      if (t.hata) return [400, { ok: false, error: t.hata }];
      if (gb.cokHizli(me, clientIp(req))) return [429, { ok: false, error: 'Kısa sürede çok bildirim gönderdin: biraz sonra tekrar dene.' }];
      const { no, bilet } = gb.kaydet(me, t);
      return { ok: true, no, bilet };
    },
    'GET /api/feedback/mine': (req, me) => (gb ? { ok: true, list: gb.benimkiler(me) } : kapali()),
    'GET /api/admin/feedback': (req) => {
      if (!gb) return kapali();
      const s = sorgu(req);
      return { ok: true, ...gb.liste({ durum: s.get('durum') || '', ara: s.get('ara') || '' }) };
    },
    'GET /api/admin/feedback/detail': (req) => {
      if (!gb) return kapali();
      const no = biletCoz(sorgu(req).get('no'));
      if (!no) return [400, { error: 'Bilet numarası gerekli (ör. RB-1001).' }];
      try { return { ok: true, bilet: gb.ayrinti(no) }; } catch (err) { return hataKodu(err); }
    },
    'POST /api/admin/feedback/update': async (req) => {
      if (!gb) return kapali();
      const b = await readBody(req);
      const no = biletCoz(b.no);
      if (!no) return [400, { error: 'Bilet numarası gerekli (ör. RB-1001).' }];
      try { return { ok: true, bilet: gb.guncelle(no, { durum: b.durum, cevap: b.cevap }) }; } catch (err) { return hataKodu(err); }
    }
  };
}
