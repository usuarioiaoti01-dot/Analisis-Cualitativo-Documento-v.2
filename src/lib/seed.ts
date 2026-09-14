import type { DatabaseSync } from 'node:sqlite';
import { inTransaction, queryOne } from './sqlite';
import { DEFAULT_CRITERIA, PRIORITY_NORMS } from './rubric';

/**
 * Carga inicial idempotente: solo se ejecuta cuando la tabla `templates` está
 * vacía, de modo que reiniciar el servidor no duplica ni pisa datos reales.
 */
export function seedDatabase(db: DatabaseSync): void {
  const row = queryOne<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM templates');
  if ((row?.total ?? 0) > 0) return;

  const now = Date.now();

  const insertTemplate = db.prepare(
    'INSERT INTO templates (name, document_type, active, created_at) VALUES (?, ?, 1, ?)',
  );
  const insertCriterion = db.prepare(
    'INSERT INTO criteria (template_id, dimension, description, weight, position) VALUES (?, ?, ?, ?, ?)',
  );

  inTransaction(db, () => {
    const templateId = Number(
      insertTemplate.run('Matriz general de calidad documental', 'Informe técnico', now).lastInsertRowid,
    );
    DEFAULT_CRITERIA.forEach((criterion, index) => {
      insertCriterion.run(templateId, criterion.dimension, criterion.description, criterion.weight, index);
    });
  });
}

/** Incorpora las normas prioritarias al catálogo y devuelve cuántas quedaron registradas. */
export function loadPriorityNorms(db: DatabaseSync): number {
  const insert = db.prepare(
    `INSERT INTO norms (code, title, issuer, subject, status)
     VALUES (?, ?, ?, ?, 'Vigente')
     ON CONFLICT(code) DO NOTHING`,
  );

  inTransaction(db, () => {
    for (const norm of PRIORITY_NORMS) {
      insert.run(norm.code, norm.title, norm.issuer, norm.subject);
    }
  });

  const row = queryOne<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM norms');
  return row?.total ?? 0;
}
