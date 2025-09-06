const express = require('express');
const router = express.Router();
const { db, tx } = require('../db');
const { httpError } = require('../utils/errors');
const { generateQR } = require('../hmac');
const { z } = require('zod');
const crypto = require('crypto');

// Schema validazione
const RevocaSchema = z.object({
  motivo: z.string().min(1),
  operatore: z.string().min(1)
});

const NuovoTesserinoSchema = z.object({
  persona_id: z.string().uuid(),
  exp_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  operatore: z.string().min(1)
});

// GET /tessere/all - Lista tutti i tesserini
router.get('/all', (req, res) => {
  try {
    const { search, sortBy, sortOrder } = req.query;
    let query = `
      SELECT 
        t.id, t.stato, t.qr_text, t.exp_date, t.created_at,
        p.nome, p.categoria, p.data_nascita, p.residenza, p.doc_verificato
      FROM tesserini t
      JOIN persone p ON t.persona_id = p.id
    `;
    
    const params = [];
    
    // Filtro di ricerca
    if (search && search.trim()) {
      query += ` WHERE (p.nome LIKE ? OR t.id LIKE ?)`;
      const searchParam = `%${search.trim()}%`;
      params.push(searchParam, searchParam);
    }
    
    // Ordinamento
    const validSortFields = ['nome', 'stato', 'exp_date', 'created_at'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortField === 'nome' ? 'p.nome' : 't.' + sortField} ${order}`;
    
    const tessere = db.prepare(query).all(...params);
    
    res.json({ ok: true, tessere });
    
  } catch (error) {
    console.error('Errore recupero tessere:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

router.get('/:id', (req, res) => {
  const id = req.params.id;
  const tess = db.prepare(`
    SELECT te.id, te.persona_id, te.stato, te.exp_date, pe.nome, pe.categoria, pe.doc_verificato
    FROM tesserini te
    JOIN persone pe ON pe.id = te.persona_id
    WHERE te.id = ?
  `).get(id);
  if (!tess) return httpError(res, 404, 'tessera_non_trovata');

  const usi = db.prepare(`
    SELECT ev.id as evento_id, ev.nome, ev.data,
           EXISTS(SELECT 1 FROM redenzioni r WHERE r.tesserino_id = te.id AND r.evento_id = ev.id AND r.esito='ok' AND r.annullata=0) AS redento
    FROM eventi ev CROSS JOIN (SELECT ? AS id) te
  `).all(id);

  res.json({ ok: true, tessera: tess, eventi: usi });
});

// POST /tessere/:id/revoca - Revoca tesserino
router.post('/:id/revoca', (req, res) => {
  const tesserinId = req.params.id;
  const parse = RevocaSchema.safeParse(req.body);
  
  if (!parse.success) {
    return httpError(res, 400, 'payload_non_valido');
  }
  
  const { motivo, operatore } = parse.data;
  
  try {
    const result = tx(db => {
      // Verifica che il tesserino esista ed sia attivo
      const tessera = db.prepare('SELECT id, stato FROM tesserini WHERE id = ?').get(tesserinId);
      
      if (!tessera) {
        throw new Error('tessera_non_trovata');
      }
      
      if (tessera.stato !== 'attivo') {
        throw new Error('tessera_non_attiva');
      }
      
      // Imposta stato revocato
      db.prepare('UPDATE tesserini SET stato = ? WHERE id = ?')
        .run('revocato', tesserinId);
      
      // Inserisci record revoca
      db.prepare(`INSERT INTO revoche (id, tesserino_id, motivo, operatore) 
                  VALUES (?, ?, ?, ?)`)
        .run(crypto.randomUUID(), tesserinId, motivo, operatore);
      
      return { revocato: true };
    });
    
    res.json({ ok: true });
    
  } catch (error) {
    if (error.message === 'tessera_non_trovata') {
      return httpError(res, 404, error.message);
    }
    if (error.message === 'tessera_non_attiva') {
      return httpError(res, 400, error.message);
    }
    console.error('Errore revoca:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

// POST /tessere/nuovo - Crea nuovo tesserino
router.post('/nuovo', (req, res) => {
  const parse = NuovoTesserinoSchema.safeParse(req.body);
  
  if (!parse.success) {
    return httpError(res, 400, 'payload_non_valido');
  }
  
  const { persona_id, exp_date, operatore } = parse.data;
  
  // Default exp_date: oggi + 365 giorni
  const expDate = exp_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  
  try {
    const result = tx(db => {
      // Verifica che la persona non abbia già un tesserino attivo
      const esistente = db.prepare(`
        SELECT id FROM tesserini 
        WHERE persona_id = ? AND stato = 'attivo'
      `).get(persona_id);
      
      if (esistente) {
        throw new Error('tessera_attiva_presente');
      }
      
      // Verifica che la persona esista
      const persona = db.prepare('SELECT id FROM persone WHERE id = ?').get(persona_id);
      if (!persona) {
        throw new Error('persona_non_trovata');
      }
      
      // Genera nuovo tesserino
      const tesserinId = crypto.randomUUID();
      const secretHex = process.env.HMAC_SECRET_HEX;
      
      if (!secretHex) {
        throw new Error('segreto_non_configurato');
      }
      
      const qrText = generateQR(tesserinId, expDate, secretHex);
      
      // Inserisci nuovo tesserino
      db.prepare(`INSERT INTO tesserini (id, persona_id, stato, qr_text, exp_date) 
                  VALUES (?, ?, ?, ?, ?)`)
        .run(tesserinId, persona_id, 'attivo', qrText, expDate);
      
      return {
        id: tesserinId,
        qr_text: qrText,
        exp_date: expDate
      };
    });
    
    res.json({ ok: true, tesserino: result });
    
  } catch (error) {
    if (error.message === 'tessera_attiva_presente') {
      return httpError(res, 409, error.message);
    }
    if (error.message === 'persona_non_trovata') {
      return httpError(res, 404, error.message);
    }
    if (error.message === 'segreto_non_configurato') {
      return httpError(res, 500, error.message);
    }
    console.error('Errore creazione tesserino:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

module.exports = router;
