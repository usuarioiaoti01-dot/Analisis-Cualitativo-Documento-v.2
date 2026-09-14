import type { DatabaseSync } from 'node:sqlite';
import { inTransaction, queryOne } from './sqlite';
import { MATRICES_POR_TIPO, PRIORITY_NORMS } from './rubric';

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
    `INSERT INTO criteria (template_id, dimension, description, weight, position, indicator, scale_max)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  inTransaction(db, () => {
    for (const matriz of MATRICES_POR_TIPO) {
      const templateId = Number(
        insertTemplate.run(matriz.name, matriz.documentType, now).lastInsertRowid,
      );

      matriz.criteria.forEach((criterio, index) => {
        insertCriterion.run(
          templateId,
          criterio.dimension,
          criterio.description,
          criterio.weight,
          index,
          criterio.indicator,
          criterio.scaleMax ?? 5,
        );
      });
    }
  });
}

/** Incorpora las normas prioritarias al catálogo y devuelve cuántas quedaron registradas. */
export function loadPriorityNorms(db: DatabaseSync): number {
  const insert = db.prepare(
    `INSERT INTO norms (code, title, issuer, subject, status, aliases)
     VALUES (?, ?, ?, ?, 'Vigente', ?)
     ON CONFLICT(code) DO UPDATE SET aliases = excluded.aliases`,
  );

  inTransaction(db, () => {
    for (const norm of PRIORITY_NORMS) {
      insert.run(norm.code, norm.title, norm.issuer, norm.subject, norm.aliases);
    }
  });

  const row = queryOne<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM norms');
  return row?.total ?? 0;
}
