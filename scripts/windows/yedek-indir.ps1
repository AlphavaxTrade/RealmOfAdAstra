# Oyun veritabanı yedeklerini sunucudan BU BİLGİSAYARA indirir (kurumsal A9: "sunucu kaybına karşı dışarı kopya"; karar 8 Ekim 2026).
# Neden böyle: bilgisayar sunucudan ÇEKER (sunucuda bu bilgisayara erişen hiçbir anahtar durmaz); yedekler zaten AES-256-GCM ile
# şifreli olduğundan buradaki kopya da güvende. Trade sitesinin 'AlphAvax Yedek' görevindeki düzenin aynısı (anahtar kasadan, bellekte).
# Akış: sunucudaki yeni yedekleri bul -> eksik olanları indir (en çok 6) -> sha256 doğrula -> saklama planına göre buda -> en yenisini
# Proton Drive klasörüne de kopyala (ikinci kopya, Proton uçtan uca şifreler). Sunucuda oyun henüz kurulu değilse sessizce atlar.
# Çalıştıran: 'Realm Yedek' zamanlanmış görevi (saatlik; scripts/windows/yedek-gorev-kur.ps1). Elle: powershell -File scripts\windows\yedek-indir.ps1
$ErrorActionPreference = 'Stop'
$hostName = 'ubuntu@50.17.123.38'
$uzak = '/srv/realm/yedek'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$kasaAc = Join-Path $repo '..\megalodon-live-deck\scripts\kasa-ac.ps1'
$git = 'C:\Program Files\Git\usr\bin'
$ssh = if (Test-Path "$git\ssh.exe") { "$git\ssh.exe" } else { 'ssh' }
$scp = if (Test-Path "$git\scp.exe") { "$git\scp.exe" } else { 'scp' }
$agent = if (Test-Path "$git\ssh-agent.exe") { "$git\ssh-agent.exe" } else { 'ssh-agent' }
$add = if (Test-Path "$git\ssh-add.exe") { "$git\ssh-add.exe" } else { 'ssh-add' }
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
$dir = Join-Path $env:USERPROFILE 'RealmYedek'; New-Item -ItemType Directory -Force $dir | Out-Null
$log = Join-Path $dir 'indirme.log'
$ad = '^realm-\d{8}-\d{6}\.db\.gz(\.enc)?$'
try {
  if (-not $node) { throw 'node bulunamadi (PATH)' }
  if (-not (Test-Path $kasaAc)) { throw "anahtar kasasi betigi yok: $kasaAc" }
  # sunucu anahtarı kasadan, yalnız bu çalıştırmanın ssh-agent'ına (diske yazılmaz)
  $ag = (& $agent -s) -join ' '
  $env:SSH_AUTH_SOCK = [regex]::Match($ag, 'SSH_AUTH_SOCK=([^;]+);').Groups[1].Value
  $env:SSH_AGENT_PID = [regex]::Match($ag, 'SSH_AGENT_PID=(\d+);').Groups[1].Value
  cmd /c "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$kasaAc`" | `"$add`" -q - 2>nul"
  if ($LASTEXITCODE -ne 0) { throw 'anahtar kasadan acilamadi' }

  # 1) Sunucudaki yedekler (klasör realm kullanıcısına ait ve kapalı: sudo ile listelenir)
  $liste = (& $ssh -o BatchMode=yes -o ConnectTimeout=20 $hostName "sudo ls -1 $uzak 2>/dev/null || echo __YOK__") -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  if ($liste -contains '__YOK__') { Add-Content $log "$(Get-Date -Format s) atlandi: sunucuda $uzak yok (oyun henuz kurulmamis)"; return }
  $uzaktakiler = $liste | Where-Object { $_ -match $ad } | Sort-Object -Descending
  if (-not $uzaktakiler) { Add-Content $log "$(Get-Date -Format s) atlandi: sunucuda henuz yedek dosyasi yok"; return }

  # 2) Eksik olanları indir (yeniden eskiye, en çok 6; manifest yanında). Dosya önce /tmp'ye kopyalanır (kaynak klasör kapalı), çekilir, silinir.
  $eksik = $uzaktakiler | Where-Object { -not (Test-Path (Join-Path $dir "$_.json")) } | Select-Object -First 6
  foreach ($n in $eksik) {
    foreach ($f in @($n, "$n.json")) {
      & $ssh -o BatchMode=yes $hostName "sudo install -m 600 -o ubuntu $uzak/$f /tmp/$f" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "sunucuda kopyalanamadi: $f" }
      & $scp -o BatchMode=yes "${hostName}:/tmp/$f" (Join-Path $dir $f)
      if ($LASTEXITCODE -ne 0) { throw "indirilemedi: $f" }
      & $ssh -o BatchMode=yes $hostName "rm -f /tmp/$f" | Out-Null
    }
    Add-Content $log "$(Get-Date -Format s) indirildi: $n"
  }

  # 3) Bütünlük: boyut + sha256 (yedeğin kendi manifestine karşı; anahtar gerekmez)
  $env:YEDEK_KLASORU = $dir
  $cikti = & $node (Join-Path $repo 'server\yedek\cli\dogrula.js') --son=3 2>&1
  if ($LASTEXITCODE -ne 0) { throw "indirilen yedek BOZUK: $($cikti -join ' | ')" }

  # 4) Saklama planı (saatlik 48 / günlük 14 / haftalık 8)
  $b = & $node (Join-Path $repo 'server\yedek\cli\buda.js') $dir 2>&1
  Add-Content $log "$(Get-Date -Format s) $($b -join ' ')"

  # 5) İkinci kopya: en yeni yedek Proton Drive klasörüne (uygulama yüklüyse; Proton uçtan uca şifreler)
  $pd = Get-ChildItem (Join-Path $env:USERPROFILE 'Proton Drive') -Directory -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'My files' } | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($pd) {
    $hedef = Join-Path $pd 'RealmYedek'; New-Item -ItemType Directory -Force $hedef | Out-Null
    $son = Get-ChildItem $dir -File | Where-Object { $_.Name -match $ad } | Sort-Object Name -Descending | Select-Object -First 1
    if ($son) {
      Copy-Item $son.FullName (Join-Path $hedef $son.Name) -Force; Copy-Item "$($son.FullName).json" (Join-Path $hedef "$($son.Name).json") -Force
      Get-ChildItem $hedef -File | Where-Object { $_.Name -match $ad } | Sort-Object Name -Descending | Select-Object -Skip 14 | ForEach-Object { Remove-Item $_.FullName, "$($_.FullName).json" -Force -ErrorAction SilentlyContinue }
    }
  } else { Add-Content $log "$(Get-Date -Format s) Proton Drive klasoru yok: ikinci kopya atlandi" }
} catch { Add-Content $log "$(Get-Date -Format s) HATA: $($_.Exception.Message)"; exit 1 }
finally { if ($env:SSH_AGENT_PID) { & $agent -k 2>$null | Out-Null } }
