// Realm of AdAstra — Zindan modu: mevcut mod, çarpanları ve bir üst moda geçiş (18 Ekim 2026).
// Normal → Zor → Uzman → Cehennem (Diablo'daki zorluk modları gibi): Normal modda tüm katlar ve son boss (Sv.18) bitince oyuncu hammadde
// katkısı (yakılır) ve ASTRA ile bir üst moda geçer; zindan baştan başlar, canavarlar çok daha güçlüdür, ASTRA ödülü ve eşya düşme şansı
// artar, asker hakkı birikir. Kurallar: js/gameState/zindan.js (getDungeonModeInfo, contributeToDungeonGate, advanceDungeonMode),
// sayılar: js/config.js ZINDAN_MODLARI, js/economy/ordu-hakki.js. Bu dosya yalnız gösterir ve eylemleri çağırır.
import { ekranKaydet, kap, kart, katli, satir, cubukSatiri, dugme, dugmeler, uyari, not, etiket, tam, astra, esc } from './cekirdek.js';
import { onay } from '../v3/bilesenler.js';
import { planBedeli } from './bilesik.js';
import { askerHakki, katOf } from '../../economy/ordu-hakki.js';

const AD = { wood: ['🪵', 'Odun'], iron: ['⛓️', 'Demir'], coal: ['⚫', 'Kömür'], stone: ['🪨', 'Taş'], wheat: ['🌾', 'Buğday'], herb: ['🌿', 'Şifalı ot'] };
const kaynakAd = (k) => (AD[k] ? `${AD[k][0]} ${AD[k][1]}` : esc(k));
const bildirSonuc = (b, r) => { if (r && r.message) b.bildir(r.message, r.success ? 'success' : 'error'); return r; };
const katSayisi = 6;
const carp = (v) => String(v).replace('.', ',');   // Türkçe ondalık: ×1,5

// Mevcut modun özeti: çarpanlar, asker hakkı ve ilerleme
function mevcutKart(gs, bilgi) {
  const ilerleme = gs.state.dungeonProgress || 1;
  const hak = askerHakki({ ilerleme, mod: bilgi.mod });
  const ilerlemeYazisi = bilgi.bitti ? `Tüm ${katSayisi} kat bitti` : `${katOf(ilerleme)}. kattasın (canavar ${Math.min(ilerleme, 18)}/18)`;
  return kart({
    baslik: `${bilgi.simge} ${esc(bilgi.ad)} mod`, rozet: etiket(bilgi.enYuksekMod ? 'en yüksek mod' : `mod ${bilgi.mod + 1}/4`, bilgi.bitti ? 'iyi' : ''),
    icerik: satir('Zindandaki yerin', ilerlemeYazisi)
      + satir('ASTRA ödül çarpanı', `×${carp(bilgi.odulCarpani)}`) + satir('Eşya düşme çarpanı', `×${carp(bilgi.dusmeCarpani)}`)
      + satir('Asker hakkın (şu an)', `${tam(hak)} (${tam(gs.state.soldierUnits ? gs.state.soldierUnits.length : 0)} askerin var)`)
      + not('Deneyim (XP) ödülü mod çarpanından etkilenmez: hesap seviyesi oyunun tempo eğrisine bağlıdır.')
  });
}

// Bir üst moda geçiş: önkoşul, hammadde ilerlemesi, ASTRA bedeli
function gecisKarti(b, gs, bilgi) {
  if (bilgi.enYuksekMod) return kart({ baslik: '⚫ En yüksek moddasın', icerik: not('Cehennem, zindanın son modudur. Burada kazandığın hak ve ödül çarpanları kalıcıdır.') });
  const g = bilgi.gecis;
  const ozet = `${g.hedefSimge} ${esc(g.hedefAd)} mod: canavarlar çok daha güçlü; ASTRA ödülü ×${carp(g.hedefOdulCarpani)}, eşya düşme şansı ×${carp(g.hedefDusmeCarpani)}; asker hakkın ${tam(g.yeniAskerHakki)}'e çıkar (hak ve geçilen modlar kalıcıdır, askerlerin silinmez).`;
  if (!bilgi.bitti) {
    return kart({ baslik: `${g.hedefSimge} Sonraki mod: ${esc(g.hedefAd)}`, icerik: not(ozet) + uyari(`🔒 Önce ${esc(bilgi.ad)} modun son canavarını (Sv.18, Kıyamet Ejderhası) yenmelisin.`, 'uyari') });
  }
  const env = gs.state.inventory || {};
  const satirlar = Object.keys(g.gerek).map((k) => {
    const yuzde = g.gerek[k] > 0 ? (g.verilen[k] / g.gerek[k]) * 100 : 100;
    const elde = Math.floor(Number(env[k]) || 0);
    const verilebilir = Math.min(elde, g.kalan[k]);
    return cubukSatiri(kaynakAd(k), `${tam(g.verilen[k])} / ${tam(g.gerek[k])}`, yuzde, { ton: g.kalan[k] <= 0 ? '' : 'dolu' })
      + `<div class="ek-satir-alt"><span class="ek-kucuk">Envanterinde ${tam(elde)}${g.kalan[k] > 0 ? ` · kalan ${tam(g.kalan[k])}` : ' · tamam ✅'}</span>`
      + (g.kalan[k] > 0 ? dugme({ e: 'katki', metin: `Ver (${tam(verilebilir)})`, devreDisi: verilebilir <= 0, veri: { k }, ipucu: 'Envanterindekinden, kalan ihtiyacı aşmayacak kadarını yakar' }) : '') + '</div>';
  }).join('');
  const verilebilirVar = Object.keys(g.gerek).some((k) => g.kalan[k] > 0 && Math.floor(Number(env[k]) || 0) > 0);
  const gecisPlani = g.hammaddeTamam ? null : gs.getQuickBuyPlan('modgate');
  const astraDurumu = g.astraYeter ? `Bakiyen yeter (${astra(Math.floor(gs.state.adAstraBalance))} ASTRA).` : `Bakiyen yetmiyor (${astra(Math.floor(gs.state.adAstraBalance))} ASTRA).`;
  return kart({
    baslik: `${g.hedefSimge} Sonraki mod: ${esc(g.hedefAd)}`, vurgu: g.yapilabilir ? 'iyi' : '',
    icerik: not(ozet)
      + uyari('🔥 Geçiş bedelindeki hammadde YAKILIR (geri dönmez): silo sınırına takılmaman için günlere yayarak katkı verebilirsin.', 'uyari')
      + satirlar
      + satir('💰 ASTRA bedeli (son adımda)', `${astra(g.astra)} ASTRA`, g.astraYeter ? 'iyi' : 'kotu') + `<div class="ek-kucuk">${astraDurumu}</div>`
      + (gecisPlani && gecisPlani.items.length ? dugme({ e: 'katkiHizli', metin: `⚡ Eksikleri al ve ver · ${planBedeli(gecisPlani)}`, ton: 'iyi', devreDisi: !gecisPlani.ok, genis: true, ipucu: gecisPlani.ok ? 'Eksik hammaddeyi pazardan alıp geçişe yakar' : gecisPlani.reason }) : '')
      + dugmeler(
        dugme({ e: 'katkiHepsi', metin: 'Elindeki hepsini ver', devreDisi: !verilebilirVar || g.hammaddeTamam, ipucu: 'Her hammaddeden, kalan ihtiyacı aşmayacak kadarını yakar' }),
        dugme({ e: 'gec', metin: `${g.hedefSimge} ${esc(g.hedefAd)} moda geç`, ton: 'birincil', devreDisi: !g.yapilabilir })
      )
  });
}

const ekran = {
  id: 'zindanmod',
  baslik: () => ['🗺️', 'Zindan modu'],

  govde(b) {
    const gs = b.gameState;
    const bilgi = gs.getDungeonModeInfo();
    return kap([
      mevcutKart(gs, bilgi),
      gecisKarti(b, gs, bilgi),
      katli('Modlar nasıl çalışır?', not('Normal modu bitirince zindan Zor, sonra Uzman, sonra Cehennem moduyla baştan açılır. Her modda canavarlar çok daha güçlüdür; karşılığında zindandan kazandığın ASTRA ve düşen parça, kutu, eser şansı artar. Her mod 6 kat asker hakkı ekler (Normal 2-7, Zor 8-13, Uzman 14-19, Cehennem 20-25). Daha güçlü canavarlar için askerlerini seviyelendirmen ve teçhizatını yükseltip bakımını yapman gerekir.'), { k: 'zindanmod-nasil' })
    ].join(''));
  },

  eylemler: {
    async katki(b, el) {
      const k = el.dataset.k;
      const bilgi = b.gameState.getDungeonModeInfo();
      if (!bilgi.gecis || !Object.hasOwn(bilgi.gecis.gerek, k)) return false;
      const elde = Math.floor(Number(b.gameState.state.inventory[k]) || 0);
      bildirSonuc(b, await b.gameState.contributeToDungeonGate({ [k]: Math.min(elde, bilgi.gecis.kalan[k]) }));
      return undefined;
    },
    async katkiHepsi(b) {
      const bilgi = b.gameState.getDungeonModeInfo();
      if (!bilgi.gecis) return false;
      const env = b.gameState.state.inventory || {};
      const miktar = {};
      for (const k of Object.keys(bilgi.gecis.gerek)) {
        const q = Math.min(Math.floor(Number(env[k]) || 0), bilgi.gecis.kalan[k]);
        if (q > 0) miktar[k] = q;
      }
      if (!Object.keys(miktar).length) return false;
      bildirSonuc(b, await b.gameState.contributeToDungeonGate(miktar));
      return undefined;
    },
    // Eksik hammaddeyi pazardan alıp hemen katkı olarak yakar; silo kalanın hepsini tutamazsa tur tur ilerler (al, yak, tekrar)
    async katkiHizli(b) {
      const gs = b.gameState;
      const plan = gs.getQuickBuyPlan('modgate');
      if (!plan.items.length) return false;
      if (!plan.ok) { b.bildir(plan.reason || 'Alım yapılamıyor.', 'error'); return false; }
      const liste = plan.items.map((i) => `• ${tam(i.qty)} ${i.name} (${astra(i.cost)} ASTRA)`).join('\n');
      const tamam = await onay({
        baslik: 'Eksik hammadde alınıp geçişe verilsin mi?',
        metin: `${liste}\nAlım ~${astra(plan.total)} ASTRA. Hammadde YAKILIR (geri dönmez). Son adımdaki ${astra(plan.extraAda)} ASTRA geçişte ayrıca düşer.`,
        tamam: 'Al ve ver', tehlikeli: true
      });
      if (!tamam) return false;
      for (let tur = 0; tur < 60; tur++) {
        const g = gs.getDungeonModeInfo().gecis;
        const kalanlar = g ? Object.keys(g.kalan).filter((k) => g.kalan[k] > 0) : [];
        if (!kalanlar.length) break;
        const verilecek = {};
        for (const k of kalanlar) {
          const elde = Math.floor(Number(gs.state.inventory[k]) || 0);
          const oda = Math.max(0, Math.floor((gs.getWarehouseCapacity()[k] || 0) - elde));
          const al = Math.min(Math.max(0, g.kalan[k] - elde), oda);
          if (al > 0) {
            const r = await gs.marketBuy(k, al);
            if (!r || !r.success) { b.bildir(`${k} alınamadı: ${(r && r.message) || ''}`, 'error'); return false; }
          }
          const q = Math.min(g.kalan[k], Math.floor(Number(gs.state.inventory[k]) || 0));
          if (q > 0) verilecek[k] = q;
        }
        if (!Object.keys(verilecek).length) { b.bildir('Silo çok küçük: önce siloyu yükselt.', 'warning'); return false; }
        const r = await gs.contributeToDungeonGate(verilecek);
        if (!r || !r.success) { b.bildir((r && r.message) || 'Katkı verilemedi.', 'error'); return false; }
      }
      b.bildir('🔥 Geçiş için gereken hammadde tamamlandı.', 'success');
      return undefined;
    },
    async gec(b) {
      const bilgi = b.gameState.getDungeonModeInfo();
      if (!bilgi.gecis || !bilgi.gecis.yapilabilir) return false;
      const g = bilgi.gecis;
      const tamam = await onay({
        baslik: `${g.hedefAd} moda geçilsin mi?`,
        metin: `Zindan baştan başlar (ilerlemen 1. kata döner), canavarlar çok daha güçlü olur. ${astra(g.astra)} ASTRA harcanır. Asker hakkın ${tam(g.yeniAskerHakki)}'e çıkar; askerlerin ve teçhizatın korunur. Geri dönüş yok.`,
        tamam: `${g.hedefAd} moda geç`, tehlikeli: true
      });
      if (!tamam) return false;
      const r = bildirSonuc(b, await b.gameState.advanceDungeonMode());
      return r && r.success ? undefined : false;
    }
  }
};

export default ekranKaydet(ekran);
