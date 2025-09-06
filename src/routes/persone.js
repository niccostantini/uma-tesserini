const express = require('express');
const router = express.Router();
const { db, tx } = require('../db');
const { httpError } = require('../utils/errors');
const { z } = require('zod');
const crypto = require('crypto');

// Schema validazione per nuova persona
const NuovaPersonaSchema = z.object({
  nome: z.string().min(1),
  categoria: z.enum(['studente', 'docente', 'strumentista', 'urbinate_u18_o70', 'altro']),
  data_nascita: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  residenza: z.string().optional(),
  doc_verificato: z.boolean().default(false)
});

// GET /persone - Lista tutte le persone con filtri avanzati
router.get('/', (req, res) => {
  try {
    const { search, id, categoria, data_nascita, residenza, doc_verificato } = req.query;
    let query = `
      SELECT p.*, 
             t.id as tesserino_id,
             t.stato as tesserino_stato,
             t.qr_text as tesserino_qr,
             t.exp_date as tesserino_scadenza
      FROM persone p
      LEFT JOIN tesserini t ON p.id = t.persona_id AND t.stato = 'attivo'
    `;
    const params = [];
    const conditions = [];
    
    // Filtro nome (ricerca generica nel nome)
    if (search && search.trim()) {
      conditions.push('p.nome LIKE ?');
      params.push(`%${search.trim()}%`);
    }
    
    // Filtro ID esatto
    if (id && id.trim()) {
      conditions.push('p.id LIKE ?');
      params.push(`%${id.trim()}%`);
    }
    
    // Filtro categoria
    if (categoria && categoria.trim()) {
      conditions.push('p.categoria = ?');
      params.push(categoria.trim());
    }
    
    // Filtro data nascita
    if (data_nascita && data_nascita.trim()) {
      conditions.push('p.data_nascita = ?');
      params.push(data_nascita.trim());
    }
    
    // Filtro residenza
    if (residenza && residenza.trim()) {
      conditions.push('p.residenza LIKE ?');
      params.push(`%${residenza.trim()}%`);
    }
    
    // Filtro documento verificato
    if (doc_verificato !== undefined && doc_verificato !== '') {
      const verificato = doc_verificato === 'true' || doc_verificato === '1';
      conditions.push('p.doc_verificato = ?');
      params.push(verificato ? 1 : 0);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY p.nome';
    
    const persone = db.prepare(query).all(...params);
    
    res.json({ ok: true, persone });
    
  } catch (error) {
    console.error('Errore recupero persone:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

// GET /persone/:id - Dettagli persona
router.get('/:id', (req, res) => {
  try {
    const persona = db.prepare('SELECT * FROM persone WHERE id = ?').get(req.params.id);
    if (!persona) {
      return httpError(res, 404, 'persona_non_trovata');
    }
    
    // Verifica se ha tesserino attivo
    const tesseraAttiva = db.prepare(`
      SELECT id, stato, exp_date 
      FROM tesserini 
      WHERE persona_id = ? AND stato = 'attivo'
    `).get(req.params.id);
    
    res.json({ 
      ok: true, 
      persona,
      tessera_attiva: tesseraAttiva || null
    });
    
  } catch (error) {
    console.error('Errore recupero persona:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

// POST /persone - Crea nuova persona
router.post('/', (req, res) => {
  const parse = NuovaPersonaSchema.safeParse(req.body);
  
  if (!parse.success) {
    return httpError(res, 400, 'payload_non_valido', parse.error.errors);
  }
  
  const { nome, categoria, data_nascita, residenza, doc_verificato } = parse.data;
  
  try {
    const personaId = crypto.randomUUID();
    
    db.prepare(`
      INSERT INTO persone (id, nome, categoria, data_nascita, residenza, doc_verificato)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(personaId, nome, categoria, data_nascita || null, residenza || null, doc_verificato ? 1 : 0);
    
    const persona = db.prepare('SELECT * FROM persone WHERE id = ?').get(personaId);
    
    res.json({ ok: true, persona });
    
  } catch (error) {
    console.error('Errore creazione persona:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

module.exports = router;
