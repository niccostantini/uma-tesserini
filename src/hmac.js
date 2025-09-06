/**
 * MODULO PER LA GESTIONE DELLA SICUREZZA QR CON HMAC
 * ================================================
 * 
 * Questo modulo implementa la generazione e verifica di QR code sicuri
 * utilizzando HMAC-SHA256 per garantire l'autenticità e prevenire la falsificazione.
 * 
 * Formato QR: UMA25|<tesserino_id>|<exp_date>|<signature>
 */

const crypto = require('crypto');
const { QR_PREFIX, HMAC_ALGORITHM, ERROR_MESSAGES } = require('./config/constants');

/**
 * Converte un buffer in formato base64url (URL-safe base64 senza padding)
 * 
 * @param {Buffer} buf - Buffer da convertire
 * @returns {string} Stringa in formato base64url
 */
function base64url(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Calcola la firma HMAC per un tesserino
 * 
 * @param {string} tesserinId - ID del tesserino
 * @param {string} expDate - Data di scadenza in formato YYYY-MM-DD
 * @param {string} secretHex - Chiave segreta in formato esadecimale
 * @returns {string} Firma HMAC in formato base64url
 */
function calculateSignature(tesserinId, expDate, secretHex) {
  const key = Buffer.from(secretHex, 'hex');
  const payload = `${tesserinId}|${expDate}`;
  const mac = crypto.createHmac(HMAC_ALGORITHM, key)
    .update(payload)
    .digest();
  return base64url(mac);
}

/**
 * Verifica l'autenticità e validità di un QR code
 * 
 * @param {string} qrText - Testo del QR code da verificare
 * @param {string} secretHex - Chiave segreta HMAC in formato esadecimale
 * @returns {Object} Risultato della verifica
 * @returns {boolean} returns.ok - True se il QR è valido
 * @returns {string} [returns.id] - ID del tesserino (se valido)
 * @returns {string} [returns.exp] - Data di scadenza (se valido)
 * @returns {string} [returns.error] - Codice errore (se non valido)
 */
function verifyQR(qrText, secretHex) {
  if (!qrText || typeof qrText !== 'string') {
    return { ok: false, error: ERROR_MESSAGES.FORMATO_NON_VALIDO };
  }
  
  if (!secretHex) {
    return { ok: false, error: ERROR_MESSAGES.SEGRETO_NON_CONFIGURATO };
  }
  
  // Parsing del formato QR: PREFIX|ID|EXP|SIGNATURE
  const parts = qrText.trim().split('|');
  
  if (parts.length !== 4) {
    return { ok: false, error: ERROR_MESSAGES.FORMATO_NON_VALIDO };
  }
  
  const [prefix, tesserinId, expDate, signature] = parts;
  
  // Verifica prefisso
  if (prefix !== QR_PREFIX) {
    return { ok: false, error: ERROR_MESSAGES.PREFISSO_NON_VALIDO };
  }
  
  // Verifica formato ID tesserino (dovrebbe essere UUID)
  if (!tesserinId || tesserinId.length === 0) {
    return { ok: false, error: ERROR_MESSAGES.FORMATO_NON_VALIDO };
  }
  
  // Verifica formato data (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expDate)) {
    return { ok: false, error: ERROR_MESSAGES.FORMATO_NON_VALIDO };
  }
  
  try {
    // Calcola la firma attesa
    const expectedSignature = calculateSignature(tesserinId, expDate, secretHex);
    
    // Verifica firma (comparison time-constant per sicurezza)
    if (!crypto.timingSafeEqual(
      Buffer.from(expectedSignature), 
      Buffer.from(signature)
    )) {
      return { ok: false, error: ERROR_MESSAGES.FIRMA_NON_VALIDA };
    }
    
    // Verifica scadenza
    const today = new Date().toISOString().slice(0, 10);
    if (expDate < today) {
      return { ok: false, error: ERROR_MESSAGES.QR_SCADUTO };
    }
    
    return { 
      ok: true, 
      id: tesserinId, 
      exp: expDate 
    };
    
  } catch (error) {
    console.error('Errore durante verifica QR:', error);
    return { ok: false, error: ERROR_MESSAGES.ERRORE_INTERNO };
  }
}

/**
 * Genera un QR code sicuro per un tesserino
 * 
 * @param {string} tesserinId - ID del tesserino (UUID)
 * @param {string} expDate - Data di scadenza in formato YYYY-MM-DD
 * @param {string} secretHex - Chiave segreta HMAC in formato esadecimale
 * @returns {string} Testo del QR code generato
 * @throws {Error} Se i parametri sono invalidi
 */
function generateQR(tesserinId, expDate, secretHex) {
  if (!tesserinId || typeof tesserinId !== 'string') {
    throw new Error('ID tesserino richiesto');
  }
  
  if (!expDate || !/^\d{4}-\d{2}-\d{2}$/.test(expDate)) {
    throw new Error('Data scadenza deve essere in formato YYYY-MM-DD');
  }
  
  if (!secretHex) {
    throw new Error('Chiave segreta richiesta');
  }
  
  try {
    const signature = calculateSignature(tesserinId, expDate, secretHex);
    return `${QR_PREFIX}|${tesserinId}|${expDate}|${signature}`;
    
  } catch (error) {
    console.error('Errore durante generazione QR:', error);
    throw new Error('Impossibile generare QR code');
  }
}

/**
 * Genera una nuova chiave segreta HMAC casuale
 * 
 * @param {number} [keyLength=32] - Lunghezza della chiave in bytes (default 32 = 256 bit)
 * @returns {string} Chiave segreta in formato esadecimale
 */
function generateHmacSecret(keyLength = 32) {
  return crypto.randomBytes(keyLength).toString('hex');
}

/**
 * Verifica se una chiave HMAC ha il formato corretto
 * 
 * @param {string} secretHex - Chiave da verificare
 * @returns {boolean} True se la chiave è valida
 */
function isValidHmacSecret(secretHex) {
  if (!secretHex || typeof secretHex !== 'string') {
    return false;
  }
  
  // Deve essere una stringa esadecimale di lunghezza pari (almeno 32 caratteri = 16 bytes)
  return /^[0-9a-f]{32,}$/i.test(secretHex) && secretHex.length % 2 === 0;
}

module.exports = { 
  verifyQR, 
  generateQR,
  generateHmacSecret,
  isValidHmacSecret
};
