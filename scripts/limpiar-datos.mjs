/**
 * Deja la aplicación como recién instalada, conservando lo que es configuración.
 *
 *   npm run reset:datos          -> muestra qué se borraría, sin tocar nada
 *   npm run reset:datos -- --si  -> borra
 *
 * Se borra: documentos, su texto y secciones, evaluaciones, resultados,
 * hallazgos, coincidencias y los archivos cargados en disco.
 *
 * Se conserva: el catálogo normativo y las matrices de evaluación con sus
 * criterios. Son configuración de la entidad, no datos de trabajo.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const RUTA_BD = process.env.SACD_DB_PATH ?? './data/docucalidad.db';
const RUTA_ARCHIVOS = process.env.SACD_UPLOAD_DIR ?? './data/uploads';

/** Orden de borrado: de las tablas dependientes hacia las principales. */
const TABLAS_A_VACIAR = [
  'findings',
  'evaluation_results',
  'evaluations',
  'document_similarities',
  'document_sections',
  'document_contents',
  'documents',
];

const TABLAS_A_CONSERVAR = ['norms', 'templates', 'criteria'];

const confirmado = process.argv.includes('--si');

if (!fs.existsSync(RUTA_BD)) {
  console.log(`No hay base de datos en ${RUTA_BD}: no hay nada que limpiar.`);
  process.exit(0);
}

const db = new DatabaseSync(RUTA_BD);
db.exec('PRAGMA foreign_keys = ON;');

function contar(tabla) {
  try {
    return db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get().n;
  } catch {
    return 0; // La tabla aún no existe en esta base.
  }
}

const archivos = fs.existsSync(RUTA_ARCHIVOS) ? fs.readdirSync(RUTA_ARCHIVOS) : [];

console.log('\nSe borraría:');
for (const tabla of TABLAS_A_VACIAR) {
  console.log(`  ${String(contar(tabla)).padStart(6)}  ${tabla}`);
}
console.log(`  ${String(archivos.length).padStart(6)}  archivos cargados en ${RUTA_ARCHIVOS}`);

console.log('\nSe conserva:');
for (const tabla of TABLAS_A_CONSERVAR) {
  console.log(`  ${String(contar(tabla)).padStart(6)}  ${tabla}`);
}

if (!confirmado) {
  console.log('\nNada se ha borrado. Para confirmar:  npm run reset:datos -- --si\n');
  db.close();
  process.exit(0);
}

db.exec('BEGIN');
try {
  for (const tabla of TABLAS_A_VACIAR) {
    try {
      db.exec(`DELETE FROM ${tabla}`);
    } catch {
      // La tabla no existe en esta versión del esquema: se ignora.
    }
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

// Recupera el espacio que dejaron las filas borradas.
db.exec('VACUUM');
db.close();

for (const archivo of archivos) {
  fs.rmSync(path.join(RUTA_ARCHIVOS, archivo), { force: true });
}

console.log('\nListo. El repositorio documental quedó vacío.');
console.log('El catálogo normativo y las matrices de evaluación se conservaron.\n');
