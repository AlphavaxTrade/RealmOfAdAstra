// Realm of AdAstra — Şans çarkı: tuval çizimi, dönüş açısı hesabı ve dönüş canlandırması.
// Açı hesabı saf işlevlerdedir (tests/test_cark_cizim.mjs); canlandırma yalnız verilen tuval ve ibre öğelerine dokunur.

const RENKLER = [
  '#7c3aed', '#059669', '#d97706', '#dc2626', '#2563eb', '#db2777', '#0891b2', '#4f46e5', '#ca8a04',
  '#16a34a', '#9333ea', '#e11d48', '#0284c7', '#ea580c', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4'
];

export const TUVAL_BOYUTU = 460;
export const IBRE_ACISI = 270;        // 12 yönü: tuval koordinatında -90° = 270°
export const DONUS_SURESI = 4200;     // ms

// Kazanan dilimin ibrenin altında durması için tuvalin varacağı açı (derece).
// simdiki: tuvalin şu anki açısı; tur: eklenecek tam tur sayısı. Sonuç her zaman simdiki + tur*360 + [0, 360).
export function hedefDerece({ dilimSayisi, kazananSira, simdiki = 0, tur = 5 }) {
  const dilimAcisi = 360 / dilimSayisi;
  const merkez = (kazananSira + 0.5) * dilimAcisi;
  const hedef = (((IBRE_ACISI - merkez) % 360) + 360) % 360;
  const bugun = (((simdiki % 360) + 360) % 360);
  let fark = hedef - bugun;
  if (fark < 0) fark += 360;
  return simdiki + tur * 360 + fark;
}

// Tuval verilen açıdayken ibrenin gösterdiği dilimin sırası
export function ibredekiDilim(derece, dilimSayisi) {
  const dilimAcisi = 360 / dilimSayisi;
  const norm = ((((IBRE_ACISI - derece) % 360) + 360) % 360);
  return Math.floor(norm / dilimAcisi) % dilimSayisi;
}

const yavaslat = (t) => 1 - Math.pow(1 - t, 3);

// dilimler: [{ icon, etiket }]
export function ciz(tuval, dilimler) {
  const g = tuval && tuval.getContext && tuval.getContext('2d');
  if (!g || !dilimler.length) return;
  if (!tuval.width) tuval.width = TUVAL_BOYUTU;
  if (!tuval.height) tuval.height = TUVAL_BOYUTU;
  const cx = tuval.width / 2;
  const cy = tuval.height / 2;
  const yaricap = cx - 12;
  const dilimAcisi = (2 * Math.PI) / dilimler.length;
  g.clearRect(0, 0, tuval.width, tuval.height);

  // Dış halka
  g.save();
  g.beginPath();
  g.arc(cx, cy, yaricap + 8, 0, 2 * Math.PI);
  g.fillStyle = '#1c1328';
  g.fill();
  g.lineWidth = 7;
  const halka = g.createRadialGradient(cx, cy, yaricap, cx, cy, yaricap + 8);
  halka.addColorStop(0, '#f59e0b');
  halka.addColorStop(0.5, '#fef08a');
  halka.addColorStop(1, '#b45309');
  g.strokeStyle = halka;
  g.stroke();
  g.restore();

  // Dilimler, simgeler ve kısa adlar
  dilimler.forEach((d, i) => {
    const bas = i * dilimAcisi;
    g.save();
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, yaricap, bas, bas + dilimAcisi);
    g.closePath();
    g.fillStyle = RENKLER[i % RENKLER.length];
    g.fill();
    const golge = g.createRadialGradient(cx, cy, 10, cx, cy, yaricap);
    golge.addColorStop(0, 'rgba(0,0,0,0.5)');
    golge.addColorStop(0.5, 'rgba(0,0,0,0.15)');
    golge.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = golge;
    g.fill();
    g.strokeStyle = 'rgba(254, 240, 138, 0.45)';
    g.lineWidth = 1.5;
    g.stroke();
    g.restore();

    g.save();
    g.translate(cx, cy);
    g.rotate(bas + dilimAcisi / 2);
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.font = '16px "Segoe UI Emoji", sans-serif';
    g.fillText(d.icon || '🎁', yaricap - 12, 0);
    g.font = 'bold 9.5px "Outfit", "Segoe UI", sans-serif';
    g.fillStyle = '#ffffff';
    g.shadowColor = 'rgba(0,0,0,0.9)';
    g.shadowBlur = 3;
    g.fillText(d.etiket || '', yaricap - 34, 0);
    g.restore();
  });

  // Çivi başları
  for (let i = 0; i < dilimler.length; i++) {
    const a = i * dilimAcisi;
    g.save();
    g.beginPath();
    g.arc(cx + Math.cos(a) * (yaricap + 2), cy + Math.sin(a) * (yaricap + 2), 3.5, 0, 2 * Math.PI);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = '#eab308';
    g.stroke();
    g.restore();
  }

  // Göbek
  g.save();
  g.beginPath();
  g.arc(cx, cy, 32, 0, 2 * Math.PI);
  const gobek = g.createRadialGradient(cx, cy, 5, cx, cy, 32);
  gobek.addColorStop(0, '#fef08a');
  gobek.addColorStop(0.7, '#eab308');
  gobek.addColorStop(1, '#78350f');
  g.fillStyle = gobek;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = '#fde047';
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, 22, 0, 2 * Math.PI);
  g.fillStyle = '#3b0764';
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = '#c084fc';
  g.stroke();
  g.font = '16px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('👑', cx, cy);
  g.restore();
}

// Tuvali açıya çevirir (CSS dönüşü; çizim yeniden yapılmaz)
export function ayarla(tuval, derece) {
  if (tuval) tuval.style.transform = `rotate(${derece}deg)`;
}

// Çarkı baslangic → hedef açıya döndürür. Her karede tuval kimlikle yeniden bulunur: panel yeniden çizilse bile
// dönüş sürer, panel kapanırsa dönüş biter. Dönen son açıyı döndürür; kare başına geri çağrılar: kare(derece)
export function don({ tuvalKimligi, ibreKimligi, baslangic, hedef, sure = DONUS_SURESI, dilimSayisi, kare }) {
  return new Promise((bitti) => {
    const t0 = performance.now();
    let sonDilim = -1;
    function adim(simdi) {
      const tuval = document.getElementById(tuvalKimligi);
      if (!tuval) { bitti(hedef); return; }
      const ilerleme = sure > 0 ? Math.min(1, (simdi - t0) / sure) : 1;
      const derece = baslangic + (hedef - baslangic) * yavaslat(ilerleme);
      ayarla(tuval, derece);
      if (kare) kare(derece);

      // İbre her dilim geçişinde küçük bir çıt hareketi yapar
      const ibre = ibreKimligi ? document.getElementById(ibreKimligi) : null;
      const dilim = ibredekiDilim(derece, dilimSayisi);
      if (ibre && dilim !== sonDilim && ilerleme < 1) {
        sonDilim = dilim;
        ibre.classList.add('is-cit');
        setTimeout(() => ibre.classList.remove('is-cit'), 60);
      }
      if (ilerleme < 1) requestAnimationFrame(adim);
      else bitti(hedef);
    }
    requestAnimationFrame(adim);
  });
}

// Çarkın dürüst ortalama dönüşü (bot hariç; 3 bilet parçası = 1 bedava çevirme hesaba katılır) ve bedelini geri alma şansı.
// bedel: ödül tablosundaki değerlerin ölçüldüğü çevirme bedeli (config WHEEL_COST_ADA).
export function donusIstatistigi(dilimler, bedel) {
  const toplam = dilimler.reduce((s, r) => s + (r.weight || 0), 0) || 1;
  // Bilet parçası (3 = 1 çevirme) ve piyango bileti bedava çevirmedir: ödemeleri o çevirmenin ödülünden gelir
  const bedava = dilimler.reduce((s, r) => s + (r.type === 'ticket_shard' ? r.weight / toplam / 3 : (r.type === 'lottery_ticket' ? r.weight / toplam : 0)), 0);
  const beklenen = dilimler
    .filter((r) => r.type !== 'ticket_shard' && r.type !== 'lottery_ticket' && r.type !== 'bot_free')
    .reduce((s, r) => s + (r.weight / toplam) * (r.valAda || 0), 0);
  const donus = beklenen / (1 - bedava) / (bedel || 1) * 100;
  const geri = dilimler
    .filter((r) => ((r.valAda || 0) >= (bedel || 1) && r.type !== 'bot_free') || r.type === 'lottery_ticket')
    .reduce((s, r) => s + r.weight / toplam, 0) * 100;
  return { donus: Math.round(donus), geri: Math.round(geri) };
}
