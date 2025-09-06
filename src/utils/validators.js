/**
 * SCHEMI DI VALIDAZIONE ZODI
 * ========================
 * 
 * Questo modulo contiene tutti gli schemi di validazione Zod utilizzati
 * dall'applicazione per validare i dati in input dalle API.
 */

const { z } = require('zod');
const { CATEGORIE_PERSONE, STATI_TESSERINO } = require('../config/constants');

/**
 * Schema per la validazione delle richieste di verifica QR
 * @type {Object}
 */
const QRVerifySchema = z.object({
  /**
   * Testo del QR code da verificare
   * Deve essere una stringa di almeno 10 caratteri
   */
  qr: z.string().min(10, 'QR code deve essere di almeno 10 caratteri')
});

/**
 * Schema per la validazione delle richieste di vendita
 * @type {Object}
 */
const VenditaSchema = z.object({
  /**
   * ID del tesserino (UUID)
   */
  tesserino_id: z.string().uuid('ID tesserino deve essere un UUID valido'),
  
  /**
   * ID dell'evento (UUID)
   */
  evento_id: z.string().uuid('ID evento deve essere un UUID valido'),
  
  /**
   * Nome dell'operatore che effettua la vendita
   */
  operatore: z.string().min(1, 'Nome operatore richiesto'),
  
  /**
   * ID della cassa (opzionale, default 'cassa1')
   */
  cassa_id: z.string().min(1).optional().default('cassa1')
});

/**
 * Schema per la validazione di nuove persone
 * @type {Object}
 */
const PersonaSchema = z.object({
  /**
   * Nome completo della persona
   */
  nome: z.string().min(1, 'Nome richiesto'),
  
  /**
   * Categoria della persona
   */
  categoria: z.enum(CATEGORIE_PERSONE, {
    errorMap: () => ({ message: `Categoria deve essere una tra: ${CATEGORIE_PERSONE.join(', ')}` })
  }),
  
  /**
   * Data di nascita in formato YYYY-MM-DD (opzionale)
   */
  data_nascita: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data nascita deve essere in formato YYYY-MM-DD').optional(),
  
  /**
   * Luogo di residenza (opzionale)
   */
  residenza: z.string().optional(),
  
  /**
   * Se il documento è stato verificato
   */
  doc_verificato: z.boolean().default(false)
});

/**
 * Schema per la validazione della revoca di tessere
 * @type {Object}
 */
const RevocaSchema = z.object({
  /**
   * Motivo della revoca
   */
  motivo: z.string().min(1, 'Motivo della revoca richiesto'),
  
  /**
   * Nome dell'operatore che effettua la revoca
   */
  operatore: z.string().min(1, 'Nome operatore richiesto')
});

/**
 * Schema per la validazione di nuovi tesserini
 * @type {Object}
 */
const NuovoTesserinoSchema = z.object({
  /**
   * ID della persona a cui assegnare il tesserino
   */
  persona_id: z.string().uuid('ID persona deve essere un UUID valido'),
  
  /**
   * Data di scadenza in formato YYYY-MM-DD (opzionale)
   */
  exp_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data scadenza deve essere in formato YYYY-MM-DD').optional(),
  
  /**
   * Nome dell'operatore che crea il tesserino
   */
  operatore: z.string().min(1, 'Nome operatore richiesto')
});

/**
 * Schema per validare parametri di ricerca persone
 * @type {Object}
 */
const SearchPersoneSchema = z.object({
  search: z.string().optional(),
  id: z.string().optional(),
  categoria: z.enum(CATEGORIE_PERSONE).optional(),
  data_nascita: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  residenza: z.string().optional(),
  doc_verificato: z.enum(['true', 'false', '1', '0']).optional()
});

/**
 * Schema per validare parametri di ricerca tessere
 * @type {Object}
 */
const SearchTessereSchema = z.object({
  search: z.string().optional(),
  sortBy: z.enum(['nome', 'stato', 'exp_date', 'created_at']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
});

/**
 * Schema per validare parametri UUID
 * @type {Object}
 */
const UuidParamSchema = z.object({
  id: z.string().uuid('ID deve essere un UUID valido')
});

/**
 * Schema per validare richieste di login
 * @type {Object}
 */
const LoginSchema = z.object({
  username: z.string().min(1, 'Username richiesto')
});

module.exports = {
  QRVerifySchema,
  VenditaSchema,
  PersonaSchema,
  RevocaSchema,
  NuovoTesserinoSchema,
  SearchPersoneSchema,
  SearchTessereSchema,
  UuidParamSchema,
  LoginSchema
};
