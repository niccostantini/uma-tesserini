const express = require('express');
const router = express.Router();
const db = require('../db');
const { httpError } = require('../utils/errors');
const { requireAdmin } = require('../middleware/auth');
const { z } = require('zod');
const crypto = require('crypto');

const { logAudit } = require('../utils/audit');

const NuovaPersonaSchema = z.object({
  nome:             z.string().min(1),
  categoria:        z.string().min(1).max(100),
  data_nascita:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  residente_urbino: z.boolean().default(false),
  doc_verificato:   z.boolean().default(false)
});

const AggiornamentoPersonaSchema = z.object({
  nome:             z.string().min(1).optional(),
  categoria:        z.string().min(1).max(100).optional(),
  residente_urbino: z.boolean().optional(),
  doc_verificato:   z.boolean().optional()
});

// GET /persone
router.get('/', async (req, res) => {
  try {
    const { search, id, categoria, data_nascita, residente_urbino, doc_verificato } = req.query;
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

    if (search && search.trim()) {
      conditions.push('p.nome ILIKE ?');
      params.push(`%${search.trim()}%`);
    }

    if (id && id.trim()) {
      conditions.push('p.id::text ILIKE ?');
      params.push(`%${id.trim()}%`);
    }

    if (categoria && categoria.trim()) {
      conditions.push('p.categoria = ?');
      params.push(categoria.trim());
    }

    if (data_nascita && data_nascita.trim()) {
      conditions.push('p.data_nascita = ?');
      params.push(data_nascita.trim());
    }

    if (residente_urbino === 'true' || residente_urbino === 'false') {
      conditions.push('p.residente_urbino = ?');
      params.push(residente_urbino === 'true');
    }

    if (doc_verificato !== undefined && doc_verificato !== '') {
      const verificato = doc_verificato === 'true' || doc_verificato === '1';
      conditions.push('p.doc_verificato = ?');
      params.push(verificato);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY p.nome';

    const persone = await db.all(query, params);
    res.json({ ok: true, persone });

  } catch (error) {
    console.error('Errore recupero persone:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

// GET /persone/:id
router.get('/:id', async (req, res) => {
  try {
    const persona = await db.get('SELECT * FROM persone WHERE id = ?', [req.params.id]);
    if (!persona) return httpError(res, 404, 'persona_non_trovata');

    const tesseraAttiva = await db.get(
      "SELECT id, stato, exp_date FROM tesserini WHERE persona_id = ? AND stato = 'attivo'",
      [req.params.id]
    );

    res.json({ ok: true, persona, tessera_attiva: tesseraAttiva || null });

  } catch (error) {
    console.error('Errore recupero persona:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

// POST /persone
router.post('/', async (req, res) => {
  const parse = NuovaPersonaSchema.safeParse(req.body);
  if (!parse.success) return httpError(res, 400, 'payload_non_valido', parse.error.errors);

  const { nome, categoria, data_nascita, residente_urbino, doc_verificato } = parse.data;

  try {
    const personaId = crypto.randomUUID();

    await db.run(
      'INSERT INTO persone (id, nome, categoria, data_nascita, residente_urbino, doc_verificato) VALUES (?, ?, ?, ?, ?, ?)',
      [personaId, nome, categoria, data_nascita || null, residente_urbino, doc_verificato]
    );

    const persona = await db.get('SELECT * FROM persone WHERE id = ?', [personaId]);
    await logAudit(req.user.username, 'persona_creata', { nome, categoria, persona_id: personaId });
    res.json({ ok: true, persona });

  } catch (error) {
    console.error('Errore creazione persona:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

// DELETE /persone/:id — elimina persona e tesserini in cascata
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const persona = await db.get('SELECT id, nome FROM persone WHERE id = ?', [req.params.id]);
    if (!persona) return httpError(res, 404, 'persona_non_trovata');

    const tessera = await db.get(
      "SELECT id FROM tesserini WHERE persona_id = ? AND stato = 'attivo'",
      [req.params.id]
    );

    await db.run('DELETE FROM persone WHERE id = ?', [req.params.id]);
    await logAudit(req.user.username, 'persona_eliminata', { nome: persona.nome, persona_id: req.params.id, aveva_tessera_attiva: !!tessera });
    res.json({ ok: true, aveva_tessera_attiva: !!tessera });
  } catch (error) {
    console.error('Errore eliminazione persona:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

// PATCH /persone/:id — aggiorna nome, categoria e/o residente_urbino
router.patch('/:id', async (req, res) => {
  const parse = AggiornamentoPersonaSchema.safeParse(req.body);
  if (!parse.success) return httpError(res, 400, 'payload_non_valido');

  const { nome, categoria, residente_urbino, doc_verificato } = parse.data;
  if (nome === undefined && categoria === undefined && residente_urbino === undefined && doc_verificato === undefined)
    return httpError(res, 400, 'nessun_campo');

  try {
    const existing = await db.get('SELECT * FROM persone WHERE id = ?', [req.params.id]);
    if (!existing) return httpError(res, 404, 'persona_non_trovata');

    const sets = [];
    const vals = [];
    if (nome !== undefined)             { sets.push('nome = ?');             vals.push(nome); }
    if (categoria !== undefined)        { sets.push('categoria = ?');        vals.push(categoria); }
    if (residente_urbino !== undefined) { sets.push('residente_urbino = ?'); vals.push(residente_urbino); }
    if (doc_verificato !== undefined)   { sets.push('doc_verificato = ?');   vals.push(doc_verificato); }
    vals.push(req.params.id);

    await db.run(`UPDATE persone SET ${sets.join(', ')} WHERE id = ?`, vals);
    const updated = await db.get('SELECT * FROM persone WHERE id = ?', [req.params.id]);

    const modifiche = {};
    if (nome !== undefined && nome !== existing.nome)                               modifiche.nome             = { da: existing.nome,             a: nome };
    if (categoria !== undefined && categoria !== existing.categoria)                 modifiche.categoria        = { da: existing.categoria,        a: categoria };
    if (residente_urbino !== undefined && residente_urbino !== existing.residente_urbino) modifiche.residente_urbino = { da: existing.residente_urbino, a: residente_urbino };
    if (doc_verificato !== undefined && doc_verificato !== existing.doc_verificato)   modifiche.doc_verificato   = { da: existing.doc_verificato,   a: doc_verificato };
    await logAudit(req.user.username, 'persona_modificata', { nome: existing.nome, persona_id: req.params.id, modifiche });

    res.json({ ok: true, persona: updated });
  } catch (error) {
    console.error('Errore aggiornamento persona:', error);
    if (error.code === '23505') return httpError(res, 409, 'nome_duplicato');
    return httpError(res, 500, 'errore_interno');
  }
});

module.exports = router;
