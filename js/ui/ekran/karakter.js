// Realm of AdAstra — Karakterim ekranı: seviye atlama, haftalık temel gelir (UBI), stamina, hammaddeler, parşömenler ve aletler.
import {
  ekranKaydet, kap, kart, katli, cubuk, cubukSatiri, dugme, dugmeler, uyari, not, izgara, hucre, etiket, simge, tam, astra, sayi, esc
} from './cekirdek.js';
import { kaynakSimgesi, kaynakAdi, maliyetSatiri, hizliAlKarti, hizliAl } from './bilesik.js';

const yuzde = (x) => `%${(x * 100).toFixed(x < 0.01 ? 3 : 2).replace('.', ',')}`;

function seviyeKarti(b) {
  const gs = b.gameState;
  const s = gs.state;
  const req = gs.getNextLevelRequirement();
  const env = s.inventory;
  const enYuksek = (b.GAME_CONFIG.MAX_PLAYER_LEVEL || 81);
  const baslikRozet = etiket(`Sefer süresi: ${sayi(req.durationHours ?? gs.getExpeditionDurationHours(), 1)} saat`, 'vurgu');

  if (req.isMaxLevel) {
    return kart({ baslik: `👑 Seviye ${s.level}: AlphAvax Gezgini`, rozet: baslikRozet, icerik: uyari(`Maksimum seviyeye (Lv.${enYuksek}) ulaştın.`, 'iyi', '🏆') });
  }

  const a = gs.getLevelBenefits(s.level);
  const n = gs.getLevelBenefits(s.level + 1);
  const tasarruf = a.wheatPer1000 > 0 ? Math.round((1 - n.wheatPer1000 / a.wheatPer1000) * 1000) / 10 : 0;
  const fayda = [
    ['🏭 Üretim bonusu (dakikada)', `+%${a.productionBonusPct}`, `+%${n.productionBonusPct}`],
    ['🌾 1.000 hammadde için stamina buğdayı', tam(a.wheatPer1000), `${tam(n.wheatPer1000)}${tasarruf > 0 ? ` (%${sayi(tasarruf, 1)} tasarruf)` : ''}`],
    ['⚡ Maksimum stamina', tam(a.maxStamina), tam(n.maxStamina)],
    ['⏳ Sefer süresi', `${a.expeditionHours} sa`, `${n.expeditionHours} sa`],
    ['🧩 Zindan parça şansı', yuzde(a.fragmentRate), yuzde(n.fragmentRate)],
    ['🏛️ Haftalık UBI payı', a.ubiEligible ? `×${a.ubiWeight}` : 'yok (Sv.3+)', n.ubiEligible ? `×${n.ubiWeight}` : 'yok (Sv.3+)']
  ].map(([e, simdi, sonra]) => `<div class="ek-satir"><span>${esc(e)}</span><b>${esc(simdi)} → <span class="ek-iyi">${esc(sonra)}</span></b></div>`).join('');

  const xpYeter = s.currentXp >= req.xp;
  const yeter = xpYeter && env.wood >= req.wood && env.iron >= req.iron && env.wheat >= req.wheat && s.adAstraBalance >= req.adAstra;
  let neden = '';
  if (!xpYeter) neden = `Yetersiz deneyim (${tam(s.currentXp)}/${tam(req.xp)} XP)`;
  else if (s.adAstraBalance < req.adAstra) neden = `Yetersiz ASTRA (${tam(s.adAstraBalance)}/${tam(req.adAstra)})`;
  else if (!yeter) neden = 'Eksik hammadde var';

  return kart({
    baslik: `👑 Seviye ${s.level}: AlphAvax Gezgini`,
    rozet: baslikRozet,
    vurgu: yeter ? 'iyi' : 'vurgu',
    icerik: [
      not(`Seviye atlayınca sefer süren <b>${esc(sayi(req.durationHours, 1))} saate</b>, maksimum staminan <b>${esc(tam(gs.getMaxStamina(s.level + 1)))} ⚡'ya</b> çıkar. Zindan ganimet şansın: 🧩 parça <b>${esc(req.curFragRateFormatted)} → ${esc(req.nextFragRateFormatted)}</b>, 📦 Pandora kutusu <b>${esc(req.curBoxRateFormatted)} → ${esc(req.nextBoxRateFormatted)}</b>.`),
      katli(`⭐ Seviye ${s.level + 1}'e çıkınca ne kazanırsın?`, fayda, { k: 'fayda' }),
      cubukSatiri('✨ Deneyim (XP)', `${tam(s.currentXp)} / ${tam(req.xp)}${xpYeter ? ' ✅' : ''}`, (s.currentXp / req.xp) * 100, { ton: xpYeter ? '' : 'dolu' }),
      xpYeter ? '' : not('💡 XP kazanmak için haritadan hammadde bölgelerinde seferlere çıkmalısın.'),
      maliyetSatiri('🌲 Odun', env.wood || 0, req.wood),
      maliyetSatiri('⛏️ Demir', env.iron || 0, req.iron),
      maliyetSatiri('🌾 Buğday', env.wheat || 0, req.wheat),
      maliyetSatiri('🟣 ASTRA', s.adAstraBalance || 0, req.adAstra, { astraMi: true }),
      not('Ekstra ASTRA bedeli, istenen odun, demir ve buğdayın pazar değeridir.'),
      hizliAlKarti(b, 'levelup'),
      dugme({ e: 'seviye', metin: yeter ? `✨ Seviye ${s.level + 1}'e yükselt` : `🔒 Seviye ${s.level + 1}'e yükselt: ${esc(neden)}`, ton: yeter ? 'iyi' : '', genis: true })
    ].join('')
  });
}

function ubiKarti(b) {
  const gs = b.gameState;
  const u = b.globalPool.getUbiPoolInfo(gs.state.level || 1, gs.state.lastClaimedUbiEpoch || 0);
  return kart({
    baslik: '🏛️ Haftalık temel gelir (UBI)',
    rozet: etiket(u.eligible ? `+${astra(u.payout)} ASTRA / hafta` : 'Seviye 3\'te açılır', u.eligible ? 'iyi' : ''),
    icerik: not(`Oyundaki her harcamanın <b>%6'sı</b> bu havuzda toplanır. Pazartesi 00:01'de (TSİ) kasa açılır; payın seviyene göre belirlenir ve haftada bir kez talep edersin.`)
      + izgara([
        hucre('Havuzdaki toplam', `${tam(u.totalPool)} ASTRA`),
        hucre('Bu haftanın kasası', `${tam(u.weeklyBudget)} ASTRA`),
        hucre(`Senin payın (Lv.${gs.state.level})`, `${astra(u.payout)} ASTRA`, 'iyi'),
        hucre(`Sonraki seviye (Lv.${Math.min(81, gs.state.level + 1)})`, `${astra(u.nextLevelPayout)} ASTRA (+%${tam(u.increasePct)})`)
      ])
      + (u.alreadyClaimedThisWeek
        ? uyari('Bu haftaki temel gelirini aldın. Sonraki dağıtım Pazartesi 00:01 (TSİ).', 'iyi')
        : dugme({ e: 'ubi', metin: `🏛️ Haftalık temel geliri al (+${astra(u.payout)} ASTRA)`, ton: 'birincil', devreDisi: !u.eligible, genis: true }))
  });
}

function staminaKarti(b) {
  const gs = b.gameState;
  const s = gs.state;
  const enFazla = gs.getMaxStamina();
  const bugday = Math.floor(Number(s.inventory.wheat) || 0);
  const parsomen = Number(s.inventory.scroll_stamina) || 0;
  const oran = b.GAME_CONFIG.WHEAT_PER_STAMINA || 3.15;
  const dolu = s.stamina >= enFazla;
  return kart({
    baslik: '⚡ Stamina',
    rozet: etiket(`${tam(s.stamina)} / ${tam(enFazla)} ⚡`),
    icerik: cubuk((s.stamina / Math.max(1, enFazla)) * 100, { renk: '#63b0ff' })
      + not(`1 stamina doldurmak için ${sayi(oran, 2)} buğday gerekir. Depodaki buğdayla staminanı hemen yenileyebilirsin.`)
      + dugmeler(
        dugme({ e: 'staminaYirmi', metin: '🍞 +20 ⚡ doldur (63 buğday)', devreDisi: bugday < 63 || dolu }),
        dugme({ e: 'staminaTam', metin: `⚡ Tam doldur (${tam(Math.ceil(Math.max(0, enFazla - Math.floor(s.stamina)) * oran))} buğday)`, ton: 'iyi', devreDisi: bugday <= 0 || dolu }),
        parsomen > 0 ? dugme({ e: 'parsomen', metin: `📜 Parşömen kullan (${parsomen} adet, +100 ⚡)`, veri: { parsomen: 'scroll_stamina' }, devreDisi: dolu }) : ''
      )
  });
}

function hammaddeKarti(b) {
  const gs = b.gameState;
  const kapasite = gs.getWarehouseCapacity();
  const satirlar = b.GAME_CONFIG.RESOURCE_KEYS.map((k) => {
    const mevcut = Number(gs.state.inventory[k]) || 0;
    const kap_ = Number(kapasite[k]) || 0;
    const yz = kap_ > 0 ? Math.min(100, (mevcut / kap_) * 100) : 0;
    return `<div class="ek-ambar"><div class="ek-ambar-ust">${simge(kaynakSimgesi(b, k), true)}<span class="ek-ambar-ad">${esc(kaynakAdi(b, k))}</span><b>${esc(tam(mevcut))} / ${esc(tam(kap_))}</b></div>${cubuk(yz, { ton: yz >= 99.5 ? 'dolu' : '' })}</div>`;
  }).join('');
  return katli(`📦 Depolanan hammaddeler (parça: ${tam(gs.state.inventory.fragments || 0)})`, `<div class="ek-ambarlar">${satirlar}</div>`, { k: 'hammadde', acik: true });
}

function esyaKarti(b) {
  const s = b.gameState.state;
  const parsomenler = [
    { id: 'scroll_heal', ad: 'Ordu iyileştirme', simge: '📜', aciklama: 'Şampiyona anında +10 HP verir.', adet: Number(s.inventory.scroll_heal) || 0, etiket: '✨ Kullan (+10 HP)' },
    { id: 'scroll_stamina', ad: '100 stamina doldurma', simge: '⚡', aciklama: 'Staminana anında +100 ekler.', adet: Number(s.inventory.scroll_stamina) || 0, etiket: '⚡ Kullan (+100 ⚡)' }
  ].map((p) => `<div class="ek-oge">${simge(p.simge)}
      <div class="ek-oge-govde"><b>${esc(p.ad)} · ${esc(p.adet)} adet</b><small>${esc(p.aciklama)}</small></div>
      ${dugme({ e: 'parsomen', metin: p.adet > 0 ? esc(p.etiket) : 'Tükendi', veri: { parsomen: p.id }, devreDisi: p.adet <= 0 })}</div>`).join('');
  const bilet = `<div class="ek-oge-etiketler">
      <span class="ek-oge-etiket">🎟️ Piyango/çark bileti <b>${esc(tam(s.lotteryTickets || 0))}</b></span>
      <span class="ek-oge-etiket">🎟️ Çark amorti parçası <b>${esc(tam(s.wheelTicketShards || 0))}/10</b></span>
      <span class="ek-oge-etiket">🔑 Arena anahtarı <b>${esc(tam(s.arenaKeys || 0))}</b></span></div>`;
  return katli('📜 Parşömenler, biletler ve anahtarlar', `<div class="ek-liste">${parsomenler}</div>${bilet}`, { k: 'esya' });
}

function aletKarti(b) {
  const gs = b.gameState;
  const aletler = b.GAME_CONFIG.TOOLS || {};
  const satirlar = Object.keys(aletler).map((id) => {
    const cfg = aletler[id];
    const enFazla = cfg.maxDurability || 4320;
    const kayit = gs.state.tools[id] || { durability: enFazla };
    const dayanikli = kayit.durability != null ? kayit.durability : enFazla;
    const yz = Math.round((dayanikli / enFazla) * 100);
    const bedel = gs.calculateRepairCost(id) || { missingDurability: 0, woodCost: 0, ironCost: 0, adAstraCost: 0 };
    return `<div class="ek-oge">${simge(esc(cfg.icon || '🔧'))}
      <div class="ek-oge-govde"><b>${esc(cfg.name || id)}</b>
        <small>${tam(dayanikli)} / ${tam(enFazla)} dk (%${yz})${bedel.missingDurability > 0 ? ` · onarım: ${tam(bedel.woodCost)} odun + ${tam(bedel.ironCost)} demir + ${astra(bedel.adAstraCost)} ASTRA` : ' · tam sağlam'}</small></div>
      ${dugme({ e: 'onar', metin: bedel.missingDurability > 0 ? 'Onar' : 'Tam', veri: { alet: id }, devreDisi: bedel.missingDurability <= 0 })}</div>`;
  }).join('');
  return katli('🔨 Aletler ve dayanıklılık', `<div class="ek-liste">${satirlar}</div>`, { k: 'aletler' });
}

const ekran = {
  id: 'karakter',
  goruldu: 'profil',
  canliYenile: true,
  baslik: () => ['🧙', 'Karakterim'],
  govde: (b) => kap([seviyeKarti(b), ubiKarti(b), staminaKarti(b), hammaddeKarti(b), esyaKarti(b), aletKarti(b)].join('')),

  eylemler: {
    seviye(b) {
      const r = b.gameState.levelUp();
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    ubi(b) {
      const r = b.gameState.claimWeeklyUbi();
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    staminaYirmi(b) {
      const r = b.gameState.refillStaminaWithWheat();
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    staminaTam(b) {
      const r = b.gameState.refillStaminaToMaxWithWheat();
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    parsomen(b, el) {
      const r = b.gameState.useScroll(el.dataset.parsomen, null);
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    onar(b, el) {
      const r = b.gameState.repairTool(el.dataset.alet);
      b.bildir(r.message, r.success ? 'success' : 'error');
    },
    async hizliAl(b, el) {
      await hizliAl(b, el.dataset.kind);
    }
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
