-- Field Visit Debrief Tool - SQLite schema
-- Data model from PROJECT_SPEC.md section 8.
-- Implemented with Node's built-in 'node:sqlite'.
-- List/object fields (key_findings, blockers, follow_ups, visit_ids, vector)
-- are stored as JSON-encoded TEXT and parsed in the application layer.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS User (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    role        TEXT NOT NULL DEFAULT 'field_officer', -- field_officer | manager | admin
    createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Visit (
    id              TEXT PRIMARY KEY,
    userId          TEXT REFERENCES User(id) ON DELETE SET NULL,
    locationName    TEXT NOT NULL,
    lat             REAL,
    lng             REAL,
    visitDate       TEXT NOT NULL DEFAULT (datetime('now')),
    programArea     TEXT NOT NULL,
    visitType       TEXT,
    rawNotesText    TEXT,
    status          TEXT NOT NULL DEFAULT 'draft', -- draft | synced | complete
    createdAt       TEXT NOT NULL DEFAULT (datetime('now')),
    syncedAt        TEXT
);

CREATE TABLE IF NOT EXISTS Stakeholder (
    id              TEXT PRIMARY KEY,
    visitId         TEXT NOT NULL REFERENCES Visit(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    role            TEXT,
    organization    TEXT
);

CREATE TABLE IF NOT EXISTS MediaAsset (
    id          TEXT PRIMARY KEY,
    visitId     TEXT NOT NULL REFERENCES Visit(id) ON DELETE CASCADE,
    type        TEXT NOT NULL, -- photo | audio
    url         TEXT NOT NULL,
    caption     TEXT,
    transcript  TEXT,
    createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Debrief (
    id                  TEXT PRIMARY KEY,
    visitId             TEXT NOT NULL UNIQUE REFERENCES Visit(id) ON DELETE CASCADE,
    keyFindings         TEXT NOT NULL DEFAULT '[]', -- JSON string[]
    blockers            TEXT NOT NULL DEFAULT '[]', -- JSON {issue, category}[]
    sentimentLabel      TEXT,                       -- positive | neutral | negative
    sentimentScore      REAL,
    sentimentRationale  TEXT,
    followUps           TEXT NOT NULL DEFAULT '[]', -- JSON {action, priority, owner_suggestion}[]
    aiModel             TEXT,
    editedByHuman       INTEGER NOT NULL DEFAULT 0, -- boolean 0/1
    createdAt           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ActionItem (
    id           TEXT PRIMARY KEY,
    debriefId    TEXT NOT NULL REFERENCES Debrief(id) ON DELETE CASCADE,
    description  TEXT NOT NULL,
    owner        TEXT,
    priority     TEXT NOT NULL DEFAULT 'medium', -- high | medium | low
    dueDate      TEXT,
    status       TEXT NOT NULL DEFAULT 'open',   -- open | in_progress | done
    createdAt    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Pattern (
    id         TEXT PRIMARY KEY,
    type       TEXT NOT NULL, -- blocker | topic
    label      TEXT NOT NULL,
    geography  TEXT,
    program    TEXT,
    count      INTEGER NOT NULL DEFAULT 0,
    visitIds   TEXT NOT NULL DEFAULT '[]', -- JSON string[]
    period     TEXT,
    createdAt  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Embedding (
    id       TEXT PRIMARY KEY,
    visitId  TEXT NOT NULL UNIQUE REFERENCES Visit(id) ON DELETE CASCADE,
    vector   TEXT NOT NULL -- JSON number[]
);

CREATE INDEX IF NOT EXISTS idx_visit_program ON Visit(programArea);
CREATE INDEX IF NOT EXISTS idx_visit_date ON Visit(visitDate);
CREATE INDEX IF NOT EXISTS idx_stakeholder_visit ON Stakeholder(visitId);
CREATE INDEX IF NOT EXISTS idx_media_visit ON MediaAsset(visitId);
CREATE INDEX IF NOT EXISTS idx_actionitem_debrief ON ActionItem(debriefId);