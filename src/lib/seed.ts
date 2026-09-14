import type { DatabaseSync } from 'node:sqlite';
import { inTransaction, queryOne } from './sqlite';
import { MATRICES_POR_TIPO, PRIORITY_NORMS } from './rubric';

/** Marca que deja constancia de que las matrices iniciales ya se instalaron. */
const MARCA_MATRICES = 'matrices_iniciales_instaladas';

/**
 * Carga inicial: instala las matrices de ejemplo una única vez.
 *
 * Antes se ejecutaba siempre que la tabla estuviera vacía, de modo que quien
 * borraba todas las matrices las veía reaparecer en el siguiente arranque. Se
 * deja una marca: las matrices son una ayuda para empezar, no un contenido que
 * el sistema deba imponer.
 */
export function seedDatabase(db: DatabaseSync): void {
  const marca = queryOne<{ value: string }>(
    db,
    'SELECT value FROM app_meta WHERE key = ?',
    MARCA_MATRICES,
  );
  if (marca) return;

  const existentes = queryOne<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM templates');

  // Base anterior a esta marca que ya tiene matrices: se anota la marca sin
  // volver a instalarlas, para que borrarlas a partir de ahora sí se respete.
  if ((existentes?.total ?? 0) > 0) {
    db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run(
      MARCA_MATRICES,
      String(Date.now()),
    );
    return;
  }

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

    db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run(MARCA_MATRICES, String(now));
  });
}

/** Incorpora las normas prioritarias al catálogo y devuelve cuántas quedaron registradas. */
export function loadPriorityNorms(db: DatabaseSync): number {
  const insert = db.prepare(
    `INSERT INTO norms (code, title, issuer, subject, status, aliases, created_at)
     VALUES (?, ?, ?, ?, 'Vigente', ?, ?)
     ON CONFLICT(code) DO UPDATE SET aliases = excluded.aliases`,
  );

  const now = Date.now();
  inTransaction(db, () => {
    for (const norm of PRIORITY_NORMS) {
      insert.run(norm.code, norm.title, norm.issuer, norm.subject, norm.aliases, now);
    }
  });

  const row = queryOne<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM norms');
  return row?.total ?? 0;
}
