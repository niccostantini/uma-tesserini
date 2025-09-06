const express = require('express');
const router = express.Router();
const { db } = require('../db');

router.get('/giornata', (req, res) => {
  const rows = db.prepare(`
    SELECT date(v.timestamp) AS giorno,
           SUM(CASE WHEN pe.categoria='studente' THEN 1 ELSE 0 END) AS n_studenti,
           SUM(CASE WHEN pe.categoria='docente' THEN 1 ELSE 0 END) AS n_docenti,
           SUM(CASE WHEN pe.categoria='strumentista' THEN 1 ELSE 0 END) AS n_strumentisti,
           SUM(CASE WHEN pe.categoria='urbinate_u18_o70' THEN 1 ELSE 0 END) AS n_urbinati,
           SUM(v.prezzo_pagato) AS incasso
    FROM vendite v
    JOIN tesserini te ON te.id = v.tesserino_id
    JOIN persone pe ON pe.id = te.persona_id
    GROUP BY giorno
    ORDER BY giorno DESC
  `).all();
  res.json({ ok: true, report: rows });
});

module.exports = router;
