// Realm of AdAstra — Harita sahneleri (21 Ekim 2026): tek ana harita + kapılardan geçilen alt haritalar.
// Her sahne = bir arka plan resmi + üzerindeki tıklanabilir yerler. Yerler iki türdür:
//   • bölge: oyundaki bir ekrana açılır (TOWN_ZONES'taki kimlik; adı/simgesi oradan gelir, konumu burada sahneye göre verilir)
//   • kapı (gec): başka bir sahneye geçirir (bulut perdesiyle)
// Konumlar resim üzerindeki oran (px = soldan, py = üstten, pr = tıklama yarıçapı, genişliğe oranla). Saf veri + saf işlevler:
// Phaser'a bağlı değildir, testi tests/test_sahneler.mjs. 3B vadi (js/vadi3d) TOWN_ZONES'u eskisi gibi kullanır, bu dosyadan etkilenmez.
import { TOWN_ZONES } from './harita-ortak.js';

// Kapıların görünümü (haritadaki yazı, bilgi kartı)
export const KAPILAR = {
  sehir: { icon: '🏰', name: 'Krallık Şehri', sub: 'Pazar, Konsey, Demirhane, Taverna, Karnaval, Köy, Kolezyum', color: '#e7b94c' },
  kaynak: { icon: '⛏️', name: 'Madenler ve Orman', sub: 'Kömür, demir, taş ve odun seferleri', color: '#38bdf8' },
  kisla: { icon: '⚔️', name: 'Kışla Bölgesi', sub: 'Kışla (ordu, asker, teçhizat) ve Şifahane', color: '#60a5fa' },
  savas: { icon: '🚩', name: 'Savaş Alanı', sub: 'Dünya Bossu cephesi ve savaş etkinlikleri', color: '#f87171' },
  zindan: { icon: '💀', name: 'Zindan Mağarası', sub: '18 seviyeli zindana in', color: '#a855f7' },
  tarla: { icon: '🌾', name: 'Tarlalar', sub: 'Buğday tarlası, şifalı ot bahçesi ve silo', color: '#facc15' }
};

// Resim dosyaları: sabit sürüm eki tarayıcı önbelleğini çalıştırır; resim değişince sürüm yazısı değiştirilir.
// y: yerler. { id } = bölge (konum sahneye özel), { gec } = kapı. merkez: sahne açılınca kameranın baktığı yer.
export const SAHNELER = {
  ana: {
    ad: 'Adastra Vadisi', resim: 'assets/sahne_ana.webp?v=20261021', w: 2048, h: 1144, merkez: { x: 0.5, y: 0.55 },
    yerler: [
      { gec: 'kaynak', px: 0.390, py: 0.270, pr: 0.120 },
      { gec: 'sehir', px: 0.500, py: 0.640, pr: 0.170 },   // şehir surları ve yanındaki kolezyum (kolezyum şehrin içinde sayılır)
      { gec: 'kisla', px: 0.075, py: 0.810, pr: 0.100 },
      { gec: 'savas', px: 0.380, py: 0.870, pr: 0.110 },
      { gec: 'zindan', px: 0.100, py: 0.530, pr: 0.090 },
      { gec: 'tarla', px: 0.900, py: 0.750, pr: 0.130 },
      { id: 'spaceport', px: 0.915, py: 0.140, pr: 0.090 }
    ]
  },
  sehir: {
    ad: 'Krallık Şehri', resim: 'assets/sahne_sehir.webp?v=20261021', w: 2048, h: 1144, merkez: { x: 0.5, y: 0.5 },
    yerler: [
      { id: 'market', px: 0.525, py: 0.500, pr: 0.095 },
      { id: 'council', px: 0.635, py: 0.200, pr: 0.100 },
      { id: 'blacksmith', px: 0.795, py: 0.400, pr: 0.085 },
      { id: 'tavern', px: 0.165, py: 0.500, pr: 0.095 },
      { id: 'carnival', px: 0.240, py: 0.210, pr: 0.090 },
      { id: 'village', px: 0.450, py: 0.790, pr: 0.100 },
      { id: 'colosseum', px: 0.450, py: 0.090, pr: 0.090 }
    ]
  },
  kaynak: {
    ad: 'Madenler ve Orman', resim: 'assets/sahne_kaynak.webp?v=20261021', w: 2048, h: 1144, merkez: { x: 0.5, y: 0.5 },
    yerler: [
      { id: 'coalmine', px: 0.140, py: 0.470, pr: 0.100 },
      { id: 'mine', px: 0.450, py: 0.350, pr: 0.100 },
      { id: 'quarry', px: 0.875, py: 0.410, pr: 0.110 },
      { id: 'forest', px: 0.525, py: 0.740, pr: 0.140 }
    ]
  },
  kisla: {
    ad: 'Kışla Bölgesi', resim: 'assets/sahne_kisla.webp?v=20261021', w: 2048, h: 1144, merkez: { x: 0.5, y: 0.5 },
    yerler: [
      { id: 'barracks', px: 0.250, py: 0.330, pr: 0.150 },
      { id: 'healer', px: 0.770, py: 0.330, pr: 0.110 }
    ]
  },
  savas: {
    ad: 'Savaş Alanı', resim: 'assets/sahne_savas.webp?v=20261021', w: 2048, h: 1144, merkez: { x: 0.62, y: 0.45 },
    yerler: [
      { id: 'battlefield', px: 0.680, py: 0.250, pr: 0.160 }   // dünya bossu (dev golem) ve cephe
    ]
  },
  tarla: {
    ad: 'Tarlalar', resim: 'assets/sahne_tarla.webp?v=20261021', w: 2048, h: 1144, merkez: { x: 0.5, y: 0.5 },
    yerler: [
      { id: 'farm', px: 0.220, py: 0.420, pr: 0.170 },
      { id: 'herbgarden', px: 0.725, py: 0.650, pr: 0.130 },
      { id: 'warehouse', px: 0.675, py: 0.180, pr: 0.110 }
    ]
  },
  zindan: {
    ad: 'Zindan Mağarası', resim: 'assets/sahne_zindan.webp?v=20261021', w: 2048, h: 1144, merkez: { x: 0.6, y: 0.45 },
    yerler: [
      { id: 'dungeon', px: 0.650, py: 0.380, pr: 0.130 }
    ]
  }
};

export const ANA_SAHNE = 'ana';

const bolgeBul = (id) => TOWN_ZONES.find((z) => z.id === id) || null;
export const kapiKimligi = (hedef) => `gec_${hedef}`;

// Bir sahnenin yerleri, çizim ve tıklama için tam nesne olarak: { id, icon, name, sub, color, px, py, pr, gec? }
export function sahneBolgeleri(sahneId) {
  const sahne = SAHNELER[sahneId];
  if (!sahne) return [];
  const liste = [];
  for (const y of sahne.yerler) {
    if (y.gec) {
      const k = KAPILAR[y.gec];
      liste.push({ id: kapiKimligi(y.gec), gec: y.gec, ...k, px: y.px, py: y.py, pr: y.pr });
    } else {
      const z = bolgeBul(y.id);
      if (z) liste.push({ ...z, px: y.px, py: y.py, pr: y.pr });
    }
  }
  return liste;
}

// Bir bölgeyi göstermek için hangi sahneye gidilmeli: önce bulunulan sahne, sonra ana harita, sonra diğerleri; yoksa null
export function bolgeSahnesi(zoneId, simdiki = ANA_SAHNE) {
  const sira = [simdiki, ANA_SAHNE, ...Object.keys(SAHNELER)];
  for (const s of sira) {
    if (SAHNELER[s] && SAHNELER[s].yerler.some((y) => y.id === zoneId)) return s;
  }
  return null;
}

// Kapıların levha durumu: içindeki bölgelerin durumundan türetilir. durumlar = bolgeDurumlari() sonucu ({ [id]: { text, tone, locked } }).
// Saf: yalnız verileni okur. Dönüş: { gec_sehir: {text,tone,locked}, ... }
export function kapiDurumlari(durumlar) {
  const sonuc = {};
  for (const hedef of Object.keys(KAPILAR)) {
    const cocuklar = (SAHNELER[hedef] ? SAHNELER[hedef].yerler : []).map((y) => y.id).filter(Boolean);
    const d = cocuklar.map((id) => durumlar[id] || { text: '', tone: '', locked: false });
    const hepsiKilitli = d.length > 0 && d.every((x) => x.locked);
    const hazir = cocuklar.filter((id, i) => d[i].tone === 'ready').length;
    const surenler = cocuklar.filter((id, i) => d[i].tone === 'busy').length;
    let text = '';
    let tone = '';
    if (hepsiKilitli) { text = d[0].text; tone = 'locked'; }
    else if (hedef === 'kaynak' || hedef === 'tarla') {
      if (hazir > 0) { text = `✅ ${hazir} sefer hazır · topla`; tone = 'ready'; }
      else { text = surenler > 0 ? `⏳ ${surenler} sefer sürüyor` : 'Boşta · sefer gönder'; tone = surenler > 0 ? 'busy' : 'idle'; }
    }
    else if (hedef === 'savas' || hedef === 'zindan') {
      // tek yerli sahneler: kapının levhası içindeki yerin levhasıdır
      if (d[0]) { text = d[0].text; tone = d[0].tone; }
    } else if (hedef === 'kisla') {
      const k = durumlar.barracks;
      if (k && k.tone === 'warn') { text = k.text; tone = 'warn'; } else if (k && k.text) text = k.text;
    } else if (hedef === 'sehir') {
      if (durumlar.carnival && durumlar.carnival.tone === 'gift') { text = durumlar.carnival.text; tone = 'gift'; }
      else if (durumlar.tavern && durumlar.tavern.tone === 'gift') { text = durumlar.tavern.text; tone = 'gift'; }
      else if (durumlar.warehouse && durumlar.warehouse.tone === 'warn') { text = `Silo ${durumlar.warehouse.text}`; tone = 'warn'; }
    }
    sonuc[kapiKimligi(hedef)] = { text, tone, locked: hepsiKilitli };
  }
  return sonuc;
}
