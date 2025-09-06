/**
 * SERVIZIO PER LA LOGICA DI BUSINESS DEI TESSERINI
 * ==============================================
 * 
 * Questo servizio gestisce tutta la logica di business relativa ai tesserini,
 * coordinando repository, validazioni e operazioni complesse.
 */

const crypto = require('crypto');
const tessereRepository = require('../repositories/tessereRepository');
const personeRepository = require('../repositories/personeRepository');
const revocheRepository = require('../repositories/revocheRepository');
const { generateQR } = require('../hmac');
const { tx } = require('../db');
const { ERROR_MESSAGES, DEFAULT_TESSERA_VALIDITY_DAYS } = require('../config/constants');
const { createError } = require('../middleware/errorHandler');

/**
 * Servizio per la gestione dei tesserini
 * @class TessereService
 */
class TessereService {
  
  /**
   * Ottiene tutti i tesserini con filtri
   * 
   * @param {Object} filters - Filtri di ricerca
   * @returns {Promise<Object>} Lista tesserini
   */
  async getAllTessere(filters = {}) {
    try {
      const tessere = await tessereRepository.findAll(filters);
      
      return {
        ok: true,
        tessere,
        count: tessere.length
      };
      
    } catch (error) {
      console.error('Errore recupero tessere:', error);
      throw createError(ERROR_MESSAGES.ERRORE_INTERNO, 500);
    }
  }
  
  /**
   * Ottiene un tesserino per ID con dettagli completi
   * 
   * @param {string} id - ID del tesserino
   * @returns {Promise<Object>} Dettagli tesserino
   * @throws {Error} Se il tesserino non esiste
   */
  async getTesseraById(id) {
    try {
      const result = await tessereRepository.findById(id);
      
      if (!result) {
        throw createError(ERROR_MESSAGES.TESSERA_NON_TROVATA, 404);
      }
      
      return {
        ok: true,
        tessera: result.tessera,
        eventi: result.eventi
      };
      
    } catch (error) {
      if (error.statusCode) throw error;
      
      console.error('Errore recupero tessera:', error);
      throw createError(ERROR_MESSAGES.ERRORE_INTERNO, 500);
    }
  }
  
  /**
   * Crea un nuovo tesserino per una persona
   * 
   * @param {Object} params - Parametri creazione tesserino
   * @param {string} params.persona_id - ID della persona
   * @param {string} [params.exp_date] - Data scadenza opzionale
   * @param {string} params.operatore - Nome operatore
   * @param {string} hmacSecret - Chiave HMAC per generazione QR
   * @returns {Promise<Object>} Nuovo tesserino creato
   * @throws {Error} Se la persona non esiste o ha già un tesserino attivo
   */\n  async createNuovoTesserino({ persona_id, exp_date, operatore }, hmacSecret) {\n    try {\n      return await tx(db => {\n        // Verifica che la persona esista\n        const persona = personeRepository.findById(persona_id);\n        if (!persona) {\n          throw createError(ERROR_MESSAGES.PERSONA_NON_TROVATA, 404);\n        }\n        \n        // Verifica che non abbia già un tesserino attivo\n        const tesseraEsistente = tessereRepository.findActiveTesseraByPersonaId(persona_id);\n        if (tesseraEsistente) {\n          throw createError(ERROR_MESSAGES.TESSERA_ATTIVA_PRESENTE, 409);\n        }\n        \n        // Calcola data di scadenza\n        const expDate = exp_date || this._calculateDefaultExpDate();\n        \n        // Genera ID e QR code\n        const tesserinId = crypto.randomUUID();\n        const qrText = generateQR(tesserinId, expDate, hmacSecret);\n        \n        // Crea il tesserino\n        tessereRepository.create({\n          id: tesserinId,\n          persona_id,\n          stato: 'attivo',\n          qr_text: qrText,\n          exp_date: expDate\n        });\n        \n        return {\n          id: tesserinId,\n          qr_text: qrText,\n          exp_date: expDate,\n          stato: 'attivo'\n        };\n      });\n      \n    } catch (error) {\n      if (error.statusCode) throw error;\n      \n      console.error('Errore creazione tesserino:', error);\n      throw createError(ERROR_MESSAGES.ERRORE_INTERNO, 500);\n    }\n  }\n  \n  /**\n   * Revoca un tesserino\n   * \n   * @param {string} tesserinId - ID del tesserino da revocare\n   * @param {Object} revocaData - Dati revoca\n   * @param {string} revocaData.motivo - Motivo della revoca\n   * @param {string} revocaData.operatore - Operatore che effettua la revoca\n   * @returns {Promise<Object>} Risultato della revoca\n   * @throws {Error} Se il tesserino non esiste o non è attivo\n   */\n  async revocaTesserino(tesserinId, { motivo, operatore }) {\n    try {\n      return await tx(db => {\n        // Verifica stato tessera\n        const statusCheck = tessereRepository.checkStatus(tesserinId);\n        \n        if (!statusCheck.exists) {\n          throw createError(ERROR_MESSAGES.TESSERA_NON_TROVATA, 404);\n        }\n        \n        if (!statusCheck.isActive) {\n          throw createError('tessera_non_attiva', 400);\n        }\n        \n        // Revoca la tessera\n        tessereRepository.revoke(tesserinId);\n        \n        // Registra la revoca\n        const revocaId = crypto.randomUUID();\n        revocheRepository.create({\n          id: revocaId,\n          tesserino_id: tesserinId,\n          motivo,\n          operatore\n        });\n        \n        return {\n          revocato: true,\n          revoca_id: revocaId,\n          timestamp: new Date().toISOString()\n        };\n      });\n      \n    } catch (error) {\n      if (error.statusCode) throw error;\n      \n      console.error('Errore revoca tesserino:', error);\n      throw createError(ERROR_MESSAGES.ERRORE_INTERNO, 500);\n    }\n  }\n  \n  /**\n   * Verifica se un tesserino può essere utilizzato per una vendita\n   * \n   * @param {string} tesserinId - ID del tesserino\n   * @returns {Promise<Object>} Risultato verifica\n   */\n  async verificaValiditaPerVendita(tesserinId) {\n    try {\n      const statusCheck = await tessereRepository.checkStatus(tesserinId);\n      \n      if (!statusCheck.exists) {\n        return {\n          valido: false,\n          motivo: ERROR_MESSAGES.TESSERA_NON_TROVATA\n        };\n      }\n      \n      if (statusCheck.isRevoked) {\n        return {\n          valido: false,\n          motivo: ERROR_MESSAGES.TESSERA_REVOCATA\n        };\n      }\n      \n      if (!statusCheck.isActive) {\n        return {\n          valido: false,\n          motivo: ERROR_MESSAGES.TESSERA_NON_ATTIVA\n        };\n      }\n      \n      return {\n        valido: true,\n        tessera: statusCheck.tessera\n      };\n      \n    } catch (error) {\n      console.error('Errore verifica validità tessera:', error);\n      throw createError(ERROR_MESSAGES.ERRORE_INTERNO, 500);\n    }\n  }\n  \n  /**\n   * Ottiene statistiche sui tesserini\n   * \n   * @returns {Promise<Object>} Statistiche complete\n   */\n  async getStatistiche() {\n    try {\n      const stats = await tessereRepository.getStats();\n      const tesseriniInScadenza = await tessereRepository.findExpiring(30);\n      const revocheStats = await revocheRepository.getStats();\n      \n      return {\n        ok: true,\n        tesserini: stats,\n        in_scadenza_30_giorni: tesseriniInScadenza.length,\n        revoche: revocheStats\n      };\n      \n    } catch (error) {\n      console.error('Errore recupero statistiche tessere:', error);\n      throw createError(ERROR_MESSAGES.ERRORE_INTERNO, 500);\n    }\n  }\n  \n  /**\n   * Ottiene tesserini in scadenza\n   * \n   * @param {number} giorni - Giorni di anticipo per considerare \"in scadenza\"\n   * @returns {Promise<Object>} Lista tesserini in scadenza\n   */\n  async getTesseriniInScadenza(giorni = 30) {\n    try {\n      const tesserini = await tessereRepository.findExpiring(giorni);\n      \n      return {\n        ok: true,\n        tesserini_in_scadenza: tesserini,\n        count: tesserini.length,\n        giorni_limite: giorni\n      };\n      \n    } catch (error) {\n      console.error('Errore recupero tesserini in scadenza:', error);\n      throw createError(ERROR_MESSAGES.ERRORE_INTERNO, 500);\n    }\n  }\n  \n  /**\n   * Rinnova un tesserino (crea nuovo tesserino con nuova scadenza)\n   * \n   * @param {string} tesserinId - ID del tesserino da rinnovare\n   * @param {string} operatore - Nome operatore\n   * @param {string} hmacSecret - Chiave HMAC\n   * @param {string} [nuovaScadenza] - Nuova data scadenza (opzionale)\n   * @returns {Promise<Object>} Nuovo tesserino creato\n   */\n  async rinnovaTesserino(tesserinId, operatore, hmacSecret, nuovaScadenza = null) {\n    try {\n      return await tx(db => {\n        // Ottieni il tesserino corrente\n        const tesseraCorrente = tessereRepository.findByIdSimple(tesserinId);\n        if (!tesseraCorrente) {\n          throw createError(ERROR_MESSAGES.TESSERA_NON_TROVATA, 404);\n        }\n        \n        // Revoca il tesserino corrente se attivo\n        if (tesseraCorrente.stato === 'attivo') {\n          tessereRepository.revoke(tesserinId);\n          \n          // Registra la revoca automatica\n          const revocaId = crypto.randomUUID();\n          revocheRepository.create({\n            id: revocaId,\n            tesserino_id: tesserinId,\n            motivo: 'Rinnovo tesserino',\n            operatore\n          });\n        }\n        \n        // Crea nuovo tesserino\n        const nuovoTesserinId = crypto.randomUUID();\n        const expDate = nuovaScadenza || this._calculateDefaultExpDate();\n        const qrText = generateQR(nuovoTesserinId, expDate, hmacSecret);\n        \n        tessereRepository.create({\n          id: nuovoTesserinId,\n          persona_id: tesseraCorrente.persona_id,\n          stato: 'attivo',\n          qr_text: qrText,\n          exp_date: expDate\n        });\n        \n        return {\n          tesserino_precedente: tesserinId,\n          nuovo_tesserino: {\n            id: nuovoTesserinId,\n            qr_text: qrText,\n            exp_date: expDate,\n            stato: 'attivo'\n          }\n        };\n      });\n      \n    } catch (error) {\n      if (error.statusCode) throw error;\n      \n      console.error('Errore rinnovo tesserino:', error);\n      throw createError(ERROR_MESSAGES.ERRORE_INTERNO, 500);\n    }\n  }\n  \n  /**\n   * Calcola la data di scadenza di default per un nuovo tesserino\n   * \n   * @private\n   * @returns {string} Data di scadenza in formato YYYY-MM-DD\n   */\n  _calculateDefaultExpDate() {\n    const now = new Date();\n    now.setDate(now.getDate() + DEFAULT_TESSERA_VALIDITY_DAYS);\n    return now.toISOString().slice(0, 10);\n  }\n}\n\nmodule.exports = new TessereService();
