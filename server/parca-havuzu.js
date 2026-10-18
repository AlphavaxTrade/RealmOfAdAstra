// Realm of AdAstra sunucusu — pazar havuzlarının tek seferlik düzenlenmesi (18 Ekim 2026, v1.63-v1.64)
// ============================================================================
// 1) Pandora kutusu ve Anahtar takas havuzları KALDIRILDI (kutu hiçbir yerde satılmaz; anahtar yalnız oyuncudan oyuncuya İlan Pazarı'nda).
//    Havuzlarda kayıtlı ASTRA kaybolmaz: yarısı Karnaval ödül havuzuna, yarısı geri alım kasasına girer.
// 2) Teçhizat parçası onarımda da harcanır hale geldi; eski havuz (4 M ASTRA, ~8,9 M parça) kullanımla fiyatı hiç oynatamıyordu. Havuz yeni
//    tohum derinliğine (AMM_SEED_ASTRA.fragments) küçülür, FİYAT korunur; çıkan ASTRA yine yarı yarıya aynı iki kasaya girer.
// Her adımın kendi bayrağı var: bir kez çalışır. Yeni kurulan dünyada havuzlar zaten yeni boyuttadır (hiçbir şey taşınmaz).
// SIRA ÖNEMLİ: kaldırılan havuzların kaydı ilk pazar kaydında silinir; 1. adım ondan önce okur.
const BAYRAK_KALDIRILAN = 'world:anahtar_kutu_havuzu_v1';
const BAYRAK_PARCA = 'world:parca_havuzu_v2';

function kasalaraBol(treasury, miktar) {
  if (!(miktar > 0)) return;
  const yarim = Math.floor(miktar / 2 * 1000) / 1000;
  treasury.depositTo('carnival', yarim);
  treasury.depositTo('ammBuyback', miktar - yarim);
}

export function parcaHavuzuGecisi({ db, ammMarket, treasury, log = null }) {
  let yapildi = false;
  let tasinan = 0;

  if (db.kvGet(BAYRAK_KALDIRILAN) !== '1') {
    const yetim = ammMarket.kaldirilanHavuzAstrasi();
    kasalaraBol(treasury, yetim);
    tasinan += yetim;
    ammMarket.savePools();                       // kayıtlı kutu/anahtar havuzları bu yazışta silinir
    db.kvSet(BAYRAK_KALDIRILAN, '1');
    yapildi = true;
  }
  if (db.kvGet(BAYRAK_PARCA) !== '1') {
    const fazla = ammMarket.parcaHavuzunuKucult();
    kasalaraBol(treasury, fazla);
    tasinan += fazla;
    db.kvSet(BAYRAK_PARCA, '1');
    yapildi = true;
  }
  if (yapildi && log && typeof log.info === 'function') log.info('pazar havuzlari duzenlendi', { tasinanAstra: Math.round(tasinan) });
  return { yapildi, tasinan };
}
