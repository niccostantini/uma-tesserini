const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { db, tx } = require('../db');
const { httpError } = require('../utils/errors');
const crypto = require('crypto');

// Configurazione multer per upload temporanei
const upload = multer({ 
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Solo file CSV sono accettati'));
    }
  }
});

// Funzione per parsare CSV
function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/);
  const headers = raw[0].split(',').map(h => h.trim());
  return raw.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => obj[h] = (vals[i] ?? '').trim());
    return obj;
  });
}

// POST /import/persone - Import CSV persone
router.post('/persone', upload.single('csv'), (req, res) => {
  if (!req.file) {
    return httpError(res, 400, 'file_richiesto');
  }

  try {
    const data = parseCSV(req.file.path);
    let importate = 0;
    let errori = [];

    const result = tx(db => {
      for (const row of data) {
        try {
          const { id, nome, categoria, data_nascita, residenza, doc_verificato } = row;
          
          if (!nome || !categoria) {
            errori.push(`Riga ${importate + 1}: nome e categoria sono obbligatori`);
            continue;
          }

          const validCategorie = ['studente', 'docente', 'strumentista', 'urbinate_u18_o70', 'altro'];
          if (!validCategorie.includes(categoria)) {
            errori.push(`Riga ${importate + 1}: categoria non valida: ${categoria}`);
            continue;
          }

          const personaId = id && id.length > 0 ? id : crypto.randomUUID();
          const docVerificato = doc_verificato === 'true' || doc_verificato === '1' ? 1 : 0;

          db.prepare(`
            INSERT OR REPLACE INTO persone (id, nome, categoria, data_nascita, residenza, doc_verificato)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(personaId, nome, categoria, data_nascita || null, residenza || null, docVerificato);
          
          importate++;
        } catch (error) {
          errori.push(`Riga ${importate + 1}: ${error.message}`);
        }
      }
      
      return { importate, errori };
    });

    // Rimuovi file temporaneo
    fs.unlinkSync(req.file.path);

    res.json({ 
      ok: true, 
      importate: result.importate, 
      errori: result.errori 
    });

  } catch (error) {
    // Rimuovi file temporaneo in caso di errore
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Errore import persone:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

// POST /import/tesserini - Import CSV tesserini
router.post('/tesserini', upload.single('csv'), (req, res) => {
  if (!req.file) {
    return httpError(res, 400, 'file_richiesto');
  }

  try {
    const data = parseCSV(req.file.path);
    let importati = 0;
    let errori = [];

    const result = tx(db => {
      for (const row of data) {
        try {
          const { id, persona_id, stato, qr_text, exp_date } = row;
          
          if (!persona_id || !qr_text || !exp_date) {
            errori.push(`Riga ${importati + 1}: persona_id, qr_text e exp_date sono obbligatori`);
            continue;
          }

          // Verifica che la persona esista
          const persona = db.prepare('SELECT id FROM persone WHERE id = ?').get(persona_id);
          if (!persona) {
            errori.push(`Riga ${importati + 1}: persona non trovata: ${persona_id}`);
            continue;
          }

          const validStati = ['attivo', 'revocato'];
          const statoFinal = validStati.includes(stato) ? stato : 'attivo';

          const tesserinId = id && id.length > 0 ? id : crypto.randomUUID();

          db.prepare(`
            INSERT OR REPLACE INTO tesserini (id, persona_id, stato, qr_text, exp_date)
            VALUES (?, ?, ?, ?, ?)
          `).run(tesserinId, persona_id, statoFinal, qr_text, exp_date);
          
          importati++;
        } catch (error) {
          errori.push(`Riga ${importati + 1}: ${error.message}`);
        }
      }
      
      return { importati, errori };
    });

    // Rimuovi file temporaneo
    fs.unlinkSync(req.file.path);

    res.json({ 
      ok: true, 
      importati: result.importati, 
      errori: result.errori 
    });

  } catch (error) {
    // Rimuovi file temporaneo in caso di errore
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Errore import tesserini:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

// POST /import/eventi - Import CSV eventi
router.post('/eventi', upload.single('csv'), (req, res) => {
  if (!req.file) {
    return httpError(res, 400, 'file_richiesto');
  }

  try {
    const data = parseCSV(req.file.path);
    let importati = 0;
    let errori = [];

    const result = tx(db => {
      for (const row of data) {
        try {
          const { id, nome, data, luogo, prezzo_intero } = row;
          
          if (!nome || !data) {
            errori.push(`Riga ${importati + 1}: nome e data sono obbligatori`);
            continue;
          }

          const eventoId = id && id.length > 0 ? id : crypto.randomUUID();
          const prezzo = prezzo_intero && !isNaN(parseFloat(prezzo_intero)) ? parseFloat(prezzo_intero) : 20.0;

          db.prepare(`
            INSERT OR REPLACE INTO eventi (id, nome, data, luogo, prezzo_intero)
            VALUES (?, ?, ?, ?, ?)
          `).run(eventoId, nome, data, luogo || null, prezzo);
          
          importati++;
        } catch (error) {
          errori.push(`Riga ${importati + 1}: ${error.message}`);
        }
      }
      
      return { importati, errori };
    });

    // Rimuovi file temporaneo
    fs.unlinkSync(req.file.path);

    res.json({ 
      ok: true, 
      importati: result.importati, 
      errori: result.errori 
    });

  } catch (error) {
    // Rimuovi file temporaneo in caso di errore
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Errore import eventi:', error);
    return httpError(res, 500, 'errore_interno');
  }
});

module.exports = router;
