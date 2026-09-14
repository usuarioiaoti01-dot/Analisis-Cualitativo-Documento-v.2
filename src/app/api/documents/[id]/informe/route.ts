import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queryAll, queryOne } from '@/lib/sqlite';
import type {
  DocumentRecord,
  EvaluationRecord,
  EvaluationResultRecord,
  FindingRecord,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/documents/[id]/informe — etapa 7: todo lo que necesita el informe
 * cualitativo trazable, en una sola respuesta.
 *
 * Consolida la ficha del documento, la evaluación vigente con el resultado de
 * cada criterio, los hallazgos con su decisión y las coincidencias detectadas
 * en el repositorio. Es la vista que se imprime y se adjunta al expediente.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const document = queryOne<DocumentRecord>(
    db,
    `SELECT id, title, status, version, created_at, updated_at, document_type,
            quality_score, severity, author, responsible_unit, document_date,
            file_name, mime_type, file_size, page_count, char_count,
            extraction_status, extraction_notes
     FROM documents WHERE id = ?`,
    id,
  );
  if (!document) {
    return NextResponse.json({ error: 'El documento no existe.' }, { status: 404 });
  }

  const evaluation = queryOne<EvaluationRecord & { template_name: string }>(
    db,
    `SELECT e.id, e.document_id, e.template_id, e.score, e.status, e.created_at, e.engine,
            e.validated_by, e.validated_at, e.validation_note, t.name AS template_name
     FROM evaluations e
     JOIN templates t ON t.id = e.template_id
     WHERE e.document_id = ?
     ORDER BY e.created_at DESC LIMIT 1`,
    id,
  );

  const results = evaluation
    ? queryAll<EvaluationResultRecord>(
        db,
        `SELECT r.id, r.evaluation_id, r.criterion_id, r.dimension, r.result,
                r.raw_score, r.weighted_score, r.comment,
                c.description AS criterion_description, c.indicator AS criterion_indicator,
                c.weight AS criterion_weight, c.scale_max
         FROM evaluation_results r
         JOIN criteria c ON c.id = r.criterion_id
         WHERE r.evaluation_id = ? ORDER BY c.position, r.id`,
        evaluation.id,
      )
    : [];

  // Ordenados por riesgo: el informe empieza por lo que más pesa.
  const findings = queryAll<FindingRecord>(
    db,
    `SELECT id, document_id, evaluation_id, criterion_id, dimension, source, result, risk, message,
            evidence_text, evidence_location, section_id, recommendation,
            reference_kind, reference_id, reference_label, status, resolved_by, resolved_at, created_at
     FROM findings WHERE document_id = ?
     ORDER BY CASE risk
                WHEN 'critico' THEN 0 WHEN 'alto' THEN 1
                WHEN 'medio' THEN 2 ELSE 3 END,
              created_at`,
    id,
  );

  const similarities = queryAll<{
    compared_id: string;
    compared_title: string;
    similarity: number;
    containment: number;
    kind: string;
  }>(
    db,
    `SELECT s.compared_id, d.title AS compared_title, s.similarity, s.containment, s.kind
     FROM document_similarities s
     JOIN documents d ON d.id = s.compared_id
     WHERE s.document_id = ?
     ORDER BY s.similarity DESC`,
    id,
  );

  return NextResponse.json({
    document,
    evaluation,
    results,
    findings,
    similarities,
    generado_en: Date.now(),
  });
}
