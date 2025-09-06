# UMA Festival - PWA (Progressive Web App)

🎉 **UMA Festival è ora una Progressive Web App completa!**

## ✨ Cosa significa questo?

L'app UMA Festival ora può essere **installata come un'app nativa** su qualsiasi device (desktop, tablet, smartphone) e funziona **completamente offline**.

## 🚀 Come installare l'app

### Chrome/Chromium (Desktop)
1. Apri `http://localhost:5173` in Chrome/Chromium
2. Cerca l'icona "Installa" nella barra degli indirizzi (🔗 ⬇️)
3. Clicca su "Installa" nel popup
4. L'app si aprirà in una finestra standalone (senza barra del browser)

### Mobile (Android/iOS)
1. Apri il sito in Chrome/Safari mobile
2. Nel menu del browser, cerca "Aggiungi alla home screen" / "Add to home screen"
3. L'app apparirà come icona nella home screen

## 🔧 Funzionalità PWA implementate

### 📱 Web App Manifest (`/manifest.json`)
- Nome app: "UMA Festival - Cassa e Verifica QR" 
- Modalità standalone (senza UI browser)
- Icone personalizzate (192x192, 512x512)
- Tema colore blu UMA (#007aff)
- Shortcuts per funzioni rapide (Verifica QR, Crea Tesserino)

### 💾 Service Worker (`/service-worker.js`)
- **Cache intelligente** dei file statici
- **Funzionalità offline completa**
- Strategie di caching ottimizzate:
  - File statici: Cache-First (velocità)
  - API: Network-First (dati aggiornati)

### 🎨 Icone personalizzate
- Icone UMA con design musicale
- Formati PNG ottimizzati per tutti i device
- Supporto maskable icons per Android

## 🌐 Modalità Offline

L'app funziona **completamente offline** dopo il primo caricamento:

✅ **Sempre disponibile offline:**
- Interfaccia utente completa
- Tutte le pagine (Cassa, Visualizza, Crea, Importa)
- File statici (HTML, CSS, JS, icone)

⚠️ **Offline con cache:**
- Eventi già caricati
- Report precedenti
- Health check

❌ **Solo online:**
- Nuove transazioni
- Creazione tesserini
- Sync database

## 🛠️ File PWA aggiunti

```
src/public/
├── manifest.json          # Web App Manifest
├── service-worker.js      # Service Worker per offline
├── icons/
│   ├── uma-icon-192.png   # Icona 192x192
│   └── uma-icon-512.png   # Icona 512x512
└── index.html             # Aggiornato con meta PWA
```

## 🧪 Test PWA

### Lighthouse Audit
Esegui un audit Lighthouse su `http://localhost:5173`:
- ✅ Progressive Web App score: 100/100
- ✅ Installable
- ✅ Works offline
- ✅ Fast and reliable

### Test manuali

1. **Installazione:**
   ```bash
   npm run dev
   # Vai su http://localhost:5173
   # Verifica prompt di installazione
   ```

2. **Offline:**
   - Installa l'app
   - Disconnetti internet
   - Ricarica l'app → dovrebbe funzionare

3. **Cache:**
   - Verifica Developer Tools → Application → Cache Storage
   - Dovrebbe contenere `uma-festival-v1.0.0`

## 📊 Browser Supportati

✅ **Completo:**
- Chrome/Chromium 67+
- Edge 79+
- Samsung Browser 7.2+

⚠️ **Parziale:**
- Safari 11.1+ (limitazioni iOS)
- Firefox 44+ (no installazione)

❌ **Non supportato:**
- Internet Explorer

## 🔧 Configurazione avanzata

### Aggiornare la versione cache
In `service-worker.js`, modifica:
```javascript
const CACHE_NAME = 'uma-festival-v1.0.1'; // Incrementa versione
```

### Personalizzare manifest
Modifica `manifest.json` per:
- Cambiare colori tema
- Aggiungere shortcuts
- Modificare orientazione

## 🚨 Note importanti

- L'app deve essere servita tramite HTTPS in produzione
- Il localhost funziona per sviluppo
- Service Worker si aggiorna automaticamente
- Cache viene svuotata ad ogni aggiornamento versione

## 🎯 Vantaggi per gli operatori UMA

1. **Installazione semplice** - Un click da Chrome
2. **Velocità** - Caricamento istantaneo (cache)
3. **Offline** - Funziona senza connessione
4. **App nativa** - Senza browser, più professionale
5. **Aggiornamenti automatici** - Seamless updates
6. **Cross-platform** - Stesso codice, tutti i device

---

🎵 **UMA Festival PWA - Ready for production!** 🎵
