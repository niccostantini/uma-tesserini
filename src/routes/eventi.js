const express = require('express');
const router = express.Router();
const { db } = require('../db');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM eventi ORDER BY data ASC').all();
  res.json({ ok: true, eventi: rows });
});

module.exports = router;
