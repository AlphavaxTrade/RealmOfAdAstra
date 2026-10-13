// Realm of AdAstra — Canavar Kütüğü: 18 canavarın bilgi kartları. Yenilen ya da savaşılan canavarın ayrıntısı açılır,
// henüz karşılaşılmamış olanlar "???" görünür. Salt gösterim: oyun durumuna dokunmaz.
import { DUNGEON_LEVELS } from '../../bestiary.js';
import { esc, tam } from '../ekran/cekirdek.js';
import { KATLAR, yetenekBilgisi } from './plan.js';

// Kısa hikâyeler (yalnız gösterim)
export const HIKAYE = {
  1: 'Mağaranın en dibindeki bataklıkta kıpırdayan zehirli bir balçık. Küçümseyen ilk adımda ayağını yutar.',
  2: 'Mağaranın kenarlarında gözcü kuleleri kuran, sürü halinde gezen küçük ama sinsi bir goblin.',
  3: 'Kristal ışığında parlayan gözleriyle sürüsünü yöneten kurt; kata girenlerin ilk gerçek sınavı.',
  4: 'Kemik Mahzeni\'nin kapısını bekleyen, paslı kılıçlı ve kalkanlı iskelet savaşçılar.',
  5: 'Yasak kitaplardan beslenen, yeşil-mor ateşler saçan lanetli bir kemik büyücüsü.',
  6: 'Kemik taht odasının koruyucusu: iri bir pala ve dikenli zırhla kata girenleri biçer.',
  7: 'Kadim Tapınak\'ın kırmızı mumlarını yakan, ritüel çemberinde fısıldaşan kapüşonlu tarikatçı.',
  8: 'Zincirlerini koparmış, yelesi alevlerle yanan karanlık bir tazı.',
  9: 'Tapınağın kalbindeki taş tahtta oturan devasa golem. Canı azaldıkça runeleri daha parlak yanar.',
  10: 'Altın lahitlerden doğrulan, bandajlı ve sessiz Sargılı Mumyalar.',
  11: 'Dikili taşın etrafında süzülen soğuk, solgun hayaletler.',
  12: 'Kobraların ve hazinelerin ortasında, altın maskeli lanetli hükümdar.',
  13: 'Lav ocağında kanat çırpan, mızrak taşıyan kızıl iblisler.',
  14: 'Kaynayan taştan yapılmış, her adımında kor bırakan devler.',
  15: 'İki dev baltasıyla kara bir tahtta oturan obsidyen savaşçı.',
  16: 'Mor büyülü kılıç ve kalkanla mühür çemberini koruyan karanlık şövalye.',
  17: 'Mor kristalleri ve karanlık enerjiyi yöneten, gölgeden doğmuş bir lord.',
  18: 'Altın yığınının üzerinde, mor damarlı kara ejderha. Zindanın son ve en büyük sınavı.'
};

const kontrolAd = (kayit) => (kayit.isBoss || kayit.level === 9 || kayit.level === 18 ? ' · Boss' : '');

// ilerleme: oyuncunun açık seviyesi. Seviye <= ilerleme: ayrıntı açık (yenildi ya da şu an savaşılıyor)
export function kutukHtml(ilerleme) {
  const gorulen = DUNGEON_LEVELS.filter((m) => m.level <= ilerleme).length;
  const katlar = KATLAR.map((k) => {
    const liste = DUNGEON_LEVELS.filter((m) => m.floor === k.kat).map((m) => {
      const acik = m.level <= ilerleme;
      if (!acik) {
        return `<li class="zd-kutuk-kart is-kapali"><span class="zd-kutuk-simge" aria-hidden="true">❓</span>
          <div><b>???</b><small>Seviye ${m.level} · Henüz karşılaşılmadı</small></div></li>`;
      }
      const yet = (m.abilities || []).map((a) => {
        const y = yetenekBilgisi(a);
        return `<li><span aria-hidden="true">${y.simge}</span> <b>${esc(y.ad)}</b> — ${esc(y.metin)}</li>`;
      }).join('');
      const yenildi = m.level < ilerleme;
      const resim = m.avatar
        ? `<img class="zd-kutuk-resim" src="${esc(m.avatar)}" alt="" loading="lazy" draggable="false" data-fb="text:${esc(m.icon || '💀')}">`
        : `<span class="zd-kutuk-simge" aria-hidden="true">${esc(m.icon || '💀')}</span>`;
      return `<li class="zd-kutuk-kart${yenildi ? ' is-yenildi' : ''}">
        ${resim}
        <div>
          <b>${esc(m.name)}</b><small>Seviye ${m.level}${kontrolAd(m)} · ${yenildi ? '✅ Yenildi' : '⚔️ Karşında'}</small>
          <p class="zd-kutuk-hikaye">${esc(HIKAYE[m.level] || '')}</p>
          <p class="zd-kutuk-stat">❤️ ${tam(m.hp)} can · ⚔️ ${tam(m.atk)} saldırı · ✨ ${tam(m.rewardXp)} asker XP</p>
          ${yet ? `<ul class="zd-kutuk-yet">${yet}</ul>` : ''}
        </div></li>`;
    }).join('');
    return `<section class="zd-kutuk-kat"><h3>${k.simge} ${k.kat}. Kat · ${esc(k.ad)}</h3><ul>${liste}</ul></section>`;
  }).join('');
  return { gorulen, toplam: DUNGEON_LEVELS.length, html: katlar };
}
