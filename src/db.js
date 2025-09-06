/**
 * MODULO PER LA GESTIONE DEL DATABASE
 * =================================
 * 
 * Questo modulo configura e gestisce la connessione al database SQLite,
 * fornendo utilità per transazioni e migrazione dello schema.
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { database: dbConfig, server } = require('./config/app');
const { DB_CONFIG } = require('./config/constants');

// Inizializzazione database
const dbPath = dbConfig.path;
const db = new Database(dbPath);

// Configurazione pragma per ottimizzazioni (con gestione errori)
try {
  db.pragma(`foreign_keys = ${DB_CONFIG.PRAGMA_FOREIGN_KEYS}`);
  
  // Verifica se il database è già in modalità WAL prima di impostarla
  const currentJournalMode = db.pragma('journal_mode', { simple: true });
  if (currentJournalMode !== DB_CONFIG.PRAGMA_JOURNAL_MODE.toLowerCase()) {
    db.pragma(`journal_mode = ${DB_CONFIG.PRAGMA_JOURNAL_MODE}`);
  }
  
  db.pragma(`synchronous = ${DB_CONFIG.PRAGMA_SYNCHRONOUS}`);
  db.pragma(`busy_timeout = ${DB_CONFIG.PRAGMA_BUSY_TIMEOUT}`);
  
  if (server.env === 'development') {
    console.log('✅ Configurazione database completata');
  }
} catch (error) {
  console.error('⚠️ Errore configurazione database pragma:', error.message);
  // Continua l'esecuzione anche se alcuni pragma falliscono
}

// Logging per ambiente di sviluppo
if (server.env === 'development') {
  console.log(`Database inizializzato: ${dbPath}`);
}

/**
 * Esegue le migrazioni del database caricando lo schema SQL
 * 
 * @throws {Error} Se il file schema.sql non può essere letto
 */
function runMigrations() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`File schema non trovato: ${schemaPath}`);
    }
    
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Esegui lo schema in una transazione
    db.exec('BEGIN TRANSACTION');
    
    try {
      db.exec(schema);
      db.exec('COMMIT');
      
      if (server.env === 'development') {
        console.log('Schema database aggiornato con successo');
      }
      
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Errore durante migrazione database:', error);
    throw error;
  }
}

/**
 * Esegue una funzione all'interno di una transazione database
 * 
 * La transazione viene automaticamente rollbackata in caso di errore
 * e committata in caso di successo.
 * 
 * @param {Function} fn - Funzione da eseguire nella transazione
 * @param {Object} fn.db - Istanza del database passata alla funzione
 * @returns {*} Valore restituito dalla funzione
 * @throws {Error} Errore della funzione (la transazione viene rollbackata)
 */
function tx(fn) {
  // Usa statement preparati per migliori performance
  const begin = db.prepare('BEGIN IMMEDIATE');
  const commit = db.prepare('COMMIT');
  const rollback = db.prepare('ROLLBACK');
  
  begin.run();
  
  try {
    const result = fn(db);
    commit.run();
    return result;
    
  } catch (error) {
    rollback.run();
    
    // Log dell'errore per debugging
    if (server.env === 'development') {
      console.error('Errore in transazione database:', error);
    }
    
    throw error;
  }
}

/**
 * Esegue una query di selezione singola con logging opzionale
 * 
 * @param {string} query - Query SQL da eseguire
 * @param {Array} [params] - Parametri per la query
 * @returns {Object|null} Primo risultato o null se non trovato
 */
function selectOne(query, params = []) {
  try {
    const stmt = db.prepare(query);
    return stmt.get(...params) || null;
  } catch (error) {
    console.error('Errore in selectOne:', { query, params, error: error.message });
    throw error;
  }
}

/**
 * Esegue una query di selezione multipla con logging opzionale
 * 
 * @param {string} query - Query SQL da eseguire
 * @param {Array} [params] - Parametri per la query
 * @returns {Array} Array dei risultati
 */
function selectMany(query, params = []) {
  try {
    const stmt = db.prepare(query);
    return stmt.all(...params);
  } catch (error) {
    console.error('Errore in selectMany:', { query, params, error: error.message });
    throw error;
  }
}

/**
 * Esegue una query di inserimento/aggiornamento/eliminazione
 * 
 * @param {string} query - Query SQL da eseguire
 * @param {Array} [params] - Parametri per la query
 * @returns {Object} Risultato dell'operazione (changes, lastInsertRowid, etc.)
 */
function execute(query, params = []) {
  try {
    const stmt = db.prepare(query);
    return stmt.run(...params);
  } catch (error) {
    console.error('Errore in execute:', { query, params, error: error.message });
    throw error;
  }
}

/**
 * Chiude la connessione al database
 * Utile per cleanup nei test o shutdown dell'applicazione
 */
function closeDatabase() {
  try {
    db.close();
    console.log('Connessione database chiusa');
  } catch (error) {
    console.error('Errore chiusura database:', error);
  }
}

/**
 * Ottiene informazioni sullo stato del database
 * 
 * @returns {Object} Informazioni sul database
 */
function getDatabaseInfo() {
  try {
    return {
      path: dbPath,
      inMemory: db.memory,
      readOnly: db.readonly,
      open: db.open,
      // Informazioni sulle tabelle
      tables: db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),
      // Dimensione del file database
      size: fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0
    };
  } catch (error) {
    console.error('Errore recupero info database:', error);
    return { error: error.message };
  }
}

// Gestione pulita della chiusura in caso di signal di terminazione
process.on('exit', () => closeDatabase());
process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});
process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});

module.exports = { 
  db, 
  runMigrations, 
  tx,
  selectOne,
  selectMany,
  execute,
  closeDatabase,
  getDatabaseInfo
};
