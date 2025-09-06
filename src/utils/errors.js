/**
 * UTILITÀ PER LA GESTIONE DEGLI ERRORI HTTP
 * =======================================
 * 
 * Questo modulo fornisce utility per la gestione degli errori HTTP
 * mantenendo compatibilità con il codice esistente.
 * 
 * DEPRECATED: Utilizzare invece il nuovo modulo middleware/errorHandler.js
 */

const { sendHttpError } = require('../middleware/errorHandler');

/**
 * Invia una risposta di errore HTTP
 * 
 * @deprecated Utilizzare sendHttpError da middleware/errorHandler.js
 * @param {Object} res - Oggetto response di Express
 * @param {number} code - Codice di stato HTTP
 * @param {string} message - Messaggio di errore
 * @param {*} [details] - Dettagli aggiuntivi dell'errore (opzionale)
 */
function httpError(res, code, message, details = null) {
  sendHttpError(res, code, message, details);
}

module.exports = { 
  httpError,
  // Re-export delle nuove utility per comodità
  sendHttpError
};
