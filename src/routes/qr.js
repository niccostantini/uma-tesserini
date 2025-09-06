const express = require('express');
const router = express.Router();
const { verifyQR } = require('../hmac');
const { QRVerifySchema } = require('../utils/validators');
const { httpError } = require('../utils/errors');
const { db } = require('../db');

router.post('/verify', (req, res) => {
  const parse = QRVerifySchema.safeParse(req.body);
  if (!parse.success) return httpError(res, 400, 'payload_non_valido');
  const { qr } = parse.data;
  const secret = process.env.HMAC_SECRET_HEX;
  if (!secret) return httpError(res, 500, 'segreto_non_configurato');

  const result = verifyQR(qr, secret);
  if (!result.ok) return httpError(res, 400, result.error);
  
  // Verifica che il tesserino non sia revocato
  const tessera = db.prepare('SELECT stato FROM tesserini WHERE id = ?').get(result.id);
  if (!tessera) {
    return httpError(res, 400, 'tessera_non_trovata');
  }
  if (tessera.stato === 'revocato') {
    return httpError(res, 400, 'tessera_revocata');
  }
  
  return res.json({ ok: true, id: result.id, exp: result.exp });
});

module.exports = router;
