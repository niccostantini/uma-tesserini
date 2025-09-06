/**
 * REPOSITORY PER LA GESTIONE DELLE VENDITE E REDENZIONI
 * ==================================================
 * 
 * Questo modulo centralizza tutte le operazioni di accesso ai dati
 * relative alle vendite di biglietti e alle redenzioni.
 */

const { selectOne, selectMany, execute } = require('../db');

/**
 * Repository per la gestione delle vendite
 * @class VenditeRepository
 */
class VenditeRepository {
  
  /**
   * Ottiene il prezzo per un tesserino e evento specifico
   * Considera la tariffa della categoria della persona o il prezzo intero dell'evento
   * 
   * @param {string} tesserinId - ID del tesserino
   * @param {string} eventoId - ID dell'evento
   * @returns {number|null} Prezzo da applicare o null se non trovato
   */
  async getPrezzoForTesserinEvento(tesserinId, eventoId) {
    const result = selectOne(`
      SELECT COALESCE((
        SELECT ta.prezzo
        FROM tesserini te
        JOIN persone pe ON pe.id = te.persona_id
        JOIN tariffe ta ON ta.categoria = pe.categoria
        WHERE te.id = ?
      ), (SELECT prezzo_intero FROM eventi WHERE id = ?)) AS prezzo
    `, [tesserinId, eventoId]);
    
    return result ? result.prezzo : null;
  }
  
  /**
   * Verifica se esiste già una redenzione per tesserino-evento
   * 
   * @param {string} tesserinId - ID del tesserino
   * @param {string} eventoId - ID dell'evento
   * @returns {Object|null} Redenzione esistente o null
   */
  async findExistingRedenzione(tesserinId, eventoId) {
    return selectOne(`
      SELECT id, esito, timestamp 
      FROM redenzioni 
      WHERE tesserino_id = ? AND evento_id = ?
    `, [tesserinId, eventoId]);
  }
  
  /**
   * Crea una nuova vendita
   * 
   * @param {Object} venditeData - Dati della vendita
   * @param {string} venditeData.id - ID della vendita (UUID)
   * @param {string} venditeData.tesserino_id - ID del tesserino
   * @param {string} venditeData.evento_id - ID dell'evento
   * @param {number} venditeData.prezzo_pagato - Prezzo pagato
   * @param {string} [venditeData.cassa_id] - ID della cassa
   * @returns {Object} Risultato dell'inserimento
   */
  async createVendita(venditeData) {
    const { id, tesserino_id, evento_id, prezzo_pagato, cassa_id = 'cassa1' } = venditeData;
    
    return execute(`
      INSERT INTO vendite (id, tesserino_id, evento_id, prezzo_pagato, cassa_id)
      VALUES (?, ?, ?, ?, ?)
    `, [id, tesserino_id, evento_id, prezzo_pagato, cassa_id]);
  }
  
  /**
   * Crea una nuova redenzione
   * 
   * @param {Object} redenzioneData - Dati della redenzione
   * @param {string} redenzioneData.id - ID della redenzione (UUID)
   * @param {string} redenzioneData.tesserino_id - ID del tesserino
   * @param {string} redenzioneData.evento_id - ID dell'evento
   * @param {string} redenzioneData.operatore - Nome operatore
   * @param {string} [redenzioneData.esito='ok'] - Esito della redenzione
   * @returns {Object} Risultato dell'inserimento
   */
  async createRedenzione(redenzioneData) {
    const { id, tesserino_id, evento_id, operatore, esito = 'ok' } = redenzioneData;
    
    return execute(`
      INSERT INTO redenzioni (id, tesserino_id, evento_id, operatore, esito)
      VALUES (?, ?, ?, ?, ?)
    `, [id, tesserino_id, evento_id, operatore, esito]);
  }
  
  /**
   * Ottiene tutte le redenzioni con informazioni di tesserino ed evento
   * 
   * @param {Object} filters - Filtri opzionali
   * @param {string} [filters.tesserino_id] - Filtro per tesserino
   * @param {string} [filters.evento_id] - Filtro per evento
   * @param {string} [filters.operatore] - Filtro per operatore
   * @param {number} [filters.limit] - Limite risultati
   * @returns {Array} Lista redenzioni
   */
  async findAllRedenzioni(filters = {}) {
    const { tesserino_id, evento_id, operatore, limit } = filters;
    
    let query = `
      SELECT r.*, 
             te.id AS tesserino_id, 
             ev.nome AS evento_nome,
             ev.data AS evento_data,
             p.nome AS persona_nome
      FROM redenzioni r
      JOIN tesserini te ON te.id = r.tesserino_id
      JOIN eventi ev ON ev.id = r.evento_id
      JOIN persone p ON p.id = te.persona_id
    `;
    
    const conditions = [];
    const params = [];
    
    if (tesserino_id) {
      conditions.push('r.tesserino_id = ?');
      params.push(tesserino_id);
    }
    
    if (evento_id) {
      conditions.push('r.evento_id = ?');
      params.push(evento_id);
    }
    
    if (operatore) {
      conditions.push('r.operatore LIKE ?');
      params.push(`%${operatore}%`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY r.timestamp DESC';
    
    if (limit && limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }
    
    return selectMany(query, params);
  }
  
  /**
   * Ottiene statistiche vendite per giornata
   * 
   * @param {Object} filters - Filtri opzionali
   * @param {string} [filters.dataInizio] - Data inizio in formato YYYY-MM-DD
   * @param {string} [filters.dataFine] - Data fine in formato YYYY-MM-DD
   * @returns {Array} Report vendite per giorno
   */
  async getReportGiornaliero(filters = {}) {
    const { dataInizio, dataFine } = filters;
    
    let query = `
      SELECT date(v.timestamp) AS giorno,
             SUM(CASE WHEN pe.categoria='studente' THEN 1 ELSE 0 END) AS n_studenti,
             SUM(CASE WHEN pe.categoria='docente' THEN 1 ELSE 0 END) AS n_docenti,
             SUM(CASE WHEN pe.categoria='strumentista' THEN 1 ELSE 0 END) AS n_strumentisti,
             SUM(CASE WHEN pe.categoria='urbinate_u18_o70' THEN 1 ELSE 0 END) AS n_urbinati,
             SUM(CASE WHEN pe.categoria='altro' THEN 1 ELSE 0 END) AS n_altro,
             SUM(v.prezzo_pagato) AS incasso,
             COUNT(*) AS totale_vendite
      FROM vendite v
      JOIN tesserini te ON te.id = v.tesserino_id
      JOIN persone pe ON pe.id = te.persona_id
    `;
    
    const conditions = [];
    const params = [];
    
    if (dataInizio) {
      conditions.push('date(v.timestamp) >= ?');
      params.push(dataInizio);
    }
    
    if (dataFine) {
      conditions.push('date(v.timestamp) <= ?');
      params.push(dataFine);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ` 
      GROUP BY giorno 
      ORDER BY giorno DESC
    `;\n    \n    return selectMany(query, params);\n  }\n  \n  /**\n   * Ottiene statistiche vendite per evento\n   * \n   * @returns {Array} Report vendite per evento\n   */\n  async getReportPerEvento() {\n    return selectMany(`\n      SELECT ev.nome AS evento,\n             ev.data AS data_evento,\n             COUNT(v.id) AS vendite,\n             SUM(v.prezzo_pagato) AS incasso,\n             AVG(v.prezzo_pagato) AS prezzo_medio\n      FROM eventi ev\n      LEFT JOIN vendite v ON v.evento_id = ev.id\n      GROUP BY ev.id, ev.nome, ev.data\n      ORDER BY ev.data DESC\n    `);\n  }\n  \n  /**\n   * Ottiene le vendite di una specifica giornata\n   * \n   * @param {string} data - Data in formato YYYY-MM-DD\n   * @returns {Array} Vendite della giornata\n   */\n  async getVenditeByDate(data) {\n    return selectMany(`\n      SELECT v.timestamp,\n             v.prezzo_pagato,\n             v.cassa_id,\n             ev.nome AS evento,\n             p.nome AS persona,\n             p.categoria\n      FROM vendite v\n      JOIN tesserini te ON te.id = v.tesserino_id\n      JOIN persone p ON p.id = te.persona_id\n      JOIN eventi ev ON ev.id = v.evento_id\n      WHERE date(v.timestamp) = ?\n      ORDER BY v.timestamp DESC\n    `, [data]);\n  }\n  \n  /**\n   * Ottiene le vendite per una specifica cassa\n   * \n   * @param {string} cassaId - ID della cassa\n   * @param {string} [data] - Data opzionale in formato YYYY-MM-DD\n   * @returns {Array} Vendite della cassa\n   */\n  async getVenditeByCassa(cassaId, data = null) {\n    let query = `\n      SELECT v.timestamp,\n             v.prezzo_pagato,\n             ev.nome AS evento,\n             p.nome AS persona,\n             p.categoria\n      FROM vendite v\n      JOIN tesserini te ON te.id = v.tesserino_id\n      JOIN persone p ON p.id = te.persona_id\n      JOIN eventi ev ON ev.id = v.evento_id\n      WHERE v.cassa_id = ?\n    `;\n    \n    const params = [cassaId];\n    \n    if (data) {\n      query += ' AND date(v.timestamp) = ?';\n      params.push(data);\n    }\n    \n    query += ' ORDER BY v.timestamp DESC';\n    \n    return selectMany(query, params);\n  }\n  \n  /**\n   * Ottiene statistiche totali delle vendite\n   * \n   * @returns {Object} Statistiche generali\n   */\n  async getStatsTotali() {\n    const venditeStats = selectOne(`\n      SELECT COUNT(*) AS totale_vendite,\n             SUM(prezzo_pagato) AS incasso_totale,\n             AVG(prezzo_pagato) AS prezzo_medio,\n             MIN(timestamp) AS prima_vendita,\n             MAX(timestamp) AS ultima_vendita\n      FROM vendite\n    `);\n    \n    const redenzioniStats = selectOne(`\n      SELECT COUNT(*) AS totale_redenzioni,\n             COUNT(CASE WHEN esito = 'ok' THEN 1 END) AS redenzioni_ok,\n             COUNT(CASE WHEN esito != 'ok' THEN 1 END) AS redenzioni_ko\n      FROM redenzioni\n    `);\n    \n    return {\n      vendite: venditeStats || {},\n      redenzioni: redenzioniStats || {}\n    };\n  }\n  \n  /**\n   * Verifica se un tesserino ha già una vendita per un evento\n   * \n   * @param {string} tesserinId - ID del tesserino\n   * @param {string} eventoId - ID dell'evento\n   * @returns {boolean} True se esiste già una vendita\n   */\n  async hasVenditaForTesserinEvento(tesserinId, eventoId) {\n    const result = selectOne(`\n      SELECT 1 FROM vendite \n      WHERE tesserino_id = ? AND evento_id = ?\n      LIMIT 1\n    `, [tesserinId, eventoId]);\n    \n    return !!result;\n  }\n}\n\nmodule.exports = new VenditeRepository();
