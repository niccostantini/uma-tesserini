const express = require('express');
const router = express.Router();
const { db, tx } = require('../db');
const { VenditaSchema } = require('../utils/validators');
const { httpError } = require('../utils/errors');
const crypto = require('crypto');

function uuidv4() {
  return crypto.randomUUID();
}

router.post('/', (req, res) => {
  const p = VenditaSchema.safeParse(req.body);
  if (!p.success) return httpError(res, 400, 'payload_non_valido');
  const { tesserino_id, evento_id, operatore, cassa_id='cassa1' } = p.data;

  try {
    const result = tx(db => {
      // Stato tessera
      const tess = db.prepare('SELECT stato FROM tesserini WHERE id=?').get(tesserino_id);
      if (!tess) throw new Error('tessera_non_trovata');
      if (tess.stato === 'revocato') throw new Error('tessera_revocata');
      if (tess.stato !== 'attivo') throw new Error('tessera_non_attiva');

      // Prezzo: tariffa della categoria altrimenti prezzo intero
      const prezzoRow = db.prepare(`
        SELECT COALESCE((
          SELECT ta.prezzo
          FROM tesserini te
          JOIN persone pe ON pe.id = te.persona_id
          JOIN tariffe ta ON ta.categoria = pe.categoria
          WHERE te.id = ?
        ), (SELECT prezzo_intero FROM eventi WHERE id=?)) AS prezzo
      `).get(tesserino_id, evento_id);
      if (!prezzoRow || prezzoRow.prezzo == null) throw new Error('evento_non_trovato');

      // Inserimenti atomici
      db.prepare(`INSERT INTO vendite(id,tesserino_id,evento_id,prezzo_pagato,cassa_id)
                  VALUES(?,?,?,?,?)`)
        .run(uuidv4(), tesserino_id, evento_id, prezzoRow.prezzo, cassa_id);

      db.prepare(`INSERT INTO redenzioni(id,tesserino_id,evento_id,operatore,esito)
                  VALUES(?,?,?,?,?)`)
        .run(uuidv4(), tesserino_id, evento_id, operatore, 'ok');

      return { prezzo: prezzoRow.prezzo };
    });

    res.json({ ok: true, prezzo: result.prezzo });

  } catch (e) {
    if (String(e.message).includes('UNIQUE constraint failed') || String(e.message).includes('ux_red_ok')) {
      return httpError(res, 409, 'duplicato');
    }
    if (e.message === 'tessera_non_trovata') return httpError(res, 404, e.message);
    if (e.message === 'tessera_revocata') return httpError(res, 400, e.message);
    if (e.message === 'tessera_non_attiva') return httpError(res, 400, e.message);
    if (e.message === 'evento_non_trovato') return httpError(res, 404, e.message);
    return httpError(res, 500, 'errore_interno');
  }
});

module.exports = router;
