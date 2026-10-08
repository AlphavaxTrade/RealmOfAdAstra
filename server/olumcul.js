// Ölümcül hatalar (kurumsal A7.4): yakalanmamış istisna ya da reddedilip hiçbir yerde ele alınmayan söz = programın bilmediği bir durum.
// Doğru davranış: ayrıntıyla kaydet, izlemeye ilet, kısa süre bekle (günlük/e-posta yazılsın) ve 1 koduyla ÇIK; systemd/Docker temiz süreci yeniden başlatır.
// Bellekte tutarsız durumla yarım yamalak devam etmek (eski davranış) para yollarında daha tehlikelidir. Veri güvende: SQLite işlemleri atomiktir,
// yarım kalan işlem açılışta geri alınır. İlk ölümcül hata işlenir; arkasından gelenler çıkışı tekrarlamaz.
export function olumculKur({ proses = process, log = console, izleme = null, cikis = k => process.exit(k), bekleMs = 300 }) {
  let basladi = false;
  const isle = tur => async hata => {
    if (basladi) return;
    basladi = true;
    const err = hata instanceof Error ? hata : new Error(String(hata));
    log.error(`ÖLÜMCÜL: ${tur}; süreç kapatılıyor (yeniden başlatma bekleniyor)`, { hata: err });
    try { izleme?.yakala(err, { tur }); } catch { /* izleme kancası çıkışı engelleyemez */ }
    const bosalt = Promise.resolve().then(() => izleme?.bosalt?.(bekleMs)).catch(() => { /* aynı sebeple sessiz */ });
    await Promise.race([bosalt, new Promise(r => setTimeout(r, bekleMs))]);
    cikis(1);
  };
  proses.on('uncaughtException', isle('yakalanmamış istisna'));
  proses.on('unhandledRejection', isle('ele alınmayan söz reddi'));
}
