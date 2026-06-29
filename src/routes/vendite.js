const express = require('express');
const router = express.Router();
const db = require('../db');
const { VenditaSchema } = require('../utils/validators');
const { httpError } = require('../utils/errors');
const crypto = require('crypto');
const { logAudit } = require('../utils/audit');

router.post('/', async (req, res) => {
  const p = VenditaSchema.safeParse(req.body);
  if (!p.success) return httpError(res, 400, 'payload_non_valido');
  const { tesserino_id, evento_id, operatore, cassa_id = 'cassa1', presentato_da_tesserino_id } = p.data;

  try {
    const result = await db.tx(async (client) => {
      const tess = await client.get('SELECT stato, persona_id FROM tesserini WHERE id=?', [tesserino_id]);
      if (!tess) throw new Error('tessera_non_trovata');
      if (tess.stato === 'revocato') throw new Error('tessera_revocata');
      if (tess.stato !== 'attivo') throw new Error('tessera_non_attiva');

      const persona_id = tess.persona_id;

      // Controlla se la persona ha già un accredito valido per questo evento
      const giaAccreditata = await client.get(
        "SELECT id FROM redenzioni WHERE persona_id=? AND evento_id=? AND esito='ok' AND annullata=false",
        [persona_id, evento_id]
      );
      if (giaAccreditata) throw new Error('persona_gia_accreditata');

      if (presentato_da_tesserino_id) {
        const portatore = await client.get('SELECT stato FROM tesserini WHERE id=?', [presentato_da_tesserino_id]);
        if (!portatore) throw new Error('portatore_non_trovato');
        if (portatore.stato !== 'attivo') throw new Error('portatore_non_attivo');
      }

      const prezzoRow = await client.get(`
        SELECT COALESCE(
          (SELECT te_ev.prezzo
           FROM tesserini ti2
           JOIN persone pe2 ON pe2.id = ti2.persona_id
           JOIN tariffe_evento te_ev ON te_ev.evento_id = ? AND te_ev.categoria = pe2.categoria
           WHERE ti2.id = ?),
          (SELECT ta.prezzo
           FROM tesserini te
           JOIN persone pe ON pe.id = te.persona_id
           JOIN tariffe ta ON ta.categoria = pe.categoria
           WHERE te.id = ?),
          (SELECT prezzo_intero FROM eventi WHERE id=?)
        ) AS prezzo
      `, [evento_id, tesserino_id, tesserino_id, evento_id]);
      if (!prezzoRow || prezzoRow.prezzo == null) throw new Error('evento_non_trovato');

      await client.run(
        'INSERT INTO vendite(id,tesserino_id,evento_id,prezzo_pagato,cassa_id) VALUES(?,?,?,?,?)',
        [crypto.randomUUID(), tesserino_id, evento_id, prezzoRow.prezzo, cassa_id]
      );

      await client.run(
        'INSERT INTO redenzioni(id,tesserino_id,persona_id,evento_id,operatore,esito,presentato_da_tesserino_id) VALUES(?,?,?,?,?,?,?)',
        [crypto.randomUUID(), tesserino_id, persona_id, evento_id, operatore, 'ok', presentato_da_tesserino_id || null]
      );

      return { prezzo: prezzoRow.prezzo };
    });

    const info = await db.get(
      `SELECT pe.nome AS persona_nome, ev.nome AS evento_nome
       FROM tesserini te JOIN persone pe ON pe.id = te.persona_id
       JOIN eventi ev ON ev.id = ?
       WHERE te.id = ?`,
      [evento_id, tesserino_id]
    );
    await logAudit(req.user.username, 'accredito_concesso', {
      persona_nome: info?.persona_nome,
      evento_nome:  info?.evento_nome,
      con_portatore: !!presentato_da_tesserino_id
    });
    res.json({ ok: true, prezzo: result.prezzo });

  } catch (e) {
    if (e.message === 'persona_gia_accreditata') return httpError(res, 409, e.message);
    // PG error code 23505 = unique_violation fallback (indice ux_red_ok)
    if (e.code === '23505') return httpError(res, 409, 'persona_gia_accreditata');
    if (e.message === 'tessera_non_trovata')  return httpError(res, 404, e.message);
    if (e.message === 'tessera_revocata')     return httpError(res, 400, e.message);
    if (e.message === 'tessera_non_attiva')   return httpError(res, 400, e.message);
    if (e.message === 'evento_non_trovato')   return httpError(res, 404, e.message);
    if (e.message === 'portatore_non_trovato') return httpError(res, 404, e.message);
    if (e.message === 'portatore_non_attivo')  return httpError(res, 400, e.message);
    console.error('Errore vendita:', e);
    return httpError(res, 500, 'errore_interno');
  }
});

module.exports = router;
