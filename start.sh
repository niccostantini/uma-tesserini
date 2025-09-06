#!/bin/bash
set -e
NODE_VERSION=20.12.2
NODE_DIR=".local/node"
NODE_BIN="$NODE_DIR/bin"
NODE_EXE="$NODE_BIN/node"
NODE_URL="https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz"
NODE_TAR=".local/node.tar.xz"
LOG_FILE="uma.log"

echo "Inizio avvio UMA" > "$LOG_FILE"

# 1. Verifica node globale
if command -v node >/dev/null 2>&1; then
  echo "✔ Node.js globale trovato" >> "$LOG_FILE"
else
  # 2. Se non esiste node locale, scarica
  if [ ! -f "$NODE_EXE" ]; then
    echo "❌ Node non trovato. Scarico Node.js locale" >> "$LOG_FILE"
    mkdir -p "$NODE_DIR"
    curl -L "$NODE_URL" -o "$NODE_TAR" >> "$LOG_FILE" 2>&1
    tar -xf "$NODE_TAR" -C .local >> "$LOG_FILE" 2>&1
    mv .local/node-v$NODE_VERSION-linux-x64 "$NODE_DIR"
    rm "$NODE_TAR"
  fi

  # 3. Configura PATH locale
  export PATH="$PWD/$NODE_BIN:$PWD/$NODE_BIN/node_modules/.bin:$PATH"
  echo "✔ Node.js locale configurato" >> "$LOG_FILE"
fi

# 4. Verifica se porta 5173 è già in uso
if lsof -i :5173 >/dev/null 2>&1; then
  echo "⚠ Server già in esecuzione su http://localhost:5173" >> "$LOG_FILE"
else
  # 5. Avvia server
  echo "Avvio server..." >> "$LOG_FILE"
  nohup npm run dev >> "$LOG_FILE" 2>&1 &
  sleep 2
fi

# 6. Apri browser
echo "✔ Browser avviato su http://localhost:5173" >> "$LOG_FILE"
open http://localhost:5173 2>/dev/null || xdg-open http://localhost:5173 2>/dev/null || echo "Apri http://localhost:5173 nel tuo browser"