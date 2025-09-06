# 🎵 UMA Festival - Sistema Cassa e Verifica QR

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![PWA](https://img.shields.io/badge/PWA-Ready-blue.svg)](https://web.dev/progressive-web-apps/)
[![Offline](https://img.shields.io/badge/Offline-Ready-orange.svg)](#-funzionalità-offline)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Progressive Web App installabile per la gestione di tessere festival con QR code HMAC sicuri e funzionalità offline complete.**

![UMA Festival Demo](https://via.placeholder.com/800x400/007aff/ffffff?text=UMA+Festival+PWA+Demo)

## ✨ Caratteristiche

- 🎫 **Gestione Tessere**: Creazione, verifica e revoca con QR code sicuri HMAC
- ↩️ **Annullamento Redenzioni**: Possibilità di annullare redenzioni errate (ultimi 7 giorni)
- 📊 **Report Accurati**: Incassi calcolati solo su biglietti effettivamente utilizzati
- 📱 **PWA Installabile**: App nativa su desktop e mobile
- 🌐 **100% Offline**: Zero dipendenze esterne dopo l'installazione
- 🔧 **Setup Automatico**: Configurazione zero-config al primo avvio
- 💾 **Database SQLite**: Dati locali sicuri e veloci
- 🎨 **Interfaccia Moderna**: Design responsive e professionale

## 🚀 Installazione

### Installazione Rapida
```bash
# 1. Clona il repository
git clone https://github.com/username/uma-tesserini.git
cd uma-tesserini

# 2. Installa Node.js (se non è installato globalmente)
Attiva setup.cmd per installare Node.js nella cartella locale

# 3. Installa dipendenze
npm install

# 4. Avvia (setup automatico al primo avvio)
npm start
```

**🎉 Fatto!** L'app è pronta su http://localhost:5173

### ✅ Al primo avvio automaticamente:
- Genera `.env` con chiave HMAC unica e sicura
- Crea database SQLite `uma.db` con schema completo
- Pronta all'uso immediatamente!

## 📱 Installa come PWA

### Desktop (Chrome/Edge)
1. Apri http://localhost:5173
2. Cerca icona **"Installa"** nella barra indirizzi
3. Clicca **"Installa"** → App nativa pronta!

### Mobile
1. Apri in Chrome/Safari mobile
2. Menu → **"Aggiungi alla home screen"**
3. Icona UMA sulla home screen

## 🎯 Come Usare

### 👨‍💼 Operatori di Cassa
1. **Login**: Inserisci nome operatore
2. **Scansiona QR**: Verifica tessera
3. **Vendita**: Seleziona evento → completa transazione
4. **Report**: Visualizza statistiche giornata

### 👩‍💻 Amministratori  
- **Crea Tessere**: Nuove persone o esistenti
- **Visualizza**: Lista tessere con filtri
- **Importa CSV**: Caricamento batch
- **Gestione**: Revoca tessere, controlli
- **Annulla Redenzioni**: Correggi errori di convalida (max 7 giorni)

### ↩️ Annullamento Redenzioni

**Nuova funzionalità** per correggere errori di convalida:

1. **Accesso**: Sezione "Gestione Redenzioni" nell'interfaccia
2. **Visualizza**: Ultime redenzioni annullabili (7 giorni)
3. **Annulla**: Seleziona redenzione + motivo + conferma
4. **Effetti**: 
   - Tessera ridiventa utilizzabile per quell'evento
   - Report aggiornati automaticamente
   - Tracciabilità completa dell'operazione

**Casi d'uso:**
- Scansione accidentale multipla
- Errore operatore durante convalida
- Test di sistema da correggere

## 💰 Prezzi

- **👨‍🎓 Studenti**: €9,00
- **👨‍🏫 Docenti**: €5,00
- **🎵 Strumentisti**: €9,00  
- **🏛️ Urbinati/u18/o70**: €15,00
- **👤 Altri**: €20,00

## 🌐 Funzionalità Offline

**✅ Sempre disponibile offline:**
- Interfaccia utente completa
- Tutte le pagine e funzionalità
- Database locale SQLite
- Service Worker intelligente

**⚠️ Solo il primo download richiede internet**

## 🔧 Configurazione

### Dati Demo
```bash
# Avvia con dati preconfigurati per test
npm run demo
```

### Configurazione Manuale
```bash
# File .env (generato automaticamente)
PORT=5173                    # Porta server
DB_PATH=uma.db              # Database path
HMAC_SECRET_HEX=<generato>  # Chiave HMAC sicura
LOAD_DEMO=0                 # Dati demo (1=attiva)
```

## 🏗️ Architettura

```
uma-festival/
├── src/
│   ├── setup.js           # ⭐ Setup automatico
│   ├── server.js          # Server Express
│   ├── db.js              # Database SQLite  
│   ├── hmac.js            # Sicurezza QR
│   ├── config/            # Configurazioni
│   ├── routes/            # API endpoints
│   ├── services/          # Business logic
│   └── public/            # PWA Frontend
│       ├── service-worker.js  # Offline cache
│       ├── manifest.json      # PWA manifest
│       └── icons/             # App icons
├── data/seed/             # Dati demo CSV
└── .env.example          # Template config
```

## 🔐 Sicurezza

- **Chiavi HMAC uniche**: Ogni installazione = chiave unica
- **QR firmati**: HMAC-SHA256 previene falsificazioni  
- **Database locale**: Nessun dato online
- **Validazione input**: Controlli server-side rigorosi

## 🧪 Test

```bash
# Verifica funzionamento
curl http://localhost:5173/healthz

# Test QR (esempio)
curl -X POST http://localhost:5173/qr/verify \
  -H 'Content-Type: application/json' \
  -d '{"qr":"UMA25|uuid|2025-12-31|signature"}'
```

## 📊 API Principali

- `POST /qr/verify` - Verifica QR tessera
- `GET /tessere/all` - Lista tessere  
- `POST /tessere/nuovo` - Crea tessera
- `POST /vendite` - Registra vendita
- `GET /report/giornata` - Report giornaliero
- `GET /redenzioni/annullabili` - Lista redenzioni annullabili
- `POST /redenzioni/:id/annulla` - Annulla redenzione specifica

## 🔄 Database e Manutenzione

### Backup Manuale
```bash
# Backup database (file singolo)
cp uma.db backup-$(date +%Y%m%d).db

# Ripristino  
cp backup-20240101.db uma.db
```

### 🛠️ Script Manutenzione Database
```bash
# Ricrea completamente il database (con backup automatico)
node recreate_db.js --force

# Mostra aiuto
node recreate_db.js --help

# Corregge i prezzi per report incassi corretti
node fix_pricing.js
```

**Utile in caso di:**
- Corruzione database (errori disk I/O)
- Problemi con file WAL/SHM
- Reset completo per testing
- Risoluzione errori SQLite
- **Incassi sbagliati nei report** (usa `fix_pricing.js`)

## 🛠️ Script Disponibili

```bash
npm start          # Produzione (con setup auto)
npm run dev        # Sviluppo con nodemon
npm run demo       # Avvia con dati demo
npm run setup      # Solo setup iniziale
```

## 🐛 Troubleshooting

**App non si installa come PWA?**
- Verifica localhost o HTTPS
- Controlla console browser per errori SW

**Database non si crea?**  
- Verifica permessi scrittura directory
- Controlla Node.js >= 20.0.0

**Reset completo:**
```bash
rm .env uma.db
npm start  # Rigenera tutto
```

## 🤝 Contribuire

1. Fork progetto
2. Crea branch (`git checkout -b feature/nuova-funzione`)
3. Commit (`git commit -m 'Nuova funzione'`)
4. Push (`git push origin feature/nuova-funzione`)
5. Apri Pull Request

## 📜 Licenza

MIT License - Vedi [LICENSE](LICENSE)

## 🎯 Roadmap

- [ ] Dashboard analytics avanzate
- [ ] Export Excel  
- [ ] Sistema notifiche
- [ ] Multi-tenancy
- [ ] API OpenAPI docs
- [ ] Test automatici
- [ ] Docker support

## 📞 Supporto

- 🐛 **Bug**: [GitHub Issues](https://github.com/username/uma-festival/issues)
- 💡 **Idee**: [Discussions](https://github.com/username/uma-festival/discussions)  
- 📧 **Email**: support@umafestival.it

---

<p align="center">
  <strong>🎵 Sviluppato con ❤️ per UMA Festival 🎵</strong><br>
  <em>Ready to rock your festival! 🎸</em>
</p>
