/**
 * REPOSITORY PER LA GESTIONE DEGLI EVENTI
 * =====================================
 * 
 * Questo modulo centralizza tutte le operazioni di accesso ai dati
 * relative agli eventi del festival.
 */

const { selectOne, selectMany, execute } = require('../db');
const { DEFAULT_EVENT_PRICE } = require('../config/constants');

/**
 * Repository per la gestione degli eventi
 * @class EventiRepository
 */
class EventiRepository {
  
  /**
   * Ottiene tutti gli eventi ordinati per data
   * 
   * @param {Object} filters - Filtri opzionali
   * @param {string} [filters.search] - Ricerca nel nome evento
   * @param {string} [filters.dataInizio] - Data inizio filtro
   * @param {string} [filters.dataFine] - Data fine filtro
   * @param {string} [filters.luogo] - Filtro per luogo
   * @returns {Array} Lista degli eventi
   */
  async findAll(filters = {}) {
    const { search, dataInizio, dataFine, luogo } = filters;
    
    let query = `
      SELECT e.*, 
             COUNT(v.id) AS vendite_count,
             SUM(v.prezzo_pagato) AS incasso
      FROM eventi e
      LEFT JOIN vendite v ON e.id = v.evento_id
    `;
    
    const conditions = [];
    const params = [];
    
    // Filtro ricerca nome
    if (search && search.trim()) {
      conditions.push('e.nome LIKE ?');
      params.push(`%${search.trim()}%`);
    }
    
    // Filtro data inizio
    if (dataInizio) {
      conditions.push('e.data >= ?');
      params.push(dataInizio);
    }
    
    // Filtro data fine
    if (dataFine) {
      conditions.push('e.data <= ?');
      params.push(dataFine);
    }
    
    // Filtro luogo
    if (luogo && luogo.trim()) {
      conditions.push('e.luogo LIKE ?');
      params.push(`%${luogo.trim()}%`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' GROUP BY e.id ORDER BY e.data ASC';
    
    return selectMany(query, params);
  }
  
  /**
   * Trova un evento per ID
   * 
   * @param {string} id - ID dell'evento
   * @returns {Object|null} Evento o null se non trovato
   */
  async findById(id) {
    return selectOne('SELECT * FROM eventi WHERE id = ?', [id]);
  }
  
  /**
   * Trova un evento con statistiche di vendita
   * 
   * @param {string} id - ID dell'evento
   * @returns {Object|null} Evento con statistiche o null
   */
  async findByIdWithStats(id) {
    const evento = await this.findById(id);
    
    if (!evento) return null;
    
    const stats = selectOne(`
      SELECT COUNT(v.id) AS vendite,
             SUM(v.prezzo_pagato) AS incasso,
             COUNT(DISTINCT te.persona_id) AS persone_uniche,
             COUNT(r.id) AS redenzioni
      FROM eventi e
      LEFT JOIN vendite v ON e.id = v.evento_id
      LEFT JOIN tesserini te ON v.tesserino_id = te.id
      LEFT JOIN redenzioni r ON e.id = r.evento_id AND r.esito = 'ok'
      WHERE e.id = ?
    `, [id]);
    
    return {
      ...evento,
      stats: stats || { vendite: 0, incasso: 0, persone_uniche: 0, redenzioni: 0 }
    };
  }
  
  /**
   * Crea un nuovo evento
   * 
   * @param {Object} eventoData - Dati dell'evento
   * @param {string} eventoData.id - ID dell'evento (UUID)
   * @param {string} eventoData.nome - Nome dell'evento
   * @param {string} eventoData.data - Data evento in formato YYYY-MM-DD
   * @param {string} [eventoData.luogo] - Luogo dell'evento
   * @param {number} [eventoData.prezzo_intero] - Prezzo intero del biglietto
   * @returns {Object} Risultato dell'inserimento
   */
  async create(eventoData) {
    const { 
      id, 
      nome, 
      data, 
      luogo, 
      prezzo_intero = DEFAULT_EVENT_PRICE 
    } = eventoData;
    
    return execute(`
      INSERT INTO eventi (id, nome, data, luogo, prezzo_intero)
      VALUES (?, ?, ?, ?, ?)
    `, [id, nome, data, luogo || null, prezzo_intero]);
  }
  
  /**
   * Aggiorna un evento esistente
   * 
   * @param {string} id - ID dell'evento
   * @param {Object} updates - Dati da aggiornare
   * @returns {Object} Risultato dell'aggiornamento
   */
  async update(id, updates) {
    const allowedFields = ['nome', 'data', 'luogo', 'prezzo_intero'];
    const fields = [];
    const params = [];
    
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key) && updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(updates[key]);
      }
    });
    
    if (fields.length === 0) {
      throw new Error('Nessun campo valido da aggiornare');
    }
    
    params.push(id);
    
    return execute(`
      UPDATE eventi 
      SET ${fields.join(', ')} 
      WHERE id = ?
    `, params);
  }
  
  /**
   * Verifica se un evento esiste
   * 
   * @param {string} id - ID dell'evento
   * @returns {boolean} True se l'evento esiste
   */
  async exists(id) {
    const result = selectOne('SELECT 1 FROM eventi WHERE id = ? LIMIT 1', [id]);
    return !!result;
  }
  
  /**
   * Ottiene eventi futuri (a partire da oggi)
   * 
   * @returns {Array} Lista eventi futuri
   */
  async findFuturi() {
    const oggi = new Date().toISOString().slice(0, 10);
    
    return selectMany(`
      SELECT * FROM eventi 
      WHERE data >= ? 
      ORDER BY data ASC
    `, [oggi]);
  }
  
  /**
   * Ottiene eventi passati
   * 
   * @returns {Array} Lista eventi passati
   */
  async findPassati() {
    const oggi = new Date().toISOString().slice(0, 10);
    
    return selectMany(`
      SELECT e.*, 
             COUNT(v.id) AS vendite,
             SUM(v.prezzo_pagato) AS incasso
      FROM eventi e
      LEFT JOIN vendite v ON e.id = v.evento_id
      WHERE e.data < ? 
      GROUP BY e.id
      ORDER BY e.data DESC
    `, [oggi]);
  }
  
  /**
   * Importa o aggiorna un evento (per import CSV)
   * 
   * @param {Object} eventoData - Dati dell'evento
   * @returns {Object} Risultato dell'operazione
   */
  async upsert(eventoData) {
    const { id, nome, data, luogo, prezzo_intero = DEFAULT_EVENT_PRICE } = eventoData;
    
    return execute(`
      INSERT OR REPLACE INTO eventi (id, nome, data, luogo, prezzo_intero)
      VALUES (?, ?, ?, ?, ?)
    `, [id, nome, data, luogo || null, prezzo_intero]);
  }
  
  /**
   * Ottiene statistiche generali sugli eventi
   * 
   * @returns {Object} Statistiche eventi
   */
  async getStats() {
    const stats = selectOne(`
      SELECT COUNT(*) AS totale_eventi,
             COUNT(CASE WHEN data >= date('now') THEN 1 END) AS eventi_futuri,
             COUNT(CASE WHEN data < date('now') THEN 1 END) AS eventi_passati,
             AVG(prezzo_intero) AS prezzo_medio,
             MIN(data) AS primo_evento,
             MAX(data) AS ultimo_evento
      FROM eventi
    `);
    
    return stats || {};
  }
  
  /**
   * Ottiene gli eventi più venduti
   * 
   * @param {number} [limit=10] - Limite risultati
   * @returns {Array} Lista eventi ordinati per numero vendite
   */
  async findPiuVenduti(limit = 10) {
    return selectMany(`
      SELECT e.*, 
             COUNT(v.id) AS vendite,
             SUM(v.prezzo_pagato) AS incasso
      FROM eventi e
      LEFT JOIN vendite v ON e.id = v.evento_id
      GROUP BY e.id
      ORDER BY vendite DESC
      LIMIT ?
    `, [limit]);
  }
  
  /**
   * Cerca eventi per nome
   * 
   * @param {string} nomeEvento - Nome o parte di nome da cercare
   * @param {number} [limit=10] - Limite risultati
   * @returns {Array} Eventi che corrispondono alla ricerca
   */
  async searchByName(nomeEvento, limit = 10) {
    return selectMany(`
      SELECT id, nome, data, luogo, prezzo_intero
      FROM eventi 
      WHERE nome LIKE ?
      ORDER BY data ASC
      LIMIT ?
    `, [`%${nomeEvento}%`, limit]);
  }
  
  /**
   * Elimina un evento (solo se non ha vendite associate)
   * 
   * @param {string} id - ID dell'evento
   * @returns {Object} Risultato dell'eliminazione
   * @throws {Error} Se l'evento ha vendite associate
   */
  async delete(id) {
    // Verifica che non ci siano vendite associate
    const venditeCount = selectOne(`
      SELECT COUNT(*) as count FROM vendite WHERE evento_id = ?
    `, [id]);
    
    if (venditeCount.count > 0) {
      throw new Error('Impossibile eliminare: evento ha vendite associate');
    }
    
    return execute('DELETE FROM eventi WHERE id = ?', [id]);
  }
}

module.exports = new EventiRepository();
