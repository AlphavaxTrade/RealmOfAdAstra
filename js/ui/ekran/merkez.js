// Realm of AdAstra — Krallık merkezi: tek dokunuşla toplu işlemler ve krallığın genel durumu.
import { ekranKaydet, kap, kart, katli, satir, cubuk, cubukSatiri, dugme, dugmeler, not, sure, tam, astra, esc, simge } from './cekirdek.js';
import { kaynakSimgesi, hizliIyilestir } from './bilesik.js';

// Eylem sonucunu tek satır bildirime çevirir
function seferToplamaBildirimi(b, r) {
  if (r.hakBekleyen && r.hakBekleyen.length) {
    const ad = r.hakBekleyen.map((h) => h.ad).join(', ');
    b.bildir(`⏳ ${ad} toplanamadı: bu kaynak için bugün alabileceğin Üretim Hakkın doldu, mahsul seferde bekliyor. Yeni hak ${r.hakBekleyen[0].bekle} sonra açılır (hakkını büyütmek için Konsey'e bak).`, 'warning');
  }
  if (r.staminaWarning) b.bildir(r.staminaWarning, 'warning');
  else if (r.messages && r.messages.length > 0) b.bildir(r.messages[0], 'warning');
  if (r.claimed > 0 || r.partialClaimed > 0 || r.restarted > 0) {
    const parcalar = [];
    if (r.claimed > 0) parcalar.push(`${r.claimed} tam sefer`);
    if (r.partialClaimed > 0) parcalar.push(`${r.partialClaimed} süren seferden biriken`);
    const toplam = r.totalHarvest > 0 ? ` (+${tam(r.totalHarvest)} kaynak)` : '';
    b.bildir(`⚡ ${parcalar.join(' ve ')} toplandı${toplam}, ${r.restarted} sefer başlatıldı!`, 'success');
  }
}

// "Şimdi yapılacaklar" (19 Ekim 2026): krallığın durumuna göre yalnız işe yarayan satırlar, her biri tek dokunuşluk eylem. Hiç iş yoksa bunu söyler.
function yapilacaklar(b, ozet, onarim, iyilestirme) {
  const satirlar = [];
  const satir_ = (metin, dugmeHtml) => `<div class="ek-yapilacak"><span>${metin}</span>${dugmeHtml}</div>`;
  const hazir = ozet.completedExps.length;
  const bosAlan = b.GAME_CONFIG.RESOURCE_KEYS.length - ozet.activeExps.length;
  if (hazir > 0) satirlar.push(satir_(`✅ <b>${hazir}</b> sefer toplanmayı bekliyor`, dugme({ e: 'topla', metin: 'Topla ve başlat', ton: 'birincil' })));
  else if (bosAlan > 0) satirlar.push(satir_(`💤 <b>${bosAlan}</b> alan boşta`, dugme({ e: 'topla', metin: 'Sefere gönder', ton: 'birincil' })));
  if (iyilestirme.count > 0) satirlar.push(satir_(`🩹 <b>${iyilestirme.count}</b> asker yaralı`, dugme({ e: 'iyilestir', metin: 'İyileştir' })));
  if (onarim.count > 0) satirlar.push(satir_(`🔨 <b>${onarim.count}</b> alet onarım bekliyor`, dugme({ e: 'onar', metin: 'Onar' })));
  if (ozet.stamina < ozet.maxStamina * 0.4) satirlar.push(satir_(`⚡ Stamina düşük (<b>${tam(ozet.stamina)}</b> / ${tam(ozet.maxStamina)})`, dugme({ e: 'staminaDoldur', metin: 'Buğdayla doldur', devreDisi: !(Number(ozet.inventory && ozet.inventory.wheat) > 0) })));
  const doluSilo = (ozet.kaynaklar || []).filter((r) => r.pct >= 90);
  if (doluSilo.length) satirlar.push(satir_(`📦 Silo dolmak üzere (${doluSilo.map((r) => esc(r.name)).join(', ')})`, dugme({ e: 'silo', metin: 'Siloyu aç' })));
  return kart({
    baslik: '✅ Şimdi yapılacaklar',
    vurgu: satirlar.length ? 'vurgu' : '',
    icerik: satirlar.length ? satirlar.join('') : not('Her şey yolunda: seferler sürüyor, askerler sağlam. Süre dolunca burada görünür.')
  });
}

const ekran = {
  id: 'merkez',
  goruldu: 'merkez',
  canliYenile: true,
  baslik: () => ['🏰', 'Krallık merkezi'],

  govde(b) {
    const gs = b.gameState;
    const ozet = gs.getRealmSummary();
    const onarim = gs.getAllRepairCost();
    const iyilestirme = gs.getAllHealCost();
    const envanter = gs.state.inventory || {};

    const eksikStamina = Math.max(0, ozet.maxStamina - Math.floor(ozet.stamina));
    const bugdayGerekli = Math.ceil(eksikStamina * (b.GAME_CONFIG.WHEAT_PER_STAMINA || 3.15));
    const bugday = Math.floor(Number(envanter.wheat) || 0);
    const staminaDolu = ozet.stamina >= ozet.maxStamina;
    const staminaParsomen = Number(envanter.scroll_stamina) || 0;
    const iyilesmeParsomen = Number(envanter.scroll_heal) || 0;

    const toplu = dugmeler(
      dugme({ e: 'topla', metin: '⚡ Tüm seferleri topla ve başlat', ton: 'birincil' }),
      dugme({ e: 'staminaDoldur', metin: `⚡ Staminayı doldur (${staminaDolu ? 'dolu' : `${tam(bugdayGerekli)} 🌾`})`, devreDisi: staminaDolu || bugday <= 0 }),
      staminaParsomen > 0 ? dugme({ e: 'parsomen', metin: `📜 Parşömenle +100 stamina (${staminaParsomen})`, veri: { parsomen: 'scroll_stamina' }, devreDisi: staminaDolu }) : '',
      dugme({ e: 'onar', metin: `🔨 Tüm aletleri onar (${onarim.count === 0 ? 'tam sağlam' : `${tam(onarim.totalWood)} 🌲 ${tam(onarim.totalIron)} ⛏️ ${astra(onarim.totalAda)} 🟣`})`, devreDisi: onarim.count === 0 }),
      dugme({ e: 'iyilestir', metin: `🌿 Tüm orduyu otla iyileştir (${iyilestirme.count === 0 ? 'tam sağlıklı' : `${tam(iyilestirme.totalHerbs)} 🌿 ${astra(iyilestirme.totalAda)} 🟣`})`, devreDisi: iyilestirme.count === 0 }),
      iyilesmeParsomen > 0 ? dugme({ e: 'parsomen', metin: `📜 Parşömenle orduyu iyileştir (${iyilesmeParsomen})`, veri: { parsomen: 'scroll_heal' }, devreDisi: iyilestirme.count === 0 }) : ''
    );

    const genel = kart({
      baslik: '📊 Genel durum',
      icerik: satir('Seviye', `Lv.${ozet.level}`)
        + satir('ASTRA bakiyesi', `${astra(ozet.ada)} 🟣`)
        + cubukSatiri('Stamina', `${tam(ozet.stamina)} / ${tam(ozet.maxStamina)} ⚡`, (ozet.stamina / Math.max(1, ozet.maxStamina)) * 100, { renk: '#63b0ff' })
    });

    const seferler = ozet.activeExps.length
      ? ozet.activeExps.map((e) => cubukSatiri(
        `${esc(e.icon)} ${esc(e.name)}`,
        e.isCompleted ? (gs.getUretimHakki(e.nodeId).canTake < 1 ? '⏳ hak bekliyor' : '✅ hazır') : sure(e.remainingSeconds * 1000),
        e.pct,
        { ton: e.isCompleted ? '' : 'dolu', renk: e.isCompleted ? '#43d19a' : '' }
      )).join('')
      : not('Şu an sefer yok. Bir bölgeye işçi göndererek hammadde toplayabilirsin.');

    // Bu haftaki üretim hakkın: çubuğun dolu kısmı şu an alınabilen, tamamı haftalık pay (ayrıntı Kotalarım'da)
    const meta = b.GAME_CONFIG.RESOURCE_META || {};
    const haklar = b.GAME_CONFIG.RESOURCE_KEYS.map((k) => {
      const hak = gs.getUretimHakki(k);
      const m = meta[k] || {};
      return cubukSatiri(
        `${esc(m.icon || '')} ${esc(m.name || k)}`,
        `şimdi ${tam(hak.canTake)} · haftalık ${tam(hak.weekly)}`,
        hak.weekly > 0 ? (hak.used / hak.weekly) * 100 : 0,
        { renk: m.color || '' }
      );
    }).join('');

    const aletler = ozet.toolSummary.map((a) => cubukSatiri(
      `${esc(a.icon)} ${esc(a.name)}`, `${tam(a.durability)} / ${tam(a.maxDurability)}`, a.pct, { ton: a.pct < 20 ? 'kotu' : '' }
    )).join('');

    const ordu = ozet.soldierCount === 0
      ? not('Henüz askerin yok. Kışla bölümünden ilk askerini alabilirsin.')
      : satir('Toplam savaş gücü', `⚔️ ${tam(ozet.totalAtk)} · ❤️ ${tam(ozet.totalHp)}`)
        + satir('Yaralı asker', ozet.woundedCount > 0 ? `⚠️ ${ozet.woundedCount}` : '✅ hepsi zinde', ozet.woundedCount > 0 ? 'kotu' : 'iyi')
        + cubuk(ozet.avgHpPct, { ton: ozet.avgHpPct < 50 ? 'kotu' : '' });

    const silo = ozet.kaynaklar.map((r) => `<div class="ek-ambar">
      <div class="ek-ambar-ust">${simge(kaynakSimgesi(b, r.key), true)}<span class="ek-ambar-ad">${esc(r.name)} (%${r.pct})</span><b>${esc(tam(r.amount))} / ${esc(tam(r.cap))}</b></div>
      ${cubuk(r.pct, { renk: r.color, ton: r.pct >= 99 ? 'dolu' : '' })}</div>`).join('');

    return kap([
      yapilacaklar(b, ozet, onarim, iyilestirme),
      katli('⚡ Hepsi bir arada', toplu, { k: 'merkez-toplu' }),
      genel,
      kart({ baslik: `⏳ Seferler (${ozet.activeExps.length}/${b.GAME_CONFIG.RESOURCE_KEYS.length})`, icerik: seferler }),
      katli('🎫 Üretim hakkın (bu hafta)', haklar + dugmeler(dugme({ e: 'kotalar', metin: '📊 Kotalarım ve günlük sınırlar', ton: 'hayalet' })), { k: 'uretim-hakki' }),
      katli(`🔨 Aletler (ort. %${ozet.avgToolHealth})`, aletler, { k: 'aletler' }),
      katli(`🛡️ Ordu (%${ozet.avgHpPct} can)`, ordu, { k: 'ordu' }),
      katli(`📦 Silo seviye ${gs.state.warehouseLevel}`, `<div class="ek-ambarlar">${silo}</div>${dugme({ e: 'silo', metin: '📦 Siloyu yükselt', genis: true })}`, { k: 'silo' })
    ].join(''));
  },

  eylemler: {
    topla(b) {
      seferToplamaBildirimi(b, b.gameState.claimAndRestartAllExpeditions());
    },
    staminaDoldur(b) {
      const r = b.gameState.refillStaminaToMaxWithWheat();
      b.bildir(r.message, r.success ? 'success' : 'info');
    },
    onar(b) {
      const r = b.gameState.repairAllTools();
      if (r.repaired > 0) b.bildir(`🔨 ${r.repaired} alet onarıldı: -${tam(r.totalWood)}🌲 -${tam(r.totalIron)}⛏️ -${astra(r.totalAda)}🟣`, 'success');
      else if (r.hasDamagedTools && r.missingAda) b.bildir('⚠️ Hesapta yeterli ASTRA yok!', 'error');
      else b.bildir(r.message || 'Onarılacak alet yok.', 'info');
    },
    async iyilestir(b) {
      await hizliIyilestir(b);   // eksik ot pazardan alınır
    },
    kotalar() { return { git: 'kotalar' }; },
    silo() { return { git: 'silo' }; },
    parsomen(b, el) {
      const r = b.gameState.useScroll(el.dataset.parsomen, null);
      b.bildir(r.message, r.success ? 'success' : 'error');
    }
  }
};

ekranKaydet(ekran);   // kayıt, modülün içe alınmasıyla olur (ekran/index.js)
