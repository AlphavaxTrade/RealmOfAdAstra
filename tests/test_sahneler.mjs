// Harita sahneleri: veri bütünlüğü (her bölge bir sahnede, kapılar çalışır, resimler var) ve kapı levhası kuralları.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const depo = new Map();
globalThis.localStorage = {
  getItem: k => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: k => { depo.delete(k); }
};
const { SAHNELER, KAPILAR, ANA_SAHNE, sahneBolgeleri, bolgeSahnesi, kapiDurumlari, kapiKimligi } = await import('../js/ui/sahneler.js');
const { TOWN_ZONES } = await import('../js/ui/harita-ortak.js');
const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Veri: konumlar resmin içinde, kimlikler sahne içinde tekil, her yerin yeri belli
{
  for (const [id, s] of Object.entries(SAHNELER)) {
    assert.ok(s.ad && s.resim && s.w > 0 && s.h > 0, `${id} sahnesinin adı ve resmi var`);
    assert.ok(s.merkez.x > 0 && s.merkez.x < 1 && s.merkez.y > 0 && s.merkez.y < 1, `${id} merkezi`);
    const bolgeler = sahneBolgeleri(id);
    assert.equal(bolgeler.length, s.yerler.length, `${id}: her yer bir bölgeye çözülür`);
    const kimlikler = new Set();
    for (const z of bolgeler) {
      assert.ok(!kimlikler.has(z.id), `${id}: tekil kimlik ${z.id}`);
      kimlikler.add(z.id);
      assert.ok(z.px > 0 && z.px < 1 && z.py > 0 && z.py < 1 && z.pr > 0 && z.pr < 0.25, `${id}/${z.id} konumu`);
      assert.ok(z.name && z.icon && z.sub && /^#[0-9a-f]{6}$/i.test(z.color), `${id}/${z.id} görünümü`);
    }
    // Aynı sahnede iki yer üst üste binmesin (dokunulacak yer belli olsun)
    for (let i = 0; i < bolgeler.length; i++) {
      for (let j = i + 1; j < bolgeler.length; j++) {
        const a = bolgeler[i]; const b = bolgeler[j];
        assert.ok(Math.hypot(a.px - b.px, a.py - b.py) > 0.06, `${id}: ${a.id} ile ${b.id} üst üste`);
      }
    }
    // Resim dosyası gerçekten var
    const dosya = path.join(kok, 'public', s.resim.split('?')[0]);
    assert.ok(fs.existsSync(dosya), `${id}: resim dosyası yok: ${dosya}`);
  }
  console.log(`✅ ${Object.keys(SAHNELER).length} sahne: konumlar, kimlikler, resim dosyaları`);
}

// Hiçbir oyun yeri kaybolmadı; her kapı ana haritadan açılır ve hedef sahnesi vardır
{
  const yerliler = new Set();
  for (const s of Object.values(SAHNELER)) for (const y of s.yerler) if (y.id) yerliler.add(y.id);
  for (const z of TOWN_ZONES) assert.ok(yerliler.has(z.id), `${z.id} hiçbir sahnede yok`);

  const anaKapilari = SAHNELER[ANA_SAHNE].yerler.filter((y) => y.gec).map((y) => y.gec);
  for (const hedef of Object.keys(KAPILAR)) {
    assert.ok(SAHNELER[hedef], `kapı hedefi sahne olmalı: ${hedef}`);
    assert.ok(anaKapilari.includes(hedef), `${hedef} ana haritadan açılmalı`);
  }
  for (const s of Object.values(SAHNELER)) for (const y of s.yerler) if (y.gec) assert.ok(KAPILAR[y.gec], `bilinmeyen kapı ${y.gec}`);
  console.log('✅ her bölge bir sahnede, her kapı ana haritadan açılıyor');
}

// Sahip kararları (21 Ekim 2026): kolezyum şehrin içinde; savaş alanı, zindan ve tarlalar ayrı sahneler
{
  assert.equal(bolgeSahnesi('colosseum', 'kisla'), 'sehir', 'kolezyum kışla sahnesinde değil, şehirde');
  assert.ok(!SAHNELER.kisla.yerler.some((y) => y.id === 'colosseum'));
  assert.ok(SAHNELER.sehir.yerler.some((y) => y.id === 'colosseum'));
  assert.equal(bolgeSahnesi('battlefield'), 'savas');
  assert.equal(bolgeSahnesi('dungeon'), 'zindan');
  for (const t of ['farm', 'herbgarden', 'warehouse']) assert.equal(bolgeSahnesi(t), 'tarla', `${t} tarlalarda`);
  for (const k of ['barracks', 'healer']) assert.equal(bolgeSahnesi(k), 'kisla', `${k} kışla bölgesinde`);
  for (const k of ['coalmine', 'mine', 'quarry', 'forest']) assert.equal(bolgeSahnesi(k), 'kaynak', `${k} madenlerde`);
  assert.equal(bolgeSahnesi('yok-boyle-bir-yer'), null);
  console.log('✅ yer dağılımı: kolezyum şehirde; savaş alanı, zindan, tarlalar ayrı sahne');
}

// Kapı levhaları: içindeki yerlerin durumundan türer
{
  const bos = (text = '', tone = '', locked = false) => ({ text, tone, locked });
  const d = {
    coalmine: bos('✅ Hazır · topla', 'ready'), mine: bos('⏳ 03:00 · %50', 'busy'), quarry: bos('Boşta · sefer gönder', 'idle'), forest: bos('✅ Hazır · topla', 'ready'),
    farm: bos('Boşta · sefer gönder', 'idle'), herbgarden: bos('Boşta · sefer gönder', 'idle'), warehouse: bos('Sv.1 · %10 dolu'),
    barracks: bos('2 asker · 1 yaralı', 'warn'), healer: bos(), battlefield: bos('Dünya Bossu'), dungeon: bos('Kat 1 · Sv.1'),
    carnival: bos('🎟️ Piyango kazancın hazır!', 'gift'), tavern: bos('🤖 Bot aktif · 10:00', 'ready'), market: bos('3 ASTRA'), colosseum: bos('Bugün 10 maç hakkı')
  };
  const k = kapiDurumlari(d);
  for (const hedef of Object.keys(KAPILAR)) assert.ok(k[kapiKimligi(hedef)], `${hedef} kapısının levhası var`);
  assert.equal(k.gec_kaynak.tone, 'ready');
  assert.match(k.gec_kaynak.text, /2 sefer hazır/);
  assert.equal(k.gec_tarla.tone, 'idle', 'tarlada hazır sefer yok');
  assert.equal(k.gec_kisla.tone, 'warn');
  assert.match(k.gec_kisla.text, /yaralı/);
  assert.equal(k.gec_sehir.tone, 'gift', 'piyango kazancı şehir kapısında görünür');
  assert.equal(k.gec_savas.text, 'Dünya Bossu');
  assert.equal(k.gec_zindan.text, 'Kat 1 · Sv.1');
  // Bot aktifken şehir "hazır" göstermemeli (bot sefer değil)
  const d2 = { ...d, carnival: bos('Çark · 0 bilet') };
  assert.notEqual(kapiDurumlari(d2).gec_sehir.tone, 'ready');
  // Sefer sürüyorsa
  const d3 = { ...d, coalmine: bos('⏳ 01:00 · %10', 'busy'), forest: bos('⏳ 01:00 · %10', 'busy') };
  assert.match(kapiDurumlari(d3).gec_kaynak.text, /3 sefer sürüyor/);
  // Hepsi kilitliyse kapı kilitli
  const kilit = { savas: bos('🔒 Zindanda ilk zaferinden sonra', 'locked', true) };
  const d4 = { ...d, battlefield: kilit.savas };
  assert.equal(kapiDurumlari(d4).gec_savas.locked, true);
  assert.equal(kapiDurumlari(d4).gec_kisla.locked, false);
  assert.equal(JSON.stringify(k).includes('undefined'), false);
  console.log('✅ kapı levhaları (hazır sefer, yaralı asker, hediye, kilit)');
}
