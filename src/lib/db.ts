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
    -- Etapa 1: ficha del documento.
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
      author            TEXT,
      responsible_unit  TEXT,
      document_date     INTEGER,
      file_name     TEXT,
      mime_type     TEXT,
      file_size     INTEGER,
      storage_path  TEXT,
      page_count    INTEGER,
      char_count    INTEGER,
      extraction_status  TEXT NOT NULL DEFAULT 'none',
      extraction_notes   TEXT
    );

    -- Etapa 3: el texto completo vive aparte para que listar el repositorio no
    -- arrastre documentos enteros en cada consulta.
    CREATE TABLE IF NOT EXISTS document_contents (
      document_id  TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
      content      TEXT NOT NULL,
      extracted_at INTEGER NOT NULL
    );

    -- Etapa 3: el mismo texto segmentado. Es lo que permite que un hallazgo
    -- señale "Sección 4.2, pág. 7" en lugar de un desplazamiento de caracteres.
    CREATE TABLE IF NOT EXISTS document_sections (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      ordinal     INTEGER NOT NULL,
      numbering   TEXT,
      heading     TEXT NOT NULL,
      content     TEXT NOT NULL,
      page_from   INTEGER,
      page_to     INTEGER,
      char_start  INTEGER NOT NULL,
      char_end    INTEGER NOT NULL
    );

    -- Etapa 2: matriz de evaluación parametrizable.
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
      position    INTEGER NOT NULL DEFAULT 0,
      -- Pregunta concreta que el evaluador (humano o asistido) debe responder.
      indicator   TEXT,
      -- Tope de la escala ordinal; 5 significa que el criterio se puntúa de 1 a 5.
      scale_max   INTEGER NOT NULL DEFAULT 5,
      -- Regla opcional en lenguaje natural que acota cuándo se considera cumplido.
      rule        TEXT
    );

    -- Etapas 4 a 7: una evaluación es la aplicación de una matriz a un documento.
    CREATE TABLE IF NOT EXISTS evaluations (
      id           TEXT PRIMARY KEY,
      document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      template_id  INTEGER NOT NULL REFERENCES templates(id),
      score        INTEGER,
      status       TEXT NOT NULL DEFAULT 'in_review',
      created_at   INTEGER NOT NULL,
      -- Motor que produjo el resultado: 'deterministic', 'ai', 'manual'.
      engine       TEXT NOT NULL DEFAULT 'deterministic',
      -- Etapa 7: la decisión final es humana y queda registrada.
      validated_by TEXT,
      validated_at INTEGER,
      validation_note TEXT
    );

    -- Etapa 4: resultado de cada criterio, no solo el puntaje global.
    CREATE TABLE IF NOT EXISTS evaluation_results (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
      criterion_id  INTEGER NOT NULL REFERENCES criteria(id),
      dimension     TEXT NOT NULL,
      -- 'cumple' | 'parcial' | 'no_cumple' | 'no_aplica'
      result        TEXT NOT NULL,
      -- Puntaje en la escala del criterio (1 a scale_max); nulo si no aplica.
      raw_score     INTEGER,
      -- Aporte del criterio al puntaje final, ya ponderado sobre 100.
      weighted_score REAL,
      comment       TEXT
    );

    -- Etapas 4 a 6: todo hallazgo nace de un criterio y cita su evidencia.
    CREATE TABLE IF NOT EXISTS findings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      evaluation_id TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
      criterion_id  INTEGER REFERENCES criteria(id),
      dimension     TEXT NOT NULL,
      -- Origen: 'evaluacion' | 'normativa' | 'similitud'
      source        TEXT NOT NULL DEFAULT 'evaluacion',
      result        TEXT,
      -- 'bajo' | 'medio' | 'alto' | 'critico'
      risk          TEXT NOT NULL,
      message       TEXT NOT NULL,
      -- Cita textual exacta del documento que sustenta el hallazgo.
      evidence_text TEXT,
      -- Ubicación legible: "Sección 4.2 · pág. 7".
      evidence_location TEXT,
      section_id    INTEGER REFERENCES document_sections(id) ON DELETE SET NULL,
      recommendation TEXT,
      -- Norma o documento con el que se contrastó.
      reference_kind TEXT,
      reference_id   TEXT,
      reference_label TEXT,
      -- Etapa 7: 'pendiente' | 'aceptado' | 'descartado' | 'subsanado'
      status        TEXT NOT NULL DEFAULT 'pendiente',
      resolved_by   TEXT,
      resolved_at   INTEGER,
      created_at    INTEGER NOT NULL
    );

    -- Etapa 5: catálogo normativo contra el que se validan las citas.
    CREATE TABLE IF NOT EXISTS norms (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      code    TEXT NOT NULL UNIQUE,
      title   TEXT NOT NULL,
      issuer  TEXT NOT NULL,
      subject TEXT NOT NULL,
      status  TEXT NOT NULL DEFAULT 'Vigente',
      -- Artículo o numeral concreto, cuando la referencia es parcial.
      article        TEXT,
      source_url     TEXT,
      published_at   INTEGER,
      effective_from INTEGER,
      effective_to   INTEGER,
      -- Formas alternativas de citar la misma norma, separadas por '|'.
      aliases        TEXT
    );

    -- Etapa 6: coincidencias entre el documento evaluado y el repositorio.
    CREATE TABLE IF NOT EXISTS document_similarities (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      compared_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      -- Índice de Jaccard sobre los n-gramas de ambos textos, de 0 a 1.
      similarity    REAL NOT NULL,
      -- Proporción del documento más pequeño que aparece en el otro, de 0 a 1.
      containment   REAL NOT NULL DEFAULT 0,
      -- 'version_previa' | 'reutilizacion' | 'similitud_inusual'
      kind          TEXT NOT NULL,
      -- Fragmentos coincidentes, en JSON.
      fragments     TEXT,
      computed_at   INTEGER NOT NULL,
      UNIQUE (document_id, compared_id)
    );

    CREATE INDEX IF NOT EXISTS idx_criteria_template ON criteria(template_id);
    CREATE INDEX IF NOT EXISTS idx_sections_document ON document_sections(document_id);
    CREATE INDEX IF NOT EXISTS idx_evaluations_document ON evaluations(document_id);
    CREATE INDEX IF NOT EXISTS idx_results_evaluation ON evaluation_results(evaluation_id);
    CREATE INDEX IF NOT EXISTS idx_findings_document ON findings(document_id);
    CREATE INDEX IF NOT EXISTS idx_findings_evaluation ON findings(evaluation_id);
    CREATE INDEX IF NOT EXISTS idx_similarities_document ON document_similarities(document_id);
  `);
}

/**
 * Lleva una base existente al esquema actual sin perder datos. SQLite solo
 * permite añadir columnas, así que las tablas que cambiaron de forma y aún no
 * tenían filas se recrean.
 */
function migrateSchema(db: DatabaseSync): void {
  addMissingColumns(db, 'documents', [
    ['author', 'TEXT'],
    ['responsible_unit', 'TEXT'],
    ['document_date', 'INTEGER'],
    ['file_name', 'TEXT'],
    ['mime_type', 'TEXT'],
    ['file_size', 'INTEGER'],
    ['storage_path', 'TEXT'],
    ['page_count', 'INTEGER'],
    ['char_count', 'INTEGER'],
    ['extraction_status', "TEXT NOT NULL DEFAULT 'none'"],
    ['extraction_notes', 'TEXT'],
  ]);

  addMissingColumns(db, 'criteria', [
    ['indicator', 'TEXT'],
    ['scale_max', 'INTEGER NOT NULL DEFAULT 5'],
    ['rule', 'TEXT'],
  ]);

  addMissingColumns(db, 'evaluations', [
    ['engine', "TEXT NOT NULL DEFAULT 'deterministic'"],
    ['validated_by', 'TEXT'],
    ['validated_at', 'INTEGER'],
    ['validation_note', 'TEXT'],
  ]);

  addMissingColumns(db, 'document_similarities', [['containment', 'REAL NOT NULL DEFAULT 0']]);

  addMissingColumns(db, 'norms', [
    ['article', 'TEXT'],
    ['source_url', 'TEXT'],
    ['published_at', 'INTEGER'],
    ['effective_from', 'INTEGER'],
    ['effective_to', 'INTEGER'],
    ['aliases', 'TEXT'],
  ]);

  // `findings` cambió de forma por completo. En el esquema anterior nunca se
  // escribió ninguna fila, así que recrearla vacía no pierde nada; si una base
  // tuviera filas, se conserva la tabla vieja bajo otro nombre.
  const columnasHallazgos = tableColumns(db, 'findings');
  if (columnasHallazgos.size > 0 && !columnasHallazgos.has('evidence_text')) {
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM findings').get() as { total: number };
    db.exec(total > 0 ? 'ALTER TABLE findings RENAME TO findings_legacy' : 'DROP TABLE findings');
    createSchema(db);
  }
}

function tableColumns(db: DatabaseSync, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

function addMissingColumns(db: DatabaseSync, table: string, columns: [string, string][]): void {
  const existentes = tableColumns(db, table);
  if (existentes.size === 0) return;

  for (const [nombre, tipo] of columns) {
    if (!existentes.has(nombre)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${nombre} ${tipo}`);
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
