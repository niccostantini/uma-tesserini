/**
 * UTILITÀ PER L'IMPORTAZIONE DA FILE CSV
 * ====================================
 * 
 * Questo modulo fornisce funzioni per parsare e processare file CSV
 * per l'importazione di dati nell'applicazione.
 */

const fs = require('fs');
const path = require('path');
const { CATEGORIE_PERSONE, STATI_TESSERINO } = require('../config/constants');

/**
 * Parsifica un file CSV e restituisce un array di oggetti
 * 
 * @param {string} filePath - Path del file CSV da parsificare
 * @returns {Object[]} Array di oggetti rappresentanti le righe del CSV
 * @throws {Error} Se il file non esiste o non può essere letto
 */
function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File non trovato: ${filePath}`);
  }
  
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  
  if (!raw) {
    throw new Error('File CSV vuoto');
  }
  
  const lines = raw.split(/\r?\n/);
  
  if (lines.length < 2) {
    throw new Error('File CSV deve contenere almeno un header e una riga dati');
  }
  
  const headers = lines[0].split(',').map(h => h.trim());
  
  return lines.slice(1).map((line, index) => {
    const vals = line.split(',');
    const obj = {};
    
    headers.forEach((header, i) => {
      obj[header] = (vals[i] ?? '').trim();
    });
    
    // Aggiunge informazioni utili per il debug
    obj._rowIndex = index + 2; // +2 perché partiamo dalla riga 1 (header) + 1 (indice 0-based)
    
    return obj;
  });
}

/**
 * Valida una riga di dati per l'importazione di persone
 * 
 * @param {Object} row - Oggetto rappresentante una riga del CSV
 * @returns {Object} Risultato della validazione con eventuali errori
 */
function validatePersonaRow(row) {
  const errors = [];
  
  if (!row.nome || row.nome.trim() === '') {
    errors.push('Nome è obbligatorio');
  }
  
  if (!row.categoria || row.categoria.trim() === '') {
    errors.push('Categoria è obbligatoria');
  } else if (!CATEGORIE_PERSONE.includes(row.categoria)) {
    errors.push(`Categoria non valida: ${row.categoria}. Valori permessi: ${CATEGORIE_PERSONE.join(', ')}`);
  }
  
  if (row.data_nascita && !/^\d{4}-\d{2}-\d{2}$/.test(row.data_nascita)) {
    errors.push('Data nascita deve essere in formato YYYY-MM-DD');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    row: row._rowIndex || 'sconosciuta'
  };
}

/**
 * Valida una riga di dati per l'importazione di tesserini
 * 
 * @param {Object} row - Oggetto rappresentante una riga del CSV
 * @returns {Object} Risultato della validazione con eventuali errori
 */
function validateTesserinoRow(row) {
  const errors = [];
  
  if (!row.persona_id || row.persona_id.trim() === '') {
    errors.push('ID persona è obbligatorio');
  }
  
  if (!row.qr_text || row.qr_text.trim() === '') {
    errors.push('Testo QR è obbligatorio');
  }
  
  if (!row.exp_date || row.exp_date.trim() === '') {
    errors.push('Data scadenza è obbligatoria');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.exp_date)) {
    errors.push('Data scadenza deve essere in formato YYYY-MM-DD');
  }
  
  if (row.stato && !STATI_TESSERINO.includes(row.stato)) {
    errors.push(`Stato non valido: ${row.stato}. Valori permessi: ${STATI_TESSERINO.join(', ')}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    row: row._rowIndex || 'sconosciuta'
  };
}

/**
 * Valida una riga di dati per l'importazione di eventi
 * 
 * @param {Object} row - Oggetto rappresentante una riga del CSV
 * @returns {Object} Risultato della validazione con eventuali errori
 */
function validateEventoRow(row) {
  const errors = [];
  
  if (!row.nome || row.nome.trim() === '') {
    errors.push('Nome evento è obbligatorio');
  }
  
  if (!row.data || row.data.trim() === '') {
    errors.push('Data evento è obbligatoria');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.data)) {
    errors.push('Data evento deve essere in formato YYYY-MM-DD');
  }
  
  if (row.prezzo_intero && isNaN(parseFloat(row.prezzo_intero))) {
    errors.push('Prezzo intero deve essere un numero valido');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    row: row._rowIndex || 'sconosciuta'
  };
}

/**
 * Pulisce il file temporaneo dopo l'uso
 * 
 * @param {string} filePath - Path del file da rimuovere
 */
function cleanupTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn(`Impossibile rimuovere file temporaneo ${filePath}:`, error.message);
  }
}

/**
 * Verifica che un file sia un CSV valido
 * 
 * @param {Object} file - Oggetto file da multer
 * @returns {boolean} True se il file è un CSV valido
 */
function isValidCSVFile(file) {
  if (!file) return false;
  
  const validMimeTypes = ['text/csv', 'application/csv'];
  const validExtensions = ['.csv'];
  
  const hasValidMimeType = validMimeTypes.includes(file.mimetype);
  const hasValidExtension = validExtensions.includes(path.extname(file.originalname).toLowerCase());
  
  return hasValidMimeType || hasValidExtension;
}

module.exports = {
  parseCSV,
  validatePersonaRow,
  validateTesserinoRow,
  validateEventoRow,
  cleanupTempFile,
  isValidCSVFile
};
