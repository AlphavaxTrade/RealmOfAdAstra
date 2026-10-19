// Realm of AdAstra — Roket Rampası ekranı (eski adı Uzay Limanı): ROA'dan UOA'ya geçiş rampası olan roket, Universe'e hazırlık ve Hazırlık Deposu (Yük İskelesi).
// Roket planı (19 Ekim 2026): roketini yapmayan UOA'ya geçemez; roket çok pahalıdır ve kademeli katkıyla inşa edilir; seviye hız, taşıma ve mürettebatı artırır.
import { ekranKaydet, kap, kart, katli, not, uyari, dugme, izgara, hucre, cubukSatiri, cubuk, tam, astra, esc } from './cekirdek.js';
import { onay } from '../v3/bilesenler.js';

const ASAMALAR = [
  'Aşama 0: Realm (Universe kapalı)',
  'Aşama 1: Hazırlık (Hazırlık Deposu açık)',
  'Aşama 2: Ön sipariş',
  'Aşama 3: Universe açık'
];

function depoBolumu(dp) {
  const satirlar = dp.open ? dp.rows.map((r) => `<div class="ek-oge">
      <div class="ek-oge-govde"><b>${esc(r.icon)} ${esc(r.name)}</b><small>${esc(tam(r.stored))} / ${esc(tam(r.cap))}</small></div>
      <div class="ek-dugmeler">
        ${dugme({ e: 'depoKoy', metin: `📦 Yarısını koy (${tam(Math.min(Math.floor(r.have / 2), r.room, dp.cargoRoom))})`, veri: { res: r.key }, devreDisi: !(dp.rocketReady && r.have >= 2 && r.room > 0 && dp.cargoRoom > 0) })}
        ${dugme({ e: 'depoAl', metin: '↩️ Geri al', veri: { res: r.key }, devreDisi: !(r.stored > 0), ipucu: `Hepsini geri al (%${Math.round(dp.cancelFee * 100)} kesinti)` })}
      </div>
    </div>`).join('') : '';
  return kart({
    baslik: '📦 Yük İskelesi: Hazırlık Deposu',
    vurgu: dp.open ? 'vurgu' : '',
    rozet: `<span class="ek-etiket">${dp.open ? `taşıma ${tam(dp.cargoUsed)} / ${tam(dp.cargoCap)} birim` : '🔒 Aşama 1\'de açılır'}</span>`,
    icerik: not(`UOA'ya götüreceğin hammaddeyi buraya koyarsın; yük ROKETLE taşınır, bu yüzden toplam yük roketinin taşıma kapasitesini aşamaz ve roketi olmayan yük koyamaz. Silodan çıkar, pazara giremez. Sınır: her hammaddede ${dp.weeksCap} haftalık Üretim Hakkın; dünya toplamı ${astra(dp.worldCap)} ASTRA değeri (şu an ${astra(dp.worldTotal)}). Geri alırsan %${Math.round(dp.cancelFee * 100)} kesinti yakılır. Hazırlık değeri: ${astra(dp.value)} ASTRA.`)
      + (dp.open && !dp.rocketReady ? uyari('🚀 Önce roketini yap: yük roketle taşınır.', 'uyari') : '')
      + (dp.open ? `<div class="ek-liste">${satirlar}</div>` : '')
  });
}

// Bir kalem için "yatır" girişi: miktar kutusu + düğme
function katkiGirdisi(satir) {
  const elde = Math.floor(satir.key === 'adAstra' ? satir.have : satir.have);
  const varsayilan = Math.max(0, Math.min(satir.remain, Math.floor(elde / 2)));
  return `<div class="ek-alan-satiri">
    <input type="number" class="ek-girdi ek-girdi-dar" min="1" max="${Math.min(elde, satir.remain)}" value="${varsayilan}" inputmode="numeric" id="roket-${esc(satir.key)}" aria-label="${esc(satir.name)} miktarı (elinde ${elde}, kalan ${satir.remain})">
    ${dugme({ e: 'roketKatki', metin: `${esc(satir.icon)} ${esc(satir.name)} yatır`, veri: { kaynak: satir.key }, devreDisi: !(elde >= 1 && satir.remain > 0) })}
  </div>`;
}

function insaKarti(roket, bakiye) {
  const hedef = roket.ready ? roket.next : { spec: roket.build && roket.build.spec, parts: roket.build ? roket.build.rows : [], pct: roket.build ? roket.build.pct : 0, partsOk: false };
  if (!hedef || !hedef.spec) return roket.ready ? kart({ baslik: '🏆 Roket en üst seviyede', icerik: not('Roketin 5. seviye: en hızlı, en çok yük ve mürettebat taşıyan roket.') }) : '';
  const s = hedef.spec;
  const kilitli = !roket.ready && !roket.levelOk;
  const satirlar = hedef.parts.map((p) => `<div class="ek-satir ${p.ok ? 'is-iyi' : ''}"><span>${esc(p.icon)} ${esc(p.name)}</span><b>${esc(tam(p.done))} / ${esc(tam(p.need))} ${p.ok ? '✅' : ''}</b></div>`).join('');
  const ben = hedef.parts.find((p) => p.key === 'adAstra');
  const hammaddeler = hedef.parts.filter((p) => p.key !== 'adAstra');
  const butce = Math.max(1, Math.min(1000, Math.floor(bakiye)));
  return kart({
    baslik: roket.ready ? `🛠️ Seviye ${s.level} inşaatı` : '🛠️ Roketini inşa et (Seviye 1)',
    vurgu: kilitli ? '' : 'vurgu',
    rozet: `<span class="ek-etiket">${kilitli ? `🔒 hesap seviyesi ${roket.minLevel} gerekli` : `%${hedef.pct}`}</span>`,
    icerik: not(`Roket, ROA'dan UOA'ya (Sirius gezegeni) geçiş rampasıdır: roketini yapmayan UOA'ya geçemez. Çok pahalıdır (bir yıl aktif oynayan ancak biriktirir); bedel kademeli yatırılır, hepsi dolunca tamamlanır. Seviye ${s.level}: gidiş ${s.travelHours} saat · taşıma ${tam(s.cargo)} birim · mürettebat ${s.crew} kişi (köylü + asker).`)
      + cubuk(hedef.pct, { renk: '#38bdf8' })
      + satirlar
      + (kilitli ? uyari(`Roket için hesap seviyesi en az ${roket.minLevel} olmalı (şu an ${roket.level}).`, 'uyari') : '')
      + (kilitli ? '' : katli('Hammadde yatır', hammaddeler.map(katkiGirdisi).join(''), { k: 'roket-hammadde' })
        + (ben ? katli('ASTRA yatır', katkiGirdisi(ben), { k: 'roket-astra' }) : '')
        + katli('⚡ Hızlı katkı: ASTRA harca, hammaddeyi pazardan al', `<p class="ek-kucuk">Yazdığın ASTRA bütçesiyle kalan hammadde bedeli pazardan alınır ve hemen yatırılır (ASTRA bedeli ayrıca yatırılır).</p>
          <div class="ek-alan-satiri"><input type="number" class="ek-girdi ek-girdi-dar" min="1" max="${Math.floor(bakiye)}" value="${butce}" inputmode="numeric" id="roket-butce" aria-label="ASTRA bütçesi (bakiyen ${Math.floor(bakiye)})"><small>ASTRA (bakiyen ${esc(tam(bakiye))})</small></div>
          ${dugme({ e: 'roketHizliKatki', metin: '⚡ Hızlı katkı', ton: 'iyi', genis: true, devreDisi: bakiye < 1 })}`, { k: 'roket-hizli' }))
  });
}

function seviyeKarti(roket) {
  if (!roket.ready || !roket.spec) return '';
  const s = roket.spec;
  const c = roket.crew;
  return kart({
    baslik: `🚀 Roket seviye ${roket.rocketLevel} / ${roket.maxRocketLevel}`,
    rozet: `<span class="ek-etiket">${roket.launchOpen ? 'fırlatma açık' : 'UOA kapalı'}</span>`,
    icerik: not('Roketin hazır: UOA açıldığında ROA\'daki roketine basıp Sirius gezegenindeki UOA\'ya geçeceksin. Orada üssünün temellerini atmak için ROA\'dan demir, odun, taş gibi hammaddeleri roketle taşırsın (Hazırlık Deposu) ve mürettebat olarak köylülerini ve askerlerini götürürsün.')
      + izgara([
        hucre('Gidiş süresi', `${s.travelHours} saat`),
        hucre('Taşıma', `${tam(s.cargo)} birim`),
        hucre('Mürettebat kapasitesi', `${tam(s.crew)} kişi`),
        hucre('Köylü / asker (elinde)', `${tam(roket.villagersNow)} / ${tam(roket.soldiersNow)}`)
      ])
      + `<p class="ek-not"><b>Mürettebat:</b> şu an ${tam(c.villagers)} köylü + ${tam(c.soldiers)} asker = ${tam(c.total)} / ${tam(c.cap)}</p>
        <div class="ek-alan-satiri"><label class="ek-kucuk" for="murettebat-koylu">Köylü</label><input type="number" class="ek-girdi ek-girdi-dar" min="0" max="${roket.villagersNow}" value="${c.villagers}" inputmode="numeric" id="murettebat-koylu">
        <label class="ek-kucuk" for="murettebat-asker">Asker</label><input type="number" class="ek-girdi ek-girdi-dar" min="0" max="${roket.soldiersNow}" value="${c.soldiers}" inputmode="numeric" id="murettebat-asker"></div>`
      + dugme({ e: 'murettebat', metin: '👥 Mürettebatı kaydet', genis: true })
      + dugme({ e: 'roketFirlat', metin: '🚀 UOA\'ya fırlat', ton: 'hayalet', devreDisi: !roket.launchOpen, genis: true, ipucu: roket.launchReason || 'Fırlatma' })
      + (roket.launchReason ? `<p class="ek-kucuk">${esc(roket.launchReason)}</p>` : '')
  });
}

const ekran = {
  id: 'uzay',
  canliYenile: false,   // miktar kutuları yazılırken yeniden çizim olmasın; eylemlerden sonra çizilir
  baslik: () => ['🚀', 'Roket Rampası'],

  govde(b) {
    const gs = b.gameState;
    const roket = gs.getRocketStatus();
    const koy = gs.getVillageInfo();
    const asker = (gs.state.soldierUnits || []).length;
    const asama = b.GAME_CONFIG.UNIVERSE_STAGE || 0;
    const hazirlik = gs.getUniversePrepProgress();
    const dp = hazirlik.depot;
    const bakiye = Number(gs.state.adAstraBalance) || 0;

    const durum = kart({
      baslik: '🚀 Roket Rampası',
      rozet: `<span class="ek-etiket">${esc(ASAMALAR[asama] || ASAMALAR[0])}</span>`,
      icerik: not('Roket Rampası, ROA\'dan UOA\'ya (ikinci oyun) geçişin kapısıdır. Roketini yapanlar UOA açıldığında Sirius gezegenindeki hesaplarına geçer; roketini yapmayanın UOA hesabı aktif olmaz. Roket yapmak çok zordur, bu yüzden Realm en az 1 yıl oynanır.')
        + cubukSatiri('UOA\'ya hazırlık', `%${hazirlik.pct}`, hazirlik.pct, { renk: '#a78bfa' })
        + izgara([
          hucre('Roket', roket.ready ? `Seviye ${roket.rocketLevel} ✅` : `Yapılmadı (%${roket.build ? roket.build.pct : 0})`),
          hucre('Hazırlık Deposu', dp.open ? `%${Math.round(dp.fill * 100)}` : 'Kilitli'),
          hucre('Köylü', `${tam(koy.villagers)} / 100`),
          hucre('Asker', `${tam(asker)} / 10`),
          hucre('Genesis NFT', gs.state.genesisNftMinted ? 'Var ✅' : 'Yok')
        ])
    });
    return kap(durum + insaKarti(roket, bakiye) + katli('🚀 Roket seviyeleri (ayrıntı)', seviyeKarti(roket), { k: 'roket-seviyeler' }) + katli('📦 Hazırlık Deposu', depoBolumu(dp), { k: 'roket-depo' }));
  },

  eylemler: {
    roketKatki(b, el) {
      const k = el.dataset.kaynak;
      const girdi = document.getElementById(`roket-${k}`);
      const miktar = Math.floor(Number(girdi && girdi.value));
      if (!(miktar > 0)) { b.bildir('Geçerli bir miktar yaz.', 'error'); return false; }
      const r = b.gameState.contributeToRocket({ [k]: miktar });
      b.bildir(r.message, r.success ? 'success' : 'error');
      return undefined;
    },
    async roketHizliKatki(b) {
      const gs = b.gameState;
      const girdi = document.getElementById('roket-butce');
      const butce = Math.floor(Number(girdi && girdi.value));
      if (!(butce > 0)) { b.bildir('Geçerli bir ASTRA tutarı yaz.', 'error'); return false; }
      const plan = gs.rocketHizliPlan(butce);
      if (!plan.ok) { b.bildir(plan.reason || 'Alım yapılamıyor.', 'error'); return false; }
      const liste = plan.items.map((i) => `• ${tam(i.qty)} ${i.name} (~${tam(Math.ceil(i.cost))} ASTRA)`).join('\n');
      const tamam = await onay({ baslik: 'Roket için pazardan alınıp yatırılsın mı?', metin: `${liste}\nİlk tur ~${tam(Math.ceil(plan.total))} ASTRA (bütçe ${tam(butce)} ASTRA; kalanla ek turlar yapılır)`, tamam: 'Al ve yatır' });
      if (!tamam) return false;
      const r = await gs.rocketHizliKatki(butce);
      b.bildir(r.message, r.success ? 'success' : 'error');
      return undefined;
    },
    murettebat(b) {
      const v = Math.floor(Number((document.getElementById('murettebat-koylu') || {}).value) || 0);
      const s = Math.floor(Number((document.getElementById('murettebat-asker') || {}).value) || 0);
      const r = b.gameState.setRocketCrew(v, s);
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    roketFirlat(b) {
      b.bildir('UOA henüz açılmadı: fırlatma kilitli. Harcadığın ASTRA\'nın %4\'ü UOA tohumunda birikiyor.', 'error');
    },
    depoKoy(b, el) {
      const k = el.dataset.res;
      const yari = Math.floor(((b.gameState.state.inventory || {})[k] || 0) / 2);
      const r = b.gameState.depositToPrepDepot({ [k]: yari });
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    async depoAl(b, el) {
      const gs = b.gameState;
      const k = el.dataset.res;
      const durum = gs.getPrepDepotStatus();
      const satir_ = durum.rows.find((x) => x.key === k);
      if (!satir_ || !(satir_.stored > 0)) return false;
      const tamam = await onay({
        baslik: 'Depodan geri alınsın mı?',
        metin: `${tam(satir_.stored)} ${satir_.name} geri alınır; %${Math.round(durum.cancelFee * 100)} kesinti yakılır.`,
        tamam: 'Geri al', tehlikeli: true
      });
      if (!tamam) return false;
      const r = gs.withdrawFromPrepDepot(k, satir_.stored);
      b.bildir(r.message, r.success ? 'success' : 'error');
    }
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
