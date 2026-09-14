import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { inTransaction, queryAll, queryOne } from '@/lib/sqlite';
import type { CriterionRecord, TemplateRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/evaluations — insumos del módulo de evaluación: los documentos que se
 * pueden evaluar y las matrices disponibles con sus criterios.
 */
export function GET() {
  const db = getDb();

  const documents = queryAll<{ id: string; title: string }>(
    db,
    'SELECT id, title FROM documents ORDER BY updated_at DESC',
  );

  const templates = queryAll<Omit<TemplateRecord, 'criteria'>>(
    db,
    'SELECT id, name, document_type, active FROM templates ORDER BY id',
  );

  const CRITERIA_SQL =
    'SELECT id, dimension, description, weight FROM criteria WHERE template_id = ? ORDER BY position, id';

  return NextResponse.json({
    documents,
    templates: templates.map((template) => ({
      ...template,
      criteria: queryAll<CriterionRecord>(db, CRITERIA_SQL, template.id),
    })),
  });
}

/**
 * POST /api/evaluations — ejecuta una evaluación de un documento con una matriz.
 * Cuerpo: { document_id: string, template_id: number }
 *
 * El puntaje pondera cada criterio de la matriz. Esta versión no incorpora
 * todavía el motor de análisis: asigna una calificación determinista derivada
 * del identificador del documento para que el flujo sea reproducible.
 */
export async function POST(request: Request) {
  let body: { document_id?: unknown; template_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'El cuerpo de la solicitud no es JSON válido.' }, { status: 400 });
  }

  const documentId = typeof body.document_id === 'string' ? body.document_id : '';
  const templateId = Number(body.template_id);

  if (!documentId || !Number.isInteger(templateId)) {
    return NextResponse.json(
      { error: 'Se requieren `document_id` y `template_id`.' },
      { status: 400 },
    );
  }

  const db = getDb();

  const document = queryOne<{ id: string }>(db, 'SELECT id FROM documents WHERE id = ?', documentId);
  if (!document) {
    return NextResponse.json({ error: 'El documento no existe.' }, { status: 404 });
  }

  const criteria = queryAll<CriterionRecord>(
    db,
    'SELECT dimension, description, weight FROM criteria WHERE template_id = ? ORDER BY position, id',
    templateId,
  );

  if (criteria.length === 0) {
    return NextResponse.json({ error: 'La matriz no existe o no tiene criterios.' }, { status: 404 });
  }

  const score = computeScore(documentId, criteria);
  const severity = score >= 85 ? 'low' : score >= 75 ? 'medium' : 'high';
  const status = score >= 85 ? 'compliant' : score >= 75 ? 'in_review' : 'observed';

  const evaluationId = randomUUID();
  const now = Date.now();

  inTransaction(db, () => {
    db.prepare(
      `INSERT INTO evaluations (id, document_id, template_id, score, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(evaluationId, documentId, templateId, score, status, now);

    db.prepare(
      'UPDATE documents SET status = ?, quality_score = ?, severity = ?, updated_at = ? WHERE id = ?',
    ).run(status, score, severity, now, documentId);
  });

  return NextResponse.json(
    {
      evaluation: {
        id: evaluationId,
        document_id: documentId,
        template_id: templateId,
        score,
        status,
      },
    },
    { status: 201 },
  );
}

/** Puntaje ponderado determinista: el mismo documento y matriz dan siempre el mismo resultado. */
function computeScore(documentId: string, criteria: CriterionRecord[]): number {
  const seed = [...documentId].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 100_003, 7);
  const totalWeight = criteria.reduce((acc, criterion) => acc + criterion.weight, 0) || 100;

  const weighted = criteria.reduce((acc, criterion, index) => {
    const dimensionScore = 70 + ((seed >> index) % 30);
    return acc + dimensionScore * criterion.weight;
  }, 0);

  return Math.round(weighted / totalWeight);
}
