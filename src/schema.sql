-- Persone
CREATE TABLE IF NOT EXISTS persone(
  id TEXT PRIMARY KEY,            -- UUID
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('studente','docente','strumentista','urbinate_u18_o70','altro')),
  data_nascita TEXT,
  residenza TEXT,
  doc_verificato INTEGER NOT NULL DEFAULT 0
);

-- Tesserini
CREATE TABLE IF NOT EXISTS tesserini(
  id TEXT PRIMARY KEY,            -- UUID
  persona_id TEXT NOT NULL REFERENCES persone(id) ON DELETE CASCADE,
  stato TEXT NOT NULL CHECK (stato IN ('attivo','revocato')) DEFAULT 'attivo',
  qr_text TEXT NOT NULL UNIQUE,
  exp_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Eventi
CREATE TABLE IF NOT EXISTS eventi(
  id TEXT PRIMARY KEY,            -- UUID
  nome TEXT NOT NULL,
  data TEXT NOT NULL,             -- "YYYY-MM-DD HH:MM"
  luogo TEXT,
  prezzo_intero REAL NOT NULL DEFAULT 20.0
);

-- Tariffe per categoria
CREATE TABLE IF NOT EXISTS tariffe(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL UNIQUE,
  prezzo REAL NOT NULL
);

-- Vendite
CREATE TABLE IF NOT EXISTS vendite(
  id TEXT PRIMARY KEY,            -- UUID
  tesserino_id TEXT NOT NULL REFERENCES tesserini(id),
  evento_id TEXT NOT NULL REFERENCES eventi(id),
  prezzo_pagato REAL NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  cassa_id TEXT NOT NULL DEFAULT 'cassa1',
  annullata INTEGER NOT NULL DEFAULT 0
);

-- Redenzioni (convalide)
CREATE TABLE IF NOT EXISTS redenzioni(
  id TEXT PRIMARY KEY,            -- UUID
  tesserino_id TEXT NOT NULL REFERENCES tesserini(id),
  evento_id TEXT NOT NULL REFERENCES eventi(id),
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  operatore TEXT NOT NULL,
  esito TEXT NOT NULL CHECK (esito IN ('ok','duplice_tentativo','firma_non_valida','revocato'))
);

-- Vincolo: una sola redenzione OK per tesserino+evento
CREATE UNIQUE INDEX IF NOT EXISTS ux_red_ok ON redenzioni(tesserino_id, evento_id) WHERE esito='ok';

-- Revoche tesserini
CREATE TABLE IF NOT EXISTS revoche (
  id TEXT PRIMARY KEY,            -- UUID
  tesserino_id TEXT NOT NULL REFERENCES tesserini(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  operatore TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
