// Realm of AdAstra sunucusu — parça havuzunun tek seferlik küçültülmesi (18 Ekim 2026, v1.63)
// ============================================================================
// Teçhizat parçası onarımda da harcanır hale geldi; eski havuz (4 M ASTRA, ~8,9 M parça) kullanımla fiyatı hiç oynatamıyordu. Havuz yeni
// tohum derinliğine (AMM_SEED_ASTRA.fragments) küçülür, FİYAT korunur; çıkan ASTRA kaybolmaz: yarısı Karnaval ödül havuzuna, yarısı
// geri alım kasasına girer. Bayrak sayesinde bir kez çalışır; yeni kurulan dünyada havuz zaten küçüktür (hiçbir şey taşınmaz).
const BAYRAK = 'world:parca_havuzu_v2';

export function parcaHavuzuGecisi({ db, ammMarket, treasury, log = null }) {
  if (db.kvGet(BAYRAK) === '1') return { yapildi: false, tasinan: 0 };
  const fazla = ammMarket.parcaHavuzunuKucult();
  let tasinan = 0;
  if (fazla > 0) {
    const yarim = Math.floor(fazla / 2 * 1000) / 1000;
    treasury.depositTo('carnival', yarim);
    treasury.depositTo('ammBuyback', fazla - yarim);
    tasinan = fazla;
  }
  db.kvSet(BAYRAK, '1');
  if (log && typeof log.info === 'function') log.info('parca havuzu kucultuldu', { tasinanAstra: Math.round(tasinan) });
  return { yapildi: true, tasinan };
}
