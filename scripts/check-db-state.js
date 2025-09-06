require('dotenv').config();
const { db } = require('../src/db');

function checkTableState() {
  console.log('🔍 Current database state:');
  console.log('=' .repeat(50));
  
  const tables = ['persone', 'tesserini', 'eventi', 'tariffe', 'vendite', 'redenzioni', 'revoche'];
  
  for (const table of tables) {
    try {
      const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
      const status = count === 0 ? '🟢 EMPTY' : `🔵 ${count} records`;
      console.log(`${table.padEnd(12)}: ${status}`);
      
      if (count > 0 && (table === 'eventi' || table === 'tariffe')) {
        // Show sample data for configuration tables
        const sample = db.prepare(`SELECT * FROM ${table} LIMIT 3`).all();
        sample.forEach((row, i) => {
          if (i === 0) console.log(`  Sample data:`);
          console.log(`    ${JSON.stringify(row)}`);
        });
      }
    } catch (error) {
      console.log(`${table.padEnd(12)}: ❌ ERROR - ${error.message}`);
    }
  }
  
  console.log('=' .repeat(50));
  console.log('✅ Database is ready for fresh people import!');
}

// Run if called directly
if (require.main === module) {
  checkTableState();
}

module.exports = { checkTableState };
