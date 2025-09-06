/**
 * CONFIGURAZIONE DELL'APPLICAZIONE UMA FESTIVAL
 * ===========================================
 * 
 * Questo modulo centralizza la configurazione dell'applicazione,
 * caricando variabili d'ambiente e fornendo valori di default.
 */

require('dotenv').config();

/**
 * Configurazione del server
 * @type {Object}
 */
const server = {
  /**
   * Porta su cui il server ascolta le connessioni
   * @type {number}
   */
  port: Number(process.env.PORT || 5173),

  /**
   * Livello di logging (debug, info, warn, error)
   * @type {string}
   */
  logLevel: process.env.LOG_LEVEL || 'info',

  /**
   * Ambiente di esecuzione (development, production)
   * @type {string}
   */
  env: process.env.NODE_ENV || 'development'
};

/**
 * Configurazione del database
 * @type {Object}
 */
const database = {
  /**
   * Path del file database SQLite
   * @type {string}
   */
  path: process.env.DB_PATH || 'uma.db'
};

/**
 * Configurazione della sicurezza
 * @type {Object}
 */
const security = {
  /**
   * Chiave segreta HMAC in formato esadecimale
   * @type {string}
   */
  hmacSecretHex: process.env.HMAC_SECRET_HEX,

  /**
   * Verifica che la chiave HMAC sia configurata
   * @returns {boolean} True se la chiave è presente
   */
  isHmacConfigured: () => !!security.hmacSecretHex
};

/**
 * Configurazione dell'upload dei file
 * @type {Object}
 */
const upload = {
  /**
   * Directory per i file temporanei di upload
   * @type {string}
   */
  tempDir: 'uploads/',

  /**
   * Estensioni di file permesse per l'upload
   * @type {string[]}
   */
  allowedExtensions: ['.csv'],

  /**
   * MIME types permessi per l'upload
   * @type {string[]}
   */
  allowedMimeTypes: ['text/csv', 'application/csv']
};

/**
 * Configurazione del Content Security Policy per Helmet
 * @type {Object}
 */
const csp = {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", "data:"]
  }
};

/**
 * Verifica la completezza della configurazione
 * @returns {Object} Risultato della validazione
 */
function validateConfig() {
  const errors = [];
  
  if (!security.hmacSecretHex) {
    errors.push('HMAC_SECRET_HEX non configurato');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Ottiene un summary della configurazione per il logging
 * @returns {Object} Configurazione per il log (senza dati sensibili)
 */
function getConfigSummary() {
  return {
    server: {
      port: server.port,
      env: server.env,
      logLevel: server.logLevel
    },
    database: {
      path: database.path
    },
    security: {
      hmacConfigured: security.isHmacConfigured()
    }
  };
}

module.exports = {
  server,
  database,
  security,
  upload,
  csp,
  validateConfig,
  getConfigSummary
};
