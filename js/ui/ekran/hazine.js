// Realm of AdAstra — Hazine ve gelir panosu: kasalar (gerçek defter), harcama dağılımı, kapı durumu, gelir motoru,
// katılım karnesi ve sponsorluk. Sayılar doğrudan hazine defterinden (treasury) ve dünya durumundan (globalPool) gelir.
import {
  ekranKaydet, kap, kart, katli, satir, cubukSatiri, dugme, uyari, not, izgara, etiket, tam, astra, sayi, esc, yenile
} from './cekirdek.js';

const KASA = {
  dungeon: { simge: '🗺️', renk: '#06b6d4', gider: 'Zindan katlarını ve boss\'larını yenenlere ödenir; günlük ödeme tavanı vardır, kasa boşalamaz.', git: 'zindan', gitAd: '💀 Zindana gir', pay: 'dungeon' },
  arena: { simge: '🏟️', renk: '#f59e0b', gider: 'Kolezyum zafer ödülleri ve haftalık lig ödülleri bu kasadan ödenir.', git: 'kolezyum', gitAd: '🏟️ Arenaya git', pay: 'arena' },
  worldBoss: { simge: '🌋', renk: '#ef4444', gider: 'Her Pazar 18:00 (TSİ) ordusunu kilitleyenlerin vurduğu hasara göre paylaşılır.', git: 'savasalani', gitAd: '🌋 Boss savaşına katıl', pay: 'worldBoss' },
  ammBuyback: { simge: '🛡️', renk: '#38bdf8', gider: 'Fiyatı açılışın en az %20 altına inen malları pazardan alıp yakar; piyasayı korur.', git: 'pazar', gitAd: '📊 Pazar ve yakım', pay: 'ammBuyback' },
  quest: { simge: '📜', renk: '#22c55e', gider: 'Krallık Yolu görev ödülleri ve ücretsiz oyuncu payı bu kasadan ödenir.', git: 'rehber', gitAd: '📜 Görevler', pay: 'quest' },
  carnival: { simge: '🎪', renk: '#ec4899', gider: 'Şans çarkı ve piyango ödülleri bu kasadan ödenir.', git: 'karnaval', gitAd: '🎪 Karnavala git', pay: 'carnival' },
  fatih: { simge: '👑', renk: '#facc15', gider: '18. kat boss\'unu yenenlere verilen "Fatih Ödülü" için ayrılmıştır.', git: 'zindan', gitAd: '💀 Zindana gir', pay: 'fatih' },
  konsey: { simge: '🏛️', renk: '#a78bfa', gider: 'Madencilik Otoritesi ve Konsey projelerinin çelik payı bu kasadan karşılanır.', git: 'konsey', gitAd: '🏛️ Konseye git', pay: 'konsey' },
  universe: { simge: '🚀', renk: '#94a3b8', gider: 'Universe açılışı için ayrılmış kilitli rezerv: hiçbir ödeme çıkmaz.', git: 'uzay', gitAd: '🚀 Uzay limanı', pay: 'universe' }
};

const KATEGORI_ADLARI = { sefer: '🌾 Sefer', bakim: '🔧 Bakım', kisla: '⚔️ Kışla', zindan: '🏰 Zindan', kolezyum: '🛡️ Kolezyum', boss: '🐉 Dünya Bossu', pazar: '🏪 Pazar', konsey: '🏛️ Konsey', karnaval: '🎪 Karnaval', rehber: '🧭 Rehber' };

const oran = (v) => `%${sayi(v * 100, v * 100 < 10 ? 1 : 0)}`;

function ozet(b) {
  const t = b.treasury.getSummary();
  const yakilan = b.globalPool.state.totalBurned || 0;
  return kart({
    baslik: '👑 Krallık kasaları',
    icerik: satir('Kasalardaki toplam ASTRA', `${tam(t.totalBalance)} ASTRA`)
      + satir('Ortalama kasa sağlığı', oran(t.avgHealth), t.avgHealth < 0.4 ? 'kotu' : (t.avgHealth < 0.7 ? 'uyari' : 'iyi'))
      + satir('Pazar likidite rezervi', `${tam(b.ammMarket.getTotalAdAstraLiquidity())} ASTRA`)
      + satir('🔥 Kalıcı yakılan', `${tam(yakilan)} ASTRA`, 'uyari')
      + satir('Kasalardan çıkan / giren', `${tam(t.lifetimeWithdrawn)} / ${tam(t.lifetimeDeposited)} ASTRA`)
  });
}

function dagilim(b) {
  const C = b.GAME_CONFIG;
  const parcalar = [
    ['Oyun kasaları', C.TOKEN_REWARD_POOL_RATE ?? 0.86, '#e7b94c'],
    ['Temel gelir (UBI)', C.UBI_POOL_RATE ?? 0.06, '#43d19a'],
    ['Yakım', C.TOKEN_BURN_RATE ?? 0.05, '#f06868'],
    ['Yapımcı payı', C.CREATOR_ROYALTY_RATE ?? 0.03, '#a894ff']
  ];
  const seritler = parcalar.map(([, v, c]) => `<i style="--g:${(v * 100).toFixed(1)}%;--renk:${c}"></i>`).join('');
  const aciklama = parcalar.map(([ad, v, c]) => `<span class="ek-oge-etiket"><i class="ek-nokta" style="--renk:${c}"></i>${esc(ad)} <b>${esc(Math.round(v * 100))}</b></span>`).join('');
  return kart({
    baslik: 'Oyunda harcanan her 100 ASTRA nereye gider?',
    icerik: `<div class="ek-dilim">${seritler}</div><div class="ek-dilim-aciklama">${aciklama}</div>`
      + not('Oyun kasalarına giden pay aşağıdaki kasalara bölünür; ödüller bu kasalardan ödenir, havadan basılmaz.')
  });
}

function kasalar(b) {
  const t = b.treasury.getSummary();
  const H = b.GAME_CONFIG;
  const pay = H.TREASURY_ALLOCATION || {};
  const butce = b.treasury.state.weekBudget || {};
  const harcanan = b.treasury.state.weekSpent || {};
  const kartlar = t.pools.map((p) => {
    const m = KASA[p.id] || { simge: '💰', renk: '#94a3b8', gider: '', git: '', gitAd: '' };
    const tavan = butce[p.id];
    const butceSatiri = tavan != null
      ? cubukSatiri('Bu haftaki ödeme payı', `${tam(harcanan[p.id] || 0)} / ${tam(tavan)} ASTRA`, tavan > 0 ? ((harcanan[p.id] || 0) / tavan) * 100 : 0, { renk: m.renk })
      : '';
    const gelir = pay[p.id] ? `her harcamadan ${oran((H.TOKEN_REWARD_POOL_RATE ?? 0.86) * pay[p.id])} pay` : '';
    return kart({
      icerik: `<div class="ek-oge"><span class="ek-simge" aria-hidden="true">${m.simge}</span>
          <div class="ek-oge-govde"><b>${esc(p.name)}</b><small>${tam(p.balance)} ASTRA</small>${gelir ? `<small>${esc(gelir)}</small>` : ''}</div></div>`
        + cubukSatiri('Kasa sağlığı (hedef rezerv)', oran(p.health), p.health * 100, { renk: m.renk, ton: p.health < 0.25 ? 'kotu' : '' })
        + butceSatiri
        + katli('Bu kasa ne işe yarar?', not(esc(m.gider)), { k: `kasa-${p.id}` })
        + (m.git ? dugme({ e: 'git', metin: `${esc(m.gitAd)} ➔`, veri: { hedef: m.git, bolum: p.id === 'ammBuyback' ? 'yakim' : '' } }) : '')
    });
  });
  return kart({ baslik: '💰 Ödül kasaları', icerik: izgara(kartlar, { genis: true }) });
}

function ubiKarti(b) {
  const gs = b.gameState;
  const u = b.globalPool.getUbiPoolInfo(gs.state.level || 1, gs.state.lastClaimedUbiEpoch || 0);
  return kart({
    baslik: '🤝 Temel gelir (UBI)',
    rozet: etiket(`Haftalık hakkın: ${astra(u.payout)} ASTRA`, u.eligible ? 'iyi' : ''),
    icerik: not(`Harcanan her ASTRA'nın %6'sı haftalık UBI kasasında birikir; Pazartesi 00:01 (TSİ) seviyene göre paylaşılır. Bu haftanın kasası ${tam(u.weeklyBudget)} ASTRA, çekilmeyi bekleyen ${tam(u.claimRemaining)} ASTRA.`)
      + dugme({ e: 'git', metin: '🤝 Ekonomi panosunda talep et ➔', veri: { hedef: 'ekonomi', bolum: '' } })
  });
}

function kapiKarti(b) {
  const kp = b.online && b.online.kapi;
  if (!kp) return '';
  return kart({
    baslik: `🚪 Kapı durumu: vatandaş ${tam(kp.citizens)} / ${tam(kp.limit)}`,
    rozet: etiket(`aktif ${tam(kp.active || 0)} · sırada ${tam(kp.waiting)} · askıda ${tam(kp.suspended)}`),
    icerik: not(`Vadinin vatandaş sınırı ${tam(kp.limit)}; bunların <b>${tam(kp.active || 0)}</b> tanesi bu hafta yeterince çeşitli alanda (sefer, zindan, kolezyum, pazar, Konsey, çark, rehber görevi...) katılım sağladığı için aktif. Kayıt her zaman açık: yer yoksa hesap bekleme sırasına girer, vadiyi gezer, hazır aday onaylarını verebilir. Katılımı düşük kalan önce uyarılır, sonra izin hakkını kullanmaya davet edilir; cevapsız kalırsa yeri sıradaki hazır adaya geçer (hesap silinmez).`)
  });
}

function gelirKarti(b) {
  const kp = b.online && b.online.kapi;
  if (!kp) return '';
  const g = kp.indicator || {};
  const pi = b.online.partnerIncome;
  const dagitilan = g.usdPerPlayerMonth || 0;
  const cekilebilen = g.withdrawableUsdPerPlayerMonth || 0;
  const esikD = kp.threshold || 0;
  const esikC = esikD / 3;
  const uzaklik = (v) => (v > 0 ? (v >= 1 ? '✅ hedef geçildi' : `hedefin %${Math.round(v * 100)}'ü, ${sayi(1 / v, 1)} kat kaldı`) : 'henüz veri yok');
  return kart({
    baslik: '💰 Gelir motoru: kişi başı aylık (aktif vatandaş)',
    rozet: etiket(`${g.weeks || 0} hafta ortalaması`),
    icerik: satir('Dağıtılan (kilitli dahil)', `${sayi(dagitilan, 2)} $ / hedef ${sayi(esikD)} $`)
      + `<p class="ek-kucuk">${esc(uzaklik(esikD > 0 ? dagitilan / esikD : 0))}</p>`
      + satir('Gerçekten çekilebilen', `${sayi(cekilebilen, 2)} $ / hedef ${sayi(esikC, 1)} $`)
      + `<p class="ek-kucuk">${esc(uzaklik(esikC > 0 ? cekilebilen / esikC : 0))}</p>`
      + not(`Büyüme (vatandaş sınırının artması) için <b>ikisi birden</b> hedefi geçmeli: ${kp.growthLocked ? '<b>şimdilik kilitli</b> (yönetici açana dek)' : 'kilit açık, eşikler geçilince ayda %10 büyür'}.`)
      + (pi && pi.enabled ? not(`Trade sitesinden gelen gerçek dış gelir: bu hafta <b>${tam(pi.weekAda)}</b> / toplam <b>${tam(pi.totalAda)}</b> ASTRA.`) : '')
  });
}

function karneKarti(b) {
  const gs = b.gameState;
  const ko = gs.state.katilim && gs.getKatilimOzet ? gs.getKatilimOzet() : null;
  if (!ko) return '';
  const izinGun = ko.izindeMi ? Math.max(0, Math.ceil((Number(ko.izinModu.bitis) - Date.now()) / 86400000)) : 0;
  const kategoriler = ko.kategoriler.map((c) => `<span class="ek-oge-etiket${c.dokunuldu ? '' : ' is-sonuk'}">${c.dokunuldu ? '✅' : '☐'} ${esc(KATEGORI_ADLARI[c.id] || c.id)}</span>`).join('');
  return kart({
    baslik: '🧾 Katılım karnem',
    rozet: etiket(ko.izindeMi ? '🏖️ izindesin' : (ko.saglikli ? '✅ bu hafta tamam' : `bu hafta ${ko.puan}/${ko.esik}`), ko.saglikli ? 'iyi' : ''),
    icerik: not(`Bu hafta <b>${tam(ko.puan)}</b> farklı alana dokundun; beklenen en az <b>${tam(ko.esik)}</b> (seviyen yükseldikçe artar). Aynı alanı tekrarlamak ek puan getirmez.`)
      + `<div class="ek-oge-etiketler">${kategoriler}</div>`
      + not(`${ko.dusukHaftaSayisi > 0 ? `⚠️ Katılımın ${tam(ko.dusukHaftaSayisi)} haftadır düşük. ` : ''}Yıllık izin hakkın: <b>${tam(ko.izinYillikKalan)}</b> gün.`)
      + (ko.izindeMi
        ? uyari(`<b>İzindesin</b> (${new Date(Number(ko.izinModu.bitis)).toLocaleDateString('tr-TR')} tarihine kadar, ${tam(izinGun)} gün kaldı): yerin korunuyor ama bu sürede Üretim Hakkı, temel gelir ve ücretsiz oyuncu payı almazsın.`, '', '🏖️')
          + dugme({ e: 'izinBitir', metin: 'İzni şimdi bitir' })
        : '')
      + (ko.sonUyari ? uyari('Son uyarı: izin hakkın bitti, katılımını artırmazsan yerin bekleyen birine geçer.', 'kotu', '🚨') : '')
  });
}

function sponsorKarti(b, s) {
  if (!(b.online && b.online.active && b.girisli && b.girisli())) return '';
  const d = s.sponsorVeri;
  if (!d) return kart({ baslik: '🤝 Sponsorluk', icerik: '<div class="v3-iskelet" aria-busy="true"><i></i><i></i></div>' });
  if (d.hata) return kart({ baslik: '🤝 Sponsorluk', icerik: uyari(`Alınamadı: ${esc(d.hata)}`, 'kotu') });
  const { tablo: t, benim: m } = d;
  const c = m.config;
  const benimId = b.online.playerId;
  const satirHtml = (x, dugmeHtml) => `<div class="ek-satir"><span>${esc(x.sponsor === `Vatandaş #${String(benimId || '').slice(4)}` ? x.target : x.sponsor)} · ${tam(x.principal)} ASTRA · ${esc(x.status)}</span><span>${dugmeHtml}</span></div>`;
  const verdigim = m.given.map((x) => satirHtml(x, x.status === 'active' ? dugme({ e: 'feragat', metin: 'Vazgeç', veri: { id: x.id } }) : '')).join('');
  const aldigim = m.received.map((x) => satirHtml(x, (x.status === 'active' && x.returned >= x.principal) ? dugme({ e: 'sponsorKapat', metin: 'Kapat', veri: { id: x.id } }) : '')).join('');
  const secenekler = t.rows.filter((r) => r.id !== benimId && !r.izinde).slice(0, 100)
    .map((r) => `<option value="${esc(r.id)}">${esc(r.ad)} · Sv.${esc(r.level)} · bu hafta ${esc(r.haftaKategori)} kategori · ort. net çekim ${esc(tam(r.ortNetCekim4Hafta))} · ${esc(r.sponsorSayisi)} sponsor</option>`).join('');
  return kart({
    baslik: '🤝 Sponsorluk',
    rozet: etiket(`sponsorlu paran: ${tam(m.sponsoredBalance)} ASTRA`),
    icerik: not(`Bir vatandaşa ASTRA ile sponsor olursun; o para <b>çekilemez</b>, yalnız oyunda harcanır. Karşılığında o oyuncunun her haftalık <b>net çekiminin %${Math.round(c.share * 100)}'i</b> (toplam getirin anaparanın ${esc(c.returnCap)} katına ya da ${esc(c.days)} güne dek) sana ödenir.`)
      + `<label class="ek-alan"><span>Vatandaş</span><select id="sp-hedef" class="ek-girdi">${secenekler || '<option value="">Sponsor olunabilecek vatandaş yok</option>'}</select></label>`
      + `<label class="ek-alan"><span>Miktar (en az ${esc(tam(c.minAmount))} ASTRA)</span><input id="sp-miktar" type="number" class="ek-girdi" min="${esc(c.minAmount)}" step="100" inputmode="numeric"></label>`
      + dugme({ e: 'sponsorOl', metin: '🤝 Sponsor ol', ton: 'birincil', genis: true })
      + (verdigim ? `<div class="ek-alt-baslik">Verdiğim</div>${verdigim}` : '')
      + (aldigim ? `<div class="ek-alt-baslik">Aldığım</div>${aldigim}` : '')
  });
}

const ekran = {
  id: 'hazine',
  goruldu: 'hazine',
  canliYenile: false,
  baslik: () => ['🏛️', 'Hazine ve gelir'],

  govde(b, secenek) {
    return kap([ozet(b), dagilim(b), kasalar(b), ubiKarti(b), kapiKarti(b), gelirKarti(b), karneKarti(b), sponsorKarti(b, secenek)].join(''));
  },

  async sonra(b, secenek) {
    if (!(b.online && b.online.active && b.girisli && b.girisli()) || secenek.sponsorVeri || secenek.sponsorYukleniyor || !b.sponsor) return;
    secenek.sponsorYukleniyor = true;
    try {
      const [tablo, benim] = await Promise.all([b.sponsor.tablo(), b.sponsor.benim()]);
      secenek.sponsorVeri = { tablo, benim };
    } catch (e) {
      secenek.sponsorVeri = { hata: e.message };
    } finally {
      secenek.sponsorYukleniyor = false;
    }
    yenile();
  },

  eylemler: {
    git(b, el) {
      const { hedef, bolum } = el.dataset;
      return { git: hedef, secenek: bolum ? { bolum } : {} };
    },
    izinBitir(b) {
      b.gameState.bitirIzin();
    },
    async sponsorOl(b, el, secenek) {
      const hedef = document.getElementById('sp-hedef').value;
      const miktar = Number(document.getElementById('sp-miktar').value);
      if (!hedef) { b.bildir('Bir vatandaş seç.', 'error'); return false; }
      try {
        const r = await b.sponsor.ol(hedef, miktar);
        b.bildir(r.message, 'success');
      } catch (e) { b.bildir(`Sponsor olunamadı: ${e.message}`, 'error'); }
      secenek.sponsorVeri = null;
      return undefined;
    },
    async feragat(b, el, secenek) {
      try { const r = await b.sponsor.feragat(Number(el.dataset.id)); b.bildir(r.message, 'info'); } catch (e) { b.bildir(e.message, 'error'); }
      secenek.sponsorVeri = null;
      return undefined;
    },
    async sponsorKapat(b, el, secenek) {
      try { const r = await b.sponsor.kapat(Number(el.dataset.id)); b.bildir(r.message, 'success'); } catch (e) { b.bildir(e.message, 'error'); }
      secenek.sponsorVeri = null;
      return undefined;
    }
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
