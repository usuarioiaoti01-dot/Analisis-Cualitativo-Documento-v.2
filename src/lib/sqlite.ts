import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

/**
 * Ayudas sobre `node:sqlite`. El driver devuelve `Record<string, SQLOutputValue>`,
 * así que la conversión al tipo de fila se concentra aquí en lugar de repetirse
 * en cada ruta.
 */

export function queryAll<T>(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function queryOne<T>(
  db: DatabaseSync,
  sql: string,
  ...params: SQLInputValue[]
): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

/** Ejecuta `work` dentro de una transacción y revierte si algo falla. */
export function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
