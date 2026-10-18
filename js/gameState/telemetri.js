// Realm of AdAstra — Denge İzleme veri kancası (18 Ekim 2026). Oyunun denge ölçümü için önemli işlemleri (zindan savaşı, dövme, yükseltme, tamir,
// asker alımı, seviye atlama, mod geçişi…) SALT OKUNUR olarak bildirir. Kanca yalnız sunucuda kurulur (server/engine.js → server/denge.js);
// tarayıcıda `telemetriKancasi` tanımsızdır ve sarmalayıcı işlemi aynen çalıştırır. Kanca hata verse bile oyun işlemi etkilenmez.
// İşlemin kendi kodu değişmez: önce/sonra farkı (ASTRA, hammadde) ve dönüş değeri okunur. Yalnız yaprak işlemler sarılır (çift sayım olmasın).
const ASTRA = (gs) => Number(gs.state && gs.state.adAstraBalance) || 0;
const ENVANTER = (gs) => ({ ...((gs.state && gs.state.inventory) || {}) });
const yuvarla = (v) => Math.round(v * 100) / 100;
const ortalama = (liste) => (liste.length ? yuvarla(liste.reduce((a, b) => a + b, 0) / liste.length) : 0);

// önce − sonra: yalnız pozitif farklar (harcanan); getiri: sonra − önce
const azalan = (once, sonra) => {
  const o = {};
  for (const k of new Set([...Object.keys(once), ...Object.keys(sonra)])) { const d = (Number(once[k]) || 0) - (Number(sonra[k]) || 0); if (d > 0.0001) o[k] = yuvarla(d); }
  return o;
};

// İşlem adı → izleme türü. Sarılan her yöntem oyunda var olmalı (yoksa başlangıçta hata verir: yeniden adlandırma sessizce izlemeyi kırmasın).
export const IZLENEN_ISLEMLER = {
  craftEquipment: 'dovme', upgradeEquipment: 'yukselt', repairEquipment: 'onar', scrapAllLowTierEquipment: 'hurda',
  buySoldierUnit: 'asker_al', healSoldierWithHerb: 'iyilestir', levelUp: 'seviye',
  contributeToDungeonGate: 'mod_katki', advanceDungeonMode: 'mod_gecis'
};

// bir askerin kuşandığı eşyaların ortalama seviyesi (boş yuva 0 sayılır: tam takım seviyesiyle kıyaslanabilir)
const takimSeviyesi = (asker) => {
  const yuvalar = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
  const e = (asker && asker.equipment) || {};
  return yuvalar.reduce((t, y) => t + ((e[y] && (e[y].level || 1)) || 0), 0) / yuvalar.length;
};

export function telemetriKur(proto) {
  for (const [yontem, tur] of Object.entries(IZLENEN_ISLEMLER)) {
    const asil = proto[yontem];
    if (typeof asil !== 'function') throw new Error(`Telemetri için yöntem yok: ${yontem}`);
    proto[yontem] = function (...args) {
      const kanca = this.telemetriKancasi;
      if (typeof kanca !== 'function') return asil.apply(this, args);
      const once = { ada: ASTRA(this), env: ENVANTER(this) };
      const sonuc = asil.apply(this, args);
      try {
        const sonra = { ada: ASTRA(this), env: ENVANTER(this) };
        kanca('islem', {
          tur, basarili: !!(sonuc && sonuc.success), ada: Math.max(0, yuvarla(once.ada - sonra.ada)),
          getiriAda: Math.max(0, yuvarla(sonra.ada - once.ada)), hammadde: azalan(once.env, sonra.env), getiri: azalan(sonra.env, once.env)
        });
      } catch { /* izleme hiçbir zaman oyunu bozmaz */ }
      return sonuc;
    };
  }

  // Zindan savaşı: işlemden önce ordunun durumu okunur (savaş askerlerin canını/aşınmasını değiştirir), sonra sonuç özeti bildirilir
  const asilSavas = proto.fightDungeon;
  if (typeof asilSavas !== 'function') throw new Error('Telemetri için yöntem yok: fightDungeon');
  proto.fightDungeon = function (...args) {
    const kanca = this.telemetriKancasi;
    if (typeof kanca !== 'function') return asilSavas.apply(this, args);
    const mod = Math.max(0, Math.floor(Number(this.state.dungeonMode) || 0));
    const ilerleme = this.state.dungeonProgress || 1;
    const askerler = this.state.soldierUnits || [];
    const secili = [...new Set((Array.isArray(args[1]) ? args[1] : []).map(Number))].filter((i) => Number.isInteger(i) && askerler[i]);
    const askerSeviyeOrt = ortalama(secili.map((i) => askerler[i].level || 1));
    const takimOrt = ortalama(secili.map((i) => takimSeviyesi(askerler[i])));
    const sonuc = asilSavas.apply(this, args);
    try {
      if (sonuc && sonuc.success && sonuc.outcome) {
        const o = sonuc.outcome, giris = sonuc.entry || {}, sim = sonuc.sim || {};
        const hesapAcilis = Number(this._dunya && this._dunya.hesapAcilis) || 0;
        kanca('zindan', {
          mod, seviye: sonuc.level, kazandi: !!o.victory, asker: secili.length, askerSeviyeOrt, takimOrt,
          tur: Number(sim.roundCount) || 0, kayip: Number(sim.casualties) || 0,
          odul: Number(o.adaReward) || 0, xp: Number(o.xpGained) || 0, parca: Number(o.fragmentsGained) || 0, kutu: Number(o.boxGained) || 0,
          harc: Number(giris.fee) || 0, odullu: !!giris.rewarded,
          ilkTemizleme: !!o.victory && ilerleme === sonuc.level,
          hesapGunu: hesapAcilis ? yuvarla((Date.now() - hesapAcilis) / 86400000) : null
        });
      }
    } catch { /* izleme hiçbir zaman oyunu bozmaz */ }
    return sonuc;
  };
}
