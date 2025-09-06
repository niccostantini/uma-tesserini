require('dotenv').config();
const { db } = require('../src/db');

function clearPeopleData() {
  console.log('Clearing people and tesserini data from database...');
  
  try {
    // Clear related tables first (those with foreign keys to tesserini/persone)
    const relatedTables = [
      { name: 'redenzioni', fk: 'tesserino_id' },
      { name: 'vendite', fk: 'tesserino_id' },
      { name: 'revoche', fk: 'tesserino_id' }
    ];
    
    // Then clear tesserini and persone
    const mainTables = ['tesserini', 'persone'];
    
    const tx = db.transaction(() => {
      // First clear related data
      for (const table of relatedTables) {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get().count;
        if (count > 0) {
          db.prepare(`DELETE FROM ${table.name}`).run();
          console.log(`Cleared ${count} records from ${table.name}`);
        } else {
          console.log(`Table ${table.name} was already empty`);
        }
      }
      
      // Then clear main tables
      for (const table of mainTables) {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
        if (count > 0) {
          db.prepare(`DELETE FROM ${table}`).run();
          console.log(`Cleared ${count} records from ${table}`);
        } else {
          console.log(`Table ${table} was already empty`);
        }
      }
    });
    
    tx();
    
    console.log('✅ People and tesserini data cleared successfully');
    console.log('ℹ️  Events and tariffs data preserved');
    
  } catch (error) {
    console.error('❌ Error clearing data:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  clearPeopleData();
}

module.exports = { clearPeopleData };
