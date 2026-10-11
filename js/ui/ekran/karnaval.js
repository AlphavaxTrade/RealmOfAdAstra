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
  if (r.type === 'ada') return `${astra(b.gameState.adaPrice(r.amount || 0))} ASTRA`;
  if (r.key === 'fragments') return `${r.amount} Parça`;
  if (r.type === 'amm_raw') return `${kaynakAdi(b, r.key)} ${tam(r.adaVal)} ASTRA`;
  if (r.type === 'key') return 'Anahtar';
  if (r.type === 'bot_free') return `${r.hours || 24}s Bot`;
  if (r.type === 'ticket_shard') return 'Bilet Parçası';
  if (r.type === 'analysis_code') return 'Analiz Kuponu';
  return String(r.name || '').slice(0, 12);
}

const cizilecekler = (b) => dilimler(b).map((r) => ({ icon: r.icon, etiket: kisaAd(b, r) }));

// ── Çark sekmesi ─────────────────────────────────────────────────────────
function odemeDugmeleri(b) {
  const gs = b.gameState;
  const s = gs.state;
  const bedel = gs.getWheelCostAda();
  const durum = gs.isCarnivalWheelOpen();
  const bilet = s.lotteryTickets || 0;
  const hak = gs.getWheelResourceSpinsLeft();
  const hakSinir = b.GAME_CONFIG.CARNIVAL.WHEEL_RESOURCE_DAILY_LIMIT ?? 3;

  const hammadde = b.GAME_CONFIG.RESOURCE_KEYS.map((k) => {
    const fiyat = b.ammMarket.getPrice(k) || 1;
    const gereken = Math.ceil(bedel / fiyat);
    const yeter = (s.inventory[k] || 0) >= gereken;
    return dugme({
      e: 'cevir', veri: { odeme: k }, devreDisi: !durum.open || hak <= 0 || !yeter,
      metin: `<span class="ek-simge is-kucuk" aria-hidden="true">${kaynakSimgesi(b, k)}</span><span>${esc(tam(gereken))} ${esc(kaynakAdi(b, k))}</span>`
    });
  }).join('');

  return kart({
    icerik: dugme({ e: 'cevir', veri: { odeme: 'ada' }, ton: 'birincil', genis: true, devreDisi: !durum.open || s.adAstraBalance < bedel, metin: `🟣 ${esc(astra(bedel))} ASTRA ile çevir` })
      + dugme({ e: 'cevir', veri: { odeme: 'ticket' }, genis: true, devreDisi: !durum.open || bilet < 1, metin: `🎟️ 1 bilet ile çevir (${esc(tam(bilet))} biletin var)` })
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
  if (sonuc.parcaBirikti) satirlar.push(uyari('3 bilet parçası birikti: +1 piyango bileti kazandın (çarkta bilet olarak da kullanılabilir).', 'iyi'));
  if (sonuc.kod) satirlar.push(uyari(`Kuponun: <b>${esc(sonuc.kod)}</b>. Trade sitesiyle bağlantı kurulunca kullanılabilecek; şu an sitede geçerli değil.`));
  if (sonuc.tur === 'ticket_shard' && !sonuc.parcaBirikti) satirlar.push(satir('Bilet parçası', `${sonuc.parca}/3`));
  if (sonuc.tur === 'bot_free') satirlar.push(uyari('Ücretsiz otomasyon botun çalışmaya başladı (Taverna).', 'iyi'));

  return kart({
    vurgu: 'iyi',
    icerik: `<div class="ek-sonuc"><span class="ek-sonuc-simge">${odulSimgesi(sonuc.odul)}</span>
      <div><b class="ek-sonuc-baslik">Çarktan kazandın!</b><span class="ek-kucuk">${esc(sonuc.ad)}</span></div></div>${satirlar.join('')}`
  });
}

function carkSekmesi(b, secenek) {
  const gs = b.gameState;
  const K = b.GAME_CONFIG.CARNIVAL;
  const durum = gs.isCarnivalWheelOpen();
  const ist = cark.donusIstatistigi(dilimler(b), K.WHEEL_COST_ADA);
  const parca = gs.state.wheelTicketShards || 0;
  const toplamAgirlik = dilimler(b).reduce((s, r) => s + (r.weight || 0), 0) || 1;
  const kodlar = gs.state.redeemCodes || [];
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
    return `<div class="ek-hucre ek-odul"><span class="ek-odul-simge">${odulSimgesi(r)}</span><b>${esc(r.name)}</b><small>Şans: %${esc(sayi(sans, sans < 10 ? 2 : 1))}</small></div>`;
  });

  return [
    kart({
      baslik: `🎡 ${esc(dilimler(b).length)} ödüllü Krallık Çarkı`,
      rozet: etiket(`Ortalama dönüş ~%${ist.donus}`, ist.donus >= 100 ? 'uyari' : 'vurgu'),
      icerik: not(`${esc(astra(gs.getWheelCostAda()))} ASTRA, eş değer hammadde ya da 1 piyango bileti ile çevirebilirsin. Ödüller Karnaval kasasından ödenir; çevirmelerin yaklaşık %${esc(ist.geri)}'inde en az bedelini geri alırsın.`)
        + satir('Bilet parçaların', `${parca}/3`)
    }),
    sahne,
    sonucKarti(b, secenek.sonuc),
    durum.open ? '' : uyari(`Karnaval kasası yenileniyor (${esc(tam(durum.balance))} / ${esc(tam(durum.minBalance))} ASTRA). Kasa en büyük ödülü karşılayacak kadar dolunca çark yeniden açılır.`, 'uyari'),
    odemeDugmeleri(b),
    kart({
      baslik: '🎪 Karnaval coşkusu',
      icerik: not('Günde bir kez karnavala katılıp +10 ⚡ stamina kazanırsın.')
        + dugme({ e: 'cheer', metin: cheerYapildi ? '✅ Bugün katıldın' : '🎪 Coşkuya katıl (+10 ⚡)', devreDisi: cheerYapildi, genis: true })
    }),
    katli('📋 Çarkın ödülleri ve şansları', izgara(odulTablosu, { genis: true })
      + not('Hammadde, parça ve anahtar ödülleri Karnaval kasasının parasıyla pazardan satın alınıp sana verilir; pazarda bulunamazsa ödülün ASTRA karşılığı ödenir.'), { k: 'cark-odul' }),
    kodlar.length
      ? kart({
        baslik: '🎫 Kazandığın coin analiz kuponları',
        icerik: kodlar.map((c) => satir(c.code, c.status === 'pending_integration' ? 'site bağlantısı bekleniyor' : 'kullanılabilir', 'uyari')).join('')
          + not('Kuponlar trade sitesiyle bağlantı kurulunca kullanılabilecek; şu an sitede geçerli değildir.')
      })
      : ''
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
    ? (son.userWon ? `🎉 Kazandın (+${tam(son.wonAmount)} ASTRA)` : (son.amorti > 0 ? `Amorti +${tam(son.amorti)} ASTRA` : 'Çıkmadı, biletlerin devretti'))
    : 'Henüz yok';
  const yerel = !(b.online && b.online.active);

  return [
    kart({
      baslik: '🎟️ Haftalık Krallık Piyangosu',
      rozet: etiket('Çekiliş: Pazartesi 00:01 (TSİ)'),
      icerik: not('Her hafta <b>tek kazanan</b> çıkar; kazanma şansın elindeki bilet sayısıyla orantılıdır. Kazanan, biletlerine ödediğinin <b>2 katını</b> kasadan alır. Kazanamayanın biletleri yanmaz, sonraki haftaya devreder.')
        + (yerel ? uyari('Tek başına oynama modunda diğer bilet sahipleri temsilidir. Gerçek oyuncularla ortak piyango çevrimiçi modda çalışır.') : '')
    }),
    izgara([
      hucre('Piyango kasası', `${tam(l.pool)} ASTRA`),
      hucre('Kazanırsan alacağın', `${tam(l.potentialPrize)} ASTRA`, 'iyi'),
      hucre('Kazanma şansın', `%${sayi(l.chance * 100, 2)}`),
      hucre('Sonraki çekiliş', sure(sonraki - Date.now()))
    ]),
    kart({
      baslik: '🛡️ Haftalık bilet sınırın',
      icerik: cubukSatiri('Bu hafta aldığın', `${tam(l.boughtThisWeek)} / ${tam(l.maxPerWeek)}`, l.maxPerWeek > 0 ? (l.boughtThisWeek / l.maxPerWeek) * 100 : 0, { ton: l.canBuy > 0 ? '' : 'dolu' })
        + satir('Elindeki bilet (devredenler dahil)', `${tam(l.myTickets)} bilet / toplam ${tam(l.totalTickets)}`)
        + satir('Bu biletler için ödediğin', `${astra(l.paid)} ASTRA`)
    }),
    kart({
      baslik: '🎟️ Bilet al',
      icerik: `<div class="ek-alan-satiri"><label class="ek-alan" for="ek-bilet-adet"><span>Bilet adedi</span>
          <input class="ek-girdi ek-girdi-dar" type="number" id="ek-bilet-adet" inputmode="numeric" min="1" max="${esc(Math.max(1, l.canBuy))}" value="${esc(Math.min(1, l.canBuy) || 1)}"${l.canBuy > 0 ? '' : ' disabled'}></label>
          ${dugme({ e: 'biletAl', ton: 'birincil', devreDisi: l.canBuy <= 0, metin: l.canBuy > 0 ? `🎟️ Bilet al (${esc(astra(kurallar.ticketPrice))} ASTRA/adet)` : '🚫 Şu an bilet alamazsın' })}</div>`
        + (l.canBuy > 0 ? '' : uyari('Bu haftalık alım sınırın doldu. Yeni hafta Pazartesi 00:01 (TSİ) başlar.', 'uyari'))
        + katli('Bilet bedeli nereye gider?', not(`Bilet bedelinin %${esc(sayi(kurallar.amortiShare * 100, 0))}'i amorti kasasına (şu an ${esc(tam(l.amortiPool))} ASTRA), kalanı piyango kasasına gider. Amorti yalnız piyango kasası biterse kalan tüm biletlere eşit dağıtılır.`), { k: 'piyango-bedel' })
    }),
    kart({
      baslik: '👑 Kazancın',
      vurgu: bekleyen > 0 ? 'iyi' : '',
      rozet: etiket(bekleyen > 0 ? 'Çekilmeyi bekliyor' : 'Bekleyen kazanç yok', bekleyen > 0 ? 'iyi' : ''),
      icerik: satir('Çekilecek kazanç', `${tam(bekleyen)} ASTRA`, bekleyen > 0 ? 'iyi' : '')
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
      icerik: satir('Kasadaki ASTRA', `${tam(durum.balance)} ASTRA`)
        + satir('Çarkın açık kalması için en az', `${tam(durum.minBalance)} ASTRA`)
        + not('Çarkın ASTRA bedelinin %80\'i doğrudan bu kasaya girer; çark ve eşya ödülleri buradan ödenir. Kasa yetmezse ödül yoktan verilmez, çark kapanır.')
    }),
    kart({
      baslik: '🎟️ Piyango kasaları',
      icerik: satir('Piyango kasası', `${tam(l.pool)} ASTRA`)
        + satir('Amorti kasası', `${tam(l.amortiPool)} ASTRA`)
        + satir('Kazananı bekleyen ödül', `${tam(l.pendingPayout)} ASTRA`)
    }),
    kart({ baslik: '🎁 Haftalık ücretsiz oyuncu payı', icerik: ucretsiz }),
    dugmeler(
      dugme({ e: 'git', veri: { hedef: 'hazine' }, metin: '👑 Tüm kasalar (Konsey ve Hazine)' }),
      dugme({ e: 'git', veri: { hedef: 'ekonomi' }, metin: '📈 Ekonomi panosu' })
    )
  ].join('');
}

const ekran = {
  id: 'karnaval',
  kilit: 'carnival',
  ornekSecenekler: () => [{ sekme: 'cark' }, { sekme: 'piyango' }, { sekme: 'havuzlar' }],
  baslik: () => ['🎪', 'Karnaval'],

  govde(b, secenek) {
    secenek.sekme = secenek.sekme || 'cark';
    const icerik = secenek.sekme === 'piyango' ? piyangoSekmesi(b) : (secenek.sekme === 'havuzlar' ? kasaSekmesi(b) : carkSekmesi(b, secenek));
    return kap(sekmeler(SEKMELER, secenek.sekme, 'sekme') + icerik);
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

    async cevir(b, el, secenek) {
      if (secenek.donuyor) return false;
      const odeme = el.dataset.odeme;
      secenek.donuyor = true;
      secenek.sonuc = null;
      let r;
      try {
        r = await b.gameState.spinCarnivalWheel(odeme);
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
        siloSatilan: g.siloSatilan || 0, siloAstra: g.siloAstra || 0, parcaBirikti: !!g.parcaBirikti, kod: g.kod || null,
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

export default ekranKaydet(ekran);
