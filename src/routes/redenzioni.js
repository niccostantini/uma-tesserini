const express = require('express');
const router = express.Router();
const { db } = require('../db');

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, te.id AS tesserino_id, ev.nome AS evento_nome
    FROM redenzioni r
    JOIN tesserini te ON te.id = r.tesserino_id
    JOIN eventi ev ON ev.id = r.evento_id
    ORDER BY r.timestamp DESC
  `).all();
  res.json({ ok: true, redenzioni: rows });
});

module.exports = router;
