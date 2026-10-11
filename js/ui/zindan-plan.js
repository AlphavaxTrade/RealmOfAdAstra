// Realm of AdAstra — Zindan haritasının planı: 6 kat x 3 canavar odası = 18 seviye, her katın taş levha yerleşimi.
// Saf veri ve saf işlevler (Phaser'a ve sayfaya dokunmaz); sahne js/dungeonScene.js, denetim tests/test_zindan_plan.mjs.
// Koordinatlar arka plan resmine göre ayarlanmıştır: px/py levhanın merkezi, bw/bh boyu (hepsi ekranın oranı, 0-1).
import { getFloorMonsters } from '../bestiary.js';

export const KAT_SAYISI = 6;
export const EN_UST_SEVIYE = 18;

// Levha satırı: aynı y'de üç oda
const ucOda = (xler, py, bw, bh) => xler.map((px) => ({ px, py, bw, bh }));
const ALT_YAN = ucOda([0.185, 0.500, 0.770], 0.952, 0.250, 0.085);
const ORTA_YAN = ucOda([0.180, 0.490, 0.775], 0.865, 0.250, 0.078);

export const KATLAR = [
  {
    kat: 1, baslik: '1. Kat: Kristal Mağarası & Goblin İni', rozet: '1. KAT (Lv.1 - 3)',
    doku: 'dungeon_tex_f1', dosya: 'assets/dungeon_map.jpg',
    odalar: ucOda([0.200, 0.520, 0.785], 0.720, 0.250, 0.085),
    gecitler: [{ px: 0.940, py: 0.945, bw: 0.115, bh: 0.085 }]
  },
  {
    kat: 2, baslik: '2. Kat: Kemik Mahzeni & İskelet Kriptosu', rozet: '2. KAT (Lv.4 - 6)',
    doku: 'dungeon_tex_f2', dosya: 'assets/dungeon_floor2.jpg',
    odalar: ALT_YAN, gecitler: [{ px: 0.940, py: 0.952, bw: 0.115, bh: 0.085 }]
  },
  {
    kat: 3, baslik: '3. Kat: Kadim Tapınak & Taş Golyat (ARA BOSS)', rozet: '3. KAT (Lv.7 - 9 ARA BOSS)',
    doku: 'dungeon_tex_f3', dosya: 'assets/dungeon_floor3.jpg',
    odalar: ORTA_YAN, gecitler: [{ px: 0.950, py: 0.970, bw: 0.098, bh: 0.060 }]
  },
  {
    kat: 4, baslik: '4. Kat: Lanetli Firavun Mezarı & Hayaletler', rozet: '4. KAT (Lv.10 - 12)',
    doku: 'dungeon_tex_f4', dosya: 'assets/dungeon_floor4.jpg',
    odalar: ALT_YAN, gecitler: [{ px: 0.940, py: 0.952, bw: 0.115, bh: 0.085 }]
  },
  {
    kat: 5, baslik: '5. Kat: Kaynayan Lav Çukuru & İblisler', rozet: '5. KAT (Lv.13 - 15)',
    doku: 'dungeon_tex_f5', dosya: 'assets/dungeon_floor5.jpg',
    odalar: ORTA_YAN,
    // Hem alttaki taş buton hem sağdaki lav kapısı 6. kata açılır
    gecitler: [{ px: 0.945, py: 0.865, bw: 0.115, bh: 0.085 }, { px: 0.955, py: 0.460, bw: 0.090, bh: 0.220 }]
  },
  {
    kat: 6, baslik: '6. Kat: Kıyamet Mabedi & BÜYÜK BOSS', rozet: '6. KAT (Lv.16 - 18 FİNAL)',
    doku: 'dungeon_tex_f6', dosya: 'assets/dungeon_floor6.jpg',
    odalar: ALT_YAN, gecitler: []   // son kat
  }
];

// Bir katın üç canavarı (bestiary'den) odalarıyla eşleşir
export function katCanavarlari(kat) {
  return getFloorMonsters(kat);
}

// Ekran oranından piksele
export function yerlestir(oge, genislik, yukseklik) {
  return { x: oge.px * genislik, y: oge.py * yukseklik, bw: oge.bw * genislik, bh: oge.bh * yukseklik };
}

// Oyuncunun ilerlemesi (açık seviye) ile bir odanın durumu
export function odaDurumu(seviye, ilerleme) {
  return { kilitli: ilerleme < seviye, yenildi: ilerleme > seviye, siradaki: ilerleme === seviye };
}

export function kilitMesaji(ilerleme, canavar) {
  return `🔒 Şu an Seviye ${ilerleme}'desiniz! [Seviye ${canavar.level}] ${canavar.name} bölümüne girmek için önce Seviye ${ilerleme} ve önceki bölümleri tamamlamalısınız.`;
}

// Levhanın üstüne yazılacak Türkçe etiket (dokunmatikte "üzerine gelince" ipucu olmadığı için bilgi levhanın kendisinde)
export function odaEtiketi(canavar, durum) {
  const boss = canavar.level === 9 || canavar.level === 18;
  const durumYazisi = durum.kilitli ? '🔒 Kilitli' : (durum.yenildi ? '✅ Yenildi · tekrar' : '⚔️ Savaşa gir');
  return `${boss ? '👑 ' : ''}Seviye ${canavar.level}\n${canavar.name}\n${durumYazisi}`;
}

export function odaIpucu(canavar, sira, durum, ilerleme) {
  return {
    baslik: `Oda ${sira + 1} — Seviye ${canavar.level}: ${canavar.name}`,
    renk: durum.siradaki ? '#fde047' : (durum.yenildi ? '#4ade80' : '#a8a29e'),
    alt: durum.kilitli ? `🔒 Kilitli (önce Seviye ${ilerleme} tamamlanmalı)` : (durum.siradaki ? '⚔️ Tıkla ve savaşa gir!' : '⚔️ Tamamlandı (tekrar savaş)')
  };
}
