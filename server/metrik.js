// Prometheus metin biçiminde ölçümler (kurumsal A7.7). Ek paket yok: sayaç + birikimli histogram + ölçü (gauge).
// Etiket çeşidi SINIRLI: rota sayısı `enFazlaRota`'yı aşarsa fazlası "diger" altında toplanır (bellek şişmez, tarama küçük kalır).
import { monitorEventLoopDelay } from 'node:perf_hooks';

const KOVALAR = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];   // saniye
const kac = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const etiketMetni = e => { const k = Object.entries(e || {}); return k.length ? '{' + k.map(([a, d]) => `${a}="${kac(d)}"`).join(',') + '}' : ''; };
const sinif = durum => `${Math.floor(durum / 100)}xx`;

export function createMetrik({ enFazlaRota = 80 } = {}) {
  const sayac = new Map();       // "rota\u0000sinif" → sayı
  const hist = new Map();        // rota → { kovalar: number[], toplam, say }
  const olculer = [];            // { ad, yardim, fn }
  const rotalar = new Set();

  const dongu = monitorEventLoopDelay({ resolution: 20 });
  dongu.enable();

  function istek(rota, durum, saniye) {
    if (!rotalar.has(rota)) { if (rotalar.size >= enFazlaRota) rota = 'diger'; else rotalar.add(rota); }
    const k = rota + '\u0000' + sinif(durum);
    sayac.set(k, (sayac.get(k) || 0) + 1);
    let h = hist.get(rota);
    if (!h) hist.set(rota, h = { kovalar: new Array(KOVALAR.length).fill(0), toplam: 0, say: 0 });
    for (let i = 0; i < KOVALAR.length; i++) if (saniye <= KOVALAR[i]) h.kovalar[i]++;   // birikimli: her uygun kovaya
    h.toplam += saniye; h.say++;
  }

  // tur: 'gauge' (iner çıkar) ya da 'counter' (yalnız artar; yeniden başlayınca sıfırlanır, Prometheus rate() bunu bilir)
  function gauge(ad, yardim, fn, tur = 'gauge') { olculer.push({ ad, yardim, fn, tur }); }

  // Hazır süreç ölçüleri
  gauge('realm_surec_rss_bayt', 'Sürecin işletim sisteminden aldığı bellek (RSS)', () => process.memoryUsage().rss);
  gauge('realm_surec_heap_kullanilan_bayt', 'V8 yığınında kullanılan bellek', () => process.memoryUsage().heapUsed);
  gauge('realm_surec_heap_toplam_bayt', 'V8 yığınının ayrılan toplam boyutu', () => process.memoryUsage().heapTotal);
  gauge('realm_surec_calisma_saniye', 'Sürecin çalışma süresi', () => process.uptime());
  gauge('realm_olay_dongusu_gecikme_saniye', 'Olay döngüsü gecikmesi (son taramadan beri)', () => {
    const o = [{ etiket: { nicelik: '0.5' }, deger: dongu.percentile(50) / 1e9 }, { etiket: { nicelik: '0.99' }, deger: dongu.percentile(99) / 1e9 }, { etiket: { nicelik: 'max' }, deger: dongu.max / 1e9 }];
    dongu.reset();
    return o;
  });

  function metin() {
    const s = [];
    s.push('# HELP realm_http_istek_toplam HTTP istek sayısı (rota ve durum sınıfı)', '# TYPE realm_http_istek_toplam counter');
    for (const [k, n] of [...sayac].sort()) { const [rota, sn] = k.split('\u0000'); s.push(`realm_http_istek_toplam${etiketMetni({ rota, sinif: sn })} ${n}`); }
    s.push('# HELP realm_http_sure_saniye HTTP istek süresi', '# TYPE realm_http_sure_saniye histogram');
    for (const [rota, h] of [...hist].sort()) {
      KOVALAR.forEach((le, i) => s.push(`realm_http_sure_saniye_bucket${etiketMetni({ rota, le: String(le) })} ${h.kovalar[i]}`));
      s.push(`realm_http_sure_saniye_bucket${etiketMetni({ rota, le: '+Inf' })} ${h.say}`);
      s.push(`realm_http_sure_saniye_sum${etiketMetni({ rota })} ${h.toplam}`, `realm_http_sure_saniye_count${etiketMetni({ rota })} ${h.say}`);
    }
    for (const o of olculer) {
      let v;
      try { v = o.fn(); } catch { continue; }   // tek bir kaynak bozuksa tarama sürer (o ölçü o turda yok)
      const dizi = Array.isArray(v) ? v : [{ etiket: null, deger: v }];
      const satir = dizi.filter(x => typeof x.deger === 'number' && Number.isFinite(x.deger));
      if (!satir.length) continue;
      s.push(`# HELP ${o.ad} ${o.yardim}`, `# TYPE ${o.ad} ${o.tur}`);
      for (const x of satir) s.push(`${o.ad}${etiketMetni(x.etiket)} ${x.deger}`);
    }
    return s.join('\n') + '\n';
  }

  return { istek, gauge, metin, durdur: () => dongu.disable() };
}
