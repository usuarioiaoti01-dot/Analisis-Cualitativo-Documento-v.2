import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queryAll, queryOne } from '@/lib/sqlite';
import { borrarArchivo } from '@/lib/almacen';
import type {
  DocumentDetail,
  EvaluationRecord,
  EvaluationResultRecord,
  FindingRecord,
  SectionRecord,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

const SELECT_DETAIL = `
  SELECT d.id, d.title, d.status, d.version, d.created_at, d.updated_at, d.document_type,
         d.quality_score, d.severity, d.file_name, d.mime_type, d.file_size,
         d.page_count, d.char_count, d.extraction_status, d.extraction_notes,
         c.extracted_at
  FROM documents d
  LEFT JOIN document_contents c ON c.document_id = d.id
  WHERE d.id = ?`;

/** GET /api/documents/[id] — ficha del documento con su texto extraído. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const document = queryOne<DocumentDetail>(db, SELECT_DETAIL, id);
  if (!document) {
    return NextResponse.json({ error: 'El documento no existe.' }, { status: 404 });
  }

  // El listado solo necesita un extracto: el cuerpo completo de cada sección
  // duplicaría el texto del documento, que ya viaja una vez en `content`.
  const sections = queryAll<SectionRecord>(
    db,
    `SELECT id, document_id, ordinal, numbering, heading,
            substr(content, 1, 400) AS content, length(content) AS content_length,
            page_from, page_to, char_start, char_end
     FROM document_sections WHERE document_id = ? ORDER BY ordinal`,
    id,
  );

  const evaluations = queryAll<EvaluationRecord>(
    db,
    `SELECT id, document_id, template_id, score, status, created_at, engine,
            validated_by, validated_at, validation_note
     FROM evaluations WHERE document_id = ? ORDER BY created_at DESC`,
    id,
  );

  // Resultados por criterio de la evaluación más reciente.
  const results = evaluations[0]
    ? queryAll<EvaluationResultRecord>(
        db,
        `SELECT r.id, r.evaluation_id, r.criterion_id, r.dimension, r.result,
                r.raw_score, r.weighted_score, r.comment,
                c.description AS criterion_description, c.indicator AS criterion_indicator,
                c.weight AS criterion_weight, c.scale_max
         FROM evaluation_results r
         JOIN criteria c ON c.id = r.criterion_id
         WHERE r.evaluation_id = ? ORDER BY c.position, r.id`,
        evaluations[0].id,
      )
    : [];

  const findings = queryAll<FindingRecord>(
    db,
    `SELECT id, document_id, evaluation_id, criterion_id, dimension, source, result, risk, message,
            evidence_text, evidence_location, section_id, recommendation,
            reference_kind, reference_id, reference_label, status, resolved_by, resolved_at, created_at
     FROM findings WHERE document_id = ? ORDER BY created_at DESC`,
    id,
  );

  return NextResponse.json({ document, sections, evaluations, results, findings });
}

/** DELETE /api/documents/[id] — elimina el documento, su texto y el archivo original. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const row = queryOne<{ storage_path: string | null }>(
    db,
    'SELECT storage_path FROM documents WHERE id = ?',
    id,
  );
  if (!row) {
    return NextResponse.json({ error: 'El documento no existe.' }, { status: 404 });
  }

  // El borrado en cascada se encarga de `document_contents`, `evaluations` y `findings`.
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  if (row.storage_path) await borrarArchivo(row.storage_path);

  return NextResponse.json({ deleted: id });
}
