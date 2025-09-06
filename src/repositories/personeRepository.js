/**
 * REPOSITORY PER LA GESTIONE DELLE PERSONE
 * ======================================
 * 
 * Questo modulo centralizza tutte le operazioni di accesso ai dati
 * relative alle persone, isolando la logica SQL dalle route.
 */

const { selectOne, selectMany, execute } = require('../db');
const { CATEGORIE_PERSONE } = require('../config/constants');

/**
 * Repository per la gestione delle persone
 * @class PersoneRepository
 */
class PersoneRepository {
  
  /**
   * Trova tutte le persone con filtri avanzati
   * 
   * @param {Object} filters - Filtri di ricerca
   * @param {string} [filters.search] - Ricerca nel nome
   * @param {string} [filters.id] - Ricerca nell'ID
   * @param {string} [filters.categoria] - Filtro per categoria
   * @param {string} [filters.data_nascita] - Filtro per data di nascita
   * @param {string} [filters.residenza] - Ricerca nella residenza
   * @param {boolean} [filters.doc_verificato] - Filtro per documento verificato
   * @returns {Array} Lista delle persone con informazioni tessere
   */
  async findAll(filters = {}) {
    const { search, id, categoria, data_nascita, residenza, doc_verificato } = filters;
    
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
    
    // Filtro nome
    if (search && search.trim()) {
      conditions.push('p.nome LIKE ?');
      params.push(`%${search.trim()}%`);
    }
    
    // Filtro ID
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
    
    return selectMany(query, params);
  }
  
  /**
   * Trova una persona per ID
   * 
   * @param {string} id - ID della persona
   * @returns {Object|null} Persona o null se non trovata
   */
  async findById(id) {
    return selectOne('SELECT * FROM persone WHERE id = ?', [id]);
  }
  
  /**
   * Trova una persona per ID con informazioni tessera attiva
   * 
   * @param {string} id - ID della persona
   * @returns {Object|null} Persona con tessera attiva o null
   */
  async findByIdWithTessera(id) {
    const persona = await this.findById(id);
    
    if (!persona) return null;
    
    // Cerca tessera attiva
    const tesseraAttiva = selectOne(`
      SELECT id, stato, exp_date, created_at
      FROM tesserini 
      WHERE persona_id = ? AND stato = 'attivo'
    `, [id]);
    
    return {
      persona,
      tessera_attiva: tesseraAttiva || null
    };
  }
  
  /**
   * Crea una nuova persona
   * 
   * @param {Object} personaData - Dati della persona
   * @param {string} personaData.id - ID della persona (UUID)
   * @param {string} personaData.nome - Nome completo
   * @param {string} personaData.categoria - Categoria persona
   * @param {string} [personaData.data_nascita] - Data di nascita
   * @param {string} [personaData.residenza] - Residenza
   * @param {boolean} [personaData.doc_verificato] - Documento verificato
   * @returns {Object} Risultato dell'inserimento
   */
  async create(personaData) {
    const { 
      id, 
      nome, 
      categoria, 
      data_nascita, 
      residenza, 
      doc_verificato 
    } = personaData;
    
    // Validazione categoria
    if (!CATEGORIE_PERSONE.includes(categoria)) {
      throw new Error(`Categoria non valida: ${categoria}`);
    }
    
    return execute(`
      INSERT INTO persone (id, nome, categoria, data_nascita, residenza, doc_verificato)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, nome, categoria, data_nascita || null, residenza || null, doc_verificato ? 1 : 0]);
  }
  
  /**
   * Aggiorna una persona esistente
   * 
   * @param {string} id - ID della persona
   * @param {Object} updates - Dati da aggiornare
   * @returns {Object} Risultato dell'aggiornamento
   */
  async update(id, updates) {
    const allowedFields = ['nome', 'categoria', 'data_nascita', 'residenza', 'doc_verificato'];
    const fields = [];
    const params = [];
    
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key) && updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        
        // Conversione speciale per doc_verificato
        if (key === 'doc_verificato') {
          params.push(updates[key] ? 1 : 0);
        } else {
          params.push(updates[key]);
        }
      }
    });
    
    if (fields.length === 0) {
      throw new Error('Nessun campo valido da aggiornare');
    }
    
    // Validazione categoria se presente
    if (updates.categoria && !CATEGORIE_PERSONE.includes(updates.categoria)) {
      throw new Error(`Categoria non valida: ${updates.categoria}`);
    }
    
    params.push(id); // Per la WHERE clause
    
    return execute(`
      UPDATE persone 
      SET ${fields.join(', ')} 
      WHERE id = ?
    `, params);
  }
  
  /**
   * Verifica se una persona esiste
   * 
   * @param {string} id - ID della persona
   * @returns {boolean} True se la persona esiste
   */
  async exists(id) {
    const result = selectOne('SELECT 1 FROM persone WHERE id = ? LIMIT 1', [id]);
    return !!result;
  }
  
  /**
   * Cerca persone per nome parziale
   * 
   * @param {string} nomeParzialle - Parte del nome da cercare
   * @param {number} [limit=10] - Limite risultati
   * @returns {Array} Lista persone che corrispondono alla ricerca
   */
  async searchByName(nomeParzialle, limit = 10) {
    return selectMany(`
      SELECT id, nome, categoria, doc_verificato
      FROM persone 
      WHERE nome LIKE ?
      ORDER BY nome
      LIMIT ?
    `, [`%${nomeParzialle}%`, limit]);
  }
  
  /**
   * Ottiene statistiche sulle persone
   * 
   * @returns {Object} Statistiche per categoria
   */
  async getStats() {
    const stats = selectMany(`
      SELECT categoria, COUNT(*) as count 
      FROM persone 
      GROUP BY categoria
    `);
    
    const result = {
      studente: 0,
      docente: 0,
      strumentista: 0,
      urbinate_u18_o70: 0,
      altro: 0,
      totale: 0
    };
    
    stats.forEach(stat => {
      result[stat.categoria] = stat.count;
      result.totale += stat.count;
    });
    
    return result;
  }
  
  /**
   * Ottiene persone senza tesserino attivo
   * 
   * @returns {Array} Lista persone senza tesserino
   */
  async findWithoutActiveTessera() {
    return selectMany(`
      SELECT p.id, p.nome, p.categoria, p.doc_verificato
      FROM persone p
      WHERE NOT EXISTS (
        SELECT 1 FROM tesserini t 
        WHERE t.persona_id = p.id AND t.stato = 'attivo'
      )
      ORDER BY p.nome
    `);
  }
  
  /**
   * Verifica se una persona ha documento verificato
   * 
   * @param {string} id - ID della persona
   * @returns {boolean} True se il documento è verificato
   */
  async hasVerifiedDocument(id) {
    const result = selectOne('SELECT doc_verificato FROM persone WHERE id = ?', [id]);
    return result ? !!result.doc_verificato : false;
  }
  
  /**
   * Importa o aggiorna una persona (per import CSV)
   * 
   * @param {Object} personaData - Dati della persona
   * @returns {Object} Risultato dell'operazione
   */
  async upsert(personaData) {
    const { id, nome, categoria, data_nascita, residenza, doc_verificato } = personaData;
    
    return execute(`
      INSERT OR REPLACE INTO persone (id, nome, categoria, data_nascita, residenza, doc_verificato)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, nome, categoria, data_nascita || null, residenza || null, doc_verificato ? 1 : 0]);
  }
  
  /**
   * Elimina una persona (solo se non ha tesserini)
   * 
   * @param {string} id - ID della persona
   * @returns {Object} Risultato dell'eliminazione
   * @throws {Error} Se la persona ha tesserini associati
   */
  async delete(id) {
    // Verifica che non ci siano tesserini associati
    const tesserinoCount = selectOne(`
      SELECT COUNT(*) as count FROM tesserini WHERE persona_id = ?
    `, [id]);
    
    if (tesserinoCount.count > 0) {
      throw new Error('Impossibile eliminare: persona ha tesserini associati');
    }
    
    return execute('DELETE FROM persone WHERE id = ?', [id]);
  }
}

module.exports = new PersoneRepository();
