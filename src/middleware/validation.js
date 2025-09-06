/**
 * MIDDLEWARE PER LA VALIDAZIONE
 * ==========================
 * 
 * Questo modulo contiene middleware per la validazione automatica
 * dei dati delle richieste HTTP usando schemi Zod.
 */

const { sendHttpError } = require('./errorHandler');
const { ERROR_MESSAGES } = require('../config/constants');

/**
 * Crea un middleware di validazione per il body della richiesta
 * 
 * @param {Object} schema - Schema di validazione Zod
 * @returns {Function} Middleware di Express per la validazione
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
      return sendHttpError(
        res, 
        400, 
        ERROR_MESSAGES.PAYLOAD_NON_VALIDO, 
        result.error.errors
      );
    }
    
    // Sostituisce il body con i dati validati e trasformati
    req.validatedBody = result.data;
    next();
  };
}

/**
 * Crea un middleware di validazione per i parametri della query string
 * 
 * @param {Object} schema - Schema di validazione Zod
 * @returns {Function} Middleware di Express per la validazione
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    
    if (!result.success) {
      return sendHttpError(
        res, 
        400, 
        ERROR_MESSAGES.PAYLOAD_NON_VALIDO, 
        result.error.errors
      );
    }
    
    // Sostituisce i parametri con i dati validati e trasformati
    req.validatedQuery = result.data;
    next();
  };
}

/**
 * Crea un middleware di validazione per i parametri di route
 * 
 * @param {Object} schema - Schema di validazione Zod
 * @returns {Function} Middleware di Express per la validazione
 */
function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    
    if (!result.success) {
      return sendHttpError(
        res, 
        400, 
        ERROR_MESSAGES.PAYLOAD_NON_VALIDO, 
        result.error.errors
      );
    }
    
    // Sostituisce i parametri con i dati validati e trasformati
    req.validatedParams = result.data;
    next();
  };
}

/**
 * Middleware per validare che l'HMAC secret sia configurato
 * 
 * @param {Object} req - Oggetto request di Express
 * @param {Object} res - Oggetto response di Express
 * @param {Function} next - Funzione next di Express
 */
function requireHmacSecret(req, res, next) {
  const secret = process.env.HMAC_SECRET_HEX;
  
  if (!secret) {
    return sendHttpError(res, 500, ERROR_MESSAGES.SEGRETO_NON_CONFIGURATO);
  }
  
  // Aggiunge il secret alla richiesta per uso successivo
  req.hmacSecret = secret;
  next();
}

/**
 * Middleware per validare la presenza di file nelle richieste multipart
 * 
 * @param {string} [fieldName='file'] - Nome del campo file da verificare
 * @returns {Function} Middleware di Express per la validazione
 */
function requireFile(fieldName = 'file') {
  return (req, res, next) => {
    const file = fieldName === 'file' ? req.file : req.files?.[fieldName];
    
    if (!file) {
      return sendHttpError(res, 400, ERROR_MESSAGES.FILE_RICHIESTO);
    }
    
    next();
  };
}

/**
 * Middleware per limitare la dimensione dei file caricati
 * 
 * @param {number} maxSizeBytes - Dimensione massima in bytes
 * @returns {Function} Middleware di Express per la validazione
 */
function limitFileSize(maxSizeBytes) {
  return (req, res, next) => {
    if (req.file && req.file.size > maxSizeBytes) {
      return sendHttpError(res, 400, 'file_troppo_grande');
    }
    
    next();
  };
}

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
  requireHmacSecret,
  requireFile,
  limitFileSize
};
