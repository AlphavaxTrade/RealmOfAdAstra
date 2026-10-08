@echo off
rem Realm of Astra - senaryo dunyasi sunucusunu (port 8081) durdurur. Asil deneme dunyasina (8080) dokunmaz.
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
if /i not "%~1"=="quiet" echo Senaryo dunyasi (8081) durduruldu.
