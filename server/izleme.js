// İsteğe bağlı hata izleme (APM) kancası (kurumsal A7.9). Varsayılan KAPALI ve bağımlılıksız: SENTRY_DSN tanımlıysa ve `@sentry/node`
// kuruluysa hatalar oraya da iletilir. Paket repo bağımlılığı DEĞİLDİR (Aşama 1'de üretim kurulumu küçük tutuldu); kullanmak isteyen
// sunucuda `npm i @sentry/node` yapar. Paket yoksa yalnız uyarılır; bu kanca hiçbir koşulda sunucuyu düşürmez.
export async function izlemeKur({ dsn = '', surum, ortam, log = console, yukle = () => import('@sentry/node') } = {}) {
  const kapali = { acik: false, yakala() { /* kapalı */ }, async bosalt() { /* kapalı */ } };
  if (!dsn) return kapali;
  let sdk;
  try {
    const mod = await yukle();
    sdk = mod?.default?.init ? mod.default : mod;
    sdk.init({ dsn, release: surum, environment: ortam, sendDefaultPii: false, tracesSampleRate: 0 });   // kişisel veri ve performans izi gönderilmez
  } catch (err) {
    log.warn('SENTRY_DSN tanımlı ama @sentry/node yüklenemedi (hata izleme KAPALI; kurmak için: npm i @sentry/node):', err.code || err.message);
    return kapali;
  }
  log.info('Hata izleme açık (Sentry)');
  return {
    acik: true,
    yakala(err, baglam) {
      try { sdk.captureException(err, baglam ? { extra: baglam } : undefined); } catch (e) { log.warn('Hata izleme iletemedi:', e.message); }
    },
    async bosalt(ms = 2000) { try { await sdk.flush?.(ms); } catch { /* kapanışta iletilemeyen hata sunucuyu geciktirmez */ } }
  };
}
