const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ ok: false, error: 'username_richiesto' });
  res.json({ ok: true, user: { name: username, role: 'cassa' } });
});

module.exports = router;
