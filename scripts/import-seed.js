require('dotenv').config();
const { db } = require('../src/db');
const { parseCSV } = require('../src/utils/csvImport');
const path = require('path');
const crypto = require('crypto');

function uuid() { return crypto.randomUUID(); }

function importTable(name, rows, insertSQL, mapFn) {
  const stmt = db.prepare(insertSQL);
  const tx = db.transaction((items) => {
    for (const r of items) stmt.run(...mapFn(r));
  });
  tx(rows);
  console.log(`Importati ${rows.length} record in ${name}`);
}

(function main() {
  const base = path.join(__dirname, '..', 'data', 'seed');

  // persone.csv: id,nome,categoria,data_nascita,residenza,doc_verificato
  const persone = parseCSV(path.join(base, 'persone.csv'));
  importTable('persone', persone,
    `INSERT OR REPLACE INTO persone(id,nome,categoria,data_nascita,residenza,doc_verificato)
     VALUES(?,?,?,?,?,?)`,
    r => [r.id, r.nome, r.categoria, r.data_nascita, r.residenza, Number(r.doc_verificato || 0)]
  );

  // tesserini.csv: id,persona_id,stato,qr_text,exp_date
  const tesserini = parseCSV(path.join(base, 'tesserini.csv'));
  importTable('tesserini', tesserini,
    `INSERT OR REPLACE INTO tesserini(id,persona_id,stato,qr_text,exp_date) VALUES(?,?,?,?,?)`,
    r => [r.id, r.persona_id, r.stato || 'attivo', r.qr_text, r.exp_date]
  );

  // eventi.csv: id,nome,data,luogo,prezzo_intero
  const eventi = parseCSV(path.join(base, 'eventi.csv'));
  importTable('eventi', eventi,
    `INSERT OR REPLACE INTO eventi(id,nome,data,luogo,prezzo_intero) VALUES(?,?,?,?,?)`,
    r => [r.id, r.nome, r.data, r.luogo, Number(r.prezzo_intero)]
  );

  // tariffe.csv: categoria,prezzo
  const tariffe = parseCSV(path.join(base, 'tariffe.csv'));
  importTable('tariffe', tariffe,
    `INSERT OR REPLACE INTO tariffe(categoria,prezzo) VALUES(?,?)`,
    r => [r.categoria, Number(r.prezzo)]
  );

  console.log('Seed completato.');
})();
