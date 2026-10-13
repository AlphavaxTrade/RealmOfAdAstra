// Realm of AdAstra — GameStateManager yöntemleri: Fatih Ödülü (18. kat bossunu ilk kez yenene)
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
//
// Karar (30 Eylül 2026, uygulama 13 Ekim 2026): asker ve teçhizata harcanan ASTRA, zindanın normal ödülleriyle yol boyunca
// geri kazanılır; 18. katın bossu ilk kez yenilince KALAN fark Fatih kasasından ödenir:
//     Fatih Ödülü = en çok referans ordu bedeli (18 askerin toplam fiyatı) kadar, (orduya harcanan − zindandan kazanılan)
// Böylece oyuncu orduya harcadığının tamamını geri alır ama kasa sınırsız boşalmaz. Her hesap bir kez alır; kasada para
// yoksa ya da bütçe doluysa kısmen ödenir ve ödenen miktar kaydedilir. Sayaçlar yaşam boyu birikir (hesap sıfırlanınca sıfırlanır).
import { treasury } from '../treasury.js';
import { round3 } from './ortak.js';

const FATIH_KATI = 18;

export const fatihYontemleri = {
  _fatih() {
    const s = this.state;
    if (!s.fatih || typeof s.fatih !== 'object') s.fatih = { harcanan: 0, kazanilan: 0, alindi: false, odul: 0, at: 0 };
    return s.fatih;
  },

  // Asker satın alma ve teçhizat dövme / yükseltme / onarım gibi orduya giden ASTRA harcaması
  _orduHarcamasiYaz(ada) {
    const v = Number(ada) || 0;
    if (v > 0) { const f = this._fatih(); f.harcanan = round3((Number(f.harcanan) || 0) + v); }
  },

  // Zindan savaşlarından ASTRA olarak gelen ödüller (yol boyu geri kazanım)
  _zindanKazanciYaz(ada) {
    const v = Number(ada) || 0;
    if (v > 0) { const f = this._fatih(); f.kazanilan = round3((Number(f.kazanilan) || 0) + v); }
  },

  // Referans ordu bedeli: 18 askerin toplam fiyatı (bugünkü fiyat çarpanıyla)
  getFatihTavani() {
    let toplam = 0;
    for (let n = 1; n <= FATIH_KATI; n++) toplam += this.getSoldierCost(n);
    return round3(toplam);
  },

  getFatihOduluBilgisi() {
    const f = this._fatih();
    const harcanan = Number(f.harcanan) || 0;
    const kazanilan = Number(f.kazanilan) || 0;
    const tavan = this.getFatihTavani();
    const net = Math.max(0, harcanan - kazanilan);
    return {
      alindi: !!f.alindi, alinan: Number(f.odul) || 0,
      harcanan, kazanilan, net, tavan,
      beklenen: round3(Math.min(net, tavan)),
      kasa: Math.round(treasury.getPool('fatih')),
      kat: FATIH_KATI
    };
  },

  // 18. kat bossu yenildiğinde (zindan savaşı sonucu işlenirken) çağrılır; ilk kez ise ödülü verir
  _fatihOduluVer() {
    const f = this._fatih();
    if (f.alindi) return null;
    const bilgi = this.getFatihOduluBilgisi();
    const istenen = Math.floor(bilgi.beklenen);
    let odenen = 0;
    if (istenen > 0) {
      const cekim = treasury.withdrawWhole('fatih', istenen);
      odenen = cekim.granted || 0;
      if (odenen > 0) {
        this.state.adAstraBalance = round3((Number(this.state.adAstraBalance) || 0) + odenen);
        this._onAdaEarned(odenen);
      }
    }
    f.alindi = true;
    f.odul = odenen;
    f.at = this._now();
    return { odul: odenen, istenen, harcanan: bilgi.harcanan, kazanilan: bilgi.kazanilan, tavan: bilgi.tavan };
  }
};
