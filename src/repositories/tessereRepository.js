/**
 * REPOSITORY PER LA GESTIONE DEI TESSERINI
 * =======================================
 * 
 * Questo modulo centralizza tutte le operazioni di accesso ai dati
 * relative ai tesserini, isolando la logica SQL dalle route.
 */

const { db, selectOne, selectMany, execute } = require('../db');
const { STATI_TESSERINO } = require('../config/constants');

/**
 * Repository per la gestione dei tesserini
 * @class TessereRepository
 */
class TessereRepository {
  
  /**
   * Ottiene tutti i tesserini con informazioni delle persone
   * 
   * @param {Object} filters - Filtri di ricerca
   * @param {string} [filters.search] - Testo da cercare in nome o ID tesserino
   * @param {string} [filters.sortBy='created_at'] - Campo per ordinamento
   * @param {string} [filters.sortOrder='desc'] - Direzione ordinamento (asc/desc)
   * @returns {Array} Lista dei tesserini
   */
  async findAll(filters = {}) {
    const { search, sortBy = 'created_at', sortOrder = 'desc' } = filters;
    
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
    
    if (sortField === 'nome') {
      query += ` ORDER BY p.nome ${order}`;
    } else {
      query += ` ORDER BY t.${sortField} ${order}`;
    }
    
    return selectMany(query, params);
  }
  
  /**
   * Trova un tesserino per ID con informazioni della persona e eventi
   * 
   * @param {string} id - ID del tesserino
   * @returns {Object|null} Tesserino con dettagli o null se non trovato
   */
  async findById(id) {
    const tessera = selectOne(`
      SELECT te.id, te.persona_id, te.stato, te.exp_date, te.created_at,
             pe.nome, pe.categoria, pe.doc_verificato
      FROM tesserini te
      JOIN persone pe ON pe.id = te.persona_id
      WHERE te.id = ?
    `, [id]);
    
    if (!tessera) return null;
    
    // Ottieni gli eventi e stato di redenzione per questo tesserino
    // Una redenzione è considerata valida solo se non è stata annullata
    const eventi = selectMany(`
      SELECT ev.id as evento_id, ev.nome, ev.data,
             EXISTS(
               SELECT 1 FROM redenzioni r 
               WHERE r.tesserino_id = ? AND r.evento_id = ev.id 
                 AND r.esito = 'ok' AND r.annullata = 0
             ) AS redento
      FROM eventi ev
    `, [id]);
    
    return {
      tessera,
      eventi
    };
  }
  
  /**
   * Trova un tesserino per ID (solo informazioni base)
   * 
   * @param {string} id - ID del tesserino
   * @returns {Object|null} Tesserino o null se non trovato
   */
  async findByIdSimple(id) {
    return selectOne('SELECT * FROM tesserini WHERE id = ?', [id]);
  }
  
  /**
   * Verifica se una persona ha già un tesserino attivo
   * 
   * @param {string} personaId - ID della persona
   * @returns {Object|null} Tesserino attivo esistente o null
   */
  async findActiveTesseraByPersonaId(personaId) {
    return selectOne(`
      SELECT id FROM tesserini 
      WHERE persona_id = ? AND stato = 'attivo'
    `, [personaId]);
  }
  
  /**
   * Crea un nuovo tesserino
   * 
   * @param {Object} tesseraData - Dati del tesserino
   * @param {string} tesseraData.id - ID del tesserino (UUID)
   * @param {string} tesseraData.persona_id - ID della persona
   * @param {string} tesseraData.stato - Stato del tesserino
   * @param {string} tesseraData.qr_text - Testo del QR code
   * @param {string} tesseraData.exp_date - Data di scadenza
   * @returns {Object} Risultato dell'inserimento
   */
  async create(tesseraData) {
    const { id, persona_id, stato, qr_text, exp_date } = tesseraData;
    
    return execute(`
      INSERT INTO tesserini (id, persona_id, stato, qr_text, exp_date) 
      VALUES (?, ?, ?, ?, ?)
    `, [id, persona_id, stato, qr_text, exp_date]);
  }
  
  /**
   * Aggiorna lo stato di un tesserino
   * 
   * @param {string} id - ID del tesserino
   * @param {string} nuovoStato - Nuovo stato del tesserino
   * @returns {Object} Risultato dell'aggiornamento
   */
  async updateStato(id, nuovoStato) {
    if (!STATI_TESSERINO.includes(nuovoStato)) {
      throw new Error(`Stato non valido: ${nuovoStato}`);
    }
    
    return execute('UPDATE tesserini SET stato = ? WHERE id = ?', [nuovoStato, id]);
  }
  
  /**
   * Revoca un tesserino (imposta stato a 'revocato')
   * 
   * @param {string} id - ID del tesserino
   * @returns {Object} Risultato dell'aggiornamento
   */
  async revoke(id) {
    return this.updateStato(id, 'revocato');
  }
  
  /**
   * Verifica se un tesserino esiste ed è attivo
   * 
   * @param {string} id - ID del tesserino
   * @returns {Object} Risultato della verifica
   */
  async checkStatus(id) {
    const tessera = selectOne('SELECT id, stato FROM tesserini WHERE id = ?', [id]);
    
    return {
      exists: !!tessera,
      tessera: tessera,
      isActive: tessera ? tessera.stato === 'attivo' : false,
      isRevoked: tessera ? tessera.stato === 'revocato' : false
    };
  }
  
  /**
   * Conta i tesserini per stato
   * 
   * @returns {Object} Statistiche sui tesserini
   */
  async getStats() {
    const stats = selectMany(`
      SELECT stato, COUNT(*) as count 
      FROM tesserini 
      GROUP BY stato
    `);
    
    const result = { attivo: 0, revocato: 0, totale: 0 };
    
    stats.forEach(stat => {
      result[stat.stato] = stat.count;
      result.totale += stat.count;
    });
    
    return result;
  }
  
  /**
   * Trova tesserini in scadenza
   * 
   * @param {number} giorni - Giorni dalla data corrente per considerare "in scadenza"
   * @returns {Array} Lista tesserini in scadenza
   */
  async findExpiring(giorni = 30) {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() + giorni);
    const dataLimiteStr = dataLimite.toISOString().slice(0, 10);
    
    return selectMany(`
      SELECT t.id, t.exp_date, p.nome, p.categoria
      FROM tesserini t
      JOIN persone p ON t.persona_id = p.id
      WHERE t.stato = 'attivo' AND t.exp_date <= ?
      ORDER BY t.exp_date ASC
    `, [dataLimiteStr]);
  }
  
  /**
   * Elimina un tesserino (soft delete impostando stato)
   * 
   * @param {string} id - ID del tesserino
   * @returns {Object} Risultato dell'operazione
   */
  async delete(id) {
    // Per sicurezza, non eliminiamo fisicamente ma revochi
    return this.revoke(id);
  }
}

module.exports = new TessereRepository();
