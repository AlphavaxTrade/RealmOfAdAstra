// Realm of AdAstra — Karnaval ekranı: şans çarkı, haftalık piyango ve karnaval kasaları.
// Kurallar js/gameState/karnaval.js (çark) ve piyango.js içindedir; burada yalnız gösterim ve dönüş canlandırması var.
import {
  ekranKaydet, kap, kart, katli, satir, sekmeler, cubukSatiri, dugme, dugmeler, uyari, not, izgara, hucre, etiket,
  tam, astra, sayi, sure, esc
} from './cekirdek.js';
import { kaynakSimgesi, kaynakAdi } from './bilesik.js';
import { odulSimgesi } from '../art.js';
import * as cark from './cark.js';

const SEKMELER = [
  { id: 'cark', ad: 'Çark', simge: '🎡' },
  { id: 'piyango', ad: 'Piyango', simge: '🎟️' },
  { id: 'havuzlar', ad: 'Kasalar', simge: '🏛️' }
];
const TUVAL = 'ek-cark-tuval';
const IBRE = 'ek-cark-ibre';
const DURUM = 'ek-cark-durum';

// Çarkın son durduğu açı: panel yeniden çizilse de çark yerinde kalır
let tuvalDerece = 0;

const dilimler = (b) => b.GAME_CONFIG.CARNIVAL.WHEEL_REWARDS;

// Dilimin çark üstündeki kısa adı; ASTRA tutarı oyuncunun güncel fiyat çarpanıyla gösterilir
function kisaAd(b, r) {
  if (r.pity) return `Şans ${astra(b.gameState.adaPrice(r.amount || 0))}`;
  if (r.type === 'ada') return `${astra(b.gameState.adaPrice(r.amount || 0))} ASTRA`;
  if (r.key === 'fragments') return `${r.amount} Parça`;
  if (r.type === 'amm_raw') return `${kaynakAdi(b, r.key)} ${astra(r.adaVal)} ASTRA`;
  if (r.type === 'key') return 'Anahtar';
  if (r.type === 'bot_free') return `${r.hours || 24}s Bot`;
  if (r.type === 'ticket_shard') return 'Bilet Parçası';
  if (r.type === 'lottery_ticket') return 'Piyango Bileti';
  if (r.type === 'stamina_buy') return `${astra(r.adaVal)} ASTRA Stamina`;
  return String(r.name || '').slice(0, 12);
}

const cizilecekler = (b) => dilimler(b).map((r) => ({ icon: r.icon, etiket: kisaAd(b, r) }));

// ── Çark sekmesi ─────────────────────────────────────────────────────────
function odemeDugmeleri(b, carpan) {
  const gs = b.gameState;
  const s = gs.state;
  const tekBedel = gs.getWheelCostAda();
  const bedel = tekBedel * carpan;
  const durum = gs.isCarnivalWheelOpen(carpan);
  const carpanlar = b.GAME_CONFIG.CARNIVAL.WHEEL_MULTIPLIERS || [1];
  const bilet = s.lotteryTickets || 0;
  const hak = gs.getWheelResourceSpinsLeft();
  const hakSinir = b.GAME_CONFIG.CARNIVAL.WHEEL_RESOURCE_DAILY_LIMIT ?? 3;

  const hammadde = b.GAME_CONFIG.RESOURCE_KEYS.map((k) => {
    const fiyat = b.ammMarket.getPrice(k) || 1;
    const gereken = Math.ceil(bedel / fiyat);
    const yeter = (s.inventory[k] || 0) >= gereken;
    return dugme({
      e: 'cevir', veri: { odeme: k }, devreDisi: carpan > 1 || !durum.open || hak <= 0 || !yeter,
      metin: `<span class="ek-simge is-kucuk" aria-hidden="true">${kaynakSimgesi(b, k)}</span><span>${esc(tam(gereken))} ${esc(kaynakAdi(b, k))}</span>`
    });
  }).join('');
  const carpanSecici = carpanlar.length > 1
    ? `<p class="ek-kucuk">Çarpan: bedel ve ödül aynı oranda büyür (yalnız ASTRA).</p>`
      + dugmeler(...carpanlar.map((n) => dugme({ e: 'carpan', veri: { carpan: n }, ton: n === carpan ? 'birincil' : 'hayalet', metin: `×${esc(n)} · ${esc(astra(tekBedel * n))} ASTRA` })))
    : '';

  return kart({
    icerik: carpanSecici
      + dugme({ e: 'cevir', veri: { odeme: 'ada' }, ton: 'birincil', genis: true, devreDisi: !durum.open || s.adAstraBalance < bedel, metin: `🟣 ${esc(astra(bedel))} ASTRA ile çevir${carpan > 1 ? ` (×${esc(carpan)})` : ''}` })
      + dugme({ e: 'cevir', veri: { odeme: 'ticket' }, genis: true, devreDisi: carpan > 1 || !durum.open || bilet < 1, metin: `🎟️ 1 bilet ile çevir (${esc(tam(bilet))} biletin var)` })
      + katli(`Hammaddeyle çevir (bugün kalan ${esc(hak)}/${esc(hakSinir)})`,
        `<div class="ek-dugmeler">${hammadde}</div><p class="ek-kucuk">Ödediğin hammaddenin yarısı yakılır, yarısı pazarda satılıp Karnaval kasasına girer.</p>`,
        { k: 'cark-hammadde' })
  });
}

function sonucKarti(b, sonuc) {
  if (!sonuc) return '';
  const satirlar = [];
  if (sonuc.yedek) satirlar.push(uyari(`Pazarda bu eşya şu an bulunamadı; ödülün ASTRA karşılığı (${esc(astra(sonuc.astra))} ASTRA) kasadan ödendi.`, 'uyari'));
  else if (sonuc.astra > 0) satirlar.push(satir('Hesabına eklenen', `${astra(sonuc.astra)} ASTRA`, 'iyi'));
  if (sonuc.geriAlim) {
    const g = sonuc.geriAlim;
    satirlar.push(satir('Teslim edilen', `${g.amount > 1 ? tam(g.amount) + ' ' : ''}${g.poolName}`, 'iyi'));
    satirlar.push(satir('Karnaval kasası pazardan aldı', `${astra(g.adaSpent)} ASTRA`));
    satirlar.push(satir('Pazar fiyatı', `${sayi(g.oldPrice, 4)} → ${sayi(g.newPrice, 4)} (%${sayi(g.priceDeltaPct, 2)})`));
    if (sonuc.siloSatilan > 0) satirlar.push(uyari(`Silo dolu olduğu için ${esc(tam(sonuc.siloSatilan))} adedi pazarda satıldı (+${esc(astra(sonuc.siloAstra))} ASTRA).`, 'uyari'));
  }
  if (sonuc.yakim) {
    const y = sonuc.yakim;
    satirlar.push(satir('Ödediğin hammadde', `${tam(y.amount)} ${y.resourceNameTr} yakıldı${y.soldQty > 0 ? `, ${tam(y.soldQty)} satıldı` : ''}`, 'uyari'));
  }
  if (sonuc.parcaBirikti) satirlar.push(uyari(`${esc(tam(sonuc.yeniBilet * 3))} bilet parçası birikti: +${esc(tam(sonuc.yeniBilet))} piyango bileti kazandın (çarkta bilet olarak da kullanılabilir).`, 'iyi'));
  if (sonuc.stamina > 0) satirlar.push(satir('Kazandığın stamina', `+${tam(sonuc.stamina)} ⚡`, 'iyi'));
  if (sonuc.tur === 'lottery_ticket') satirlar.push(uyari(`${esc(tam(sonuc.carpan))} piyango bileti envanterine eklendi (çarkta bilet olarak da kullanılabilir).`, 'iyi'));
  if (sonuc.pityTetik) satirlar.push(uyari('Şans Sayacı doldu: bu çevirme garantili nakit ödüldü. Sayaç sıfırlandı.', 'iyi'));
  if (sonuc.tur === 'ticket_shard' && !sonuc.parcaBirikti) satirlar.push(satir('Bilet parçası', `${sonuc.parca}/3`));
  if (sonuc.tur === 'bot_free') satirlar.push(uyari('Ücretsiz otomasyon botun çalışmaya başladı (Taverna).', 'iyi'));

  return kart({
    vurgu: 'iyi',
    icerik: `<div class="ek-sonuc"><span class="ek-sonuc-simge">${odulSimgesi(sonuc.odul)}</span>
      <div><b class="ek-sonuc-baslik">Çarktan kazandın!${sonuc.carpan > 1 ? ` (×${esc(sonuc.carpan)})` : ''}</b><span class="ek-kucuk">${esc(sonuc.ad)}</span></div></div>${satirlar.join('')}`
  });
}

function carkSekmesi(b, secenek) {
  const gs = b.gameState;
  const K = b.GAME_CONFIG.CARNIVAL;
  const durum = gs.isCarnivalWheelOpen();
  const ist = cark.donusIstatistigi(dilimler(b), K.WHEEL_COST_ADA);
  const parca = gs.state.wheelTicketShards || 0;
  const toplamAgirlik = dilimler(b).reduce((s, r) => s + (r.weight || 0), 0) || 1;
  const sayac = gs.getWheelPityInfo();
  const carpan = (K.WHEEL_MULTIPLIERS || [1]).includes(secenek.carpan) ? secenek.carpan : 1;
  const cheerYapildi = !!gs.getDailyCounters().carnivalCheer;

  const sahne = `<div class="ek-cark-sahne">
      <div class="ek-cark-tekerlek">
        <div class="ek-cark-ibre" id="${IBRE}" aria-hidden="true">
          <svg width="34" height="42" viewBox="0 0 34 42" fill="none">
            <path d="M17 40 L4 12 A14 14 0 1 1 30 12 Z" fill="#eab308" stroke="#78350f" stroke-width="2"/>
            <circle cx="17" cy="14" r="5" fill="#fef08a" stroke="#ca8a04" stroke-width="2"/>
          </svg>
        </div>
        <canvas id="${TUVAL}" class="ek-cark-tuval" width="${cark.TUVAL_BOYUTU}" height="${cark.TUVAL_BOYUTU}" role="img" aria-label="Şans çarkı, ${dilimler(b).length} ödül dilimi"></canvas>
      </div>
      <p class="ek-cark-durum" id="${DURUM}" role="status">Çevirmek için aşağıdan bir ödeme yolu seç.</p>
    </div>`;

  const odulTablosu = dilimler(b).map((r) => {
    const sans = (r.weight / toplamAgirlik) * 100;
    const sansMetni = r.pity ? `${sayac.limit} boş çevirmeden sonra garanti` : `Şans: %${sayi(sans, sans < 10 ? 2 : 1)}`;
    return `<div class="ek-hucre ek-odul"><span class="ek-odul-simge">${odulSimgesi(r)}</span><b>${esc(r.name)}</b><small>${esc(sansMetni)}</small></div>`;
  });

  return [
    // Üstte tek cümle + çark + çevirme düğmeleri; kurallar, ödül tablosu ve günlük hediye katlı (20 Ekim 2026, arayüz sadeleştirme)
    kart({
      baslik: `🎡 Krallık Çarkı · ${esc(astra(gs.getWheelCostAda()))} ASTRA`,
      rozet: etiket(`🍀 Şans ${sayac.streak}/${sayac.limit}`, sayac.streak >= sayac.limit - 1 ? 'uyari' : 'vurgu'),
      icerik: not('Çarkı çevir, ödülü hemen kazan. ASTRA, piyango bileti ya da hammaddeyle çevrilir.')
        + katli('Kurallar ve şans sayacı (ayrıntı)',
          not(`Ödüller Karnaval kasasından ödenir; çevirmelerin yaklaşık %${esc(ist.geri)}'inde en az bedelini geri alırsın (ortalama dönüş ~%${esc(ist.donus)}, Şans Sayacı hariç). Çarpan (×2, ×10) yalnız ASTRA ile kullanılır.`)
          + satir('Bilet parçaların', `${parca}/3`)
          + cubukSatiri('🍀 Şans Sayacı (bedelini geri almayan çevirme)', `${sayac.streak}/${sayac.limit}`, (sayac.streak / sayac.limit) * 100, { ton: sayac.streak >= sayac.limit - 1 ? 'dolu' : '' })
          + not(`Art arda ${esc(sayac.limit)} çevirmede bedelini geri alamazsan sonraki çevirme garantili nakittir.`), { k: 'cark-kural' })
    }),
    sahne,
    sonucKarti(b, secenek.sonuc),
    durum.open ? '' : uyari(`Karnaval kasası yenileniyor (${esc(astra(durum.balance))} / ${esc(astra(durum.minBalance))} ASTRA). Kasa en büyük ödülü karşılayacak kadar dolunca çark yeniden açılır.`, 'uyari'),
    odemeDugmeleri(b, carpan),
    katli(`🎪 Günlük hediye${cheerYapildi ? ' (alındı ✅)' : ' (+10 ⚡ stamina)'}`,
      not('Günde bir kez karnavala katılıp +10 ⚡ stamina kazanırsın.')
      + dugme({ e: 'cheer', metin: cheerYapildi ? '✅ Bugün katıldın' : '🎪 Coşkuya katıl (+10 ⚡)', devreDisi: cheerYapildi, genis: true }), { k: 'cark-cosku' }),
    katli('📋 Çarkın ödülleri ve şansları', izgara(odulTablosu, { genis: true })
      + not('Hammadde, parça ve stamina ödülleri Karnaval kasasının parasıyla pazardan satın alınıp sana verilir (stamina için kasa buğday alıp yakar); pazarda bulunamazsa ödülün ASTRA karşılığı ödenir. Çarpanlı çevirmede her ödül aynı oranda büyür.'), { k: 'cark-odul' })
  ].join('');
}

// ── Piyango sekmesi ──────────────────────────────────────────────────────
function piyangoSekmesi(b) {
  const gs = b.gameState;
  const l = gs.getLotteryStatus();
  const kurallar = gs.getLotteryRules();
  const sonraki = b.globalPool.getNextWeeklyResetTRT ? b.globalPool.getNextWeeklyResetTRT() : Date.now();
  const bekleyen = l.pendingPayout || 0;
  const son = l.lastResult;
  const sonMetin = son
    ? (son.userWon ? `🎉 Kazandın (+${astra(son.wonAmount)} ASTRA)` : (son.amorti > 0 ? `Amorti +${astra(son.amorti)} ASTRA` : 'Çıkmadı, biletlerin devretti'))
    : 'Henüz yok';
  const yerel = !(b.online && b.online.active);

  return [
    kart({
      baslik: '🎟️ Haftalık Krallık Piyangosu',
      rozet: etiket('Çekiliş: Pazartesi 00:01 (TSİ)'),
      icerik: not('Her hafta <b>tek kazanan</b> çıkar. Ne kadar çok biletin varsa şansın o kadar yüksek.')
        + katli('Kurallar (ayrıntı)', not('Kazanan, biletlerine ödediğinin <b>2 katını</b> kasadan alır ve ödülü çektiği an <b>elindeki bütün biletler yanar</b>. Kazanamayanın biletleri yanmaz, sonraki haftaya devreder.')
          + (yerel ? uyari('Tek başına oynama modunda diğer bilet sahipleri temsilidir. Gerçek oyuncularla ortak piyango çevrimiçi modda çalışır.') : ''), { k: 'piyango-kural' })
    }),
    izgara([
      hucre('Piyango kasası', `${astra(l.pool)} ASTRA`),
      hucre('Kazanırsan alacağın', `${astra(l.potentialPrize)} ASTRA`, 'iyi'),
      hucre('Kazanma şansın', `%${sayi(l.chance * 100, 2)}`),
      hucre('Sonraki çekiliş', sure(sonraki - Date.now()))
    ]),
    katli(`🛡️ Günlük bilet sınırın (${tam(l.boughtToday)}/${tam(l.maxPerDay)}) ve biletlerin`,
      cubukSatiri('Bugün aldığın', `${tam(l.boughtToday)} / ${tam(l.maxPerDay)}`, l.maxPerDay > 0 ? (l.boughtToday / l.maxPerDay) * 100 : 0, { ton: l.canBuy > 0 ? '' : 'dolu' })
      + satir('Elindeki bilet (devredenler dahil)', `${tam(l.myTickets)} bilet / toplam ${tam(l.totalTickets)}`)
      + satir('Bu biletler için ödediğin', `${astra(l.paid)} ASTRA`), { k: 'piyango-sinir' }),
    kart({
      baslik: '🎟️ Bilet al',
      icerik: `<div class="ek-alan-satiri"><label class="ek-alan" for="ek-bilet-adet"><span>Bilet adedi</span>
          <input class="ek-girdi ek-girdi-dar" type="number" id="ek-bilet-adet" inputmode="numeric" min="1" max="${esc(Math.max(1, l.canBuy))}" value="${esc(Math.min(1, l.canBuy) || 1)}"${l.canBuy > 0 ? '' : ' disabled'}></label>
          ${dugme({ e: 'biletAl', ton: 'birincil', devreDisi: l.canBuy <= 0, metin: l.canBuy > 0 ? `🎟️ Bilet al (${esc(astra(kurallar.ticketPrice))} ASTRA/adet)` : '🚫 Şu an bilet alamazsın' })}</div>`
        + (l.canBuy > 0 ? '' : uyari('Bugünkü bilet alım sınırın doldu. Gece yarısı (00:00 TSİ) yenilenir.', 'uyari'))
        + katli('Bilet bedeli nereye gider?', not(`Bilet bedelinin %${esc(sayi(kurallar.amortiShare * 100, 0))}'i amorti kasasına (şu an ${esc(astra(l.amortiPool))} ASTRA), kalanı piyango kasasına gider. Amorti yalnız piyango kasası biterse kalan tüm biletlere eşit dağıtılır.`), { k: 'piyango-bedel' })
    }),
    kart({
      baslik: '👑 Kazancın',
      vurgu: bekleyen > 0 ? 'iyi' : '',
      rozet: etiket(bekleyen > 0 ? 'Çekilmeyi bekliyor' : 'Bekleyen kazanç yok', bekleyen > 0 ? 'iyi' : ''),
      icerik: satir('Çekilecek kazanç', `${astra(bekleyen)} ASTRA`, bekleyen > 0 ? 'iyi' : '')
        + satir('Son çekiliş', sonMetin)
        + dugme({ e: 'talep', ton: 'birincil', devreDisi: bekleyen <= 0, genis: true, metin: bekleyen > 0 ? '🏆 Kazancımı cüzdana çek' : 'Çekilecek kazanç yok' })
    })
  ].join('');
}

// ── Kasalar sekmesi ──────────────────────────────────────────────────────
function kasaSekmesi(b) {
  const gs = b.gameState;
  const durum = gs.isCarnivalWheelOpen();
  const l = gs.getLotteryStatus();
  const fp = gs.getFreePlayerPoolInfo();
  const yaz = (ok) => (ok ? '✅' : '❌');
  const ucretsiz = fp.deposited
    ? not('Hesabına para yatırdığın için ücretsiz oyuncu payı senin için değildir; kazandığın ödüller devam eder.')
    : not(`${yaz(fp.levelOk)} En az ${esc(fp.minLevel)}. seviye (sen: ${esc(fp.level)})<br>${yaz(fp.contributionOk)} Bu hafta en az ${esc(tam(fp.needContribution))} katkı puanı (sen: ${esc(tam(fp.weekContribution))})<br>📧 E-postanın doğrulanmış olması gerekir.`)
      + satir('Sadakat serin', `${fp.streakWeeks} hafta · bu haftaki çarpan ×${sayi(fp.streakMultiplier, 1)} (en çok ×${fp.streakMax})`)
      + not(`Kaçırılan hafta seriyi yarıya indirir. Pay, katkın arttıkça hızla büyür; ${fp.locked ? 'kilitli gelir, oyunda harcadıkça çözülür' : 'her kazanç gibi gelir'}.`);

  return [
    kart({
      baslik: '🎪 Karnaval kasası',
      rozet: etiket(durum.open ? 'çark açık' : 'çark kapalı', durum.open ? 'iyi' : 'uyari'),
      icerik: satir('Kasadaki ASTRA', `${astra(durum.balance)} ASTRA`)
        + katli('Kasa nasıl çalışır? (ayrıntı)', satir('Çarkın açık kalması için en az', `${astra(durum.minBalance)} ASTRA`) + not(`Çarkın ASTRA bedelinin %${esc(sayi(b.GAME_CONFIG.CARNIVAL.WHEEL_CARNIVAL_SHARE * 100, 0))}'i doğrudan bu kasaya girer; çark ve eşya ödülleri buradan ödenir. Kasa yetmezse ödül yoktan verilmez, çark kapanır.`), { k: 'kasa-nasil' })
    }),
    kart({
      baslik: '🎟️ Piyango kasası',
      icerik: satir('Piyango kasası', `${astra(l.pool)} ASTRA`)
        + katli('Diğer piyango kasaları', satir('Amorti kasası', `${astra(l.amortiPool)} ASTRA`) + satir('Kazananı bekleyen ödül', `${astra(l.pendingPayout)} ASTRA`), { k: 'kasa-piyango' })
    }),
    katli('🎁 Haftalık ücretsiz oyuncu payı (ayrıntı)', ucretsiz, { k: 'kasa-ucretsiz' }),
    dugme({ e: 'git', veri: { hedef: 'hazine' }, metin: '👑 Tüm kasalar (Hazine)' })
  ].join('');
}

const ekran = {
  id: 'karnaval',
  goruldu: (b, secenek) => (secenek.sekme === 'havuzlar' ? 'havuzlar' : null),
  kilit: 'carnival',
  ornekSecenekler: () => [{ sekme: 'cark' }, { sekme: 'piyango' }, { sekme: 'havuzlar' }],
  baslik: () => ['🎪', 'Karnaval'],

  govde(b, secenek) {
    secenek.sekme = secenek.sekme || 'cark';
    // Kasalar sekmesi yeni oyuncuyu yormasın: 5. seviyeden sonra görünür (doğrudan bağlantıyla yine açılır)
    const seviye = Number(b.gameState.state.level) || 1;
    const sekmeListesi = SEKMELER.filter((s) => s.id !== 'havuzlar' || seviye >= 5 || secenek.sekme === 'havuzlar');
    const icerik = secenek.sekme === 'piyango' ? piyangoSekmesi(b) : (secenek.sekme === 'havuzlar' ? kasaSekmesi(b) : carkSekmesi(b, secenek));
    return kap(sekmeler(sekmeListesi, secenek.sekme, 'sekme') + icerik);
  },

  // Tuvali çizer ve son açıya çevirir (govde saf kalır; tuval her çizimde yenidir)
  sonra(b, secenek, kok) {
    const tuval = kok.querySelector(`#${TUVAL}`);
    if (!tuval) return;
    cark.ciz(tuval, cizilecekler(b));
    cark.ayarla(tuval, tuvalDerece);
    if (secenek.donuyor) kok.querySelectorAll('[data-e="cevir"]').forEach((d) => { d.disabled = true; });
  },

  eylemler: {
    sekme(b, el, secenek) {
      if (secenek.donuyor) return false;
      secenek.sekme = el.dataset.sekme;
      secenek.sonuc = null;
      return undefined;
    },

    carpan(b, el, secenek) {
      if (secenek.donuyor) return false;
      secenek.carpan = Number(el.dataset.carpan) || 1;
      return undefined;
    },

    async cevir(b, el, secenek) {
      if (secenek.donuyor) return false;
      const odeme = el.dataset.odeme;
      const carpan = odeme === 'ada' ? (secenek.carpan || 1) : 1;
      secenek.donuyor = true;
      secenek.sonuc = null;
      let r;
      try {
        r = await b.gameState.spinCarnivalWheel(odeme, carpan);
      } catch (e) {
        secenek.donuyor = false;
        throw e;
      }
      if (!r || !r.success) {
        secenek.donuyor = false;
        b.bildir((r && r.message) || 'Çark çevrilemedi.', 'error');
        return false;
      }
      b.hudYenile();

      const kok = b.panelKok();
      kok.querySelectorAll('[data-e="cevir"]').forEach((d) => { d.disabled = true; });
      const durum = document.getElementById(DURUM);
      if (durum) durum.textContent = '🌀 Çark dönüyor… Şans seninle olsun!';

      const liste = dilimler(b);
      const sira = Math.max(0, liste.findIndex((d) => d.id === r.reward.id));
      const hedef = cark.hedefDerece({ dilimSayisi: liste.length, kazananSira: sira, simdiki: tuvalDerece, tur: 5 + Math.floor(Math.random() * 3) });
      const azalt = document.documentElement.classList.contains('v3-azalt')
        || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
      tuvalDerece = await cark.don({
        tuvalKimligi: TUVAL, ibreKimligi: IBRE, baslangic: tuvalDerece, hedef, dilimSayisi: liste.length,
        sure: azalt ? 400 : cark.DONUS_SURESI, kare: (d) => { tuvalDerece = d; }
      });
      secenek.donuyor = false;

      const g = r.gain || {};
      secenek.sonuc = {
        odul: r.reward, ad: r.reward.name, tur: r.reward.type,
        astra: g.astra || 0, yedek: !!g.yedek, geriAlim: r.buybackInfo || null, yakim: r.burnedInfo || null,
        siloSatilan: g.siloSatilan || 0, siloAstra: g.siloAstra || 0, parcaBirikti: !!g.parcaBirikti, yeniBilet: g.yeniBilet || 0, stamina: g.stamina || 0,
        carpan: r.multiplier || 1, pityTetik: !!(r.pity && r.pity.triggered),
        parca: b.gameState.state.wheelTicketShards || 0
      };
      if (r.burnedInfo) b.bildir(`🔥 ${tam(r.burnedInfo.amount)} ${r.burnedInfo.resourceNameTr} yakıldı ve sistemden silindi.`, 'warning');
      b.bildir(`🎉 Çarktan kazandın: ${r.rewardSummaryText}`, 'success');
      return undefined;
    },

    cheer(b) {
      const r = b.gameState.carnivalCheer();
      b.bildir(r.message, r.success ? 'success' : 'error');
    },

    async biletAl(b) {
      const girdi = b.panelKok().querySelector('#ek-bilet-adet');
      const adet = Math.max(1, parseInt(girdi && girdi.value, 10) || 1);
      const r = await b.gameState.buyLotteryTickets(adet);
      b.bildir(r.message, r.success ? 'success' : 'error');
    },

    async talep(b) {
      const r = await b.gameState.claimWinnerLotteryPayout();
      b.bildir(r.message, r.success ? 'success' : 'error');
    },

    git(b, el) {
      return { git: el.dataset.hedef };
    }
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
