/**
 * SERVER PRINCIPALE UMA FESTIVAL
 * ============================
 * 
 * Server Express per il sistema di gestione tesserini UMA Festival.
 * Utilizza un'architettura modulare con configurazione centralizzata,
 * middleware personalizzati e gestione errori strutturata.
 */

// Setup automatico dell'applicazione
const { runSetup } = require('./setup');

// Esegui setup prima di tutto
runSetup();

const express = require('express');
const helmet = require('helmet');
const pino = require('pino');
const path = require('path');

// Importa configurazione e moduli centralizzati
const { server: serverConfig, csp, validateConfig, getConfigSummary } = require('./config/app');
const { LIMITS } = require('./config/constants');
const { runMigrations } = require('./db');
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Inizializza logger
const log = pino({ level: serverConfig.logLevel });

// Valida configurazione all'avvio
const configValidation = validateConfig();
if (!configValidation.valid) {
  log.error({ errors: configValidation.errors }, 'Configurazione non valida');
  process.exit(1);
}

// Log configurazione (senza dati sensibili)
log.info(getConfigSummary(), 'Configurazione applicazione caricata');

// Inizializza app Express
const app = express();

// Configurazione helmet con CSP per GUI locale
app.use(helmet({
  contentSecurityPolicy: csp
}));

// Middleware parsing JSON con limite configurabile
app.use(express.json({ limit: LIMITS.MAX_JSON_SIZE }));

// Serve file statici per GUI
app.use(express.static(path.join(__dirname, 'public')));

// Logging richieste in ambiente development
if (serverConfig.env === 'development') {
  app.use((req, res, next) => {
    log.debug({ method: req.method, url: req.url }, 'Richiesta ricevuta');
    next();
  });
}

// Routes API
app.use('/auth', require('./routes/auth'));
app.use('/qr', require('./routes/qr'));
app.use('/tessere', require('./routes/tessere'));
app.use('/persone', require('./routes/persone'));
app.use('/eventi', require('./routes/eventi'));
app.use('/vendite', require('./routes/vendite'));
app.use('/redenzioni', require('./routes/redenzioni'));
app.use('/report', require('./routes/report'));
app.use('/import', require('./routes/import'));

// Health check endpoint
app.get('/healthz', (_req, res) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    env: serverConfig.env
  });
});

// Middleware gestione 404
app.use(notFoundHandler);

// Middleware gestione errori globali
app.use(globalErrorHandler);

// Avvio server
try {
  runMigrations();
  
  app.listen(serverConfig.port, () => {
    log.info({ 
      port: serverConfig.port, 
      env: serverConfig.env,
      pid: process.pid
    }, 'Server UMA Festival avviato con successo');
  });
} catch (error) {
  log.fatal({ error }, 'Errore critico durante avvio server');
  process.exit(1);
}

// Graceful shutdown
const shutdown = (signal) => {
  log.info({ signal }, 'Shutdown richiesto');
  
  // Chiudi connessioni database e altre risorse
  const { closeDatabase } = require('./db');
  closeDatabase();
  
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Gestione uncaught exceptions
process.on('uncaughtException', (error) => {
  log.fatal({ error }, 'Uncaught Exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log.fatal({ reason, promise }, 'Unhandled Promise Rejection');
  process.exit(1);
});
