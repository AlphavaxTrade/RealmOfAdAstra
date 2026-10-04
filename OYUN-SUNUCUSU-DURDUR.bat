@echo off
rem Realm of Astra - yerel deneme oyun sunucusunu durdurur ve otomatik baslatmayi kapatir.
setlocal
cd /d "%~dp0"
set "PIDFILE=%~dp0logs\online-server.pid"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%PIDFILE%" ( set /p WPID=<"%PIDFILE%" )
if defined WPID taskkill /PID %WPID% /T /F >nul 2>&1
del "%PIDFILE%" >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do taskkill /PID %%a /T /F >nul 2>&1
if exist "%STARTUP%\RealmOfAstra-OyunSunucusu.vbs" del "%STARTUP%\RealmOfAstra-OyunSunucusu.vbs"
echo Oyun sunucusu durduruldu ve otomatik baslatma kapatildi.
timeout /t 5 >nul
endlocal
