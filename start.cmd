@echo off
setlocal

set "NODE_VERSION=20.12.2"
set "NODE_DIR=%CD%\.local\node"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip"
set "NODE_ZIP=.local\node.zip"
set "LOG_FILE=uma.log"

:: Clear log
echo Inizio avvio UMA > "%LOG_FILE%"

:: 1. Verifica node globale
where node >nul 2>&1
if %errorlevel%==0 (
  echo ✔ Node.js globale trovato >> "%LOG_FILE%"
  goto :CHECK_RUNNING
)

:: 🔧 Crea .local se non esiste
if not exist ".local" mkdir ".local"

:: 2. Se non esiste node locale, scarica
if not exist "%NODE_EXE%" (
  echo ❌ Node non trovato. Scarico Node.js locale >> "%LOG_FILE%"
  powershell -Command "Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%'" >> "%LOG_FILE%" 2>&1
  powershell -Command "Expand-Archive -Path '%NODE_ZIP%' -DestinationPath '.local'" >> "%LOG_FILE%" 2>&1
  move ".local\node-v%NODE_VERSION%-win-x64" "%NODE_DIR%" >nul 2>&1
  del "%NODE_ZIP%"
)
:: 3. Configura PATH locale
set "PATH=%NODE_DIR%;%NODE_DIR%\node_modules\.bin;%PATH%"
echo ✔ Node.js locale configurato >> "%LOG_FILE%"

:CHECK_RUNNING
:: 4. Verifica se porta 5173 è già usata
netstat -an | find ":5173" | find "LISTENING" >nul
if %errorlevel%==0 (
  echo ⚠ Server già in esecuzione su http://localhost:5173 >> "%LOG_FILE%"
  goto :BROWSER
)

:: 5. Avvia server
echo Avvio server... >> "%LOG_FILE%"
start "" /B cmd /C "npm run dev >> uma.log 2>&1"
ping 127.0.0.1 -n 3 >nul

:BROWSER
:: 6. Apri browser
start "" http://localhost:5173
echo ✔ Browser avviato su http://localhost:5173 >> "%LOG_FILE%"

endlocal
