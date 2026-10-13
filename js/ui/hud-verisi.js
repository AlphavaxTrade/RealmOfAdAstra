// Realm of AdAstra — üst çubuğun (v3 HUD) okuduğu değerler: doğrudan oyun durumundan, DOM'a dokunmadan üretilir.
// Saf işlevler testlerde doğrudan içe alınır (tests/test_hud_verisi.mjs).

const tr = (n) => Math.floor(Number(n) || 0).toLocaleString('tr-TR');

/** Bot rozeti: kapalı / durdu / çalışıyor ve süre yazısı. */
export function botDurumu(gs) {
  if (gs.isBotPaused()) {
    const onkosul = gs.checkBotPrerequisites();
    return { durum: 'paused', metin: 'Bot: Durdu', ipucu: `Bot durdu, süresi donduruldu. Eksik: ${onkosul.missingText || 'kaynak'}` };
  }
  if (gs.isAutoCollectorActive()) {
    const kalan = gs.getAutoCollectorRemainingText();
    return { durum: 'on', metin: `Bot · ${kalan}`, ipucu: `Bot çalışıyor, kalan süre: ${kalan}` };
  }
  return { durum: 'off', metin: 'Bot: Kapalı', ipucu: 'Otomasyon botu kapalı — Tavernadan başlat' };
}

/** Bakiyenin yazılışı: dar ekranda 10 bin ve üstü kısaltılır (12,35 B / 1,2 Mn): 360 px'te en uzun metin "9.999,99" (denetim QA-07). */
export function bakiyeYazisi(bakiye, darEkran) {
  if (darEkran && bakiye >= 10000) return bakiye.toLocaleString('tr-TR', { notation: 'compact', maximumFractionDigits: 2 });
  return bakiye.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * @param {object} o
 * @param {object} o.gs                oyun durumu yöneticisi
 * @param {string[]} o.kaynaklar       GAME_CONFIG.RESOURCE_KEYS
 * @param {number} o.okunmamis         bildirim sayısı (zil)
 * @param {object} o.danisman          gameState.getRoyalAdvisorAdvice() sonucu
 * @param {boolean} o.darEkran         telefon genişliği mi
 */
export function hudVerisi({ gs, kaynaklar, okunmamis, danisman, darEkran }) {
  const st = gs.state;
  const enCokStamina = gs.getMaxStamina(st.level);
  const stamina = Math.floor(st.stamina);
  const siloSiniri = gs.getWarehouseCapacity();

  const kaynakVeri = {};
  for (const k of kaynaklar) {
    const mevcut = Number(st.inventory[k]) || 0;
    const sinir = siloSiniri[k] || 0;
    const yuzde = sinir > 0 ? Math.max(0, Math.min(100, (mevcut / sinir) * 100)) : 0;
    kaynakVeri[k] = {
      deger: tr(mevcut),
      yuzde,
      dolu: sinir > 0 && yuzde >= 99.5,
      ipucu: sinir > 0 ? `${tr(mevcut)} / ${tr(sinir)} (silo %${Math.round(yuzde)})` : ''
    };
  }
  kaynakVeri.fragments = { deger: tr(st.inventory.fragments), yuzde: 0, dolu: false, ipucu: '' };

  const bot = botDurumu(gs);
  return {
    seviye: `Lv.${st.level}`,
    staminaYuzde: Math.max(0, Math.min(100, (stamina / Math.max(1, enCokStamina)) * 100)),
    staminaMetin: `${stamina}/${enCokStamina}`,
    bakiye: bakiyeYazisi(st.adAstraBalance, darEkran),
    kaynaklar: kaynakVeri,
    bot: { durum: bot.durum, metin: bot.metin },
    bildirim: okunmamis,
    danisman: {
      simge: danisman.icon || '🧙‍♂️',
      baslik: danisman.title || 'Kralın Danışmanı',
      metin: String(danisman.advice || '').replace(/<[^>]*>/g, ''),
      eylem: danisman.action || '',
      eylemEtiketi: danisman.actionLabel || '✨ İncele'
    }
  };
}
