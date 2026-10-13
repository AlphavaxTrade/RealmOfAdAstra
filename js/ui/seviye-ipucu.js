// Realm of AdAstra — hesap seviyesi ekranı: silo bedeli tutamıyorsa ipucu verisi (saf; tests/test_denetim_2026_10_arayuz.mjs).
// Kural oyunda (gameState.getNextLevelRequirement: costs, uncappedCosts, siloLevelNeeded); burada hesap tekrarlanmaz,
// yalnız oyunun söylediği değerlerden "hangi kalem silodan büyük, ham bedel neydi" listesi çıkarılır.

/**
 * @param {{costs?: object, uncappedCosts?: object, siloLevelNeeded?: number|null}} req   getNextLevelRequirement() sonucu
 * @param {number} siloSeviye   state.warehouseLevel
 * @param {object} kapasite     getWarehouseCapacity() (kalem başına tavan; null = sınırsız)
 * @returns {{siloYetmiyor: boolean, hedefSeviye: number|null, sigmayan: string[], kirpilan: {k: string, ham: number, bedel: number}[]}}
 */
export function seviyeSiloIpucu(req, siloSeviye, kapasite) {
  const costs = (req && req.costs) || {};
  const ham = (req && req.uncappedCosts) || {};
  const kap = kapasite || {};
  const sigmayan = Object.keys(costs).filter((k) => kap[k] != null && (Number(costs[k]) || 0) > Number(kap[k]));
  const gerek = req && req.siloLevelNeeded != null ? Number(req.siloLevelNeeded) : null;
  const kirpilan = Object.keys(ham)
    .filter((k) => (Number(ham[k]) || 0) > (Number(costs[k]) || 0))
    .map((k) => ({ k, ham: Number(ham[k]), bedel: Number(costs[k]) || 0 }));
  const seviyeYetmiyor = gerek != null && (Number(siloSeviye) || 1) < gerek;
  return {
    siloYetmiyor: sigmayan.length > 0 || seviyeYetmiyor,
    hedefSeviye: gerek,
    sigmayan,
    kirpilan
  };
}
