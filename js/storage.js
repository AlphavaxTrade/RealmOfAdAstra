// Realm of AdAstra — kalıcı kayıt yardımcıları (localStorage)
// ---------------------------------------------------------------------------
// • Her başarılı yüklemede kaydın bir kopyası "<anahtar>__yedek" olarak saklanır (son sağlam kayıt).
// • Kayıt bozuksa (JSON okunamıyorsa) silinmez: "<anahtar>__bozuk" altına taşınır ve oyun yedekten açılır.
//   Önceden bozuk kayıt sessizce yok sayılıyor, oyun sıfır profille açılıp ilk kayıtta eskisinin üstüne yazıyordu.
// • Yazma hatası (tarayıcı depolama alanı dolu vb.) oyunu durdurmaz; arayüz oyuncuya haber verir.
// ---------------------------------------------------------------------------

export const BACKUP_SUFFIX = '__yedek';
export const CORRUPT_SUFFIX = '__bozuk';

const events = [];

function hasStorage() {
  return typeof localStorage !== 'undefined' && localStorage !== null;
}

function record(type, key, detail = '') {
  events.push({ type, key, detail, at: Date.now() });
}

// Arayüzün göstereceği kurtarma / yazma hatası olaylarını verir ve listeyi boşaltır
export function consumeStorageEvents() {
  return events.splice(0, events.length);
}

function parseObject(raw) {
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object') throw new Error('Kayıt bir nesne değil');
  return data;
}

// Döner: { data, source: 'main' | 'backup' | null, corrupt }
export function readJSON(key) {
  if (!hasStorage()) return { data: null, source: null, corrupt: false };
  const raw = localStorage.getItem(key);
  if (raw == null) return { data: null, source: null, corrupt: false };

  try {
    const data = parseObject(raw);
    safeSetRaw(key + BACKUP_SUFFIX, raw);
    return { data, source: 'main', corrupt: false };
  } catch (e) {
    // Bozuk kaydı kaybetme: incelenebilmesi için ayrı anahtara taşı
    safeSetRaw(key + CORRUPT_SUFFIX, raw);
    const backup = localStorage.getItem(key + BACKUP_SUFFIX);
    if (backup != null) {
      try {
        const data = parseObject(backup);
        record('recovered', key, e.message);
        return { data, source: 'backup', corrupt: true };
      } catch (_) { /* yedek de bozuk */ }
    }
    record('lost', key, e.message);
    return { data: null, source: null, corrupt: true };
  }
}

function safeSetRaw(key, raw) {
  try {
    localStorage.setItem(key, raw);
    return true;
  } catch (e) {
    record('write-failed', key, e && e.name ? e.name : String(e));
    return false;
  }
}

export function writeJSON(key, value) {
  if (!hasStorage()) return false;
  let raw;
  try {
    raw = JSON.stringify(value);
  } catch (e) {
    record('write-failed', key, e.message);
    return false;
  }
  return safeSetRaw(key, raw);
}

// Sıfırlama: ana kayıt ve yedeği birlikte silinir (bozuk kopya incelenmek üzere kalır)
export function removeJSON(key) {
  if (!hasStorage()) return;
  localStorage.removeItem(key);
  localStorage.removeItem(key + BACKUP_SUFFIX);
}
