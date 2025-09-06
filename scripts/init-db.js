require('dotenv').config();
const { runMigrations } = require('../src/db');

runMigrations();
console.log('Schema creato/aggiornato.');
