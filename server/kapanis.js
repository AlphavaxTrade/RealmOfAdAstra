// Düzgün kapanış (kurumsal A7.5). Sıra: zamanlayıcıları durdur → yeni bağlantı alma → yarıdaki istekleri ve bekleyen işleri (örn. dünya turu)
// en çok `beklemeMs` bekle → süre dolduysa kalan bağlantıları kes → veritabanını EN SON kapat (bekleyen yazma kalmasın).
// Windows'ta SIGTERM yakalanamaz; bu yüzden mantık, sinyal bağlamasından ayrı ve doğrudan çağrılabilir bir işlevdir (test böyle sınar).
export function createKapanis({ server, db, log = console, durdur = [], bekleyenler = () => [], beklemeMs = 10000 }) {
  let soz = null;

  async function calistir(neden) {
    const t0 = Date.now();
    let temiz = true;
    log.info('Sunucu kapanıyor', { neden, beklemeMs });
    for (const f of durdur) { try { f(); } catch (err) { log.warn('Kapanışta zamanlayıcı durdurulamadı:', err.message); } }

    const sunucuKapandi = new Promise(r => server.close(r));   // yeni bağlantı almaz; açık bağlantılar bitince çağrılır
    server.closeIdleConnections?.();                            // beklemedeki (keep-alive) bağlantılar hemen kapanır
    const isler = Promise.allSettled([sunucuKapandi, ...bekleyenler().filter(Boolean)]);
    let sayac;
    const sureDoldu = new Promise(r => { sayac = setTimeout(() => r('sure'), beklemeMs); });
    const sonuc = await Promise.race([isler.then(() => 'bitti'), sureDoldu]);
    clearTimeout(sayac);
    if (sonuc === 'sure') {
      temiz = false;
      log.warn('Kapanış süresi doldu: açık bağlantılar zorla kesiliyor', { beklemeMs });
      server.closeAllConnections?.();
      await Promise.race([sunucuKapandi, new Promise(r => setTimeout(r, 500))]);
    }
    try { db.close(); } catch (err) { temiz = false; log.error('Veritabanı kapatılamadı:', err); }
    const sureMs = Date.now() - t0;
    log.info('Sunucu kapandı', { temiz, sureMs });
    return { temiz, sureMs };
  }

  // Aynı anda iki sinyal (SIGTERM + SIGINT) gelse de tek kapanış çalışır
  const kapat = neden => (soz ??= calistir(neden));
  return { kapat };
}
