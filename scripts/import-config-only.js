require('dotenv').config();
const { db } = require('../src/db');
const { parseCSV } = require('../src/utils/csvImport');
const path = require('path');

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

  console.log('✅ Configuration data (events and tariffs) imported successfully');
  console.log('ℹ️  Ready for fresh people and tesserini import');
})();
