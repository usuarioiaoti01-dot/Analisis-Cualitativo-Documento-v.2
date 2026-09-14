import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queryOne } from '@/lib/sqlite';
import { USUARIO_ACTUAL } from '@/lib/sesion';
import type { FindingRecord, FindingStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ESTADOS: FindingStatus[] = ['pendiente', 'aceptado', 'descartado', 'subsanado'];

/**
 * PATCH /api/findings/[id] — etapa 7: la decisión humana sobre un hallazgo.
 * Cuerpo: `{ status: 'pendiente' | 'aceptado' | 'descartado' | 'subsanado' }`
 *
 * El sistema detecta; una persona decide qué se hace con lo detectado. Volver a
 * «pendiente» limpia la firma, para que no quede registrado como resuelto algo
 * que se reabrió.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const findingId = Number((await params).id);

  let body: { status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'El cuerpo de la solicitud no es JSON válido.' }, { status: 400 });
  }

  const status = body.status as FindingStatus;
  if (!ESTADOS.includes(status)) {
    return NextResponse.json(
      { error: `Estado no válido. Valores admitidos: ${ESTADOS.join(', ')}.` },
      { status: 400 },
    );
  }

  const db = getDb();
  const existe = queryOne<{ id: number }>(db, 'SELECT id FROM findings WHERE id = ?', findingId);
  if (!existe) {
    return NextResponse.json({ error: 'El hallazgo no existe.' }, { status: 404 });
  }

  const resuelto = status !== 'pendiente';

  db.prepare('UPDATE findings SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?').run(
    status,
    resuelto ? USUARIO_ACTUAL.nombre : null,
    resuelto ? Date.now() : null,
    findingId,
  );

  const finding = queryOne<FindingRecord>(
    db,
    `SELECT id, document_id, evaluation_id, criterion_id, dimension, source, result, risk, message,
            evidence_text, evidence_location, section_id, recommendation,
            reference_kind, reference_id, reference_label, status, resolved_by, resolved_at, created_at
     FROM findings WHERE id = ?`,
    findingId,
  );

  return NextResponse.json({ finding });
}
