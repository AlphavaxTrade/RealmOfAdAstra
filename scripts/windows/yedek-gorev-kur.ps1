# 'Realm Yedek' zamanlanmış görevini kurar (tekrar çalıştırmak zararsız: görev yenilenir). Saatte bir scripts\windows\yedek-indir.ps1 çalışır;
# bilgisayar kapalıysa açılınca kaçırılan çalışma hemen yapılır. Kaldırmak: Unregister-ScheduledTask -TaskName 'Realm Yedek' -Confirm:$false
$ErrorActionPreference = 'Stop'
$betik = (Resolve-Path (Join-Path $PSScriptRoot 'yedek-indir.ps1')).Path
$eylem = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$betik`""
$tetik = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(10) -RepetitionInterval (New-TimeSpan -Hours 1)
$ayar = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName 'Realm Yedek' -Action $eylem -Trigger $tetik -Settings $ayar -Description 'Oyun veritabani yedeklerini sunucudan bu bilgisayara indirir (saatlik, son 48 saat + 14 gun + 8 hafta)' -Force | Out-Null
Get-ScheduledTask -TaskName 'Realm Yedek' | Select-Object TaskName, State | Format-Table -AutoSize
