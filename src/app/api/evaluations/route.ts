import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { inTransaction, queryAll, queryOne } from '@/lib/sqlite';
import type { CriterionOutcome, CriterionRecord, TemplateRecord } from '@/lib/types';

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

  const CRITERIA_SQL = `
    SELECT id, dimension, description, weight, indicator, scale_max, rule
    FROM criteria WHERE template_id = ? ORDER BY position, id`;

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
 * Cuerpo: `{ document_id, template_id }`.
 *
 * ADVERTENCIA — motor provisional. Este motor **no lee el texto del documento**:
 * deriva un puntaje determinista del identificador, de modo que el flujo
 * completo (ejecutar → resultado por criterio → estado del documento) quede
 * ejercitado y verificable mientras se construye el motor de análisis real.
 * Cada evaluación queda marcada con `engine = 'deterministic'` y por eso no
 * emite hallazgos: un hallazgo sin evidencia real sería peor que ninguno.
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
    return NextResponse.json({ error: 'Se requieren `document_id` y `template_id`.' }, { status: 400 });
  }

  const db = getDb();

  const document = queryOne<{ id: string }>(db, 'SELECT id FROM documents WHERE id = ?', documentId);
  if (!document) {
    return NextResponse.json({ error: 'El documento no existe.' }, { status: 404 });
  }

  const criteria = queryAll<CriterionRecord & { id: number; scale_max: number }>(
    db,
    `SELECT id, dimension, description, weight, scale_max
     FROM criteria WHERE template_id = ? ORDER BY position, id`,
    templateId,
  );

  if (criteria.length === 0) {
    return NextResponse.json({ error: 'La matriz no existe o no tiene criterios.' }, { status: 404 });
  }

  const resultados = criteria.map((criterio) => {
    const rawScore = puntajeDeterminista(documentId, criterio.id, criterio.scale_max);
    return {
      criterionId: criterio.id,
      dimension: criterio.dimension,
      rawScore,
      result: resultadoDe(rawScore, criterio.scale_max),
      // Aporte del criterio al puntaje final, ya ponderado sobre 100.
      weightedScore: (rawScore / criterio.scale_max) * criterio.weight,
    };
  });

  const pesoTotal = criteria.reduce((acc, criterio) => acc + criterio.weight, 0) || 100;
  const score = Math.round(
    (resultados.reduce((acc, r) => acc + r.weightedScore, 0) / pesoTotal) * 100,
  );

  const severity = score >= 85 ? 'low' : score >= 75 ? 'medium' : 'high';
  const status = score >= 85 ? 'compliant' : score >= 75 ? 'in_review' : 'observed';

  const evaluationId = randomUUID();
  const now = Date.now();

  inTransaction(db, () => {
    db.prepare(
      `INSERT INTO evaluations (id, document_id, template_id, score, status, created_at, engine)
       VALUES (?, ?, ?, ?, ?, ?, 'deterministic')`,
    ).run(evaluationId, documentId, templateId, score, status, now);

    const insertResult = db.prepare(
      `INSERT INTO evaluation_results
         (evaluation_id, criterion_id, dimension, result, raw_score, weighted_score, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const resultado of resultados) {
      insertResult.run(
        evaluationId,
        resultado.criterionId,
        resultado.dimension,
        resultado.result,
        resultado.rawScore,
        resultado.weightedScore,
        'Puntaje provisional: el motor determinista no analiza el contenido del documento.',
      );
    }

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
        engine: 'deterministic',
      },
      results: resultados,
    },
    { status: 201 },
  );
}

/** Puntaje reproducible en la escala del criterio: mismo documento y criterio, mismo valor. */
function puntajeDeterminista(documentId: string, criterionId: number, scaleMax: number): number {
  const base = [...documentId].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 100_003, 7);
  // El criterio se mezcla al final: hacerlo al inicio lo diluye en el recorrido
  // de la cadena y todos los criterios acaban con el mismo puntaje.
  const semilla = (base * 31 + criterionId * 7919) % 100_003;

  // Se reparte entre 3 y scaleMax para no simular documentos catastróficos.
  return 3 + (semilla % Math.max(1, scaleMax - 2));
}

/** Traduce un puntaje ordinal al resultado cualitativo correspondiente. */
function resultadoDe(rawScore: number, scaleMax: number): CriterionOutcome {
  const proporcion = rawScore / scaleMax;
  if (proporcion >= 0.9) return 'cumple';
  if (proporcion >= 0.6) return 'parcial';
  return 'no_cumple';
}
