// Realm of AdAstra — Kotalarım: kişisel Üretim Hakkı, Sirius'un herkes için kapasitesi, günlük ve haftalık sınırlar.
import { ekranKaydet, kap, kart, katli, satir, cubukSatiri, hucre, izgara, etiket, not, tam, sayi, esc } from './cekirdek.js';

const GUN_ADLARI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

// 3 g 4 sa · 5 sa 12 dk · 8 dk
export function sureYazisi(ms) {
  const dakika = Math.max(0, Math.floor(ms / 60000));
  const gun = Math.floor(dakika / 1440);
  const saat = Math.floor((dakika % 1440) / 60);
  if (gun > 0) return `${gun} g ${saat} sa`;
  if (saat > 0) return `${saat} sa ${dakika % 60} dk`;
  return `${dakika} dk`;
}

const oran = (n, taban) => (taban > 0 ? Math.min(100, (n / taban) * 100) : 0);

// Kullanılan / sınır göstergesi
function sinirSatiri(simgeMetni, ad, kullanilan, sinir, { birim = '', not: ek = '' } = {}) {
  const kalan = Math.max(0, sinir - kullanilan);
  const oranYuzde = oran(kullanilan, sinir);
  return cubukSatiri(
    `${simgeMetni} ${esc(ad)}`,
    `${tam(kullanilan)} / ${tam(sinir)}${birim}`,
    oranYuzde,
    { ton: oranYuzde >= 100 ? 'kotu' : (oranYuzde >= 80 ? 'dolu' : '') }
  ) + `<div class="ek-kucuk">${kalan > 0 ? `Kalan: ${tam(kalan)}${esc(birim)}` : 'Sınır doldu'}${ek ? ` · ${esc(ek)}` : ''}</div>`;
}

// Zindan günlük giriş basamakları: 1 aşınmasız · 2-5 ödüllü · sonrası harçlı
function girisBasamaklari(dun) {
  const bedava = dun.freeTotal || 5;
  const kullanilan = dun.entriesToday || 0;
  const parcalar = [];
  for (let n = 1; n <= bedava; n++) {
    parcalar.push(etiket(`${n}. giriş · ${n === 1 ? 'aşınma yok' : 'silah −1'}`, kullanilan >= n ? 'iyi' : (kullanilan + 1 === n ? 'vurgu' : '')));
  }
  parcalar.push(etiket(`${bedava + 1}+ · kapı harçlı`, kullanilan >= bedava ? 'vurgu' : ''));
  return `<div class="ek-etiketler">${parcalar.join('')}</div>`;
}

const ekran = {
  id: 'kotalar',
  goruldu: 'kota',
  canliYenile: true,
  baslik: () => ['📊', 'Kotalarım'],

  govde(b) {
    const gs = b.gameState;
    const cfg = b.GAME_CONFIG;
    const havuz = b.globalPool;
    const kaynaklar = cfg.RESOURCE_KEYS;
    const meta = cfg.RESOURCE_META || {};
    const adlar = cfg.GLOBAL_RESOURCE_CAPS || {};
    const simdi = Date.now();

    const agirlik = gs.getUretimWeight();
    const parametre = havuz.uretimParams();
    const otorite = havuz.otoriteWork(parametre.otoriteLevel);
    const bilgiler = Object.fromEntries(kaynaklar.map((k) => [k, havuz.getResourceInfo(k)]));
    const ilk = bilgiler[kaynaklar[0]] || {};
    const gunSirasi = ilk.dayIndex || 0;
    const haftaBitis = havuz.state.epochEndTime;
    const piyango = gs.getLotteryStatus();
    const zindan = gs.getDungeonDayStatus();
    const sayaclar = gs.getDailyCounters();
    const kolezyumSiniri = (cfg.COLOSSEUM && cfg.COLOSSEUM.DAILY_MATCH_CAP) || 10;
    const ubiAlt = (cfg.UBI_CONFIG && cfg.UBI_CONFIG.MIN_LEVEL) || 3;
    const ubiAlindi = (gs.state.lastClaimedUbiEpoch || 0) >= (havuz.state.epochId || 1);
    const gecePusu = (() => {
      const t = new Date(simdi + 3 * 3600 * 1000);   // TSİ gece yarısı
      t.setUTCHours(24, 0, 0, 0);
      return t.getTime() - 3 * 3600 * 1000;
    })();

    const sayaclar3 = izgara([
      hucre('Kotanın yeni parçası', ilk.nextReleaseAt && gunSirasi < 6 ? sureYazisi(ilk.nextReleaseAt - simdi) : 'Hafta sonu'),
      hucre('Günlük haklar yenilenir', sureYazisi(gecePusu - simdi)),
      hucre('Yeni hafta', sureYazisi(haftaBitis - simdi))
    ]);

    const hakSatirlari = kaynaklar.map((k) => {
      const hak = gs.getUretimHakki(k);
      const m = meta[k] || adlar[k] || {};
      return cubukSatiri(
        `${esc(m.icon || '')} ${esc(m.name || k)}`,
        `Şimdi çıkarabilirsin: ${tam(hak.canTake)}`,
        oran(hak.used, hak.weekly),
        { renk: m.color || '' }
      ) + (hak.canTake < 1 ? '<div class="ek-kucuk">Bugünlük bitti, yeni parça yarın açılır.</div>' : '');
    }).join('');
    const hakAyrinti = kaynaklar.map((k) => {
      const hak = gs.getUretimHakki(k);
      const m = meta[k] || adlar[k] || {};
      return satir(`${esc(m.icon || '')} ${esc(m.name || k)}`, `hak ${tam(hak.weekly)} · çıkardığın ${tam(hak.used)}${hak.extra > 0 ? ` · +${tam(hak.extra)} boşta kalandan` : ''}`);
    }).join('');

    const nasil = `Haftalık payın = taban üretim × Otorite çalışma süresi (${Math.round(otorite.hours)} sa × ${Math.round(otorite.days)} gün) × sabit kişisel kota × ağırlığın (seviye ×${agirlik.levelFactor} · ev ×${agirlik.houseFactor ?? 1} · katkı kademesi ${esc(agirlik.tier.name)} ×${agirlik.tier.mult} · aktiflik ×${agirlik.activity}). Bu senin kişisel limitindir; ortak havuz kıtsa payın limitinden küçük olur (havuzun %60'ı herkese eşit, %40'ı limiti ve katkısı yüksek olanlara). Her gün 1/7'si açılır; dolunca mahsul seferde bekler. Başkalarının kullanmadığı hak, hakkını aşanlara (en çok 3 katına kadar) akar. Çıkarılanın %5'i Sirius Konseyi ortak kasasına gider.`;

    const gunSeridi = `<div class="ek-etiketler">${GUN_ADLARI.map((ad, i) => etiket(`${ad}${i < gunSirasi ? ' ✓' : ''}`, i < gunSirasi ? 'iyi' : (i === gunSirasi ? 'vurgu' : ''))).join('')}</div>`;
    const siriusSatirlari = kaynaklar.map((k) => {
      const bilgi = bilgiler[k];
      const m = meta[k] || adlar[k] || {};
      const taban = bilgi.baseCap || 0;
      return cubukSatiri(
        `${esc(m.icon || '')} ${esc(m.name || k)}`,
        `Alınabilir ${tam(bilgi.availableToday || 0)}`,
        oran(bilgi.harvestedThisWeek || 0, taban),
        { renk: m.color || '' }
      ) + `<div class="ek-kucuk">Çıkarılan ${tam(bilgi.harvestedThisWeek || 0)} · açılan ${tam(bilgi.releasedCap || 0)} · haftalık ${tam(taban)}${taban - (bilgi.currentCap ?? taban) > 0 ? ` · 🔥 yakılan ${tam(taban - bilgi.currentCap)}` : ''}</div>`;
    }).join('');
    const siriusNotu = `Bütün oyuncuların bu hafta çıkarabileceği toplam hammadde. Kota her gün bir parça açılır; açılıp çıkarılmayan kısım hafta içinde birikir. Seferin topladığı miktar, o an alınabilir olanla sınırlıdır. Şu an kota %${Math.round((parametre.qpp[kaynaklar[0]] || 0) * 100)}, Otorite seviye ${parametre.otoriteLevel}.`;

    const gunluk = [
      sinirSatiri('💀', 'Zindan: harçsız ödüllü giriş', zindan.freeUsed, zindan.freeTotal, {
        not: zindan.nextNeedsFee ? 'Sonraki girişler harçlı' : (zindan.nextWeaponWear ? 'Her askerin birkaç eşyası girişte birer aşınır (kat ve moda göre artar)' : 'Sıradaki girişte eşyalar aşınmaz')
      }),
      sinirSatiri('🏟️', 'Kolezyum maçı', sayaclar.arenaMatches || 0, kolezyumSiniri),
      katli('Piyango bileti, zindan bütçesi ve giriş basamakları', sinirSatiri('🎟️', 'Piyango: bugün aldığın bilet', piyango.boughtToday, piyango.maxPerDay) + sinirSatiri('🏦', 'Zindan kasasının bugünkü ödeme bütçesi', Math.max(0, (zindan.budget || 0) - (zindan.budgetLeft || 0)), zindan.budget || 0, {
        birim: ' ASTRA', not: `Kasa günde en fazla bakiyesinin %${sayi(((b.GAME_CONFIG.DUNGEON || {}).DAILY_BUDGET_RATE ?? 0.0036) * 100, 2)}'ini öder`
      }) + girisBasamaklari(zindan), { k: 'kota-zindan-detay' })
    ].join('');

    const haftalik = [
      satir('🎫 Elindeki bilet (devredenler dahil)', `${tam(piyango.myTickets)} bilet`),
      satir('🏛️ Haftalık temel gelir (UBI)', (gs.state.level || 1) < ubiAlt ? `${ubiAlt}. seviyede açılır` : (ubiAlindi ? 'Bu hafta alındı' : 'Bu hafta alınabilir'), ubiAlindi ? 'iyi' : '')
    ].join('');

    return kap([
      kart({
        baslik: '🎫 Üretim hakkın (bu hafta)',
        rozet: etiket(`ağırlık ×${agirlik.weight} · kademe ${agirlik.tier.name}`),
        icerik: not('Bu hafta ne kadar hammadde çıkarabileceğin. Her gün bir parçası açılır; "Şimdi çıkarabilirsin" kadarını toplarsın.') + hakSatirlari + katli('Haftalık hakkın ve nasıl hesaplanır? (ayrıntı)', hakAyrinti + not(nasil), { k: 'kota-nasil' })
      }),
      katli('⏱️ Yenilenme süreleri', sayaclar3, { k: 'kota-sureler' }),
      katli(`🌍 Sirius kapasitesi (herkes) · ${gunSirasi + 1}. gün / 7`, gunSeridi + siriusSatirlari + not(siriusNotu), { k: 'kota-sirius' }),
      kart({ baslik: '📅 Günlük sınırların (bugün)', icerik: gunluk }),
      katli('🗓️ Haftalık sınırların', haftalik, { k: 'kota-haftalik' })
    ].join(''));
  }
};

export default ekranKaydet(ekran);
