/**
 * SERVIZIO PER LA GESTIONE QR E VENDITE
 * ==================================
 */

const crypto = require('crypto');
const { verifyQR } = require('../hmac');
const tessereRepository = require('../repositories/tessereRepository');
const venditeRepository = require('../repositories/venditeRepository');
const { tx } = require('../db');
const { ERROR_MESSAGES } = require('../config/constants');
const { createError } = require('../middleware/errorHandler');

class QRService {
  
  /**
   * Verifica un QR code
   */
  async verificaQR(qrText, hmacSecret) {
    const result = verifyQR(qrText, hmacSecret);
    
    if (!result.ok) {
      throw createError(result.error, 400);
    }
    
    // Verifica stato tessera nel database
    const tessera = await tessereRepository.findByIdSimple(result.id);
    if (!tessera) {
      throw createError(ERROR_MESSAGES.TESSERA_NON_TROVATA, 400);
    }
    
    if (tessera.stato === 'revocato') {
      throw createError(ERROR_MESSAGES.TESSERA_REVOCATA, 400);
    }
    
    return {
      ok: true,
      id: result.id,
      exp: result.exp,
      tessera
    };
  }
  
  /**
   * Processa una vendita completa
   */
  async processaVendita({ tesserino_id, evento_id, operatore, cassa_id = 'cassa1' }, hmacSecret) {
    return await tx(db => {
      // Verifica validità tessera
      const tessera = tessereRepository.findByIdSimple(tesserino_id);
      if (!tessera) throw createError(ERROR_MESSAGES.TESSERA_NON_TROVATA, 404);
      if (tessera.stato === 'revocato') throw createError(ERROR_MESSAGES.TESSERA_REVOCATA, 400);
      if (tessera.stato !== 'attivo') throw createError(ERROR_MESSAGES.TESSERA_NON_ATTIVA, 400);

      // Calcola prezzo
      const prezzo = venditeRepository.getPrezzoForTesserinEvento(tesserino_id, evento_id);
      if (!prezzo) throw createError(ERROR_MESSAGES.EVENTO_NON_TROVATO, 404);

      // Crea vendita e redenzione
      const venditaId = crypto.randomUUID();
      const redenzioneId = crypto.randomUUID();
      
      venditeRepository.createVendita({
        id: venditaId,
        tesserino_id,
        evento_id,
        prezzo_pagato: prezzo,
        cassa_id
      });

      venditeRepository.createRedenzione({
        id: redenzioneId,
        tesserino_id,
        evento_id,
        operatore,
        esito: 'ok'
      });

      return { prezzo };
    });
  }
}

module.exports = new QRService();
