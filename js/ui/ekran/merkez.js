// Realm of AdAstra — Krallık merkezi: tek dokunuşla toplu işlemler ve krallığın genel durumu.
import { ekranKaydet, kap, kart, katli, satir, cubuk, cubukSatiri, dugme, dugmeler, not, sure, tam, astra, esc, simge } from './cekirdek.js';
import { kaynakSimgesi } from './bilesik.js';

// Eylem sonucunu tek satır bildirime çevirir
function seferToplamaBildirimi(b, r) {
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

const ekran = {
  id: 'merkez',
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
      dugme({ e: 'iyilestir', metin: `🌾 Tüm orduyu doyur (${iyilestirme.count === 0 ? 'tam sağlıklı' : `${tam(iyilestirme.totalWheat)} 🌾 ${astra(iyilestirme.totalAda)} 🟣`})`, devreDisi: iyilestirme.count === 0 }),
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
        e.isCompleted ? '✅ hazır' : sure(e.remainingSeconds * 1000),
        e.pct,
        { ton: e.isCompleted ? '' : 'dolu', renk: e.isCompleted ? '#43d19a' : '' }
      )).join('')
      : not('Şu an sefer yok. Bir bölgeye işçi göndererek hammadde toplayabilirsin.');

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
      kart({ baslik: '⚡ Tek dokunuşla toplu işlemler', vurgu: 'vurgu', icerik: toplu }),
      genel,
      kart({ baslik: `⏳ Seferler (${ozet.activeExps.length}/${b.GAME_CONFIG.RESOURCE_KEYS.length})`, icerik: seferler }),
      katli(`🔨 Aletler (ort. %${ozet.avgToolHealth})`, aletler, { k: 'aletler' }),
      katli(`🛡️ Ordu (%${ozet.avgHpPct} can)`, ordu, { k: 'ordu' }),
      katli(`📦 Silo seviye ${gs.state.warehouseLevel}`, `<div class="ek-ambarlar">${silo}</div>`, { k: 'silo' })
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
    iyilestir(b) {
      const r = b.gameState.instantHealAllSoldiers();
      if (r.healed > 0) b.bildir(`🌾 ${r.healed} asker doyuruldu ve tam cana ulaştı: -${tam(r.totalWheat)}🌾 -${astra(r.totalAda)}🟣`, 'success');
      else b.bildir('İyileştirilecek yaralı asker yok.', 'info');
    },
    parsomen(b, el) {
      const r = b.gameState.useScroll(el.dataset.parsomen, null);
      b.bildir(r.message, r.success ? 'success' : 'error');
    }
  }
};

export default ekranKaydet(ekran);
