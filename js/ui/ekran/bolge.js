// Realm of AdAstra — Hammadde bölgesi ekranı: altı bölgenin (tarla, taş ocağı, orman, kömür, maden, ot bahçesi) tek şablonu.
// secenek.kaynak: hammadde anahtarı. Sefer başlatma / toplama, üretim hakkı ve alet onarımı.
import { ekranKaydet, kap, kart, satir, cubuk, cubukSatiri, dugme, dugmeler, uyari, not, sure, tam, astra, sayi, esc, yenile } from './cekirdek.js';

const BOLGE_ADLARI = {
  wheat: 'Güneş Tarlası ve Değirmen', stone: 'Taş Ocağı', wood: 'Zümrüt Ormanı ve Oduncu',
  coal: 'Kömür Ocağı', iron: 'Demir Madeni ve Tamirhane', herb: 'Şifalı Ot Bahçesi'
};

function bolgeBilgisi(b, key) {
  const meta = (b.GAME_CONFIG.RESOURCE_META || {})[key] || {};
  const kota = (b.GAME_CONFIG.GLOBAL_RESOURCE_CAPS || {})[key] || {};
  const aletKimligi = meta.tool || kota.requiredTool;
  const aletCfg = (b.GAME_CONFIG.TOOLS || {})[aletKimligi] || {};
  return {
    key,
    ad: meta.name || kota.name || key,
    simge: meta.icon || kota.icon || '',
    renk: meta.color || '#ca8a04',
    aletKimligi,
    aletAdi: aletCfg.name || aletKimligi,
    aletEnFazla: aletCfg.maxDurability || 4320
  };
}

function seferKutusu(b, bolge) {
  const gs = b.gameState;
  const acc = gs.getAccruedExpeditionHarvest(bolge.key);
  const kapasite = gs.getWarehouseCapacity();
  const sinir = kapasite[bolge.key];
  const mevcut = Number(gs.state.inventory[bolge.key]) || 0;
  const bosYer = sinir != null ? Math.max(0, sinir - mevcut) : acc.accruedAmount;
  const tamamenDolu = sinir != null && bosYer <= 0;
  const kismiYer = sinir != null && bosYer > 0 && bosYer < acc.accruedAmount;

  let siloUyarisi = '';
  if (tamamenDolu) {
    siloUyarisi = uyari(`Silon tamamen dolu (${tam(mevcut)} / ${tam(sinir)}). Seferdeki +${tam(acc.accruedAmount)} ${esc(bolge.ad)} mahsulünü almak için siloyu büyüt ya da yer aç.`, 'kotu');
  } else if (kismiYer) {
    siloUyarisi = uyari(`Siloda ${tam(bosYer)} boş yer var (${tam(mevcut)} / ${tam(sinir)}). Silonu doldurana kadar alabilirsin; kalan ${tam(acc.accruedAmount - bosYer)} seferde bekler.`, 'uyari');
  }

  const erkenMetin = kismiYer ? `⚡ Boş yeri doldur (+${tam(bosYer)})` : `⚡ Erken topla (+${tam(acc.accruedAmount)})`;
  const tamMetin = tamamenDolu ? '⚠️ Silo dolu: yer aç' : (kismiYer ? `📥 Siloyu doldur (+${tam(bosYer)}), kalanı beklet` : '🏁 Tamamlandı: tümünü topla');
  return `<div class="ek-sefer" data-tamam="${acc.isCompleted ? 1 : 0}">
    <div class="ek-satir"><span>⏳ ${esc(bolge.ad)} seferi sürüyor</span><b data-canli="pct">%${acc.pct}</b></div>
    <div class="ek-satir"><span>Kalan süre</span><b data-canli="sure">${esc(sure(acc.remainingSeconds * 1000))}</b></div>
    <div data-canli="cubuk">${cubuk(acc.pct, { renk: bolge.renk })}</div>
    <div class="ek-satir"><span>${esc(bolge.simge)} Biriken</span><b data-canli="biriken">+${esc(tam(acc.accruedAmount))} ${esc(bolge.ad)} (+${esc(tam(acc.accruedXp || 0))} XP)</b></div>
    ${siloUyarisi}
    ${dugmeler(
      dugme({ e: 'erken', metin: erkenMetin, veri: { kaynak: bolge.key }, devreDisi: acc.accruedAmount <= 0 || tamamenDolu, id: `btn-erken-${bolge.key}` }),
      acc.isCompleted ? dugme({ e: 'topla', metin: tamMetin, ton: tamamenDolu ? 'tehlike' : 'iyi', veri: { kaynak: bolge.key } }) : ''
    )}
  </div>`;
}

const ekran = {
  id: 'bolge',
  goruldu: 'bolge',
  ornekSecenekler: (b) => b.GAME_CONFIG.RESOURCE_KEYS.map((kaynak) => ({ kaynak })),
  baslik: (b, secenek) => {
    const bolge = bolgeBilgisi(b, secenek.kaynak);
    return [bolge.simge, BOLGE_ADLARI[bolge.key] || bolge.ad];
  },

  govde(b, secenek) {
    const gs = b.gameState;
    const bolge = bolgeBilgisi(b, secenek.kaynak);
    const durum = gs.state;
    const aracDurumu = (durum.tools || {})[bolge.aletKimligi] || { durability: bolge.aletEnFazla };
    const dayanikli = aracDurumu.durability != null ? aracDurumu.durability : bolge.aletEnFazla;
    const dayanikliYuzde = Math.round((dayanikli / bolge.aletEnFazla) * 100);
    const onarim = gs.calculateRepairCost(bolge.aletKimligi) || { woodCost: 0, ironCost: 0, adAstraCost: 0, missingDurability: 0 };
    const sefer = durum.activeExpeditions[bolge.key];
    const hizli = gs.isBuffActive('speed_' + bolge.key);
    const saat = gs.getExpeditionDurationHours();
    const dakika = gs.getExpeditionDurationMinutes();
    const dakikaHizi = gs.getResourceRatePerMinute(bolge.key);
    const tahmin = Math.floor(dakikaHizi * dakika * (hizli ? 1.5 : 1));
    const stamina = gs.getExpeditionStaminaCost();
    const staminaAz = durum.stamina < stamina;
    const hak = gs.getUretimHakki ? gs.getUretimHakki(bolge.key) : null;
    const parsomen = Number(durum.inventory.scroll_stamina) || 0;

    const bilgiler = [
      satir('Üretim', `${sayi(dakikaHizi, 2)} / dk · ${tam(dakikaHizi * 60)} / saat`),
      satir('Beklenen kazanç', `~${tam(tahmin)} ${bolge.ad}`),
      satir('Alet aşınması', `-${tam(dakika)} dk`),
      hak ? satir('Üretim hakkın', `bugün alınabilir ${tam(hak.canTake)} · bu hafta ${tam(hak.used)} / ${tam(hak.released)}`, hak.canTake > 0 ? 'iyi' : 'kotu') : ''
    ].join('');
    const aletSatiri = cubukSatiri(`🔧 ${esc(bolge.aletAdi)}`, `${tam(dayanikli)} / ${tam(bolge.aletEnFazla)} dk (%${dayanikliYuzde})`, dayanikliYuzde, { ton: dayanikli <= bolge.aletEnFazla / 6 ? 'kotu' : '' });

    let eylem;
    if (sefer) {
      eylem = seferKutusu(b, bolge);
    } else {
      eylem = dugme({
        e: 'baslat', metin: `${sayi(saat, 1)} saatlik ${esc(bolge.ad)} görevine gönder (-${tam(stamina)} ⚡)`, ton: 'birincil', genis: true,
        veri: { kaynak: bolge.key }, devreDisi: dayanikli <= 0 || staminaAz
      })
      + (staminaAz && parsomen > 0
        ? dugme({ e: 'parsomen', metin: `⚡ Yetersiz stamina: parşömen kullan (${parsomen} adet, +100 ⚡)`, genis: true })
        : (staminaAz ? uyari(`Stamina yetmiyor: ${tam(stamina)} ⚡ gerekir. Buğdayla staminanı doldurabilirsin.`, 'uyari') : ''));
    }

    const onarimBedeli = onarim.missingDurability > 0
      ? `${tam(onarim.woodCost)} odun + ${tam(onarim.ironCost)} demir + ${astra(onarim.adAstraCost)} ASTRA`
      : '✅ tam sağlam';
    return kap([
      kart({
        baslik: `${esc(bolge.simge)} ${esc(bolge.ad)} seferi`,
        rozet: `<span class="ek-etiket${hizli ? ' is-vurgu' : ''}">${sayi(saat, 1)} saat (${tam(dakika)} dk)${hizli ? ' ⚡ 1,5x hızlı' : ''}</span>`,
        icerik: bilgiler + aletSatiri + eylem
      }),
      kart({
        baslik: `🔨 ${esc(bolge.aletAdi)} tamiratı`,
        icerik: satir('Bedel', onarimBedeli)
          + not(`Her aşınan dakika için odun ve demir (dakikalık üretimin %25'i, aletlere bölünmüş) ile bu malzemenin pazar değerinin %30'u kadar ASTRA gerekir. Eksik: ${tam(onarim.missingDurability)} dk.`)
          + dugme({ e: 'onar', metin: onarim.missingDurability <= 0 ? `${esc(bolge.aletAdi)} tamamen sağlam` : `${esc(bolge.aletAdi)} onar`, veri: { alet: bolge.aletKimligi }, devreDisi: onarim.missingDurability <= 0, genis: true })
      })
    ].join(''));
  },

  eylemler: {
    baslat(b, el) {
      const r = b.gameState.startExpedition(el.dataset.kaynak);
      b.bildir(r.message, r.success ? 'success' : 'error');
      if (r.success) return { kapat: true };
      return undefined;
    },
    topla(b, el) {
      const r = b.gameState.claimExpedition(el.dataset.kaynak);
      if (!r.success) { b.bildir(r.message, (r.isWarehouseFull || r.isQuotaWait) ? 'warning' : 'error'); return undefined; }
      b.bildir(r.message, 'success');
      return r.isPartialSiloFill ? undefined : { kapat: true };
    },
    erken(b, el) {
      const r = b.gameState.claimPartialExpedition(el.dataset.kaynak);
      b.bildir(r.message, r.success ? 'success' : ((r.isWarehouseFull || r.isQuotaWait) ? 'warning' : 'error'));
    },
    onar(b, el) {
      const r = b.gameState.repairTool(el.dataset.alet);
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    parsomen(b) {
      const r = b.gameState.useScroll('scroll_stamina', null);
      b.bildir(r.message, r.success ? 'success' : 'error');
    }
  },

  // Saniyede bir: süre, yüzde, çubuk ve biriken miktar yerinde güncellenir; sefer tamamlandıysa ekran yeniden çizilir
  canli(kok, b, secenek) {
    const kutu = kok.querySelector('.ek-sefer');
    if (!kutu) return;
    const acc = b.gameState.getAccruedExpeditionHarvest(secenek.kaynak);
    if ((acc.isCompleted ? 1 : 0) !== Number(kutu.dataset.tamam)) { yenile(); return; }
    const yaz = (alan, metin) => { const e = kutu.querySelector(`[data-canli="${alan}"]`); if (e && e.textContent !== metin) e.textContent = metin; };
    yaz('sure', sure(acc.remainingSeconds * 1000));
    yaz('pct', `%${acc.pct}`);
    const bolge = bolgeBilgisi(b, secenek.kaynak);
    yaz('biriken', `+${tam(acc.accruedAmount)} ${bolge.ad} (+${tam(acc.accruedXp || 0)} XP)`);
    const cubukKutu = kutu.querySelector('[data-canli="cubuk"] .ek-cubuk');
    if (cubukKutu) cubukKutu.style.setProperty('--p', `${Math.min(100, acc.pct)}%`);
    const erken = kutu.querySelector(`#btn-erken-${secenek.kaynak}`);
    if (erken) erken.disabled = acc.accruedAmount <= 0;
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
