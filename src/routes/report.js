const express = require('express');
const router = express.Router();
const { db } = require('../db');

router.get('/giornata', (req, res) => {
  const rows = db.prepare(`
    SELECT date(r.timestamp) AS giorno,
           SUM(CASE WHEN pe.categoria='studente' THEN 1 ELSE 0 END) AS n_studenti,
           SUM(CASE WHEN pe.categoria='docente' THEN 1 ELSE 0 END) AS n_docenti,
           SUM(CASE WHEN pe.categoria='strumentista' THEN 1 ELSE 0 END) AS n_strumentisti,
           SUM(CASE WHEN pe.categoria='urbinate_u18_o70' THEN 1 ELSE 0 END) AS n_urbinati,
           SUM(v.prezzo_pagato) AS incasso,
           COUNT(*) as totale_redenzioni,
           (
             SELECT COUNT(*) 
             FROM redenzioni r2 
             WHERE date(r2.timestamp) = date(r.timestamp) 
               AND r2.esito = 'ok' 
               AND r2.annullata = 1
           ) as redenzioni_annullate
    FROM redenzioni r
    JOIN tesserini te ON te.id = r.tesserino_id
    JOIN persone pe ON pe.id = te.persona_id
    JOIN vendite v ON v.tesserino_id = r.tesserino_id AND v.evento_id = r.evento_id
    WHERE r.esito = 'ok' 
      AND r.annullata = 0
      AND v.annullata = 0
    GROUP BY giorno
    ORDER BY giorno DESC
  `).all();
  res.json({ ok: true, report: rows });
});

module.exports = router;
