import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queryOne } from '@/lib/sqlite';
import { USUARIO_ACTUAL } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

/**
 * POST /api/evaluations/[id]/validar — etapa 7: cierre de la evaluación.
 * Cuerpo opcional: `{ nota?: string }`.
 *
 * El puntaje automático es un insumo; la conformidad es de una persona. Al
 * validar se registra quién y cuándo, y el documento pasa a «Conforme».
 *
 * No se puede validar una evaluación con hallazgos pendientes: si quedan
 * observaciones sin decidir, la conformidad no tendría sustento. Hay que
 * aceptarlos, descartarlos o darlos por subsanados primero.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const evaluationId = (await params).id;

  let nota: string | null = null;
  try {
    const body = await request.json();
    if (typeof body?.nota === 'string' && body.nota.trim()) nota = body.nota.trim();
  } catch {
    // Sin cuerpo: se valida sin nota.
  }

  const db = getDb();

  const evaluacion = queryOne<{ id: string; document_id: string; validated_at: number | null }>(
    db,
    'SELECT id, document_id, validated_at FROM evaluations WHERE id = ?',
    evaluationId,
  );
  if (!evaluacion) {
    return NextResponse.json({ error: 'La evaluación no existe.' }, { status: 404 });
  }
  if (evaluacion.validated_at !== null) {
    return NextResponse.json({ error: 'La evaluación ya fue validada.' }, { status: 409 });
  }

  const pendientes = queryOne<{ total: number }>(
    db,
    "SELECT COUNT(*) AS total FROM findings WHERE document_id = ? AND status = 'pendiente'",
    evaluacion.document_id,
  );

  if ((pendientes?.total ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          `Quedan ${pendientes?.total} hallazgo(s) sin decidir. Acéptelos, descártelos o ` +
          'márquelos como subsanados antes de validar la evaluación.',
        pendientes: pendientes?.total ?? 0,
      },
      { status: 409 },
    );
  }

  const ahora = Date.now();

  db.prepare(
    'UPDATE evaluations SET validated_by = ?, validated_at = ?, validation_note = ? WHERE id = ?',
  ).run(USUARIO_ACTUAL.nombre, ahora, nota, evaluationId);

  db.prepare("UPDATE documents SET status = 'compliant', updated_at = ? WHERE id = ?").run(
    ahora,
    evaluacion.document_id,
  );

  return NextResponse.json({
    evaluation: {
      id: evaluationId,
      validated_by: USUARIO_ACTUAL.nombre,
      validated_at: ahora,
      validation_note: nota,
    },
  });
}
