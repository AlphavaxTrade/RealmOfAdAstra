@echo off
rem Realm of Astra - SENARYO DUNYASI (yerel deneme, port 8081): hazir durumda hesaplarla (siradaki aday, daveti gelmis aday,
rem izin sorusu bekleyen, izinde, askida...) AYRI bir deneme dunyasi kurar. Asil deneme dunyaniza (8080) hic dokunmaz.
rem Oyun: http://localhost:8081/   Yonetici: http://localhost:8081/admin  (sifre: data\admin-token.txt)
rem Hesaplar ve ne denenecegi: docs\v2\SENARYO_REHBERI.md   Her calistirmada dunya BASTAN kurulur ("tazele").
rem Durdurmak: SENARYO-DUNYASI-DURDUR.bat
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 ( echo [HATA] Node.js bulunamadi. & pause & exit /b 1 )
call "%~dp0SENARYO-DUNYASI-DURDUR.bat" quiet
echo Oyun derleniyor (~30 sn)...
call npm run build >nul 2>&1
echo Senaryo dunyasi kuruluyor...
node scripts\senaryo\kur.mjs
if errorlevel 1 ( echo [HATA] Senaryo dunyasi kurulamadi. & pause & exit /b 1 )
if not exist data\admin-token.txt ( echo [HATA] data\admin-token.txt yok: once OYUN-SUNUCUSU-BASLAT.bat bir kez calistirilmali. & pause & exit /b 1 )
set "PORT=8081"
set "HOST=127.0.0.1"
set "DB_FILE=./data/senaryo.db"
set "TEST_MODE=1"
set "CHAIN_ENABLED=0"
set "PUBLIC_URL=http://localhost:8081"
set "GAME_WALLET_PRIVATE_KEY="
set "KASA_MASTER_KEY="
set "ADMIN_TOKEN_FILE=data\admin-token.txt"
start "Realm of AdAstra - SENARYO DUNYASI (8081) - kapatinca durur" /min node server\index.js
timeout /t 4 /nobreak >nul
start "" "http://localhost:8081/"
echo.
echo Senaryo dunyasi hazir: http://localhost:8081/   (hesap listesi yukarida, sifre hepsinde Deneme-2026)
timeout /t 8 >nul
endlocal
