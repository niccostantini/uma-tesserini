@echo off
setlocal

:: CONFIGURA VARIABILI
set NODE_VERSION=20.12.2
set NODE_DIR=.local\node
set NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-win-x64.zip
set NODE_ZIP=node-v%NODE_VERSION%-win-x64.zip

:: CREA CARTELLA .local SE NON ESISTE
if not exist ".local" (
  mkdir .local
)

:: SCARICA NODE.JS ZIP
echo Downloading Node.js v%NODE_VERSION%...
powershell -Command "Invoke-WebRequest -Uri %NODE_URL% -OutFile .local\%NODE_ZIP%"

:: ESTRAI ZIP
echo Extracting...
powershell -Command "Expand-Archive -Path .local\%NODE_ZIP% -DestinationPath .local -Force"

:: RINOMINA CARTELLA
move ".local\node-v%NODE_VERSION%-win-x64" ".local\node" >nul 2>&1

:: PULIZIA ZIP
del ".local\%NODE_ZIP%"

:: CONFIGURA PATH TEMPORANEO PER QUESTA SESSIONE
set PATH=%CD%\%NODE_DIR%;%CD%\%NODE_DIR%\node_modules\.bin;%PATH%

:: MOSTRA VERSIONE NODE E NPM
echo Node version:
node -v
echo NPM version:
npm -v

:: INSTALLA DIPENDENZE
echo Installing dependencies...
npm install

:: FATTO
echo.
echo ✅ Node.js installato localmente in %NODE_DIR%
echo ✅ Puoi ora eseguire:
echo     npm run dev
echo     npm run db:init
echo     npm run db:seed
echo.
echo ⚠️ Per usare Node anche nei prossimi terminali:
echo     SET PATH=%%CD%%\%NODE_DIR%;%%CD%%\%NODE_DIR%\node_modules\.bin;%%PATH%%
echo.
pause