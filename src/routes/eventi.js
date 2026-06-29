const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { z }   = require('zod');
const db      = require('../db');
const { httpError }    = require('../utils/errors');
const { requireAdmin } = require('../middleware/auth');
const { logAudit }    = require('../utils/audit');

const EventoSchema = z.object({
  nome:          z.string().min(1).max(200),
  data:          z.string().min(1),
  luogo:         z.string().max(200).optional().default(''),
  prezzo_intero: z.number().min(0)
});

router.get('/', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM eventi ORDER BY data ASC');
    res.json({ ok: true, eventi: rows });
  } catch (error) {
    console.error('Errore eventi:', error);
    res.status(500).json({ ok: false, error: 'errore_interno' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const parse = EventoSchema.safeParse(req.body);
  if (!parse.success) return httpError(res, 400, 'payload_non_valido');

  const { nome, data, luogo, prezzo_intero } = parse.data;
  const id = crypto.randomUUID();

  try {
    await db.run(
      'INSERT INTO eventi (id, nome, data, luogo, prezzo_intero) VALUES (?, ?, ?, ?, ?)',
      [id, nome, data, luogo, prezzo_intero]
    );
    await logAudit(req.user.username, 'evento_creato', { evento_id: id, nome, data, luogo });
    res.status(201).json({ ok: true, evento: { id, nome, data, luogo, prezzo_intero } });
  } catch (error) {
    console.error('Errore creazione evento:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const parse = EventoSchema.partial().safeParse(req.body);
  if (!parse.success) return httpError(res, 400, 'payload_non_valido');

  try {
    const existing = await db.get('SELECT * FROM eventi WHERE id = ?', [id]);
    if (!existing) return httpError(res, 404, 'evento_non_trovato');

    const { nome, data, luogo, prezzo_intero } = parse.data;
    const sets = [];
    const vals = [];

    if (nome !== undefined)          { sets.push('nome = ?');          vals.push(nome); }
    if (data !== undefined)          { sets.push('data = ?');          vals.push(data); }
    if (luogo !== undefined)         { sets.push('luogo = ?');         vals.push(luogo); }
    if (prezzo_intero !== undefined)  { sets.push('prezzo_intero = ?'); vals.push(prezzo_intero); }

    if (sets.length === 0) return httpError(res, 400, 'nessun_campo');

    vals.push(id);
    await db.run(`UPDATE eventi SET ${sets.join(', ')} WHERE id = ?`, vals);

    const updated = await db.get('SELECT * FROM eventi WHERE id = ?', [id]);
    const modifiche = {};
    if (nome !== undefined && nome !== existing.nome)                   modifiche.nome          = { da: existing.nome,          a: nome };
    if (data !== undefined && data !== existing.data)                   modifiche.data          = { da: existing.data,          a: data };
    if (luogo !== undefined && luogo !== existing.luogo)                modifiche.luogo         = { da: existing.luogo,         a: luogo };
    if (prezzo_intero !== undefined && prezzo_intero !== existing.prezzo_intero) modifiche.prezzo_intero = { da: existing.prezzo_intero, a: prezzo_intero };
    await logAudit(req.user.username, 'evento_modificato', { evento_id: id, nome: existing.nome, modifiche });
    res.json({ ok: true, evento: updated });
  } catch (error) {
    console.error('Errore aggiornamento evento:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

// GET /eventi/:id/tariffe — override prezzi per categoria
router.get('/:id/tariffe', async (req, res) => {
  try {
    const overrides = await db.all(
      'SELECT categoria, prezzo FROM tariffe_evento WHERE evento_id = ? ORDER BY categoria',
      [req.params.id]
    );
    res.json({ ok: true, tariffe: overrides });
  } catch (error) {
    console.error('Errore lettura tariffe evento:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

// PUT /eventi/:id/tariffe — sostituisce tutti gli override (array vuoto = nessun override)
router.put('/:id/tariffe', requireAdmin, async (req, res) => {
  const TariffeEventoSchema = z.array(z.object({
    categoria: z.string().min(1),
    prezzo:    z.number().min(0)
  }));

  const parse = TariffeEventoSchema.safeParse(req.body);
  if (!parse.success) return httpError(res, 400, 'payload_non_valido');

  const { id } = req.params;

  try {
    const existing = await db.get('SELECT id FROM eventi WHERE id = ?', [id]);
    if (!existing) return httpError(res, 404, 'evento_non_trovato');

    await db.tx(async (client) => {
      await client.run('DELETE FROM tariffe_evento WHERE evento_id = ?', [id]);
      for (const { categoria, prezzo } of parse.data) {
        await client.run(
          'INSERT INTO tariffe_evento (evento_id, categoria, prezzo) VALUES (?, ?, ?)',
          [id, categoria, prezzo]
        );
      }
    });

    const updated = await db.all(
      'SELECT categoria, prezzo FROM tariffe_evento WHERE evento_id = ? ORDER BY categoria',
      [id]
    );
    await logAudit(req.user.username, 'tariffe_evento_aggiornate', { evento_id: id, n_overrides: parse.data.length });
    res.json({ ok: true, tariffe: updated });
  } catch (error) {
    console.error('Errore aggiornamento tariffe evento:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await db.get('SELECT id FROM eventi WHERE id = ?', [id]);
    if (!existing) return httpError(res, 404, 'evento_non_trovato');

    const hasVendite = await db.get(
      'SELECT EXISTS(SELECT 1 FROM vendite WHERE evento_id = ?) AS has_vendite',
      [id]
    );
    if (hasVendite.has_vendite) return httpError(res, 409, 'evento_con_vendite');

    await db.run('DELETE FROM eventi WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Errore eliminazione evento:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

module.exports = router;
