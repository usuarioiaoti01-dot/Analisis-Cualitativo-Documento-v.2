import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { segmentar } from './segmentacion';

/**
 * Persistencia del texto de un documento y de su índice de secciones.
 *
 * Lo usan la carga del archivo y la transcripción de escaneos, que llegan al
 * mismo sitio por caminos distintos. Tenerlo en un solo lugar evita que las dos
 * rutas segmenten de maneras que se desincronicen con el tiempo.
 *
 * Debe invocarse dentro de una transacción.
 */
export function guardarTextoYSecciones(
  db: DatabaseSync,
  documentId: string,
  content: string,
  extractedAt = Date.now(),
): number {
  db.prepare('DELETE FROM document_contents WHERE document_id = ?').run(documentId);
  db.prepare('DELETE FROM document_sections WHERE document_id = ?').run(documentId);

  if (content.length === 0) return 0;

  db.prepare(
    'INSERT INTO document_contents (document_id, content, extracted_at) VALUES (?, ?, ?)',
  ).run(documentId, content, extractedAt);

  const insertSection = db.prepare(
    `INSERT INTO document_sections
       (document_id, ordinal, numbering, level, parent_id, heading, content,
        page_from, page_to, char_start, char_end)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  // Último identificador insertado en cada nivel: el padre de una sección es la
  // anterior más cercana de nivel inferior.
  const ultimoPorNivel = new Map<number, number>();
  let total = 0;

  for (const seccion of segmentar(content)) {
    let parentId: number | null = null;
    for (let nivel = seccion.level - 1; nivel >= 1; nivel -= 1) {
      const candidato = ultimoPorNivel.get(nivel);
      if (candidato !== undefined) {
        parentId = candidato;
        break;
      }
    }

    const sectionId = Number(
      insertSection.run(
        documentId,
        seccion.ordinal,
        seccion.numbering,
        seccion.level,
        parentId,
        seccion.heading,
        seccion.content,
        seccion.pageFrom,
        seccion.pageTo,
        seccion.charStart,
        seccion.charEnd,
      ).lastInsertRowid,
    );

    ultimoPorNivel.set(seccion.level, sectionId);
    // Una sección nueva invalida a las más profundas que la precedían.
    for (const nivel of [...ultimoPorNivel.keys()]) {
      if (nivel > seccion.level) ultimoPorNivel.delete(nivel);
    }

    total += 1;
  }

  return total;
}

/** ¿El texto extraído tiene contenido real, más allá de las marcas de página? */
export function tieneTextoUtil(content: string): boolean {
  return content.replace(/--- .*? ---/g, '').trim().length > 0;
}
