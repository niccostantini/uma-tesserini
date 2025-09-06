const express = require('express');
const router = express.Router();
const { db, tx } = require('../db');

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

// Annulla una redenzione
router.post('/:id/annulla', (req, res) => {
  const { id } = req.params;
  const { motivo, operatore } = req.body;
  
  if (!motivo || !operatore) {
    return res.status(400).json({ error: 'Motivo e operatore sono obbligatori' });
  }
  
  try {
    const result = tx(db => {
      // Verifica che la redenzione esista e non sia già annullata
      const redenzione = db.prepare('SELECT * FROM redenzioni WHERE id = ?').get(id);
      
      if (!redenzione) {
        throw new Error('redenzione_non_trovata');
      }
      
      if (redenzione.annullata) {
        throw new Error('redenzione_gia_annullata');
      }
      
      if (redenzione.esito !== 'ok') {
        throw new Error('solo_redenzioni_ok_possono_essere_annullate');
      }
      
      // Annulla la redenzione
      db.prepare(`
        UPDATE redenzioni 
        SET annullata = 1, 
            annullata_timestamp = datetime('now'), 
            annullata_operatore = ?, 
            annullata_motivo = ?
        WHERE id = ?
      `).run(operatore, motivo, id);
      
      return { redenzione_id: id, annullata: true };
    });
    
    res.json({ ok: true, ...result });
    
  } catch (error) {
    console.error('Errore annullamento redenzione:', error);
    
    if (error.message === 'redenzione_non_trovata') {
      return res.status(404).json({ error: 'Redenzione non trovata' });
    }
    if (error.message === 'redenzione_gia_annullata') {
      return res.status(400).json({ error: 'Redenzione già annullata' });
    }
    if (error.message === 'solo_redenzioni_ok_possono_essere_annullate') {
      return res.status(400).json({ error: 'Solo redenzioni valide possono essere annullate' });
    }
    
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Ottieni redenzioni annullabili (recenti e non già annullate)
router.get('/annullabili', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  
  const rows = db.prepare(`
    SELECT r.id, r.timestamp, r.operatore, r.esito,
           e.nome AS evento_nome,
           p.nome AS persona_nome,
           p.categoria,
           t.id AS tesserino_id
    FROM redenzioni r
    JOIN eventi e ON e.id = r.evento_id
    JOIN tesserini t ON t.id = r.tesserino_id
    JOIN persone p ON p.id = t.persona_id
    WHERE r.esito = 'ok' 
      AND r.annullata = 0
      AND datetime(r.timestamp) >= datetime('now', '-7 days')
    ORDER BY r.timestamp DESC
    LIMIT ?
  `).all(limit);
  
  res.json({ ok: true, redenzioni: rows });
});

module.exports = router;
