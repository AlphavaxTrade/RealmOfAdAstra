// Yedek saklama planı (kurumsal A9.2): saatlik 48, günlük 14, haftalık 8. Saf işlev (saat ve dosya sistemi yok), kolay sınanır.
// Mantık: her kovada (saat / UTC günü / UTC pazartesi haftası) EN YENİ yedek tutulur; kovalar "şimdi"den geriye sayılır.
// Birleşim kümesi korunur, gerisi silinir. En yeni yedek her zaman korunur.
const SAAT = 3600000, GUN = 24 * SAAT, HAFTA = 7 * GUN;
const HAFTA_KAYDIRMA = 4 * GUN;   // 1 Ocak 1970 perşembe; haftayı pazartesiye hizalar

export function saklamaPlani(liste, simdi, { saatlik = 48, gunluk = 14, haftalik = 8 } = {}) {
  const tut = new Set();
  if (!liste.length) return tut;
  const sirali = [...liste].sort((a, b) => a.t - b.t);
  tut.add(sirali.at(-1).ad);
  const kova = (kovaDegeri, sinir) => {
    const enYeni = new Map();   // artan sırada gezildiği için sonraki (daha yeni) öncekini ezer
    for (const x of sirali) { const k = kovaDegeri(x.t); if (k > sinir) enYeni.set(k, x.ad); }
    for (const ad of enYeni.values()) tut.add(ad);
  };
  const saatKovasi = t => Math.floor(t / SAAT), gunKovasi = t => Math.floor(t / GUN), haftaKovasi = t => Math.floor((t - HAFTA_KAYDIRMA) / HAFTA);
  kova(saatKovasi, saatKovasi(simdi) - saatlik);
  kova(gunKovasi, gunKovasi(simdi) - gunluk);
  kova(haftaKovasi, haftaKovasi(simdi) - haftalik);
  return tut;
}
