# Fuji (deneme ağı) sözleşme adresleri — 14 Ekim 2026

Ağ: Avalanche Fuji (zincir 43113). **Yalnız deneme**: sahte ASTRA, gerçek değer yok. Anahtarlar `secrets/` klasöründedir (git'e girmez).

| Ne | Adres |
|---|---|
| Sahte ASTRA (MockToken) | `0x5C5d67923fC718b0CE6858d8FC649cb4d5784e5C` |
| RealmPayments (ödeme) | `0x3527f8902F6914c6C32cE428c7A9786aDBFefBc6` |
| RealmRates (oranlar) | `0x61d4fE7DDec87527CB19A933d12397cfa497d0e9` |
| OyunKasasi (kasa) | `0x9f1e26cD8233750f5268425C6B7E30Dd724F3558` |
| Yükleyen ve sahip (test) | `0x08Dd5dF5e63C94348243F9708e15eeEcBd421d81` |
| Dağıtıcı = oyun cüzdanı (test) | `0x46D5c5B3457EEACb433f57Fb886FB7D3B0F4080A` |
| Bekçi (test) | `0xC1c60E33570B50447CA1bC51B10e54FC47d3f2eB` |
| Yapımcı cüzdanı | `0x58DBCF66bdd7BfA9da98aDba1965b3794321087C` |

Kasa ayarı: günlük %5, tek ödeme %2, 24 saat ayar gecikmesi, "yeni kasaya geçiş" 7 gün.

Zincirde denenenler (14 Ekim 2026): yatırma (10.000), dağıtıcıyla oyuncu ödemesi, tek ödeme tavanını aşan tutarın reddi, bekçinin durdurması ve durmuşken ödemenin reddi, sahibin devam ettirmesi, yeni kasaya geçiş önerisi ve bekçinin iptali.

Sunucu ayarı (kasa modunu denemek için): `VAULT_CONTRACT`, `PAYMENTS_CONTRACT`, `RATES_CONTRACT`, `TOKEN_ADDRESS`, `CHAIN_ID=43113`.
Gerçek ağda sahip = donanım cüzdanı, bekçi = ayrı soğuk cüzdan olmalı; bu test adresleri gerçek ağda kullanılmaz.
