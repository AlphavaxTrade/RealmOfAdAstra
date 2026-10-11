// Realm of AdAstra — Taverna ve Bot ekranı: otomasyon botu satın alma, durum, ayarlar ve ücret dökümü.
import { ekranKaydet, kap, kart, katli, satir, dugme, uyari, not, izgara, simge, tam, astra, esc } from './cekirdek.js';
import { kaynakSimgesi, kaynakAdi } from './bilesik.js';

const BOT_RESMI = 'assets/ui/bot.webp';

function botKarti(b) {
  const gs = b.gameState;
  const duraklatildi = gs.isBotPaused();
  const calisiyor = gs.isAutoCollectorActive();
  const onkosul = gs.checkBotPrerequisites();
  const bitis = gs.getAutoCollectorExpiry();
  const kalanMs = duraklatildi ? (gs.state.botPausedRemainingMs || 0) : Math.max(0, bitis - Date.now());
  const kalanMetin = `${Math.floor(kalanMs / 3600000)} saat ${Math.floor((kalanMs % 3600000) / 60000)} dakika`;
  const botCfg = b.GAME_CONFIG.TAVERNA_BOT || {};
  const paketler = botCfg.PACKAGE_HOURS || [24];
  const ON = botCfg.REQUIRED_PREREQUISITES || { iron: 50, wood: 50, wheat: 50, adAstra: 0.5 };   // botun çalışma önkoşulu (yapılandırmadan)

  let durumEtiketi;
  if (duraklatildi) durumEtiketi = `<span class="ek-etiket is-uyari">⏸️ Duraklatıldı · ${esc(kalanMetin)} donduruldu</span>`;
  else if (calisiyor) durumEtiketi = `<span class="ek-etiket is-iyi">✅ Çalışıyor · ${esc(kalanMetin)} kaldı</span>`;
  else durumEtiketi = '<span class="ek-etiket">💤 Kapalı</span>';

  const paketDugmeleri = paketler.map((h) => dugme({
    e: 'paketAl', ton: 'birincil', veri: { saat: h }, id: `btn-bot-paket-${h}`,
    metin: `<span class="ek-dugme-yazi"><span>${calisiyor ? `⚡ +${h} saat uzat` : `🤖 ${h} saatlik bot`}</span><small>${esc(tam(gs.getBotPackageCost(h)))} ASTRA</small></span>`
  }));
  if (!gs.state.botTrialUsed) {
    paketDugmeleri.push(dugme({ e: 'deneme', metin: `<span class="ek-dugme-yazi"><span>🎁 ${botCfg.TRIAL_HOURS || 1} saat ücretsiz dene</span><small>bir kerelik hediye</small></span>`, ton: 'iyi', id: 'btn-bot-deneme' }));
  }

  return kart({
    baslik: `<img class="ek-bot-resim" src="${BOT_RESMI}" alt="" draggable="false" data-fb="text:🤖"> Otomasyon botu`,
    rozet: durumEtiketi,
    vurgu: duraklatildi ? 'uyari' : (calisiyor ? 'iyi' : ''),
    icerik: not('Sen yokken altı alanda (buğday, taş, odun, kömür, demir, şifalı ot) seferleri kendisi başlatır, staminayı buğdayla doldurur ve aletleri onarır. Ücreti, botun sana kazandıracağı <b>günlük net kârın yarısıdır</b>.')
      + (duraklatildi ? uyari(`<b>Bot bekliyor:</b> çalışmak ve aletleri onarmak için deponda en az ${tam(ON.iron)} demir, ${tam(ON.wood)} odun, ${tam(ON.wheat)} buğday ve ${ON.adAstra} ASTRA olmalı. Kalan süren (${esc(kalanMetin)}) bu sırada azalmaz. <b>Eksikler:</b> ${esc(onkosul.missingText)}. Tamamladığın anda bot kaldığı yerden devam eder.`, 'uyari') : '')
      + `<div class="ek-dugmeler">${paketDugmeleri.join('')}</div>`
  });
}

function seferDurumu(b) {
  const gs = b.gameState;
  const calisiyor = gs.isAutoCollectorActive();
  const hucreler = b.GAME_CONFIG.RESOURCE_KEYS.map((k) => {
    const sefer = gs.state.activeExpeditions?.[k];
    const durum = sefer ? (sefer.isCompleted ? '✅ toplanıyor' : '⏳ sürüyor') : '💤 boşta';
    return `<div class="ek-oge">${simge(kaynakSimgesi(b, k), true)}<div class="ek-oge-govde"><small>${esc(kaynakAdi(b, k))}</small><b>${durum}</b></div></div>`;
  });
  return kart({
    baslik: `${calisiyor ? '🟢 Bot çalışıyor' : '⚪ Bot beklemede'} · seferler`,
    rozet: calisiyor ? dugme({ e: 'dongu', metin: '🚀 Boştakileri şimdi başlat', ton: 'iyi' }) : '',
    icerik: izgara(hucreler, { kolon: 2 })
  });
}

function ayarlar(b) {
  const gs = b.gameState;
  const siloBuyut = gs.state.botSiloAutoUpgrade !== false;
  const yenile_ = !!gs.state.botAutoRenew24h;
  const secenek = (deger, etiket, aciklama, secili) => `<button type="button" class="ek-secenek${secili ? ' is-secili' : ''}" data-e="siloSecenegi" data-deger="${deger}" aria-pressed="${secili}">
      <b>${secili ? '◉' : '○'} ${esc(etiket)}</b><small>${esc(aciklama)}</small></button>`;
  return kart({
    baslik: '⚙️ Bot ayarları',
    icerik: `<div class="ek-alt-baslik">Silo dolarsa</div>
      <div class="ek-liste">
        ${secenek('upgrade', 'Siloyu büyüt', "Güvenlik payının üstündeki ASTRA'yı kullanır, yetmezse fazla ürünü satar.", siloBuyut)}
        ${secenek('sell', 'Fazlasını sat', 'Silonun yarısını yedek tutar, fazlasını pazarda satar.', !siloBuyut)}
      </div>
      <button type="button" class="ek-secenek${yenile_ ? ' is-secili' : ''}" data-e="otoYenile" aria-pressed="${yenile_}">
        <b>${yenile_ ? '☑' : '☐'} Süre bitince otomatik yenile</b><small>Hesabında yeterli ASTRA varsa bot 24 saat daha çalışır.</small></button>`
  });
}

function ucretDokumu(b) {
  const gs = b.gameState;
  const h = gs.calculateTavernaBotProfitAndCost() || {};
  const n0 = (v) => tam(Math.round(Number(v) || 0));
  const icerik = [
    satir('24 saatlik üretimin pazar değeri', `+${n0(h.grossRevenueAda)} ASTRA`, 'iyi'),
    satir(`Stamina için buğday (${n0(h.dailyWheatNeededForStamina)} buğday)`, `−${n0(h.staminaWheatCostAda)} ASTRA`, 'kotu'),
    satir('Alet onarımı', `−${n0(h.toolRepairCostAda)} ASTRA`, 'kotu'),
    satir('Net kâr', `+${n0(h.netProfitAda)} ASTRA`),
    satir('Bot ücreti (net kârın yarısı)', `${n0(h.botCostAda)} ASTRA`, 'uyari'),
    not(`🛡️ <b>Güvenlik payı:</b> Bot kasanda en az <b>${esc(astra(gs.getBotAdaReserve()))} ASTRA</b> bırakır${gs.state.botAutoRenew24h ? ' (ertesi günün bot ücreti dahil)' : ''}.`)
  ].join('');
  return katli('📊 Ücret nasıl hesaplanıyor?', icerik, { k: 'ucret' });
}

const ekran = {
  id: 'taverna',
  canliYenile: true,
  baslik: () => ['🍺', 'Taverna ve bot'],
  govde: (b) => kap(botKarti(b) + seferDurumu(b) + ayarlar(b) + ucretDokumu(b)),

  eylemler: {
    paketAl(b, el) {
      const r = b.gameState.buyTavernaAutomationBot(false, Number(el.dataset.saat) || 24);
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    deneme(b) {
      const r = b.gameState.startBotTrial();
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    dongu(b) {
      b.gameState.runTavernaAutomationCycle();
      b.bildir('🚀 Otonom seferler ve tamir döngüsü hemen tetiklendi!', 'success');
    },
    siloSecenegi(b, el) {
      const buyut = el.dataset.deger === 'upgrade';
      b.gameState.setBotSiloOption(buyut);
      b.bildir(buyut ? '🤖 Bot: silo dolunca otomatik yükseltme modu seçildi.' : '🤖 Bot: silo dolunca akıllı satış modu seçildi (döngü kazancı + %5 güvenlik marjı).', 'info');
    },
    otoYenile(b) {
      const yeni = !b.gameState.state.botAutoRenew24h;
      b.gameState.setBotAutoRenew24h(yeni);
      b.bildir(yeni
        ? '🔄 24 saat bitince hesapta yeterli ASTRA varsa bot otomatik olarak yeniden satın alınıp devam edecek.'
        : '⏸️ 24 saat bitince bot otomatik yenilemesi kapatıldı.', yeni ? 'success' : 'info');
    }
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
