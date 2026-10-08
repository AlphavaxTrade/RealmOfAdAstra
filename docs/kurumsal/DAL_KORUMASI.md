# `main` dalı koruması (kurumsal A8.6) — SİZİN çalıştıracağınız komutlar

GitHub ayarını değiştirmek benim yetkimde değil (ve geri alması zor bir dış işlem); bu yüzden hazır komut veriyorum. Amaç: `main`'e CI geçmeden, başkası (ya da ben) bakmadan hiçbir şey girmesin; geçmiş yeniden yazılamasın, dal silinemesin.

## Ön koşullar
- **DOĞRULANDI (8 Ekim 2026, `gh api` ile):** depo `AlphavaxTrade/RealmOfAdAstra`, sahibi bir **Organization**, **gizli (private)**, organizasyon planı **free**. Bu planda GitHub dal korumasını gizli depoda **uygulatmıyor**: `GET .../branches/main/protection` → `403 "Upgrade to GitHub Pro or make this repository public to enable this feature."`. Yani aşağıdaki komut şu an **çalışmaz**. Seçenekler: (a) organizasyonu **GitHub Team** planına yükseltmek (ücretli, kullanıcı başına aylık); (b) depoyu açık yapmak (kod ve geçmiş herkese görünür olur: **önermem**). Yükseltene dek koruma yoktur; tek güvence yerel commit kancası (`npm run hook-kur`) ve CI'ın kırmızı olmasıdır, ikisi de `main`'e doğrudan itmeyi engellemez.
- `gh` (GitHub CLI) bu makinede `C:\Users\AlphAvax\tools\gh\bin\gh.exe` konumunda ve `blockchainary` hesabıyla giriş yapılı (depoda yönetici yetkisi var).
- Önce `.github/workflows/ci.yml` en az bir kez çalışmış olmalı (zorunlu denetim adları GitHub'a ilk koşuda tanıtılır).

## 1. Kural gövdesi
`kural.json` olarak kaydedin (zorunlu denetim adları CI iş adlarıyla birebir aynıdır; bunu `tests/test_ci_dosyalari.mjs` korur):

```json
{
  "required_status_checks": { "strict": true, "contexts": ["kalite", "test", "derleme", "guvenlik", "imaj"] },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
```

## 2. Uygula
```bash
gh api -X PUT repos/alphavaxtrade/RealmOfAdAstra/branches/main/protection --input kural.json
```

## 3. Doğrula / geri al
```bash
gh api repos/alphavaxtrade/RealmOfAdAstra/branches/main/protection        # kural görünüyor mu
gh api -X DELETE repos/alphavaxtrade/RealmOfAdAstra/branches/main/protection   # kaldır (yanlış kurulduysa)
```

## Bilinmesi gerekenler
- **Tek kişilik ekip:** `required_approving_review_count: 1` + `enforce_admins: true` kendi PR'ınızı kendiniz onaylayamamanız demektir (GitHub buna izin vermez). Tek başınıza çalışıyorsanız sayıyı `0` yapın (CI zorunlu kalır, onay istenmez) ya da ikinci bir hesap ekleyin. Kural gövdesinde bu tek satırı değiştirmek yeter.
- `require_code_owner_reviews` için `.github/CODEOWNERS` içindeki sahip adı gerçek bir kullanıcı ya da takım olmalı. Dosyada `@blockchainary` yazılı (gh ile doğrulanan yönetici hesabı). Tek kişilik ekipte kendi PR'ınızı kendiniz onaylayamayacağınız için kod sahibi incelemesini ancak ikinci bir hesap eklenince açın.
- `kurumsal` dalı bu kuralın dışındadır (çalışma dalı); `main`'e birleştirme PR ile olur.
- `yayin.yml` iş akışı yalnız `main` dalından imaj yayınlar; yani koruma açıkken yayın = onaylı, CI'ı geçmiş kod.
- Bu kural hiçbir şeyi sunucuya göndermez; canlıya alma `docs/DEPLOY.md` adımlarıyla elle yapılır.
