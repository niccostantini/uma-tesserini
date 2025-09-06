/**
 * MIDDLEWARE PER LA GESTIONE DEGLI ERRORI
 * =====================================
 * 
 * Questo modulo contiene middleware per la gestione centralizzata
 * degli errori HTTP e la standardizzazione delle risposte di errore.
 */

const { ERROR_MESSAGES } = require('../config/constants');

/**
 * Invia una risposta di errore HTTP standardizzata
 * 
 * @param {Object} res - Oggetto response di Express
 * @param {number} statusCode - Codice di stato HTTP
 * @param {string} errorCode - Codice di errore interno
 * @param {*} [details] - Dettagli aggiuntivi dell'errore (opzionale)
 */
function sendHttpError(res, statusCode, errorCode, details = null) {
  const response = {
    ok: false,
    error: errorCode
  };
  
  // Aggiungi dettagli solo se presenti e non in produzione
  if (details && process.env.NODE_ENV !== 'production') {
    response.details = details;
  }
  
  res.status(statusCode).json(response);
}

/**
 * Middleware per la gestione degli errori non catturati
 * 
 * @param {Error} error - Errore catturato
 * @param {Object} req - Oggetto request di Express
 * @param {Object} res - Oggetto response di Express 
 * @param {Function} next - Funzione next di Express
 */
function globalErrorHandler(error, req, res, next) {
  console.error('Errore non gestito:', error);
  
  // Se la risposta è già stata inviata, passa al prossimo handler
  if (res.headersSent) {
    return next(error);
  }
  
  // Determina il codice di errore basato sul tipo di errore
  let statusCode = 500;
  let errorCode = ERROR_MESSAGES.ERRORE_INTERNO;
  
  if (error.name === 'ValidationError') {
    statusCode = 400;
    errorCode = ERROR_MESSAGES.PAYLOAD_NON_VALIDO;
  } else if (error.name === 'MulterError') {
    statusCode = 400;
    errorCode = error.code === 'LIMIT_FILE_SIZE' ? 'file_troppo_grande' : ERROR_MESSAGES.FILE_RICHIESTO;
  }
  
  sendHttpError(res, statusCode, errorCode, error.message);
}

/**
 * Middleware per gestire le route non trovate (404)
 * 
 * @param {Object} req - Oggetto request di Express
 * @param {Object} res - Oggetto response di Express
 */
function notFoundHandler(req, res) {
  sendHttpError(res, 404, 'route_non_trovata');
}

/**
 * Utility per creare errori personalizzati con codice e status
 * 
 * @param {string} message - Messaggio di errore
 * @param {number} statusCode - Codice di stato HTTP
 * @param {string} code - Codice di errore interno
 * @returns {Error} Errore personalizzato
 */
function createError(message, statusCode = 500, code = ERROR_MESSAGES.ERRORE_INTERNO) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

/**
 * Wrapper per gestire errori async nelle route
 * Avvolge le funzioni async per catturare automaticamente i rejection
 * 
 * @param {Function} fn - Funzione async da wrappare
 * @returns {Function} Funzione wrappata con gestione errori
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  sendHttpError,
  globalErrorHandler,
  notFoundHandler,
  createError,
  asyncHandler
};
