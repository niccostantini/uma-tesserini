-- Schema UMA Festival — PostgreSQL
-- Eseguito con CREATE TABLE IF NOT EXISTS per idempotenza

-- Persone
CREATE TABLE IF NOT EXISTS persone (
  id          UUID PRIMARY KEY,
  nome        TEXT NOT NULL,
  categoria   TEXT NOT NULL CHECK (categoria IN ('studente','docente','strumentista','urbinate_u18_o70','altro')),
  data_nascita TEXT,
  residente_urbino BOOLEAN NOT NULL DEFAULT FALSE,
  doc_verificato BOOLEAN NOT NULL DEFAULT FALSE
);

-- Tesserini
CREATE TABLE IF NOT EXISTS tesserini (
  id          UUID PRIMARY KEY,
  persona_id  UUID NOT NULL REFERENCES persone(id) ON DELETE CASCADE,
  stato       TEXT NOT NULL CHECK (stato IN ('attivo','revocato')) DEFAULT 'attivo',
  qr_text     TEXT NOT NULL UNIQUE,
  exp_date    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Eventi
CREATE TABLE IF NOT EXISTS eventi (
  id            UUID PRIMARY KEY,
  nome          TEXT NOT NULL,
  data          TEXT NOT NULL,
  luogo         TEXT,
  prezzo_intero NUMERIC(10,2) NOT NULL DEFAULT 20.0
);

-- Tariffe per categoria
CREATE TABLE IF NOT EXISTS tariffe (
  id        SERIAL PRIMARY KEY,
  categoria TEXT NOT NULL UNIQUE,
  prezzo    NUMERIC(10,2) NOT NULL,
  colore    TEXT NOT NULL DEFAULT '#4d4c4c'
);

-- Vendite
CREATE TABLE IF NOT EXISTS vendite (
  id           UUID PRIMARY KEY,
  tesserino_id UUID NOT NULL REFERENCES tesserini(id),
  evento_id    UUID NOT NULL REFERENCES eventi(id),
  prezzo_pagato NUMERIC(10,2) NOT NULL,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cassa_id     TEXT NOT NULL DEFAULT 'cassa1',
  annullata    BOOLEAN NOT NULL DEFAULT FALSE
);

-- Redenzioni (convalide)
CREATE TABLE IF NOT EXISTS redenzioni (
  id                 UUID PRIMARY KEY,
  tesserino_id       UUID NOT NULL REFERENCES tesserini(id),
  persona_id         UUID REFERENCES persone(id),
  evento_id          UUID NOT NULL REFERENCES eventi(id),
  timestamp          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  operatore          TEXT NOT NULL,
  esito              TEXT NOT NULL CHECK (esito IN ('ok','duplice_tentativo','firma_non_valida','revocato')),
  annullata          BOOLEAN NOT NULL DEFAULT FALSE,
  annullata_timestamp TIMESTAMPTZ,
  annullata_operatore TEXT,
  annullata_motivo   TEXT
);


-- Revoche tesserini
CREATE TABLE IF NOT EXISTS revoche (
  id           UUID PRIMARY KEY,
  tesserino_id UUID NOT NULL REFERENCES tesserini(id) ON DELETE CASCADE,
  motivo       TEXT NOT NULL,
  operatore    TEXT NOT NULL,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Utenti di sistema (admin e cassa)
CREATE TABLE IF NOT EXISTS utenti (
  id            UUID PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  ruolo         TEXT NOT NULL CHECK (ruolo IN ('admin', 'cassa')),
  attivo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration: rende la categoria libera (gestita dalla tabella tariffe)
DO $$
BEGIN
    ALTER TABLE persone DROP CONSTRAINT IF EXISTS persone_categoria_check;
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- Migration: aggiunge colore alle tariffe (deve precedere il seed INSERT)
ALTER TABLE tariffe ADD COLUMN IF NOT EXISTS colore TEXT NOT NULL DEFAULT '#4d4c4c';

-- Tariffe di default (con colori) — ON CONFLICT DO NOTHING: non sovrascrive dati esistenti
INSERT INTO tariffe (categoria, prezzo, colore) VALUES
  ('studente',          9.0,  '#b7223a'),
  ('docente',           5.0,  '#2499be'),
  ('strumentista',      9.0,  '#6b0f6a'),
  ('urbinate_u18_o70',  15.0, '#be4d35'),
  ('altro',             20.0, '#5d4901')
ON CONFLICT (categoria) DO NOTHING;

-- Assegna colori storici alle categorie che hanno ancora il colore default
UPDATE tariffe SET colore = '#b7223a' WHERE categoria = 'studente'          AND colore = '#4d4c4c';
UPDATE tariffe SET colore = '#2499be' WHERE categoria = 'docente'           AND colore = '#4d4c4c';
UPDATE tariffe SET colore = '#6b0f6a' WHERE categoria = 'strumentista'      AND colore = '#4d4c4c';
UPDATE tariffe SET colore = '#be4d35' WHERE categoria = 'urbinate_u18_o70'  AND colore = '#4d4c4c';
UPDATE tariffe SET colore = '#5d4901' WHERE categoria = 'altro'             AND colore = '#4d4c4c';

-- Migration: audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY,
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  operatore  TEXT NOT NULL,
  azione     TEXT NOT NULL,
  n_elementi INTEGER NOT NULL DEFAULT 1,
  dettagli   JSONB
);
CREATE INDEX IF NOT EXISTS audit_log_ts_idx ON audit_log (timestamp DESC);

-- Migration: accrediti presentati da terzi
ALTER TABLE redenzioni ADD COLUMN IF NOT EXISTS
  presentato_da_tesserino_id UUID REFERENCES tesserini(id);

-- Migration: residenza → residente_urbino (boolean)
ALTER TABLE persone ADD COLUMN IF NOT EXISTS residente_urbino BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE persone DROP COLUMN IF EXISTS residenza;

-- Migration: rimuove vincolo UNIQUE su nome (nomi duplicati sono legittimi)
ALTER TABLE persone DROP CONSTRAINT IF EXISTS persone_nome_unique;

-- Migration: organico degli spettacoli (many-to-many persone ↔ eventi)
CREATE TABLE IF NOT EXISTS organico (
  persona_id UUID NOT NULL REFERENCES persone(id) ON DELETE CASCADE,
  evento_id  UUID NOT NULL REFERENCES eventi(id)  ON DELETE CASCADE,
  PRIMARY KEY (persona_id, evento_id)
);

-- Migration: omaggi strumentisti (un biglietto gratuito per evento)
CREATE TABLE IF NOT EXISTS omaggi (
  id                UUID PRIMARY KEY,
  strumentista_id   UUID NOT NULL REFERENCES persone(id),
  evento_id         UUID NOT NULL REFERENCES eventi(id),
  beneficiario_id   UUID REFERENCES persone(id),
  beneficiario_nome TEXT,
  creato_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usato_at          TIMESTAMPTZ,
  operatore         TEXT,
  UNIQUE (strumentista_id, evento_id)
);

-- Migration: accrediti legati alla persona, non al tesserino
ALTER TABLE redenzioni ADD COLUMN IF NOT EXISTS persona_id UUID REFERENCES persone(id);
UPDATE redenzioni
  SET persona_id = (SELECT te.persona_id FROM tesserini te WHERE te.id = redenzioni.tesserino_id)
  WHERE persona_id IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'redenzioni' AND indexname = 'ux_red_ok'
      AND indexdef LIKE '%persona_id%'
  ) THEN
    DROP INDEX IF EXISTS ux_red_ok;
    CREATE UNIQUE INDEX ux_red_ok
      ON redenzioni(persona_id, evento_id)
      WHERE esito = 'ok' AND annullata = false;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ux_red_ok non ricreato (possibili duplicati preesistenti): %', SQLERRM;
END$$;


-- Migration: superpoteri per persone speciali (es. presidente)
ALTER TABLE persone ADD COLUMN IF NOT EXISTS superpoteri BOOLEAN NOT NULL DEFAULT false;

-- Migration: accrediti speciali (presidenziali) — anonimi per default
CREATE TABLE IF NOT EXISTS accrediti_speciali (
  id            UUID PRIMARY KEY,
  evento_id     UUID NOT NULL REFERENCES eventi(id),
  beneficiario  TEXT,
  prezzo_pagato DECIMAL(10,2) NOT NULL DEFAULT 0,
  operatore     TEXT NOT NULL,
  creato_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
