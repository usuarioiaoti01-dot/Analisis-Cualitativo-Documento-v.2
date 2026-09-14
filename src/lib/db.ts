import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { seedDatabase } from './seed';

/**
 * Persistencia sobre el SQLite que trae Node (`node:sqlite`, Node 22.5+). Se
 * eligió frente a `better-sqlite3` porque no requiere compilación nativa, y los
 * equipos de la OTI no tienen cadena de compilación de C++ instalada.
 *
 * Next.js recarga los módulos en desarrollo, así que la conexión se guarda en
 * `globalThis` para no abrir un descriptor nuevo en cada recarga.
 */
const globalForDb = globalThis as unknown as { __docucalidadDb?: DatabaseSync };

function resolveDbPath(): string {
  const configured = process.env.SACD_DB_PATH ?? './data/docucalidad.db';
  const absolute = path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  return absolute;
}

function createSchema(db: DatabaseSync): void {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id            TEXT PRIMARY KEY,
      title         TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      version       INTEGER NOT NULL DEFAULT 1,
      document_type TEXT NOT NULL,
      quality_score INTEGER,
      severity      TEXT,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      file_name     TEXT,
      mime_type     TEXT,
      file_size     INTEGER,
      storage_path  TEXT,
      page_count    INTEGER,
      char_count    INTEGER,
      extraction_status  TEXT NOT NULL DEFAULT 'none',
      extraction_notes   TEXT
    );

    -- El texto extraído vive aparte para que listar el repositorio no arrastre
    -- documentos completos en cada consulta.
    CREATE TABLE IF NOT EXISTS document_contents (
      document_id  TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
      content      TEXT NOT NULL,
      extracted_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      document_type TEXT NOT NULL,
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS criteria (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      dimension   TEXT NOT NULL,
      description TEXT NOT NULL,
      weight      INTEGER NOT NULL,
      position    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id          TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      template_id INTEGER NOT NULL REFERENCES templates(id),
      score       INTEGER,
      status      TEXT NOT NULL DEFAULT 'in_review',
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS findings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
      dimension   TEXT NOT NULL,
      severity    TEXT NOT NULL,
      message     TEXT NOT NULL,
      location    TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS norms (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      code    TEXT NOT NULL UNIQUE,
      title   TEXT NOT NULL,
      issuer  TEXT NOT NULL,
      subject TEXT NOT NULL,
      status  TEXT NOT NULL DEFAULT 'Vigente'
    );

    CREATE INDEX IF NOT EXISTS idx_criteria_template ON criteria(template_id);
    CREATE INDEX IF NOT EXISTS idx_evaluations_document ON evaluations(document_id);
    CREATE INDEX IF NOT EXISTS idx_findings_document ON findings(document_id);
  `);
}

/**
 * Añade las columnas que no existían en versiones anteriores del esquema. Una
 * base creada antes del cargador de archivos se actualiza sin perder datos.
 */
function migrateSchema(db: DatabaseSync): void {
  const columnas = new Set(
    (db.prepare('PRAGMA table_info(documents)').all() as { name: string }[]).map((c) => c.name),
  );

  const faltantes: [string, string][] = [
    ['file_name', 'TEXT'],
    ['mime_type', 'TEXT'],
    ['file_size', 'INTEGER'],
    ['storage_path', 'TEXT'],
    ['page_count', 'INTEGER'],
    ['char_count', 'INTEGER'],
    ['extraction_status', "TEXT NOT NULL DEFAULT 'none'"],
    ['extraction_notes', 'TEXT'],
  ];

  for (const [nombre, tipo] of faltantes) {
    if (!columnas.has(nombre)) db.exec(`ALTER TABLE documents ADD COLUMN ${nombre} ${tipo}`);
  }
}

export function getDb(): DatabaseSync {
  if (globalForDb.__docucalidadDb) return globalForDb.__docucalidadDb;

  const db = new DatabaseSync(resolveDbPath());
  createSchema(db);
  migrateSchema(db);
  seedDatabase(db);
  globalForDb.__docucalidadDb = db;
  return db;
}
