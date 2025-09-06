/**
 * COSTANTI DELL'APPLICAZIONE UMA FESTIVAL
 * =====================================
 * 
 * Questo modulo centralizza tutte le costanti utilizzate nell'applicazione
 * per garantire consistenza e facilitare la manutenzione.
 */

/**
 * Categorie valide per le persone
 * @type {string[]}
 */
const CATEGORIE_PERSONE = [
  'studente',
  'docente', 
  'strumentista',
  'urbinate_u18_o70',
  'altro'
];

/**
 * Stati validi per i tesserini
 * @type {string[]}
 */
const STATI_TESSERINO = [
  'attivo',
  'revocato'
];

/**
 * Prefisso per i QR code UMA
 * @type {string}
 */
const QR_PREFIX = 'UMA25';

/**
 * Algoritmo HMAC utilizzato per la firma dei QR
 * @type {string}
 */
const HMAC_ALGORITHM = 'sha256';

/**
 * Durata predefinita di validità di un tesserino (in giorni)
 * @type {number}
 */
const DEFAULT_TESSERA_VALIDITY_DAYS = 365;

/**
 * Prezzo di default per gli eventi (in euro)
 * @type {number}
 */
const DEFAULT_EVENT_PRICE = 20.0;

/**
 * Limiti per le query e upload
 * @type {Object}
 */
const LIMITS = {
  MAX_JSON_SIZE: '256kb',
  MAX_SEARCH_RESULTS: 1000,
  MAX_CSV_FILE_SIZE: '10mb'
};

/**
 * Messaggi di errore standardizzati
 * @type {Object}
 */
const ERROR_MESSAGES = {
  PAYLOAD_NON_VALIDO: 'payload_non_valido',
  TESSERA_NON_TROVATA: 'tessera_non_trovata',
  TESSERA_REVOCATA: 'tessera_revocata',
  TESSERA_NON_ATTIVA: 'tessera_non_attiva',
  TESSERA_ATTIVA_PRESENTE: 'tessera_attiva_presente',
  PERSONA_NON_TROVATA: 'persona_non_trovata',
  EVENTO_NON_TROVATO: 'evento_non_trovato',
  QR_SCADUTO: 'qr_scaduto',
  FORMATO_NON_VALIDO: 'formato_non_valido',
  PREFISSO_NON_VALIDO: 'prefisso_non_valido',
  FIRMA_NON_VALIDA: 'firma_non_valida',
  SEGRETO_NON_CONFIGURATO: 'segreto_non_configurato',
  ERRORE_INTERNO: 'errore_interno',
  DUPLICATO: 'duplicato',
  FILE_RICHIESTO: 'file_richiesto',
  USERNAME_RICHIESTO: 'username_richiesto'
};

/**
 * Configurazioni di default per il database
 * @type {Object}
 */
const DB_CONFIG = {
  PRAGMA_FOREIGN_KEYS: 'ON',
  PRAGMA_JOURNAL_MODE: 'WAL',
  PRAGMA_SYNCHRONOUS: 'NORMAL',
  PRAGMA_BUSY_TIMEOUT: 5000
};

module.exports = {
  CATEGORIE_PERSONE,
  STATI_TESSERINO,
  QR_PREFIX,
  HMAC_ALGORITHM,
  DEFAULT_TESSERA_VALIDITY_DAYS,
  DEFAULT_EVENT_PRICE,
  LIMITS,
  ERROR_MESSAGES,
  DB_CONFIG
};
