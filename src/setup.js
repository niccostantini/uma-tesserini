/**
 * MODULO SETUP UMA FESTIVAL
 * =========================
 * 
 * Gestisce l'inizializzazione automatica dell'applicazione:
 * - Generazione file .env con chiave HMAC unica
 * - Creazione database SQLite con schema
 * - Popolamento opzionale con dati demo
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

// Colori per output console
const colors = {
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

/**
 * Logga un messaggio con colore e timestamp
 */
function log(message, color = colors.reset) {
    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

/**
 * Controlla se il file .env esiste, altrimenti lo crea
 * Genera automaticamente una chiave HMAC sicura
 */
function checkOrCreateEnv() {
    const envPath = path.join(process.cwd(), '.env');
    const envExamplePath = path.join(process.cwd(), '.env.example');
    
    if (fs.existsSync(envPath)) {
        log('✅ File .env già presente', colors.green);
        return true;
    }
    
    log('🔧 File .env non trovato, creazione in corso...', colors.yellow);
    
    try {
        // Genera chiave HMAC sicura (32 bytes = 64 caratteri hex)
        const hmacSecret = crypto.randomBytes(32).toString('hex');
        
        // Contenuto del file .env
        const envContent = `# UMA Festival - Configurazione Ambiente
# =====================================
# Generato automaticamente il ${new Date().toISOString()}

# Porta server (default: 5173)
PORT=5173

# Percorso database SQLite
DB_PATH=uma.db

# Chiave HMAC per firma QR (generata automaticamente)
HMAC_SECRET_HEX=${hmacSecret}

# Ambiente di esecuzione
NODE_ENV=production

# Carica dati demo al primo avvio (0=no, 1=si)
LOAD_DEMO=0

# Livello log (error, warn, info, debug)
LOG_LEVEL=info
`;
        
        fs.writeFileSync(envPath, envContent, 'utf8');
        log(`✅ File .env creato con chiave HMAC unica`, colors.green);
        log(`🔐 Chiave HMAC: ${hmacSecret.substring(0, 16)}...`, colors.blue);
        
        return true;
        
    } catch (error) {
        log(`❌ Errore creazione .env: ${error.message}`, colors.red);
        return false;
    }
}

/**
 * Controlla se il database esiste, altrimenti lo crea con schema
 */
function checkOrCreateDb() {
    // Carica le variabili d'ambiente
    require('dotenv').config();
    
    const dbPath = process.env.DB_PATH || 'uma.db';
    const dbFullPath = path.resolve(dbPath);
    
    if (fs.existsSync(dbFullPath)) {
        log(`✅ Database già presente: ${dbFullPath}`, colors.green);
        return true;
    }
    
    log('🗄️ Database non trovato, creazione in corso...', colors.yellow);
    
    try {
        // Leggi lo schema SQL
        const schemaPath = path.join(__dirname, 'schema.sql');
        
        if (!fs.existsSync(schemaPath)) {
            throw new Error('File schema.sql non trovato');
        }
        
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Crea database
        const db = new Database(dbFullPath);
        
        // Applica configurazioni PRAGMA
        db.pragma('foreign_keys = ON');
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('busy_timeout = 5000');
        
        // Esegui schema in transazione
        const transaction = db.transaction(() => {
            db.exec(schema);
        });
        
        transaction();
        
        log(`✅ Database creato: ${dbFullPath}`, colors.green);
        log('📋 Schema applicato correttamente', colors.green);
        
        // Chiudi connessione
        db.close();
        
        return true;
        
    } catch (error) {
        log(`❌ Errore creazione database: ${error.message}`, colors.red);
        return false;
    }
}

/**
 * Importa dati demo se richiesto tramite LOAD_DEMO=1
 */
function importSeedIfRequested() {
    const loadDemo = process.env.LOAD_DEMO === '1';
    
    if (!loadDemo) {
        log('ℹ️ Caricamento dati demo disabilitato (LOAD_DEMO=0)', colors.blue);
        return true;
    }
    
    log('📦 Caricamento dati demo richiesto...', colors.yellow);
    
    try {
        const seedDir = path.join(process.cwd(), 'data', 'seed');
        
        if (!fs.existsSync(seedDir)) {
            log('⚠️ Directory dati demo non trovata: data/seed/', colors.yellow);
            return true;
        }
        
        const dbPath = process.env.DB_PATH || 'uma.db';
        const db = new Database(dbPath);
        
        // Importa persone demo
        const personeFile = path.join(seedDir, 'persone.csv');
        if (fs.existsSync(personeFile)) {
            importPersoneCsv(db, personeFile);
        }
        
        // Importa eventi demo
        const eventiFile = path.join(seedDir, 'eventi.csv');
        if (fs.existsSync(eventiFile)) {
            importEventiCsv(db, eventiFile);
        }
        
        // Importa tariffe demo
        const tariffeFile = path.join(seedDir, 'tariffe.csv');
        if (fs.existsSync(tariffeFile)) {
            importTariffeCsv(db, tariffeFile);
        }
        
        db.close();
        log('✅ Dati demo caricati con successo', colors.green);
        
        return true;
        
    } catch (error) {
        log(`❌ Errore caricamento dati demo: ${error.message}`, colors.red);
        return false;
    }
}

/**
 * Importa persone da CSV
 */
function importPersoneCsv(db, csvPath) {
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length <= 1) return; // Solo header o file vuoto
    
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO persone (id, nome, categoria, data_nascita, residenza, doc_verificato)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    let imported = 0;
    
    // Salta la prima riga (header)
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
        
        if (columns.length >= 6) {
            const [id, nome, categoria, dataNascita, residenza, docVerificato] = columns;
            
            try {
                stmt.run(
                    id,
                    nome,
                    categoria,
                    dataNascita || null,
                    residenza || null,
                    docVerificato === '1' ? 1 : 0
                );
                imported++;
            } catch (error) {
                // Ignora errori di duplicati
            }
        }
    }
    
    log(`📋 Importate ${imported} persone demo`, colors.blue);
}

/**
 * Importa eventi da CSV
 */
function importEventiCsv(db, csvPath) {
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length <= 1) return;
    
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO eventi (id, nome, data, luogo, prezzo_intero)
        VALUES (?, ?, ?, ?, ?)
    `);
    
    let imported = 0;
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
        
        if (columns.length >= 5) {
            const [id, nome, data, luogo, prezzoIntero] = columns;
            
            try {
                stmt.run(
                    id,
                    nome,
                    data,
                    luogo || null,
                    parseFloat(prezzoIntero) || 20.0
                );
                imported++;
            } catch (error) {
                // Ignora errori di duplicati
            }
        }
    }
    
    log(`🎭 Importati ${imported} eventi demo`, colors.blue);
}

/**
 * Importa tariffe da CSV
 */
function importTariffeCsv(db, csvPath) {
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length <= 1) return;
    
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO tariffe (categoria, prezzo)
        VALUES (?, ?)
    `);
    
    let imported = 0;
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
        
        if (columns.length >= 2) {
            const [categoria, prezzo] = columns;
            
            try {
                stmt.run(categoria, parseFloat(prezzo) || 20.0);
                imported++;
            } catch (error) {
                // Ignora errori di duplicati
            }
        }
    }
    
    log(`💰 Importate ${imported} tariffe demo`, colors.blue);
}

/**
 * Esegue il setup completo dell'applicazione
 */
function runSetup() {
    log('🚀 Avvio setup UMA Festival...', colors.bold + colors.blue);
    log('=' .repeat(50), colors.blue);
    
    let success = true;
    
    // Step 1: Controlla/crea .env
    if (!checkOrCreateEnv()) {
        success = false;
    }
    
    // Step 2: Controlla/crea database
    if (!checkOrCreateDb()) {
        success = false;
    }
    
    // Step 3: Importa dati demo se richiesto
    if (!importSeedIfRequested()) {
        success = false;
    }
    
    log('=' .repeat(50), colors.blue);
    
    if (success) {
        log('🎉 Setup completato con successo!', colors.bold + colors.green);
        log('🌐 Avvio server su http://localhost:' + (process.env.PORT || 5173), colors.green);
    } else {
        log('❌ Setup completato con errori', colors.bold + colors.red);
        process.exit(1);
    }
    
    return success;
}

module.exports = {
    runSetup,
    checkOrCreateEnv,
    checkOrCreateDb,
    importSeedIfRequested
};
