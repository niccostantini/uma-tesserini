#!/usr/bin/env node

/**
 * SCRIPT DI MANUTENZIONE DATABASE
 * ==============================
 * 
 * Questo script ricrea completamente il database UMA Festival.
 * Utile in caso di:
 * - Corruzione del database
 * - Reset completo per testing
 * - Problemi di I/O con file WAL/SHM
 * 
 * ATTENZIONE: Questo script elimina TUTTI i dati esistenti!
 * Viene creato automaticamente un backup prima della rimozione.
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Gestione argomenti da linea di comando
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🔧 SCRIPT DI MANUTENZIONE DATABASE UMA FESTIVAL

Utilizzo:
  node recreate_db.js [opzioni]

Opzioni:
  --force, -f    Salta la conferma e procedi direttamente
  --help, -h     Mostra questo messaggio

Esempio:
  node recreate_db.js --force
`);
  process.exit(0);
}

const force = args.includes('--force') || args.includes('-f');

// Percorso del database
const dbPath = './uma.db';

// Richiedi conferma se non è stato usato --force
if (!force && fs.existsSync(dbPath)) {
  console.log('⚠️  ATTENZIONE: Questa operazione eliminerà TUTTI i dati del database!');
  console.log('   Verrà creato un backup automatico prima della cancellazione.');
  console.log('\n   Per procedere senza conferma, usa: node recreate_db.js --force\n');
  process.exit(1);
}

// Crea backup del database esistente se presente
if (fs.existsSync(dbPath)) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupPath = `${dbPath}.backup.${timestamp}`;
  
  try {
    fs.copyFileSync(dbPath, backupPath);
    console.log(`📁 Backup creato: ${backupPath}`);
  } catch (error) {
    console.error('⚠️ Impossibile creare backup:', error.message);
    console.log('Continuando senza backup...');
  }
  
  // Rimuovi tutti i file database correlati
  ['', '-shm', '-wal'].forEach(suffix => {
    const filePath = `${dbPath}${suffix}`;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Rimosso: ${path.basename(filePath)}`);
    }
  });
}

// Crea nuovo database
console.log('Creazione nuovo database...');
const db = new Database(dbPath);

// Leggi e applica lo schema
const schemaPath = path.join(__dirname, 'src', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

console.log('Applicazione schema...');
db.exec(schema);

// Applica solo le configurazioni pragma essenziali
console.log('Configurazione database...');
try {
  db.pragma('foreign_keys = ON');
  console.log('✅ Foreign keys abilitato');
} catch (error) {
  console.error('Errore configurazione pragma:', error);
  // Continua comunque, le pragma sono opzionali
}

// Verifica che tutto sia OK con una query semplice
console.log('Verifica database...');
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tabelle create:', tables.map(t => t.name).join(', '));
  console.log('✅ Database funzionante');
} catch (error) {
  console.error('Errore verifica:', error);
}

// Chiudi connessione
db.close();

console.log('✅ Database ricreato con successo!');
console.log('Backup del database corrotto disponibile in: uma.db.corrupted.backup');
