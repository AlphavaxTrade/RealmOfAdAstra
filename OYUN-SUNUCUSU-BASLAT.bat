@echo off
rem Realm of Astra - yerel DENEME oyun sunucusu (yonetici paneliyle) arka planda baslar, Windows acilisina eklenir.
rem Oyun: http://localhost:8080/   Yonetici: http://localhost:8080/admin  (sifre: data\admin-token.txt)
setlocal
cd /d "%~dp0"
set "ROOT=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
where node >nul 2>&1
if errorlevel 1 ( echo [HATA] Node.js bulunamadi. & pause & exit /b 1 )
wscript //nologo "%ROOT%scripts\windows\online-hidden.vbs"
> "%STARTUP%\RealmOfAstra-OyunSunucusu.vbs" echo CreateObject("WScript.Shell").Run "wscript //nologo ""%ROOT%scripts\windows\online-hidden.vbs""", 0, False
echo Sunucu baslatiliyor (ilk acilista oyun derlenir, ~30 sn)...
timeout /t 35 /nobreak >nul
start "" "http://localhost:8080/"
echo Oyun: http://localhost:8080/   Yonetici: http://localhost:8080/admin
echo Yonetici sifresi: data\admin-token.txt
timeout /t 8 >nul
endlocal
