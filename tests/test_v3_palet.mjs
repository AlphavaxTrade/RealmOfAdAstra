// "Ara ve git" paleti: komut listesi hub'dan gelir, süzme sırası ve klavye kısayolu hedefleri.
import assert from 'node:assert/strict';
import { komutListesi, komutFiltrele, kisayolHedefi } from '../js/ui/v3/palet.js';
import { HUB, SEKMELER } from '../js/ui/v3/hub.js';
import { KISAYOLLAR } from '../js/ui/v3/ayarlar.js';

// Liste: hub'daki her öğe, "Ara ve git"in kendisi ve (test sürümü yoksa) test laboratuvarı hariç
{
  const liste = komutListesi();
  const hubTum = SEKMELER.flatMap((s) => (HUB[s.id] ? HUB[s.id].ogeler : []));
  const beklenen = hubTum.filter((o) => o.k !== 'komut' && !o.yalnizTest).map((o) => o.k);
  assert.deepEqual(liste.map((k) => k.id), beklenen);
  assert.ok(!liste.some((k) => k.id === 'komut' || k.id === 'test'));
  assert.ok(komutListesi({ testMenusuVar: true }).some((k) => k.id === 'test'), 'test sürümünde laboratuvar da aranır');
  const kimlikler = liste.map((k) => k.id);
  assert.equal(new Set(kimlikler).size, kimlikler.length, 'komut kimlikleri tekil');
  for (const k of liste) { assert.ok(k.ad && k.simge && k.kategori && k.aciklama, `${k.id} alanları dolu`); }
}

// Kilitli öğenin açıklaması kilit nedenidir
{
  const liste = komutListesi({ kilit: (k) => (k === 'tavern' ? { reason: 'Seviye 3 gerekir' } : null) });
  const t = liste.find((k) => k.id === 'taverna');
  assert.equal(t.kilitli, true);
  assert.equal(t.aciklama, 'Seviye 3 gerekir');
  assert.equal(liste.find((k) => k.id === 'silo').kilitli, false);
}

// Süzme: boş sorgu hepsi; Türkçe büyük/küçük harf; ada başlayanlar önce; bölüm ve açıklamada da aranır
{
  const liste = komutListesi();
  assert.equal(komutFiltrele(liste, '').length, liste.length);
  assert.equal(komutFiltrele(liste, '   ').length, liste.length);
  const hazine = komutFiltrele(liste, 'HAZİNE');
  assert.ok(hazine.length > 0 && hazine[0].id === 'hazine', 'İ harfi doğru küçülür, ada başlayan öne gelir');
  const savas = komutFiltrele(liste, 'savaş');
  assert.ok(savas.some((k) => k.id === 'kisla') && savas.some((k) => k.id === 'zindan'), 'bölüm adıyla bulunur');
  assert.equal(komutFiltrele(liste, 'zzzzqx').length, 0);
  // Birden çok sözcük hepsini içermeli
  const iki = komutFiltrele(liste, 'ordun teçhizat');
  assert.deepEqual(iki.map((k) => k.id), ['kisla']);
  // Girdi listesi değişmez
  assert.equal(liste.length, komutListesi().length);
}

// Kısayollar
{
  const t = (tus, o) => kisayolHedefi(tus, o);
  assert.deepEqual(t('k', { ctrl: true }), { palet: true });
  assert.deepEqual(t('K', { meta: true, yaziAlani: true }), { palet: true }, 'Ctrl+K yazı alanında da çalışır');
  assert.deepEqual(t('Tab'), { git: 'merkez' });
  assert.deepEqual(t('4'), { git: 'kisla' });
  assert.deepEqual(t('b'), { git: 'kisla' });
  assert.deepEqual(t('M'), { git: 'pazar' });
  assert.deepEqual(t('7'), { git: 'kolezyum' });
  assert.deepEqual(t('e'), { git: 'profil' });
  assert.deepEqual(t('K'), { git: 'kotalar' });
  assert.deepEqual(t('1'), { kaynak: 'wood' });
  assert.deepEqual(t('i'), { kaynak: 'iron' });
  assert.deepEqual(t('3'), { kaynak: 'wheat' });
  assert.deepEqual(t('Escape'), { kapat: true });
  assert.equal(t('s', { yaziAlani: true }), null, 'yazı alanında tek tuş çalışmaz');
  assert.equal(t('Escape', { yaziAlani: true }), null);
  assert.equal(t('s', { ctrl: true }), null, 'Ctrl+S tarayıcıya bırakılır');
  assert.equal(t('4', { alt: true }), null);
  assert.equal(t('x'), null);
  assert.equal(t(undefined), null);
  // Her hedef bir hub öğesine çıkar
  const hubAnahtarlari = new Set(SEKMELER.flatMap((s) => (HUB[s.id] ? HUB[s.id].ogeler : [])).map((o) => o.k));
  for (const tus of ['Tab', '4', '5', '6', '7', 'E', 'K']) assert.ok(hubAnahtarlari.has(t(tus).git), `${tus} → hub öğesi`);
}

// Ayarlar ekranındaki kısayol listesi Ctrl+K ve Tab'ı anlatır
assert.ok(KISAYOLLAR.some(([tus]) => tus === 'Ctrl + K') && KISAYOLLAR.some(([tus]) => tus === 'Tab'));
console.log('✅ v3 palet: komut listesi, süzme, kısayollar');
