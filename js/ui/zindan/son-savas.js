// Realm of AdAstra — son zindan savaşının hatırası (oturum boyunca): hangi seviye, hangi askerlerle.
// "Aynı savaşı tekrarla" düğmeleri bunu okur; savaşa hazırlık ekranı savaş başlarken yazar.
export const sonSavas = { level: null, secili: [] };

export function sonSavasiYaz(level, secili) {
  sonSavas.level = level;
  sonSavas.secili = [...(secili || [])];
}
